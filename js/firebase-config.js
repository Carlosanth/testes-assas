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
    apiKey: "AIzaSyDcDs0qgXdOQRnMW2mClO1kCoYmbVfeThY",
    authDomain: "escolhaseupresente-35d3d.firebaseapp.com",
    projectId: "escolhaseupresente-35d3d",
    storageBucket: "escolhaseupresente-35d3d.firebasestorage.app",
    messagingSenderId: "374767023277",
    appId: "1:374767023277:web:0a6d45cb62136ba4040224",
    measurementId: "G-DJZFYZSGMV"
};

/**
 * URLs das Cloud Functions (opcional, para referência)
 * Se usar, importe também isto:
 * import { cloudFunctions } from "./js/firebase-config.js";
 */
export const cloudFunctions = {
    finalizarCompra: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/finalizarCompra",
    confirmarPagamento: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/confirmarPagamento",
    uploadImagem: "https://southamerica-east1-escolhaseupresente-35d3d.cloudfunctions.net/uploadImagem"
};
