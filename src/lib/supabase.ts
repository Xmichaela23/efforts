import { createClient } from '@supabase/supabase-js';

// Hard‑pin client to the active Supabase project used across the app
// This avoids any environment mismatch during deploy
const supabaseUrl = 'https://yyriamwvtvzlkumqrvpm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Call a Supabase Edge Function using raw fetch, bypassing the Supabase JS
 * client's internal JSON.stringify wrapper.  On iOS (JavaScriptCore / WKWebView)
 * the client's serialization pipeline can hit a cyclic-structure error when the
 * Capacitor layer attaches internal properties to the options object before the
 * body is stringified.  Calling fetch directly avoids the entire client layer and
 * lets us control serialization explicitly.
 */
export async function invokeFunction<T = unknown>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? supabaseKey;

  const jsonBody = JSON.stringify(body);

  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseKey,
    },
    body: jsonBody,
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message = (json as any)?.error ?? `HTTP ${res.status}`;
    const code = (json as any)?.error_code;
    return { data: null, error: { message, code } };
  }

  return { data: json as T, error: null };
}