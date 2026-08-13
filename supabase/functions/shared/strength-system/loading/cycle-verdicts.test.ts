/**
 * THE SUPPLIER — the two constraints it exists to honour, tested first.
 *
 *   1. The verdict reads the AMRAP set SPECIFICALLY, not the best set in the session. A heavy single
 *      afterwards is heavier and is not the measurement.
 *   2. Absent stays absent. "Nothing logged" must never collapse to 0, because 0 is a real result
 *      that means reset — and a skipped session must not drop the athlete's working number 10%.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  amrapRepsForLift,
  cycleSessionFor,
  groupSessionsByCycle,
  verdictForCycle,
  verdictsForBlock,
  verdictsForCycles,
} from './cycle-verdicts.ts';
import { cyclesForBlock } from './wendler-531.ts';

/** A session at the 95% week — the one the validity check reads. */
const wk3 = (w: any) => ({ weekInCycle: 3, workout: w });

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
  assertEquals(verdictForCycle([wk3(w)], 'Back Squat'), 'advance');
});

Deno.test('the AMRAP is found by its flag wherever it sits in the set list', () => {
  const w = session('Bench Press', [
    { weight: 120, reps: 0, amrap: true },
    { weight: 100, reps: 10 },   // a backoff set with more reps
  ]);
  assertEquals(amrapRepsForLift(w, 'Bench Press'), 0);
  // ⛔ Q-220: was "three reps at 95% is a miss" — it is not, p23 prescribes 1+. A logged ZERO is.
  // ⛔ SLICE a (2026-08-12): the verdict is now `miss`, not `reset`. A logged zero is still the
  // failure — what changed is that ONE of them holds the weight (p33) and only a confirmed pattern
  // resets it. The rename is the whole point: this function reports the SESSION, the walker decides
  // the consequence.
  assertEquals(verdictForCycle([wk3(w)], 'Bench Press'), 'miss', 'zero reps at 95% is the miss');
});

Deno.test('a session with no AMRAP flag at all yields no reps, not the top set', () => {
  const w = session('Deadlift', [{ weight: 200, reps: 5 }, { weight: 225, reps: 5 }]);
  assertEquals(amrapRepsForLift(w, 'Deadlift'), null);
  assertEquals(verdictForCycle([wk3(w)], 'Deadlift'), 'hold');
});

// ── Constraint 2: absent is not zero ─────────────────────────────────────────

Deno.test('⛔ NOTHING LOGGED IS `hold`, NOT `reset` — a skipped session must not cost 10%', () => {
  assertEquals(verdictForCycle([], 'Back Squat'), 'hold', 'an empty cycle');
  assertEquals(verdictForCycle([wk3(session('Bench Press', [{ weight: 100, reps: 5, amrap: true }]))], 'Back Squat'),
    'hold', 'the cycle happened but this lift was never done');
  assertEquals(amrapRepsForLift(null, 'Back Squat'), null);
  assertEquals(amrapRepsForLift({ strength_exercises: null }, 'Back Squat'), null);
});

Deno.test('⛔ A LOGGED ZERO IS STILL A MISS — the distinction runs both ways', () => {
  // Absent must not become 0, and a real 0 must not become absent. It is evidence of a miss.
  const w = session('Back Squat', [{ weight: 125, reps: 0, amrap: true }]);
  assertEquals(amrapRepsForLift(w, 'Back Squat'), 0);
  assertEquals(verdictForCycle([wk3(w)], 'Back Squat'), 'miss');
});

Deno.test('⛔ A PREFILLED AMRAP IS THE PRESCRIPTION, NOT A RESULT (D-204)', () => {
  // The logger prefills every prescribed set, AMRAP included, with the planned reps. Reading that
  // back would hand the plan its own homework — exactly the failure D-326 named.
  const untouched = { strength_exercises: [{ name: 'Back Squat', sets: [
    { weight: 125, reps: 5, amrap: true, prefilled: true, completed: false },
  ] }] };
  assertEquals(amrapRepsForLift(untouched, 'Back Squat'), null);
  assertEquals(verdictForCycle([wk3(untouched)], 'Back Squat'), 'hold');

  // Once the athlete marks it done, the prefill flag no longer suppresses it.
  const done = { strength_exercises: [{ name: 'Back Squat', sets: [
    { weight: 125, reps: 7, amrap: true, prefilled: true, completed: true },
  ] }] };
  assertEquals(amrapRepsForLift(done, 'Back Squat'), 7);
});

// ── Ordering ─────────────────────────────────────────────────────────────────

// ── Which AMRAP: the 95% week, not the latest ───────────────────────────────

Deno.test('⛔ THE VERDICT READS THE 95% WEEK, NOT THE LATEST AMRAP', () => {
  // The anchor carries three AMRAPs at three loads: 85%×5+, 90%×3+, 95%×1+. Only the last is the
  // validity check. Reading "the latest logged" would grade whichever week happened to be done last.
  const wk1 = { weekInCycle: 1, workout: session('Back Squat', [{ weight: 110, reps: 5, amrap: true }]) };
  const wk2 = { weekInCycle: 2, workout: session('Back Squat', [{ weight: 120, reps: 3, amrap: true }]) };
  const wk3s = { weekInCycle: 3, workout: session('Back Squat', [{ weight: 125, reps: 7, amrap: true }]) };
  assertEquals(verdictForCycle([wk1, wk2, wk3s], 'Back Squat'), 'advance', 'seven at 95% is a pass');

  // ⛔ AND THE CASE THAT MAKES "LATEST" DANGEROUS: the 5/3/1 week is missed. "Latest" would grade the
  // 90% × 3+ set — three reps, a pass by prescription — against a ≥5 bar and RESET the athlete for
  // completing the session as written.
  assertEquals(verdictForCycle([wk1, wk2], 'Back Squat'), 'hold',
    'no 95% week logged means no evidence, not a miss');
});

Deno.test('a repeated 95% session is the only place recency decides', () => {
  const first = { weekInCycle: 3, workout: session('Back Squat', [{ weight: 125, reps: 0, amrap: true }]) };
  const redo = { weekInCycle: 3, workout: session('Back Squat', [{ weight: 125, reps: 6, amrap: true }]) };
  assertEquals(verdictForCycle([first, redo], 'Back Squat'), 'advance');
});

Deno.test('verdicts come back one per cycle, in order', () => {
  const hit = wk3(session('Back Squat', [{ weight: 125, reps: 6, amrap: true }]));
  const miss = wk3(session('Back Squat', [{ weight: 125, reps: 0, amrap: true }]));   // Q-220: a logged zero
  assertEquals(verdictsForCycles([[hit], [miss], []], 'Back Squat'), ['advance', 'miss', 'hold']);
});

// ── Cycle grouping: the plan's week number, never the date ──────────────────

Deno.test('⛔ A SESSION FINDS ITS CYCLE BY PLAN WEEK, and week-in-cycle falls out of it', () => {
  const cycles = cyclesForBlock(12);   // 1-4, 5-8, 9-12
  const w = session('Back Squat', [{ weight: 125, reps: 6, amrap: true }]);
  assertEquals(cycleSessionFor(11, cycles, w)?.cycleIndex, 3);
  assertEquals(cycleSessionFor(11, cycles, w)?.session.weekInCycle, 3, 'week 11 is the 95% week');
  assertEquals(cycleSessionFor(1, cycles, w)?.cycleIndex, 1);
  assertEquals(cycleSessionFor(8, cycles, w)?.session.weekInCycle, 4, 'week 8 is a deload');
});

Deno.test('⛔ AN UNATTACHED WORKOUT CONTRIBUTES NOTHING — no plan week, no cycle', () => {
  // No `planned_id` means no `week_number`. An ad-hoc session the engine cannot place is not
  // evidence about a prescribed one, so it yields nothing and the cycle holds.
  const cycles = cyclesForBlock(12);
  const w = session('Back Squat', [{ weight: 125, reps: 6, amrap: true }]);
  assertEquals(cycleSessionFor(null, cycles, w), null);
  assertEquals(cycleSessionFor(undefined, cycles, w), null);
  assertEquals(cycleSessionFor(99, cycles, w), null, 'a week outside the block');
});

// ── The join, covered directly ──────────────────────────────────────────────
//
// ⛔ THIS IS THE UNTESTED SEAM. Everything above is pure over hand-built objects; the grouping is
// where the DB's shape meets the engine's, and it is the place this arc has repeatedly found things.

Deno.test('⛔ THE JOIN GROUPS BY PLAN WEEK, and drops what it cannot place', () => {
  const cycles = cyclesForBlock(12);
  const ex = (name: string, reps: number) => [{ name, sets: [set({ weight: 125, reps, amrap: true })] }];
  const grouped = groupSessionsByCycle([
    { week_number: 3,  strength_exercises: ex('Back Squat', 6) },   // cycle 1, week-in-cycle 3
    { week_number: 7,  strength_exercises: ex('Back Squat', 0) },   // cycle 2, week-in-cycle 3 — a logged MISS
    { week_number: 1,  strength_exercises: ex('Back Squat', 9) },   // cycle 1, week-in-cycle 1
    { week_number: null, strength_exercises: ex('Back Squat', 9) }, // unattached — dropped
    { week_number: 99, strength_exercises: ex('Back Squat', 9) },   // outside the block — dropped
  ], cycles);

  assertEquals(grouped.length, 3, 'one bucket per cycle');
  assertEquals(grouped[0].map((s) => s.weekInCycle).sort(), [1, 3]);
  assertEquals(grouped[1].map((s) => s.weekInCycle), [3]);
  assertEquals(grouped[2], [], 'cycle 3 has nothing logged');
  // And the week-1 session must not be mistaken for the validity check.
  assertEquals(verdictForCycle(grouped[0], 'Back Squat'), 'advance', 'six reps at the 95% week');
  // ⛔ Q-220: was "two reps at the 95% week", which p23 calls a pass. A logged ZERO is the miss.
  assertEquals(verdictForCycle(grouped[1], 'Back Squat'), 'miss', 'zero reps at the 95% week');
});

// ── The regime boundary ─────────────────────────────────────────────────────

Deno.test('⛔ ONE REGENERATION SPANS BOTH REGIMES — finished cycles read evidence, future ones forecast', () => {
  const cycles = cyclesForBlock(12);   // 1-4, 5-8, 9-12
  const hit = [{ weekInCycle: 3, workout: session('Back Squat', [{ weight: 125, reps: 7, amrap: true }]) }];
  const nothing: typeof hit = [];

  // Week 2: nothing has finished. Both verdicts are forecast, or the projected weeks show identical
  // loads in cycles 1, 2 and 3.
  assertEquals(verdictsForBlock(cycles, [nothing, nothing, nothing], 'Back Squat', 2),
    ['advance', 'advance']);

  // Week 6: cycle 1 is done and was logged; cycle 2 is still running, so it forecasts.
  assertEquals(verdictsForBlock(cycles, [hit, nothing, nothing], 'Back Squat', 6),
    ['advance', 'advance']);

  // ⛔ Week 9: cycle 1 done and logged, cycle 2 done and NOT logged. The second must HOLD — this is
  // the direction that would otherwise launder a missed cycle into an advance.
  assertEquals(verdictsForBlock(cycles, [hit, nothing, nothing], 'Back Squat', 9),
    ['advance', 'hold']);

  // And a finished cycle with a real miss reports the miss rather than holding.
  // ⛔ Q-220: the miss is a logged ZERO. Two reps at 95% is twice the prescribed minimum (p23).
  const miss = [{ weekInCycle: 3, workout: session('Back Squat', [{ weight: 125, reps: 0, amrap: true }]) }];
  // ⚠️ `miss`, NOT `reset` — and the block does not come down for it. The 10% drop needs a second
  // consecutive missed cycle (`STALL_CONFIRM_SESSIONS`), which `workingNumberForCycles` counts.
  assertEquals(verdictsForBlock(cycles, [miss, nothing, nothing], 'Back Squat', 9),
    ['miss', 'hold']);
});

Deno.test('the last cycle never yields a verdict — it belongs to the next block', () => {
  const cycles = cyclesForBlock(12);
  assertEquals(verdictsForBlock(cycles, [[], [], []], 'Back Squat', 13).length, 2);
});
