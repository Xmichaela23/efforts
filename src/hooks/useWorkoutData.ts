import { useMemo } from 'react';
import { getDistanceMeters, getDurationSeconds, getElapsedSeconds, computeDistanceKm } from '../utils/workoutDataDerivation';

export type WorkoutDataNormalized = {
  distance_m: number | null;
  distance_km: number | null;
  duration_s: number | null;
  elapsed_s: number | null;
  elevation_gain_m: number | null;
  avg_power: number | null;
  avg_hr: number | null;
  series: any | null;
};

export const useWorkoutData = (workoutData: any): WorkoutDataNormalized => {
  return useMemo(() => {
    const distance_m = getDistanceMeters(workoutData);
    const distance_km = computeDistanceKm(workoutData);
    const duration_s = getDurationSeconds(workoutData);
    const elapsed_s = getElapsedSeconds(workoutData);
    const elevation_gain_m = Number.isFinite(workoutData?.elevation_gain) ? Number(workoutData.elevation_gain) : null;
    const avg_power = Number.isFinite(workoutData?.avg_power) ? Number(workoutData.avg_power) : (Number.isFinite(workoutData?.metrics?.avg_power) ? Number(workoutData.metrics.avg_power) : null);
    const avg_hr = Number.isFinite(workoutData?.avg_heart_rate) ? Number(workoutData.avg_heart_rate) : null;
    const series = workoutData?.computed?.analysis?.series || null;
    return { distance_m, distance_km, duration_s, elapsed_s, elevation_gain_m, avg_power, avg_hr, series };
  }, [workoutData]);
};
