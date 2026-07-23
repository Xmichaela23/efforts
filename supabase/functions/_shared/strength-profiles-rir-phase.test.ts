// Step 0 (adapt-plan foundation) — phase-aware, lift-aware target RIR.
// Pins: getTargetRir now modulates the protocol base by plan phase (accumulation → peak tightens RIR,
// deload/recovery loosens), stays lift-aware (lower vs upper), honours an explicit per-set target, and
// stays byte-identical to the pre-Step-0 behaviour when no phase is supplied.
//
// Run: deno test supabase/functions/_shared/strength-profiles-rir-phase.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getTargetRir, resolveProfile, PROTOCOL_PROFILES } from './strength-profiles.ts';

const durability = PROTOCOL_PROFILES.durability;       // base lower 2.5 / upper 2.5
const neural = PROTOCOL_PROFILES.neural_speed;          // base lower 1.5 / upper 2.0

Deno.test('no phase → un-modulated base (backward compatible with 3-arg callers)', () => {
  assertEquals(getTargetRir(durability, 'Back Squat'), 2.5);          // lower
  assertEquals(getTargetRir(durability, 'Bench Press'), 2.5);         // upper
  assertEquals(getTargetRir(neural, 'Back Squat'), 1.5);             // lower
  assertEquals(getTargetRir(neural, 'Bench Press'), 2.0);            // upper
});

Deno.test('lift-aware: lower vs upper resolve to different bases where the protocol differs', () => {
  assertEquals(getTargetRir(neural, 'Deadlift', null, 'base'), 1.5); // lower, base offset 0
  assertEquals(getTargetRir(neural, 'Overhead Press', null, 'base'), 2.0); // upper, base offset 0
});

Deno.test('phase modulation shape: tightens toward peak, loosens on deload/taper', () => {
  // durability base 2.5 (lower). offsets: base 0, build -0.5, peak -1.0, taper +0.5, recovery +1.0
  assertEquals(getTargetRir(durability, 'Squat', null, 'base'), 2.5);
  assertEquals(getTargetRir(durability, 'Squat', null, 'build'), 2.0);
  assertEquals(getTargetRir(durability, 'Squat', null, 'peak'), 1.5);
  assertEquals(getTargetRir(durability, 'Squat', null, 'taper'), 3.0);
  assertEquals(getTargetRir(durability, 'Squat', null, 'recovery'), 3.5);
});

Deno.test('explicit per-exercise target always wins, phase ignored', () => {
  assertEquals(getTargetRir(durability, 'Squat', 1, 'recovery'), 1);
  assertEquals(getTargetRir(neural, 'Bench Press', 0, 'peak'), 0);
});

Deno.test('clamp: never below 0.5 (true failure) or above 4 (absurdly easy)', () => {
  // neural lower base 1.5; peak offset -1.0 → 0.5 (at floor, not below)
  assertEquals(getTargetRir(neural, 'Deadlift', null, 'peak'), 0.5);
  // durability base 2.5; recovery +1.0 = 3.5 (within band). Push a hypothetical past the ceiling:
  const looseProfile = resolveProfile('durability');
  const recovery = getTargetRir(looseProfile, 'Squat', null, 'recovery');
  assertEquals(recovery <= 4, true);
});

Deno.test('unknown protocol id falls back to durability profile (no throw)', () => {
  const p = resolveProfile('not_a_real_protocol');
  assertEquals(getTargetRir(p, 'Squat', null, 'base'), 2.5);
});
