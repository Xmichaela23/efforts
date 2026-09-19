// ============================================================================
// THE PAGE'S OWN WORD FOR A STEP THE TOKEN CANNOT NAME (2026-09-18, book-language pass 2, audit items 18, 27, 28).
//
// A token carries a step's length and its percentage, never its word. So a rest the page calls "recovery walk/jog",
// "easy spin", "rest" or "spin" reached the screens as " easy" (our word) or nothing, and reached the watch as "rest";
// an all-out ride step printed nothing at all. The word lives here, once, per session type and shape, read off the
// page photographs (book-sources/viada-hybrid-athlete/p231.jpg … p239.jpg): the page's line with its duration cut.
// `materialize-plan` puts it on the step as the step's label; the step lines, the Planned tab and the Garmin step
// description print it.
//
// ⚠️ A REST THE PAGE WRITES "@ VT1" GETS NO WORD HERE. The word VT1 never prints on screen (Today's standing rule), and
// the page gives that rest no other word; it keeps the pace it has. Recorded in the book-language report.
// ⚠️ A SHAPE OR LEVEL NOT LISTED GETS NO WORD — nothing is guessed from a neighbour.
// ============================================================================

import type { FamilyId } from './types.ts';

export type StepWords = {
  /** The rest between sets (or between the repeats of a one-step round). Per level where the page varies it. */
  between?: string | Partial<Record<1 | 2 | 3, string>>;
  /** An untargeted recovery inside the round ("@ easy spin", "easy jog"). */
  inRound?: string;
  /** A work step the page prints as an all-out effort. */
  allOut?: string;
  /** A work step at race pace. */
  racePace?: string;
};

export const STEP_WORDS: Partial<Record<FamilyId, Record<string, StepWords>>> = {
  run_mlss: {
    // p231 / p232: "2-minute recovery walk/jog between sets".
    surge_float: { between: 'recovery walk/jog' },
    // p231 L1: "2-minute walk/ recovery between sets"; p232 L2: "2-minute walk/recovery jog between sets";
    // p232 L3: "2-minute walk/recovery jog between small sets".
    forty_twenty: { between: { 1: 'walk/recovery', 2: 'walk/recovery jog', 3: 'walk/recovery jog' } },
    // p231 / p232: "2-minute recovery walk/jog between sets".
    long_surge_float: { between: 'recovery walk/jog' },
    // p232 L2: "Then 2-minute walk/recovery jog followed by a second round"; L3: "1 minute, 30 seconds to 2 minutes of
    // walk/recovery jog between rounds".
    descending: { between: { 2: 'walk/recovery jog', 3: 'walk/recovery jog' } },
  },
  run_near_threshold: {
    // p233 L1, p234 L2 / L3: "3-minute recovery walk/jog between sets".
    short_above: { between: 'recovery walk/jog' },
    // p233 / p234 race-specific NT: "3- to 5-minute recovery walk/jog between sets".
    race_repeats: { between: 'recovery walk/jog' },
    // p233 / p234: "1-minute easy jog".
    surge_opener: { inRound: 'easy jog' },
    // p247, the race-tempo row (any shape): "increase the pace here to race pace".
    '*': { racePace: 'race pace' },
  },
  run_lsd: {
    // p235: "5 minutes @ race pace finish", "10 minutes @ race pace finish", "15 minutes @ race pace finish".
    race_pace_finish: { racePace: 'race pace finish' },
  },
  ride_anaerobic: {
    // p237: "6 to 10 x 45 seconds @ 110–115% plus with 4- to 6-minute recovery between sets". The token carries the
    // rest inside the round (each rep rises), so it is the in-round recovery here.
    progressive_repeats: { inRound: 'recovery', between: 'recovery' },
    // p237 L1 / L2: "4-minute easy spin"; L3: "5-minute additional spin/recovery between sets".
    sandwich: { inRound: 'easy spin', between: { 3: 'additional spin/recovery' } },
    // p237 L2 / L3: "5-minute spin between sets".
    one_to_one: { between: { 2: 'spin', 3: 'spin' } },
  },
  ride_vo2: {
    // p238: "5-minute rest".
    long_vo2: { between: 'rest' },
    // p238: "1 minute, 30 seconds @ easy spin"; L1 "5-minute recovery between sets", L2 / L3 "5 minutes of recovery
    // between sets".
    short_vo2: { inRound: 'easy spin', between: 'recovery' },
    // p238: "5-minute rest between sets".
    micro: { between: 'rest' },
  },
  ride_sweet_spot: {
    // p238 / p239: "3-minute easy spin", "2-minute easy spin", "4-minute easy spin", "5-minute easy spin".
    minute_surge: { between: 'easy spin' },
    medium: { between: 'easy spin' },
    long: { between: 'easy spin' },
    // p239 L3: "20 minutes @ 80% with 10 seconds @ all-out sprint every 4 minutes".
    tempo: { between: 'easy spin', allOut: 'all-out sprint' },
  },
  ride_sprints: {
    // p236: "3 max effort 2- to 3-minute sprints …; 5 to 6 minutes of recovery between sprints".
    max_effort: { allOut: 'max effort', between: 'recovery' },
    // p236: "accelerate as fast as possible up to speed before settling into an easy pace. 6- to 10-minute easy spin as
    // a recovery between reps."
    standing_start: { allOut: 'accelerate as fast as possible up to speed', between: 'easy spin as a recovery' },
    // p236: "flying 30-second surges to max effort, with 2 to 3 minutes recovery between".
    flying_surge: { allOut: 'max effort', between: 'recovery' },
  },
  ride_endurance: {
    // p239: "5-minute easy spin between sets"; "45 minutes @ VT1 with 10-second all-out sprint every 9 minutes".
    mixed: { between: 'easy spin', allOut: 'all-out sprint' },
  },
};

/** The page's word for a step, or null. */
export function stepWordFor(
  family: string | null | undefined,
  archetype: string | null | undefined,
  level: number | null | undefined,
  which: keyof StepWords,
): string | null {
  if (!family || !archetype) return null;
  const fam = (STEP_WORDS as Record<string, Record<string, StepWords>>)[family];
  // `*` is a word the page gives the family whatever its shape (p247's race pace on the near-threshold run).
  const w = fam?.[archetype]?.[which] ?? fam?.['*']?.[which];
  if (w == null) return null;
  if (typeof w === 'string') return w;
  const lv = Number(level);
  return (lv === 1 || lv === 2 || lv === 3) ? w[lv] ?? null : null;
}
