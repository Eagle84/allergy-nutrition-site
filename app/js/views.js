// Screens as pure functions: view-model in, HTML string out. Every dynamic value goes through esc() (text) or a URL
// builder that only allows https/http, so nothing from the server, the user's profile or Google can inject markup.
import {
  FEATURES, assessMeal, allows, maxConditions, CITIES, SYMPTOMS, SEVERITY_LABELS,
  SEX_VALUES, ACTIVITY_VALUES, GOAL_VALUES, DIET_VALUES, PREGNANCY_VALUES,
  approvedProducts, shekel, safeHttpUrl, isComplete, validateProfile,
  anonymousLabel, starsText, averageRating, ratingLabel, reviewsSummary, dietitiansFor,
  resolveConfig, featureVisible, orderItems, checkedTotal, buildSearchUrl, ORDER_NOTE, storeKey,
} from './logic.js';

const DEFAULT_CONFIG = resolveConfig(null);
const cfg = (v) => v.config ?? DEFAULT_CONFIG;
const visible = (v, flag) => featureVisible(cfg(v), flag, v.user?.admin);
const ROUTE_FLAGS = { '#/plan': 'feature.meal_plan', '#/diary': 'feature.diary', '#/dietitians': 'feature.dietitians', '#/booklet': 'feature.booklet', '#/products': 'feature.approved_products' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pmidUrl = (p) => `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(p)}/`;
const shortName = (s) => String(s ?? '').replace(/\s*\(.*\)$/, '');
const DISCLAIMER = 'המידע מבוסס על סקירת מחקרים קליניים ונועד להמלצה תזונתית בלבד.';
const disclaimer = (v) => `<p class="disc">${esc(v.analysis?.meta?.disclaimer_he ?? DISCLAIMER)}</p>`;

const EMOJI = [[/(^|\s)דג(ים)?(\s|$)|סלמון|טונה|סרדינ/, '🐟'], [/עוף|הודו/, '🍗'], [/בקר|בשר/, '🥩'], [/אורז/, '🍚'], [/קינואה|דגנ|שיבולת/, '🥣'],
  [/חיטה|גלוטן|לחם|שעורה|שיפון/, '🌾'], [/חלב|גבינ|יוגורט|שמנת/, '🥛'], [/בוטנ/, '🥜'], [/שקד|אגוז/, '🌰'], [/אבוקדו/, '🥑'],
  [/בננה/, '🍌'], [/תפוח|אגס/, '🍎'], [/קיווי/, '🥝'], [/שום/, '🧄'], [/בצל/, '🧅'], [/גזר/, '🥕'], [/ברוקולי|ירק|תרד|כרוב/, '🥦'],
  [/ביצ/, '🥚'], [/קפה/, '☕'], [/שוקולד/, '🍫'], [/עגבני/, '🍅'], [/עדש|קטני|חומוס/, '🫘']];
const CAT_EMOJI = { 'דגנים ופחמימות': '🌾', 'דגים ופירות ים': '🐟', 'ירקות': '🥦', 'ירקות ותבלינים': '🥦', 'פירות': '🍎', 'מוצרי חלב': '🥛', 'בשר ועוף': '🍗', 'קטניות': '🫘', 'אגוזים וזרעים': '🌰', 'ביצים': '🥚', 'משקאות': '🥤', 'ממתקים': '🍬', 'שמנים': '🫒' };
export const emoji = (name, cat = '') => (EMOJI.find(([re]) => re.test(name)) || [0, CAT_EMOJI[cat] || '🍽️'])[1];

const topBar = (back = '#/home') => `<div class="top"><button class="back" data-go="${back}" aria-label="חזרה">→</button><span></span></div>`;

export const needAnalysis = () => `<div class="center"><div style="font-size:54px">🔎</div><b>עדיין אין ניתוח</b><span class="sub">בחרו מצבים במסך הבית והתחילו ניתוח.</span><button class="cta" style="width:220px" data-go="#/home">למסך הבית</button></div>`;

export const planGate = (what) => `<div class="card gate"><div style="font-size:34px">🔒</div><b>${esc(what)} זמין בתוכנית בסיס ומעלה</b><span class="sub" style="margin:0">שדרגו כדי לפתוח.</span><button class="cta" style="margin:4px 0 0" data-go="#/plans">לתוכניות ומחירים</button></div>`;

const errorBox = (v) => (v.error ? `<div class="alert" role="alert">⚠️ <span>${esc(v.error)}</span>${v.errorUpgrade ? '<button class="swap" data-go="#/plans">שדרגו</button>' : ''}</div>` : '');

const PLAN_NAMES = { basic: 'בסיס', pro: 'פרו', premium: 'פרימיום' };

function planPill(v) {
  if (v.user?.admin) return '<div class="pillrow">מנהל · גישה מלאה ללא תשלום</div>';
  if (v.trialLeft) return `<div class="pillrow warn">נותרו ${v.trialLeft} ימים לניסיון חינם של תוכנית ${PLAN_NAMES[v.plan] ?? ''}</div>`;
  if (v.plan === 'free') return '<div class="pillrow warn">תוכנית חינמית · <a href="#/plans" style="color:inherit">שדרגו</a></div>';
  return '';
}

// ---- home ----------------------------------------------------------------------------------------------------------
export function home(v) {
  const q = v.query.trim().toLowerCase();
  const list = v.conditions.filter((c) => !q || [c.display_name_he, c.display_name_en, ...(c.aliases ?? [])].some((x) => String(x).toLowerCase().includes(q)));
  const limit = maxConditions(v.plan);
  const n = v.selected.length;
  const chips = list.map((c) => {
    const on = v.selected.includes(c.slug);
    const locked = !on && n >= limit;
    const label = esc(shortName(c.display_name_he));
    if (locked) return `<button class="chip locked" data-locked="${esc(c.slug)}">🔒 ${label}</button>`;
    return `<button class="chip ${on ? 'on' : ''}" data-pick="${esc(c.slug)}">${on ? '<i class="ck">✓</i>' : ''}${label}</button>`;
  }).join('');
  const limitNote = n >= limit && limit < 8
    ? `<div class="alert">🔒 <span>התוכנית שלכם מאפשרת עד ${limit} ${limit === 1 ? 'מצב' : 'מצבים'} בניתוח.</span><button class="swap" data-go="#/plans">שדרגו</button></div>` : '';
  const tiles = [['🥗', 'מדריך מזון', 'מותר ואסור · ציטוטים', '#/matrix'], ['👨‍🍳', 'תפריט יומי', 'ארוחות והחלפות', '#/plan'], ['📓', 'יומן', 'תסמינים וארוחות', '#/diary'],
    ['🩺', 'מצא דיאטן/ית', 'אנשי מקצוע', '#/dietitians'], ['📚', 'חוברת מידע', 'המחקרים מאחורי הניתוח', '#/booklet'], ['✅', 'מוצרים מאושרים', 'ומחירים בסופרים', '#/products']];
  return `<div class="screen">
    <div class="top"><button class="icon-btn" data-go="#/settings" aria-label="הגדרות">⚙️</button><span></span></div>
    <h2 class="t">תזונה בטוחה</h2><p class="sub">ניתוח מבוסס מחקרים לכל שילוב של אלרגיות ומצבים</p>
    ${announcementBanner(cfg(v).settings.announcement, v.dismissedAnnouncement)}${planPill(v)}
    <label class="search">🔍<input id="q" value="${esc(v.query)}" placeholder="חפש אלרגנים או מצבים רפואיים..." autocomplete="off"></label>
    <div class="chips chips-2" data-rows="2">${chips}</div>
    ${n ? `<p class="note-ok">${n === 1 ? 'מצב אחד נבחר' : `${n} מצבים נבחרו · הניתוח משלב את כולם`}</p>` : ''}
    ${limitNote}${errorBox(v)}
    <button class="cta" id="go" ${n && !v.loading ? '' : 'disabled'}>${v.loading ? 'מנתח מחקרים…' : n > 1 ? 'התחל ניתוח משולב' : 'התחל ניתוח'}</button>
    ${n ? '<button class="cta ghost" data-go="#/severity">דרגת חומרה</button>' : ''}
    <div class="grid">${tiles.filter(([, , , go]) => !ROUTE_FLAGS[go] || visible(v, ROUTE_FLAGS[go])).map(([ic, t, s, go]) => `<button class="tile" data-go="${go}"><div class="ic">${ic}</div><b>${t}</b><small>${s}</small></button>`).join('')}</div>
    ${disclaimer(v)}</div>`;
}

export function severity(v) {
  const sel = v.selected.map((s) => v.conditions.find((c) => c.slug === s)).filter(Boolean);
  const lvl = (s) => v.severity[s] || 1;
  const pos = { 1: 88, 2: 50, 3: 12 };
  const color = { 1: '#7FE0C4', 2: '#9FC0AC', 3: '#F26A4B' };
  return `<div class="screen">${topBar()}<h2 class="t">דרגת חומרה</h2><p class="sub">לכל מצב שבחרתם</p>
    <div class="card sev">${sel.map((c) => `<div class="row"><b>${esc(shortName(c.display_name_he))}</b><div>
      <div class="lbls"><button data-sev="${esc(c.slug)}:1">קל</button><button data-sev="${esc(c.slug)}:2">בינוני</button><button data-sev="${esc(c.slug)}:3">קשה</button></div>
      <div class="track"><span class="thumb" style="left:${pos[lvl(c.slug)]}%;background:${color[lvl(c.slug)]}"></span></div></div></div>`).join('') || '<span class="sub">לא נבחרו מצבים.</span>'}</div>
    ${errorBox(v)}
    <button class="cta" id="go" ${sel.length && !v.loading ? '' : 'disabled'}>${v.loading ? 'מנתח מחקרים…' : `שמור ונתח (${sel.length} מצבים)`}</button></div>`;
}

// ---- results -------------------------------------------------------------------------------------------------------
function personalBlock(p) {
  if (!p?.applied) return '';
  const facts = [p.bmi != null ? `BMI ${p.bmi}${p.bmi_band_he ? ` · ${p.bmi_band_he}` : ''}` : '', p.tdee_kcal ? `הוצאה יומית משוערת ${p.tdee_kcal} קק״ל` : ''].filter(Boolean);
  const lines = [...(p.adjustments_he ?? []), ...(p.hidden_foods_he?.length ? [`הוסתרו לפי העדפותיכם: ${p.hidden_foods_he.join(', ')}`] : [])];
  return `<div class="card pers"><b>🎯 מותאם אישית</b>${facts.length ? `<div class="sub" style="margin:4px 0">${facts.map(esc).join(' · ')}</div>` : ''}${lines.map((l) => `<div class="sub" style="margin:2px 0">• ${esc(l)}</div>`).join('')}</div>`;
}

export function analysisView(v) {
  const a = v.analysis;
  if (!a) return needAnalysis();
  const ca = a.clinical_analytics;
  const title = a.normalized_conditions.map((c) => shortName(c.display_name_he)).join(' + ');
  const fm = a.food_matrix;
  const pct = Math.round(ca.headline_efficacy_pct);
  return `<div class="screen"><h2 class="t">ניתוח ${a.normalized_conditions.length > 1 ? 'משולב' : ''}: ${esc(title)}</h2>
    <div class="pillrow">מבוסס על ${esc(a.meta.studies_analyzed_count)} מחקרים${v.demoData ? ' · נתוני דוגמה' : ''}</div>
    <div class="card" style="margin:0 18px;padding:14px"><div style="display:flex;align-items:center;gap:14px">
      <div class="ring" style="background:conic-gradient(var(--teal-dark) 0 ${pct}%,#E3EEEC 0)"><i style="color:var(--teal-dark)">${pct}%</i></div>
      <div><div style="font-size:22px;font-weight:900;color:var(--teal-dark)">${pct}% הקלה</div><div class="sub" style="margin:0">הקלה בתסמינים</div></div></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:12px 0"><b>${esc(ca.headline_summary_he)}</b>
      ${ca.nutritional_deficiency_risks.map((d) => `<div class="sub" style="margin:6px 0 0">${esc(d.nutrient_he)}: סיכון ${Math.round(d.risk_prevalence_pct)}% · יעד ${esc(d.recommended_daily_target)}</div>`).join('')}</div>
    ${personalBlock(a.personalization)}
    ${fm.hidden_conflict_alerts.length ? `<div class="alert">⚠️ <span><b>התנגשות בין מצבים:</b> ${fm.hidden_conflict_alerts.map((x) => esc(x.item_he)).join(', ')}</span></div>` : ''}
    <div class="two"><div class="lst"><h5>מותר</h5>${fm.allowed_foods.slice(0, 4).map((f) => `<div>${emoji(f.name_he, f.category_he)} ${esc(f.name_he)}</div>`).join('')}</div>
      <div class="lst no"><h5>אסור / טריגרים</h5>${fm.forbidden_foods.slice(0, 4).map((f) => `<div>${emoji(f.name_he, f.category_he)} ${esc(f.name_he)}</div>`).join('')}</div></div>
    ${disclaimer(v)}</div>`;
}

export function matrix(v) {
  const a = v.analysis;
  if (!a) return needAnalysis();
  const fm = a.food_matrix;
  const q = v.query.trim().toLowerCase();
  const f = (x) => !q || x.name_he.toLowerCase().includes(q);
  const card = (x, ok) => `<div class="fcard"><div class="t"><span>${ok ? '' : '⚠ '}${esc(x.name_he)}</span><span class="e">${emoji(x.name_he, x.category_he)}</span></div>
    <span class="badge">${esc(ok ? x.benefit_badge_he : x.warning_badge_he)}</span><a class="cite" href="${pmidUrl(x.citation_pmid)}" target="_blank" rel="noopener noreferrer">↗ מבוסס מחקר</a></div>`;
  return `<div class="screen"><h2 class="t" style="text-align:center">מותר ואסור</h2>
    <label class="search">🔍<input id="q" value="${esc(v.query)}" placeholder="חפש מזון..." autocomplete="off"></label>
    ${fm.hidden_conflict_alerts.map((x) => `<div class="alert">⚠️ <span><b>${esc(x.title_he)}:</b> ${esc(x.item_he)} — ${esc(x.explanation_he)}</span></div>`).join('')}
    <div class="cols"><div class="col ok"><h4>מזונות מותרים</h4>${fm.allowed_foods.filter(f).map((x) => card(x, true)).join('')}</div>
      <div class="col no"><h4>מזונות אסורים</h4>${fm.forbidden_foods.filter(f).map((x) => card(x, false)).join('')}</div></div>${disclaimer(v)}</div>`;
}

export function mealPlan(v) {
  const a = v.analysis;
  if (!a) return needAnalysis();
  if (!allows(v.plan, FEATURES.MEAL_PLAN)) return `<div class="screen"><h2 class="t">תפריט יומי</h2>${planGate('תפריט יומי והחלפות')}</div>`;
  const p = a.personalized_diet_plan;
  const t = p.daily_targets;
  const time = (s) => (s.match(/\((\d{1,2}:\d{2})\)/) || [])[1] || '';
  const notes = a.personalization?.meal_notes_he ?? [];
  return `<div class="screen"><div class="hero"><h2>תפריט יומי מותאם אישית</h2></div>
    <div class="verified"><b>✔ מאומת</b><span>מאומת מול ${esc(a.meta.studies_analyzed_count)} מחקרים רפואיים</span></div>
    <div class="card" style="margin:0 18px;padding:10px 6px 0"><b style="padding:0 10px">סיכום תזונתי</b><div class="rings">
      <div class="ring" style="background:conic-gradient(var(--ring-blue) 0 70%,#E6EEF8 0)"><i>פחמימות<br>${esc(t.carbs_g)} גר'</i></div>
      <div class="ring" style="background:conic-gradient(var(--ring-orange) 0 80%,#FBEBD8 0)"><i>חלבון<br>${esc(t.protein_g)} גר'</i></div>
      <div class="ring" style="background:conic-gradient(var(--ring-green) 0 85%,#E2F3E3 0)"><i>קלוריות<br>${esc(t.calories_kcal)}</i></div></div></div>
    ${notes.length ? `<div class="card pers"><b>הערות לארוחות</b>${notes.map((n) => `<div class="sub" style="margin:2px 0">• ${esc(n.note_he)}</div>`).join('')}</div>` : ''}
    <b style="margin:4px 18px 0;font-size:16px">ארוחות</b>
    ${p.meals.map((m, i) => { const dish = v.swaps[i] ?? m.dish_name_he; return `<div class="card meal"><div class="img">${emoji(dish)}</div>
      <div class="tx"><b>${esc(shortName(m.title_he))}</b><small>${esc(time(m.title_he))}</small><div>${esc(dish)}</div></div>
      ${m.swap_options_he.length ? `<button class="swap" data-swap="${i}">🔁 החלף</button>` : ''}</div>`; }).join('')}${disclaimer(v)}</div>`;
}

export function booklet(v) {
  const a = v.analysis;
  if (!a) return needAnalysis();
  if (!allows(v.plan, FEATURES.BOOKLET)) return `<div class="screen"><h2 class="t">חוברת מידע</h2>${planGate('חוברת מידע עם שמות המחקרים')}</div>`;
  const seen = new Map();
  const add = (pmid, label) => { if (!seen.has(pmid)) seen.set(pmid, []); if (label) seen.get(pmid).push(label); };
  a.clinical_analytics.statistics_chart.forEach((s) => add(s.citation.pmid, s.label_he));
  a.food_matrix.allowed_foods.forEach((f) => add(f.citation_pmid));
  a.food_matrix.forbidden_foods.forEach((f) => add(f.citation_pmid));
  return `<div class="screen"><h2 class="t">חוברת מידע</h2><p class="sub">המחקרים שעליהם מבוסס הניתוח (${esc(a.meta.studies_analyzed_count)})</p>
    <div class="pillrow">גרסת ידע ${esc(a.meta.knowledge_base_version)}</div>
    ${[...seen].map(([pmid, labels]) => `<a class="card study" href="${pmidUrl(pmid)}" target="_blank" rel="noopener noreferrer"><span class="tag">PMID ${esc(pmid)}</span><b>${esc(labels[0] ?? 'מחקר תומך')}</b><small class="sub" style="margin:0">PubMed ↗</small></a>`).join('')}${disclaimer(v)}</div>`;
}

// ---- approved products + markets -----------------------------------------------------------------------------------
const orderEnabled = (v, market) => cfg(v).flags['feature.online_order'] === true && allows(v.plan, FEATURES.PRICE_COMPARE) && safeHttpUrl(market?.online_store_url) !== '#';

function marketsBlock(v) {
  const m = v.markets;
  const place = `<div class="sub" style="margin:0">מיקום: ${esc(v.resolved.label)} · <a href="#/settings" style="color:var(--teal-dark)">שינוי</a></div>`;
  let body = '';
  if (m.status === 'loading') body = '<div class="center" style="padding:20px"><div class="spinner"></div></div>';
  else if (m.status === 'error') body = `<div class="alert" role="alert">⚠️ <span>${esc(m.error)}</span></div>`;
  else if (m.status === 'ready' && !m.data.available) body = '<div class="alert">ℹ️ <span>נתוני מחירים עדיין אינם זמינים. נסו שוב מאוחר יותר.</span></div>';
  else if (m.status === 'ready') {
    body = m.data.markets.map((x, i) => `<div class="card market">
      <div class="mh"><span class="rank">${i + 1}</span><div><b>${esc(x.chain)} · ${esc(x.store_name)}</b><small>${esc([x.address, x.city].filter(Boolean).join(', '))}</small></div><span class="km">${esc(x.distance_km.toFixed(1))} ק״מ</span></div>
      <div class="total">${esc(shekel(x.basket_total))}<small> · ${esc(x.items_found)} מתוך ${esc(x.items_requested)} מוצרים</small></div>
      ${x.prices.map((p) => `<div class="pr"><span>${esc(p.product)}</span><b>${esc(shekel(p.price))}</b></div>`).join('')}
      ${x.missing.length ? `<small class="sub" style="margin:0">לא נמצא: ${esc(x.missing.join(', '))}</small>` : ''}
      ${orderEnabled(v, x) ? `<button class="swap" data-order="${i}">🛒 הזמנה אונליין</button>` : ''}</div>`).join('')
      + `<p class="disc">${esc(m.data.source)}${m.data.as_of ? ` · עודכן ${esc(m.data.as_of)}` : ''}<br>${esc(m.data.disclaimer)}</p>`;
  }
  return `<div class="card" style="margin:0 18px;padding:12px;display:flex;flex-direction:column;gap:8px"><b>🛒 השוואת מחירים · 3 הסופרים המובילים</b>${place}
    <button class="cta" style="margin:0" id="find-markets" ${m.status === 'loading' ? 'disabled' : ''}>${m.status === 'ready' ? 'רענן מחירים' : 'מצא את הסל הזול'}</button></div><div id="markets" style="display:flex;flex-direction:column;gap:10px;padding:0 18px">${body}</div>`;
}

export function products(v) {
  if (!v.analysis) return needAnalysis();
  const items = approvedProducts(v.analysis, v.query);
  const byCat = new Map();
  for (const f of items) { if (!byCat.has(f.category_he)) byCat.set(f.category_he, []); byCat.get(f.category_he).push(f); }
  const prices = !visible(v, 'feature.price_compare') ? '' : allows(v.plan, FEATURES.PRICE_COMPARE) ? marketsBlock(v) : planGate('השוואת מחירי סופרים');
  return `<div class="screen">${topBar()}<h2 class="t">מוצרים מאושרים</h2><p class="sub">מזונות שנבדקו מול המחקרים עבור הפרופיל שלכם</p>
    <label class="search">🔍<input id="q" value="${esc(v.query)}" placeholder="חפש מוצר..." autocomplete="off"></label>
    ${prices}
    ${[...byCat].map(([cat, foods]) => `<b style="margin:6px 18px 0">${emoji('', cat)} ${esc(cat)}</b><div class="pgrid">${foods.map((f) => `<div class="card pcard"><div class="pe">${emoji(f.name_he, f.category_he)}</div><b>${esc(f.name_he)}</b><span class="badge">${esc(f.benefit_badge_he)}</span><a class="cite" href="${pmidUrl(f.citation_pmid)}" target="_blank" rel="noopener noreferrer">↗ מחקר</a></div>`).join('')}</div>`).join('') || '<p class="sub">לא נמצאו מוצרים.</p>'}
    ${disclaimer(v)}</div>`;
}

// ---- dietitians ----------------------------------------------------------------------------------------------------
const mapsUrl = (d) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.clinic} ${d.address}`)}`;
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+-]/g, '')}`;

export function dietitians(v, all) {
  const directory = cfg(v).flags['mock.dietitians'] ? all : [];
  const list = dietitiansFor(directory, v.selected);
  const identity = allows(v.plan, FEATURES.DIETITIAN_IDENTITY);
  const cards = list.map((d, i) => {
    const stars = `<span class="stars">${starsText(averageRating(d.reviews))}</span> <small>${esc(ratingLabel(d.reviews))}</small>`;
    if (identity) {
      return `<button class="card dcard" data-dietitian="${esc(d.id)}"><b>${esc(d.name)}</b><small>${esc(d.clinic)}</small><div>${stars}</div><small>${esc(d.focusLabel)} · ${esc(d.city)}</small><span class="more">לפרטים מלאים ←</span></button>`;
    }
    return `<div class="card dcard"><b>${esc(anonymousLabel(i + 1))}</b><div>${stars}</div><small>${esc(d.focusLabel)} · ${esc(d.city)}</small><small class="quote">${esc(reviewsSummary(d.reviews))}</small></div>`;
  }).join('');
  return `<div class="screen">${topBar()}<h2 class="t">מצא דיאטן/ית</h2><p class="sub">מותאם למצבים שבחרתם · רשימה לדוגמה עד להצטרפות אנשי מקצוע</p>
    ${identity ? '' : `<div class="alert">🔒 <span>שם ופרטי הקשר נחשפים בתוכנית פרימיום.</span><button class="swap" data-go="#/plans">שדרגו</button></div>`}
    <div style="display:flex;flex-direction:column;gap:10px;padding:0 18px">${directory.length ? cards : '<p class="sub">אין אנשי מקצוע זמינים כרגע</p>'}</div></div>`;
}

export function dietitianDetail(v, d) {
  if (!d) return `<div class="screen">${topBar('#/dietitians')}<p class="sub">לא נמצא.</p></div>`;
  if (!allows(v.plan, FEATURES.DIETITIAN_IDENTITY)) return `<div class="screen">${topBar('#/dietitians')}<h2 class="t">פרטי איש מקצוע</h2>${planGate('פרטי איש מקצוע')}</div>`;
  return `<div class="screen">${topBar('#/dietitians')}<h2 class="t">${esc(d.name)}</h2><p class="sub">${esc(d.clinic)}</p>
    <div class="card" style="margin:0 18px;padding:14px;display:flex;flex-direction:column;gap:8px">
      <div><span class="stars">${starsText(averageRating(d.reviews))}</span> <b>${esc(ratingLabel(d.reviews))}</b></div>
      <div>${esc(d.bio)}</div>
      <small class="sub" style="margin:0">${esc(d.years)} שנות ניסיון · ${esc(d.languages.join(', '))}</small>
      <div><b>כתובת:</b> ${esc(d.address)}</div>
      <div class="actions"><a class="pill-a" href="${telHref(d.phone)}">📞 ${esc(d.phone)}</a><a class="pill-a" href="mailto:${esc(encodeURIComponent(d.email).replace(/%40/g, '@'))}">✉️ ${esc(d.email)}</a>
        <a class="pill-a" href="${esc(mapsUrl(d))}" target="_blank" rel="noopener noreferrer">📍 מפה</a></div></div>
    <b style="margin:4px 18px 0">ביקורות</b>
    ${d.reviews.map((r) => `<div class="card" style="margin:0 18px;padding:10px 12px"><div><span class="stars">${starsText(r.stars)}</span> <small>${esc(r.author)} · ${esc(r.date)}</small></div><div>${esc(r.text)}</div></div>`).join('')}</div>`;
}

// ---- diary ---------------------------------------------------------------------------------------------------------
const FIT_HEADLINE = {
  no_analysis: 'בחרו מצבים ובצעו ניתוח כדי לראות אם זה מתאים לכם.',
  unknown: 'אין מידע על המזון הזה בניתוח שלכם, ולכן אין המלצה.',
  good: '✅ מתאים למצבים שבחרתם',
  partial: '✅ מה שזוהה מתאים, אך לא כל המרכיבים נבדקו',
  mixed: '⚖️ חלק מתאים וחלק כדאי להימנע ממנו',
  avoid: '⛔ כדאי להימנע, לפי המצבים שבחרתם',
};

export function mealVerdict(meal, analysis) {
  const r = assessMeal(meal, analysis);
  const note = (x) => (x.partial ? '<div class="sub" style="margin:0">ייתכן שהכוונה למזון הזה, כדאי לוודא.</div>' : '');
  return `<div class="verdict" data-verdict="${r.fit}"><b>${esc(FIT_HEADLINE[r.fit])}</b>
    ${r.avoid.map((a) => `<div><b>⛔ ${esc(a.name_he)} · ${esc(a.warning_badge_he)}</b>${note(a)}<div class="sub" style="margin:0">${esc(a.scientific_rationale_he)}</div>${a.safe_substitute_he ? `<div class="sub" style="margin:0">במקום זה: ${esc(a.safe_substitute_he)}</div>` : ''}</div>`).join('')}
    ${r.hidden.map((h) => `<div><b>⚠️ ${esc(h.title_he)}</b><div class="sub" style="margin:0">${esc(h.explanation_he)}</div></div>`).join('')}
    ${r.good.map((g) => `<div><b>✅ ${esc(g.name_he)} · ${esc(g.benefit_badge_he)}</b><div class="sub" style="margin:0">${esc(g.scientific_rationale_he)}</div></div>`).join('')}
    ${r.unchecked.length && r.fit !== 'unknown' && r.fit !== 'no_analysis' ? `<div class="sub" style="margin:0">לא נבדקו: ${esc(r.unchecked.join(', '))}</div>` : ''}
    ${r.fit === 'no_analysis' ? '' : '<small class="sub" style="margin:0">ההתאמה מבוססת על הניתוח שלכם ואינה ייעוץ רפואי.</small>'}</div>`;
}

export function diary(v) {
  const f = v.diaryForm ?? { symptoms: [], severity: 1 };
  return `<div class="screen">${topBar()}<h2 class="t">יומן</h2><p class="sub">ארוחות ותסמינים · נשמר במכשיר זה בלבד</p>
    <div class="card" style="margin:0 18px;padding:12px;display:flex;flex-direction:column;gap:8px">
      <label class="lab" for="d-meal">מה אכלתם?</label><input class="inp" id="d-meal" maxlength="100" value="${esc(f.meal ?? '')}" autocomplete="off">
      <div class="lab">תסמינים</div><div class="chips" style="padding:0">${SYMPTOMS.map((s) => `<button class="chip ${f.symptoms.includes(s) ? 'on' : ''}" data-symptom="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      ${f.symptoms.length ? `<div class="seg">${SEVERITY_LABELS.map((l, i) => `<button class="${f.severity === i + 1 ? 'on' : ''}" data-dsev="${i + 1}">${l}</button>`).join('')}</div>` : ''}
      <label class="lab" for="d-note">הערה</label><textarea class="inp" id="d-note" maxlength="500" rows="2">${esc(f.note ?? '')}</textarea>
      <button class="cta" style="margin:0" id="d-save">שמור ביומן</button></div>
    <div style="display:flex;flex-direction:column;gap:8px;padding:0 18px">${v.diary.map((e) => `<div class="card" style="padding:10px 12px"><small class="sub" style="margin:0">${esc(new Date(e.atMs).toLocaleString('he-IL'))}</small>
      ${e.meal ? `<div><b>🍽️ ${esc(e.meal)}</b></div><button class="swap" data-dopen="${esc(e.id)}" aria-expanded="${String(v.diaryOpen) === String(e.id)}">${String(v.diaryOpen) === String(e.id) ? 'הסתר' : 'האם זה מתאים לי?'}</button>${String(v.diaryOpen) === String(e.id) ? mealVerdict(e.meal, v.analysis) : ''}` : ''}${e.symptoms.length ? `<div class="symp">⚠️ ${esc(e.symptoms.join(', '))} · ${esc(SEVERITY_LABELS[e.severity - 1] ?? '')}</div>` : ''}${e.note ? `<div class="sub" style="margin:0">${esc(e.note)}</div>` : ''}
      <button class="swap" data-ddel="${esc(e.id)}">מחק</button></div>`).join('') || '<p class="sub">עדיין אין רשומות.</p>'}</div></div>`;
}

// ---- profile: onboarding + editing ---------------------------------------------------------------------------------
const L = {
  sex: { male: 'גבר', female: 'אישה', other: 'אחר' },
  activity: { sedentary: 'יושבני', light: 'קלה', moderate: 'בינונית', active: 'פעילה', athlete: 'ספורטאי/ת' },
  goal: { lose: 'ירידה במשקל', maintain: 'שמירה', gain: 'עלייה במשקל' },
  diet: { omnivore: 'אוכל הכול', vegetarian: 'צמחוני', vegan: 'טבעוני', pescatarian: 'פסקטריאני' },
  pregnancy: { none: 'לא רלוונטי', pregnant: 'הריון', breastfeeding: 'הנקה' },
};
const seg = (attr, values, labels, current) => `<div class="seg">${values.map((x) => `<button class="${current === x ? 'on' : ''}" ${attr}="${x}">${esc(labels[x])}</button>`).join('')}</div>`;
const num = (id, label, value, min, max, unit = '') => `<label class="lab" for="${id}">${label}</label><input class="inp" id="${id}" inputmode="numeric" type="number" min="${min}" max="${max}" value="${esc(String(value ?? ''))}" ${unit ? `placeholder="${unit}"` : ''}>`;

export const ONBOARDING_STEPS = 4;

function stepComplete(p, step, year) {
  const ok = validateProfile(p, year);
  if (step === 0) return p.birthYear != null && p.sex !== '' && !ok.includes('birthYear') && !ok.includes('sex') && !ok.includes('name');
  if (step === 1) return p.heightCm != null && p.weightKg != null && !ok.includes('heightCm') && !ok.includes('weightKg');
  return true;
}

export function onboarding(v) {
  const p = v.profile;
  const step = v.step;
  const body = [
    `<h2 class="t">נעים להכיר</h2><p class="sub">כמה פרטים כדי להתאים את הניתוח אליכם. הפרטים נשמרים במכשיר בלבד.</p>
      <div class="card form"><label class="lab" for="f-name">שם (לא חובה)</label><input class="inp" id="f-name" maxlength="60" value="${esc(p.name)}" autocomplete="off">
      ${num('f-year', 'שנת לידה', p.birthYear, 1900, v.year)}<div class="lab">מין</div>${seg('data-sex', SEX_VALUES, L.sex, p.sex)}</div>`,
    `<h2 class="t">גוף</h2><p class="sub">לחישוב צרכים קלוריים וחלבון.</p>
      <div class="card form">${num('f-height', 'גובה (ס״מ)', p.heightCm, 50, 250)}${num('f-weight', 'משקל (ק״ג)', p.weightKg, 10, 400)}</div>`,
    `<h2 class="t">אורח חיים</h2><p class="sub">אפשר לדלג ולעדכן בהגדרות.</p>
      <div class="card form"><div class="lab">פעילות גופנית</div>${seg('data-activity', ACTIVITY_VALUES, L.activity, p.activity)}
      <div class="lab">מטרה</div>${seg('data-goal', GOAL_VALUES, L.goal, p.goal)}
      <div class="lab">סגנון תזונה</div>${seg('data-diet', DIET_VALUES, L.diet, p.diet)}
      <label class="check"><input type="checkbox" id="f-kosher" ${p.kosher ? 'checked' : ''}> שומר/ת כשרות</label>
      ${p.sex === 'female' ? `<div class="lab">הריון / הנקה</div>${seg('data-pregnancy', PREGNANCY_VALUES, L.pregnancy, p.pregnancy || 'none')}` : ''}</div>`,
    `<h2 class="t">העדפות</h2><p class="sub">מזונות שאתם מעדיפים להימנע מהם (מופרדים בפסיק).</p>
      <div class="card form"><textarea class="inp" id="f-avoid" rows="2" maxlength="200" placeholder="למשל: כוסברה, דבש">${esc(p.avoid)}</textarea>
      <label class="check"><input type="checkbox" id="f-share" ${p.shareForAnalysis ? 'checked' : ''}> אני מסכים/ה לשלוח את הפרטים עם הניתוח כדי להתאים אותו (לא נשמרים בשרת)</label></div>`,
  ][step];
  const last = step === ONBOARDING_STEPS - 1;
  const canNext = last ? isComplete(p, v.year) : stepComplete(p, step, v.year);
  return `<div class="screen onb"><div class="dots">${Array.from({ length: ONBOARDING_STEPS }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    ${body}${v.errors?.length ? '<div class="alert" role="alert">⚠️ <span>יש לתקן ערכים לא תקינים.</span></div>' : ''}
    <div class="nextrow">${step > 0 ? '<button class="cta ghost" style="margin:0" data-step-back>חזרה</button>' : ''}
    <button class="cta" style="margin:0" ${last ? 'data-finish' : 'data-step-next'} ${canNext ? '' : 'disabled'}>${last ? 'סיום' : 'המשך'}</button></div></div>`;
}

// ---- plans ---------------------------------------------------------------------------------------------------------
const PLAN_CARDS = [
  ['free', 'חינם', '₪0', 'אחרי תקופת הניסיון', ['מצב אחד בכל ניתוח', '2 ניתוחים בשבוע', 'מותר ואסור בלבד, ללא תפריט']],
  ['basic', 'בסיס', '₪19.90 / חודש', 'לשימוש יומיומי', ['עד 3 מצבים משולבים', 'ניתוחים ללא הגבלה', 'תפריט יומי והחלפות', 'חוברת מידע עם שמות המחקרים', 'השוואת מחירי סופרים']],
  ['pro', 'פרו', '₪39.90 / חודש', 'הכי משתלם', ['כל היתרונות של בסיס', 'מצבים משולבים ללא הגבלה', 'אנשי מקצוע בתצוגה אנונימית', 'פנייה אחת בחודש']],
  ['premium', 'פרימיום', '₪79.90 / חודש', 'הכול כלול', ['כל היתרונות של פרו', 'חשיפת שם ופרטי קשר של דיאטן/ית', 'פניות ללא הגבלה', 'עדיפות בתור הניתוח']],
];

export function plans(v) {
  return `<div class="screen">${topBar()}<h2 class="t">תוכניות ומחירים</h2>
    ${v.trialLeft ? `<div class="pillrow">נותרו ${v.trialLeft} ימים לניסיון חינם של תוכנית ${PLAN_NAMES[v.plan] ?? ''}</div>` : ''}
    ${PLAN_CARDS.map(([id, name, price, tag, feats]) => `<div class="card plancard ${v.plan === id ? 'cur' : ''}"><div class="ph"><div><b>${name}</b><small>${tag}</small></div><div class="pp">${price}${v.plan === id ? '<span class="here">התוכנית שלך</span>' : ''}</div></div>${feats.map((f) => `<div>✓ ${esc(f)}</div>`).join('')}</div>`).join('')}
    <p class="disc">הרכישה תיפתח בקרוב · ביטול בכל עת, ללא התחייבות. המחירים כוללים מע״מ ועשויים להשתנות לפני ההשקה. האפליקציה באנדרואיד תומכת ברכישה דרך Google Play.</p></div>`;
}

// ---- settings ------------------------------------------------------------------------------------------------------
function avatar(user) {
  const url = safeHttpUrl(user.photo ?? '');
  if (url.startsWith('https://')) return `<img class="avatar" src="${esc(url)}" alt="" referrerpolicy="no-referrer" width="56" height="56">`;
  return `<span class="avatar ph">${esc([...(user.name || user.email || '?')][0] ?? '?')}</span>`;
}

const PLAN_NAME = { free: 'חינם', basic: 'בסיס', pro: 'פרו', premium: 'פרימיום' };

export function settings(v) {
  const p = v.profile;
  const auto = v.location.autoDetect;
  return `<div class="screen">${topBar()}<h2 class="t">הגדרות</h2>
    <div class="card prof">${avatar(v.user)}<div><b>${esc(v.user.name || 'משתמש/ת')}</b><small>${esc(v.user.email)}</small>
      <span class="planchip">${v.user.admin ? 'מנהל' : esc(PLAN_NAME[v.plan] ?? '')}</span></div><button class="swap" data-go="#/plans">תוכניות</button></div>

    <div class="card form"><b>פרטים אישיים</b>
      <label class="lab" for="f-name">שם</label><input class="inp" id="f-name" maxlength="60" value="${esc(p.name)}" autocomplete="off">
      ${num('f-year', 'שנת לידה', p.birthYear, 1900, v.year)}<div class="lab">מין</div>${seg('data-sex', SEX_VALUES, L.sex, p.sex)}
      ${num('f-height', 'גובה (ס״מ)', p.heightCm, 50, 250)}${num('f-weight', 'משקל (ק״ג)', p.weightKg, 10, 400)}
      <div class="lab">פעילות גופנית</div>${seg('data-activity', ACTIVITY_VALUES, L.activity, p.activity)}
      <div class="lab">מטרה</div>${seg('data-goal', GOAL_VALUES, L.goal, p.goal)}
      <div class="lab">סגנון תזונה</div>${seg('data-diet', DIET_VALUES, L.diet, p.diet)}
      <label class="check"><input type="checkbox" id="f-kosher" ${p.kosher ? 'checked' : ''}> שומר/ת כשרות</label>
      ${p.sex === 'female' ? `<div class="lab">הריון / הנקה</div>${seg('data-pregnancy', PREGNANCY_VALUES, L.pregnancy, p.pregnancy || 'none')}` : ''}
      <label class="lab" for="f-avoid">להימנע מ…</label><textarea class="inp" id="f-avoid" rows="2" maxlength="200">${esc(p.avoid)}</textarea>
      <label class="check"><input type="checkbox" id="f-share" ${p.shareForAnalysis ? 'checked' : ''}> שליחת הפרטים עם הניתוח להתאמה אישית</label>
      ${v.errors?.length ? '<div class="alert" role="alert">⚠️ <span>יש לתקן ערכים לא תקינים.</span></div>' : ''}
      <button class="cta" style="margin:0" id="save-profile">שמור</button></div>

    <div class="card form"><b>מיקום להשוואת מחירים</b>
      <label class="check"><input type="checkbox" id="loc-auto" ${auto ? 'checked' : ''}> זיהוי מיקום אוטומטי</label>
      <label class="lab" for="loc-city">${auto ? 'עיר (כשהזיהוי אינו זמין)' : 'עיר קבועה'}</label>
      <select class="inp" id="loc-city">${CITIES.map((c) => `<option value="${esc(c.id)}" ${c.id === v.location.cityId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <small class="sub" style="margin:0">כעת: ${esc(v.resolved.label)}</small></div>

    <div class="card form"><b>חשבונות מקושרים</b>
      <div class="linked"><span>Google</span><span class="okc">✓ מחובר</span></div>
      <div class="linked"><span>Apple</span><span class="sub" style="margin:0">בקרוב</span></div></div>

    <button class="cta ghost" id="sign-out">התנתקות</button>
    <button class="cta ghost" id="delete-account" style="color:#B42318">מחיקת חשבון ונתונים</button>
    <p class="disc">${esc(DISCLAIMER)}<br><a href="../privacy/" style="color:var(--teal-dark)">מדיניות פרטיות</a></p></div>`;
}

// ---- announcement, notices, online order -----------------------------------------------------------------------------
export function announcementBanner(text, dismissed = '') {
  if (!text || text === dismissed) return '';
  return `<div class="pillrow" style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span>${esc(text)}</span><button data-dismiss-announcement aria-label="סגירה" style="padding:2px 8px">✕</button></div>`;
}

export const noticeView = (title, message, action = 'נסו שוב') => `<div class="center"><div style="font-size:54px">🛠️</div><b>${esc(title)}</b><span class="sub">${esc(message)}</span><button class="cta" style="width:220px" data-retry>${esc(action)}</button></div>`;

/** The shopper's list for one store. Everything starts checked; unchecking is remembered per store by the app. */
export function orderView(v) {
  const market = v.markets?.data?.markets?.[v.orderIndex ?? -1];
  if (!market || !orderEnabled(v, market)) return `<div class="screen">${topBar('#/products')}<p class="sub">הרשימה אינה זמינה כרגע.</p></div>`;
  const items = orderItems(market);
  const unchecked = v.orderUnchecked ?? [];
  const storeUrl = safeHttpUrl(market.online_store_url);
  const rows = items.map((item, i) => {
    const search = buildSearchUrl(market.online_search_url, item.product);
    return `<div class="orow"><label class="check"><input type="checkbox" data-ocheck="${i}" ${unchecked.includes(item.product) ? '' : 'checked'}> <span>${esc(item.product)}</span></label>
      <b>${esc(shekel(item.price))}</b>${search ? `<a class="pill-a" href="${esc(search)}" target="_blank" rel="noopener noreferrer">חפש בחנות</a>` : ''}</div>`;
  }).join('');
  return `<div class="screen">${topBar('#/products')}<h2 class="t">הזמנה אונליין · ${esc(market.chain)}</h2><p class="sub">${esc(market.store_name)}</p>
    <div class="alert">ℹ️ <span>${esc(ORDER_NOTE)}</span></div>
    <div class="card form"><div class="actions"><button class="swap" data-oall>בחר הכול</button><button class="swap" data-onone>נקה הכול</button></div>${rows}
      <div class="total">סה״כ לפי הסימון: ${esc(shekel(checkedTotal(items, unchecked)))}</div>
      ${storeUrl !== '#' ? `<a class="cta" style="display:grid;place-items:center;text-decoration:none;margin:0" href="${esc(storeUrl)}" target="_blank" rel="noopener noreferrer">פתח את החנות</a>` : ''}
      <div class="actions"><button class="swap" data-ocopy>העתק רשימה</button><button class="swap" data-oshare>שתף רשימה</button></div></div></div>`;
}
