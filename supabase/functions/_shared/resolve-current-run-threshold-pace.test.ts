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

Deno.test('a typed 5K does NOT seed threshold — learned or entered, nothing else (Michael, 2026-09-02)', () => {
  const fiveKOnly = resolveCurrentRunThresholdPace({ performance_numbers: { fiveK_pace: 585, fiveK: '30:18' } });
  assertEquals(fiveKOnly.sec_per_mi, null);
  assertEquals(fiveKOnly.source, null);
  // a typed threshold beside a 5K is simply the typed threshold
  const withManual = resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_mi: 610, fiveK_pace: 585 } });
  assertEquals(withManual.sec_per_mi, 610);
  assertEquals(withManual.source, 'manual');
});

Deno.test('the vDOT table (effort_paces) is NOT read any more — a row carrying only it resolves to nothing', () => {
  const r = resolveCurrentRunThresholdPace({ effort_paces: { steady: 608, threshold: 608, z4: 608 } } as never);
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
});

Deno.test('learned-low (thin) is used when nothing trusted or typed exists', () => {
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

Deno.test('choice=learned with nothing measured falls back to the typed pace, as FTP does (2026-09-05)', () => {
  const r = resolveCurrentRunThresholdPace({ performance_numbers: { threshold_pace_sec_per_mi: 620, threshold_pace_source: 'learned', fiveK_pace: 585 } });
  assertEquals(r.sec_per_mi, 620);
  assertEquals(r.source, 'manual'); // a fallback, not a choice — 'manual-chosen' is reserved for choice=manual
});

Deno.test('choice=learned with a trusted measured pace uses the measured pace over the typed one', () => {
  const r = resolveCurrentRunThresholdPace({ ...learned(372, 'high'), performance_numbers: { threshold_pace_sec_per_mi: 620, threshold_pace_source: 'learned' } });
  assertEquals(r.sec_per_mi, 599);
  assertEquals(r.source, 'learned');
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
