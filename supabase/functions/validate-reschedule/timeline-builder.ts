/**
 * Timeline Builder - Builds continuous timeline (Current Week + Next Week) for Coach Brain
 */

import { Day, PlannedWorkout } from '../_shared/coaching/types.ts';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Build a continuous timeline from planned workouts
 * Returns array of Day objects for current week + next week
 */
export async function buildTimeline(
  supabase: any,
  userId: string,
  workoutDate: string,
  trainingPlanId: string | null
): Promise<Day[]> {
  // Calculate date range: 7 days before workout date to 7 days after (14 days total)
  const workoutDateObj = new Date(workoutDate + 'T12:00:00');
  const startDate = new Date(workoutDateObj);
  startDate.setDate(startDate.getDate() - 7); // 7 days before
  const endDate = new Date(workoutDateObj);
  endDate.setDate(endDate.getDate() + 7); // 7 days after

  const startISO = startDate.toISOString().split('T')[0];
  const endISO = endDate.toISOString().split('T')[0];

  // Fetch planned workouts in range
  let query = supabase
    .from('planned_workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startISO)
    .lte('date', endISO)
    .order('date', { ascending: true });

  // If part of a plan, filter by plan
  if (trainingPlanId) {
    query = query.eq('training_plan_id', trainingPlanId);
  }

  const { data: plannedWorkouts, error } = await query;

  if (error) {
    console.error('[timeline-builder] Error fetching planned workouts:', error);
    throw new Error(`Failed to fetch planned workouts: ${error.message}`);
  }

  // Build map of date -> workouts
  const workoutsByDate = new Map<string, PlannedWorkout[]>();
  (plannedWorkouts || []).forEach((w: PlannedWorkout) => {
    const dateKey = w.date;
    if (!workoutsByDate.has(dateKey)) {
      workoutsByDate.set(dateKey, []);
    }
    workoutsByDate.get(dateKey)!.push(w);
  });

  // Build timeline array
  const timeline: Day[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dateISO = current.toISOString().split('T')[0];
    const dayOfWeek = current.getDay();
    const dayName = DAY_NAMES[dayOfWeek];
    
    // Get workouts for this date (take first one if multiple)
    const workouts = workoutsByDate.get(dateISO) || [];
    const workout = workouts.length > 0 ? workouts[0] : null;

    timeline.push({
      name: dayName,
      date: dateISO,
      workout: workout || null
    });

    current.setDate(current.getDate() + 1);
  }

  return timeline;
}

/**
 * Find the index of a workout date in the timeline
 */
export function findDayIndex(timeline: Day[], date: string): number {
  return timeline.findIndex(d => d.date === date);
}
