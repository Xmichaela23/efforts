/**
 * Strength exercise display helpers
 *
 * Smart server, dumb client:
 * - Server provides everything: weight_display, baseline_missing, required_baseline
 * - Client just reads and displays
 *
 * ⛔ THE ROW SENTENCE IS THE SERVER'S (2026-09-10, audit H-D14). `formatStrengthExercise` and
 * `formatStrengthExerciseLines` moved to `supabase/functions/_shared/strength/strength-display-lines.ts`;
 * materialize-plan stamps `strength.display_line` and `computed.strength_lines`, and the planned screens
 * print those. Their tests moved with them.
 */

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

/**
 * ⛔ `plainLiftList` IS DELETED (2026-09-18, round 3, audit item 11). The Today drawer built its own strength line
 * here — `name · sets × reps · weight`, with the kind word as a heading and the stored `weight` string ("By feel")
 * when `weight_display` was absent. It now prints the server's line, `computed.strength_lines`
 * (`_shared/strength/strength-display-lines.ts`), the same lines the planned sheet prints.
 */
