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
import { athleticTotals, dateDaysBefore, movingSecondsOf, LONGEST_CREDIBLE_SESSION_H, RECENT_WEEKS, type TotallableWorkout } from './totals.ts';

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
  assertEquals(t.ride.by_year['2026'], { activities: 3, distance_m: 200000, moving_s: 24600, elevation_m: 1800 });
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
  assertEquals(t.ride.by_year['2026'].activities, 1);
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

/**
 * ⛔ THE LADDER. Five places a session's time might be, in two units. Each rung is pinned, because
 * the athlete's own history has rows in three different shapes: current rows with exact seconds in
 * `computed.overall`, rows with `moving_time` in minutes, and rows through late 2025 with
 * `moving_time` NULL and only `duration` / `elapsed_time`.
 */
Deno.test('ladder — exact moving seconds beat the rounded minutes column', () => {
  assertEquals(movingSecondsOf({
    date: '2026-09-19', type: 'ride', moving_time: 90,
    computed: { overall: { duration_s_moving: 5432 } },
  }), 5432);
});

Deno.test('ladder — the minutes column is used when there are no exact seconds', () => {
  assertEquals(movingSecondsOf({ date: '2026-09-19', type: 'ride', moving_time: 90 }), 5400);
});

Deno.test('ladder — an older row with moving_time NULL still counts, off elapsed', () => {
  // The real shape, read from his history: 2025-10-04 ride, duration 117, moving_time null.
  assertEquals(movingSecondsOf({
    date: '2025-10-04', type: 'ride', distance: 51.068, duration: 117, moving_time: null, elapsed_time: 117,
  }), 117 * 60);
});

Deno.test('ladder — duration alone is read as minutes', () => {
  assertEquals(movingSecondsOf({ date: '2025-10-04', type: 'ride', duration: 70 }), 4200);
});

/**
 * ⛔ THE HEURISTIC THIS FILE REFUSES TO COPY. `race-finish-seconds.ts:31-33` reads `duration` as
 * seconds above 120 and minutes below. A three-hour ride is 180 minutes, so that rule would call it
 * 180 seconds. Totals are exactly where that breaks worst, so the cut here is a unit check far out
 * of a real session's range instead.
 */
Deno.test('OURS — a long ride keeps its minutes; only an absurd value is refused as seconds', () => {
  assertEquals(movingSecondsOf({ date: '2026-09-19', type: 'ride', duration: 180 }), 180 * 60);
  const absurd = LONGEST_CREDIBLE_SESSION_H * 60 + 1;
  assertEquals(movingSecondsOf({ date: '2026-09-19', type: 'ride', duration: absurd }), 0);
});

Deno.test('a refused time still counts as an activity, with its distance', () => {
  const t = athleticTotals([{ date: '2026-09-19', type: 'ride', distance: 40, duration: 999_999 }], TODAY);
  assertEquals(t.ride.all_time, { activities: 1, distance_m: 40000, moving_s: 0, elevation_m: 0 });
});

Deno.test('a year of older rows sums to real hours, not zero', () => {
  const t = athleticTotals([
    { date: '2026-01-04', type: 'ride', distance: 51.068, duration: 117, moving_time: null, elapsed_time: 117 },
    { date: '2026-01-02', type: 'ride', distance: 36.003, duration: 85, moving_time: null, elapsed_time: 85 },
  ], TODAY);
  assertEquals(t.ride.by_year['2026'].moving_s, (117 + 85) * 60);
  assertEquals(t.ride.by_year['2026'].moving_s / 3600 > 3, true);
});

/**
 * ⛔ THE YEAR PICKER'S SUBSTRATE (2026-09-20). Strava's My Stats lets the athlete flip the middle
 * block back through earlier years, so the server computes every year and says which exist. The
 * screen picks one; it never sums one.
 */
Deno.test('every year with data gets its own totals, newest first', () => {
  const t = athleticTotals([
    { date: '2026-09-01', type: 'ride', distance: 40, moving_time: 90 },
    { date: '2026-03-01', type: 'ride', distance: 30, moving_time: 60 },
    { date: '2025-07-04', type: 'ride', distance: 100, moving_time: 200 },
  ], TODAY);
  assertEquals(t.ride.years, ['2026', '2025']);
  assertEquals(t.ride.by_year['2026'].activities, 2);
  assertEquals(t.ride.by_year['2026'].distance_m, 70000);
  assertEquals(t.ride.by_year['2025'].activities, 1);
  assertEquals(t.ride.all_time.activities, 3);
});

Deno.test('a year the athlete did not do this sport is never offered', () => {
  const t = athleticTotals([
    { date: '2026-09-01', type: 'ride', distance: 40, moving_time: 90 },
    { date: '2025-07-04', type: 'run', distance: 10, moving_time: 50 },
  ], TODAY);
  assertEquals(t.ride.years, ['2026']);
  assertEquals(t.run.years, ['2025']);
  assertEquals(t.swim.years, []);
  assertEquals(t.swim.by_year, {});
});

Deno.test('the year totals add up to all time', () => {
  const rows = [
    { date: '2026-09-01', type: 'run', distance: 10, moving_time: 50, elevation_gain: 100 },
    { date: '2026-01-02', type: 'run', distance: 21, moving_time: 110, elevation_gain: 200 },
    { date: '2025-11-11', type: 'run', distance: 5, moving_time: 25, elevation_gain: 50 },
  ];
  const t = athleticTotals(rows, TODAY);
  const summed = t.run.years.reduce((a, y) => a + t.run.by_year[y].distance_m, 0);
  assertEquals(summed, t.run.all_time.distance_m);
});
