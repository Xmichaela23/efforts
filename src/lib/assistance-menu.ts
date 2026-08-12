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

// ⚠️ THE FIRST SIBLING IMPORT INSIDE `src/lib` THAT DENO MUST ALSO RESOLVE. Every other file
// here that an edge function pulls in is a leaf. The `.ts` extension is required for Deno and
// is resolved fine by Vite; both toolchains are checked (deno test + npm run build).
// It earns the edge: the collision rule and the menu it applies to are one claim, and
// splitting them would put the rule where the next person editing the menu cannot see it.
// ⚠️ `sharesMovementFamily` IS DELIBERATELY NO LONGER IMPORTED. "Does this share the main lift's
// family" was the question the old collision rule asked, and asking it of a push slot on a press day
// is what produced defect #1 — a push always shares a press's family, so a push slot could never
// hold a push. The question is now "does this fit the day's ROLE" (`fitsRole`). The helper still
// exists and is right for other callers; it is the wrong question HERE.
import { complementFor, getMovementFamily, isDirectArm } from './exercise-config.ts';
import { getExerciseConfig } from './exercise-config.ts';

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

export type AssistanceOption = {
  /** ⛔ Must be a name `getExerciseConfig()` resolves. An unresolved name is the D-322 bug class. */
  name: string;
  /** What it works, in the athlete's words. Shown beside the option so the choice is informed. */
  targets: string;
  /**
   * Equipment the movement needs. `null` = bodyweight, always available.
   * ⚠️ ADVISORY ONLY — nothing filters on it (see the swap-sheet note on `ASSISTANCE_PEERS`), so a
   * new value here changes what the athlete READS beside an option and gates nothing.
   * `cable` added 2026-08-09 for the arm slot's pushdown.
   */
  requires: 'dumbbells' | 'bar' | 'bench' | 'cable' | null;
};

export type AssistanceSlotMenu = {
  slot: AssistanceSlot;
  label: string;
  /** Why the slot exists — the sentence above the options. */
  purpose: string;
  /** Total reps per session. Wendler's range is 25–50; the bottom is ours, read off Van Hooren —
   *  an endurance athlete keeps assistance volume low or builds size they did not ask for. */
  totalReps: number;
  options: AssistanceOption[];
};

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
 * ⛔ EVERY NAME HERE MUST RESOLVE EXACTLY IN `exercise-config.ts` — NO FUZZY MATCHES.
 *
 * Checked 2026-08-05 by running each through `getExerciseConfig`. Three of the names the spec
 * proposed only FUZZY-matched, which is the D-322 bug class ("Pull Up @ 110 lb") waiting to happen —
 * the config logs a warning and silently borrows another movement's entry:
 *
 *   "Incline Press"  -> borrowed 'dumbbell incline press'   USE `Incline Bench Press`
 *   "Ab Wheel"       -> borrowed 'ab wheel rollout'         USE `Ab Wheel Rollout`
 *   "Split Squat"    -> borrowed 'bulgarian split squat'    USE `Bulgarian Split Squat` (already here)
 *
 * Nothing on this menu is ever priced (see the load rule at the top), so a borrowed ratio cannot hurt
 * anyone *through this file* — but these names are stored on the goal and read elsewhere. Use the
 * entry that actually exists.
 */
export const ASSISTANCE_MENU: AssistanceSlotMenu[] = [
  {
    slot: 'push',
    label: 'Push',
    // ⛔ THE OLD SENTENCE PROMISED THE DEFECT. It read "on bench and press days this slot balances
    // the pressing instead" — which described `BALANCE_POOL.push` handing back a pull, the behaviour
    // this rework removes. A press day now KEEPS a push (Triumvirate p.48, Periodization Bible
    // pp.50-51, Bodyweight p.52, and the worked concurrent example p.88 which has Dips on the bench
    // day). What the slot does on a LOWER day is carry the leg work — see `ROLE_BY_DAY`.
    purpose: 'Chest, shoulders and triceps. Bodyweight or dumbbells keep the nervous-system cost low. On squat and deadlift days this slot carries single-leg work instead.',
    totalReps: ASSISTANCE_TOTAL_REPS_FLOOR,
    options: [
      { name: 'Push Up', targets: 'Chest, front shoulders, triceps', requires: null },
      { name: 'Dips', targets: 'Lower chest, triceps, front shoulders', requires: 'bar' },
      { name: 'Dumbbell Bench Press', targets: 'Chest, triceps, shoulder stability', requires: 'bench' },
      // NEW 2026-08-05 — Wendler's own bench-day pairing in the Simplest Strength Template (p.55,
      // "Bench Press -> Incline Press") and listed under "Shoulders or Chest" for both press days in
      // the Periodization Bible (p.50). The push slot needed a second horizontal option so a bench
      // day has somewhere to go that is not the main lift itself.
      { name: 'Incline Bench Press', targets: 'Upper chest, front shoulders, triceps', requires: 'bench' },
      // ⚠️ NOT "Dumbbell Overhead Press" — that name resolves to the BARBELL overhead press entry in
      // exercise-config (ratio 1.0, counted as a total rather than per hand). Harmless here because
      // nothing on this menu is priced, but the stored name is used elsewhere, so use the entry that
      // actually describes the movement.
      { name: 'Dumbbell Shoulder Press', targets: 'Shoulders, triceps, upper back', requires: 'dumbbells' },
    ],
  },
  {
    slot: 'pull',
    label: 'Pull',
    // ⛔ THE PULL SLOT IS THE ONE THE BOOK NEVER LETS GO. None of the four main lifts is a pull, so
    // every gram of pulling volume in the block lives here. It is also the slot Q-212's
    // plane-complement rule got RIGHT (p.86: horizontal push -> vertical pull, vertical push ->
    // horizontal pull) and that half is kept unchanged.
    purpose: 'Upper back and lats — the balance against the heavy pressing in the main lifts. None of the four main lifts pulls, so this is where all of it lives.',
    totalReps: ASSISTANCE_TOTAL_REPS_FLOOR,
    options: [
      { name: 'Pull Up', targets: 'Lats, upper back, biceps', requires: 'bar' },
      { name: 'Chin Up', targets: 'Lats, biceps, upper back', requires: 'bar' },
      { name: 'Inverted Row', targets: 'Mid-back, rear shoulders, biceps', requires: 'bar' },
      { name: 'Dumbbell Row', targets: 'Mid-back, lats, biceps', requires: 'dumbbells' },
      // NEW 2026-08-05 — Face Pull returns to the slot it actually belongs in. Wendler lists it on
      // p.50 under "Lats or Upper Back" beside DB rows, chins and T-bar rows. It was only ever wrong
      // as a PUSH. ⚠️ Do not call it prehab in copy; the book does not.
      { name: 'Face Pull', targets: 'Rear shoulders, upper back', requires: null },
    ],
  },
  {
    slot: 'single_leg_core',
    // ⚠️ THE KEY IS STILL `single_leg_core` AND CANNOT CHANGE — it is persisted on
    // `goals.training_prefs.assistance_picks`, and renaming it would strand every existing goal. The
    // LABEL is what the athlete reads, and it now names what they actually pick.
    label: 'Single-leg',
    // ⛔ CORE AND ARM OPTIONS WERE REMOVED FROM THIS DROPDOWN (2026-08-09, Michael's call).
    //
    // The slot carries three different roles across the week — single-leg on lower days, ARM on
    // press days (D-404), and core is the `push` key's job on lower days — so the dropdown was
    // asking the athlete to choose a movement for a role their pick would rarely land in. An athlete
    // picking `Sit Up` here got a lunge on both leg days and a triceps movement on both press days,
    // and their pick appeared nowhere.
    //
    // ⚠️ NOTHING GOES BLANK, and that is `ROLE_FALLBACK`'s whole job — core resolves to `Sit Up` and
    // arm to `Diamond Push Up`, bodyweight-first so neither is gated on equipment. Both remain
    // swappable in the session: `assistancePeersFor` looks a movement up in the fallback pools when
    // it is on no menu, so a Sit Up row still offers the rest of the ab list.
    //
    // ⛔ SO A MOVEMENT DROPPED FROM HERE MUST EXIST IN A `ROLE_FALLBACK` POOL OR IT BECOMES
    // UNREACHABLE — no menu, no swap sheet, gone. The curls were menu-only and were added to
    // `ROLE_FALLBACK.arm` in the same change for exactly that reason.
    purpose: 'One leg at a time. This is the leg work on squat and deadlift days. On bench and press days the slot carries triceps instead, and abs sit on the leg days — both chosen for you, both swappable in the session.',
    totalReps: ASSISTANCE_TOTAL_REPS_FLOOR,
    options: [
      { name: 'Reverse Lunge', targets: 'Quads, glutes, single-leg balance', requires: null },
      { name: 'Bulgarian Split Squat', targets: 'Quads, glutes, hip stability', requires: null },
      { name: 'Single Leg Hip Thrust', targets: 'Glutes, hamstrings, hip drive', requires: null },
      // Wendler pairs the DEADLIFT with a squat pattern (p.53: "the deadlift with a squatting
      // exercise"; p.55 and p.86 both use Front Squat) — the leg role on a hip day needs a loadable
      // knee-dominant answer beyond the two split-squat variants.
      { name: 'Front Squat', targets: 'Quads, upper back, trunk', requires: 'bar' },
    ],
  },
];

/** What the engine picks when the athlete skips the card. Bodyweight, so nothing is gated on kit. */
export const ASSISTANCE_DEFAULTS: Record<AssistanceSlot, string> = {
  push: 'Push Up',
  pull: 'Pull Up',
  single_leg_core: 'Reverse Lunge',
};

/** The athlete's choices, as stored on `goals.training_prefs.assistance_picks`. */
export type AssistancePicks = Partial<Record<AssistanceSlot, string>>;

/**
 * Resolve the three movements for a block. An absent, empty or unrecognised pick falls back to the
 * default rather than failing — skipping the card must still produce a complete block, and a name
 * that is no longer on the menu (a later edit) must not strand an existing goal.
 */
/**
 * ⛔ THE BALANCE POOL IS DELETED. It was defect #1, and its own citation refutes it.
 *
 * It read:
 *
 *     push: ['Face Pull', 'Band Pull Apart', 'Rear Delt Fly', 'Chest Supported Row']
 *
 * **Four movements, and all four are pulls.** A press day's main lift is always a press, so the push
 * slot always collided on `sharesMovementFamily`, always fell through to this pool, and always
 * resolved to `Face Pull`. Bench and OHP days shipped two pulls and zero push, every time, by design.
 *
 * ⛔ **THE p.86 CITATION IT RESTED ON WAS READ TOO NARROWLY, AND THAT IS THE WHOLE STORY.** p.86 does
 * pair Bench->Chin-ups — but p.86 is not a one-movement template. It runs to p.88, where the same
 * template's worked example is:
 *
 *     Bench Press 5/3/1 -> Barbell Rows 5x10 -> 3 rounds of:
 *     Med Ball Slams · DIPS · Burpees · Chin-ups · Planks
 *
 * **Dips are on the bench day, in the exact template we quoted to prove they should not be.** p.87's
 * "Assistance Movements for Upper Body" list is push and pull throughout — bench, dips, press,
 * incline, DB presses, floor press, close grip, push-ups, push press, alongside chins and rows.
 * **There is no page in this book where a push slot becomes a pull.** Verified 2026-08-05.
 *
 * ⚠️ WHAT SURVIVES: the plane-complement half of Q-212 (p.86's horizontal push -> vertical pull) is
 * CORRECT and is kept, on the pull slot where it belongs. See `ROLE_BY_DAY` and `resolveRole`.
 *
 * ⚠️ AND EQUIPMENT IS STILL NOT GATED, deliberately and unchanged: `resolveAssistance` has never
 * filtered on `requires`, and bands have no flag to filter on at all (F-5 in
 * `docs/BUILDER-SWEEP-FINDINGS.md`). Gating resolution while the menu stays ungated is a half-rule.
 */

/** What a slot actually carries on a given day. Distinct from the storage KEY — see `AssistanceSlot`. */
type AssistanceRole = 'push' | 'pull' | 'single_leg' | 'core' | 'arm' | 'leg_match';

/**
 * ⛔ WHICH OF WENDLER'S ASSISTANCE TEMPLATES THIS BLOCK IS RUNNING. Added 2026-08-09; it is the
 * axis D-328/D-385 were both missing rather than a new taxonomy (`AssistanceRole` answers "what does this slot
 * carry today", this answers "under whose rules").
 *
 * `standard`   — Triumvirate p.48 / Periodization Bible p.50. The block's PURPOSE is strength; the
 *                athlete's endurance is their own business and is not what the assistance is being
 *                arranged around. The athlete's picks stand on the plane they chose.
 * `concurrent` — p.86-88, the chapter for an athlete whose conditioning is being programmed
 *                alongside. Presses take a complementary-plane pull, so the same movement does not
 *                land on all four lifting days.
 *
 * ⚠️ `concurrent` HAS NO PRODUCTION CALLER TODAY, and that is stated rather than hidden. It was the
 * only behaviour until this change; it is retained because a future concurrent or hypertrophy block
 * is the case it was written for, and deleting doctrine we sourced and then re-derive later is how
 * this codebase grows a second vocabulary. If a second block never arrives, delete the branch — do
 * not leave it here as scenery.
 */
export type AssistanceTemplate = 'standard' | 'concurrent';

/** Upper = the two pressing days (Bench, OHP). Lower = Squat and Deadlift. */
type AssistanceDayType = 'upper' | 'lower';

/**
 * ⛔ THE SLOT KEY IS STORAGE; THE ROLE IS WHAT THE DAY ACTUALLY NEEDS. This table is the §3 contract.
 *
 * **Upper days (Bench, OHP) — push · pull · core.** Every template that touches a pressing day keeps
 * a push on it and puts NO lower-body work there: Triumvirate p.48 (Press -> Dips + Chin-ups; Bench
 * -> DB Bench + DB Row), Periodization Bible pp.50-51 (both press days LEAD with "Shoulders or
 * Chest"), Bodyweight p.52 (Press -> Chins + Dips; Bench -> Chins + Pushups), concurrent p.87 (upper
 * assistance, upper assistance, Core Movement).
 *
 * ⛔ **Lower days (Squat, Deadlift) — LEG · LEG · CORE. NO PULL. Reversed 2026-08-09 (D-405), same
 * reframe as the upper days one page over.** They were pull · single-leg · core on this reasoning:
 *
 * > *"The four main lifts contain no row and no chin, so pulling volume has to live somewhere, and
 * > p.53 pairs 'the squat day with an assistance pulling movement.'"*
 *
 * That is true of the book as a whole and **not** of the template this block runs. p.51 is explicit
 * and it is two lines: **Deadlift day → hamstrings, quads, abs. Squat day → low back, quads, abs.**
 * No pull on either. The pulling volume lives on the two press days, where p.50 puts it ("Lats or
 * Upper Back" on both), and that is where the athlete's pull pick now runs.
 *
 * ⚠️ **AND IT FIXES A REAL DOSE PROBLEM THE UPPER-DAY CHANGE CREATED.** Turning off the plane swap
 * (D-404) left the athlete's pull pick standing on all four days — a beginner whose chin max is six
 * was getting **50 chins × 4 days = 200 a week** of one movement, because the rep scaler's floor is
 * 50 and it only scales UP. Two days halves it to 100. That number is not a coincidence: 100 reps a
 * week of one movement is the exact complaint D-328 was written to solve.
 *
 * ⛔ **DO NOT ADD A PULL BACK HERE TO 'BALANCE' THE 3-DAY SHAPE — see Q-269.** On 3 days bench and
 * press share a day, so the block pulls ONCE a week, and that is Wendler's own 3-day rotation
 * (p.76), whose instruction is that assistance stays the same. Verified 2026-08-09; a rep-count
 * table showing 50 against the 4-day's 100 is the thing that makes this look like a hole.
 *
 * **The two leg slots are the main lift's own family and its opposite**, which is how p.51's two
 * lines resolve: squat (knee) → low back (hip) + quads (knee); deadlift (hip) → hamstrings (hip) +
 * quads (knee). Abs are a lower-day slot in every template (p.51; p.55 "Hamstrings, Lower Back,
 * Abs"; p.48 Deadlift -> Hanging Leg Raise; p.52 Leg Raises / Sit-ups).
 *
 * ⛔ **THE UPPER-DAY THIRD SLOT IS ARMS, AND THIS REVERSED ON 2026-08-09 (D-404 supersedes D-385).**
 * It was CORE, on D-385's reasoning, which is kept verbatim because the reversal is about its premise
 * and not its logic:
 *
 * > *"Four of the five templates put TRICEPS / UPPER BACK in that position and keep abs on the lower
 * > days. The one source for a core movement on a press day is the concurrent chapter, p.87 — the
 * > chapter written for an athlete who lifts and conditions, which is ours. We take p.87 over the
 * > four powerlifting templates deliberately. Do not 'correct' this to triceps by citing p.51."*
 *
 * ⚠️ **AND THIS IS NOT THAT CORRECTION.** D-385 forbade re-deciding p.87-vs-p.51 on the merits, and
 * it was right to — nothing new has been learned about either page. What changed is **which chapter
 * governs**. D-385's warrant is the clause *"which is ours"*: it read this athlete as the concurrent
 * case, so the concurrent chapter won. A **strength-purpose block is not the concurrent case.** The
 * athlete chose to point a stretch at strength; their running is their own business and is not what
 * the assistance is being arranged around. Under that premise p.50-51 governs and p.87 does not,
 * and p.50-51 is explicit — press day and bench day both close on **triceps**, abs live on the two
 * lower days. Different premise, different answer; the merits were never re-litigated.
 *
 * ⚠️ **ABS ARE NOT LOST — they were never only here.** `lower` re-roles the push key to core, so
 * squat day and deadlift day each carry a core movement. Twice a week, which is what p.51 itself
 * prescribes.
 *
 * ⛔ **AND IT IS A SWAP, NOT A FOURTH SLOT.** p.50-51 puts triceps INSIDE the day's three, not
 * beside them. A fourth accessory would add volume to a block whose whole reframe is that strength
 * is preserved under high cardio and size is not — so it chases strength and buys no pump volume.
 * Three slots stay three, and the storage keys never move.
 *
 * ⚠️ WHY THE KEYS MAP THIS WAY: `pull` is always the pull, so that pick is never wasted.
 * `single_leg_core` is single-leg on leg days and core on press days — literally what its name says.
 * `push` is the push on press days, and on leg days it takes the leftover role (core), because a
 * push pick has nothing to say about a squat day.
 */
const ROLE_BY_DAY: Record<AssistanceDayType, Record<AssistanceSlot, AssistanceRole>> = {
  upper: { push: 'push', pull: 'pull', single_leg_core: 'arm' },
  lower: { push: 'core', pull: 'leg_match', single_leg_core: 'single_leg' },
};

/** Which kind of day this main lift makes. `null` → unknown, and unknown degrades to unchanged (§0h). */
function dayTypeOf(mainLiftName: string | null | undefined): AssistanceDayType | null {
  const fam = mainLiftName ? getMovementFamily(mainLiftName) : null;
  if (fam === 'push' || fam === 'pull') return 'upper';
  if (fam === 'knee' || fam === 'hip') return 'lower';
  return null;
}

export type ResolvedAssistance = {
  slot: AssistanceSlot;
  name: string;
  totalReps: number;
  /**
   * The athlete's pick, present ONLY when it collided with the day's main lift and was replaced.
   * ⛔ §5.2b — never subtract silently. This is what lets the copy NAME the pick instead of
   * quietly showing something else, which would read as the app ignoring their choice.
   */
  substitutedFor?: string;
  /**
   * The athlete's pick, present when it did NOT collide but sat on the wrong side of the plane —
   * a chin-up on a press day. A different reason from `substitutedFor`, and the copy says so.
   */
  balancedFor?: string;
};

/**
 * Resolve the three movements for a session. An absent, empty or unrecognised pick falls back to the
 * default rather than failing — skipping the card must still produce a complete block, and a name
 * that is no longer on the menu (a later edit) must not strand an existing goal.
 *
 * ⛔ `mainLiftName` MAKES THE SLOTS DAY-DEPENDENT (Q-212). The pick stands wherever it fits; on a
 * day whose main lift already loads the same pattern, the slot takes balancing work instead. Absent
 * → every pick stands, which is the pre-Q-212 behaviour exactly, so any caller that does not know
 * its main lift is unchanged rather than silently degraded (§0h).
 */
export function resolveAssistance(
  picks: AssistancePicks | null | undefined,
  mainLiftName?: string | null,
  /**
   * ⛔ DEFAULTS TO `standard`, and the default is the decision — not a convenience. Every block that
   * reaches this resolver today is a strength-purpose block (`strength-primary-plan.ts` is the sole
   * production caller). Defaulting to `concurrent` to "preserve behaviour" would keep the wrong
   * template as the thing you get by forgetting, which is how the old rule reached every day of
   * every block in the first place.
   */
  template: AssistanceTemplate = 'standard',
): ResolvedAssistance[] {
  const dayType = dayTypeOf(mainLiftName);

  return ASSISTANCE_MENU.map((menu) => {
    const picked = String(picks?.[menu.slot] ?? '').trim();
    const valid = menu.options.some((o) => o.name.toLowerCase() === picked.toLowerCase());
    const name = valid
      ? menu.options.find((o) => o.name.toLowerCase() === picked.toLowerCase())!.name
      : ASSISTANCE_DEFAULTS[menu.slot];

    // No main lift, or one whose pattern we cannot read → every pick stands, exactly as before any
    // of this existed (§0h). Unknown degrades to UNCHANGED, never to a guess.
    if (!dayType || !mainLiftName) return { slot: menu.slot, name, totalReps: menu.totalReps };

    return resolveRole(ROLE_BY_DAY[dayType][menu.slot], menu, name, mainLiftName, valid, template);
  }).sort(orderForDay(dayType));
}

/**
 * ⛔ THE ROWS COME OUT IN THE ORDER THE SESSION IS RUN, NOT IN STORAGE-KEY ORDER.
 *
 * `ASSISTANCE_MENU` is ordered push · pull · single_leg_core because those are the storage keys. On a
 * LOWER day the push key carries core, so unsorted output read "Squat, Sit Up, Pull Up, Hip Thrust" —
 * abs immediately after the heaviest lift of the week, and legs last. Nothing was wrong with it; it
 * just is not how a lifter runs a session, and this block has to read as familiar to anyone who has
 * used Strong or Hevy.
 *
 * **Core is last on every day, in every template.** Periodization Bible p.51 (Deadlift → Hamstrings,
 * Quads, **Abs**; Squat → Low Back, Quads, **Abs**), Simplest Strength p.55 ("Hamstrings, Lower Back,
 * **Abs**"), Triumvirate p.48 (Deadlift → Good Morning, **Hanging Leg Raise**), concurrent p.88
 * (bench circuit ends on **Planks**, squat circuit ends on **Pikes**).
 *
 * On a lower day the leg work leads, which is p.88's squat circuit order (legs → chin-ups → pikes).
 */
function orderForDay(dayType: AssistanceDayType | null) {
  // ⚠️ `arm` RANKS WITH `core` — LAST. Same reason and the same page: p.50-51 closes the upper days
  // on triceps exactly as it closes the lower days on abs. The isolation movement is the last thing
  // in the session under every template.
  const RANK: Record<AssistanceRole, number> = { push: 0, single_leg: 0, pull: 1, leg_match: 1, core: 2, arm: 2 };
  return (a: ResolvedAssistance, b: ResolvedAssistance) => {
    if (!dayType) return 0; // Unknown day → untouched, same as everything else on this path (§0h).
    return RANK[ROLE_BY_DAY[dayType][a.slot]] - RANK[ROLE_BY_DAY[dayType][b.slot]];
  };
}

/** Does this movement belong to the family the role demands? */
function fitsRole(role: AssistanceRole, name: string, mainLiftName: string): boolean {
  const fam = getMovementFamily(name);
  switch (role) {
    case 'push': return fam === 'push';
    case 'pull': return fam === 'pull';
    case 'core': return fam === 'core';
    // ⛔ `arm` DOES NOT READ THE FAMILY, and it cannot. A triceps pushdown's family is `push` — the
    // same answer a bench press gives — because that is the truth on the COLLISION axis. The arm
    // role asks a different question, so it reads the flag built for it (`isDirectArm`). Testing
    // `fam === 'push'` here would let a compound press fill the arm slot and a pushdown fill the
    // push slot, and a press day would ship three pressing movements and no isolation.
    case 'arm': return isDirectArm(name);
    // ⛔ THE MAIN LIFT'S OWN LEG FAMILY — the mirror of `single_leg`, not a duplicate of it. p.51
    // gives each lower day TWO leg movements, and they are the two families: squat (knee) → low
    // back (hip) + quads (knee); deadlift (hip) → hamstrings (hip) + quads (knee). `single_leg`
    // takes the opposite family, this one takes the main lift's own, and together they are p.51's
    // line. Reading the family of the MAIN LIFT (not a fixed value) is what makes the two lower
    // days differ from each other by construction, the same way `single_leg` does.
    case 'leg_match': return fam != null && fam === getMovementFamily(mainLiftName);
    // The leg role is defined RELATIVE to the day: squat (knee) wants a hinge, deadlift (hip) wants
    // a knee. That is what makes the two lower days differ from each other by construction.
    case 'single_leg': return fam === wantedLegFamily(mainLiftName);
  }
}

/** Squat day hinges, deadlift day bends the knee. p.53: "the deadlift with a squatting exercise". */
function wantedLegFamily(mainLiftName: string): 'knee' | 'hip' {
  return getMovementFamily(mainLiftName) === 'knee' ? 'hip' : 'knee';
}

/**
 * Fill one slot for one day.
 *
 * ⛔ THE ORDER MATTERS: **the pick is honoured unless it cannot be.** A substitution is a cost — it
 * shows the athlete something other than what they chose — so it is spent only when the role
 * genuinely cannot accept the pick. Three outcomes, and the copy distinguishes all three (§5.2b):
 *
 *   pick stands              → no annotation
 *   pick was the WRONG PLANE → `balancedFor`   (p.86, pull slot only)
 *   pick was the WRONG ROLE  → `substitutedFor` (a lunge on a bench day, a push on a squat day)
 */
function resolveRole(
  role: AssistanceRole,
  menu: AssistanceSlotMenu,
  name: string,
  mainLiftName: string,
  /**
   * ⛔ DID THE ATHLETE ACTUALLY CHOOSE THIS, or is it `ASSISTANCE_DEFAULTS`? The annotations exist so
   * a real choice is visibly READ rather than silently overridden (§5.2b). Attaching one to a value
   * the athlete never entered produces *"You picked Push Up"* on a squat day for someone who skipped
   * the card entirely — the app inventing a preference and then apologising for not honouring it.
   *
   * ⚠️ THIS MATTERS MORE AFTER THIS REWORK THAN BEFORE IT. Under the old rule substitutions were
   * occasional; under day-type roles the push slot is re-roled on EVERY lower day, so the default
   * path would have carried a false "you picked" note on half the block's sessions.
   */
  wasAthletePick: boolean,
  template: AssistanceTemplate,
): ResolvedAssistance {
  const base = { slot: menu.slot, totalReps: menu.totalReps };
  /** Annotate a real choice; stay silent about a default. Never a target, never an apology. */
  const note = <K extends 'substitutedFor' | 'balancedFor'>(k: K, from: string) =>
    (wasAthletePick ? { [k]: from } : {}) as Partial<Record<K, string>>;

  if (fitsRole(role, name, mainLiftName)) {
    // ⛔ THE PICK FITS — BUT ON THE PULL SLOT IT CAN STILL BE THE WRONG SIDE OF THE PLANE (p.86).
    //
    // A chin-up does not collide with an overhead press: one pulls, one pushes. So role-fit alone
    // leaves it alone, and the athlete gets chin-ups on all four lifting days — 100 reps a week of
    // one movement for someone whose clean max is six. p.86 is the one template that crosses, and it
    // is the concurrent chapter, which is our athlete:
    //   Bench (horizontal push) -> Chin-ups       (vertical pull)
    //   Press (vertical push)   -> Bent Over Rows (horizontal pull)
    //
    // ⛔ SCOPED TO THE PULL SLOT ON PURPOSE. Applying it to the push slot is what produced defect #1
    // — the complement of a press is a PULL, so a "balance the plane" rule on the push slot deletes
    // the push. Four of Wendler's five templates deliberately put a SAME-family movement on the main
    // lift's day (bench then 5x10 bench, press then dips); that is the hypertrophy dose, and the push
    // slot is where it lives.
    //
    // ⚠️ ONLY WHEN THE SLOT ACTUALLY OFFERS THE COMPLEMENT. The pull slot carries both planes already
    // (Pull Up / Chin Up vertical; Inverted Row / Dumbbell Row / Face Pull horizontal). Where nothing
    // in the complementary plane exists, the pick stands — a preference is not overridden to satisfy
    // a rule that has no answer.
    //
    // ⛔ AND IT IS THE CONCURRENT TEMPLATE'S RULE, SO IT RUNS ONLY UNDER THAT TEMPLATE (2026-08-09).
    // Everything above this line is p.86-88 reasoning, and p.86-88 is the CONCURRENT chapter. The
    // paragraph above says so in as many words — *"the concurrent chapter, which is our athlete"* —
    // and that premise is what changed: a strength-purpose block is a strength-purpose block, and
    // the standard templates (p.48 / p.50) do not cross planes. Under `standard` the athlete keeps
    // chins on the press day and the 25-100 scaler is what makes the rep count survivable, which is
    // the mechanism that was ALREADY handling the "clean max is six" problem this rule was reaching
    // for. ⚠️ The ROLE rules below are template-independent and are untouched — a lunge still does
    // not belong on a bench day under either template.
    if (role === 'pull' && template === 'concurrent') {
      const want = complementFor(mainLiftName);
      if (want && (getExerciseConfig(name)?.pattern ?? null) !== want) {
        const better = menu.options.find((o) => getExerciseConfig(o.name)?.pattern === want);
        if (better && better.name !== name) return { ...base, name: better.name, ...note('balancedFor', name) };
      }
    }
    return { ...base, name };
  }

  // ⛔ THE SLOT'S OWN MENU FIRST — the athlete stays inside the list they chose from wherever the
  // list can answer. `ROLE_FALLBACK` is only for the case where it cannot: the push slot holds no
  // core movement, so a squat day's core role has to come from somewhere.
  const fromMenu = menu.options.find((o) => fitsRole(role, o.name, mainLiftName));
  const replacement = fromMenu?.name ?? ROLE_FALLBACK[role].find((n) => fitsRole(role, n, mainLiftName));

  // Nothing anywhere fits → keep the pick rather than invent one. Showing the athlete's own choice
  // is better than showing a movement no rule chose.
  if (!replacement) return { ...base, name };
  return { ...base, name: replacement, ...note('substitutedFor', name) };
}

/**
 * What a role reaches for when the slot's own menu has no answer.
 *
 * ⛔ THIS IS NOT THE OLD `BALANCE_POOL`. That pool answered "the day pressed, so give me a pull" and
 * was wrong at the premise. This one answers "this slot must carry a core movement today and its own
 * list is all pushes" — a completeness backstop, not a balancing rule. Every entry resolves exactly
 * in `exercise-config` and is on Wendler's own lists (core: p.51 "Sit-ups, Hanging Leg Raises, Ab
 * Wheel"; legs: p.87's lower-body assistance list).
 */
const ROLE_FALLBACK: Record<AssistanceRole, string[]> = {
  // Bodyweight first — the core slot is reached on every upper day and must never need equipment.
  core: ['Sit Up', 'Ab Wheel Rollout', 'Hanging Leg Raise', 'Plank'],
  single_leg: ['Reverse Lunge', 'Bulgarian Split Squat', 'Single Leg Hip Thrust', 'Front Squat'],
  push: ['Push Up', 'Dips', 'Dumbbell Bench Press', 'Incline Bench Press'],
  pull: ['Inverted Row', 'Dumbbell Row', 'Face Pull', 'Chin Up'],
  // ⛔ BOTH FAMILIES, and within the HIP family the NON-HINGE leads. `fitsRole` filters this list by
  // the day's wanted family, so it must answer for a knee day AND a hip day — a single-family list
  // would silently strand one of the two lower days. The hip entries only ever fire on DEADLIFT day
  // (squat day's leg_match wants a knee move), and the deadlift IS the hinge — so the book's
  // deadlift-day Hamstrings work is Leg Curl / Glute-Ham Raise (p.50), NOT a second loaded hinge.
  // Leg Curl therefore leads; a loaded hinge (RDL, Good Morning) is only reached if it cannot resolve.
  // Equipment is handled downstream: materialize-plan's substituteExerciseForEquipment turns Leg Curl
  // into Nordic / Band Leg Curls when there is no machine, so leading with it strands no one.
  leg_match: ['Leg Curl', 'Romanian Deadlift', 'Good Morning', 'Back Extension', 'Hip Thrust',
    'Reverse Lunge', 'Bulgarian Split Squat', 'Front Squat'],
  // Bodyweight first, same rule as `core` — the arm slot is reached on EVERY upper day, so its
  // fallback must never need a cable stack. All four are on p.50's triceps list.
  // ⛔ TRICEPS FIRST — THE ORDER IS THE DEFAULT. `resolveRole` takes the first entry that fits, so an
  // athlete who never touches the swap sheet gets `Diamond Push Up`: bodyweight, no equipment, and
  // triceps is the arm this block does not otherwise train directly (the pull slot already loads
  // biceps — a chin-up is elbow flexion under load).
  // ⚠️ THE CURLS LIVE HERE NOW because they were removed from the `single_leg_core` menu. A movement
  // on no menu and in no pool is unreachable — no pick, no swap, gone.
  arm: ['Diamond Push Up', 'Tricep Pushdown', 'Tricep Extension', 'Close Grip Bench Press',
    'Dumbbell Curl', 'Hammer Curl'],
};

/**
 * The line that says a pick was replaced, and why. ⛔ Returns null when nothing was substituted —
 * omitted entirely rather than printed as a no-op, the same rule the ceiling paragraph follows.
 *
 * ⚠️ IT NAMES THE PICK. *"Something else is here"* is worse than nothing: the athlete needs to see
 * their choice was READ, not overridden blind. That is the difference between a substitution and an
 * override, and it is the whole reason the line exists (§5.2b).
 */
/**
 * Why this slot shows something other than the pick. Reads the RESOLVED movement, so the sentence
 * cannot drift from what the row actually contains.
 *
 * ⛔ FACT-FIRST, NO IMPERATIVE, AND IT NAMES THE CONSEQUENCE RATHER THAN INSTRUCTING. Same voice as
 * the rest of the block: state what the day does and what that costs, and let the athlete draw the
 * conclusion.
 */
function substitutionReason(r: ResolvedAssistance, mainLiftName: string): string {
  const fam = getMovementFamily(r.name);
  const wasLeg = getMovementFamily(r.substitutedFor ?? '') === 'knee'
    || getMovementFamily(r.substitutedFor ?? '') === 'hip';

  // ⛔ ARM IS TESTED FIRST AND BY FLAG, because its FAMILY IS `push` — a triceps movement would
  // otherwise fall past every branch below and land on the generic sentence. Same reason `fitsRole`
  // cannot read the family for this role. Added 2026-08-09 with D-404.
  if (isDirectArm(r.name)) {
    if (wasLeg) {
      // A leg pick on a press day — defect #2's case, now landing on arms instead of abs.
      return `leg work stays on squat and deadlift days, so ${r.name} here.`;
    }
    // ⚠️ NAMES THE ARM IT ACTUALLY LANDED ON rather than asserting "triceps". The substitution path
    // reaches triceps today because they lead the menu, but the sentence must not be a second copy
    // of that ordering — the whole contract of this function is that it reads the RESOLVED movement.
    const arm = fam === 'pull' ? 'biceps' : 'triceps';
    return `press days finish on ${arm}, and abs stay on the squat and deadlift days — ${r.name} here.`;
  }
  // A leg movement landing on a press day. This is defect #2, and the reason is the running.
  if (fam === 'core' && wasLeg) return `leg work stays on squat and deadlift days, so ${r.name} here.`;
  // A push pick on a squat or deadlift day. No Wendler template presses on a lower day.
  if (fam === 'core') return `${mainLiftName} days finish on the trunk, not more pressing — ${r.name} here.`;
  // The leg slots on a lower day. ⛔ TWO CASES NOW, AND THEY NEED DIFFERENT SENTENCES (D-405): the
  // slot that takes the OPPOSITE family, and the one that takes the main lift's OWN. Before the pull
  // came off the leg days there was only one, so the single "the opposite one" line was safe; said
  // about a same-family movement it would be flatly untrue.
  if (fam === 'knee' || fam === 'hip') {
    if (fam === getMovementFamily(mainLiftName)) {
      return `${mainLiftName} days carry legs and abs, not pulling — ${r.name} here, working what ` +
        `the day already trains.`;
    }
    return `${mainLiftName} already loads that pattern, so ${r.name} here — the opposite one, which ` +
      `also keeps the two lifting days from repeating.`;
  }
  return `${mainLiftName} days do not carry that movement, so ${r.name} here.`;
}

export function assistanceSubstitutionNote(
  rows: ResolvedAssistance[],
  mainLiftName: string,
): string | null {
  const lines: string[] = [];
  for (const r of rows) {
    if (r.substitutedFor) {
      // ⛔ THE OLD LINE SAID "it lands on the same muscles as the main lift, so this slot balances
      // instead" — which was the DEFECT describing itself, and it was false besides. A substitution
      // now only ever happens because the pick is the wrong ROLE for the day, and there are exactly
      // three ways that occurs. Name the actual reason; a generic sentence here is how the athlete
      // learns to distrust the ones that ARE specific.
      lines.push(`You picked ${r.substitutedFor} — ${substitutionReason(r, mainLiftName)}`);
    } else if (r.balancedFor) {
      // Not a clash — a plane. p86: a vertical push is balanced by a horizontal pull, not by another
      // vertical movement.
      // ⚠️ SHORTENED 2026-08-05. The trailing sentence ("Opposite direction and opposite plane is the
      // pairing that balances it") explained the rule a second time, and these notes now stack — a
      // day can carry two. The row already shows the movement; one clause of reason is the budget.
      lines.push(
        `You picked ${r.balancedFor} — ${mainLiftName} works the same plane, so ${r.name} here instead.`);
    }
  }
  return lines.length ? lines.join(' ') : null;
}

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

/**
 * ⛔ THE SWAP OPTIONS FOR AN ASSISTANCE ROW ARE THE PLAN'S OWN, NOT THE EXERCISE LIBRARY'S.
 *
 * Michael, 2026-07-30: *"we need to work with the framework of the plan."*
 *
 * The generic swap sheet reasons about MOVEMENT PATTERN across all ~300 config entries, which is the
 * right question for a main lift and the wrong one here. This block does not prescribe "a hip-hinge
 * accessory" — it prescribes one of THREE SLOTS, each with a curated shortlist the athlete already
 * chose from at build time. Offering something off that shortlist offers a movement the block never
 * considered, at a rep total the slot was never scaled for.
 *
 * So the peers for an assistance row are the OTHER OPTIONS IN ITS OWN SLOT. Nothing new is invented
 * here — this is the same list `ASSISTANCE_MENU` already shows in the build flow, read back.
 *
 * ⚠️ THE BALANCE POOL COUNTS TOO. When the athlete's pick collides with the day's main lift, the slot
 * carries a balancing movement instead (Q-212) — a Face Pull on a press day is on no menu. Its peers
 * are the rest of that pool, for the same reason: it is what the block reaches for in that situation.
 *
 * ⚠️ EQUIPMENT IS NOT FILTERED, deliberately and consistently. `resolveAssistance` has never gated on
 * `requires`, and bands have no flag to gate on at all. Gating the swap sheet while the menu that
 * produced the row stays ungated would be a half-rule that hides options the builder itself offered.
 *
 * @returns the peer movements, or `null` when this exercise is not part of the assistance framework
 *   at all — in which case the caller keeps its own pattern-based logic. Null means "not mine",
 *   never "none available".
 */
export function assistancePeersFor(
  exerciseName: string,
  /**
   * ⛔ THE DAY'S MAIN LIFT — what makes this list SMART rather than merely correct.
   *
   * The block never offers a slot's raw menu. It checks the day first: on a bench day the push slot
   * PULLS instead, on a squat day the single-leg slot HINGES (Q-212, Wendler p86 — the concurrent
   * template is the one that crosses planes, and it is the one our athlete is running). A swap sheet
   * that ignored this would hand back a Push Up on a bench day — precisely the option the builder
   * would have replaced, offered as though the plan endorsed it.
   *
   * Absent → every option stands, which is the pre-Q-212 behaviour and the honest answer when the
   * caller does not know the day's lift (§0h: unknown degrades to unchanged, never to a guess).
   */
  mainLiftName?: string | null,
): string[] | null {
  const want = String(exerciseName || '').trim().toLowerCase();
  if (!want) return null;

  let peers: string[] | null = null;
  for (const menu of ASSISTANCE_MENU) {
    if (menu.options.some((o) => o.name.toLowerCase() === want)) {
      peers = menu.options.filter((o) => o.name.toLowerCase() !== want).map((o) => o.name);
      break;
    }
  }
  // A movement that came from a role fallback rather than from a slot menu — its peers are the rest
  // of that fallback list, for the same reason: it is what the block reaches for in that situation.
  if (!peers) {
    for (const pool of Object.values(ROLE_FALLBACK)) {
      if (pool.some((n) => n.toLowerCase() === want)) {
        peers = pool.filter((n) => n.toLowerCase() !== want);
        break;
      }
    }
  }
  if (!peers) return null;

  const main = String(mainLiftName || '').trim();
  const dayType = dayTypeOf(main);
  if (!main || !dayType) return peers;

  // ⛔ OFFER WHAT THE DAY'S ROLE ACTUALLY ACCEPTS — the same question `resolveAssistance` asks, via
  // the same function, not a second reading of it.
  //
  // ⚠️ THIS USED TO FILTER ON `sharesMovementFamily`, i.e. "drop anything the day already loaded",
  // and on a bench day that dropped every push — so the swap sheet for a push row offered pulls, the
  // same defect the composer had. The question is not "did the day load this family" but "does this
  // day's role for this slot accept this movement."
  const slot = ASSISTANCE_MENU.find((m) => m.options.some((o) => o.name.toLowerCase() === want))?.slot;
  const role: AssistanceRole | null = slot ? ROLE_BY_DAY[dayType][slot] : null;
  let usable = role ? peers.filter((n) => fitsRole(role, n, main)) : peers;

  // The slot's own list cannot answer this day's role (the push slot holds no core movement, and on a
  // squat day that is what it needs). Reach for the same fallback the composer would.
  if (usable.length === 0 && role) {
    usable = ROLE_FALLBACK[role].filter((n) => n.toLowerCase() !== want && fitsRole(role, n, main));
  }

  // ⚠️ NEVER HAND BACK NOTHING. If no rule can find a clean option, show the slot's own list rather
  // than an empty sheet — the athlete asked to swap, and refusing silently is worse than offering
  // something the day already works. Same instinct as `resolveAssistance` keeping the pick.
  if (usable.length === 0) return peers;

  // ⛔ THE COMPLEMENT LEADS, it does not exclude. The composer PICKS the complementary plane; a swap
  // sheet is the athlete choosing, so the plan's preference sets the ORDER and they still see the rest.
  const want2 = complementFor(main);
  if (!want2) return usable;
  return [
    ...usable.filter((n) => getExerciseConfig(n)?.pattern === want2),
    ...usable.filter((n) => getExerciseConfig(n)?.pattern !== want2),
  ];
}
