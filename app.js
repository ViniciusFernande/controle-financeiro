let db = {};
window.currentAuthUser = null;
let activeProfile = null;
let activeTab = 'dashboard';
let currentYear = 2026;
let currentMonth = 11; // Novembro 2026
let fixedFilter = 'all';
let expenseCatFilter = 'Todos';
let extraExpanded = false;

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatBRL(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyNumber(num) {
  return (Number(num) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseCurrencyInput(id) {
  const el = document.getElementById(id);
  if (!el || !el.value.trim()) return 0;
  const cleaned = el.value.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function setCurrencyInput(id, num) {
  const el = document.getElementById(id);
  if (!el) return;
  if (num === null || num === undefined || num === '') {
    el.value = '';
    return;
  }
  el.value = formatCurrencyNumber(num);
}

function initCurrencyMasks() {
  document.querySelectorAll('.currency-input').forEach(input => {
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      if (!digits) {
        input.value = '';
        return;
      }
      const value = parseInt(digits, 10) / 100;
      input.value = formatCurrencyNumber(value);
    });
  });
}

function formatDateBR(iso) {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getMonthKey(year = currentYear, month = currentMonth) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getPrevMonthKey(year, month) {
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function ensureMonthData(profileKey, year, month) {
  const key = getMonthKey(year, month);
  if (!db[profileKey].months[key]) {
    db[profileKey].months[key] = {
      salary: 0,
      extras: [],
      carryoverOverride: null,
      debitado: false,
      fixedBills: [],
      expenses: [],
      reserves: []
    };
  }
  return db[profileKey].months[key];
}

function getMonthFixedBills(profileKey, year, month) {
  const key = getMonthKey(year, month);
  const profile = db[profileKey];
  const mData = profile.months[key];
  const regular = mData ? (mData.fixedBills || []) : [];
  const continuous = (profile.continuousBills || [])
    .filter(cb => cb.startMonthKey <= key && (!cb.endMonthKey || key < cb.endMonthKey))
    .map(cb => ({
      id: cb.id,
      desc: cb.desc,
      val: Number(cb.val) || 0,
      due: cb.due,
      pCurr: null,
      pTotal: null,
      paid: !!(cb.paidByMonth && cb.paidByMonth[key]),
      isContinuous: true
    }));
  return [...regular, ...continuous];
}

function computeMonthSummary(profileKey, year, month, depth = 0) {
  const key = getMonthKey(year, month);
  const mData = db[profileKey].months[key];
  const allFixed = getMonthFixedBills(profileKey, year, month);

  // Limite de recursão a partir de 2026-01
  let carryover = 0;
  if (mData && mData.carryoverOverride !== null && mData.carryoverOverride !== undefined && mData.carryoverOverride !== '') {
    carryover = Number(mData.carryoverOverride) || 0;
  } else if (year > 2026 || (year === 2026 && month > 1)) {
    if (depth < 36) {
      const prevY = month === 1 ? year - 1 : year;
      const prevM = month === 1 ? 12 : month - 1;
      const prevSummary = computeMonthSummary(profileKey, prevY, prevM, depth + 1);
      carryover = prevSummary.saldoDisponivel;
    }
  }

  const totalFixas = allFixed.reduce((acc, item) => acc + (Number(item.val) || 0), 0);
  const fixedPaidCount = allFixed.filter(b => b.paid).length;
  const fixedTotalCount = allFixed.length;
  const fixedPendingVal = allFixed
    .filter(b => !b.paid)
    .reduce((acc, b) => acc + (Number(b.val) || 0), 0);

  if (!mData) {
    return {
      carryover,
      salary: 0,
      bonus13: 0,
      totalExtra: 0,
      totalEntradas: 0,
      dizimo: 0,
      totalFixas,
      totalGastos: 0,
      totalReservado: 0,
      debitado: false,
      saldoBruto: carryover,
      saldoAposDebito: carryover - totalFixas,
      saldoDisponivel: carryover,
      fixedPaidCount,
      fixedTotalCount,
      fixedPendingVal
    };
  }

  const salary = Number(mData.salary) || 0;
  const bonus13 = Number(mData.bonus13) || 0;
  const totalExtra = (mData.extras || []).reduce((acc, item) => acc + (Number(item.val) || 0), 0);
  const totalEntradas = salary + bonus13 + totalExtra;
  const dizimo = totalEntradas * 0.10;
  const totalGastos = (mData.expenses || []).reduce((acc, item) => acc + (Number(item.val) || 0), 0);
  const totalReservado = (mData.reserves || []).reduce((acc, item) => acc + (Number(item.val) || 0), 0);

  const saldoBruto = carryover + totalEntradas;
  const saldoAposDebito = saldoBruto - dizimo - totalFixas - totalGastos - totalReservado;
  const saldoDisponivel = mData.debitado
    ? saldoAposDebito
    : saldoBruto - totalGastos - totalReservado;

  return {
    carryover,
    salary,
    bonus13,
    totalExtra,
    totalEntradas,
    dizimo,
    totalFixas,
    totalGastos,
    totalReservado,
    debitado: !!mData.debitado,
    saldoBruto,
    saldoAposDebito,
    saldoDisponivel,
    fixedPaidCount,
    fixedTotalCount,
    fixedPendingVal
  };
}

// ==================== INITIALIZATION & FIREBASE AUTH ====================
function init() {
  populateDateSelectors();
  initCurrencyMasks();
  setDefaultFormDates();
  initFirebaseAuth();
}

function initFirebaseAuth() {
  if (typeof firebase === 'undefined' || !isFirebaseConfigured()) {
    showLoginScreen();
    showLoginError('Firebase ainda não configurado. Cole as credenciais em firebase-config.js.');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }

  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      window.currentAuthUser = user;
      const rawName = (user.email || '').split('@')[0] || 'Usuário';
      const displayUser = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const lbl = document.getElementById('logged-user-label');
      if (lbl) lbl.textContent = displayUser;

      db = await loadUserDatabase(user);
      hideLoginError();
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app-shell').classList.add('hidden');
      document.getElementById('profile-screen').classList.remove('hidden');
      applySettingsToUI();
    } else {
      window.currentAuthUser = null;
      activeProfile = null;
      db = {};
      showLoginScreen();
    }
  });
}

function showLoginScreen() {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('profile-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function showLoginError(msg) {
  const errEl = document.getElementById('login-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
}

function hideLoginError() {
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.classList.add('hidden');
}

function togglePasswordVisibility() {
  const inp = document.getElementById('login-pass');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

const USER_LOGIN_ALIASES = {
  vinicius: 'vinicius@fersalestech.app',
  fernandes: 'fernandes@fersalestech.app'
};

function resolveLoginAlias(input) {
  const cleaned = String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (cleaned.includes('@')) return cleaned;
  return USER_LOGIN_ALIASES[cleaned] || `${cleaned}@fersalestech.app`;
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  hideLoginError();

  if (typeof firebase === 'undefined' || !isFirebaseConfigured()) {
    showLoginError('Firebase ainda não configurado. Cole suas credenciais no arquivo firebase-config.js.');
    return;
  }

  const userVal = document.getElementById('login-user').value.trim();
  const passVal = document.getElementById('login-pass').value;
  if (!userVal || !passVal) return;

  const email = resolveLoginAlias(userVal);

  const btn = document.getElementById('login-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Entrando...';
  }

  try {
    await firebase.auth().signInWithEmailAndPassword(email, passVal);
    document.getElementById('login-pass').value = '';
  } catch (err) {
    console.error('Erro de login:', err);
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
      showLoginError('Usuário ou senha incorretos.');
    } else if (err.code === 'auth/too-many-requests') {
      showLoginError('Muitas tentativas. Aguarde alguns instantes e tente novamente.');
    } else {
      showLoginError('Não foi possível entrar. Verifique sua conexão e tente novamente.');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }
}

async function logoutFirebase() {
  activeProfile = null;
  db = {};
  if (typeof firebase !== 'undefined' && firebase.apps.length) {
    await firebase.auth().signOut();
  } else {
    showLoginScreen();
  }
}

function populateDateSelectors() {
  const monthOpts = MONTHS_PT.map((name, idx) =>
    `<option value="${idx + 1}" ${idx + 1 === currentMonth ? 'selected' : ''}>${name}</option>`
  ).join('');

  const years = [2026, 2027, 2028, 2029, 2030];
  const yearOpts = years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');

  document.querySelectorAll('.sync-select-month').forEach(sel => {
    sel.innerHTML = monthOpts;
    sel.value = currentMonth;
  });
  document.querySelectorAll('.sync-select-year').forEach(sel => {
    sel.innerHTML = yearOpts;
    sel.value = currentYear;
  });

  const repM = document.getElementById('rep-month');
  const repY = document.getElementById('rep-year');
  if (repM) {
    repM.innerHTML = monthOpts;
    repM.value = currentMonth;
  }
  if (repY) {
    repY.innerHTML = yearOpts;
    repY.value = currentYear;
  }
  const resChartY = document.getElementById('res-chart-year');
  if (resChartY) {
    resChartY.innerHTML = yearOpts;
    resChartY.value = currentYear;
  }
}

function setDefaultFormDates() {
  const iso = `${currentYear}-${String(currentMonth).padStart(2, '0')}-14`;
  const inlineDate = document.getElementById('inline-exp-date');
  const resDate = document.getElementById('res-date');
  if (inlineDate) inlineDate.value = iso;
  if (resDate) resDate.value = iso;
}

function getProfileKeys() {
  return Object.keys(db).filter(
    k => k !== 'settings' && db[k] && typeof db[k] === 'object' && ('months' in db[k] || db[k].type === 'financing')
  );
}

function computeFinancingSummary(profile) {
  const fin = (profile && profile.financing) || { totalDebt: 0, installments: [] };
  const totalDebt = Number(fin.totalDebt) || 0;
  const list = fin.installments || [];
  const totalPaid = list
    .filter(item => item.paid && (Number(item.val) || 0) > 0)
    .reduce((acc, item) => acc + (Number(item.val) || 0), 0);
  const remaining = Math.max(0, totalDebt - totalPaid);
  const paidCount = list.filter(item => item.paid && (Number(item.val) || 0) > 0).length;
  const pct = totalDebt > 0 ? Math.min(100, Math.round((totalPaid / totalDebt) * 100)) : 0;
  return { totalDebt, totalPaid, remaining, paidCount, totalCount: list.length, pct };
}

function renderProfileScreen() {
  const grid = document.getElementById('profile-grid');
  if (!grid) return;

  const keys = getProfileKeys();
  const cardsHtml = keys.map((key) => {
    const profile = db[key];
    const name = profile.name || key;
    const initial = (name.trim().charAt(0) || 'C').toUpperCase();
    const rowCls = 'profile-row-card profile-row-secondary';
    const isFinancing = profile.type === 'financing';
    const subLabel = profile.subtitle
      ? escapeHtml(profile.subtitle)
      : (isFinancing
        ? ''
        : (key === 'vinicius' ? 'Meu Controle' : (key === 'zelio' ? 'Controle do Meu Pai' : 'Controle Pessoal')));
    const isCustom = key !== 'vinicius' && key !== 'zelio';

    let balanceLabel = 'Saldo Disponível';
    let balanceVal = 0;
    let isNegative = false;
    if (isFinancing) {
      const finSum = computeFinancingSummary(profile);
      balanceLabel = 'Falta Pagar';
      balanceVal = finSum.remaining;
    } else {
      const sum = computeMonthSummary(key, currentYear, currentMonth);
      balanceVal = sum.saldoDisponivel;
      isNegative = sum.saldoDisponivel < 0;
    }
    const saldoCls = isNegative ? 'profile-row-balance-val negative' : 'profile-row-balance-val';

    return `
      <div class="${rowCls}" data-profile="${escapeHtml(key)}" onclick="selectProfile('${escapeHtml(key)}')">
        <div class="profile-row-icon">${escapeHtml(initial)}</div>
        <div class="profile-row-info">
          <div class="profile-row-name">${escapeHtml(name)}</div>
          ${subLabel ? `<div class="profile-row-sub">${subLabel}</div>` : ''}
        </div>
        <div class="profile-row-balance">
          <div class="profile-row-balance-label">${balanceLabel}</div>
          <div class="${saldoCls}">${formatBRL(balanceVal)}</div>
        </div>
      </div>
    `;
  }).join('');

  const createCardHtml = `
    <button type="button" class="profile-row-card profile-row-new" onclick="openNewProfileModal()">
      <span style="font-size:20px;line-height:1;">+</span>
      <span>Criar Novo Controle</span>
    </button>
  `;

  grid.innerHTML = cardsHtml + createCardHtml;
}

function selectNewProfileType(type) {
  const typeInp = document.getElementById('new-profile-type');
  const btnNorm = document.getElementById('btn-type-normal');
  const btnFin = document.getElementById('btn-type-financing');
  const finFields = document.getElementById('new-profile-financing-fields');
  if (typeInp) typeInp.value = type;
  if (btnNorm) btnNorm.classList.toggle('active', type === 'normal');
  if (btnFin) btnFin.classList.toggle('active', type === 'financing');
  if (finFields) finFields.classList.toggle('hidden', type !== 'financing');
}

function openNewProfileModal() {
  const inp = document.getElementById('new-profile-name');
  const obsInp = document.getElementById('new-profile-obs');
  if (inp) inp.value = '';
  if (obsInp) obsInp.value = '';
  setCurrencyInput('new-profile-debt', '');
  selectNewProfileType('normal');
  document.getElementById('modal-new-profile').classList.remove('hidden');
  if (inp) setTimeout(() => inp.focus(), 50);
}

function createNewProfile(e) {
  e.preventDefault();
  const inp = document.getElementById('new-profile-name');
  const obsInp = document.getElementById('new-profile-obs');
  const typeInp = document.getElementById('new-profile-type');
  const name = inp ? inp.value.trim() : '';
  const obs = obsInp ? obsInp.value.trim() : '';
  const type = typeInp ? typeInp.value : 'normal';
  if (!name) return;

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'controle';
  let key = slugBase;
  let n = 2;
  while (db[key] || key === 'settings') {
    key = `${slugBase}_${n++}`;
  }

  if (type === 'financing') {
    const totalDebt = parseCurrencyInput('new-profile-debt');
    db[key] = {
      name,
      subtitle: obs,
      type: 'financing',
      financing: {
        totalDebt,
        installments: []
      }
    };
  } else {
    db[key] = {
      name,
      subtitle: obs,
      type: 'normal',
      months: {},
      continuousBills: [],
      bankNotes: [],
      categories: [...DEFAULT_EXPENSE_CATEGORIES]
    };
  }
  saveDatabase(db);
  closeModal('modal-new-profile');
  renderProfileScreen();
  showToast(`Controle "${name}" criado!`);
}

function deleteActiveProfile() {
  if (!activeProfile || !db[activeProfile]) return;
  const name = db[activeProfile].name || activeProfile;
  if (!confirm(`Tem certeza que deseja excluir o controle "${name}"? Todos os dados deste controle serão apagados.`)) return;
  delete db[activeProfile];
  saveDatabase(db);
  backToProfiles();
  showToast(`Controle "${name}" excluído.`);
}

function updateProfilePreviews() {
  renderProfileScreen();
}

// ==================== NAVIGATION ====================
function selectProfile(profileKey) {
  activeProfile = profileKey;
  document.getElementById('profile-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  const isVinicius = profileKey === 'vinicius';
  const name = (db[profileKey] && db[profileKey].name) ? db[profileKey].name : (isVinicius ? 'Vinícius' : 'Pai (Zélio)');
  const initial = (name.trim().charAt(0) || (isVinicius ? 'V' : 'Z')).toUpperCase();

  document.getElementById('sidebar-avatar').textContent = initial;
  document.getElementById('sidebar-avatar').style.background = isVinicius ? 'var(--navy)' : 'var(--emerald)';
  document.getElementById('sidebar-profile-name').textContent = name;
  document.getElementById('dash-greeting-name').textContent = name;

  const mobAv = document.getElementById('mobile-avatar');
  if (mobAv) mobAv.textContent = initial;
  const pillV = document.getElementById('pill-vinicius');
  const pillZ = document.getElementById('pill-zelio');
  if (pillV) pillV.classList.toggle('active', isVinicius);
  if (pillZ) pillZ.classList.toggle('active', !isVinicius);

  const isFinancing = db[profileKey] && db[profileKey].type === 'financing';
  document.querySelectorAll('[data-profile-type="normal"]').forEach(el => el.classList.toggle('hidden', isFinancing));
  document.querySelectorAll('[data-profile-type="financing"]').forEach(el => el.classList.toggle('hidden', !isFinancing));

  switchTab(isFinancing ? 'financiamento' : 'dashboard');
}

function backToProfiles() {
  activeProfile = null;
  updateProfilePreviews();
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('profile-screen').classList.remove('hidden');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed');
}

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  document.querySelectorAll('.nav-item, .m-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changeMonthYear(changedEl) {
  if (changedEl && changedEl.classList.contains('sync-select-month')) {
    currentMonth = Number(changedEl.value);
  } else if (changedEl && changedEl.classList.contains('sync-select-year')) {
    currentYear = Number(changedEl.value);
  }
  document.querySelectorAll('.sync-select-month').forEach(sel => { sel.value = currentMonth; });
  document.querySelectorAll('.sync-select-year').forEach(sel => { sel.value = currentYear; });
  setDefaultFormDates();
  renderAll();
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ==================== RENDER ALL ====================
function renderAll() {
  if (!activeProfile) return;
  if (db[activeProfile] && db[activeProfile].type === 'financing') {
    renderFinanciamento();
    renderConfig();
    return;
  }
  ensureMonthData(activeProfile, currentYear, currentMonth);
  const sum = computeMonthSummary(activeProfile, currentYear, currentMonth);
  const mData = db[activeProfile].months[getMonthKey()];
  const monthLabel = `${MONTHS_PT[currentMonth - 1]} ${currentYear}`;

  document.getElementById('dash-subtitle').textContent = `Resumo financeiro de ${monthLabel}.`;

  renderDashboard(sum, mData);
  renderReceitas(sum, mData);
  renderContasFixas(sum, mData);
  renderGastos(sum, mData);
  renderReserva(sum, mData);
  renderRelatorio();
  syncExpenseCategorySelects();
  renderConfig();
}

// ==================== ABA 1: DASHBOARD ====================
function renderDashboard(sum, mData) {
  document.getElementById('dash-saldo').textContent = formatBRL(sum.saldoDisponivel);
  const statusEl = document.getElementById('dash-saldo-status');
  if (sum.debitado) {
    statusEl.textContent = 'Livre para gastar (Pós-débito)';
    statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
    statusEl.style.color = '#6ee7b7';
  } else {
    statusEl.textContent = 'Aguardando débito de Fixas & Dízimo';
    statusEl.style.background = 'rgba(245, 158, 11, 0.2)';
    statusEl.style.color = '#fcd34d';
  }

  document.getElementById('dash-fixas').textContent = formatBRL(sum.totalFixas);
  document.getElementById('dash-fixas-status').textContent = `${sum.fixedPaidCount} pagas / ${sum.fixedTotalCount - sum.fixedPaidCount} pendentes`;

  document.getElementById('dash-gastos').textContent = formatBRL(sum.totalGastos);
  document.getElementById('dash-gastos-count').textContent = `${mData.expenses.length} lançamentos no mês`;

  document.getElementById('dash-dizimo').textContent = formatBRL(sum.dizimo);

  // Top 5 Contas Fixas de maior valor
  const top5 = [...getMonthFixedBills(activeProfile, currentYear, currentMonth)].sort((a, b) => b.val - a.val).slice(0, 5);
  const top5El = document.getElementById('dash-top5-fixas');
  if (top5.length === 0) {
    top5El.innerHTML = `<p class="muted-text">Nenhuma conta fixa cadastrada neste mês.</p>`;
  } else {
    top5El.innerHTML = top5.map(b => `
      <div class="compact-item">
        <div>
          <div class="compact-item-title">${escapeHtml(b.desc)}</div>
          <div class="compact-item-sub">Vence dia ${b.due}${b.pTotal ? ` • Parcela ${b.pCurr}/${b.pTotal}` : ''}</div>
        </div>
        <div class="text-right">
          <div class="compact-item-val">${formatBRL(b.val)}</div>
          <span class="badge ${b.paid ? 'badge-emerald' : 'badge-amber'}">${b.paid ? 'Pago' : 'Pendente'}</span>
        </div>
      </div>
    `).join('');
  }

  // Últimos 5 gastos
  const last5 = [...mData.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const last5El = document.getElementById('dash-last5-gastos');
  if (last5.length === 0) {
    last5El.innerHTML = `<p class="muted-text">Nenhum gasto diário registrado neste mês.</p>`;
  } else {
    last5El.innerHTML = last5.map(e => `
      <div class="compact-item">
        <div>
          <div class="compact-item-title">${escapeHtml(e.desc)}</div>
          <div class="compact-item-sub">${escapeHtml(e.cat || 'Outros')} • ${formatDateBR(e.date)}</div>
        </div>
        <div class="compact-item-val text-red">- ${formatBRL(e.val)}</div>
      </div>
    `).join('');
  }

  renderDashboardChart();
}

function renderDashboardChart() {
  if (!activeProfile) return;
  const year = currentYear;
  document.getElementById('chart-year-label').textContent = year;

  const monthly = [];
  let maxVal = 100;
  let sumFixas = 0;
  let sumGastos = 0;
  let activeMonths = 0;

  for (let m = 1; m <= 12; m++) {
    const s = computeMonthSummary(activeProfile, year, m);
    monthly.push({ m, fixas: s.totalFixas, gastos: s.totalGastos });
    if (s.totalFixas > maxVal) maxVal = s.totalFixas;
    if (s.totalGastos > maxVal) maxVal = s.totalGastos;
    if (s.totalFixas > 0 || s.totalGastos > 0) {
      sumFixas += s.totalFixas;
      sumGastos += s.totalGastos;
      activeMonths++;
    }
  }

  const avgFixas = activeMonths ? sumFixas / activeMonths : 0;
  const avgGastos = activeMonths ? sumGastos / activeMonths : 0;
  document.getElementById('chart-avg-fixas').textContent = formatBRL(avgFixas);
  document.getElementById('chart-avg-gastos').textContent = formatBRL(avgGastos);
  document.getElementById('chart-total-ano').textContent = formatBRL(sumFixas + sumGastos);

  // SVG Grouped Bar Chart
  const width = 660;
  const height = 230;
  const padL = 54;
  const padR = 14;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const groupW = plotW / 12;
  const barW = 14;

  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    const val = maxVal * (1 - i / 4);
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3" />
      <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${Math.round(val / 100) * 100 >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val)}</text>
    `;
  }

  let bars = '';
  monthly.forEach((item, idx) => {
    const cx = padL + idx * groupW + groupW / 2;
    const hF = (item.fixas / maxVal) * plotH;
    const hG = (item.gastos / maxVal) * plotH;
    const yF = padT + plotH - hF;
    const yG = padT + plotH - hG;
    const isCurrent = year === currentYear && item.m === currentMonth;
    const tipHtml = `
      <div class='chart-tooltip-title'>${MONTHS_PT[idx]} ${year}</div>
      <div class='chart-tooltip-row'>
        <span><span class='chart-tooltip-dot' style='background:#94a3b8;'></span>Contas Fixas</span>
        <strong>${formatBRL(item.fixas)}</strong>
      </div>
      <div class='chart-tooltip-row'>
        <span><span class='chart-tooltip-dot' style='background:#34d399;'></span>Gastos do Mês</span>
        <strong>${formatBRL(item.gastos)}</strong>
      </div>
    `.replace(/\n\s*/g, '');

    bars += `
      <g class="chart-col-group"
         onmouseenter="showChartTooltip(event, this.dataset.tip)"
         onmousemove="moveChartTooltip(event)"
         onclick="event.stopPropagation(); showChartTooltip(event, this.dataset.tip)"
         data-tip="${escapeHtml(tipHtml)}">
        <rect class="chart-col-hover-bg" x="${cx - groupW / 2 + 2}" y="${padT}" width="${groupW - 4}" height="${plotH}" rx="6" fill="transparent" />
        ${isCurrent ? `<rect x="${cx - 22}" y="${padT}" width="44" height="${plotH}" rx="6" fill="var(--emerald-soft)" />` : ''}
        <rect x="${cx - barW - 2}" y="${yF}" width="${barW}" height="${Math.max(hF, 2)}" rx="4" fill="var(--navy)" />
        <rect x="${cx + 2}" y="${yG}" width="${barW}" height="${Math.max(hG, 2)}" rx="4" fill="var(--emerald)" />
        <text x="${cx}" y="${height - 10}" text-anchor="middle" font-size="11" font-weight="${isCurrent ? '800' : '600'}" fill="${isCurrent ? 'var(--emerald)' : 'var(--text-muted)'}">${MONTHS_SHORT[idx]}</text>
      </g>
    `;
  });

  document.getElementById('annual-chart').innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; min-width:520px; height:auto;" onmouseleave="hideChartTooltip()">
      ${gridLines}
      ${bars}
    </svg>
  `;
}

function showChartTooltip(ev, html) {
  const tip = document.getElementById('chart-tooltip');
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  moveChartTooltip(ev);
}

function moveChartTooltip(ev) {
  const tip = document.getElementById('chart-tooltip');
  if (!tip || tip.classList.contains('hidden')) return;
  const pad = 14;
  const tipW = tip.offsetWidth || 180;
  const tipH = tip.offsetHeight || 70;
  let left = ev.clientX + pad;
  let top = ev.clientY - tipH - pad;
  if (left + tipW > window.innerWidth - 10) left = ev.clientX - tipW - pad;
  if (top < 10) top = ev.clientY + pad;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideChartTooltip() {
  const tip = document.getElementById('chart-tooltip');
  if (tip) tip.classList.add('hidden');
}

document.addEventListener('click', hideChartTooltip);

// ==================== ABA 2: RECEITAS & DÍZIMO ====================
function renderReceitas(sum, mData) {
  document.getElementById('rec-carryover').textContent = formatBRL(sum.carryover);
  if (mData.carryoverOverride !== null && mData.carryoverOverride !== undefined && mData.carryoverOverride !== '') {
    setCurrencyInput('input-carryover-override', mData.carryoverOverride);
  } else {
    setCurrencyInput('input-carryover-override', '');
  }

  document.getElementById('rec-total-entradas').textContent = formatBRL(sum.totalEntradas);
  document.getElementById('rec-dizimo-valor').textContent = formatBRL(sum.dizimo);
  const dizBadge = document.getElementById('rec-dizimo-badge');
  dizBadge.textContent = sum.debitado ? 'Debitado ✓' : 'Pendente';
  dizBadge.className = `badge ${sum.debitado ? 'badge-emerald' : 'badge-amber'}`;

  document.getElementById('rec-saldo-disponivel').textContent = formatBRL(sum.saldoDisponivel);
  const recSaldoStatus = document.getElementById('rec-saldo-status');
  if (sum.debitado) {
    recSaldoStatus.textContent = 'Pós-débito';
    recSaldoStatus.style.background = 'rgba(16, 185, 129, 0.2)';
    recSaldoStatus.style.color = '#6ee7b7';
  } else {
    recSaldoStatus.textContent = 'Pré-débito';
    recSaldoStatus.style.background = 'rgba(245, 158, 11, 0.2)';
    recSaldoStatus.style.color = '#fcd34d';
  }

  setCurrencyInput('input-salario', mData.salary > 0 ? mData.salary : '');
  setCurrencyInput('input-bonus13', mData.bonus13 > 0 ? mData.bonus13 : '');
  const salStatus = document.getElementById('rec-salario-status');
  salStatus.textContent = mData.salary > 0 ? 'Creditado' : 'Não lançado';
  salStatus.className = `badge ${mData.salary > 0 ? 'badge-emerald' : 'badge-neutral'}`;

  const extraList = document.getElementById('extra-income-list');
  const toggleBtn = document.getElementById('btn-toggle-extra');

  if (mData.extras.length === 0) {
    extraList.innerHTML = `<p class="muted-text">Nenhuma renda extra lançada neste mês.</p>`;
    toggleBtn.classList.add('hidden');
  } else {
    const orderedExtras = [...mData.extras].reverse();
    const visibleExtras = extraExpanded ? orderedExtras : orderedExtras.slice(0, 1);
    extraList.innerHTML = visibleExtras.map(ex => `
      <div class="extra-item">
        <div>
          <div class="compact-item-title">${escapeHtml(ex.desc)}</div>
          <div class="compact-item-sub">${formatDateBR(ex.date)}</div>
        </div>
        <div class="topbar-right">
          <strong class="text-emerald">+ ${formatBRL(ex.val)}</strong>
          <button class="icon-btn danger" onclick="deleteExtra('${ex.id}')" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('');

    if (orderedExtras.length > 1) {
      const remaining = orderedExtras.length - 1;
      toggleBtn.classList.remove('hidden');
      toggleBtn.innerHTML = `
        <span>${extraExpanded ? 'Ocultar' : `Ver mais (${remaining})`}</span>
        <span class="extra-arrow ${extraExpanded ? 'open' : ''}">▾</span>
      `;
    } else {
      toggleBtn.classList.add('hidden');
    }
  }
  document.getElementById('rec-total-extra').textContent = formatBRL(sum.totalExtra);

  // Botão Debitar
  const btnDeb = document.getElementById('btn-debitar');
  if (sum.debitado) {
    btnDeb.textContent = '✓ Débito Realizado';
    btnDeb.className = 'btn btn-emerald';
  } else {
    btnDeb.textContent = '⚡ Realizar Débito';
    btnDeb.className = 'btn btn-navy';
  }

  document.getElementById('deb-bruto').textContent = formatBRL(sum.saldoBruto);
  document.getElementById('deb-dizimo').textContent = `- ${formatBRL(sum.dizimo)}`;
  document.getElementById('deb-fixas').textContent = `- ${formatBRL(sum.totalFixas)}`;
  document.getElementById('deb-restante').textContent = formatBRL(sum.saldoAposDebito);

  // Tabela detalhada do que é/foi debitado
  const tbody = document.getElementById('debit-detail-tbody');
  const rows = [
    `<tr>
      <td><strong>Dízimo do Mês (10% das Entradas)</strong></td>
      <td><span class="badge badge-amber">Dízimo</span></td>
      <td>Mensal</td>
      <td class="text-right text-red"><strong>- ${formatBRL(sum.dizimo)}</strong></td>
    </tr>`
  ];

  const fixedList = getMonthFixedBills(activeProfile, currentYear, currentMonth);
  fixedList.forEach(b => {
    rows.push(`
      <tr>
        <td>${escapeHtml(b.desc)}${b.pTotal ? ` <small class="muted-text">(${b.pCurr}/${b.pTotal})</small>` : ''}</td>
        <td><span class="badge badge-neutral">Conta Fixa</span></td>
        <td>Dia ${b.due}</td>
        <td class="text-right text-red">- ${formatBRL(b.val)}</td>
      </tr>
    `);
  });

  tbody.innerHTML = rows.join('');
  document.getElementById('deb-items-count').textContent = `${fixedList.length} contas fixas + 1 dízimo`;
  document.getElementById('deb-total-geral').textContent = `- ${formatBRL(sum.dizimo + sum.totalFixas)}`;
}

function toggleExtraList() {
  extraExpanded = !extraExpanded;
  renderAll();
}

function saveSalary() {
  const val = parseCurrencyInput('input-salario');
  const bonus13 = parseCurrencyInput('input-bonus13');
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.salary = val;
  mData.bonus13 = bonus13;
  saveDatabase(db);
  renderAll();
  showToast('Salário e 13º/Férias salvos com sucesso!');
}

function toggleCarryoverEdit() {
  const box = document.getElementById('carryover-edit-box');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    document.getElementById('input-carryover-override').focus();
  }
}

function saveCarryoverOverride() {
  const raw = document.getElementById('input-carryover-override').value.trim();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.carryoverOverride = raw === '' ? null : parseCurrencyInput('input-carryover-override');
  saveDatabase(db);
  document.getElementById('carryover-edit-box').classList.add('hidden');
  renderAll();
  showToast('Saldo do mês anterior atualizado!');
}

function toggleDebit() {
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.debitado = !mData.debitado;
  saveDatabase(db);
  renderAll();
  showToast(mData.debitado
    ? 'Contas Fixas e Dízimo debitados do saldo!'
    : 'Débito estornado. Saldo voltou ao valor bruto.');
}

function openExtraModal() {
  document.getElementById('m-ext-id').value = '';
  document.getElementById('m-ext-desc').value = '';
  document.getElementById('m-ext-val').value = '';
  document.getElementById('m-ext-date').value = `${currentYear}-${String(currentMonth).padStart(2, '0')}-14`;
  document.getElementById('modal-extra').classList.remove('hidden');
}

function saveExtraModal(e) {
  e.preventDefault();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.extras.push({
    id: uid(),
    desc: document.getElementById('m-ext-desc').value.trim(),
    val: parseCurrencyInput('m-ext-val'),
    date: document.getElementById('m-ext-date').value
  });
  saveDatabase(db);
  closeModal('modal-extra');
  renderAll();
  showToast('Renda extra adicionada!');
}

function deleteExtra(id) {
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.extras = mData.extras.filter(x => x.id !== id);
  saveDatabase(db);
  renderAll();
  showToast('Renda extra removida.');
}

// ==================== ABA 3: CONTAS FIXAS ====================
function setFixedFilter(f) {
  fixedFilter = f;
  document.querySelectorAll('#tab-fixas .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  const mData = db[activeProfile].months[getMonthKey()];
  const sum = computeMonthSummary(activeProfile, currentYear, currentMonth);
  renderContasFixas(sum, mData);
}

function renderContasFixas(sum, mData) {
  document.getElementById('fixas-total').textContent = formatBRL(sum.totalFixas);
  document.getElementById('fixas-count-label').textContent = `${sum.fixedTotalCount} contas cadastradas`;
  document.getElementById('fixas-pagas-count').textContent = `${sum.fixedPaidCount} de ${sum.fixedTotalCount}`;
  const pct = sum.fixedTotalCount > 0 ? Math.round((sum.fixedPaidCount / sum.fixedTotalCount) * 100) : 0;
  document.getElementById('fixas-progress').style.width = `${pct}%`;

  document.getElementById('fixas-pendente-valor').textContent = formatBRL(sum.fixedPendingVal);
  document.getElementById('fixas-pendente-count').textContent = `${sum.fixedTotalCount - sum.fixedPaidCount} contas em aberto`;

  let list = getMonthFixedBills(activeProfile, currentYear, currentMonth);
  if (fixedFilter === 'paid') list = list.filter(b => b.paid);
  if (fixedFilter === 'pending') list = list.filter(b => !b.paid);

  const tbody = document.getElementById('fixas-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted-text" style="text-align:center; padding:24px;">Nenhuma conta fixa encontrada para este filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(b => {
    let parcelaTxt = b.isContinuous
      ? `<span class="badge badge-emerald">Contínua (mensal)</span>`
      : 'Única / Mensal';
    if (b.pTotal && b.pCurr) {
      const faltam = Math.max(0, b.pTotal - b.pCurr);
      parcelaTxt = `<strong>${b.pCurr}/${b.pTotal}</strong> <span class="muted-text">(faltam ${faltam})</span>`;
    }
    return `
      <tr>
        <td>
          <input type="checkbox" class="check-paid" ${b.paid ? 'checked' : ''} onchange="toggleFixedPaid('${b.id}')" />
        </td>
        <td><strong>${escapeHtml(b.desc)}</strong></td>
        <td><strong>${formatBRL(b.val)}</strong></td>
        <td>
          <span class="badge ${b.paid ? 'badge-emerald' : 'badge-amber'}">
            Dia ${b.due} ${b.paid ? '(Pago)' : '(A vencer)'}
          </span>
        </td>
        <td>${parcelaTxt}</td>
        <td class="actions-col">
          <button class="icon-btn" onclick="openFixedModal('${b.id}')" title="Editar">✏️</button>
          <button class="icon-btn danger" onclick="deleteFixed('${b.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleFixedPaid(id) {
  const key = getMonthKey();
  const contList = db[activeProfile].continuousBills || [];
  const cb = contList.find(b => b.id === id);
  if (cb) {
    if (!cb.paidByMonth) cb.paidByMonth = {};
    cb.paidByMonth[key] = !cb.paidByMonth[key];
    saveDatabase(db);
    renderAll();
    return;
  }

  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  const item = mData.fixedBills.find(b => b.id === id);
  if (item) {
    item.paid = !item.paid;
    saveDatabase(db);
    renderAll();
  }
}

function toggleFixedContinuousUI() {
  const isCont = document.getElementById('m-fix-continuous').checked;
  const pCurr = document.getElementById('m-fix-pcurr');
  const pTotal = document.getElementById('m-fix-ptotal');
  pCurr.disabled = isCont;
  pTotal.disabled = isCont;
  if (isCont) {
    pCurr.value = '';
    pTotal.value = '';
  }
}

function openFixedModal(editId = null) {
  const key = getMonthKey();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  const contList = db[activeProfile].continuousBills || [];

  if (editId) {
    const cb = contList.find(b => b.id === editId);
    const item = cb || mData.fixedBills.find(b => b.id === editId);
    if (!item) return;

    document.getElementById('modal-fixed-title').textContent = 'Editar Conta Fixa';
    document.getElementById('m-fix-id').value = item.id;
    document.getElementById('m-fix-desc').value = item.desc;
    setCurrencyInput('m-fix-val', item.val);
    document.getElementById('m-fix-due').value = item.due;
    document.getElementById('m-fix-pcurr').value = cb ? '' : (item.pCurr || '');
    document.getElementById('m-fix-ptotal').value = cb ? '' : (item.pTotal || '');
    document.getElementById('m-fix-continuous').checked = !!cb;
    document.getElementById('m-fix-paid').checked = cb ? !!(cb.paidByMonth && cb.paidByMonth[key]) : !!item.paid;
  } else {
    document.getElementById('modal-fixed-title').textContent = 'Nova Conta Fixa';
    document.getElementById('m-fix-id').value = '';
    document.getElementById('m-fix-desc').value = '';
    document.getElementById('m-fix-val').value = '';
    document.getElementById('m-fix-due').value = 10;
    document.getElementById('m-fix-pcurr').value = '';
    document.getElementById('m-fix-ptotal').value = '';
    document.getElementById('m-fix-continuous').checked = false;
    document.getElementById('m-fix-paid').checked = false;
  }
  toggleFixedContinuousUI();
  document.getElementById('modal-fixed').classList.remove('hidden');
}

function saveFixedModal(e) {
  e.preventDefault();
  const key = getMonthKey();
  const profile = db[activeProfile];
  if (!profile.continuousBills) profile.continuousBills = [];
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);

  const id = document.getElementById('m-fix-id').value;
  const isContinuous = document.getElementById('m-fix-continuous').checked;
  const desc = document.getElementById('m-fix-desc').value.trim();
  const val = parseCurrencyInput('m-fix-val');
  const due = parseInt(document.getElementById('m-fix-due').value, 10) || 10;
  const isPaid = document.getElementById('m-fix-paid').checked;

  if (isContinuous) {
    // Se existia como conta avulsa do mês, remove dela e move para continuousBills
    mData.fixedBills = mData.fixedBills.filter(b => b.id !== id);
    const existingIdx = profile.continuousBills.findIndex(b => b.id === id);
    if (existingIdx !== -1) {
      profile.continuousBills[existingIdx].desc = desc;
      profile.continuousBills[existingIdx].val = val;
      profile.continuousBills[existingIdx].due = due;
      if (!profile.continuousBills[existingIdx].paidByMonth) profile.continuousBills[existingIdx].paidByMonth = {};
      profile.continuousBills[existingIdx].paidByMonth[key] = isPaid;
    } else {
      profile.continuousBills.push({
        id: id || uid(),
        desc,
        val,
        due,
        startMonthKey: key,
        endMonthKey: null,
        paidByMonth: { [key]: isPaid }
      });
    }
  } else {
    // Se antes era contínua, remove de continuousBills
    profile.continuousBills = profile.continuousBills.filter(b => b.id !== id);
    const pCurrRaw = document.getElementById('m-fix-pcurr').value;
    const pTotalRaw = document.getElementById('m-fix-ptotal').value;
    const payload = {
      id: id || uid(),
      desc,
      val,
      due,
      pCurr: pCurrRaw ? parseInt(pCurrRaw, 10) : null,
      pTotal: pTotalRaw ? parseInt(pTotalRaw, 10) : null,
      paid: isPaid
    };
    const idx = mData.fixedBills.findIndex(b => b.id === id);
    if (idx !== -1) mData.fixedBills[idx] = payload;
    else mData.fixedBills.push(payload);
  }

  saveDatabase(db);
  closeModal('modal-fixed');
  renderAll();
  showToast(id ? 'Conta fixa atualizada!' : 'Conta fixa adicionada!');
}

function deleteFixed(id) {
  if (!confirm('Deseja excluir esta conta fixa?')) return;
  const key = getMonthKey();
  const profile = db[activeProfile];
  const contList = profile.continuousBills || [];
  const cbIdx = contList.findIndex(b => b.id === id);

  if (cbIdx !== -1) {
    const cb = contList[cbIdx];
    if (key <= cb.startMonthKey) {
      profile.continuousBills.splice(cbIdx, 1);
    } else {
      cb.endMonthKey = key;
    }
  } else {
    const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
    mData.fixedBills = mData.fixedBills.filter(b => b.id !== id);
  }

  saveDatabase(db);
  renderAll();
  showToast('Conta fixa excluída.');
}

function copyFixedFromPreviousMonth() {
  const prevKey = getPrevMonthKey(currentYear, currentMonth);
  const prevData = db[activeProfile].months[prevKey];
  if (!prevData || prevData.fixedBills.length === 0) {
    showToast('Não há contas fixas no mês anterior para copiar.');
    return;
  }
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  const copied = [];
  prevData.fixedBills.forEach(b => {
    if (b.pTotal && b.pCurr) {
      if (b.pCurr >= b.pTotal) return; // Parcelamento encerrado
      copied.push({ ...b, id: uid(), pCurr: b.pCurr + 1, paid: false });
    } else {
      copied.push({ ...b, id: uid(), paid: false });
    }
  });
  mData.fixedBills = [...mData.fixedBills, ...copied];
  saveDatabase(db);
  renderAll();
  showToast(`${copied.length} contas fixas copiadas (parcelas avançadas)!`);
}

// ==================== ABA 4: GASTOS DO DIA A DIA ====================
function setExpenseCatFilter(cat) {
  expenseCatFilter = cat;
  document.querySelectorAll('#gastos-cat-filters .filter-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === cat);
  });
  const mData = db[activeProfile].months[getMonthKey()];
  const sum = computeMonthSummary(activeProfile, currentYear, currentMonth);
  renderGastos(sum, mData);
}

function renderGastos(sum, mData) {
  document.getElementById('gastos-total-mes').textContent = formatBRL(sum.totalGastos);
  const avg = mData.expenses.length ? sum.totalGastos / mData.expenses.length : 0;
  document.getElementById('gastos-media').textContent = formatBRL(avg);
  document.getElementById('gastos-saldo-restante').textContent = formatBRL(sum.saldoDisponivel);

  let list = [...mData.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (expenseCatFilter !== 'Todos') {
    list = list.filter(e => (e.cat || 'Outros') === expenseCatFilter);
  }

  const tbody = document.getElementById('gastos-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted-text" style="text-align:center; padding:24px;">Nenhum gasto registrado para este filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(e => `
    <tr>
      <td>
        <strong>${escapeHtml(e.desc)}</strong>
        <div class="compact-item-sub">${escapeHtml(e.cat || 'Outros')}</div>
      </td>
      <td>${formatDateBR(e.date)}</td>
      <td class="text-right text-red"><strong>- ${formatBRL(e.val)}</strong></td>
      <td class="actions-col">
        <button class="icon-btn" onclick="openExpenseModal('${e.id}')" title="Editar">✏️</button>
        <button class="icon-btn danger" onclick="deleteExpense('${e.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function handleInlineExpenseSubmit(ev) {
  ev.preventDefault();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.expenses.push({
    id: uid(),
    desc: document.getElementById('inline-exp-desc').value.trim(),
    val: parseCurrencyInput('inline-exp-val'),
    date: document.getElementById('inline-exp-date').value,
    cat: document.getElementById('inline-exp-cat').value
  });
  document.getElementById('inline-exp-desc').value = '';
  document.getElementById('inline-exp-val').value = '';
  saveDatabase(db);
  renderAll();
  showToast('Gasto registrado e debitado do saldo!');
}

function openExpenseModal(editId = null) {
  syncExpenseCategorySelects();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  const cats = getExpenseCategories();
  const catSel = document.getElementById('m-exp-cat');
  if (editId) {
    const item = mData.expenses.find(e => e.id === editId);
    if (!item) return;
    document.getElementById('modal-expense-title').textContent = 'Editar Gasto';
    document.getElementById('m-exp-id').value = item.id;
    document.getElementById('m-exp-desc').value = item.desc;
    setCurrencyInput('m-exp-val', item.val);
    document.getElementById('m-exp-date').value = item.date;
    const targetCat = item.cat || cats[0] || 'Outros';
    if (!cats.includes(targetCat)) {
      const opt = document.createElement('option');
      opt.value = targetCat;
      opt.textContent = targetCat;
      catSel.appendChild(opt);
    }
    catSel.value = targetCat;
  } else {
    document.getElementById('modal-expense-title').textContent = 'Cadastrar Novo Gasto';
    document.getElementById('m-exp-id').value = '';
    document.getElementById('m-exp-desc').value = '';
    document.getElementById('m-exp-val').value = '';
    document.getElementById('m-exp-date').value = `${currentYear}-${String(currentMonth).padStart(2, '0')}-14`;
    catSel.value = cats[0] || 'Outros';
  }
  document.getElementById('modal-expense').classList.remove('hidden');
}

function saveExpenseModal(ev) {
  ev.preventDefault();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  const id = document.getElementById('m-exp-id').value;
  const payload = {
    id: id || uid(),
    desc: document.getElementById('m-exp-desc').value.trim(),
    val: parseCurrencyInput('m-exp-val'),
    date: document.getElementById('m-exp-date').value,
    cat: document.getElementById('m-exp-cat').value
  };
  if (id) {
    const idx = mData.expenses.findIndex(e => e.id === id);
    if (idx !== -1) mData.expenses[idx] = payload;
  } else {
    mData.expenses.push(payload);
  }
  saveDatabase(db);
  closeModal('modal-expense');
  renderAll();
  showToast(id ? 'Gasto atualizado!' : 'Novo gasto debitado do saldo!');
}

function deleteExpense(id) {
  if (!confirm('Excluir este gasto?')) return;
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.expenses = mData.expenses.filter(e => e.id !== id);
  saveDatabase(db);
  renderAll();
  showToast('Gasto removido e estornado ao saldo.');
}

// ==================== ABA 5: RESERVA & COFRINHO ====================
function renderReserva(sum, mData) {
  document.getElementById('res-total-mes').textContent = formatBRL(sum.totalReservado);
  document.getElementById('res-saldo-atual').textContent = formatBRL(sum.saldoDisponivel);

  const listEl = document.getElementById('reserve-list');
  if (mData.reserves.length === 0) {
    listEl.innerHTML = `<p class="muted-text">Nenhum valor guardado neste mês.</p>`;
  } else {
    listEl.innerHTML = mData.reserves.map(r => `
      <div class="extra-item">
        <div>
          <div class="compact-item-title">${escapeHtml(r.desc)}</div>
          <div class="compact-item-sub">${escapeHtml(r.bank)} • ${formatDateBR(r.date)}</div>
        </div>
        <div class="topbar-right">
          <strong class="text-red">- ${formatBRL(r.val)}</strong>
          <button class="icon-btn danger" onclick="deleteReserve('${r.id}')" title="Excluir">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  renderReservaChart();
  renderBankNotes();
}

function renderReservaChart() {
  if (!activeProfile) return;
  const chartEl = document.getElementById('reserva-annual-chart');
  const yearSel = document.getElementById('res-chart-year');
  if (!chartEl) return;

  const year = yearSel ? Number(yearSel.value) || currentYear : currentYear;
  const monthly = [];
  let maxVal = 100;
  let totalAno = 0;

  for (let m = 1; m <= 12; m++) {
    const s = computeMonthSummary(activeProfile, year, m);
    const val = s.totalReservado || 0;
    monthly.push({ m, val });
    totalAno += val;
    if (val > maxVal) maxVal = val;
  }

  const totalEl = document.getElementById('res-chart-total-ano');
  if (totalEl) totalEl.textContent = formatBRL(totalAno);

  const width = 660;
  const height = 220;
  const padL = 56;
  const padR = 14;
  const padT = 26;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const groupW = plotW / 12;
  const barW = 24;

  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    const val = maxVal * (1 - i / 4);
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 3" />
      <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">${Math.round(val / 100) * 100 >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val)}</text>
    `;
  }

  let bars = '';
  monthly.forEach((item, idx) => {
    const cx = padL + idx * groupW + groupW / 2;
    const h = (item.val / maxVal) * plotH;
    const y = padT + plotH - h;
    const isCurrent = year === currentYear && item.m === currentMonth;
    const shortVal = item.val >= 1000
      ? `${(item.val / 1000).toFixed(1).replace('.', ',')}k`
      : `${Math.round(item.val)}`;

    bars += `
      <g>
        ${isCurrent ? `<rect x="${cx - 20}" y="${padT}" width="40" height="${plotH}" rx="6" fill="var(--emerald-soft)" />` : ''}
        <rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${Math.max(h, 2)}" rx="5" fill="var(--emerald)">
          <title>${MONTHS_PT[idx]} ${year} — Guardado: ${formatBRL(item.val)}</title>
        </rect>
        ${item.val > 0 ? `<text x="${cx}" y="${Math.max(y - 6, 12)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">${shortVal}</text>` : ''}
        <text x="${cx}" y="${height - 10}" text-anchor="middle" font-size="11" font-weight="${isCurrent ? '800' : '600'}" fill="${isCurrent ? 'var(--emerald)' : 'var(--text-muted)'}">${MONTHS_SHORT[idx]}</text>
      </g>
    `;
  });

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; min-width:520px; height:auto;">
      ${gridLines}
      ${bars}
    </svg>
  `;
}

function getBankNotes(profileKey) {
  const profile = db[profileKey];
  if (!Array.isArray(profile.bankNotes)) {
    profile.bankNotes = [];
    saveDatabase(db);
  }
  return profile.bankNotes;
}

function renderBankNotes() {
  const tbody = document.getElementById('bank-notes-tbody');
  if (!tbody || !activeProfile) return;
  const list = getBankNotes(activeProfile);

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="muted-text" style="text-align:center; padding:20px;">Nenhum banco anotado ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(item => `
    <tr>
      <td><strong>🏦 ${escapeHtml(item.bank)}</strong></td>
      <td>${escapeHtml(item.desc)}</td>
      <td class="actions-col">
        <button class="icon-btn" onclick="openBankNoteModal('${item.id}')" title="Editar">✏️</button>
        <button class="icon-btn danger" onclick="deleteBankNote('${item.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function handleBankNoteSubmit(ev) {
  ev.preventDefault();
  const list = getBankNotes(activeProfile);
  list.push({
    id: uid(),
    bank: document.getElementById('bn-bank').value.trim(),
    desc: document.getElementById('bn-desc').value.trim()
  });
  document.getElementById('bn-bank').value = '';
  document.getElementById('bn-desc').value = '';
  saveDatabase(db);
  renderBankNotes();
  showToast('Banco anotado!');
}

function openBankNoteModal(id) {
  const item = getBankNotes(activeProfile).find(b => b.id === id);
  if (!item) return;
  document.getElementById('m-bn-id').value = item.id;
  document.getElementById('m-bn-bank').value = item.bank;
  document.getElementById('m-bn-desc').value = item.desc;
  document.getElementById('modal-bank-note').classList.remove('hidden');
}

function saveBankNoteModal(ev) {
  ev.preventDefault();
  const id = document.getElementById('m-bn-id').value;
  const item = getBankNotes(activeProfile).find(b => b.id === id);
  if (item) {
    item.bank = document.getElementById('m-bn-bank').value.trim();
    item.desc = document.getElementById('m-bn-desc').value.trim();
    saveDatabase(db);
    closeModal('modal-bank-note');
    renderBankNotes();
    showToast('Anotação atualizada!');
  }
}

function deleteBankNote(id) {
  if (!confirm('Remover esta anotação de banco?')) return;
  db[activeProfile].bankNotes = getBankNotes(activeProfile).filter(b => b.id !== id);
  saveDatabase(db);
  renderBankNotes();
  showToast('Anotação removida.');
}

function handleReserveSubmit(ev) {
  ev.preventDefault();
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.reserves.push({
    id: uid(),
    desc: document.getElementById('res-desc').value.trim(),
    val: parseCurrencyInput('res-val'),
    date: document.getElementById('res-date').value,
    bank: ''
  });
  document.getElementById('res-desc').value = '';
  document.getElementById('res-val').value = '';
  saveDatabase(db);
  renderAll();
  showToast('Valor guardado e debitado do saldo disponível!');
}

function deleteReserve(id) {
  if (!confirm('Remover este aporte da reserva?')) return;
  const mData = ensureMonthData(activeProfile, currentYear, currentMonth);
  mData.reserves = mData.reserves.filter(r => r.id !== id);
  saveDatabase(db);
  renderAll();
  showToast('Registro de reserva removido.');
}

// ==================== MODALS & BACKUP ====================
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openBackupModal() {
  document.getElementById('modal-backup').classList.remove('hidden');
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financas-duo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup baixado com sucesso!');
}

function importBackup(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.vinicius && parsed.zelio) {
        db = parsed;
        saveDatabase(db);
        closeModal('modal-backup');
        renderAll();
        updateProfilePreviews();
        showToast('Backup importado com sucesso!');
      } else {
        alert('Arquivo de backup inválido.');
      }
    } catch {
      alert('Erro ao ler o arquivo JSON.');
    }
  };
  reader.readAsText(file);
}

function resetToSeedData() {
  if (!confirm('Isso vai zerar os dados atuais desta conta. Continuar?')) return;
  db = createInitialDataForUser(window.currentAuthUser ? window.currentAuthUser.email : '');
  saveDatabase(db);
  closeModal('modal-backup');
  backToProfiles();
  showToast('Dados da conta zerados!');
}

// ==================== ABA 6: RELATÓRIO & PDF ====================
function toggleReportPeriodUI() {
  const period = document.getElementById('rep-period').value;
  document.getElementById('rep-month-group').classList.toggle('hidden', period === 'year');
}

function renderRelatorio() {
  const preview = document.getElementById('report-preview-area');
  if (!preview || !activeProfile) return;

  const scope = document.getElementById('rep-scope').value;
  const period = document.getElementById('rep-period').value;
  const year = Number(document.getElementById('rep-year').value) || currentYear;
  const month = Number(document.getElementById('rep-month').value) || currentMonth;

  const scopeLabels = {
    all: 'Relatório Completo (Todas as Abas)',
    receitas: 'Receitas Mensais',
    fixas: 'Contas Fixas',
    gastos: 'Gastos do Dia a Dia',
    reserva: 'Dinheiro Guardado'
  };

  const monthsToRender = period === 'year'
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    : [month];

  const periodLabel = period === 'year'
    ? `Todos os meses de ${year}`
    : `${MONTHS_PT[month - 1]} / ${year}`;

  const profileName = db[activeProfile].name;
  const todayStr = new Date().toLocaleDateString('pt-BR');

  let blocksHtml = '';
  let grandTotalEntradas = 0;
  let grandTotalFixas = 0;
  let grandTotalGastos = 0;
  let grandTotalReserva = 0;

  monthsToRender.forEach(m => {
    const key = getMonthKey(year, m);
    const mData = db[activeProfile].months[key] || { salary: 0, extras: [], fixedBills: [], expenses: [], reserves: [] };
    const sum = computeMonthSummary(activeProfile, year, m);
    const fixedList = getMonthFixedBills(activeProfile, year, m);

    // No modo anual, pula meses totalmente vazios para manter o PDF limpo
    if (
      period === 'year' &&
      sum.totalEntradas === 0 &&
      fixedList.length === 0 &&
      (mData.expenses || []).length === 0 &&
      (mData.reserves || []).length === 0
    ) {
      return;
    }

    grandTotalEntradas += sum.totalEntradas;
    grandTotalFixas += sum.totalFixas;
    grandTotalGastos += sum.totalGastos;
    grandTotalReserva += sum.totalReservado;

    let sectionHtml = '';

    if (scope === 'all' || scope === 'receitas') {
      const extrasRows = (mData.extras || []).map(ex => `
        <tr>
          <td>${escapeHtml(ex.desc)}</td>
          <td>${formatDateBR(ex.date)}</td>
          <td class="text-right text-emerald">+ ${formatBRL(ex.val)}</td>
        </tr>
      `).join('');

      sectionHtml += `
        <div class="report-sub-title">Receitas Mensais</div>
        <div class="report-kpi-row">
          <div class="report-kpi-box"><span>Sobrado Mês Anterior</span><strong>${formatBRL(sum.carryover)}</strong></div>
          <div class="report-kpi-box"><span>Salário Base</span><strong>${formatBRL(sum.salary)}</strong></div>
          ${sum.bonus13 > 0 ? `<div class="report-kpi-box"><span>13º / Férias</span><strong>${formatBRL(sum.bonus13)}</strong></div>` : ''}
          <div class="report-kpi-box"><span>Renda Extra</span><strong>${formatBRL(sum.totalExtra)}</strong></div>
          <div class="report-kpi-box"><span>Dízimo (10%)</span><strong>${formatBRL(sum.dizimo)}</strong></div>
          <div class="report-kpi-box"><span>Saldo Disponível</span><strong class="text-emerald">${formatBRL(sum.saldoDisponivel)}</strong></div>
        </div>
        ${(mData.extras || []).length > 0 ? `
          <table class="data-table">
            <thead><tr><th>Renda Extra</th><th>Data</th><th class="text-right">Valor</th></tr></thead>
            <tbody>${extrasRows}</tbody>
          </table>
        ` : ''}
      `;
    }

    if (scope === 'all' || scope === 'fixas') {
      const fixedRows = fixedList.length > 0 ? fixedList.map(b => `
        <tr>
          <td>${escapeHtml(b.desc)}</td>
          <td>Dia ${b.due}</td>
          <td>${b.isContinuous ? 'Contínua' : (b.pTotal ? `${b.pCurr}/${b.pTotal}` : 'Mensal')}</td>
          <td>${b.paid ? 'Pago' : 'Pendente'}</td>
          <td class="text-right">${formatBRL(b.val)}</td>
        </tr>
      `).join('') : `<tr><td colspan="5" class="muted-text">Sem contas fixas neste mês.</td></tr>`;

      sectionHtml += `
        <div class="report-sub-title">Contas Fixas (Total: ${formatBRL(sum.totalFixas)})</div>
        <table class="data-table">
          <thead><tr><th>Descrição</th><th>Vencimento</th><th>Tipo / Parcelas</th><th>Status</th><th class="text-right">Valor</th></tr></thead>
          <tbody>${fixedRows}</tbody>
        </table>
      `;
    }

    if (scope === 'all' || scope === 'gastos') {
      const expList = [...(mData.expenses || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const expRows = expList.length > 0 ? expList.map(e => `
        <tr>
          <td>${escapeHtml(e.desc)}</td>
          <td>${escapeHtml(e.cat || 'Outros')}</td>
          <td>${formatDateBR(e.date)}</td>
          <td class="text-right text-red">- ${formatBRL(e.val)}</td>
        </tr>
      `).join('') : `<tr><td colspan="4" class="muted-text">Sem gastos diários neste mês.</td></tr>`;

      sectionHtml += `
        <div class="report-sub-title">Gastos do Dia a Dia (Total: ${formatBRL(sum.totalGastos)})</div>
        <table class="data-table">
          <thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th class="text-right">Valor</th></tr></thead>
          <tbody>${expRows}</tbody>
        </table>
      `;
    }

    if (scope === 'all' || scope === 'reserva') {
      const resList = mData.reserves || [];
      const resRows = resList.length > 0 ? resList.map(r => `
        <tr>
          <td>${escapeHtml(r.desc)}</td>
          <td>${escapeHtml(r.bank)}</td>
          <td>${formatDateBR(r.date)}</td>
          <td class="text-right">- ${formatBRL(r.val)}</td>
        </tr>
      `).join('') : `<tr><td colspan="4" class="muted-text">Sem registros de dinheiro guardado neste mês.</td></tr>`;

      sectionHtml += `
        <div class="report-sub-title">Dinheiro Guardado (Total: ${formatBRL(sum.totalReservado)})</div>
        <table class="data-table">
          <thead><tr><th>Descrição</th><th>Local / Banco</th><th>Data</th><th class="text-right">Valor</th></tr></thead>
          <tbody>${resRows}</tbody>
        </table>
      `;
    }

    blocksHtml += `
      <div class="report-month-block">
        <div class="report-month-title">${MONTHS_PT[m - 1]} de ${year}</div>
        ${sectionHtml}
      </div>
    `;
  });

  if (!blocksHtml) {
    blocksHtml = `<p class="muted-text" style="padding: 20px 0;">Nenhum dado encontrado para ${periodLabel}.</p>`;
  }

  const annualTotalsHtml = period === 'year' ? `
    <div class="report-kpi-row mb-16">
      ${(scope === 'all' || scope === 'receitas') ? `<div class="report-kpi-box"><span>Total Entradas (${year})</span><strong>${formatBRL(grandTotalEntradas)}</strong></div>` : ''}
      ${(scope === 'all' || scope === 'fixas') ? `<div class="report-kpi-box"><span>Total Contas Fixas (${year})</span><strong>${formatBRL(grandTotalFixas)}</strong></div>` : ''}
      ${(scope === 'all' || scope === 'gastos') ? `<div class="report-kpi-box"><span>Total Gastos Diários (${year})</span><strong class="text-red">${formatBRL(grandTotalGastos)}</strong></div>` : ''}
      ${(scope === 'all' || scope === 'reserva') ? `<div class="report-kpi-box"><span>Total Guardado (${year})</span><strong class="text-emerald">${formatBRL(grandTotalReserva)}</strong></div>` : ''}
    </div>
  ` : '';

  const settings = getSettings();
  preview.innerHTML = `
    <div class="report-brand-header">
      <div class="report-brand-left">
        <img src="logo.jpg" alt="${escapeHtml(settings.brandName)}" class="brand-logo-img" />
        <div>
          <div class="brand-name">${escapeHtml(settings.brandName)} — ${escapeHtml(settings.brandSub)}</div>
          <div class="brand-sub">${scopeLabels[scope]} • Perfil: <strong>${escapeHtml(profileName)}</strong></div>
        </div>
      </div>
      <div class="text-right">
        <div style="font-size:13px; font-weight:700;">${periodLabel}</div>
        <div class="muted-text">Emitido em ${todayStr}</div>
      </div>
    </div>
    ${annualTotalsHtml}
    ${blocksHtml}
  `;
}

function printReportPDF() {
  renderRelatorio();
  window.print();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================== CONFIGURAÇÕES & PALETA DE CORES ====================
const THEME_PALETTES = [
  {
    key: 'default',
    name: 'Marinho & Esmeralda',
    sub: 'Padrão claro',
    primary: '#0b1727',
    accent: '#047857',
    bg: '#f5f7fa'
  },
  {
    key: 'royal',
    name: 'Azul Royal & Ciano',
    sub: 'Fundo azulado suave',
    primary: '#0f2942',
    accent: '#0284c7',
    bg: '#e6eff8'
  },
  {
    key: 'indigo',
    name: 'Grafite & Roxo',
    sub: 'Fundo lavanda suave',
    primary: '#1e1b4b',
    accent: '#6d28d9',
    bg: '#edeaf9'
  },
  {
    key: 'gold',
    name: 'Carvão & Âmbar',
    sub: 'Fundo creme quente',
    primary: '#1c1917',
    accent: '#b45309',
    bg: '#f5efe6'
  },
  {
    key: 'ruby',
    name: 'Vinho & Rubi',
    sub: 'Fundo rosado suave',
    primary: '#3b0722',
    accent: '#be185d',
    bg: '#f7e9ef'
  },
  {
    key: 'forest',
    name: 'Floresta & Oliva',
    sub: 'Fundo menta suave',
    primary: '#14261c',
    accent: '#15803d',
    bg: '#e7f2eb'
  },
  {
    key: 'dark_navy',
    name: 'Noturno Marinho',
    sub: 'Fundo escuro azulado',
    primary: '#38bdf8',
    accent: '#10b981',
    bg: '#0b1322'
  },
  {
    key: 'dark_slate',
    name: 'Noturno Grafite',
    sub: 'Fundo escuro neutro',
    primary: '#a78bfa',
    accent: '#34d399',
    bg: '#121417'
  }
];

function getSettings() {
  if (!db.settings) {
    db.settings = {
      brandName: 'Fersales Tech',
      brandSub: 'Controle Financeiro',
      paletteKey: 'default',
      customPrimary: '#0b1727',
      customAccent: '#047857',
      customBg: '#f5f7fa'
    };
  }
  return db.settings;
}

function isDarkHex(hex) {
  const clean = (hex || '#ffffff').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.45;
}

function mixHex(hexA, hexB, weightB) {
  const parse = (h) => {
    const clean = h.replace('#', '');
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16)
    ];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const w1 = 1 - weightB;
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r1 * w1 + r2 * weightB)}${toHex(g1 * w1 + g2 * weightB)}${toHex(b1 * w1 + b2 * weightB)}`;
}

function applyThemePalette() {
  const settings = getSettings();
  const preset = THEME_PALETTES.find(p => p.key === settings.paletteKey);
  const primary = preset ? preset.primary : (settings.customPrimary || '#0b1727');
  const accent = preset ? preset.accent : (settings.customAccent || '#047857');
  const bg = preset ? preset.bg : (settings.customBg || '#f5f7fa');
  const darkBg = isDarkHex(bg);

  const root = document.documentElement.style;
  root.setProperty('--navy', primary);
  root.setProperty('--navy-hover', mixHex(primary, darkBg ? '#000000' : '#ffffff', 0.14));
  root.setProperty('--emerald', accent);
  root.setProperty('--emerald-dark', mixHex(accent, '#000000', 0.22));
  root.setProperty('--emerald-light', mixHex(accent, darkBg ? '#000000' : '#ffffff', darkBg ? 0.65 : 0.82));
  root.setProperty('--emerald-soft', mixHex(accent, darkBg ? '#000000' : '#ffffff', darkBg ? 0.78 : 0.92));
  root.setProperty('--emerald-border', mixHex(accent, darkBg ? '#000000' : '#ffffff', darkBg ? 0.50 : 0.65));
  root.setProperty('--bg', bg);

  if (darkBg) {
    root.setProperty('--surface', mixHex(bg, '#ffffff', 0.08));
    root.setProperty('--surface-alt', mixHex(bg, '#ffffff', 0.13));
    root.setProperty('--text', '#f1f5f9');
    root.setProperty('--text-muted', '#94a3b8');
    root.setProperty('--border', mixHex(bg, '#ffffff', 0.18));
  } else {
    root.setProperty('--surface', '#ffffff');
    root.setProperty('--surface-alt', '#f8fafc');
    root.setProperty('--text', '#0f172a');
    root.setProperty('--text-muted', '#64748b');
    root.setProperty('--border', '#e2e8f0');
  }
}

function applySettingsToUI() {
  const settings = getSettings();
  applyThemePalette();

  document.title = `${settings.brandName} — ${settings.brandSub}`;

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setTxt('sidebar-brand-name', settings.brandName);
  setTxt('sidebar-brand-sub', settings.brandSub);

  renderProfileScreen();

  if (activeProfile) {
    const activeName = (db[activeProfile] && db[activeProfile].name) ? db[activeProfile].name : activeProfile;
    setTxt('sidebar-profile-name', activeName);
    setTxt('dash-greeting-name', activeName);
    setTxt('sidebar-avatar', (activeName.trim().charAt(0) || 'U').toUpperCase());
  }
}

function renderConfig() {
  const settings = getSettings();
  const inProfile = document.getElementById('cfg-active-profile-name');
  const inObs = document.getElementById('cfg-active-profile-obs');

  if (inProfile && activeProfile && db[activeProfile]) {
    inProfile.value = db[activeProfile].name || '';
  }
  if (inObs && activeProfile && db[activeProfile]) {
    const defaultObs = activeProfile === 'vinicius'
      ? 'Meu Controle'
      : (activeProfile === 'zelio' ? 'Controle do Meu Pai' : 'Controle Pessoal');
    inObs.value = db[activeProfile].subtitle !== undefined ? db[activeProfile].subtitle : defaultObs;
  }

  const catListEl = document.getElementById('cfg-categories-list');
  const catCountEl = document.getElementById('cfg-cat-count');
  if (catListEl && activeProfile) {
    const cats = getExpenseCategories();
    if (catCountEl) catCountEl.textContent = cats.length;
    catListEl.innerHTML = cats.map((cat, idx) => `
      <div class="cat-item-row">
        <input type="text" value="${escapeHtml(cat)}" id="cfg-cat-input-${idx}" />
        <button type="button" class="btn btn-outline btn-sm" onclick="renameExpenseCategory(${idx})" title="Salvar alteração">Salvar</button>
        <button type="button" class="icon-btn" onclick="removeExpenseCategory(${idx})" title="Remover categoria" ${cats.length <= 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>🗑️</button>
      </div>
    `).join('');
  }

  const preset = THEME_PALETTES.find(p => p.key === settings.paletteKey);
  const curPrimary = preset ? preset.primary : (settings.customPrimary || '#0b1727');
  const curAccent = preset ? preset.accent : (settings.customAccent || '#047857');
  const curBg = preset ? preset.bg : (settings.customBg || '#f5f7fa');

  const cp = document.getElementById('cfg-color-primary');
  const ca = document.getElementById('cfg-color-accent');
  const cb = document.getElementById('cfg-color-bg');
  if (cp) cp.value = curPrimary;
  if (ca) ca.value = curAccent;
  if (cb) cb.value = curBg;
  updateColorHexLabel('cfg-color-primary', 'cfg-color-primary-hex');
  updateColorHexLabel('cfg-color-accent', 'cfg-color-accent-hex');
  updateColorHexLabel('cfg-color-bg', 'cfg-color-bg-hex');

  const grid = document.getElementById('palette-grid');
  if (grid) {
    grid.innerHTML = THEME_PALETTES.map(p => {
      const isActive = settings.paletteKey === p.key;
      return `
        <button type="button" class="palette-card ${isActive ? 'active' : ''}" onclick="selectPalette('${p.key}')">
          <div>
            <div class="palette-name">${p.name}</div>
            <div class="palette-sub">${p.sub}</div>
          </div>
          <div class="palette-swatches">
            <span class="swatch-dot" style="background:${p.primary}" title="Principal"></span>
            <span class="swatch-dot" style="background:${p.accent}" title="Destaque"></span>
            <span class="swatch-dot" style="background:${p.bg}" title="Fundo"></span>
          </div>
        </button>
      `;
    }).join('');
  }
}

const DEFAULT_EXPENSE_CATEGORIES = ['Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Outros'];

function getExpenseCategories() {
  if (!activeProfile || !db[activeProfile]) return [...DEFAULT_EXPENSE_CATEGORIES];
  if (!Array.isArray(db[activeProfile].categories) || db[activeProfile].categories.length === 0) {
    db[activeProfile].categories = [...DEFAULT_EXPENSE_CATEGORIES];
  }
  return db[activeProfile].categories;
}

function syncExpenseCategorySelects() {
  const cats = getExpenseCategories();
  const optsHtml = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  ['inline-exp-cat', 'm-exp-cat'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = optsHtml;
    sel.value = cats.includes(prev) ? prev : (cats[0] || '');
  });

  const filterWrap = document.getElementById('gastos-cat-filters');
  if (filterWrap) {
    if (expenseCatFilter !== 'Todos' && !cats.includes(expenseCatFilter)) {
      expenseCatFilter = 'Todos';
    }
    const filterItems = ['Todos', ...cats];
    filterWrap.innerHTML = filterItems.map(c => `
      <button class="filter-btn ${expenseCatFilter === c ? 'active' : ''}" onclick="setExpenseCatFilter('${escapeHtml(c).replace(/'/g, "\\'")}')">${escapeHtml(c)}</button>
    `).join('');
  }
}

function toggleConfigCategories() {
  const listEl = document.getElementById('cfg-categories-list');
  const btnEl = document.getElementById('cfg-cat-toggle-btn');
  if (!listEl || !btnEl) return;
  const isHidden = listEl.classList.toggle('hidden');
  btnEl.classList.toggle('open', !isHidden);
}

function addExpenseCategory(e) {
  e.preventDefault();
  const inp = document.getElementById('cfg-new-cat');
  const val = inp ? inp.value.trim() : '';
  if (!val) return;

  const cats = getExpenseCategories();
  if (cats.some(c => c.toLowerCase() === val.toLowerCase())) {
    showToast('Essa categoria já existe!');
    return;
  }
  cats.push(val);
  saveDatabase(db);
  if (inp) inp.value = '';
  syncExpenseCategorySelects();
  renderConfig();
  showToast('Categoria adicionada!');
}

function renameExpenseCategory(idx) {
  const inp = document.getElementById(`cfg-cat-input-${idx}`);
  const newVal = inp ? inp.value.trim() : '';
  if (!newVal) return;

  const cats = getExpenseCategories();
  const oldVal = cats[idx];
  if (!oldVal || oldVal === newVal) return;
  if (cats.some((c, i) => i !== idx && c.toLowerCase() === newVal.toLowerCase())) {
    showToast('Já existe uma categoria com esse nome!');
    return;
  }

  cats[idx] = newVal;
  // Atualiza gastos existentes do perfil que usavam o nome antigo
  Object.values(db[activeProfile].months || {}).forEach(m => {
    (m.expenses || []).forEach(exp => {
      if (exp.cat === oldVal) exp.cat = newVal;
    });
  });

  saveDatabase(db);
  syncExpenseCategorySelects();
  renderAll();
  showToast('Categoria atualizada!');
}

function removeExpenseCategory(idx) {
  const cats = getExpenseCategories();
  if (cats.length <= 1) return;
  cats.splice(idx, 1);
  saveDatabase(db);
  syncExpenseCategorySelects();
  renderAll();
  showToast('Categoria removida!');
}

function resetExpenseCategories() {
  if (!activeProfile || !db[activeProfile]) return;
  db[activeProfile].categories = [...DEFAULT_EXPENSE_CATEGORIES];
  saveDatabase(db);
  syncExpenseCategorySelects();
  renderAll();
  showToast('Categorias padrão restauradas!');
}

function saveSettingsNames(e) {
  e.preventDefault();
  const profileName = document.getElementById('cfg-active-profile-name').value.trim();
  const obsEl = document.getElementById('cfg-active-profile-obs');
  const profileObs = obsEl ? obsEl.value.trim() : '';
  if (!profileName) return;

  if (activeProfile && db[activeProfile]) {
    db[activeProfile].name = profileName;
    db[activeProfile].subtitle = profileObs;
  }

  saveDatabase(db);
  applySettingsToUI();
  renderAll();
  showToast('Perfil atualizado com sucesso!');
}

function selectPalette(key) {
  const settings = getSettings();
  settings.paletteKey = key;
  saveDatabase(db);
  applySettingsToUI();
  renderConfig();
  showToast('Paleta de cores aplicada!');
}

function updateColorHexLabel(inputId, labelId) {
  const inp = document.getElementById(inputId);
  const lbl = document.getElementById(labelId);
  if (inp && lbl) lbl.textContent = inp.value;
}

function applyCustomColors() {
  const primary = document.getElementById('cfg-color-primary').value;
  const accent = document.getElementById('cfg-color-accent').value;
  const bg = document.getElementById('cfg-color-bg').value;
  const settings = getSettings();
  settings.paletteKey = 'custom';
  settings.customPrimary = primary;
  settings.customAccent = accent;
  settings.customBg = bg;
  saveDatabase(db);
  applySettingsToUI();
  renderConfig();
  showToast('Cores personalizadas aplicadas!');
}

function resetThemePalette() {
  selectPalette('default');
}

// ==================== CONTROLE DE FINANCIAMENTO ====================
function ensureFinancingData() {
  const profile = db[activeProfile];
  if (!profile) return { totalDebt: 0, installments: [] };
  if (!profile.financing) {
    profile.financing = { totalDebt: 0, installments: [] };
  }
  if (!Array.isArray(profile.financing.installments)) {
    profile.financing.installments = [];
  }
  return profile.financing;
}

function renderFinanciamento() {
  if (!activeProfile || !db[activeProfile] || db[activeProfile].type !== 'financing') return;
  const profile = db[activeProfile];
  const fin = ensureFinancingData();
  const sum = computeFinancingSummary(profile);

  const titleEl = document.getElementById('fin-page-title');
  const subEl = document.getElementById('fin-page-subtitle');
  if (titleEl) titleEl.textContent = profile.name || 'Financiamento';
  if (subEl) subEl.textContent = profile.subtitle || 'Acompanhe o valor total da dívida, parcelas pagas e quanto falta pagar.';

  document.getElementById('fin-total-debt').textContent = formatBRL(sum.totalDebt);
  setCurrencyInput('fin-debt-input', sum.totalDebt > 0 ? sum.totalDebt : '');
  document.getElementById('fin-total-paid').textContent = formatBRL(sum.totalPaid);
  document.getElementById('fin-paid-pct').textContent = `${sum.pct}% quitado`;
  document.getElementById('fin-remaining').textContent = formatBRL(sum.remaining);
  document.getElementById('fin-paid-count').textContent = `${sum.paidCount} de ${sum.totalCount} parcelas pagas`;
  const progEl = document.getElementById('fin-progress-fill');
  if (progEl) progEl.style.width = `${sum.pct}%`;

  const sorted = [...fin.installments].sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0));
  const nextNumEl = document.getElementById('fin-inst-num');
  if (nextNumEl && !nextNumEl.value) {
    const maxNum = sorted.reduce((m, it) => Math.max(m, Number(it.num) || 0), 0);
    nextNumEl.value = maxNum + 1;
  }

  const tbody = document.getElementById('fin-installments-tbody');
  if (!tbody) return;

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted-text" style="text-align:center;padding:24px;">Nenhuma parcela cadastrada. Adicione acima ou use "Gerar Parcelas".</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(item => {
    const val = Number(item.val) || 0;
    const isPaid = !!item.paid && val > 0;
    const badgeCls = isPaid ? 'badge badge-emerald' : 'badge badge-amber';
    const badgeTxt = isPaid ? 'Pago ✓' : 'Em aberto';
    return `
      <tr>
        <td><strong>Parcela ${item.num}</strong></td>
        <td>${formatDateBR(item.date)}</td>
        <td class="text-right"><strong>${val > 0 ? formatBRL(val) : '—'}</strong></td>
        <td>
          <button type="button" class="${badgeCls}" style="border:none;cursor:pointer;" onclick="toggleFinPaid('${item.id}')" title="Clique para alternar status">
            ${badgeTxt}
          </button>
        </td>
        <td class="actions-col no-print">
          <button type="button" class="icon-btn" onclick="openFinEditModal('${item.id}')" title="Editar parcela">✏️</button>
          <button type="button" class="icon-btn danger" onclick="deleteFinInstallment('${item.id}')" title="Excluir parcela">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function saveFinTotalDebt(e) {
  e.preventDefault();
  const fin = ensureFinancingData();
  fin.totalDebt = parseCurrencyInput('fin-debt-input');
  saveDatabase(db);
  renderFinanciamento();
  showToast('Valor da dívida atualizado!');
}

function addFinInstallment(e) {
  e.preventDefault();
  const fin = ensureFinancingData();
  const num = Number(document.getElementById('fin-inst-num').value) || (fin.installments.length + 1);
  const date = document.getElementById('fin-inst-date').value;
  const val = parseCurrencyInput('fin-inst-val');
  const paid = val > 0;

  fin.installments.push({
    id: uid(),
    num,
    date,
    val,
    paid
  });

  document.getElementById('fin-inst-num').value = num + 1;
  setCurrencyInput('fin-inst-val', '');
  saveDatabase(db);
  renderFinanciamento();
  showToast(`Parcela ${num} adicionada!`);
}

function toggleFinPaid(id) {
  const fin = ensureFinancingData();
  const item = fin.installments.find(i => i.id === id);
  if (!item) return;
  if ((Number(item.val) || 0) <= 0) {
    openFinEditModal(id);
    return;
  }
  item.paid = !item.paid;
  saveDatabase(db);
  renderFinanciamento();
}

function openFinEditModal(id) {
  const fin = ensureFinancingData();
  const item = fin.installments.find(i => i.id === id);
  if (!item) return;
  document.getElementById('m-fin-id').value = item.id;
  document.getElementById('m-fin-num').value = item.num;
  document.getElementById('m-fin-date').value = item.date;
  setCurrencyInput('m-fin-val', item.val > 0 ? item.val : '');
  document.getElementById('m-fin-paid').checked = !!item.paid;
  document.getElementById('modal-fin-edit').classList.remove('hidden');
}

function saveFinEditModal(e) {
  e.preventDefault();
  const fin = ensureFinancingData();
  const id = document.getElementById('m-fin-id').value;
  const item = fin.installments.find(i => i.id === id);
  if (!item) return;

  item.num = Number(document.getElementById('m-fin-num').value) || item.num;
  item.date = document.getElementById('m-fin-date').value;
  item.val = parseCurrencyInput('m-fin-val');
  item.paid = document.getElementById('m-fin-paid').checked && item.val > 0;

  saveDatabase(db);
  closeModal('modal-fin-edit');
  renderFinanciamento();
  showToast('Parcela atualizada!');
}

function deleteFinInstallment(id) {
  if (!confirm('Remover esta parcela?')) return;
  const fin = ensureFinancingData();
  fin.installments = fin.installments.filter(i => i.id !== id);
  saveDatabase(db);
  renderFinanciamento();
  showToast('Parcela removida.');
}

function openFinGenerateModal() {
  const fin = ensureFinancingData();
  const maxNum = fin.installments.reduce((m, it) => Math.max(m, Number(it.num) || 0), 0);
  document.getElementById('fin-gen-start').value = maxNum + 1;
  document.getElementById('fin-gen-qty').value = 12;
  document.getElementById('fin-gen-date').value = `${currentYear}-${String(currentMonth).padStart(2, '0')}-10`;
  setCurrencyInput('fin-gen-val', '');
  document.getElementById('modal-fin-generate').classList.remove('hidden');
}

function generateFinInstallments(e) {
  e.preventDefault();
  const fin = ensureFinancingData();
  const startNum = Number(document.getElementById('fin-gen-start').value) || 1;
  const qty = Math.min(120, Math.max(1, Number(document.getElementById('fin-gen-qty').value) || 1));
  const startDateStr = document.getElementById('fin-gen-date').value;
  const defaultVal = parseCurrencyInput('fin-gen-val');
  if (!startDateStr) return;

  const [y0, m0, d0] = startDateStr.split('-').map(Number);
  for (let i = 0; i < qty; i++) {
    const dt = new Date(y0, m0 - 1 + i, d0);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    fin.installments.push({
      id: uid(),
      num: startNum + i,
      date: iso,
      val: defaultVal,
      paid: false
    });
  }

  saveDatabase(db);
  closeModal('modal-fin-generate');
  renderFinanciamento();
  showToast(`${qty} parcelas geradas!`);
}

document.addEventListener('DOMContentLoaded', init);
