/**
 * ⛔ THE PACE GATE AND THE CALIBRATION THAT FEEDS IT.
 *
 * The failure this guards is a DEAD END: the intake asks "run it faster", the athlete answers, and
 * the server refuses at the Build button because there is no pace on file. That happens the moment
 * `hasPaceBenchmark` and the server's inline check disagree — so the predicate is pinned signal by
 * signal, and the arithmetic is pinned against the engine the plan is actually built from.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/run-pace-calibration.test.ts
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { hasPaceBenchmark, parsePaceInput, calibrationFromPaces } from './run-pace-calibration.ts';

Deno.test('hasPaceBenchmark accepts each of the server\'s FOUR signals on its own', () => {
  // create-goal…:3295 — any one of these is enough, so the intake must accept any one of them too.
  assert(hasPaceBenchmark({ effort_source_distance: 5000, effort_source_time: 1400 }), 'race time');
  assert(hasPaceBenchmark({ effort_score: 45 }), 'effort score');
  assert(hasPaceBenchmark({ effort_paces: { race: 480 } }), 'threshold/race pace');
  assert(hasPaceBenchmark({ learned_fitness: { run_easy_pace_sec_per_km: 330 } }), 'learned easy pace');
  assert(hasPaceBenchmark({ learned_fitness: { run_threshold_pace_sec_per_km: 260 } }), 'learned threshold');
});

Deno.test('hasPaceBenchmark is false for the blank athlete — and for junk that looks like data', () => {
  assertEquals(hasPaceBenchmark(null), false);
  assertEquals(hasPaceBenchmark({}), false);
  // ⚠️ A HALF-PRESENT RACE TIME IS NOT A RACE TIME. Distance with no time cannot make a score.
  assertEquals(hasPaceBenchmark({ effort_source_distance: 5000 }), false);
  assertEquals(hasPaceBenchmark({ effort_source_time: 1400 }), false);
  // zero/negative learned paces are absences wearing a number's clothes
  assertEquals(hasPaceBenchmark({ learned_fitness: { run_easy_pace_sec_per_km: 0 } }), false);
  assertEquals(hasPaceBenchmark({ effort_paces: { race: null } }), false);
});

Deno.test('a swapped pair is refused, not stored', () => {
  // 5K slower than easy is two numbers in the wrong boxes. Storing it would derive the score from
  // the wrong field and every session in the plan would inherit it.
  assertEquals(calibrationFromPaces({ easyPace: '8:00', fiveKPace: '10:30', isMetric: false }), null);
  assertEquals(calibrationFromPaces({ easyPace: '9:00', fiveKPace: '9:00', isMetric: false }), null);
  // and anything unparseable stays null rather than becoming zero
  assertEquals(calibrationFromPaces({ easyPace: '', fiveKPace: '8:00', isMetric: false }), null);
  assertEquals(calibrationFromPaces({ easyPace: 'ten', fiveKPace: '8:00', isMetric: false }), null);
  assertEquals(parsePaceInput('0:00'), null);
});

Deno.test('a coherent pair produces a score and paces in the right order', () => {
  const r = calibrationFromPaces({ easyPace: '10:00', fiveKPace: '8:00', isMetric: false });
  assert(r, 'a 10:00 easy / 8:00 5K pair should calibrate');
  // 8:00/mi over 5K ≈ 24:51 → mid-40s vDOT. Pinned loosely: the band, not the decimal.
  assert(r!.score > 35 && r!.score < 55, `score ${r!.score} is outside any plausible band for an 8:00 5K`);
  assert(r!.fiveKTimeSec > 1400 && r!.fiveKTimeSec < 1600, `5K time ${r!.fiveKTimeSec}s is wrong for 8:00/mi`);
  // ⛔ THE ORDERING IS THE REAL INVARIANT: easy is slowest, then marathon, threshold, interval.
  // A table edit that scrambles these would hand the plan faster "easy" runs than its intervals.
  const p = r!.paces;
  assert(p.base > p.race && p.race > p.steady && p.steady > p.power && p.power > p.speed,
    `paces out of order: ${JSON.stringify(p)}`);
});

Deno.test('metric input converts before scoring — a km pace is not a mile pace', () => {
  // 5:00/km and 8:03/mi are the same speed; they must not produce wildly different scores.
  const km = calibrationFromPaces({ easyPace: '6:00', fiveKPace: '5:00', isMetric: true });
  const mi = calibrationFromPaces({ easyPace: '9:39', fiveKPace: '8:03', isMetric: false });
  assert(km && mi);
  assert(Math.abs(km!.score - mi!.score) <= 1,
    `metric/imperial disagree: ${km!.score} vs ${mi!.score} — the unit conversion is off`);
});
