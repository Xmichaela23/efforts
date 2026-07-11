/**
 * Step 3 consolidation — the steady-state narrative reads the ONE drift verdict (drift.ts's
 * terrain-adjusted, phase/weather-aware `assessment`) instead of recomputing a SECOND band on
 * RAW drift. Science: drift is judged against conditions, as one number, not two (TrainingPeaks
 * Pa:Hr / Garmin keep a single decoupling read; heat/terrain confound raw drift).
 *
 * These pin: (1) the assessment→prose mapping, (2) null-safe, and (3) the money regression —
 * a hilly run whose RAW drift was high but TERRAIN-ADJUSTED drift is normal must NOT read
 * "elevated"/"high" anymore (the old raw-band bug); it reads "normal", matching the durability
 * verdict the rest of the app shows.
 *
 * Run: deno test supabase/functions/analyze-running-workout/lib/heart-rate/drift-band-single-source.test.ts --no-check --allow-read
 */
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSteadyStateNarrative } from './interpretation.ts';

const base = { intent: 'easy' as const, durationMinutes: 50, hrDriftBpm: 10 };

Deno.test('assessment "normal" → prose says normal (not recomputed from raw bpm)', () => {
  const n = buildSteadyStateNarrative({ ...base, driftAssessment: 'normal' });
  assertStringIncludes(n, 'normal for this duration');
});

Deno.test('assessment "high" → prose says high', () => {
  const n = buildSteadyStateNarrative({ ...base, driftAssessment: 'high' });
  assertStringIncludes(n, 'high for this duration');
});

Deno.test('assessment "excellent"/"good" → below_expected prose (drift below the normal floor)', () => {
  assertStringIncludes(buildSteadyStateNarrative({ ...base, driftAssessment: 'excellent' }), 'lower than expected');
  assertStringIncludes(buildSteadyStateNarrative({ ...base, driftAssessment: 'good' }), 'lower than expected');
});

Deno.test('no assessment → no drift-band prose (null-safe)', () => {
  const n = buildSteadyStateNarrative({ ...base, driftAssessment: null });
  assertEquals(/HR drifted \d+ bpm —/.test(n), false);
});

Deno.test('MONEY regression: hilly run, RAW drift high but terrain-ADJUSTED normal → reads "normal", not "elevated"', () => {
  // Old code: getExpectedDrift on RAW 18 bpm → 'elevated'/'high'. New code: drift.ts already
  // subtracted the terrain contribution → assessment 'normal' → the narrative honors that.
  const n = buildSteadyStateNarrative({
    ...base,
    hrDriftBpm: 18,               // raw, terrain-inflated
    driftAssessment: 'normal',    // drift.ts's terrain-adjusted verdict
    terrainProfile: 'rolling',
    elevationGainFt: 400,
  });
  assertStringIncludes(n, 'normal for this duration');
  assertEquals(/elevated|high for this duration/.test(n), false); // no false "elevated"/"high"
});
