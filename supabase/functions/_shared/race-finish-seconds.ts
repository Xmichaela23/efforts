/**
 * Race / goal finish time from a workout row.
 * Product: prefer elapsed (chip) time over moving time for official result.
 * DB stores moving_time / elapsed_time as minutes in many rows; see goal-finish-from-workouts.
 */

export type WorkoutTimeRow = {
  moving_time?: unknown;
  elapsed_time?: unknown;
  duration?: unknown;
  computed?: { overall?: { duration_s_moving?: number; duration_s?: number } };
};

function minutesToSeconds(m: unknown): number | null {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60);
}

/** Prefer elapsed → moving → computed duration (overall). */
export function actualFinishSecondsPreferElapsed(w: WorkoutTimeRow): number | null {
  const e = minutesToSeconds(w.elapsed_time);
  if (e != null) return e;
  const mv = minutesToSeconds(w.moving_time);
  if (mv != null) return mv;
  const co = w.computed?.overall;
  const ds = Number(co?.duration_s ?? co?.duration_s_moving);
  if (Number.isFinite(ds) && ds > 0) return Math.round(ds);
  const d = Number(w.duration);
  if (Number.isFinite(d) && d > 120) return Math.round(d);
  if (Number.isFinite(d) && d > 0) return Math.round(d * 60);
  return null;
}
