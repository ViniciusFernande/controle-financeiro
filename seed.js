const STORAGE_PREFIX = 'fersales_financas_db_';
let firestoreUnsubscribe = null;

function stopFirestoreSync() {
  if (typeof firestoreUnsubscribe === 'function') {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }
}

function startFirestoreSync(user, onRemoteUpdate) {
  stopFirestoreSync();
  if (!user || !user.uid || typeof firebase === 'undefined' || !isFirebaseConfigured()) return;

  try {
    const firestore = firebase.firestore();
    const docRef = firestore.collection('users').doc(user.uid);
    const cacheKey = STORAGE_PREFIX + user.uid;

    firestoreUnsubscribe = docRef.onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        // Ignora eco da própria gravação local para não interromper digitação
        if (snap.metadata && snap.metadata.hasPendingWrites) return;

        const data = snap.data() || {};
        try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
        if (typeof onRemoteUpdate === 'function') {
          onRemoteUpdate(data);
        }
      },
      (err) => {
        console.error('Erro na sincronização em tempo real:', err);
      }
    );
  } catch (err) {
    console.error('Não foi possível iniciar o listener do Firestore:', err);
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function createInitialDataForUser(email) {
  const normalized = String(email || '').trim().toLowerCase();
  // Apenas o login do Vinicius inicia com os controles Vinicius e Pai (Zélio)
  if (normalized === 'vinicius@fersalestech.app') {
    return {
      vinicius: {
        name: 'Vinícius',
        subtitle: 'Meu Controle',
        type: 'normal',
        months: {},
        continuousBills: [],
        bankNotes: []
      },
      zelio: {
        name: 'Pai (Zélio)',
        subtitle: 'Controle do Meu Pai',
        type: 'normal',
        months: {},
        continuousBills: [],
        bankNotes: []
      }
    };
  }
  // Novos logins (ex: Fernandes) iniciam zerados sem nenhum controle pré-criado
  return {};
}

async function loadUserDatabase(user) {
  if (!user || !user.uid) return {};
  const cacheKey = STORAGE_PREFIX + user.uid;

  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    try {
      const firestore = firebase.firestore();
      const docRef = firestore.collection('users').doc(user.uid);
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data() || {};
        try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
        return data;
      }
      const initial = createInitialDataForUser(user.email);
      await docRef.set(initial);
      try { localStorage.setItem(cacheKey, JSON.stringify(initial)); } catch (_) {}
      return initial;
    } catch (err) {
      console.error('Erro ao carregar dados do Firestore:', err);
    }
  }

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Erro ao ler cache local:', e);
  }
  return createInitialDataForUser(user.email);
}

function saveDatabase(data) {
  if (!window.currentAuthUser || !window.currentAuthUser.uid) return;
  const userUid = window.currentAuthUser.uid;
  const cacheKey = STORAGE_PREFIX + userUid;

  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch (e) {
    console.warn('Erro ao salvar cache local:', e);
  }

  if (typeof firebase !== 'undefined' && isFirebaseConfigured()) {
    try {
      const firestore = firebase.firestore();
      firestore.collection('users').doc(userUid).set(data).catch(err => {
        console.error('Erro ao sincronizar com Firestore:', err);
      });
    } catch (e) {
      console.error('Erro ao acessar Firestore:', e);
    }
  }
}
