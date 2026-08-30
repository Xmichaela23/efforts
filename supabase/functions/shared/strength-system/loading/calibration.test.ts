/**
 * ⛔⛔ SLICE b's PERMANENT REGRESSIONS — auto-apply, both directions, and the undo that sticks.
 *
 *   ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/loading/calibration.test.ts
 *
 * The five cases the slice names, plus the one it does not and should have:
 *   · confirmed stall  → a `reset` event, and undo puts the number back
 *   · earned step      → a `bump` event, and undo puts the number back
 *   · ONE missed set   → no event (p.33 — one bad day is not a stall)
 *   · on target        → no event either way
 *   · **undo STICKS**  → the suppression survives a recompute, which is the whole difficulty
 *
 * ⚠️ THE LAST ONE IS THE POINT OF THIS FILE. The rematerializer is a pure function of the stored
 * training max and the verdicts read off logged sets, so an undo that only restored rows would be
 * silently re-applied by the next save. `suppressUndone` is what makes the athlete's decision
 * outlive the recompute, and a regression there is invisible on every other test.
 *
 * ⚠️ FIXTURE, NOT PRODUCTION. Round invented numbers; nothing here reads a database.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type LiftCalibrationInput,
  type StrengthCalibrationEvent,
  calibrationEventsFor,
  liftStatus,
  suppressUndone,
  undoLatestCalibration,
} from './calibration.ts';
import { setsForWeek, weightForSet, workingNumberForCycles } from './wendler-531.ts';

const NOW = '2026-08-15T12:00:00.000Z';
const LATER = '2026-08-15T12:05:00.000Z';

/** A lift's cycle numbers, walked with the real engine so the fixture cannot drift from it. */
const walk = (base: number, isLower: boolean, verdicts: string[], cycles = 3) => {
  const byCycle = Array.from({ length: cycles }, (_, i) => ({
    cycle: i + 1,
    kind: (i + 1 === cycles ? 'anchor' : 'leader') as 'leader' | 'anchor',
    workingNumber: workingNumberForCycles(base, i + 1, isLower, verdicts as never, { unknownMeans: 'hold' }).workingNumber,
  }));
  const resetAtCycle = workingNumberForCycles(base, cycles, isLower, verdicts as never, { unknownMeans: 'hold' }).resetAtCycle;
  return { byCycle, resetAtCycle };
};

const liftInput = (
  over: Partial<LiftCalibrationInput> & Pick<LiftCalibrationInput, 'byCycle' | 'resetAtCycle' | 'changedCycles'>,
): LiftCalibrationInput => ({
  ref: 'overheadPress',
  name: 'Overhead Press',
  ...over,
});

// ── DOWN: the confirmed stall ───────────────────────────────────────────────

Deno.test('⛔ A CONFIRMED STALL EMITS A `reset` EVENT, and the numbers are training maxes', () => {
  // Two consecutive measured misses (p.31, gated by p.33). Press base 90: cycle 1 = 90, the first
  // miss HOLDS it at 90, the second drops it 10% to 80.
  const { byCycle, resetAtCycle } = walk(90, false, ['miss', 'miss']);
  assertEquals(byCycle.map((b) => b.workingNumber), [90, 90, 80]);
  assertEquals(resetAtCycle, 3);

  const events = calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [3] })], 3, NOW);
  assertEquals(events.length, 1);
  assertEquals(events[0].reason, 'reset');
  assertEquals(events[0].at_cycle, 3);
  assertEquals([events[0].from_training_max, events[0].to_training_max], [90, 80]);
  assertEquals(events[0].undone_at, null);
});

Deno.test('⛔ ONE MISS EMITS NOTHING — p.33, one bad day is not a stall', () => {
  // The single miss HOLDS the weight, so no cycle's number differs from the one before it and the
  // calendar does not move. Nothing to announce, nothing to undo.
  const { byCycle, resetAtCycle } = walk(90, false, ['miss']);
  assertEquals(byCycle.map((b) => b.workingNumber), [90, 90, 90]);
  assertEquals(resetAtCycle, null);
  assertEquals(calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [] })], 3, NOW), []);
});

// ── UP: the earned step ─────────────────────────────────────────────────────

Deno.test('⛔ AN EARNED STEP EMITS A `bump` EVENT — +5 upper, +10 lower, and no more', () => {
  const press = walk(90, false, ['advance', 'advance']);
  assertEquals(press.byCycle.map((b) => b.workingNumber), [90, 95, 100]);
  const pressEvents = calibrationEventsFor(
    [liftInput({ byCycle: press.byCycle, resetAtCycle: press.resetAtCycle, changedCycles: [2, 3] })], 3, NOW,
  );
  // ⚠️ ONE EVENT, AT THE EARLIEST CHANGED CYCLE. A step ripples through every remaining cycle; three
  // events for one thing that happened once is furniture, not information.
  assertEquals(pressEvents.length, 1);
  assertEquals(pressEvents[0].reason, 'bump');
  assertEquals([pressEvents[0].at_cycle, pressEvents[0].from_training_max, pressEvents[0].to_training_max], [2, 90, 95]);

  const squat = walk(200, true, ['advance', 'advance']);
  const squatEvents = calibrationEventsFor([{
    ref: 'squat', name: 'Back Squat',
    byCycle: squat.byCycle, resetAtCycle: squat.resetAtCycle, changedCycles: [2],
  }], 3, NOW);
  assertEquals([squatEvents[0].from_training_max, squatEvents[0].to_training_max], [200, 210]);
});

Deno.test('⛔ A BIG SET DOES NOT BUY A BIGGER STEP — the previous program, bold in the book', () => {
  // ⛔ THIS IS THE ONE PLACE SLICE b's BRIEF WAS WRONG AND THE FIXTURE EXISTS TO HOLD THE CORRECTION.
  // The slice specified a Juggernaut-style rep-scaled bump ("more reps over target → larger step").
  // p.20: *"stay the course. Do not increase more than the normal amount each cycle."* p.20-21:
  // eight reps at 95%, jump more? *"The answer every single time is NO."* p.21's Krypteia anecdote:
  // 15+ reps at the training max, and the fix is still the basic 5-10 lb.
  //
  // `advance_untrusted` is the verdict a set ABOVE the trusted-rep ceiling earns (D-417). It must
  // move the number by exactly the same amount as an ordinary advance.
  const ordinary = walk(90, false, ['advance']);
  const enormous = walk(90, false, ['advance_untrusted']);
  assertEquals(ordinary.byCycle.map((b) => b.workingNumber), enormous.byCycle.map((b) => b.workingNumber));
  const evs = calibrationEventsFor(
    [liftInput({ byCycle: enormous.byCycle, resetAtCycle: null, changedCycles: [2] })], 3, NOW,
  );
  assertEquals(evs[0].to_training_max - evs[0].from_training_max, 5, 'a 20-rep set still buys +5');
});

// ── ON TARGET: nothing moves ────────────────────────────────────────────────

Deno.test('on target with nothing logged holds, and emits nothing', () => {
  const { byCycle, resetAtCycle } = walk(90, false, []);
  assertEquals(byCycle.map((b) => b.workingNumber), [90, 90, 90]);
  assertEquals(calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [] })], 3, NOW), []);
});

Deno.test('a change landing in cycle 1 emits nothing — there is no prior number to have moved from', () => {
  const { byCycle, resetAtCycle } = walk(90, false, ['advance']);
  assertEquals(calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [1] })], 3, NOW), []);
});

// ── THE UNDO, AND WHY IT HAS TO STICK ───────────────────────────────────────

Deno.test('⛔ UNDO RESTORES THE PRIOR TRAINING MAX', () => {
  const { byCycle, resetAtCycle } = walk(90, false, ['miss', 'miss']);
  const applied = calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [3] })], 3, NOW);
  const { events, undone } = undoLatestCalibration(applied, 'overheadPress', LATER);
  assertEquals(undone?.reason, 'reset');
  assertEquals(events[0].undone_at, LATER);
  // The engine still computes 80 for cycle 3 — nothing about the logged sets changed. The suppression
  // is what puts 90 back.
  assertEquals(suppressUndone('overheadPress', 3, 80, events), 90);
});

Deno.test('⛔⛔ THE UNDO SURVIVES A RECOMPUTE — this is the whole difficulty', () => {
  // The rematerializer is a pure function of (stored base, verdicts). Recompute after an undo and it
  // reaches 80 again, every time, forever. An undo that only wrote the old rows back would be
  // silently reverted by the next save — the athlete taps Undo, sees the old weight, and finds the
  // new one back tomorrow with no explanation.
  const { byCycle, resetAtCycle } = walk(90, false, ['miss', 'miss']);
  const applied = calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [3] })], 3, NOW);
  const { events } = undoLatestCalibration(applied, 'overheadPress', LATER);

  for (let recompute = 0; recompute < 3; recompute += 1) {
    const fresh = walk(90, false, ['miss', 'miss']);
    const computed = fresh.byCycle.find((b) => b.cycle === 3)!.workingNumber;
    assertEquals(computed, 80, 'the engine has not changed its mind');
    assertEquals(suppressUndone('overheadPress', 3, computed, events), 90, `recompute ${recompute + 1}`);
  }
});

Deno.test('⛔ THE SUPPRESSION IS TARGETED — it does not freeze the lift', () => {
  const { byCycle, resetAtCycle } = walk(90, false, ['miss', 'miss']);
  const applied = calibrationEventsFor([liftInput({ byCycle, resetAtCycle, changedCycles: [3] })], 3, NOW);
  const { events } = undoLatestCalibration(applied, 'overheadPress', LATER);

  // A LATER cycle's step is a different event and is not suppressed.
  assertEquals(suppressUndone('overheadPress', 4, 85, events), 85);
  // A DIFFERENT number in the same cycle — more evidence arrived — is not suppressed either.
  assertEquals(suppressUndone('overheadPress', 3, 75, events), 75);
  // And another lift is untouched. p.31: you decrease the one stalled lift.
  assertEquals(suppressUndone('squat', 3, 80, events), 80);
});

Deno.test('undo takes the LATEST un-undone event only, and a double tap does nothing more', () => {
  const two: StrengthCalibrationEvent[] = [
    { lift: 'Overhead Press', ref: 'overheadPress', reason: 'bump', at_cycle: 2, total_cycles: 3,
      from_training_max: 90, to_training_max: 95, applied_at: NOW, undone_at: null },
    { lift: 'Overhead Press', ref: 'overheadPress', reason: 'bump', at_cycle: 3, total_cycles: 3,
      from_training_max: 95, to_training_max: 100, applied_at: NOW, undone_at: null },
  ];
  const first = undoLatestCalibration(two, 'overheadPress', LATER);
  assertEquals(first.undone?.at_cycle, 3, 'the most recent change is the one Undo means');
  assertEquals(first.events[0].undone_at, null, 'the earlier step is left alone');

  // ⛔ A DOUBLE TAP MUST NOT WALK BACKWARDS THROUGH THE LOG. One tap is "not this change", never
  // "unwind my whole block" — and a stale screen re-firing must not cost the athlete a second step.
  const second = undoLatestCalibration(first.events, 'overheadPress', LATER);
  assertEquals(second.undone?.at_cycle, 2);
  const third = undoLatestCalibration(second.events, 'overheadPress', LATER);
  assertEquals(third.undone, null, 'nothing left to undo');
});

Deno.test('an empty or absent log suppresses nothing and undoes nothing', () => {
  assertEquals(suppressUndone('bench', 2, 150, undefined), 150);
  assertEquals(suppressUndone('bench', 2, 150, []), 150);
  assertEquals(undoLatestCalibration(null, 'bench', LATER).undone, null);
});

// ── THE BLOCK ACTUALLY RE-LAYS OUT, AND THE UNDO ACTUALLY PUTS IT BACK ──────
//
// ⛔ THE SLICE'S ACCEPTANCE, AS FAR AS A FIXTURE CAN CARRY IT. Everything above operates on training
// maxes; what the athlete SEES is the prescribed bar weight on the weeks ahead. This composes the
// same three functions the rematerializer composes — `suppressUndone` over `workingNumberForCycles`,
// then `setsForWeek` + `weightForSet` — so a regression in the wiring shows up as a wrong weight
// rather than a wrong abstraction.
//
// ⚠️ WHAT IT CANNOT COVER: the database write and the row loop live in an edge function with no test
// harness. This pins the arithmetic that decides what those rows get; the write itself is the device
// acceptance run, and it is open.

Deno.test('⛔⛔ ACCEPTANCE — a stall re-lays out the weeks ahead, and undo puts the weights back', () => {
  // A 200 lb squat training max, two consecutive measured misses. Cycle 3 drops 10% to 180.
  const base = 200;
  const verdicts = ['miss', 'miss'];
  const walked = [1, 2, 3].map((c) => workingNumberForCycles(base, c, true, verdicts as never, { unknownMeans: 'hold' }));
  const byCycle = walked.map((w, i) => ({ cycle: i + 1, kind: (i === 2 ? 'anchor' : 'leader') as const, workingNumber: w.workingNumber }));
  const resetAtCycle = walked[2].resetAtCycle;
  assertEquals(byCycle.map((b) => b.workingNumber), [200, 200, 180]);
  assertEquals(resetAtCycle, 3);

  // The anchor's week-3 top set is 95% of the working number, rounded down to plates.
  const topSetFor = (wn: number) => weightForSet(wn, setsForWeek('anchor', 3)[2].pct);
  assertEquals(topSetFor(200), 190);   // what the calendar said before
  assertEquals(topSetFor(180), 170);   // what the stall writes

  // Applied: the event is recorded and the prescription moves.
  const events = calibrationEventsFor(
    [{ ref: 'squat', name: 'Back Squat', byCycle, resetAtCycle, changedCycles: [3] }], 3, NOW,
  );
  assertEquals(events[0].reason, 'reset');
  assertEquals(topSetFor(suppressUndone('squat', 3, byCycle[2].workingNumber, events)), 170);

  // Undone: the same recompute now writes the weight the athlete had before.
  const { events: after } = undoLatestCalibration(events, 'squat', LATER);
  assertEquals(topSetFor(suppressUndone('squat', 3, byCycle[2].workingNumber, after)), 190);

  // ⛔ AND IT STAYS PUT BACK. The engine still computes 180 on every future recompute; the log is
  // what holds the line. Three passes, because one green run is not evidence of stickiness.
  for (let i = 0; i < 3; i += 1) {
    const fresh = workingNumberForCycles(base, 3, true, verdicts as never, { unknownMeans: 'hold' }).workingNumber;
    assertEquals(topSetFor(suppressUndone('squat', 3, fresh, after)), 190, `pass ${i + 1}`);
  }
});

Deno.test('⛔ ACCEPTANCE — an earned step re-lays out, and undo puts it back', () => {
  const base = 200;
  const verdicts = ['advance', 'advance'];
  const walked = [1, 2, 3].map((c) => workingNumberForCycles(base, c, true, verdicts as never, { unknownMeans: 'hold' }));
  const byCycle = walked.map((w, i) => ({ cycle: i + 1, kind: 'leader' as const, workingNumber: w.workingNumber }));
  assertEquals(byCycle.map((b) => b.workingNumber), [200, 210, 220]);

  const events = calibrationEventsFor(
    [{ ref: 'squat', name: 'Back Squat', byCycle, resetAtCycle: null, changedCycles: [2, 3] }], 3, NOW,
  );
  assertEquals(events[0].reason, 'bump');
  assertEquals(events[0].at_cycle, 2);

  // Cycle 2's opening set at 65% of the working number.
  const openerFor = (wn: number) => weightForSet(wn, setsForWeek('leader', 1)[0].pct);
  assertEquals(openerFor(210), 135);
  const { events: after } = undoLatestCalibration(events, 'squat', LATER);
  assertEquals(openerFor(suppressUndone('squat', 2, 210, after)), 130);
});

// ── THE AMBIENT STATUS ──────────────────────────────────────────────────────

Deno.test('⛔ THE PER-LIFT STATUS: climbing · holding · reset, and holding is NOT reset', () => {
  const climbing = walk(90, false, ['advance', 'advance']);
  assertEquals(liftStatus(climbing.byCycle, climbing.resetAtCycle, 2), 'climbing');

  // ⛔ ONE MISS HOLDS, AND THE ROW MUST SAY SO RATHER THAN "reset". p.33 — the free re-try costs the
  // athlete nothing, and a row reporting a penalty the engine did not apply is a lie about the plan.
  const held = walk(90, false, ['miss']);
  assertEquals(liftStatus(held.byCycle, held.resetAtCycle, 2), 'holding');

  const stalled = walk(90, false, ['miss', 'miss']);
  assertEquals(liftStatus(stalled.byCycle, stalled.resetAtCycle, 3), 'reset');

  // ⚠️ CYCLE 1 HAS NOTHING BEHIND IT and reads `climbing` — the block's premise is that the number
  // advances unless something stops it (p.30). Reporting `holding` would tell a brand-new athlete
  // their lift had stalled before they lifted anything.
  assertEquals(liftStatus(climbing.byCycle, null, 1), 'climbing');
});
