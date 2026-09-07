import { createClient } from '@supabase/supabase-js';

// Hard‑pin client to the active Supabase project used across the app
// This avoids any environment mismatch during deploy
const supabaseUrl = 'https://yyriamwvtvzlkumqrvpm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY';

// autoRefreshToken: false — prevents gotrue-js from running a background XHR/fetch
// timer that triggers "XMLHttpRequest.onreadystatechange getter can only be called
// on instances of XMLHttpRequest" in Capacitor/WKWebView on iOS.
// The access token is read directly from localStorage via getStoredUserId() so no
// token refresh is needed for normal app usage.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const SESSION_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `sub` from access_token when it is a logged-in user JWT; otherwise null. */
function parseAuthedSubFromAccessToken(accessToken: string | undefined): string | null {
  if (!accessToken || typeof accessToken !== 'string') return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad)) as { sub?: string; role?: string; aud?: string | string[] };
    const sub = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) return null;
    const role = typeof payload.role === 'string' ? payload.role : '';
    const audRaw = payload.aud;
    const aud = Array.isArray(audRaw) ? audRaw[0] : typeof audRaw === 'string' ? audRaw : '';
    const isAuthed = role === 'authenticated' || aud === 'authenticated';
    const isAnon = role === 'anon' || aud === 'anon';
    if (!isAuthed || isAnon) return null;
    return sub;
  } catch {
    return null;
  }
}

/**
 * Signed-in user id for filters and edge `user_id` body fields.
 *
 * Prefer JWT `sub` (matches Edge `requireUserIdFromRequest` + `Authorization`).
 * Fall back to `session.user.id` when the token is missing or not yet in the blob
 * (Capacitor / WKWebView can persist `user` before `access_token` is readable).
 *
 * NEVER use supabase.auth.getUser() / getSession() on iOS — use this + the blob.
 */
export function getStoredUserId(): string | null {
  try {
    const raw = localStorage.getItem(`sb-yyriamwvtvzlkumqrvpm-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: string }; access_token?: string };

    const sub = parseAuthedSubFromAccessToken(parsed.access_token);
    const fromUser =
      typeof parsed.user?.id === 'string' && SESSION_USER_ID_RE.test(parsed.user.id.trim())
        ? parsed.user.id.trim()
        : null;

    if (sub && fromUser && sub !== fromUser) {
      try {
        console.warn('[getStoredUserId] session user.id !== JWT sub; using sub', { fromUser, sub });
      } catch {
        void 0;
      }
      return sub;
    }
    if (sub) return sub;
    if (fromUser) return fromUser;
    return null;
  } catch {
    return null;
  }
}

/**
 * Full `user` object from the persisted session blob. Use instead of
 * `supabase.auth.getUser()` in boot paths — getUser() can hang on iOS/WKWebView
 * (see getStoredUserId() comment above).
 */
export function getStoredAuthUser(): { id: string; email?: string; [k: string]: unknown } | null {
  const id = getStoredUserId();
  if (!id) return null;
  try {
    const raw = localStorage.getItem(`sb-yyriamwvtvzlkumqrvpm-auth-token`);
    if (!raw) return { id };
    const parsed = JSON.parse(raw) as { user?: { id?: string; [k: string]: unknown } };
    if (parsed?.user && typeof parsed.user === 'object' && String(parsed.user.id) === id) {
      return parsed.user as { id: string; email?: string; [k: string]: unknown };
    }
    return { id };
  } catch {
    return { id };
  }
}

/**
 * Call a Supabase Edge Function using raw fetch, bypassing the Supabase JS
 * client's internal serialization pipeline which can hit cyclic-structure errors
 * on iOS/WKWebView when the Capacitor layer attaches internal window-referencing
 * properties before the body reaches JSON.stringify.
 *
 * Each step is isolated in its own try/catch so the error message tells us
 * exactly which stage failed.  The body is serialized with a WeakSet-based
 * replacer so a stray cyclic ref never hard-crashes the request.
 */
/**
 * ⛔ KEEP THE SIGN-IN TOKEN FRESH (2026-09-07). A token on this project lives 60 minutes and
 * `autoRefreshToken` is off (the WKWebView XHR bug above). Since the B1 pass every user-scoped function
 * verifies the token, so an hour-old phone session got "Recompute failed (HTTP 401) unauthorized".
 * Called before every function call and on app resume: if the stored token is expired or within five
 * minutes of it, refresh with the stored refresh token. gotrue-js v2 refreshes over fetch; if that path
 * throws in the WebView, fall back to a plain fetch and write the session back where gotrue keeps it.
 */
const STORAGE_KEY = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
export async function ensureFreshSession(): Promise<void> {
  let stored: { access_token?: string; refresh_token?: string; expires_at?: number } | null = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { stored = null; }
  if (!stored?.access_token || !stored?.refresh_token) return;
  const expiresAt = Number(stored.expires_at ?? 0);
  if (expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) >= 300) return;
  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
    if (!error && data?.session) return;
    if (error) console.warn('[auth] refreshSession:', error.message);
  } catch (e) {
    console.warn('[auth] refreshSession threw, using plain fetch:', (e as Error)?.message ?? e);
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseKey },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    });
    if (!res.ok) { console.warn('[auth] manual refresh failed:', res.status); return; }
    const next = await res.json() as { access_token: string; refresh_token: string; expires_in: number; expires_at?: number };
    const session = { ...stored, ...next, expires_at: next.expires_at ?? Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    try { await supabase.auth.setSession({ access_token: next.access_token, refresh_token: next.refresh_token }); } catch { /* storage already holds it */ }
  } catch (e) {
    console.warn('[auth] manual refresh threw:', (e as Error)?.message ?? e);
  }
}

export async function invokeFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  await ensureFreshSession();
  // Read the token directly from localStorage — avoids supabase.auth.getSession()
  // which can trigger an XHR-based token refresh that fails in WKWebView on iOS
  // ("XMLHttpRequest.onreadystatechange getter can only be called on instances
  // of XMLHttpRequest") due to the auth module running in the wrong JS context.
  const token = (() => {
    try {
      const projectRef = supabaseUrl.split('//')[1].split('.')[0];
      const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (raw) {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      }
    } catch { /* fall through to anon key */ }
    return supabaseKey;
  })();

  // ── 2. Serialise ─────────────────────────────────────────────────────────
  // Primary: plain JSON.stringify — works for all-primitive payloads.
  // Fallback: WeakSet replacer strips any cyclic / non-serialisable values
  // rather than throwing, so the request always reaches the edge function.
  let jsonBody: string;
  try {
    jsonBody = JSON.stringify(body);
  } catch {
    const seen = new WeakSet<object>();
    jsonBody = JSON.stringify(body, function (_key, value) {
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    }) ?? '{}';
  }

  // ── 3. Fetch ─────────────────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseKey,
      },
      body: jsonBody,
    });
  } catch (fetchErr: any) {
    return { data: null, error: { message: `[fetch] ${fetchErr?.message ?? 'network error'}` } };
  }

  // ── 4. Parse response ────────────────────────────────────────────────────
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (json as any)?.error ?? `HTTP ${res.status}`;
    const code = (json as any)?.error_code;
    return { data: null, error: { message, code } };
  }

  return { data: json as T, error: null };
}

/** Edge function POST with multipart body (e.g. GPX upload). Do not set Content-Type — browser sets boundary. */
export async function invokeFunctionFormData<T = unknown>(
  fnName: string,
  formData: FormData,
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const token = (() => {
    try {
      const projectRef = supabaseUrl.split('//')[1].split('.')[0];
      const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (raw) {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      }
    } catch { /* fall through */ }
    return supabaseKey;
  })();

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
      body: formData,
    });
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : 'network error';
    return { data: null, error: { message: `[fetch] ${msg}` } };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    const code = (json as { error_code?: string })?.error_code;
    return { data: null, error: { message, code } };
  }
  return { data: json as T, error: null };
}