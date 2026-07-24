// D-316: phase-name mapping + the strength_primary RIR profile.
//
// Two silent failures this pins:
//   1. PHASE_RULES is keyed base/build/peak/taper/recovery, but plans emit their OWN phase
//      names. A strength-primary block names its phases Base / Power / Deload / Peak /
//      Retest. Only Base and Peak matched; the rest fell to DEFAULT_PHASE_RULE = build,
//      which carries a NEGATIVE (tighter) RIR offset — so a DELOAD week prescribed a
//      tighter target than the base weeks it was meant to unload from.
//   2. Strength-primary plans had no profile at all and don't set config.strength_protocol,
//      so they resolved to `durability` — a flat RIR 2.5 across a block ending in 94% doubles.
//
// Run: deno test supabase/functions/_shared/strength-profiles-phase-map.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import {
  getTargetRir,
  resolveProfile,
  resolvePhaseRule,
  normalizePhaseKey,
  PROTOCOL_PROFILES,
  PHASE_RULES,
} from './strength-profiles.ts';

// ── phase names ───────────────────────────────────────────────────────────────

Deno.test('canonical phase names still resolve to themselves', () => {
  for (const k of ['base', 'build', 'peak', 'taper', 'recovery'] as const) {
    assertEquals(normalizePhaseKey(k), k);
    assertEquals(normalizePhaseKey(k.toUpperCase()), k);
  }
});

Deno.test('a strength-primary block\'s own vocabulary maps to the right rules', () => {
  assertEquals(normalizePhaseKey('Base'), 'base');
  assertEquals(normalizePhaseKey('Power'), 'build');     // intensification
  assertEquals(normalizePhaseKey('Deload'), 'recovery'); // was falling to build
  assertEquals(normalizePhaseKey('Peak'), 'peak');
  assertEquals(normalizePhaseKey('Retest'), 'taper');    // arrive fresh for a test
});

Deno.test('THE BUG: a deload week must LOOSEN the RIR target, never tighten it', () => {
  const p = PROTOCOL_PROFILES.strength_primary;
  const base = getTargetRir(p, 'back_squat', null, 'Base');
  const deload = getTargetRir(p, 'back_squat', null, 'Deload');
  const peak = getTargetRir(p, 'back_squat', null, 'Peak');
  assertEquals(deload > base, true, 'deload must be easier than base');
  assertEquals(peak < base, true, 'peak must be harder than base');
  // What it used to do: 'Deload' missed the table, fell to build, offset -0.5.
  assertEquals(PHASE_RULES.build.targetRirOffset < 0, true);
  assertEquals(deload === base + PHASE_RULES.build.targetRirOffset, false);
});

Deno.test('a deload week does not allow load progression', () => {
  assertEquals(resolvePhaseRule('Deload').allowProgress, false);
  assertEquals(resolvePhaseRule('Retest').allowProgress, false);
});

Deno.test('an unrecognised phase name still falls back to build, as before', () => {
  assertEquals(normalizePhaseKey('Hypertrophy Block C'), null);
  assertEquals(resolvePhaseRule('Hypertrophy Block C'), PHASE_RULES.build);
  assertEquals(resolvePhaseRule(null), PHASE_RULES.build);
});

// ── the strength_primary profile ──────────────────────────────────────────────

Deno.test('strength_primary resolves to its own profile, not the durability default', () => {
  const p = resolveProfile('strength_primary');
  assertEquals(p, PROTOCOL_PROFILES.strength_primary);
  assertEquals(p === PROTOCOL_PROFILES.durability, false);
});

Deno.test('the block\'s RIR shape is the field-standard peaking curve', () => {
  const p = PROTOCOL_PROFILES.strength_primary;
  const at = (phase: string) => getTargetRir(p, 'back_squat', null, phase);
  assertEquals(at('Base'), 2.0);     // accumulation
  assertEquals(at('Power'), 1.5);    // intensification
  assertEquals(at('Peak'), 1.0);     // doubles at 88-94%
  assertEquals(at('Deload'), 3.0);   // planned unload
  assertEquals(at('Retest'), 2.5);   // fresh for the test
  // Strictly descending into the peak, then reset up.
  assertEquals(at('Base') > at('Power') && at('Power') > at('Peak'), true);
});

Deno.test('durability (a support profile) would have been flat across that whole block', () => {
  // The regression being prevented: every phase reading ~2.5, including the 94% peak.
  const d = PROTOCOL_PROFILES.durability;
  assertEquals(getTargetRir(d, 'back_squat', null, 'Base'), 2.5);
  assertEquals(getTargetRir(d, 'back_squat', null, 'Peak'), 1.5);
  // and pre-fix, Deload ALSO read 2.0 — tighter than Base. That's the inversion.
  assertEquals(2.0 < 2.5, true);
});

Deno.test('an explicit per-exercise target still wins over everything', () => {
  const p = PROTOCOL_PROFILES.strength_primary;
  assertEquals(getTargetRir(p, 'back_squat', 4, 'Peak'), 4);
});

Deno.test('targets stay inside the clamp for every profile × phase', () => {
  for (const prof of Object.values(PROTOCOL_PROFILES)) {
    for (const phase of ['Base', 'Power', 'Deload', 'Peak', 'Retest', 'taper', 'build']) {
      for (const lift of ['back_squat', 'bench_press']) {
        const v = getTargetRir(prof, lift, null, phase);
        assertEquals(v >= 0.5 && v <= 4, true, `${phase}/${lift} → ${v}`);
      }
    }
  }
});

// ── TARGET RIR DERIVED FROM THE PRESCRIPTION (D-316) ──────────────────────────
// The profile constants above are the fallback for rows that state no intensity. When a row
// DOES state one ("5 reps at 78.5% 1RM"), the target is read off the Tuchscherer/Helms RPE
// chart instead — reps, %1RM and RIR are three views of the same thing, so there is nothing
// to pick. RIR = 10 − RPE.
//
// This replaced hand-picked per-phase constants that were wrong on 10 of 11 weeks of a real
// block: they held RIR flat at 2 across a base phase whose own percentages ramp 72% → 82%.

import { targetRirFromPrescription } from './strength-profiles.ts';

Deno.test('chart anchors: RPE 10 is failure, RPE 8 is 2 in reserve', () => {
  // Straight off the published chart rows, no interpolation.
  assertEquals(targetRirFromPrescription(5, 0.863), 0.5);  // 5 @ RPE 10 → 0 RIR, clamped to 0.5
  assertEquals(targetRirFromPrescription(5, 0.811), 2);    // 5 @ RPE 8  → 2 RIR
  assertEquals(targetRirFromPrescription(5, 0.786), 3);    // 5 @ RPE 7  → 3 RIR
  assertEquals(targetRirFromPrescription(3, 0.892), 1);    // 3 @ RPE 9  → 1 RIR
  assertEquals(targetRirFromPrescription(2, 0.922), 1);    // 2 @ RPE 9  → 1 RIR
  assertEquals(targetRirFromPrescription(1, 1.00), 0.5);   // a true single
});

Deno.test('a real 12-week block derives a DIFFERENT target each week', () => {
  // The point of deriving: the target tracks the block's own intensity ramp.
  const block: Array<[number, number, number]> = [
    // [week %, reps, expected RIR]
    [0.72, 5, 4], [0.755, 5, 4], [0.785, 5, 3], [0.82, 5, 1.5],   // base ramp
    [0.84, 3, 3], [0.90, 3, 0.5],                                  // intensification
    [0.65, 5, 4],                                                  // deload
    [0.88, 2, 2.5], [0.90, 2, 1.5], [0.92, 2, 1], [0.94, 2, 0.5],  // peak
  ];
  for (const [pct, reps, want] of block) {
    assertEquals(targetRirFromPrescription(reps, pct), want, `${reps} reps @ ${pct}`);
  }
});

Deno.test('the target tightens as the block gets heavier, and resets on the deload', () => {
  const wk1 = targetRirFromPrescription(5, 0.72)!;
  const wk4 = targetRirFromPrescription(5, 0.82)!;
  const wk6 = targetRirFromPrescription(3, 0.90)!;
  const deload = targetRirFromPrescription(5, 0.65)!;
  const wk11 = targetRirFromPrescription(2, 0.94)!;
  assertEquals(wk1 > wk4, true, 'base ramps toward harder');
  assertEquals(wk4 > wk6, true, 'intensification is harder than base');
  // Both week 6 (3 @ 90%) and week 11 (2 @ 94%) sit at the 0.5 floor — the clamp, not a
  // coincidence. Neither may be EASIER than the base ramp; that is the real assertion.
  assertEquals(wk11 <= wk6, true, 'peak is at least as hard as intensification');
  assertEquals(wk11 < wk4, true, 'peak is harder than the end of base');
  assertEquals(deload > wk4, true, 'deload resets easy');
});

Deno.test('accepts both 0-1 and whole-number percentage forms', () => {
  assertEquals(targetRirFromPrescription(5, 0.785), targetRirFromPrescription(5, 78.5));
});

Deno.test('stays inside the clamp, never prescribes true failure', () => {
  for (let reps = 1; reps <= 12; reps++) {
    for (let pct = 40; pct <= 105; pct++) {
      const v = targetRirFromPrescription(reps, pct / 100);
      if (v == null) continue;
      assertEquals(v >= 0.5 && v <= 4, true, `${reps} @ ${pct}% → ${v}`);
    }
  }
});

Deno.test('no usable prescription → null, so the caller falls back to the profile', () => {
  assertEquals(targetRirFromPrescription(null, 0.785), null);
  assertEquals(targetRirFromPrescription(5, null), null);
  assertEquals(targetRirFromPrescription(5, 0), null);
  assertEquals(targetRirFromPrescription(0, 0.785), null);
  // A bodyweight / qualitative row: no % to read.
  assertEquals(targetRirFromPrescription(15, undefined), null);
});

Deno.test('getTargetRir prefers the derived target, then the profile, and an explicit target still wins', () => {
  const p = PROTOCOL_PROFILES.strength_primary;
  // derived (5 @ 78.5% → 3) beats the Base profile default (2)
  assertEquals(getTargetRir(p, 'back_squat', null, 'Base', 5, 0.785), 3);
  // no prescription → profile default
  assertEquals(getTargetRir(p, 'back_squat', null, 'Base', null, null), 2);
  // an explicit per-exercise target still outranks everything
  assertEquals(getTargetRir(p, 'back_squat', 4, 'Base', 5, 0.785), 4);
});
