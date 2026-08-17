/**
 * D-408 — the AMRAP catch-up. Fixtures, not a device.
 *
 * ⛔ THE TEST THAT MATTERS MOST IS `uses the app's 85%`. Everything else here is arithmetic; that one
 * pins a POLICY, and it is the one a future session is most likely to "fix" by citing the book.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  amrapTrainingMaxCatchUp, catchUpReason, isCatchUpBoundary, extractAmrapSets, liftRefForExercise,
  type AmrapSet,
} from './amrap-catch-up.ts';
import { WORKING_NUMBER_PCT_OF_1RM } from './loading/wendler-531.ts';

const TM = { bench: 130, squat: 170, deadlift: 190, overheadPress: 80 };

Deno.test('nothing is proposed away from a boundary — the formula runs at cycle ends, not mid-block', () => {
  const amraps: AmrapSet[] = [{ lift: 'bench', weight: 150, reps: 12, week: 7 }];
  assertEquals(amrapTrainingMaxCatchUp(amraps, TM, false).length, 0);
  // …and the same input AT a boundary does produce one, so the gate is what differs and not the data.
  assertEquals(amrapTrainingMaxCatchUp(amraps, TM, true).length, 1);
});

Deno.test('⛔ uses the APP\'s 85% working number, never the book\'s 90%', () => {
  // 150 × 12 → 150 × 12 × 0.0333 + 150 = 209.94
  //   at the app's 0.85 → 178.4 → rounds DOWN to 175
  //   at the book's 0.90 → 188.9 → would round to 185
  // The second number is the silent policy change this test exists to prevent: adopting it would
  // ratchet every athlete from an 85% training max to a 90% one under the label "adopt your AMRAP".
  const [p] = amrapTrainingMaxCatchUp([{ lift: 'bench', weight: 150, reps: 12, week: 7 }], TM, true);
  assertEquals(p.estimated1RM, 210);
  assertEquals(p.proposedTm, 175);
  assertEquals(WORKING_NUMBER_PCT_OF_1RM, 0.85, 'the constant moved — this whole module follows it');
});

Deno.test('the best set is chosen BY ESTIMATE, not by weight and not by reps', () => {
  // 185×5 → 215.8 (the heavier bar) beats 150×12 → 209.9 (the longer set). Neither column alone
  // answers it, which is the entire reason Wendler prints the formula (p.32).
  const [p] = amrapTrainingMaxCatchUp([
    { lift: 'squat', weight: 150, reps: 12, week: 3 },
    { lift: 'squat', weight: 185, reps: 5, week: 7 },
  ], TM, true);
  assertEquals(p.from.weight, 185);
  assertEquals(p.from.reps, 5);
  assertEquals(p.estimated1RM, 216);
});

Deno.test('⛔ RAISES ONLY — a modest AMRAP never proposes lowering the working number', () => {
  // 135×5 estimates 157, 85% of which is 130 — below the squat TM of 170. Wendler's reset-on-stall
  // is a different mechanism with a different trigger (FAILED reps); letting this path lower the
  // number would undo the spine's progress after a session the athlete completed.
  assertEquals(amrapTrainingMaxCatchUp([{ lift: 'squat', weight: 135, reps: 5, week: 7 }], TM, true), []);
  // Exactly equal is also silence — there is nothing to adopt.
  const equal = amrapTrainingMaxCatchUp([{ lift: 'overheadPress', weight: 85, reps: 3, week: 7 }],
    { overheadPress: 80 }, true);
  assertEquals(equal.length, 0, `proposed ${equal[0]?.proposedTm} against a TM of 80`);
});

Deno.test('compares against the CURRENT training max, including increments already applied', () => {
  // The same set proposes against a block-start TM and stays silent once the fixed +10/cycle spine
  // has already carried the number past it. Comparing to the STARTING number would re-offer a rise
  // the athlete has already been given.
  const set: AmrapSet[] = [{ lift: 'deadlift', weight: 205, reps: 8, week: 7 }]; // → 259.6, 85% → 220
  assertEquals(amrapTrainingMaxCatchUp(set, { deadlift: 190 }, true).length, 1);
  assertEquals(amrapTrainingMaxCatchUp(set, { deadlift: 220 }, true).length, 0);
});

Deno.test('malformed logs are skipped, never thrown — a bad row cannot break a boundary', () => {
  const junk = [
    { lift: 'bench', weight: 0, reps: 10, week: 7 },
    { lift: 'bench', weight: 150, reps: 0, week: 7 },
    { lift: 'bench', weight: NaN, reps: 5, week: 7 },
    { lift: 'bench', weight: 150, reps: 12, week: 7 },
  ] as AmrapSet[];
  const out = amrapTrainingMaxCatchUp(junk, TM, true);
  assertEquals(out.length, 1);
  assertEquals(out[0].from.reps, 12);
  // And a lift with no training max on file is skipped rather than guessed at (§0h).
  assertEquals(amrapTrainingMaxCatchUp(junk, { squat: 170 }, true), []);
});

Deno.test('empty and absent inputs are silence, not an error', () => {
  assertEquals(amrapTrainingMaxCatchUp([], TM, true), []);
  assertEquals(amrapTrainingMaxCatchUp(null, TM, true), []);
  assertEquals(amrapTrainingMaxCatchUp([{ lift: 'bench', weight: 150, reps: 12, week: 7 }], null, true), []);
});

Deno.test('the copy names the evidence, not a verdict', () => {
  const [p] = amrapTrainingMaxCatchUp([{ lift: 'bench', weight: 150, reps: 12, week: 7 }], TM, true);
  const line = catchUpReason(p);
  assertEquals(line.includes('150 × 12'), true, 'must show the set the athlete actually did');
  assertEquals(line.includes('130 → 175'), true, 'must show both working numbers');
  for (const banned of ['you should', 'need to', 'must ', 'great', 'crushed']) {
    assertEquals(line.toLowerCase().includes(banned), false, `banned: ${banned}`);
  }
});

Deno.test('proposals are ordered by how far the working number has drifted', () => {
  const out = amrapTrainingMaxCatchUp([
    { lift: 'bench', weight: 150, reps: 12, week: 7 },   // 130 → 175, gap 45
    { lift: 'overheadPress', weight: 95, reps: 6, week: 7 }, // 80 → 90, gap 10
  ], TM, true);
  assertEquals(out.map((p) => p.lift), ['bench', 'overheadPress']);
});

// ── The boundary gate and the extractor ─────────────────────────────────────────────────────────

Deno.test('⛔ THE BOUNDARY IS A STANDALONE WEEK, READ OFF THE MAP — never week % 4', () => {
  // ⛔⛔ SUPERSEDES 'the boundary is week 4 of every cycle' (2026-08-15, §1c). A cycle is three weeks
  // now, so the old modulo would have fired on weeks 3, 6, 9 and 12 — week 3 is mid-leader and week
  // 9 is the anchor's OPENING week. The seams of a 12-week block are weeks 1, 8 and 12.
  // ⛔ THE SEAMS MOVED AGAIN 2026-08-16: a light week after EVERY cycle and no opening test, so a
  // 12-week block's standalone weeks are 4, 8 and 12.
  for (const w of [4, 8, 12]) assertEquals(isCatchUpBoundary(w, 12), true, `week ${w}`);
  for (const w of [1, 2, 3, 5, 6, 7, 9, 10, 11]) assertEquals(isCatchUpBoundary(w, 12), false, `week ${w}`);
  // ⛔ AN UNKNOWN BLOCK LENGTH IS `false`. The layout depends on the leader/anchor split, so a week
  // number alone cannot answer — and silence costs an offer, never a wrong number.
  assertEquals(isCatchUpBoundary(8), false, 'no block length → no boundary');
  // ⛔ `0 % 4 === 0`. An unknown current-week must not read as a boundary and offer a training-max
  // change to an athlete who has not lifted yet.
  for (const w of [0, -4, null, undefined, NaN]) {
    assertEquals(isCatchUpBoundary(w as never, 12), false, `week ${w}`);
  }
});

Deno.test('the extractor takes the FLAGGED, COMPLETED set — never the heaviest', () => {
  const rows = [{
    week_number: 7,
    strength_exercises: [{
      name: 'Bench Press',
      sets: [
        // Heavier, but not the AMRAP. Inferring "heaviest" would promote this into a measurement.
        { weight: 200, reps: 3, completed: true, amrap: false },
        { weight: 150, reps: 12, completed: true, amrap: true },
        // Flagged but abandoned — whatever the prefill left behind is not something anyone lifted.
        { weight: 150, reps: 8, completed: false, amrap: true },
      ],
    }],
  }];
  const sets = extractAmrapSets(rows, liftRefForExercise);
  assertEquals(sets.length, 1);
  assertEquals(sets[0], { lift: 'bench', weight: 150, reps: 12, week: 7 });
});

Deno.test('the extractor ignores movements that are not one of the four main lifts', () => {
  const rows = [{
    week_number: 7,
    strength_exercises: [
      { name: 'Close Grip Bench Press', sets: [{ weight: 120, reps: 10, completed: true, amrap: true }] },
      { name: 'Romanian Deadlift', sets: [{ weight: 150, reps: 10, completed: true, amrap: true }] },
      { name: 'Dumbbell Shoulder Press', sets: [{ weight: 40, reps: 10, completed: true, amrap: true }] },
      { name: 'Front Squat', sets: [{ weight: 150, reps: 10, completed: true, amrap: true }] },
    ],
  }];
  assertEquals(extractAmrapSets(rows, liftRefForExercise), []);
});

Deno.test('the extractor survives junk rows without throwing', () => {
  assertEquals(extractAmrapSets(null, liftRefForExercise), []);
  assertEquals(extractAmrapSets([{}, { strength_exercises: 'nope' } as never], liftRefForExercise), []);
});

Deno.test('END TO END — stored workouts at a boundary become proposals', () => {
  const rows = [
    { week_number: 3, strength_exercises: [{ name: 'Back Squat', sets: [{ weight: 160, reps: 8, completed: true, amrap: true }] }] },
    { week_number: 7, strength_exercises: [{ name: 'Back Squat', sets: [{ weight: 185, reps: 9, completed: true, amrap: true }] }] },
    { week_number: 7, strength_exercises: [{ name: 'Bench Press', sets: [{ weight: 150, reps: 12, completed: true, amrap: true }] }] },
  ];
  const sets = extractAmrapSets(rows, liftRefForExercise);
  const tm = { bench: 130, squat: 170, deadlift: 190, overheadPress: 80 };
  assertEquals(isCatchUpBoundary(8, 12), true);
  const out = amrapTrainingMaxCatchUp(sets, tm, isCatchUpBoundary(8, 12));
  // ⚠️ BENCH FIRST, and the first draft of this line had it backwards. Squat moves further in
  // absolute pounds (170 → 200) but bench has drifted further from what the athlete can actually do
  // (130 → 175, a 45 lb gap vs 30). The sort is by GAP, which is the number that says how stale the
  // working weight is — not by the size of the lift.
  assertEquals(out.map((p) => [p.lift, p.currentTm, p.proposedTm]), [['bench', 130, 175], ['squat', 170, 200]]);
  // …and the same block one week earlier offers nothing.
  assertEquals(amrapTrainingMaxCatchUp(sets, tm, isCatchUpBoundary(7, 12)).length, 0);
});

// ── The WIRED path — what adapt-plan does, without adapt-plan ────────────────────────────────────

Deno.test('WIRED — the apply path recomputes and cannot be driven by a posted number', () => {
  // ⛔ WHAT THIS PINS: `acceptSuggestion` takes only WHICH lift from the tap. It re-runs this same
  // function server-side to get the value. So a stale card — or anything else posting to the
  // endpoint — cannot write an arbitrary training max, because no number crosses the wire.
  const rows = [
    { week_number: 7, strength_exercises: [{ name: 'Bench Press', sets: [{ weight: 150, reps: 12, completed: true, amrap: true }] }] },
  ];
  const tm = { bench: 130, squat: 170, deadlift: 190, overheadPress: 80 };
  const liftKey = ({ str_tm_bench: 'bench' } as Record<string, string>)['str_tm_bench'];

  const recompute = (currentWeek: number, trainingMax: typeof tm) =>
    amrapTrainingMaxCatchUp(
      extractAmrapSets(rows, liftRefForExercise), trainingMax, isCatchUpBoundary(currentWeek, 12),
    ).find((p) => p.lift === liftKey);

  // At the boundary the offer resolves and the config write would be this one key only.
  const p = recompute(8, tm)!;
  assertEquals(p.proposedTm, 175);
  const nextTm = { ...tm, [liftKey]: p.proposedTm };
  assertEquals(nextTm, { bench: 175, squat: 170, deadlift: 190, overheadPress: 80 });

  // ⚠️ THE WEEK ROLLED OVER WHILE THE CARD SAT ON SCREEN → the apply re-checks and finds nothing.
  assertEquals(recompute(9, tm), undefined);

  // ⚠️ ALREADY ADOPTED → the second tap is a no-op, not a second rise. This is what makes the apply
  // idempotent without needing a "consumed" flag anywhere.
  assertEquals(recompute(8, nextTm as typeof tm), undefined);
});
