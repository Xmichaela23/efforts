export const getDurationSeconds = (workout: any): number | null => {
  const s = workout?.moving_time ?? workout?.metrics?.moving_time ?? workout?.computed?.overall?.duration_s_moving ?? null;
  return Number.isFinite(s) ? Number(s) : null;
};

export const getElapsedSeconds = (workout: any): number | null => {
  const minutes = workout?.elapsed_time ?? workout?.metrics?.elapsed_time ?? null;
  // elapsed_time is typically stored in minutes, convert to seconds
  return Number.isFinite(minutes) ? Number(minutes) * 60 : null;
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
