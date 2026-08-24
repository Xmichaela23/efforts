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

// ── OURS: THE INTENSITY STARTS LOW, EXACTLY AS THE SETS DO ──────────────────────────────────────

/**
 * ⛔⛔ A SLOT PRESCRIBES THE LOW END OF ITS PERCENT BAND — AND THE BUG THIS FIXES WAS ARITHMETIC.
 *
 * p218 gives ME **1 to 5 reps at 90 to 100%**. Those are the two ends of one inverse relationship:
 * a single is the hundred-per-cent rep and five reps is the ninety-per-cent set. The composer was
 * taking the TOP of both bands at once — `pctOf1RM.hi` for the weight and `reps.hi` for the set plan
 * — so every ME row read *five reps at 100% of the working number*. The working number is itself 96%
 * of a predicted max (p215), so that is five reps at ninety-six per cent of a one-rep max: a
 * prescription nobody can complete, on every ME slot, for twelve weeks.
 *
 * ⛔ MICHAEL'S RULING, 2026-08-24: **start at the low end of the intensity band**, leave the rep
 * target open across his range, and stop short of failure. As the working number climbs at his rate
 * anchor the achieved reps slide down the band on their own — *"the inverse pairing expressing
 * itself without a table"* — so no second table is invented and nothing here contradicts p218.
 *
 * ⚠️ **THE EXTENSION IS OURS AND THE PRINCIPLE IS HIS.** p218's first sentence is *"sets should
 * always remain on the lower end when starting a program, increasing only if the athlete is finding
 * that they are progressing well and seem to have recovery to spare."* He writes it about SETS. He
 * gives a band for intensity and no starting point inside it; reading his own instruction across to
 * the other axis is ours, and it is the conservative direction on both.
 *
 * ⛔ **AND IT IS AN INVARIANT, NOT A DEFAULT.** No row anywhere may carry `reps.hi` and `pctOf1RM.hi`
 * together. `standing-plan-dose.test.ts` walks every slot of every week of both columns and fails on
 * one. Do not "restore" a top-of-band percentage for a single intent without deleting that test, and
 * do not delete that test.
 */
export const INTENSITY_STARTS_LOW_IS_OURS =
  'Each lift opens at the bottom of the intensity band the source gives it, with the rep target left '
  + 'open across his range and every set stopped short of failure. He states that principle for sets '
  + '— start low, add only when recovery is spare — and gives intensity a band with no starting '
  + 'point in it; carrying his instruction across to intensity is ours. As the working number climbs, '
  + 'the reps you get at the same percentage come down on their own.';

// ── OURS: THE ME SET LADDER — 1 to 2 to 3, EARNED ───────────────────────────────────────────────

/**
 * ⛔ WHY A LADDER EXISTS AT ALL, AND IT IS A DOSE THE PLAN WAS MISSING.
 *
 * `setsFor` returns the low end of every band unless a caller says otherwise, and nothing ever did —
 * so every ME slot prescribed **one** set of 1-5 for all twelve weeks. p084's own dose for maximal
 * work is **4 to 6 reps above 90% per movement pattern per week**; a single set of one to five reps
 * sits at or below that floor permanently, and no amount of progression moves it, because the thing
 * that is short is the SET COUNT and nothing in the engine could ever change it.
 *
 * ⛔ HIS RANGE IS 1-3 SETS (p218) AND HIS CONDITION IS IN WORDS: *"increasing only if the athlete is
 * finding that they are progressing well and seem to have recovery to spare."* That is gap #11 of
 * the twelve — a condition no engine can evaluate as written. What follows is the field-standard
 * reading of it, and every number in it is OURS.
 */
export const ME_SET_LADDER_IS_OURS =
  'The heavy lift starts at one set and can earn a second and a third. Two clean sessions in a row '
  + 'on the same pattern add a set; a missed set or a set ground out to failure takes one back. The '
  + 'range of one to three sets is the source\'s; when a set is earned and when it is lost are ours, '
  + 'from field practice — he states the condition in words ("progressing well, with recovery to '
  + 'spare") and gives no rule.';

/** ⛔ TWO IN A ROW, NEVER ONE. The same deadband `STALL_CONFIRMATIONS` states for the other direction. */
export const ME_CLEAN_SESSIONS_TO_EARN = 2;

/**
 * ⛔ HOW CLOSE TO THE TOP OF HIS REP BAND COUNTS AS CLEAN — one rep, so 4 or 5 of his 1-5.
 *
 * Michael, 2026-08-24: *"clean session for the earn rule = the top of the rep band (4-5 reps)
 * completed with stop-short quality, no miss."* At the low end of the intensity band that is a
 * reachable session, which is the whole point: a threshold nobody clears is a ladder that never
 * moves, and the frozen single-set slot is exactly what this replaces.
 */
export const ME_CLEAN_REPS_WITHIN_TOP = 1;

/** One logged set of an ME slot, as the workouts table carries it. */
export type LoggedMeSet = {
  reps?: number | null;
  weight?: number | null;
  /** ⚠️ ABSENT IS LEGAL AND MEANS THE ATHLETE DID NOT SAY (D-324). Never read as zero. */
  rir?: number | null;
  completed?: boolean | null;
};

export type MeSessionOutcome =
  /** Top of the rep band on every prescribed set, stopped short. Earns toward the next set. */
  | 'clean'
  /** A missed set, or one ground out to failure. Takes an earned set back. */
  | 'setback'
  /** Completed, stopped short, but landing mid-band. Neither earns nor costs; breaks the run. */
  | 'mid_band'
  /** ⛔ NOTHING LOGGED IS NOT A FAILURE. Silence holds — the count and the run both stand. */
  | 'no_evidence';

/**
 * ⛔ WHAT ONE LOGGED ME SESSION ON ONE PATTERN WAS.
 *
 * @param sets            what the athlete logged for that movement.
 * @param prescribedSets  how many sets the row asked for. A short session is a miss, not a clean
 *                        session with fewer sets in it.
 * @param repBand         his band for the intent — 1 to 5 for ME. The top is read off it, never
 *                        hard-coded, so a band change cannot leave this asserting the old number.
 * @param prescribedWeight the weight on the row, when it carried one. ⚠️ `null` during the weeks
 *                        before the test is read, where the row says "by feel" and there is no
 *                        number to fall short of.
 *
 * ⛔ `rir === 0` IS THE GRIND AND IT IS THE ONLY QUALITY SIGNAL READ. p218 gives ME **no RIR
 * target** and says in the same breath that each set *"stops short of failure — technical breakdown
 * here is counterproductive"*. So a logged 0 is the athlete reporting the one thing his instruction
 * forbids. ⚠️ An ABSENT rir is not a grind: absent means they did not say (D-324), and inferring
 * failure from silence would take a set away from every athlete who skips the field.
 */
export function meSessionOutcome(args: {
  sets: LoggedMeSet[] | null | undefined;
  prescribedSets: number;
  repBand: { lo: number; hi: number };
  prescribedWeight?: number | null;
}): MeSessionOutcome {
  const logged = (args.sets ?? []).filter((s) => s?.completed === true);
  if (logged.length === 0) return 'no_evidence';

  // ⛔ A SET GROUND OUT TO FAILURE IS A SETBACK WHATEVER THE REPS SAY — checked before the reps,
  // because five reps taken to zero in reserve is the session his instruction rules out, and reading
  // it as clean would earn a second set off the evidence that the first one was too much.
  if (logged.some((s) => s.rir === 0)) return 'setback';

  // ⛔ A SHORT SESSION IS A MISS. Fewer completed sets than the row asked for is the athlete not
  // finishing the prescription, and it is the plainest reading of "a miss" there is.
  if (logged.length < Math.max(1, Math.round(args.prescribedSets))) return 'setback';

  /**
   * ⚠️ ONLY WHERE A WEIGHT WAS PRESCRIBED. Before the test is read every row says "by feel", so there
   * is no number to fall short of.
   *
   * ⛔ AND THE GUARD EARNS ITS KEEP ON THE **UNWEIGHTED LOG**, WHICH IS THE HALF MUTATION TESTING
   * NEARLY DELETED. Against a prescribed weight, a set logged with no weight at all is a miss — the
   * athlete cannot have made a number they never entered. Against NO prescribed weight it is the
   * ordinary shape of a by-feel session, and firing there would call every pre-test week a setback
   * and walk the ladder to its floor before the block had begun.
   */
  const want = Number(args.prescribedWeight);
  if (Number.isFinite(want) && want > 0) {
    if (logged.some((s) => !Number.isFinite(Number(s.weight)) || Number(s.weight) < want)) return 'setback';
  }

  const cleanFrom = args.repBand.hi - ME_CLEAN_REPS_WITHIN_TOP;
  if (logged.every((s) => Number(s.reps) >= cleanFrom)) return 'clean';
  // ⛔ BELOW THE BAND'S FLOOR IS A MISS, NOT A MID-BAND SESSION. One rep is the bottom of ME; a set
  // that did not reach it did not happen.
  if (logged.some((s) => Number(s.reps) < args.repBand.lo)) return 'setback';
  return 'mid_band';
}

export type MeLadderState = {
  /** Sets the slot currently earns. Always inside his 1-3 band. */
  sets: number;
  /** Clean sessions since the last change. Never shown; it is why the next one moves. */
  cleanRun: number;
};

/**
 * ⛔ ONE SESSION MOVES THE LADDER ONE STEP AT MOST — in either direction.
 *
 * ⚠️ `no_evidence` RETURNS THE STATE UNCHANGED, RUN INCLUDED. Pivot §4: *"nothing logged = no
 * evidence = hold (never zero)."* A skipped week is not a broken run and it is not a lost set; it is
 * the plan having nothing to read. ⛔ Do not "reset the streak on a gap" — that is acting on absence,
 * which is the failure mode this codebase names in three other files.
 */
export function meLadderStep(
  state: MeLadderState,
  outcome: MeSessionOutcome,
  band: { lo: number; hi: number },
): MeLadderState {
  if (outcome === 'no_evidence') return state;
  if (outcome === 'setback') return { sets: Math.max(band.lo, state.sets - 1), cleanRun: 0 };
  if (outcome === 'mid_band') return { sets: state.sets, cleanRun: 0 };
  const run = state.cleanRun + 1;
  if (run < ME_CLEAN_SESSIONS_TO_EARN) return { sets: state.sets, cleanRun: run };
  // ⚠️ AT THE CAP THE RUN IS KEPT RATHER THAN SPENT, so an athlete already at three sets does not
  // have to re-earn the run from zero the moment one setback drops them to two.
  if (state.sets >= band.hi) return { sets: band.hi, cleanRun: run };
  return { sets: state.sets + 1, cleanRun: 0 };
}

/** Walk a pattern's ME sessions in order and report what it has earned. */
export function meSetsFromHistory(
  outcomes: MeSessionOutcome[] | null | undefined,
  band: { lo: number; hi: number },
): MeLadderState {
  let state: MeLadderState = { sets: band.lo, cleanRun: 0 };
  for (const o of outcomes ?? []) state = meLadderStep(state, o, band);
  return state;
}

/**
 * ⛔ A SET COUNT BACK INTO STAGE 2'S OWN POSITION ARGUMENT, so the band stays owned in one place.
 *
 * `setsFor(band, position)` interpolates from `lo` to `hi`; this is its inverse. Passing the count
 * straight through would be a second owner of "how many sets is an ME slot", which is the fact
 * `strength-grid/intents.ts` exists to hold.
 */
export function setPositionForCount(count: number, band: { lo: number; hi: number }): number {
  if (band.hi <= band.lo) return 0;
  const clamped = Math.min(band.hi, Math.max(band.lo, Math.round(count)));
  return (clamped - band.lo) / (band.hi - band.lo);
}
