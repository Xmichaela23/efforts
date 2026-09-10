/**
 * Audit 2026-09-10, item 17 — what the assembly now sends that the State screen used to work out:
 * the folded deadlift slot (H-S18), the since-block creep (H-S19), the spine chart trends (H-B07) and
 * the logged-sets history (H-S20).
 *
 *   ~/.deno/bin/deno test -A --no-check supabase/functions/_shared/state-trend/audit-item17-assembly.test.ts
 */
import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends, toStateTrendsV1, type StateTrendInputs, type ExerciseLogLite } from './assemble.ts';

const AS_OF = '2026-07-03';
const WEEKS = ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27', '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24', '2026-07-01'];

const lift = (canonical: string, name: string, values: number[], dates = WEEKS): ExerciseLogLite[] =>
  values.map((v, i) => ({ date: dates[i], canonical_name: canonical, exercise_name: name, estimated_1rm: v, reps: 3, best_weight: Math.round(v * 0.9), slot_intent: 'ME' }));

function inputs(exerciseRows: ExerciseLogLite[], extra: Partial<StateTrendInputs> = {}): StateTrendInputs {
  return {
    asOf: AS_OF, exerciseRows, bikeRows: [], runJoined: [], swimRows: [],
    plannedBy: { strength: 2 }, doneBy: { strength: 3 }, cadenceCounts: { strength: 24 },
    ...extra,
  };
}

Deno.test('H-S18: the trap bar folds into the deadlift slot before the rows are cached', () => {
  const rows = [
    ...lift('deadlift', 'Deadlift', [200, 205, 210, 215, 220, 225, 230, 235, 240]),
    // the trap bar's two sessions land in the deadlift's last two ISO weeks, lighter
    ...lift('trap_bar_deadlift', 'Trap Bar Deadlift', [150, 160], ['2026-06-26', '2026-07-02']),
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(rows, {
    allTimeBestByLift: { deadlift: { best: 240, count: 9 }, trap_bar_deadlift: { best: 160, count: 2 } },
  })), AS_OF);
  const perLift = v1.display!.strengthFitness.perLift;
  assertEquals(perLift.filter((l) => l.canonical === 'trap_bar_deadlift').length, 0, 'no fifth row');
  const dl = perLift.filter((l) => l.canonical === 'deadlift');
  assertEquals(dl.length, 1);
  assertEquals(dl[0].allTimeCount, 11, 'the variant\'s sessions are summed into the slot — the fold ran');
  assertEquals(dl[0].latestE1rm, 240, 'same ISO week, the heavier reading holds the week');
  assertEquals((dl[0] as Record<string, unknown>).__variantOf, undefined, 'no private marker in the cache');
  assertEquals(v1.strength.per_lift, perLift, 'the flat per_lift block is the same folded rows');
});

Deno.test('H-S19: since-block creep = latest less the lowest block week\'s reading, only after week 1', () => {
  const rows = lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]);
  const weekByDate = Object.fromEntries(WEEKS.map((d, i) => [d, i + 1]));
  const bench = (extra: Partial<StateTrendInputs>) =>
    toStateTrendsV1(assembleStateTrends(inputs(rows, extra)), AS_OF).display!.strengthFitness.perLift.find((l) => l.canonical === 'bench_press')!;
  assertEquals(bench({ weekByDate, planWeekAsOf: 9 }).sinceBlockDelta, 64);
  assertEquals(bench({ weekByDate, planWeekAsOf: 1 }).sinceBlockDelta, null, 'the block is opening');
  assertEquals(bench({ weekByDate }).sinceBlockDelta, null, 'no block week for today');
  assertEquals(bench({ planWeekAsOf: 9 }).sinceBlockDelta, null, 'no reading carries a block week');
});

Deno.test('H-B07: each spine series\' efficiency and drift chart, with the fitted line, rides beside the spine', () => {
  const p = (date: string, efficiency: number, driftPct: number) => ({
    date, hrAvg: 140, durationMin: 45, efficiency, driftPct, driftBasis: 'gap' as const, fadeWithheld: false, keySessionWithin24h: false,
  });
  const spine = [
    { sport: 'run', group: 'aerobic', points: [p('2026-06-01', 1.65, 4), p('2026-06-08', 1.60, 5), p('2026-06-22', 1.50, 6)] },
    { sport: 'ride', group: 'all', points: [p('2026-06-02', 1.9, 3)] },
  ];
  const v1 = toStateTrendsV1(assembleStateTrends(inputs([], { enduranceSpine: spine })), AS_OF);
  assertEquals(v1.display!.enduranceSpine, spine, 'the spine itself is untouched');
  const trends = v1.display!.enduranceSpineTrends!;
  assertEquals(trends.map((t) => [t.sport, t.group]), [['run', 'aerobic'], ['ride', 'all']]);
  assertEquals(trends[0].efficiencyTrend.points.length, 3);
  const f = trends[0].efficiencyTrend.fit;
  assert(!f.tooFew);
  if (!f.tooFew) { assertAlmostEquals(f.start, 1.65, 1e-9); assertAlmostEquals(f.end, 1.5, 1e-9); assertEquals(f.weeks, 3); }
  assertEquals(trends[0].driftTrend.points.map((x) => x.value), [4, 5, 6]);
  assertEquals(trends[1].efficiencyTrend.fit, { tooFew: true, n: 1 });
  const noSpine = toStateTrendsV1(assembleStateTrends(inputs([])), AS_OF);
  assertEquals(noSpine.display!.enduranceSpineTrends, undefined, 'no spine, no trends');
});

Deno.test('H-S20: the display carries the logged-sets history, and an empty list as itself', () => {
  const v1 = toStateTrendsV1(assembleStateTrends(inputs(lift('bench_press', 'Bench Press', [200, 208, 216, 224, 232, 240, 248, 256, 264]))), AS_OF);
  const logged = v1.display!.strengthLoggedLifts!;
  // 8 weeks back from 2026-07-03 is 2026-05-08, so the 2026-05-06 session is outside.
  assertEquals(logged.map((l) => [l.canonical, l.sessions]), [['bench_press', 8]]);
  assertEquals(logged[0].recent.length, 5);
  const empty = toStateTrendsV1(assembleStateTrends(inputs([])), AS_OF);
  assertEquals(empty.display!.strengthLoggedLifts, []);
});
