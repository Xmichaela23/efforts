// ============================================================================
// PROGRESSION — his rate anchors, his lower-body haircut, our double progression.
//
// ⛔ EVERY NUMBER IS LABELLED HIS OR OURS AT THE SITE. Viada leaves the progression mechanism open;
// `DECISIONS-2026-08-22-standing-plan-pivot.md` §4 fills it with FIELD-STANDARD app mechanics rather
// than Wendler's signature system, because Michael's constraint is that no plan merges two coaches'
// techniques. Wendler's wave, training max and AMRAP set are OUT of these plans.
// ============================================================================

import { RATE_ANCHOR, type FrameId } from './frames.ts';
import type { WorkingNumber } from './working-number.ts';

// ── HIS: the rate anchor ────────────────────────────────────────────────────────────────────────

/**
 * ⛔ HIS, AND PER-FRAME. p247 for Strength + 5K: *"slow gradual increases in the calculated 1RM
 * taking place every 3 to 4 weeks (assume 1 percent every 3 weeks as a starting point)."*
 * See `RATE_ANCHOR` for why this is a frame property and not a running switch.
 */
export function scheduledRise(frame: FrameId, weeks: number): number {
  return RATE_ANCHOR[frame].perWeek * Math.max(0, weeks);
}

// ── HIS: the lower-body haircut, and its phase-out ──────────────────────────────────────────────

/**
 * ⛔ HIS, AND FRAME-SPECIFIC. p247, read directly:
 *
 * > *"Monday's run is fairly challenging, given that there is an ME lower session the next day… a
 * > **3 to 4 percent reduction in working 1RM should be assumed here**. As long as progression is
 * > maintained… this reduction can be **gradually phased out in eight to ten weeks** (that is,
 * > increasing lower body estimated 1RM by about **2 percent every three weeks for the first nine
 * > weeks**)."*
 *
 * ⛔ IT COMPOSES WITH THE WORKING NUMBER AND NEVER MULTIPLIES INTO IT (Michael, 2026-08-23). The
 * working number is how a number is DERIVED from a test (96% of a predicted max, p215). This is a
 * temporary, lower-body-only allowance for the running schedule, and it PHASES OUT. Folding it into
 * the 96% would make it permanent and would make the phase-out unexpressible — the two would become
 * one number nobody could take apart again.
 *
 * ⚠️ 3.5% is the midpoint of his own 3-4% and is the only value here that is a choice; the phase-out
 * rate and its length are his, exactly.
 */
export const LOWER_HAIRCUT_INITIAL = 0.035;
export const LOWER_HAIRCUT_PHASE_OUT_PER_3_WEEKS = 0.02;
export const LOWER_HAIRCUT_PHASE_OUT_WEEKS = 9;
export const LOWER_HAIRCUT_CITE = 'Viada p247';

/**
 * ⛔ WHY THE HAIRCUT ASKS WHAT DAY 1 ACTUALLY IS, and which half of that is ours.
 *
 * HIS: the reduction, its size, its phase-out rate and its length — and its CAUSE, named on the page
 * as Monday's run landing before Tuesday's ME lower.
 *
 * ⚠️ OURS: that a bike-heavy mix does not inherit it. He states the haircut once, for this frame's
 * run layout, and the corpus contains nothing about the substituted case. What points our way is his
 * OWN reasoning for the substitution (p280 — hard riding does not land on the legs the way running
 * does), which is why the inference is stated rather than silent.
 */
export const HAIRCUT_CAUSE_IS_OURS =
  'The source ties the lower-body reduction to the hard RUN that lands the day before the heavy leg '
  + 'session, and says nothing about what happens when that session is a ride. Dropping the reduction '
  + 'for a week whose hard work is on the bike is our reading of his own reason for moving it there — '
  + 'riding hard does not land on the legs the way running does.';

/**
 * What fraction of the working number a LOWER-body slot uses in a given week.
 *
 * Week 1 starts at 1 − 3.5%. Every three weeks it recovers 2 percentage points, and after nine weeks
 * the haircut is gone. ⚠️ It never overshoots above 1: the phase-out restores the reduction, it does
 * not become a bonus.
 */
export function lowerBodyHaircut(week: number): number {
  const w = Math.max(1, Math.round(week));
  // ⚠️ NO EARLY RETURN PAST WEEK NINE, AND THAT IS MEASURED RATHER THAN ASSUMED. One stood here and
  // mutation-testing showed it guarded nothing: by week ten the recovery term already exceeds the
  // initial reduction, so the clamp below returns 1 on its own. A branch that can never change an
  // answer is the dead guard this codebase keeps deleting.
  const stepsRecovered = Math.floor((w - 1) / 3);
  const recovered = stepsRecovered * LOWER_HAIRCUT_PHASE_OUT_PER_3_WEEKS;
  return Math.min(1, 1 - LOWER_HAIRCUT_INITIAL + recovered);
}

/**
 * ⛔ THE PRESCRIBED LOAD FOR ONE SLOT — where the working number, the frame's rate anchor and the
 * haircut all meet, and the ONLY place they do.
 *
 * ⚠️ `isLower` DECIDES WHETHER THE HAIRCUT APPLIES AT ALL. It is a lower-body allowance for a run
 * that lands the day before; an upper-body slot never sees it.
 */
export function prescribedLoad(args: {
  working: WorkingNumber;
  frame: FrameId;
  week: number;
  isLower: boolean;
  /**
   * ⛔⛔ THE HAIRCUT'S STATED CAUSE, ASKED RATHER THAN ASSUMED (slice 4, 2026-08-23).
   *
   * p247, and the subject of the sentence is the RUN: *"**Monday's run is fairly challenging**, given
   * that there is an ME lower session the next day… a 3 to 4 percent reduction in working 1RM should
   * be assumed here."* Until sport-slot assignment existed, day 1's session was always a run and this
   * was always true, so the haircut keyed on `isLower` alone and was right by accident.
   *
   * ⛔ IT IS NOT RIGHT ONCE THE HARD SESSION CAN BE A RIDE. His own p280 reasoning for putting
   * intensity on the bike is that **no impact means it does not tax the lifts** — so taking three and
   * a half per cent off the squat for a session he says does not tax the lifts would be the plan
   * contradicting itself one page apart.
   *
   * ⚠️ **AND THE SUBSTITUTED CASE IS OURS.** The source states the haircut once, for this frame's run
   * layout, and never says what happens when day 1 is a ride. Reading "no run before the leg day" as
   * "no lingering fatigue to allow for" is our inference — see `HAIRCUT_CAUSE_IS_OURS`.
   *
   * ⚠️ ABSENT DEFAULTS TO TRUE, which is the run layout and the pre-slice-4 behaviour exactly. A
   * caller that has not thought about it gets the conservative arm.
   */
  hardRunBeforeLower?: boolean;
  /** Percent of the working number the intent asks for — stage 2 owns these. */
  pctOfWorkingNumber: number;
  /** ⛔ Steps land on real plates. The athlete's smallest plate pair, doubled. */
  roundTo: number;
}): { weight: number; haircut: number; risen: number } {
  const risen = 1 + scheduledRise(args.frame, Math.max(0, args.week - 1));
  const causePresent = args.hardRunBeforeLower !== false;
  const haircut = args.isLower && causePresent ? lowerBodyHaircut(args.week) : 1;
  const raw = args.working.workingNumber * risen * haircut * args.pctOfWorkingNumber;
  const step = Number.isFinite(args.roundTo) && args.roundTo > 0 ? args.roundTo : 5;
  return { weight: Math.round(raw / step) * step, haircut, risen };
}

// ── OURS: double progression ────────────────────────────────────────────────────────────────────

/**
 * ⛔ OURS, AND LABELLED — the mechanism, not the rate. Pivot §4: double progression on his rep
 * ranges, because every one of his slots IS a range (ME 1-5, DE 2-4, SKILL 3-5, HYP 6-12).
 *
 * ⚠️ **AND IT IS NOT "THE CIRCLE OF REPS".** p247 says *"progress here should be through the circle
 * of reps"* and never defines the term; it appears nowhere else in the capture (corpus gap G-8).
 * Double progression is the field-standard reading and may well be what he means — **but it ships
 * labelled OURS until his definition is photographed.** Presenting it as his would be exactly the
 * silent reconciliation this work order forbids.
 */
export const DOUBLE_PROGRESSION_IS_OURS =
  'Working the top of the rep range at the prescribed reps-in-reserve across every set, then adding '
  + 'weight, is a field-standard mechanism and it is ours. The source prescribes progression "through '
  + 'the circle of reps" and does not define the phrase.';

export type SetResult = { reps: number; rir?: number | null };

export type ProgressionVerdict =
  /** Top of the range at the prescribed RIR on every set → weight up next time. */
  | 'advance'
  /** Inside the range → repeat the same weight and add reps. */
  | 'hold_add_reps'
  /** Below the bottom of the range → weight down. */
  | 'back_off'
  /** ⛔ NOTHING LOGGED IS NOT A FAILURE. No evidence → hold. Never zero, never a reset. */
  | 'no_evidence';

/**
 * ⛔ STALL HANDLING IS GENERIC AND PREDATES ANY ONE AUTHOR (pivot §4): nothing logged = no evidence
 * = hold; a miss holds; a confirmed REPEATED stall backs off and rebuilds. All thresholds are fixed
 * numbers and all of them are ours.
 *
 * ⚠️ NEVER ACT ON A SINGLE READING. `STALL_CONFIRMATIONS = 2` is the deadband: one short session is
 * a bad day, two in a row is a signal. That rule is why `back_off` needs a caller-supplied count.
 */
export const STALL_CONFIRMATIONS = 2;
export const STALL_BACKOFF = 0.10;
export const FREEZE_WEEKS_BEFORE_SAYING_SO = 4;
export const THRESHOLDS_ARE_OURS =
  'Two confirmations before a back-off, a ten per cent back-off, and four unmoved weeks before the '
  + 'plan says a lift is frozen. Fixed numbers, ours, from field practice.';

export function progressionVerdict(
  sets: SetResult[] | null | undefined,
  repRange: { lo: number; hi: number },
  targetRir: { lo: number; hi: number } | null,
): ProgressionVerdict {
  // ⛔ ABSENT IS NOT ZERO. An unlogged session is silence, and silence holds.
  if (!Array.isArray(sets) || sets.length === 0) return 'no_evidence';
  const logged = sets.filter((s) => Number.isFinite(s?.reps));
  if (logged.length === 0) return 'no_evidence';

  if (logged.some((s) => s.reps < repRange.lo)) return 'back_off';

  const allAtTop = logged.every((s) => s.reps >= repRange.hi);
  if (!allAtTop) return 'hold_add_reps';

  // ⚠️ RIR IS A GATE ONLY WHERE THE INTENT HAS ONE. ME carries no RIR target (p218 says so
  // outright), so an ME slot advances on reps alone rather than waiting for a number nobody asked
  // the athlete for.
  if (!targetRir) return 'advance';
  const rirs = logged.map((s) => s.rir).filter((r): r is number => Number.isFinite(r as number));
  if (rirs.length === 0) return 'advance';
  return rirs.every((r) => r >= targetRir.lo) ? 'advance' : 'hold_add_reps';
}

/**
 * The step a lift takes when it advances. ⛔ OURS, and gated on real plates.
 *
 * Pivot §4: 5 lb upper / 10 lb lower to start, and the step size is gated by the athlete's declared
 * smallest plates. ⚠️ An athlete with 2.5 lb plates can take a 5 lb step; one with only 10s cannot
 * take anything smaller than 20, and the step is raised to what they can actually load rather than
 * prescribing a weight they cannot make.
 */
export const STEP_UPPER_LB = 5;
export const STEP_LOWER_LB = 10;

export function advanceStep(isLower: boolean, smallestPlatePairLb: number | null | undefined): number {
  const nominal = isLower ? STEP_LOWER_LB : STEP_UPPER_LB;
  const pair = Number(smallestPlatePairLb);
  if (!Number.isFinite(pair) || pair <= 0) return nominal;
  return Math.max(nominal, Math.ceil(nominal / pair) * pair);
}
