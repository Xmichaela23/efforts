/**
 * HOW LONG THE REST TIMER RUNS, per movement and rep count.
 *
 *   Extracted from `StrengthLogger.tsx` (2026-08-03) for the reason every other extraction in this
 *   app happened: a function living inside a 6,000-line component cannot be unit-run, so the rest
 *   length was never asserted anywhere. Same move as `strength-row-text.ts` and
 *   `strength-logging-mode.ts` — see their headers for the precedent (D-259).
 *
 * ⛔ THE MAIN-LIFT TEST IS THE SHARED ONE NOW, AND KILLING THE PRIVATE COPY IS THE POINT.
 * `StrengthLogger` carried its own `isMainCompound`:
 *
 *     /squat|deadlift|bench|overhead|ohp/.test(n) && !/goblet|bulgarian|split|romanian|sumo|stiff|jump/.test(n)
 *
 * — the SEVENTH private exercise classifier in the codebase (audit F5 counted six). It disagreed with
 * `MAIN_531_LIFTS` at the edges, and the disagreements were not cosmetic: **Push Press and Military
 * Press matched none of those words**, so two of the app's own main lifts rested like accessories —
 * 90 seconds instead of three minutes. It also excluded `sumo` outright, so a Sumo Deadlift, which
 * IS in the main-lift set, took accessory rest.
 *
 * ⚠️ AND IT CUTS THE OTHER WAY TOO. `/bench/` matched DB, incline and decline bench presses, which
 * are assistance in 5/3/1 and now take assistance rest. That is the classifier being right, not a
 * regression — but it is a visible change and it is listed in the fixtures.
 *
 * ⚠️ THE PLYO TEST IS STILL A PRIVATE REGEX and is transcribed here BYTE-FOR-BYTE rather than moved
 * onto the type axis. Deliberate scope line: `typeForExercise` would answer `loaded_accessory` for
 * "Explosive Step Up", which the regex currently calls plyometric, and changing that is a second
 * behaviour change nobody asked for. It is the eighth private list and it is still open — but it now
 * has ONE home instead of two, since the component imports it from here.
 */
import { isMain531Lift } from './exercise-role.ts';
import { REST_BETWEEN_SETS_RULE, REST_BETWEEN_SETS_RULE_HYP } from '@shared/strength-grid/intents.ts';

/**
 * Plyometric / explosive movement — needs full neural recovery between sets.
 * ⚠️ Transcribed unchanged from `StrengthLogger.tsx`. See the header for why it is not the type axis.
 */
export const isPlyometricMovement = (exerciseName: string): boolean => {
  const name = String(exerciseName || '').toLowerCase();
  // ⛔ `skip|shuffle|ladder drill|stiff legged run` ADDED 2026-08-24 for Viada's named drills (p227).
  // His own rule for them is *"ample rest"* and stopping on movement quality, so a skip that routed
  // to the 90-second default was being rested like an accessory. Mirrors `equipmentForExercise` and
  // `isBodyweightMove`, extended in the same change.
  // ⚠️ THIS ONE ONLY LOWERCASES — hyphens survive, so the stems are spelt with them.
  return /jump|bound|hop|box jump|bench jump|broad jump|depth jump|squat jump|tuck jump|split jump|plyo|skip|shuffle|ladder drill|stiff-legged|explosive/.test(name);
};

/**
 * ⛔ THE HEAVY MAIN-LIFT REST IS 3 MINUTES (2026-08-03, raised from 150s).
 *
 * Three minutes is the strength standard for near-maximal work: the NSCA prescribes 2-5 min between
 * sets for strength/power, and the phosphagen system — which fuels a set of 3-5 — is only ~85%
 * resynthesised at two minutes and effectively complete around three. 150s sat below the band's
 * midpoint for the heaviest sets in the block, which is the one place under-resting costs reps on the
 * NEXT set, and in 5/3/1 the next set is the one being measured.
 *
 * ⚠️ ONLY THE 3-5 REP MAIN CASE MOVES. The 6-8 band stays 120s (a rep range that is not near-maximal),
 * plyometrics stay 150s, and every accessory band is untouched.
 */
export const HEAVY_MAIN_REST_SEC = 180;

/**
 * ⛔⛔ WHAT THE SLOT IS, NOT JUST WHAT THE MOVEMENT IS (2026-08-27).
 *
 * ⚠️ THE DEFECT: this function saw a name and a rep count and nothing else, so the standing plan's
 * own vocabulary was invisible to it. **A max-effort pull-up rested 90 seconds** — a pull-up is not
 * on `MAIN_531_LIFTS`, so at 1-5 reps it fell past every accessory band to the catch-all — while a
 * max-effort bench on the same day rested three minutes. **And a speed bench at 2-4 reps took
 * 120-180s**, which is the heavy answer on the one slot whose whole point is that it is not heavy.
 *
 * ⛔ AND NOW THERE IS A SOURCE FOR IT, WHICH THERE WAS NOT BEFORE. Viada p78, section "Rest
 * Periods" — read off the page 2026-08-27, and the reason this could be built at all. The app had
 * previously SHIPPED A CONSTANT ASSERTING THE BOOK GIVES NO REST GUIDANCE; it does, and the rule is
 * {@link REST_BETWEEN_SETS_RULE}. p84 states the opposite for hypertrophy and is
 * {@link REST_BETWEEN_SETS_RULE_HYP}. Both are imported, never restated here.
 *
 * ⛔⛔ HE GIVES NO MINUTES. NOT ON p78, NOT ANYWHERE. His rule is a readiness condition — rest to
 * nearly full recovery, do not cool down, go when you know you can finish the set — and a countdown
 * is our stand-in for a judgement the athlete makes. **Every number in {@link REST_BY_SLOT} is
 * OURS**, and `REST_MINUTES_ARE_OURS` says so on the screen that shows them.
 */
export type RestBucket = 'heavy' | 'speed' | 'muscle';

/**
 * ⛔ FOUR INTENTS, THREE BUCKETS — Michael's call, 2026-08-27. `SKILL` rides with `DE` because p218
 * gives both the same fatigue instruction (*"fatigue is discouraged"*, *"ample rest"*) at loads well
 * under maximal; they differ in what the athlete is practising, not in what recovery the set needs.
 * `ME` is its own bucket at the top and `HYP` is the one p84 carves out at the bottom.
 */
export function restBucketForIntent(intent: string | null | undefined): RestBucket | null {
  switch (String(intent ?? '').toUpperCase()) {
    case 'ME': return 'heavy';
    case 'DE': case 'SKILL': return 'speed';
    case 'HYP': return 'muscle';
    default: return null;
  }
}

/**
 * ⛔ OURS, EVERY ONE, AND EACH ONE HAS TO SAY WHY. The source gives a rule and no duration, so these
 * are the field's answer to his rule, not his answer:
 *
 *   · **heavy — 180s.** The one figure in this file that already had a basis: the NSCA prescribes
 *     2-5 min between sets for strength/power work, and the phosphagen system that fuels a set of
 *     1-5 is only ~85% resynthesised at two minutes and effectively complete near three. Unchanged
 *     from {@link HEAVY_MAIN_REST_SEC}, which is the same number and the same argument.
 *   · **speed — 120s.** Still inside the NSCA's 2-5 min power band, at the bottom of it, because the
 *     set is 2-4 reps at 70-80% rather than a near-maximal single: "nearly full recovery" (p78)
 *     arrives sooner after a light fast set than after a heavy one. ⚠️ **NOT the 45-60s of Westside
 *     dynamic-effort work.** That short rest is deliberately a conditioning stimulus, and p78 rules
 *     it out in as many words for this purpose — *"true strength sessions should have very little
 *     accumulating fatigue."* Where the two sources disagree, the book we are building from wins.
 *   · **muscle — 90s.** The top of the NSCA's 30-90s hypertrophy band, and the only bucket that is
 *     not trying for full recovery, because p84 says the drop-off in capacity is part of the
 *     stimulus here rather than the end of the session.
 */
export const REST_BY_SLOT: Record<RestBucket, number> = {
  heavy: 180,
  speed: 120,
  muscle: 90,
};

/** ⛔ SAY IT ON THE SCREEN THAT SHOWS THE CLOCK. The rule is his; the minutes are not. */
export const REST_MINUTES_ARE_OURS =
  'The rule is the source\'s; the minutes are ours. He gives no rest interval anywhere in the book.';

/**
 * The line that belongs beside the countdown for a slot. ⛔ IMPORTED, NEVER REWORDED — one owner,
 * in `strength-grid/intents.ts`, so the plan\'s notes and the timer cannot drift apart.
 */
export function restCueForBucket(bucket: RestBucket): string {
  return bucket === 'muscle' ? REST_BETWEEN_SETS_RULE_HYP.cue : REST_BETWEEN_SETS_RULE.cue;
}

/**
 * Rest in SECONDS.
 *
 * ⚠️ `slotIntent` IS THE STANDING PLAN\'S ONLY, AND ITS ABSENCE CHANGES NOTHING — Michael\'s call,
 * 2026-08-27. A 5/3/1 row, a freestyle row and every logged workout with no plan intent fall through
 * to the ladder below, byte-identical to what they got before. ⛔ **THAT LADDER — 150 / 120 / 90 /
 * 75 / 60 — HAS NO STATED BASIS**: not in this file, not in its fixtures, not in the decisions log.
 * It is OURS and undeclared, it is left running because nobody has reported a problem with it, and
 * re-basing it on no evidence is the change that was deliberately not made. **It is now labelled
 * rather than anonymous** — see {@link LEGACY_LADDER_IS_OURS}.
 */
export function calculateRestTime(
  exerciseName: string,
  reps: number | undefined,
  slotIntent?: string | null,
): number {
  // ⛔ THE INTENT OUTRANKS EVERYTHING, INCLUDING THE REP COUNT AND THE MOVEMENT. That is the whole
  // fix: the slot already says what kind of set this is, and re-deriving it from a name was how a
  // max-effort pull-up ended up resting like an accessory.
  const bucket = restBucketForIntent(slotIntent);
  if (bucket) return REST_BY_SLOT[bucket];

  if (!reps || reps === 0) return 90; // Default 90 seconds

  // Plyometrics need full recovery between sets (2-3 min)
  if (isPlyometricMovement(exerciseName)) {
    return 150; // 2:30 for neural recovery
  }

  // ⛔ THE SHARED CLASSIFIER. One set, two readers — the same one the State row, the bar-speed cue and
  // the AMRAP verdict all gate on.
  if (isMain531Lift(exerciseName)) {
    // Main lifts:
    // 3-5 reps: 180 sec (3:00) — near-maximal, see HEAVY_MAIN_REST_SEC
    // 6-8 reps: 120 sec (2:00)
    if (reps >= 3 && reps <= 5) return HEAVY_MAIN_REST_SEC;
    if (reps >= 6 && reps <= 8) return 120;
    // Default for main lifts outside range
    return 120;
  }

  // Accessories:
  // 6-10 reps: 90 sec (1:30)
  // 10-15 reps: 75 sec (1:15)
  // 15+ reps or time-based: 60 sec (1:00)
  if (reps >= 6 && reps < 10) return 90;
  if (reps >= 10 && reps < 15) return 75;
  if (reps >= 15) return 60;
  // Default for accessories outside range
  return 90;
}

/**
 * ⛔ THE UNSOURCED LADDER, NAMED (2026-08-27). Audited on Michael\'s instruction and this is the
 * finding: of everything in this file, only two things ever had a stated basis — the 180s heavy case
 * (NSCA 2-5 min plus phosphagen resynthesis, argued at {@link HEAVY_MAIN_REST_SEC}) and the
 * main-lift-versus-accessory split (D-380, which repointed it at the shared classifier). The
 * 150 / 120 / 90 / 75 / 60 ladder has no citation in this file, none in `DECISIONS-LOG`, and its
 * fixtures assert the numbers without ever saying where they came from.
 *
 * ⚠️ IT IS STILL RUNNING, AND ON PURPOSE. Nobody has reported a problem with rest on a 5/3/1 or
 * freestyle session, and changing a number on no evidence is worse than leaving one that works. What
 * changed is that it is no longer anonymous.
 */
export const LEGACY_LADDER_IS_OURS =
  'Rest on a session with no plan intent is ours and has no stated source: three minutes for a heavy '
  + 'main lift, two for a main lift in the middle bands, two and a half for plyometrics, and ninety '
  + 'down to sixty seconds for accessories as the reps climb. Only the three-minute case is argued '
  + 'anywhere.';
