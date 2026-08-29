/**
 * Q-110 — RUN EFFICIENCY. The run card's fitness verdict reads `run_facts.efficiency_index`
 * (pace-per-HR ratio, HIGHER = fitter — more speed per heartbeat), NOT raw GAP pace.
 *
 * ⚠️ DIRECTION: efficiency_index is HIGHER-is-better (lowerIsBetter: false) — the OPPOSITE of the
 * originally-wired pace_at_easy_hr (which was null on real data). These fixtures PIN the direction:
 * a rising index reads "improving", a falling index reads "sliding". If a refactor silently inverts
 * lowerIsBetter, these fail — that's the one way this fix goes wrong.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/run-efficiency.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { efficiencyIndexToSeries, computeRunEfficiencyState } from './run.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

Deno.test('⛔⛔ EVERY RUN REACHES THE METRIC — no duration window, at either end', () => {
  /**
   * ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-28 and is rewritten, not deleted, so the
   * reversal stays visible. It pinned a 30–70 minute band and an interval exclusion. Q-295 is now
   * CLOSED AT BOTH ENDS and neither comes back:
   *  - the FLOOR dropped two of every three of this athlete's runs (his week is two 27-minute runs
   *    and one 63-minute session) and TrainingPeaks applies none — *"let's match TrainingPeaks"*;
   *  - the CEILING deleted the long run, which for a marathon athlete IS the session — *"it
   *    shouldn't cap at 70, that's crucial for marathon trainers"*.
   * ⛔ AND THE APP CONTRADICTED ITSELF: the durability row beside this one has always had a floor and
   * NO ceiling, so two numbers on one screen read two different populations of runs.
   */
  const rows = [
    { metric_date: '2026-06-10', efficiency_index: 1.72, workout_type: 'easy', duration_minutes: 45 },
    { metric_date: '2026-06-12', efficiency_index: 1.85, workout_type: 'easy', duration_minutes: 60 },
    { metric_date: '2026-06-18', efficiency_index: 1.70, workout_type: 'easy', duration_minutes: 20 },  // was dropped: under the floor
    { metric_date: '2026-06-20', efficiency_index: 1.66, workout_type: 'easy', duration_minutes: 27 },  // was dropped: under the floor
    { metric_date: '2026-06-22', efficiency_index: 0, workout_type: 'easy', duration_minutes: 45 },     // still dropped: corrupt (<0.5)
  ];
  assertEquals(efficiencyIndexToSeries(rows).map((p) => p.value), [1.72, 1.85, 1.70, 1.66]);
});

Deno.test('⛔⛔ FAST AND LONG SESSIONS ARE GROUPED, NOT DELETED', () => {
  /**
   * ⛔ THE RULE THAT REPLACED EXCLUSION. TrainingPeaks computes Efficiency Factor on every session
   * carrying pace and HR and compares LIKE FOR LIKE by session type. The old build binned anything
   * named interval/tempo/fartlek/threshold/vo2/speed/track/race/surge outright.
   * ⚠️ The long group is the SAME mechanism, not a second one: *"a long run drifts more"* is true,
   * and it is a reason to compare long runs to other long runs — never a reason to delete them.
   */
  const rows = [
    { metric_date: '2026-06-10', efficiency_index: 1.72, workout_type: 'easy', duration_minutes: 45 },
    { metric_date: '2026-06-14', efficiency_index: 1.90, workout_type: 'fartlek', duration_minutes: 40 },
    { metric_date: '2026-06-16', efficiency_index: 1.80, workout_type: 'long', duration_minutes: 130 },
    { metric_date: '2026-06-21', efficiency_index: 1.83, workout_type: 'long', duration_minutes: 145 },
    { metric_date: '2026-06-23', efficiency_index: 1.95, workout_type: 'intervals', duration_minutes: 50 },
  ];
  assertEquals(efficiencyIndexToSeries(rows, 'easy').map((p) => p.value), [1.72]);
  // ⛔ THE 130- AND 145-MINUTE RUNS: deleted by the old ceiling, now their own comparison group.
  assertEquals(efficiencyIndexToSeries(rows, 'long').map((p) => p.value), [1.80, 1.83]);
  // ⛔ AND THE FAST SESSIONS SURVIVE — in their own pool, never mixed into the easy line.
  assertEquals(efficiencyIndexToSeries(rows, 'quality').map((p) => p.value), [1.90, 1.95]);
  // ⚠️ NOTHING WAS LOST: every row lands in exactly one group.
  assertEquals(
    (['easy', 'long', 'quality'] as const).reduce((n, g) => n + efficiencyIndexToSeries(rows, g).length, 0),
    rows.length,
  );
});

// DIRECTION PIN #1 — RISING index = getting fitter.
Deno.test('computeRunEfficiencyState: RISING efficiency_index → improving (more speed per HR)', () => {
  const series = [
    { date: '2026-05-25', value: 1.60 },
    { date: '2026-06-10', value: 1.75 },
    { date: '2026-06-25', value: 1.90 },
  ];
  const { trend, metricLabel } = computeRunEfficiencyState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'improving');
  assertEquals(metricLabel, 'efficiency (pace per HR)');
});

// DIRECTION PIN #2 — FALLING index = losing efficiency (must NOT read "improving").
Deno.test('computeRunEfficiencyState: FALLING efficiency_index → sliding (losing efficiency)', () => {
  const series = [
    { date: '2026-05-25', value: 1.90 },
    { date: '2026-06-10', value: 1.75 },
    { date: '2026-06-25', value: 1.60 },
  ];
  const { trend } = computeRunEfficiencyState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'sliding');
});
