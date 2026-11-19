// Dietitian portal: a professional signs in with the Google account recorded for them and talks with their patients.
// Everything shown comes from our server (/api/v1/pro/*), which decides who may see what. Text is always set with textContent, never as HTML.
import { firebaseConfig } from '../assets/js/firebase-config.js';

const API = 'https://nutrition-api.echlonlabs.com/api/v1/pro';
const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
const POLL_MS = 20000;
const app = document.getElementById('app');
const state = { auth: null, authMod: null, me: null, patients: [], current: null, timer: 0 };

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}
const mount = (...nodes) => app.replaceChildren(...nodes.filter(Boolean));
const timeText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }); };

async function api(method, path, body) {
  const user = state.auth.currentUser;
  if (!user) throw Object.assign(new Error('signed-out'), { status: 401 });
  const res = await fetch(API + path, {
    method, cache: 'no-store', credentials: 'omit',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* generic error bodies only */ }
  if (!res.ok) throw Object.assign(new Error(data?.detail?.service_error || 'שגיאה זמנית. נסו שוב.'), { status: res.status });
  return data;
}

function signInScreen(message) {
  mount(el('div', { class: 'signin' }, el('div', { class: 'card' },
    el('div', { class: 'logo', 'aria-hidden': 'true' }, '✚'), el('h1', {}, 'פורטל דיאטנים'), el('p', {}, 'כניסה לאנשי מקצוע בלבד. היכנסו עם חשבון Google שרשום אצלנו.'),
    el('button', { class: 'primary', onclick: signIn }, 'כניסה עם Google'),
    message ? el('p', { class: 'toast', role: 'alert' }, message) : null)));
}

async function signIn() {
  const provider = new state.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await state.authMod.signInWithPopup(state.auth, provider); } catch { signInScreen('הכניסה נכשלה. נסו שוב.'); }
}

async function onUser(user) {
  clearInterval(state.timer);
  state.me = null; state.current = null;
  if (!user) { signInScreen(); return; }
  try { state.me = await api('GET', '/me'); } catch (e) {
    mount(el('div', { class: 'signin' }, el('div', { class: 'card' }, el('p', { class: 'toast', role: 'alert' }, e.status === 403 ? 'החשבון הזה אינו רשום כאיש מקצוע במערכת.' : e.message),
      el('button', { onclick: () => state.authMod.signOut(state.auth) }, 'התנתקות'))));
    return;
  }
  await refresh();
  state.timer = setInterval(() => refresh(true), POLL_MS);
}

async function refresh(quiet = false) {
  try {
    state.patients = (await api('GET', '/patients')).items;
    if (state.current) await openThread(state.current, true);
    render();
  } catch (e) {
    if (e.status === 401) { signInScreen('פג תוקף הכניסה. היכנסו מחדש.'); return; }
    if (!quiet) render(e.message);
  }
}

async function openThread(id, keep = false) {
  const data = await api('GET', `/patients/${id}/messages`);
  state.current = id;
  state.thread = data.items;
  if (!keep) { state.patients = (await api('GET', '/patients')).items; render(); const t = document.querySelector('.thread'); if (t) t.scrollTop = t.scrollHeight; }
}

function render(error) {
  const patient = state.patients.find((p) => p.id === state.current);
  const list = el('aside', { class: 'list' }, el('h2', {}, `המטופלים שלי (${state.patients.length})`),
    state.patients.length ? state.patients.map((p) => el('button', { class: 'patient', 'aria-current': String(p.id === state.current), onclick: () => openThread(p.id).catch((e) => render(e.message)) },
      el('div', { class: 'row' }, el('b', { dir: 'ltr' }, p.patient_email ?? '(חשבון נמחק)'), p.unread ? el('span', { class: 'badge' }, p.unread) : null),
      el('div', { class: 'last' }, p.last_message || 'אין הודעות'))) : el('p', { class: 'empty' }, 'עדיין אין פניות. כשמשתמש יפנה אליכם הוא יופיע כאן.'));

  let chat;
  if (!patient) chat = el('section', { class: 'placeholder' }, el('p', {}, 'בחרו מטופל מהרשימה כדי לראות את השיחה.'));
  else {
    const box = el('textarea', { rows: '2', maxlength: '500', placeholder: 'כתבו הודעה…', 'aria-label': 'הודעה' });
    const send = async () => {
      const text = box.value.trim();
      if (!text) return;
      box.disabled = true;
      try { await api('POST', `/patients/${patient.id}/messages`, { text }); box.value = ''; await openThread(patient.id); } catch (e) { render(e.message); }
    };
    box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); } });
    chat = el('section', { class: 'chat' },
      el('div', { class: 'chat-head' }, el('h2', { dir: 'ltr' }, patient.patient_email ?? '(חשבון נמחק)'), el('small', {}, `פנה/תה בתאריך ${timeText(patient.since)}`),
        patient.conditions.length ? el('div', {}, patient.conditions.map((c) => el('span', { class: 'chip', dir: 'ltr' }, c))) : el('div', {}, el('small', {}, 'המטופל/ת לא שיתף/ה מצבים.'))),
      el('div', { class: 'thread' }, (state.thread ?? []).map((m) => el('div', { class: `msg ${m.sender === 'dietitian' ? 'mine' : 'theirs'}` }, m.text, el('time', {}, timeText(m.at))))),
      el('div', { class: 'composer' }, box, el('button', { class: 'primary', onclick: send }, 'שליחה')));
  }

  mount(el('div', { class: 'shell' },
    el('header', { class: 'top' }, el('div', { class: 'who' }, el('div', { class: 'logo', 'aria-hidden': 'true' }, '✚'), el('div', {}, el('b', {}, state.me.name), el('small', {}, 'פורטל דיאטנים · תזונה בטוחה'))),
      el('button', { onclick: () => state.authMod.signOut(state.auth) }, 'התנתקות')),
    el('div', { class: 'cols' }, list, chat)), error ? el('p', { class: 'toast', role: 'alert' }, error) : null);
  const t = document.querySelector('.thread');
  if (t) t.scrollTop = t.scrollHeight;
}

async function start() {
  if (!firebaseConfig) { mount(el('p', { class: 'boot' }, 'שירות ההתחברות אינו מוגדר.')); return; }
  try {
    const [appMod, authMod] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]);
    state.authMod = authMod;
    state.auth = authMod.getAuth(appMod.initializeApp(firebaseConfig));
    authMod.onAuthStateChanged(state.auth, onUser);
  } catch { mount(el('p', { class: 'boot', role: 'alert' }, 'לא ניתן לטעון את שירות ההתחברות.')); }
}

start();
