import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentRunEasyPace } from './resolve-current-run-pace.ts';

const THR = { run_threshold_pace_accepted: { value: 330, confidence: 'high', sample_count: 3, accepted_at: '2026-09-01' }, run_threshold_pace_sec_per_km: { value: 330, confidence: 'high', sample_count: 3 } };

Deno.test('easy pace: five easy runs on file → the measured number, from runs, not an estimate', () => {
  const out = resolveCurrentRunEasyPace({ learned_fitness: { ...THR, run_easy_pace_sec_per_km: { value: 472, confidence: 'high', sample_count: 5, as_of: '2026-09-03' } }, performance_numbers: {} } as never);
  assertEquals(out.source, 'learned');
  assertEquals(out.sec_per_mi, Math.round(472 * 1.609344));
  assertEquals(out.is_estimate, false);
  assertEquals(out.sample_count, 5);
});

Deno.test('easy pace: fewer than five easy runs → threshold × 1.19, marked as an estimate', () => {
  const out = resolveCurrentRunEasyPace({ learned_fitness: { ...THR, run_easy_pace_sec_per_km: { value: 472, confidence: 'medium', sample_count: 3 } }, performance_numbers: {} } as never);
  assertEquals(out.source, 'derived-from-threshold');
  assertEquals(out.is_estimate, true);
  assertEquals(out.sec_per_mi, Math.round(Math.round(330 * 1.609344) * 1.19));
});

Deno.test('easy pace: nothing on file → null, never a default', () => {
  const out = resolveCurrentRunEasyPace({ learned_fitness: {}, performance_numbers: {} } as never);
  assertEquals(out.sec_per_mi, null);
});
