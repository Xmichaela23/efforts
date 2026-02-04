/**
 * Type definitions for computed workout data
 * These types enforce the backend contract: pace_display is always a string, never null
 */

/**
 * Computed overall metrics for a workout
 * pace_display is guaranteed to be a string (empty data shows "—")
 */
export interface ComputedOverall {
  distance_m?: number | null;
  duration_s_moving?: number | null;
  duration_s_elapsed?: number | null;
  avg_pace_s_per_mi?: number | null;
  /** Pre-formatted pace string (e.g., "10:52/mi" or "—"). Always a string, never null. */
  pace_display: string;
}

/**
 * Interval breakdown row with pace metrics
 * pace_display and planned_pace_display are guaranteed to be strings (empty data shows "—")
 */
export interface IntervalBreakdownRow {
  interval_type: string;
  interval_number: number;
  planned_duration_s: number;
  actual_duration_s: number;
  actual_distance_m: number;
  display_duration_s: number;
  duration_adherence_percent: number;
  planned_pace_range_lower: number;
  planned_pace_range_upper: number;
  planned_pace_min_per_mi: number | null;
  actual_pace_min_per_mi: number;
  pace_s_per_mi: number | null;
  /** Pre-formatted pace string (e.g., "10:52/mi" or "—"). Always a string, never null. */
  pace_display: string;
  /** Debugging flag: true if pace was calculated from valid data */
  pace_valid: boolean;
  /** Pre-formatted planned pace string (e.g., "10:21-10:55/mi" or "—"). Always a string, never null. */
  planned_pace_display: string;
  pace_adherence_percent: number;
  performance_score: number;
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  min_heart_rate_bpm: number | null;
  elevation_start_m: number | null;
  elevation_end_m: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  net_elevation_change_m: number | null;
  avg_grade_percent: number | null;
}

/**
 * Interval breakdown result
 */
export interface IntervalBreakdownResult {
  available: boolean;
  message?: string;
  intervals?: IntervalBreakdownRow[];
}
