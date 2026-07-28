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
 * ⛔ THE VALIDITY CHECK IS THE 95% SET, WHICH IS WEEK 3 OF THE ANCHOR — NOT "THE LATEST AMRAP".
 *
 * A first draft took the most recent performed AMRAP in the cycle. That was wrong, and it was wrong
 * in a way that only shows up when a session is missed. The anchor cycle carries THREE AMRAPs, at
 * three different loads and three different rep targets:
 *
 *   weekInCycle 1 → 85% × 5+     ≥5 is the PRESCRIPTION, so everyone passes trivially
 *   weekInCycle 2 → 90% × 3+     ≥5 is a harsh bar nobody was asked to clear
 *   weekInCycle 3 → 95% × 1+     ⛔ THIS ONE. `VALIDITY_CHECK_PCT` is 0.95.
 *
 * "Latest" coincides with week 3 only while nothing is skipped. Miss the 5/3/1 week and "latest"
 * becomes the 90% × 3+ set, where three reps is a pass by prescription and a `reset` by this gate —
 * the athlete's working number drops 10% for completing the session as written.
 *
 * So the session is selected by its WEEK IN CYCLE, which the caller already has from
 * `planned_workouts.week_number`. No 95% week logged → no evidence → `hold`.
 *
 * ⚠️ Only when the SAME week-3 session is logged more than once (a genuine redo, a duplicate) does
 * recency decide, and then the last performed AMRAP wins. That is a narrow tiebreak on repeated
 * evidence, not the rule.
 */
export const VALIDITY_CHECK_WEEK_IN_CYCLE = 3;

export type CycleSession = {
  /** 1-4, from `planned_workouts.week_number` relative to the cycle. */
  weekInCycle: number;
  workout: LoggedStrengthWorkout;
};

export function verdictForCycle(
  sessions: readonly CycleSession[],
  liftName: string,
): WorkingNumberVerdict {
  let reps: number | null = null;
  for (const s of sessions) {
    if (s?.weekInCycle !== VALIDITY_CHECK_WEEK_IN_CYCLE) continue;
    const r = amrapRepsForLift(s.workout, liftName);
    if (r !== null) reps = r;   // repeated week-3 logs: the most recent wins
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
  sessionsByCycle: ReadonlyArray<readonly CycleSession[]>,
  liftName: string,
): WorkingNumberVerdict[] {
  return sessionsByCycle.map((ss) => verdictForCycle(ss ?? [], liftName));
}

/**
 * ⛔ HOW A LOGGED SESSION FINDS ITS CYCLE, AND IT IS NOT DATE ARITHMETIC.
 *
 * A workout carries a date; a cycle is a range of plan weeks. Deriving one from the other by
 * counting days from the block start breaks the first time a plan shifts — and plans shift:
 * `materialize-plan` rewrites dates on every re-materialize, and an athlete who logs Monday's bench
 * on Tuesday, or does week 5's session in week 6, moves the date without moving the plan week.
 *
 * The plan already knows. `workouts.planned_id` → `planned_workouts.week_number` is the week the
 * session BELONGS to, written by the materializer and unchanged by any later date shuffle. Cycle
 * and week-in-cycle come from `cycleForWeek(durationWeeks, week_number)`.
 *
 * ⚠️ AN UNATTACHED WORKOUT CONTRIBUTES NOTHING. No `planned_id` means no week number, which means no
 * cycle — so it yields no verdict and the cycle holds. That is the same "absent stays absent" rule:
 * an ad-hoc session the engine cannot place is not evidence about a prescribed one.
 */
export function cycleSessionFor(
  weekNumber: number | null | undefined,
  cycles: ReadonlyArray<{ index: number; startWeek: number; endWeek: number }>,
  workout: LoggedStrengthWorkout,
): { cycleIndex: number; session: CycleSession } | null {
  if (typeof weekNumber !== 'number' || !Number.isFinite(weekNumber)) return null;
  const slot = cycles.find((c) => weekNumber >= c.startWeek && weekNumber <= c.endWeek);
  if (!slot) return null;
  return {
    cycleIndex: slot.index,
    session: { weekInCycle: weekNumber - slot.startWeek + 1, workout },
  };
}
