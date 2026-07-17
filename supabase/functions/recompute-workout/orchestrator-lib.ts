/**
 * Pure, testable pieces of the recompute-workout orchestrator (fan-out ordering fix, 2026-07-17).
 * Kept local to this function (not _shared) so it bundles only here — no cross-function deploy trap.
 * See docs/AUDIT-fanout-ordering-2026-07-17.md.
 */

/** Monday (UTC) of the week containing dateStr — compute-snapshot's per-week cache key. */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

/** Same routing as MobileSummary; default matches mobility / unknown types. */
export function resolveAnalyzeEdgeFn(workoutType: string | null | undefined): string {
  const t = (workoutType ?? '').toLowerCase();
  if (t === 'run' || t === 'running') return 'analyze-running-workout';
  // Provider mappers normalize cycling activities to type='ride' upstream;
  // 'cycling' and 'bike' synonyms previously listed here never fired in production data.
  if (t === 'ride') return 'analyze-cycling-workout';
  if (t === 'strength' || t === 'strength_training') return 'analyze-strength-workout';
  if (t === 'swim' || t === 'swimming') return 'analyze-swim-workout';
  return 'analyze-running-workout';
}

/** Constant-time string compare — the service-role door must not leak the key via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export type AuthDecision =
  | { kind: 'service'; ownerUserId: string }
  | { kind: 'user' }
  | { kind: 'reject'; code: string; error: string };

/**
 * The auth door decision — TWO doors, and the service one is ONLY a door, never a bypass.
 *  - exact service key (constant-time) + explicit user_id  → trusted service door.
 *  - exact service key + no user_id                        → REJECT (a service call must name the user).
 *  - anything else (incl. a user JWT)                      → fall to the user-JWT gate (getUser + ownership),
 *                                                            which the caller runs UNCHANGED.
 * Never returns 'user' for the service key, and never returns 'service' for a non-service token.
 */
export function decideAuthDoor(params: {
  token: string;
  serviceKey: string;
  bodyUserId: string | null;
}): AuthDecision {
  const { token, serviceKey, bodyUserId } = params;
  if (!token) return { kind: 'reject', code: 'unauthorized', error: 'Missing token' };
  if (timingSafeEqual(token, serviceKey)) {
    if (!bodyUserId) return { kind: 'reject', code: 'unauthorized', error: 'service call requires user_id' };
    return { kind: 'service', ownerUserId: bodyUserId };
  }
  return { kind: 'user' };
}

/** Bounded retry: invoke, then up to `retries` more attempts on error. Transient-shaped failures only. */
export async function invokeWithRetry(client: any, fn: string, body: any, retries = 1): Promise<any> {
  let last: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await client.functions.invoke(fn, { body });
    if (!res?.error) return res;
    last = res;
    if (attempt < retries) {
      console.warn(`[recompute-workout] ${fn} attempt ${attempt + 1} failed, retrying:`, res.error.message);
    }
  }
  return last;
}
