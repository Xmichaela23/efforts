/**
 * THE ASSISTANCE MENU — Strength Focus (the previous program).
 *
 * ⛔ ONE SOURCE. The dropdown in the build flow and the composer that authors the block both read
 * this file. Two lists would be the doubled disease in miniature: a name the picker offers and the
 * composer does not recognise falls through to a legacy weight path that prices bodyweight lifts off
 * the athlete's bench. That has happened here before (D-322, "Pull Up @ 110 lb").
 *
 * Home is `src/lib/` by the precedent `exercise-config.ts` set: anything the client and the edge
 * functions must agree on lives here.
 *
 * ── ⛔ THE LOAD RULE, AND IT IS THE WHOLE REASON THIS IS A SEPARATE FILE ──────────────────────────
 *
 * **The engine prescribes NO weight for assistance work. Ever.**
 *
 * Michael, 2026-07-25: in the previous program only the four main lifts are dictated by percentages of the training
 * max. Assistance exists for hypertrophy, joint health and structural balance, and is meant to be
 * auto-regulated — done by feel, that day. Tie a dumbbell row or a single-leg hip thrust to a
 * mathematical percentage and you force progression on a secondary movement; the athlete arrives at
 * their next main lift already fatigued, fails it, and the fatigue budget they need for their
 * endurance training is gone.
 *
 * So the app outputs a MOVEMENT and a REP TOTAL. The athlete breaks 25 reps up however they like —
 * 5×5 one day, 2×12 the next — and picks a load that feels about 7 out of 10, finishing as though
 * they had a few more in them.
 *
 * ⛔ **NARROWED 2026-08-09 BY D-406, AND THE RULE ABOVE IS OTHERWISE INTACT — read this before you
 * read the paragraph that follows it, which is now partly historical.**
 *
 * The PRESCRIPTION is still nothing: `weight` is still `'By feel'`, `load_prescribed` is still
 * `false`, `percent_1rm` is still absent, and every surface that renders what the plan asked for
 * still renders "by feel". **"The absence is the design" is still true of the prescription.**
 *
 * What D-406 adds is a separate field, `weight_suggested` — a greyed, overwritable starting point in
 * the LOGGER'S ENTRY BOX, so a beginner facing `Dumbbell Row — 50 total, by feel` is not asked to
 * invent a number from nothing on their first session. It is never rendered as a target, never
 * written into the logged set, and absent entirely for bodyweight movements.
 *
 * ⚠️ This is why `ratio` and `primaryRef` in `exercise-config.ts` were IRRELEVANT here even for the
 * loaded options. **They are now read — by exactly one function, `suggestedAssistanceWeight` in
 * `strength-primary-plan.ts`, and by nothing else.** So the accuracy of a ratio on this menu now
 * matters where it did not before.
 *
 * ⚠️ The two this paragraph called known-wrong were CHECKED rather than trusted, 2026-08-09:
 * `Single Leg Hip Thrust` is **now 0.25 with `confidence: 'low'`** — fixed at some point after this
 * warning was written — and `Dumbbell Overhead Press` is **still wrong (ratio 1.0) but is not on this
 * menu**, which offers `Dumbbell Shoulder Press`. Do not delete this warning; a future menu addition
 * can reintroduce exactly this hazard, and the suggestion path would now surface it to an athlete.
 *
 * What the athlete may record afterwards is a different question: an optional note of what they
 * actually grabbed, so next week they remember. That is a log, not a prescription.
 */

// ⛔ NO IMPORTS LEFT, AND THAT IS THE SHAPE OF WHAT D-407 REMOVED. This file imported
// `complementFor`, `getMovementFamily`, `isDirectArm` and `getExerciseConfig` to decide which
// movement belonged on which day. Nothing decides that any more — the athlete does, per day, in
// `src/lib/assistance-catalog.ts`. What is left is arithmetic on a rep count.

/** The three slots the previous program's assistance prescription defines. These are also the Adjust-tab holes —
 *  a glute focus loads `single_leg_core`, a pull-up focus loads `pull`. An add-on REPLACES the
 *  athlete's pick in a slot; it never adds a fourth.
 *
 *  ⛔ THESE KEYS ARE STORAGE AND DO NOT FOLLOW THE COPY (Q-212). Since the slot became
 *  day-dependent, `'push'` no longer names what always appears there — it names the preference the
 *  athlete expressed. The athlete-facing `purpose` says so; the KEY cannot change, because it is
 *  persisted on `goals.training_prefs.assistance_picks` and renaming it would strand every existing
 *  goal. A key is not a label, and this is the one place that distinction is load-bearing. */
export type AssistanceSlot = 'push' | 'pull' | 'single_leg_core';

// ⛔ `AssistanceOption` / `AssistanceSlotMenu` ARE GONE WITH THE MENU (D-407). The shortlist an
// athlete picks from is now `ASSISTANCE_CATALOG` in `src/lib/assistance-catalog.ts`, which carries
// the display name, the muscle word, the previous program's page and the focus tags — everything the two-field
// option object held, plus what the per-day picker needs.

/**
 * ⛔⛔ REWRITTEN 2026-08-16 — THE BAND IS SET BY COMPETING STRESS, NOT BY THE CYCLE PHASE.
 *
 * **What stood here and is gone:** three phase-keyed bands (7th week 25-50, leader 50-75, anchor
 * 75-100), scaled UP into the anchor per the previous program. Correct for a lifter whose whole recovery
 * budget goes to the barbell; wrong for this athlete.
 *
 * ⛔ **MICHAEL'S CALL, 2026-08-16.** *"For an athlete carrying an endurance load, pushing 100 reps of
 * accessory volume will fry their central nervous system. Cap it at 50, even in the easier months."*
 *
 * ⚠️ **THIS USED TO SAY "A DELIBERATE STEP BELOW THE PREVIOUS PROGRAM" AND THAT WAS TOO APOLOGETIC — corrected
 * 2026-08-21 against Forever pp.185-191** (images now kept at
 * the archived book-sources folder; addendum in
 * `docs/REFERENCE-main-lift-forever-pp16-45.md`). In the standard RUNNING-INTEGRATED templates,
 * **25-50 per category is HIS number for the days that carry a run** — Bodybuild the Upper/Athlete
 * the Lower prescribes 25-50 on Mon and Thu (the running days) and 50-100 only on Tue and Fri (sled
 * and prowler, no run), and Strength & Conditioning uses 25-50 throughout its leader, dropping to
 * **0-25** in the seventh week. p.24's 50-100 is general guidance for a lifter with **no endurance
 * load**; pp.185-191 are the case that actually matches this athlete.
 *
 * ⛔ **So 25-50 is defensible AS THE PREVIOUS PROGRAM'S for a running week, and our light-week floor of 15 sits
 * inside his 0-25 seventh week. Do not re-raise these numbers toward 50-100 on the strength of p.24
 * alone.**
 *
 * ⚠️ **WHAT IS STILL OURS IS THE AXIS, NOT THE NUMBERS.** the previous program keys the band to the DAY's own
 * content (running day vs sled day). We key it to how many hard endurance days the WEEK carries.
 * That is our design and must be cited as ours.
 *
 * ⛔ **AND THE AXIS CHANGED, NOT JUST THE NUMBERS.** What decides the band is how much hard
 * endurance the week carries — the thing actually competing for recovery:
 *
 * | hard endurance days | band  |
 * |---------------------|-------|
 * | 2                   | 25-30 |
 * | 1                   | 30-40 |
 * | 0                   | 40-50 |
 *
 * ⚠️ **TWO AXES, AND THEY COMPOSE.** Competing stress picks the BAND; the athlete's tested capacity
 * picks where in it they sit (`assistanceTotalReps`, unchanged in shape). Keying the number on the
 * hard-day count ALONE would throw away the one real measurement on file.
 *
 * ⚠️ **CONSEQUENCE, STATED RATHER THAN HIDDEN: the leader-vs-anchor direction is GONE, not
 * reversed.** It was fixed on 2026-08-15 (p.18) after running backwards, and one flat band removes
 * it entirely. That is the defensible answer for a capped band, but D-432 must be back-annotated or
 * it reads as the fix regressing.
 *
 * ⛔ **AND IT IS A REP TOTAL, NEVER A SET SCHEME.** Michael, 2026-08-16: *"it's never 25 reps in a
 * row — accessory work including pull-ups per the previous program should be broken out at user ease of reps."*
 * Confirmed against the source: a total per category per session, one or two movements, split
 * however the athlete likes; chins explicitly tolerate low reps per set, and his own 100-rep dip
 * example is split in two. The card gets a number, never sets x reps.
 */
export const ASSISTANCE_BAND_BY_HARD_DAYS: Readonly<Record<number, readonly [number, number]>> = {
  0: [40, 50],
  1: [30, 40],
  2: [25, 30],
};

/** The floor of the lightest band and the ceiling of the heaviest — the whole block lives in here. */
export const ASSISTANCE_TOTAL_REPS_FLOOR = 25;
export const ASSISTANCE_TOTAL_REPS_CEILING = 50;

/**
 * ⛔ THE ENDURANCE TIER — RESOLVED ONCE PER WEEK, PASSED DOWN (2026-08-17).
 * Spec: `docs/SPEC-viada-ingestion-order.md`.
 *
 * ⚠️ IT IS A PROPERTY OF THE WEEK AND IT USED TO BE ASKED PER SLOT. `assistanceTotalReps` took
 * `hardEnduranceDays` and re-derived the band on every call, which meant three call sites could each
 * form their own opinion of which tier the athlete is in. One resolution, one answer.
 *
 * | tier | band | trigger |
 * |---|---|---|
 * | `survival` | 25-30 | `>= 2 hard days` **OR** `> 8 total hours` |
 * | `strength` | 40-50 | `0 hard days` **AND** `< 4 total hours` |
 * | `base`     | 30-40 | **everything else** — this is the fall-through |
 *
 * ⛔⛔ `base` IS THE FALL-THROUGH AS OF 2026-08-18, AND `survival` IS NOW ONLY EVER REACHED BY ITS
 * OWN EXPLICIT TRIGGER. READ WHY BEFORE MOVING IT BACK.
 *
 * **What stood here, and what it did.** `base` used to require `== 1 hard day` **AND** `4-8 hours`,
 * with everything failing both AND-gates dropping to `survival` — described in this very comment as
 * "the safe direction". It was not safe, it was **backwards**, and the grid says so:
 *
 *     1 hard day + 3 hrs  ->  survival  (25-30)
 *     1 hard day + 5 hrs  ->  base      (30-40)
 *
 * **More endurance bought MORE assistance.** The same inversion sat at zero hard days: 5 easy hours
 * failed the `< 4` gate, fell through, and landed on the same 25-30 band as an athlete doing two
 * hard sessions a week. The model's whole claim is that accessory volume comes DOWN as competing
 * stress goes UP, and on two stretches of its own domain it did the opposite.
 *
 * ⛔ THE FIX IS THE ORDER, NOT NEW NUMBERS. Both explicit triggers are unchanged, including their
 * boundaries. What changed is which tier catches the remainder: the middle band does, because the
 * remainder IS the middle case — some competing stress, not a lot. Nothing in this file is
 * hand-picked that was not hand-picked before.
 *
 * ⚠️ THE RESULT IS MONOTONIC AND THE TEST BESIDE THIS FILE PROVES IT AS A PROPERTY, NOT AS A ROW:
 * for fixed hard days, more hours never raises the band; for fixed hours, more hard days never
 * raises it. ⛔ Any future edit that breaks that is the same defect returning under a new shape.
 *
 * ⚠️ AND IT MOVES THE UNKNOWN CASE, WHICH IS A REAL CONSEQUENCE AND NOT A ROUNDING ERROR. An athlete
 * with no hours figure used to land in `survival` (25-30); they now land in `base` (30-40), because
 * unknown fails `strength`'s AND-gate and no longer falls to the bottom. That is the correct
 * direction for the same reason as the rest of the change — `survival` is a statement that the week
 * IS heavily loaded, and we do not know that — but it does hand an unmeasured athlete ten more reps
 * than yesterday. Deliberate.
 *
 * ⚠️ BOUNDARY CONVENTION, UNCHANGED AND PINNED BY TEST: `> 8` and `< 4`, so **exactly 4 and exactly
 * 8 hours are both `base`**. That is what the chooser copy in `strength-focus-copy.ts` states
 * ("4 to 8 hours a week -> 30-40"), and the two must not drift apart.
 */
export type EnduranceTier = 'survival' | 'base' | 'strength';

export const TIER_BAND: Readonly<Record<EnduranceTier, readonly [number, number]>> = {
  survival: [25, 30],
  base: [30, 40],
  strength: [40, 50],
};

export function resolveEnduranceTier(input: {
  /** Hard endurance days in the week — prescribed AND club. A club ride costs the same recovery. */
  hardDays?: number | null;
  /**
   * Total weekly endurance hours. ⚠️ ABSENT IS NOT ZERO — an unknown week is not licence to hand out
   * the ceiling (§0h). Absent means the hours condition simply cannot be satisfied, so an athlete
   * with 0 hard days and no hours figure lands in `survival` rather than `strength`.
   */
  totalHours?: number | null;
}): EnduranceTier {
  // ⛔ `Number(null)` IS 0 AND `Number.isFinite(0)` IS TRUE, so the null check has to come FIRST or
  // every unknown reads as a tested zero — which on the hours axis buys the athlete the CEILING, the
  // exact inversion this function's own doc comment forbids. Same trap `weeklyVolumeFor` carries a
  // warning about, caught here by the test below rather than in a plan.
  const num = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const rawHard = num(input.hardDays);
  const hard = rawHard == null ? null : Math.max(0, Math.round(rawHard));
  const rawHours = num(input.totalHours);
  const hours = rawHours == null ? null : Math.max(0, rawHours);

  // ⛔ SURVIVAL IS ONLY EVER ASSIGNED BY ITS OWN TRIGGER. OR — either condition alone is enough, and
  // nothing reaches this tier by failing to qualify for another one.
  if ((hard != null && hard >= 2) || (hours != null && hours > 8)) return 'survival';
  // ⛔ STRENGTH IS THE ONLY REMAINING AND-GATE, and an unknown cannot satisfy it: the full band is a
  // claim that the week carries almost no competing stress, which is not something to assume.
  if (hard === 0 && hours != null && hours < 4) return 'strength';
  // ⛔ BASE CATCHES THE REST, and the remainder IS the middle case — some competing stress, not a
  // lot. This is the line that fixed the inversion; see the table above before changing it.
  return 'base';
}

/**
 * ⛔ THE MERGED DEADLIFT + PRESS DAY SITS AT 25, whatever the week's band. Two main lifts on one day
 * is the heaviest session in the block; the floor is what makes an open push slot safe there.
 * ⚠️ Not wired until the three-card picker lands (§1f) — the composer has nowhere to say "this is
 * the merged day" yet.
 */
export const ASSISTANCE_MERGED_DAY_REPS = 25;


/**
 * ⛔ REMOVED 2026-08-15, MICHAEL'S CALL: *"whatever the previous program says."* A 75 clamp stood here — ours, not
 * his (T3) — and it collapsed the anchor onto a flat 75 while a well-tested leader could reach the
 * same number, which erased the very leader-vs-anchor direction this file had just been fixed to
 * show. The bands are now his, unmodified: leader 50–75, anchor 75–100, seventh week 25–50 (p.24,
 * p.23, p.18).
 *
 * ⚠️ THE COST IS REAL AND WAS ACCEPTED, NOT OVERLOOKED. A concurrent athlete's anchor weeks can now
 * carry up to 100 reps per category — push, pull AND single-leg/core — on top of a 95%-and-rep-out
 * main lift, in the three weeks of the block that already cost the most, while still running. His
 * own guard rails are the ones that apply: p.24, with heavy squat/deadlift volume choose the easier
 * movements for the slot (face pulls, band pull-aparts, easier ab work) rather than trimming reps —
 * *"not everything should be 'in the red.'"* p.23, assistance that stalls or inhibits the main lifts
 * means you are doing it wrong.
 *
 * ⛔ DO NOT REINSTATE A CLAMP WITHOUT ASKING. It was a deliberate removal, not an oversight.
 */

/**
 * ⛔ THE THIRD PHASE. `seventh` is the standalone light week — the TM-test week and the 7th-week
 * deload both (Forever pp.20–23). It is not a leader and it is not an anchor: no supplemental, the
 * lightest assistance band, and the movements themselves are meant to be gentler (p.23).
 */
export type AssistancePhase = 'leader' | 'anchor' | 'seventh';

/**
 * The capacity anchor for the PULL slot: an 8-rep max sits at the band's floor. Deliberately shallow
 * above it — this is insurance, not stimulus. The other two slots derive from it, see `CAPACITY_*`.
 */
const CAPACITY_ENTRY_REPS = 8;
/** Three reps of session volume per rep of capacity above the entry point. */
const CAPACITY_SLOPE = 3;

/**
 * ⛔ THE PREVIOUS PROGRAM'S OWN 10-MINUTE STANDARDS, the previous program — push-ups 100, dips 75, chins 50, hanging leg
 * raise 50. They are the REFERENCE POINT each slot's capacity is read against, so the three slots
 * scale on one rule instead of three hand-picked coefficients (§1f).
 *
 * ⛔⛔ **THE MEASUREMENT MISMATCH, AND IT IS THE THING TO FIX IF A REAL NUMBER EVER ARRIVES.** His
 * standards are a session total inside ten minutes. `pullupMaxReps` is MAX CLEAN REPS IN ONE SET.
 * Those are different measurements, and the app already refuses to merge them elsewhere — the
 * pull-up progression's own copy states the 50-in-10 standard as a session measure and never as
 * "progress toward 50", precisely so the two do not blur.
 *
 * **What is used here is only their RATIO**, which is the part that survives the mismatch: push
 * capacity is roughly twice chin capacity at the same level of athlete, whichever way you measure.
 * So the pull slot keeps its shipped anchor exactly (8 reps → floor, +3 per rep) and the other two
 * are that anchor scaled by the ratio. **Nothing here claims an athlete doing 16 push-ups has met a
 * standard.** If a push or core capacity is ever collected as a 10-minute total rather than a set
 * max, this block is where it has to be reconciled rather than quietly plugged in.
 *
 * ⚠️ DIPS ARE HIS SECOND PUSH MEASURE AND ARE NOT HERE — nothing on `performance_numbers` stores one,
 * so the push slot reads push-ups alone. Adding dips later is one more key, not a model change.
 */
export const CAPACITY_STANDARD: Record<AssistanceSlot, number> = {
  push: 100,
  pull: 50,
  single_leg_core: 50,
};

/** Where a slot's band starts opening, scaled off the pull slot's shipped anchor by his standards. */
function capacityEntryFor(slot: AssistanceSlot): number {
  return CAPACITY_ENTRY_REPS * (CAPACITY_STANDARD[slot] / CAPACITY_STANDARD.pull);
}
/** How much session volume a rep of capacity buys, scaled the inverse way so the bands line up. */
function capacitySlopeFor(slot: AssistanceSlot): number {
  return CAPACITY_SLOPE * (CAPACITY_STANDARD.pull / CAPACITY_STANDARD[slot]);
}

export type AssistanceScaleInputs = {
  /** `performance_numbers.pullupMaxReps` — clean reps, 0 is valid. Absent → the floor. */
  pullupMaxReps?: number | null;
  /**
   * ⛔ THE PUSH SLOT'S CAPACITY (§1f). **NOTHING WRITES THIS YET** — `performance_numbers` has no
   * push-up key and the work order is explicit that no wizard question is being added for one. It is
   * read if it ever arrives; until then the push slot sits at its floor and the copy says so, which
   * is the same "cite the evidence you have, stay silent where you do not" rule the pull slot follows.
   * ⚠️ Wired, not starved-by-accident: this is a declared seam, not a forgotten input.
   */
  pushupMaxReps?: number | null;
  /** ⛔ THE CORE SLOT'S CAPACITY (§1f). Same status as `pushupMaxReps` — read if present, floor if not. */
  hangingLegRaiseMaxReps?: number | null;
  /** `develop` earns more than `maintain`. */
  strengthPosture?: string | null;
  /**
   * ⛔ HOW MANY HARD ENDURANCE DAYS THE WEEK CARRIES — 0, 1 or 2. This is what picks the band
   * (2026-08-16). Absent reads as 1, the middle band: an unknown week is not licence to prescribe
   * the heaviest one, and treating it as 0 would hand a busy athlete the ceiling.
   */
  hardEnduranceDays?: number | null;
  /**
   * ⛔ THE WEEK'S RESOLVED TIER — see {@link resolveEnduranceTier}. When present it OVERRIDES
   * `hardEnduranceDays`, because it is the only one of the two that has seen the total hours.
   */
  tier?: EnduranceTier | null;
  /**
   * ⛔ IS THE ATHLETE SWIMMING AT ALL — the lat and shoulder quarantine (2026-08-17).
   *
   * Swimming is thousands of unweighted pull-ups: the lats, teres major and shoulder capsule are
   * under continuous tension through the catch phase of every stroke. So the PULL slot is locked to
   * the floor of the tier's band regardless of tested capacity, to protect the shoulder and the
   * stroke.
   *
   * ⚠️ IT KEYS ON *ANY* SWIMMING, NOT ON YARDAGE, AND MICHAEL RULED THAT DELIBERATELY. Exact volume
   * is secondary to the mechanic — even a light 1,500-yard recovery swim is hundreds of unweighted
   * pulls. ⛔ Do not add a yards question to buy precision this gate does not need.
   *
   * ⚠️ IT IS THE ONE PLACE A TESTED CAPACITY IS DELIBERATELY NOT SPENT. Everywhere else a measured
   * chin max walks the slot up its band; here it does not.
   */
  swimming?: boolean | null;
};

/**
 * The tested capacity for a slot, if one exists. ⛔ Returns `null`, never 0 — absent means "we have
 * not asked", and a zero would read as a tested inability.
 */
function capacityFor(slot: AssistanceSlot, inputs?: AssistanceScaleInputs): number | null {
  const raw = slot === 'pull'
    ? inputs?.pullupMaxReps
    : slot === 'push'
      ? inputs?.pushupMaxReps
      : inputs?.hangingLegRaiseMaxReps;
  return typeof raw === 'number' && raw > 0 ? raw : null;
}

/**
 * The band for a week: [floor, ceiling].
 *
 * ⛔ IT READS THE RESOLVED TIER NOW, NOT A HARD-DAY COUNT. `hardEnduranceDays` is still accepted so
 * a caller that has not been hoisted yet behaves exactly as before, but it is the FALLBACK — when a
 * tier is present the tier wins, because the tier is the thing that saw the hours.
 * ⚠️ NEITHER PRESENT → the middle band. Unknown is not licence to prescribe the heaviest, and
 * reading it as zero would hand the busiest athlete the ceiling (§0h).
 */
function bandFor(inputs?: AssistanceScaleInputs): readonly [number, number] {
  if (inputs?.tier) return TIER_BAND[inputs.tier];
  const n = Number(inputs?.hardEnduranceDays);
  if (!Number.isFinite(n)) return ASSISTANCE_BAND_BY_HARD_DAYS[1];
  const clamped = Math.max(0, Math.min(2, Math.round(n)));
  return ASSISTANCE_BAND_BY_HARD_DAYS[clamped];
}

/**
 * Total reps for one slot: the phase's floor, plus whatever the tested capacity earns, capped at the
 * phase's ceiling.
 *
 * ⚠️ ACCESSORIES ARE INSURANCE, NOT STIMULUS. This returns a FLOOR the athlete may stop at, not a
 * target to chase — the copy that ships with it says so, and nothing here should ever read as a
 * number to beat.
 *
 * ⛔ THE CAPACITY RULE IS UNCHANGED — ONLY THE BAND IT WALKS MOVED. Same anchor (8 reps sits at the
 * floor), same slope (three reps of session volume per rep of capacity), same rounding. On the anchor
 * band that is byte-identical to what shipped before this change; on a leader it now walks 25→50
 * instead, reaching the top at the same ~16-rep capacity.
 */
export function assistanceTotalReps(
  slot: AssistanceSlot,
  inputs?: AssistanceScaleInputs,
): { totalReps: number; basis: 'capacity' | 'posture' | 'floor' } {
  const [floor, ceiling] = bandFor(inputs);
  const developing = (inputs?.strengthPosture ?? 'develop') === 'develop';

  // ⛔ THE SWIM GATE. The pull slot takes the tier's floor and nothing moves it — not the focus, not
  // a tested capacity. ⚠️ It does NOT touch the opt-in pull-up progression, which overrides this slot
  // upstream in `resolveDayAssistance`: the athlete asked for that programme by name, and D-407/D-423
  // is that an explicit choice is honoured. What they get instead is a warning on the card.
  if (slot === 'pull' && inputs?.swimming) return { totalReps: floor, basis: 'floor' };

  // ⛔ EVERY SLOT SCALES ON THE SAME RULE NOW (§1f) — it just has an input for one of the three. A
  // 50-rep session against an 8-rep chin max is a different exercise from the same session against a
  // 25-rep max, and the same is true of push and core; what differs is the reference point.
  const cap = capacityFor(slot, inputs);
  if (cap != null) {
    const earned = floor + Math.max(0, cap - capacityEntryFor(slot)) * capacitySlopeFor(slot);
    const rounded = Math.min(ceiling, Math.max(floor, Math.round(earned / 5) * 5));
    return { totalReps: developing ? rounded : floor, basis: 'capacity' };
  }

  // ⛔ NO CAPACITY SIGNAL → THE FLOOR. A first draft gave `develop` posture floor+5, and that
  // violated the brief's own constraint: *"total per-session accessory volume should come down from
  // where it sits now, not up."* Posture is not evidence of capacity — it is evidence of INTENT, and
  // raising someone's volume on intent alone is the guess this whole model exists to remove.
  //
  // ⚠️ So posture can only ever WITHHOLD here, never add. `maintain` and `develop` both land on the
  // floor when nothing is tested; the difference between them shows up on a slot that HAS a
  // capacity, where maintain declines to spend it.
  return { totalReps: floor, basis: developing ? 'posture' : 'floor' };
}

/** The sentence that names the evidence — or its absence. Never a target, always a floor. */
export function assistanceBasisNote(basis: 'capacity' | 'posture' | 'floor', cap?: number | null): string {
  if (basis === 'capacity' && typeof cap === 'number') {
    return `Scaled to your tested ${cap} clean reps.`;
  }
  if (basis === 'posture') return 'No tested capacity on file for this movement, so this is the default floor.';
  // ⚠️ REWORDED 2026-08-15. It read "the main lifts are heavy this cycle and this is here to maintain"
  // — which was the ANCHOR-holds-the-floor reasoning, and that reasoning is now reversed (p.18).
  return 'The floor for this week — nothing tested to scale it from.';
}

/**
 * ⛔ THE MENU, THE PICKS AND THE RE-ROLING ARE RETIRED — D-407 SUPERSEDES D-385 / D-404 / D-405.
 *
 * What stood here: `ASSISTANCE_MENU` (three slots × a shortlist), `ASSISTANCE_DEFAULTS`,
 * `AssistancePicks`, `resolveAssistance`, and the machinery that re-roled a block-wide pick across
 * the week — `ROLE_BY_DAY`, `resolveRole`, `fitsRole`, `ROLE_FALLBACK`, `orderForDay`,
 * `wantedLegFamily`, `dayTypeOf`, `AssistanceTemplate`, and the `substitutedFor` / `balancedFor`
 * annotations with `assistanceSubstitutionNote` to print them.
 *
 * ⛔ IT WAS NOT WRONG — IT WAS ANSWERING A QUESTION THE ATHLETE SHOULD ANSWER. Every rule in it was
 * sourced page by page (Triumvirate p.48, Periodization Bible pp.50-51, Bodyweight p.52, concurrent
 * pp.86-88) and two of them reversed each other on the merits as the reading improved. The whole
 * apparatus existed because the athlete made THREE picks for TWELVE slots, so nine of them had to be
 * inferred — and when the inference disagreed with the pick, the app printed a sentence explaining
 * why the athlete was not getting what they chose.
 *
 * the previous program asks for one movement per category per day. Ask for twelve, infer nothing, and the
 * substitution note, the role table, the fallback pools and the plane-complement rule all become
 * answers to a question nobody is asking. See `src/lib/assistance-catalog.ts`.
 *
 * ⚠️ WHAT SURVIVED, AND WHY IT IS STILL HERE RATHER THAN MOVED:
 *   · `assistanceTotalReps` / `assistanceBasisNote` — the capacity rep scaling (floor 50, ceiling 75,
 *     anchor holds the floor). Untouched by the model change: it answers "how many reps in a slot",
 *     which the per-day picker does not re-ask. ⛔ The mock showed a flat 50 and the scaling was kept
 *     deliberately — dropping a sourced behaviour to match a mock is how an engine loses its
 *     reasoning quietly.
 *   · `ASSISTANCE_GUIDANCE` — the "split the reps, load by feel" sentence both the composer and the
 *     builder card print.
 *   · The load rule at the top of this file (D-406), which is unchanged and still governs.
 *
 * ⚠️ `AssistanceSlot` IS KEPT AS THE CATEGORY KEY. `assistanceTotalReps` takes it, and the three
 * values are byte-identical to `AssistanceCategory` in the catalog — same keys, same storage, no
 * migration. It is re-exported there so new code has one name for it.
 */

/**
 * The guidance that rides with the slots. States how to run 25 reps so they do not become a
 * bodybuilding session bolted onto a strength block.
 *
 * Kept as data, not baked into a component, because the composer puts it in the session description
 * and the build-flow card shows it too — the same sentence in two places, from one place.
 */
// ⛔ NO NUMBER IN THIS SENTENCE, and that is a correctness fix as much as a length one. It read
// "break the 25 reps" while `assistanceTotalReps()` scales the total to 50 on a tested capacity —
// so on the athletes it scaled for, this line named a rep count the session did not prescribe. The
// row above it already carries the real total. Shortened 2026-07-29 to fit the card without scroll.
// ⛔ THE SENTENCE NAMES ITS OWN SUBJECT, and that is the fix, not a style choice. The server
// composer concatenates this straight after the main-lift labels (`strength-primary-plan.ts:2174`
// → *"Overhead Press 55×5, 60×5, 70×5+. Load by feel — about 7 out of 10…"*), so an unqualified
// "load by feel" read as autoregulate-the-MAIN-LIFT — which contradicts the AMRAP the third set is
// built on. The percentages are prescribed; only the assistance is by feel. Naming the subject in
// the constant fixes BOTH consumers at once (the builder card at `NonRaceBuilder.tsx:2862` reads
// slightly redundant under its own picker, which is the cheap side of the trade).
export const ASSISTANCE_GUIDANCE =
  'On the assistance: split the reps however suits that day. Load by feel — about 7 out of 10, a few reps left. Going to failure costs the next main lift.';

