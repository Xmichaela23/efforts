/**
 * D-270 — per-lift e1RM DIRECTION is persisted on the spine (state_trends_v1.strength.per_lift),
 * making the spine the single authority the coach per-lift row reads instead of re-deriving a
 * parallel (dead-fielded) direction from a different table (Q-107 H2). Guarantees under test:
 *   1. per_lift carries each lift's real direction, keyed by canonical, with latestE1rm = last point.
 *   2. per_lift retains granularity the AGGREGATE rolls away — a bench that's improving stays
 *      legible even when the discipline aggregate reads "holding" (the exact fracture-#1 loss).
 *   3. behavior-unchanged: the existing aggregate strength.e1rm is exactly what rollUp produced.
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/state-trend/strength-per-lift.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type StateTrendInputs, type ExerciseLogLite } from './assemble.ts';

const AS_OF = '2026-07-03';

// weekly sessions ~May 1 → Jul 1, all inside the 12wk lift window, ending near AS_OF.
const WEEKS = ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01'];

function lift(canonical: string, name: string, values: number[]): ExerciseLogLite[] {
  return values.map((v, i) => ({ date: WEEKS[i], canonical_name: canonical, exercise_name: name, estimated_1rm: v }));
}

function inputs(exerciseRows: ExerciseLogLite[], allTimeBestByLift?: Record<string, { best: number; count: number }>): StateTrendInputs {
  return {
    asOf: AS_OF,
    exerciseRows,
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 },
    doneBy: { strength: 3 },
    cadenceCounts: { strength: 24 }, // ~1.9/wk → low min-session floor
    allTimeBestByLift,
  };
}

// ── REAL PR frame (2026-07-21): per_lift carries the ALL-TIME best, so a PR is a genuine new 1RM ──────
Deno.test('per_lift carries allTimeBestE1rm/allTimeCount; PR = latest is a new all-time high', () => {
  const rows = lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232]); // 6wk window, latest 232
  // all-history says the real best-ever is 250 → the latest 232 is NOT a PR (only best-of-window).
  const notPr = toStateTrendsV1(assembleStateTrends(inputs(rows, { bench_press: { best: 250, count: 30 } })), AS_OF);
  const bp1 = (notPr.strength.per_lift as any[]).find((l) => l.canonical === 'bench_press');
  assertEquals(bp1.allTimeBestE1rm, 250);
  assertEquals(bp1.allTimeCount, 30);
  assertEquals(bp1.latestE1rm >= bp1.allTimeBestE1rm - 0.5, false); // 232 < 250 → NOT a PR

  // all-history best is 232 (the latest IS the all-time high) → a real PR.
  const isPr = toStateTrendsV1(assembleStateTrends(inputs(rows, { bench_press: { best: 232, count: 30 } })), AS_OF);
  const bp2 = (isPr.strength.per_lift as any[]).find((l) => l.canonical === 'bench_press');
  assertEquals(bp2.latestE1rm >= bp2.allTimeBestE1rm - 0.5, true); // 232 >= 232 → PR

  // no all-history supplied → allTimeBestE1rm null → the client can NEVER flag a PR (no invented records)
  const noData = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);
  const bp3 = (noData.strength.per_lift as any[]).find((l) => l.canonical === 'bench_press');
  assertEquals(bp3.allTimeBestE1rm, null);
  assertEquals(bp3.allTimeCount, 0);
});

Deno.test('D-270: per_lift carries each lift direction + latest e1RM, keyed by canonical', () => {
  const rows = [
    ...lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]), // clearly rising
    ...lift('squat', 'Squat', [320, 312, 304, 296, 288, 280, 272, 264, 256]),            // clearly falling
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);

  const byLift = new Map(v1.strength.per_lift.map((l) => [l.canonical, l]));
  const bench = byLift.get('bench_press')!;
  const squat = byLift.get('squat')!;

  assert(bench, 'bench present in per_lift');
  assertEquals(bench.direction, 'improving');
  assertEquals(bench.latestE1rm, 264); // last point
  assertEquals(bench.isPrimary, true);

  assertEquals(squat.direction, 'sliding');
  assertEquals(squat.latestE1rm, 256);
});

Deno.test('D-270: per_lift retains granularity the aggregate rolls away (the fracture-#1 loss)', () => {
  // bench improving + squat sliding → aggregate rollUp = "holding" (conflicting mix → conservative).
  // Before D-270 the improving bench was INVISIBLE downstream; now it survives on the spine.
  const rows = [
    ...lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]),
    ...lift('squat', 'Squat', [320, 312, 304, 296, 288, 280, 272, 264, 256]),
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);

  // aggregate hides the split...
  assertEquals(v1.strength.e1rm?.verdict, 'holding');
  // ...but per_lift keeps both directions legible — this is what the coach now reads.
  const dirs = new Set(v1.strength.per_lift.map((l) => l.direction));
  assert(dirs.has('improving'), 'improving bench survives the aggregate');
  assert(dirs.has('sliding'), 'sliding squat survives the aggregate');
});

Deno.test('D-270: per_lift primaries roll up to the SAME aggregate (one substrate, no divergence)', () => {
  // both primaries improving → aggregate must also be improving. The per_lift list and the aggregate
  // cannot disagree because they are the same computation (rollUp of these very lifts).
  const rows = [
    ...lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]),
    ...lift('deadlift', 'Deadlift', [300, 312, 324, 336, 348, 360, 372, 384, 396]),
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows)), AS_OF);

  const primaries = v1.strength.per_lift.filter((l) => l.isPrimary && l.direction !== 'needs_data');
  assert(primaries.length >= 2, 'both primaries have a verdict');
  assert(primaries.every((l) => l.direction === 'improving'), 'both primaries improving');
  assertEquals(v1.strength.e1rm?.verdict, 'improving'); // aggregate agrees — single substrate
});
