const STORAGE_KEY = 'fersales_financas_db_v2';

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function createInitialData() {
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

function loadDatabase() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Erro ao ler localStorage:', e);
  }
  const initial = createInitialData();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Erro ao salvar localStorage:', e);
  }
}
