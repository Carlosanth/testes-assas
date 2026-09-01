// ✅ CORRIGIDO: antes, um Service Worker novo só assumia depois que TODAS as
// abas do site fossem fechadas, e a estratégia "cache primeiro" servia o
// arquivo salvo sem checar se existia versão mais nova — por isso, ao
// atualizar o site, o cliente ficava preso na versão antiga até limpar o
// cache manualmente (algo que a maioria das pessoas não sabe fazer).
//
// ⚠️ IMPORTANTE: sempre que publicar uma atualização do site, troque o
// número da versão abaixo (ex: 'v1' -> 'v2'). Isso garante que o navegador
// detecte que o sw.js mudou e force a atualização em todo mundo.
const CACHE_NAME = 'presentes-v9';
const ASSETS = [
  '/',
  '/index.html',
  '/css/login-style.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // ✅ NOVO: não espera as abas antigas fecharem — o novo Service Worker
  // já fica pronto pra assumir assim que instalado.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // ✅ NOVO: apaga qualquer cache de versões antigas (presentes-v1, etc.)
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      );
      // ✅ NOVO: assume o controle das abas que já estavam abertas,
      // sem precisar que o usuário feche e abra o site de novo.
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Ignora Firebase e APIs externas — nunca coloca em cache
  if (
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com')
  ) {
    return; // Deixa o navegador fazer a requisição normalmente
  }

  // Só faz sentido cachear GET (POST/PUT não são cacheáveis e dão erro
  // se você tentar colocar no Cache Storage).
  if (event.request.method !== 'GET') {
    return;
  }

  // ✅ CORRIGIDO: a Cache API só aceita requisições com esquema http(s).
  // Extensões do Chrome (adblock, gerenciador de senhas, etc.) disparam
  // requisições com esquema "chrome-extension://", e tentar dar cache.put
  // nelas jogava o erro "Request scheme 'chrome-extension' is unsupported".
  if (!url.startsWith('http')) {
    return;
  }

  // ✅ CORRIGIDO: estratégia agora é "rede primeiro, cache como reserva".
  // Antes era o contrário (cache primeiro), o que servia versões antigas
  // dos arquivos mesmo com internet disponível e um deploy novo no ar.
  // Agora: sempre tenta buscar a versão mais recente da rede; só usa o
  // cache salvo se o usuário estiver offline ou a rede falhar.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Atualiza o cache com a versão fresca, pra ter algo salvo
        // caso o usuário fique offline depois.
        const respostaClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, respostaClone);
        });
        return response;
      })
      .catch(() => {
        // Sem internet — tenta servir do cache como último recurso.
        return caches.match(event.request);
      })
  );
});
