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
  /**
   * ⛔⛔ THE EXECUTION THE ATHLETE'S KIT ACTUALLY REACHES, WHERE THE CANONICAL NAME SAYS MACHINE
   * (2026-08-31, Michael's own screen). `rear delt machine` routes to dumbbells on an incline bench
   * for him and the row named a station he does not own. The composer stamps `execution_name` when
   * — and only when — the free-weight route is the one that resolved; absent means the canonical
   * name is already the right one, and an athlete WITH the machine still reads the machine's name.
   *
   * ⚠️ DISPLAY ONLY, AND THAT IS THE WHOLE CONSTRAINT. `name` is untouched everywhere that stores,
   * logs, matches or cites: it is the key logged-vs-planned matching runs on, and moving the WORDS
   * would unmatch every set already logged against the old spelling.
   */
  const name = String(exercise?.execution_name || exercise?.name || '').replace(/_/g, ' ').trim();
  const sets = Number(exercise?.sets) || 0;
  const reps = exercise?.reps;
  
  // 2026-09-03: the book's word for the set leads (ME / DE / SKILL / HYP, p218), and the reserve the row
  // carries is printed — the same words the logger shows under the same set.
  const intent = String(exercise?.slot_intent || '').toUpperCase();
  const bookWord = (intent === 'ME' || intent === 'DE' || intent === 'SKILL' || intent === 'HYP') ? intent : null;
  const rirText = (() => {
    const r = Number(exercise?.target_rir);
    if (!Number.isFinite(r) || r < 0) return null;
    const lo = Math.floor(r), hi = Math.ceil(r);
    return lo === hi ? String(lo) : `${lo}-${hi}`;
  })();
  const parts: string[] = [bookWord ? `${bookWord} · ${name}` : name];
  if (sets > 0 && reps != null) parts.push(`${sets}×${reps}`);
  if (rirText && bookWord !== 'ME') parts.push(`· ${rirText} in reserve`);
  
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
  
  /**
   * ⛔⛔ A BY-FEEL ROW SAYS WHICH KIND OF BY-FEEL IT IS (2026-09-01).
   *
   * ⛔ THE PROBLEM IS A READING ONE AND IT HAS COST REAL DAYS. Three of the four ways a weight is
   * decided are deliberately "By feel" — an auto-regulated accessory, a pattern with no tested lift,
   * a per-side movement — and on the screen all three look identical to a weight that failed to
   * land. *"Week 2 has no weight"* gets reported, investigated, and turns out to be the design.
   *
   * ⚠️ THE SENTENCES ARE FOR THE ATHLETE, NOT FOR A DEBUGGER. Each one says what to DO or what to
   * expect, in their words: pick a load, there is nothing to price this against, it arrives when you
   * test. ⚠️ `awaiting_test` is the ONLY one that promises a number later; saying that on a curl
   * would leave an athlete waiting for something that is never coming.
   * ⚠️ AND NOTHING IS SAID WHERE A WEIGHT EXISTS. A priced row already answers the question.
   */
  if (!weightDisplay && !exercise?.baseline_missing) {
    const why: Record<string, string> = {
      auto_regulated: `your call — pick a weight that leaves ${rirText ?? '1-2'} in reserve`,
      no_tested_lift: 'no tested lift for this pattern, so it stays your call',
      per_side: 'per side — your call, so one number cannot mislead you',
      awaiting_test: 'weights arrive once you log the test',
    };
    const line = why[String(exercise?.load_basis ?? '')];
    if (line) parts.push(`— ${line}`);
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
