/**
 * firebase-config.js
 * 
 * ⚠️ ARQUIVO COM API KEY DO FIREBASE
 * 
 * INSTRUÇÕES:
 * 1. Este arquivo agora fica em /js/firebase-config.js
 * 2. Importe em cada página HTML:
 *    import { firebaseConfig } from "./js/firebase-config.js";
 * 
 * 3. USE:
 *    const app = initializeApp(firebaseConfig);
 * 
 * ✅ SEGURANÇA:
 * - A API Key do Firebase é pública por design
 * - O que protege seus dados são as Firestore Rules
 * - NUNCA coloque este arquivo em .gitignore
 * - SEMPRE use Firestore Rules para validar acesso
 */

export const firebaseConfig = {
  apiKey: "AIzaSyC5rMhDhuflhf8CQIPq8HUh-0PBJsn72-4",
  authDomain: "testes-assas.firebaseapp.com",
  projectId: "testes-assas",
  storageBucket: "testes-assas.firebasestorage.app",
  messagingSenderId: "947838430288",
  appId: "1:947838430288:web:dbec94a751720b72c3b555",
  measurementId: "G-4YGY60EEXT"
};

/**
 * URLs das Cloud Functions (opcional, para referência)
 * Se usar, importe também isto:
 * import { cloudFunctions } from "./js/firebase-config.js";
 */
export const cloudFunctions = {
    finalizarCompra: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/finalizarCompra",
    confirmarPagamento: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/confirmarPagamento",
    uploadImagem: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/uploadImagem",
    // ✅ NOVO: cria a subconta Asaas do dono da lista a partir dos dados
    // salvos em perfis/{uid}. Troque o domínio pelo do projeto de
    // testes (assas-testes) enquanto estiver validando no Sandbox.
    criarSubcontaAsaas: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/criarSubcontaAsaas"
};
