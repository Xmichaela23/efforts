// ⛔ THE DAY-LEVEL CUT — the regression this file exists for shipped silently on 2026-08-27.
//
// `testDayCutoff` folded the COMPOSED day to lower case and then looked it up with `weekdayOf`,
// which returns `DAY_NAMES` — CAPITALISED. The set never matched, the cutoff came back null, and
// `restateFromTest`'s no-cutoff branch left the whole test week alone. Weeks 2+ never touch that
// branch, so every suite stayed green while week one stayed "By feel" on a real athlete's block.
//
// ⚠️ EVERY FIXTURE HERE FEEDS CAPITALISED DAYS ON PURPOSE. That is the shape the composer emits.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { restateFromTest, testDayCutoff } from './restate.ts';

const COMPOSED = [{
  week: 1,
  sessions: [
    { day: 'Monday', name: 'Test: Upper', type: 'strength', tags: ['standing_plan', 'test_week'],
      strength_exercises: [{ name: 'Bench Press', sets: 3, reps: '1+', weight: 135 }] },
    { day: 'Tuesday', name: 'Test: Lower', type: 'strength', tags: ['standing_plan', 'test_week'],
      strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '1+', weight: 100 }] },
    { day: 'Friday', name: 'DE: Lower', type: 'strength', tags: ['standing_plan', 'column:standard'],
      strength_exercises: [{ name: 'Back Squat', sets: 4, reps: '2-4', weight: 75 }] },
  ],
}];

const PLANNED = [
  { id: 'r1', week_number: 1, date: '2026-08-24', workout_status: 'completed', completed_workout_id: 'c1',
    strength_exercises: [{ name: 'Bench Press', sets: 3, reps: '1+', weight: 135 }] },
  { id: 'r2', week_number: 1, date: '2026-08-25', workout_status: 'completed', completed_workout_id: 'c2',
    strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '1+', weight: 100 }] },
  { id: 'r3', week_number: 1, date: '2026-08-28', workout_status: 'planned', completed_workout_id: null,
    strength_exercises: [{ name: 'Back Squat', sets: 4, reps: '2-4', weight: 'By feel' }] },
];

Deno.test('⛔ THE CUTOFF IS THE LAST TEST DAY, and capitalised days must match', () => {
  assertEquals(testDayCutoff(COMPOSED as never, PLANNED as never, 1), '2026-08-25');
});

Deno.test('⛔ NO TEST SESSIONS MEANS NO CUTOFF — the week is left alone rather than guessed at', () => {
  const noTests = [{ week: 1, sessions: COMPOSED[0].sessions.map((s) => ({ ...s, tags: ['standing_plan'] })) }];
  assertEquals(testDayCutoff(noTests as never, PLANNED as never, 1), null);
});

Deno.test('⛔⛔ THE TEST WEEK\'S LATER DAYS ACTUALLY GET WRITTEN — the regression, end to end', () => {
  const out = restateFromTest({
    composed: COMPOSED as never,
    planned: PLANNED as never,
    afterWeek: 1,
    testDayCutoff: testDayCutoff(COMPOSED as never, PLANNED as never, 1),
  });
  const friday = out.rows.find((r) => r.id === 'r3');
  assertEquals(
    (friday?.strength_exercises as Array<{ weight?: unknown }> | undefined)?.[0]?.weight,
    75,
    'Friday of the test week is unstarted and three days past the test — it must carry the weight',
  );
  // ⛔ AND HISTORY STILL STANDS, per session: neither completed test row is rewritten.
  assertEquals(out.rows.some((r) => r.id === 'r1' || r.id === 'r2'), false);
});
