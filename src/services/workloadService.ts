import { supabase } from '@/lib/supabase';

interface WorkloadCalculationRequest {
  workout_id: string;
  workout_data: {
    type: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
    duration: number;
    steps_preset?: string[];
    strength_exercises?: any[];
    mobility_exercises?: any[];
    workout_status?: string;
  };
}

interface WorkloadCalculationResponse {
  success: boolean;
  workout_id: string;
  workload_planned: number | null;
  workload_actual: number | null;
  intensity_factor: number;
}

interface SweepHistoryRequest {
  user_id: string;
  batch_size?: number;
  dry_run?: boolean;
}

interface SweepHistoryResponse {
  success: boolean;
  processed: number;
  updated: number;
  errors: number;
  duration_ms: number;
  dry_run: boolean;
}

/**
 * Calculate workload for a specific workout
 */
export async function calculateWorkloadForWorkout(
  request: WorkloadCalculationRequest
): Promise<WorkloadCalculationResponse> {
  const { data, error } = await supabase.functions.invoke('calculate-workload', {
    body: request
  });

  if (error) {
    console.error('Error calculating workload:', error);
    throw new Error(`Failed to calculate workload: ${error.message}`);
  }

  return data;
}

/**
 * Sweep user history to calculate workload for all existing workouts
 */
export async function sweepUserHistory(
  request: SweepHistoryRequest
): Promise<SweepHistoryResponse> {
  const { data, error } = await supabase.functions.invoke('sweep-user-history', {
    body: request
  });

  if (error) {
    console.error('Error sweeping user history:', error);
    throw new Error(`Failed to sweep user history: ${error.message}`);
  }

  return data;
}

/**
 * Calculate workload for a workout using the database function
 * This is a fallback method that doesn't require Edge Functions
 */
export async function calculateWorkloadDirect(workoutId: string): Promise<any> {
  const { data, error } = await supabase.rpc('calculate_workload_for_workout', {
    workout_uuid: workoutId
  });

  if (error) {
    console.error('Error calculating workload directly:', error);
    throw new Error(`Failed to calculate workload: ${error.message}`);
  }

  return data;
}

/**
 * Get weekly workload summary using Edge Function
 */
export async function getWeeklyWorkloadSummary(
  userId: string,
  weekStart: string
): Promise<{
  total_planned: number;
  total_actual: number;
  hybrid_total: number;
  sessions_planned: number;
  sessions_completed: number;
  sessions: any[];
}> {
  const { data, error } = await supabase.functions.invoke('weekly-workload', {
    body: {
      user_id: userId,
      week_start_date: weekStart
    }
  });

  if (error) {
    console.error('Error fetching weekly workload:', error);
    throw new Error(`Failed to fetch weekly workload: ${error.message}`);
  }

  return data;
}

/**
 * Get workload statistics for a user
 */
export async function getWorkloadStats(userId: string): Promise<{
  total_workload: number;
  average_weekly: number;
  peak_week: number;
  recent_trend: number[];
}> {
  const { data, error } = await supabase
    .from('workouts')
    .select('workload_actual, date')
    .eq('user_id', userId)
    .eq('workout_status', 'completed')
    .not('workload_actual', 'is', null)
    .order('date', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching workload stats:', error);
    throw new Error(`Failed to fetch workload stats: ${error.message}`);
  }

  const totalWorkload = data?.reduce((sum, workout) => 
    sum + (workout.workload_actual || 0), 0) || 0;

  // Calculate weekly averages (simplified)
  const weeklyTotals = new Map<string, number>();
  data?.forEach(workout => {
    const date = new Date(workout.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    
    weeklyTotals.set(weekKey, (weeklyTotals.get(weekKey) || 0) + (workout.workload_actual || 0));
  });

  const weeklyValues = Array.from(weeklyTotals.values());
  const averageWeekly = weeklyValues.length > 0 
    ? weeklyValues.reduce((a, b) => a + b, 0) / weeklyValues.length 
    : 0;

  const peakWeek = weeklyValues.length > 0 ? Math.max(...weeklyValues) : 0;

  return {
    total_workload: totalWorkload,
    average_weekly: Math.round(averageWeekly),
    peak_week: peakWeek,
    recent_trend: weeklyValues.slice(0, 8).reverse() // Last 8 weeks
  };
}
