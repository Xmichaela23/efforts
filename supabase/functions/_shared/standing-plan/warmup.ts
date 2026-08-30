// ============================================================================
// THE RAMP — his Rule 1 and Rule 2a, pp.139–140.
//
// ⛔ HE ASKS FOR IT AND HE SAYS WHAT SHAPE IT TAKES, so the ramp is HIS. What he does NOT give is a
// percentage table, so the rungs are OURS and are labelled as such below.
//
// ⛔ RULE 1, p139 — "Just Enough Warm-Up":
//     *"A good warm-up is meant to prepare your body to do work, not be a stimulus… should be
//     extremely efficient (many athletes waste a lot of time with extended warm-ups that are of
//     marginal benefit)."*
//   RAISE · ACTIVATE · MOBILIZE · POTENTIATE, and the last of the four is the loaded ramp itself:
//     *"POTENTIATE: This proceeds directly into the next segment and is context dependent on what
//     you will perform first in the session."*
//
// ⛔ RULE 2a, p140 — the loaded half, and the two conditions on it:
//     *"If you're performing a barbell back squat as your sport movement for the day, your warm-up
//     should begin with unloaded, rapid concentric back squats, working up in weight."*
//     *"With skill development work, every warm-up set should have equal focus and quality to the
//     work sets. Every repetition either reinforces/develops sport skill or degrades it."*
//   And the pull-quote that fixes where the ramp ENDS:
//     *"The first set of your skill work should also be the last set of your warm-up."*
//
// ⛔⛔ SO THE RAMP CONVERGES ON THE WORK WEIGHT — it is not a separate block of lighter lifting that
// happens first. That single sentence is why the rungs below are fractions of the PRESCRIBED WEIGHT
// rather than of the max: a ramp priced off the max would land wherever it landed, and on a speed
// day at 70% it would overshoot the work set entirely.
//
// ⚠️ AND IT IS WHY THE LAST RUNG IS NOT EMITTED. The work set IS the last rung. Emitting one more
// set at the work weight and calling it a warm-up would add a set to the prescription and put it
// where nothing downstream expects it.
//
// ⛔ THE RAMP IS TAGGED AND SEPARATE, and everything that COUNTS must keep ignoring it — set counts,
// the rep-band readers, the earned-set ladder, the load ledger. A warm-up that counted as work would
// inflate the day against p086's ceiling and feed the progression evidence it is not.
// ============================================================================

/** One rung of the ramp. `weight` is absolute; `warmup` is what keeps it out of every count. */
export type WarmupSet = { weight: number; reps: number; warmup: true; cue?: string };

/**
 * ⛔ THE FIRST RUNG'S CUE IS HIS INSTRUCTION, IN OUR WORDS (p140: *"begin with unloaded, rapid
 * concentric back squats"*). ⚠️ The SPEED is the whole point of the set and the only thing that
 * distinguishes it from standing around, so it is said rather than assumed.
 */
export const RAMP_BAR_CUE = 'Empty bar, moved fast.';

/**
 * ⛔ THE RAMP'S OWN LINE, carrying his two conditions and nothing else.
 *
 * p140: *"every warm-up set should have equal focus and quality to the work sets"* and *"every
 * repetition either reinforces/develops sport skill or degrades it"* — so these are not throwaway
 * sets. And the pull-quote: *"the first set of your skill work should also be the last set of your
 * warm-up"* — which is why the ramp stops short of the work weight rather than repeating it.
 *
 * ⚠️ ONE LINE ON THE ROW, NOT ONE PER RUNG. Repeated on every rung it becomes wallpaper — the same
 * reason the block states its own "why" once.
 */
export const RAMP_NOTE =
  'Work up in the same lift. These sets carry the same quality as the work sets, and the last one '
  + 'runs straight into your first.';

/**
 * ⚠️ **OURS.** He gives no percentages anywhere — only *"begin unloaded… working up in weight"* and
 * *"extremely efficient"*. These are fractions of the PRESCRIBED WEIGHT, chosen so the ramp is three
 * rungs at most and each step is a real jump rather than a rehearsal of the one before.
 *
 * ⚠️ THE REPS FALL AS THE WEIGHT CLIMBS, which is field practice and not on any page of his. What IS
 * his is that these sets are not throwaways — *"equal focus and quality to the work sets"* — so the
 * counts stay low enough to keep every rep clean.
 */
export const RAMP_RUNGS_ARE_OURS =
  'He asks for a ramp and states its shape - begin unloaded with fast concentrics, work up in '
  + 'weight, and let the first work set be the last warm-up set - but gives no percentages. The '
  + 'rungs, the rep counts and the three-rung cap are ours, from field practice.';

export const RAMP_FRACTIONS: readonly number[] = [0.55, 0.75, 0.90];
export const RAMP_REPS: readonly number[] = [5, 3, 2];

/**
 * ⛔ THE UNLOADED SET IS HIS, VERBATIM IN SUBSTANCE — *"begin with unloaded, rapid concentric back
 * squats"*. It is the empty bar, moved fast, and it is the one rung that is not a percentage of
 * anything.
 *
 * ⚠️ 45 lb IS THE APP'S EXISTING STANDARD-BAR ASSUMPTION, not a new number
 * (`strength-logging-mode.ts` draws a 45 lb bar by default). A caller that knows the athlete's bar
 * passes it.
 */
export const DEFAULT_BAR_LB = 45;

/**
 * The ramp for one prescribed set of one movement.
 *
 * @param workWeight the weight the FIRST WORK SET is prescribed at. The ramp converges here and
 *                   stops short of it — the work set is the final rung (p140).
 * @param roundTo    the athlete's loadable increment.
 * @param barLb      the bar being used, or null for a movement that has no bar.
 *
 * ⛔ RETURNS AN EMPTY RAMP RATHER THAN A TOKEN ONE when there is nothing to climb. Two cases, both
 * real: a movement with no prescribed weight (every by-feel row before the test is read), and a work
 * weight already at or below the bar, where a ramp would run the same weight three times and call
 * two of them preparation.
 *
 * ⚠️ RUNGS THAT COLLIDE ARE DROPPED, not nudged apart. On a light work weight two fractions round to
 * the same loadable weight, and prescribing it twice reads as a mistake rather than as a ramp.
 */
export function rampFor(
  workWeight: number | null | undefined,
  roundTo: number,
  barLb: number | null = DEFAULT_BAR_LB,
): WarmupSet[] {
  const w = Number(workWeight);
  if (!Number.isFinite(w) || w <= 0) return [];
  const step = Number.isFinite(roundTo) && roundTo > 0 ? roundTo : 5;
  const bar = Number.isFinite(Number(barLb)) && Number(barLb) > 0 ? Number(barLb) : null;

  // ⛔ NOTHING TO CLIMB. At or under the bar the athlete is already at the lightest loadable weight.
  if (bar != null && w <= bar) return [];

  const out: WarmupSet[] = [];
  const seen = new Set<number>();

  // ⛔ HIS FIRST RUNG: unloaded, fast. Only where there is a bar to be empty.
  if (bar != null) {
    out.push({ weight: bar, reps: 5, warmup: true, cue: RAMP_BAR_CUE });
    seen.add(bar);
  }

  RAMP_FRACTIONS.forEach((f, i) => {
    const raw = Math.round((w * f) / step) * step;
    // ⚠️ Below the bar is not a rung — it is the bar again.
    if (bar != null && raw <= bar) return;
    // ⛔ AND NEVER AT OR ABOVE THE WORK WEIGHT. The work set is the last rung; a warm-up that
    // reaches it has replaced it.
    if (raw >= w) return;
    if (seen.has(raw)) return;
    /**
     * ⛔ A RUNG HAS TO BE A REAL STEP. On a light work weight the first fraction lands a single
     * increment above the bar — 50 lb after a 45 lb bar — and that is not working up, it is the bar
     * again with a note. ⚠️ OURS: two increments is the smallest gap that reads as a jump, and it is
     * the reading of *"extremely efficient"* that keeps a 95 lb bench from carrying four sets.
     */
    const prev = out.length > 0 ? out[out.length - 1].weight : 0;
    if (raw - prev < step * 2) return;
    seen.add(raw);
    out.push({ weight: raw, reps: RAMP_REPS[i] ?? 2, warmup: true });
  });

  return out;
}

/**
 * ⛔ WHICH ROWS GET A RAMP — his sentence is about *"your sport movement for the day"*, not about
 * every movement in the session.
 *
 * ⚠️ **OURS, AND DELIBERATELY NARROW.** Rule 2a names the day's main lift. Ramping a rear delt fly
 * would add three sets to a row whose whole dose is three sets, and Rule 1's *"extremely efficient"*
 * cuts against it. So: a row gets a ramp when it carries a PRESCRIBED WEIGHT and sits on one of the
 * heavy or speed slots — the ones whose weight comes off the working number.
 *
 * ⚠️ HYP ROWS ARE EXCLUDED even when priced. p218 gives them 6-12 reps at 0-2 RIR; the first work
 * set of a twelve-rep row is its own ramp.
 */
export function slotTakesRamp(slotIntent: string | null | undefined): boolean {
  const s = String(slotIntent ?? '').toUpperCase();
  return s === 'ME' || s === 'DE' || s === 'SKILL';
}
