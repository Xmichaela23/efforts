/**
 * How many weeks of plan cover a race date, counted from today.
 *
 * Ceil, so a race on day 48 (6.857 weeks) counts as 7 plan weeks, placing the race in the final week
 * rather than one week past it. `create-goal-and-materialize-plan` sizes race blocks with it, and
 * `get-arc-context` returns it for the season wizard's confirm screen (2026-09-10, audit H-W10), so
 * the number on the screen is the number the build counts. The phone rounded where this rounds up.
 */
export function weeksUntilRace(today: Date, raceDate: Date): number {
  const ms = raceDate.getTime() - today.getTime();
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
}
