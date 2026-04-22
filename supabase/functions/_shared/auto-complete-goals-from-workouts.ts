/**
 * After imports / learn-fitness: mark past event goals completed when a matching workout exists.
 * Separated from goal-finish-from-workouts to avoid a circular import with arc-context.
 */
import {
  resolveFinishFromWorkouts,
  ymdFromWorkoutDate,
  type WorkoutFinishRow,
} from './goal-finish-from-workouts.ts';
import { recomputeRaceProjectionsForUser } from './recompute-goal-race-projections.ts';

function todayYmdUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Auto-complete event goals where race day has passed and a matching completed workout exists.
 * Sets `status = completed` and `target_time` (seconds) from workout time when `target_time` is null.
 * Non-fatal: wrapped in try/catch, never throws.
 */
export async function autoCompleteGoalsFromWorkouts(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<void> {
  try {
    const today = todayYmdUTC();
    const { data: activeGoals, error: gErr } = await supabase
      .from('goals')
      .select('id, name, target_date, sport, target_time, status, goal_type')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('goal_type', 'event')
      .not('target_date', 'is', null)
      .lt('target_date', today);
    if (gErr) {
      console.warn('[arc] autoCompleteGoalsFromWorkouts goals', gErr.message);
      return;
    }
    const rows = (activeGoals || []) as Array<{
      id: string;
      name: string;
      target_date: string;
      sport: string | null;
      target_time: number | null;
    }>;
    if (rows.length === 0) return;

    const dates = [...new Set(rows.map((r) => String(r.target_date).slice(0, 10)))];
    if (dates.length === 0) return;

    const { data: wrows, error: wErr } = await supabase
      .from('workouts')
      .select('id, type, date, moving_time, elapsed_time, workout_status')
      .eq('user_id', userId)
      .in('date', dates)
      .eq('workout_status', 'completed');
    if (wErr) {
      console.warn('[arc] autoCompleteGoalsFromWorkouts workouts', wErr.message);
      return;
    }
    const byDate = new Map<string, WorkoutFinishRow[]>();
    for (const w of wrows || []) {
      const d = ymdFromWorkoutDate((w as { date?: unknown }).date);
      if (!d) continue;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(w as WorkoutFinishRow);
    }

    let anyCompleted = false;

    for (const g of rows) {
      const d = String(g.target_date).slice(0, 10);
      const dayW = byDate.get(d) || [];
      const { found, finishSeconds } = resolveFinishFromWorkouts(g.sport, dayW);
      if (!found) continue;

      const payload: Record<string, unknown> = { status: 'completed', updated_at: new Date().toISOString() };
      if (g.target_time == null && finishSeconds != null) {
        payload.target_time = finishSeconds;
      }
      const { error: uErr } = await supabase
        .from('goals')
        .update(payload)
        .eq('id', g.id)
        .eq('user_id', userId);
      if (uErr) {
        console.warn('[arc] autoCompleteGoalsFromW update', g.id, uErr.message);
        continue;
      }
      anyCompleted = true;
      console.log(`[arc] auto-completed goal: ${g.name} from workout on ${d}`);
    }

    if (anyCompleted) {
      await recomputeRaceProjectionsForUser(supabase, userId);
    }
  } catch (e) {
    console.warn('[arc] autoCompleteGoalsFromWorkouts', e);
  }
}
