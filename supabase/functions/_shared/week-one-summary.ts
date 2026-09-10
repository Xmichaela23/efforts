/**
 * THE SAMPLE WEEK'S SUMMARY — the line above the week-one grid and the two sentences under it
 * (2026-09-10, audit H-P05). The grid used to count the days, add the minutes and write both
 * sentences on the phone. `create-goal-and-materialize-plan` returns this beside every preview that
 * carries a week one, and `WeekGrid` prints it.
 *
 * The sentences are moved from `WeekGrid.tsx` word for word. Nothing is added.
 */
import { WEEK_DAYS, isEnduranceSession, type WeekSession } from '../../../src/lib/week-budget.ts';

export type WeekOneSummary = {
  training_days: number;
  rest_days: number;
  /**
   * Days with lifting on them. Days, not sessions: two strength rows can share a day. The plyo day is
   * `type: 'strength'` and is not a lifting day — excluded by its `plyo` tag, never by its name.
   */
  lift_days: number;
  total_minutes: number;
  /** Two upper presses on consecutive days, which looks like an oversight and is not. */
  press_days_note: string | null;
  /**
   * What the layout is for. Only when the solver reported no compromise: a week where pins forced
   * stacking is arranged around the athlete's days, and the compromise sentences are the true story.
   * It claims the spacing's purpose, never per-session freshness (p130, p131, p247).
   */
  balance_note: string | null;
};

/** OURS — the old grid's cut-off for "a long session", 75 minutes. No source. */
const LONG_SESSION_MIN = 75;
const UPPER = /Bench Press|Overhead Press/;
const isPlyo = (s: WeekSession) => (s.tags ?? []).includes('plyo');

export function weekOneSummary(
  sessions: WeekSession[] | null | undefined,
  compromiseCount: number,
): WeekOneSummary | null {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  const activeDays = new Set(sessions.map((s) => s.day)).size;
  const totalMinutes = sessions.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const liftDays = new Set(
    sessions.filter((s) => s.type === 'strength' && !isPlyo(s)).map((s) => s.day),
  ).size;

  const upperIdx = WEEK_DAYS
    .map((d, i) => (sessions.some((s) => s.day === d && s.type === 'strength' && UPPER.test(String(s.name ?? ''))) ? i : -1))
    .filter((i) => i >= 0);
  const adjacentPressDays = upperIdx.length === 2 && Math.abs(upperIdx[0] - upperIdx[1]) === 1;

  const balanceNote = (() => {
    if (compromiseCount > 0) return null;
    const endur = sessions.filter(isEnduranceSession);
    const hardN = endur.filter((s) => /^Hard\b/i.test(String(s.name ?? ''))).length;
    const longest = endur.reduce<WeekSession | null>(
      (a, s) => ((Number(s.duration) || 0) > (Number(a?.duration) || 0) ? s : a), null);
    const hasLong = !!longest && (Number(longest.duration) || 0) >= LONG_SESSION_MIN;
    if (hardN === 0 && !hasLong) return null;
    const liftDayNames = WEEK_DAYS.filter((d) =>
      sessions.some((s) => s.day === d && s.type === 'strength' && !isPlyo(s)));
    if (liftDayNames.length === 0) return null;
    const say = (xs: readonly string[]) =>
      xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
    const hardClause = [
      hardN === 0 ? '' : hardN === 1 ? 'the hard session' : 'the hard sessions',
      hasLong ? `the long ${longest!.type === 'ride' ? 'ride' : 'run'}` : '',
    ].filter(Boolean).join(' and ');
    return `This week is arranged to balance the stressors — lifting on ${say(liftDayNames)}, ${hardClause} spaced around it.`;
  })();

  return {
    training_days: activeDays,
    rest_days: 7 - activeDays,
    lift_days: liftDays,
    total_minutes: totalMinutes,
    press_days_note: adjacentPressDays ? 'Press days sit together on purpose — no recovery gap needed.' : null,
    balance_note: balanceNote,
  };
}
