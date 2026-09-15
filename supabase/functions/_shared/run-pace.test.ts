/**
 * ⛔ RUN PACE — ONE SET OF RULES (2026-09-14). Stops out everywhere, one grade-adjusted pace, a whole run
 * never divided by whole minutes, a failed rep counts, 5.0% drift has reached the line.
 *
 * Run: deno test --no-check --no-lock supabase/functions/_shared/run-pace.test.ts
 */
import { assertEquals, assert, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  driftReachesLine,
  gapSecPerMiBetween,
  metersBetween,
  movingSecondsBetween,
  paceRangeBand,
  paceSecPerMi,
  runGrades,
  runMovingSeconds,
  STOPPED_BELOW_MPS,
} from './run-pace.ts';

/** 1 Hz samples: `speeds` m/s, elevation from `elev(i)`. */
function run(speeds: number[], elev: (i: number) => number = () => 100) {
  let d = 0;
  return speeds.map((v, i) => {
    if (i > 0) d += v;
    return { t: i, d, v, elev: elev(i) };
  });
}

Deno.test('a stop inside a rep does not slow its pace', () => {
  // 60 s at 4 m/s, 30 s stopped at a light, 60 s at 4 m/s.
  const s = run([...Array(61).fill(4), ...Array(30).fill(0), ...Array(60).fill(4)]);
  const last = s.length - 1;
  assertEquals(movingSecondsBetween(s, 0, last), 120);
  assertEquals(metersBetween(s, 0, last), 480);
  assertAlmostEquals(paceSecPerMi(metersBetween(s, 0, last), movingSecondsBetween(s, 0, last))!, 402.3, 0.1);
});

Deno.test('a jump over 60 s between samples is a break, not running', () => {
  const s = [{ t: 0, d: 0, v: 3 }, { t: 10, d: 30, v: 3 }, { t: 200, d: 60, v: 3 }, { t: 210, d: 90, v: 3 }];
  assertEquals(movingSecondsBetween(s, 0, 3), 20);
});

Deno.test('a sample with no speed reads the distance it covered', () => {
  const s = [{ t: 0, d: 0 }, { t: 1, d: 3 }, { t: 2, d: 3 }, { t: 3, d: 6 }];
  assertEquals(movingSecondsBetween(s, 0, 3), 2);
  assert(STOPPED_BELOW_MPS > 0.6 && STOPPED_BELOW_MPS < 0.7);
});

Deno.test('whole run: provider seconds, then provider speed, then the samples — never whole minutes', () => {
  const s = run(Array(100).fill(3));
  assertEquals(runMovingSeconds({ movingSeconds: 2673.4 }, s), 2673);
  // Strava 2026-09-02: 6785 m at 9.14 km/h average moving speed = 2672 s, where the minute column said 2700.
  assertEquals(runMovingSeconds({ avgSpeedMps: 9.14 / 3.6, distanceM: 6785 }, s), 2672);
  assertEquals(runMovingSeconds({}, s), 99);
  assertEquals(runMovingSeconds({}, []), null);
});

Deno.test('grade-adjusted pace equals the pace on flat ground', () => {
  const s = run(Array(200).fill(3), (i) => 100 + (i % 2) * 0.01);
  const pace = paceSecPerMi(metersBetween(s, 0, 199), movingSecondsBetween(s, 0, 199))!;
  // Flat: elevation range under 5 m reads as grade 0 everywhere, so the adjusted pace is the pace.
  assertAlmostEquals(gapSecPerMiBetween(s, runGrades(s), 0, 199, pace)!, pace, 1e-9);
  assertEquals(gapSecPerMiBetween(s, null, 0, 199, pace), null);
  // A zero-grade series with usable elevation elsewhere: the adjusted pace is the pace.
  const grades = new Array(200).fill(0);
  assertAlmostEquals(gapSecPerMiBetween(s, grades, 0, 199, pace)!, pace, 1e-9);
});

Deno.test('uphill reads faster than the pace, downhill slower', () => {
  const up = run(Array(200).fill(3), (i) => 100 + i * 0.3); // 10% grade
  const gUp = runGrades(up)!;
  const paceUp = paceSecPerMi(metersBetween(up, 0, 199), movingSecondsBetween(up, 0, 199))!;
  assert(gapSecPerMiBetween(up, gUp, 0, 199, paceUp)! < paceUp);
  const down = run(Array(200).fill(3), (i) => 200 - i * 0.3);
  const gDown = runGrades(down)!;
  const paceDown = paceSecPerMi(metersBetween(down, 0, 199), movingSecondsBetween(down, 0, 199))!;
  assert(gapSecPerMiBetween(down, gDown, 0, 199, paceDown)! > paceDown);
});

Deno.test('a work rep against its range: the range itself, no allowance', () => {
  assertEquals(paceRangeBand(630, 600, 630), 'in');
  assertEquals(paceRangeBand(631, 600, 630), 'below');
  assertEquals(paceRangeBand(599, 600, 630), 'above');
  assertEquals(paceRangeBand(575, 578, 602), 'above'); // 9:35 against 9:38–10:02 on 2026-09-02 read green before
  assertEquals(paceRangeBand(null, 600, 630), null);
  assertEquals(paceRangeBand(610, 0, 0), null);
});

Deno.test('drift of 5.0% has reached the line (p107 "reaches")', () => {
  assertEquals(driftReachesLine(4.9), false);
  assertEquals(driftReachesLine(5), true);
  assertEquals(driftReachesLine(-2), false);
  assertEquals(driftReachesLine(null), false);
});

Deno.test('grade is read over 100 m, so a few metres of elevation noise is not a hill', () => {
  // Flat 400 m with a 3 m barometer spike lasting 12 m in the middle. A 30-sample window read it as a 20% hill.
  // (a climb later in the run gives it the 5 m of range that counts as usable elevation)
  const s = run(Array(300).fill(3), (i) => (i >= 65 && i <= 68 ? 103 : i > 150 ? 100 + (i - 150) * 0.1 : 100));
  const g = runGrades(s)!;
  const peak = Math.max(...g.slice(40, 95).map(Math.abs));
  assert(peak <= 3.5, `a 3 m spike read as a ${peak.toFixed(1)}% grade`);
  // A real 10% hill still reads about 10% in the middle of it.
  const up = run(Array(200).fill(3), (i) => 100 + i * 0.3);
  const gu = runGrades(up)!;
  assertAlmostEquals(gu[100], 10, 0.5);
});

Deno.test('a flat run with elevation: grade 0, adjusted pace equals pace; no elevation: none', () => {
  const flat = run(Array(300).fill(3), () => 100);
  const g = runGrades(flat)!;
  assert(g != null && g.every((x) => x === 0));
  const pace = paceSecPerMi(metersBetween(flat, 0, 299), movingSecondsBetween(flat, 0, 299))!;
  assertAlmostEquals(gapSecPerMiBetween(flat, g, 0, 299, pace)!, pace, 1e-9);
  const none = flat.map((x) => ({ ...x, elev: null }));
  assertEquals(runGrades(none), null);
});
