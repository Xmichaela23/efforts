/**
 * The strength Performance table, built on the server (2026-09-10, audit H-S11–H-S15).
 *
 * Run: ~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/_shared/session-detail/strength-slots.test.ts
 *
 * Pinned, one assertion per decision the phone used to make:
 *   · rows pair through `matchExercises` — "Barbell Back Squat" and "Back Squat" are ONE row;
 *   · a declared swap is one row, named for the trade;
 *   · "not logged" / "not in the plan" (the second only when a plan is attached);
 *   · a rep-total row prints "N of M reps" off TICKED sets only;
 *   · a planned "12-15" stays "12-15" — never a midpoint;
 *   · the RIR line is the analyzer's verdict, and nothing without one;
 *   · the count and the totals, and that the totals equal `strength_volume`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildStrengthSlots } from './strength-slots.ts';
import { buildSessionDetailV1 } from './build.ts';

const done = (reps: number, weight: number, extra: Record<string, unknown> = {}) => ({ reps, weight, completed: true, ...extra });

function slots(planned: any[], completed: any[], adherence: unknown = null) {
  return buildStrengthSlots({
    type: 'strength',
    plannedRowRaw: { strength_exercises: planned },
    completedStrengthExercises: completed,
    strengthVolume: null,
    bodyweightLb: 175,
    exerciseAdherence: adherence,
  });
}

Deno.test('one row when the plan says "Barbell Back Squat" and the log says "Back Squat"', () => {
  const out = slots(
    [{ name: 'Barbell Back Squat', sets: 3, reps: 5, weight: 185 }],
    [{ name: 'Back Squat', sets: [done(5, 185), done(5, 185), done(5, 185)] }],
  );
  assertEquals(out.strength_slots!.length, 1);
  const r = out.strength_slots![0];
  assertEquals([r.status, r.status_label, r.sets_done, r.previous_key], ['done', null, 3, 'squat']);
  assertEquals(out.strength_counts, { exercises_completed: 1, exercises_planned: 1 });
});

Deno.test('a declared swap is one row, and a planned range is printed as written', () => {
  const out = slots(
    [{ name: 'Bulgarian Split Squat', sets: 3, reps: '8-10', weight: 'By feel' }],
    [{ name: 'Hip Thrust', substituted_for: 'Bulgarian Split Squat', sets: [done(10, 135)] }],
  );
  const r = out.strength_slots![0];
  assertEquals([r.status, r.executed_name, r.name], ['swapped', 'Hip Thrust', 'Bulgarian Split Squat']);
  assertEquals(r.planned_sets[0].reps_text, '8-10');
  assertEquals(r.planned_sets[0].reps, undefined);
  assertEquals(r.planned_sets[0].weight_display, 'By feel');
});

Deno.test('"not logged" and "not in the plan"; with no plan, no label and no count', () => {
  const withPlan = slots(
    [{ name: 'Bench Press', sets: 3, reps: 5, weight: 155 }],
    [{ name: 'Barbell Curl', sets: [done(10, 50)] }],
  ).strength_slots!;
  assertEquals(withPlan.map((r) => [r.name, r.status, r.status_label]), [
    ['Bench Press', 'not_logged', 'not logged'],
    ['Barbell Curl', 'unplanned', 'not in the plan'],
  ]);
  const free = slots([], [{ name: 'Barbell Curl', sets: [done(10, 50)] }]);
  assertEquals(free.strength_slots![0].status_label, null);
  assertEquals(free.strength_counts, null);
});

Deno.test('a rep-total row counts ticked sets only — typed-but-unticked and untouched prefills are not sets', () => {
  const out = slots(
    [{ name: 'Chin-ups', reps: '25 total', weight: 'By feel', load_prescribed: false }],
    [{ name: 'Chin-ups', sets: [done(10, 0), done(8, 0), { reps: 6, weight: 0, completed: false }, { reps: 5, weight: 0, prefilled: true }] }],
  );
  const r = out.strength_slots![0];
  assertEquals([r.target_label, r.reps_target, r.reps_done, r.reps_line, r.sets_done], ['25 total · by feel', 25, 18, '18 of 25 reps', 2]);
  assertEquals(r.completed_sets.length, 2);
  assertEquals(out.strength_totals, { sets_completed: 2, reps_completed: 18, volume_lb: 3150 }); // 175 x 18
});

Deno.test('a banded assistance row says the band, not a midpoint', () => {
  const r = slots([{ name: 'Face Pull', sets: 3, reps: '12-15', weight: 'By feel', load_prescribed: false }], []).strength_slots![0];
  assertEquals([r.target_label, r.reps_target, r.reps_line], ['3×12-15 · by feel', null, null]);
});

Deno.test('the RIR line is the analyzer\'s verdict, word for word, and absent without one', () => {
  const adherence = [{ matched: true, executed: { name: 'Back Squat' }, planned: { name: 'Back Squat' }, adherence: { target_rir: 2, avg_rir: 0.5, rir_verdict: 'too_hard' } }];
  const hard = slots([{ name: 'Back Squat', sets: 1, reps: 5, weight: 185 }], [{ name: 'Back Squat', sets: [done(5, 185, { rir: 0 })] }], adherence).strength_slots![0];
  assertEquals([hard.avg_rir, hard.target_rir, hard.rir_concern, hard.rir_line], [0.5, 2, true, 'Going too hard — reduce weight or add reps in reserve']);
  const quiet = slots([{ name: 'Back Squat', sets: 1, reps: 5, weight: 185, target_rir: 2 }], [{ name: 'Back Squat', sets: [done(5, 185, { rir: 0 })] }]).strength_slots![0];
  assertEquals([quiet.avg_rir, quiet.target_rir, quiet.rir_line, quiet.rir_concern], [null, 2, null, false]);
});

Deno.test('the count is slots filled of slots planned', () => {
  const out = slots(
    [{ name: 'Back Squat', sets: 3, reps: 5, weight: 185 }, { name: 'Deadlift', sets: 1, reps: 5, weight: 225 }],
    [{ name: 'Back Squat', sets: [done(5, 185)] }],
  );
  assertEquals(out.strength_counts, { exercises_completed: 1, exercises_planned: 2 });
});

Deno.test('through the builder: the rows and the totals add up to strength_volume', () => {
  const sd = buildSessionDetailV1({
    workoutId: 'w1',
    workoutDate: '2026-09-10',
    workoutType: 'strength',
    workoutName: 'Lower',
    ledgerDay: null,
    actualSession: null,
    match: null,
    plannedSession: null,
    plannedRowRaw: { strength_exercises: [{ name: 'Back Squat', sets: 2, reps: 5, weight: 185 }, { name: 'Chin-ups', reps: '25 total', weight: 'By feel', load_prescribed: false }] },
    completedStrengthExercises: [
      { name: 'Back Squat', sets: [done(5, 185), done(5, 185)] },
      { name: 'Chin-ups', sets: [done(8, 0), done(7, 0)] },
    ],
    bodyweightLb: 175,
    observations: [],
    workoutAnalysis: null,
    narrativeText: null,
  } as any);
  const total = sd.strength_volume!.completed_total_lb;
  assertEquals(sd.strength_totals!.volume_lb, total);
  assertEquals(sd.strength_slots!.reduce((s, r) => s + r.volume_lb, 0), total);
  assertEquals(sd.strength_totals!.sets_completed, 4);
  assertEquals(sd.strength_totals!.reps_completed, 25);
  assert(sd.strength_slots!.every((r) => r.status === 'done'));
  assertEquals(sd.strength_slots![1].reps_line, '15 of 25 reps');
});
