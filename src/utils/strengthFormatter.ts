/**
 * Single source of truth for strength exercise display formatting
 * Extracted from existing StructuredPlannedView logic
 * 
 * Updated to support weight_display from materializer which includes
 * clarity labels like "40 lb each" for dumbbell exercises.
 */

/**
 * Format a strength exercise for display
 * Used by PlannedWorkoutSummary and StructuredPlannedView
 * 
 * @param exercise - Exercise object with name, sets, reps, weight, weight_display, notes
 * @param units - 'imperial' (lb) or 'metric' (kg), defaults to 'imperial'
 */
export function formatStrengthExercise(
  exercise: any,
  units: 'imperial' | 'metric' = 'imperial'
): string {
  // Extract name
  const name = String(exercise?.name || 'Exercise').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Extract sets
  const sets = Math.max(1, Number(exercise?.sets || exercise?.setsCount || 0));
  
  // Extract reps (can be number or string like "AMRAP" or "10 each side")
  const reps = (() => {
    const r = exercise?.reps || exercise?.repCount;
    if (typeof r === 'string') {
      // Keep descriptive rep strings as-is (e.g., "10 each side", "AMRAP")
      return r;
    }
    if (typeof r === 'number') return Math.max(1, Math.round(r));
    return undefined;
  })();
  
  // Extract weight - prefer weight_display (includes "each" for dumbbells)
  const weightDisplay = exercise?.weight_display;
  const wt = Number(exercise?.weight || exercise?.load || 0);
  const unit = units === 'metric' ? ' kg' : ' lb';
  
  // Check if exercise is bodyweight (by name pattern or displayFormat)
  const normName = name.toLowerCase().replace(/[\s-]/g, '');
  const isBw = /^(?:.*(?:dip|chinup|pullup|pushup|plank|bodyweight|jumpsquat|boxjump|burpee).*)$/.test(normName)
    || weightDisplay === 'Bodyweight'
    || weightDisplay === 'Band';
  
  // Extract notes (band resistance, etc.)
  const notes = exercise?.notes ? ` (${String(exercise.notes).trim()})` : '';
  
  // Build display string
  const parts: string[] = [name];
  if (sets > 0 && reps != null) parts.push(`${sets}×${reps}`);
  
  // Use weight_display if available (includes "each" for per-hand exercises)
  if (weightDisplay && !isBw && weightDisplay !== 'Bodyweight' && weightDisplay !== 'Band') {
    parts.push(`@ ${weightDisplay}`);
  } else if (wt > 0 && !isBw) {
    parts.push(`@ ${Math.round(wt)}${unit}`);
  }
  
  return parts.join(' ') + notes;
}

