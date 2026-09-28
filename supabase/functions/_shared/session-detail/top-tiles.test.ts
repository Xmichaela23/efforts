/**
 * ⛔ THE PERFORMANCE TOP CARD'S BIG NUMBERS (2026-09-27, Michael, "go"; two lines and one time, 2026-09-28).
 *
 *   ~/.deno/bin/deno test -A --no-check --sloppy-imports supabase/functions/_shared/session-detail/top-tiles.test.ts
 *
 * TrainingPeaks' order (2026-09-28). Ride: Moving Time · Distance · Workload, then Weighted Power · Elevation · Avg Heart
 * Rate. Run: Moving Time · Distance · Workload, then Pace · Elevation · Avg Heart Rate. Each value a string the server already wrote; a tile with no value is left out.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { movingTimeRow, sessionTopTiles } from './top-tiles.ts';
import { buildSessionDetailV1 } from './build.ts';
import type { SessionTimeRow } from './session-times.ts';

const times: SessionTimeRow[] = [
  { key: 'time', label: 'Time', seconds: 8109, display: '2:15:09' },
  { key: 'moving', label: 'Moving Time', seconds: 8000, display: '2:13:20' },
  { key: 'elapsed', label: 'Elapsed Time', seconds: 8636, display: '2:23:56' },
];
const totals = {
  distance_display: '38.2 mi', elevation_display: '1398 ft', weighted_power_display: '182 W', avg_pace_display: '9:41/mi',
};
const sd = { completed_totals: totals, load: { workload: 87 } };
const view = (lines: ReturnType<typeof sessionTopTiles>) => lines?.map((l) => l.map((t) => `${t.label}=${t.display}`));

Deno.test('⛔ a ride: Moving Time · Distance · Workload, then Weighted Power · Elevation · Avg Heart Rate', () => {
  assertEquals(view(sessionTopTiles('ride', sd, times, 141)), [
    ['Moving Time=2:13:20', 'Distance=38.2 mi', 'Workload=87'],
    ['Weighted Power=182 W', 'Elevation=1398 ft', 'Avg Heart Rate=141 bpm'],
  ]);
});

Deno.test('⛔ a run: Moving Time · Distance · Workload, then Pace · Elevation · Avg Heart Rate', () => {
  assertEquals(view(sessionTopTiles('run', sd, times, 152)), [
    ['Moving Time=2:13:20', 'Distance=38.2 mi', 'Workload=87'],
    ['Pace=9:41/mi', 'Elevation=1398 ft', 'Avg Heart Rate=152 bpm'],
  ]);
});

Deno.test('no workload stored: no Workload tile', () => {
  assertEquals(view(sessionTopTiles('run', { completed_totals: totals, load: null }, times, 152))?.[0], ['Moving Time=2:13:20', 'Distance=38.2 mi']);
});

Deno.test('⛔ one time: no Time and no Elapsed Time tile, ever', () => {
  const keys = sessionTopTiles('ride', sd, times, 141)!.flat().map((t) => t.key);
  assertEquals(keys.filter((k) => (k as string) === 'time' || (k as string) === 'elapsed'), []);
});

Deno.test('a tile with no value is left out, and a line with none left goes: an indoor ride, no power, no device HR', () => {
  const indoor = { completed_totals: { distance_display: '20.0 mi', elevation_display: null, weighted_power_display: null } };
  assertEquals(view(sessionTopTiles('ride', indoor, times, null)), [['Moving Time=2:13:20', 'Distance=20.0 mi']]);
});

Deno.test('no Moving Time row sent (a device file): no time tile at all', () => {
  const fit = times.filter((r) => r.key !== 'moving');
  assertEquals(view(sessionTopTiles('ride', sd, fit, 141))?.[0], ['Distance=38.2 mi', 'Workload=87']);
});

Deno.test('every other sport gets no big numbers', () => {
  for (const t of ['swim', 'strength', 'walk', 'mobility']) assertEquals(sessionTopTiles(t, sd, times, 141), null);
});

Deno.test('the one time is the Moving Time row; none when the source sent none', () => {
  assertEquals(movingTimeRow(times)?.display, '2:13:20');
  assertEquals(movingTimeRow(times.filter((r) => r.key !== 'moving')), null);
  assertEquals(movingTimeRow(null), null);
});

function built(type: string, power: Record<string, unknown> | null) {
  return buildSessionDetailV1({
    workoutId: 'w1', workoutDate: '2026-09-26', workoutType: type, workoutName: 'x', ledgerDay: null,
    actualSession: null, match: null, plannedSession: null, plannedRowRaw: null,
    completedRow: { type }, observations: [],
    workoutAnalysis: { fact_packet_v1: { facts: {}, derived: {} } },
    completedComputed: power ? { analysis: { power } } : {},
    athleteMetric: false,
  } as any);
}

Deno.test('⛔ Weighted Power is the stored normalized power (the device\'s first), whole watts, rides only', () => {
  assertEquals(built('ride', { normalized_power: 181.6 }).completed_totals.weighted_power_display, '182 W');
  assertEquals(built('ride', null).completed_totals.weighted_power_display, null);
  assertEquals(built('run', { normalized_power: 250 }).completed_totals.weighted_power_display, null);
});
