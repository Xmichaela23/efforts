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
  decideAuthDoor,
  invokeWithRetry,
} from './orchestrator-lib.ts';

const SVC = 'service-role-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// ── AUTH DOOR (rider 1): two doors, and the service one is ONLY a door ─────────────────────────
Deno.test('auth: exact service key + explicit user_id → SERVICE door', () => {
  const d = decideAuthDoor({ token: SVC, serviceKey: SVC, bodyUserId: 'user-123' });
  assertEquals(d, { kind: 'service', ownerUserId: 'user-123' });
});

Deno.test('auth: exact service key but NO user_id → REJECT (a service call must name the user)', () => {
  const d = decideAuthDoor({ token: SVC, serviceKey: SVC, bodyUserId: null });
  assertEquals(d.kind, 'reject');
});

Deno.test('auth: a WRONG key → falls to the user-JWT gate, never bypasses (service is only the door)', () => {
  const d = decideAuthDoor({ token: 'wrong-key', serviceKey: SVC, bodyUserId: 'user-123' });
  assertEquals(d.kind, 'user'); // NOT service, even with a user_id present
});

Deno.test('auth: a normal user JWT → user gate (unchanged external path)', () => {
  const d = decideAuthDoor({ token: 'eyJhbGciOi.userjwt.sig', serviceKey: SVC, bodyUserId: null });
  assertEquals(d.kind, 'user');
});

Deno.test('auth: empty token → REJECT', () => {
  assertEquals(decideAuthDoor({ token: '', serviceKey: SVC, bodyUserId: 'user-123' }).kind, 'reject');
});

Deno.test('auth: a token that merely PREFIXES the service key is not the service key', () => {
  assertEquals(decideAuthDoor({ token: SVC.slice(0, -1), serviceKey: SVC, bodyUserId: 'u' }).kind, 'user');
});

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
