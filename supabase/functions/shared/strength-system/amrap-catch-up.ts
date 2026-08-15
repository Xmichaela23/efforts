/**
 * THE AMRAP CATCH-UP — D-408.
 *
 * ⛔ **THIS IS A PROPOSAL ENGINE. IT WRITES NOTHING AND DECIDES NOTHING.** It returns what the
 * athlete could adopt; adopting is a tap. That is not politeness, it is the rule the auto-progression
 * block was DELETED for breaking (`adapt-plan/index.ts:1119-1138`): silent writes raised prescribed
 * weight on every ingest with no prompt and no consent, and *"the athlete opened the logger to a
 * number they never agreed to."* Anything here that starts writing has rebuilt that defect.
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────────────────────────
 *
 * The training max ratchets on a fixed +5 upper / +10 lower per cycle, and that spine is deliberate
 * and stays. But the anchor cycle's last set is an AMRAP, and an AMRAP is a MEASUREMENT: an athlete
 * who hits 185×12 has just proven a max the fixed schedule will take cycles to reach. Wendler
 * recalculates at boundaries for exactly this reason (2nd ed. p.24, p.30-31) — the boundary is a
 * place to CHECK progress, not to throw it away.
 *
 * ⛔ **AT BOUNDARIES ONLY, AND THERE IS NO THRESHOLD.** The formula IS the trigger. Wendler never
 * proposes a mid-block "your e1RM moved 8%" rule; he recomputes when a cycle ends and compares. A
 * percentage gate here would be an invented number doing work the arithmetic already does.
 *
 * ── ⚠️ THE 85% TRAP, AND IT IS THE WHOLE REASON TO READ THIS BEFORE EDITING ──────────────────────
 *
 * Wendler's book says the training max is **90%** of the 1RM. **This app uses 85%**, deliberately and
 * with its reason written down (`WORKING_NUMBER_PCT_OF_1RM`): his own guidance is to lower it when
 * the athlete carries other physical demands, and an endurance athlete is exactly that case.
 *
 * So this module takes 85% of the estimate, **not 90%**, and it imports the constant rather than
 * spelling a number. Writing `0.90` here — even though the book says 0.90 — would mean the first
 * boundary silently ratchets every athlete from an 85% training max to a 90% one, a ~6% jump on top
 * of the fixed increment, arriving disguised as "adopting your AMRAP". That is a policy change
 * wearing a measurement's clothes, and nobody would see it in a diff.
 */

import { estimate1RM } from '../../../../src/lib/estimate-1rm.ts';
import {
  type BlockShapeInputs,
  blockWeekFor,
  MIN_BLOCK_WEEKS,
  roundDownToIncrement,
  WORKING_NUMBER_PCT_OF_1RM,
} from './loading/wendler-531.ts';

/** The four lifts, keyed as `training_max` on `plans.config` keys them. */
export type LiftRef = 'bench' | 'squat' | 'deadlift' | 'overheadPress';

/**
 * ⛔ ONE SET → A TRAINING MAX. **THE ONE PLACE THIS ARITHMETIC LIVES** (extracted 2026-08-15, §1d).
 *
 * Wendler's estimator, then the app's 85% — see the 85% trap at the top of this file, which is the
 * whole reason this is a named function rather than two lines written twice. It is used by:
 *   · the AMRAP catch-up below, to RAISE a training max that has drifted behind the athlete
 *   · `verdictFromTmTestSet`'s `recalibrate` path, to RECOMPUTE one that has drifted ahead of them
 *     (Forever p.21: *"use the formula … and adjust your training max to be 85-90% of that"*)
 *
 * ⚠️ Returns 0 on junk input rather than throwing — a malformed log must never break a boundary.
 */
export function trainingMaxFromSet(weight: number, reps: number): number {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r < 1) return 0;
  return roundDownToIncrement(estimate1RM(w, r) * WORKING_NUMBER_PCT_OF_1RM);
}

/** One completed AMRAP set, as the logger writes it back. */
export type AmrapSet = {
  lift: LiftRef;
  /** Load on the bar for that set. */
  weight: number;
  /** Reps ACTUALLY completed. ⚠️ Not the prescribed minimum — the whole point is the overshoot. */
  reps: number;
  /** Block week the set was performed in, for the copy and for picking within a cycle. */
  week: number;
};

export type TrainingMaxProposal = {
  lift: LiftRef;
  /** What the block is currently using. */
  currentTm: number;
  /** Wendler's estimator applied to the best AMRAP in the block. */
  estimated1RM: number;
  /** `WORKING_NUMBER_PCT_OF_1RM` of that estimate, on the plate grid. Always > `currentTm`. */
  proposedTm: number;
  /** The set that produced it, so the athlete can see the evidence rather than a verdict. */
  from: { weight: number; reps: number; week: number };
};

/**
 * The proposals for one boundary. Empty array = nothing to offer, which is the common case and is
 * not a failure.
 *
 * @param amraps every completed AMRAP in the block so far. Sets with junk values are skipped rather
 *   than throwing — a malformed log must not be able to break a boundary.
 * @param currentTrainingMax the block's working numbers, per lift, INCLUDING the fixed increments
 *   already applied for the cycle being entered. ⚠️ Comparing against the block's STARTING number
 *   would re-propose a rise the spine has already delivered.
 * @param atBoundary whether this is a cycle/deload boundary. False → nothing, always.
 */
export function amrapTrainingMaxCatchUp(
  amraps: AmrapSet[] | null | undefined,
  currentTrainingMax: Partial<Record<LiftRef, number>> | null | undefined,
  atBoundary: boolean,
): TrainingMaxProposal[] {
  if (!atBoundary || !amraps?.length || !currentTrainingMax) return [];

  // Best set per lift BY ESTIMATE, not by weight and not by reps. 185×12 and 205×5 are not
  // comparable by either column alone — comparing them is the entire reason the formula exists
  // (p.32's worked example is exactly that question).
  const best = new Map<LiftRef, { set: AmrapSet; e1rm: number }>();
  for (const s of amraps) {
    const weight = Number(s?.weight);
    const reps = Number(s?.reps);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(reps) || reps < 1) continue;
    // ⚠️ NO RIR. 5/3/1 collects no reps-in-reserve and an AMRAP is a hard stop by definition, so the
    // estimate is off actual reps — the estimator is pure and has no reserve argument to inflate it.
    const e1rm = estimate1RM(weight, reps);
    const prior = best.get(s.lift);
    if (!prior || e1rm > prior.e1rm) best.set(s.lift, { set: { ...s, weight, reps }, e1rm });
  }

  const proposals: TrainingMaxProposal[] = [];
  for (const [lift, { set, e1rm }] of best) {
    const currentTm = Number(currentTrainingMax[lift]);
    if (!Number.isFinite(currentTm) || currentTm <= 0) continue;

    // ⛔ THE APP'S PERCENTAGE, NOT THE BOOK'S. See the 85% trap at the top of this file, and
    // `trainingMaxFromSet`, which is now the one place that arithmetic lives.
    const proposedTm = trainingMaxFromSet(set.weight, set.reps);

    // ⛔ RAISES ONLY. A proposal to LOWER the training max is a different mechanism with a different
    // trigger — Wendler's reset-on-stall, which fires on FAILED reps, not on a modest AMRAP. Letting
    // this path lower the number would mean one good-but-unremarkable set could undo the spine's
    // accumulated progress, and the athlete would watch their weights fall after a session they
    // completed. Silence is the correct output when the estimate does not beat what they are on.
    if (proposedTm <= currentTm) continue;

    proposals.push({
      lift,
      currentTm,
      estimated1RM: Math.round(e1rm),
      proposedTm,
      from: { weight: set.weight, reps: set.reps, week: set.week },
    });
  }

  // Deterministic order so a UI list and a test agree. Biggest gap first: the lift that has drifted
  // furthest from what the athlete can actually do is the one worth reading first.
  return proposals.sort((a, b) => (b.proposedTm - b.currentTm) - (a.proposedTm - a.currentTm));
}

/**
 * The athlete-facing sentence for one proposal. ⚠️ Fact-first, no imperative, and it NAMES THE
 * EVIDENCE — the set they did, not a verdict about them. The athlete draws the conclusion.
 */
export function catchUpReason(p: TrainingMaxProposal): string {
  return `Week ${p.from.week}: ${p.from.weight} × ${p.from.reps} estimates a ${p.estimated1RM} max. `
    + `Working number ${p.currentTm} → ${p.proposedTm}.`;
}

/**
 * ⛔ IS THIS WEEK A BOUNDARY? **A STANDALONE WEEK IS** — the 7th-week deload between templates and
 * the closing TM-test week. Those are the places Wendler recalculates (2nd ed. p.30-31; Forever
 * p.21), and after the 2026-08-15 restructure they are the block's actual seams.
 *
 * ⛔ THIS WAS `week % WEEKS_PER_CYCLE === 0` AND THAT IS NOW WRONG IN BOTH DIRECTIONS. A cycle is
 * three weeks, so the modulo would fire on weeks 3, 6, 9, 12 — week 3 is the middle of a leader
 * cycle and week 9 is the anchor's opening week. It has to read the MAP, not arithmetic.
 *
 * ⚠️ **THE BLOCK LENGTH IS REQUIRED, AND AN UNKNOWN LENGTH RETURNS `false`.** There is no arithmetic
 * fallback any more — the layout depends on the leader/anchor split, so a week number alone cannot
 * answer. Silence is the safe direction here: this path only ever OFFERS a raise, so a missed
 * boundary costs the athlete an offer, never a wrong number.
 *
 * ⚠️ WEEK 0 / NEGATIVE / NON-FINITE IS `false`, NOT A MODULO ACCIDENT. `0 % 4 === 0` used to make an
 * unknown current-week look like a boundary and offer a training-max change to an athlete who had
 * not lifted yet.
 */
export function isCatchUpBoundary(
  currentWeek: number | null | undefined,
  /** `plans.duration_weeks`. Absent → `false`. */
  blockWeeks?: number | null,
  /** The shape inputs the block was BUILT with, when the caller has them. */
  inputs?: BlockShapeInputs,
): boolean {
  const w = Number(currentWeek);
  const total = Number(blockWeeks);
  if (!Number.isFinite(w) || w < 1) return false;
  if (!Number.isFinite(total) || total < MIN_BLOCK_WEEKS) return false;
  const bw = blockWeekFor(Math.floor(total), Math.floor(w), inputs);
  return !!bw && bw.kind !== 'cycle';
}

/** How a stored workout row looks to this extractor. Deliberately loose — it is DB shape, not ours. */
export type WorkoutRowish = {
  strength_exercises?: unknown;
  workout_date?: string | null;
  week_number?: number | null;
};

/**
 * Pull every completed AMRAP set out of stored workout rows.
 *
 * ⛔ THE `amrap` FLAG IS THE SIGNAL, AND IT IS THE COMPOSER'S OWN. `set_plan[].amrap` is stamped by
 * `wendler-531.ts` on exactly one set — anchor cycle, not deload, last set — and the logger carries it
 * onto the logged set. Inferring "the heaviest set" instead would silently promote an ordinary top set
 * into a measurement.
 *
 * ⚠️ COMPLETED ONLY. An untouched or abandoned set has whatever the prefill left in it; treating that
 * as a measurement would propose a training max off a number nobody lifted.
 */
export function extractAmrapSets(
  rows: WorkoutRowish[] | null | undefined,
  liftOf: (exerciseName: string) => LiftRef | null,
): AmrapSet[] {
  const out: AmrapSet[] = [];
  for (const row of rows ?? []) {
    const exercises = Array.isArray(row?.strength_exercises) ? row.strength_exercises : [];
    for (const ex of exercises as any[]) {
      const lift = liftOf(String(ex?.name ?? ''));
      if (!lift) continue;
      for (const set of (Array.isArray(ex?.sets) ? ex.sets : []) as any[]) {
        if (set?.amrap !== true) continue;
        if (set?.completed !== true) continue;
        const weight = Number(set?.weight);
        const reps = Number(set?.reps);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        if (!Number.isFinite(reps) || reps < 1) continue;
        out.push({ lift, weight, reps, week: Number(row?.week_number) || 0 });
      }
    }
  }
  return out;
}

/** Exercise name → the `training_max` key. ⚠️ Absent → null, and the set is ignored (§0h). */
export function liftRefForExercise(name: string): LiftRef | null {
  const n = String(name ?? '').toLowerCase();
  if (/(^|\b)(bench)/.test(n) && !/close.?grip|incline|dumbbell/.test(n)) return 'bench';
  if (/(back )?squat/.test(n) && !/front|split|goblet/.test(n)) return 'squat';
  if (/deadlift/.test(n) && !/romanian|stiff|single/.test(n)) return 'deadlift';
  if (/overhead press|^press$|military/.test(n) && !/dumbbell/.test(n)) return 'overheadPress';
  return null;
}
