/**
 * ⛔ p107'S VT1 BOUT FLOOR, IN ONE PLACE. *"At lower intensities, single bouts of much less than 10
 * to 15 minutes are, therefore, unlikely to be worthwhile."*
 *
 * ⚠️ IT IS A MINIMUM, NOT A PRESCRIBED LENGTH, and `docs/SOURCE-viada-hybrid-athlete.md:419-422`
 * records that correction against an earlier note that read it the other way round. Ten minutes is
 * the lower of the page's two figures, which is the conservative end of a floor.
 *
 * ⛔ ONE JOB ONLY: whether enough VT1 time is left in a long session to read drift over at all.
 * ⚠️ IT IS NOT A SET DETECTOR, and was briefly used as one (2026-09-12, overruled the same day).
 * p107's bout length says whether a VT1 bout is worth doing; using it to decide which rows were the
 * sets borrowed the number into a context it was not written for, and it would have thrown a
 * genuinely easy eight-minute segment out of the reading. Which rows are the sets is decided in
 * `vt1-window-drift.ts`, against the session's own easiest work step.
 */
export const VT1_MIN_BOUT_S = 600;
