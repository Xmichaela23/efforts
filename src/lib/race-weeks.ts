/**
 * THE HALF MARATHON'S BLOCK LENGTH ON THE PHONE (Stage 2, 2026-09-24) — the same two functions the server counts with
 * (`generate-strength-plan`: `mondayOfCalendarYmd` then `planWeekContaining`), so the screen and the plan agree.
 * Weeks from the start week to race week, inclusive; null when either date is missing or race day is before the start.
 */
import { planWeekContaining } from '../../supabase/functions/_shared/planning-context.ts';
import { mondayOfCalendarYmd } from '../../supabase/functions/_shared/parse-local-date.ts';

export function raceBlockWeeks(startIso: string | null | undefined, raceIso: string | null | undefined): number | null {
  const start = String(startIso ?? '').slice(0, 10);
  const race = String(raceIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(race)) return null;
  return planWeekContaining(mondayOfCalendarYmd(start), race);
}

// The block's limits and the race-plan rules are the server's (race-week.ts), one copy.
export { RACE_BLOCK_MAX_WEEKS, RACE_BLOCK_MIN_WEEKS, RACE_PLAN_MAX_WEEKS, RACE_USUAL_MIN_WEEKS, racePlanFromWeek } from '../../supabase/functions/_shared/standing-plan/race-week.ts';

/**
 * ⛔ WHETHER THE GOALS SCREEN'S EVENT FORM SHOWS "Running a race?" (WORKORDER-race-builds). Stays false: the race plans
 * are live on the Run list's Race group (`setup-copy.ts` RUN_GROUPS, 2026-10-01 — "races sit in their sport"), and that
 * button's words describe the old run builder.
 */
export const RACE_PLANS_OFFERED = false;
