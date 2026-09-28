/**
 * ═══ THE NOTES UNDER THE EXECUTION NUMBER: WHAT PULLED IT DOWN (2026-09-28, Michael: "a simple note under score …
 * and any other things that nudge score down … build em") ═══
 *
 * Execution is COROS's effort accuracy (`_shared/execution-score.ts`): the average of Completion (the work done ÷ the
 * work planned) and Intensity (time in each step's own range). Each note names one thing that took a part below 100,
 * in the athlete's terms, counted off the same rows the interval table prints. A part at 100 gets no note, so a session
 * that landed prints nothing here.
 *
 *   Interval sessions (`execution_basis` 'work_time_in_range'):
 *     · Intensity  — "11 of 14 reps faster than planned." / "… slower …" / "8 of 14 reps faster and 3 slower than
 *                    planned."; a ride: "… intervals above the planned watts." The count is the rows' own band
 *                    (`interval-compare.ts`, the step's range with no allowance), the reps the score's
 *                    `reps_in_range` reads.
 *     · Completion — "1 rep shorter than planned." A timed rep done but short of its clock. A rep never reached is
 *                    already in the line above ("14 of 16 reps done") and is not repeated.
 *   Easy sessions (`execution_basis` 'easy_hr'):
 *     · Intensity  — "12 min above the easy heart-rate ceiling." Off the easy chip's own two numbers.
 *     · Completion — "Shorter than planned." The Duration tile beside it prints the minutes.
 *
 * The session's total length moves Execution only on an easy session: on an interval session the score reads the work
 * steps alone, and the warm-up and cool-down never count.
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "session-detail/score-notes" supabase/functions
 */
import type { IntervalRow } from './types.ts';

// deno-lint-ignore no-explicit-any
type Perf = Record<string, any>;

const fin = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** The notes, in order (intensity, then completion). Empty when nothing pulled the score down or there is no score. */
export function executionScoreNotes(
  perf: Perf | null | undefined,
  intervals: ReadonlyArray<IntervalRow> | null | undefined,
  isRide: boolean,
): string[] {
  const basis = perf?.execution_basis;
  const notes: string[] = [];

  if (basis === 'easy_hr') {
    const under = fin(perf?.easy_under_s), total = fin(perf?.easy_total_s);
    if (under != null && total != null && total > under) {
      const over = Math.round((total - under) / 60);
      if (over >= 1) notes.push(`${over} min above the easy heart-rate ceiling.`);
    }
    const completion = fin(perf?.execution_completion_pct);
    if (completion != null && completion < 100) notes.push('Shorter than planned.');
    return notes;
  }
  if (basis !== 'work_time_in_range') return notes;

  const done = (intervals ?? []).filter((iv) => iv?.interval_type === 'work' && !iv?.not_done);
  const judged = done.filter((iv) => iv?.executed?.band === 'above' || iv?.executed?.band === 'below' || iv?.executed?.band === 'in');
  const above = judged.filter((iv) => iv.executed.band === 'above').length;
  const below = judged.filter((iv) => iv.executed.band === 'below').length;
  const noun = isRide ? 'intervals' : 'reps';
  const m = judged.length;
  if (above && below) {
    notes.push(isRide
      ? `${above} of ${m} ${noun} above and ${below} below the planned watts.`
      : `${above} of ${m} ${noun} faster and ${below} slower than planned.`);
  } else if (above || below) {
    const n = above || below;
    notes.push(isRide
      ? `${n} of ${m} ${noun} ${above ? 'above' : 'below'} the planned watts.`
      : `${n} of ${m} ${noun} ${above ? 'faster' : 'slower'} than planned.`);
  }

  // A timed rep: its printed prescription is its clock ("0:45"), so the planned seconds are the step's own.
  const short = done.filter((iv) => {
    const planned = fin(iv?.planned_duration_s), did = fin(iv?.executed?.duration_s);
    if (planned == null || !(planned > 0) || did == null) return false;
    if (String(iv?.planned_label ?? '').trim() !== clock(planned)) return false;
    return Math.round(did) < Math.round(planned);
  }).length;
  if (short) notes.push(`${short} ${short === 1 ? (isRide ? 'interval' : 'rep') : noun} shorter than planned.`);

  return notes;
}
