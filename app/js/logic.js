// Pure rules shared by the iPhone web app. No DOM, no network: everything here is unit-tested in site/tests/logic.test.mjs
// and mirrors the Android app (plans, profile, location, dietitians, approved products).

export const DAY = 86_400_000;
export const TRIAL_DAYS = 7;

// ---- plans ---------------------------------------------------------------------------------------------------------
export const PLAN_ORDER = ['free', 'basic', 'pro', 'premium'];
export const FEATURES = { MEAL_PLAN: 'meal_plan', BOOKLET: 'booklet', PRICE_COMPARE: 'price_compare', DIETITIAN_IDENTITY: 'dietitian_identity' };
const MAX_CONDITIONS = { free: 1, basic: 3, pro: 8, premium: 8 };
const FEATURE_MIN_PLAN = { meal_plan: 'basic', booklet: 'basic', price_compare: 'basic', dietitian_identity: 'premium' };

/** Admins always have everything; a new account gets 7 days of Pro, counted from its first sign-in; then Free. */
export function effectivePlan(user, now = Date.now()) {
  if (user?.admin) return 'premium';
  if (user?.createdAtMs == null) return 'free';
  return now - user.createdAtMs < TRIAL_DAYS * DAY ? 'pro' : 'free';
}

export function trialDaysLeft(user, now = Date.now()) {
  if (!user || user.admin || user.createdAtMs == null) return null;
  const left = Math.ceil((TRIAL_DAYS * DAY - (now - user.createdAtMs)) / DAY);
  return left > 0 ? Math.min(left, TRIAL_DAYS) : null;
}

export const maxConditions = (plan) => MAX_CONDITIONS[plan] ?? 1;
export const allows = (plan, feature) => PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(FEATURE_MIN_PLAN[feature] ?? 'premium');

// ---- profile -------------------------------------------------------------------------------------------------------
export const SEX_VALUES = ['male', 'female', 'other'];
export const ACTIVITY_VALUES = ['sedentary', 'light', 'moderate', 'active', 'athlete'];
export const GOAL_VALUES = ['lose', 'maintain', 'gain'];
export const DIET_VALUES = ['omnivore', 'vegetarian', 'vegan', 'pescatarian'];
export const PREGNANCY_VALUES = ['none', 'pregnant', 'breastfeeding'];
const MAX_AVOID_ITEMS = 20;
const MAX_AVOID_ITEM_LENGTH = 40;
const MAX_AVOID_TEXT = 200;

const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const set = (v) => v != null && v !== '';

/** Names of the fields that are out of range; empty means valid. */
export function validateProfile(p, currentYear = new Date().getFullYear()) {
  const bad = [];
  if ((p.name ?? '').length > 60) bad.push('name');
  if (set(p.birthYear) && !inRange(p.birthYear, 1900, currentYear)) bad.push('birthYear');
  if (set(p.sex) && !SEX_VALUES.includes(p.sex)) bad.push('sex');
  if (set(p.heightCm) && !inRange(p.heightCm, 50, 250)) bad.push('heightCm');
  if (set(p.weightKg) && !inRange(p.weightKg, 10, 400)) bad.push('weightKg');
  if (set(p.activity) && !ACTIVITY_VALUES.includes(p.activity)) bad.push('activity');
  if (set(p.goal) && !GOAL_VALUES.includes(p.goal)) bad.push('goal');
  if (set(p.diet) && !DIET_VALUES.includes(p.diet)) bad.push('diet');
  if (set(p.pregnancy) && (!PREGNANCY_VALUES.includes(p.pregnancy) || (p.sex !== 'female' && p.pregnancy !== 'none'))) bad.push('pregnancy');
  if ((p.avoid ?? '').length > MAX_AVOID_TEXT) bad.push('avoid');
  return bad;
}

/** The four details every analysis needs to be personalised; onboarding does not finish without them. */
export const isComplete = (p, currentYear = new Date().getFullYear()) =>
  set(p.birthYear) && set(p.sex) && set(p.heightCm) && set(p.weightKg) && validateProfile(p, currentYear).length === 0;

export function avoidList(text) {
  const items = String(text ?? '').split(/[,،\n]/).map((s) => s.trim().slice(0, MAX_AVOID_ITEM_LENGTH)).filter(Boolean);
  return [...new Set(items)].slice(0, MAX_AVOID_ITEMS);
}

/** What is sent with an analysis, or null when the user has not agreed to share. Safe defaults fill unset options. */
export function toRequestProfile(p) {
  if (p.shareForAnalysis === false) return null;
  return {
    birth_year: p.birthYear ?? null,
    sex: p.sex || null,
    height_cm: p.heightCm ?? null,
    weight_kg: p.weightKg ?? null,
    activity: p.activity || 'light',
    goal: p.goal || 'maintain',
    diet: p.diet || 'omnivore',
    kosher: Boolean(p.kosher),
    pregnancy: p.sex === 'female' && p.pregnancy ? p.pregnancy : 'none',
    avoid: avoidList(p.avoid),
  };
}

// ---- location ------------------------------------------------------------------------------------------------------
export const DEFAULT_CITY_ID = 'tel_aviv';
export const CURRENT_LOCATION_LABEL = 'מיקום נוכחי';
const c = (id, name, lat, lng) => ({ id, name, lat, lng });
export const CITIES = [
  c('tel_aviv', 'תל אביב-יפו', 32.0853, 34.7818), c('jerusalem', 'ירושלים', 31.7683, 35.2137), c('haifa', 'חיפה', 32.794, 34.9896),
  c('rishon', 'ראשון לציון', 31.9636, 34.8101), c('petah_tikva', 'פתח תקווה', 32.084, 34.8878), c('ashdod', 'אשדוד', 31.804, 34.6553),
  c('netanya', 'נתניה', 32.3215, 34.8532), c('beer_sheva', 'באר שבע', 31.253, 34.7915), c('bnei_brak', 'בני ברק', 32.0807, 34.8338),
  c('holon', 'חולון', 32.0158, 34.7874), c('ramat_gan', 'רמת גן', 32.0684, 34.8248), c('rehovot', 'רחובות', 31.8928, 34.8113),
  c('bat_yam', 'בת ים', 32.023, 34.7503), c('ashkelon', 'אשקלון', 31.6688, 34.5743), c('herzliya', 'הרצליה', 32.1663, 34.8447),
  c('kfar_saba', 'כפר סבא', 32.175, 34.9066), c('hadera', 'חדרה', 32.434, 34.9196), c('modiin', 'מודיעין', 31.8969, 35.0104),
  c('raanana', 'רעננה', 32.1848, 34.8713), c('hod_hasharon', 'הוד השרון', 32.15, 34.8886), c('lod', 'לוד', 31.9515, 34.8953),
  c('rosh_haayin', 'ראש העין', 32.0956, 34.9566), c('kiryat_gat', 'קריית גת', 31.61, 34.7642), c('nazareth', 'נצרת', 32.7019, 35.297),
  c('afula', 'עפולה', 32.6078, 35.2897), c('acre', 'עכו', 32.9281, 35.0826), c('karmiel', 'כרמיאל', 32.919, 35.295),
  c('tiberias', 'טבריה', 32.7959, 35.531), c('eilat', 'אילת', 29.5577, 34.9519),
];
export const cityById = (id) => CITIES.find((x) => x.id === id) ?? CITIES.find((x) => x.id === DEFAULT_CITY_ID);

export function resolveLocation(prefs, fix) {
  if (prefs.autoDetect && fix) return { lat: fix.lat, lng: fix.lng, label: CURRENT_LOCATION_LABEL, source: 'device' };
  const city = cityById(prefs.cityId);
  return { lat: city.lat, lng: city.lng, label: city.name, source: 'city' };
}

// ---- approved products / formatting / links -----------------------------------------------------------------------
export function approvedProducts(analysis, query = '') {
  const q = String(query).trim().toLowerCase();
  const foods = analysis?.food_matrix?.allowed_foods ?? [];
  return foods
    .filter((f) => !q || f.name_he.toLowerCase().includes(q))
    .sort((a, b) => a.category_he.localeCompare(b.category_he, 'he') || a.name_he.localeCompare(b.name_he, 'he'));
}

export const shekel = (n) => `₪${Number(n).toFixed(2)}`;

/** External links are only ever http(s); anything else (javascript:, data:, protocol-relative) becomes "#". */
export function safeHttpUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '#';
  } catch { return '#'; }
}

// ---- dietitians ----------------------------------------------------------------------------------------------------
export const anonymousLabel = (position) => `דיאטנית מומלצת #${position}`;

export function averageRating(reviews) {
  if (!reviews.length) return 0;
  return Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10;
}

export function starsText(rating) {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export function ratingLabel(reviews) {
  if (!reviews.length) return 'אין ביקורות עדיין';
  const avg = averageRating(reviews).toFixed(1);
  return reviews.length === 1 ? `${avg} · ביקורת אחת` : `${avg} · ${reviews.length} ביקורות`;
}

export function reviewsSummary(reviews) {
  if (!reviews.length) return '';
  const best = reviews.reduce((a, b) => (b.stars > a.stars ? b : a));
  const text = best.text.trim();
  return `״${text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text}״`;
}

/** Specialists for the selected conditions first (most overlap, then best rated), general practice after, others excluded. */
export function dietitiansFor(all, selected) {
  const chosen = new Set(selected);
  const overlap = (d) => d.focus.filter((s) => chosen.has(s)).length;
  const candidates = selected.length === 0 ? all : all.filter((d) => d.focus.length === 0 || overlap(d) > 0);
  return [...candidates].sort((a, b) => overlap(b) - overlap(a) || averageRating(b.reviews) - averageRating(a.reviews));
}

const r = (author, stars, text, date) => ({ author, stars, text, date });
/** Placeholder directory (labelled in the UI) until real professionals are onboarded and consent to being listed. */
export const SAMPLE_DIETITIANS = [
  {
    id: 'sample-1', name: 'ד״ר לדוגמה א׳', city: 'תל אביב', clinic: 'קליניקה לדוגמה · מערכת העיכול', address: 'רחוב הדוגמה 12, תל אביב',
    phone: '03-555-0101', email: 'sample1@example.com', years: 14, languages: ['עברית', 'אנגלית', 'רוסית'],
    focus: ['ibs_irritable_bowel_syndrome', 'gerd_reflux', 'crohns_disease', 'lactose_intolerance'], focusLabel: 'מעי רגיז, ריפלוקס, קרוהן, לקטוז',
    bio: 'דיאטנית קלינית עם התמחות במחלות מעי דלקתיות ותסמונת המעי הרגיז. עובדת בגישת FODMAP מותאמת אישית.',
    reviews: [r('לקוחה א׳', 5, 'ליווי מקצועי וסבלני, התסמינים שלי השתפרו תוך חודשיים', '2026-10'), r('לקוח ב׳', 5, 'הסבירה בצורה ברורה מה מותר ומה אסור ולמה', '2026-09'),
      r('לקוחה ג׳', 4, 'תפריט מותאם ומעשי, קצת קשה למצוא תור', '2026-08'), r('לקוח ד׳', 5, 'ממליץ בחום, יחס אישי', '2026-07')],
  },
  {
    id: 'sample-2', name: 'דיאטן לדוגמה ב׳', city: 'ירושלים', clinic: 'מרפאה לדוגמה · צליאק וגלוטן', address: 'שדרות הדוגמה 3, ירושלים',
    phone: '02-555-0102', email: 'sample2@example.com', years: 9, languages: ['עברית', 'אנגלית'],
    focus: ['celiac_disease', 'gluten_sensitivity_non_celiac'], focusLabel: 'צליאק ורגישות לגלוטן',
    bio: 'מתמחה בתזונה נטולת גלוטן לילדים ומבוגרים, כולל ליווי משפחתי והכנת רשימות קניות.',
    reviews: [r('הורה א׳', 5, 'עזר לנו מאוד אחרי האבחון של הבת', '2026-10'), r('לקוחה ב׳', 4, 'הרבה טיפים לקניות ולמסעדות', '2026-08'), r('לקוח ג׳', 5, 'מקצועי, זמין ונעים', '2026-06')],
  },
  {
    id: 'sample-3', name: 'דיאטנית לדוגמה ג׳', city: 'חיפה', clinic: 'מרכז לדוגמה · אלרגיות למזון', address: 'רחוב הדוגמה 8, חיפה',
    phone: '04-555-0103', email: 'sample3@example.com', years: 11, languages: ['עברית', 'ערבית', 'אנגלית'],
    focus: ['peanut_allergy', 'tree_nut_allergy', 'egg_allergy', 'milk_allergy', 'soy_allergy', 'sesame_allergy', 'latex_fruit_syndrome'], focusLabel: 'אלרגיות מזון בילדים ומבוגרים',
    bio: 'מלווה משפחות עם אלרגיות למזון, כולל הכנסת מזונות בטוחה ותכנון תפריט לגן ולבית הספר.',
    reviews: [r('אמא א׳', 5, 'סוף סוף מישהי שמבינה אלרגיות מורכבות', '2026-10'), r('אבא ב׳', 5, 'בנתה לנו תפריט שבוע שלם, מושלם', '2026-09'),
      r('לקוחה ג׳', 4, 'מקצועית, רק הפגישות קצת קצרות', '2026-07'), r('לקוח ד׳', 5, 'ליווי מצוין לכל המשפחה', '2026-05'), r('לקוחה ה׳', 4, 'תודה על הסבלנות', '2026-04')],
  },
  {
    id: 'sample-4', name: 'דיאטנית לדוגמה ד׳', city: 'באר שבע', clinic: 'קליניקה לדוגמה · מטבוליזם', address: 'רחוב הדוגמה 21, באר שבע',
    phone: '08-555-0104', email: 'sample4@example.com', years: 7, languages: ['עברית', 'אנגלית'],
    focus: ['prediabetes', 'gout', 'histamine_intolerance', 'migraine'], focusLabel: 'טרום-סוכרת, גאוט, היסטמין, מיגרנה',
    bio: 'תזונה קלינית למצבים מטבוליים ולמיגרנות, עם דגש על שינויים קטנים וברי קיימא.',
    reviews: [r('לקוח א׳', 4, 'תהליך הדרגתי וברור, ירדתי בערכי הסוכר', '2026-09'), r('לקוחה ב׳', 5, 'המיגרנות הצטמצמו משמעותית', '2026-08'), r('לקוח ג׳', 4, 'שירות טוב', '2026-06')],
  },
  {
    id: 'sample-5', name: 'דיאטן לדוגמה ה׳', city: 'רמת גן', clinic: 'קליניקה לדוגמה · תזונה כללית', address: 'רחוב הדוגמה 4, רמת גן',
    phone: '03-555-0105', email: 'sample5@example.com', years: 18, languages: ['עברית', 'אנגלית'],
    focus: [], focusLabel: 'ייעוץ תזונתי כללי',
    bio: 'ייעוץ תזונתי כללי, תזונת ספורט ושיפור הרגלי אכילה. פגישות גם בזום.',
    reviews: [r('לקוחה א׳', 5, 'מקצועי ואנושי', '2026-10'), r('לקוח ב׳', 4, 'פגישות בזום נוחות מאוד', '2026-07'), r('לקוחה ג׳', 4, 'קיבלתי כלים מעשיים', '2026-05')],
  },
];

// ---- diary ---------------------------------------------------------------------------------------------------------
export const SYMPTOMS = ['נפיחות', 'כאבי בטן', 'בחילה', 'שלשול', 'עצירות', 'גירוד', 'פריחה', 'כאב ראש', 'צרבת', 'קוצר נשימה'];
export const SEVERITY_LABELS = ['קל', 'בינוני', 'קשה'];
export const DIARY_LIMIT = 200;
const MAX_NOTE = 500;
const MAX_MEAL = 100;

/** A cleaned entry, or null when it has neither a meal nor a known symptom. Severity is 1..3 (1 when there are no symptoms). */
export function makeDiaryEntry({ meal = '', symptoms = [], severity = 1, note = '' }, now = Date.now()) {
  const cleanMeal = String(meal).trim().slice(0, MAX_MEAL);
  const cleanSymptoms = [...new Set(symptoms)].filter((s) => SYMPTOMS.includes(s));
  if (!cleanMeal && cleanSymptoms.length === 0) return null;
  const level = cleanSymptoms.length === 0 ? 1 : Math.min(3, Math.max(1, Math.round(Number(severity)) || 1));
  return { id: now, atMs: now, meal: cleanMeal, symptoms: cleanSymptoms, severity: level, note: String(note).trim().slice(0, MAX_NOTE) };
}

/** Newest first, bounded. Returns the same list when the entry is empty. */
export function addDiaryEntry(list, input, now = Date.now()) {
  const entry = makeDiaryEntry(input, now);
  if (!entry) return list;
  const taken = new Set(list.map((e) => e.id));
  while (taken.has(entry.id)) entry.id += 1;
  return [entry, ...list].slice(0, DIARY_LIMIT);
}
