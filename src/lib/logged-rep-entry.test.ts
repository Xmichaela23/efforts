/**
 * ⛔ THE GATE — THE THREE STATES OF A LOGGED REP COUNT (stage 2, item 1).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/logged-rep-entry.test.ts
 *
 * These rules are the standing plan's ONLY input. `barSessionSignal` reads a completed set at zero as
 * the failed attempt and undoes an earned increment; before this shipped, nothing in the app could
 * write that zero, so the progression was a one-way ratchet — the bar could rise and never come back.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isFailedAttempt, repFloorFor, repsAreBlank } from './logged-rep-entry.ts';

Deno.test('⛔⛔ THE HEAVY SET CAN BE LOGGED AT ZERO — the one-way ratchet, closed', () => {
  assertEquals(repFloorFor({ slotIntent: 'ME' }), 0);
  // ⚠️ AND NOWHERE ELSE THE FLOOR WAS NOT ALREADY DOWN. `reps: 0` is the CLEARED value app-wide and
  // the blank-set guard depends on it; dropping the floor everywhere would let any emptied cell be
  // ticked as done — the exact 2026-08-13 bug (a Pull Up set checked with no reps in it).
  assertEquals(repFloorFor({ slotIntent: 'DE' }), 1);
  assertEquals(repFloorFor({ slotIntent: 'HYP' }), 1);
  assertEquals(repFloorFor({}), 1);
  assertEquals(repFloorFor({ slotIntent: null }), 1);
  // ⚠️ The pull-up rep-MAX test already allowed zero (Q-102) and keeps it, on any intent.
  assertEquals(repFloorFor({ repMaxTest: true }), 0);
  assertEquals(repFloorFor({ repMaxTest: true, slotIntent: 'HYP' }), 0);
});

Deno.test('⛔⛔ A TYPED ZERO IS A RESULT; AN EMPTY CELL IS NOT — and the value alone cannot tell them apart', () => {
  // The failed attempt: the athlete entered 0.
  assertEquals(repsAreBlank({ reps: 0, reps_entered: true }), false);
  // The cleared cell: the same VALUE, and it must stay unmarkable.
  assertEquals(repsAreBlank({ reps: 0, reps_entered: false }), true);
  assertEquals(repsAreBlank({ reps: 0 }), true, 'a legacy set with no provenance read as a failed lift');
  // ⚠️ MUTATION-TESTED: gate `repsAreBlank` on the value alone and the two lines above collide —
  // either the failed attempt cannot be logged, or every untouched set can be ticked as one.
  assertEquals(repsAreBlank(undefined), true);
  assertEquals(repsAreBlank({}), true);
  assertEquals(repsAreBlank({ reps: null }), true);
  assertEquals(repsAreBlank({ reps: 1 }), false);
  assertEquals(repsAreBlank({ reps: 6 }), false, 'beating the range read as an empty cell');
  // The pull-up rep-max test's zero is a real result and always was.
  assertEquals(repsAreBlank({ reps: 0, repMaxTest: true }), false);
});

Deno.test('⛔ WHAT THE PROGRESSION READS AS A FAILED ATTEMPT — completed, zero, and entered', () => {
  assert(isFailedAttempt({ reps: 0, reps_entered: true, completed: true }));
  // ⛔ NOT COMPLETED IS SILENCE. A set the athlete opened and never finished is not a missed lift, and
  // the engine agrees — `barSessionSignal` filters on `completed === true` before it reads anything.
  assertEquals(isFailedAttempt({ reps: 0, reps_entered: true, completed: false }), false);
  // ⛔ AND A CLEARED CELL IS NEVER ONE, even ticked — which is what stops a blank set from undoing a
  // jump the athlete earned.
  assertEquals(isFailedAttempt({ reps: 0, completed: true }), false);
  assertEquals(isFailedAttempt({ reps: 3, reps_entered: true, completed: true }), false);
  assertEquals(isFailedAttempt(undefined), false);
});

Deno.test('⛔ NOTHING CAPS THE TOP — an athlete who gets six logs six', () => {
  // The rep cell has never had a ceiling and this change did not add one; the FLOOR was the bound.
  // Pinned because "unbounded in either direction" is half of item 1 and a silent cap would make the
  // engine's "finished the range or beat it" test unreachable from above.
  for (const n of [6, 8, 12]) {
    assertEquals(Math.max(repFloorFor({ slotIntent: 'ME' }), n), n, `a count of ${n} was clamped`);
  }
});
