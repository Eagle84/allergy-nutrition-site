// Thin wrapper over Firebase Auth (Google) + Firestore user profile. Loaded lazily from the gstatic CDN so
// the pages work (in demo mode) when no Firebase project is configured yet.
import { firebaseConfig } from './firebase-config.js';
import { isAdminEmail } from './router.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
let ctx = null;

export const authConfigured = () => firebaseConfig !== null;

async function load() {
  if (ctx) return ctx;
  if (!firebaseConfig) throw new Error('auth-not-configured');
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  ctx = { auth: authMod.getAuth(app), db: fsMod.getFirestore(app), authMod, fsMod };
  return ctx;
}

/** Calls cb with the current user ({uid,email,name,photo,admin}) or null. Resolves a no-op when unconfigured. */
export async function onUser(cb) {
  if (!firebaseConfig) { cb(null); return () => {}; }
  const { auth, authMod } = await load();
  return authMod.onAuthStateChanged(auth, async (u) => cb(u ? await toUser(u) : null));
}

async function toUser(u) {
  return { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL, admin: await isAdminEmail(u.email, u.emailVerified) };
}

export async function signInWithGoogle() {
  const { auth, authMod } = await load();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  let result;
  try {
    result = await authMod.signInWithPopup(auth, provider);
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await authMod.signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
  const user = await toUser(result.user);
  await saveProfile(user).catch(() => {});
  return user;
}

export async function signOut() {
  const { auth, authMod } = await load();
  await authMod.signOut(auth);
}

async function saveProfile(user) {
  const { db, fsMod } = await load();
  await fsMod.setDoc(
    fsMod.doc(db, 'users', user.uid),
    { email: user.email, name: user.name || '', lastLoginAt: fsMod.serverTimestamp() },
    { merge: true },
  );
}
