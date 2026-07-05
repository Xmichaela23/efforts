/**
 * Q-110 — RUN EFFICIENCY (pace-at-HR). The run card's fitness verdict is now same-HR-faster pace
 * (fitter) via `computeRunEfficiencyState` on `run_facts.pace_at_easy_hr`, NOT raw GAP pace
 * ("slower" ≠ "less fit"). Reuses the shared efficiency engine (bike-fitness.ts), run thresholds.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/run-efficiency.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { paceAtHrToSeries, computeRunEfficiencyState } from './run.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

Deno.test('paceAtHrToSeries: comparable-easy + plausible band, reads pace_at_easy_hr', () => {
  const series = paceAtHrToSeries([
    { metric_date: '2026-06-10', pace_at_easy_hr: 330, classified_type: 'easy' },
    { metric_date: '2026-06-25', pace_at_easy_hr: 320, classified_type: 'easy' },
    { metric_date: '2026-06-20', pace_at_easy_hr: 300, classified_type: 'threshold' }, // not comparable → dropped
    { metric_date: '2026-06-22', pace_at_easy_hr: null, classified_type: 'easy' },      // no value → dropped
    { metric_date: '2026-06-23', pace_at_easy_hr: 2280, classified_type: 'easy' },      // corrupt (>750) → dropped
  ]);
  assertEquals(series.map((p) => p.value), [330, 320]);
});

Deno.test('computeRunEfficiencyState: pace-at-HR FALLING → improving (same HR, faster = fitter)', () => {
  const series = [
    { date: '2026-05-25', value: 340 },
    { date: '2026-06-10', value: 325 },
    { date: '2026-06-25', value: 310 },
  ];
  const { trend, metricLabel } = computeRunEfficiencyState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'improving');
  assertEquals(metricLabel, 'pace at HR (efficiency)');
});

Deno.test('computeRunEfficiencyState: pace-at-HR RISING → sliding (losing efficiency)', () => {
  const series = [
    { date: '2026-05-25', value: 310 },
    { date: '2026-06-10', value: 325 },
    { date: '2026-06-25', value: 340 },
  ];
  const { trend } = computeRunEfficiencyState(series, AS_OF, series.length / WEEKS_90D);
  assertEquals(trend.verdict, 'sliding');
});
