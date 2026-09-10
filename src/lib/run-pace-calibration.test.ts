/**
 * ⛔ THE PACE GATE.
 *
 * The failure this guards is a DEAD END: the intake asks "run it faster", the athlete answers, and
 * the server refuses at the Build button because there is no pace on file. That happens the moment
 * `hasPaceBenchmark` and the server's inline check disagree — so the predicate is pinned signal by
 * signal.
 *
 * ⚠️ THE CALIBRATION ARITHMETIC MOVED TO THE SERVER (2026-09-10). Its pins — a swapped pair refused,
 * the 5K clock and score for a typed pace, metric converted before scoring — now live in
 * `supabase/functions/save-baselines/derive.test.ts`, against the formula the plan builder uses.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/run-pace-calibration.test.ts
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { hasPaceBenchmark, parsePaceInput } from './run-pace-calibration.ts';

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

Deno.test('an unparseable pace stays null rather than becoming zero', () => {
  assertEquals(parsePaceInput('0:00'), null);
  assertEquals(parsePaceInput('ten'), null);
  assertEquals(parsePaceInput('8:00'), 480);
});
