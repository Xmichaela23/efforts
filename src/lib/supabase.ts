import { createClient } from '@supabase/supabase-js';

// Hard‑pin client to the active Supabase project used across the app
// This avoids any environment mismatch during deploy
const supabaseUrl = 'https://yyriamwvtvzlkumqrvpm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY';

export const supabase = createClient(supabaseUrl, supabaseKey);

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
export async function invokeFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  let token: string;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? supabaseKey;
  } catch (authErr: any) {
    return { data: null, error: { message: `[auth] ${authErr?.message ?? 'session unavailable'}` } };
  }

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