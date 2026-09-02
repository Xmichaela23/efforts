/**
 * THE COVERAGE-LINE GATE — plan-dependent, extracted so it can be pinned by a fixture. [2026-09-01]
 *
 * ⛔ "nothing this week for triceps, glutes" is a COVERAGE GAP, and a gap only means something
 * against a PRESCRIPTION. With no active plan there is nothing prescribing those muscles, so the line
 * would be the app inventing a gap — the same fault as the per-muscle "light" verdicts removed
 * earlier. So it renders ONLY when a plan is active AND something is actually below the floor.
 *
 * ⚠️ `hasPlan` is `has_active_plan` — the card's OWN input, never a read of whether another block
 * rendered (the no-cross-block-reads rule).
 */
export function coverageVisible(hasPlan: boolean, belowFloor: readonly string[] | null | undefined): boolean {
  return hasPlan === true && Array.isArray(belowFloor) && belowFloor.length > 0;
}
