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

/** The goal row's own range (create-goal `target_weeks` 4 to 52); the server refuses outside it too. */
export const RACE_BLOCK_MIN_WEEKS = 4;
export const RACE_BLOCK_MAX_WEEKS = 52;
