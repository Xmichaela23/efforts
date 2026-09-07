/**
 * Fixtures for the recompute-workout orchestrator (fan-out ordering fix, 2026-07-17).
 * Written against the RULINGS: (1) the service door is ONLY a door — it never softens the JWT gate;
 * (2) bounded retries; plus routing/date invariants the chain depends on.
 * Run: deno test supabase/functions/recompute-workout/orchestrator-lib.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  mondayOf,
  resolveAnalyzeEdgeFn,
  timingSafeEqual,
  invokeWithRetry,
} from './orchestrator-lib.ts';

const SVC = 'service-role-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// ── AUTH DOOR: moved to _shared/require-user.test.ts (requireUserOrService) on 2026-09-06 ──────────

// ── timingSafeEqual: underpins the service door ────────────────────────────────────────────────
Deno.test('timingSafeEqual: equal → true; differing → false; length mismatch → false', () => {
  assertEquals(timingSafeEqual('abc123', 'abc123'), true);
  assertEquals(timingSafeEqual('abc123', 'abc124'), false);
  assertEquals(timingSafeEqual('abc', 'abcd'), false);
  assertEquals(timingSafeEqual('', ''), true);
});

// ── resolveAnalyzeEdgeFn: routing the chain's step 5 depends on ────────────────────────────────
Deno.test('routing: run/ride/strength/swim/unknown map to the right analyzer', () => {
  assertEquals(resolveAnalyzeEdgeFn('run'), 'analyze-running-workout');
  assertEquals(resolveAnalyzeEdgeFn('running'), 'analyze-running-workout');
  assertEquals(resolveAnalyzeEdgeFn('ride'), 'analyze-cycling-workout');
  assertEquals(resolveAnalyzeEdgeFn('strength'), 'analyze-strength-workout');
  assertEquals(resolveAnalyzeEdgeFn('strength_training'), 'analyze-strength-workout');
  assertEquals(resolveAnalyzeEdgeFn('swim'), 'analyze-swim-workout');
  assertEquals(resolveAnalyzeEdgeFn('mobility'), 'analyze-running-workout'); // default
  assertEquals(resolveAnalyzeEdgeFn(null), 'analyze-running-workout');
});

// ── mondayOf: the snapshot week key ────────────────────────────────────────────────────────────
Deno.test('mondayOf: a mid-week date resolves to that week Monday; a Sunday resolves back', () => {
  assertEquals(mondayOf('2026-07-17'), '2026-07-13'); // Fri → Mon
  assertEquals(mondayOf('2026-07-13'), '2026-07-13'); // Mon → itself
  assertEquals(mondayOf('2026-07-19'), '2026-07-13'); // Sun → prior Mon
});

// ── invokeWithRetry (ruling 2): bounded retry, transient-shaped ────────────────────────────────
function fakeClient(script: Array<{ error?: { message: string } }>) {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    functions: {
      invoke: (fn: string, _opts: any) => {
        calls.push(fn);
        const r = script[Math.min(i, script.length - 1)];
        i++;
        return Promise.resolve(r);
      },
    },
  };
}

Deno.test('retry: success on first attempt → exactly one call', async () => {
  const c = fakeClient([{}]);
  const res = await invokeWithRetry(c, 'compute-facts', {});
  assertEquals(c.calls.length, 1);
  assertEquals(res.error, undefined);
});

Deno.test('retry: fail once then succeed → two calls, returns success', async () => {
  const c = fakeClient([{ error: { message: 'transient' } }, {}]);
  const res = await invokeWithRetry(c, 'compute-facts', {}, 1);
  assertEquals(c.calls.length, 2);
  assertEquals(res.error, undefined);
});

Deno.test('retry: always fails → bounded to retries+1 calls, returns the last error (not infinite)', async () => {
  const c = fakeClient([{ error: { message: 'down' } }]);
  const res = await invokeWithRetry(c, 'compute-facts', {}, 1);
  assertEquals(c.calls.length, 2); // 1 + 1 retry
  assertEquals(res.error.message, 'down');
});
