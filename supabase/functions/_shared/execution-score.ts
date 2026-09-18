/**
 * ═══ EXECUTION — COROS'S EFFORT ACCURACY: DONE, AND DONE IN RANGE (2026-09-17, Michael) ═══════════════════════
 *
 * SOURCE — COROS, "Structured Workouts and Effort Accuracy":
 * https://coros.com/stories/coros-coaches/c/structured-workouts-and-effort-accuracy
 *   "take a 2-mile run at 8:00-9:00/mile. If you ran 2 miles but could only keep yourself within this pace zone for
 *   80% of the time, you will then receive a Completion Rate of 90% (100% for distance and 80% for intensity)."
 *   "Each section of the workout is scored individually. Open sections (where no target is set) do not receive a
 *   score."
 * Michael, 2026-09-17: the score measures both — finishing the work and staying in range; it does not read 0% on a
 * session where every rep was done. (Superseded the same day: Garmin's time in range alone, 68da746f.)
 *
 * THE SCORE — the average of two halves, over the sections that carry a target:
 * - Completion: the work done ÷ the work planned (time or distance, as the step is prescribed), each section capped
 *   at 100%, sections weighted by planned time. A section never reached counts as 0 done.
 * - Intensity: seconds inside each section's own range (the plan's range, no allowance) ÷ the seconds done. Easy
 *   sessions: moving seconds at or under the easy heart-rate ceiling ÷ moving seconds.
 * - A section with no target (a time-only jog — `watch_target: 'none'`) gets no score. The warm-up and cool-down
 *   never count, on any plan, decided by the step's kind: the book prescribes both as an "easy jog" with no target
 *   (p231–235), and plans built before 2026-09-17 still carry a pace range on them. No targeted section: no score.
 *
 * OURS (docs/STATE-SOURCES.md, "Execution score")
 * - The fallback: a section with no per-second count is judged on its average — all its seconds in range when the
 *   average sits inside the range, none when it does not. The rows' own in-range test.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "execution-score" supabase/functions
 */

/** One targeted section as the score reads it. */
export type ExecutionSection = {
  /** Planned seconds — the section's weight in Completion. */
  planned_s: number | null | undefined;
  /** Done ÷ planned (time or distance, as prescribed), 0–1+; capped here. 0 for a section never reached. */
  completion: number | null | undefined;
  /** Seconds done: moving seconds on a run, recorded seconds on a ride. 0 for a section never reached. */
  seconds: number | null | undefined;
  /** Seconds inside the range, counted per second where the section was cut. Null when not counted. */
  in_range_s: number | null | undefined;
  /** Whether the section's average sits inside the range — the rows' test, and the fallback. Null when not judged. */
  average_in_range: boolean | null | undefined;
  /** A work rep — counted in "5 of 6 reps in range". */
  is_rep: boolean;
};

export type ExecutionResult = {
  /** 0–100, or null when nothing could be scored. */
  pct: number | null;
  completion_pct: number | null;
  intensity_pct: number | null;
  /** Work reps done whose average sits inside the range ("5 of 6 reps in range"). */
  reps_in_range: number;
  /** Work reps done and judged. */
  reps_judged: number;
  /** Sections scored on their average because no per-second count was carried. */
  fallback_reps: number;
};

const num = (x: unknown): number | null => {
  const n = Number(x);
  return x != null && Number.isFinite(n) ? n : null;
};

/** The two halves averaged — COROS's own arithmetic ("100% for distance and 80% for intensity" → 90%). */
const halves = (completion: number | null, intensity: number | null): number | null =>
  completion == null || intensity == null ? null : Math.round((completion + intensity) / 2);

export function executionFromSections(sections: ReadonlyArray<ExecutionSection>): ExecutionResult {
  let plannedW = 0, doneW = 0;
  let secsDone = 0, inside = 0;
  let judged = 0, inRangeReps = 0, fallback = 0;
  for (const s of sections) {
    const planned = num(s?.planned_s);
    const comp = num(s?.completion);
    if (planned != null && planned > 0 && comp != null && comp >= 0) {
      plannedW += planned;
      doneW += planned * Math.min(1, comp);
    }
    const secs = num(s?.seconds);
    if (secs == null || !(secs > 0) || s?.average_in_range == null) continue;
    if (s.is_rep) { judged += 1; if (s.average_in_range) inRangeReps += 1; }
    secsDone += secs;
    const counted = num(s?.in_range_s);
    if (counted != null && counted >= 0) inside += Math.min(secs, counted);
    else {
      // OURS — the fallback (see header): the section's average decides all of its seconds.
      fallback += 1;
      if (s.average_in_range) inside += secs;
    }
  }
  const completion = plannedW > 0 ? (doneW / plannedW) * 100 : null;
  // Every targeted section planned and none reached: nothing was done in range.
  const intensity = secsDone > 0 ? (inside / secsDone) * 100 : (completion != null ? 0 : null);
  return {
    pct: halves(completion, intensity),
    completion_pct: completion != null ? Math.round(completion) : null,
    intensity_pct: intensity != null ? Math.round(intensity) : null,
    reps_in_range: inRangeReps,
    reps_judged: judged,
    fallback_reps: fallback,
  };
}

/** Easy runs and rides: completion (moving ÷ planned, capped) and time under the ceiling ÷ moving seconds. */
export function executionFromEasyHr(
  underCeilingS: number | null | undefined,
  movingS: number | null | undefined,
  plannedS: number | null | undefined,
): { pct: number | null; completion_pct: number | null; intensity_pct: number | null } {
  const m = num(movingS);
  const u = num(underCeilingS);
  const p = num(plannedS);
  const intensity = m != null && m > 0 && u != null && u >= 0 ? (Math.min(m, u) / m) * 100 : null;
  const completion = m != null && m > 0 && p != null && p > 0 ? Math.min(1, m / p) * 100 : null;
  return {
    pct: halves(completion, intensity),
    completion_pct: completion != null ? Math.round(completion) : null,
    intensity_pct: intensity != null ? Math.round(intensity) : null,
  };
}
