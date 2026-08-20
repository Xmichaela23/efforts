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

// ═══════════════════════════════════════════════════════════════════════════
// THE RUN-SPECIFIC MANUAL OVERRIDE (2026-08-19)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('the RUN manual override beats the sport-agnostic one', () => {
  // ⛔ THE BUG. `TrainingBaselines` writes per-sport overrides AND one agnostic
  // `threshold_heart_rate` set to `runLTHR || rideLTHR`. This resolver read only the agnostic key,
  // so a typed RUN LTHR was invisible here while `generate-run-plan` (the marathon builder) read it
  // directly and used it. Two answers for one athlete.
  const r = resolveCurrentLthr({
    configured_hr_zones: { manual_run_lthr: 168, threshold_heart_rate: 152 },
  } as never);
  assertEquals(r.bpm, 168);
  assertEquals(r.source, 'manual');
});

Deno.test('a CYCLING threshold no longer anchors a run when a run number exists', () => {
  // For an athlete with no run LTHR, the writer puts the RIDE number in `threshold_heart_rate`.
  // Running HR sits 5-10 bpm above cycling at the same effort, so anchoring a run on it reads every
  // run zone low. Whenever the athlete has typed a run number, it wins.
  const cyclistWhoRuns = {
    configured_hr_zones: { manual_run_lthr: 165, manual_ride_lthr: 150, threshold_heart_rate: 150 },
  };
  assertEquals(resolveCurrentLthr(cyclistWhoRuns as never).bpm, 165);
});

Deno.test('the run override is still an ASSERTION — a trusted measurement outranks it', () => {
  const r = resolveCurrentLthr({
    learned_fitness: { run_threshold_hr: { value: 171, confidence: 'high', sample_count: 6 } },
    configured_hr_zones: { manual_run_lthr: 168 },
  } as never);
  assertEquals(r.bpm, 171);
  assertEquals(r.source, 'learned');
});

Deno.test('the run override still honours the Q-174 choice in both directions', () => {
  const base = {
    learned_fitness: { run_threshold_hr: { value: 171, confidence: 'high', sample_count: 6 } },
    configured_hr_zones: { manual_run_lthr: 168 },
  };
  // "use MY number" — the typed run value wins over a high-confidence measurement.
  const chosen = resolveCurrentLthr({ ...base, performance_numbers: { lthr_source: 'manual' } } as never);
  assertEquals(chosen.bpm, 168);
  assertEquals(chosen.source, 'manual-chosen');
  // "track my runs" — the manual tier is SKIPPED entirely, so a declined number cannot resurface.
  const tracked = resolveCurrentLthr({
    configured_hr_zones: { manual_run_lthr: 168 },
    performance_numbers: { lthr_source: 'learned' },
  } as never);
  assertEquals(tracked.bpm, null);
});

/**
 * MUTATIONS RUN 2026-08-19 — all killed.
 *   1  `manual_run_lthr` removed from the manual chain      -> 2 fail (override + cyclist)
 *   2  `manual_run_lthr` placed AFTER `threshold_heart_rate` -> 2 fail (same two)
 *   3  the run override read as its own tier ABOVE learned   -> 1 fail (assertion-vs-measurement)
 */


// ═══════════════════════════════════════════════════════════════════════════
// THE BIKE (2026-08-20) — same owner, its own anchor
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('BIKE: reads the ride learned value, not the run one', () => {
  const both = {
    learned_fitness: {
      run_threshold_hr: { value: 171, confidence: 'high', sample_count: 6 },
      ride_threshold_hr: { value: 158, confidence: 'high', sample_count: 5 },
    },
  };
  assertEquals(resolveCurrentLthr(both as never, { sport: 'ride' }).bpm, 158);
  assertEquals(resolveCurrentLthr(both as never).bpm, 171);              // default stays run
  assertEquals(resolveCurrentLthr(both as never, { sport: 'run' }).bpm, 171);
});

Deno.test('BIKE: the sport word is matched loosely — callers pass raw workout types', () => {
  const b = { learned_fitness: { ride_threshold_hr: { value: 158, confidence: 'high', sample_count: 5 } } };
  for (const sport of ['ride', 'bike', 'cycling', 'Ride', 'virtual_ride']) {
    assertEquals(resolveCurrentLthr(b as never, { sport }).bpm, 158, sport);
  }
});

Deno.test('BIKE: its own typed override wins over its learned value\'s rival sport', () => {
  const b = {
    learned_fitness: { ride_threshold_hr: { value: 158, confidence: 'high', sample_count: 5 } },
    configured_hr_zones: { manual_ride_lthr: 152, manual_run_lthr: 168 },
    performance_numbers: { lthr_source: 'manual' },
  };
  assertEquals(resolveCurrentLthr(b as never, { sport: 'ride' }).bpm, 152);
  assertEquals(resolveCurrentLthr(b as never, { sport: 'run' }).bpm, 168);
});

Deno.test('BIKE: REFUSES the sport-agnostic field — it is run-preferred by construction', () => {
  // ⛔ `TrainingBaselines` writes `threshold_heart_rate = runLTHR || rideLTHR`. For a bike read that
  // is most likely the RUN number, and running HR sits 5-10 bpm above cycling at the same effort.
  // With no ride number on file the bike gets NOTHING rather than the run's.
  const runOnly = { configured_hr_zones: { manual_run_lthr: 168, threshold_heart_rate: 168 } };
  assertEquals(resolveCurrentLthr(runOnly as never, { sport: 'ride' }).bpm, null);
  assertEquals(resolveCurrentLthr(runOnly as never).bpm, 168);
});

Deno.test('BIKE: the sample-count gate applies to the bike too', () => {
  // "88% of observed max (estimated)" is a formula in either sport.
  const formula = { learned_fitness: { ride_threshold_hr: { value: 150, confidence: 'high', sample_count: 0 } } };
  assertEquals(resolveCurrentLthr(formula as never, { sport: 'ride' }).bpm, null);
});
