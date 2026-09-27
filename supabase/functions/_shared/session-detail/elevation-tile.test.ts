/**
 * ⛔ THE ELEVATION TILE (2026-09-27, Michael; "Elevation" is Strava's word).
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/_shared/session-detail/elevation-tile.test.ts
 *
 * `completed_totals.elevation_display` — the provider's total climbing (`workouts.elevation_gain`, metres, passed in
 * as `providerElevationGainM`), composed in the athlete's unit by the formatter the Details tab uses, so the two tabs
 * print one string. Runs and rides; nothing on a swim, a lift or an indoor session, and nothing when the provider sent
 * no climbing. The Conditions rows stop printing the climbing.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSessionDetailV1 } from './build.ts';
import { displayFormat } from '../display-format.ts';

function detail(type: string, opts: { metric?: boolean; elevM?: number | null; indoor?: boolean; facts?: Record<string, unknown> } = {}) {
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-26', workoutType: type, workoutName: 'x', ledgerDay: null,
    actualSession: null, match: null, plannedSession: null,
    plannedRowRaw: opts.indoor ? { tags: ['venue:trainer'] } : null,
    completedRow: { type },
    observations: [],
    workoutAnalysis: { fact_packet_v1: { facts: opts.facts ?? {}, derived: {} } },
    completedComputed: {},
    athleteMetric: opts.metric === true,
    providerElevationGainM: opts.elevM === undefined ? 426 : opts.elevM,
    weatherTempF: 68, weatherTempStartF: 68, weatherTempEndF: 79,
  } as any);
}

Deno.test('⛔ imperial (lb / ft): 426 m of climbing is "1398 ft"', () => {
  assertEquals(detail('ride').completed_totals.elevation_display, '1398 ft');
});

Deno.test('⛔ metric (kg / m): the same climbing is "426 m"', () => {
  assertEquals(detail('ride', { metric: true }).completed_totals.elevation_display, '426 m');
});

Deno.test('the tile prints the string the Details tab prints — one formatter', () => {
  assertEquals(detail('ride').completed_totals.elevation_display, displayFormat(false).elevation(426));
  assertEquals(detail('ride', { metric: true }).completed_totals.elevation_display, displayFormat(true).elevation(426));
});

Deno.test('a run gets the tile too, by the same rule', () => {
  assertEquals(detail('run').completed_totals.elevation_display, '1398 ft');
  assertEquals(detail('run', { metric: true }).completed_totals.elevation_display, '426 m');
});

Deno.test('a swim, a lift, an indoor ride and a ride with no climbing sent get none', () => {
  assertEquals(detail('swim').completed_totals.elevation_display, null);
  assertEquals(detail('strength').completed_totals.elevation_display, null);
  assertEquals(detail('ride', { indoor: true }).completed_totals.elevation_display, null);
  assertEquals(detail('ride', { elevM: null }).completed_totals.elevation_display, null);
  assertEquals(detail('ride', { elevM: 0 }).completed_totals.elevation_display, null);
});

Deno.test('⛔ the ride\'s Conditions row keeps the temperature and loses the climbing', () => {
  const rows = detail('ride').analysis_details.rows;
  assertEquals(rows.filter((r) => r.label === 'Conditions').map((r) => r.value), ['68 → 79°F']);
});

Deno.test('⛔ the run\'s Conditions row loses "Rolling (420 ft gain)" and keeps the weather', () => {
  const facts = {
    terrain_type: 'rolling', elevation_gain_ft: 420,
    weather: { temperature_f: 72, humidity_pct: 64 },
  };
  const rows = detail('run', { facts }).analysis_details.rows;
  assertEquals(rows.filter((r) => r.label === 'Conditions').map((r) => r.value), ['72°F, 64% humidity']);
});
