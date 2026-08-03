/**
 * THE ALL-OUT SET — fixtures (Q-254 slice 1).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/strength/all-out-set.test.ts --no-check
 *
 * ⛔ THE FIRST TEST IS THE ONE THAT MATTERS. `bestReps` — "the most reps at the heaviest weight" —
 * is the number State used to reason from, and it comes apart from the AMRAP the moment an athlete
 * adds a heavy single afterwards. `cycle-verdicts.ts` documents that trap and refuses to walk into
 * it; this file pins that THIS reader does not either. It is a permanent regression, not a
 * one-time check: any future edit that reaches for the heaviest set will fail here.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  accumulateBestRepsAtWeight,
  allOutEmptyReason,
  type BestRepsAtWeight,
  lastAllOutByLift,
  readAllOutSets,
  toAllOutPayload,
} from './all-out-set.ts';

Deno.test('⛔ THE GAP-1 TRAP: a heavy single after the AMRAP does not become the reading', () => {
  // A good 5/3/1 session: 225x6 all-out, then a 275 single for fun.
  // `best_weight` = 275 and `best_reps` = 1 — the aggregate that reads as a MISS.
  const reads = readAllOutSets({
    exercises: [{
      name: 'Deadlift',
      sets: [
        { weight: 225, reps: 5 },
        { weight: 225, reps: 6, amrap: true },
        { weight: 275, reps: 1 },
      ],
    }],
    plannedExercises: null,
    bestRepsAtWeight: {},
  });
  assertEquals(reads.length, 1);
  assertEquals(reads[0].weight, 225);
  assertEquals(reads[0].reps, 6);
});

Deno.test('the rep record needs a prior to beat — a null prior is NOT a record', () => {
  const first = readAllOutSets({
    exercises: [{ name: 'Squat', sets: [{ weight: 245, reps: 8, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: {},
  });
  assertEquals(first[0].prior_best_reps_at_weight, null);
  assertEquals(first[0].is_rep_record, false);

  const beaten = readAllOutSets({
    exercises: [{ name: 'Squat', sets: [{ weight: 245, reps: 8, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: { squat: { 245: 6 } },
  });
  assertEquals(beaten[0].prior_best_reps_at_weight, 6);
  assertEquals(beaten[0].is_rep_record, true);

  const tied = readAllOutSets({
    exercises: [{ name: 'Squat', sets: [{ weight: 245, reps: 6, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: { squat: { 245: 6 } },
  });
  assertEquals(tied[0].is_rep_record, false, 'matching your best is not beating it');
});

Deno.test('the record is per WEIGHT — more reps at a lighter weight is not a record at this one', () => {
  const reads = readAllOutSets({
    exercises: [{ name: 'Bench Press', sets: [{ weight: 185, reps: 5, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: { bench_press: { 155: 12, 185: 4 } },
  });
  assertEquals(reads[0].prior_best_reps_at_weight, 4);
  assertEquals(reads[0].is_rep_record, true);
});

Deno.test('the estimate is LABELLED above the ceiling, never capped or hidden', () => {
  const long = readAllOutSets({
    exercises: [{ name: 'Squat', sets: [{ weight: 185, reps: 15, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: {},
  });
  assertEquals(long[0].reps, 15, 'the rep count is reported as performed');
  assertEquals(long[0].estimate_trusted, false);
  assertEquals(long[0].estimate_trusted_max_reps, 8);

  // ⛔ The deadlift's ceiling is LOWER (5, not 8) — every equation underestimates a deadlift 1RM
  // [LeSuer 1997], so the lift name has to travel with the reps.
  const dl = readAllOutSets({
    exercises: [{ name: 'Deadlift', sets: [{ weight: 315, reps: 6, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: {},
  });
  assertEquals(dl[0].estimate_trusted, false);
  assertEquals(dl[0].estimate_trusted_max_reps, 5);
});

Deno.test('no all-out set → nothing, and the reason says which kind of nothing', () => {
  assertEquals(
    readAllOutSets({
      exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 5 }] }],
      plannedExercises: [],
      bestRepsAtWeight: {},
    }).length,
    0,
  );
  assertEquals(
    allOutEmptyReason({ exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 5 }] }], plannedExercises: null }),
    'no_planned_rows',
  );
  assertEquals(
    allOutEmptyReason({ exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 5 }] }], plannedExercises: [] }),
    'session_had_no_all_out_set',
  );
  assertEquals(
    allOutEmptyReason({
      exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 0, amrap: true }] }],
      plannedExercises: [],
    }),
    'no_reps_on_all_out_set',
  );
});

Deno.test('the PLAN can name the all-out set when the logged flag never landed', () => {
  // A session logged from a stale bundle: the right work, no `amrap` marker anywhere.
  const reads = readAllOutSets({
    exercises: [{
      name: 'Barbell Back Squat',
      sets: [{ weight: 225, reps: 5 }, { weight: 245, reps: 3 }, { weight: 265, reps: 7 }],
    }],
    plannedExercises: [{
      name: 'Barbell Back Squat',
      set_plan: [{ amrap: false }, { amrap: false }, { amrap: true }],
    }],
    bestRepsAtWeight: {},
  });
  assertEquals(reads.length, 1);
  assertEquals(reads[0].weight, 265);
  assertEquals(reads[0].reps, 7);
});

Deno.test('⛔ the payload carries no internal grouping key', () => {
  const reads = readAllOutSets({
    exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 5, amrap: true }] }],
    plannedExercises: null,
    bestRepsAtWeight: {},
  });
  assertEquals('canonical' in reads[0], true);
  assertEquals('canonical' in toAllOutPayload(reads)[0], false);
  assertEquals(Object.keys(toAllOutPayload(reads)[0]).sort(), [
    'estimate_trusted',
    'estimate_trusted_max_reps',
    'estimated_1rm',
    'is_rep_record',
    'name',
    'prior_best_reps_at_weight',
    'rep_record_window_sessions',
    'reps',
    'weight',
  ]);
});

Deno.test('accumulate keeps the MOST reps at each weight, and can be scoped', () => {
  const target: BestRepsAtWeight = {};
  accumulateBestRepsAtWeight(target, [
    { name: 'Squat', sets: [{ weight: 225, reps: 5 }, { weight: 225, reps: 8 }, { weight: 225, reps: 3 }] },
    { name: 'Hip Thrust', sets: [{ weight: 185, reps: 12 }] },
  ]);
  assertEquals(target.squat[225], 8);
  assertEquals(target.hip_thrust[185], 12);

  const scoped: BestRepsAtWeight = {};
  accumulateBestRepsAtWeight(scoped, [
    { name: 'Squat', sets: [{ weight: 225, reps: 8 }] },
    { name: 'Hip Thrust', sets: [{ weight: 185, reps: 12 }] },
  ], new Set(['squat']));
  assertEquals(Object.keys(scoped), ['squat']);
});

Deno.test('lastAllOutByLift keeps the NEWEST per lift, judged against what came before it', () => {
  const out = lastAllOutByLift([
    { date: '2026-06-01', exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 5, amrap: true }] }], plannedExercises: null },
    { date: '2026-06-15', exercises: [{ name: 'Bench Press', sets: [{ weight: 165, reps: 9, amrap: true }] }], plannedExercises: null },
    { date: '2026-07-01', exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 8, amrap: true }] }], plannedExercises: null },
  ]);
  assertEquals(out.squat.date, '2026-07-01');
  assertEquals(out.squat.reps, 8);
  assertEquals(out.squat.prior_best_reps_at_weight, 5, 'the June session is history by July');
  assertEquals(out.squat.is_rep_record, true);
  // ⛔ THE CARRY. Bench was last measured in June and nothing since — it keeps its value AND its date.
  assertEquals(out.bench_press.date, '2026-06-15');
  assertEquals(out.bench_press.reps, 9);
});

Deno.test('⛔ a session never sets a record against itself', () => {
  const out = lastAllOutByLift([
    { date: '2026-07-01', exercises: [{ name: 'Squat', sets: [{ weight: 225, reps: 8, amrap: true }] }], plannedExercises: null },
  ]);
  assertEquals(out.squat.prior_best_reps_at_weight, null);
  assertEquals(out.squat.is_rep_record, false);
});

Deno.test('⛔ a lift with NO all-out set in the window is absent — it does not borrow one', () => {
  const out = lastAllOutByLift([
    { date: '2026-07-01', exercises: [
      { name: 'Squat', sets: [{ weight: 225, reps: 8, amrap: true }] },
      // Overhead press: real work, no all-out set. Its `best_reps` here would be 5.
      { name: 'Overhead Press', sets: [{ weight: 105, reps: 5 }, { weight: 105, reps: 5 }] },
    ], plannedExercises: null },
  ]);
  assertEquals(Object.keys(out), ['squat']);
  assertEquals(out.overhead_press, undefined);
});
