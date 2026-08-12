// D-417 — a set past the trusted rep ceiling cannot mint the e1RM series (the substrate the records,
// trend, summary number and sparkline all read). The estimate inflates with reps, so an un-gated series
// ranks by rep count, not strength: Michael's 105 lb × 35 read as a 225 "max" over a heavier 120 × 5.
// The set still shows per-set in the logged-sets history; it just can't be a strength reading.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { liftSeriesFromExerciseLog, type ExerciseLogLite } from './assemble.ts';
import { trustedMaxReps } from '../../../../src/lib/estimate-1rm.ts';

Deno.test('trustedMaxReps: deadlift ceiling is 5, everything else 8 (LeSuer bias)', () => {
  assertEquals(trustedMaxReps('deadlift'), 5);
  assertEquals(trustedMaxReps('Barbell Deadlift'), 5);
  assertEquals(trustedMaxReps('squat'), 8);
  assertEquals(trustedMaxReps('bench_press'), 8);
  assertEquals(trustedMaxReps(null), 8);
});

Deno.test('series gate: the rep-out set is dropped; low-rep sets form the series (squat, ceiling 8)', () => {
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-14', canonical_name: 'squat', estimated_1rm: 105, reps: 5 },
    { date: '2026-07-21', canonical_name: 'squat', estimated_1rm: 108, reps: 5 },
    { date: '2026-08-04', canonical_name: 'squat', estimated_1rm: 125, reps: 17 }, // rep-out → excluded
  ];
  const squat = liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'squat')!;
  assertEquals(squat.points.map((p) => p.value), [105, 108]); // the 17-rep 125 never enters the series
});

Deno.test("series gate: Michael's deadlift — the tighter ceiling of 5 kills the 35-rep 225", () => {
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-10', canonical_name: 'deadlift', estimated_1rm: 140, reps: 5 },
    { date: '2026-07-24', canonical_name: 'deadlift', estimated_1rm: 155, reps: 5 }, // 120 × 5, the real read
    { date: '2026-08-01', canonical_name: 'deadlift', estimated_1rm: 225, reps: 35 }, // 105 × 35 → excluded
    { date: '2026-08-07', canonical_name: 'deadlift', estimated_1rm: 200, reps: 25 }, // 110 × 25 → excluded
  ];
  const dl = liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'deadlift')!;
  assertEquals(dl.points.map((p) => p.value), [140, 155]); // ranks by weight now, not reps; no phantom 225
});

Deno.test('series gate: reps UNKNOWN fails open — older rows without the column are kept, never blanked', () => {
  const rows: ExerciseLogLite[] = [
    { date: '2026-07-10', canonical_name: 'squat', estimated_1rm: 100 },
    { date: '2026-07-24', canonical_name: 'squat', estimated_1rm: 110 },
  ];
  const squat = liftSeriesFromExerciseLog(rows).find((s) => s.canonical === 'squat')!;
  assertEquals(squat.points.length, 2);
});
