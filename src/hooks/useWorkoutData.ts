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
  max_pace_s_per_km: number | null;
  max_cadence_rpm: number | null;
  avg_speed_kmh: number | null;
  avg_speed_mps: number | null;
  avg_pace_s_per_km: number | null;
  avg_running_cadence_spm: number | null;
  avg_cycling_cadence_rpm: number | null;
  avg_swim_pace_per_100m: number | null;
  avg_swim_pace_per_100yd: number | null;
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
    // Calculate avg_pace - MUST use same source as Summary screen for consistency
    // Summary uses computed.overall.avg_pace_s_per_mi, so Details should use the same
    // Convert from per-mile to per-km: divide by 1.60934
    const avg_pace_s_per_km = Number.isFinite(workoutData?.computed?.overall?.avg_pace_s_per_mi) 
      ? Number(workoutData.computed.overall.avg_pace_s_per_mi) / 1.60934  // Convert mi to km
      : (Number.isFinite(workoutData?.avg_pace) ? Number(workoutData.avg_pace) 
      : (Number.isFinite(workoutData?.metrics?.avg_pace) ? Number(workoutData.metrics.avg_pace) 
      : (avg_speed_kmh && avg_speed_kmh > 0 ? (3600 / avg_speed_kmh) : null)));
    const avg_running_cadence_spm = Number.isFinite((workoutData as any)?.avg_cadence) ? Number((workoutData as any).avg_cadence) : (Number.isFinite((workoutData as any)?.avg_running_cadence) ? Number((workoutData as any).avg_running_cadence) : (Number.isFinite((workoutData as any)?.avg_run_cadence) ? Number((workoutData as any).avg_run_cadence) : null));
    const avg_cycling_cadence_rpm = Number.isFinite((workoutData as any)?.avg_cadence) ? Number((workoutData as any).avg_cadence) : (Number.isFinite((workoutData as any)?.avg_bike_cadence) ? Number((workoutData as any).avg_bike_cadence) : (Number.isFinite((workoutData as any)?.metrics?.avg_bike_cadence) ? Number((workoutData as any).metrics.avg_bike_cadence) : null));
    const calories = Number.isFinite(workoutData?.calories) ? Number(workoutData.calories) : (Number.isFinite(workoutData?.metrics?.calories) ? Number(workoutData.metrics.calories) : null);
    
    // max_speed: use computed.overall.max_speed_mps (calculated from normalized samples)
    // Fallback to direct field/metrics for backwards compatibility
    const max_speed_mps = Number.isFinite(workoutData?.computed?.overall?.max_speed_mps)
      ? Number(workoutData.computed.overall.max_speed_mps)
      : (Number.isFinite(workoutData?.max_speed) ? Number(workoutData.max_speed) / 3.6  // Convert km/h to m/s
      : (Number.isFinite(workoutData?.metrics?.max_speed) ? Number(workoutData.metrics.max_speed) / 3.6  // Convert km/h to m/s
      : null));
    const max_cadence_rpm = Number.isFinite(workoutData?.max_cadence) ? Number(workoutData.max_cadence) : (Number.isFinite(workoutData?.max_cycling_cadence) ? Number(workoutData.max_cycling_cadence) : (Number.isFinite(workoutData?.max_running_cadence) ? Number(workoutData.max_running_cadence) : null));
    // Use server-calculated max_pace from computed.analysis.bests (most accurate - from series data)
    // Fallback: calculate from max_speed_mps if available
    let max_pace_s_per_km = Number.isFinite(workoutData?.computed?.analysis?.bests?.max_pace_s_per_km) 
      ? Number(workoutData.computed.analysis.bests.max_pace_s_per_km)
      : (Number.isFinite(workoutData?.calculated_metrics?.max_pace_s_per_km) 
      ? Number(workoutData.calculated_metrics.max_pace_s_per_km) 
      : (Number.isFinite(workoutData?.metrics?.max_pace) ? Number(workoutData.metrics.max_pace) : 
      (Number.isFinite(workoutData?.max_pace) ? Number(workoutData.max_pace) : null)));
    
    // Fallback: calculate max pace from max_speed_mps if max_pace not available
    if (!max_pace_s_per_km && max_speed_mps && max_speed_mps > 0) {
      max_pace_s_per_km = 1000 / max_speed_mps; // Convert m/s to s/km
    }
    const work_kj = Number.isFinite(workoutData?.total_work) ? Number(workoutData.total_work) : null;
    // Read from computed.analysis.power (server-calculated)
    const powerMetrics = workoutData?.computed?.analysis?.power;
    const normalized_power = Number.isFinite(powerMetrics?.normalized_power) ? Number(powerMetrics.normalized_power) : null;
    const intensity_factor = Number.isFinite(powerMetrics?.intensity_factor) ? Number(powerMetrics.intensity_factor) : null;
    const variability_index = Number.isFinite(powerMetrics?.variability_index) ? Number(powerMetrics.variability_index) : null;
    
    // Read swim pace (server-calculated)
    const swimMetrics = workoutData?.computed?.analysis?.swim;
    const avg_swim_pace_per_100m = Number.isFinite(swimMetrics?.avg_pace_per_100m) ? Number(swimMetrics.avg_pace_per_100m) : null;
    const avg_swim_pace_per_100yd = Number.isFinite(swimMetrics?.avg_pace_per_100yd) ? Number(swimMetrics.avg_pace_per_100yd) : null;
    
    const sport = typeof workoutData?.type === 'string' ? String(workoutData.type).toLowerCase() : null;
    const series = workoutData?.computed?.analysis?.series || null;
    return { distance_m, distance_km, duration_s, elapsed_s, elevation_gain_m, avg_power, avg_hr, max_hr, max_power, max_speed_mps, max_pace_s_per_km, max_cadence_rpm, avg_speed_kmh, avg_speed_mps, avg_pace_s_per_km, avg_running_cadence_spm, avg_cycling_cadence_rpm, avg_swim_pace_per_100m, avg_swim_pace_per_100yd, calories, work_kj, normalized_power, intensity_factor, variability_index, sport, series };
  }, [workoutData]);
};
