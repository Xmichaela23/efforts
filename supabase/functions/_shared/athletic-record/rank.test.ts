/**
 * Run: ~/.deno/bin/deno test supabase/functions/_shared/athletic-record/rank.test.ts --no-check
 *
 * Standings with a KNOWN answer: the ordering, the tie-break, the top-three cut, and the duplicate
 * collapse that job zero forced (docs/WORKORDER-record-store-2026-09-20.md).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rankAthleticRecords, RANKS_KEPT, type RankableWorkout } from './rank.ts';

const run = (id: string, date: string, fiveK: number, extra: Partial<RankableWorkout> = {}): RankableWorkout => ({
  id, date, name: `Run ${id}`, type: 'run',
  computed: { run_records: { '5k': { elapsed_s: fiveK } } },
  ...extra,
});

Deno.test('a faster time ranks first, and only three are kept', () => {
  const s = rankAthleticRecords([
    run('a', '2026-09-01', 1300),
    run('b', '2026-09-02', 1200),
    run('c', '2026-09-03', 1250),
    run('d', '2026-09-04', 1400),
  ]);
  assertEquals(s.run.distances['5k'].map((e) => [e.rank, e.value, e.workout_id]), [
    [1, 1200, 'b'], [2, 1250, 'c'], [3, 1300, 'a'],
  ]);
  assertEquals(s.run.distances['5k'].length, RANKS_KEPT);
});

Deno.test('OURS — two equal times: the earlier date is ranked first', () => {
  const s = rankAthleticRecords([
    run('later', '2026-09-10', 1200),
    run('earlier', '2026-08-01', 1200),
  ]);
  assertEquals(s.run.distances['5k'].map((e) => e.workout_id), ['earlier', 'later']);
});

/**
 * ⛔ JOB ZERO'S SYMPTOM. The same run is in the table twice with identical numbers. Without the
 * collapse the card would print "1st 20:00, 2nd 20:00" off one run and push the real second place
 * into third.
 */
Deno.test('OURS — a duplicated row does not take two places', () => {
  const s = rankAthleticRecords([
    run('real', '2026-09-01', 1200),
    run('twin', '2026-09-01', 1200),
    run('second', '2026-09-05', 1250),
    run('third', '2026-09-06', 1300),
  ]);
  assertEquals(s.run.distances['5k'].map((e) => [e.rank, e.value]), [[1, 1200], [2, 1250], [3, 1300]]);
});

Deno.test('the same time on two different days is two real efforts, not a duplicate', () => {
  const s = rankAthleticRecords([
    run('mon', '2026-09-01', 1200),
    run('tue', '2026-09-02', 1200),
  ]);
  assertEquals(s.run.distances['5k'].map((e) => e.workout_id), ['mon', 'tue']);
});

Deno.test('a distance nobody has run is absent, never an empty row', () => {
  const s = rankAthleticRecords([run('a', '2026-09-01', 1200)]);
  assertEquals(Object.keys(s.run.distances), ['5k']);
  assertEquals(s.ride.distances, {});
  assertEquals(s.ride.power, {});
});

Deno.test('a run never ranks against a ride', () => {
  const s = rankAthleticRecords([
    run('r', '2026-09-01', 1200),
    { id: 'bike', date: '2026-09-02', name: 'Ride', type: 'ride', computed: { ride_records: { '10k': { elapsed_s: 1000 } } } },
  ]);
  assertEquals(Object.keys(s.run.distances), ['5k']);
  assertEquals(Object.keys(s.ride.distances), ['10k']);
});

Deno.test('power ranks the other way — more watts wins — and _hr is not a duration', () => {
  const s = rankAthleticRecords([
    { id: 'a', date: '2026-09-01', type: 'ride', computed: { power_curve: { '20min': 240, _hr: { '20min': 160 } } } },
    { id: 'b', date: '2026-09-02', type: 'ride', computed: { power_curve: { '20min': 260 } } },
  ]);
  assertEquals(Object.keys(s.ride.power), ['20min']);
  assertEquals(s.ride.power['20min'].map((e) => [e.rank, e.value]), [[1, 260], [2, 240]]);
});

/**
 * FIELD — longest run and longest ride are measured BY DISTANCE (Garmin's "farthest distance run";
 * Strava's "longest ride"). The card today picks the longest ride by TIME, which is neither rule.
 */
Deno.test('longest is by distance, in metres, and biggest climb is elevation gain', () => {
  const s = rankAthleticRecords([
    { id: 'short-slow', date: '2026-09-01', type: 'ride', distance: 30, elevation_gain: 900 },
    { id: 'long-fast', date: '2026-09-02', type: 'ride', distance: 120, elevation_gain: 200 },
  ]);
  assertEquals(s.ride.longest[0].workout_id, 'long-fast');
  assertEquals(s.ride.longest[0].value, 120000);
  assertEquals(s.ride.biggest_climb[0].workout_id, 'short-slow');
  assertEquals(s.ride.biggest_climb[0].value, 900);
});

Deno.test('a row with nothing measured on it contributes nothing', () => {
  const s = rankAthleticRecords([
    { id: 'manual', date: '2026-09-01', type: 'run' },
    { id: 'zero', date: '2026-09-02', type: 'run', distance: 0, computed: { run_records: { '5k': { elapsed_s: 0 } } } },
  ]);
  assertEquals(s.run.distances, {});
  assertEquals(s.run.longest, []);
});

Deno.test('the same rows twice give the same standings — it is deterministic', () => {
  const rows = [run('a', '2026-09-01', 1300), run('b', '2026-09-02', 1200), run('c', '2026-09-03', 1250)];
  assertEquals(JSON.stringify(rankAthleticRecords(rows)), JSON.stringify(rankAthleticRecords([...rows].reverse())));
});
