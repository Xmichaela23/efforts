// ============================================================================
// THE CALIBRATION EVENT — slice b. What moved, which way, and how to put it back.
//
// ⛔ THIS MODULE DECIDES NOTHING ABOUT LOADING. Slice a's engine (`wendler-531.ts`) owns the climb
// and the reset; the rematerializer owns the rewrite. What lives here is the RECORD: a per-lift,
// per-cycle statement of "the number moved from X to Y, for this reason, at this time" — plus the
// one thing the record has to support that the engine cannot, which is putting it back.
//
// ── ⛔ WHY UNDO CANNOT BE "WRITE THE OLD ROWS BACK" ──────────────────────────────────────────────
//
// The rematerializer is a PURE FUNCTION of (stored base training max, verdicts read off logged sets).
// Restore the old prescriptions and the very next save recomputes the same verdicts, reaches the same
// number, and re-applies the change the athlete just declined. An undo that gets silently reverted is
// worse than no undo: the athlete taps it, sees the old weight, and finds the new one back tomorrow.
//
// **So an undo is a SUPPRESSION, not a restore.** The event stays in the log with `undone_at` set, and
// the rematerializer consults it: a computed number that matches an undone event's `to_training_max`
// at that event's cycle is replaced by its `from_training_max`. Targeted, idempotent, and it does not
// freeze the lift — a LATER cycle's step has a different `at_cycle` and is not suppressed.
//
// ── ⛔ WHAT SLICE b's BRIEF ASKED FOR AND THIS DELIBERATELY DOES NOT BUILD ───────────────────────
//
// The slice (written 2026-08-12) specified a Juggernaut-style up-bump: *"more reps over target →
// larger step, but capped."* **The Forever reading of 2026-08-15 refutes it directly**, and the
// refutation is bold in the book — see `docs/REFERENCE-main-lift-forever-pp16-45.md`:
//
//   · **p.20, bold:** more than five reps on the test set → *"stay the course. Do not increase more
//     than the normal amount each cycle."*
//   · **p.20-21 Q&A:** eight reps at 95%, should I jump more than 5/10 lb? *"The answer every single
//     time is NO"* — bar speed suffers, plateau, burnout.
//   · **p.21, the Krypteia anecdote:** forty athletes on an 85% training max; after three cycles half
//     could do **15+ reps at the training max**, and the fix is still *"the basic 5-10 lb inching
//     forward."*
//
// So the UP direction is the ordinary earned step (+5 upper / +10 lower), which slice a's engine
// already applies every cycle. What slice b adds is that it is now **announced and reversible** —
// not that it is bigger. A rep-scaled jump would be an app invention on top of the previous program, which is the
// exact class of thing D-422 was written to delete.
// ============================================================================

import { type CycleKind } from './wendler-531.ts';

/** The four lifts, keyed the way `plans.config.training_max` keys them. */
export type LiftRef = 'bench' | 'squat' | 'deadlift' | 'overheadPress';

/**
 * ⛔ WHY A LIFT'S NUMBER MOVED. Two reasons, and they are the two directions.
 *
 * ⚠️ `'ceiling'` IS GONE. D-421 shipped this field with a single reason — a lift pinned at the
 * invented 90%-of-1RM ceiling — and D-422 deleted the ceiling. The FIELD and its `plans.config`
 * plumbing survived deliberately for this slice to repopulate; the trigger is what changed.
 */
export type CalibrationReason =
  /** A confirmed stall: −10% and rebuild, that lift only. the previous program, gated by p.33. */
  | 'reset'
  /** The ordinary earned step: +5 upper / +10 lower. the previous program. NOT a rep-scaled jump — see above. */
  | 'bump';

/**
 * One applied change to one lift's training max.
 *
 * ⛔ THIS IS THE UNDO RECORD AS WELL AS THE ANNOUNCEMENT. `from_training_max` is not decoration: it
 * is what `undone_at` restores, and the suppression rule below reads all three of
 * (`ref`, `at_cycle`, `to_training_max`) to decide whether a freshly computed number is the one the
 * athlete already declined.
 */
export type StrengthCalibrationEvent = {
  /** The composer's own lift name — 'Back Squat', 'Overhead Press'. What a surface renders. */
  lift: string;
  /** The `training_max` key. What the arithmetic uses. Two vocabularies, both needed. */
  ref: LiftRef;
  reason: CalibrationReason;
  /** The cycle the new number takes effect in. */
  at_cycle: number;
  total_cycles: number;
  /** ⚠️ TRAINING MAXES, not top-set weights. A surface that wants the bar weight reads the changes. */
  from_training_max: number;
  to_training_max: number;
  /** ISO. Stamped by the caller — this module takes no clock (a pure module must stay replayable). */
  applied_at: string;
  /**
   * ⛔ SET BY UNDO, AND IT IS A SUPPRESSION RATHER THAN A DELETION. The event stays in the log so the
   * athlete's decision is a fact the next recompute can read. Removing the row would let the same
   * change re-apply on the next save.
   */
  undone_at?: string | null;
};

/** What the rematerializer already computes per lift, narrowed to what this module needs. */
export type LiftCycleNumber = { cycle: number; kind: CycleKind; workingNumber: number };

export type LiftCalibrationInput = {
  ref: LiftRef;
  name: string;
  /** `workingNumberForCycles(...).byCycle` — the number this lift runs in each cycle. */
  byCycle: readonly LiftCycleNumber[];
  /** `workingNumberForCycles(...).resetAtCycle` — the cycle a CONFIRMED stall dropped the number. */
  resetAtCycle: number | null;
  /** The cycles whose prescriptions actually moved on this recompute (from the row diff). */
  changedCycles: readonly number[];
};

/**
 * ⛔ THE EVENTS FOR ONE RECOMPUTE. One per lift at most — the EARLIEST cycle whose prescriptions
 * moved, because that is the change the athlete is about to see on their calendar.
 *
 * ⚠️ **THE TRIGGER IS THE CALENDAR MOVING, NOT THE VERDICT FIRING**, and that distinction is the
 * whole reason this reads `changedCycles` rather than the verdict array. A verdict fires every cycle
 * — `advance` is the default (p.30) — and announcing one every time would make the notice furniture.
 * What is worth telling the athlete is that the weights ahead of them are not the weights they saw
 * yesterday. If nothing on the calendar moved, there is no event, and the surfaces stay silent.
 *
 * ⚠️ ONE EVENT PER LIFT PER RECOMPUTE. A reset ripples through every remaining cycle, so the naive
 * read produces three identical-looking events for one thing that happened once.
 */
export function calibrationEventsFor(
  lifts: readonly LiftCalibrationInput[],
  totalCycles: number,
  appliedAtIso: string,
): StrengthCalibrationEvent[] {
  const out: StrengthCalibrationEvent[] = [];
  for (const lift of lifts) {
    const cycles = [...(lift.changedCycles ?? [])].filter((c) => Number.isFinite(c)).sort((a, b) => a - b);
    const at = cycles[0];
    if (at == null) continue;

    const to = lift.byCycle.find((b) => b.cycle === at)?.workingNumber;
    // ⚠️ THE "FROM" IS THE PRECEDING CYCLE'S NUMBER, which is what the lift was running on. For a
    // change landing in cycle 1 there is no preceding cycle and nothing moved relative to anything —
    // skip rather than inventing a baseline.
    const from = lift.byCycle.find((b) => b.cycle === at - 1)?.workingNumber;
    if (!(Number(to) > 0) || !(Number(from) > 0) || to === from) continue;

    out.push({
      lift: lift.name,
      ref: lift.ref,
      // ⛔ A RESET IS THE ONLY THING THAT IS NOT A BUMP. `resetAtCycle` is slice a's own output — the
      // cycle a CONFIRMED stall (two consecutive measured misses, p.31 gated by p.33) dropped the
      // number. Anything else that moved the calendar is the ordinary earned step.
      reason: lift.resetAtCycle === at ? 'reset' : 'bump',
      at_cycle: at,
      total_cycles: totalCycles,
      from_training_max: Number(from),
      to_training_max: Number(to),
      applied_at: appliedAtIso,
      undone_at: null,
    });
  }
  return out;
}

/**
 * ⛔ THE SUPPRESSION. Given the number the engine just computed for a lift in a cycle, return the
 * number that should actually be written — which is the PRIOR one if the athlete has already undone
 * exactly this step.
 *
 * ⚠️ MATCHED ON ALL THREE OF (ref, cycle, computed value). Matching on the lift alone would freeze it
 * forever; matching on the lift and cycle alone would suppress a *different* step that happened to
 * land in the same cycle after more evidence arrived. The value is what makes it "this step".
 */
export function suppressUndone(
  ref: LiftRef,
  cycle: number,
  computed: number,
  events: readonly StrengthCalibrationEvent[] | null | undefined,
): number {
  if (!Array.isArray(events) || events.length === 0) return computed;
  for (const e of events) {
    if (!e?.undone_at) continue;
    if (e.ref !== ref || e.at_cycle !== cycle) continue;
    if (Number(e.to_training_max) !== Number(computed)) continue;
    const prior = Number(e.from_training_max);
    if (prior > 0) return prior;
  }
  return computed;
}

/**
 * Mark the most recent un-undone event for a lift as undone. Returns a NEW array — the caller writes
 * it back to `plans.config.strength_calibration`.
 *
 * ⚠️ **THE MOST RECENT ONE ONLY.** An athlete tapping Undo means "not this change", not "unwind my
 * whole block". Undoing the full history would walk a lift back to its starting number on one tap,
 * with no way to get the intermediate steps back.
 *
 * ⛔ RETURNS THE ARRAY UNCHANGED WHEN THERE IS NOTHING TO UNDO, so a double-tap or a stale screen
 * cannot walk backwards through the log.
 */
export function undoLatestCalibration(
  events: readonly StrengthCalibrationEvent[] | null | undefined,
  ref: LiftRef,
  undoneAtIso: string,
): { events: StrengthCalibrationEvent[]; undone: StrengthCalibrationEvent | null } {
  const list = Array.isArray(events) ? events.map((e) => ({ ...e })) : [];
  let target: StrengthCalibrationEvent | null = null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (e.ref !== ref || e.undone_at) continue;
    e.undone_at = undoneAtIso;
    target = e;
    break;
  }
  return { events: list, undone: target };
}

/**
 * ⛔ THE AMBIENT PER-LIFT STATUS — the calm state a row shows all the time, so an event confirms what
 * was already on screen rather than arriving from nowhere.
 *
 * This is the thing the deleted ceiling never gave anybody, and it is named in slice b as the
 * original bug: *"a number that silently stopped moving with nothing on screen."*
 *
 * ⚠️ `holding` IS NOT `reset`. the previous program: one missed session holds the weight and costs nothing —
 * the free re-try. A row that called that a reset would report a penalty the engine did not apply.
 */
export type LiftCalibrationStatus = 'climbing' | 'holding' | 'reset';

/**
 * The status for one lift, from the same numbers the block was laid out with.
 *
 * @param currentCycle the cycle the athlete is in (1-based).
 */
export function liftStatus(
  byCycle: readonly LiftCycleNumber[],
  resetAtCycle: number | null,
  currentCycle: number,
): LiftCalibrationStatus {
  // ⛔ A RESET IN THE CURRENT CYCLE OUTRANKS EVERYTHING. It is the one state the athlete most needs
  // named, and the number does climb again immediately afterwards — reading the climb first would
  // hide the drop behind it.
  if (resetAtCycle != null && resetAtCycle === currentCycle) return 'reset';
  const now = Number(byCycle.find((b) => b.cycle === currentCycle)?.workingNumber);
  const prev = Number(byCycle.find((b) => b.cycle === currentCycle - 1)?.workingNumber);
  // ⚠️ NO PRIOR CYCLE → `climbing`. Cycle 1 has nothing behind it, and the block's whole premise is
  // that the number advances unless something stops it (p.30). Reporting `holding` there would tell a
  // brand-new athlete their lift had stalled before they lifted anything.
  if (!(now > 0) || !(prev > 0)) return 'climbing';
  if (now > prev) return 'climbing';
  if (now < prev) return 'reset';
  return 'holding';
}
