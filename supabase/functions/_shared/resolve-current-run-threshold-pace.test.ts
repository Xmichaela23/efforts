/**
 * Fixtures for `resolveCurrentRunThresholdPace` — the sibling of resolveCurrentRunEasyPace, and the
 * single-source fix for audit 2026-07-17 #6 (threshold pace: ~35 readers, 3 units, 2 disjoint authorities).
 *
 * Run: deno test supabase/functions/_shared/resolve-current-run-threshold-pace.test.ts --no-check
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';

const learned = (secPerKm: number, confidence = 'high', sample_count = 5, as_of: string | null = '2026-06-28') =>
  ({ learned_fitness: { run_threshold_pace_sec_per_km: { value: secPerKm, confidence, sample_count, as_of } } });

// ═══ THE UNIT FOOTGUN — the most important test in the file ══════════════════
// learned_fitness is sec/KM; performance_numbers is sec/MILE. Convert exactly once.
Deno.test('UNITS: learned sec/km → sec/mi exactly once', () => {
  // 372 s/km == 9:59/mi  (372 * 1.609344 = 598.6 -> 599 s/mi)
  const r = resolveCurrentRunThresholdPace(learned(372));
  assertEquals(r.sec_per_mi, 599);
  assertEquals(r.sec_per_km, 372); // km-native tier keeps its EXACT value — no lossy round-trip
  assertEquals(r.source, 'learned');
  assertEquals(r.is_estimate, false);
});

Deno.test('UNITS: performance_numbers sec/km field is converted, sec/mi field is not', () => {
  assertEquals(resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_km: 372 } }).sec_per_mi, 599);
  assertEquals(resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_mi: 600 } }).sec_per_mi, 600);
});

Deno.test('UNITS: min_per_mi "7:30" string parses to 450 s/mi; a bare number is IGNORED (ambiguous)', () => {
  assertEquals(resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_min_per_mi: '7:30' } }).sec_per_mi, 450);
  assertEquals(resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_min_per_mi: 7 } }).sec_per_mi, null);
});

// ═══ PRECEDENCE ══════════════════════════════════════════════════════════════
Deno.test('learned trusted WINS over a typed manual value', () => {
  const r = resolveCurrentRunThresholdPace({ ...learned(372, 'high'), performance_numbers: { threshold_pace_sec_per_mi: 620 } });
  assertEquals(r.sec_per_mi, 599);
  assertEquals(r.source, 'learned');
});

Deno.test('no learned → typed manual is used (an assertion, not an estimate)', () => {
  const r = resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_mi: 610 } });
  assertEquals(r.sec_per_mi, 610);
  assertEquals(r.source, 'manual');
  assertEquals(r.is_estimate, false);
});

Deno.test('effort_paces.threshold is an INFERENCE — is_estimate:true, and BELOW a typed value', () => {
  const wizardOnly = resolveCurrentRunThresholdPace({ effort_paces: { threshold: 605 } });
  assertEquals(wizardOnly.sec_per_mi, 605);
  assertEquals(wizardOnly.source, 'effort_paces');
  assertEquals(wizardOnly.is_estimate, true);
  // a typed value outranks the wizard pace (this is the coach inversion being fixed)
  const withManual = resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_mi: 610 }, effort_paces: { threshold: 605 } });
  assertEquals(withManual.source, 'manual');
});

Deno.test('effort_paces.z4 is the threshold proxy when .threshold is absent', () => {
  const r = resolveCurrentRunThresholdPace({ effort_paces: { z4: 608 } });
  assertEquals(r.sec_per_mi, 608);
  assertEquals(r.source, 'effort_paces');
});

Deno.test('learned-low (thin) is used below the wizard inference', () => {
  const r = resolveCurrentRunThresholdPace({ ...learned(372, 'low') });
  assertEquals(r.source, 'learned-low');
  assertEquals(r.sec_per_mi, 599);
});

// ═══ Q-174 — the athlete's explicit choice ══════════════════════════════════
Deno.test('choice=manual outranks even a high-confidence learned pace', () => {
  const r = resolveCurrentRunThresholdPace({ ...learned(372, 'high'), performance_numbers: { threshold_pace_sec_per_mi: 620, threshold_pace_source: 'manual' } });
  assertEquals(r.sec_per_mi, 620);
  assertEquals(r.source, 'manual-chosen');
});

Deno.test('choice=learned SKIPS the manual tier (a declined typed number cannot resurface)', () => {
  const r = resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_mi: 620, threshold_pace_source: 'learned' }, effort_paces: { threshold: 605 } });
  assertEquals(r.source, 'effort_paces'); // manual skipped → falls to the wizard inference
});

// ═══ LAW 2 — WE DO NOT INVENT ════════════════════════════════════════════════
Deno.test('no data at all → null (never a silent pace)', () => {
  const r = resolveCurrentRunThresholdPace({});
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
});

// ═══ THE FRACTURE THIS CLOSES — coach and race-projections now agree ════════
Deno.test('coach-shaped input and race-projections-shaped input resolve to the SAME pace', () => {
  // Both surfaces given the SAME athlete: a learned threshold pace, and a wizard pace that DIFFERS.
  const baselines = {
    learned_fitness: { run_threshold_pace_sec_per_km: { value: 372, confidence: 'high', sample_count: 5 } },
    effort_paces: { threshold: 640 }, // the wizard number the coach used to read in isolation
  };
  // The resolver gives ONE answer regardless of which surface asks — the measured pace wins.
  const r = resolveCurrentRunThresholdPace(baselines);
  assertEquals(r.sec_per_mi, 599);
  assertEquals(r.source, 'learned');
});
