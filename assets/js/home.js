import { resolvePlatform, androidLaunchUrl, PLAY_URL } from './router.js';
import { authConfigured, onUser, signInWithGoogle, signOut } from './auth.js';

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const s of ['detecting', 'android', 'ios', 'desktop']) $(s).classList.toggle('hidden', s !== id);
};

const platform = resolvePlatform(window);
show(platform);
document.documentElement.dataset.platform = platform;

if (platform === 'android') {
  const launch = androidLaunchUrl();
  $('open-app').href = launch;
  $('open-play').href = PLAY_URL;
  // Chrome may ignore intent: navigations that do not come from a tap, so the buttons above are the reliable path.
  setTimeout(() => { window.location.href = launch; }, 400);
}

if (platform === 'ios') {
  const msg = $('auth-msg');
  $('google').addEventListener('click', async () => {
    msg.classList.add('hidden');
    try {
      const user = await signInWithGoogle();
      if (user) window.location.href = 'app/';
    } catch (e) {
      msg.textContent = e && e.message === 'auth-not-configured'
        ? 'ההתחברות עם Google בהקמה. בינתיים אפשר לנסות את הדמו.'
        : 'ההתחברות נכשלה. נסו שוב.';
      msg.classList.remove('hidden');
    }
  });
  $('sign-out').addEventListener('click', () => signOut());
  onUser((user) => {
    $('signed-in').classList.toggle('hidden', !user);
    $('signed-out').classList.toggle('hidden', !!user);
    if (user) $('who').textContent = user.admin ? `מנהל · ${user.email}` : user.email;
  });
  if (!authConfigured()) $('google').title = 'Firebase not configured yet';
}
