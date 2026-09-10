/**
 * ⛔ NO MOVING-TIME READER LIVES HERE ANY MORE (2026-09-10, audit H-D10). `getDurationSeconds` checked
 * `metrics.moving_time_seconds`, then `computed.overall.duration_s_moving`, then the minute columns —
 * the opposite order from the other phone resolver, so the calendar and the details screen could show
 * different times for one Strava row. Moving time is the server's `moving_seconds`, read where it is
 * shown (`useWorkoutData`).
 */

export const getElapsedSeconds = (workout: any): number | null => {
  // Prefer computed elapsed (already in seconds)
  const computed = workout?.computed?.overall?.duration_s_elapsed;
  if (Number.isFinite(computed)) return Number(computed);

  // Fallback: elapsed_time is in minutes, convert to seconds
  const elapsedMin = workout?.elapsed_time ?? workout?.metrics?.elapsed_time ?? null;
  const elapsedSec = Number.isFinite(elapsedMin) ? Number(elapsedMin) * 60 : null;

  // Use whichever is greater: elapsed or the server's moving time (handles Garmin rounding)
  const movingRaw = Number(workout?.moving_seconds);
  const movingSec = Number.isFinite(movingRaw) && movingRaw > 0 ? movingRaw : null;
  if (elapsedSec && movingSec) return Math.max(elapsedSec, movingSec);
  return elapsedSec ?? movingSec;
};

export const getDistanceMeters = (workout: any): number | null => {
  const distKm = Number.isFinite(workout?.distance) ? Number(workout.distance) * 1000 : null;
  const distM = workout?.computed?.overall?.distance_m ?? null;
  const v = Number.isFinite(distM) && Number(distM) > 0 ? Number(distM) : (Number.isFinite(distKm) ? Number(distKm) : null);
  return v;
};

export const computeDistanceKm = (workout: any): number | null => {
  const m = getDistanceMeters(workout);
  return Number.isFinite(m) && Number(m) > 0 ? Number(m) / 1000 : null;
};
