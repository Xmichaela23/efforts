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

/** p139-140, quoted in the SOURCE doc (Part C2, rule 2a). The warm-up line, one owner. */
export const WARM_UP_LINE = 'The first set of your skill work should also be the last set of your warm-up.';
