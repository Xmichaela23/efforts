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
 * ⛔ THE FLOOR IS 50 AND THE CEILING IS 75. Both are read off the book. Michael, 2026-08-05.
 *
 * ⚠️ **THIS SUPERSEDES THE "25 IS THE FLOOR AND IT STAYS" CALL OF 2026-07-28**, and the reason that
 * call was made is the reason it had to go. It rested on "25 is the documented bottom of Wendler's
 * published 25-50 range." **There is no 25-50 range in the book.** Verified page by page 2026-08-05
 * against `~/Downloads/531_2nd_Edition_Hard_Copy.pdf`:
 *
 *   Triumvirate (p.48)          Dips 5x15 = 75 · Chin-ups 5x10 = 50 · Good Morning 5x12 = 60
 *                               DB Bench 5x15 = 75 · DB Row 5x10 = 50 · Leg Press 5x15 = 75
 *   Bodyweight (p.52)           "I recommend no less than 75 reps per exercise for each workout"
 *   Periodization Bible (p.51)  5 sets of 10-20 reps = 50-100
 *
 * **Wendler's lowest number anywhere is 50, and the Triumvirate — his most-used template — runs 50
 * to 75.** We were at 25, which is half his floor. The 50/75 band IS the Triumvirate's own band.
 *
 * ⚠️ THE CEILING IS ALSO WHAT MAKES THE §A TIERS POSSIBLE. At the old ceiling of 50, floor met
 * ceiling and Strong and Heavy would have been the same block wearing two names.
 *
 * ⚠️ AND THE DERIVATION IS UNEVEN ON PURPOSE. `pullupMaxReps` exists on `performance_numbers`; there
 * is no push or single-leg equivalent. Rather than wait for all three, each slot scales on whatever
 * it actually has and **the copy says which** — "scaled to your tested N reps" versus "the default
 * floor, no capacity on file". Same rule as everywhere else: cite the evidence you have, stay silent
 * where you do not. Adding a push capacity later upgrades one slot without touching the model.
 */
export const ASSISTANCE_TOTAL_REPS_FLOOR = 50;
export const ASSISTANCE_TOTAL_REPS_CEILING = 75;

export type AssistanceScaleInputs = {
  /** `performance_numbers.pullupMaxReps` — clean reps, 0 is valid. Absent → the floor. */
  pullupMaxReps?: number | null;
  /** `develop` earns more than `maintain`. */
  strengthPosture?: string | null;
  /** ⛔ VOLUME COMES DOWN WHEN THE BAR GOES UP. Anchor cycles hold the floor. */
  cycleKind?: 'leader' | 'anchor' | null;
};

/**
 * Total reps for one slot: the floor, plus whatever the evidence earns, capped at the ceiling.
 *
 * ⚠️ ACCESSORIES ARE INSURANCE, NOT STIMULUS. This returns a FLOOR the athlete may stop at, not a
 * target to chase — the copy that ships with it says so, and nothing here should ever read as a
 * number to beat.
 */
export function assistanceTotalReps(
  slot: AssistanceSlot,
  inputs?: AssistanceScaleInputs,
): { totalReps: number; basis: 'capacity' | 'posture' | 'floor' } {
  // ⛔ THE ANCHOR HOLDS THE FLOOR, whatever else is true. The main lifts are at 95% with a rep-out;
  // that is the week accessory volume must not compete with.
  if (inputs?.cycleKind === 'anchor') return { totalReps: ASSISTANCE_TOTAL_REPS_FLOOR, basis: 'floor' };

  const developing = (inputs?.strengthPosture ?? 'develop') === 'develop';

  // Pull is the one slot with a tested capacity. A 50-rep session against an 8-rep max is a
  // different exercise from the same session against a 25-rep max.
  if (slot === 'pull' && typeof inputs?.pullupMaxReps === 'number' && inputs.pullupMaxReps > 0) {
    const cap = inputs.pullupMaxReps;
    // 8 reps sits at the floor; capacity above that walks toward the ceiling, three reps of session
    // volume per rep of capacity. Deliberately shallow — this is insurance. On the 50/75 band the
    // ceiling is reached at a ~16-rep max, which is where Wendler's own top number sits anyway.
    const earned = ASSISTANCE_TOTAL_REPS_FLOOR + Math.max(0, cap - 8) * 3;
    const capped = Math.min(ASSISTANCE_TOTAL_REPS_CEILING, Math.round(earned / 5) * 5);
    return { totalReps: developing ? capped : ASSISTANCE_TOTAL_REPS_FLOOR, basis: 'capacity' };
  }

  // ⛔ NO CAPACITY SIGNAL → THE FLOOR. A first draft gave `develop` posture floor+5, and that
  // violated the brief's own constraint: *"total per-session accessory volume should come down from
  // where it sits now, not up."* Posture is not evidence of capacity — it is evidence of INTENT, and
  // raising someone's volume on intent alone is the guess this whole model exists to remove.
  //
  // ⚠️ So posture can only ever WITHHOLD here, never add. `maintain` and `develop` both land on the
  // floor when nothing is tested; the difference between them shows up on the slot that HAS a
  // capacity, where maintain declines to spend it.
  return { totalReps: ASSISTANCE_TOTAL_REPS_FLOOR, basis: developing ? 'posture' : 'floor' };
}

/** The sentence that names the evidence — or its absence. Never a target, always a floor. */
export function assistanceBasisNote(basis: 'capacity' | 'posture' | 'floor', cap?: number | null): string {
  if (basis === 'capacity' && typeof cap === 'number') {
    return `Scaled to your tested ${cap} clean reps.`;
  }
  if (basis === 'posture') return 'No tested capacity on file for this movement, so this is the default floor.';
  return 'The floor — the main lifts are heavy this cycle and this is here to maintain, not to add.';
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

