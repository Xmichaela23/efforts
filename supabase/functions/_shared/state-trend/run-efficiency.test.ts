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

Deno.test('efficiencyIndexToSeries (SECONDARY): steady aerobic + 30–70min band + plausible eff band', () => {
  const series = efficiencyIndexToSeries([
    { metric_date: '2026-06-10', efficiency_index: 1.72, workout_type: 'steady_state', duration_minutes: 45 }, // keep
    { metric_date: '2026-06-12', efficiency_index: 1.85, workout_type: 'steady_state', duration_minutes: 60 }, // keep
    { metric_date: '2026-06-14', efficiency_index: 1.90, workout_type: 'fartlek', duration_minutes: 40 },      // drop (interval)
    { metric_date: '2026-06-16', efficiency_index: 1.80, workout_type: 'steady_state', duration_minutes: 90 }, // drop (>70min, distance confound)
    { metric_date: '2026-06-18', efficiency_index: 1.70, workout_type: 'steady_state', duration_minutes: 20 }, // drop (<30min)
    { metric_date: '2026-06-20', efficiency_index: 0, workout_type: 'steady_state', duration_minutes: 45 },    // drop (corrupt <0.5)
  ]);
  assertEquals(series.map((p) => p.value), [1.72, 1.85]);
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
