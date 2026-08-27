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
 * ⛔⛔ THE BIKE-ONLY REFUSAL IS GONE (Michael, 2026-08-27), AND ITS ARGUMENT IS NOT DELETED WITH IT
 * — IT IS OVERRULED. What stood here, and it is not wrong:
 *
 *   *"`strength_5k`'s SHAPE is built around running — four endurance sessions, the plyo day, and a
 *   lower-body haircut whose stated cause is a run — and handing a pure cyclist a week cut to a
 *   runner's page would be a different program wearing this one's slot count."*
 *
 * ⛔ WHAT OVERRULES IT IS THE ALTERNATIVE, NOT A COUNTER-ARGUMENT. A refused athlete fell through to
 * the Get Stronger path, and Michael's ruling is *"if wendler has a future at all its not in this
 * path."* Refusing a cyclist no longer sends them to a second program; it sends them to one this
 * path is not keeping. **A runner-shaped week filled with rides beats a plan that is being retired.**
 *
 * ⚠️ SO SAY PLAINLY WHAT A BIKE-ONLY ATHLETE GETS: `strength_5k`'s skeleton — four endurance
 * sessions, one of them long, the plyo day — with every slot assigned to the bike. Viada's own
 * cycling program (Cycling: Base, p278/p280) is the frame that supersedes this, and it is not built.
 * ⚠️ AND THE SHAPE HOLDS UP BETTER THAN THE OLD NOTE FEARED, on three counts checked before the
 * refusal came out: `assignSports` already routes a kept bike into every slot and `RIDE_EQUIVALENT`
 * maps every family; the lower-body haircut already no-ops without a run in front of the leg day
 * (`progression.ts`, `hardRunBeforeLower`); and the plyo day STAYS, because p88's benefits are
 * running economy, chronic-injury reduction AND balance *"which can help even loaded movements and
 * carries"* — not runner-only (Michael, 2026-08-26).
 *
 * ⚠️ WHAT STILL REFUSES is the one position with no endurance at all. Every frame is a hybrid week,
 * so that is not a plan this file can serve. ⛔ IT IS ALSO UNREACHABLE FROM THE WIZARD, which offers
 * exactly three athlete types — run only, ride only, run + ride. It stays as a guard for a caller
 * that is not the wizard, and it is not the gap.
 */
export function resolveFrame(position: FramePosition): FrameResolution {
  // ⛔ ONE FRAME, EITHER SPORT. Which sport fills the slots is `sport-slots.ts`'s question, not this
  // file's — see the note above for what a bike-only athlete is actually handed.
  if (position.enduranceSport === 'run' || position.enduranceSport === 'bike') {
    return { frame: 'strength_5k', cite: FRAMES.strength_5k.cite };
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
