# Monitoramento e Debugging — Escolha Seu Presente

Este projeto é um **site estático** (GitHub Pages, ver `CNAME`) que fala
direto com **Firebase** (Auth + Firestore) pelo navegador, e chama 3
Cloud Functions externas (`finalizarCompra`, `confirmarPagamento`,
`uploadImagem`) cujo código não está neste repositório.

Isso muda como as 10 regras se aplicam: não existe um servidor Node
seu rodando aqui. Abaixo, o que cada regra virou na prática.

| # | Regra | Onde está | Status |
|---|-------|-----------|--------|
| 1 | Request ID único | `monitoring.js` → `Monitoring.generateRequestId()` | ✅ implementado |
| 2 | Stack trace completo em erros | `monitoring.js` → `captureError` + listeners globais `error`/`unhandledrejection` | ✅ implementado |
| 3 | Logs estruturados em JSON | `monitoring.js` → `Monitoring.logger` (debug/info/warn/error/critical) | ✅ implementado |
| 4 | Health check com status detalhado | `health.html` + `Monitoring.runHealthCheck()` | ✅ implementado |
| 5 | Log de acesso ao banco com tempo | `monitoring.js` → `Monitoring.withDbLogging()`; integrado como exemplo no listener de produtos em `script.js` | ✅ implementado (parcial — só um listener foi instrumentado como exemplo) |
| 6 | Cache com Hit/Miss tracking | `monitoring.js` → `Monitoring.TrackedCache` | ✅ implementado (classe pronta; ainda não plugada em nenhum cache existente porque o app hoje não tem cache explícito) |
| 7 | Métricas de tempo, memória, CPU | `monitoring.js` → `Monitoring.snapshotPerformance()` | ⚠️ parcial — tempo e memória JS dão pra medir no navegador; **CPU real não é acessível via JS de navegador**. CPU/memória do lado servidor precisa vir do Cloud Monitoring do GCP (automático, sem código) |
| 8 | Testes de regressão em fluxo crítico | `tests/regression-checkout.spec.js` (Playwright) | ⚠️ template — precisa adicionar atributos `data-testid` no HTML real (`lista.html`) e rodar contra um projeto Firebase de staging |
| 9 | Alertas configuráveis para anomalias | `functions-example/monitoring-functions-example.js` | ⚠️ template — depende do repo das Cloud Functions, que não está aqui |
| 10 | Deploy com monitoramento e rollback automático | `.github/workflows/deploy-with-healthcheck.yml` | ✅ implementado pro frontend (GitHub Pages); rollback de Cloud Functions descrito em nota no template |

## Como usar agora

`monitoring.js` já está incluído em `lista.html` e `admin.html`, antes
de `script.js`/`admin.js`. O objeto global `Monitoring` fica disponível
em qualquer script depois dele:

```js
Monitoring.logger.info('algum_evento', { detalhe: 'valor' });

const doc = await Monitoring.withDbLogging('buscar_configuracao', () =>
  db.collection('configuracoes').doc(id).get()
);

const cache = new Monitoring.TrackedCache('produtos', { ttlMs: 60000 });
```

O listener de produtos em `script.js` (`db.collection("presentes")...onSnapshot`)
foi instrumentado como exemplo — mostra tempo de renderização por
snapshot e captura erros com stack trace completo em vez de só
`console.error`. O mesmo padrão pode ser replicado no listener de
`configuracoes` e nas chamadas do `admin.js`.

## Passos pendentes (fora deste repo)

1. **Cloud Functions**: portar `functions-example/monitoring-functions-example.js`
   para o repositório real das functions. Ele expõe um endpoint
   `ingestFrontendLog` — depois de publicado, ligue o envio remoto de
   erros do frontend apontando:
   ```js
   Monitoring.config.remoteLogging.enabled = true;
   Monitoring.config.remoteLogging.endpoint = 'https://.../ingestFrontendLog';
   ```
2. **Alertas**: configure o webhook do Slack via
   `firebase functions:config:set alerts.slack_webhook="https://hooks.slack.com/..."`
   e o limiar de erros com `alerts.error_threshold`.
3. **Deploy do workflow**: adicione o secret `SLACK_WEBHOOK_URL` no
   GitHub (Settings → Secrets → Actions) se quiser notificação de
   falha de deploy também.
4. **Testes de regressão**: adicionar `data-testid="produto-card"`,
   `data-testid="btn-presentear"` etc. nos elementos de `lista.html`
   pra bater com o que `tests/regression-checkout.spec.js` espera.
5. **Coleção `_health` no Firestore**: crie uma coleção `_health` vazia
   (ou com 1 doc) e uma regra de leitura pública só pra ela, pra
   `health.html` conseguir medir latência do Firestore sem precisar
   de autenticação.
