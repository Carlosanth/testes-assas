        import { escapeHTML, insertHTMLSeguro, sanitizarDados } from "./sanitize-utils.js";
        import { 
            renderizarComunicadoSeguro,
            renderizarTabelaPresentes,
            renderizarCategoriasSeguras,
            formatarMoeda
        } from "./admin-security-fixes.js";
        
        // Tornar global para usar no código
        window.escapeHTML = escapeHTML;
        window.insertHTMLSeguro = insertHTMLSeguro;
        window.sanitizarDados = sanitizarDados;
        window.renderizarComunicadoSeguro = renderizarComunicadoSeguro;
        window.renderizarTabelaPresentes = renderizarTabelaPresentes;
        window.renderizarCategoriasSeguras = renderizarCategoriasSeguras;
        window.formatarData = formatarData;
        window.formatarMoeda = formatarMoeda;
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getFirestore, collection, getDocs, query, where, onSnapshot, doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, addDoc, orderBy, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
    import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

    const firebaseConfig = {
        apiKey: "AIzaSyDcDs0qgXdOQRnMW2mClO1kCoYmbVfeThY",
        authDomain: "escolhaseupresente-35d3d.firebaseapp.com",
        projectId: "escolhaseupresente-35d3d",
        storageBucket: "escolhaseupresente-35d3d.firebasestorage.app",
        messagingSenderId: "374767023277",
        appId: "1:374767023277:web:0a6d45cb62136ba4040224"
    };

    const app  = initializeApp(firebaseConfig);
    const db   = getFirestore(app);
    const auth = getAuth(app);

    // UID do admin — só este e-mail pode acessar
    const ADMIN_EMAIL = "carlosantonio.d.m.o@gmail.com"; // ← troque pelo seu e-mail
    // ⚠️ Chave do ImgBB removida daqui — o upload agora passa pela Cloud Function
    // uploadImagem (mesma usada no cadastro.html), que já tem rate limit e validação
    // de tamanho/tipo no servidor. Nunca coloque chaves de API de terceiros em HTML
    // publicado, pois qualquer pessoa consegue ler o código-fonte da página.

    let taxaGlobal = 2.8;

    // ================================================================
    // IMAGEM — redimensionar (quadrada) e subir pro ImgBB
    // ================================================================
    function redimensionarImagem(arquivo, larguraMax = 600, alturaMax = 600, qualidade = 0.82) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;

                    if (w > larguraMax || h > alturaMax) {
                        const ratio = Math.min(larguraMax / w, alturaMax / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }

                    const lado = Math.min(w, h);
                    canvas.width  = lado;
                    canvas.height = lado;
                    const ctx = canvas.getContext('2d');
                    const offsetX = (w - lado) / 2;
                    const offsetY = (h - lado) / 2;

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = w;
                    tempCanvas.height = h;
                    tempCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    ctx.drawImage(tempCanvas, offsetX, offsetY, lado, lado, 0, 0, lado, lado);

                    canvas.toBlob((blob) => resolve(blob), 'image/webp', qualidade);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(arquivo);
        });
    }

    async function fazerUploadImagemImgBB(arquivoOuBlob, pasta) {
        try {
            // Converte o Blob/arquivo pra base64 (sem o prefixo "data:image/...;base64,")
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(arquivoOuBlob);
            });

            // ✅ Upload via Cloud Function (mesma usada no cadastro.html) — nunca
            // chama o ImgBB direto do navegador, pra não expor chave de API.
            // 'pasta' é opcional — quando informado, a Cloud Function usa como
            // subpasta no R2 (ex: 'temas'); sem isso, cai na pasta padrão.
            const corpoRequisicao = { imagemBase64: base64 };
            if (pasta) corpoRequisicao.pasta = pasta;
            const response = await fetch(
                "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/uploadImagem",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(corpoRequisicao)
                }
            );
            const data = await response.json();
            if (data.url) return data.url;
            throw new Error(data.erro || "Falha no upload da imagem");
        } catch (error) {
            console.error("Erro no upload da imagem:", error);
            return 'https://i.ibb.co/FqHbGwfs/189697.png';
        }
    }

    // ================================================================
    // CATEGORIAS — mesma coleção global usada no cadastro.html, pra
    // manter os selects de categoria consistentes com o resto do site.
    // ================================================================
    let categoriasGlobaisCache = [];
    function popularSelectsCategoria() {
        const selects = [
            document.getElementById('inputImagemBancoCategoria'),
            document.getElementById('inputPrecoManualCategoria'),
        ].filter(Boolean);
        selects.forEach(sel => {
            const valorAtual = sel.value;
            sel.innerHTML = '<option value="">Sem categoria</option>' +
                categoriasGlobaisCache.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
            if (categoriasGlobaisCache.includes(valorAtual)) sel.value = valorAtual;
        });
    }
    onSnapshot(collection(db, "categorias"), snap => {
        categoriasGlobaisCache = snap.docs.map(d => d.data().nome || d.id).filter(Boolean);
        popularSelectsCategoria();
    }, err => console.error("Erro ao carregar categorias:", err));

    // ================================================================
    // BANCO DE IMAGENS — fotos profissionais cadastradas só pelo admin,
    // sugeridas automaticamente pro cliente quando ele digita o nome de
    // um produto no cadastro dele (cadastro.html busca nesta coleção).
    // ================================================================

    // Quebra o nome (e opcionalmente sinônimos) em palavras-chave: tira
    // acento, deixa minúsculo, remove pontuação e palavras muito curtas/
    // genéricas. Ex: "Fogão 4 Bocas Preto" -> ["fogao", "4", "bocas", "preto"]
    const PALAVRAS_IGNORADAS = new Set(['de','da','do','das','dos','com','para','pra','a','o','e','um','uma','uns','umas','em','no','na']);
    function normalizarTags(nome, sinonimos = '') {
        const textoCompleto = [nome, sinonimos.replace(/,/g, ' ')].filter(Boolean).join(' ');
        const tags = textoCompleto
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(p => p.length >= 2 && !PALAVRAS_IGNORADAS.has(p));
        return [...new Set(tags)].slice(0, 20); // remove duplicatas, limite razoável
    }

    let bancoImagensCache = [];
    let editandoImagemBancoId = null;
    let urlImagemBancoSelecionada = '';

    function escutarBancoImagens() {
        onSnapshot(collection(db, "banco_imagens"), snap => {
            bancoImagensCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderizarGridBancoImagens(bancoImagensCache);
        }, err => console.error("Erro ao carregar banco de imagens:", err));
    }

    function renderizarGridBancoImagens(lista) {
        const grid = document.getElementById('bancoImagensGrid');
        if (!grid) return;
        if (!lista.length) { grid.innerHTML = '<div class="lp-vazio">Nenhuma imagem cadastrada ainda.</div>'; return; }
        grid.innerHTML = lista.map(item => `
            <div class="lp-card-item" data-item-id="${item.id}">
                <img src="${item.imagemUrl}" alt="${escapeHTML(item.nome || '')}" loading="lazy">
                <div class="lp-card-item-corpo">
                    <div class="lp-card-item-nome">${escapeHTML(item.nome || '')}</div>
                    <div style="font-size:10px; color:var(--text3); margin:2px 0 8px;">${(item.tags || []).map(t => '#' + escapeHTML(t)).join(' ')}</div>
                    <div class="lp-card-item-acoes">
                        <button class="btn-tabela btn-detalhe btn-editar-imagem-banco" data-id="${item.id}">✏️ Editar</button>
                        <button class="btn-tabela btn-excluir-cliente btn-excluir-imagem-banco" data-id="${item.id}">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
        grid.querySelectorAll('.btn-editar-imagem-banco').forEach(btn => {
            btn.addEventListener('click', () => abrirModalImagemBanco(btn.dataset.id));
        });
        grid.querySelectorAll('.btn-excluir-imagem-banco').forEach(btn => {
            btn.addEventListener('click', () => excluirImagemBanco(btn.dataset.id));
        });
    }

    // ===== ESCOLHER DO BANCO DE IMAGENS (PARA LISTAS PRONTAS) =====
    // Fluxo: abre grade de seleção múltipla do banco_imagens -> revisão em
    // lote (nome/valor editáveis) -> salva todos como itens da categoria
    // de lista pronta que estava aberta, no mesmo formato que o "Novo item".
    let idsSelecionadosBancoLP = new Set();

    function abrirModalSelecionarBancoLP() {
        if (!categoriaLPAberta) return;
        idsSelecionadosBancoLP = new Set();
        document.getElementById('inputBuscarSelecionarBancoLP').value = '';
        renderizarGridSelecionarBancoLP(bancoImagensCache);
        document.getElementById('modalSelecionarBancoLP').classList.add('ativo');
    }

    function renderizarGridSelecionarBancoLP(lista) {
        const grid = document.getElementById('gridSelecionarBancoLP');
        if (!grid) return;
        if (!lista.length) { grid.innerHTML = '<div class="lp-vazio">Nenhuma imagem cadastrada ainda.</div>'; return; }
        grid.innerHTML = lista.map(item => `
            <div class="lp-card-item selecionavel${idsSelecionadosBancoLP.has(item.id) ? ' selecionado' : ''}" data-item-id="${item.id}">
                ${idsSelecionadosBancoLP.has(item.id) ? '<div class="lp-card-item-check">✓</div>' : ''}
                <img src="${item.imagemUrl}" alt="${escapeHTML(item.nome || '')}" loading="lazy">
                <div class="lp-card-item-corpo">
                    <div class="lp-card-item-nome">${escapeHTML(item.nome || '')}</div>
                </div>
            </div>
        `).join('');
        grid.querySelectorAll('.lp-card-item').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.itemId;
                if (idsSelecionadosBancoLP.has(id)) idsSelecionadosBancoLP.delete(id);
                else idsSelecionadosBancoLP.add(id);
                renderizarGridSelecionarBancoLP(lista);
                atualizarContadorSelecaoBancoLP();
            });
        });
        atualizarContadorSelecaoBancoLP();
    }

    function atualizarContadorSelecaoBancoLP() {
        const contador = document.getElementById('contadorSelecaoBancoLP');
        if (contador) contador.textContent = `${idsSelecionadosBancoLP.size} selecionada${idsSelecionadosBancoLP.size === 1 ? '' : 's'}`;
    }

    document.getElementById('btnEscolherDoBancoLP')?.addEventListener('click', abrirModalSelecionarBancoLP);
    document.getElementById('btnFecharModalSelecionarBancoLP')?.addEventListener('click', () => document.getElementById('modalSelecionarBancoLP').classList.remove('ativo'));
    document.getElementById('btnCancelarSelecionarBancoLP')?.addEventListener('click', () => document.getElementById('modalSelecionarBancoLP').classList.remove('ativo'));

    document.getElementById('inputBuscarSelecionarBancoLP')?.addEventListener('input', (e) => {
        const termo = e.target.value.trim().toLowerCase();
        if (!termo) { renderizarGridSelecionarBancoLP(bancoImagensCache); return; }
        const filtrado = bancoImagensCache.filter(item => {
            const alvo = [item.nome, item.sinonimos, ...(item.tags || [])].join(' ').toLowerCase();
            return alvo.includes(termo);
        });
        renderizarGridSelecionarBancoLP(filtrado);
    });

    document.getElementById('btnConfirmarSelecaoBancoLP')?.addEventListener('click', () => {
        if (idsSelecionadosBancoLP.size === 0) { toast('⚠️ Selecione ao menos uma imagem.'); return; }
        document.getElementById('modalSelecionarBancoLP').classList.remove('ativo');
        abrirModalRevisarSelecaoBancoLP();
    });

    function abrirModalRevisarSelecaoBancoLP() {
        const container = document.getElementById('listaRevisarSelecaoBancoLP');
        const itens = bancoImagensCache.filter(i => idsSelecionadosBancoLP.has(i.id));
        container.innerHTML = itens.map(item => {
            const precoVinculado = bancoPrecosCache.find(p => p.id === item.id);
            const valorInicial = precoVinculado
                ? (precoVinculado.preco_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '';
            return `
            <div class="lp-card-item" style="display:flex; flex-direction:row; align-items:center; gap:12px; padding:10px;" data-id="${item.id}">
                <img src="${item.imagemUrl}" alt="${escapeHTML(item.nome || '')}" style="width:56px; height:56px; border-radius:8px; object-fit:cover; flex-shrink:0;">
                <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                    <input type="text" class="campo-form-admin input-revisar-nome" value="${escapeHTML(item.nome || '').replace(/"/g, '&quot;')}" placeholder="Nome do item" style="margin:0;">
                    <input type="tel" class="campo-form-admin input-revisar-valor" value="${valorInicial}" placeholder="R$ 0,00 (opcional)" style="margin:0;">
                </div>
                <button type="button" class="btn-tabela btn-excluir-cliente btn-remover-revisao" title="Remover da leva" style="flex-shrink:0;">✕</button>
            </div>`;
        }).join('');

        container.querySelectorAll('.btn-remover-revisao').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('[data-id]');
                const id = card.dataset.id;
                idsSelecionadosBancoLP.delete(id);
                card.remove();
                if (idsSelecionadosBancoLP.size === 0) {
                    document.getElementById('modalRevisarSelecaoBancoLP').classList.remove('ativo');
                }
            });
        });

        document.getElementById('modalRevisarSelecaoBancoLP').classList.add('ativo');
    }

    document.getElementById('btnFecharModalRevisarSelecaoBancoLP')?.addEventListener('click', () => document.getElementById('modalRevisarSelecaoBancoLP').classList.remove('ativo'));
    document.getElementById('btnVoltarRevisarSelecaoBancoLP')?.addEventListener('click', () => {
        document.getElementById('modalRevisarSelecaoBancoLP').classList.remove('ativo');
        document.getElementById('modalSelecionarBancoLP').classList.add('ativo');
    });

    document.getElementById('btnSalvarRevisaoSelecaoBancoLP')?.addEventListener('click', async () => {
        if (!categoriaLPAberta) return;
        const linhas = Array.from(document.querySelectorAll('#listaRevisarSelecaoBancoLP [data-id]'));
        if (!linhas.length) { toast('⚠️ Nada pra salvar.'); return; }

        const btn = document.getElementById('btnSalvarRevisaoSelecaoBancoLP');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            for (const linha of linhas) {
                const id = linha.dataset.id;
                const itemBanco = bancoImagensCache.find(i => i.id === id);
                if (!itemBanco) continue;

                const nome = linha.querySelector('.input-revisar-nome').value.trim();
                if (!nome) continue; // pula silenciosamente itens sem nome

                const valorTexto = linha.querySelector('.input-revisar-valor').value.trim();
                let precoNumerico = 0;
                if (valorTexto) {
                    const v = parseFloat(valorTexto.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
                    if (!isNaN(v)) precoNumerico = v;
                }

                const dados = {
                    nome,
                    preco_centavos: Math.round(precoNumerico * 100).toString(),
                    imagem: itemBanco.imagemUrl,
                };
                const itemId = nome.replace(/[\/#\$\.\[\]]/g, "").trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                await setDoc(doc(db, "listas_prontas", categoriaLPAberta, "itens", itemId), dados);
            }
            toast(`✅ ${linhas.length} item(ns) adicionado(s) à lista!`);
            document.getElementById('modalRevisarSelecaoBancoLP').classList.remove('ativo');
            idsSelecionadosBancoLP = new Set();
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao salvar itens.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar todos';
        }
    });

    function abrirModalImagemBanco(id = null) {
        editandoImagemBancoId = id;
        urlImagemBancoSelecionada = '';
        const titulo = document.getElementById('modalImagemBancoTitulo');
        const inputNome = document.getElementById('inputImagemBancoNome');
        const inputSinonimos = document.getElementById('inputImagemBancoSinonimos');
        const inputCategoria = document.getElementById('inputImagemBancoCategoria');
        const inputValor = document.getElementById('inputImagemBancoValor');
        const preview = document.getElementById('imagemBancoPreview');
        const tagsPreview = document.getElementById('imagemBancoTagsPreview');
        document.getElementById('inputImagemBancoArquivo').value = '';

        if (id) {
            const item = bancoImagensCache.find(i => i.id === id);
            titulo.textContent = '✏️ Editar imagem';
            inputNome.value = item?.nome || '';
            inputSinonimos.value = item?.sinonimos || '';
            if (inputCategoria) inputCategoria.value = item?.categoria || '';
            urlImagemBancoSelecionada = item?.imagemUrl || '';
            if (urlImagemBancoSelecionada) { preview.src = urlImagemBancoSelecionada; preview.style.display = 'block'; }
            else { preview.style.display = 'none'; }
            tagsPreview.textContent = (item?.tags || []).map(t => '#' + t).join(' ');
            // ✅ NOVO: se já existe um valor de referência vinculado a essa
            // imagem (mesmo id, na coleção banco_precos), pré-preenche.
            const precoVinculado = bancoPrecosCache.find(p => p.id === id);
            if (inputValor) {
                inputValor.value = precoVinculado
                    ? (precoVinculado.preco_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '';
            }
        } else {
            titulo.textContent = '➕ Nova imagem';
            inputNome.value = '';
            inputSinonimos.value = '';
            if (inputCategoria) inputCategoria.value = '';
            if (inputValor) inputValor.value = '';
            preview.style.display = 'none';
            tagsPreview.textContent = '';
        }
        document.getElementById('modalImagemBanco').classList.add('ativo');
    }

    document.getElementById('btnNovaImagemBanco')?.addEventListener('click', () => abrirModalImagemBanco(null));
    document.getElementById('btnFecharModalImagemBanco')?.addEventListener('click', () => document.getElementById('modalImagemBanco').classList.remove('ativo'));
    document.getElementById('btnCancelarImagemBanco')?.addEventListener('click', () => document.getElementById('modalImagemBanco').classList.remove('ativo'));

    // Atualiza a prévia das tags em tempo real conforme o admin digita o
    // nome OU os sinônimos.
    function atualizarPreviewTagsBanco() {
        const nome = document.getElementById('inputImagemBancoNome')?.value || '';
        const sinonimos = document.getElementById('inputImagemBancoSinonimos')?.value || '';
        const tagsPreview = document.getElementById('imagemBancoTagsPreview');
        if (tagsPreview) tagsPreview.textContent = normalizarTags(nome, sinonimos).map(t => '#' + t).join(' ');
    }
    document.getElementById('inputImagemBancoNome')?.addEventListener('input', atualizarPreviewTagsBanco);
    document.getElementById('inputImagemBancoSinonimos')?.addEventListener('input', atualizarPreviewTagsBanco);

    document.getElementById('inputImagemBancoArquivo')?.addEventListener('change', async (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;
        const preview = document.getElementById('imagemBancoPreview');
        preview.style.display = 'block';
        preview.src = URL.createObjectURL(arquivo);

        // Imagens do banco são pra ficar bonitas em cards grandes — mantém
        // resolução um pouco maior que o padrão de 600x600 usado em outros uploads.
        const blob = await redimensionarImagem(arquivo, 900, 900, 0.88);
        const url = await fazerUploadImagemImgBB(blob);
        urlImagemBancoSelecionada = url;
        preview.src = url;
        toast('✅ Imagem enviada!');
    });

    document.getElementById('btnSalvarImagemBanco')?.addEventListener('click', async () => {
        const nome = document.getElementById('inputImagemBancoNome').value.trim();
        const sinonimos = document.getElementById('inputImagemBancoSinonimos')?.value.trim() || '';
        const categoria = document.getElementById('inputImagemBancoCategoria')?.value || '';
        // ✅ NOVO: valor de referência opcional — aproveita o mesmo cadastro
        // pra já alimentar o banco de preços, sem precisar abrir outro modal.
        const valorTexto = document.getElementById('inputImagemBancoValor')?.value.trim() || '';
        const valorNumerico = valorTexto ? parseFloat(valorTexto.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) : NaN;
        if (!nome) { toast('⚠️ Informe o nome do produto.'); return; }
        if (!urlImagemBancoSelecionada) { toast('⚠️ Selecione uma imagem.'); return; }
        if (valorTexto && (isNaN(valorNumerico) || valorNumerico <= 0)) { toast('⚠️ Valor de referência inválido.'); return; }

        const btn = document.getElementById('btnSalvarImagemBanco');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const tags = normalizarTags(nome, sinonimos);
            const dados = {
                nome,
                sinonimos,
                categoria,
                tags,
                imagemUrl: urlImagemBancoSelecionada,
                atualizado_em: serverTimestamp(),
            };
            let idImagem = editandoImagemBancoId;
            if (editandoImagemBancoId) {
                await setDoc(doc(db, "banco_imagens", editandoImagemBancoId), dados, { merge: true });
                toast('✅ Imagem atualizada!');
            } else {
                dados.criado_em = serverTimestamp();
                const ref = await addDoc(collection(db, "banco_imagens"), dados);
                idImagem = ref.id;
                toast('✅ Imagem adicionada ao banco!');
            }
            // ✅ NOVO: se um valor foi informado, salva/atualiza o preço de
            // referência vinculado (mesmo id da imagem, na coleção
            // banco_precos) — assim ele já entra na média sugerida no
            // cadastro do cliente. Se o campo ficar em branco, não toca
            // num preço já existente (evita apagar dado sem querer).
            if (valorTexto && idImagem) {
                await setDoc(doc(db, "banco_precos", idImagem), {
                    nome,
                    categoria,
                    tags,
                    preco_centavos: Math.round(valorNumerico * 100),
                    criado_em: serverTimestamp(),
                }, { merge: true });
            }
            document.getElementById('modalImagemBanco').classList.remove('ativo');
            // ✅ Atualiza a lista de "imagens de clientes" — a que acabou de
            // ser adicionada ao banco já some de lá na hora.
            escutarImagensClientes();
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao salvar imagem.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    });

    async function excluirImagemBanco(id) {
        if (!confirm('Excluir esta imagem do banco? Isso não afeta produtos que já usam essa imagem, só remove a sugestão futura.')) return;
        try {
            await deleteDoc(doc(db, "banco_imagens", id));
            toast('🗑 Imagem removida do banco.');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao excluir.');
        }
    }

    // ================================================================
    // TEMAS — papéis de parede prontos pro carrossel "Temas da lista"
    // (cadastro.html lê a coleção "temas" direto: campos url/nome/ordem)
    // ================================================================
    let temasCache = [];
    let editandoTemaId = null;
    let urlTemaSelecionada = '';

    function escutarTemas() {
        onSnapshot(collection(db, "temas"), snap => {
            temasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            temasCache.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
            renderizarGridTemas(temasCache);
        }, err => console.error("Erro ao carregar temas:", err));
    }

    function renderizarGridTemas(lista) {
        const grid = document.getElementById('temasGrid');
        if (!grid) return;
        if (!lista.length) { grid.innerHTML = '<div class="lp-vazio">Nenhum tema cadastrado ainda.</div>'; return; }
        grid.innerHTML = lista.map(item => `
            <div class="lp-card-item" data-item-id="${item.id}">
                <img src="${item.url}" alt="${escapeHTML(item.nome || '')}" loading="lazy">
                <div class="lp-card-item-corpo">
                    <div class="lp-card-item-nome">${escapeHTML(item.nome || '')}</div>
                    <div style="font-size:10px; color:var(--text3); margin:2px 0 8px;">Ordem: ${item.ordem ?? 0}</div>
                    <div class="lp-card-item-acoes">
                        <button class="btn-tabela btn-detalhe btn-editar-tema" data-id="${item.id}">✏️ Editar</button>
                        <button class="btn-tabela btn-excluir-cliente btn-excluir-tema" data-id="${item.id}">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
        grid.querySelectorAll('.btn-editar-tema').forEach(btn => {
            btn.addEventListener('click', () => abrirModalTema(btn.dataset.id));
        });
        grid.querySelectorAll('.btn-excluir-tema').forEach(btn => {
            btn.addEventListener('click', () => excluirTema(btn.dataset.id));
        });
    }

    function abrirModalTema(id) {
        editandoTemaId = id;
        urlTemaSelecionada = '';
        const titulo = document.getElementById('modalTemaTitulo');
        const preview = document.getElementById('temaPreview');
        const nome = document.getElementById('inputTemaNome');
        const ordem = document.getElementById('inputTemaOrdem');
        if (id) {
            const item = temasCache.find(t => t.id === id);
            if (!item) return;
            titulo.textContent = '✏️ Editar tema';
            nome.value = item.nome || '';
            ordem.value = item.ordem ?? 0;
            urlTemaSelecionada = item.url || '';
            preview.src = item.url || '';
            preview.style.display = item.url ? 'block' : 'none';
        } else {
            titulo.textContent = '➕ Novo tema';
            nome.value = '';
            ordem.value = temasCache.length;
            preview.style.display = 'none';
            preview.src = '';
        }
        document.getElementById('inputTemaArquivo').value = '';
        document.getElementById('modalTema').classList.add('ativo');
    }

    document.getElementById('btnNovoTema')?.addEventListener('click', () => abrirModalTema(null));
    document.getElementById('btnFecharModalTema')?.addEventListener('click', () => document.getElementById('modalTema').classList.remove('ativo'));
    document.getElementById('btnCancelarTema')?.addEventListener('click', () => document.getElementById('modalTema').classList.remove('ativo'));

    document.getElementById('inputTemaArquivo')?.addEventListener('change', async (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;
        const preview = document.getElementById('temaPreview');
        preview.style.display = 'block';
        preview.src = URL.createObjectURL(arquivo);

        // Papéis de parede aparecem em tela cheia — mantém proporção mais
        // larga (1200x800) que os 900x900 usados no banco de produtos.
        const blob = await redimensionarImagem(arquivo, 1200, 800, 0.88);
        // pasta:'temas' → a Cloud Function uploadImagem salva no R2 dentro
        // de uma subpasta separada, em vez de misturar com fotos de item.
        const url = await fazerUploadImagemImgBB(blob, 'temas');
        urlTemaSelecionada = url;
        preview.src = url;
        toast('✅ Imagem enviada!');
    });

    document.getElementById('btnSalvarTema')?.addEventListener('click', async () => {
        const nome = document.getElementById('inputTemaNome').value.trim();
        const ordemTexto = document.getElementById('inputTemaOrdem').value;
        const ordem = ordemTexto === '' ? 0 : parseInt(ordemTexto, 10);
        if (!nome) { toast('⚠️ Informe o nome do tema.'); return; }
        if (!urlTemaSelecionada) { toast('⚠️ Selecione uma imagem.'); return; }
        if (isNaN(ordem) || ordem < 0) { toast('⚠️ Ordem inválida.'); return; }

        const btn = document.getElementById('btnSalvarTema');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const dados = {
                nome,
                ordem,
                url: urlTemaSelecionada,
                atualizado_em: serverTimestamp(),
            };
            if (editandoTemaId) {
                await setDoc(doc(db, "temas", editandoTemaId), dados, { merge: true });
                toast('✅ Tema atualizado!');
            } else {
                dados.criado_em = serverTimestamp();
                await addDoc(collection(db, "temas"), dados);
                toast('✅ Tema adicionado!');
            }
            document.getElementById('modalTema').classList.remove('ativo');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao salvar tema.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    });

    async function excluirTema(id) {
        if (!confirm('Excluir este tema? Ele some do carrossel pros clientes, mas quem já usou continua com a imagem aplicada na lista.')) return;
        try {
            await deleteDoc(doc(db, "temas", id));
            toast('🗑 Tema removido.');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao excluir.');
        }
    }

    // ----------------------------------------------------------------
    // BUSCAS SEM SUGESTÃO — termos que clientes digitaram e não bateu
    // nada no banco. Ajuda a saber o que vale a pena cadastrar a seguir.
    // ----------------------------------------------------------------
    async function escutarBuscasSemResultado() {
        const el = document.getElementById('listaBuscasSemResultado');
        if (!el) return;
        try {
            const q = query(collection(db, "buscas_banco_imagens_sem_resultado"), orderBy("criado_em", "desc"), limit(200));
            const snap = await getDocs(q);
            if (snap.empty) { el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:16px;">Nenhuma busca sem resultado registrada ainda.</p>'; return; }

            // Agrupa por termo (várias pessoas podem buscar a mesma coisa) e
            // conta quantas vezes apareceu, pra mostrar o mais pedido primeiro.
            const porTermo = {};
            snap.forEach(d => {
                const dado = d.data();
                const chave = dado.termo_original || (dado.termos || []).join(' ');
                if (!chave) return;
                if (!porTermo[chave]) porTermo[chave] = { termo: chave, qtd: 0, ids: [] };
                porTermo[chave].qtd++;
                porTermo[chave].ids.push(d.id);
            });
            const ordenado = Object.values(porTermo).sort((a, b) => b.qtd - a.qtd).slice(0, 20);

            el.innerHTML = ordenado.map(item => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border1);">
                    <div style="font-size:13px;color:var(--text);">
                        "${escapeHTML(item.termo)}"
                        <span style="font-size:11px;color:var(--text3);margin-left:6px;">${item.qtd}× buscado</span>
                    </div>
                    <button class="btn-tabela btn-excluir-cliente" data-ids="${item.ids.join(',')}" style="font-size:11px;">🗑 Descartar</button>
                </div>
            `).join('');

            el.querySelectorAll('button[data-ids]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const ids = btn.dataset.ids.split(',');
                    try {
                        const lote = writeBatch(db);
                        ids.forEach(id => lote.delete(doc(db, "buscas_banco_imagens_sem_resultado", id)));
                        await lote.commit();
                        escutarBuscasSemResultado(); // recarrega a lista
                    } catch (e) {
                        console.error(e);
                        toast('❌ Erro ao descartar.');
                    }
                });
            });
        } catch (e) {
            console.error("Erro ao carregar buscas sem resultado:", e);
            el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:16px;">Erro ao carregar.</p>';
        }
    }

    // ----------------------------------------------------------------
    // IMAGENS ENVIADAS POR CLIENTES — reaproveitar fotos que já existem
    // em produtos cadastrados, sem precisar baixar e subir de novo.
    // ----------------------------------------------------------------
    const URL_PLACEHOLDER_PADRAO = 'https://i.ibb.co/YBZJdZ2N/icon-192.jpg';
    async function escutarImagensClientes() {
        const grid = document.getElementById('imagensClientesGrid');
        if (!grid) return;
        try {
            // Não dá pra saber de antemão quantos produtos existem, então
            // pega um lote razoável dos mais recentes e filtra no navegador.
            const [snapProdutos, snapIgnoradas] = await Promise.all([
                getDocs(query(collection(db, "presentes"), orderBy("titulo"), limit(300))),
                getDocs(collection(db, "imagens_clientes_ignoradas")),
            ]);

            const urlsJaNoBanco = new Set(bancoImagensCache.map(i => i.imagemUrl));
            // Guarda também o id do documento de "ignorada" pra poder desfazer.
            const urlsIgnoradas = new Map();
            snapIgnoradas.forEach(d => urlsIgnoradas.set(d.data().url, d.id));

            const vistos = new Map(); // dedupe por URL, guarda o primeiro nome associado

            snapProdutos.forEach(d => {
                const p = d.data();
                const url = p.imagem;
                if (!url || url === URL_PLACEHOLDER_PADRAO) return; // sem imagem própria
                if (urlsJaNoBanco.has(url)) return; // ✅ já foi vinculada ao banco — some da lista
                if (urlsIgnoradas.has(url)) return; // você já marcou como "não aproveitar"
                if (!vistos.has(url)) vistos.set(url, p.titulo || '');
            });

            const lista = Array.from(vistos.entries()).slice(0, 40);
            if (!lista.length) { grid.innerHTML = '<div class="lp-vazio">Nenhuma imagem nova de cliente pra reaproveitar no momento.</div>'; return; }

            grid.innerHTML = lista.map(([url, nome]) => `
                <div class="lp-card-item" data-url-cliente="${url}">
                    <img src="${url}" alt="${escapeHTML(nome)}" loading="lazy">
                    <div class="lp-card-item-corpo">
                        <div class="lp-card-item-nome">${escapeHTML(nome || '(sem nome)')}</div>
                        <div class="lp-card-item-acoes">
                            <button class="btn-tabela btn-marcar-pago btn-adicionar-imagem-cliente" data-url="${url}" data-nome="${escapeHTML(nome).replace(/"/g, '&quot;')}">➕ Adicionar ao banco</button>
                            <button class="btn-tabela btn-excluir-cliente btn-ignorar-imagem-cliente" data-url="${url}" title="Não usar essa imagem — some da lista, mas continua no produto do cliente normalmente">🚫 Ignorar</button>
                        </div>
                    </div>
                </div>
            `).join('');

            grid.querySelectorAll('.btn-adicionar-imagem-cliente').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Abre o modal já pré-preenchido, sem precisar fazer upload —
                    // a imagem já está hospedada, só falta confirmar/ajustar o nome.
                    abrirModalImagemBanco(null);
                    document.getElementById('inputImagemBancoNome').value = btn.dataset.nome || '';
                    urlImagemBancoSelecionada = btn.dataset.url;
                    const preview = document.getElementById('imagemBancoPreview');
                    preview.src = urlImagemBancoSelecionada;
                    preview.style.display = 'block';
                    atualizarPreviewTagsBanco();
                });
            });

            grid.querySelectorAll('.btn-ignorar-imagem-cliente').forEach(btn => {
                btn.addEventListener('click', async () => {
                    // ✅ NOVO: "Ignorar" só tira da lista de sugestão do admin —
                    // NUNCA mexe no ImgBB nem no produto do cliente, que
                    // continua com a imagem dele normalmente.
                    try {
                        await addDoc(collection(db, "imagens_clientes_ignoradas"), {
                            url: btn.dataset.url,
                            ignorado_em: serverTimestamp(),
                        });
                        const card = grid.querySelector(`[data-url-cliente="${CSS.escape(btn.dataset.url)}"]`);
                        card?.remove();
                        if (!grid.querySelector('.lp-card-item')) {
                            grid.innerHTML = '<div class="lp-vazio">Nenhuma imagem nova de cliente pra reaproveitar no momento.</div>';
                        }
                    } catch (e) {
                        console.error(e);
                        toast('❌ Erro ao ignorar imagem.');
                    }
                });
            });
        } catch (e) {
            console.error("Erro ao carregar imagens de clientes:", e);
            grid.innerHTML = '<div class="lp-vazio">Erro ao carregar.</div>';
        }
    }

    // ----------------------------------------------------------------
    // PREÇOS ENVIADOS POR CLIENTES — mesma ideia da seção de imagens:
    // reaproveitar o valor que o cliente já digitou no item dele, sem
    // precisar redigitar um por um. Agrupa por "assinatura" de tags
    // (mesma regra "todas as palavras batem" usada na sugestão de preço)
    // pra não sugerir de novo algo que já está no banco.
    // ----------------------------------------------------------------
    function assinaturaTags(tags) {
        return [...tags].sort().join(' ');
    }

    async function escutarPrecosClientes() {
        const grid = document.getElementById('precosClientesGrid');
        if (!grid) return;
        try {
            const [snapProdutos, snapIgnorados] = await Promise.all([
                getDocs(query(collection(db, "presentes"), orderBy("titulo"), limit(300))),
                getDocs(collection(db, "precos_clientes_ignorados")),
            ]);

            const assinaturasJaNoBanco = new Set(bancoPrecosCache.map(i => assinaturaTags(i.tags || [])));
            const assinaturasIgnoradas = new Set(snapIgnorados.docs.map(d => d.data().assinatura));

            const vistos = new Map(); // assinatura -> { nome, precoCentavos }

            snapProdutos.forEach(d => {
                const p = d.data();
                const nome = (p.titulo || '').trim();
                const precoCentavos = parseInt(p.preco_original_centavos, 10);
                if (!nome || !precoCentavos || precoCentavos <= 0) return;
                const tags = normalizarTags(nome);
                if (!tags.length) return;
                const assinatura = assinaturaTags(tags);
                if (assinaturasJaNoBanco.has(assinatura)) return; // já tem preço pra isso no banco
                if (assinaturasIgnoradas.has(assinatura)) return; // você já marcou como "não aproveitar"
                if (!vistos.has(assinatura)) vistos.set(assinatura, { nome, precoCentavos });
            });

            const lista = Array.from(vistos.entries()).slice(0, 40);
            if (!lista.length) { grid.innerHTML = '<div class="lp-vazio">Nenhum preço novo de cliente pra reaproveitar no momento.</div>'; return; }

            grid.innerHTML = lista.map(([assinatura, dado]) => {
                const valorFmt = (dado.precoCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border1);flex-wrap:wrap;" data-assinatura-preco="${escapeHTML(assinatura)}">
                        <div style="font-size:13px;color:var(--text);">
                            ${escapeHTML(dado.nome)}
                            <span style="font-size:12px;color:#a3e635;margin-left:8px;font-weight:600;">${valorFmt}</span>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button class="btn-tabela btn-marcar-pago btn-aprovar-preco-cliente" data-assinatura="${escapeHTML(assinatura)}" data-nome="${escapeHTML(dado.nome).replace(/"/g, '&quot;')}" data-preco="${dado.precoCentavos}" style="font-size:11px;">✅ Adicionar ao banco</button>
                            <button class="btn-tabela btn-excluir-cliente btn-ignorar-preco-cliente" data-assinatura="${escapeHTML(assinatura)}" style="font-size:11px;">🚫 Ignorar</button>
                        </div>
                    </div>
                `;
            }).join('');

            const removerCard = (assinatura) => {
                const card = grid.querySelector(`[data-assinatura-preco="${CSS.escape(assinatura)}"]`);
                card?.remove();
                if (!grid.querySelector('[data-assinatura-preco]')) {
                    grid.innerHTML = '<div class="lp-vazio">Nenhum preço novo de cliente pra reaproveitar no momento.</div>';
                }
            };

            grid.querySelectorAll('.btn-aprovar-preco-cliente').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await addDoc(collection(db, "banco_precos"), {
                            nome: btn.dataset.nome,
                            categoria: '',
                            tags: normalizarTags(btn.dataset.nome),
                            preco_centavos: parseInt(btn.dataset.preco, 10) || 0,
                            criado_em: serverTimestamp(),
                        });
                        toast('✅ Preço adicionado ao banco!');
                        removerCard(btn.dataset.assinatura);
                    } catch (e) {
                        console.error(e);
                        toast('❌ Erro ao adicionar preço.');
                    }
                });
            });

            grid.querySelectorAll('.btn-ignorar-preco-cliente').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await addDoc(collection(db, "precos_clientes_ignorados"), {
                            assinatura: btn.dataset.assinatura,
                            ignorado_em: serverTimestamp(),
                        });
                        removerCard(btn.dataset.assinatura);
                    } catch (e) {
                        console.error(e);
                        toast('❌ Erro ao ignorar.');
                    }
                });
            });
        } catch (e) {
            console.error("Erro ao carregar preços de clientes:", e);
            grid.innerHTML = '<div class="lp-vazio">Erro ao carregar.</div>';
        }
    }

    // Busca local simples (o grid já vem inteiro via onSnapshot — coleção
    // pequena o suficiente pra filtrar no navegador sem precisar de índice)
    document.getElementById('inputBuscarBancoImagens')?.addEventListener('input', (e) => {
        const termo = e.target.value.trim().toLowerCase();
        if (!termo) { renderizarGridBancoImagens(bancoImagensCache); return; }
        const termos = normalizarTags(termo);
        const filtrado = bancoImagensCache.filter(item => {
            const nomeMatch = (item.nome || '').toLowerCase().includes(termo);
            const tagMatch = termos.some(t => (item.tags || []).includes(t));
            return nomeMatch || tagMatch;
        });
        renderizarGridBancoImagens(filtrado);
    });

    document.getElementById('btnAdicionarPrecoManual')?.addEventListener('click', async () => {
        const inputNome = document.getElementById('inputPrecoManualNome');
        const inputValor = document.getElementById('inputPrecoManualValor');
        const inputCategoria = document.getElementById('inputPrecoManualCategoria');
        const nome = inputNome.value.trim();
        const categoria = inputCategoria?.value || '';
        const valorNumerico = parseFloat((inputValor.value || '').replace('R$', '').replace(/\./g, '').replace(',', '.').trim());

        if (!nome) { toast('⚠️ Informe o nome do produto.'); return; }
        if (isNaN(valorNumerico) || valorNumerico <= 0) { toast('⚠️ Valor inválido.'); return; }

        try {
            await addDoc(collection(db, "banco_precos"), {
                nome,
                categoria,
                tags: normalizarTags(nome),
                preco_centavos: Math.round(valorNumerico * 100),
                criado_em: serverTimestamp(),
            });
            toast('✅ Preço de referência adicionado!');
            inputNome.value = '';
            inputValor.value = '';
            if (inputCategoria) inputCategoria.value = '';
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao adicionar preço.');
        }
    });

    // ----------------------------------------------------------------
    // BANCO DE PREÇOS OFICIAL — tabela com todos os preços aprovados,
    // com indicação de validade (preços antigos saem da média sozinhos),
    // exportação e importação em massa via planilha.
    // ----------------------------------------------------------------
    // Depois desse tanto de dias, um preço é considerado "vencido": ainda
    // fica visível na tabela pra você atualizar, mas para de contar na
    // média sugerida no cadastro (ver mesma constante em cadastro.html).
    const VALIDADE_PRECO_DIAS = 90;

    let bancoPrecosCache = [];
    function escutarBancoPrecos() {
        onSnapshot(collection(db, "banco_precos"), snap => {
            bancoPrecosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderizarTabelaBancoPrecos(bancoPrecosCache);
        }, err => console.error("Erro ao carregar banco de preços:", err));
    }

    function diasDesde(timestampFirestore) {
        if (!timestampFirestore?.toMillis) return null;
        return Math.floor((Date.now() - timestampFirestore.toMillis()) / (1000 * 60 * 60 * 24));
    }

    function renderizarTabelaBancoPrecos(lista) {
        const el = document.getElementById('bancoPrecosTabela');
        const btnApagarSelecionados = document.getElementById('btnApagarSelecionadosBancoPrecos');
        if (!el) return;
        if (!lista.length) {
            el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:16px;">Nenhum preço cadastrado ainda.</p>';
            if (btnApagarSelecionados) { btnApagarSelecionados.disabled = true; btnApagarSelecionados.textContent = '🗑️ Apagar selecionados (0)'; }
            return;
        }

        const atualizarBotaoSelecionados = () => {
            const qtd = el.querySelectorAll('.chk-preco-banco:checked').length;
            if (btnApagarSelecionados) {
                btnApagarSelecionados.disabled = qtd === 0;
                btnApagarSelecionados.textContent = `🗑️ Apagar selecionados (${qtd})`;
            }
        };

        const ordenado = [...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        el.innerHTML = ordenado.map(item => {
            const dias = diasDesde(item.criado_em);
            const vencido = dias !== null && dias > VALIDADE_PRECO_DIAS;
            const valorFmt = ((item.preco_centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const idadeTxt = dias === null ? '—' : dias === 0 ? 'hoje' : `${dias}d atrás`;
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;border-bottom:1px solid var(--border1);">
                    <input type="checkbox" class="chk-preco-banco" data-id="${item.id}" data-nome="${escapeHTML(item.nome || '').replace(/"/g, '&quot;')}" style="width:16px;height:16px;flex-shrink:0;">
                    <div style="font-size:13px;color:var(--text);flex:1;">${escapeHTML(item.nome || '')}</div>
                    <div style="font-size:13px;color:var(--text);font-weight:600;width:90px;text-align:right;">${valorFmt}</div>
                    <div style="font-size:11px;width:110px;text-align:right;color:${vencido ? '#f87171' : 'var(--text3)'};">
                        ${vencido ? '🔴 vencido · ' : '🟢 '}${idadeTxt}
                    </div>
                    <button class="btn-tabela btn-excluir-cliente btn-excluir-preco-banco" data-id="${item.id}" data-nome="${escapeHTML(item.nome || '').replace(/"/g, '&quot;')}" style="font-size:11px; margin-left:8px;">🗑️</button>
                </div>
            `;
        }).join('');

        el.querySelectorAll('.chk-preco-banco').forEach(chk => {
            chk.addEventListener('change', atualizarBotaoSelecionados);
        });
        atualizarBotaoSelecionados();

        el.querySelectorAll('.btn-excluir-preco-banco').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Excluir o preço de "${btn.dataset.nome}" do banco? Isso não afeta itens que já usam esse valor, só some da média futura.`)) return;
                try {
                    await deleteDoc(doc(db, "banco_precos", btn.dataset.id));
                    toast('✅ Preço excluído do banco.');
                } catch (e) {
                    console.error(e);
                    toast('❌ Erro ao excluir preço.');
                }
            });
        });
    }

    // ✅ NOVO: apaga só as entradas marcadas com checkbox — não afeta o
    // preço já salvo em cada item do cliente, só zera a sugestão futura
    // daquelas entradas específicas.
    document.getElementById('btnApagarSelecionadosBancoPrecos')?.addEventListener('click', async () => {
        const el = document.getElementById('bancoPrecosTabela');
        const marcados = Array.from(el?.querySelectorAll('.chk-preco-banco:checked') || []);
        if (!marcados.length) return;
        const nomes = marcados.map(c => c.dataset.nome).join(', ');
        if (!confirm(`Excluir ${marcados.length} preço(s) selecionado(s) do banco (${nomes})? Isso não afeta itens que já usam esses valores. Não pode ser desfeito.`)) return;

        try {
            const ids = marcados.map(c => c.dataset.id);
            for (let i = 0; i < ids.length; i += 450) {
                const lote = writeBatch(db);
                ids.slice(i, i + 450).forEach(id => lote.delete(doc(db, "banco_precos", id)));
                await lote.commit();
            }
            toast(`✅ ${ids.length} preço(s) excluído(s).`);
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao excluir selecionados.');
        }
    });

    document.getElementById('btnExportarPlanilhaPrecos')?.addEventListener('click', () => {
        const dados = [['nome', 'preco', 'cadastrado_em']].concat(
            bancoPrecosCache.map(item => [
                item.nome || '',
                ((item.preco_centavos || 0) / 100).toFixed(2).replace('.', ','),
                item.criado_em?.toDate ? item.criado_em.toDate().toLocaleDateString('pt-BR') : '',
            ])
        );
        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 16 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Precos');
        XLSX.writeFile(wb, `banco-de-precos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    });

    document.getElementById('inputImportarPlanilhaPrecos')?.addEventListener('change', (e) => {
        const arquivo = e.target.files[0];
        const status = document.getElementById('importarPrecosStatus');
        if (!arquivo) return;
        status.textContent = 'Lendo planilha...';

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                // Pula o cabeçalho (linha 0) — reconhece tanto a planilha
                // exportada por aqui quanto uma simples "nome, preço" manual.
                const dados = linhas.slice(1)
                    .filter(l => l.some(c => String(c).trim() !== ''))
                    .map(l => ({
                        nome: String(l[0] || '').trim(),
                        valor: parsePrecoExcel(l[1]),
                    }))
                    .filter(l => l.nome && !isNaN(l.valor) && l.valor > 0);

                if (!dados.length) { status.textContent = '⚠️ Nenhuma linha válida encontrada.'; return; }

                status.textContent = `Importando ${dados.length} preços...`;

                // Casa pelo nome normalizado (mesma comparação usada nas tags) —
                // se já existe, ATUALIZA o valor e RENOVA a validade (a
                // planilha é justamente o "preço atualizado" que você pediu);
                // se não existe, CRIA um item novo.
                const porNomeNormalizado = new Map(
                    bancoPrecosCache.map(item => [normalizarTags(item.nome).join(' '), item.id])
                );

                let atualizados = 0, criados = 0;
                for (const linha of dados) {
                    const chave = normalizarTags(linha.nome).join(' ');
                    const idExistente = porNomeNormalizado.get(chave);
                    const dadosPreco = {
                        nome: linha.nome,
                        tags: normalizarTags(linha.nome),
                        preco_centavos: Math.round(linha.valor * 100),
                        criado_em: serverTimestamp(), // renova a validade a cada atualização
                    };
                    if (idExistente) {
                        await setDoc(doc(db, "banco_precos", idExistente), dadosPreco, { merge: true });
                        atualizados++;
                    } else {
                        await addDoc(collection(db, "banco_precos"), dadosPreco);
                        criados++;
                    }
                }

                status.textContent = `✅ ${atualizados} atualizado(s), ${criados} novo(s).`;
                toast('✅ Planilha de preços importada!');
                e.target.value = '';
            } catch (err) {
                console.error(err);
                status.textContent = '❌ Erro ao importar a planilha.';
            }
        };
        reader.readAsArrayBuffer(arquivo);
    });

    // ----------------------------------------------------------------
    // SUGESTÕES DE PREÇO — preços que clientes digitaram ao cadastrar
    // produtos. Só entram na média oficial (banco_precos) depois que
    // você aprova aqui — mesmo controle de qualidade das imagens.
    // ----------------------------------------------------------------
    async function escutarSugestoesPreco() {
        const el = document.getElementById('sugestoesPrecoGrid');
        if (!el) return;
        try {
            const q = query(collection(db, "sugestoes_precos_clientes"), orderBy("criado_em", "desc"), limit(100));
            const snap = await getDocs(q);
            if (snap.empty) { el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:16px;">Nenhuma sugestão de preço pendente.</p>'; return; }

            el.innerHTML = snap.docs.map(d => {
                const dado = d.data();
                const valorFmt = ((dado.preco_centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const opcoesCategoria = categoriasGlobaisCache.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border1);flex-wrap:wrap;">
                        <div style="font-size:13px;color:var(--text);">
                            ${escapeHTML(dado.nome || '(sem nome)')}
                            <span style="font-size:12px;color:#a3e635;margin-left:8px;font-weight:600;">${valorFmt}</span>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <select class="select-categoria-sugestao-preco campo-form-admin" style="width:140px; margin:0; font-size:11px; padding:6px 10px;">
                                <option value="">Sem categoria</option>
                                ${opcoesCategoria}
                            </select>
                            <button class="btn-tabela btn-marcar-pago btn-aprovar-preco" data-id="${d.id}" data-nome="${escapeHTML(dado.nome || '').replace(/"/g, '&quot;')}" data-preco="${dado.preco_centavos || 0}" style="font-size:11px;">✅ Aprovar</button>
                            <button class="btn-tabela btn-excluir-cliente btn-ignorar-preco" data-id="${d.id}" style="font-size:11px;">🚫 Ignorar</button>
                        </div>
                    </div>
                `;
            }).join('');

            el.querySelectorAll('.btn-aprovar-preco').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        const selectCategoria = btn.parentElement?.querySelector('.select-categoria-sugestao-preco');
                        // Mesma normalização de tags usada nas imagens — assim a
                        // busca por "todas as palavras batem" funciona igual dos
                        // dois lados (imagem e preço).
                        await addDoc(collection(db, "banco_precos"), {
                            nome: btn.dataset.nome,
                            categoria: selectCategoria?.value || '',
                            tags: normalizarTags(btn.dataset.nome),
                            preco_centavos: parseInt(btn.dataset.preco, 10) || 0,
                            criado_em: serverTimestamp(),
                        });
                        await deleteDoc(doc(db, "sugestoes_precos_clientes", btn.dataset.id));
                        toast('✅ Preço aprovado e adicionado ao banco!');
                        escutarSugestoesPreco();
                    } catch (e) {
                        console.error(e);
                        toast('❌ Erro ao aprovar preço.');
                    }
                });
            });

            el.querySelectorAll('.btn-ignorar-preco').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await deleteDoc(doc(db, "sugestoes_precos_clientes", btn.dataset.id));
                        escutarSugestoesPreco();
                    } catch (e) {
                        console.error(e);
                        toast('❌ Erro ao ignorar.');
                    }
                });
            });
        } catch (e) {
            console.error("Erro ao carregar sugestões de preço:", e);
            el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:16px;">Erro ao carregar.</p>';
        }
    }

    // ✅ NOVO: comportamento genérico de abrir/fechar os painéis retráteis
    // do Banco de Imagens — todos começam fechados.
    document.querySelectorAll('.painel-colapsavel-header').forEach(header => {
        header.addEventListener('click', () => {
            const corpo = document.getElementById(header.dataset.alvo);
            if (!corpo) return;
            const abrindo = corpo.style.display === 'none';
            corpo.style.display = abrindo ? 'block' : 'none';
            header.classList.toggle('aberto', abrindo);
        });
    });

    document.querySelector('[data-secao="banco-imagens"]')?.addEventListener('click', () => {
        escutarBancoImagens();
        escutarBuscasSemResultado();
        escutarImagensClientes();
        escutarSugestoesPreco();
        escutarBancoPrecos();
        escutarPrecosClientes();
    });

    let temasJaCarregados = false;
    document.querySelector('[data-secao="temas"]')?.addEventListener('click', () => {
        if (temasJaCarregados) return;
        temasJaCarregados = true;
        escutarTemas();
    });

    // ================================================================
    // TOAST
    // ================================================================
    function toast(msg) {
        const el = document.getElementById('toastAdmin');
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2800);
    }

    // ================================================================
    // FORMATAR
    // ================================================================
    function brl(centavos) {
        return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function tsToDate(ts) {
        if (!ts) return null;
        if (ts.seconds) return new Date(ts.seconds * 1000);
        if (typeof ts.toDate === 'function') return ts.toDate();
        return new Date(ts);
    }

    function fmtDate(ts) {
        const d = tsToDate(ts);
        if (!d || isNaN(d)) return '—';
        return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }

    // ================================================================
    // AUTH
    // ================================================================
    document.getElementById('btnEntrar').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value.trim();
        const senha = document.getElementById('loginSenha').value;
        const erroEl = document.getElementById('loginErro');
        const btn = document.getElementById('btnEntrar');

        erroEl.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Entrando...';

        try {
            await signInWithEmailAndPassword(auth, email, senha);
        } catch (e) {
            erroEl.textContent = 'E-mail ou senha incorretos.';
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    });

    document.getElementById('loginSenha').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btnEntrar').click();
    });

    document.getElementById('btnSairAdmin').addEventListener('click', async () => {
        await signOut(auth);
    });

    onAuthStateChanged(auth, async (user) => {
        if (user && user.email === ADMIN_EMAIL) {
            document.getElementById('tela-login').style.display = 'none';
            document.getElementById('painel').style.display = 'block';
            await carregarTaxaGlobal();
            await carregarValorMinimoSaque();
            iniciarPainel();
        } else if (user && user.email !== ADMIN_EMAIL) {
            await signOut(auth);
            document.getElementById('loginErro').textContent = 'Acesso restrito ao administrador.';
        } else {
            document.getElementById('tela-login').style.display = 'flex';
            document.getElementById('painel').style.display = 'none';
        }
    });

    // ================================================================
    // NAVEGAÇÃO
    // ================================================================
    const titulos = {
        'visao-geral':    ['Visão Geral', 'Dados em tempo real'],
        'clientes':       ['Clientes', 'Todos os usuários cadastrados'],
        'saques':         ['Solicitações de Saque', 'Gerencie os repasses'],
        'relatorio':      ['Relatório de Presentes', 'Histórico completo com dados de taxa'],
        'listas-prontas': ['Listas Prontas', 'Categorias e itens sugeridos para os clientes'],
        'banco-imagens':  ['Banco de Imagens', 'Fotos profissionais para sugestão automática no cadastro dos clientes'],
        'temas':          ['Temas', 'Papéis de parede prontos para o carrossel "Temas da lista"'],
        'comunicados':    ['Comunicados', 'Avisos globais para todos os clientes'],
        'configuracoes':  ['Configurações', 'Parâmetros globais da plataforma']
    };

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('ativo'));
            document.querySelectorAll('.secao').forEach(s => s.classList.remove('ativa'));
            btn.classList.add('ativo');
            const secao = btn.dataset.secao;
            document.getElementById('secao-' + secao).classList.add('ativa');
            const [titulo, sub] = titulos[secao];
            document.getElementById('tituloPagina').textContent = titulo;
            document.getElementById('subtituloPagina').textContent = sub;
        });
    });

    // ================================================================
    // CARREGAR TAXA GLOBAL
    // ================================================================
    async function carregarTaxaGlobal() {
        try {
            const snap = await getDoc(doc(db, "admin_config", "global"));
            if (snap.exists() && snap.data().taxa_percentual) {
                taxaGlobal = parseFloat(snap.data().taxa_percentual);
                document.getElementById('inputTaxaGlobal').value = taxaGlobal;
                document.getElementById('taxaAtualLabel').textContent = taxaGlobal.toFixed(1).replace('.', ',');
            }
        } catch(e) { console.error(e); }
    }

    document.getElementById('btnSalvarTaxaGlobal').addEventListener('click', async () => {
        const val = parseFloat(document.getElementById('inputTaxaGlobal').value);
        if (isNaN(val) || val < 0 || val > 100) { toast('⚠️ Taxa inválida.'); return; }
        try {
            await setDoc(doc(db, "admin_config", "global"), { taxa_percentual: val }, { merge: true });
            taxaGlobal = val;
            document.getElementById('taxaAtualLabel').textContent = val.toFixed(1).replace('.', ',');
            toast('✅ Taxa atualizada para ' + val.toFixed(1) + '%');
        } catch(e) { toast('❌ Erro ao salvar taxa.'); }
    });

    // ================================================================
    // LISTAS PRONTAS
    // Estrutura no Firestore:
    //   listas_prontas/{categoriaId}                -> { nome, icone }
    //   listas_prontas/{categoriaId}/itens/{itemId}  -> { nome, preco_centavos, imagem }
    // ================================================================
    let todasCategoriasLP = [];          // [{ id, nome, icone }]
    let itensPorCategoriaLP = {};        // categoriaId -> [{ id, nome, preco_centavos, imagem }]
    let unsubscribesItensLP = {};        // categoriaId -> unsubscribe fn
    let categoriaLPAberta = null;        // categoriaId atualmente visualizada
    let editandoCategoriaLPId = null;
    let editandoItemLPId = null;
    let imagemItemLPSelecionada = '';    // url já enviada ao imgbb (edição/criação de item)

    function escutarListasProntas() {
        onSnapshot(collection(db, "listas_prontas"), (snap) => {
            todasCategoriasLP = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Garante um listener de itens por categoria
            todasCategoriasLP.forEach(cat => {
                if (!unsubscribesItensLP[cat.id]) {
                    unsubscribesItensLP[cat.id] = onSnapshot(
                        collection(db, "listas_prontas", cat.id, "itens"),
                        (itensSnap) => {
                            itensPorCategoriaLP[cat.id] = itensSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                            renderizarGridCategoriasLP();
                            if (categoriaLPAberta === cat.id) renderizarGridItensLP(cat.id);
                        }
                    );
                }
            });

            renderizarGridCategoriasLP();
        });
    }

    function renderizarGridCategoriasLP() {
        const grid = document.getElementById('lpGridCategorias');
        if (!grid) return;

        if (todasCategoriasLP.length === 0) {
            grid.innerHTML = '<div class="lp-vazio">Nenhuma categoria criada ainda. Clique em "Nova categoria" para começar.</div>';
            return;
        }

        grid.innerHTML = todasCategoriasLP.map(cat => {
            const qtd = (itensPorCategoriaLP[cat.id] || []).length;
            return `
                <div class="lp-card-categoria" data-cat-id="${cat.id}">
                    <div class="lp-card-categoria-acoes">
                        <button class="lp-mini-btn editar" data-cat-id="${cat.id}" title="Editar">✏️</button>
                        <button class="lp-mini-btn excluir" data-cat-id="${cat.id}" title="Excluir">🗑️</button>
                    </div>
                    ${cat.icone ? `<div class="lp-card-categoria-icone">${cat.icone}</div>` : ''}
                    <div class="lp-card-categoria-nome">${cat.nome}</div>
                    <div class="lp-card-categoria-qtd">${qtd} item${qtd === 1 ? '' : 's'}</div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.lp-card-categoria').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.lp-mini-btn')) return;
                abrirVisaoItensLP(card.dataset.catId);
            });
        });
        grid.querySelectorAll('.lp-mini-btn.editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirModalCategoriaLP(btn.dataset.catId);
            });
        });
        grid.querySelectorAll('.lp-mini-btn.excluir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                excluirCategoriaLP(btn.dataset.catId);
            });
        });
    }

    function abrirVisaoItensLP(catId) {
        categoriaLPAberta = catId;
        const cat = todasCategoriasLP.find(c => c.id === catId);
        if (!cat) return;
        document.getElementById('lpVisaoCategorias').style.display = 'none';
        document.getElementById('lpVisaoItens').style.display = 'block';
        document.getElementById('lpItensCategoriaNome').textContent = cat.icone ? `${cat.icone} ${cat.nome}` : cat.nome;
        renderizarGridItensLP(catId);
    }

    document.getElementById('btnVoltarCategoriasLP').addEventListener('click', () => {
        categoriaLPAberta = null;
        document.getElementById('lpVisaoItens').style.display = 'none';
        document.getElementById('lpVisaoCategorias').style.display = 'block';
    });

    function renderizarGridItensLP(catId) {
        const grid = document.getElementById('lpGridItens');
        if (!grid) return;
        const itens = itensPorCategoriaLP[catId] || [];

        if (itens.length === 0) {
            grid.innerHTML = '<div class="lp-vazio">Nenhum item nesta categoria ainda. Clique em "Novo item" para adicionar.</div>';
            return;
        }

        grid.innerHTML = itens.map(item => {
            const precoFmt = brl(parseInt(item.preco_centavos || 0));
            const img = item.imagem || 'https://i.ibb.co/0jjSyNRG/logo.png';
            return `
                <div class="lp-card-item" data-item-id="${item.id}">
                    <img src="${img}" alt="${item.nome}" loading="lazy">
                    <div class="lp-card-item-corpo">
                        <div class="lp-card-item-nome">${item.nome}</div>
                        <div class="lp-card-item-preco">${precoFmt}</div>
                        <div class="lp-card-item-acoes">
                            <button class="btn-tabela btn-detalhe btn-editar-item-lp" data-item-id="${item.id}">✏️ Editar</button>
                            <button class="btn-tabela btn-excluir-cliente btn-excluir-item-lp" data-item-id="${item.id}">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.btn-editar-item-lp').forEach(btn => {
            btn.addEventListener('click', () => abrirModalItemLP(catId, btn.dataset.itemId));
        });
        grid.querySelectorAll('.btn-excluir-item-lp').forEach(btn => {
            btn.addEventListener('click', () => excluirItemLP(catId, btn.dataset.itemId));
        });
    }

    // ----------------------------------------------------------------
    // MODAL CATEGORIA
    // ----------------------------------------------------------------
    function abrirModalCategoriaLP(catId = null) {
        editandoCategoriaLPId = catId;
        const titulo = document.getElementById('modalCategoriaLPTitulo');
        const inputNome = document.getElementById('inputCategoriaLPNome');
        const inputIcone = document.getElementById('inputCategoriaLPIcone');

        if (catId) {
            const cat = todasCategoriasLP.find(c => c.id === catId);
            titulo.textContent = '✏️ Editar categoria';
            inputNome.value = cat?.nome || '';
            inputIcone.value = cat?.icone || '';
        } else {
            titulo.textContent = '➕ Nova categoria';
            inputNome.value = '';
            inputIcone.value = '';
        }
        document.getElementById('modalCategoriaLP').classList.add('ativo');
    }

    document.getElementById('btnNovaCategoriaLP').addEventListener('click', () => abrirModalCategoriaLP(null));
    document.getElementById('btnFecharModalCategoriaLP').addEventListener('click', () => document.getElementById('modalCategoriaLP').classList.remove('ativo'));
    document.getElementById('btnCancelarCategoriaLP').addEventListener('click', () => document.getElementById('modalCategoriaLP').classList.remove('ativo'));

    document.getElementById('btnSalvarCategoriaLP').addEventListener('click', async () => {
        const nome = document.getElementById('inputCategoriaLPNome').value.trim();
        const icone = document.getElementById('inputCategoriaLPIcone').value.trim();
        if (!nome) { toast('⚠️ Informe o nome da categoria.'); return; }

        const btn = document.getElementById('btnSalvarCategoriaLP');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const catId = editandoCategoriaLPId || nome.replace(/[\/#\$\.\[\]]/g, "").trim().toLowerCase().replace(/\s+/g, '-');
            await setDoc(doc(db, "listas_prontas", catId), { nome, icone }, { merge: true });
            toast(editandoCategoriaLPId ? '✅ Categoria atualizada!' : '✅ Categoria criada!');
            document.getElementById('modalCategoriaLP').classList.remove('ativo');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao salvar categoria.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    });

    async function excluirCategoriaLP(catId) {
        const cat = todasCategoriasLP.find(c => c.id === catId);
        const itens = itensPorCategoriaLP[catId] || [];
        if (!confirm(`Excluir a categoria "${cat?.nome}" e seus ${itens.length} item(ns)? Esta ação não pode ser desfeita.`)) return;

        try {
            const batch = writeBatch(db);
            itens.forEach(item => batch.delete(doc(db, "listas_prontas", catId, "itens", item.id)));
            batch.delete(doc(db, "listas_prontas", catId));
            await batch.commit();
            if (categoriaLPAberta === catId) document.getElementById('btnVoltarCategoriasLP').click();
            toast('🗑️ Categoria excluída.');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao excluir categoria.');
        }
    }

    // ----------------------------------------------------------------
    // MODAL ITEM
    // ----------------------------------------------------------------
    function abrirModalItemLP(catId, itemId = null) {
        categoriaLPAberta = catId;
        editandoItemLPId = itemId;
        imagemItemLPSelecionada = '';

        const titulo = document.getElementById('modalItemLPTitulo');
        const inputNome = document.getElementById('inputItemLPNome');
        const inputPreco = document.getElementById('inputItemLPPreco');
        const preview = document.getElementById('lpItemPreviewImagem');
        document.getElementById('inputItemLPImagem').value = '';

        if (itemId) {
            const item = (itensPorCategoriaLP[catId] || []).find(i => i.id === itemId);
            titulo.textContent = '✏️ Editar item';
            inputNome.value = item?.nome || '';
            inputPreco.value = item ? brl(parseInt(item.preco_centavos || 0)) : '';
            imagemItemLPSelecionada = item?.imagem || '';
            if (imagemItemLPSelecionada) { preview.src = imagemItemLPSelecionada; preview.style.display = 'block'; }
            else { preview.style.display = 'none'; }
        } else {
            titulo.textContent = '➕ Novo item';
            inputNome.value = '';
            inputPreco.value = '';
            preview.style.display = 'none';
        }
        document.getElementById('modalItemLP').classList.add('ativo');
    }

    document.getElementById('btnFecharModalItemLP').addEventListener('click', () => document.getElementById('modalItemLP').classList.remove('ativo'));
    document.getElementById('btnCancelarItemLP').addEventListener('click', () => document.getElementById('modalItemLP').classList.remove('ativo'));

    document.getElementById('btnNovoItemLP').addEventListener('click', () => {
        if (!categoriaLPAberta) return;
        abrirModalItemLP(categoriaLPAberta, null);
    });

    document.getElementById('inputItemLPImagem').addEventListener('change', async (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;
        const preview = document.getElementById('lpItemPreviewImagem');
        preview.style.display = 'block';
        preview.src = URL.createObjectURL(arquivo);

        const blob = await redimensionarImagem(arquivo);
        const url = await fazerUploadImagemImgBB(blob);
        imagemItemLPSelecionada = url;
        preview.src = url;
        toast('✅ Imagem enviada!');
    });

    document.getElementById('btnSalvarItemLP').addEventListener('click', async () => {
        const nome = document.getElementById('inputItemLPNome').value.trim();
        const precoRaw = document.getElementById('inputItemLPPreco').value.trim();
        if (!nome) { toast('⚠️ Informe o nome do item.'); return; }

        // Valor é opcional — se não preencher, fica 0,00 (o cliente define depois).
        let precoNumerico = 0;
        if (precoRaw) {
            precoNumerico = parseFloat(precoRaw.replace("R$ ", "").replace(/\./g, "").replace(",", "."));
            if (isNaN(precoNumerico)) { toast('⚠️ Valor inválido.'); return; }
        }

        const btn = document.getElementById('btnSalvarItemLP');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const dados = {
                nome,
                preco_centavos: Math.round(precoNumerico * 100).toString(),
                imagem: imagemItemLPSelecionada || 'https://i.ibb.co/0jjSyNRG/logo.png'
            };
            if (editandoItemLPId) {
                await setDoc(doc(db, "listas_prontas", categoriaLPAberta, "itens", editandoItemLPId), dados, { merge: true });
            } else {
                const itemId = nome.replace(/[\/#\$\.\[\]]/g, "").trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
                await setDoc(doc(db, "listas_prontas", categoriaLPAberta, "itens", itemId), dados);
            }
            toast(editandoItemLPId ? '✅ Item atualizado!' : '✅ Item adicionado!');
            document.getElementById('modalItemLP').classList.remove('ativo');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao salvar item.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar';
        }
    });

    async function excluirItemLP(catId, itemId) {
        const item = (itensPorCategoriaLP[catId] || []).find(i => i.id === itemId);
        if (!confirm(`Excluir o item "${item?.nome}"?`)) return;
        try {
            await deleteDoc(doc(db, "listas_prontas", catId, "itens", itemId));
            toast('🗑️ Item excluído.');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao excluir item.');
        }
    }

    // ----------------------------------------------------------------
    // IMPORTAR ITENS VIA EXCEL DIRETO PARA UMA CATEGORIA DO CATÁLOGO
    // Mesmas colunas do modelo: nome_item | valor | categoria | imagem_url
    // (a coluna "categoria" da planilha é ignorada aqui — os itens entram
    // sempre na categoria que está aberta na tela).
    // ----------------------------------------------------------------
    let itensExcelCategoriaValidados = [];

    document.getElementById('btnImportarExcelCategoriaLP').addEventListener('click', () => {
        if (!categoriaLPAberta) return;
        const cat = todasCategoriasLP.find(c => c.id === categoriaLPAberta);
        itensExcelCategoriaValidados = [];
        document.getElementById('importarExcelCategoriaNome').textContent = cat?.nome || '';
        document.getElementById('inputArquivoExcelCategoriaLP').value = '';
        document.getElementById('lpExcelCategoriaPreviewWrap').style.display = 'none';
        document.getElementById('lpExcelCategoriaPreviewTabela').innerHTML = '';
        document.getElementById('lpExcelCategoriaPreviewQtd').textContent = '0';
        document.getElementById('lpExcelCategoriaPreviewAviso').textContent = '';
        document.getElementById('btnConfirmarImportarExcelCategoriaLP').disabled = true;
        document.getElementById('modalImportarExcelCategoriaLP').classList.add('ativo');
    });

    document.getElementById('btnFecharModalImportarExcelCategoriaLP').addEventListener('click', () => {
        document.getElementById('modalImportarExcelCategoriaLP').classList.remove('ativo');
    });
    document.getElementById('btnCancelarImportarExcelCategoriaLP').addEventListener('click', () => {
        document.getElementById('modalImportarExcelCategoriaLP').classList.remove('ativo');
    });

    document.getElementById('btnBaixarModeloExcelCategoria').addEventListener('click', () => {
        const dados = [
            ['nome_item', 'valor', 'categoria', 'imagem_url'],
            ['Nome do item (obrigatório)', 'Valor em reais, ex: 150,00 (opcional)', 'Não é necessário preencher aqui', 'Link direto da imagem, ex: https://i.ibb.co/... (opcional)']
        ];
        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 28 }, { wch: 45 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Itens');
        XLSX.writeFile(wb, 'modelo-importacao-itens.xlsx');
    });

    document.getElementById('inputArquivoExcelCategoriaLP').addEventListener('change', (e) => {
        const arquivo = e.target.files[0];
        const previewWrap = document.getElementById('lpExcelCategoriaPreviewWrap');
        const tabela = document.getElementById('lpExcelCategoriaPreviewTabela');
        const qtdEl = document.getElementById('lpExcelCategoriaPreviewQtd');
        const avisoEl = document.getElementById('lpExcelCategoriaPreviewAviso');
        const btnConfirmar = document.getElementById('btnConfirmarImportarExcelCategoriaLP');
        itensExcelCategoriaValidados = [];

        if (!arquivo) { previewWrap.style.display = 'none'; btnConfirmar.disabled = true; return; }

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                let inicio = 2;
                if (linhas.length > 1 && String(linhas[1][0] || '').trim() && !String(linhas[1][0]).startsWith('Nome do item')) inicio = 1;

                let erros = 0;
                itensExcelCategoriaValidados = linhas.slice(inicio)
                    .filter(linha => linha.some(c => String(c).trim() !== ''))
                    .map(linha => {
                        const nome = String(linha[0] || '').trim();
                        const valorNumerico = parsePrecoExcel(linha[1]);
                        const imagem = String(linha[3] || '').trim();
                        const erro = !nome ? 'Sem nome' : isNaN(valorNumerico) ? 'Valor inválido' : '';
                        if (erro) erros++;
                        return { nome, valorNumerico, imagem, erro };
                    });

                qtdEl.textContent = itensExcelCategoriaValidados.length;
                avisoEl.textContent = erros > 0 ? `⚠️ ${erros} linha(s) com erro — não serão importadas` : '';

                if (itensExcelCategoriaValidados.length === 0) {
                    tabela.innerHTML = '<p style="padding:14px; font-size:12px; color:var(--text3);">Nenhum item encontrado na planilha.</p>';
                } else {
                    tabela.innerHTML = `
                        <div class="card-tabela-scroll">
                        <table>
                            <thead><tr><th></th><th>Nome</th><th>Valor</th></tr></thead>
                            <tbody>
                                ${itensExcelCategoriaValidados.map(item => `
                                    <tr class="${item.erro ? 'linha-erro' : ''}">
                                        <td>${item.imagem ? `<img class="lp-excel-preview-thumb" src="${item.imagem}" alt="">` : ''}</td>
                                        <td>${item.nome || '—'}${item.erro ? ` <span style="font-size:10px;">(${item.erro})</span>` : ''}</td>
                                        <td>${isNaN(item.valorNumerico) ? '—' : item.valorNumerico === 0 ? 'A definir' : item.valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        </div>
                    `;
                }
                previewWrap.style.display = 'block';
                btnConfirmar.disabled = itensExcelCategoriaValidados.filter(i => !i.erro).length === 0;
            } catch (err) {
                console.error(err);
                toast('❌ Não foi possível ler essa planilha.');
                itensExcelCategoriaValidados = [];
                previewWrap.style.display = 'none';
                btnConfirmar.disabled = true;
            }
        };
        reader.readAsArrayBuffer(arquivo);
    });

    document.getElementById('btnConfirmarImportarExcelCategoriaLP').addEventListener('click', async () => {
        const itensValidos = itensExcelCategoriaValidados.filter(i => !i.erro);
        if (!categoriaLPAberta || itensValidos.length === 0) return;

        const btn = document.getElementById('btnConfirmarImportarExcelCategoriaLP');
        btn.disabled = true;
        btn.textContent = 'Importando...';

        try {
            const batch = writeBatch(db);
            itensValidos.forEach(item => {
                const itemId = item.nome.replace(/[\/#\$\.\[\]]/g, "").trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                batch.set(doc(db, "listas_prontas", categoriaLPAberta, "itens", itemId), {
                    nome: item.nome,
                    preco_centavos: Math.round((item.valorNumerico || 0) * 100).toString(),
                    imagem: item.imagem || 'https://i.ibb.co/0jjSyNRG/logo.png'
                });
            });
            await batch.commit();

            toast(`✅ ${itensValidos.length} item(ns) importado(s) para a categoria!`);
            document.getElementById('modalImportarExcelCategoriaLP').classList.remove('ativo');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao importar itens.');
        } finally {
            btn.textContent = 'Importar itens';
            btn.disabled = itensExcelCategoriaValidados.filter(i => !i.erro).length === 0;
        }
    });

    // ----------------------------------------------------------------
    // IMPORTAR ITENS VIA EXCEL PARA UM CLIENTE
    // Colunas do modelo: nome_item | valor | categoria | imagem_url
    // Mesmo nome já cadastrado para o cliente => atualiza (preço/categoria/imagem).
    // ----------------------------------------------------------------
    let clienteLPSelecionadoUid = null;
    let itensExcelValidados = []; // [{ nome, valorNumerico, categoria, imagem, erro }]

    document.getElementById('btnImportarParaCliente').addEventListener('click', () => {
        clienteLPSelecionadoUid = null;
        itensExcelValidados = [];
        document.getElementById('inputBuscaClienteLP').value = '';
        document.getElementById('lpBuscaClienteResultados').style.display = 'none';
        document.getElementById('lpClienteSelecionado').style.display = 'none';
        document.getElementById('inputArquivoExcelLP').value = '';
        document.getElementById('lpExcelPreviewWrap').style.display = 'none';
        document.getElementById('lpExcelPreviewTabela').innerHTML = '';
        document.getElementById('lpExcelPreviewQtd').textContent = '0';
        document.getElementById('lpExcelPreviewAviso').textContent = '';
        atualizarEstadoBotaoImportarLP();
        document.getElementById('modalImportarLP').classList.add('ativo');
    });

    document.getElementById('btnFecharModalImportarLP').addEventListener('click', () => {
        document.getElementById('modalImportarLP').classList.remove('ativo');
        buscaClienteLPAberta = false;
    });
    document.getElementById('btnCancelarImportarLP').addEventListener('click', () => {
        document.getElementById('modalImportarLP').classList.remove('ativo');
        buscaClienteLPAberta = false;
    });

    // Modelo de planilha — mesmas colunas essenciais para criar um item em
    // "presentes" (o resto: disponível, taxa, usuario_id etc. é
    // preenchido automaticamente na importação).
    document.getElementById('btnBaixarModeloExcel').addEventListener('click', () => {
        const dados = [
            ['nome_item', 'valor', 'categoria', 'imagem_url'],
            ['Nome do item (obrigatório)', 'Valor em reais, ex: 150,00 (obrigatório)', 'Categoria do item, ex: Cozinha (opcional)', 'Link direto da imagem, ex: https://i.ibb.co/... (opcional)']
        ];
        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 45 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Itens');
        XLSX.writeFile(wb, 'modelo-importacao-itens.xlsx');
    });

    function parsePrecoExcel(valor) {
        if (typeof valor === 'number') return valor;
        if (!valor || String(valor).trim() === '') return 0; // vazio = sem valor definido ainda (0,00)
        const limpo = String(valor).trim().replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
        const num = parseFloat(limpo);
        return isNaN(num) ? NaN : num; // NaN só quando realmente não dá pra interpretar como número
    }

    document.getElementById('inputArquivoExcelLP').addEventListener('change', (e) => {
        const arquivo = e.target.files[0];
        const previewWrap = document.getElementById('lpExcelPreviewWrap');
        const tabela = document.getElementById('lpExcelPreviewTabela');
        const qtdEl = document.getElementById('lpExcelPreviewQtd');
        const avisoEl = document.getElementById('lpExcelPreviewAviso');
        itensExcelValidados = [];

        if (!arquivo) { previewWrap.style.display = 'none'; atualizarEstadoBotaoImportarLP(); return; }

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                // header:1 => array de arrays, já mantendo a ordem das colunas do modelo
                const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                // Pula a linha de cabeçalho (0) e a linha de descrição/ajuda (1),
                // igual ao modelo baixado. Se o admin apagar a linha de ajuda,
                // detectamos pelo conteúdo da 2ª linha não parecer um nome de item real
                // (a linha de ajuda começa com "Nome do item").
                let inicio = 2;
                if (linhas.length > 1 && String(linhas[1][0] || '').trim() && !String(linhas[1][0]).startsWith('Nome do item')) inicio = 1;

                let erros = 0;
                itensExcelValidados = linhas.slice(inicio)
                    .filter(linha => linha.some(c => String(c).trim() !== ''))
                    .map(linha => {
                        const nome = String(linha[0] || '').trim();
                        const valorNumerico = parsePrecoExcel(linha[1]);
                        const categoria = String(linha[2] || '').trim();
                        const imagem = String(linha[3] || '').trim();
                        // Só erro se faltar o nome ou se o valor não puder ser interpretado.
                        // Valor vazio/zero é permitido (o cliente define o preço depois).
                        const erro = !nome ? 'Sem nome' : isNaN(valorNumerico) ? 'Valor inválido' : '';
                        if (erro) erros++;
                        return { nome, valorNumerico, categoria, imagem, erro };
                    });

                qtdEl.textContent = itensExcelValidados.length;
                avisoEl.textContent = erros > 0 ? `⚠️ ${erros} linha(s) com erro — não serão importadas` : '';

                if (itensExcelValidados.length === 0) {
                    tabela.innerHTML = '<p style="padding:14px; font-size:12px; color:var(--text3);">Nenhum item encontrado na planilha.</p>';
                } else {
                    tabela.innerHTML = `
                        <div class="card-tabela-scroll">
                        <table>
                            <thead><tr><th></th><th>Nome</th><th>Valor</th><th>Categoria</th></tr></thead>
                            <tbody>
                                ${itensExcelValidados.map(item => `
                                    <tr class="${item.erro ? 'linha-erro' : ''}">
                                        <td>${item.imagem ? `<img class="lp-excel-preview-thumb" src="${item.imagem}" alt="">` : ''}</td>
                                        <td>${item.nome || '—'}${item.erro ? ` <span style="font-size:10px;">(${item.erro})</span>` : ''}</td>
                                        <td>${isNaN(item.valorNumerico) ? '—' : item.valorNumerico === 0 ? 'A definir' : item.valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>${item.categoria || 'Sem Categoria'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        </div>
                    `;
                }
                previewWrap.style.display = 'block';
            } catch (err) {
                console.error(err);
                toast('❌ Não foi possível ler essa planilha.');
                itensExcelValidados = [];
                previewWrap.style.display = 'none';
            }
            atualizarEstadoBotaoImportarLP();
        };
        reader.readAsArrayBuffer(arquivo);
    });

    function atualizarEstadoBotaoImportarLP() {
        const btn = document.getElementById('btnConfirmarImportarLP');
        const itensValidos = itensExcelValidados.filter(i => !i.erro);
        btn.disabled = !clienteLPSelecionadoUid || itensValidos.length === 0;
    }

    document.getElementById('btnConfirmarImportarLP').addEventListener('click', async () => {
        const itensValidos = itensExcelValidados.filter(i => !i.erro);
        if (!clienteLPSelecionadoUid || itensValidos.length === 0) return;

        const btn = document.getElementById('btnConfirmarImportarLP');
        btn.disabled = true;
        btn.textContent = 'Importando...';

        try {
            // Garante que cada categoria usada existe na coleção "categorias"
            // (mesmo padrão do dropdown de categorias do cadastro.html).
            // Importante: a regra de "categorias" só libera CREATE (não update),
            // então só gravamos se o documento ainda não existir.
            const categoriasUsadas = [...new Set(itensValidos.map(i => i.categoria || 'Sem Categoria'))];
            for (const nomeCat of categoriasUsadas) {
                const catLimpa = nomeCat.replace(/[\/#\$\.\[\]]/g, "").trim();
                const catRef = doc(db, "categorias", catLimpa);
                const catSnap = await getDoc(catRef);
                if (!catSnap.exists()) {
                    await setDoc(catRef, { nome: nomeCat });
                }
            }

            // Taxa do cliente: usa a preferência já salva em "configuracoes/{uid}"
            // (mesmo padrão do toggle "Convidado paga / Eu pago" do cadastro.html);
            // se não houver configuração ainda, assume 'convidado'.
            const configCliente = todasConfiguracoes[clienteLPSelecionadoUid];
            const taxaQuemPagaCliente = configCliente?.taxa_quem_paga || 'convidado';

            const batch = writeBatch(db);
            itensValidos.forEach(item => {
                const nomeCategoria = item.categoria || 'Sem Categoria';
                const categoriaLimpaNome = nomeCategoria.replace(/[\/#\$\.\[\]]/g, "").trim();
                const precoOriginalCentavos = Math.round(item.valorNumerico * 100);
                const fatorTaxa = taxaQuemPagaCliente === 'convidado' ? (1 + taxaGlobal / 100) : 1;
                const precoCentavosWebhook = Math.round(precoOriginalCentavos * fatorTaxa);
                const precoParaWebhook = brl(precoCentavosWebhook);

                const nomeLimpo = item.nome.replace(/[\/#\$\.\[\]]/g, "").trim();
                // Mesmo padrão de ID do cadastro.html: mesmo nome + categoria para
                // o mesmo cliente = mesmo documento => "set" atualiza em vez de duplicar.
                const produtoId = `${clienteLPSelecionadoUid}-${categoriaLimpaNome}-${nomeLimpo}`;

                batch.set(doc(db, "presentes", produtoId), {
                    categoria:               nomeCategoria,
                    disponivel:              true,
                    imagem:                  item.imagem || 'https://i.ibb.co/0jjSyNRG/logo.png',
                    preco:                   precoParaWebhook,
                    preco_original_centavos: precoOriginalCentavos.toString(),
                    preco_centavos:          precoCentavosWebhook.toString(),
                    taxa_quem_paga:          taxaQuemPagaCliente,
                    taxa_percentual:         taxaGlobal,
                    titulo:                  item.nome,
                    usuario_id:              clienteLPSelecionadoUid
                }, { merge: true });
            });
            await batch.commit();

            toast(`✅ ${itensValidos.length} item(ns) importado(s) para o cliente!`);
            document.getElementById('modalImportarLP').classList.remove('ativo');
            carregarDadosPainel();
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao importar itens.');
        } finally {
            btn.textContent = 'Importar itens';
            atualizarEstadoBotaoImportarLP();
        }
    });

    // Busca de cliente por nome/e-mail — usa os mesmos dados já carregados
    // para a aba "Clientes" (todosOsUsuarios + todosOsPerfis).
    // Ao focar/clicar no campo (mesmo vazio), já mostra todos os clientes
    // cadastrados; ao digitar, filtra a lista.
    let buscaClienteLPAberta = false;

    function renderizarResultadosClienteLP(termo) {
        const resultadosEl = document.getElementById('lpBuscaClienteResultados');
        buscaClienteLPAberta = true;

        const uids = [...new Set(Object.keys(todosOsUsuarios))];

        // Os dados de clientes chegam via onSnapshot (assíncrono) — se o painel
        // for aberto antes da primeira resposta do Firestore chegar, mostramos
        // um estado de carregamento em vez de "nenhum cliente encontrado".
        if (uids.length === 0) {
            resultadosEl.innerHTML = '<div class="lp-cliente-opcao" style="color:var(--text3); cursor:default;">Carregando clientes...</div>';
            resultadosEl.style.display = 'block';
            return;
        }

        let encontrados = uids.map(uid => ({
            uid,
            email: todosOsUsuarios[uid] || '',
            nome: todosOsPerfis[uid]?.nome || ''
        }));

        if (termo) {
            encontrados = encontrados.filter(c =>
                c.email.toLowerCase().includes(termo) || c.nome.toLowerCase().includes(termo)
            );
        }

        // Ordena por nome (ou e-mail, se não tiver nome) para facilitar achar na lista completa
        encontrados.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
        encontrados = encontrados.slice(0, 30);

        if (encontrados.length === 0) {
            resultadosEl.innerHTML = '<div class="lp-cliente-opcao" style="color:var(--text3); cursor:default;">Nenhum cliente encontrado.</div>';
        } else {
            resultadosEl.innerHTML = '';
            encontrados.forEach(c => {
                const div = document.createElement('div');
                div.className = 'lp-cliente-opcao';
                div.setAttribute('data-uid', c.uid);
                
                const email = document.createElement('div');
                email.style.cssText = 'font-weight:600; color:var(--text);';
                email.textContent = c.email;
                
                const nome = document.createElement('div');
                nome.style.cssText = 'font-size:12px; color:var(--text3);';
                nome.textContent = c.nome || 'Sem nome';
                
                div.appendChild(email);
                div.appendChild(nome);
                resultadosEl.appendChild(div);
            });
            resultadosEl.querySelectorAll('.lp-cliente-opcao[data-uid]').forEach(el => {
                el.addEventListener('click', () => selecionarClienteLP(el.dataset.uid));
            });
        }
        resultadosEl.style.display = 'block';
    }

    document.getElementById('inputBuscaClienteLP').addEventListener('focus', (e) => {
        renderizarResultadosClienteLP(e.target.value.trim().toLowerCase());
    });
    document.getElementById('inputBuscaClienteLP').addEventListener('click', (e) => {
        renderizarResultadosClienteLP(e.target.value.trim().toLowerCase());
    });
    document.getElementById('inputBuscaClienteLP').addEventListener('input', (e) => {
        renderizarResultadosClienteLP(e.target.value.trim().toLowerCase());
    });

    // Fecha a lista de resultados ao clicar fora do campo/lista
    document.addEventListener('click', (e) => {
        const campo = document.getElementById('inputBuscaClienteLP');
        const resultadosEl = document.getElementById('lpBuscaClienteResultados');
        if (e.target !== campo && !resultadosEl.contains(e.target)) {
            resultadosEl.style.display = 'none';
            buscaClienteLPAberta = false;
        }
    });

    function selecionarClienteLP(uid) {
        clienteLPSelecionadoUid = uid;
        const email = todosOsUsuarios[uid] || uid;
        const nome = todosOsPerfis[uid]?.nome;
        document.getElementById('lpClienteSelecionadoTexto').textContent = nome ? `${nome} — ${email}` : email;
        document.getElementById('lpClienteSelecionado').style.display = 'flex';
        document.getElementById('lpBuscaClienteResultados').style.display = 'none';
        document.getElementById('inputBuscaClienteLP').value = '';
        atualizarEstadoBotaoImportarLP();
    }

    document.getElementById('btnLimparClienteLP').addEventListener('click', () => {
        clienteLPSelecionadoUid = null;
        document.getElementById('lpClienteSelecionado').style.display = 'none';
        atualizarEstadoBotaoImportarLP();
    });

    // ================================================================
    // VALOR MÍNIMO DE SAQUE (GLOBAL)
    // ================================================================
    function formatarCentavosParaReais(centavos) {
        const valor = (centavos / 100).toFixed(2);
        return "R$ " + valor.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    }

    // Converte o texto exibido ("R$ 1.234,56") de volta para centavos (inteiro)
    function parseReaisParaCentavos(texto) {
        const apenasDigitos = (texto || '').replace(/\D/g, "");
        return apenasDigitos ? parseInt(apenasDigitos, 10) : 0;
    }

    const inputValorMinimoSaque = document.getElementById('inputValorMinimoSaque');

    // Máscara em tempo real — mesmo padrão usado no campo de preço do cadastro.html
    inputValorMinimoSaque.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, "");
        if (!value) { e.target.value = ""; return; }
        value = (parseFloat(value) / 100).toFixed(2);
        e.target.value = "R$ " + value.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    });

    async function carregarValorMinimoSaque() {
        try {
            const snap = await getDoc(doc(db, "admin_config", "global"));
            const centavos = (snap.exists() && snap.data().valor_minimo_saque_centavos != null)
                ? parseInt(snap.data().valor_minimo_saque_centavos)
                : 25000; // padrão: R$ 250,00
            inputValorMinimoSaque.value = formatarCentavosParaReais(centavos);
        } catch(e) { console.error(e); }
    }

    document.getElementById('btnSalvarValorMinimo').addEventListener('click', async () => {
        const centavos = parseReaisParaCentavos(inputValorMinimoSaque.value);
        if (centavos <= 0) { toast('⚠️ Valor inválido.'); return; }
        try {
            await setDoc(doc(db, "admin_config", "global"), { valor_minimo_saque_centavos: centavos }, { merge: true });
            inputValorMinimoSaque.value = formatarCentavosParaReais(centavos);
            toast('✅ Valor mínimo de saque atualizado!');
        } catch(e) {
            console.error(e);
            toast('❌ Erro ao salvar: ' + (e.message || e.code || 'desconhecido'));
        }
    });

    // ================================================================
    // MARCAR SAQUE COMO PAGO (via modal, com observação/comprovante)
    // ================================================================
    let saqueIdPendenteConfirmacao = null;

    window.marcarSaqueComoPago = function(saqueId) {
        const saque = todosOsSaques.find(s => s.id === saqueId);
        if (!saque) { toast('❌ Saque não encontrado.'); return; }

        saqueIdPendenteConfirmacao = saqueId;
        document.getElementById('pagamentoClienteNome').textContent = saque.nome || '—';
        document.getElementById('pagamentoValor').textContent = brl(parseInt(saque.repasse_centavos || 0));
        document.getElementById('pagamentoObservacao').value = '';
        document.getElementById('modalConfirmarPagamento').classList.add('ativo');
    };

    document.getElementById('btnFecharModalPagamento').addEventListener('click', () => {
        document.getElementById('modalConfirmarPagamento').classList.remove('ativo');
        saqueIdPendenteConfirmacao = null;
    });
    document.getElementById('btnCancelarPagamento').addEventListener('click', () => {
        document.getElementById('modalConfirmarPagamento').classList.remove('ativo');
        saqueIdPendenteConfirmacao = null;
    });
    document.getElementById('modalConfirmarPagamento').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalConfirmarPagamento')) {
            document.getElementById('modalConfirmarPagamento').classList.remove('ativo');
            saqueIdPendenteConfirmacao = null;
        }
    });

    document.getElementById('btnConfirmarPagamentoFinal').addEventListener('click', async () => {
        if (!saqueIdPendenteConfirmacao) return;
        const observacao = document.getElementById('pagamentoObservacao').value.trim();
        const btn = document.getElementById('btnConfirmarPagamentoFinal');
        btn.disabled = true;
        btn.textContent = 'Confirmando...';
        try {
            await updateDoc(doc(db, "saques", saqueIdPendenteConfirmacao), {
                status: 'pago',
                data_pagamento: new Date(),
                observacao_pagamento: observacao || null
            });
            toast('✅ Saque marcado como pago!');
            document.getElementById('modalConfirmarPagamento').classList.remove('ativo');
            saqueIdPendenteConfirmacao = null;
        } catch(e) {
            console.error(e);
            toast('❌ Erro ao marcar saque como pago: ' + (e.message || e.code || 'desconhecido'));
        } finally {
            btn.disabled = false;
            btn.textContent = '✅ Confirmar pagamento';
        }
    });

    // ================================================================
    // EXCLUIR CLIENTE (manual, com confirmação dupla)
    // ================================================================
    // Ação destrutiva e irreversível: apaga o doc de configurações, todos
    // os produtos e todos os saques desse cliente. Por ser uma operação
    // financeira/crítica, exige que o admin digite o e-mail exato do
    // cliente para confirmar — evita exclusão por clique acidental.
    window.confirmarExclusaoCliente = function(uid, email) {
        const digitado = prompt(
            `⚠️ ATENÇÃO: isso vai excluir PERMANENTEMENTE o cliente "${email}", ` +
            `todos os itens cadastrados por ele e todo o histórico de saques.\n\n` +
            `Esta ação não pode ser desfeita.\n\n` +
            `Para confirmar, digite o e-mail exato do cliente abaixo:`
        );
        if (digitado === null) return; // cancelou
        if (digitado.trim().toLowerCase() !== email.trim().toLowerCase()) {
            toast('❌ E-mail não confere. Exclusão cancelada.');
            return;
        }
        executarExclusaoCliente(uid, email);
    };

    async function executarExclusaoCliente(uid, email) {
        try {
            const batch = writeBatch(db);

            // 1. Produtos do cliente
            const produtosSnap = await getDocs(query(collection(db, "presentes"), where("usuario_id", "==", uid)));
            produtosSnap.forEach(d => batch.delete(d.ref));

            // 2. Saques do cliente
            const saquesSnap = await getDocs(query(collection(db, "saques"), where("usuario_id", "==", uid)));
            saquesSnap.forEach(d => batch.delete(d.ref));

            // 3. Configurações do cliente
            batch.delete(doc(db, "configuracoes", uid));

            // 4. Perfil do cliente (nome, cpf, telefone, data de cadastro)
            batch.delete(doc(db, "perfis", uid));

            await batch.commit();
            toast(`✅ Cliente "${email}" excluído (${produtosSnap.size} item(ns), ${saquesSnap.size} saque(s)). Lembre-se: a CONTA DE LOGIN (Firebase Authentication) não é apagada automaticamente — remova-a manualmente no Firebase Console se necessário.`);
            carregarDadosPainel();
        } catch(e) {
            console.error(e);
            toast('❌ Erro ao excluir cliente: ' + (e.message || e.code || 'desconhecido'));
        }
    }

    // ================================================================
    // INICIAR PAINEL — escuta em tempo real
    // ================================================================
    function iniciarPainel() {
        carregarDadosPainel();
        escutarSaques();
        escutarListasProntas();

        document.getElementById('btnAtualizarPainel')?.addEventListener('click', () => carregarDadosPainel(true));

        // Re-renderiza a tabela de clientes ao digitar na busca ou trocar o ano
        document.getElementById('buscaClientes')?.addEventListener('input', atualizarTabelaClientes);
        document.getElementById('filtroAnoClientes')?.addEventListener('change', atualizarTabelaClientes);
    }

    let todosOsProdutos = [];
    let todosOsUsuarios = {};
    let todasConfiguracoes = {}; // uid -> { email, taxa_quem_paga, ... }
    let todosOsPerfis = {};      // uid -> { email, criado_em, nome, ... } — fonte real da data de cadastro

    // ------------------------------------------------------------------
    // "presentes", "configuracoes" e "perfis" cresceram pra virar coleções
    // com dados de TODOS os clientes/listas da plataforma, sem filtro.
    // Antes ficavam em onSnapshot (tempo real): qualquer escrita em
    // qualquer lista, de qualquer cliente, disparava releitura da
    // coleção inteira em toda sessão aberta do painel. Trocado por
    // leitura única (getDocs) no carregamento + botão "Atualizar dados".
    // "saques" e "listas_prontas" continuam em tempo real (baixo volume
    // e/ou precisam de atenção imediata).
    // ------------------------------------------------------------------

    async function carregarConfiguracoes() {
        const snap = await getDocs(collection(db, "configuracoes"));
        todasConfiguracoes = {};
        snap.docs.forEach(d => {
            todasConfiguracoes[d.id] = { id: d.id, ...d.data() };
            if (d.data().email) todosOsUsuarios[d.id] = d.data().email;
        });
    }

    async function carregarPerfis() {
        const snap = await getDocs(collection(db, "perfis"));
        todosOsPerfis = {};
        snap.docs.forEach(d => {
            todosOsPerfis[d.id] = { id: d.id, ...d.data() };
            if (d.data().email) todosOsUsuarios[d.id] = d.data().email;
        });
        atualizarFiltroAnos();
    }

    async function carregarProdutos() {
        const snap = await getDocs(collection(db, "presentes"));
        todosOsProdutos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Coletar UIDs únicos
        const uids = [...new Set(todosOsProdutos.map(p => p.usuario_id).filter(Boolean))];

        // Carregar e-mails dos usuários (via configuracoes ou auth — aqui usamos configuracoes)
        for (const uid of uids) {
            if (!todosOsUsuarios[uid]) {
                try {
                    const configSnap = await getDoc(doc(db, "configuracoes", uid));
                    todosOsUsuarios[uid] = configSnap.exists()
                        ? (configSnap.data().email || uid.slice(0, 8) + '...')
                        : uid.slice(0, 8) + '...';
                } catch { todosOsUsuarios[uid] = uid.slice(0, 8) + '...'; }
            }
        }
    }

    async function carregarDadosPainel(mostrarToast = false) {
        try {
            await Promise.all([carregarProdutos(), carregarConfiguracoes(), carregarPerfis()]);

            atualizarVisaoGeral();
            atualizarTabelaClientes();
            atualizarRelatorio();
            if (buscaClienteLPAberta) {
                renderizarResultadosClienteLP(document.getElementById('inputBuscaClienteLP').value.trim().toLowerCase());
            }
            if (mostrarToast) toast('✅ Dados atualizados');
        } catch (e) {
            console.error(e);
            toast('❌ Erro ao atualizar dados: ' + (e.message || e.code || 'desconhecido'));
        }
    }

    let todosOsSaques = [];

    function escutarSaques() {
        onSnapshot(collection(db, "saques"), (snap) => {
            todosOsSaques = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderizarSaques(todosOsSaques);
            document.getElementById('labelTotalSaques').textContent = todosOsSaques.length + ' solicitação(ões)';
            atualizarBadgeSaques(todosOsSaques);
            atualizarResumoSaques(todosOsSaques);
            atualizarResumoFinanceiro(
                obterTodasContribuicoesAdmin(),
                todosOsSaques
            );
            // O saldo pendente exibido na aba Clientes depende dos saques —
            // recalcula a tabela quando chegam novos dados.
            atualizarTabelaClientes();
        });
    }

    // ================================================================
    // VISÃO GERAL
    // ================================================================
    function atualizarVisaoGeral() {
        const uids = [...new Set(todosOsProdutos.map(p => p.usuario_id).filter(Boolean))];
        const entregues = todosOsProdutos.filter(p => p.disponivel === false && p.presenteado_por);
        // ✅ CORRIGIDO: soma pelo valor REALMENTE pago em cada contribuição
        // (respeitando cotas parciais), não pelo preço cheio do produto —
        // que é o que causava o card mostrar dinheiro que ainda não entrou.
        const contribuicoesTotais = obterTodasContribuicoesAdmin();
        const totalOriginalCentavos = contribuicoesTotais.reduce((acc, c) => acc + c.valorCentavos, 0);
        // Lucro real — já recebido, respeitando taxa/quem-paga de cada item
        const meuLucroReal = contribuicoesTotais.reduce((acc, c) => acc + calcularRepasse(c).taxaCentavos, 0);

        // Lucro previsto — se TODOS os itens disponíveis forem presenteados
        const disponiveis = todosOsProdutos.filter(p => p.disponivel !== false);
        const totalDisponiveisCentavos = disponiveis.reduce((acc, p) => {
            return acc + parseInt(p.preco_original_centavos || p.preco_centavos || 0);
        }, 0);
        const meuLucroPrevisto = Math.round(totalDisponiveisCentavos * taxaGlobal / 100);

        document.getElementById('metricaClientes').textContent = uids.length;
        document.getElementById('metricaListas').textContent = todosOsProdutos.length;
        document.getElementById('metricaEntregues').textContent = entregues.length;
        document.getElementById('metricaLucro').textContent = brl(meuLucroPrevisto);
        document.getElementById('metricaLucroReal').textContent = brl(meuLucroReal);
        document.getElementById('metricaLucroRealSub').textContent =
            `${contribuicoesTotais.length} contribuição${contribuicoesTotais.length !== 1 ? 'ões' : ''} recebida${contribuicoesTotais.length !== 1 ? 's' : ''}`;

        renderizarGraficoMensal(contribuicoesTotais);
        renderizarGraficoLucroMensal(contribuicoesTotais);
        renderizarGraficoCategorias(contribuicoesTotais);
        atualizarResumoFinanceiro(contribuicoesTotais, todosOsSaques);
        popularFiltroClientes();

        // Tendência nos cards principais
        const tendencia = calcularTendencia(contribuicoesTotais);
        exibirTendencia('metricaEntregues', tendencia);

        // Tabela últimos presentes — agora por contribuição (mostra cota
        // parcial também, não só produto 100% fechado)
        const ultimos = [...contribuicoesTotais]
            .sort((a, b) => toMsAdmin(b.data) - toMsAdmin(a.data))
            .slice(0, 10);

        const tbody = document.getElementById('tabelaUltimos');
        document.getElementById('labelUltimosPresentes').textContent = contribuicoesTotais.length + ' presentes no total';

        if (ultimos.length === 0) {
            tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Nenhum presente recebido ainda.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        ultimos.forEach(c => {
            const p = c.produto;
            const tr = tbody.insertRow();

            const td1 = tr.insertCell();
            let titulo = p.titulo || '';
            if (Array.isArray(c.cotas) && c.cotas.length > 0) {
                titulo += ` (cota ${c.cotas.join(', ')})`;
            }
            td1.textContent = titulo;

            const td2 = tr.insertCell();
            td2.textContent = c.nome || '';

            const td3 = tr.insertCell();
            td3.textContent = brl(c.valorCentavos);

            const td4 = tr.insertCell();
            const dt = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : new Date());
            td4.textContent = dt.toLocaleDateString('pt-BR');

            const td5 = tr.insertCell();
            const badge = document.createElement('span');
            badge.style.cssText = 'background:var(--green-dim); color:var(--green); padding:4px 8px; border-radius:4px; font-size:11px;';
            badge.textContent = '✓ Pago';
            td5.appendChild(badge);
        });
    }

    // ================================================================
    // GRÁFICO: PRESENTES RECEBIDOS POR MÊS (últimos 6 meses)
    // ================================================================
    const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    function renderizarGraficoMensal(contribuicoes) {
        const container = document.getElementById('graficoMensal');
        if (!container) return;

        // Monta os últimos 6 meses (incluindo o atual), do mais antigo ao mais recente
        const hoje = new Date();
        const meses = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            meses.push({ ano: d.getFullYear(), mes: d.getMonth(), qtd: 0 });
        }

        contribuicoes.forEach(c => {
            const d = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : null);
            if (!d) return;
            const alvo = meses.find(m => m.ano === d.getFullYear() && m.mes === d.getMonth());
            if (alvo) alvo.qtd++;
        });

        const maxQtd = Math.max(1, ...meses.map(m => m.qtd));

        if (contribuicoes.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:13px; padding:30px 0;">Nenhum presente recebido ainda — o gráfico aparece aqui assim que houver dados.</p>';
            return;
        }

        container.innerHTML = `<div class="grafico-barras">
            ${meses.map(m => {
                const alturaPerc = Math.round((m.qtd / maxQtd) * 100);
                return `<div class="grafico-coluna">
                    <span class="grafico-valor">${m.qtd > 0 ? m.qtd : ''}</span>
                    <div class="grafico-barra" style="height:${m.qtd > 0 ? Math.max(alturaPerc, 4) : 2}%;"></div>
                    <span class="grafico-label">${NOMES_MESES[m.mes]}</span>
                </div>`;
            }).join('')}
        </div>`;
    }

    // ================================================================
    // TABELA DE CLIENTES
    // ================================================================
    function formatarData(timestamp) {
        if (!timestamp) return '—';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleDateString('pt-BR');
    }

    function anoDoTimestamp(timestamp) {
        if (!timestamp) return null;
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.getFullYear();
    }

    // Busca a data de cadastro real do cliente, na coleção 'perfis' (campo
    // 'criado_em', string ISO), que é a fonte de verdade já existente no
    // sistema — criada por outra tela de cadastro/onboarding.
    function getDataCadastro(uid) {
        return todosOsPerfis[uid]?.criado_em || null;
    }

    function atualizarTabelaClientes() {
        // Fonte de verdade: TODOS os clientes cadastrados. Une uids vindos de
        // 'perfis' (cadastro completo) e 'configuracoes' (legado/parcial),
        // para não perder ninguém na listagem.
        let uids = [...new Set([...Object.keys(todosOsPerfis), ...Object.keys(todasConfiguracoes)])];

        // Inclui também uids que só aparecem em produtos mas, por algum
        // motivo, não têm doc em perfis/configuracoes (caso legado/órfão).
        const uidsDeProdutos = [...new Set(todosOsProdutos.map(p => p.usuario_id).filter(Boolean))];
        uidsDeProdutos.forEach(uid => { if (!uids.includes(uid)) uids.push(uid); });

        // ===== FILTROS =====
        const termoBusca = (document.getElementById('buscaClientes')?.value || '').trim().toLowerCase();
        const anoFiltro  = document.getElementById('filtroAnoClientes')?.value || '';

        if (termoBusca) {
            uids = uids.filter(uid => {
                const email = (todosOsUsuarios[uid] || '').toLowerCase();
                return email.includes(termoBusca) || uid.toLowerCase().includes(termoBusca);
            });
        }
        if (anoFiltro) {
            uids = uids.filter(uid => anoDoTimestamp(getDataCadastro(uid)) === parseInt(anoFiltro));
        }

        document.getElementById('labelTotalClientes').textContent = uids.length + ' cliente' + (uids.length === 1 ? '' : 's');

        const tbody = document.getElementById('tabelaClientes');

        if (uids.length === 0) {
            tbody.innerHTML = '<tr class="loading-row"><td colspan="9">Nenhum cliente encontrado.</td></tr>';
            return;
        }

        // Ordena por data de cadastro (mais antigos primeiro — facilita achar
        // quem já completou 1 ano e precisa de revisão para exclusão)
        uids.sort((a, b) => {
            const da = getDataCadastro(a) ? new Date(getDataCadastro(a)).getTime() : 0;
            const db_ = getDataCadastro(b) ? new Date(getDataCadastro(b)).getTime() : 0;
            return da - db_;
        });

        tbody.innerHTML = uids.map(uid => {
            const itensDoUsuario    = todosOsProdutos.filter(p => p.usuario_id === uid);
            // ✅ CORRIGIDO: usa contribuições (cada pagamento real, cota
            // parcial ou produto inteiro) em vez de só produtos 100% fechados.
            // Isso é o que decide quanto o cliente já recebeu de fato — antes,
            // uma cota paga só contava depois do item inteiro fechar, o que
            // deixava o "saldo pendente" desatualizado (dinheiro que o cliente
            // já tinha direito de receber não aparecia pra ser sacado).
            const contribuicoesUsuario = obterTodasContribuicoesAdmin().filter(c => c.usuario_id === uid);
            const totalCentavos     = contribuicoesUsuario.reduce((acc, c) => acc + c.valorCentavos, 0);
            const meuLucroUsuario   = contribuicoesUsuario.reduce((acc, c) => acc + calcularRepasse(c).taxaCentavos, 0);
            const qtdPresentesFechados = itensDoUsuario.filter(p => p.disponivel === false && p.presenteado_por).length;
            const email             = todosOsUsuarios[uid] || uid.slice(0, 12) + '...';
            const cidadeUf          = todosOsPerfis[uid]?.cidade
                ? `${todosOsPerfis[uid].cidade}${todosOsPerfis[uid].estado ? '/' + todosOsPerfis[uid].estado : ''}`
                : '—';
            const dataCadastro      = getDataCadastro(uid);
            const dataFmt           = formatarData(dataCadastro);

            // Saldo pendente = repasse líquido total de TODAS as contribuições
            // já pagas (cota parcial inclusa) MENOS o que já foi pago em
            // saques anteriores. É o que o cliente tem disponível AGORA.
            const repasseLiquidoTotal = contribuicoesUsuario.reduce((acc, c) => acc + calcularRepasse(c).repasseCentavos, 0);
            const jaPagoCentavos = todosOsSaques
                .filter(s => s.usuario_id === uid && s.status === 'pago')
                .reduce((acc, s) => acc + parseInt(s.repasse_centavos || 0), 0);
            const saldoPendenteCentavos = Math.max(0, repasseLiquidoTotal - jaPagoCentavos);

            // Marca visualmente quem já passou de 1 ano de cadastro —
            // só um indicador, a exclusão continua sendo manual/sua decisão.
            let chipTempo = '';
            if (dataCadastro) {
                const d = dataCadastro.toDate ? dataCadastro.toDate() : new Date(dataCadastro);
                const umAnoAtras = new Date();
                umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
                if (d <= umAnoAtras) {
                    chipTempo = ' <span class="chip chip-vermelho" title="Cadastrado há mais de 1 ano">⏰ +1 ano</span>';
                }
            }

            const chipSaldo = saldoPendenteCentavos > 0
                ? `<span class="chip chip-roxo" title="Saldo disponível ainda não sacado">${brl(saldoPendenteCentavos)}</span>`
                : `<span style="color:var(--text3); font-size:12px;">—</span>`;

            return `<tr>
                <td><strong>${email}</strong></td>
                <td>${cidadeUf}</td>
                <td>${dataFmt}${chipTempo}</td>
                <td>${itensDoUsuario.length}</td>
                <td><span class="chip chip-verde">${qtdPresentesFechados}</span></td>
                <td>${brl(totalCentavos)}</td>
                <td><span class="chip chip-amarelo">${brl(meuLucroUsuario)}</span></td>
                <td>${chipSaldo}</td>
                <td style="display:flex; gap:6px;">
                    <button class="btn-tabela btn-detalhe" onclick="abrirDetalheCliente('${uid}')">Ver detalhes</button>
                    <button class="btn-tabela btn-excluir-cliente" onclick="confirmarExclusaoCliente('${uid}', '${email.replace(/'/g, "\\'")}')">🗑️ Excluir</button>
                </td>
            </tr>`;
        }).join('');
    }

    // Popula o filtro de ano dinamicamente com base nos anos de cadastro existentes
    function atualizarFiltroAnos() {
        const select = document.getElementById('filtroAnoClientes');
        if (!select) return;
        const valorAtual = select.value;
        const anos = new Set();
        Object.values(todosOsPerfis).forEach(p => {
            const ano = anoDoTimestamp(p.criado_em);
            if (ano) anos.add(ano);
        });
        const anosOrdenados = [...anos].sort((a, b) => b - a);
        select.innerHTML = '<option value="">Todos os anos</option>' +
            anosOrdenados.map(a => `<option value="${a}">${a}</option>`).join('');
        select.value = valorAtual;
    }

    // ================================================================
    // MODAL DETALHE CLIENTE
    // ================================================================
    window.abrirDetalheCliente = function(uid) {
        const itens = todosOsProdutos.filter(p => p.usuario_id === uid);

        // ✅ CORRIGIDO: agora usa as contribuições (cada pagamento — cota
        // parcial ou produto inteiro), consistente com a aba de Relatório.
        const contribuicoesCliente = obterTodasContribuicoesAdmin()
            .filter(c => c.usuario_id === uid)
            .sort((a, b) => toMsAdmin(b.data) - toMsAdmin(a.data));

        const total   = contribuicoesCliente.reduce((acc, c) => acc + c.valorCentavos, 0);
        const lucro   = contribuicoesCliente.reduce((acc, c) => acc + calcularRepasse(c).taxaCentavos, 0);
        const repasse = contribuicoesCliente.reduce((acc, c) => acc + calcularRepasse(c).repasseCentavos, 0);
        const email   = todosOsUsuarios[uid] || uid;

        // Quantos itens da lista já foram 100% presenteados vs ainda em andamento
        const itensFechados    = itens.filter(p => p.disponivel === false && p.presenteado_por).length;
        const itensEmAndamento = itens.filter(p => Array.isArray(p.contribuicoes) && p.contribuicoes.length > 0 && p.disponivel !== false).length;

        document.getElementById('modalClienteNome').textContent = email;
        document.getElementById('modalClienteGrid').innerHTML = `
            <div class="detalhe-item"><div class="detalhe-item-label">Itens cadastrados</div><div class="detalhe-item-valor roxo">${itens.length}</div></div>
            <div class="detalhe-item"><div class="detalhe-item-label">Presentes fechados</div><div class="detalhe-item-valor verde">${itensFechados}${itensEmAndamento > 0 ? ` <span style="font-size:11px;color:var(--text3);font-weight:400;">(+${itensEmAndamento} em andamento)</span>` : ''}</div></div>
            <div class="detalhe-item"><div class="detalhe-item-label">Total recebido</div><div class="detalhe-item-valor">${brl(total)}</div></div>
            <div class="detalhe-item"><div class="detalhe-item-label">Meu lucro (${taxaGlobal}%)</div><div class="detalhe-item-valor amarelo">${brl(lucro)}</div></div>
            <div class="detalhe-item" style="grid-column:span 2"><div class="detalhe-item-label">A repassar ao cliente</div><div class="detalhe-item-valor verde">${brl(repasse)}</div></div>
        `;

        const presentesEl = document.getElementById('modalClientePresentes');
        if (contribuicoesCliente.length === 0) {
            presentesEl.innerHTML = '<p style="color:var(--text3); font-size:13px; padding:12px 0;">Nenhuma contribuição recebida ainda.</p>';
        } else {
            presentesEl.innerHTML = contribuicoesCliente.map(c => {
                const p = c.produto;
                const comprovanteHTML = (c.comprovanteUrl && /^https:\/\//i.test(c.comprovanteUrl))
                    ? `<a href="${escapeHTML(c.comprovanteUrl)}" target="_blank" rel="noopener noreferrer" style="color:#a78bfa;">🧾 comprovante</a>`
                    : `<span style="color:var(--text3);">sem comprovante</span>`;

                // Indica claramente se é cota parcial, e se o item já fechou ou não
                let statusChip = '';
                if (Array.isArray(c.cotas) && c.cotas.length > 0) {
                    const totalCotas = parseInt(p.cotas_total || 0);
                    const ocupadas = Array.isArray(p.cotas_ocupadas) ? p.cotas_ocupadas.length : 0;
                    const fechado = p.disponivel === false;
                    statusChip = `<span class="chip ${fechado ? 'chip-verde' : 'chip-amarelo'}" style="font-size:10px;">
                        ${fechado ? '✓ completo' : `cota ${ocupadas}/${totalCotas}`}
                    </span>`;
                }

                return `<div class="presente-mini">
                    <div>
                        <div class="presente-mini-nome">${escapeHTML(p.titulo || '—')} ${statusChip}</div>
                        <div class="presente-mini-quem">por ${escapeHTML(c.nome || '—')} · ${fmtDate(c.data)} · ${comprovanteHTML}</div>
                    </div>
                    <div class="presente-mini-valor">${brl(c.valorCentavos)}</div>
                </div>`;
            }).join('');
        }

        document.getElementById('modalCliente').classList.add('ativo');
    };

    document.getElementById('btnFecharModalCliente').addEventListener('click', () => {
        document.getElementById('modalCliente').classList.remove('ativo');
    });

    document.getElementById('modalCliente').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalCliente')) {
            document.getElementById('modalCliente').classList.remove('ativo');
        }
    });

    // ================================================================
    // RELATÓRIO
    // ================================================================
    // ✅ FONTE ÚNICA DE VERDADE para o cálculo financeiro de uma contribuição.
    // Antes essa conta (taxa, lucro, repasse) era reescrita em cada função
    // (relatório, CSV, XLSX, modal do cliente, tabela de clientes, dashboard)
    // — o que já causou bug real: quando o sistema de cotas mudou a regra,
    // alguns lugares foram atualizados e outros não, gerando saldo errado.
    // Agora TODO lugar que precisa desse cálculo chama essa função — só existe
    // um lugar pra corrigir/entender a regra de taxa.
    // ✅ CORRIGIDO: quando "convidado paga a taxa", o valor gravado na
    // contribuição já vem BRUTO (com a taxa somada em cima — é assim que o
    // convidado é cobrado o valor certo). Antes esse valor bruto era exibido
    // direto como "repasse" (o que você recebe), inflando o valor mostrado.
    // Agora, nesse modo, o valor líquido é obtido revertendo a taxa embutida
    // (divide por 1+taxa%), em vez de simplesmente repetir o valor bruto.
    function calcularRepasse(contribuicao) {
        const p         = contribuicao.produto;
        const valorBruto = contribuicao.valorCentavos; // o que o convidado de fato pagou
        const quemPaga  = p.taxa_quem_paga || 'convidado';
        const taxaPerc  = parseFloat(p.taxa_percentual != null ? p.taxa_percentual : taxaGlobal);

        let taxaCentavos, repasseCentavos;
        if (quemPaga === 'convidado') {
            // valorBruto = preço + taxa já embutida → reverte pra achar o líquido
            repasseCentavos = Math.round(valorBruto / (1 + taxaPerc / 100));
            taxaCentavos = valorBruto - repasseCentavos;
        } else {
            // valorBruto = preço cheio (sem nada embutido) → desconta a taxa
            taxaCentavos = Math.round(valorBruto * taxaPerc / 100);
            repasseCentavos = valorBruto - taxaCentavos;
        }

        return { valor: valorBruto, quemPaga, taxaPerc, taxaCentavos, repasseCentavos };
    }

    // ✅ NOVO: junta as contribuições de cada produto (cada pagamento — cota
    // parcial ou produto inteiro) numa lista única "achatada". Mantém
    // compatibilidade com presentes antigos, de antes do sistema de
    // contribuições existir (só tinham presenteado_por + disponivel:false).
    function obterTodasContribuicoesAdmin() {
        const lista = [];
        todosOsProdutos.forEach(p => {
            if (Array.isArray(p.contribuicoes) && p.contribuicoes.length > 0) {
                p.contribuicoes.forEach((c, idx) => {
                    lista.push({
                        id: p.id + '#' + idx,
                        produto: p,
                        usuario_id: p.usuario_id,
                        titulo: p.titulo,
                        nome: c.nome,
                        valorCentavos: parseInt(c.valor_centavos || 0),
                        data: c.data,
                        comprovanteUrl: c.comprovante_url,
                        cotas: c.cotas || null,
                    });
                });
            } else if (p.presenteado_por && p.disponivel === false) {
                lista.push({
                    id: p.id + '#0',
                    produto: p,
                    usuario_id: p.usuario_id,
                    titulo: p.titulo,
                    nome: p.presenteado_por,
                    valorCentavos: parseInt(p.preco_original_centavos || p.preco_centavos || 0),
                    data: p.data_presente,
                    comprovanteUrl: p.comprovante_url,
                    cotas: null,
                });
            }
        });
        return lista;
    }

    function obterEntreguesFiltrados() {
        let entregues = obterTodasContribuicoesAdmin()
            .sort((a, b) => (toMsAdmin(b.data)) - (toMsAdmin(a.data)));

        const termo = (document.getElementById('buscaRelatorio')?.value || '').trim().toLowerCase();
        const dataIni = document.getElementById('dataInicioRelatorio')?.value;
        const dataFim = document.getElementById('dataFimRelatorio')?.value;
        const uidFiltro = document.getElementById('filtroClienteRelatorio')?.value || '';

        // Filtro por cliente específico
        if (uidFiltro) {
            entregues = entregues.filter(c => c.usuario_id === uidFiltro);
        }

        if (termo) {
            entregues = entregues.filter(c => {
                const email = (todosOsUsuarios[c.usuario_id] || '').toLowerCase();
                const titulo = (c.titulo || '').toLowerCase();
                const convidado = (c.nome || '').toLowerCase();
                return email.includes(termo) || titulo.includes(termo) || convidado.includes(termo);
            });
        }
        if (dataIni) {
            const ini = new Date(dataIni + 'T00:00:00');
            entregues = entregues.filter(c => {
                const d = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : null);
                return d && d >= ini;
            });
        }
        if (dataFim) {
            const fim = new Date(dataFim + 'T23:59:59');
            entregues = entregues.filter(c => {
                const d = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : null);
                return d && d <= fim;
            });
        }
        return entregues;
    }

    function toMsAdmin(ts) {
        if (!ts) return 0;
        if (ts.seconds) return ts.seconds * 1000;
        if (typeof ts.toDate === 'function') return ts.toDate().getTime();
        return new Date(ts).getTime() || 0;
    }

    function atualizarRelatorio() {
        const entregues = obterEntreguesFiltrados();

        const tbody = document.getElementById('tabelaRelatorio');
        if (!tbody) return;

        if (entregues.length === 0) {
            tbody.innerHTML = '<tr class="loading-row"><td colspan="10">Nenhum presente encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = entregues.map(c => {
            const p            = c.produto;
            const { valor: orig, quemPaga: taxaDesse, taxaPerc, taxaCentavos: lucro, repasseCentavos: repasse } = calcularRepasse(c);
            const email        = todosOsUsuarios[c.usuario_id] || c.usuario_id?.slice(0,10) + '...';
            const chipTaxa     = taxaDesse === 'convidado'
                ? '<span class="chip chip-amarelo">Convidado</span>'
                : '<span class="chip chip-roxo">Cliente</span>';
            // ✅ NOVO: link do comprovante, só renderiza se for https válido
            const comprovanteHTML = (c.comprovanteUrl && /^https:\/\//i.test(c.comprovanteUrl))
                ? `<a href="${escapeHTML(c.comprovanteUrl)}" target="_blank" rel="noopener noreferrer" style="color:#a78bfa;text-decoration:underline;">🧾 Ver</a>`
                : '<span style="color:var(--text3);">—</span>';
            // ✅ NOVO: indica se foi pagamento de cota parcial
            let tituloExibido = escapeHTML(p.titulo || '—');
            if (Array.isArray(c.cotas) && c.cotas.length > 0) {
                const totalCotas = parseInt(p.cotas_total || 0);
                tituloExibido += ` <span style="color:var(--text3);font-size:11px;">(cota ${escapeHTML(c.cotas.join(', '))}${totalCotas ? ' de ' + totalCotas : ''})</span>`;
            }

            return `<tr>
                <td><strong>${escapeHTML(email)}</strong></td>
                <td>${tituloExibido}</td>
                <td>${escapeHTML(c.nome || '—')}</td>
                <td>${brl(orig)}</td>
                <td>${chipTaxa}</td>
                <td>${taxaPerc}%</td>
                <td><span class="chip chip-verde">${brl(lucro)}</span></td>
                <td>${brl(repasse)}</td>
                <td>${fmtDate(c.data)}</td>
                <td>${comprovanteHTML}</td>
            </tr>`;
        }).join('');
    }


    document.getElementById('buscaRelatorio')?.addEventListener('input', atualizarRelatorio);
    document.getElementById('dataInicioRelatorio')?.addEventListener('change', atualizarRelatorio);
    document.getElementById('dataFimRelatorio')?.addEventListener('change', atualizarRelatorio);
    document.getElementById('btnLimparFiltrosRelatorio')?.addEventListener('click', () => {
        document.getElementById('buscaRelatorio').value = '';
        document.getElementById('dataInicioRelatorio').value = '';
        document.getElementById('dataFimRelatorio').value = '';
        atualizarRelatorio();
    });

    // ================================================================
    // SAQUES
    // ================================================================
    function renderizarSaques(saques) {
        const container = document.getElementById('listaSaques');

        if (saques.length === 0) {
            container.innerHTML = `<div class="estado-vazio"><div class="icon">📭</div>Nenhuma solicitação de saque no momento.</div>`;
            return;
        }

        container.innerHTML = saques.map(s => {
            const totalBrl   = brl(parseInt(s.total_centavos || 0));
            const lucroB     = brl(parseInt(s.lucro_centavos || 0));
            const repasseB   = brl(parseInt(s.repasse_centavos || 0));
            const wppNum     = (s.whatsapp || '').replace(/\D/g, '');
            const wppLink    = `https://wa.me/55${wppNum}?text=${encodeURIComponent(`Olá ${s.nome || 'cliente'}! Seu saque foi processado. ✅`)}`;
            const statusChip = s.status === 'pago'
                ? '<span class="chip chip-verde">Pago</span>'
                : '<span class="chip chip-amarelo">Pendente</span>';

            return `<div class="saque-card">
                <div>
                    <div class="saque-nome">${escapeHTML(s.nome || '—')} ${statusChip}</div>
                    <div class="saque-info">
                        <div class="saque-info-item">
                            <span class="saque-info-label">PIX / CPF</span>
                            <span class="saque-info-valor">${s.cpf || s.pix || '—'}</span>
                        </div>
                        <div class="saque-info-item">
                            <span class="saque-info-label">Total movimentado</span>
                            <span class="saque-info-valor">${totalBrl}</span>
                        </div>
                        <div class="saque-info-item">
                            <span class="saque-info-label">Meu lucro</span>
                            <span class="saque-info-valor amarelo">${lucroB}</span>
                        </div>
                        <div class="saque-info-item">
                            <span class="saque-info-label">A repassar</span>
                            <span class="saque-info-valor verde">${repasseB}</span>
                        </div>
                        <div class="saque-info-item">
                            <span class="saque-info-label">WhatsApp</span>
                            <span class="saque-info-valor">${s.whatsapp || '—'}</span>
                        </div>
                        <div class="saque-info-item">
                            <span class="saque-info-label">Data solicitação</span>
                            <span class="saque-info-valor">${fmtDate(s.data_solicitacao)}</span>
                        </div>
                        ${s.status === 'pago' ? `<div class="saque-info-item">
                            <span class="saque-info-label">Data pagamento</span>
                            <span class="saque-info-valor verde">${fmtDate(s.data_pagamento)}</span>
                        </div>` : ''}
                    </div>
                    ${s.status === 'pago' && s.observacao_pagamento ? `<div style="margin-top:10px; padding:8px 10px; background:var(--bg); border-radius:8px; font-size:12px; color:var(--text3);">
                        📝 ${s.observacao_pagamento}
                    </div>` : ''}
                </div>
                <div class="saque-acoes">
                    ${s.status !== 'pago' ? `<button class="btn-tabela btn-marcar-pago" data-saque-id="${s.id}" onclick="marcarSaqueComoPago('${s.id}')">✅ Marcar como pago</button>` : ''}
                    ${wppNum ? `<a href="${wppLink}" target="_blank" class="btn-tabela btn-wpp">💬 WhatsApp</a>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    // ══════════════════════════════════════════════════════════
    // BADGE SAQUES PENDENTES
    // ══════════════════════════════════════════════════════════
    function atualizarBadgeSaques(saques) {
        const pendentes = saques.filter(s => s.status !== 'pago');
        const badge = document.getElementById('badgeSaquesPendentes');
        if (!badge) return;
        if (pendentes.length > 0) {
            badge.textContent = pendentes.length > 99 ? '99+' : pendentes.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    // ══════════════════════════════════════════════════════════
    // RESUMO FINANCEIRO DOS SAQUES
    // ══════════════════════════════════════════════════════════
    function atualizarResumoSaques(saques) {
        const pendentes = saques.filter(s => s.status !== 'pago');
        const pagos     = saques.filter(s => s.status === 'pago');

        const totalPendente = pendentes.reduce((a, s) => a + parseInt(s.repasse_centavos || 0), 0);
        const totalPago     = pagos.reduce((a, s) => a + parseInt(s.repasse_centavos || 0), 0);
        const totalLucro    = saques.reduce((a, s) => a + parseInt(s.lucro_centavos || 0), 0);

        const el = (id) => document.getElementById(id);
        if (el('saqPendente'))   el('saqPendente').textContent   = brl(totalPendente);
        if (el('saqPendenteQtd')) el('saqPendenteQtd').textContent = `${pendentes.length} solicitação(ões)`;
        if (el('saqPago'))       el('saqPago').textContent       = brl(totalPago);
        if (el('saqPagoQtd'))    el('saqPagoQtd').textContent    = `${pagos.length} repasse(s) realizado(s)`;
        if (el('saqLucro'))      el('saqLucro').textContent      = brl(totalLucro);
    }

    // ══════════════════════════════════════════════════════════
    // FILTRO POR STATUS DOS SAQUES
    // ══════════════════════════════════════════════════════════
    document.getElementById('filtroStatusSaque')?.addEventListener('change', function() {
        const filtro = this.value;
        const todos = todosOsSaques;
        const filtrados = filtro ? todos.filter(s => s.status === filtro) : todos;
        renderizarSaques(filtrados);
        document.getElementById('labelTotalSaques').textContent = filtrados.length + ' solicitação(ões)';
    });

    // ══════════════════════════════════════════════════════════
    // MARCAR TODOS PENDENTES COMO PAGO
    // ══════════════════════════════════════════════════════════
    document.getElementById('btnMarcarTodosPago')?.addEventListener('click', async () => {
        const pendentes = todosOsSaques.filter(s => s.status !== 'pago');
        if (pendentes.length === 0) { toast('Não há saques pendentes.'); return; }
        if (!confirm(`Marcar ${pendentes.length} saque(s) como pago? Esta ação não pode ser desfeita.`)) return;
        try {
            const batch = writeBatch(db);
            pendentes.forEach(s => {
                batch.update(doc(db, "saques", s.id), {
                    status: "pago",
                    data_pagamento: serverTimestamp()
                });
            });
            await batch.commit();
            toast(`✅ ${pendentes.length} saque(s) marcado(s) como pago!`);
        } catch(e) {
            console.error(e);
            toast('❌ Erro ao atualizar saques.');
        }
    });

    // ══════════════════════════════════════════════════════════
    // RESUMO FINANCEIRO VISÃO GERAL
    // ══════════════════════════════════════════════════════════
    function atualizarResumoFinanceiro(contribuicoes, saques) {
        // Total movimentado = soma do valor realmente pago em cada contribuição
        // (cota parcial inclusa), não o preço cheio do produto.
        const totalMovimentado = contribuicoes.reduce((a, c) => a + c.valorCentavos, 0);

        // Já sacado = repasses já pagos
        const jaSacado = saques
            .filter(s => s.status === 'pago')
            .reduce((a, s) => a + parseInt(s.repasse_centavos || 0), 0);

        // Aguardando saque = repasses pendentes
        const aguardando = saques
            .filter(s => s.status !== 'pago')
            .reduce((a, s) => a + parseInt(s.repasse_centavos || 0), 0);

        // Minha receita = meu lucro acumulado nos saques já feitos
        const minhaReceita = saques
            .filter(s => s.status === 'pago')
            .reduce((a, s) => a + parseInt(s.lucro_centavos || 0), 0);

        const el = (id) => document.getElementById(id);
        if (el('resumoTotalMovimentado')) el('resumoTotalMovimentado').textContent = brl(totalMovimentado);
        if (el('resumoJaSacado'))         el('resumoJaSacado').textContent         = brl(jaSacado);
        if (el('resumoAguardando'))       el('resumoAguardando').textContent       = brl(aguardando);
        if (el('resumoMinhaReceita'))     el('resumoMinhaReceita').textContent     = brl(minhaReceita);
    }

    // ══════════════════════════════════════════════════════════
    // GRÁFICO DE LUCRO MENSAL
    // ══════════════════════════════════════════════════════════
    function renderizarGraficoLucroMensal(contribuicoes) {
        const container = document.getElementById('graficoLucroMensal');
        if (!container) return;

        const hoje = new Date();
        const meses = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
            meses.push({ ano: d.getFullYear(), mes: d.getMonth(), lucro: 0 });
        }

        contribuicoes.forEach(c => {
            const d = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : null);
            if (!d) return;
            const alvo = meses.find(m => m.ano === d.getFullYear() && m.mes === d.getMonth());
            if (alvo) {
                alvo.lucro += calcularRepasse(c).taxaCentavos;
            }
        });

        const maxLucro = Math.max(1, ...meses.map(m => m.lucro));
        const nomeMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

        if (contribuicoes.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:13px; padding:30px 0;">Nenhum dado ainda.</p>';
            return;
        }

        container.innerHTML = `<div class="grafico-barras">
            ${meses.map(m => {
                const pct = Math.round((m.lucro / maxLucro) * 100);
                const label = brl(m.lucro);
                return `<div class="grafico-coluna">
                    <div class="grafico-valor" style="color:#34d399;">${m.lucro > 0 ? label : ''}</div>
                    <div class="grafico-barra" style="height:${Math.max(pct,3)}%; background:linear-gradient(180deg,#34d399,#059669);"></div>
                    <div class="grafico-label">${nomeMes[m.mes]}</div>
                </div>`;
            }).join('')}
        </div>`;
    }

    // ══════════════════════════════════════════════════════════
    // GRÁFICO DE PIZZA POR CATEGORIA (CSS puro)
    // ══════════════════════════════════════════════════════════
    function renderizarGraficoCategorias(contribuicoes) {
        const container = document.getElementById('graficoCategorias');
        if (!container) return;

        if (contribuicoes.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text3); font-size:13px; padding:20px 0;">Nenhum dado ainda.</p>';
            return;
        }

        // Agrupar por categoria
        const cats = {};
        contribuicoes.forEach(c => {
            const cat = c.produto.categoria || 'Sem categoria';
            if (!cats[cat]) cats[cat] = { qtd: 0, valor: 0 };
            cats[cat].qtd++;
            cats[cat].valor += c.valorCentavos;
        });

        const total = contribuicoes.length;
        const cores = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16'];
        const items = Object.entries(cats).sort((a,b) => b[1].qtd - a[1].qtd);

        // Barras horizontais (mais legível que pizza em CSS puro)
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px; max-width:500px;">
                ${items.map(([cat, dados], i) => {
                    const pct = Math.round((dados.qtd / total) * 100);
                    const cor = cores[i % cores.length];
                    return `<div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="font-size:12px; color:var(--text); font-weight:500;">${cat}</span>
                            <span style="font-size:12px; color:var(--text3);">${dados.qtd} presente${dados.qtd !== 1 ? 's' : ''} · ${pct}%</span>
                        </div>
                        <div style="height:8px; background:var(--surface2); border-radius:4px; overflow:hidden;">
                            <div style="height:100%; width:${pct}%; background:${cor}; border-radius:4px; transition:width .4s ease;"></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div style="margin-top:16px; font-size:11px; color:var(--text3);">
                Total de ${total} presente${total !== 1 ? 's' : ''} pago${total !== 1 ? 's' : ''}
            </div>`;
    }

    // ══════════════════════════════════════════════════════════
    // INDICADOR DE TENDÊNCIA NOS CARDS
    // ══════════════════════════════════════════════════════════
    function calcularTendencia(contribuicoes) {
        const hoje = new Date();
        const mesAtual  = { ano: hoje.getFullYear(), mes: hoje.getMonth() };
        const mesAnterior = hoje.getMonth() === 0
            ? { ano: hoje.getFullYear() - 1, mes: 11 }
            : { ano: hoje.getFullYear(), mes: hoje.getMonth() - 1 };

        const contarMes = (m) => contribuicoes.filter(c => {
            const d = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : null);
            return d && d.getFullYear() === m.ano && d.getMonth() === m.mes;
        }).length;

        const atual    = contarMes(mesAtual);
        const anterior = contarMes(mesAnterior);

        if (anterior === 0) return null;
        return Math.round(((atual - anterior) / anterior) * 100);
    }

    function exibirTendencia(elementId, pct) {
        if (pct === null) return;
        const el = document.getElementById(elementId);
        if (!el) return;
        const sinal = pct >= 0 ? '↑' : '↓';
        const cor   = pct >= 0 ? '#34d399' : '#f87171';
        const sub = el.closest('.card-metrica')?.querySelector('.metrica-sub');
        if (sub) {
            sub.innerHTML += ` <span style="color:${cor}; font-weight:700;">${sinal}${Math.abs(pct)}% vs mês ant.</span>`;
        }
    }

    // ══════════════════════════════════════════════════════════
    // EXPORTAR XLSX (SheetJS)
    // ══════════════════════════════════════════════════════════
    document.getElementById('btnExportarXLSX')?.addEventListener('click', async () => {
        try {
            if (!window.XLSX) {
                await new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                    s.onload = res; s.onerror = rej;
                    document.head.appendChild(s);
                });
            }
            const entregues = obterTodasContribuicoesAdmin();
            if (entregues.length === 0) { toast('Nenhum dado para exportar.'); return; }

            const rows = entregues.map(c => {
                const p       = c.produto;
                const { valor: orig, quemPaga, taxaCentavos: lucro, repasseCentavos: repasse } = calcularRepasse(c);
                const d = c.data?.toDate ? c.data.toDate() : (c.data ? new Date(toMsAdmin(c.data)) : null);
                return {
                    'Presenteador':   c.nome || '—',
                    'Presente':       p.titulo || '—',
                    'Cota':           c.cotas ? c.cotas.join(', ') : '—',
                    'Categoria':      p.categoria || '—',
                    'Valor (R$)':     (orig / 100).toFixed(2).replace('.', ','),
                    'Meu lucro (R$)': (lucro / 100).toFixed(2).replace('.', ','),
                    'Repasse (R$)':   (repasse / 100).toFixed(2).replace('.', ','),
                    'Data':           d ? d.toLocaleDateString('pt-BR') : '—',
                    'Quem paga taxa': quemPaga,
                };
            });

            const ws = window.XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{wch:22},{wch:30},{wch:12},{wch:18},{wch:14},{wch:16},{wch:14},{wch:14},{wch:16}];
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Presentes');

            // Aba resumo
            const totalOrig  = entregues.reduce((a,c)=>a+c.valorCentavos,0);
            const lucroTotal = entregues.reduce((a,c)=>a+calcularRepasse(c).taxaCentavos,0);
            const wsR = window.XLSX.utils.json_to_sheet([
                { 'Métrica': 'Total de presentes pagos', 'Valor': entregues.length },
                { 'Métrica': 'Total movimentado (R$)', 'Valor': (totalOrig/100).toFixed(2).replace('.',',') },
                { 'Métrica': 'Meu lucro total (R$)', 'Valor': (lucroTotal/100).toFixed(2).replace('.',',') },
                { 'Métrica': 'Data de exportação', 'Valor': new Date().toLocaleString('pt-BR') },
            ]);
            wsR['!cols'] = [{wch:35},{wch:20}];
            window.XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');

            window.XLSX.writeFile(wb, `relatorio-${new Date().toISOString().slice(0,10)}.xlsx`);
            toast('✅ XLSX exportado!');
        } catch(e) { console.error(e); toast('❌ Erro ao exportar XLSX.'); }
    });

    // ══════════════════════════════════════════════════════════
    // FILTRO POR CLIENTE NO RELATÓRIO
    // ══════════════════════════════════════════════════════════
    function popularFiltroClientes() {
        const sel = document.getElementById('filtroClienteRelatorio');
        if (!sel) return;
        const uids = [...new Set(todosOsProdutos.map(p => p.usuario_id).filter(Boolean))];
        // Buscar nome de cada cliente nos perfis já carregados
        sel.innerHTML = '<option value="">Todos os clientes</option>';
        uids.forEach(uid => {
            const opt = document.createElement('option');
            opt.value = uid;
            opt.textContent = uid.slice(0, 12) + '...'; // fallback — será substituído se tiver nome
            sel.appendChild(opt);
        });
    }

    document.getElementById('filtroClienteRelatorio')?.addEventListener('change', function() {
        atualizarRelatorio();
    });

    // COMUNICADOS
    const listaComunicadosEl = document.getElementById('listaComunicados');
    function escutarComunicados() {
        const q = query(collection(db, "avisos_globais"), orderBy("criado_em", "desc"));
        onSnapshot(q, snap => {
            if (!listaComunicadosEl) return;
            if (snap.empty) { listaComunicadosEl.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:16px;">Nenhum comunicado enviado ainda.</p>'; return; }
            const icones = { taxa:'💸', instabilidade:'⚠️', comprovante:'📄', info:'📢' };
            listaComunicadosEl.innerHTML = '';
            snap.forEach(d => {
                const a = d.data(), id = d.id;
                const dt = a.criado_em ? (a.criado_em.toDate ? a.criado_em.toDate() : new Date(a.criado_em)).toLocaleString('pt-BR') : '—';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border1);';
                row.innerHTML = `<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;">${icones[a.tipo]||'📢'} ${escapeHTML(a.titulo||'—')}${a.fixo?'<span style="font-size:10px;background:rgba(139,92,246,0.25);color:#c4a5ff;border-radius:4px;padding:1px 6px;margin-left:6px;">fixo</span>':''}</div><div style="font-size:12px;color:var(--text2);margin-bottom:4px;white-space:pre-wrap;">${escapeHTML(a.mensagem||'')}</div><div style="font-size:11px;color:var(--text3);">📅 ${dt}</div></div><button onclick="excluirComunicado('${id}')" style="flex-shrink:0;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.28);color:#f87171;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">🗑 Excluir</button>`;
                listaComunicadosEl.appendChild(row);
            });
        }, err => console.error("Erro comunicados:", err));
    }
    document.getElementById('btnEnviarComunicado')?.addEventListener('click', async () => {
        const titulo = document.getElementById('comunicadoTitulo')?.value.trim();
        const mensagem = document.getElementById('comunicadoMensagem')?.value.trim();
        const tipo = document.getElementById('comunicadoTipo')?.value || 'info';
        const fixo = document.getElementById('comunicadoFixo')?.value === 'true';
        if (!titulo) { toast('⚠️ Informe o título.'); return; }
        if (!mensagem) { toast('⚠️ Informe a mensagem.'); return; }
        try {
            await addDoc(collection(db, "avisos_globais"), { tipo, titulo, mensagem, fixo, criado_em: serverTimestamp() });
            document.getElementById('comunicadoTitulo').value = '';
            document.getElementById('comunicadoMensagem').value = '';
            toast('✅ Comunicado enviado!');
        } catch(e) { console.error(e); toast('❌ Erro ao enviar.'); }
    });
    window.excluirComunicado = async (id) => {
        if (!confirm('Excluir este comunicado?')) return;
        try { await deleteDoc(doc(db, "avisos_globais", id)); toast('🗑 Excluído.'); }
        catch(e) { toast('❌ Erro ao excluir.'); }
    };
    document.querySelector('[data-secao="comunicados"]')?.addEventListener('click', () => escutarComunicados());

      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("/sw.js")
            .then(() => console.log("SW registrado"))
            .catch(err => console.error("SW erro:", err));
        });
      }
