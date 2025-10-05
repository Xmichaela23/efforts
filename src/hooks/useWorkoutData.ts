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
  max_hr: number | null;
  max_power: number | null;
  max_speed_mps: number | null;
  max_cadence_rpm: number | null;
  avg_speed_kmh: number | null;
  avg_speed_mps: number | null;
  avg_pace_s_per_km: number | null;
  avg_running_cadence_spm: number | null;
  avg_cycling_cadence_rpm: number | null;
  calories: number | null;
  work_kj: number | null;
  normalized_power: number | null;
  intensity_factor: number | null;
  variability_index: number | null;
  sport: string | null;
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
    const avg_hr = Number.isFinite(workoutData?.avg_heart_rate) ? Number(workoutData.avg_heart_rate) : (Number.isFinite(workoutData?.metrics?.avg_heart_rate) ? Number(workoutData.metrics.avg_heart_rate) : null);
    const max_hr = Number.isFinite(workoutData?.max_heart_rate) ? Number(workoutData.max_heart_rate) : (Number.isFinite(workoutData?.metrics?.max_heart_rate) ? Number(workoutData.metrics.max_heart_rate) : null);
    const max_power = Number.isFinite(workoutData?.max_power) ? Number(workoutData.max_power) : (Number.isFinite(workoutData?.metrics?.max_power) ? Number(workoutData.metrics.max_power) : null);
    // Prefer metrics.avg_speed (already in km/h), fallback to root avg_speed (also km/h for Strava)
    // Final fallback: calculate from distance and duration
    const avg_speed_kmh = Number.isFinite(workoutData?.metrics?.avg_speed) ? Number(workoutData.metrics.avg_speed) 
      : (Number.isFinite(workoutData?.avg_speed) ? Number(workoutData.avg_speed) 
      : (distance_km && duration_s && duration_s > 0 ? (distance_km / (duration_s / 3600)) : null));
    const avg_speed_mps = Number.isFinite(avg_speed_kmh) ? (avg_speed_kmh as number) / 3.6 : null;
    const avg_pace_s_per_km = Number.isFinite(workoutData?.avg_pace) ? Number(workoutData.avg_pace) : (Number.isFinite(workoutData?.metrics?.avg_pace) ? Number(workoutData.metrics.avg_pace) : null);
    const avg_running_cadence_spm = Number.isFinite((workoutData as any)?.avg_running_cadence) ? Number((workoutData as any).avg_running_cadence) : (Number.isFinite((workoutData as any)?.avg_run_cadence) ? Number((workoutData as any).avg_run_cadence) : null);
    const avg_cycling_cadence_rpm = Number.isFinite((workoutData as any)?.avg_bike_cadence) ? Number((workoutData as any).avg_bike_cadence) : (Number.isFinite((workoutData as any)?.metrics?.avg_bike_cadence) ? Number((workoutData as any).metrics.avg_bike_cadence) : null);
    const calories = Number.isFinite(workoutData?.calories) ? Number(workoutData.calories) : (Number.isFinite(workoutData?.metrics?.calories) ? Number(workoutData.metrics.calories) : null);
    
    // New fields for cycling metrics
    const max_speed_mps = Number.isFinite(workoutData?.max_speed) ? Number(workoutData.max_speed) : (Number.isFinite(workoutData?.metrics?.max_speed) ? Number(workoutData.metrics.max_speed) : null);
    const max_cadence_rpm = Number.isFinite(workoutData?.max_cadence) ? Number(workoutData.max_cadence) : (Number.isFinite(workoutData?.max_cycling_cadence) ? Number(workoutData.max_cycling_cadence) : (Number.isFinite(workoutData?.max_running_cadence) ? Number(workoutData.max_running_cadence) : null));
    const work_kj = Number.isFinite(workoutData?.total_work) ? Number(workoutData.total_work) : null;
    const normalized_power = Number.isFinite(workoutData?.normalized_power) ? Number(workoutData.normalized_power) : null;
    const intensity_factor = Number.isFinite(workoutData?.intensity_factor) ? Number(workoutData.intensity_factor) : null;
    const variability_index = Number.isFinite(workoutData?.variability_index) ? Number(workoutData.variability_index) : null;
    
    const sport = typeof workoutData?.type === 'string' ? String(workoutData.type).toLowerCase() : null;
    const series = workoutData?.computed?.analysis?.series || null;
    return { distance_m, distance_km, duration_s, elapsed_s, elevation_gain_m, avg_power, avg_hr, max_hr, max_power, max_speed_mps, max_cadence_rpm, avg_speed_kmh, avg_speed_mps, avg_pace_s_per_km, avg_running_cadence_spm, avg_cycling_cadence_rpm, calories, work_kj, normalized_power, intensity_factor, variability_index, sport, series };
  }, [workoutData]);
};
