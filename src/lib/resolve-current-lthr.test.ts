/**
 * Run: deno test src/lib/resolve-current-lthr.test.ts --no-check
 *
 * Law-6 proof for the LTHR single-source resolver (SPEC-lthr-one-anchor.md, audit 2026-07-17).
 * Pins every precedence tier, the D-284 sample_count:0 refusal, the Q-174 explicit-choice mechanism,
 * the Law-1 "all callers get ONE bpm" property, and the primary user's real baseline (byte-identical).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveCurrentLthr } from './resolve-current-lthr.ts';

const learned = (value: number, confidence: string, sample_count: number, as_of = '2026-05-21') =>
  ({ learned_fitness: { run_threshold_hr: { value, confidence, sample_count, as_of } } });

// ── Precedence ────────────────────────────────────────────────────────────────
Deno.test('learned medium/high + sampled WINS over a typed manual value', () => {
  const r = resolveCurrentLthr({ ...learned(151, 'medium', 2), performance_numbers: { threshold_heart_rate: 160 } });
  assertEquals(r.bpm, 151);
  assertEquals(r.source, 'learned');
});

Deno.test('no learned → manual/typed value is used (assertion)', () => {
  const r = resolveCurrentLthr({ performance_numbers: { threshold_heart_rate: 158 } });
  assertEquals(r.bpm, 158);
  assertEquals(r.source, 'manual');
});

Deno.test('typed LTHR can live in configured_hr_zones too', () => {
  const r = resolveCurrentLthr({ configured_hr_zones: { threshold_heart_rate: 149, source: 'manual' } });
  assertEquals(r.bpm, 149);
  assertEquals(r.source, 'manual');
});

Deno.test('learned LOW confidence (but sampled) falls to learned-low, below manual', () => {
  const withManual = resolveCurrentLthr({ ...learned(151, 'low', 3), performance_numbers: { threshold_heart_rate: 160 } });
  assertEquals(withManual.bpm, 160);          // manual outranks learned-low
  assertEquals(withManual.source, 'manual');
  const noManual = resolveCurrentLthr(learned(151, 'low', 3));
  assertEquals(noManual.bpm, 151);
  assertEquals(noManual.source, 'learned-low');
});

Deno.test('device per-workout threshold is the LOWEST tier', () => {
  const r = resolveCurrentLthr({}, { deviceThresholdHr: 145 });
  assertEquals(r.bpm, 145);
  assertEquals(r.source, 'device');
  // ...and loses to anything real
  const beaten = resolveCurrentLthr({ performance_numbers: { threshold_heart_rate: 158 } }, { deviceThresholdHr: 145 });
  assertEquals(beaten.source, 'manual');
});

// ── THE D-284 GATE ─────────────────────────────────────────────────────────────
Deno.test('GATE: a learned value with sample_count 0 is a FORMULA — it can NEVER anchor', () => {
  // "88% of observed max (estimated)", zero samples — must fall through, not anchor.
  const onlyBadLearned = resolveCurrentLthr(learned(133, 'medium', 0));
  assertEquals(onlyBadLearned.bpm, null);     // nothing else present → null, NOT 133
  assertEquals(onlyBadLearned.source, null);
  // even "high" confidence with 0 samples is rejected
  const highButUnsampled = resolveCurrentLthr({ ...learned(133, 'high', 0), performance_numbers: { threshold_heart_rate: 158 } });
  assertEquals(highButUnsampled.bpm, 158);    // the typed value wins over the unsampled formula
  assertEquals(highButUnsampled.source, 'manual');
});

Deno.test('GATE: an ABSENT sample_count is "not stated", not "measured nothing" — it is ACCEPTED (Q-171)', () => {
  // The in-pass synthetic band the learner builds passes no sample_count. That must still anchor.
  const r = resolveCurrentLthr({ learned_fitness: { run_threshold_hr: { value: 150, confidence: 'medium' } } });
  assertEquals(r.bpm, 150);
  assertEquals(r.source, 'learned');
  assertEquals(r.sample_count, null); // reported as "not stated", not fabricated to 0
});

// ── Q-174 explicit choice ───────────────────────────────────────────────────────
Deno.test('choice "manual" outranks even high-confidence learned', () => {
  const r = resolveCurrentLthr({ ...learned(151, 'high', 8), performance_numbers: { threshold_heart_rate: 160, lthr_source: 'manual' } });
  assertEquals(r.bpm, 160);
  assertEquals(r.source, 'manual-chosen');
});

Deno.test('choice "learned" SKIPS the manual tier (a declined number cannot resurface)', () => {
  // learner thin (low conf) but chosen learned → must NOT fall back to the typed number
  const r = resolveCurrentLthr({ ...learned(151, 'low', 3), performance_numbers: { threshold_heart_rate: 160, lthr_source: 'learned' } });
  assertEquals(r.bpm, 151);
  assertEquals(r.source, 'learned-low');
});

// ── Never invent (Law 2) ────────────────────────────────────────────────────────
Deno.test('empty baseline → null, never a 220-age estimate', () => {
  assertEquals(resolveCurrentLthr(null).bpm, null);
  assertEquals(resolveCurrentLthr({}).bpm, null);
  assertEquals(resolveCurrentLthr({ learned_fitness: null, performance_numbers: null }).source, null);
});

// ── Law 1 pin: the ONE value all four call sites now share ───────────────────────
Deno.test('LAW-1 PIN: a baseline that the OLD chains split now resolves to ONE bpm', () => {
  // The fracture case: a typed LTHR (160) present AND a trusted learned (151). Pre-fix, zone bins read
  // 160 (configured-first) while the easy band read 151 (learned-first). One resolver → one answer.
  const b = { ...learned(151, 'medium', 2), configured_hr_zones: { threshold_heart_rate: 160, source: 'manual' } };
  const r = resolveCurrentLthr(b);
  assertEquals(r.bpm, 151);      // learned wins by default (byte-identical to easy-hr's old behavior)
  assertEquals(r.source, 'learned');
  // and if the athlete says "use my number", every site moves together to 160 — never one at a time
  const chosen = resolveCurrentLthr({ ...b, performance_numbers: { threshold_heart_rate: 160, lthr_source: 'manual' } });
  assertEquals(chosen.bpm, 160);
});

// ── Byte-identical for the primary user (Law 6) ──────────────────────────────────
Deno.test("primary user's real baseline (learned 151, n=2, medium) → 151/learned, unchanged", () => {
  const r = resolveCurrentLthr(learned(151, 'medium', 2, '2026-05-21'));
  assertEquals(r.bpm, 151);
  assertEquals(r.source, 'learned');
  assertEquals(r.sample_count, 2);
  assertEquals(r.as_of, '2026-05-21');
});
