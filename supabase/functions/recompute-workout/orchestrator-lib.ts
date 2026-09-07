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

// MOVED to `_shared/analyze-routing.ts` (2026-08-01) and re-exported here so this function's callers
// and its existing tests are unchanged. It left because `auto-attach-planned` needed the same routing
// and could not import it, so it grew a second, broken copy — see that file's header.
export { resolveAnalyzeEdgeFn } from '../_shared/analyze-routing.ts';

/** Constant-time string compare — the service-role door must not leak the key via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// The auth door moved to `_shared/require-user.ts` (requireUserOrService) on 2026-09-06 — B1 work order.

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
