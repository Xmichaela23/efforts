/**
 * Map goal.sport to workout rows on a given calendar day. Used to auto-complete
 * past event goals and to fill recent_completed_events in the Arc.
 */
import { normType } from './athlete-identity-inference.ts';

/** Kept for documentation / parity with the product spec. */
export const sportToWorkoutType: Record<string, string[]> = {
  run: ['run'],
  ride: ['ride'],
  swim: ['swim'],
  triathlon: ['run', 'ride', 'swim'],
};

export type WorkoutFinishRow = {
  type?: string | null;
  moving_time?: unknown;
  elapsed_time?: unknown;
  workout_status?: string | null;
};

export function ymdFromWorkoutDate(date: unknown): string {
  if (date == null) return '';
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  const s = String(date);
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/** `moving_time` / `elapsed_time` in DB are minutes; convert to whole seconds. */
function minutesToSeconds(m: unknown): number | null {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60);
}

function finishSecondsFromRow(w: WorkoutFinishRow): number | null {
  return minutesToSeconds(w.moving_time) ?? minutesToSeconds(w.elapsed_time);
}

function isCompletedWorkout(w: WorkoutFinishRow): boolean {
  return String(w.workout_status || '').toLowerCase() === 'completed';
}

export type GoalSportBucket = 'run' | 'ride' | 'swim' | 'tri' | 'other';

export function goalSportBucket(sport: string | null | undefined): GoalSportBucket {
  const t = (sport || '').toLowerCase();
  if (t.includes('tri') || t.includes('70.3') || t.includes('140.6') || t.includes('ironman')) {
    return 'tri';
  }
  if (t === 'swim' || t.startsWith('swim')) return 'swim';
  if (t === 'ride' || t.includes('ride') || t.includes('bike') || t.includes('cycl')) return 'ride';
  if (t === 'run' || t.includes('run')) return 'run';
  return 'other';
}

/**
 * `found`: at least one completed workout on that day matches the goal sport pattern.
 * `finishSeconds`: tri = sum of matching legs; single-discipline = max among matches (one race per sport).
 */
export function resolveFinishFromWorkouts(
  goalSport: string | null | undefined,
  dayWorkouts: WorkoutFinishRow[],
): { found: boolean; finishSeconds: number | null } {
  const completed = dayWorkouts.filter(isCompletedWorkout);
  if (completed.length === 0) return { found: false, finishSeconds: null };

  const bucket = goalSportBucket(goalSport);
  if (bucket === 'other') return { found: false, finishSeconds: null };

  if (bucket === 'tri') {
    const legs: WorkoutFinishRow[] = [];
    for (const w of completed) {
      const n = normType(workoutTypeFromRow(w));
      if (n === 'run' || n === 'ride' || n === 'swim') legs.push(w);
    }
    if (legs.length === 0) return { found: false, finishSeconds: null };
    let sum = 0;
    for (const w of legs) {
      const s = finishSecondsFromRow(w);
      if (s) sum += s;
    }
    return { found: true, finishSeconds: sum > 0 ? sum : null };
  }

  const want = bucket;
  const same: WorkoutFinishRow[] = [];
  for (const w of completed) {
    if (normType(workoutTypeFromRow(w)) === want) same.push(w);
  }
  if (same.length === 0) return { found: false, finishSeconds: null };
  let best: number | null = null;
  for (const w of same) {
    const s = finishSecondsFromRow(w);
    if (s != null) best = best == null ? s : Math.max(best, s);
  }
  return { found: true, finishSeconds: best };
}

function workoutTypeFromRow(w: WorkoutFinishRow): string {
  return w.type != null ? String(w.type) : '';
}
