/**
 * Fixtures for the ONE run easy-HR band (Q-169, docs/DESIGN-run-easy-pace-truth.md).
 *
 * Athlete-agnostic: the athletes below are SYNTHETIC HR profiles, not the primary user
 * ([[feedback_user_agnostic_design]] — he is the builder AND the guinea pig; his baselines are a
 * construction site, so no threshold is tuned to them). The ONE real-shaped case is kept because it is
 * the shape that proved the gate was STRUCTURALLY dead (0 of 77), and it must never silently regress.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveRunEasyHrBand,
  isEasyHr,
  EASY_CEILING_PCT_LTHR,
  EASY_CEILING_PCT_MAXHR,
  runEasyPaceEligible,
  MIN_EASY_PACE_IN_BAND_S,
  MIN_EASY_RUN_MINUTES,
  runEasyZone3FloorBpm,
} from './easy-hr.ts';

const lf = (o: Record<string, unknown>) => o;
const metric = (value: number, confidence = 'high') => ({ value, confidence, sample_count: 5 });

// The OLD gate, kept so every fixture can prove what it used to do.
const OLD_GATE = (maxHr: number) => maxHr * 0.75;

// ═══ THE REGRESSION THAT STARTED IT ALL ═══════════════════════════════════
Deno.test('Q-169: the athlete whose easy runs ALL failed the old gate now qualifies', () => {
  // Shape: LTHR 151, observed max 174. Genuine easy runs (RPE 2-3) at 133-141 bpm.
  const band = resolveRunEasyHrBand(lf({
    run_threshold_hr: metric(151, 'medium'),
    run_max_hr_observed: metric(174, 'high'),
  }));

  assertEquals(band.anchor, 'lthr');
  assertEquals(band.ceiling, 134);   // 0.89 × 151 — Friel Z2 top
  assertEquals(band.floor, 106);     // 0.70 × 151

  // The OLD gate was 130.5 bpm. Every one of these easy runs failed it.
  assertEquals(Math.round(OLD_GATE(174)), 131);

  // Now they pass — the runs that are genuinely easy:
  for (const hr of [133, 134]) {
    assertEquals(isEasyHr(hr, band), true, `${hr} bpm is an easy run and must count`);
    assertEquals(hr > OLD_GATE(174), true, `${hr} bpm was EXCLUDED by the old 75%-of-max gate`);
  }
});

Deno.test('Q-169 NEG: a genuinely HARD run is still excluded — the gate got RIGHT, not just looser', () => {
  const band = resolveRunEasyHrBand(lf({
    run_threshold_hr: metric(151, 'medium'),
    run_max_hr_observed: metric(174, 'high'),
  }));
  // 141 bpm = 93% of LTHR = Friel Zone 3. That is NOT an easy run and must NOT pollute the easy-pace
  // learner. Being starved was the bug; being indiscriminate would be a worse one.
  assertEquals(isEasyHr(141, band), false);
  assertEquals(isEasyHr(151, band), false);   // AT threshold — definitively not easy
  assertEquals(isEasyHr(165, band), false);
});

Deno.test('Q-169 NEG: a walk / stopped strap is excluded by the FLOOR', () => {
  const band = resolveRunEasyHrBand(lf({ run_threshold_hr: metric(151) }));
  assertEquals(isEasyHr(90, band), false);    // below the 106 floor
  assertEquals(isEasyHr(105, band), false);
  assertEquals(isEasyHr(106, band), true);    // exactly the floor — inclusive
});

// ═══ The anchor: threshold first, %max bootstrap, honest null ═════════════
Deno.test('ANCHOR: LTHR wins when present, and the band says so', () => {
  const band = resolveRunEasyHrBand(lf({
    run_threshold_hr: metric(160, 'high'),
    run_max_hr_observed: metric(190, 'high'),
  }));
  assertEquals(band.anchor, 'lthr');
  assertEquals(band.ceiling, Math.round(160 * EASY_CEILING_PCT_LTHR)); // 142 — NOT 0.8 × 190 (152)
  assertEquals(band.confidence, 'high');
});

Deno.test('BOOTSTRAP: no LTHR yet (day-one athlete) → %max band, and it is flagged LOW confidence', () => {
  const band = resolveRunEasyHrBand(lf({ run_max_hr_observed: metric(190, 'high') }));
  assertEquals(band.anchor, 'max_hr');
  assertEquals(band.ceiling, Math.round(190 * EASY_CEILING_PCT_MAXHR)); // 152 — the field's 80%, not 75%
  assertEquals(band.floor, Math.round(190 * 0.65));                     // 124
  // An observed max is a RATCHET, not a measurement. It may never claim better than low (Law 3),
  // even though the max_hr metric itself says 'high'.
  assertEquals(band.confidence, 'low');
});

Deno.test('BOOTSTRAP: the corrected %max band admits athletes the old 75% ceiling excluded', () => {
  const band = resolveRunEasyHrBand(lf({ run_max_hr_observed: metric(174, 'high') }));
  assertEquals(band.ceiling, 139);              // 0.80 × 174
  assertEquals(isEasyHr(135, band), true);      // easy — and the old 130.5 gate threw it out
  assertEquals(135 > OLD_GATE(174), true);
});

Deno.test('LAW 2: no threshold AND no max → NULL. We do not know, so we do not invent.', () => {
  const band = resolveRunEasyHrBand(lf({}));
  assertEquals(band.anchor, 'none');
  assertEquals(band.ceiling, null);
  assertEquals(band.floor, null);
  assertEquals(isEasyHr(135, band), null);      // not `false` — UNKNOWN. The caller must disclose.
});

Deno.test('LAW 3: the basis string names the anchor, so the receipt can be rendered', () => {
  const l = resolveRunEasyHrBand(lf({ run_threshold_hr: metric(151, 'medium') }));
  assertEquals(l.basis.includes('threshold'), true);
  const m = resolveRunEasyHrBand(lf({ run_max_hr_observed: metric(174) }));
  assertEquals(m.basis.includes('estimated'), true);
  assertEquals(m.basis.includes('max'), true);
});

Deno.test('MANUAL: an explicitly-entered threshold HR is honored when nothing is learned', () => {
  const band = resolveRunEasyHrBand(lf({ run_max_hr_observed: metric(190) }), 160);
  assertEquals(band.anchor, 'lthr');            // manual threshold beats the %max bootstrap
  assertEquals(band.ceiling, Math.round(160 * EASY_CEILING_PCT_LTHR));
});

// ═══ The dead lookup that starved compute-facts ═══════════════════════════
Deno.test('THE DEAD PATH: `learned_fitness.running.threshold_hr` is NOT where threshold HR lives', () => {
  // compute-facts:1039 read this nested path. It has never existed. `thresholdHR` came back undefined,
  // the block never ran, and `pace_at_easy_hr` was null on 147 of 147 runs — which starved the D-033
  // reconciler's observed side. This fixture pins the real shape so the dead path cannot come back.
  const realShape = lf({ run_threshold_hr: metric(151, 'medium') });
  assertEquals((realShape as any).running, undefined);          // the nested path: does not exist
  assertEquals(resolveRunEasyHrBand(realShape).anchor, 'lthr'); // the real path: resolves
});

// ═══ Sweep: every athlete with an anchor gets a usable band ═══════════════
Deno.test('SWEEP: any athlete with an anchor gets a band; a floor always sits below its ceiling', () => {
  for (const lthr of [140, 151, 160, 175]) {
    for (const max of [170, 180, 190, 200]) {
      const band = resolveRunEasyHrBand(lf({
        run_threshold_hr: metric(lthr), run_max_hr_observed: metric(max),
      }));
      if (band.ceiling == null || band.floor == null) throw new Error(`no band for LTHR ${lthr}/max ${max}`);
      if (!(band.floor < band.ceiling)) throw new Error(`floor >= ceiling for LTHR ${lthr}`);
      // And the ceiling must always sit BELOW threshold — at threshold you are not running easy.
      if (!(band.ceiling < lthr)) throw new Error(`easy ceiling ${band.ceiling} is not below LTHR ${lthr}`);
    }
  }
});

// ═══ Q-171 — WHICH RUNS MAY SUPPLY A "PACE AT EASY HR" ════════════════════
// The band says which HEARTBEAT is easy. `runEasyPaceEligible` says which RUN is an easy run. Before it,
// compute-facts harvested easy-band samples from EVERY run behind a 10-SAMPLE floor, so an interval
// session's warm-up (slow) and the HR-lag opening of each rep (fast) both wrote a "pace at easy HR" for a
// HARD workout — straight into the D-033 reconciler that sets the plan's easy pace.

// Synthetic athlete: LTHR 150 -> easy band [105, 134].
const BAND = resolveRunEasyHrBand(lf({ run_threshold_hr: metric(150, 'high') }));

Deno.test('Q-171: a genuine easy run qualifies (the engine must still be FED)', () => {
  // 50 min at avg 128 bpm, 35 min of it in-band. This is the case that must never be gated away —
  // over-tightening here re-creates the Q-169 starvation the band was built to end.
  assertEquals(runEasyPaceEligible(128, 50, 35 * 60, BAND), true);
});

Deno.test('Q-171 REGRESSION: an interval session cannot supply an easy pace, however many in-band samples it has', () => {
  // The bug, exactly: a hard session (avg 152 bpm) whose warm-up + cool-down + HR-lag rep openings leave
  // 20 MINUTES of samples sitting inside the easy band. The old code (>=10 samples, no run-level gate)
  // wrote a pace_at_easy_hr for this workout. The run's OWN avg HR is above the easy ceiling -> it was
  // not an easy run -> it may not speak for easy pace.
  assertEquals(runEasyPaceEligible(152, 50, 20 * 60, BAND), false);
});

Deno.test('Q-171 REGRESSION: a tempo run is refused even though its avg HR is only just over the ceiling', () => {
  assertEquals(runEasyPaceEligible(140, 45, 30 * 60, BAND), false); // ceiling is 134
});

Deno.test('Q-171: the dwell floor is TIME, not sample count — a fragment is not a measurement', () => {
  // An easy run with only 9 minutes in-band. Under the old 10-SAMPLE floor this passed trivially.
  assertEquals(runEasyPaceEligible(128, 50, 9 * 60, BAND), false);
  assertEquals(runEasyPaceEligible(128, 50, 10 * 60, BAND), true); // exactly at MIN_EASY_PACE_IN_BAND_S
});

Deno.test('Q-171: the whole-run duration floor matches the BASELINE learner (>= 20 min)', () => {
  assertEquals(runEasyPaceEligible(128, 19, 15 * 60, BAND), false);
  assertEquals(runEasyPaceEligible(128, 20, 15 * 60, BAND), true);
});

Deno.test('Q-171: corrupt/missing HR abstains — never Number(null) === 0', () => {
  assertEquals(runEasyPaceEligible(null, 50, 30 * 60, BAND), false);
  assertEquals(runEasyPaceEligible(undefined, 50, 30 * 60, BAND), false);
  assertEquals(runEasyPaceEligible(0, 50, 30 * 60, BAND), false);
  // ...and so do missing duration / missing dwell.
  assertEquals(runEasyPaceEligible(128, null, 30 * 60, BAND), false);
  assertEquals(runEasyPaceEligible(128, 50, null, BAND), false);
});

Deno.test('Q-171: no band (no LTHR, no max HR) -> abstain, never guess', () => {
  const unknown = resolveRunEasyHrBand(lf({}));
  assertEquals(unknown.ceiling, null);
  assertEquals(runEasyPaceEligible(128, 50, 30 * 60, unknown), false);
});

Deno.test('Q-171: a walk / stopped-strap run is below the FLOOR and does not count as easy', () => {
  assertEquals(runEasyPaceEligible(95, 50, 30 * 60, BAND), false); // floor is 105
});

Deno.test('Q-171 LAW 1: observed and baseline qualify the SAME population', () => {
  // The D-033 reconciler compares baseline easy pace against observed easy pace. If the two sides gate
  // differently, it is comparing two different athletes. This pins the shared predicate: the baseline
  // learner's rule is `duration >= 20 && isEasyHr(avg_heart_rate) === true` — the observed side must
  // agree on every run, for the intensity+duration arms.
  const runs = [
    { avgHr: 128, min: 50 }, // easy
    { avgHr: 152, min: 50 }, // intervals
    { avgHr: 134, min: 45 }, // top of the band — easy
    { avgHr: 135, min: 45 }, // one bpm over — NOT easy
    { avgHr: 128, min: 15 }, // too short
  ];
  for (const r of runs) {
    const baselineQualifies = r.min >= 20 && isEasyHr(r.avgHr, BAND) === true;
    const observedQualifies = runEasyPaceEligible(r.avgHr, r.min, 30 * 60, BAND);
    assertEquals(observedQualifies, baselineQualifies, `run ${r.avgHr}bpm/${r.min}min diverged`);
  }
});

// ═══ Q-171 — LAW 2: AN INVENTED NUMBER MAY NOT ANCHOR THE BAND ════════════
Deno.test('Q-171 REGRESSION: a sample_count:0 "threshold" is a formula, not a measurement — it cannot anchor', () => {
  // learn-fitness-profile's last-resort branch writes run_threshold_hr = "88% of observed max (estimated)",
  // confidence low, sample_count 0. Accepting it made the band ANNOUNCE "Friel Z2 — at or below 89% of your
  // threshold HR" over a number nobody measured. And it is not conservative: 0.89 x 0.88 = 78% of max, so
  // the "threshold-anchored" band came out TIGHTER than the honest bootstrap — drifting back toward the
  // very Q-169 starvation it claims to cure.
  const maxHr = 180;
  const fabricated = { value: Math.round(maxHr * 0.88), confidence: 'low', sample_count: 0 };
  const band = resolveRunEasyHrBand(lf({
    run_threshold_hr: fabricated,
    run_max_hr_observed: metric(maxHr, 'high'),
  }));

  // It must fall through to the BOOTSTRAP and say so — not pose as a threshold anchor.
  assertEquals(band.anchor, 'max_hr');
  assertEquals(band.ceiling, Math.round(maxHr * EASY_CEILING_PCT_MAXHR)); // 144, the honest 80%
  // Prove the harm it would have done: the fabricated anchor is STRICTLY tighter than the bootstrap.
  const wouldHaveBeen = Math.round(fabricated.value * EASY_CEILING_PCT_LTHR); // 141
  const honest = band.ceiling as number;
  if (!(wouldHaveBeen < honest)) {
    throw new Error(`expected the fabricated anchor (${wouldHaveBeen}) to be tighter than the honest bootstrap (${honest})`);
  }
});

Deno.test('Q-171: a WEAK but MEASURED threshold still anchors — the gate is invented-vs-measured, not weak-vs-strong', () => {
  // The 95th-percentile fallback is low-confidence but derived from real sustained efforts (sample_count >= 3).
  const band = resolveRunEasyHrBand(lf({
    run_threshold_hr: { value: 150, confidence: 'low', sample_count: 4 },
    run_max_hr_observed: metric(180, 'high'),
  }));
  assertEquals(band.anchor, 'lthr');
  assertEquals(band.confidence, 'low'); // weak — and it says so (Law 3)
});

Deno.test('Q-171: an ABSENT sample_count is "not stated", not "measured nothing"', () => {
  // The in-pass synthetic band inside learn-fitness-profile passes no count. It must still anchor.
  const band = resolveRunEasyHrBand(lf({ run_threshold_hr: { value: 150, confidence: 'medium' } }));
  assertEquals(band.anchor, 'lthr');
});

// ═══ Q-171 — ONE FRIEL BOUNDARY: easy === Zone 1 or Zone 2, by construction ═
Deno.test('Q-171 REGRESSION: the analyzer Z3 floor and the easy ceiling cannot drift apart', () => {
  // They shipped 40 minutes apart with two independent roundings (134 vs 136 at LTHR 151), so a 135 bpm run
  // was Zone 2 on Details and NOT easy to the learner. Now the boundary IS the easy ceiling + 1.
  for (const lthr of [140, 145, 150, 151, 155, 160, 165, 170, 175]) {
    const band = resolveRunEasyHrBand(lf({ run_threshold_hr: metric(lthr, 'high') }));
    const z3 = runEasyZone3FloorBpm(lthr);
    assertEquals(z3, (band.ceiling as number) + 1, `LTHR ${lthr}: Z3 floor must be one bpm above the easy ceiling`);
    // The invariant that matters: every HR below the Z3 floor (and above the band floor) is EASY, and the
    // first heartbeat of Zone 3 is NOT. No crack, at any LTHR.
    assertEquals(isEasyHr(z3 - 1, band), true, `LTHR ${lthr}: the last bpm of Z2 must be easy`);
    assertEquals(isEasyHr(z3, band), false, `LTHR ${lthr}: the first bpm of Z3 must not be easy`);
  }
});
