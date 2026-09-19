// ============================================================================
// THE WARM-UP — pp.139–140.
//
// ⛔⛔ THE RAMP IS GONE (book-language fix, 2026-09-18). This file built one in front of every priced
// ME / DE / SKILL row: the empty bar × 5, then 55% × 5, 75% × 3 and 90% × 2 of the work weight. The page
// asks for a warm-up that works up in weight and gives no percentages and no rep counts; every number in
// the ramp was labelled OURS, and its two lines ("Empty bar, moved fast." and "Work up in the same
// lift…") were our words. Michael's rule (2026-09-18): a warm-up is a training instruction, and anything
// the book does not say comes off.
//
// The one quoted sentence the SOURCE doc holds for the warm-up (p139-140, Part C2 rule 2a) is
// "The first set of your skill work should also be the last set of your warm-up." — see
// `WARM_UP_LINE` below.
//
// ⚠️ WHAT STAYS: the standard bar's weight, which the test day's empty-bar set uses (`test-session.ts`).
// ============================================================================

// OURS — `DEFAULT_BAR_LB` 45 lb standard bar assumed when the caller passes none; p140's empty bar gives no weight.
export const DEFAULT_BAR_LB = 45;

/**
 * The warm-up line, one owner — the pages' own words, cut (pass 6, read off p139.jpg and p140.jpg):
 *   p139 Rule 1: "A good warm-up is meant to prepare your body to do work, not be a stimulus."
 *   p140 Rule 2a: "With skill development work, every warm-up set should have equal focus and quality to the
 *        work sets." and the pull-quote "The first set of your skill work should also be the last set of your
 *        warm-up."
 * ⚠️ NO WARM-UP SETS COME BACK. p139-140 give no percentages, loads or rep counts for a warm-up ("working up in
 * weight", "gradually heavier squats until the work set"), so the ramp that was ours stays off.
 */
export const WARM_UP_LINE = 'A good warm-up is meant to prepare your body to do work, not be a stimulus. '
  + 'With skill development work, every warm-up set should have equal focus and quality to the work sets. '
  + 'The first set of your skill work should also be the last set of your warm-up.';
