import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { rescaleHooper10to7, energyLevel, sorenessLevel, sleepQuality, overallReadinessLabel } from './readiness-scale.ts';

// ── Rescale 1–10 → 1–7 (energy uses the same formula as soreness) ──
Deno.test('rescaleHooper10to7: 7→5 exact, endpoints preserved, interior rounds', () => {
  assertEquals(rescaleHooper10to7(1), 1);
  assertEquals(rescaleHooper10to7(7), 5);   // the reason energyGood ≥7 → ≥5
  assertEquals(rescaleHooper10to7(10), 7);
  assertEquals(rescaleHooper10to7(8), 6);
  assertEquals(rescaleHooper10to7(6), 4);
});

// ── Band labels (1–7 for energy/soreness, HOURS for sleep) ──
Deno.test('energyLevel bands (1–7)', () => {
  assertEquals(energyLevel(6), 'High');
  assertEquals(energyLevel(4), 'Moderate');
  assertEquals(energyLevel(3), 'Low');
  assertEquals(energyLevel(9), null);   // out-of-range leak → no label
  assertEquals(energyLevel(null), null);
});
Deno.test('sorenessLevel bands (1–7)', () => {
  assertEquals(sorenessLevel(2), 'Low');
  assertEquals(sorenessLevel(4), 'Moderate');
  assertEquals(sorenessLevel(5), 'High');
});
Deno.test('sleepQuality bands (HOURS — unchanged)', () => {
  assertEquals(sleepQuality(8), 'Excellent');
  assertEquals(sleepQuality(7), 'Good');
  assertEquals(sleepQuality(6), 'Fair');
  assertEquals(sleepQuality(5), 'Poor');
});

// ── overallReadinessLabel — the end-to-end matrix that guards the next skipped consumer ──
Deno.test('overallReadinessLabel: pinned matrix of 1–7 energy/soreness + hours sleep', () => {
  assertEquals(overallReadinessLabel(7, 1, 8), 'Excellent'); // 1.0, 1.0, 0.67 → 0.89
  assertEquals(overallReadinessLabel(6, 2, 8), 'Good');      // 0.83, 0.83, 0.67 → 0.78
  assertEquals(overallReadinessLabel(4, 4, 7), 'Fair');      // 0.50, 0.50, 0.58 → 0.53
  assertEquals(overallReadinessLabel(1, 7, 4), 'Poor');      // 0.0, 0.0, 0.33 → 0.11
  assertEquals(overallReadinessLabel(7, 7, 12), 'Good');     // 1.0, 0.0, 1.0 → 0.67 (max sore still drags it)
});
Deno.test('overallReadinessLabel: partial inputs use only what is present', () => {
  assertEquals(overallReadinessLabel(null, 3, 7), 'Good');   // (7-3)/6=0.67, 7/12=0.58 → 0.625
  assertEquals(overallReadinessLabel(null, null, null), null);
});
Deno.test('overallReadinessLabel MIXED-SCALE GUARD: an un-migrated 1–10 energy (9) is DROPPED, never blended', () => {
  // energy 9 is out of 1–7 → skipped; score is soreness 1 (1.0) + sleep 8h (0.67) only → Excellent.
  assertEquals(overallReadinessLabel(9, 1, 8), 'Excellent');
});
