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
  /**
   * The PRIMARY endurance sport the athlete is holding. `null` = strength only.
   *
   * ⛔ A KEPT BIKE OR SWIM NO LONGER REFUSES THIS FRAME (slice 4). Both used to, because every
   * endurance slot in `strength_5k` was a `run_*` family and routing a bike-keeping athlete here
   * would have deleted twelve weeks of riding silently. `sport-slots.ts` assigns a sport per slot
   * now, so those two refusals — and the `bikeKept` / `swimDays` fields they read — are **deleted
   * whole** rather than left behind a flag.
   */
  enduranceSport: 'run' | 'bike' | null;
};

export type FrameResolution =
  | { frame: FrameId; cite: string }
  | { frame: null; reason: string };

/**
 * ⛔ THE FRAME NOW HOLDS A MIXED WEEK, AND THE TWO SPORT REFUSALS ARE GONE (slice 4).
 *
 * `strength_5k` (p246) is transcribed with run families in every endurance slot, but a slot is a
 * SESSION TYPE and the sport is assigned — pivot §2, on his p275 permission for any power-metered
 * non-impact modality and for a ride standing in for the long run. `sport-slots.ts` does that
 * assignment, so a kept bike or a kept swim routes INTO this frame instead of away from it.
 *
 * ⚠️ WHAT STILL REFUSES, and it is only the dial positions that have no frame built: a cyclist with
 * no running at all (Cycling: Base, p278/p280) and an athlete holding no endurance at all. Every
 * frame is a hybrid week, so the second is not a plan this file can serve.
 *
 * ⚠️ ⛔ A BIKE-ONLY ATHLETE IS STILL REFUSED EVEN THOUGH THE SLOTS COULD NOW ALL BE RIDES, and that
 * is deliberate. `strength_5k`'s SHAPE is built around running — four endurance sessions, the plyo
 * day, and a lower-body haircut whose stated cause is a run — and handing a pure cyclist a week cut
 * to a runner's page would be a different program wearing this one's slot count. His cycling
 * programs are their own pages and are the next frames to build.
 */
export function resolveFrame(position: FramePosition): FrameResolution {
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
