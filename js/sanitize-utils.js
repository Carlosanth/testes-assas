/**
 * sanitize-utils.js
 * Funções auxiliares para sanitização segura de HTML
 * Previne ataques XSS ao inserir conteúdo do Firestore no DOM
 */

/**
 * Escapa caracteres HTML perigosos
 * @param {string} str - String a ser escapada
 * @returns {string} - String escapada
 */
export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, c => map[c]);
}

/**
 * Cria um elemento com texto seguro (sem risco de XSS)
 * @param {string} tag - Tag HTML (ex: 'div', 'span', 'p')
 * @param {string} textContent - Conteúdo de texto
 * @param {string} className - Classes CSS (opcional)
 * @returns {HTMLElement}
 */
export function criarElementoSeguro(tag, textContent, className = '') {
    const el = document.createElement(tag);
    el.textContent = textContent; // textContent é seguro, não interpreta HTML
    if (className) el.className = className;
    return el;
}

/**
 * Insere HTML sanitizado em um elemento
 * Remove tags perigosas como <script>, <iframe>, event handlers
 * @param {HTMLElement} element - Elemento alvo
 * @param {string} html - HTML a inserir
 */
export function insertHTMLSeguro(element, html) {
    // Se tiver DOMPurify disponível, usa
    if (typeof DOMPurify !== 'undefined') {
        element.innerHTML = DOMPurify.sanitize(html);
        return;
    }

    // Fallback: cria um elemento temporário e remove tags perigosas
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove scripts
    temp.querySelectorAll('script').forEach(el => el.remove());

    // Remove event handlers (on*)
    temp.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        });
    });

    // Copia o conteúdo sanitizado
    element.innerHTML = '';
    while (temp.firstChild) {
        element.appendChild(temp.firstChild);
    }
}

/**
 * Cria uma tabela segura a partir de dados do Firestore
 * @param {Array} dados - Array de objetos
 * @param {Array} colunas - Nomes das colunas a exibir
 * @returns {HTMLTableElement}
 */
export function criarTabelaSegura(dados, colunas) {
    const table = document.createElement('table');
    table.style.width = '100%';

    // Header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    colunas.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col; // seguro
        headerRow.appendChild(th);
    });

    // Body
    const tbody = table.createTBody();
    dados.forEach(row => {
        const tr = tbody.insertRow();
        colunas.forEach(col => {
            const td = tr.insertCell();
            const valor = row[col];
            // Converte para string segura
            td.textContent = valor !== null && valor !== undefined ? String(valor) : '—';
        });
    });

    return table;
}

/**
 * Renderiza um mapa de dados com HTML sanitizado (útil para listas)
 * @param {Array} dados - Array de objetos
 * @param {Function} renderFn - Função que recebe um item e retorna HTML string
 * @param {HTMLElement} container - Elemento container onde inserir
 */
export function renderListaSegura(dados, renderFn, container) {
    container.innerHTML = ''; // Limpa container

    dados.forEach((item, index) => {
        const html = renderFn(item, index);
        const wrapper = document.createElement('div');

        // Sanitiza o HTML retornado
        insertHTMLSeguro(wrapper, html);

        container.appendChild(wrapper);
    });
}

/**
 * Valida se uma URL é segura (não é javascript:, data:, etc)
 * @param {string} url - URL a validar
 * @returns {boolean}
 */
export function ehURLSegura(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return !(
        lower.startsWith('javascript:') ||
        lower.startsWith('data:') ||
        lower.startsWith('vbscript:')
    );
}

/**
 * Sanitiza atributos de dados (remove valores perigosos)
 * @param {Object} obj - Objeto com dados do Firestore
 * @param {Array} camposPerigosos - Campos a sanitizar (ex: ['titulo', 'mensagem'])
 * @returns {Object} - Objeto com dados sanitizados
 */
export function sanitizarDados(obj, camposPerigosos = []) {
    const sanitizado = { ...obj };

    camposPerigosos.forEach(campo => {
        if (sanitizado[campo] && typeof sanitizado[campo] === 'string') {
            // Escapa HTML
            sanitizado[campo] = escapeHTML(sanitizado[campo]);
        }
    });

    return sanitizado;
}
