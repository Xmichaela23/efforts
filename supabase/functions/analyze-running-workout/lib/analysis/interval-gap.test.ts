/**
 * PER-SEGMENT GRADE-ADJUSTED PACE. Run:
 *   deno test --no-check supabase/functions/analyze-running-workout/lib/analysis/interval-gap.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculateIntervalGapPace } from './interval-gap.ts';

/** n one-second samples at a fixed pace, climbing `gainPerSampleM` each second. */
function samples(n: number, paceSecPerMi: number, gainPerSampleM = 0, enriched = false) {
  return Array.from({ length: n }, (_, i) => {
    const s: Record<string, unknown> = {
      elevation_m: 100 + i * gainPerSampleM,
      distance_m: (1609.34 / paceSecPerMi) * i,
    };
    // An ENRICHED sample carries the adjusted pace in `pace_s_per_mi` and the original beside it.
    if (enriched) { s.raw_pace_s_per_mi = paceSecPerMi; s.pace_s_per_mi = paceSecPerMi - 60; }
    else { s.pace_s_per_mi = paceSecPerMi; }
    return s;
  });
}

Deno.test('a climbing segment adjusts FASTER than the raw pace — the hill cost effort', () => {
  const gap = calculateIntervalGapPace(samples(120, 600, 0.05), 0, 119);
  assertEquals(gap !== null, true);
  assertEquals((gap as number) < 600, true, `expected faster than 10:00/mi, got ${gap}`);
});

Deno.test('a flat segment adjusts to about its own pace', () => {
  const gap = calculateIntervalGapPace(samples(120, 600, 0), 0, 119);
  assertEquals(gap !== null, true);
  assertEquals(Math.abs((gap as number) - 600) <= 5, true, `expected ~600, got ${gap}`);
});

Deno.test('⛔ AN ALREADY-ENRICHED SAMPLE IS NOT ADJUSTED TWICE — the raw field wins', () => {
  const onRaw = calculateIntervalGapPace(samples(120, 600, 0.05, false), 0, 119);
  const onEnriched = calculateIntervalGapPace(samples(120, 600, 0.05, true), 0, 119);
  assertEquals(onEnriched, onRaw);
});

Deno.test('⚠️ A SEGMENT TOO SHORT TO GRADE RETURNS NULL — the row keeps raw pace', () => {
  assertEquals(calculateIntervalGapPace(samples(15, 600, 0.05), 0, 14), null);
});

Deno.test('no samples, no indices, no number', () => {
  assertEquals(calculateIntervalGapPace([], 0, 10), null);
  assertEquals(calculateIntervalGapPace(samples(120, 600), undefined, undefined), null);
});
