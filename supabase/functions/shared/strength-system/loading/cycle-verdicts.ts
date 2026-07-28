// ============================================================================
// THE SUPPLIER — turning logged work into the verdicts `workingNumberForCycles` has always accepted.
//
// ⛔ WHY THIS EXISTS. `cycleVerdicts` was a complete, tested, correct advancement gate with ZERO
// SUPPLIERS. An absent verdict meant `advance`, so the block advanced unconditionally while
// appearing to have earned it — the failure looked exactly like normal operation. This is the
// missing middle: the gate and the signal both existed and nothing joined them.
//
// ⛔ AND IT DOES NOT READ `exercise_log`. That table aggregates to `best_weight` / `best_reps`, which
// is *the heaviest set, and the most reps at that weight* — NOT the AMRAP. In 5/3/1 those usually
// coincide, because the AMRAP is the top set. They come apart the moment an athlete adds a heavy
// single afterwards: `best_reps` becomes 1, and 1 < 5 reads as a MISS on a session that went well.
// The per-set `amrap` flag survives into `workouts.strength_exercises[].sets[]` (StrengthLogger
// stamps it at :2474), and that is the only place the question can be answered honestly.
// ============================================================================

import { type WorkingNumberVerdict, verdictFrom95Set } from './wendler-531.ts';

/** The shape this reads. Deliberately minimal — it is the saved-workout JSON, not a DB row type. */
export type LoggedSet = {
  weight?: number | null;
  reps?: number | null;
  amrap?: boolean;
  completed?: boolean;
  prefilled?: boolean;
};

export type LoggedExercise = { name?: string | null; sets?: LoggedSet[] | null };
export type LoggedStrengthWorkout = { strength_exercises?: LoggedExercise[] | null };

/**
 * A set counts only if the athlete actually engaged it.
 *
 * ⛔ D-204's rule, and it matters more here than anywhere: the logger PREFILLS every prescribed set,
 * including the AMRAP, with `prefilled: true` and the planned rep count. Reading a prefill as a
 * result would hand back the prescription as though it were the performance — the plan grading its
 * own homework, which is the exact failure D-326 named.
 */
function isPerformed(s: LoggedSet): boolean {
  return s.completed !== false && !(s.completed !== true && s.prefilled === true);
}

/**
 * Reps achieved on the AMRAP set of `liftName` in this workout.
 *
 * ⛔ RETURNS `null` FOR "NOT LOGGED", NEVER 0. Michael, 2026-07-27: *"If the supplier returns 0 for
 * nothing logged, the reset path fires on a session I skipped."* `verdictFrom95Set` reads null as
 * `hold` (no evidence) and 0 as `reset` (evidence of a miss), and those must never be confused —
 * a skipped session would otherwise drop the athlete's working number 10%.
 *
 * A logged AMRAP of genuinely zero reps is still 0, and still a reset. That is a real result.
 */
export function amrapRepsForLift(
  workout: LoggedStrengthWorkout | null | undefined,
  liftName: string,
): number | null {
  const rows = workout?.strength_exercises;
  if (!Array.isArray(rows)) return null;
  const want = String(liftName).trim().toLowerCase();
  for (const ex of rows) {
    if (String(ex?.name ?? '').trim().toLowerCase() !== want) continue;
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    // ⚠️ The AMRAP is identified by its FLAG, not by being the heaviest. A joker single afterwards is
    // heavier and is not the measurement.
    const amrap = sets.find((s) => s?.amrap === true && isPerformed(s));
    if (!amrap) continue;
    const reps = Number(amrap.reps);
    return Number.isFinite(reps) && reps >= 0 ? reps : null;
  }
  return null;
}

/**
 * The verdict a single completed cycle earned for `liftName`.
 *
 * `workouts` are that cycle's logged strength sessions. More than one may name the lift (a redo, a
 * duplicate log); the LAST performed AMRAP wins, because it is the most recent evidence.
 */
export function verdictForCycle(
  workouts: readonly LoggedStrengthWorkout[],
  liftName: string,
): WorkingNumberVerdict {
  let reps: number | null = null;
  for (const w of workouts) {
    const r = amrapRepsForLift(w, liftName);
    if (r !== null) reps = r;
  }
  return verdictFrom95Set(reps);
}

/**
 * Verdicts for a block's cycles, in order, ready for `workingNumberForCycles`.
 *
 * `workoutsByCycle[i]` is the logged strength work for cycle `i + 1`. A cycle with no sessions, or
 * with sessions that never reached the AMRAP, yields `hold` — not `advance`, and not `reset`.
 *
 * ⚠️ `verdicts[i]` is EARNED IN CYCLE i+1 and decides what cycle i+2 carries, which is the contract
 * `workingNumberForCycles` already documents. The last cycle's verdict belongs to the next block.
 */
export function verdictsForCycles(
  workoutsByCycle: ReadonlyArray<readonly LoggedStrengthWorkout[]>,
  liftName: string,
): WorkingNumberVerdict[] {
  return workoutsByCycle.map((ws) => verdictForCycle(ws ?? [], liftName));
}
