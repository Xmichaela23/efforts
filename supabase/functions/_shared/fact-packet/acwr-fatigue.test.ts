/**
 * Tests for the context-aware ACWR fatigue gate (acwrFatigueSignal) in queries.ts.
 *
 * Background: the fact-packet training_load path used to push "Training stress
 * trending up" on a raw `acwr_ratio > 1.1` calendar sum with no phase/transition/
 * week-intent awareness — so it fired on a normal early-build ride after a
 * marathon taper+recovery (taper/recovery weeks deflate the 28d chronic
 * denominator, inflating the ratio). The coach already suppresses this via
 * isAcwrFatiguedSignal (_shared/acwr-state.ts); this path bypassed it.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/fact-packet/acwr-fatigue.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { acwrFatigueSignal } from './queries.ts';

// ── The three required cases ────────────────────────────────────────────────

Deno.test('ratio 1.25 in a transition window → no fatigue flag', () => {
  // Load ratios are contaminated by the prior cycle in the first 1–2 plan weeks
  // (e.g. week 1 build right after a marathon taper+recovery). Suppressed.
  assertEquals(acwrFatigueSignal(1.25, true, 'build'), null);
  assertEquals(acwrFatigueSignal(1.25, true, 'unknown'), null);
});

Deno.test('ratio 1.25 in a build week → no fatigue flag (build threshold is 1.7)', () => {
  // Elevated ACWR is expected while building; only true overreaching
  // (> build_elevated_max = 1.7 per acwr-state.ts) should flag.
  assertEquals(acwrFatigueSignal(1.25, false, 'build'), null);
});

Deno.test('ratio 1.25 in a base week → fatigue flag fires (moderate)', () => {
  // Non-build / non-transition weeks keep the original 1.1 moderate threshold,
  // so existing behavior for normal training weeks is unchanged.
  assertEquals(acwrFatigueSignal(1.25, false, 'unknown'), {
    tier: 'moderate',
    message: 'Training stress trending up',
  });
});

// ── Guard / boundary coverage ───────────────────────────────────────────────

Deno.test('null / non-finite ratio → no flag', () => {
  assertEquals(acwrFatigueSignal(null, false, 'unknown'), null);
  assertEquals(acwrFatigueSignal(undefined, false, 'build'), null);
  assertEquals(acwrFatigueSignal(NaN, false, 'unknown'), null);
});

Deno.test('build/peak/baseline only flag true overreaching (> 1.7), as high tier', () => {
  for (const wi of ['build', 'peak', 'baseline'] as const) {
    assertEquals(acwrFatigueSignal(1.7, false, wi), null); // boundary: not strictly >
    assertEquals(acwrFatigueSignal(1.75, false, wi), {
      tier: 'high',
      message: 'Training stress elevated — recovery matters',
    });
  }
});

Deno.test('base week preserves the original two-tier (moderate >1.1, high >1.3)', () => {
  assertEquals(acwrFatigueSignal(1.1, false, 'unknown'), null); // boundary: not strictly >
  assertEquals(acwrFatigueSignal(1.15, false, 'unknown'), {
    tier: 'moderate',
    message: 'Training stress trending up',
  });
  assertEquals(acwrFatigueSignal(1.35, false, 'recovery'), {
    tier: 'high',
    message: 'Training stress elevated — recovery matters',
  });
});

Deno.test('weekIntent defaults to build (lenient) when null/omitted', () => {
  // Absent context → 'build' default → 1.25 does not flag (matches the
  // backward-compatible safe default the caller threading relies on).
  assertEquals(acwrFatigueSignal(1.25, false, null), null);
  assertEquals(acwrFatigueSignal(1.25), null);
});
