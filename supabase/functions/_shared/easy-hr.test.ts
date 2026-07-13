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
