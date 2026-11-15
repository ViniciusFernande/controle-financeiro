// Cole aqui as credenciais do seu projeto Firebase
// (Firebase Console -> Configurações do Projeto -> Seus aplicativos -> SDK da Web)
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAUdoe-emFdv4-_FI94P738aVZFEEoDoa8",
  authDomain: "controle-financeiro-3867c.firebaseapp.com",
  projectId: "controle-financeiro-3867c",
  storageBucket: "controle-financeiro-3867c.firebasestorage.app",
  messagingSenderId: "460982227719",
  appId: "1:460982227719:web:9c940a6c2421d585fa6ba2"
};

function isFirebaseConfigured() {
  return (
    window.FIREBASE_CONFIG &&
    window.FIREBASE_CONFIG.apiKey &&
    !window.FIREBASE_CONFIG.apiKey.includes('COLE_SUA_API_KEY') &&
    window.FIREBASE_CONFIG.projectId &&
    !window.FIREBASE_CONFIG.projectId.includes('SEU_PROJETO')
  );
}
