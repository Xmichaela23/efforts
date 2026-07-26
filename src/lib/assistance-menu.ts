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
 * ⚠️ This is why `ratio` and `primaryRef` in `exercise-config.ts` are IRRELEVANT here even for the
 * loaded options. Two of them are known-wrong (`Single Leg Hip Thrust` carries the two-legged 0.9×
 * deadlift ratio; `Dumbbell Overhead Press` resolves to the barbell entry). Neither can hurt anyone
 * through this menu, because nothing on this menu is ever priced. Do not "fix" this by deriving a
 * weight — the absence is the design.
 *
 * What the athlete may record afterwards is a different question: an optional note of what they
 * actually grabbed, so next week they remember. That is a log, not a prescription.
 */

/** The three slots Wendler's assistance prescription defines. These are also the Adjust-tab holes —
 *  a glute focus loads `single_leg_core`, a pull-up focus loads `pull`. An add-on REPLACES the
 *  athlete's pick in a slot; it never adds a fourth. */
export type AssistanceSlot = 'push' | 'pull' | 'single_leg_core';

export type AssistanceOption = {
  /** ⛔ Must be a name `getExerciseConfig()` resolves. An unresolved name is the D-322 bug class. */
  name: string;
  /** What it works, in the athlete's words. Shown beside the option so the choice is informed. */
  targets: string;
  /** Equipment the movement needs. `null` = bodyweight, always available. */
  requires: 'dumbbells' | 'bar' | 'bench' | null;
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

export const ASSISTANCE_MENU: AssistanceSlotMenu[] = [
  {
    slot: 'push',
    label: 'Push',
    purpose: 'Chest, shoulders and triceps. Bodyweight or dumbbells keep the nervous-system cost low.',
    totalReps: 25,
    options: [
      { name: 'Push Up', targets: 'Chest, front shoulders, triceps', requires: null },
      { name: 'Dips', targets: 'Lower chest, triceps, front shoulders', requires: 'bar' },
      { name: 'Dumbbell Bench Press', targets: 'Chest, triceps, shoulder stability', requires: 'bench' },
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
    purpose: 'Upper back and lats — the balance against the heavy pressing in the main lifts.',
    totalReps: 25,
    options: [
      { name: 'Pull Up', targets: 'Lats, upper back, biceps', requires: 'bar' },
      { name: 'Chin Up', targets: 'Lats, biceps, upper back', requires: 'bar' },
      { name: 'Inverted Row', targets: 'Mid-back, rear shoulders, biceps', requires: 'bar' },
      { name: 'Dumbbell Row', targets: 'Mid-back, lats, biceps', requires: 'dumbbells' },
    ],
  },
  {
    slot: 'single_leg_core',
    label: 'Single-leg or core',
    purpose: 'One leg at a time, or the trunk. Balance and stability the barbell lifts do not train.',
    totalReps: 25,
    options: [
      { name: 'Reverse Lunge', targets: 'Quads, glutes, single-leg balance', requires: null },
      { name: 'Bulgarian Split Squat', targets: 'Quads, glutes, hip stability', requires: null },
      { name: 'Single Leg Hip Thrust', targets: 'Glutes, hamstrings, hip drive', requires: null },
      { name: 'Hanging Leg Raise', targets: 'Lower abs, hip flexors, grip', requires: 'bar' },
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
export function resolveAssistance(picks: AssistancePicks | null | undefined): Array<{
  slot: AssistanceSlot;
  name: string;
  totalReps: number;
}> {
  return ASSISTANCE_MENU.map((menu) => {
    const picked = String(picks?.[menu.slot] ?? '').trim();
    const valid = menu.options.some((o) => o.name.toLowerCase() === picked.toLowerCase());
    const name = valid
      ? menu.options.find((o) => o.name.toLowerCase() === picked.toLowerCase())!.name
      : ASSISTANCE_DEFAULTS[menu.slot];
    return { slot: menu.slot, name, totalReps: menu.totalReps };
  });
}

/**
 * The guidance that rides with the slots. States how to run 25 reps so they do not become a
 * bodybuilding session bolted onto a strength block.
 *
 * Kept as data, not baked into a component, because the composer puts it in the session description
 * and the build-flow card shows it too — the same sentence in two places, from one place.
 */
export const ASSISTANCE_GUIDANCE =
  'Break the 25 reps into easy sets, in whatever split works that day. Load is by feel — about a 7 out of 10, finishing as though a few more were there. Going to failure here costs the next main lift.';
