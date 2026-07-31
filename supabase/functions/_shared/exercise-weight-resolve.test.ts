import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

/**
 * RESOLVE-EXERCISE-WEIGHT — the intensity decision that moved off the phone (2026-07-30).
 *
 * ⛔ WHAT IS PINNED HERE is the PRECEDENCE, because that is what decides real load and it had three
 * branches sitting in a React component: the row's authored percentage, a back-inference off the lift
 * being replaced, and a hardcoded 0.70. The handler's HTTP shell is not unit-testable here; this
 * mirrors its decision function.
 *
 * ⚠️ If the precedence changes in `resolve-exercise-weight/index.ts`, it changes here too. That is the
 * point of pinning it.
 */

const DEFAULT_INTENSITY = 0.70;

function resolvePercent(args: {
  plannedPercent?: number | null;
  oldRef1RM?: number | null;
  oldRatio?: number | null;
  currentWeight?: number;
}): { percent: number; source: 'planned' | 'back_inferred' | 'default' } {
  const planned = Number(args.plannedPercent);
  if (Number.isFinite(planned) && planned > 0) return { percent: planned, source: 'planned' };

  const ref = Number(args.oldRef1RM);
  const ratio = Number(args.oldRatio);
  const cur = Number(args.currentWeight) || 0;
  if (ref > 0 && ratio > 0 && cur > 0) {
    return { percent: Math.max(0.3, Math.min(0.95, cur / (ref * ratio))), source: 'back_inferred' };
  }
  return { percent: DEFAULT_INTENSITY, source: 'default' };
}

Deno.test('the AUTHORED percentage wins, always', () => {
  const r = resolvePercent({ plannedPercent: 0.85, oldRef1RM: 200, oldRatio: 0.8, currentWeight: 100 });
  assertEquals(r, { percent: 0.85, source: 'planned' });
  // ⛔ The authored % is the only intensity that is not downstream of a rounding step. Every inference
  // reads back a weight that was already rounded down to plate granularity, so it comes out inflated.
});

Deno.test('back-inference is the LEGACY branch, and it is clamped', () => {
  // A row with no authored %, with a current weight to read: 100 / (200 × 0.8) = 0.625.
  assertEquals(resolvePercent({ oldRef1RM: 200, oldRatio: 0.8, currentWeight: 100 }).source, 'back_inferred');
  assertEquals(resolvePercent({ oldRef1RM: 200, oldRatio: 0.8, currentWeight: 100 }).percent, 0.625);

  // ⛔ CLAMPED BOTH ENDS. A bad ratio or a typo'd weight cannot prescribe 5% or 400% of a max.
  assertEquals(resolvePercent({ oldRef1RM: 200, oldRatio: 0.8, currentWeight: 10 }).percent, 0.3);
  assertEquals(resolvePercent({ oldRef1RM: 200, oldRatio: 0.8, currentWeight: 500 }).percent, 0.95);
});

Deno.test('0.70 is the LAST resort, and it says so', () => {
  assertEquals(resolvePercent({}), { percent: 0.70, source: 'default' });
  // Missing any one input drops to the default rather than inventing a partial answer.
  assertEquals(resolvePercent({ oldRef1RM: 200, oldRatio: 0.8, currentWeight: 0 }).source, 'default');
  assertEquals(resolvePercent({ oldRef1RM: 0, oldRatio: 0.8, currentWeight: 100 }).source, 'default');
  assertEquals(resolvePercent({ oldRef1RM: 200, oldRatio: 0, currentWeight: 100 }).source, 'default');
  // ⚠️ THE RESPONSE CARRIES `percent_source`. Michael on fallbacks: *"i have fallabck ptsd from early
  // AI builds of this app that were all fallbacks and nothing worked."* This one survives because a
  // blank weight box on a just-added exercise is worse — but it is LABELLED, so a derived number and
  // a guessed one are never indistinguishable at the call site (the Q-192 / D-322 failure mode).
});

Deno.test('an unreadable planned percentage is not a percentage', () => {
  for (const bad of [null, undefined, 0, -1, NaN]) {
    assertEquals(resolvePercent({ plannedPercent: bad as any }).source, 'default');
  }
});
