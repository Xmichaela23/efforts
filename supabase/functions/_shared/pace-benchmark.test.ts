/**
 * The pace gate, pinned signal by signal. The create-goal gate and the intake read this one function,
 * so these pins replace the phone copy's (`src/lib/run-pace-calibration.test.ts`).
 *
 * Run: ~/.deno/bin/deno test --no-check --no-lock supabase/functions/_shared/pace-benchmark.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { hasPaceBenchmark } from './pace-benchmark.ts';

Deno.test('each of the four signals is enough on its own', () => {
  assert(hasPaceBenchmark({ effort_source_distance: 5000, effort_source_time: 1400 }), 'race time');
  assert(hasPaceBenchmark({ effort_score: 45 }), 'effort score');
  assert(hasPaceBenchmark({ effort_paces: { race: 480 } }), 'race pace');
  assert(hasPaceBenchmark({ learned_fitness: { run_easy_pace_sec_per_km: { value: 330, confidence: 'medium' } } }), 'learned easy pace');
  assert(hasPaceBenchmark({ learned_fitness: { run_threshold_pace_sec_per_km: { value: 260, confidence: 'high' } } }), 'learned threshold');
});

Deno.test('a learned pace is read from its stored object, not as a bare number', () => {
  // The phone copy wanted a plain number, so the stored shape never counted.
  assertEquals(hasPaceBenchmark({ learned_fitness: { run_threshold_pace_sec_per_km: 260 } }), false);
  // A learned_fitness column that arrives as a JSON string is parsed.
  assert(hasPaceBenchmark({ learned_fitness: JSON.stringify({ run_threshold_pace_sec_per_km: { value: 260, confidence: 'medium' } }) }));
});

Deno.test('false for the blank athlete, a half race time, low confidence and zero values', () => {
  assertEquals(hasPaceBenchmark(null), false);
  assertEquals(hasPaceBenchmark({}), false);
  assertEquals(hasPaceBenchmark({ effort_source_distance: 5000 }), false);
  assertEquals(hasPaceBenchmark({ effort_source_time: 1400 }), false);
  assertEquals(hasPaceBenchmark({ learned_fitness: { run_easy_pace_sec_per_km: { value: 330, confidence: 'low' } } }), false);
  assertEquals(hasPaceBenchmark({ learned_fitness: { run_easy_pace_sec_per_km: { value: 0, confidence: 'high' } } }), false);
  assertEquals(hasPaceBenchmark({ effort_paces: { race: null } }), false);
});
