import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentRunEasyPace, resolveMeasuredEasyPaceSecPerMi } from './resolve-current-run-pace.ts';

const THR = { run_threshold_pace_accepted: { value: 330, confidence: 'high', sample_count: 3, accepted_at: '2026-09-01' }, run_threshold_pace_sec_per_km: { value: 330, confidence: 'high', sample_count: 3 } };

Deno.test('easy pace (D-478): five easy runs on file do NOT win — the range off threshold does', () => {
  const out = resolveCurrentRunEasyPace({ learned_fitness: { ...THR, run_easy_pace_sec_per_km: { value: 472, confidence: 'high', sample_count: 5, as_of: '2026-09-03' } }, performance_numbers: {} } as never);
  const thrMi = Math.round(330 * 1.609344); // 531
  assertEquals(out.source, 'derived-from-threshold');
  assertEquals(out.is_estimate, true);
  assertEquals(out.range_lo_sec_per_mi, Math.round(thrMi * 1.14));
  assertEquals(out.range_hi_sec_per_mi, Math.round(thrMi * 1.29));
  assertEquals(out.sec_per_mi, Math.round((Math.round(thrMi * 1.14) + Math.round(thrMi * 1.29)) / 2));
});

Deno.test('the measured easy pace is still there for the readers that need a measurement', () => {
  const lf = { learned_fitness: { ...THR, run_easy_pace_sec_per_km: { value: 472, confidence: 'high', sample_count: 5 } } };
  assertEquals(resolveMeasuredEasyPaceSecPerMi(lf as never), Math.round(472 * 1.609344));
});

Deno.test('easy pace: nothing on file → null, never a default', () => {
  const out = resolveCurrentRunEasyPace({ learned_fitness: {}, performance_numbers: {} } as never);
  assertEquals(out.sec_per_mi, null);
  assertEquals(out.range_lo_sec_per_mi ?? null, null);
});
