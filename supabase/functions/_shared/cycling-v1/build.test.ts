/**
 * Tests for buildCyclingFactPacketV1 canonical IF/VI override.
 *
 * Power-source fix: the fact packet used to recompute IF (NP/FTP) and VI
 * (NP/avg) from NP/avg resolved via computed.overall.* — which is never
 * populated at the overall level, so it fell through to provider/device power
 * and disagreed with compute-workout-analysis (the analyzer that writes
 * computed.analysis.power.*, the source compute-facts:1124 trusts). e.g. Apr-11
 * ride 0473be77: analyzer VI 1.53 / IF 0.95 vs fact-packet 1.12 / 0.78 — the
 * classifier's VI/IF gate was reasoning over different numbers than the ride.
 *
 * analyze-cycling-workout now passes the canonical analyzer VI/IF as overrides;
 * these tests pin that they win over the recompute (facts + classifier +
 * executed_intensity) and that absent overrides still recompute per-metric.
 *
 * Run: ~/.deno/bin/deno test supabase/functions/_shared/cycling-v1/build.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCyclingFactPacketV1 } from './build.ts';

// 60 min / 20.0 mi, 400 m of climb-segment ascent → elevation density
// (400 m → ft) / 20 mi ≈ 65.6 ft/mi ≥ 40 → climbing terrain when the gate fires.
const workout = {
  computed: {
    overall: { duration_s_moving: 3600, distance_m: 32186.8 },
    analysis: { climbing: { climb_ascent_m: 400 } },
  },
};

const base = {
  workout,
  plannedWorkout: null, // no plan_intent → classified_type comes from the classifier
  powerSamplesW: new Array(30).fill(175), // < 60 → ftp_bins null (deterministic classifier path)
  avgPowerW: 200, // recompute VI = 175/200 = 0.875
  normalizedPowerW: 175,
  avgHr: null,
  maxHr: null,
  ftpW: 250, // recompute IF = 175/250 = 0.70
};

Deno.test('canonical VI/IF overrides win over the NP/avg recompute (facts + classification)', () => {
  const pkt = buildCyclingFactPacketV1({
    ...base,
    variabilityIndexOverride: 1.53, // analyzer's full-series VI
    intensityFactorOverride: 0.95, // analyzer's full-series IF
  });

  // Facts carry the analyzer numbers, not the 0.70 / 0.88 recompute.
  assertEquals(pkt.facts.intensity_factor, 0.95);
  assertEquals(pkt.facts.variability_index, 1.53);
  // Classifier gate (VI ≥ 1.10 ∧ IF ≥ 0.85) now fires on the canonical numbers;
  // ~65.6 ft/mi ≥ 40 → climbing. Recompute (VI 0.875 / IF 0.70) would be endurance.
  assertEquals(pkt.facts.classified_type, 'climbing');
  // executed_intensity also flows from the effective IF (0.95 ≥ 0.80, no bins).
  assertEquals(pkt.derived.executed_intensity, 'hard');
  // NP/avg display fields are unaffected by the override.
  assertEquals(pkt.facts.normalized_power_w, 175);
  assertEquals(pkt.facts.avg_power_w, 200);
});

Deno.test('no overrides → recompute from NP/avg (unchanged legacy behavior)', () => {
  const pkt = buildCyclingFactPacketV1({ ...base });

  assertEquals(pkt.facts.intensity_factor, 0.7); // 175 / 250
  assertEquals(pkt.facts.variability_index, 0.88); // round2(175 / 200)
  // VI 0.875 < 1.10 → gate bypassed; IF 0.70 → endurance.
  assertEquals(pkt.facts.classified_type, 'endurance');
  assertEquals(pkt.derived.executed_intensity, 'moderate'); // 0.65 ≤ 0.70 < 0.80
});

Deno.test('partial override degrades per-metric (canonical VI, FTP-missing IF)', () => {
  // Analyzer wrote VI but not IF (no FTP at analysis time) → VI uses the
  // canonical value, IF falls back to the NP/FTP recompute.
  const pkt = buildCyclingFactPacketV1({
    ...base,
    variabilityIndexOverride: 1.40,
    intensityFactorOverride: null,
  });
  assertEquals(pkt.facts.variability_index, 1.4); // canonical
  assertEquals(pkt.facts.intensity_factor, 0.7); // recomputed 175 / 250
});

Deno.test('non-finite / non-positive overrides are ignored (fall back to recompute)', () => {
  const pkt = buildCyclingFactPacketV1({
    ...base,
    variabilityIndexOverride: 0,
    intensityFactorOverride: Number.NaN,
  });
  assertEquals(pkt.facts.variability_index, 0.88); // recompute
  assertEquals(pkt.facts.intensity_factor, 0.7); // recompute
});
