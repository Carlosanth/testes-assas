/**
 * regression-checkout.spec.js
 * ------------------------------------------------------------------
 * Teste de regressão do fluxo crítico: convidado abre a lista, escolhe
 * um presente (ou uma cota) e é reservado + redirecionado pro
 * pagamento. Requer o pacote @playwright/test:
 *
 *   npm install -D @playwright/test
 *   npx playwright test tests/regression-checkout.spec.js
 *
 * IMPORTANTE — o que este teste PODE e NÃO PODE verificar:
 * O frontend (lista.html/finalizarCompra) só é responsável por
 * RESERVAR o produto/cota e redirecionar o convidado pro link de
 * pagamento (InfinitePay via Make.com). Ele não sabe, e não tem como
 * saber, se o convidado vai realmente pagar — isso só é confirmado
 * depois, de forma assíncrona, pela Cloud Function confirmarPagamento
 * recebendo o webhook do provedor de pagamento (pode levar minutos,
 * ou nunca acontecer se o convidado desistir).
 * Por isso este teste para exatamente onde a responsabilidade do
 * frontend termina: confirmar que a reserva foi feita e que o
 * navegador foi redirecionado pra uma URL de pagamento externa.
 * Testar se o pagamento foi CONFIRMADO de verdade (produto virando
 * "Presenteado") é um teste de API separado, chamando
 * confirmarPagamento diretamente com um payload simulado — não é
 * algo que dá pra testar com Playwright numa sessão de navegador.
 *
 * Este arquivo é um TEMPLATE — os seletores (data-testid) precisam ser
 * adicionados no código real (script.js/lista.html) antes de rodar.
 * Rodar contra um projeto Firebase de staging, nunca contra o de
 * produção.
 * ------------------------------------------------------------------
 */
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STAGING_URL || 'http://localhost:8080';
// ID de uma lista de presentes de teste, criada previamente no ambiente de staging.
const LISTA_TESTE_ID = process.env.LISTA_TESTE_ID || 'lista-de-teste';
// Padrão da URL de pagamento pra onde o site redireciona (ajuste conforme
// o domínio real que o Make.com/InfinitePay usa nos links gerados).
const PADRAO_URL_PAGAMENTO = /infinitepay|checkout/i;

test.describe('Fluxo crítico: escolher e reservar presente', () => {
  test('convidado consegue abrir a lista e ver os produtos', async ({ page }) => {
    const erros = [];
    page.on('pageerror', (err) => erros.push(err));

    await page.goto(`${BASE_URL}/lista.html?id=${LISTA_TESTE_ID}`);
    await expect(page.locator('[data-testid="produto-card"]').first()).toBeVisible({ timeout: 10000 });

    expect(erros, 'não deve haver erros JS não tratados na página').toHaveLength(0);
  });

  test('convidado consegue reservar um presente sem cota e é redirecionado pro pagamento', async ({ page }) => {
    await page.goto(`${BASE_URL}/lista.html?id=${LISTA_TESTE_ID}`);

    const primeiroCard = page.locator('[data-testid="produto-card"]').first();
    await primeiroCard.locator('[data-testid="btn-presentear"]').click();

    await page.fill('[data-testid="input-nome-convidado"]', 'Teste Regressão');
    await page.click('[data-testid="btn-confirmar-modal"]');

    // O frontend faz o trabalho dele aqui: reserva o produto e manda
    // o convidado pra fora do site, pro link de pagamento. Não dá pra
    // testar "sucesso" além disso numa sessão de navegador.
    await page.waitForURL(PADRAO_URL_PAGAMENTO, { timeout: 15000 });
  });

  test('reservar uma cota decrementa as cotas disponíveis e reserva expira depois', async ({ page }) => {
    await page.goto(`${BASE_URL}/lista.html?id=${LISTA_TESTE_ID}`);

    const produtoComCota = page.locator('[data-testid="produto-card"][data-tem-cota="true"]').first();
    const cotasAntes = await produtoComCota.locator('[data-testid="cotas-disponiveis"]').innerText();

    // Passo 1: abre o popup "presentear tudo vs contribuir com cota"
    await produtoComCota.locator('[data-testid="btn-escolher-cota"]').click();
    // Passo 2: escolhe o caminho de cota
    await page.click('[data-testid="btn-contribuir-com-cota"]');
    // Passo 3: seleciona a primeira cota disponível (não ocupada)
    await page.locator('[data-testid="btn-selecionar-cota"]:not([disabled])').first().click();
    // Passo 4: confirma a quantidade escolhida
    await page.click('[data-testid="btn-confirmar-selecao-cotas"]');
    // Passo 5: preenche o nome (mesmo modal/botão usado no fluxo sem cota)
    await page.fill('[data-testid="input-nome-convidado"]', 'Teste Regressão Cota');
    await page.click('[data-testid="btn-confirmar-modal"]');

    // Mesma lógica: confirma o redirecionamento, não uma "confirmação"
    // que o frontend não tem como mostrar.
    await page.waitForURL(PADRAO_URL_PAGAMENTO, { timeout: 15000 });

    // Verifica que a reserva (não o pagamento) já refletiu no Firestore:
    // a cota deve aparecer como pendente/indisponível pra outro convidado
    // que abrir a lista logo em seguida, mesmo sem o pagamento ter sido
    // confirmado ainda.
    await page.goto(`${BASE_URL}/lista.html?id=${LISTA_TESTE_ID}`);
    const cotasDepois = await page
      .locator('[data-testid="produto-card"][data-tem-cota="true"]')
      .first()
      .locator('[data-testid="cotas-disponiveis"]')
      .innerText();

    expect(Number(cotasDepois)).toBeLessThan(Number(cotasAntes));
  });

  test('health check reporta status healthy', async ({ page }) => {
    await page.goto(`${BASE_URL}/health.html`);
    await expect(page.locator('#status')).toHaveText('healthy', { timeout: 15000 });
  });
});

/*
 * ────────────────────────────────────────────────────────────────
 * TESTE SEPARADO (não-Playwright) sugerido pra confirmarPagamento:
 *
 * Como o pagamento é confirmado de forma assíncrona por um webhook,
 * o jeito certo de testar essa parte é um teste de API/integração,
 * chamando a Cloud Function diretamente:
 *
 *   const res = await fetch(URL_CONFIRMAR_PAGAMENTO, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET_DE_TESTE },
 *     body: JSON.stringify({ produtoId, status: 'pago', ... })
 *   });
 *   // então confere no Firestore (via Admin SDK) que o produto virou
 *   // disponivel: false, presenteado_por preenchido, etc.
 *
 * Isso ficaria melhor num arquivo tests/confirmar-pagamento.test.js
 * separado, rodando com Jest/Mocha contra o emulador do Firestore —
 * não faz parte deste arquivo Playwright porque não envolve navegador.
 * ────────────────────────────────────────────────────────────────
 */

