/**
 * THE SUPPLIER — the two constraints it exists to honour, tested first.
 *
 *   1. The verdict reads the AMRAP set SPECIFICALLY, not the best set in the session. A heavy single
 *      afterwards is heavier and is not the measurement.
 *   2. Absent stays absent. "Nothing logged" must never collapse to 0, because 0 is a real result
 *      that means reset — and a skipped session must not drop the athlete's working number 10%.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { amrapRepsForLift, verdictForCycle, verdictsForCycles } from './cycle-verdicts.ts';

const set = (o: Record<string, unknown>) => ({ completed: true, ...o });
const session = (name: string, sets: Record<string, unknown>[]) =>
  ({ strength_exercises: [{ name, sets: sets.map(set) }] });

// ── Constraint 1: the AMRAP, not the best set ────────────────────────────────

Deno.test('⛔ A HEAVY SINGLE AFTER THE AMRAP IS NOT THE MEASUREMENT', () => {
  // `exercise_log.best_weight`/`best_reps` would report 135×1 here — and 1 < 5 reads as a MISS on a
  // session where the athlete hit eight at the prescribed weight. This is why the supplier does not
  // read that table.
  const w = session('Back Squat', [
    { weight: 95, reps: 5 },
    { weight: 110, reps: 5 },
    { weight: 125, reps: 8, amrap: true },   // the measurement
    { weight: 135, reps: 1 },                // a joker single — heavier, not the measurement
  ]);
  assertEquals(amrapRepsForLift(w, 'Back Squat'), 8);
  assertEquals(verdictForCycle([w], 'Back Squat'), 'advance');
});

Deno.test('the AMRAP is found by its flag wherever it sits in the set list', () => {
  const w = session('Bench Press', [
    { weight: 120, reps: 3, amrap: true },
    { weight: 100, reps: 10 },   // a backoff set with more reps
  ]);
  assertEquals(amrapRepsForLift(w, 'Bench Press'), 3);
  assertEquals(verdictForCycle([w], 'Bench Press'), 'reset', 'three reps at 95% is a miss');
});

Deno.test('a session with no AMRAP flag at all yields no reps, not the top set', () => {
  const w = session('Deadlift', [{ weight: 200, reps: 5 }, { weight: 225, reps: 5 }]);
  assertEquals(amrapRepsForLift(w, 'Deadlift'), null);
  assertEquals(verdictForCycle([w], 'Deadlift'), 'hold');
});

// ── Constraint 2: absent is not zero ─────────────────────────────────────────

Deno.test('⛔ NOTHING LOGGED IS `hold`, NOT `reset` — a skipped session must not cost 10%', () => {
  assertEquals(verdictForCycle([], 'Back Squat'), 'hold', 'an empty cycle');
  assertEquals(verdictForCycle([session('Bench Press', [{ weight: 100, reps: 5, amrap: true }])], 'Back Squat'),
    'hold', 'the cycle happened but this lift was never done');
  assertEquals(amrapRepsForLift(null, 'Back Squat'), null);
  assertEquals(amrapRepsForLift({ strength_exercises: null }, 'Back Squat'), null);
});

Deno.test('⛔ A LOGGED ZERO IS STILL A RESET — the distinction runs both ways', () => {
  // Absent must not become 0, and a real 0 must not become absent. It is evidence of a miss.
  const w = session('Back Squat', [{ weight: 125, reps: 0, amrap: true }]);
  assertEquals(amrapRepsForLift(w, 'Back Squat'), 0);
  assertEquals(verdictForCycle([w], 'Back Squat'), 'reset');
});

Deno.test('⛔ A PREFILLED AMRAP IS THE PRESCRIPTION, NOT A RESULT (D-204)', () => {
  // The logger prefills every prescribed set, AMRAP included, with the planned reps. Reading that
  // back would hand the plan its own homework — exactly the failure D-326 named.
  const untouched = { strength_exercises: [{ name: 'Back Squat', sets: [
    { weight: 125, reps: 5, amrap: true, prefilled: true, completed: false },
  ] }] };
  assertEquals(amrapRepsForLift(untouched, 'Back Squat'), null);
  assertEquals(verdictForCycle([untouched], 'Back Squat'), 'hold');

  // Once the athlete marks it done, the prefill flag no longer suppresses it.
  const done = { strength_exercises: [{ name: 'Back Squat', sets: [
    { weight: 125, reps: 7, amrap: true, prefilled: true, completed: true },
  ] }] };
  assertEquals(amrapRepsForLift(done, 'Back Squat'), 7);
});

// ── Ordering ─────────────────────────────────────────────────────────────────

Deno.test('the most recent performed AMRAP in a cycle wins', () => {
  const first = session('Back Squat', [{ weight: 125, reps: 3, amrap: true }]);
  const redo = session('Back Squat', [{ weight: 125, reps: 6, amrap: true }]);
  assertEquals(verdictForCycle([first, redo], 'Back Squat'), 'advance');
});

Deno.test('verdicts come back one per cycle, in order', () => {
  const hit = session('Back Squat', [{ weight: 125, reps: 6, amrap: true }]);
  const miss = session('Back Squat', [{ weight: 125, reps: 2, amrap: true }]);
  assertEquals(verdictsForCycles([[hit], [miss], []], 'Back Squat'), ['advance', 'reset', 'hold']);
});
