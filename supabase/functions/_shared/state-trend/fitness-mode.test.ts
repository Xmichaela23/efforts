// SLICE 1 — three-mode anchoring: a DOT renders only where a real baseline of the athlete's own exists;
// else TREND-ONLY (arrow + "no baseline set"); swim is FACTS-ONLY. Run: --no-check fitness-mode.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type StateTrendInputs, type ExerciseLogLite } from './assemble.ts';

const AS_OF = '2026-07-03';
const WEEKS = ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01'];

function inputs(extra: Partial<StateTrendInputs> = {}): StateTrendInputs {
  const exerciseRows: ExerciseLogLite[] = WEEKS.map((d, i) => ({ date: d, canonical_name: 'squat', exercise_name: 'Squat', estimated_1rm: 300 + i * 5 }));
  return {
    asOf: AS_OF,
    exerciseRows,
    bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 },
    doneBy: { strength: 3 },
    cadenceCounts: { strength: 24, run: 6 },
    ...extra,
  };
}

Deno.test('no anchors → strength/bike/run TREND-ONLY, swim FACTS-ONLY (no dot without a baseline)', () => {
  const r = assembleStateTrends(inputs());
  assertEquals(r.fitnessMode, { strength: 'trend_only', bike: 'trend_only', run: 'trend_only', swim: 'facts_only' });
});

Deno.test('a real strength baseline upgrades strength to ANCHORED — the dot becomes honest', () => {
  const r = assembleStateTrends(inputs({ strengthBaselines: { squat: 400 } }));
  assertEquals(r.fitnessMode.strength, 'anchored');
  // run has no reference-effort anchor in Slice 1 — stays trend-only regardless.
  assertEquals(r.fitnessMode.run, 'trend_only');
});

Deno.test('run is NEVER anchored in Slice 1 (reference-effort baseline is Slice 2)', () => {
  const r = assembleStateTrends(inputs({ strengthBaselines: { squat: 400 } }));
  assert(r.fitnessMode.run === 'trend_only');
});

Deno.test('the mode map is carried on the cached display contract (coach resolves, client renders)', () => {
  const v1 = toStateTrendsV1(assembleStateTrends(inputs({ strengthBaselines: { squat: 400 } })), AS_OF);
  assertEquals(v1.display!.fitnessMode.strength, 'anchored');
  assertEquals(v1.display!.fitnessMode.swim, 'facts_only');
});
