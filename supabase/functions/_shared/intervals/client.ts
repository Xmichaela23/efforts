// Intervals.icu API calls for the calendar sync. Endpoints and fields from the OpenAPI document at
// https://intervals.icu/api/v1/docs (read 2026-09-13):
//   POST /api/v1/athlete/{id}/events/bulk?upsert=true   body EventEx[]; matches external_id on events this client created
//   PUT  /api/v1/athlete/{id}/events/bulk-delete        body DoomedEvent[] ({ id } or { external_id })
// Auth: a personal API key is HTTP Basic with username "API_KEY"; an OAuth access token is a Bearer token.

export class IntervalsApiError extends Error {
  constructor(public status: number, public body: string, what: string) {
    super(`Intervals.icu ${what} → ${status}: ${body.slice(0, 400)}`);
    this.name = 'IntervalsApiError';
  }
}

export type IntervalsAuth =
  | { kind: 'api_key'; key: string; athleteId: string }
  | { kind: 'oauth'; accessToken: string; athleteId: string };

const BASE = 'https://intervals.icu/api/v1';

function authHeader(auth: IntervalsAuth): string {
  return auth.kind === 'api_key' ? `Basic ${btoa(`API_KEY:${auth.key}`)}` : `Bearer ${auth.accessToken}`;
}

async function call(auth: IntervalsAuth, method: string, path: string, body: unknown, what: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: authHeader(auth), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new IntervalsApiError(res.status, text, what);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

/** GET /athlete/0 resolves to the athlete the credential belongs to. */
export async function getAthlete(auth: { kind: 'api_key'; key: string } | { kind: 'oauth'; accessToken: string }): Promise<{ id: string; name: string | null; timezone: string | null }> {
  const a = await call({ ...auth, athleteId: '0' } as IntervalsAuth, 'GET', '/athlete/0', undefined, 'get athlete');
  if (!a?.id) throw new IntervalsApiError(200, JSON.stringify(a ?? null), 'get athlete (no id)');
  return { id: String(a.id), name: a.name ?? null, timezone: a.timezone ?? null };
}

/** Create or update by external_id. Returns external_id → Intervals event id. */
export async function upsertEvents(auth: IntervalsAuth, events: Array<Record<string, unknown> & { external_id: string }>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let i = 0; i < events.length; i += 50) {
    const out = await call(auth, 'POST', `/athlete/${encodeURIComponent(auth.athleteId)}/events/bulk?upsert=true`, events.slice(i, i + 50), 'bulk upsert');
    for (const ev of Array.isArray(out) ? out : []) {
      if (ev?.external_id && ev?.id != null) ids.set(String(ev.external_id), String(ev.id));
    }
  }
  const missing = events.filter((e) => !ids.has(e.external_id)).map((e) => e.external_id);
  if (missing.length) throw new IntervalsApiError(200, `no event id returned for ${missing.join(', ')}`, 'bulk upsert');
  return ids;
}

export async function deleteEventsByExternalId(auth: IntervalsAuth, externalIds: string[]): Promise<void> {
  for (let i = 0; i < externalIds.length; i += 100) {
    await call(auth, 'PUT', `/athlete/${encodeURIComponent(auth.athleteId)}/events/bulk-delete`,
      externalIds.slice(i, i + 100).map((external_id) => ({ external_id })), 'bulk delete');
  }
}
