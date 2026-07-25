import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PROTOCOL_PROFILES } from './strength-profiles.ts';
import { listProtocols, getProtocol } from '../shared/strength-system/protocols/selector.ts';
import { strengthDevelopersFor, defaultStrengthDeveloper, derivePlanShape } from '../../../src/lib/non-race-goal-seeds.ts';

// =============================================================================
// THE PROTOCOL REGISTRY MUST AGREE WITH ITSELF
// =============================================================================
// Q-192 (filed 2026-07-19) → hit again independently as `strength_primary` in the
// D-322 session → root-fixed NEITHER time. Twice found, still open. This is the test
// that ends the class rather than the instance.
//
// THE ROOT CAUSE IS STRUCTURAL, not a missing entry:
//   `resolveProfile()` returns the `durability` default for ANY key it does not
//   recognise. So a MISSING entry and a DELIBERATE choice are indistinguishable at
//   every call site — nothing throws, nothing logs, the athlete just silently gets a
//   flat RIR 2.5 for a whole block including the peak.
//
// THREE HAND-MAINTAINED LISTS have to agree, and nothing enforced it:
//   1. PICKABLE   — `strengthDevelopersFor()` / `defaultStrengthDeveloper()`  (src/lib/non-race-goal-seeds.ts)
//   2. BUILDABLE  — `listProtocols()` + the `getProtocol` switch               (protocols/selector.ts)
//   3. HAS A PROFILE — `PROTOCOL_PROFILES`                                     (_shared/strength-profiles.ts)
//
// Adding an entry ends one instance. This test ends the class: any future protocol
// that reaches an athlete without a profile fails here instead of in production.
// =============================================================================

const TIERS = ['full_barbell', 'dumbbell_based', 'bodyweight_bands'];

/**
 * Every protocol id an athlete can actually END UP WITH. Covers all three routes:
 *   1. the develop picker,
 *   2. the develop default when nothing is picked,
 *   3. the MAINTAIN posture — easy to forget, and forgetting it made `triathlon`
 *      look unreachable on the first run of this test when it plainly is not.
 */
function pickableProtocolIds(): string[] {
  const ids = new Set<string>();
  for (const tier of TIERS) {
    for (const d of strengthDevelopersFor(tier)) ids.add(d.id);
    for (const sport of ['run', 'bike', 'triathlon', 'other']) {
      ids.add(defaultStrengthDeveloper(sport, tier));
    }
    // Route 3: derivePlanShape covers develop AND maintain, per sport shape.
    for (const posture of ['develop', 'maintain'] as const) {
      for (const shape of [{ run: 'develop' }, { swim: 'develop', bike: 'develop', run: 'develop' }]) {
        const s = derivePlanShape({ ...shape, strength: posture } as never, undefined, tier)
          .strength_protocol;
        if (s) ids.add(s);
      }
    }
  }
  return [...ids].sort();
}

Deno.test('registry: every PICKABLE protocol has an entry in PROTOCOL_PROFILES', () => {
  const missing = pickableProtocolIds().filter((id) => !(id in PROTOCOL_PROFILES));
  assertEquals(
    missing,
    [],
    `Pickable protocols with NO profile — these silently resolve to 'durability' ` +
      `(flat RIR 2.5 for the whole block, peak included): ${missing.join(', ')}. ` +
      `Add them to PROTOCOL_PROFILES in _shared/strength-profiles.ts.`,
  );
});

// Buildable-but-UNREACHABLE protocols with no profile are latent, not live — nobody can
// be given one today. They carry the identical defect to Q-192 and would break the same way
// the moment anyone wires them up (Q-202 line 35). PIN them rather than fail: a permanently
// red test gets ignored, and this debt is deliberately deferred to the registry
// consolidation (ARCH-strength-spine.md §3.3 — "wire it up or delete it").
//
// The hard rule above (PICKABLE must have a profile) is what actually closes the class:
// the day one of these becomes reachable, THAT test goes red.
const KNOWN_UNPROFILED_UNREACHABLE = ['strength_focus_build', 'strength_focus_power'];

Deno.test('registry: no NEW buildable protocol ships without a profile', () => {
  const pickable = new Set(pickableProtocolIds());
  const missing = listProtocols()
    .filter((id) => !(id in PROTOCOL_PROFILES))
    .filter((id) => !KNOWN_UNPROFILED_UNREACHABLE.includes(id))
    .filter((id) => !pickable.has(id)); // pickable ones are covered by the hard test above
  assertEquals(
    missing,
    [],
    `New buildable protocol(s) with no profile: ${missing.join(', ')}. ` +
      `Add to PROTOCOL_PROFILES, or add to KNOWN_UNPROFILED_UNREACHABLE with a reason.`,
  );
});

Deno.test('registry: every PICKABLE protocol is actually BUILDABLE', () => {
  const buildable = new Set<string>(listProtocols());
  const unbuildable = pickableProtocolIds().filter((id) => !buildable.has(id));
  assertEquals(
    unbuildable,
    [],
    `Offered to athletes but not in listProtocols(): ${unbuildable.join(', ')}.`,
  );
});

Deno.test('registry: every BUILDABLE protocol actually resolves to an implementation', () => {
  const broken: string[] = [];
  for (const id of listProtocols()) {
    try {
      if (!getProtocol(id)) broken.push(id);
    } catch (e) {
      broken.push(`${id} (${(e as Error).message})`);
    }
  }
  assertEquals(broken, [], `In listProtocols() but getProtocol() fails: ${broken.join(', ')}`);
});

// -----------------------------------------------------------------------------
// The other half of Q-202 line 35: protocols that exist and can never be reached.
// NOT a failure — `minimum_dose`, `strength_focus_build` and `strength_focus_power`
// are buildable and offered nowhere. This test does not fail on them; it PINS the
// set so the list cannot grow silently, and so the registry consolidation
// (ARCH-strength-spine.md §3.3) has a checkable before-picture.
// -----------------------------------------------------------------------------
Deno.test('registry: the set of UNREACHABLE protocols is pinned (informational)', () => {
  const pickable = new Set(pickableProtocolIds());
  const unreachable = listProtocols().filter((id) => !pickable.has(id)).sort();
  // Exactly the two, and they are also the two with no profile. `minimum_dose` is buildable
  // but deliberately excluded from `listProtocols()`, so it never appears here.
  assertEquals(
    unreachable,
    ['strength_focus_build', 'strength_focus_power'],
    `The unreachable set changed. If a protocol became REACHABLE, it must have a profile — ` +
      `the hard test above will tell you. If one was added and can never be reached, wire it up ` +
      `or delete it (CLAUDE.md: replace = delete the old). Actual: ${unreachable.join(', ')}`,
  );
});
