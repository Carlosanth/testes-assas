/**
 * admin-security-fixes.js
 * 
 * INSTRUÇÕES:
 * 1. Adicione este arquivo antes do main script do admin.html
 * 2. Substitua os padrões perigosos com as funções aqui
 * 
 * VERSÃO: 1.0
 * CORREÇÕES: XSS em comunicados, categorias, tabelas
 */

import { escapeHTML, sanitizarDados } from './sanitize-utils.js';

// ════════════════════════════════════════════════════════════
// RENDERIZADOR SEGURO DE COMUNICADOS
// ════════════════════════════════════════════════════════════

export function renderizarComunicadoSeguro(comunicado, id, container) {
  /**
   * Substitui:
   * row.innerHTML = `<div>${a.titulo||'—'}...${a.mensagem||''}</div>`;
   * 
   * Por:
   * renderizarComunicadoSeguro(comunicado, id, listaComunicadosEl);
   */

  const icones = {
    taxa: '💸',
    instabilidade: '⚠️',
    comprovante: '📄',
    info: '📢'
  };

  // Elementos
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border1);';

  // ─ Conteúdo esquerdo
  const conteudo = document.createElement('div');
  conteudo.style.cssText = 'flex:1;min-width:0;';

  // ─ Título (com ícone)
  const titulo = document.createElement('div');
  titulo.style.cssText = 'font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;';
  
  const iconSpan = document.createElement('span');
  iconSpan.textContent = icones[comunicado.tipo] || '📢';
  iconSpan.style.marginRight = '4px';
  
  const tituloText = document.createElement('span');
  tituloText.textContent = comunicado.titulo || '—'; // ✓ SEGURO
  
  titulo.appendChild(iconSpan);
  titulo.appendChild(tituloText);

  // ─ Badge "fixo" (se aplicável)
  if (comunicado.fixo) {
    const badge = document.createElement('span');
    badge.style.cssText = 'font-size:10px;background:rgba(139,92,246,0.25);color:#c4a5ff;border-radius:4px;padding:1px 6px;margin-left:6px;';
    badge.textContent = 'fixo';
    titulo.appendChild(badge);
  }

  // ─ Mensagem
  const mensagem = document.createElement('div');
  mensagem.style.cssText = 'font-size:12px;color:var(--text2);margin-bottom:4px;white-space:pre-wrap;word-wrap:break-word;';
  mensagem.textContent = comunicado.mensagem || ''; // ✓ SEGURO

  // ─ Data
  const data = document.createElement('div');
  data.style.cssText = 'font-size:11px;color:var(--text3);';
  const dt = comunicado.criado_em 
    ? (comunicado.criado_em.toDate ? comunicado.criado_em.toDate() : new Date(comunicado.criado_em))
        .toLocaleString('pt-BR') 
    : '—';
  data.textContent = '📅 ' + dt; // ✓ SEGURO

  conteudo.appendChild(titulo);
  conteudo.appendChild(mensagem);
  conteudo.appendChild(data);

  // ─ Botão delete (direita)
  const btnDelete = document.createElement('button');
  btnDelete.style.cssText = 'flex-shrink:0;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.28);color:#f87171;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;';
  btnDelete.textContent = '🗑 Excluir';
  btnDelete.onclick = () => excluirComunicado(id); // ✓ Função nomeada

  row.appendChild(conteudo);
  row.appendChild(btnDelete);
  container.appendChild(row);
}

// ════════════════════════════════════════════════════════════
// RENDERIZADOR SEGURO DE CATEGORIAS
// ════════════════════════════════════════════════════════════

export function renderizarCategoriasSeguras(categorias, container, onClickFn) {
  /**
   * Substitui:
   * grid.innerHTML = todasCategoriasLP.map(cat => `<div>${cat.nome}</div>`).join('');
   * 
   * Por:
   * renderizarCategoriasSeguras(categorias, gridEl, selecionarCategoria);
   */

  container.innerHTML = ''; // Limpa

  if (!categorias || categorias.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lp-vazio';
    empty.textContent = 'Nenhuma categoria criada ainda. Clique em "Nova categoria" para começar.';
    container.appendChild(empty);
    return;
  }

  categorias.forEach((cat, idx) => {
    const card = document.createElement('div');
    card.className = 'lp-categoria-card';
    card.style.cssText = 'padding:16px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;cursor:pointer;';

    const nome = document.createElement('div');
    nome.style.cssText = 'font-weight:600;color:var(--text);margin-bottom:4px;';
    nome.textContent = cat.nome; // ✓ SEGURO

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:var(--text3);';
    desc.textContent = cat.descricao || 'Sem descrição'; // ✓ SEGURO

    card.appendChild(nome);
    card.appendChild(desc);
    card.onclick = () => onClickFn(cat, idx);

    container.appendChild(card);
  });
}

// ════════════════════════════════════════════════════════════
// RENDERIZADOR SEGURO DE TABELA
// ════════════════════════════════════════════════════════════

export function renderizarTabelaPresentes(presentes, container) {
  /**
   * Substitui:
   * tbody.innerHTML = ultimos.map(p => `<tr><td>${p.titulo}</td>...`).join('');
   * 
   * Por:
   * renderizarTabelaPresentes(presentes, tbodyEl);
   */

  container.innerHTML = ''; // Limpa

  if (!presentes || presentes.length === 0) {
    const tr = container.insertRow();
    const td = tr.insertCell();
    td.colSpan = 5;
    td.style.cssText = 'padding:20px;text-align:center;color:var(--text3);';
    td.textContent = 'Nenhum presente recebido ainda.';
    return;
  }

  presentes.forEach(p => {
    const tr = container.insertRow();

    // Coluna: Produto
    const tdTitulo = tr.insertCell();
    tdTitulo.style.cssText = 'padding:12px;border-bottom:1px solid var(--border);';
    tdTitulo.textContent = p.titulo || '—'; // ✓ SEGURO

    // Coluna: Convidado
    const tdConvidado = tr.insertCell();
    tdConvidado.style.cssText = 'padding:12px;border-bottom:1px solid var(--border);';
    tdConvidado.textContent = p.convidado_nome || '—'; // ✓ SEGURO

    // Coluna: Valor
    const tdValor = tr.insertCell();
    tdValor.style.cssText = 'padding:12px;border-bottom:1px solid var(--border);font-family:var(--mono);';
    tdValor.textContent = p.preco || 'N/A'; // ✓ SEGURO

    // Coluna: Data
    const tdData = tr.insertCell();
    tdData.style.cssText = 'padding:12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text3);';
    const dt = p.data_pagamento 
      ? (p.data_pagamento.toDate ? p.data_pagamento.toDate() : new Date(p.data_pagamento))
          .toLocaleDateString('pt-BR')
      : '—';
    tdData.textContent = dt; // ✓ SEGURO

    // Coluna: Status
    const tdStatus = tr.insertCell();
    tdStatus.style.cssText = 'padding:12px;border-bottom:1px solid var(--border);';
    const badge = document.createElement('span');
    badge.style.cssText = p.pago 
      ? 'background:rgba(16,185,129,0.2);color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;'
      : 'background:rgba(245,158,11,0.2);color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px;';
    badge.textContent = p.pago ? '✓ Pago' : '⏳ Pendente';
    tdStatus.appendChild(badge);
  });
}

// ════════════════════════════════════════════════════════════
// HELPER: Validar e sanitizar dados do Firestore
// ════════════════════════════════════════════════════════════

export function sanitizarComunicado(comunicado) {
  /**
   * Sanitiza um objeto de comunicado antes de renderizar
   */
  return {
    ...comunicado,
    titulo: escapeHTML(comunicado.titulo || ''),
    mensagem: escapeHTML(comunicado.mensagem || ''),
    tipo: comunicado.tipo || 'info',
    fixo: Boolean(comunicado.fixo)
  };
}

// ════════════════════════════════════════════════════════════
// HELPER: Parse seguro de valores Firestore
// ════════════════════════════════════════════════════════════

export function formatarData(timestamp) {
  if (!timestamp) return '—';
  try {
    const dt = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return dt.toLocaleString('pt-BR');
  } catch (e) {
    return '—';
  }
}

export function formatarMoeda(valor) {
  if (!valor) return 'N/A';
  try {
    const num = parseFloat(valor);
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num);
  } catch (e) {
    return String(valor);
  }
}
