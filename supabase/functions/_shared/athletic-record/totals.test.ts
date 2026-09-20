/**
 * Run: ~/.deno/bin/deno test supabase/functions/_shared/athletic-record/totals.test.ts --no-check
 *
 * Periods with a KNOWN answer, and the boundaries in particular: a row on the first day of the year,
 * a row exactly four weeks back, a row dated ahead of today, a planned row.
 *
 * ⚠⚠ `moving_time` on a workout row is MINUTES; the totals come back in SECONDS. Every expected
 * value below is minutes x 60, and that conversion is the point of several of these.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { athleticTotals, dateDaysBefore, RECENT_WEEKS, type TotallableWorkout } from './totals.ts';

const TODAY = '2026-09-20';

const ride = (date: string, km: number, mins: number, elev = 0, extra: Partial<TotallableWorkout> = {}): TotallableWorkout =>
  ({ date, type: 'ride', distance: km, moving_time: mins, elevation_gain: elev, ...extra });

Deno.test('four weeks back is 28 days', () => {
  assertEquals(dateDaysBefore(TODAY, 28), '2026-08-23');
  assertEquals(RECENT_WEEKS, 4);
});

Deno.test('all three periods add up from the same rows', () => {
  const t = athleticTotals([
    ride('2026-09-19', 40, 90, 300),
    ride('2026-09-12', 60, 120, 500),
    ride('2026-05-01', 100, 200, 1000),   // this year, outside four weeks
    ride('2025-11-01', 20, 45, 100),      // last year
  ], TODAY);
  assertEquals(t.ride.all_time, { activities: 4, distance_m: 220000, moving_s: 27300, elevation_m: 1900 });
  assertEquals(t.ride.this_year, { activities: 3, distance_m: 200000, moving_s: 24600, elevation_m: 1800 });
  // 100 km and 210 min in the last four weeks, divided by four.
  assertEquals(t.ride.last_4_weeks, { activities: 0.5, distance_m: 25000, moving_s: 3150, elevation_m: 200 });
  assertEquals(t.ride.since, '2025-11-01');
});

Deno.test('the four-week window is the last 28 days, and the 28th day back is outside it', () => {
  const t = athleticTotals([
    ride('2026-08-24', 10, 30),  // 27 days back — in
    ride('2026-08-23', 10, 30),  // 28 days back — out
  ], TODAY);
  assertEquals(t.ride.last_4_weeks.distance_m, 2500);   // one ride of 10 km ÷ 4
  assertEquals(t.ride.all_time.activities, 2);
});

Deno.test('1 January counts toward this year', () => {
  const t = athleticTotals([ride('2026-01-01', 10, 30), ride('2025-12-31', 10, 30)], TODAY);
  assertEquals(t.ride.this_year.activities, 1);
  assertEquals(t.ride.all_time.activities, 2);
});

Deno.test('a planned row is not something the athlete did', () => {
  const t = athleticTotals([
    ride('2026-09-19', 40, 90, { workout_status: 'completed' } as never),
    ride('2026-09-21', 40, 90, 0, { workout_status: 'planned' }),
  ], TODAY);
  assertEquals(t.ride.all_time.activities, 1);
});

Deno.test('a row dated after today is not counted', () => {
  const t = athleticTotals([ride('2026-09-25', 40, 90)], TODAY);
  assertEquals(t.ride.all_time.activities, 0);
  assertEquals(t.ride.since, null);
});

Deno.test('a sport with nothing logged returns zeroes and no since', () => {
  const t = athleticTotals([ride('2026-09-19', 40, 90)], TODAY);
  assertEquals(t.swim.all_time, { activities: 0, distance_m: 0, moving_s: 0, elevation_m: 0 });
  assertEquals(t.swim.since, null);
  assertEquals(t.run.since, null);
});

Deno.test('sports never mix', () => {
  const t = athleticTotals([
    { date: '2026-09-19', type: 'run', distance: 10, moving_time: 50 },
    { date: '2026-09-18', type: 'cycling', distance: 40, moving_time: 90 },
    { date: '2026-09-17', type: 'swim', distance: 1.5, moving_time: 40 },
    { date: '2026-09-16', type: 'strength', distance: 0, moving_time: 60 },
  ], TODAY);
  assertEquals(t.run.all_time.distance_m, 10000);
  assertEquals(t.ride.all_time.distance_m, 40000);
  assertEquals(t.swim.all_time.distance_m, 1500);
  assertEquals(t.run.all_time.activities + t.ride.all_time.activities + t.swim.all_time.activities, 3);
});

Deno.test('a session with no distance still counts as an activity', () => {
  const t = athleticTotals([{ date: '2026-09-19', type: 'run', moving_time: 40 }], TODAY);
  assertEquals(t.run.all_time, { activities: 1, distance_m: 0, moving_s: 2400, elevation_m: 0 });
});

Deno.test('elapsed time stands in when a row carries no moving time', () => {
  const t = athleticTotals([{ date: '2026-09-19', type: 'run', distance: 10, elapsed_time: 55 }], TODAY);
  assertEquals(t.run.all_time.moving_s, 3300);
});

Deno.test('the same rows in any order give the same totals', () => {
  const rows = [ride('2026-09-19', 40, 90, 300), ride('2026-05-01', 100, 200, 1000), ride('2025-11-01', 20, 45, 100)];
  assertEquals(JSON.stringify(athleticTotals(rows, TODAY)), JSON.stringify(athleticTotals([...rows].reverse(), TODAY)));
});
