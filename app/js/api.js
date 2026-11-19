// The only place the web app talks to the network. It calls our own server and nothing else (never a retailer or price site).

export const API_BASE = 'https://nutrition-api.echlonlabs.com';

const MESSAGES = {
  auth: 'נדרשת התחברות מחדש',
  rate: 'יותר מדי בקשות. נסו שוב בעוד דקה',
  server: 'השירות אינו זמין כרגע. נסו שוב מאוחר יותר',
  network: 'אין חיבור לשרת. בדקו את החיבור ונסו שוב',
  invalid: 'לא זוהה אחד המצבים שנבחרו',
};

export class ApiError extends Error {
  constructor(kind, message, extra = {}) {
    super(message ?? MESSAGES[kind] ?? MESSAGES.server);
    this.kind = kind;
    Object.assign(this, extra);
  }
}

async function readBody(res) {
  try { return await res.json(); } catch { return null; }
}

function toError(status, body) {
  const detail = body?.detail;
  if (status === 403 && detail && typeof detail === 'object' && detail.upgrade) {
    return new ApiError('upgrade', typeof detail.service_error === 'string' ? detail.service_error : undefined, { reason: detail.reason ?? 'PLAN' });
  }
  if (status === 401 || status === 403) return new ApiError('auth');
  if (status === 429) return new ApiError('rate');
  if (status === 422) return new ApiError('invalid', undefined, { term: typeof detail?.unknown_term === 'string' ? detail.unknown_term : '' });
  return new ApiError('server');
}

export function createApi({ base = API_BASE, getToken, fetchFn = (...a) => fetch(...a) }) {
  async function call(method, path, payload) {
    const headers = {};
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const init = { method, headers, credentials: 'omit' };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(payload);
    }
    let res;
    try { res = await fetchFn(`${base}${path}`, init); } catch { throw new ApiError('network'); }
    if (!res.ok) throw toError(res.status, await readBody(res));
    const body = await readBody(res);
    if (body === null) throw new ApiError('server');
    return body;
  }

  return {
    conditions: () => call('GET', '/api/v1/conditions'),
    config: () => call('GET', '/api/v1/config'),
    analyze: (req) => call('POST', '/api/v1/analyze-profile', req),
    marketsTop: ({ foods, lat, lng, label, limit = 3 }) => call('POST', '/api/v1/markets/top', { foods, lat, lng, label, limit }),
  };
}
