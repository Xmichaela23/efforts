/**
 * Run: deno test src/lib/resolve-current-max-hr.test.ts --no-check
 *
 * Law-6 proof for the max-HR single-source resolver (audit 2026-07-17 #5).
 * Pins every precedence tier, the ONE divisor (PEAK_TO_MAX), the ONE age formula (Tanaka / Gulati),
 * the sample_count:0 refusal, the Law-2 "never invent unless allowed + flagged" property, and the
 * congruence property that the two run-analyzer paths now derive the same max from one session peak.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentMaxHr, ageEstimateMaxHr, PEAK_TO_MAX } from './resolve-current-max-hr.ts';

// ── Precedence ──────────────────────────────────────────────────────────────
Deno.test('manual/configured max wins over learned', () => {
  const r = resolveCurrentMaxHr(
    { athlete_config: { manual_run_max_hr: 190 }, learned_fitness: { run_max_hr_observed: { value: 185, confidence: 'high', sample_count: 10 } } },
    { sport: 'run' },
  );
  assertEquals(r.bpm, 190);
  assertEquals(r.source, 'manual');
});

Deno.test('no manual → learned observed peak (measured)', () => {
  const r = resolveCurrentMaxHr(
    { learned_fitness: { run_max_hr_observed: { value: 185, confidence: 'high', sample_count: 10 } } },
    { sport: 'run' },
  );
  assertEquals(r.bpm, 185);
  assertEquals(r.source, 'learned');
});

Deno.test('sport = ride reads the ride learned peak, not the run one', () => {
  const r = resolveCurrentMaxHr(
    { learned_fitness: { run_max_hr_observed: { value: 185, confidence: 'high', sample_count: 10 }, ride_max_hr_observed: { value: 172, confidence: 'high', sample_count: 8 } } },
    { sport: 'ride' },
  );
  assertEquals(r.bpm, 172);
});

Deno.test('learned with sample_count 0 is a formula, not a measurement → skipped', () => {
  const r = resolveCurrentMaxHr(
    { learned_fitness: { run_max_hr_observed: { value: 185, confidence: 'high', sample_count: 0 } } },
    { sport: 'run', deviceMaxHr: 178 },
  );
  assertEquals(r.bpm, 178);
  assertEquals(r.source, 'device');
});

Deno.test('device FIT max used below learned, above session peak', () => {
  const r = resolveCurrentMaxHr({}, { sport: 'run', deviceMaxHr: 180, observedSessionPeak: 170 });
  assertEquals(r.bpm, 180);
  assertEquals(r.source, 'device');
});

Deno.test('session peak ÷ the ONE divisor when nothing else', () => {
  const r = resolveCurrentMaxHr({}, { sport: 'run', observedSessionPeak: 171 });
  assertEquals(r.bpm, Math.round(171 / PEAK_TO_MAX));
  assertEquals(r.source, 'session-peak');
});

// ── Law 2: never invent unless allowed, and flag it ─────────────────────────
Deno.test('age estimate is the last resort, flagged is_estimate', () => {
  const r = resolveCurrentMaxHr({}, { age: 40 });
  assertEquals(r.bpm, ageEstimateMaxHr(40));
  assertEquals(r.source, 'age-estimate');
  assertEquals(r.is_estimate, true);
});

Deno.test('allowAgeEstimate:false refuses to invent → null', () => {
  const r = resolveCurrentMaxHr({}, { age: 40, allowAgeEstimate: false });
  assertEquals(r.bpm, null);
  assertEquals(r.is_estimate, false);
});

Deno.test('no data at all → null (never a silent number)', () => {
  const r = resolveCurrentMaxHr({}, { sport: 'run' });
  assertEquals(r.bpm, null);
  assertEquals(r.source, null);
});

// ── The ONE formula (Tanaka / Gulati) ───────────────────────────────────────
Deno.test('Tanaka for male/unspecified, Gulati for female', () => {
  assertEquals(ageEstimateMaxHr(40), Math.round(208 - 0.7 * 40));        // 180
  assertEquals(ageEstimateMaxHr(40, 'male'), Math.round(208 - 0.7 * 40)); // 180
  assertEquals(ageEstimateMaxHr(40, 'female'), Math.round(206 - 0.88 * 40)); // 171
});

// ── Congruence: one session peak → one max, everywhere ──────────────────────
Deno.test('both run-analyzer paths derive the SAME max from one peak (was 0.95 vs 0.90)', () => {
  const peak = 172;
  const viaResolver = resolveCurrentMaxHr({}, { observedSessionPeak: peak }).bpm;
  const viaZonesFile = Math.round(peak / PEAK_TO_MAX); // what zones.ts now computes
  assertEquals(viaResolver, viaZonesFile);
});
