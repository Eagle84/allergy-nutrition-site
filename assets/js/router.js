// Device routing and admin allowlist. Pure functions so they can be unit-tested with node --test.

export const PACKAGE_ID = 'com.echlonlabs.allergynutrition';
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;

// Admins skip every paywall. Only SHA-256 hashes of admin emails live in client code (this file is public);
// the check is purely for UX (badge, hiding the paywall). Real enforcement is server-side: the backend and
// Firestore rules verify the verified email on the Firebase ID token against a private allowlist.
export const ADMIN_EMAIL_SHA256 = ['ee790710adf0b6008bf53616777b88c064353546c0bfaa0c91a1db060c51f68e'];

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @returns {'android'|'ios'|'desktop'} */
export function detectPlatform({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipod|ipad/i.test(userAgent)) return 'ios';
  // iPadOS 13+ reports a Macintosh user agent; a touch screen tells it apart from a real Mac.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

/**
 * Chrome on Android understands intent: URLs. This one launches the installed app (MAIN/LAUNCHER of the
 * package) and, when the app is not installed, falls back to the Play Store listing.
 */
export function androidLaunchUrl(fallback = PLAY_URL) {
  return (
    'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;' +
    `package=${PACKAGE_ID};S.browser_fallback_url=${encodeURIComponent(fallback)};end`
  );
}

export function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** The ?as=android|ios|desktop override is honored on localhost only, for testing. */
export function resolvePlatform(win) {
  const loc = win.location;
  if (isLocalHost(loc.hostname)) {
    const forced = new URLSearchParams(loc.search).get('as');
    if (['android', 'ios', 'desktop'].includes(forced)) return forced;
  }
  return detectPlatform({ userAgent: win.navigator.userAgent, maxTouchPoints: win.navigator.maxTouchPoints || 0 });
}

export async function isAdminEmail(email, emailVerified = true) {
  if (!email || !emailVerified) return false;
  return ADMIN_EMAIL_SHA256.includes(await sha256Hex(String(email).trim().toLowerCase()));
}
