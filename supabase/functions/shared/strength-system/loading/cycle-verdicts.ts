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

import {
  type CycleKind,
  type WorkingNumberVerdict,
  cycleIncrementLb,
  cyclesForBlock,
  verdictFrom95Set,
  verdictFromTmTestSet,
  WEEKS_PER_CYCLE,
} from './wendler-531.ts';
// ⛔ ONE PLACE FOR "a set → a training max" (§1d). See `trainingMaxFromSet`'s own header: writing
// `estimate1RM(w, r) * 0.85` a second time here is precisely the 85%-vs-90% trap it exists to stop.
import { trainingMaxFromSet } from '../amrap-catch-up.ts';

export type StoredCycle = { index: number; kind: CycleKind; startWeek: number; endWeek: number };

/**
 * ⛔ THE CYCLES THE BUILDER ACTUALLY WROTE, not a fresh guess at them. **ONE COPY, 2026-08-15.**
 *
 * `cyclesForBlock(weeks, shape)` needs the shape inputs (continuity, posture, aerobic load) that were
 * true AT BUILD TIME. Re-deriving them now can produce a different leader/anchor split — and, since
 * §1c, a different WEEK MAP — than the block on the athlete's calendar. Grouping logged sessions
 * against a structure that does not exist silently files the 95% week as an ordinary week, and the
 * verdict comes back `hold` for a cycle the athlete actually passed. That is evidence loss with no
 * error anywhere.
 *
 * ⚠️ THIS LIVED IN `rematerialize-strength-block` AND `create-goal-and-materialize-plan` DID NOT HAVE
 * IT — the second caller re-derived, which is the bug above. Moved here so both read one rule.
 *
 * Falls back to `cyclesForBlock` only when a plan predates `phase_structure`.
 */
export function cyclesFromStoredPhases(config: any, weeks: number): StoredCycle[] {
  const phases = config?.phase_structure?.phases;
  const work = Array.isArray(phases)
    ? phases
        .filter((p: any) => {
          const n = String(p?.name ?? '').trim().toLowerCase();
          return n === 'leader' || n === 'anchor';
        })
        .map((p: any) => ({
          kind: String(p.name).trim().toLowerCase() as CycleKind,
          startWeek: Number(p.start_week),
          endWeek: Number(p.end_week),
        }))
        .filter((p: any) => Number.isFinite(p.startWeek))
        .sort((a: any, b: any) => a.startWeek - b.startWeek)
    : [];
  if (work.length === 0) return cyclesForBlock(weeks).map((c) => ({ ...c }));
  return work.map((p: any, i: number) => ({
    index: i + 1,
    kind: p.kind,
    startWeek: p.startWeek,
    // ⚠️ THE STORED `end_week` WINS. An old four-week-cycle block wrote its work phase as weeks 1-3
    // with the deload as a separate entry, and a new one writes 2-4 — both are three weeks and both
    // are stated. Deriving from `WEEKS_PER_CYCLE` is the fallback for a phase entry missing its end.
    endWeek: Math.min(
      Number.isFinite(p.endWeek) && p.endWeek >= p.startWeek ? p.endWeek : p.startWeek + WEEKS_PER_CYCLE - 1,
      weeks,
    ),
  }));
}

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
  // ⛔ THE LIFT NAME TRAVELS WITH THE REPS. The trust ceiling is per-lift — deadlift estimates are
  // biased low, not merely noisy (LeSuer 1997) — and omitting the name here would silently give the
  // deadlift the general 8-rep ceiling, which is the one lift that must not have it.
  return verdictFrom95Set(reps, liftName);
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
/**
 * ⛔ THE JOIN'S OUTPUT SHAPE, AND THE SEAM THIS ARC KEEPS FINDING THINGS IN.
 *
 * One row per completed strength workout, joined to the plan week it belongs to. Kept as a pure
 * function over already-fetched rows so the grouping is testable without a database — the query is
 * one line, the grouping is where a mistake hides.
 */
export type JoinedStrengthRow = {
  /** `planned_workouts.week_number` via `workouts.planned_id`. Null when unattached. */
  week_number?: number | null;
  strength_exercises?: LoggedExercise[] | null;
};

export function groupSessionsByCycle(
  rows: readonly JoinedStrengthRow[],
  cycles: ReadonlyArray<{ index: number; startWeek: number; endWeek: number }>,
): CycleSession[][] {
  const byCycle: CycleSession[][] = cycles.map(() => []);
  for (const r of rows ?? []) {
    const placed = cycleSessionFor(r?.week_number, cycles, { strength_exercises: r?.strength_exercises });
    if (!placed) continue;   // unattached, or a week outside the block — contributes nothing
    const slot = byCycle[placed.cycleIndex - 1];
    if (slot) slot.push(placed.session);
  }
  return byCycle;
}

/**
 * ⛔ ONE REGENERATION SPANS BOTH REGIMES, SO THE SWITCH IS PER CYCLE — NOT PER CALL.
 *
 * Michael, 2026-07-27: *"Get that wrong in either direction and you either flatten the forward
 * projection or launder a real miss into an advance."*
 *
 *   • A cycle that has FINISHED reads its verdict, and an absent one means `hold` — nothing was
 *     logged, and a missing signal is not evidence of progress.
 *   • A cycle that has NOT happened yet is a forecast. No verdict can exist for it, and holding
 *     would show identical weights across the projected cycles — the reason the composer has an
 *     `advance` exception in the first place.
 *
 * The boundary is the current plan week. Emitting explicit verdicts for BOTH regimes means
 * `workingNumberForCycles` never has to know where the boundary is: its `unknownMeans` default stays
 * `hold`, and nothing in this array is unknown.
 *
 * ⚠️ `verdicts[i]` is earned in cycle `i+1` and decides what cycle `i+2` carries, so the LAST cycle's
 * verdict is never needed here — it belongs to the next block.
 */
export function verdictsForBlock(
  cycles: ReadonlyArray<{ index: number; startWeek: number; endWeek: number }>,
  sessionsByCycle: ReadonlyArray<readonly CycleSession[]>,
  liftName: string,
  /** The plan week the athlete is currently in (1-based). */
  currentWeek: number,
): WorkingNumberVerdict[] {
  return cycles.slice(0, Math.max(0, cycles.length - 1)).map((c, i) => {
    const finished = c.endWeek < currentWeek;
    // Not finished → forecast. Finished → the evidence, and `hold` when there is none.
    return finished ? verdictForCycle(sessionsByCycle[i] ?? [], liftName) : 'advance';
  });
}

// ── THE TM-TEST WEEK (§1d) ───────────────────────────────────────────────────
//
// ⛔ THE MEASURED EVENT MOVED TO THE RESTED WEEKS ON 2026-08-15, AND THE TWO READINGS ARE NOT THE
// SAME QUESTION. Read this before wiring anything else to either:
//
//   `verdictForCycle`      week 3 of a cycle · a set at **95%** of the training max · minimum ONE rep
//                          (2nd ed. p.23) · answers "did the prescription hold this cycle"
//   `tmTestResultFor`      a standalone test week · a set at **100%** of it · bar of FIVE
//                          (Forever pp.20-21) · answers "is the training max still the right number"
//
// Running either rule over the other's set resets an athlete for completing the session as written.
// They are kept in separate functions with separate verdict tables for exactly that reason.
//
// ⚠️ THE ANCHOR'S AMRAPs ARE STILL MEASURED, and they still produce a cycle verdict — what they no
// longer do is carry the block-to-block transition alone. The stall counter
// (`STALL_CONFIRM_SESSIONS`) now applies to those in-cycle prescription failures only.

/** The plan weeks the builder wrote as TM-test weeks. Empty on a block built before 2026-08-15. */
export function testWeeksFromStoredPhases(config: any): number[] {
  const phases = config?.phase_structure?.phases;
  if (!Array.isArray(phases)) return [];
  return phases
    .filter((p: any) => {
      const n = String(p?.name ?? '').trim().toLowerCase();
      return n === 'tm test' || n === 'tm_test';
    })
    .map((p: any) => Number(p?.start_week))
    .filter((w: number) => Number.isFinite(w) && w >= 1)
    .sort((a: number, b: number) => a - b);
}

export type TmTestResult = {
  /** The plan week the test was logged in. */
  week: number;
  verdict: WorkingNumberVerdict;
  /**
   * ⛔ PRESENT ONLY ON `recalibrate` — the absolute new training max, computed off the set that was
   * actually performed (Forever p.21). Absent on every other verdict, because every other verdict is
   * a delta the walker already knows how to apply.
   */
  trainingMax?: number;
};

/**
 * The result of ONE test week for ONE lift, from the rows already fetched for the block.
 *
 * ⛔ RETURNS `null` FOR "NOT LOGGED", NEVER A `hold` WITH A NUMBER. A skipped test week is no
 * evidence — the caller holds — and manufacturing a result for it is how a missed session becomes a
 * verdict about the athlete.
 *
 * ⚠️ Repeated logs of the same week: the LAST performed AMRAP wins, the same tiebreak
 * `verdictForCycle` uses. A genuine redo is evidence; the earlier attempt is superseded.
 */
export function tmTestResultFor(
  rows: readonly JoinedStrengthRow[],
  testWeek: number,
  liftName: string,
): TmTestResult | null {
  let hit: { weight: number; reps: number } | null = null;
  for (const r of rows ?? []) {
    if (Number(r?.week_number) !== testWeek) continue;
    const set = amrapSetForLift({ strength_exercises: r?.strength_exercises }, liftName);
    if (set) hit = set;
  }
  if (!hit) return null;
  const verdict = verdictFromTmTestSet(hit.reps, liftName);
  return verdict === 'recalibrate'
    ? { week: testWeek, verdict, trainingMax: trainingMaxFromSet(hit.weight, hit.reps) }
    : { week: testWeek, verdict };
}

/**
 * The performed AMRAP set for a lift — weight AND reps, where `amrapRepsForLift` returns reps alone.
 * ⚠️ The weight is what `recalibrate` needs; a rep count on its own cannot produce a training max.
 */
function amrapSetForLift(
  workout: LoggedStrengthWorkout | null | undefined,
  liftName: string,
): { weight: number; reps: number } | null {
  const rows = workout?.strength_exercises;
  if (!Array.isArray(rows)) return null;
  const want = String(liftName).trim().toLowerCase();
  for (const ex of rows) {
    if (String(ex?.name ?? '').trim().toLowerCase() !== want) continue;
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    const amrap = sets.find((s) => s?.amrap === true && isPerformed(s));
    if (!amrap) continue;
    const weight = Number(amrap.weight);
    const reps = Number(amrap.reps);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    if (!Number.isFinite(reps) || reps < 0) return null;
    return { weight, reps };
  }
  return null;
}

/**
 * ⛔ THE BLOCK-TO-BLOCK TRANSITION GATE — SPEC §1b's outstanding debt, paid 2026-08-15.
 *
 * Given where a finished block ENDED (its last cycle's working number) and what its CLOSING test week
 * showed, this is the number the next block starts on:
 *
 *   `advance` / `advance_untrusted` → one step up (+5 upper / +10 lower). The bar was met.
 *   `hold`                          → unchanged. Short of the bar, or the test was not done.
 *   `recalibrate`                   → the number computed off the set itself, whatever that is.
 *
 * ⚠️ IT NEVER RETURNS A NUMBER BELOW THE RECALIBRATION. That is the point of the `recalibrate` path:
 * a training max the athlete cannot hit five times is replaced by one derived from what they DID
 * hit, rather than walked down 10% at a time over the next two months.
 */
export function nextBlockTrainingMax(
  endOfBlockWorkingNumber: number,
  isLowerBody: boolean,
  result: TmTestResult | null | undefined,
): number {
  const base = Number(endOfBlockWorkingNumber);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!result) return base;                                  // no test logged → hold (§0h)
  if (result.verdict === 'recalibrate') return result.trainingMax && result.trainingMax > 0 ? result.trainingMax : base;
  if (result.verdict === 'advance' || result.verdict === 'advance_untrusted') {
    return base + cycleIncrementLb(isLowerBody);
  }
  return base;
}

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
