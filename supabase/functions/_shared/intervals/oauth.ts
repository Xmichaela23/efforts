// Intervals.icu sign-in (OAuth), the parts with no database (2026-09-13).
// Endpoints read 2026-09-13 from the Intervals OAuth thread (forum.intervals.icu/t/2759, post #1) and the OpenAPI doc:
//   authorize   https://intervals.icu/oauth/authorize?client_id&redirect_uri&scope&state   → redirect_uri?code&state
//   token       POST https://intervals.icu/api/oauth/token, form client_id, client_secret, code (within 2 minutes)
//               → { token_type, access_token, scope, athlete: { id, name } }. No expiry, no refresh token.
//   revoke      DELETE https://intervals.icu/api/v1/disconnect-app with the Bearer token
// No PKCE in any source, so `state` carries the protection: an HMAC over the Efforts user id, so a code can only be
// attached to the account that pressed Connect. See docs/WORKORDER-intervals-oauth-2026-09-13.md, Step 0.

export const INTERVALS_REDIRECT_URI = 'https://efforts.work/auth/intervals/callback';
/** What every athlete is asked for, in one approval (Michael, 2026-09-13; workorder section 3, item 5). Format from the
 *  OAuth thread post #1: comma-separated, each SCOPE:READ or SCOPE:WRITE, WRITE implies READ. */
export const INTERVALS_SCOPES = 'CALENDAR:WRITE,ACTIVITY:READ,SETTINGS:WRITE';
/** The one grant the calendar sync cannot work without (events create/update/delete); without it the connection is refused. */
export const CALENDAR_WRITE = 'CALENDAR:WRITE';
// OURS — how long the athlete may spend on the Intervals.icu sign-in and consent page before the state goes stale.
const STATE_TTL_MS = 30 * 60 * 1000;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function stateKey(connectionKeyB64: string): Promise<CryptoKey> {
  // A separate key for signing, derived from the credential key so no new secret is needed.
  const root = await crypto.subtle.importKey('raw', Uint8Array.from(atob(connectionKeyB64), (c) => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = new Uint8Array(await crypto.subtle.sign('HMAC', root, enc.encode('intervals-oauth-state-v1')));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(key: CryptoKey, userId: string, exp: string, nonce: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${userId}|${exp}|${nonce}`))));
}

function connectionKey(explicit?: string): string {
  const k = explicit ?? (globalThis as any).Deno?.env?.get('CONNECTION_TOKEN_KEY') ?? '';
  if (!k) throw new Error('CONNECTION_TOKEN_KEY is not set');
  return k;
}

/** "<expiry ms>.<nonce>.<signature>". The user id is signed, not included, so it never reaches Intervals.icu. */
export async function makeState(userId: string, now = Date.now(), keyB64?: string): Promise<string> {
  const exp = String(now + STATE_TTL_MS);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return `${exp}.${nonce}.${await sign(await stateKey(connectionKey(keyB64)), userId, exp, nonce)}`;
}

export async function checkState(state: string, userId: string, now = Date.now(), keyB64?: string): Promise<'ok' | 'malformed' | 'expired' | 'wrong_user'> {
  const [exp, nonce, sig, extra] = String(state ?? '').split('.');
  if (!exp || !nonce || !sig || extra !== undefined || !/^\d+$/.test(exp)) return 'malformed';
  const expected = await sign(await stateKey(connectionKey(keyB64)), userId, exp, nonce);
  let diff = expected.length ^ sig.length;
  for (let i = 0; i < Math.min(expected.length, sig.length); i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return 'wrong_user';
  if (Number(exp) < now) return 'expired';
  return 'ok';
}

export function authorizeUrl(clientId: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: INTERVALS_REDIRECT_URI, scope: INTERVALS_SCOPES, state });
  return `https://intervals.icu/oauth/authorize?${q.toString()}`;
}

export type IntervalsToken = { accessToken: string; scopes: string[]; athleteId: string; athleteName: string | null };

/** True when the granted scopes allow calendar writes (WRITE implies READ; the athlete can untick scopes). */
export function grantsCalendarWrite(scopes: string[]): boolean {
  return scopes.map((s) => s.trim().toUpperCase()).includes(CALENDAR_WRITE);
}

export function parseTokenResponse(body: any): IntervalsToken {
  const accessToken = typeof body?.access_token === 'string' ? body.access_token : '';
  const athleteId = body?.athlete?.id != null ? String(body.athlete.id) : '';
  if (!accessToken) throw new Error('Intervals.icu returned no access_token');
  if (!athleteId) throw new Error('Intervals.icu returned no athlete id');
  const scopes = String(body?.scope ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { accessToken, scopes, athleteId, athleteName: body?.athlete?.name ?? null };
}

export class IntervalsTokenError extends Error {
  constructor(public status: number, body: string) {
    super(`Intervals.icu token exchange → ${status}: ${body.slice(0, 300)}`);
    this.name = 'IntervalsTokenError';
  }
}

export async function exchangeCode(clientId: string, clientSecret: string, code: string, fetchImpl: typeof fetch = fetch): Promise<IntervalsToken> {
  const res = await fetchImpl('https://intervals.icu/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code }).toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new IntervalsTokenError(res.status, text);
  let body: any = null;
  try { body = JSON.parse(text); } catch { throw new IntervalsTokenError(res.status, `not JSON: ${text}`); }
  return parseTokenResponse(body);
}

/** Revoke this app's access for the athlete. Returns the HTTP status (0 when the call itself failed). */
export async function disconnectApp(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetchImpl('https://intervals.icu/api/v1/disconnect-app', { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    const text = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300);
    return { ok: res.ok, status: res.status, ...(text ? { error: text } : {}) };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}
