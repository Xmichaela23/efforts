// Connection health (docs/WORKORDER-plumbing-2026-09-07.md §4).
//
// Every function that calls Garmin or Strava with a stored token reports the provider's answer here:
//   2xx        → health 'ok', last_ok_at now, last_error cleared
//   401 / 403  → health 'needs_reauth', last_error   (the token is dead; only the athlete can fix it)
//   anything   → health 'error', last_error          (network, 5xx, 429 — the token may still be fine)
// Garmin rows live in user_connections, Strava rows in device_connections (where each connect flow
// writes them). Never throws; a missing column (migration not yet pasted) logs and moves on.

export type Health = 'ok' | 'needs_reauth' | 'error';
export type ConnectionTable = 'user_connections' | 'device_connections';

export function healthFromStatus(status: number): Health {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'needs_reauth';
  return 'error';
}

/** Where each provider's connection row lives — the table its connect flow writes. */
export function tableForProvider(provider: string): ConnectionTable {
  return String(provider).toLowerCase() === 'garmin' ? 'user_connections' : 'device_connections';
}

export function healthPatch(status: number, error: string | null | undefined, now: Date): Record<string, unknown> {
  const health = healthFromStatus(status);
  if (health === 'ok') return { health, last_ok_at: now.toISOString(), last_error: null };
  const text = (error && error.trim()) || `HTTP ${status}`;
  return { health, last_error: text.slice(0, 500) };
}

export type ProviderResult = {
  provider: 'garmin' | 'strava' | string;
  userId: string;
  status: number;
  error?: string | null;
  /** Override the table (the Garmin webhook reads a token from either). */
  table?: ConnectionTable;
};

/**
 * Write the provider's answer onto the athlete's connection row. Fire-and-forget safe.
 */
// deno-lint-ignore no-explicit-any
export async function recordProviderResult(supabase: any, r: ProviderResult): Promise<void> {
  if (!r?.userId || !r?.provider) return;
  const table = r.table ?? tableForProvider(r.provider);
  const patch = healthPatch(r.status, r.error, new Date());
  try {
    const { error } = await supabase.from(table).update(patch).eq('user_id', r.userId).eq('provider', r.provider);
    if (error) console.warn(`[connection-health] ${table} update failed (column missing?):`, error.message);
    else if (patch.health !== 'ok') console.log(JSON.stringify({ event: 'connection_health', table, provider: r.provider, user_id: r.userId, ...patch }));
  } catch (e) {
    console.warn('[connection-health] update threw:', (e as Error)?.message ?? e);
  }
}

/** On a fresh connect the row is healthy by definition. Spread into the connect flow's upsert/update. */
export function healthyOnConnect(now = new Date()): Record<string, unknown> {
  return { health: 'ok', last_error: null, last_ok_at: now.toISOString() };
}
