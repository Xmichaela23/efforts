/**
 * ═══ EXECUTION — GARMIN'S METHOD: TIME IN THE TARGET RANGE (2026-09-17, Michael approved) ═══════════════════
 *
 * SOURCE — Garmin fēnix 8 / Forerunner 265 owner's manual, "Workout Execution Score":
 * https://www8.garmin.com/manuals/webhelp/GUID-EECCAC99-90D6-4AB1-9A3A-EC433D3365E2/EN-GB/GUID-FD71D73A-C744-4779-A6C3-2FA9AB89B228.html
 *   "if your 60 minute workout has a target pace range, and you stay in that range for 50 minutes, your workout
 *   execution score is 83%." Active (work) steps count most; warm-up and recovery count less (no weight
 *   published); the cool-down counts nothing. Only workouts with heart rate, speed, pace or power targets get a
 *   score.
 *
 * THE SCORE
 * - Hard runs and rides with power targets: seconds inside each work step's own range, summed over the work
 *   steps, ÷ those steps' seconds. The range as the plan prints it, no allowance — the same range the rep rows
 *   and the off-prescription line read.
 * - Easy runs and rides (a heart-rate target, no work reps): seconds at or under the easy heart-rate ceiling ÷
 *   moving seconds.
 * - No target at all: no score (null), never a number.
 *
 * OURS (docs/STATE-SOURCES.md, "Execution score")
 * - The warm-up and the recoveries are left out. Garmin counts them "less" and publishes no weight, so any
 *   weight would be ours; leaving them out is the smallest choice. The cool-down is Garmin's own rule.
 * - The fallback: a rep with no per-second count (a row built before the count existed, or a path that does
 *   not carry samples) is judged on its average — all its seconds in range when the average sits inside the
 *   range, none when it does not. The rows' own in-range test.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "execution-score" supabase/functions
 */

/** One work step as the score reads it. */
export type ExecutionRep = {
  /** The step's seconds: moving seconds on a run, recorded seconds on a ride. */
  seconds: number | null | undefined;
  /** Seconds inside the range, counted per second where the rep was cut. Null when not counted. */
  in_range_s: number | null | undefined;
  /** Whether the rep's average sits inside the range — the rows' test, and the fallback. Null when not judged. */
  average_in_range: boolean | null | undefined;
};

export type ExecutionResult = {
  /** 0–100, or null when nothing could be judged. */
  pct: number | null;
  /** Work reps whose average sits inside the range ("5 of 6 reps in range"). */
  reps_in_range: number;
  /** Work reps judged (had a range and a measured average). */
  reps_judged: number;
  /** Reps scored on their average because no per-second count was carried. */
  fallback_reps: number;
};

const pos = (x: unknown): number | null => {
  const n = Number(x);
  return x != null && Number.isFinite(n) && n > 0 ? n : null;
};

/** Hard runs and rides with power targets. */
export function executionFromWorkReps(reps: ReadonlyArray<ExecutionRep>): ExecutionResult {
  let total = 0;
  let inside = 0;
  let judged = 0;
  let inRangeReps = 0;
  let fallback = 0;
  for (const r of reps) {
    const secs = pos(r?.seconds);
    if (secs == null || r?.average_in_range == null) continue;
    judged += 1;
    if (r.average_in_range) inRangeReps += 1;
    const counted = Number(r?.in_range_s);
    total += secs;
    if (r?.in_range_s != null && Number.isFinite(counted) && counted >= 0) {
      inside += Math.min(secs, counted);
    } else {
      // OURS — the fallback (see header): the rep's average decides all of its seconds.
      fallback += 1;
      if (r.average_in_range) inside += secs;
    }
  }
  return {
    pct: total > 0 ? Math.round((inside / total) * 100) : null,
    reps_in_range: inRangeReps,
    reps_judged: judged,
    fallback_reps: fallback,
  };
}

/** Easy runs and rides: seconds at or under the ceiling ÷ moving seconds. */
export function executionFromEasyHr(
  underCeilingS: number | null | undefined,
  movingS: number | null | undefined,
): number | null {
  const m = pos(movingS);
  const u = Number(underCeilingS);
  if (m == null || underCeilingS == null || !Number.isFinite(u) || u < 0) return null;
  return Math.round((Math.min(m, u) / m) * 100);
}
