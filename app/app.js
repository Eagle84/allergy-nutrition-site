import { resolvePlatform, isLocalHost } from '../assets/js/router.js';
import { authConfigured, onUser, getIdToken, signOut } from '../assets/js/auth.js';
import {
  effectivePlan, trialDaysLeft, visibleAnalysis, cleanProfile, maxConditions, validateProfile, isComplete, toRequestProfile, resolveLocation,
  approvedProducts, addDiaryEntry, SAMPLE_DIETITIANS, DEFAULT_CITY_ID,
  resolveConfig, featureVisible, orderItems, orderListText, storeKey,
} from './js/logic.js';
import { createStore } from './js/store.js';
import { createApi, ApiError } from './js/api.js';
import * as V from './js/views.js';

const $ = (s, r = document) => r.querySelector(s);

// ---- gate: this web app is for iPhone (and iPad); Android gets the store, desktop gets an error ----------------
const platform = resolvePlatform(window);
if (platform === 'desktop') { $('#gate').classList.remove('hidden'); throw new Error('desktop-blocked'); }
if (platform === 'android') { window.location.replace('../'); throw new Error('android-redirect'); }

// The sample-data preview exists only on a local development host. The public site always requires sign-in.
const DEMO = isLocalHost(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';

const EMPTY_PROFILE = { name: '', birthYear: null, sex: '', heightCm: null, weightKg: null, activity: '', goal: '', diet: '', kosher: false, pregnancy: '', avoid: '', shareForAnalysis: true, onboarded: false };
const MAX_MARKET_FOODS = 40;

const state = {
  user: null, ready: false, saved: null, api: null,
  conditions: [], selected: [], severity: {}, query: '', analysis: null, demoData: false, error: '', errorUpgrade: false, loading: false,
  swaps: {}, profile: { ...EMPTY_PROFILE }, location: { autoDetect: true, cityId: DEFAULT_CITY_ID }, fix: null,
  markets: { status: 'idle', data: null, error: '' }, diary: [], diaryOpen: null, diaryForm: { meal: '', symptoms: [], severity: 1, note: '' },
  step: 0, errors: [], year: new Date().getFullYear(),
  config: resolveConfig(null), dismissedAnnouncement: '', orderIndex: null, orderUnchecked: [],
};

const now = () => Date.now();
const plan = () => effectivePlan(state.user, now(), state.config.settings.trial_days, state.config.settings.trial_plan);
const viewModel = () => ({
  ...state, analysis: visibleAnalysis(state.selected, state.analysis), plan: plan(), trialLeft: trialDaysLeft(state.user, now(), state.config.settings.trial_days), resolved: resolveLocation(state.location, state.fix),
});

// ---- data ------------------------------------------------------------------------------------------------------
const demoApi = {
  conditions: async () => (await fetch('conditions.json')).json(),
  config: async () => ({ flags: { 'feature.online_order': true }, settings: {} }),
  analyze: async () => (await fetch('sample-analysis.json')).json(),
  marketsTop: async () => ({
    available: true, source: 'נתוני דוגמה', as_of: null, location: { lat: 32.08, lng: 34.78, label: null }, disclaimer: 'נתוני דוגמה בלבד.',
    markets: [1, 2, 3].map((n) => ({ chain: 'רשת לדוגמה', store_name: `סניף ${n}`, address: 'רחוב הדוגמה', city: 'תל אביב', distance_km: n * 1.2, basket_total: 40 + n, effective_cost: 42 + n, items_found: 2, items_requested: 2, missing: [], prices: [{ food: 'אורז', product: 'אורז לדוגמה', price: 9.9 }, { food: 'חלב', product: 'חלב לדוגמה', price: 6.5 }],
      online_store_url: 'https://www.shufersal.co.il/online/he/A', online_search_url: 'https://www.shufersal.co.il/online/he/search?text={q}' })),
  }),
};

const messageFor = (e) => (e instanceof ApiError ? e.message : 'אירעה שגיאה. נסו שוב');

async function loadConditions() {
  try { return await state.api.conditions(); } catch { return (await fetch('conditions.json')).json(); }
}

async function refreshConfig() {
  try {
    const raw = await state.api.config();
    state.config = resolveConfig(raw);
    state.saved.set('config', raw);
  } catch { /* keep the cached or default configuration */ }
  render();
}

async function analyze() {
  if (state.loading) return;
  state.loading = true; state.error = ''; state.errorUpgrade = false; render();
  const chosen = state.selected.map((slug) => state.conditions.find((c) => c.slug === slug)).filter(Boolean);
  const terms = chosen.map((c) => c.display_name_he);
  const severity = Object.fromEntries(chosen.filter((c) => state.severity[c.slug]).map((c) => [c.display_name_he, state.severity[c.slug]]));
  const req = { conditions: terms };
  if (Object.keys(severity).length) req.severity = severity;
  const profile = toRequestProfile(state.profile);
  if (profile) req.profile = profile;
  try {
    state.analysis = await state.api.analyze(req);
    state.demoData = DEMO;
    state.swaps = {}; state.markets = { status: 'idle', data: null, error: '' }; state.query = '';
    state.saved.set('analysis', state.analysis);
    location.hash = '#/analysis';
  } catch (e) {
    state.error = e instanceof ApiError && e.kind === 'invalid' ? `לא זוהה: ${e.term}` : messageFor(e);
    state.errorUpgrade = e instanceof ApiError && e.kind === 'upgrade';
    if (e instanceof ApiError && e.kind === 'auth') { await signOut().catch(() => {}); location.replace('../'); return; }
  } finally { state.loading = false; render(); }
}

function deviceFix() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 8000, maximumAge: 600000 },
    );
  });
}

async function findMarkets() {
  if (state.markets.status === 'loading') return;
  state.markets = { status: 'loading', data: null, error: '' }; render();
  if (state.location.autoDetect) state.fix = await deviceFix();
  const where = resolveLocation(state.location, state.fix);
  const foods = [...new Set(approvedProducts(state.analysis).map((f) => f.name_he.trim()).filter(Boolean))].slice(0, MAX_MARKET_FOODS);
  try {
    const data = await state.api.marketsTop({ foods, lat: where.lat, lng: where.lng, label: where.label });
    state.markets = { status: 'ready', data, error: '' };
  } catch (e) {
    state.markets = { status: 'error', data: null, error: messageFor(e) };
  }
  render();
}

// ---- profile helpers -------------------------------------------------------------------------------------------
const saveProfile = () => state.saved.set('profile', state.profile);
const intOrNull = (s) => (s === '' || s == null ? null : Number.parseInt(s, 10));
const dietitianById = (id) => SAMPLE_DIETITIANS.find((d) => d.id === id);

function readProfileInputs() {
  const p = state.profile;
  const val = (id) => document.getElementById(id);
  if (val('f-name')) p.name = val('f-name').value;
  if (val('f-year')) p.birthYear = intOrNull(val('f-year').value);
  if (val('f-height')) p.heightCm = intOrNull(val('f-height').value);
  if (val('f-weight')) p.weightKg = intOrNull(val('f-weight').value);
  if (val('f-kosher')) p.kosher = val('f-kosher').checked;
  if (val('f-avoid')) p.avoid = val('f-avoid').value;
  if (val('f-share')) p.shareForAnalysis = val('f-share').checked;
}

// ---- router ----------------------------------------------------------------------------------------------------
const screens = {
  '#/home': V.home, '#/severity': V.severity, '#/analysis': V.analysisView, '#/matrix': V.matrix, '#/plan': V.mealPlan,
  '#/booklet': V.booklet, '#/order': V.orderView, '#/diary': V.diary, '#/products': V.products, '#/plans': V.plans, '#/settings': V.settings, '#/onboarding': V.onboarding,
};
const NAV = [['#/home', '🏠'], ['#/analysis', '📊'], ['#/matrix', '🔎'], ['#/plan', '🍽️'], ['#/settings', '⚙️']];

const mustOnboard = () => !state.profile.onboarded || !isComplete(state.profile, state.year);

const ROUTE_FLAGS = { '#/plan': 'feature.meal_plan', '#/diary': 'feature.diary', '#/dietitians': 'feature.dietitians', '#/booklet': 'feature.booklet', '#/products': 'feature.approved_products' };

function currentHash() {
  const h = (() => { try { return decodeURIComponent(location.hash || '#/home'); } catch { return '#/home'; } })();
  if (mustOnboard()) return '#/onboarding';
  if (h === '#/onboarding') return '#/home';
  const flag = ROUTE_FLAGS[h];
  return flag && !featureVisible(state.config, flag, state.user?.admin) ? '#/home' : h;
}

function render() {
  if (!state.ready) return;
  const hash = currentHash();
  const v = viewModel();
  let html;
  if (state.config.flags.maintenance && !state.user?.admin) html = V.noticeView('בתחזוקה', state.config.settings.maintenance_message || 'השירות בתחזוקה. נחזור בקרוב.');
  else if (hash === '#/dietitians') html = V.dietitians(v, SAMPLE_DIETITIANS);
  else if (hash.startsWith('#/dietitian/')) html = V.dietitianDetail(v, dietitianById(hash.slice(12)));
  else html = (screens[hash] ?? V.home)(v);
  const active = document.activeElement;
  const focus = active?.id && $('#root').contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  $('#root').innerHTML = html;
  $('#nav').classList.toggle('hidden', hash === '#/onboarding');
  $('#nav').innerHTML = NAV.map(([h, ic]) => `<a href="${h}" class="${hash === h ? 'on' : ''}">${ic}</a>`).join('');
  if (focus) {
    const el = document.getElementById(focus.id);
    if (el) {
      el.focus();
      try { el.setSelectionRange(focus.start, focus.end); } catch { /* number inputs have no selection */ }
    }
  }
}

function onRouteChange() {
  if (!state.ready) return;
  if (location.hash !== '#/onboarding' && !mustOnboard()) state.saved.set('route', location.hash || '#/home');
  if (!location.hash.startsWith('#/settings')) state.errors = [];
  window.scrollTo(0, 0);
  render();
}

// ---- events ----------------------------------------------------------------------------------------------------
const pick = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a[data-go], [data-go]');
  if (!t || !state.ready) return;
  const d = t.dataset;
  if (d.go) { location.hash = d.go; return; }
  if (d.pick) {
    const already = state.selected.includes(d.pick);
    if (!already && state.selected.length >= maxConditions(plan())) { location.hash = '#/plans'; return; }
    state.selected = pick(state.selected, d.pick); state.saved.set('selected', state.selected); render(); return;
  }
  if (d.locked) { location.hash = '#/plans'; return; }
  if (d.sev) { const [s, l] = d.sev.split(':'); state.severity[s] = Number(l); state.saved.set('severity', state.severity); render(); return; }
  if (d.swap) {
    const i = Number(d.swap); const m = state.analysis.personalized_diet_plan.meals[i]; const cur = state.swaps[i] ?? m.dish_name_he;
    state.swaps[i] = m.swap_options_he[(m.swap_options_he.indexOf(cur) + 1) % m.swap_options_he.length] ?? m.swap_options_he[0]; render(); return;
  }
  if (d.order !== undefined) {
    state.orderIndex = Number(d.order);
    const market = state.markets.data?.markets?.[state.orderIndex];
    state.orderUnchecked = market ? state.saved.get(`order:${storeKey(market)}`, []).filter((x) => typeof x === 'string') : [];
    location.hash = '#/order'; return;
  }
  if (d.ocheck !== undefined || 'oall' in d || 'onone' in d) { toggleOrder(d); return; }
  if ('ocopy' in d || 'oshare' in d) { shareOrder('oshare' in d); return; }
  if ('dismissAnnouncement' in d) { state.dismissedAnnouncement = state.config.settings.announcement; state.saved.set('dismissedAnnouncement', state.dismissedAnnouncement); render(); return; }
  if ('retry' in d) { refreshConfig(); return; }
  if (d.dietitian) { location.hash = `#/dietitian/${encodeURIComponent(d.dietitian)}`; return; }
  if (d.symptom) { state.diaryForm.symptoms = pick(state.diaryForm.symptoms, d.symptom); readDiaryInputs(); render(); return; }
  if (d.dsev) { state.diaryForm.severity = Number(d.dsev); readDiaryInputs(); render(); return; }
  if (d.dopen !== undefined) { state.diaryOpen = String(state.diaryOpen) === d.dopen ? null : d.dopen; render(); return; }
  if (d.ddel) { state.diary = state.diary.filter((x) => String(x.id) !== d.ddel); state.saved.set('diary', state.diary); render(); return; }
  for (const [attr, key] of [['sex', 'sex'], ['activity', 'activity'], ['goal', 'goal'], ['diet', 'diet'], ['pregnancy', 'pregnancy']]) {
    if (d[attr] !== undefined) {
      readProfileInputs(); state.profile[key] = d[attr];
      if (key === 'sex' && d[attr] !== 'female') state.profile.pregnancy = '';
      if (!location.hash.startsWith('#/settings')) saveProfile();
      render(); return;
    }
  }
  if ('stepNext' in d) { readProfileInputs(); state.step = Math.min(state.step + 1, V.ONBOARDING_STEPS - 1); saveProfile(); render(); return; }
  if ('stepBack' in d) { readProfileInputs(); state.step = Math.max(state.step - 1, 0); render(); return; }
  if ('finish' in d) {
    readProfileInputs();
    state.errors = validateProfile(state.profile, state.year);
    if (state.errors.length || !isComplete(state.profile, state.year)) { render(); return; }
    state.profile.onboarded = true; saveProfile(); state.step = 0;
    location.hash = '#/home'; render(); return;
  }
  if (t.id === 'go') { analyze(); return; }
  if (t.id === 'find-markets') { findMarkets(); return; }
  if (t.id === 'd-save') {
    readDiaryInputs();
    state.diary = addDiaryEntry(state.diary, state.diaryForm, now());
    state.saved.set('diary', state.diary);
    state.diaryForm = { meal: '', symptoms: [], severity: 1, note: '' }; render(); return;
  }
  if (t.id === 'save-profile') {
    readProfileInputs();
    state.errors = validateProfile(state.profile, state.year);
    if (!state.errors.length) { saveProfile(); location.hash = '#/home'; }
    render(); return;
  }
  if (t.id === 'sign-out') { state.saved?.clear(); signOut().finally(() => location.replace('../')); }
});

function orderContext() {
  const market = state.markets.data?.markets?.[state.orderIndex ?? -1];
  return market ? { market, items: orderItems(market) } : null;
}

function toggleOrder(d) {
  const ctx = orderContext();
  if (!ctx) return;
  if (d.ocheck !== undefined) {
    const product = ctx.items[Number(d.ocheck)]?.product;
    if (product === undefined) return;
    state.orderUnchecked = state.orderUnchecked.includes(product) ? state.orderUnchecked.filter((x) => x !== product) : [...state.orderUnchecked, product];
  } else {
    state.orderUnchecked = 'oall' in d ? [] : ctx.items.map((i) => i.product);
  }
  state.saved.set(`order:${storeKey(ctx.market)}`, state.orderUnchecked);
  render();
}

async function shareOrder(share) {
  const ctx = orderContext();
  if (!ctx) return;
  const text = orderListText(ctx.market.store_name, ctx.items, state.orderUnchecked);
  try {
    if (share && navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
  } catch { /* the user cancelled or the browser refused; nothing to do */ }
}

function readDiaryInputs() {
  const meal = $('#d-meal'); const note = $('#d-note');
  if (meal) state.diaryForm.meal = meal.value;
  if (note) state.diaryForm.note = note.value;
}

document.addEventListener('input', (e) => {
  if (!state.ready) return;
  const id = e.target.id;
  if (id === 'q') { state.query = e.target.value; render(); return; }
  if (id?.startsWith('f-')) {
    readProfileInputs();
    if (location.hash === '#/onboarding' || mustOnboard()) { saveProfile(); render(); }
  }
});

document.addEventListener('change', (e) => {
  if (!state.ready) return;
  if (e.target.dataset?.ocheck !== undefined) { toggleOrder(e.target.dataset); return; }
  if (e.target.id === 'loc-auto') { state.location.autoDetect = e.target.checked; state.saved.set('location', state.location); state.markets = { status: 'idle', data: null, error: '' }; render(); }
  if (e.target.id === 'loc-city') { state.location.cityId = e.target.value; state.saved.set('location', state.location); state.markets = { status: 'idle', data: null, error: '' }; render(); }
  if (e.target.id === 'f-kosher' || e.target.id === 'f-share') readProfileInputs();
});

window.addEventListener('hashchange', onRouteChange);

// ---- start -----------------------------------------------------------------------------------------------------
async function start(user) {
  state.user = user;
  state.saved = createStore(window.localStorage).forUser(user.uid);
  state.api = DEMO ? demoApi : createApi({ getToken: getIdToken });
  const p = state.saved.get('profile', null);
  state.profile = cleanProfile(p, EMPTY_PROFILE);
  const loc = state.saved.get('location', null);
  if (loc && typeof loc === 'object') state.location = { autoDetect: loc.autoDetect !== false, cityId: typeof loc.cityId === 'string' ? loc.cityId : DEFAULT_CITY_ID };
  state.selected = state.saved.get('selected', []).filter((s) => typeof s === 'string');
  state.severity = state.saved.get('severity', {});
  state.analysis = state.saved.get('analysis', null);
  state.diary = state.saved.get('diary', []);
  state.config = resolveConfig(state.saved.get('config', null));
  state.dismissedAnnouncement = state.saved.get('dismissedAnnouncement', '');
  $('#shell').classList.remove('hidden');
  state.conditions = await loadConditions();
  state.selected = state.selected.slice(0, maxConditions(plan()));
  state.ready = true;
  if (!location.hash) location.hash = state.saved.get('route', '#/home');
  render();
  refreshConfig();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshConfig(); });
}

if (DEMO) {
  start({ uid: 'demo', email: 'demo@example.com', name: 'דמו', photo: null, admin: false, createdAtMs: now() });
} else {
  onUser((u) => {
    if (!authConfigured() || !u) { location.replace('../'); return; }
    if (state.user?.uid === u.uid) return;
    if (state.user) { location.reload(); return; }
    start(u);
  });
}
