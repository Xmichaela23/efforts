import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

/**
 * THE PR VERDICT — moved off the State screen onto the spine (2026-07-30).
 *
 * ⛔ Deciding what counts as a personal record is a VERDICT, and a screen that computes one is a
 * surface minting truth (Constitution Law 4). The rule below is unchanged from the version that lived
 * in `StatePerformanceSection.tsx` — only its address moved — and it is pinned here so the next
 * surface that wants to show a PR reads it instead of copying it.
 */
const isPr = (latest: number | null, allBest: number | null, allCount: number) =>
  latest != null && allBest != null && allCount >= 3 && latest >= allBest - 0.5;

Deno.test('a genuine new all-time high IS a PR', () => {
  assertEquals(isPr(205, 200, 12), true);
  assertEquals(isPr(200, 200, 12), true); // matching the best counts
});

Deno.test('short of the all-time best is NOT a PR', () => {
  assertEquals(isPr(190, 200, 12), false);
});

Deno.test('⛔ no history to beat is never a PR', () => {
  // Michael, 2026-07-21: *"a PR should be a real PR, basically a new 1RM."* It was best-of-6-weeks
  // once, which fired on nearly every progressing lift and even stamped a lift reading "new".
  assertEquals(isPr(205, null, 12), false);   // no all-history read supplied
  assertEquals(isPr(205, 200, 0), false);     // nothing behind it
  assertEquals(isPr(205, 200, 2), false);     // under the three-point floor
  assertEquals(isPr(null, 200, 12), false);   // nothing logged
});

Deno.test('the half-pound slack is rounding, not tolerance', () => {
  // Absorbs rounding between the stored estimate and the all-history read. It is not a statement
  // that being half a pound short still counts.
  assertEquals(isPr(199.6, 200, 5), true);
  assertEquals(isPr(199.4, 200, 5), false);
});
