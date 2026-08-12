/**
 * S2 — the cached spine now carries the full State DISPLAY contract (state_trends_v1.display) so the
 * client renders it instead of recomputing in the browser. This proves the cached display block equals
 * what the rich assembly produced — the structural-equality guarantee, now persisted (not re-derived).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/state-trend/state-display.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type StateTrendInputs, type ExerciseLogLite } from './assemble.ts';

const AS_OF = '2026-07-03';
const WEEKS = ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01'];

function inputs(): StateTrendInputs {
  const exerciseRows: ExerciseLogLite[] = [
    ...WEEKS.map((d, i) => ({ date: d, canonical_name: 'bench_press', exercise_name: 'Bench Press', estimated_1rm: 200 + i * 8 })),
    ...WEEKS.map((d, i) => ({ date: d, canonical_name: 'squat', exercise_name: 'Squat', estimated_1rm: 320 - i * 8 })),
  ];
  return {
    asOf: AS_OF,
    exerciseRows,
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 },
    doneBy: { strength: 3 },
    cadenceCounts: { strength: 24, run: 6 },
  };
}

Deno.test('S2: toStateTrendsV1 carries a display block that mirrors the rich assembly', () => {
  const result = assembleStateTrends(inputs());
  const v1 = toStateTrendsV1(result, AS_OF);

  assert(v1.display, 'display block present');
  // the display contract is the SAME objects the hook returned — not a re-derivation
  assertEquals(v1.display!.cards, result.cards);
  assertEquals(v1.display!.strengthFitness, result.strengthFitness);
  assertEquals(v1.display!.bikeFitness, result.bikeFitness);
  assertEquals(v1.display!.runFitness, result.runFitness);
  assertEquals(v1.display!.swimRest, result.swimRest);
  assertEquals(v1.display!.cadenceCounts, { strength: 24, run: 6 });
});

Deno.test('S2: display.strengthFitness carries the per-lift breakdown (D-270) for the client', () => {
  const v1 = toStateTrendsV1(assembleStateTrends(inputs()), AS_OF);
  const perLift = v1.display!.strengthFitness.perLift;
  assert(perLift.length >= 2, 'per-lift present in the cached display contract');
  // ⛔ D-420: the per-lift DIRECTION is retired — what the client needs from this contract is the
  // per-lift granularity (which lift, its readings), not a weekly verdict. Both lifts still arrive.
  assert(perLift.some((l) => l.canonical === 'bench_press' && l.latestE1rm != null));
  assert(perLift.some((l) => l.canonical === 'squat' && l.latestE1rm != null));
  assertEquals(new Set(perLift.map((l) => l.direction)), new Set(['needs_data']));
});

Deno.test('S2: the reduced spine verdicts still sit alongside the display block (both cached)', () => {
  const v1 = toStateTrendsV1(assembleStateTrends(inputs()), AS_OF);
  // the existing reduced contract is unchanged — display is purely additive
  assert('strength' in v1 && 'run' in v1 && 'bike' in v1 && 'swim' in v1);
  assertEquals(v1.strength.per_lift, v1.display!.strengthFitness.perLift);
});
