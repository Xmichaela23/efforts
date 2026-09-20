/**
 * Run: ~/.deno/bin/deno test supabase/functions/_shared/athletic-record/display.test.ts --no-check
 *
 * The strings the screen prints. Both unit systems, because the athlete's preference decides them
 * and the distance LABEL never does — a record called "5k" prints in miles for an imperial athlete.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { clock, distanceDisplay, elevationDisplay, hoursDisplay, monthDisplay, displayStandings, displayTotals, unitsOf } from './display.ts';
import { rankAthleticRecords } from './rank.ts';
import { athleticTotals } from './totals.ts';

Deno.test('clock drops the hour when there is not one', () => {
  assertEquals(clock(102), '1:42');
  assertEquals(clock(1461), '24:21');
  assertEquals(clock(16887), '4:41:27');
  assertEquals(clock(102.4), '1:42');
});

Deno.test('units come from the athlete, and imperial is the default', () => {
  assertEquals(unitsOf('metric'), 'metric');
  assertEquals(unitsOf('imperial'), 'imperial');
  assertEquals(unitsOf(null), 'imperial');
  assertEquals(unitsOf('Metric'), 'metric');
});

Deno.test('distance and elevation follow the athlete, not the label', () => {
  assertEquals(distanceDisplay(42195, 'imperial'), '26.2 mi');
  assertEquals(distanceDisplay(42195, 'metric'), '42.2 km');
  assertEquals(elevationDisplay(933, 'imperial'), '3,061 ft');
  assertEquals(elevationDisplay(933, 'metric'), '933 m');
});

Deno.test('totals print in hours to one decimal — Michael, 2026-09-20', () => {
  assertEquals(hoursDisplay(590400), '164.0 h');
  assertEquals(hoursDisplay(0), '0.0 h');
});

Deno.test('a date prints as a month, because a record is a month not a timestamp', () => {
  assertEquals(monthDisplay('2026-04-19'), 'April 2026');
  assertEquals(monthDisplay(null), null);
  assertEquals(monthDisplay('nonsense'), null);
});

Deno.test('a standing carries the string the screen prints, and its month', () => {
  const s = displayStandings(rankAthleticRecords([
    { id: 'a', date: '2026-04-19', name: 'City Marathon', type: 'run', computed: { run_records: { marathon: { elapsed_s: 16887 } } } },
    { id: 'b', date: '2026-01-02', type: 'ride', distance: 74.6, elevation_gain: 933 },
  ]), 'imperial');
  assertEquals(s.run.distances.marathon[0].display, '4:41:27');
  assertEquals(s.run.distances.marathon[0].date_display, 'April 2026');
  assertEquals(s.ride.longest[0].display, '46.4 mi');
  assertEquals(s.ride.biggest_climb[0].display, '3,061 ft');
});

Deno.test('totals carry their strings, and "all time" says what it covers', () => {
  const t = displayTotals(athleticTotals([
    { date: '2026-01-04', type: 'ride', distance: 51.068, duration: 117, elapsed_time: 117, elevation_gain: 500 },
    { date: '2025-06-02', type: 'ride', distance: 36.003, duration: 85, elapsed_time: 85, elevation_gain: 300 },
  ], '2026-09-20'), 'imperial');
  assertEquals(t.ride.all_time.distance_display, '54.1 mi');
  assertEquals(t.ride.all_time.time_display, '3.4 h');
  assertEquals(t.ride.all_time.elevation_display, '2,625 ft');
  assertEquals(t.ride.since_display, 'since June 2025');
});

/**
 * ⚠️ THE FOUR-WEEK COLUMN IS AN AVERAGE, so it can be a fraction of an activity. Rounding it to a
 * whole number would print "0 activities" for an athlete who rides three times a month.
 */
Deno.test('a fractional four-week activity count keeps its decimal', () => {
  const t = displayTotals(athleticTotals([
    { date: '2026-09-19', type: 'ride', distance: 40, duration: 90 },
    { date: '2026-09-12', type: 'ride', distance: 40, duration: 90 },
  ], '2026-09-20'), 'imperial');
  assertEquals(t.ride.last_4_weeks.activities_display, '0.5');
  assertEquals(t.ride.all_time.activities_display, '2');
});

Deno.test('a sport with nothing logged still prints strings, not blanks', () => {
  const t = displayTotals(athleticTotals([], '2026-09-20'), 'imperial');
  assertEquals(t.swim.all_time.distance_display, '0.0 mi');
  assertEquals(t.swim.all_time.time_display, '0.0 h');
  assertEquals(t.swim.since_display, null);
});
