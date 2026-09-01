(function Harvey(){
  // Voltando ao formato síncrono original que funcionava: config direta aqui,
  // sem espera assíncrona de window.firebaseConfig. Isso elimina de vez o bug
  // de timing com DOMContentLoaded — o script roda 100% síncrono do início ao fim.
  const firebaseConfig = {
    apiKey: "AIzaSyDcDs0qgXdOQRnMW2mClO1kCoYmbVfeThY",
    authDomain: "escolhaseupresente-35d3d.firebaseapp.com",
    projectId: "escolhaseupresente-35d3d",
    storageBucket: "escolhaseupresente-35d3d.firebasestorage.app",
    messagingSenderId: "374767023277",
    appId: "1:374767023277:web:0a6d45cb62136ba4040224",
    measurementId: "G-DJZFYZSGMV"
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();



  let produtoAtualId       = "";
  let produtoAtualTitulo   = "";
  let produtoAtualCotas    = 0;   // cotas_total do produto (0 = sem cotas)
  let cotasEscolhidas      = 0;   // quantas cotas o convidado escolheu
  let cotasNumerosEscolhidos = []; // quais números exatos (ex: [1,3]) — evita 2 convidados pegarem a mesma
  let modoFluxo            = "presentear"; // "presentear" | "cota"

  // ============================================================
  // 🎨 SISTEMA DE TEMA INTELIGENTE
  // ============================================================

  function hexParaHSL(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0,2), 16) / 255;
    const g = parseInt(hex.slice(2,4), 16) / 255;
    const b = parseInt(hex.slice(4,6), 16) / 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hexParaRGB(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.slice(0,2), 16),
      parseInt(hex.slice(2,4), 16),
      parseInt(hex.slice(4,6), 16)
    ].join(', ');
  }

  function aplicarTema(hex, modoForcado) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;

    const { h, s, l } = hexParaHSL(hex);
    const rgb  = hexParaRGB(hex);
    const root = document.documentElement;
    const sAdj = Math.max(s, 40);

    const modoClaro = modoForcado !== undefined ? modoForcado : l > 75;

    if (modoClaro) {
      const hAcento = s < 10 ? 240 : h;
      const sAcento = s < 10 ? 60  : Math.min(sAdj + 20, 90);
      const lAcento = 45;

      root.style.setProperty('--acento',     `hsl(${hAcento}, ${sAcento}%, ${lAcento}%)`);
      root.style.setProperty('--acento-rgb', `${Math.round(255 * lAcento/100)}, ${Math.round(255 * lAcento/100)}, 255`);
      root.style.setProperty('--fundo-base', `hsl(${hAcento}, ${Math.round(sAcento * 0.08)}%, 96%)`);
      root.style.setProperty('--fundo-glow-1', `hsla(${hAcento}, ${sAcento}%, 60%, 0.08)`);
      root.style.setProperty('--fundo-glow-2', `hsla(${hAcento - 15}, ${sAcento}%, 55%, 0.06)`);
      root.style.setProperty('--glass-bg',           `rgba(255, 255, 255, 0.85)`);
      root.style.setProperty('--glass-borda',        `hsla(${hAcento}, ${sAcento}%, ${lAcento}%, 0.14)`);
      root.style.setProperty('--glass-hover-bg',     `rgba(255, 255, 255, 0.97)`);
      root.style.setProperty('--glass-hover-borda',  `hsla(${hAcento}, ${sAcento}%, ${lAcento}%, 0.38)`);
      root.style.setProperty('--preco-bg',    `hsla(${hAcento}, ${sAcento}%, ${lAcento}%, 0.07)`);
      root.style.setProperty('--preco-borda', `hsla(${hAcento}, ${sAcento}%, ${lAcento}%, 0.22)`);
      root.style.setProperty('--preco-glow',  `hsla(${hAcento}, ${sAcento}%, ${lAcento}%, 0.10)`);
      root.style.setProperty('--preco-texto', `hsl(${hAcento}, ${sAcento}%, ${lAcento}%)`);
      root.style.setProperty('--btn-bg',       `hsl(${hAcento}, ${sAcento}%, ${lAcento}%)`);
      root.style.setProperty('--btn-borda',    `hsl(${hAcento}, ${sAcento}%, ${lAcento - 8}%)`);
      root.style.setProperty('--btn-hover-bg', `hsl(${hAcento}, ${sAcento}%, ${lAcento - 8}%)`);
      root.style.setProperty('--btn-texto',    '#ffffff');
      root.style.setProperty('--btn-sombra',   `hsla(${hAcento}, ${sAcento}%, ${lAcento}%, 0.35)`);
      root.style.setProperty('--texto-titulo', '#111111');
      root.style.setProperty('--texto-rotulo', 'rgba(0,0,0,0.40)');
      document.body.classList.add('tema-claro');
      document.body.classList.remove('tema-escuro');

    } else {
      const lAcento = Math.min(Math.max(l, 58), 72);

      root.style.setProperty('--acento',     `hsl(${h}, ${sAdj}%, ${lAcento}%)`);
      root.style.setProperty('--acento-rgb', rgb);
      root.style.setProperty('--fundo-base', `hsl(${h}, ${Math.round(sAdj * 0.45)}%, 7%)`);
      root.style.setProperty('--fundo-glow-1', `hsla(${h}, ${sAdj}%, ${Math.min(l+5,52)}%, 0.20)`);
      root.style.setProperty('--fundo-glow-2', `hsla(${h - 12}, ${sAdj}%, ${Math.min(l,48)}%, 0.15)`);
      root.style.setProperty('--glass-bg',           `hsla(${h}, ${Math.round(sAdj*0.25)}%, 80%, 0.055)`);
      root.style.setProperty('--glass-borda',        `hsla(${h}, ${sAdj}%, 75%, 0.11)`);
      root.style.setProperty('--glass-hover-bg',     `hsla(${h}, ${sAdj}%, ${lAcento}%, 0.10)`);
      root.style.setProperty('--glass-hover-borda',  `hsla(${h}, ${sAdj}%, ${lAcento}%, 0.38)`);
      root.style.setProperty('--preco-bg',    `hsla(${h}, ${sAdj}%, ${lAcento}%, 0.10)`);
      root.style.setProperty('--preco-borda', `hsla(${h}, ${sAdj}%, ${lAcento}%, 0.30)`);
      root.style.setProperty('--preco-glow',  `hsla(${h}, ${sAdj}%, ${lAcento}%, 0.18)`);
      root.style.setProperty('--preco-texto', `hsl(${h}, ${Math.min(sAdj+8,88)}%, ${Math.min(lAcento+14,86)}%)`);
      const lBtn = Math.max(lAcento - 12, 38);
      root.style.setProperty('--btn-bg',       `hsla(${h}, ${Math.min(sAdj+15,95)}%, ${lBtn}%, 0.75)`);
      root.style.setProperty('--btn-borda',    `hsla(${h}, ${sAdj}%, ${lAcento}%, 0.50)`);
      root.style.setProperty('--btn-hover-bg', `hsla(${h}, ${Math.min(sAdj+15,95)}%, ${lBtn}%, 0.92)`);
      root.style.setProperty('--btn-texto',    '#ffffff');
      root.style.setProperty('--btn-sombra',   `hsla(${h}, ${sAdj}%, ${lBtn}%, 0.45)`);
      root.style.setProperty('--texto-titulo', '#ffffff');
      root.style.setProperty('--texto-rotulo', 'rgba(255,255,255,0.40)');
      document.body.classList.add('tema-escuro');
      document.body.classList.remove('tema-claro');
    }
  }

  // ============================================================

  function obterUsuarioIdDaUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  window.addEventListener('DOMContentLoaded', () => {
    const listaContainer = document.getElementById('lista-produtos');
    const inputNome      = document.getElementById('nome-convidado');

    if (!listaContainer) {
      alert("Erro crítico: div 'lista-produtos' não encontrada!");
      return;
    }

    const usuarioIdUrl = obterUsuarioIdDaUrl();
    if (!usuarioIdUrl) {
      listaContainer.innerHTML = "<p style='text-align:center;padding:40px;color:rgba(255,255,255,0.45)'>Erro: lista sem identificador. Peça o link correto aos noivos!</p>";
      return;
    }

    // ── Tema em tempo real ─────────────────────────────────────
    db.collection("configuracoes").doc(usuarioIdUrl)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const dados = doc.data();

          const modoForcado = dados.modo_display === 'claro'  ? true
                            : dados.modo_display === 'escuro' ? false
                            : undefined;

          if (dados.cor_tema) aplicarTema(dados.cor_tema, modoForcado);

          if (dados.imagem_fundo) {
            document.documentElement.style.setProperty(
              '--imagem-fundo', `url('${dados.imagem_fundo}')`
            );
          }

          if (dados.titulo_boas_vindas) {
            const h1 = document.querySelector('.conteudo-boas-vindas h1');
            if (h1) h1.textContent = dados.titulo_boas_vindas;
          }
          if (dados.descricao_boas_vindas) {
            const p = document.querySelector('.conteudo-boas-vindas p');
            if (p) p.textContent = dados.descricao_boas_vindas;
          }
          if (dados.data_evento) {
            iniciarContagem(dados.data_evento);
          } else {
            const bloco = document.getElementById('countdown-bloco');
            if (bloco) bloco.style.display = 'none';
          }
        }
      }, err => console.error("Erro tema:", err));

    // ── Contagem regressiva ────────────────────────────────────
    let countdownInterval = null;

    function iniciarContagem(dataEvento) {
      const bloco = document.getElementById('countdown-bloco');
      if (!bloco) return;

      // Limpa intervalo anterior se existir
      if (countdownInterval) clearInterval(countdownInterval);

      const alvo = new Date(dataEvento).getTime();
      if (isNaN(alvo)) { bloco.style.display = 'none'; return; }

      bloco.style.display = 'flex';

      function atualizar() {
        const agora = Date.now();
        const diff  = alvo - agora;

        if (diff <= 0) {
          clearInterval(countdownInterval);
          document.getElementById('cd-dias').textContent  = '00';
          document.getElementById('cd-horas').textContent = '00';
          document.getElementById('cd-min').textContent   = '00';
          document.getElementById('cd-seg').textContent   = '00';
          const label = bloco.querySelector('.cd-evento-label');
          if (label) label.textContent = '🎉 O grande dia chegou!';
          return;
        }

        const dias  = Math.floor(diff / 86400000);
        const horas = Math.floor((diff % 86400000) / 3600000);
        const min   = Math.floor((diff % 3600000)  / 60000);
        const seg   = Math.floor((diff % 60000)    / 1000);

        document.getElementById('cd-dias').textContent  = String(dias).padStart(2,'0');
        document.getElementById('cd-horas').textContent = String(horas).padStart(2,'0');
        document.getElementById('cd-min').textContent   = String(min).padStart(2,'0');
        document.getElementById('cd-seg').textContent   = String(seg).padStart(2,'0');
      }

      atualizar();
      countdownInterval = setInterval(atualizar, 1000);
    }

    // ── Filtro de categorias ───────────────────────────────────
    let categoriaAtiva = 'todos';
    let todosProdutosCache = [];

    function renderizarFiltros(categorias) {
      const wrap = document.getElementById('filtro-categorias');
      if (!wrap) return;
      wrap.innerHTML = '';

      // Chip "Todos"
      const chipTodos = document.createElement('button');
      chipTodos.className = 'chip-categoria' + (categoriaAtiva === 'todos' ? ' ativo' : '');
      chipTodos.textContent = 'Todos';
      chipTodos.addEventListener('click', () => {
        categoriaAtiva = 'todos';
        aplicarFiltro();
        atualizarChips();
      });
      wrap.appendChild(chipTodos);

      // Chips por categoria
      categorias.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'chip-categoria' + (categoriaAtiva === cat ? ' ativo' : '');
        chip.textContent = cat;
        chip.addEventListener('click', () => {
          categoriaAtiva = cat;
          aplicarFiltro();
          atualizarChips();
        });
        wrap.appendChild(chip);
      });
    }

    function atualizarChips() {
      document.querySelectorAll('.chip-categoria').forEach(chip => {
        const cat = chip.textContent;
        chip.classList.toggle('ativo',
          cat === 'Todos' ? categoriaAtiva === 'todos' : categoriaAtiva === cat
        );
      });
    }

    function aplicarFiltro() {
      const cards = listaContainer.querySelectorAll('main.conteudo');
      cards.forEach(card => {
        if (categoriaAtiva === 'todos') {
          card.style.display = '';
        } else {
          card.style.display = card.dataset.categoria === categoriaAtiva ? '' : 'none';
        }
      });
    }

    // ── Produtos em tempo real ─────────────────────────────────
    // Monitoring: request ID + tempo de processamento por snapshot (regras 1, 5, 7)
    db.collection("presentes").where("usuario_id", "==", usuarioIdUrl)
      .onSnapshot((snapshot) => {
       const __reqId = window.Monitoring ? Monitoring.generateRequestId() : null;
       const __t0 = performance.now();
       try {
        listaContainer.innerHTML = "";
        todosProdutosCache = [];

        if (snapshot.empty) {
          listaContainer.innerHTML = "<p style='text-align:center;padding:40px;color:rgba(255,255,255,0.40)'>Esta lista ainda não possui produtos cadastrados.</p>";
          document.getElementById('filtro-categorias').innerHTML = '';
          return;
        }

        // Coleta categorias únicas com pelo menos 1 item
        const categoriasSet = new Set();

        snapshot.forEach((doc) => {
          const produto = doc.data();
          const id      = doc.id;

          // Item sem valor definido (preço 0 ou vazio) não aparece pro
          // convidado — ele não pode presentear algo sem preço, e mostrar
          // "R$ 0,00" confunde. O item continua existindo/editável no
          // painel do dono da lista, só fica escondido aqui até ter valor.
          if (!(parseInt(produto.preco_centavos || 0) > 0)) return;

          todosProdutosCache.push({ id, ...produto });

          if (produto.categoria && produto.categoria.trim()) {
            categoriasSet.add(produto.categoria.trim());
          }

          const dispClass = produto.disponivel ? "disponivel" : "indisponivel";
          const dispTexto = produto.disponivel ? "Disponível"  : "Presenteado";

          const wrap = document.createElement('main');
          wrap.className = 'conteudo';
          wrap.dataset.categoria = produto.categoria?.trim() || '';
          wrap.dataset.testid = 'produto-card';
          if (!produto.disponivel) wrap.classList.add('item-esgotado');

          // Usa DOM seguro para campos vindos do Firestore
          const section = document.createElement('section');
          section.className = 'cartao-produto';

          const imgDiv = document.createElement('div');
          imgDiv.className = 'imagem-produto';
          const img = document.createElement('img');
          img.src = produto.imagem || 'https://i.ibb.co/YBZJdZ2N/icon-192.jpg';
          img.alt = produto.titulo || 'Produto';
          img.onerror = () => { img.src = 'https://i.ibb.co/YBZJdZ2N/icon-192.jpg'; };
          imgDiv.appendChild(img);

          const detalhes = document.createElement('div');
          detalhes.className = 'detalhes-produto';

          const titulo = document.createElement('div');
          titulo.className = 'titulo-produto';
          titulo.textContent = produto.titulo || 'Sem título';

          const rodape = document.createElement('div');
          rodape.className = 'rodape-produto';

          const caixaPreco = document.createElement('div');
          caixaPreco.className = 'caixa-preco';
          caixaPreco.innerHTML = `
            <div class="rotulo-preco">Valor</div>
            <div class="preco"></div>
            <div class="disponibilidade ${dispClass}"></div>`;
          caixaPreco.querySelector('.preco').textContent          = produto.preco || 'Consulte';
          caixaPreco.querySelector('.disponibilidade').textContent = dispTexto;

          const acoes = document.createElement('div');
          acoes.className = 'acoes';

          const cotasTotal     = parseInt(produto.cotas_total || 0);
          const cotasOcupadas  = Array.isArray(produto.cotas_ocupadas) ? produto.cotas_ocupadas : [];
          const cotasDisp      = Math.max(0, cotasTotal - cotasOcupadas.length);
          const temCotas       = cotasTotal >= 2;
          const cotasAcabaram  = temCotas && cotasDisp <= 0;
          wrap.dataset.temCota = temCotas ? 'true' : 'false';

          const precoCentavos = parseInt(produto.preco_centavos || 0);

          if (produto.disponivel && !cotasAcabaram) {
            if (temCotas) {
              // Produto com cotas: UM botão que abre o popup de escolha
              const btnCotas = document.createElement('button');
              btnCotas.className = 'botao primario botao-escolha-cotas';
              btnCotas.dataset.testid        = 'btn-escolher-cota';
              btnCotas.dataset.id            = id;
              btnCotas.dataset.titulo        = produto.titulo || '';
              btnCotas.dataset.cotasTotal    = cotasTotal;
              btnCotas.dataset.cotasDisp     = cotasDisp;
              btnCotas.dataset.precoCentavos = produto.preco_centavos || '0';
              btnCotas.dataset.cotasOcupadas = JSON.stringify(cotasOcupadas);
              btnCotas.textContent = '🎁 Presentear';
              acoes.appendChild(btnCotas);

              if (precoCentavos > 0) {
                const porCotaFmt = (precoCentavos / 100 / cotasTotal)
                  .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const tagCotas = document.createElement('div');
                tagCotas.className = 'tag-cotas-lista';
                // Número isolado num span próprio (data-testid) — o texto
                // completo da tag mistura vários dados, mas o teste de
                // regressão precisa só do número de cotas disponíveis
                // pra comparar antes/depois de uma reserva.
                tagCotas.innerHTML = `🎯 <span data-testid="cotas-disponiveis">${cotasDisp}</span>/${cotasTotal} cotas · ${porCotaFmt} cada`;
                caixaPreco.appendChild(tagCotas);
              }
            } else {
              // Produto normal: botão padrão
              const btn = document.createElement('button');
              btn.className = 'botao primario botao-presentear';
              btn.dataset.testid  = 'btn-presentear';
              btn.dataset.id     = id;
              btn.dataset.titulo = produto.titulo || '';
              btn.textContent    = '😊 Presentear 😊';
              acoes.appendChild(btn);
            }
          } else if (temCotas && cotasAcabaram && produto.disponivel) {
            const btn = document.createElement('button');
            btn.className = 'botao';
            btn.disabled = true;
            btn.textContent = '✅ Cotas esgotadas';
            acoes.appendChild(btn);
          } else {
            const btn = document.createElement('button');
            btn.className = 'botao';
            btn.disabled  = true;
            btn.textContent = '😍 Ganhamos! 😍';
            acoes.appendChild(btn);
          }

          rodape.appendChild(caixaPreco);
          rodape.appendChild(acoes);
          detalhes.appendChild(titulo);
          detalhes.appendChild(rodape);
          section.appendChild(imgDiv);
          section.appendChild(detalhes);
          wrap.appendChild(section);
          listaContainer.appendChild(wrap);
        });

        // Animação de scroll tratada puramente por CSS via animation-timeline: view()
        // Não precisa de IntersectionObserver nem de classes JS.

        // Atualiza chips (só categorias com itens)
        const categoriasOrdenadas = [...categoriasSet].sort();
        renderizarFiltros(categoriasOrdenadas);

        // Reaplica filtro ativo
        aplicarFiltro();

        // Eventos dos botões presentear (produto sem cotas — fluxo direto)
        listaContainer.querySelectorAll('.botao-presentear').forEach(btn => {
          btn.addEventListener('click', function() {
            produtoAtualId     = this.dataset.id;
            produtoAtualTitulo = this.dataset.titulo;
            produtoAtualCotas  = 0;
            modoFluxo          = "presentear";
            cotasEscolhidas    = 0;
            abrirModalNome();
          });
        });

        // Evento do botão único de cotas — abre popup de escolha primeiro
        listaContainer.querySelectorAll('.botao-escolha-cotas').forEach(btn => {
          btn.addEventListener('click', function() {
            produtoAtualId      = this.dataset.id;
            produtoAtualTitulo  = this.dataset.titulo;
            produtoAtualCotas   = parseInt(this.dataset.cotasTotal || 0);
            const dispAtual     = parseInt(this.dataset.cotasDisp || 0);
            const precoCentavos = parseInt(this.dataset.precoCentavos || 0);
            let cotasOcupadas   = [];
            try { cotasOcupadas = JSON.parse(this.dataset.cotasOcupadas || '[]'); } catch(e) {}
            abrirModalEscolha(produtoAtualTitulo, produtoAtualCotas, dispAtual, precoCentavos, cotasOcupadas);
          });
        });

       if (window.Monitoring) {
         Monitoring.logger.info('produtos_snapshot_render', {
           request_id: __reqId,
           duration_ms: Math.round((performance.now() - __t0) * 100) / 100,
           produtos_count: todosProdutosCache.length
         });
       }
       } catch (errRender) {
         // Com isso, qualquer erro de renderização aparece no Console em vez
         // de travar silenciosamente e deixar a lista de produtos em branco.
         if (window.Monitoring) {
           Monitoring.captureError(errRender, { request_id: __reqId, operation: 'render_produtos' });
         } else {
           console.error("Erro ao renderizar produtos:", errRender);
         }
         listaContainer.innerHTML = "<p style='text-align:center;padding:40px;color:#ff6b6b'>Erro ao carregar a lista. Veja o Console (F12) para detalhes.</p>";
       }
      }, errSnap => {
        if (window.Monitoring) {
          Monitoring.captureError(errSnap, { request_id: __reqId, operation: 'onSnapshot_produtos' });
        } else {
          console.error("Erro no onSnapshot de produtos:", errSnap);
        }
        listaContainer.innerHTML = "<p style='text-align:center;padding:40px;color:#ff6b6b'>Erro ao conectar com o banco de dados: " + errSnap.message + "</p>";
      });

    // Alternar layout
    document.getElementById('btn-alternar-layout')?.addEventListener('click', () => {
      listaContainer.classList.toggle('visualizacao-vertical');
    });

    // ── helpers de modal ──────────────────────────────────────
    function abrirModalNome() {
      const m = document.getElementById('modal-nome');
      if (m) {
        if (inputNome) inputNome.value = "";
        m.classList.add('mostrar');
        if (inputNome) inputNome.focus();
      }
    }

    function fecharModalNome() {
      document.getElementById('modal-nome')?.classList.remove('mostrar');
    }

    // ── Modal 1: Escolha entre "Presentear tudo" ou "Contribuir com cota" ──
    function abrirModalEscolha(titulo, cotasTotal, cotasDisp, precoCentavos, cotasOcupadas) {
      document.getElementById('modal-escolha')?.remove();
      document.getElementById('modal-cotas')?.remove();

      const totalFmt = (precoCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const porCotaFmt = (Math.round(precoCentavos / cotasTotal) / 100)
        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // Se já existe alguma cota paga, não faz sentido oferecer "Presentear tudo"
      // porque o valor total do produto não está mais disponível integralmente.
      const temCotasPagas = Array.isArray(cotasOcupadas) && cotasOcupadas.length > 0;
      const btnTudoHTML = temCotasPagas ? '' : `
          <button type="button" class="opcao-escolha opcao-tudo" id="btn-escolha-tudo">
            <span class="opcao-escolha-emoji">🎁</span>
            <span class="opcao-escolha-textos">
              <span class="opcao-escolha-titulo">Presentear tudo</span>
              <span class="opcao-escolha-valor">${totalFmt}</span>
            </span>
          </button>`;

      const modal = document.createElement('div');
      modal.id = 'modal-escolha';
      modal.className = 'modal-container mostrar';
      modal.innerHTML = `
        <div class="modal-conteudo modal-escolha-conteudo">
          <button type="button" class="modal-fechar-x" id="btn-fechar-escolha-x" aria-label="Fechar">✕</button>
          <h3 class="modal-escolha-titulo"></h3>
          <p class="modal-escolha-sub">${temCotasPagas ? 'Escolha quantas cotas quer contribuir:' : 'Como você quer presentear?'}</p>

          ${btnTudoHTML}

          <button type="button" class="opcao-escolha opcao-cota" id="btn-escolha-cota" data-testid="btn-contribuir-com-cota">
            <span class="opcao-escolha-emoji">🎯</span>
            <span class="opcao-escolha-textos">
              <span class="opcao-escolha-titulo">Contribuir com cota</span>
              <span class="opcao-escolha-valor">a partir de ${porCotaFmt} · ${cotasDisp}/${cotasTotal} disponíveis</span>
            </span>
          </button>

          <div class="modal-botoes" style="margin-top:14px;">
            <button id="btn-voltar-escolha" class="botao">Voltar</button>
          </div>
        </div>`;

      modal.querySelector('.modal-escolha-titulo').textContent = titulo;
      document.body.appendChild(modal);

      const fechar = () => {
        modal.classList.remove('mostrar');
        modal.remove();
      };
      modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
      document.getElementById('btn-fechar-escolha-x').addEventListener('click', fechar);
      document.getElementById('btn-voltar-escolha').addEventListener('click', fechar);

      // Só adiciona listener se o botão existir (pode ter sido ocultado)
      document.getElementById('btn-escolha-tudo')?.addEventListener('click', () => {
        modoFluxo = "presentear";
        cotasEscolhidas = 0;
        fechar();
        abrirModalNome();
      });

      document.getElementById('btn-escolha-cota').addEventListener('click', () => {
        fechar();
        abrirModalCotas(titulo, cotasTotal, cotasDisp, precoCentavos, cotasOcupadas);
      });
    }

    // ── Modal 2: Lista de quantidade — "1 cota de R$X", "2 cotas de R$X"... ──
    // Cada linha mostra quantas cotas + o valor de CADA UMA (não o acumulado),
    // deixando claro que o preço por cota nunca muda, só a quantidade escolhida.
    function abrirModalCotas(titulo, cotasTotal, cotasDisp, precoCentavos, cotasOcupadas) {
      document.getElementById('modal-cotas')?.remove();
      document.getElementById('modal-escolha')?.remove();

      const porCotaCentavos = Math.round(precoCentavos / cotasTotal);
      const porCotaFmt = (porCotaCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const ocupadasSet = new Set(cotasOcupadas || []);

      // Um botão por cota disponível — mostra só o valor, sem número nem rótulo.
      // O convidado pode tocar em quantos quiser (seleção múltipla).
      // Cotas já ocupadas aparecem bloqueadas com um cadeado.
      let botoesHTML = '';
      for (let n = 1; n <= cotasTotal; n++) {
        const ocupada = ocupadasSet.has(n);
        const atributos = ocupada
          ? 'disabled aria-label="Cota indisponível"'
          : 'aria-label="Contribuir com esta cota"';
        const conteudo = ocupada ? '🔒' : porCotaFmt;
        botoesHTML += `
          <button type="button"
            class="btn-cota-valor${ocupada ? ' ocupada' : ''}"
            data-testid="btn-selecionar-cota"
            data-num="${n}"
            ${atributos}>
            ${conteudo}
          </button>`;
      }

      const modal = document.createElement('div');
      modal.id = 'modal-cotas';
      modal.className = 'modal-container mostrar';
      modal.innerHTML = `
        <div class="modal-conteudo modal-cotas-conteudo">
          <button type="button" class="modal-fechar-x" id="btn-fechar-cotas-x" aria-label="Fechar">✕</button>
          <div class="modal-cotas-header">
            <span class="modal-cotas-icone">🎯</span>
            <div>
              <h3>Contribuir com cota</h3>
              <p class="modal-cotas-subtitulo"></p>
            </div>
          </div>

          <p class="modal-cotas-pergunta">Selecione uma cota ou quantas quiser:</p>
          <div class="grade-btns-cota">${botoesHTML}</div>

          <div class="modal-cotas-resumo" id="cotas-resumo" style="display:none;">
            <span id="cotas-resumo-txt"></span>
            <strong id="cotas-resumo-total"></strong>
          </div>

          <div class="modal-botoes" style="margin-top:14px;">
            <button id="btn-voltar-modal-cotas" class="botao">Voltar</button>
            <button id="btn-confirmar-cotas" data-testid="btn-confirmar-selecao-cotas" class="botao primario" disabled>Confirmar</button>
          </div>
        </div>`;

      modal.querySelector('.modal-cotas-subtitulo').textContent = titulo;
      document.body.appendChild(modal);

      const fechar = () => {
        modal.classList.remove('mostrar');
        modal.remove();
      };
      modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
      document.getElementById('btn-fechar-cotas-x').addEventListener('click', fechar);
      document.getElementById('btn-voltar-modal-cotas').addEventListener('click', fechar);

      // ── Lógica de seleção múltipla ──
      const selecionadas = new Set();
      const resumoEl    = document.getElementById('cotas-resumo');
      const resumoTxt   = document.getElementById('cotas-resumo-txt');
      const resumoTotal = document.getElementById('cotas-resumo-total');
      const btnConfirmar = document.getElementById('btn-confirmar-cotas');

      function atualizarResumo() {
        const n = selecionadas.size;
        btnConfirmar.disabled = n === 0;
        if (n === 0) {
          resumoEl.style.display = 'none';
        } else {
          resumoEl.style.display = 'flex';
          resumoTxt.textContent = `${n} cota${n > 1 ? 's' : ''} selecionada${n > 1 ? 's' : ''}`;
          resumoTotal.textContent = (porCotaCentavos * n / 100)
            .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
      }

      modal.querySelectorAll('.btn-cota-valor:not(.ocupada)').forEach(btn => {
        btn.addEventListener('click', function() {
          const num = parseInt(this.dataset.num);
          if (selecionadas.has(num)) {
            selecionadas.delete(num);
            this.classList.remove('selecionada');
          } else {
            selecionadas.add(num);
            this.classList.add('selecionada');
          }
          atualizarResumo();
        });
      });

      btnConfirmar.addEventListener('click', () => {
        if (selecionadas.size === 0) return;
        modoFluxo = "cota";
        cotasEscolhidas = selecionadas.size;
        cotasNumerosEscolhidos = Array.from(selecionadas).sort((a, b) => a - b);
        fechar();
        abrirModalNome();
      });
    }

    // ── Fechar modal de nome ───────────────────────────────────
    document.getElementById('btn-cancelar-modal')?.addEventListener('click', fecharModalNome);
    document.getElementById('btn-fechar-modal-x')?.addEventListener('click', fecharModalNome);

    // ── Confirmar nome ─────────────────────────────────────────
    async function confirmarNome() {
      const nome = inputNome?.value.trim() || "";
      if (!nome) { alert("Digite seu nome para continuar."); return; }
      fecharModalNome();
      await finalizarCompra(nome);
    }

    document.getElementById('btn-confirmar-modal')?.addEventListener('click', confirmarNome);

    inputNome?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') await confirmarNome();
    });

    // ── finalizarCompra ────────────────────────────────────────
    const overlayRedirecionando = document.getElementById('overlay-redirecionando');
    function mostrarOverlayRedirecionando() {
      if (overlayRedirecionando) {
        overlayRedirecionando.classList.add('ativo');
        overlayRedirecionando.setAttribute('aria-hidden', 'false');
      }
    }
    function esconderOverlayRedirecionando() {
      if (overlayRedirecionando) {
        overlayRedirecionando.classList.remove('ativo');
        overlayRedirecionando.setAttribute('aria-hidden', 'true');
      }
    }

    async function finalizarCompra(nomeConvidado) {
      // ✅ NOVO: mostra a telinha de transição já aqui — a chamada pra
      // Cloud Function (que ainda chama o Make, que ainda chama o
      // InfinitePay) pode levar alguns segundos antes do redirecionamento.
      mostrarOverlayRedirecionando();
      try {
        const payload = { produtoId: produtoAtualId, nomeConvidado };

        // Se for fluxo de cota, envia quantidade E os números exatos escolhidos —
        // a Cloud Function usa os números para marcar exatamente essas cotas como
        // ocupadas no Firestore, evitando conflito se dois convidados confirmarem juntos.
        if (modoFluxo === "cota" && cotasEscolhidas > 0) {
          payload.cotasEscolhidas = cotasEscolhidas;
          payload.cotasNumeros    = cotasNumerosEscolhidos;
        }

        const res = await fetch(
          "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/finalizarCompra",
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        const resultado = await res.json();
        if (resultado?.url) {
          // Mantém o overlay visível — a página vai navegar pra fora agora.
          window.location.href = resultado.url;
        } else {
          esconderOverlayRedirecionando();
          alert(resultado.erro || "Não foi possível gerar o link. Tente novamente.");
        }
      } catch (err) {
        console.error("Erro:", err);
        esconderOverlayRedirecionando();
        alert("Erro de comunicação. Tente novamente.");
      }
    }
  });
})();