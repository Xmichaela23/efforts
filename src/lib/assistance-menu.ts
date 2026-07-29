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

// ⚠️ THE FIRST SIBLING IMPORT INSIDE `src/lib` THAT DENO MUST ALSO RESOLVE. Every other file
// here that an edge function pulls in is a leaf. The `.ts` extension is required for Deno and
// is resolved fine by Vite; both toolchains are checked (deno test + npm run build).
// It earns the edge: the collision rule and the menu it applies to are one claim, and
// splitting them would put the rule where the next person editing the menu cannot see it.
import { complementFor, getMovementFamily, sharesMovementFamily } from './exercise-config.ts';
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

/**
 * ⛔ 25 IS THE FLOOR AND IT STAYS. Decided 2026-07-28, Michael's call.
 *
 * It is not a picked number — it is the documented bottom of Wendler's published 25-50 range, with a
 * stated reason (Van Hooren: an endurance athlete keeps assistance volume low or builds size they
 * did not ask for). So the fix is not to replace it. **The fix is to derive POSITION WITHIN the
 * range**, which is the part that was never scaled to anything.
 *
 * ⚠️ AND THE DERIVATION IS UNEVEN ON PURPOSE. `pullupMaxReps` exists on `performance_numbers`; there
 * is no push or single-leg equivalent. Rather than wait for all three, each slot scales on whatever
 * it actually has and **the copy says which** — "scaled to your tested N reps" versus "the default
 * floor, no capacity on file". Same rule as everywhere else: cite the evidence you have, stay silent
 * where you do not. Adding a push capacity later upgrades one slot without touching the model.
 */
export const ASSISTANCE_TOTAL_REPS_FLOOR = 25;
export const ASSISTANCE_TOTAL_REPS_CEILING = 50;

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

  // Pull is the one slot with a tested capacity. A 25-rep session against an 8-rep max is a
  // different exercise from the same session against a 25-rep max.
  if (slot === 'pull' && typeof inputs?.pullupMaxReps === 'number' && inputs.pullupMaxReps > 0) {
    const cap = inputs.pullupMaxReps;
    // 8 reps sits at the floor; capacity above that walks toward the ceiling, three reps of session
    // volume per rep of capacity. Deliberately shallow — this is insurance.
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

export const ASSISTANCE_MENU: AssistanceSlotMenu[] = [
  {
    slot: 'push',
    label: 'Push',
    purpose: 'Chest, shoulders and triceps. Bodyweight or dumbbells keep the nervous-system cost low. On bench and press days this slot balances the pressing instead.',
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
    purpose: 'Upper back and lats — the balance against the heavy pressing in the main lifts. On a day whose main lift is itself a pull, this slot presses instead.',
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
    purpose: 'One leg at a time, or the trunk. Balance and stability the barbell lifts do not train. On squat days it hinges and on deadlift days it bends the knee, so it never repeats the day.',
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
/**
 * ⛔ THE BALANCE POOL (Q-212) — what a slot reaches for when the athlete's pick loads the same
 * thing the day's main lift already loaded.
 *
 * ⚠️ IT IS NOT A WEAKER VERSION OF THE SAME MOVEMENT. Michael: *"the press day is already
 * pushing-heavy and the balancing work is what's missing."* Reducing dips to 12 on a press day
 * still puts the same muscles under load; the answer is to stop pushing, not to push less.
 *
 * Ordered by availability — `Face Pull` first because a band or a cable is the commonest way to
 * own this movement. ⚠️ **Equipment is NOT gated here**, and that is inherited rather than
 * introduced: `resolveAssistance` has never filtered on `requires`, and bands specifically have no
 * flag at all to filter on (F-5 in `docs/BUILDER-SWEEP-FINDINGS.md`). Gating the pool while the
 * menu itself stays ungated would be a half-rule.
 */
const BALANCE_POOL: Record<'push' | 'pull' | 'knee' | 'hip', string[]> = {
  // The day pressed, so the slot pulls.
  push: ['Face Pull', 'Band Pull Apart', 'Rear Delt Fly', 'Chest Supported Row'],
  // The day pulled, so the slot presses.
  pull: ['Push Up', 'Dumbbell Bench Press'],
  // The day was knee-dominant, so the slot hinges — and the reverse. These two are each other's
  // answer, which is exactly why `MovementFamily` keeps `knee` and `hip` apart.
  knee: ['Single Leg Hip Thrust'],
  hip: ['Reverse Lunge', 'Bulgarian Split Squat'],
};

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
): ResolvedAssistance[] {
  const mainFamily = mainLiftName ? getMovementFamily(mainLiftName) : null;

  return ASSISTANCE_MENU.map((menu) => {
    const picked = String(picks?.[menu.slot] ?? '').trim();
    const valid = menu.options.some((o) => o.name.toLowerCase() === picked.toLowerCase());
    const name = valid
      ? menu.options.find((o) => o.name.toLowerCase() === picked.toLowerCase())!.name
      : ASSISTANCE_DEFAULTS[menu.slot];

    // No main lift at all → every pick stands, exactly as before this rule existed (§0h).
    if (!mainFamily || !mainLiftName) return { slot: menu.slot, name, totalReps: menu.totalReps };
    const collides = sharesMovementFamily(mainLiftName, name);

    // ⛔ NO CLASH — BUT THE SLOT CAN STILL BE THE WRONG SIDE OF THE PLANE (2026-07-28, p86).
    //
    // A chin-up does not COLLIDE with an overhead press: one pulls, one pushes, nothing is shared.
    // So the rule above leaves it alone and the athlete gets chin-ups on all four lifting days —
    // 100 reps a week of one movement for someone whose clean max is six.
    //
    // ⛔ THE CITATION IS p86 — THE CONCURRENT TEMPLATE — AND NOT THE ASSISTANCE CHAPTER. Checked
    // against all five of his templates: Boring But Big, the Triumvirate and the Periodization
    // Bible all put a SAME-PATTERN movement on the main lift's day on purpose (bench then 5x10
    // bench; press then dips; squat then leg press). That is the hypertrophy dose.
    //
    // ✅ p86 is the ONE that crosses, and it is the concurrent chapter — one assistance movement,
    // conditioning to follow, no room for volume, so the slot buys BALANCE instead:
    //   Bench (horizontal push) -> Chin-ups (vertical pull)
    //   Press (vertical push)   -> Bent Over Rows (horizontal pull)
    // That is our athlete exactly. The rule is right here and would be wrong in a general block.
    //
    // ⚠️ ONLY WHEN THE SLOT ACTUALLY OFFERS THE COMPLEMENT. The pull slot carries both planes
    // already (Pull Up / Chin Up are vertical; Inverted Row / Dumbbell Row are horizontal), so this
    // needs no new movements. Where a slot has nothing in the complementary plane, the pick stands —
    // a preference is not overridden to satisfy a rule that has no answer.
    if (!collides) {
      const want = complementFor(mainLiftName);
      const picked = getExerciseConfig(name)?.pattern ?? null;
      if (want && picked !== want) {
        const better = menu.options.find((o) => getExerciseConfig(o.name)?.pattern === want);
        if (better && better.name !== name) {
          return { slot: menu.slot, name: better.name, totalReps: menu.totalReps, balancedFor: name };
        }
      }
      return { slot: menu.slot, name, totalReps: menu.totalReps };
    }

    // ⛔ THE SLOT'S OWN MENU FIRST. On a deadlift day the single-leg slot already holds two
    // knee-dominant options, so the athlete stays inside the list they chose from. The pool is the
    // fallback for the case the pool was built for: every push option is itself a push.
    const fromMenu = menu.options.find((o) => !sharesMovementFamily(mainLiftName, o.name));
    const replacement = fromMenu?.name
      ?? (mainFamily === 'push' || mainFamily === 'pull' || mainFamily === 'knee' || mainFamily === 'hip'
        ? BALANCE_POOL[mainFamily].find((n) => !sharesMovementFamily(mainLiftName, n))
        : undefined);

    // Nothing non-colliding anywhere → keep the pick rather than invent one. Showing the athlete's
    // own choice is better than showing a movement no rule chose.
    if (!replacement) return { slot: menu.slot, name, totalReps: menu.totalReps };

    return { slot: menu.slot, name: replacement, totalReps: menu.totalReps, substitutedFor: name };
  });
}

/**
 * The line that says a pick was replaced, and why. ⛔ Returns null when nothing was substituted —
 * omitted entirely rather than printed as a no-op, the same rule the ceiling paragraph follows.
 *
 * ⚠️ IT NAMES THE PICK. *"Something else is here"* is worse than nothing: the athlete needs to see
 * their choice was READ, not overridden blind. That is the difference between a substitution and an
 * override, and it is the whole reason the line exists (§5.2b).
 */
export function assistanceSubstitutionNote(
  rows: ResolvedAssistance[],
  mainLiftName: string,
): string | null {
  const lines: string[] = [];
  for (const r of rows) {
    if (r.substitutedFor) {
      lines.push(
        `You picked ${r.substitutedFor} — on ${mainLiftName} days it lands on the same muscles as the ` +
        `main lift, so this slot balances instead.`);
    } else if (r.balancedFor) {
      // Not a clash — a plane. p86: a vertical push is balanced by a horizontal pull, not by another
      // vertical movement.
      lines.push(
        `You picked ${r.balancedFor} — ${mainLiftName} works the same plane, so this slot uses ` +
        `${r.name} instead. Opposite direction and opposite plane is the pairing that balances it.`);
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
export const ASSISTANCE_GUIDANCE =
  'Break the 25 reps into easy sets, in whatever split works that day. Load is by feel — about a 7 out of 10, finishing as though a few more were there. Going to failure here costs the next main lift.';
