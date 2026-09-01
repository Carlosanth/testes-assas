/**
 * monitoring.js
 * ------------------------------------------------------------------
 * Módulo de observabilidade client-side para o Escolha Seu Presente.
 *
 * Cobre, no lado do navegador, as regras 1, 2, 3, 5, 6 e 7 do padrão
 * de monitoramento. As regras 4 (health check), 8 (testes de
 * regressão), 9 (alertas) e 10 (deploy/rollback) têm peças
 * complementares em: health.html, tests/regression-checkout.spec.js,
 * functions-example/monitoring-functions-example.js e
 * .github/workflows/deploy-with-healthcheck.yml. Veja MONITORING.md.
 *
 * Uso (script clássico, sem bundler — mesmo padrão de script.js):
 *   <script src="monitoring.js"></script>
 *   <script>
 *     Monitoring.logger.info('app_start');
 *     const dados = await Monitoring.withDbLogging('buscar_produto', () =>
 *       db.collection('produtos').doc(id).get()
 *     );
 *   </script>
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SERVICE_NAME = 'escolha-seu-presente-web';
  const SERVICE_VERSION =
    (document.querySelector('meta[name="app-version"]') || {}).content || 'dev';

  // ------------------------------------------------------------------
  // Regra 1 — Request ID único por operação
  // ------------------------------------------------------------------
  function generateRequestId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  // Um ID por sessão de navegador, pra conseguir agrupar todas as
  // requisições de um mesmo usuário numa mesma visita.
  const SESSION_ID = generateRequestId();

  // ------------------------------------------------------------------
  // Regra 3 — Logs estruturados em JSON (nunca texto livre)
  // ------------------------------------------------------------------
  const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40, critical: 50 };
  let currentLevel = LOG_LEVELS.info;
  const logBuffer = []; // últimos logs em memória, usado por health.html
  const MAX_BUFFER = 200;

  function baseFields(extra) {
    return Object.assign(
      {
        timestamp: new Date().toISOString(),
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        session_id: SESSION_ID,
        url: global.location ? global.location.href : null
      },
      extra
    );
  }

  function emit(level, message, fields) {
    if (LOG_LEVELS[level] < currentLevel) return null;
    const entry = baseFields(Object.assign({ level: level, message: message }, fields || {}));

    logBuffer.push(entry);
    if (logBuffer.length > MAX_BUFFER) logBuffer.shift();

    const line = JSON.stringify(entry);
    if (level === 'debug') console.debug(line);
    else if (level === 'info') console.info(line);
    else if (level === 'warn') console.warn(line);
    else console.error(line);

    if ((level === 'error' || level === 'critical') && Monitoring.config.remoteLogging.enabled) {
      sendRemote(entry);
    }
    return entry;
  }

  const logger = {
    debug: function (msg, fields) { return emit('debug', msg, fields); },
    info: function (msg, fields) { return emit('info', msg, fields); },
    warn: function (msg, fields) { return emit('warn', msg, fields); },
    error: function (msg, fields) { return emit('error', msg, fields); },
    critical: function (msg, fields) { return emit('critical', msg, fields); },
    setLevel: function (lvl) { if (LOG_LEVELS[lvl] !== undefined) currentLevel = LOG_LEVELS[lvl]; },
    getBuffer: function () { return logBuffer.slice(); }
  };

  // ------------------------------------------------------------------
  // Regra 2 — Stack trace completo em todo erro
  // ------------------------------------------------------------------
  function captureError(error, context) {
    context = context || {};
    const requestId = context.requestId || generateRequestId();
    const entry = logger.error((error && error.message) || String(error), {
      request_id: requestId,
      error_name: (error && error.name) || 'Error',
      stack: (error && error.stack) || '(stack trace indisponível)',
      context: context
    });
    return { requestId: requestId, entry: entry };
  }

  // Captura global — pega qualquer erro não tratado na página inteira,
  // não só os que passarem explicitamente pelo captureError.
  global.addEventListener('error', function (event) {
    captureError(event.error || new Error(event.message), {
      type: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  global.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    captureError(reason instanceof Error ? reason : new Error(String(reason)), {
      type: 'unhandledrejection'
    });
  });

  // ------------------------------------------------------------------
  // Regra 5 — Log de acesso ao banco (Firestore) com tempo de resposta
  // ------------------------------------------------------------------
  function withDbLogging(operationName, fn, meta) {
    meta = meta || {};
    const requestId = generateRequestId();
    const start = performance.now();
    logger.debug('db_call_start:' + operationName, Object.assign({ request_id: requestId }, meta));

    return Promise.resolve()
      .then(fn)
      .then(function (result) {
        const durationMs = performance.now() - start;
        logger.info('db_call_success:' + operationName, Object.assign({
          request_id: requestId,
          duration_ms: Math.round(durationMs * 100) / 100
        }, meta));
        recordMetric('db_call_duration_ms', durationMs, { operation: operationName });
        return result;
      })
      .catch(function (err) {
        const durationMs = performance.now() - start;
        captureError(err, Object.assign({
          request_id: requestId,
          operation: operationName,
          duration_ms: Math.round(durationMs * 100) / 100
        }, meta));
        throw err;
      });
  }

  // ------------------------------------------------------------------
  // Regra 6 — Cache com Hit/Miss tracking
  // ------------------------------------------------------------------
  function TrackedCache(name, options) {
    options = options || {};
    this.name = name;
    this.ttlMs = options.ttlMs === undefined ? 5 * 60 * 1000 : options.ttlMs;
    this.store = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  TrackedCache.prototype.get = function (key) {
    const entry = this.store.get(key);
    const now = Date.now();
    if (entry && (this.ttlMs === 0 || now - entry.t < this.ttlMs)) {
      this.stats.hits++;
      logger.debug('cache_hit', { cache: this.name, key: String(key) });
      return entry.v;
    }
    this.stats.misses++;
    logger.debug('cache_miss', { cache: this.name, key: String(key) });
    return undefined;
  };

  TrackedCache.prototype.set = function (key, value) {
    this.store.set(key, { v: value, t: Date.now() });
  };

  TrackedCache.prototype.getStats = function () {
    const total = this.stats.hits + this.stats.misses;
    return {
      cache: this.name,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hit_rate_pct: total ? Math.round((this.stats.hits / total) * 10000) / 100 : 0
    };
  };

  // ------------------------------------------------------------------
  // Regra 7 — Métricas de performance (tempo, memória; CPU real
  // não é acessível via JS de navegador — ver nota abaixo)
  // ------------------------------------------------------------------
  const metrics = [];
  function recordMetric(name, value, tags) {
    const m = { name: name, value: value, tags: tags || {}, timestamp: new Date().toISOString() };
    metrics.push(m);
    if (metrics.length > 500) metrics.shift();
    return m;
  }

  function snapshotPerformance() {
    const nav = performance.getEntriesByType('navigation')[0];
    const mem = performance.memory
      ? {
          used_js_heap_mb: Math.round((performance.memory.usedJSHeapSize / 1048576) * 100) / 100,
          total_js_heap_mb: Math.round((performance.memory.totalJSHeapSize / 1048576) * 100) / 100,
          heap_limit_mb: Math.round((performance.memory.jsHeapSizeLimit / 1048576) * 100) / 100
        }
      : { note: 'performance.memory só existe em navegadores baseados em Chromium' };

    return {
      page_load_ms: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
      dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
      memory: mem,
      cpu_note:
        'CPU real não é exposta a JS de navegador por design. Uso de CPU precisa ser medido do lado ' +
        'das Cloud Functions (Cloud Monitoring/Cloud Run metrics) — ver functions-example/.',
      recent_metrics: metrics.slice(-20)
    };
  }

  // ------------------------------------------------------------------
  // Regra 4 — Health check com status detalhado
  // ------------------------------------------------------------------
  function runHealthCheck(opts) {
    opts = opts || {};
    const db = opts.db;
    const functionsBaseUrl = opts.functionsBaseUrl;
    const requestId = generateRequestId();
    const checks = {};
    const start = performance.now();
    const pending = [];

    if (db) {
      const t0 = performance.now();
      pending.push(
        db
          .collection('_health')
          .limit(1)
          .get()
          .then(function () {
            checks.firestore = { status: 'ok', latency_ms: Math.round(performance.now() - t0) };
          })
          .catch(function (err) {
            checks.firestore = {
              status: 'error',
              latency_ms: Math.round(performance.now() - t0),
              error: err.message
            };
          })
      );
    }

    try {
      const authOk = typeof firebase !== 'undefined' && !!firebase.auth;
      checks.auth_sdk = { status: authOk ? 'ok' : 'unavailable' };
    } catch (e) {
      checks.auth_sdk = { status: 'error', error: e.message };
    }

    if (functionsBaseUrl) {
      const t0f = performance.now();
      pending.push(
        fetch(functionsBaseUrl, { method: 'OPTIONS' })
          .then(function (res) {
            checks.cloud_functions = {
              status: res.ok || res.status < 500 ? 'ok' : 'degraded',
              http_status: res.status,
              latency_ms: Math.round(performance.now() - t0f)
            };
          })
          .catch(function (err) {
            checks.cloud_functions = { status: 'error', error: err.message };
          })
      );
    }

    return Promise.all(pending).then(function () {
      const statuses = Object.keys(checks).map(function (k) { return checks[k].status; });
      const overall = statuses.every(function (s) { return s === 'ok'; })
        ? 'healthy'
        : statuses.some(function (s) { return s === 'error'; })
        ? 'unhealthy'
        : 'degraded';

      const report = {
        request_id: requestId,
        status: overall,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        duration_ms: Math.round(performance.now() - start),
        checks: checks
      };

      logger.info('health_check', report);
      return report;
    });
  }

  // ------------------------------------------------------------------
  // Envio remoto opcional de logs de erro/crítico (regra 9 depende disso
  // — precisa de um endpoint de Cloud Function recebendo e agregando)
  // ------------------------------------------------------------------
  function sendRemote(entry) {
    try {
      const url = Monitoring.config.remoteLogging.endpoint;
      if (!url) return;
      const body = JSON.stringify(entry);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, body);
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (_e) {
      // Logging nunca pode derrubar a aplicação.
    }
  }

  const Monitoring = {
    config: {
      // Desligado por padrão. Ligue apontando pro endpoint de logs das
      // Cloud Functions (ver functions-example/) para centralizar erros.
      remoteLogging: { enabled: false, endpoint: null }
    },
    generateRequestId: generateRequestId,
    sessionId: SESSION_ID,
    logger: logger,
    captureError: captureError,
    withDbLogging: withDbLogging,
    TrackedCache: TrackedCache,
    recordMetric: recordMetric,
    snapshotPerformance: snapshotPerformance,
    runHealthCheck: runHealthCheck
  };

  global.Monitoring = Monitoring;
})(typeof window !== 'undefined' ? window : this);
