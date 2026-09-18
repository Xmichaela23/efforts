/**
 * The Standing Plan block's protocol id — its one definition. Lives in a file of its own (2026-09-18) so a
 * function that only needs to recognise the block (get-week, activate-plan, through `_shared/plan-refresh.ts`)
 * does not pull the composer into its bundle. `plan-row.ts` re-exports it; the rules on it are written there.
 */
export const STANDING_PLAN_PROTOCOL_ID = 'standing_plan';
