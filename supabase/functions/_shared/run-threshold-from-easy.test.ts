/**
 * Fixtures for the threshold-from-easy invariant (2026-08-19) — the rule that a threshold pace may
 * not be faster than the athlete's own measured easy pace ÷ 1.19, and the resolver tiers built on it.
 *
 * Run: deno test supabase/functions/_shared/run-threshold-from-easy.test.ts --no-check
 *
 * ⛔ EVERY TEST IN THIS FILE HAS BEEN MUTATION-CHECKED. Two of three test files written on
 * 2026-08-19 passed with their subject deleted, so "it goes green" is not evidence here. The
 * mutations run, and what each one breaks, are listed at the bottom of this file.
 *
 * ⛔ ATHLETE-AGNOSTIC. Synthetic numbers and a full-range sweep. The one fixture built from the real
 * report is labelled as a regression and asserts the SHAPE of the answer, not a tuned value — the
 * bug is the spec, the athlete is not.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  boundInferredThresholdSecPerMi,
  deriveThresholdFromEasySecPerMi,
  EASY_TO_THRESHOLD_PACE_RATIO,
  thresholdFloorSecPerMi,
} from '../../../src/lib/run-threshold-from-easy.ts';
import {
  describeThresholdBasis,
  resolveCurrentRunThresholdPace,
} from '../../../src/lib/resolve-current-run-pace.ts';

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;
const miToKm = (secPerMi: number) => secPerMi / SEC_PER_KM_TO_SEC_PER_MI;

/** A measured easy pace, at the confidence bar the bound requires. */
const easyLearned = (secPerMi: number, confidence = 'high', sample_count = 10) => ({
  run_easy_pace_sec_per_km: { value: miToKm(secPerMi), confidence, sample_count, as_of: '2026-08-04' },
});

// ═══════════════════════════════════════════════════════════════════════════
// THE RATIO AND THE DERIVATION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('THE RATIO is the pace table\'s, and derivation is easy ÷ ratio', () => {
  // The whole point of the constant: it is measured from PACE_TABLE, not chosen.
  assertEquals(EASY_TO_THRESHOLD_PACE_RATIO, 1.19);
  // 10:00/mi easy -> 600 / 1.19 = 504.2 -> 504 s/mi = 8:24/mi threshold.
  assertEquals(deriveThresholdFromEasySecPerMi(600), 504);
  // 8:00/mi easy -> 480 / 1.19 = 403.4 -> 403 s/mi.
  assertEquals(deriveThresholdFromEasySecPerMi(480), 403);
});

Deno.test('derivation REFUSES rather than guesses on unusable input', () => {
  for (const bad of [null, undefined, 0, -1, NaN, Infinity]) {
    assertEquals(deriveThresholdFromEasySecPerMi(bad as number), null, `input ${String(bad)}`);
  }
});

Deno.test('a derivation outside the sane band is REFUSED, not clamped into it', () => {
  // 25:00/mi "easy" derives 1260 s/mi — past the 1200 ceiling. A number we would not read is a
  // number we must not write. (LAW 2: no fabrication to fill a hole.)
  assertEquals(deriveThresholdFromEasySecPerMi(1500), null);
  // 3:00/mi easy derives 151 s/mi — below the 180 floor. Same refusal, other end.
  assertEquals(deriveThresholdFromEasySecPerMi(180), null);
  // And the band's inside edge still answers, so the refusal is a band and not an off switch.
  assert(deriveThresholdFromEasySecPerMi(1400) != null);
});

Deno.test('floor and derivation are the SAME number — one constant, one rounding', () => {
  for (const easy of [400, 500, 600, 700, 800, 900]) {
    assertEquals(thresholdFloorSecPerMi(easy), deriveThresholdFromEasySecPerMi(easy), `easy ${easy}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE BAND — the invariant itself, and it has TWO edges
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('BAND, fast edge: a candidate faster than the ratio allows is replaced', () => {
  // Easy 12:00/mi (720) -> floor 605 s/mi (10:05/mi). A 8:00/mi (480) candidate is far too fast.
  const r = boundInferredThresholdSecPerMi(480, 720);
  assertEquals(r.sec_per_mi, 605);
  assertEquals(r.replaced, true);
});

Deno.test('BAND, inside: a coherent candidate passes through UNTOUCHED — the 5K still wins', () => {
  // Easy 9:30/mi (570) -> floor 479. A 8:15/mi (495) threshold respects it: a race time is a
  // PERFORMANCE and stays the sharper anchor when it is not contradicted.
  const r = boundInferredThresholdSecPerMi(495, 570);
  assertEquals(r.sec_per_mi, 495);
  assertEquals(r.replaced, false);
});

Deno.test('BAND, fast edge is INCLUSIVE: exactly on the derived value is plausible', () => {
  const floor = thresholdFloorSecPerMi(720)!;
  const r = boundInferredThresholdSecPerMi(floor, 720);
  assertEquals(r.sec_per_mi, floor);
  assertEquals(r.replaced, false);
});

Deno.test('BAND, fast edge carries ±4%: the table\'s OWN pairs are never judged implausible', () => {
  // ⛔ THE FALSE POSITIVE THIS TOLERANCE EXISTS FOR, and a fixture sweep found it, not a mutation.
  // Every (base, steady) pair below is one row of PACE_TABLE — an athlete sitting exactly on the
  // app's own model, with a perfectly fresh 5K. A bound at a flat 1.19 rejected the slow rows
  // (whose true ratio is 1.196) by ~3 s/mi, replaced a correct number, and then told the athlete on
  // screen it had been "worked out from your easy pace". A bound tighter than the table it came
  // from will always do that.
  const rows: [number, number][] = [
    [744, 622], [708, 592], [672, 564], [642, 538], [612, 514], [585, 491], [560, 470],
    [536, 450], [525, 441], [514, 432], [494, 415], [474, 399], [456, 383], [439, 369],
    [423, 355], [408, 343], [394, 331], [362, 304], [334, 280], [309, 260], [287, 241],
  ];
  for (const [base, steady] of rows) {
    const r = boundInferredThresholdSecPerMi(steady, base);
    assertEquals(r.replaced, false, `easy ${base} / threshold ${steady} — the app's own table row was replaced`);
    assertEquals(r.sec_per_mi, steady);
  }
});

Deno.test('BAND, fast edge: the tolerance is a tolerance, not an off switch', () => {
  // easy 720 -> derived 605 -> fast edge 605 x 0.96 = 580.8. Either side of it must differ.
  assertEquals(boundInferredThresholdSecPerMi(585, 720).replaced, false);   // inside the tolerance
  assertEquals(boundInferredThresholdSecPerMi(575, 720).replaced, true);    // past it
  // And a value well past it comes back AT the derivation, not at the tolerated edge — the answer
  // is the athlete's own easy pace, not the widest number we would still have accepted.
  assertEquals(boundInferredThresholdSecPerMi(480, 720).sec_per_mi, thresholdFloorSecPerMi(720));
});

Deno.test('BAND, slow edge: a candidate SLOWER THAN EASY is not a threshold reading', () => {
  // ⛔ THE BUG THAT STARTED THIS, ARRIVING BY THE OTHER DOOR. The learner was taught to refuse a
  // threshold slower than easy; the INFERENCE path had no such rule, so a 5K incoherent enough to
  // imply a threshold slower than the athlete's own easy running sailed straight through. Caught by
  // the sweep, not by hand.
  const r = boundInferredThresholdSecPerMi(800, 744);
  assertEquals(r.sec_per_mi, thresholdFloorSecPerMi(744));
  assertEquals(r.replaced, true);
});

Deno.test('BAND, slow edge is EXCLUSIVE: equal to easy is already impossible', () => {
  const r = boundInferredThresholdSecPerMi(744, 744);
  assertEquals(r.sec_per_mi, thresholdFloorSecPerMi(744));
  assertEquals(r.replaced, true);
});

Deno.test('BAND: between the edges nothing is touched, even well off the ratio', () => {
  // easy 744 -> derived 625. A 700 s/mi candidate is nowhere near 1.19 but IS faster than easy, so
  // it is physiologically possible and the athlete's own 5K keeps it. The band is a plausibility
  // check, not a demand that every athlete sit exactly on the table.
  const r = boundInferredThresholdSecPerMi(700, 744);
  assertEquals(r.sec_per_mi, 700);
  assertEquals(r.replaced, false);
});

Deno.test('BAND: no measured easy pace means NO BAND — and no fabrication', () => {
  // LAW 2. With no reference there is nothing to measure against; the candidate is not touched and
  // a ceiling is not invented for it.
  const r = boundInferredThresholdSecPerMi(480, null);
  assertEquals(r.sec_per_mi, 480);
  assertEquals(r.replaced, false);
});

Deno.test('BAND: no candidate stays no candidate', () => {
  assertEquals(boundInferredThresholdSecPerMi(null, 720).sec_per_mi, null);
  assertEquals(boundInferredThresholdSecPerMi(0, 720).sec_per_mi, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE INVARIANT ACROSS EVERY ATHLETE — not tuned to one
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('SWEEP: across the whole pace table, a measured easy pace plus a typed 5K resolve NO threshold (2026-09-02: learned or entered only)', () => {
  // PACE_TABLE's `base` column, vdot 30 (a 31-minute 5K) to vdot 80 (elite), against every 5K pace
  // from absurdly fast to absurdly slow. Neither is a threshold tier any more. The derivation helper
  // itself is still exercised by the pure tests above; the RESOLVER never calls it.
  const easyPaces = [744, 708, 672, 642, 612, 585, 560, 536, 514, 494, 474, 456, 439, 423, 408, 394, 362, 334, 309, 287];
  for (const easy of easyPaces) {
    for (const fiveK of [160, 220, 280, 340, 400, 460, 520, 580, 640, 700, 780, 880]) {
      const r = resolveCurrentRunThresholdPace({
        learned_fitness: easyLearned(easy),
        performance_numbers: { fiveK_pace: fiveK },
      });
      assertEquals(r.sec_per_mi, null, `easy ${easy} 5K ${fiveK}: something derived a threshold`);
      assertEquals(r.source, null);
    }
  }
});

Deno.test('SWEEP: the ratio holds the derived value inside the band the app calls noise', () => {
  // The defence of a single flat 1.19 instead of a VDOT lookup: PACE_TABLE's own base/steady runs
  // 1.1880..1.1961, so a flat constant is at most ~0.7% off — well inside the ±4%
  // RUN_PACE_DIVERGENCE_THRESHOLD the app already tolerates. If the table ever changes enough to
  // break this, the constant must be re-measured, not nudged.
  const rows: [number, number][] = [
    [744, 622], [708, 592], [672, 564], [642, 538], [612, 514], [585, 491], [560, 470],
    [536, 450], [525, 441], [514, 432], [494, 415], [474, 399], [456, 383], [439, 369],
    [423, 355], [408, 343], [394, 331], [362, 304], [334, 280], [309, 260], [287, 241],
  ];
  for (const [base, steady] of rows) {
    const derived = deriveThresholdFromEasySecPerMi(base)!;
    const errPct = Math.abs(derived - steady) / steady;
    assert(errPct < 0.04, `easy ${base}: derived ${derived} vs table ${steady} = ${(errPct * 100).toFixed(2)}% off`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// THE RESOLVER TIERS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('a typed 5K alone gives NO threshold — there is no 5K tier (2026-09-02)', () => {
  const r = resolveCurrentRunThresholdPace({ performance_numbers: { fiveK_pace: 475 } });
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
});

Deno.test('a stale 5K cannot prescribe anything — THE JOB, now by construction', () => {
  // Measured easy 12:35/mi across 10 runs; a 5K typed long ago that USED TO imply a 8:58/mi
  // threshold (the 2026-08-19 report). Since 2026-09-02 the 5K has no tier and the easy pace derives
  // nothing: the athlete has no threshold, and the session says so rather than prescribing 8:58.
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: easyLearned(755),
    performance_numbers: { fiveK_pace: 518 },
  });
  assertEquals(r.sec_per_mi, null);
  assertEquals(describeThresholdBasis(r).state, 'unknown');
});

Deno.test('the measured easy pace alone derives NOTHING — it is checkpoint evidence, not a threshold (2026-09-02)', () => {
  const r = resolveCurrentRunThresholdPace({ learned_fitness: easyLearned(600) });
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.source, null);
  // The helper still answers for the checkpoint; the resolver does not call it.
  assertEquals(deriveThresholdFromEasySecPerMi(600), 504);
});

Deno.test('the bound helper still holds a candidate to the easy band — even though the resolver has no candidate tier left', () => {
  // `boundInferredThresholdSecPerMi` is kept for the checkpoint (a proposed threshold is a
  // candidate). With a measured easy of 755, a 400 candidate is held to the floor.
  const b = boundInferredThresholdSecPerMi(400, 755);
  assertEquals(b.replaced, true);
  assertEquals(b.sec_per_mi, thresholdFloorSecPerMi(755));
});

Deno.test('a LOW-confidence easy pace does not found the bound', () => {
  // The learner saying "not confident yet" is not a base to bound a prescription with.
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: easyLearned(755, 'low', 2),
    performance_numbers: { fiveK_pace: 518 },
  });
  // A thin easy pace founds nothing, and the 5K has no tier: nothing, honestly.
  assertEquals(r.sec_per_mi, null);
});

Deno.test('a MEASURED threshold outranks the derivation and is never bounded', () => {
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: {
      ...easyLearned(600),
      run_threshold_pace_sec_per_km: { value: miToKm(520), confidence: 'high', sample_count: 6, as_of: '2026-08-10' },
    },
  });
  assertEquals(r.sec_per_mi, 520);
  assertEquals(r.source, 'learned');
  assertEquals(r.is_estimate, false);
});

Deno.test('a TYPED threshold is an ASSERTION — never silently clamped', () => {
  // Easy 12:00/mi -> floor 605. The athlete typed 8:00/mi (480), which crosses it. We do NOT edit
  // a person's own number behind their back; the disagreement surfaces as the retest flag instead.
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: easyLearned(720),
    performance_numbers: { threshold_pace_sec_per_mi: 480 },
  });
  assertEquals(r.sec_per_mi, 480);
  assertEquals(r.source, 'manual');
  assertEquals(r.is_estimate, false);
});

Deno.test('the athlete\'s explicit choice still outranks everything (Q-174 unbroken)', () => {
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: easyLearned(720),
    performance_numbers: { threshold_pace_sec_per_mi: 480, threshold_pace_source: 'manual' },
  });
  assertEquals(r.sec_per_mi, 480);
  assertEquals(r.source, 'manual-chosen');
});

Deno.test('a LOW-confidence measured threshold is what the athlete gets when it is all there is — labelled thin (2026-09-02)', () => {
  // The easy-pace derivation used to outrank this. It is gone: learned or entered, full stop. A
  // thin learned threshold is still MEASURED, and `describeThresholdBasis` says it is thin.
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: {
      ...easyLearned(755),
      run_threshold_pace_sec_per_km: { value: miToKm(884), confidence: 'low', sample_count: 2 },
    },
  });
  assertEquals(r.source, 'learned-low');
  assertEquals(r.sec_per_mi, 884);
  assert(describeThresholdBasis(r).note != null, 'a thin read was presented with no caveat');
});

Deno.test('learned-low still answers when there is nothing to derive from', () => {
  const r = resolveCurrentRunThresholdPace({
    learned_fitness: { run_threshold_pace_sec_per_km: { value: miToKm(520), confidence: 'low', sample_count: 2 } },
  });
  assertEquals(r.sec_per_mi, 520);
  assertEquals(r.source, 'learned-low');
});

Deno.test('nothing on file resolves to NOTHING — never a literal', () => {
  const r = resolveCurrentRunThresholdPace({});
  assertEquals(r.sec_per_mi, null);
  assertEquals(r.sec_per_km, null);
  assertEquals(r.source, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE THREE STATES — said plainly rather than picked silently
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('STATE 1 — measured', () => {
  const b = describeThresholdBasis(resolveCurrentRunThresholdPace({
    learned_fitness: { run_threshold_pace_sec_per_km: { value: miToKm(520), confidence: 'high', sample_count: 6 } },
  }));
  assertEquals(b.state, 'measured');
  assertEquals(b.showNumber, true);
  assertEquals(b.note, null);
});

Deno.test('STATE 1 — measured but thin says so', () => {
  const b = describeThresholdBasis(resolveCurrentRunThresholdPace({
    learned_fitness: { run_threshold_pace_sec_per_km: { value: miToKm(520), confidence: 'low', sample_count: 2 } },
  }));
  assertEquals(b.state, 'measured');
  assert(b.note != null, 'a two-run read was presented with no caveat');
});

Deno.test('STATE 2 is GONE — a measured easy pace plus a 5K is state 3, no number (2026-09-02)', () => {
  const b = describeThresholdBasis(resolveCurrentRunThresholdPace({
    learned_fitness: easyLearned(755),
    performance_numbers: { fiveK_pace: 518 },
  }));
  assertEquals(b.state, 'unknown');
  assertEquals(b.showNumber, false);
});

Deno.test('STATE 3 — not enough data, and NO NUMBER IS SHOWN', () => {
  const b = describeThresholdBasis(resolveCurrentRunThresholdPace({}));
  assertEquals(b.state, 'unknown');
  assertEquals(b.showNumber, false);
});

Deno.test('a null/absent resolution is state 3, not a crash', () => {
  assertEquals(describeThresholdBasis(null).state, 'unknown');
  assertEquals(describeThresholdBasis(undefined).state, 'unknown');
});

Deno.test('the typed and 5K states are distinct sentences, and neither says measured', () => {
  const stated = describeThresholdBasis(resolveCurrentRunThresholdPace({
    performance_numbers: { threshold_pace_sec_per_mi: 480 },
  }));
  assertEquals(stated.state, 'stated');
  // There is no 5K state any more; a 5K alone is state 3, no number.
  const fromFiveK = describeThresholdBasis(resolveCurrentRunThresholdPace({ performance_numbers: { fiveK_pace: 475 } }));
  assertEquals(fromFiveK.state, 'unknown');
  assertEquals(fromFiveK.showNumber, false);
  assert(!/measured/i.test(stated.label), `"${stated.label}" claims to be measured`);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUTATIONS RUN 2026-08-19 — ALL 16 KILLED. Baseline 31/31. Re-run on any edit.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE SWEEP FOUND A REAL HOLE BEFORE THE MUTATIONS DID, and that is worth recording: the bound
 * was first written as a FLOOR only (too fast). A 5K implying a threshold SLOWER than the athlete's
 * measured easy pace sailed through it — the original bug, arriving by the inference door instead
 * of the learner door. No hand-written fixture caught it. The full-range sweep did, on its first
 * run. That is the argument for sweeping a range rather than asserting one athlete's numbers.
 *
 *   #   mutation                                                        failed
 *  ---  --------------------------------------------------------------  ------
 *   1   `boundInferredThresholdSecPerMi` always returns the candidate      6
 *   2   fast edge flipped to `candidate <= derived`                        5
 *   3   slow edge dropped (`candidate >= derived` only)                    3
 *   4   `derived-from-easy` tier deleted from the resolver                 2
 *   5   replaced tier keeps the `effort_paces` name                        3
 *   6   `steady` removed from the wizard read                              5
 *   7   the bound founded on the RESOLVED easy pace (circularity)          2
 *   8   `low` confidence accepted as a base for the bound                  1
 *   9   the `manual` (typed) tier bounded too                              1
 *  10   sane band clamps into range instead of refusing                    1
 *  11   ratio changed to 1.10                                             6
 *  12   ratio changed to 1.30                                             5
 *  13   `unknown` state returns `showNumber: true`                         1
 *  14   derived state's `note` dropped                                     1
 *  15   derived state labelled "Measured from your easy pace"              1
 *  16   derived tier moved BELOW `learned-low`                             1
 *  17   the ±4% tolerance removed (bare 1.19 bound)                        2
 *  18   tolerance widened to 20% (an off switch)                           3
 *  19   tolerance also applied to the SLOW edge                            2
 *  20   replacement returns the tolerated edge, not the derivation         5
 *
 * ⛔ #17-20 EXIST BECAUSE A FIXTURE SWEEP, NOT A MUTATION, FOUND THE BUG THEY GUARD. Running four
 * synthetic athletes end to end showed a SLOW athlete with a perfectly fresh 5K having it replaced
 * by three seconds per mile and relabelled "worked out from your easy pace" — because a flat 1.19
 * bound is tighter than the 1.188..1.196 table it was measured from. Neither the hand fixtures nor
 * the first sixteen mutations caught it. Sweep the range AND run the thing end to end; they fail
 * differently.
 */

Deno.test('no easy pace of any kind — measured, typed, or chosen — resolves a threshold (Q-174 superseded, 2026-09-02)', () => {
  const both = {
    learned_fitness: { run_easy_pace_sec_per_km: { value: 761 / SEC_PER_KM_TO_SEC_PER_MI, confidence: 'high', sample_count: 18 } },
    performance_numbers: { easyPace: '11:30', easy_pace_source: 'manual' },
  };
  assertEquals(resolveCurrentRunThresholdPace(both as never).sec_per_mi, null);
  assertEquals(resolveCurrentRunThresholdPace({ performance_numbers: { easyPace: '10:00' } } as never).sec_per_mi, null);
});
