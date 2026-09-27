/**
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/get-week/week-totals.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { doneLines, weekBarTotals } from './week-totals.ts';
import { displayFormat } from '../_shared/display-format.ts';
import { sessionTimeRows } from '../_shared/session-detail/session-times.ts';

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
  // One swim distance on every screen (2026-09-16, Stage 7 session 3): the headline reads yards too.
  assertEquals(s.done_headline, '1,650 yd · 27:30');
  assertEquals(doneLines(swim, displayFormat(true)).done_metrics[0], '1,509 m');
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

Deno.test('the plyo day: its done line counts exercises, and the Week bar does not count it as a lift', () => {
  const plyo = {
    type: 'strength', status: 'completed', is_executed: true, strength_volume_lb: null,
    planned: { tags: ['plyo'] },
    executed: { strength_exercises: [{ sets: [{}] }, { sets: [{}] }, { sets: [{}] }] },
  };
  assertEquals(doneLines(plyo, displayFormat(false)).done_headline, '3 exercises');
  const lift = { type: 'strength', status: 'completed', is_executed: true, planned: { tags: [] } };
  const t = weekBarTotals([plyo, lift]);
  assertEquals(t.lifts_planned, 1);
  assertEquals(t.lifts_done, 1);
});

// ⛔ Today's tiles on a finished ride or run (2026-09-27, Michael, "Go") — `done_tiles`, each value the string another
// screen prints: the done distance, the session-times composer's Moving Time, and the stored detail's Elevation, Pace
// and Execution. Workload, Duration of plan and Drift are not on the card.

/** The stored session detail's strings, as workout-detail writes them (totals v10). */
const storedDetail = (opts: { planned: boolean; execution?: number | null; line?: string | null; elevation?: string | null; pace?: string | null; show?: boolean }) => ({
  plan_context: { planned_id: opts.planned ? 'p1' : null },
  display: { show_adherence_chips: opts.show ?? opts.planned },
  execution: { execution_score: opts.execution ?? null, execution_line: opts.line ?? null },
  completed_totals: {
    distance_m: 16737, elevation_display: opts.elevation ?? null, avg_pace_display: opts.pace ?? null,
    // Performance's own tiles: none of these may reach Today's card.
    duration_minutes: 83,
  },
  load: { workload: 88 },
  classification: { decoupling: { pct: 10.8, basis: 'power', line: '5.8 over the 5% line' } },
});
// A Garmin ride saved after 2026-09-26: its three times have their own keys.
const garminRow = (type: string) => ({ type, source: 'garmin', metrics: { total_timer_time_seconds: 5100, moving_time_seconds: 5001, total_elapsed_time_seconds: 5400 } });
const tilesOf = (item: Record<string, unknown>, metric = false) => doneLines(item, displayFormat(metric)).done_tiles;
const labels = (t: Array<{ label: string }> | null) => t?.map((x) => x.label) ?? null;

Deno.test('⛔ a ride with a plan: Distance · Moving Time · Elevation · Execution, the strings the other screens print', () => {
  const item = {
    type: 'ride', status: 'completed', moving_seconds: 5001, executed: { overall: { distance_m: 16737 } },
    session_times: sessionTimeRows(garminRow('ride')),
    workout_analysis: { session_detail_v1: storedDetail({ planned: true, execution: 71, line: '14 of 17 intervals done', elevation: '1398 ft' }) },
  };
  const t = tilesOf(item);
  assertEquals(t, [
    { key: 'distance', label: 'Distance', display: '10.4 mi' },
    { key: 'moving', label: 'Moving Time', display: '1:23:21' },
    { key: 'elevation', label: 'Elevation', display: '1398 ft' },
    { key: 'execution', label: 'Execution', display: '71%', line: '14 of 17 intervals done' },
  ]);
  // Nothing from Performance's own four: no workload, no minutes of plan, no drift.
  const shown = JSON.stringify(t);
  for (const gone of ['88', '83', '10.8', '5% line']) assertEquals(shown.includes(gone), false, gone);
  // The headline repeats the Distance and Moving Time tiles — the card does not draw it over them.
  assertEquals(doneLines(item, displayFormat(false)).done_headline, '10.4 mi · 1:23:21');
});

Deno.test('a ride with no plan: Distance · Moving Time · Elevation, no Execution', () => {
  const item = {
    type: 'ride', status: 'completed', executed: { overall: { distance_m: 16737 } },
    session_times: sessionTimeRows(garminRow('ride')),
    // The builder nulls the score on an unattached ride (`noVerdict`); a stray one still prints nothing here.
    workout_analysis: { session_detail_v1: storedDetail({ planned: false, execution: 64, elevation: '426 m' }) },
  };
  assertEquals(labels(tilesOf(item, true)), ['Distance', 'Moving Time', 'Elevation']);
  assertEquals(tilesOf(item, true)![0].display, '16.7 km');
});

Deno.test('⛔ a run with a plan: Distance · Pace · Moving Time · Execution', () => {
  const item = {
    type: 'run', status: 'completed', executed: { overall: { distance_m: 8046.72 } },
    session_times: sessionTimeRows({ type: 'run', source: 'strava', metrics: { moving_time_seconds: 2880, elapsed_time_seconds: 3000 } }),
    workout_analysis: { session_detail_v1: storedDetail({ planned: true, execution: 84, line: 'Time in easy HR', pace: '9:36/mi', elevation: '98 ft' }) },
  };
  assertEquals(tilesOf(item), [
    { key: 'distance', label: 'Distance', display: '5.0 mi' },
    { key: 'pace', label: 'Pace', display: '9:36/mi' },
    { key: 'moving', label: 'Moving Time', display: '48:00' },
    { key: 'execution', label: 'Execution', display: '84%', line: 'Time in easy HR' },
  ]);
});

Deno.test('a run with no plan: Distance · Pace · Moving Time', () => {
  const item = {
    type: 'run', status: 'completed', executed: { overall: { distance_m: 8046.72 } },
    session_times: sessionTimeRows({ type: 'run', source: 'strava', metrics: { moving_time_seconds: 2880 } }),
    workout_analysis: { session_detail_v1: storedDetail({ planned: false, pace: '9:36/mi' }) },
  };
  assertEquals(labels(tilesOf(item)), ['Distance', 'Pace', 'Moving Time']);
});

Deno.test('Moving Time is the composer\'s: a Garmin ride saved before 2026-09-26 reads its last sample; a file sends none', () => {
  const old = { type: 'ride', source: 'garmin', metrics: { total_elapsed_time_seconds: 5100 } };
  const item = (times: unknown) => ({ type: 'ride', status: 'completed', executed: { overall: { distance_m: 16737 } }, session_times: times });
  const withTail = tilesOf(item(sessionTimeRows(old, { movingDuration: 4990, clockDuration: 5400 })));
  assertEquals(withTail!.find((t) => t.key === 'moving')?.display, '1:23:10');
  // No sample fetched → no Moving Time tile, never a figure worked out here.
  assertEquals(labels(tilesOf(item(sessionTimeRows(old)))), ['Distance']);
  // A FIT file carries Time and Elapsed Time, not a moving time.
  assertEquals(labels(tilesOf(item(sessionTimeRows({ type: 'ride', source: 'fit', total_timer_time: 5100, total_elapsed_time: 5400 })))), ['Distance']);
});

Deno.test('a goal race hides its adherence tiles, so Today prints no Execution', () => {
  const item = {
    type: 'run', status: 'completed', executed: { overall: { distance_m: 42195 } },
    workout_analysis: { session_detail_v1: storedDetail({ planned: true, execution: 90, pace: '8:01/mi', show: false }) },
  };
  assertEquals(labels(tilesOf(item)), ['Distance', 'Pace']);
});

Deno.test('swims, lifts and walks keep their card — no tiles', () => {
  assertEquals(tilesOf({ type: 'swim', status: 'completed', moving_seconds: 1650, executed: { overall: { distance_m: 1508.76 } } }), null);
  assertEquals(tilesOf({ type: 'strength', status: 'completed', strength_volume_lb: 3725, executed: { strength_exercises: [] } }), null);
  assertEquals(tilesOf({ type: 'walk', status: 'completed', executed: { overall: { distance_m: 3000 } } }), null);
});
