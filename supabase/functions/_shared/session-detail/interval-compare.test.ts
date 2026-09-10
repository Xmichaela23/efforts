/**
 * ⛔ THE INTERVAL TABLE'S COLOURS, GOAL-RACE PERCENT AND PACING WORD COME FROM THE BUILD (audit H-D11 / H-D12).
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/session-detail/interval-compare.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { paceBand, powerBand, raceCompare, pacingVariability } from './interval-compare.ts';
import { buildSessionDetailV1 } from './build.ts';

const paceRange = { lower_sec_per_mi: 600, upper_sec_per_mi: 630 };

Deno.test('pace: 5 s either side of the range still reads in', () => {
  assertEquals(paceBand(635, paceRange), 'in');
  assertEquals(paceBand(636, paceRange), 'below');
  assertEquals(paceBand(595, paceRange), 'in');
  assertEquals(paceBand(594, paceRange), 'above');
  assertEquals(paceBand(null, paceRange), null);
  assertEquals(paceBand(610, undefined), null);
});

Deno.test('watts: the range itself — the phone\'s 3% / 5% grace is gone', () => {
  const r = { lower_w: 200, upper_w: 220 };
  assertEquals(powerBand(199, r), 'below'); // the phone read 199 as in (≥ 194)
  assertEquals(powerBand(221, r), 'above'); // the phone read 221 as in (≤ 231)
  assertEquals(powerBand(210, r), 'in');
  assertEquals(powerBand(null, r), null);
});

Deno.test('goal: percent is target ÷ actual, capped at 100, banded 90 / 80', () => {
  assertEquals(raceCompare('goal', 600, 600, 50), { pct: 100, status: 'on' });
  assertEquals(raceCompare('goal', 500, 600, 50), { pct: 100, status: 'on' });
  assertEquals(raceCompare('goal', 700, 600, 50), { pct: 86, status: 'near' });
  assertEquals(raceCompare('goal', 800, 600, 50), { pct: 75, status: 'off' });
});

Deno.test('goal: no goal pace, or no measured pace, keeps the row\'s own percent', () => {
  assertEquals(raceCompare('goal', 600, null, 72), { pct: 72, status: 'off' });
  assertEquals(raceCompare('goal', null, 600, 95), { pct: 95, status: 'on' });
  assertEquals(raceCompare('goal', null, 600, null), { pct: null, status: null });
});

Deno.test('projection: 0.5 s faster reads ahead, 60 s slower reads behind', () => {
  assertEquals(raceCompare('projection', 599, 600, null), { pct: 100, status: 'ahead' });
  assertEquals(raceCompare('projection', 600, 600, null), { pct: 100, status: 'even' });
  assertEquals(raceCompare('projection', 660, 600, null), { pct: 91, status: 'even' });
  assertEquals(raceCompare('projection', 661, 600, null), { pct: 91, status: 'behind' });
  assertEquals(raceCompare('projection', null, 600, 88), { pct: 88, status: 'even' });
});

Deno.test('pacing word from the coefficient of variation, labels word for word', () => {
  assertEquals(pacingVariability(11), { level: 'high', label: 'High pacing variability' });
  assertEquals(pacingVariability(10), { level: 'moderate', label: 'Moderate pacing variability' });
  assertEquals(pacingVariability(7), { level: 'good', label: 'Good pacing' });
  assertEquals(pacingVariability(3), { level: 'excellent', label: 'Excellent pacing' });
  assertEquals(pacingVariability(null), null);
});

function build(type: string, interval: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-10', workoutType: type, workoutName: 'Session',
    ledgerDay: null, actualSession: null, match: null, plannedSession: null,
    plannedRowRaw: null, completedStrengthExercises: null, bodyweightLb: null, observations: [],
    completedComputed: { overall: {} },
    workoutAnalysis: {
      detailed_analysis: { interval_breakdown: { intervals: [interval] } },
      granular_analysis: { pacing_analysis: { pacing_variability: { coefficient_of_variation: 8 } } },
      ...extra,
    },
    narrativeText: null,
  } as any);
}

const runRep = {
  interval_id: 'a', interval_type: 'work', planned_pace_range_lower: 600, planned_pace_range_upper: 630,
  actual_pace_min_per_mi: 10.9, gap_pace_s_per_mi: 620, pace_adherence_percent: 60,
};

Deno.test('the build stamps a planned run rep: raw slower than range, adjusted inside it', () => {
  const sd: any = build('run', runRep);
  assertEquals(sd.intervals[0].executed.actual_pace_sec_per_mi, 654);
  assertEquals(sd.intervals[0].executed.band, 'below');
  assertEquals(sd.intervals[0].executed.gap_band, 'in');
  assertEquals(sd.intervals[0].race_compare, undefined);
  assertEquals(sd.pacing.variability, { level: 'moderate', label: 'Moderate pacing variability' });
});

Deno.test('a goal race gets percents and words, and no band', () => {
  const sd: any = build('run', runRep, {
    session_state_v1: { race: { is_goal_race: true, goal_avg_pace_s_per_mi: 600, fitness_projection_avg_pace_s_per_mi: 640 } },
  });
  assertEquals(sd.intervals[0].executed.band, undefined);
  assertEquals(sd.intervals[0].race_compare, {
    goal: { pct: 92, status: 'on' },
    projection: { pct: 98, status: 'even' },
  });
});

Deno.test('a ride rep is banded on watts', () => {
  const sd: any = build('ride', {
    interval_id: 'b', interval_type: 'work', planned_power_range_lower: 200, planned_power_range_upper: 220,
    avg_power_watts: 199, power_adherence_percent: 99,
  });
  assertEquals(sd.intervals[0].executed.band, 'below');
  assertEquals(sd.intervals[0].executed.gap_band, undefined);
});
