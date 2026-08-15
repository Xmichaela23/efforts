/**
 * THE ASSISTANCE MENU — Strength Focus (Wendler 5/3/1).
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
 * Michael, 2026-07-25: in 5/3/1 only the four main lifts are dictated by percentages of the training
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

/** The three slots Wendler's assistance prescription defines. These are also the Adjust-tab holes —
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
// the display name, the muscle word, Wendler's page and the focus tags — everything the two-field
// option object held, plus what the per-day picker needs.

/**
 * ⛔ THE BAND IS PER PHASE, AND ITS DIRECTION REVERSED ON 2026-08-15. READ THIS BEFORE CHANGING A
 * NUMBER. Every page below is verified in `docs/REFERENCE-531-forever-pp16-45.md`.
 *
 * ⚠️ **WHAT WAS HERE AND WAS BACKWARDS:** one 50–75 band for the whole block, with the ANCHOR pinned
 * at the floor — *"volume comes down when the bar goes up"* — and the LEADER free to climb. That is
 * the opposite of **Forever p.18**, which scales assistance and jumps the other way: a leader is the
 * easier month and carries LESS assistance; an anchor is the hard month and carries MORE.
 * (The reasoning behind the old direction was ours and it was plausible; the book is not silent on
 * it, so the book wins.)
 *
 * ⛔⛔ **THESE NUMBERS DEVIATE FROM THE WORK ORDER'S §1a, DELIBERATELY, BECAUSE THE PAGE-PINNED
 * READING SAYS OTHERWISE.** The work order specified leaders at 25–50 and anchors at 50–100. The
 * reference doc — which is the transcription the work order was itself derived from — reads:
 *   · **p.24: the BASE recommendation is 50–100 total reps per category per workout.**
 *   · **p.23: 25–50 is the SEVENTH WEEK's number**, not a leader's.
 * So 25–50 belongs to the light standalone weeks, and leader-vs-anchor is a split INSIDE 50–100.
 * ⚠️ If Michael intended the work order's numbers over the page reading, this is the one block to
 * change and it is three constants.
 *
 * ⛔ THE BANDS, AND WHAT IS HIS VERSUS OURS:
 *
 * | phase | band | source |
 * |---|---|---|
 * | 7th-week | 25–50 | **his** — Forever p.23, and "less intensive movements" on the same page |
 * | leader   | 50–75 | **his floor** (p.24) + p.18's "less assistance"; the split point is ours |
 * | anchor   | 75–100 | **his ceiling** (p.24) + p.18's "more assistance" |
 *
 * ⛔ **AND WE CLAMP EVERYTHING AT 75, WHICH IS OURS, NOT HIS (T3).** His anchor runs to 100. This
 * block is written for an athlete carrying endurance training underneath it, and 100 reps per slot on
 * top of a 95%-and-rep-out main lift spends a fatigue budget the running needs. 75 is the ceiling the
 * engine already ran on and the top of the Triumvirate's own band (2nd ed. p.48: Dips 5×15 = 75).
 * **Consequence, stated rather than hidden: the anchor sits at a flat 75.** A leader with a big
 * tested capacity can reach the same number — the direction is never inverted, but the two can meet.
 *
 * ⚠️ THE 2ND-EDITION READING THAT SET THE OLD FLOOR STILL STANDS — Triumvirate (p.48) 50–75,
 * Bodyweight (p.52) "no less than 75 per exercise". Those are anchor-shaped templates, and they sit
 * inside the same 50–100 base. Nothing here retracts them.
 *
 * ⚠️ AND THE DERIVATION IS UNEVEN ON PURPOSE. `pullupMaxReps` exists on `performance_numbers`; there
 * is no push or single-leg equivalent. Rather than wait for all three, each slot scales on whatever
 * it actually has and **the copy says which** — "scaled to your tested N reps" versus "the default
 * floor, no capacity on file". Same rule as everywhere else: cite the evidence you have, stay silent
 * where you do not. Adding a push capacity later upgrades one slot without touching the model.
 */
export const ASSISTANCE_TOTAL_REPS_FLOOR = 50;
export const ASSISTANCE_TOTAL_REPS_CEILING = 75;

/** Forever p.23 — the SEVENTH WEEK's band. Not a leader's; see the correction above. */
export const ASSISTANCE_SEVENTH_FLOOR = 25;
export const ASSISTANCE_SEVENTH_CEILING = 50;

/**
 * ⛔ HIS BASE RANGE TOPS OUT AT 100 (p.24) AND WE DO NOT USE IT. Kept as a named constant so the
 * deviation is legible rather than looking like a forgotten number. See the band table above.
 */
export const ASSISTANCE_ANCHOR_CEILING_WENDLER = 100;

/**
 * ⛔ REMOVED 2026-08-15, MICHAEL'S CALL: *"whatever Wendler says."* A 75 clamp stood here — ours, not
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
 * ⛔ WENDLER'S OWN 10-MINUTE STANDARDS, Forever p.33 — push-ups 100, dips 75, chins 50, hanging leg
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
  /** ⛔ VOLUME GOES UP WHEN THE BAR GOES UP — Forever p.18. Anchors carry the most. */
  cycleKind?: AssistancePhase | null;
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

/** The band for a phase: [floor, ceiling], AFTER our concurrent-athlete clamp. */
function bandFor(phase: AssistancePhase | null | undefined): [number, number] {
  if (phase === 'seventh') return [ASSISTANCE_SEVENTH_FLOOR, ASSISTANCE_SEVENTH_CEILING];
  if (phase === 'anchor') {
    return [ASSISTANCE_TOTAL_REPS_CEILING, ASSISTANCE_ANCHOR_CEILING_WENDLER];
  }
  // ⚠️ ABSENT PHASE READS AS A LEADER, and that is the conservative direction: the lighter of the two
  // cycle bands. An unknown week is not licence to prescribe the heavy one (§0h).
  return [ASSISTANCE_TOTAL_REPS_FLOOR, ASSISTANCE_TOTAL_REPS_CEILING];
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
  const [floor, ceiling] = bandFor(inputs?.cycleKind);
  const developing = (inputs?.strengthPosture ?? 'develop') === 'develop';

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
 * Forever p.24 asks for one movement per category per day. Ask for twelve, infer nothing, and the
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

