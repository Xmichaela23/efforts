export const getDurationSeconds = (workout: any): number | null => {
  const s = workout?.moving_time ?? workout?.metrics?.moving_time ?? workout?.computed?.overall?.duration_s_moving ?? null;
  return Number.isFinite(s) ? Number(s) : null;
};

export const getElapsedSeconds = (workout: any): number | null => {
  // elapsed_time is in minutes (rounded), moving_time is in seconds (precise)
  // For workouts with no pauses, use the more precise moving time
  const movingSec = workout?.moving_time ?? workout?.metrics?.moving_time ?? workout?.computed?.overall?.duration_s_moving ?? null;
  const elapsedMin = workout?.elapsed_time ?? workout?.metrics?.elapsed_time ?? null;
  const elapsedSec = Number.isFinite(elapsedMin) ? Number(elapsedMin) * 60 : null;
  
  // Use whichever is greater (handles case where elapsed is rounded down)
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
