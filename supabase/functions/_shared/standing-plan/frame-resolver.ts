// ============================================================================
// THE FRAME RESOLVER — which Viada program, if any, this athlete's position asks for.
//
// ⛔ THE DIAL IS "WHAT'S LEADING" (`DECISIONS-2026-08-22-standing-plan-pivot.md` §1). The POSTURE
// half of that dial is already decided one hop upstream: `create-goal-and-materialize-plan:2493`
// routes to the strength builder only when `strength === 'develop'` and no endurance discipline is
// at `develop` — which is literally "strength leading, endurance held". This file answers the other
// half: **which sport is being held**, and therefore which of his programs the week is cut from.
//
// ⛔ IT RESOLVES ONE FRAME AND REFUSES THE REST OUT LOUD. Three of the five dial positions are
// frames-in-waiting (`FRAMES` holds one entry). A position this build cannot serve returns `null`
// WITH A REASON, and the caller falls back to the existing Get Stronger path — which is untouched,
// still built by `strength-primary-plan.ts`, and still the answer for every athlete whose frame does
// not resolve.
// ============================================================================

import { FRAMES, type FrameId } from './frames.ts';

export type FramePosition = {
  /** The PRIMARY endurance sport the athlete is holding. `null` = strength only. */
  enduranceSport: 'run' | 'bike' | null;
  /** ⚠️ A BIKE TRAVELLING BESIDE THE PRIMARY SPORT — see `bikeKept` in the refusal below. */
  bikeKept?: boolean;
  /** Swim slots the athlete kept. Booked, not coached (D-323 §5). */
  swimDays?: number | null;
};

export type FrameResolution =
  | { frame: FrameId; cite: string }
  | { frame: null; reason: string };

/**
 * ⛔ RUN-ONLY, AND THE REFUSALS ARE THE POINT.
 *
 * Strength + 5K (p246) is a RUNNING frame: four endurance slots, every one of them a `run_*` family.
 * Pivot §2 gives us permission to assign a sport per slot — *"any power-metered non-impact
 * modality"*, p275 — but **that assignment is not built** (slice 1's frames are run families end to
 * end). Until it is, an athlete who kept a bike or a swim and is routed here would find both gone
 * from a twelve-week block, silently: the exact "collected at intake and then discarded" pattern
 * `create-goal` has now fixed three times.
 *
 * ⛔ SO A KEPT BIKE OR SWIM REFUSES THE FRAME rather than dropping the sport. Get Stronger already
 * travels the bike beside the run (`generate-strength-plan`'s `bike` argument, 2026-07-27) and books
 * the swim, so the fallback is strictly better for that athlete than a frame that cannot hold them.
 * ⚠️ This is a SLICE 2 boundary, not a ruling: sport-slot assignment is pivot §2's own work and it
 * opens this gate the moment it lands.
 */
export function resolveFrame(position: FramePosition): FrameResolution {
  const swim = Number(position.swimDays);
  if (Number.isFinite(swim) && swim > 0) {
    return { frame: null, reason: 'the athlete kept swim slots and no frame carries a swim yet (pivot §2, sport-slot assignment)' };
  }
  if (position.bikeKept) {
    return { frame: null, reason: 'the athlete kept a bike and no frame carries a ride yet (pivot §2, sport-slot assignment)' };
  }
  if (position.enduranceSport === 'run') {
    return { frame: 'strength_5k', cite: FRAMES.strength_5k.cite };
  }
  if (position.enduranceSport === 'bike') {
    return { frame: null, reason: 'strength leading with a cyclist is Cycling: Base (p278/p280) and it is not built' };
  }
  return { frame: null, reason: 'no endurance sport is being held, and every frame is a hybrid week' };
}

// ── WHAT THE ATHLETE'S COMPETITION LIFTS ARE, BEFORE THERE IS A SCREEN TO ASK ────────────────────

import type { ViadaPattern } from '../strength-grid/index.ts';
import { TESTED_LIFT_NAME } from './working-number.ts';

/**
 * ⛔ WITHOUT THESE THE ENTIRE BLOCK PRESCRIBES NOTHING, and that is not a style point.
 * `exerciseForSlot` only puts a weight on a row when the movement IS the athlete's named competition
 * lift for that pattern (`compose.ts`, the `movementIsTested` test). Compose with `{}` and twelve
 * weeks come out reading `By feel`, `load_prescribed: false` — a plan that looks built and
 * prescribes nothing.
 *
 * ⛔ AND THE SEED IS NOT AN INVENTION. The entry gate refuses any athlete without all four barbell
 * 1RMs on file (`create-goal-and-materialize-plan`'s `missingBarbellLifts`, mirrored in
 * `generate-strength-plan`), so an athlete in this plan has declared the barbell big three by
 * construction. Pivot §6's *"name the lift you want a number on"* is the stage 5 wizard's question;
 * until it is asked, the four lifts the gate already demanded are the answer.
 *
 * ⛔⛔ THREE ENTRIES, AND THE FOURTH IS MISSING ON PURPOSE. `LIFT_FOR_PATTERN` maps `pull_upper` to
 * `bench`, so seeding a competition lift onto `pull_upper` would hand a barbell row or a pull-up
 * **the bench press's working number** — `pull up @ 205 lb`, the first defect the composer's own
 * smoke run found, walking back in through the wiring. Neither column of `strength_5k` carries a
 * `pull_upper` competition slot, so nothing is lost by leaving it unset and a real weight would be
 * invented by setting it.
 */
export function defaultCompetitionLifts(): Partial<Record<ViadaPattern, string>> {
  return {
    push_upper: TESTED_LIFT_NAME.bench,
    press_lower: TESTED_LIFT_NAME.squat,
    hinge_lower: TESTED_LIFT_NAME.deadlift,
  };
}
