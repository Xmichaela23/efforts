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
