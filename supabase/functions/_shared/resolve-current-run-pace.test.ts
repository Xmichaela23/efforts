/**
 * Fixtures for `resolveCurrentRunEasyPace` — the run easy-pace REFERENCE BAND.
 *
 * ⛔ REWRITTEN 2026-09-02 (Michael's ruling: easy is not a pace source). Easy pace is threshold × 1.19
 * and nothing else — no learned tier, no typed tier, no `easy_pace_source` choice (Q-174 superseded).
 * The learned easy pace survives only as checkpoint EVIDENCE (`resolveMeasuredEasyPaceSecPerMi`);
 * here it is proven NOT to prescribe by itself.
 *
 * Run: deno test supabase/functions/_shared/resolve-current-run-pace.test.ts --no-check
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentRunEasyPace, resolveMeasuredEasyPaceSecPerMi } from '../../../src/lib/resolve-current-run-pace.ts';

const learnedEasy = (secPerKm: number, confidence = 'high', sample_count = 10, as_of: string | null = '2026-06-28') =>
  ({ learned_fitness: { run_easy_pace_sec_per_km: { value: secPerKm, confidence, sample_count, as_of } } });
const learnedThr = (secPerKm: number, confidence = 'high', sample_count = 5, as_of: string | null = '2026-06-28') =>
  ({ learned_fitness: { run_threshold_pace_sec_per_km: { value: secPerKm, confidence, sample_count, as_of } } });

// ═══ THE ONE RULE: easy = threshold × 1.19, a reference band ══════════════════
Deno.test('easy is threshold × 1.19 off a MEASURED threshold — and declares itself an estimate', () => {
  // 372 s/km threshold = 599 s/mi → easy 713 s/mi
  const r = resolveCurrentRunEasyPace(learnedThr(372));
  assertEquals(r.sec_per_mi, 713);
  assertEquals(r.source, 'derived-from-threshold');
  assertEquals(r.is_estimate, true);
  assertEquals(r.as_of, '2026-06-28');   // the threshold's date travels with it (Law 3)
});

Deno.test('easy is threshold × 1.19 off a TYPED threshold', () => {
  const r = resolveCurrentRunEasyPace({ performance_numbers: { threshold_pace_sec_per_mi: 500 } });
  assertEquals(r.sec_per_mi, 595);
  assertEquals(r.source, 'derived-from-threshold');
});

Deno.test('a typed 5K alone gives NO easy pace — the 5K seeds nothing (2026-09-02)', () => {
  const r = resolveCurrentRunEasyPace({ performance_numbers: { fiveK_pace: 425, fiveK: '22:00' } });
  assertEquals(r.sec_per_mi, null);
});

Deno.test('a MEASURED easy pace does not prescribe — with no threshold there is no easy band either (2026-09-02)', () => {
  // The learned easy pace is checkpoint evidence. It derives no threshold, so it derives no band.
  const r = resolveCurrentRunEasyPace(learnedEasy(415));
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
});

// ═══ WHAT IS NO LONGER A SOURCE ══════════════════════════════════════════════
Deno.test('a TYPED easy pace is IGNORED — it is not a source (2026-09-02)', () => {
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { easyPace: 690 } }).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { easyPace: '9:30' } }).sec_per_mi, null);
});

Deno.test('the easy_pace_source choice is IGNORED — Q-174 is superseded', () => {
  const r = resolveCurrentRunEasyPace({ ...learnedThr(372), performance_numbers: { easyPace: 800, easy_pace_source: 'manual' } });
  assertEquals(r.sec_per_mi, 713);
  assertEquals(r.source, 'derived-from-threshold');
});

Deno.test('a thin (low-confidence) learned easy pace prescribes nothing on its own', () => {
  const r = resolveCurrentRunEasyPace(learnedEasy(415, 'low', 2));
  assertEquals(r.sec_per_mi, null);
});

Deno.test('the vDOT table (effort_paces) is NOT read', () => {
  assertEquals(resolveCurrentRunEasyPace({ effort_paces: { base: 700 } } as never).sec_per_mi, null);
});

// ═══ LAW 2 — WE DO NOT INVENT ═════════════════════════════════════════════
Deno.test('LAW 2 REGRESSION: nothing known -> NULL. Never 540. Never 600. Never 10:00/mi.', () => {
  const r = resolveCurrentRunEasyPace({});
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
  assertEquals(r.is_estimate, false);
});

Deno.test('LAW 2: null / undefined / empty baselines abstain rather than guess', () => {
  assertEquals(resolveCurrentRunEasyPace(null).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace(undefined).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace({ learned_fitness: null, performance_numbers: null }).sec_per_mi, null);
});

Deno.test('Number(null) === 0 footgun: a 0 / negative / garbage threshold is MISSING, never a value', () => {
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { threshold_pace_sec_per_mi: 0 } }).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { threshold_pace_sec_per_mi: -5 } }).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace(learnedThr(NaN)).sec_per_mi, null);
});

// ═══ THE MEASURED-EASY ACCESSOR — the INPUT to threshold's fallback ═════════
Deno.test('MEASURED easy (checkpoint evidence): learned medium/high only, converted sec/km → sec/mi exactly once', () => {
  assertEquals(resolveMeasuredEasyPaceSecPerMi(learnedEasy(415, 'high')), 668);
  assertEquals(resolveMeasuredEasyPaceSecPerMi(learnedEasy(415, 'medium')), 668);
});

Deno.test('MEASURED easy: a low-confidence learned value, a typed value, and the choice field are all refused', () => {
  assertEquals(resolveMeasuredEasyPaceSecPerMi(learnedEasy(415, 'low')), null);
  assertEquals(resolveMeasuredEasyPaceSecPerMi({ performance_numbers: { easyPace: '10:00', easy_pace_source: 'manual' } }), null);
  assertEquals(resolveMeasuredEasyPaceSecPerMi({}), null);
});
