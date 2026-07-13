/**
 * Fixtures for `resolveCurrentRunEasyPace` — the run twin of resolveCurrentFtp.
 * Spec: docs/SPEC-run-pace-glass-box.md
 *
 * Athlete-agnostic: synthetic numbers, never tuned to the primary user.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveCurrentRunEasyPace,
  parsePaceToSecPerMi,
} from '../../../src/lib/resolve-current-run-pace.ts';

const learned = (secPerKm: number, confidence = 'high', sample_count = 5, as_of: string | null = '2026-06-28') =>
  ({ learned_fitness: { run_easy_pace_sec_per_km: { value: secPerKm, confidence, sample_count, as_of } } });

// ═══ THE UNIT FOOTGUN — the single most important test in this file ═══════
// learned_fitness is sec/KM. performance_numbers is sec/MILE. This repo has been bitten 3x.
Deno.test('UNITS: learned sec/km is converted to sec/mi exactly once', () => {
  // 415 s/km == 11:08/mi  (415 * 1.609344 = 667.9 -> 668 s/mi)
  const r = resolveCurrentRunEasyPace(learned(415));
  assertEquals(r.sec_per_mi, 668);
  assertEquals(r.source, 'learned');
  // Sanity: the sec/km value must NEVER leak through unconverted.
  if (r.sec_per_mi === 415) throw new Error('sec/km leaked to the surface unconverted — the classic bug');
});

Deno.test('UNITS: manual is ALREADY sec/mi and must NOT be converted', () => {
  const r = resolveCurrentRunEasyPace({ performance_numbers: { easyPace: 690 } });
  assertEquals(r.sec_per_mi, 690);          // unchanged
  assertEquals(r.source, 'manual');
});

Deno.test('UNITS: a manual "9:30" STRING parses to seconds/mile', () => {
  assertEquals(parsePaceToSecPerMi('9:30'), 570);
  assertEquals(parsePaceToSecPerMi('11:08/mi'), 668);
  assertEquals(parsePaceToSecPerMi('9:30 per mile'), 570);
  const r = resolveCurrentRunEasyPace({ performance_numbers: { easyPace: '11:30' } });
  assertEquals(r.sec_per_mi, 690);
  assertEquals(r.source, 'manual');
});

// ═══ PRECEDENCE ═══════════════════════════════════════════════════════════
Deno.test('PRECEDENCE: a trusted learned value beats manual and effort_paces', () => {
  const r = resolveCurrentRunEasyPace({
    ...learned(415, 'high'),
    performance_numbers: { easyPace: 690 },
    effort_paces: { base: 700 },
  });
  assertEquals(r.source, 'learned');
  assertEquals(r.sec_per_mi, 668);
  assertEquals(r.is_estimate, false);        // measured
});

Deno.test('PRECEDENCE: a LOW-confidence learned value loses to manual (but still beats nothing)', () => {
  const withManual = resolveCurrentRunEasyPace({
    ...learned(415, 'low'),
    performance_numbers: { easyPace: 690 },
  });
  assertEquals(withManual.source, 'manual');

  const alone = resolveCurrentRunEasyPace(learned(415, 'low'));
  assertEquals(alone.source, 'learned-low');  // thin, but MEASURED — better than nothing
  assertEquals(alone.sec_per_mi, 668);
});

Deno.test('PRECEDENCE: effort_paces is used only when nothing measured or asserted exists — and DECLARES itself an estimate', () => {
  const r = resolveCurrentRunEasyPace({ effort_paces: { base: 700 } });
  assertEquals(r.source, 'effort_paces');
  assertEquals(r.sec_per_mi, 700);
  assertEquals(r.is_estimate, true);          // Law 2 — an inference wears different clothes
});

// ═══ LAW 2 — WE DO NOT INVENT ═════════════════════════════════════════════
Deno.test('LAW 2 REGRESSION: nothing known -> NULL. Never 540. Never 600. Never 10:00/mi.', () => {
  const r = resolveCurrentRunEasyPace({});
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
  assertEquals(r.is_estimate, false);
  // The literals this resolver exists to kill. If any of them ever comes back, this fails.
  for (const invented of [540, 600, 660]) {
    if (r.sec_per_mi === invented) throw new Error(`the resolver invented ${invented} — Law 2 violation`);
  }
});

Deno.test('LAW 2: null / undefined / empty baselines abstain rather than guess', () => {
  assertEquals(resolveCurrentRunEasyPace(null).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace(undefined).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace({ learned_fitness: null, performance_numbers: null }).sec_per_mi, null);
});

Deno.test('Number(null) === 0 footgun: a 0 / negative / garbage pace is MISSING, never a value', () => {
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { easyPace: 0 } }).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { easyPace: -5 } }).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace({ performance_numbers: { easyPace: 'abc' } }).sec_per_mi, null);
  assertEquals(resolveCurrentRunEasyPace(learned(0)).sec_per_mi, null);
  // ...and a 0 must not shadow a real value further down the chain.
  const r = resolveCurrentRunEasyPace({ ...learned(0), performance_numbers: { easyPace: 690 } });
  assertEquals(r.source, 'manual');
  assertEquals(r.sec_per_mi, 690);
});

// ═══ LAW 3 — CONFIDENCE + FRESHNESS TRAVEL WITH THE NUMBER ════════════════
Deno.test('LAW 3: confidence, sample_count and as_of travel to the surface', () => {
  const r = resolveCurrentRunEasyPace(learned(415, 'medium', 4, '2026-06-28'));
  assertEquals(r.confidence, 'medium');
  assertEquals(r.sample_count, 4);
  assertEquals(r.as_of, '2026-06-28');       // Q-173 — the newest SESSION, not the last rebuild
});

Deno.test('LAW 3: a manual value carries no false confidence', () => {
  const r = resolveCurrentRunEasyPace({ performance_numbers: { easyPace: 690 } });
  assertEquals(r.confidence, null);          // the athlete asserted it; we do not stamp a confidence on it
  assertEquals(r.sample_count, null);
  assertEquals(r.is_estimate, false);        // an assertion is not an estimate
});

// ═══ Q-174 — THE ATHLETE CHOOSES, AND THEIR CHOICE WINS ═══════════════════
Deno.test('Q-174: "use MY number" beats even a HIGH-confidence learned pace', () => {
  const r = resolveCurrentRunEasyPace({
    ...learned(415, 'high'),                                   // the app measured 11:08/mi
    performance_numbers: { easyPace: '11:30', easy_pace_source: 'manual' },
  });
  assertEquals(r.source, 'manual-chosen');
  assertEquals(r.sec_per_mi, 690);        // 11:30 — the athlete's number, honoured
  assertEquals(r.is_estimate, false);     // an ASSERTION, not an estimate
});

Deno.test('Q-174: "use my RUNS" skips the manual tier — a stale typed number cannot resurface', () => {
  // The athlete chose the learner. If the learner momentarily thins out, we must NOT silently fall back to
  // a number they explicitly declined — that would resurrect the very value they rejected.
  const thin = resolveCurrentRunEasyPace({
    ...learned(415, 'low'),                                    // learner is thin today
    performance_numbers: { easyPace: '11:30', easy_pace_source: 'learned' },
  });
  assertEquals(thin.source, 'learned-low');   // NOT 'manual'
  assertEquals(thin.sec_per_mi, 668);

  const none = resolveCurrentRunEasyPace({
    performance_numbers: { easyPace: '11:30', easy_pace_source: 'learned' },
  });
  assertEquals(none.sec_per_mi, null);        // nothing learned yet -> honest null, NOT the declined 11:30
  assertEquals(none.source, null);
});

Deno.test('Q-174: an ABSENT choice is byte-identical to the old behavior (no migration, no regression)', () => {
  const withChoice = resolveCurrentRunEasyPace({
    ...learned(415, 'high'),
    performance_numbers: { easyPace: '11:30' },                // no easy_pace_source key at all
  });
  assertEquals(withChoice.source, 'learned');                  // learned-first, exactly as before
  assertEquals(withChoice.sec_per_mi, 668);
});

Deno.test('Q-174: choosing manual with NO manual value set does not invent one', () => {
  const r = resolveCurrentRunEasyPace({
    ...learned(415, 'high'),
    performance_numbers: { easy_pace_source: 'manual' },       // chose manual, but never typed one
  });
  assertEquals(r.source, 'learned');       // falls through honestly; does NOT fabricate a manual value
  assertEquals(r.sec_per_mi, 668);
});
