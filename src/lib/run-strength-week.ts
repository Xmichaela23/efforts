/**
 * ⛔⛔ THE RUN + STRENGTH WEEK'S SECOND LINE — the copy half of `RunStrengthWeekCard`
 * (`WORKORDER-run-strength-rotate-2026-09-07.md`).
 *
 * ⛔ THE NUMBERS LEFT THIS FILE (2026-09-10, audit H-P06). The easy run's 30 minutes, the long-run
 * chip ceiling of 90 and the default of 75 live on the frame (`Frame.runStrengthWeek` in
 * `_shared/standing-plan/frames.ts`), and the chips themselves — the `run_lsd` lengths up to that
 * ceiling — come back from the server with the preview (`enduranceIntakeReadout`). The card prints
 * them; this file only holds the sentence they go into.
 */

/**
 * ⛔ THE SECOND LINE — what the screen leaves open, and what it does not. Fact-first, no imperative
 * beyond the one control's own name, no author on the screen.
 * ⚠️ THE NUMBER IS THE SERVER'S, the same one the row states and the payload sends, so the sentence
 * and the session cannot come apart. The header above it is `runWeekCommitmentLine`.
 */
export function runStrengthWeekSub(easyRunMinutes: number): string {
  return `Pick how long the long run is. The easy run is ${easyRunMinutes} minutes. `
    + 'The two hard runs rotate.';
}
