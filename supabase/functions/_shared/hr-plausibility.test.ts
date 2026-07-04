/**
 * Fixtures for HR plausibility (D-237 input-layer, 2026-07-04). The corrupt-vs-real
 * discriminator is CORRELATION-with-cadence, not HR height — a masters athlete's real
 * hard intervals legitimately exceed the Tanaka formula line and MUST NOT be rejected.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/hr-plausibility.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveMaxHrCeiling, assessHrPlausibility } from './hr-plausibility.ts';

// ── Ceiling resolution ──────────────────────────────────────────────────────

Deno.test('ceiling: observed-max path (≥5 clean sessions) = max + 15', () => {
  const r = resolveMaxHrCeiling({ observedMaxima: [178, 180, 182, 175, 179], age: 57 });
  assertEquals(r.basis, 'observed');
  assertEquals(r.observedMax, 182);
  assertEquals(r.ceiling, 197); // 182 + 15
});

Deno.test('ceiling ROBUSTNESS: an isolated 194 outlier does NOT inflate the ceiling (anchors on the 182 cluster)', () => {
  // Michael's real shape: cluster 178–182, one lone 194 ride (+12 over the cluster). The 194 must
  // be trimmed so the ceiling is 182+15=197, not 194+15=209 — else an existing artifact widens the guard.
  const r = resolveMaxHrCeiling({
    observedMaxima: [194, 182, 180, 179, 179, 179, 178, 178, 178, 177, 177, 177],
    age: 57,
  });
  assertEquals(r.basis, 'observed');
  assertEquals(r.observedMax, 182); // 194 trimmed as an isolated outlier
  assertEquals(r.ceiling, 197);
});

Deno.test('ceiling robustness: a CLUSTERED high max is kept (193,192 near-together → not trimmed)', () => {
  // Two close high values are a real cluster, not an isolated artifact → keep them.
  const r = resolveMaxHrCeiling({ observedMaxima: [193, 192, 185, 184, 183, 182], age: 57 });
  assertEquals(r.observedMax, 193); // 193−192=1 ≤ gap → kept
  assertEquals(r.ceiling, 208);
});

Deno.test('ceiling: Michael (age 57) formula fallback (thin history) = Tanaka 168 + 30 = 198', () => {
  const r = resolveMaxHrCeiling({ observedMaxima: [180], age: 57 }); // 1 clean < 5 → fallback
  assertEquals(r.basis, 'formula');
  assertEquals(r.tanaka, 168);   // round(208 − 0.7·57) = round(168.1)
  assertEquals(r.ceiling, 198);  // 168 + 30 (generous — impossible-value guard, not a training cap)
});

// ── The four required corrupt-vs-real fixtures ──────────────────────────────

const CEILING = 198; // Michael's fallback ceiling for these

Deno.test('(1) cadence-lock → FLAGGED (HR tracks cadence; height alone is unremarkable)', () => {
  const cadence = [160, 170, 180, 175, 165, 170, 178, 168, 172, 169, 181, 176];
  const hr = cadence.map((c) => c + 1); // HR reads cadence → correlation ≈ 1
  const v = assessHrPlausibility({ maxHr: Math.max(...hr), ceiling: CEILING, hrSeries: hr, cadenceSeries: cadence });
  assertEquals(v.corrupt, true);
  assertEquals(v.reasons.includes('cadence_lock'), true);
  assertEquals(v.reasons.includes('over_ceiling'), false); // ~182 is NOT over ceiling — correlation caught it
});

Deno.test('(2) over-max spike → REJECTED (max HR above the ceiling)', () => {
  const hr = [150, 155, 160, 215, 158, 156]; // 215 > 198
  const v = assessHrPlausibility({ maxHr: 215, ceiling: CEILING, hrSeries: hr });
  assertEquals(v.corrupt, true);
  assertEquals(v.reasons.includes('over_ceiling'), true);
});

Deno.test('(3) clean hard-interval (high HR, flat cadence) → must NOT trip', () => {
  const cadence = [175, 176, 174, 177, 175, 174, 176, 175, 177, 174, 176, 175]; // ~flat, effort-independent
  const hr = [130, 145, 165, 178, 180, 150, 135, 168, 182, 179, 148, 133];      // climbs with EFFORT
  const v = assessHrPlausibility({ maxHr: 182, ceiling: CEILING, hrSeries: hr, cadenceSeries: cadence });
  assertEquals(v.corrupt, false);
  assertEquals(v.reasons, []);
});

Deno.test('(4) masters false-reject guard: real HR above Tanaka (168) but below the ceiling → must NOT trip', () => {
  // The research-warned case: HR legitimately hits 185 (above the 168 formula estimate) on hard
  // intervals; cadence flat; below the 198 ceiling. Rejecting this would discard a real hard session.
  const cadence = [176, 175, 177, 176, 174, 176, 175, 177, 175, 176];
  const hr = [140, 160, 180, 185, 172, 150, 178, 185, 168, 145];
  const v = assessHrPlausibility({ maxHr: 185, ceiling: CEILING, hrSeries: hr, cadenceSeries: cadence });
  assertEquals(v.corrupt, false);
  assertEquals(v.reasons, []);
});

// ── slew + guards ───────────────────────────────────────────────────────────

Deno.test('impossible slew: isolated 70→180→90 spike → FLAGGED, but a smooth ramp is not', () => {
  const spike = assessHrPlausibility({ maxHr: 180, ceiling: CEILING, hrSeries: [150, 152, 151, 240, 153, 152] });
  assertEquals(spike.reasons.includes('impossible_slew'), true);
  const ramp = assessHrPlausibility({ maxHr: 185, ceiling: CEILING, hrSeries: [130, 145, 160, 172, 180, 185] });
  assertEquals(ramp.reasons.includes('impossible_slew'), false); // sustained climb, not an isolated spike
});
