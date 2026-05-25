/**
 * Tests for D-039 Fix 1 — pace sample outlier hygiene for CV computation.
 *
 * Run from repo root:
 *   deno test supabase/functions/analyze-running-workout/lib/adherence/granular-pace.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { filterPaceSamplesForCV, PACE_OUTLIER_MAX_SEC_PER_MI } from './granular-pace.ts';

Deno.test('D-039 Fix 1: PACE_OUTLIER_MAX_SEC_PER_MI locked at 1800', () => {
  assertEquals(PACE_OUTLIER_MAX_SEC_PER_MI, 1800);
});

Deno.test('D-039 Fix 1: filters out null/undefined/zero pace samples', () => {
  const samples = [600, null, undefined, 0, 700, -50, 650];
  assertEquals(filterPaceSamplesForCV(samples), [600, 700, 650]);
});

Deno.test('D-039 Fix 1: keeps samples ≤ 1800 sec/mi (real running pace)', () => {
  // 30 min/mi is the boundary; 29:59/mi (1799) should be kept.
  const samples = [480, 600, 1200, 1799, 1800];
  assertEquals(filterPaceSamplesForCV(samples), [480, 600, 1200, 1799, 1800]);
});

Deno.test('D-039 Fix 1: drops samples > 1800 sec/mi (device artifacts / stationary)', () => {
  // The b70658b0/8cbfa389-class outlier: pace samples of 5000-30000 sec/mi
  // from stoplights, water breaks, GPS dropouts. These blow up CV.
  const samples = [600, 650, 5000, 700, 30000, 680, 99999];
  assertEquals(filterPaceSamplesForCV(samples), [600, 650, 700, 680]);
});

Deno.test('D-039 Fix 1: empty input → empty output', () => {
  assertEquals(filterPaceSamplesForCV([]), []);
});

Deno.test('D-039 Fix 1: all outliers → empty output (no division-by-zero risk downstream)', () => {
  const samples = [99999, 50000, 10000];
  assertEquals(filterPaceSamplesForCV(samples), []);
});

Deno.test('D-039 Fix 1: 8cbfa389 regression — steady 11:11/mi with one 30min/mi spike', () => {
  // Synthesizes the 8cbfa389 scenario: ~75 min of steady 11:11/mi pace
  // (671 sec/mi) with one stationary blip. Pre-fix CV would have been
  // catastrophically inflated; post-fix CV computed only on the valid
  // running samples is near-zero (steady), so the variance gate at 8% does
  // NOT trip and the session routes correctly as steady_state.
  const steadySamples = Array.from({ length: 4500 }, () => 671 + (Math.random() - 0.5) * 10);
  const withSpike = [...steadySamples.slice(0, 2000), 30000, ...steadySamples.slice(2000)];
  const cleaned = filterPaceSamplesForCV(withSpike);
  // One outlier dropped, rest preserved
  assertEquals(cleaned.length, withSpike.length - 1);
  // Compute CV on cleaned — should be very low (steady pace + small noise)
  const mean = cleaned.reduce((a, b) => a + b, 0) / cleaned.length;
  const variance = cleaned.reduce((s, p) => s + (p - mean) ** 2, 0) / cleaned.length;
  const cvPct = (Math.sqrt(variance) / mean) * 100;
  // CV should be well under the 8% variance-gate threshold
  if (cvPct >= 8) {
    throw new Error(`D-039 Fix 1 regression: post-filter CV ${cvPct.toFixed(2)}% exceeds the 8% variance-gate threshold for steady-pace fixture`);
  }
});

Deno.test('D-039 Fix 1: custom maxSecPerMi override (for callers wanting a different threshold)', () => {
  const samples = [600, 1000, 1500, 2000];
  // Tighter threshold: 1200
  assertEquals(filterPaceSamplesForCV(samples, 1200), [600, 1000]);
});
