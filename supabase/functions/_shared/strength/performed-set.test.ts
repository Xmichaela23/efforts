import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { isPerformedStrengthSet } from './performed-set.ts';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-178 — THE BUG CASE. This is a PERMANENT REGRESSION FIXTURE. Do not delete it.
//
// Found on the live account 2026-07-13: a Farmers Carry set saved as "0 reps (RIR 3)" (D-203's
// friction-free "Done" auto-saves the suggested RIR while reps stay 0). The old predicate
// short-circuited on `completed === true` and called it PERFORMED — so a lift the athlete did
// ZERO reps of MATCHED, the 30%-weighted exercise-completion term paid out in full, the session
// scored 98% "Strong", and the LLM was handed a fact packet saying the exercise was done. It then
// wrote "sets landed on target across all three lifts."
// ─────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('Q-178: a set marked completed with ZERO reps is NOT performed (the Farmers Carry case)', () => {
  assertEquals(
    isPerformedStrengthSet({ completed: true, reps: 0, weight: null, duration_seconds: null }),
    false,
  );
});

Deno.test('Q-178: completed:true + an auto-filled RIR but no work is still NOT performed', () => {
  // The exact shape the logger wrote. `rir` is not even read by the predicate — that is the point:
  // an RIR on a zero-rep set is not evidence of work. (D-204: "no effort signal, never on target".)
  assertEquals(
    isPerformedStrengthSet({ completed: true, prefilled: false, reps: 0, weight: 0, duration_seconds: 0 }),
    false,
  );
});

Deno.test('Q-178: the completed flag alone never makes a set performed', () => {
  assertEquals(isPerformedStrengthSet({ completed: true }), false);
});

// ── D-204's original rule must still hold ────────────────────────────────────────────────────

Deno.test('D-204: an untouched prefill is NOT performed, even carrying the prescribed reps/weight', () => {
  assertEquals(
    isPerformedStrengthSet({ completed: false, prefilled: true, reps: 5, weight: 115 }),
    false,
  );
});

Deno.test('D-204: a prefilled set the athlete COMPLETED with real work IS performed', () => {
  assertEquals(
    isPerformedStrengthSet({ completed: true, prefilled: true, reps: 5, weight: 120 }),
    true,
  );
});

// ── Real work still counts. These are the regressions the fix must not cause. ────────────────

Deno.test('a normal completed working set IS performed', () => {
  assertEquals(isPerformedStrengthSet({ completed: true, reps: 5, weight: 120 }), true);
});

Deno.test('BODYWEIGHT work (no weight, real reps) IS performed', () => {
  assertEquals(isPerformedStrengthSet({ completed: true, reps: 12, weight: 0 }), true);
});

Deno.test('TIME-BASED work (no reps, real duration) IS performed — planks, carries', () => {
  assertEquals(
    isPerformedStrengthSet({ completed: true, reps: 0, weight: 0, duration_seconds: 45 }),
    true,
  );
});

Deno.test('a set with real data but NOT flagged completed IS performed (logged, never confirmed)', () => {
  assertEquals(isPerformedStrengthSet({ completed: false, reps: 5, weight: 120 }), true);
});

Deno.test('null / undefined / empty are not performed', () => {
  assertEquals(isPerformedStrengthSet(null), false);
  assertEquals(isPerformedStrengthSet(undefined), false);
  assertEquals(isPerformedStrengthSet({}), false);
});
