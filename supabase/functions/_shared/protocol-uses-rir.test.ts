/**
 * RIR IS OFF FOR ONE PROTOCOL AND ONE ONLY.
 *
 * Strength Focus (Wendler 5/3/1) is deterministic: the working number and the reps are fixed at plan
 * creation, and the only thing that overrides them is a hard rep count on the week-3 check set. The
 * engine never reads a reserve estimate to make a decision there, so no target is stamped, the
 * logger does not ask, and nothing is stored.
 *
 * ⛔ THE SCOPE IS THE POINT OF THIS FILE. Every other protocol auto-regulates and keeps RIR exactly
 * as it was. If a later change flips one of them off — by editing the default, by copying the
 * `strength_primary` block as a template, or by making `usesRir` opt-IN — this fails.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PROTOCOL_PROFILES, protocolUsesRir, resolveProfile } from './strength-profiles.ts';

Deno.test('exactly one protocol opts out of RIR, and it is Strength Focus', () => {
  const off = Object.entries(PROTOCOL_PROFILES)
    .filter(([, p]) => !protocolUsesRir(p))
    .map(([id]) => id);
  assertEquals(off, ['strength_primary']);
});

Deno.test('every other protocol still auto-regulates — untouched', () => {
  for (const [id, profile] of Object.entries(PROTOCOL_PROFILES)) {
    if (id === 'strength_primary') continue;
    assertEquals(protocolUsesRir(profile), true, `${id} lost its RIR targets`);
  }
});

Deno.test('the default is ON — a profile that says nothing keeps RIR', () => {
  // Opt-OUT, not opt-in. A new protocol added without thinking about this keeps the existing
  // behaviour rather than silently losing its effort targets.
  assertEquals(protocolUsesRir({ defaultTargetRir: { lower: 2, upper: 2 } } as any), true);
  assertEquals(protocolUsesRir(null), true);
  assertEquals(protocolUsesRir(undefined), true);
});

Deno.test('an unrecognised protocol id falls back to a profile that DOES use RIR', () => {
  // `resolveProfile` returns `durability` for anything it does not know (Q-192). That fallback must
  // never be the one with RIR off, or a missing registry entry would silently strip effort targets
  // from a plan that needs them — the same silence, pointed at a new victim.
  assertEquals(protocolUsesRir(resolveProfile('a_protocol_that_does_not_exist')), true);
  assertEquals(protocolUsesRir(resolveProfile(null)), true);
});
