export const getDurationSeconds = (workout: any): number | null => {
  // Prefer computed (already in seconds)
  const computed = workout?.computed?.overall?.duration_s_moving;
  if (Number.isFinite(computed)) return Number(computed);
  
  // Fallback: moving_time is stored in minutes, convert to seconds
  const minutes = workout?.moving_time ?? workout?.metrics?.moving_time ?? null;
  return Number.isFinite(minutes) ? Number(minutes) * 60 : null;
};

export const getElapsedSeconds = (workout: any): number | null => {
  // Prefer computed elapsed (already in seconds)
  const computed = workout?.computed?.overall?.duration_s_elapsed;
  if (Number.isFinite(computed)) return Number(computed);
  
  // Fallback: elapsed_time is in minutes, convert to seconds
  const elapsedMin = workout?.elapsed_time ?? workout?.metrics?.elapsed_time ?? null;
  const elapsedSec = Number.isFinite(elapsedMin) ? Number(elapsedMin) * 60 : null;
  
  // Use whichever is greater: elapsed or moving (handles Garmin rounding)
  const movingSec = getDurationSeconds(workout);
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
