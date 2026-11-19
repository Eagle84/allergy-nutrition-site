// Saved data on this device, kept separately for each signed-in account so one account never sees another's settings.
// Storage can be missing or blocked (private mode); every call then quietly falls back to the default.

const PREFIX = 'nutri:v2:';

export function createStore(storage) {
  return {
    forUser(uid) {
      const base = `${PREFIX}${uid}:`;
      return {
        get(key, fallback) {
          try {
            const raw = storage.getItem(base + key);
            return raw === null ? fallback : JSON.parse(raw);
          } catch { return fallback; }
        },
        set(key, value) {
          try { storage.setItem(base + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
        },
        clear() {
          try {
            const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
            for (const k of keys) if (k.startsWith(base)) storage.removeItem(k);
          } catch { /* storage unavailable */ }
        },
      };
    },
  };
}
