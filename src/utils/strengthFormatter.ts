/**
 * Strength exercise display formatting
 * 
 * Smart server, dumb client:
 * - Server provides everything: weight_display, baseline_missing, required_baseline
 * - Client just reads and displays
 */

/**
 * Format a strength exercise for display
 */
export function formatStrengthExercise(
  exercise: any,
  _units: 'imperial' | 'metric' = 'imperial'
): string {
  const name = String(exercise?.name || '').replace(/_/g, ' ').trim();
  const sets = Number(exercise?.sets) || 0;
  const reps = exercise?.reps;
  
  const parts: string[] = [name];
  if (sets > 0 && reps != null) parts.push(`${sets}×${reps}`);
  
  const weightDisplay = exercise?.weight_display;
  if (weightDisplay && weightDisplay !== 'Bodyweight' && weightDisplay !== 'Band') {
    // Show original weight if adjusted
    if (exercise?.adjusted && exercise?.original_weight != null) {
      parts.push(`@ ${weightDisplay} (was ${exercise.original_weight} lb)`);
    } else {
      parts.push(`@ ${weightDisplay}`);
    }
  } else if (exercise?.baseline_missing) {
    parts.push(`@ [Setup Required]`);
  }
  
  if (exercise?.notes) parts.push(`(${exercise.notes})`);

  /**
   * ⛔ WHAT THEY GOT LAST TIME, ON THE ROW (2026-08-26).
   *
   * A heavy slot prescribes a rep BAND and nothing else — "Bench Press 1×1-5 @ 145 lb" — and the
   * weight moves once in twelve weeks on a light bar, so a block that is progressing exactly as
   * designed reads as FROZEN for eight weeks. The progression lives in the reps; this is the only
   * place the athlete can see it moving.
   *
   * ⚠️ ABSENT MEANS ABSENT. `last_reps` is written only where the athlete has a logged result at the
   * weight now on the row, so the line disappears the week a jump lands — correct, because there is
   * no last time at the new weight yet, and repeating a count earned on a lighter bar would be a
   * claim about a session that did not happen.
   */
  const lastReps = Array.isArray(exercise?.last_reps) ? exercise.last_reps : null;
  const lastRep = lastReps && lastReps.length > 0 ? Number(lastReps[lastReps.length - 1]) : null;
  if (lastRep != null && Number.isFinite(lastRep)) {
    parts.push(`— last time ${lastRep}`);
  }

  return parts.join(' ');
}

/**
 * Check if workout needs baseline setup
 * Reads server-provided flags
 */
export function checkWorkoutNeedsBaselines(exercises: any[]): {
  needsSetup: boolean;
  requiredBaselines: string[];
  exercisesPending: string[];
} {
  const requiredSet = new Set<string>();
  const exercisesPending: string[] = [];
  
  for (const ex of exercises) {
    if (ex?.baseline_missing) {
      exercisesPending.push(ex.name);
      if (ex.required_baseline) {
        requiredSet.add(ex.required_baseline);
      }
    }
  }
  
  return {
    needsSetup: requiredSet.size > 0,
    requiredBaselines: Array.from(requiredSet),
    exercisesPending
  };
}

/**
 * Extract strength exercises from materialized workout
 */
export function getStrengthExercisesFromWorkout(workout: any): any[] {
  // Materialized: computed.steps with kind='strength'
  const steps = workout?.computed?.steps;
  if (Array.isArray(steps)) {
    return steps
      .filter((s: any) => s?.kind === 'strength')
      .map((s: any) => s.strength);
  }
  
  // Not materialized: raw strength_exercises
  const raw = workout?.strength_exercises;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return JSON.parse(raw);
  
  return [];
}
