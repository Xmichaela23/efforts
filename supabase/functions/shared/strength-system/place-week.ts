// ============================================================================
// ⛔⛔ THIS FILE NO LONGER PLACES ANYTHING. WHAT IS LEFT IS THE VOCABULARY (stage 5, 2026-08-21).
//
// `placeLiftingWeek` and its machinery — `requiredClearanceHours`, `clearanceHours`,
// `lowerDayPenalty`, `resolveStacking`, `stackGapHours`, `MAX_ACTIVE_DAYS`, `LiftSlot`,
// `StackResolution`, `PlacedWeek`, ~330 lines — were DELETED here. Placement moved to
// `_shared/week-model/` in the engine swap, and the composer's one remaining call sat behind
// `solved.status === 'unsolvable'` — a status the adapter has two returns and cannot produce.
// Proven per symbol before removal: every one had zero production readers, and the only references
// outside this file were in `place-week.test.ts` (deleted with them) and in COMMENTS.
//
// ⚠️ THE LAW DID NOT LIVE HERE AND STILL DOES NOT. `requiredClearanceHours` was a one-line wrapper
// over `requiredAdjacencyHours('lower_body_strength', kind)` in
// `_shared/schedule-session-constraints.ts`, which is the authority and is unchanged. The clearance
// assertions that used to reach the table through the deleted placer now run against it directly,
// in `_shared/schedule-session-constraints.clearances.test.ts`.
//
// ⛔ WHAT REMAINS IS IMPORTED AND LIVE: `DayName`, `DAYS`, `EndurancePin`, `MIN_STACK_GAP_H`, all
// read by `strength-primary-plan.ts`. The rest-day rule the deleted `MAX_ACTIVE_DAYS` stated is
// live too — it is `resolve(units, { minRestDays: 1 })` in `week-model/solver-adapter.ts`. The
// constant was the OLD engine's statement of it and had no code readers left.
//
// ── the original header, kept because the reasoning is still the block's ─────────────────────────
//
// PLACING THE LIFTING WEEK AROUND THE ATHLETE'S ENDURANCE ABSOLUTES.
//
// Michael, 2026-07-25: *"we build around them, that's the whole point — we need strength to build
// around their endurance absolutes, be it a club ride, club run, and their long rides and runs."*
//
// The endurance pins are the SKELETON. A long run is Sunday because that is when they run long; a
// club ride is Wednesday because that is when the club rides. Daylight, weather and other people
// decide those. The four lifting days are solved into what is left.
//
// This inverts the previous composer, where the grid was hardcoded Mon/Tue/Thu/Fri and the long run
// was permitted to be Saturday or Sunday and nothing else.
//
// ── ⛔ WHY THIS IS NOT `_shared/week-optimizer.ts` ────────────────────────────────────────────────
//
// The optimizer is the sole authority on placement for race and combined plans, and the instinct
// (correctly) is not to build a second one. Two facts made that the wrong move here:
//
//   1. **It cannot represent this week.** `WeekOptimizerInputs.preferences.strength_frequency` is
//      typed `1 | 2 | 3` (week-optimizer.ts:159). Strength Focus is FOUR lifting days. Widening that
//      type changes the input contract every race plan flows through.
//   2. **It has no immovable pin.** Every anchor it takes is a preference it may overrule — a club
//      ride day gets relocated with a logged trade-off. An absolute is the opposite of that.
//
// What is NOT duplicated is the LAW. The clearance rules come from
// `_shared/schedule-session-constraints.ts` — the same table the optimizer reads. If a clearance
// changes it changes once and both engines follow. Duplicating those constants here is the mistake
// this comment exists to prevent.
// ============================================================================

// ⚠️ `requiredAdjacencyHours`, `SAME_DAY_COMPATIBLE` and `stackNeedsRecoveryGap` are no longer
// imported — they belonged to the deleted placer, and the live engine reads them directly.
import type { MatrixSessionKind } from '../../_shared/schedule-session-constraints.ts';

export type DayName =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export const DAYS: DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * An endurance session the athlete does not move.
 */
export type EndurancePin = {
  day: DayName;
  /** What it does to the legs. Drives the clearance a lifting day needs from it. */
  kind: MatrixSessionKind;
  /** Athlete-facing label, so the plan can name what it placed around. */
  label: string;
  /**
   * Can the athlete run this day as AM and PM sessions at least six hours apart?
   *
   * ⛔ REDEFINED 2026-07-27. This was a GATE — no pin could carry a lift unless it was explicitly
   * true. That was wrong, and it was wrong in a way that made the engine refuse weeks that fit.
   *
   * `MIN_STACK_GAP_H` exists because Robineau tested LIFTING AGAINST ENDURANCE IN THE SAME LEGS. A
   * bench press beside a bike ride is not that. It shares no prime movers — which is the identical
   * argument this file already makes for why the stacked lift is always an upper one. So the engine
   * was gating a FREE stack behind a question most athletes answer no to, and then reporting a
   * solvable week as unsolvable.
   *
   * It is now an UPGRADE, not a gate: `true` means the athlete genuinely trains twice, so the stack
   * is reported with a real six-hour gap. Anything else means one session block, ordered, lift first
   * — which costs nothing when the two do not compete. Whether they compete is
   * `stackNeedsRecoveryGap`, not this field.
   */
  canSplitDay?: boolean;
};

/**
 * ⛔ SIX HOURS, AND THE REASON IS THE WHOLE SAFEGUARD.
 *
 * Robineau 2016 (n=58, 7 weeks) is the only trial that tested this directly. **Zero hours between
 * lifting and endurance produced lower strength gains** (half-squat 1RM +16.8% at 0h vs +31.2% at 6h
 * and +25.9% at 24h). So a stacked day is safe *because of the gap* — and a stacked day without one
 * is not a compromise, it is the single worst arm of the only study on the question.
 *
 * ⛔ CORRECTED 2026-07-26 — this comment said "six hours and twenty-four hours performed the same as
 * each other." That is true for the STRENGTH outcome and FALSE for the aerobic one. **VO2peak change
 * was higher at 24h than at both 0h and 6h**, and the authors call 0h — and to a lesser extent
 * twice-daily 6h training — not optimal for neuromuscular AND aerobic improvement.
 * ⛔ SO: 24h IS THE TARGET. 6h IS THE FALLBACK. They are not equivalent.
 * ⚠️ MIN_STACK_GAP_H STAYS AT 6 — it is the floor that makes a stacked day survivable when the
 * athlete cannot split any further, not the arrangement to aim for. A scheduler that treats 6h as
 * equal to 24h will stack by preference and quietly cost the aerobic side.
 * (Schumann 2022 agrees on the strength axis: attenuation p=0.043 same-session, n.s. at ≥3h.)
 *
 * ⛔ SCOPED 2026-07-27 — THIS GOVERNS COMPETING PAIRS ONLY. Robineau loaded the SAME LEGS twice; the
 * finding does not reach a pair that shares no prime movers. A bench press after a bike ride needs no
 * gap, and demanding one made the engine call solvable weeks unsolvable. `stackNeedsRecoveryGap` in
 * the law file decides which pairs this applies to; `stackGapHours` applies it.
 *
 * Where it DOES apply — a lower lift beside a leg-loaded endurance session — the intake must still
 * ASK whether the day can be split rather than infer it from the athlete accepting a stack. Most
 * people cannot split a weekday, and offering that stack without the gap would be worse than not
 * offering it, because the app would appear to have sanctioned it.
 *
 * (History: an earlier version of this project's docs carried 24h as a hard rule. That was wrong —
 * 24h was the previous program's recommendation before *important* sessions, not Robineau's floor. The tighter
 * number distorted the whole scheduling argument. Do not reinstate it.)
 */
export const MIN_STACK_GAP_H = 6;
