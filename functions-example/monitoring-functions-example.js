/**
 * monitoring-functions-example.js
 * ------------------------------------------------------------------
 * ⚠️ TEMPLATE — não faz parte deste repositório (que é só o frontend
 * estático). O código real das Cloud Functions (finalizarCompra,
 * confirmarPagamento, uploadImagem) vive em outro projeto/repo que
 * não foi enviado aqui. Adapte e cole isto lá.
 *
 * Cobre, do lado servidor:
 *  - Regra 1: request ID por invocação
 *  - Regra 2: stack trace completo em erros
 *  - Regra 3: log estruturado em JSON
 *  - Regra 9: endpoint de ingestão de logs do frontend + alerta por
 *             anomalia (taxa de erro acima de um limiar)
 *
 * Regra 7 (CPU/memória reais) e Regra 10 (deploy/rollback de Cloud
 * Functions) são melhor cobertas pelo Cloud Monitoring / Cloud
 * Functions revisions do GCP, não por código — ver notas no final.
 * ------------------------------------------------------------------
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// ---------- helpers de request ID + log estruturado ----------
function requestId() {
  return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function structuredLog(level, message, fields) {
  const entry = Object.assign(
    { severity: level.toUpperCase(), message: message, timestamp: new Date().toISOString() },
    fields
  );
  // console.log em JSON é automaticamente parseado pelo Cloud Logging
  console.log(JSON.stringify(entry));
  return entry;
}

// ---------- middleware simples de request ID + captura de erro ----------
function withRequestLogging(handlerName, handler) {
  return async (req, res) => {
    const reqId = req.get('x-request-id') || requestId();
    res.set('x-request-id', reqId);
    const start = Date.now();

    structuredLog('info', `${handlerName}_start`, { request_id: reqId, method: req.method });

    try {
      await handler(req, res, reqId);
      structuredLog('info', `${handlerName}_success`, {
        request_id: reqId,
        duration_ms: Date.now() - start
      });
    } catch (err) {
      structuredLog('error', `${handlerName}_error`, {
        request_id: reqId,
        duration_ms: Date.now() - start,
        error_name: err.name,
        stack: err.stack || '(sem stack trace)'
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno', request_id: reqId });
      }
    }
  };
}

// ---------- Regra 9: ingestão de logs do frontend + alerta de anomalia ----------
// Aponte Monitoring.config.remoteLogging.endpoint (no monitoring.js do
// frontend) para a URL desta function.
exports.ingestFrontendLog = functions.https.onRequest(
  withRequestLogging('ingestFrontendLog', async (req, res, reqId) => {
    const entry = req.body;
    await db.collection('frontend_logs').add(
      Object.assign({}, entry, { received_at: admin.firestore.FieldValue.serverTimestamp() })
    );
    res.status(204).send();
  })
);

// Trigger: a cada log de erro salvo, verifica se a taxa de erro dos
// últimos 5 minutos passou de um limiar e dispara alerta (Slack).
exports.checkErrorRateAnomaly = functions.firestore
  .document('frontend_logs/{logId}')
  .onCreate(async (snap) => {
    const entry = snap.data();
    if (entry.level !== 'error' && entry.level !== 'critical') return;

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentErrors = await db
      .collection('frontend_logs')
      .where('level', 'in', ['error', 'critical'])
      .where('received_at', '>=', fiveMinAgo)
      .get();

    const LIMIAR = functions.config().alerts && functions.config().alerts.error_threshold
      ? Number(functions.config().alerts.error_threshold)
      : 10; // configurável via `firebase functions:config:set alerts.error_threshold=10`

    if (recentErrors.size >= LIMIAR) {
      structuredLog('critical', 'error_rate_anomaly', {
        error_count_5min: recentErrors.size,
        threshold: LIMIAR
      });
      await notificarSlack(
        `🔴 Anomalia: ${recentErrors.size} erros no frontend nos últimos 5 minutos (limiar: ${LIMIAR}).`
      );
    }
  });

async function notificarSlack(mensagem) {
  const webhookUrl = functions.config().alerts && functions.config().alerts.slack_webhook;
  if (!webhookUrl) return;
  const fetch = (await import('node-fetch')).default;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: mensagem })
  });
}

/**
 * Notas:
 *
 * Regra 7 (CPU/memória reais das Cloud Functions): não dá pra medir
 * isso em código de forma confiável — use o Cloud Monitoring do GCP
 * (métricas "Execution time", "Memory usage" e "Active instances" já
 * existem automaticamente por function, sem código nenhum).
 *
 * Regra 10 (rollback de Cloud Functions): `firebase deploy` cria uma
 * nova revisão; para reverter, use
 *   gcloud functions deploy <nome> --source=<commit-anterior>
 * ou mantenha os deploys via GitHub Actions com um job de smoke test
 * pós-deploy (mesmo padrão do workflow do frontend), chamando a
 * function recém publicada com um payload de teste antes de
 * considerar o deploy bem-sucedido.
 */
