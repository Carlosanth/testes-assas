/**
 * supabase-config.js
 *
 * Substitui js/firebase-config.js. Client único do Supabase reutilizado
 * em todas as páginas.
 *
 * ✅ SEGURANÇA:
 * - A publishable key é pública por design (como a apiKey do Firebase era)
 * - Quem protege os dados são as políticas RLS do Postgres, não essa chave
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabaseUrl = "https://lsiyldpjjhiblizqnliy.supabase.co";
const supabasePublishableKey = "sb_publishable_U83B1vuYeXEq1yvBlGAnaw_4OaOs_GG";

// ── Storage dinâmico da sessão ──────────────────────────────────────
// Permite respeitar o "Mantenha-me conectado" do login: quando desmarcado,
// a sessão vive só em sessionStorage (some ao fechar a aba/navegador).
// A PREFERÊNCIA em si (qual storage usar) precisa ficar em localStorage,
// senão não sobrevive nem para ser lida no carregamento da próxima página.
const CHAVE_PREFERENCIA_STORAGE = "esp-auth-storage-pref"; // 'local' | 'session'

export function definirPersistenciaSessao(manterConectado) {
    localStorage.setItem(CHAVE_PREFERENCIA_STORAGE, manterConectado ? "local" : "session");
}

function storageAtivo() {
    const pref = localStorage.getItem(CHAVE_PREFERENCIA_STORAGE) || "local";
    return pref === "session" ? window.sessionStorage : window.localStorage;
}

const storageDinamico = {
    getItem: (chave) => storageAtivo().getItem(chave),
    setItem: (chave, valor) => storageAtivo().setItem(chave, valor),
    removeItem: (chave) => storageAtivo().removeItem(chave),
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
        storage: storageDinamico,
        persistSession: true,
        autoRefreshToken: true,
    },
});

// ── Edge Functions (equivalente ao antigo cloudFunctions) ──────────
export const edgeFunctions = {
    finalizarCompra: `${supabaseUrl}/functions/v1/finalizarCompra`,
    confirmarPagamento: `${supabaseUrl}/functions/v1/confirmarPagamento`,
    criarSubconta: `${supabaseUrl}/functions/v1/criarSubconta`,
};

// ── Helper usado em toda página protegida ───────────────────────────
// Retorna o usuário logado (ou null) e o objeto de sessão completo,
// que contém o access_token a ser mandado nas chamadas às Edge Functions.
export async function usuarioAtual() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) return { user: null, session: null };
    return { user: data.session.user, session: data.session };
}
