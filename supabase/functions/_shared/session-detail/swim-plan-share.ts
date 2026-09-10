/**
 * ⛔ A SWIM'S SHARE OF ITS PLAN, WORKED OUT BY THE SERVER (2026-09-10, audit H-D13).
 *
 * The pool-swim card (`EnduranceIntervalTable`) divided the done distance and duration by the planned
 * ones itself and coloured each green at 100% or more, amber below. The build stamps the percent and
 * the word on `completed_totals`; the card prints them. 100% is the plan itself, not a tuning number.
 */

export type PlanShareStatus = 'at_or_above' | 'below';

/** Done as a whole-number percent of planned, and whether it reached the plan. Null without both figures. */
export function planShare(
  done: number | null | undefined,
  planned: number | null | undefined,
): { pct: number | null; status: PlanShareStatus | null } {
  const d = Number(done);
  const p = Number(planned);
  if (done == null || planned == null || !(d > 0) || !(p > 0)) return { pct: null, status: null };
  const pct = Math.round((d / p) * 100);
  return { pct, status: pct >= 100 ? 'at_or_above' : 'below' };
}
