import { resolvePlatform } from '../assets/js/router.js';
import { authConfigured, onUser } from '../assets/js/auth.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---- gate: this web app is for iPhone (and iPad); Android gets the store, desktop gets an error ----------------
const platform = resolvePlatform(window);
if (platform === 'desktop') { $('#gate').classList.remove('hidden'); throw new Error('desktop-blocked'); }
if (platform === 'android') { window.location.replace('../'); throw new Error('android-redirect'); }

const params = new URLSearchParams(location.search);
const state = {
  conditions: [], query: '', selected: new Set(store.get('selected', [])), severity: store.get('severity', {}),
  analysis: store.get('analysis', null), loading: false, error: '', matrixTab: 'ok', swaps: {}, user: null,
  demo: params.get('demo') === '1' || !authConfigured(), apiBase: store.get('apiBase', ''),
};
if (!store.get('trialStart', null)) store.set('trialStart', Date.now());
const trialDaysLeft = () => Math.max(0, 7 - Math.floor((Date.now() - store.get('trialStart', Date.now())) / 86400000));

const EMOJI = [[/(^|\s)דג(ים)?(\s|$)|סלמון|טונה|סרדינ/, '🐟'], [/עוף|הודו/, '🍗'], [/בקר|בשר/, '🥩'], [/אורז/, '🍚'], [/קינואה|דגנ|שיבולת/, '🥣'],
  [/חיטה|גלוטן|לחם|שעורה|שיפון/, '🌾'], [/חלב|גבינ|יוגורט|שמנת/, '🥛'], [/בוטנ/, '🥜'], [/שקד|אגוז/, '🌰'], [/אבוקדו/, '🥑'],
  [/בננה/, '🍌'], [/תפוח|אגס/, '🍎'], [/קיווי/, '🥝'], [/שום/, '🧄'], [/בצל/, '🧅'], [/גזר/, '🥕'], [/ברוקולי|ירק|תרד|כרוב/, '🥦'],
  [/ביצ/, '🥚'], [/קפה/, '☕'], [/שוקולד/, '🍫'], [/עגבני/, '🍅'], [/עדש|קטני|חומוס/, '🫘']];
const CAT_EMOJI = { 'דגנים ופחמימות': '🌾', 'דגים ופירות ים': '🐟', 'ירקות': '🥦', 'ירקות ותבלינים': '🥦', 'פירות': '🍎', 'מוצרי חלב': '🥛', 'בשר ועוף': '🍗', 'קטניות': '🫘', 'אגוזים וזרעים': '🌰', 'ביצים': '🥚', 'משקאות': '🥤', 'ממתקים': '🍬', 'שמנים': '🫒' };
const emoji = (name, cat = '') => (EMOJI.find(([re]) => re.test(name)) || [0, CAT_EMOJI[cat] || '🍽️'])[1];
const pmidUrl = (p) => `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(p)}/`;

// ---- data ------------------------------------------------------------------------------------------------------
async function loadConditions() {
  try {
    if (state.apiBase) { const r = await fetch(`${state.apiBase}/api/v1/conditions`); if (r.ok) return r.json(); }
  } catch { /* fall through to bundled list */ }
  return (await fetch('conditions.json')).json();
}

async function analyze() {
  state.loading = true; state.error = ''; render();
  const terms = [...state.selected].map((slug) => state.conditions.find((c) => c.slug === slug)?.display_name_he).filter(Boolean);
  try {
    let data;
    if (state.apiBase) {
      const r = await fetch(`${state.apiBase}/api/v1/analyze-profile`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conditions: terms }),
      });
      if (r.status === 422) { const j = await r.json(); throw new Error(`לא זוהה: ${j.detail?.unknown_term ?? ''}`); }
      if (!r.ok) throw new Error(`שגיאת שרת ${r.status}`);
      data = await r.json();
      state.demoData = false;
    } else {
      await new Promise((res) => setTimeout(res, 700));
      data = await (await fetch('sample-analysis.json')).json();
      state.demoData = true;
    }
    state.analysis = data; store.set('analysis', data);
    location.hash = '#/analysis';
  } catch (e) {
    state.error = e.message || 'שגיאת רשת';
    if (!state.analysis) { /* nothing cached */ } else state.error += ' · מוצג הניתוח האחרון (לא מקוון)';
  } finally { state.loading = false; render(); }
}

// ---- views -----------------------------------------------------------------------------------------------------
const NAV = [['#/home', '🏠'], ['#/analysis', '📊'], ['#/matrix', '🔎'], ['#/plan', '🍽️']];
const TILES = [['🥗', 'מדריך מזון', 'מותר ואסור · ציטוטים', '#/matrix'], ['👨‍🍳', 'תפריט יומי', 'ארוחות והחלפות', '#/plan'],
  ['📓', 'יומן', 'תסמינים וארוחות', '#/soon/יומן'], ['🩺', 'מצא דיאטן/ית', 'אנשי מקצוע באזורך', '#/soon/מצא דיאטן/ית'],
  ['📚', 'חוברת מידע', 'המחקרים מאחורי הניתוח', '#/booklet'], ['✅', 'מוצרים מאושרים', 'מזונות שנבדקו', '#/soon/מוצרים מאושרים']];
const SOON = new Set(['#/soon/יומן', '#/soon/מצא דיאטן/ית', '#/soon/מוצרים מאושרים']);

function planPill() {
  if (state.user?.admin) return '<div class="pillrow">מנהל · גישה מלאה ללא תשלום</div>';
  if (state.demo) return '<div class="pillrow warn">מצב דמו · נתוני דוגמה</div>';
  return `<div class="pillrow warn">נותרו ${trialDaysLeft()} ימים לניסיון החינמי</div>`;
}
const disclaimer = () => `<p class="disc">${esc(state.analysis?.meta?.disclaimer_he ?? 'המידע מבוסס על סקירת מחקרים קליניים ונועד להמלצה תזונתית בלבד.')}</p>`;
const needAnalysis = () => `<div class="center"><div style="font-size:54px">🔎</div><b>עדיין אין ניתוח</b><span class="sub">בחרו מצבים במסך הבית והתחילו ניתוח.</span><button class="cta" style="width:220px" data-go="#/home">למסך הבית</button></div>`;

function home() {
  const list = state.conditions.filter((c) => !state.query || [c.display_name_he, c.display_name_en, ...c.aliases].some((x) => x.toLowerCase().includes(state.query.toLowerCase())));
  const n = state.selected.size;
  return `<div class="screen">
    <div class="top"><button class="icon-btn" data-go="#/settings" aria-label="הגדרות">⚙️</button><span></span></div>
    <h2 class="t">תזונה בטוחה</h2><p class="sub">ניתוח מבוסס מחקרים לכל שילוב של אלרגיות ומצבים</p>
    ${planPill()}
    <label class="search">🔍<input id="q" value="${esc(state.query)}" placeholder="חפש אלרגנים או מצבים רפואיים..." autocomplete="off"></label>
    <div class="chips">${list.map((c) => `<button class="chip ${state.selected.has(c.slug) ? 'on' : ''}" data-pick="${esc(c.slug)}">${state.selected.has(c.slug) ? '<i class="ck">✓</i>' : ''}${esc(c.display_name_he.replace(/\s*\(.*\)$/, ''))}</button>`).join('')}</div>
    ${n ? `<p class="note-ok">${n === 1 ? 'מצב אחד נבחר' : `${n} מצבים נבחרו · הניתוח משלב את כולם`}</p>` : ''}
    ${state.error ? `<div class="alert">⚠️ <span>${esc(state.error)}</span></div>` : ''}
    <button class="cta" id="go" ${n && !state.loading ? '' : 'disabled'}>${state.loading ? 'מנתח מחקרים…' : n > 1 ? 'התחל ניתוח משולב' : 'התחל ניתוח'}</button>
    ${n ? '<button class="cta" style="background:#fff;color:var(--teal-dark);box-shadow:none;height:44px;font-size:14px" data-go="#/profile">דרגת חומרה</button>' : ''}
    <div class="grid">${TILES.map(([ic, t, s, go]) => `<button class="tile" data-go="${go}">${SOON.has(go) ? '<span class="soon-t">בקרוב</span>' : ''}<div class="ic">${ic}</div><b>${t}</b><small>${s}</small></button>`).join('')}</div>
    ${disclaimer()}</div>`;
}

function profile() {
  const sel = [...state.selected].map((s) => state.conditions.find((c) => c.slug === s)).filter(Boolean);
  const lvl = (s) => state.severity[s] || 1;
  const pos = (l) => ({ 1: 88, 2: 50, 3: 12 }[l]);
  const color = (l) => ({ 1: '#7FE0C4', 2: '#9FC0AC', 3: '#F26A4B' }[l]);
  return `<div class="screen"><div class="top"><button class="back" data-go="#/home">→</button><span></span></div>
    <h2 class="t">דרגת חומרה</h2><p class="sub">לכל מצב שבחרתם</p>
    <div class="card sev">${sel.map((c) => `<div class="row"><b>${esc(c.display_name_he.replace(/\s*\(.*\)$/, ''))}</b><div>
      <div class="lbls"><button data-sev="${c.slug}:1">קל</button><button data-sev="${c.slug}:2">בינוני</button><button data-sev="${c.slug}:3">קשה</button></div>
      <div class="track"><span class="thumb" style="left:${pos(lvl(c.slug))}%;background:${color(lvl(c.slug))}"></span></div></div></div>`).join('') || '<span class="sub">לא נבחרו מצבים.</span>'}</div>
    <button class="cta" id="go" ${sel.length && !state.loading ? '' : 'disabled'}>${state.loading ? 'מנתח מחקרים…' : `שמור פרופיל ונתח (${sel.length} מצבים)`}</button></div>`;
}

function analysis() {
  const a = state.analysis; if (!a) return needAnalysis();
  const m = a.meta, ca = a.clinical_analytics;
  const status = { HIT_COMPOSITE: `נשלף מיידית מהקאש (${m.execution_time_ms}ms) · מבוסס על ${m.studies_analyzed_count} מחקרים`,
    HIT_ATOMIC_MERGED: `שולב מפרופילים שמורים (${m.execution_time_ms}ms) · מבוסס על ${m.studies_analyzed_count} מחקרים`,
    MISS_FRESH_RAG: `ניתוח חדש מבוסס ${m.studies_analyzed_count} מחקרים` }[m.cache_status] ?? '';
  const title = a.normalized_conditions.map((c) => c.display_name_he.replace(/\s*\(.*\)$/, '')).join(' + ');
  const fm = a.food_matrix;
  return `<div class="screen"><h2 class="t">ניתוח ${a.normalized_conditions.length > 1 ? 'משולב' : ''}: ${esc(title)}</h2>
    <div class="pillrow">${esc(status)}${state.demoData ? ' · נתוני דוגמה' : ''}</div>
    <div class="card" style="margin:0 18px;padding:14px"><div style="display:flex;align-items:center;gap:14px">
      <div class="ring" style="background:conic-gradient(var(--teal-dark) 0 ${ca.headline_efficacy_pct}%,#E3EEEC 0)"><i style="color:var(--teal-dark)">${Math.round(ca.headline_efficacy_pct)}%</i></div>
      <div><div style="font-size:22px;font-weight:900;color:var(--teal-dark)">${Math.round(ca.headline_efficacy_pct)}% הקלה</div><div class="sub" style="margin:0">הקלה בתסמינים</div></div></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:12px 0"><b>${esc(ca.headline_summary_he)}</b>
      ${ca.nutritional_deficiency_risks.map((d) => `<div class="sub" style="margin:6px 0 0">${esc(d.nutrient_he)}: סיכון ${Math.round(d.risk_prevalence_pct)}% · יעד ${esc(d.recommended_daily_target)}</div>`).join('')}</div>
    ${fm.hidden_conflict_alerts.length ? `<div class="alert">⚠️ <span><b>התנגשות בין מצבים:</b> ${fm.hidden_conflict_alerts.map((x) => esc(x.item_he)).join(', ')}</span></div>` : ''}
    <div class="two"><div class="lst"><h5>מותר</h5>${fm.allowed_foods.slice(0, 4).map((f) => `<div>${emoji(f.name_he, f.category_he)} ${esc(f.name_he)}</div>`).join('')}</div>
      <div class="lst no"><h5>אסור / טריגרים</h5>${fm.forbidden_foods.slice(0, 4).map((f) => `<div>${emoji(f.name_he, f.category_he)} ${esc(f.name_he)}</div>`).join('')}</div></div>
    ${disclaimer()}</div>`;
}

function matrix() {
  const a = state.analysis; if (!a) return needAnalysis();
  const fm = a.food_matrix, q = state.query.toLowerCase();
  const f = (x) => !q || x.name_he.toLowerCase().includes(q);
  const card = (x, ok) => `<div class="fcard"><div class="t"><span>${ok ? '' : '⚠ '}${esc(x.name_he)}</span><span class="e">${emoji(x.name_he, x.category_he)}</span></div>
    <span class="badge">${esc(ok ? x.benefit_badge_he : x.warning_badge_he)}</span><a class="cite" href="${pmidUrl(x.citation_pmid)}" target="_blank" rel="noopener">↗ מבוסס מחקר</a></div>`;
  return `<div class="screen"><h2 class="t" style="text-align:center">מותר ואסור</h2>
    <label class="search">🔍<input id="q" value="${esc(state.query)}" placeholder="חפש מזון..." autocomplete="off"></label>
    ${fm.hidden_conflict_alerts.map((x) => `<div class="alert">⚠️ <span><b>${esc(x.title_he)}:</b> ${esc(x.item_he)} — ${esc(x.explanation_he)}</span></div>`).join('')}
    <div class="cols"><div class="col ok"><h4>מזונות מותרים</h4>${fm.allowed_foods.filter(f).map((x) => card(x, true)).join('')}</div>
      <div class="col no"><h4>מזונות אסורים</h4>${fm.forbidden_foods.filter(f).map((x) => card(x, false)).join('')}</div></div>${disclaimer()}</div>`;
}

function plan() {
  const a = state.analysis; if (!a) return needAnalysis();
  const p = a.personalized_diet_plan, t = p.daily_targets;
  const time = (s) => (s.match(/\((\d{1,2}:\d{2})\)/) || [])[1] || '';
  const name = (s) => s.replace(/\s*\(.*\)$/, '');
  return `<div class="screen"><div class="hero"><h2>תפריט יומי מותאם אישית</h2></div>
    <div class="verified"><b>✔ מאומת</b><span>מאומת מול ${a.meta.studies_analyzed_count} מחקרים רפואיים</span></div>
    <div class="card" style="margin:0 18px;padding:10px 6px 0"><b style="padding:0 10px">סיכום תזונתי</b><div class="rings">
      <div class="ring" style="background:conic-gradient(var(--ring-blue) 0 70%,#E6EEF8 0)"><i>פחמימות<br>${t.carbs_g} גר'</i></div>
      <div class="ring" style="background:conic-gradient(var(--ring-orange) 0 80%,#FBEBD8 0)"><i>חלבון<br>${t.protein_g} גר'</i></div>
      <div class="ring" style="background:conic-gradient(var(--ring-green) 0 85%,#E2F3E3 0)"><i>קלוריות<br>${t.calories_kcal}</i></div></div></div>
    <b style="margin:4px 18px 0;font-size:16px">ארוחות</b>
    ${p.meals.map((m, i) => { const dish = state.swaps[i] ?? m.dish_name_he; return `<div class="card meal"><div class="img">${emoji(dish)}</div>
      <div class="tx"><b>${esc(name(m.title_he))}</b><small>${esc(time(m.title_he))}</small><div>${esc(dish)}</div></div>
      ${m.swap_options_he.length ? `<button class="swap" data-swap="${i}">🔁 החלף</button>` : ''}</div>`; }).join('')}${disclaimer()}</div>`;
}

function booklet() {
  const a = state.analysis; if (!a) return needAnalysis();
  const seen = new Map();
  const add = (pmid, label) => { if (!seen.has(pmid)) seen.set(pmid, []); if (label) seen.get(pmid).push(label); };
  a.clinical_analytics.statistics_chart.forEach((s) => add(s.citation.pmid, s.label_he));
  a.food_matrix.allowed_foods.forEach((f) => add(f.citation_pmid)); a.food_matrix.forbidden_foods.forEach((f) => add(f.citation_pmid));
  return `<div class="screen"><h2 class="t">חוברת מידע</h2><p class="sub">המחקרים שעליהם מבוסס הניתוח (${a.meta.studies_analyzed_count})</p>
    <div class="pillrow">גרסת ידע ${esc(a.meta.knowledge_base_version)}</div>
    ${[...seen].map(([pmid, labels]) => `<a class="card study" href="${pmidUrl(pmid)}" target="_blank" rel="noopener"><span class="tag">PMID ${esc(pmid)}</span><b>${esc(labels[0] ?? 'מחקר תומך')}</b><small class="sub" style="margin:0">PubMed ↗</small></a>`).join('')}${disclaimer()}</div>`;
}

function settings() {
  return `<div class="screen"><div class="top"><button class="back" data-go="#/home">→</button><span></span></div><h2 class="t">הגדרות</h2>
    <div class="card set"><label>כתובת שרת (HTTPS)</label><input id="api" value="${esc(state.apiBase)}" placeholder="https://..."><small class="sub" style="margin:0">ריק = מצב דמו עם נתוני דוגמה</small></div>
    <div class="card set"><label>חשבון</label><div>${state.user ? esc(state.user.email) + (state.user.admin ? ' · מנהל' : '') : state.demo ? 'מצב דמו (ללא התחברות)' : 'לא מחובר'}</div></div>
    <div class="alert">ℹ️ <span>המידע מבוסס על סקירת מחקרים קליניים ונועד להמלצה תזונתית בלבד.</span></div></div>`;
}

const soon = (title) => `<div class="screen"><div class="top"><button class="back" data-go="#/home">→</button><span></span></div><div class="center"><div style="font-size:64px">${esc(emoji(title))}</div><h2 class="t" style="margin:0">בקרוב</h2><span class="sub">${esc(title)} — בפיתוח.</span></div></div>`;

// ---- router ----------------------------------------------------------------------------------------------------
const routes = { '#/home': home, '#/profile': profile, '#/analysis': analysis, '#/matrix': matrix, '#/plan': plan, '#/booklet': booklet, '#/settings': settings };

function render() {
  const hash = decodeURIComponent(location.hash || '#/home');
  const view = hash.startsWith('#/soon/') ? () => soon(hash.slice(7)) : routes[hash] ?? home;
  const keepFocus = document.activeElement?.id === 'q';
  $('#root').innerHTML = view();
  $('#nav').innerHTML = NAV.map(([h, ic]) => `<a href="${h}" class="${hash === h ? 'on' : ''}">${ic}</a>`).join('');
  if (keepFocus) { const q = $('#q'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go],[data-pick],[data-sev],[data-swap],#go'); if (!t) return;
  if (t.dataset.go) location.hash = t.dataset.go;
  else if (t.dataset.pick) { const s = t.dataset.pick; state.selected.has(s) ? state.selected.delete(s) : state.selected.add(s); store.set('selected', [...state.selected]); render(); }
  else if (t.dataset.sev) { const [s, l] = t.dataset.sev.split(':'); state.severity[s] = Number(l); store.set('severity', state.severity); render(); }
  else if (t.dataset.swap) { const i = Number(t.dataset.swap), opts = state.analysis.personalized_diet_plan.meals[i].swap_options_he; const cur = state.swaps[i] ?? state.analysis.personalized_diet_plan.meals[i].dish_name_he; state.swaps[i] = opts[(opts.indexOf(cur) + 1) % opts.length] ?? opts[0]; render(); }
  else if (t.id === 'go') analyze();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { state.query = e.target.value; render(); }
  if (e.target.id === 'api') { state.apiBase = e.target.value.trim().replace(/\/$/, ''); store.set('apiBase', state.apiBase); }
});
window.addEventListener('hashchange', render);

(async () => {
  $('#shell').classList.remove('hidden');
  state.conditions = await loadConditions();
  render();
  onUser((u) => {
    state.user = u;
    if (authConfigured() && !state.demo && !u) { location.replace('../'); return; }
    render();
  });
})();
