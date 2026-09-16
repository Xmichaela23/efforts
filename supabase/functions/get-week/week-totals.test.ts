/**
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/get-week/week-totals.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { doneLines, weekBarTotals } from './week-totals.ts';
import { displayFormat } from '../_shared/display-format.ts';

Deno.test('a finished session counts at its planned length in Planned and its moving time in Done', () => {
  const t = weekBarTotals([
    { type: 'run', status: 'completed', is_executed: true, moving_seconds: 4320, executed: { overall: { distance_m: 12000 } },
      planned: { planned_duration_seconds: 3600, steps: [{ seconds: 3600 }] } },
    { type: 'ride', status: 'planned', planned: { planned_duration_seconds: 3960, steps: [] } },
  ]);
  assertEquals(t.planned_minutes, 60 + 66);
  assertEquals(t.done_minutes, 72);
  assertEquals(t.done_meters, 12000);
  assertEquals(t.planned_meters, 0);
});

Deno.test('an unplanned session is done, not planned; a distance prescription counts as planned metres', () => {
  const t = weekBarTotals([
    { type: 'run', status: 'completed', is_executed: true, moving_seconds: 1800, executed: { overall: { distance_m: 5000 } } },
    { type: 'run', status: 'planned', planned: { planned_duration_seconds: 2400, steps: [{ distanceMeters: 1609.34 }, { distanceMeters: 800 }] } },
  ]);
  assertEquals(t.planned_minutes, 40);
  assertEquals(t.planned_meters, 2409);
  assertEquals(t.done_minutes, 30);
});

Deno.test('lifts are counted, and a completed row with no receipt is not done', () => {
  const t = weekBarTotals([
    { type: 'strength', status: 'completed', is_executed: true, planned: {} },
    { type: 'strength', status: 'planned', planned: {} },
    { type: 'strength', status: 'completed', is_executed: false },
    { type: 'run', status: 'completed', is_executed: false, moving_seconds: 600 },
  ]);
  assertEquals(t.lifts_planned, 2);
  assertEquals(t.lifts_done, 1);
  assertEquals(t.done_minutes, 0);
});

// ⛔ The finished session's words and the bar's distance, printed on the server (2026-09-16, Stage 7 session 1).

Deno.test('the bar prints whole mi / km and hides under 0.05 of the unit', () => {
  const imp = weekBarTotals([
    { type: 'run', is_executed: true, moving_seconds: 1800, executed: { overall: { distance_m: 28968 } } },
  ]);
  assertEquals(imp.done_distance_display, '18 mi');
  assertEquals(imp.planned_distance_display, null);
  const met = weekBarTotals([
    { type: 'run', is_executed: true, moving_seconds: 1800, executed: { overall: { distance_m: 28968 } } },
  ], displayFormat(true));
  assertEquals(met.done_distance_display, '29 km');
  assertEquals(weekBarTotals([{ type: 'run', is_executed: true, executed: { overall: { distance_m: 60 } } }]).done_distance_display, null);
});

Deno.test('a run: the detail distance first, pace, bpm, climb; the headline carries distance and moving time', () => {
  const item = {
    type: 'run', status: 'completed', moving_seconds: 2880,
    executed: { overall: { distance_m: 8000, avg_hr: 150.4, elevation_gain_m: 30 } },
    workout_analysis: { session_detail_v1: { completed_totals: { distance_m: 8046.72, moving_s: 2880, avg_pace_s_per_mi: 576 } } },
  };
  const imp = doneLines(item, displayFormat(false));
  assertEquals(imp.done_metrics, ['5.0 mi', '9:36/mi', '150 bpm', '98 ft']);
  assertEquals(imp.done_distance, '5.0 mi');
  assertEquals(imp.done_headline, '5.0 mi · 48:00');
  const met = doneLines(item, displayFormat(true));
  assertEquals(met.done_metrics, ['8.0 km', '5:58/km', '150 bpm', '30 m']);
});

Deno.test('a ride prints mph with a whole number bare, km/h on metric; a swim prints grouped yards and per-100', () => {
  const ride = { type: 'ride', status: 'completed', moving_seconds: 3600, executed: { overall: { distance_m: 28968.192, avg_speed_mps: 8.04672 } } };
  assertEquals(doneLines(ride, displayFormat(false)).done_metrics, ['18.0 mi', '18 mph']);
  assertEquals(doneLines(ride, displayFormat(true)).done_metrics, ['29.0 km', '29 km/h']);
  const swim = { type: 'swim', status: 'completed', moving_seconds: 1650, executed: { overall: { distance_m: 1508.76 } } };
  const s = doneLines(swim, displayFormat(false));
  assertEquals(s.done_metrics, ['1,650 yd', '1:40 /100yd']);
  assertEquals(s.done_headline, '0.9 mi · 27:30');
});

Deno.test('a lift: grouped weight and the lift count', () => {
  const lift = {
    type: 'strength', status: 'completed', strength_volume_lb: 3725,
    executed: { strength_exercises: [{ sets: [{}] }, { sets: [{}, {}] }, { sets: [{}] }, { sets: [] }] },
  };
  const imp = doneLines(lift, displayFormat(false));
  assertEquals(imp.done_volume, '3,725 lb');
  assertEquals(imp.done_headline, '3,725 lb · 3 lifts');
  assertEquals(doneLines(lift, displayFormat(true)).done_volume, '1,690 kg');
});
