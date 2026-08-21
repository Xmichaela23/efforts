// ============================================================================
// THE QUALITY SESSION CONSTRUCTOR — ONE CALCULATION OWNS THE LENGTH AND THE WRAPPER.
//
// ⛔ WHY THIS EXISTS. A quality session used to state its length THREE times and the three
// disagreed:
//
//   1. the constant the weekly volume budget subtracted (`SPRINT_SESSION_MIN` = 35),
//   2. the `duration` field the composer wrote onto the session (35),
//   3. the token in `steps_preset`, which is what `materialize-plan` actually expands.
//
// `materialize-plan:3745` recomputes the duration from the expanded steps and OVERWRITES the other
// two, so only (3) was ever real. Measured on a built block, 2026-08-20:
//
//     session            budget subtracted   token expands to   leaked
//     Threshold Run             45                  23             22
//     Threshold Ride            45                  24             21
//     Bike Intervals            45                  32             13
//     Flat Sprints              35                  14             21
//
// ⛔ AND THE WORST OF IT REACHED THE WATCH. `send-workout-to-garmin:714` builds a first-class
// warm-up array; Flat Sprints — six MAXIMAL 12-second efforts — sent it EMPTY. The athlete's watch
// beeped and step one was a maximal sprint from cold.
//
// ⚠️ THE RUN WEEK LEAKED THE SAME MINUTES WITH NOBODY NOTICING, because running is budgeted in
// MILES: 18 asked, ~16.3 built. The ride was only caught because its unit is minutes.
//
// ⛔ THE FIX IS NOT A GUARD, AND THAT IS THE POINT. A session builder can no longer state a
// duration at all. It declares its CORE — the work, in seconds, as its tokens will actually expand
// — and an ALLOWANCE, and this returns `{ duration, steps_preset }` as ONE object to be spread onto
// the session. There is no code path that sets one without the other, so "a session with no
// warm-up" stopped being a thing that can be written down.
//
// ⚠️ WHAT THIS FILE DOES NOT DO: decide which day anything lands on. Placement is untouched.
// ============================================================================

/**
 * ⛔ THE MINIMUM WARM-UP, AND IT IS A FLOOR RATHER THAN A TARGET (Michael, 2026-08-20: *"a week
 * whose budget is eaten by the long day still can't prescribe a bare maximal sprint"*).
 *
 * ⚠️ TEN MINUTES IS THIS APP'S OWN EXISTING CONVENTION, NOT A NEW NUMBER — and taking the number
 * that is already written down three times is deliberate. `materialize-plan` pushes a 600 s warm-up
 * on BOTH hill branches (`:1779`, `:1831`); `flatSession` and `generate-combined-plan/session-
 * factory.ts:443` both pass `warmup_run_10min_easy`. This file adopts that figure rather than
 * authoring a fifth one.
 *
 * ⛔ IT IS THE WARM-UP AND NOT THE WHOLE WRAPPER THAT IS FLOORED. The safety claim is entirely
 * about starting a maximal or near-maximal effort cold; a cool-down is a comfort and recovery
 * question, so it takes what is left and may be zero. Flooring both would push the bike's interval
 * session past its allowance to make two numbers look alike, which is the shape of decision this
 * codebase keeps deleting.
 */
export const WARMUP_FLOOR_MIN = 10;

/**
 * ⚠️ A CEILING SO A GENEROUS ALLOWANCE DOES NOT BUY A HALF-HOUR WARM-UP. Nothing in the current
 * session set reaches it — it fires only when the leftover exceeds 30 minutes — and it is a product
 * decision with no paper under it, marked as such the same way `LONG_RIDE_SHARE` is in the composer.
 * Above the ceiling the remainder goes to the cool-down, which is the harmless half.
 */
export const WARMUP_CEILING_MIN = 15;

/**
 * What a quality session's WORK is, stated the way the tokens will actually expand.
 *
 * ⛔ SECONDS, NOT MINUTES, AND THAT IS LOAD-BEARING. `run_sprint_6x12s_r150s` is 822 seconds —
 * 13.7 minutes. Rounding it to 14 before the arithmetic puts the constructor 18 seconds away from
 * what `materialize-plan` will compute, and 18 seconds is exactly the kind of drift that becomes a
 * failing equality assertion nobody can explain six weeks later. Round ONCE, at the end, with the
 * same expression `materialize-plan` uses.
 */
export type QualityCore = {
  /** The token(s) carrying the WORK. Warm-up and cool-down are this file's business, not theirs. */
  tokens: string[];
  /**
   * Seconds the work tokens expand to — the efforts plus the recoveries BETWEEN them, and any
   * warm-up/cool-down the tokens build for themselves (see `selfWrapped`).
   *
   * ⚠️ THIS IS A CLAIM ABOUT THE EXPANDER AND THE SWEEP PROVES IT. `dump-plans.ts` re-expands every
   * token and asserts the built duration matches. If an expander branch changes underneath a core
   * declared here, that assertion is what fails — this number is checked, not trusted.
   */
  workSeconds: number;
  /**
   * ⛔ TRUE WHEN THE WORK TOKENS ALREADY BUILD THEIR OWN WARM-UP AND COOL-DOWN, and it is the one
   * flag that stops this file DOUBLING them.
   *
   * The hill family (`run_hills_*`) pushes its own 600 s warm-up and 480–600 s cool-down inside the
   * expander, and those three sessions already match their allowance to the minute. They come
   * through this constructor anyway — so the warm-up invariant covers every quality session rather
   * than most of them — and it adds nothing to them.
   *
   * ⛔ A self-wrapped core MUST already carry at least `WARMUP_FLOOR_MIN`. Asserted below, because
   * "it brackets itself" is the claim that would let a bare session back in through the one door
   * this file leaves open.
   */
  selfWrapped: boolean;
};

export type WrappedQuality = {
  /**
   * ⛔ SPREAD THIS ONTO THE SESSION. Duration and tokens leave here as ONE object precisely so a
   * builder cannot write one without the other — which is what "three statements of length" was.
   */
  fields: { duration: number; steps_preset: string[] };
  /**
   * What the week's volume budget subtracts.
   *
   * ⛔ EQUAL TO `fields.duration` FOR EVERY SESSION THIS FILE WRAPS — the same number under two
   * names, because the budget pass and the session builder are a thousand lines apart and one of
   * them must not re-derive it.
   *
   * ⚠️ THE ONE EXCEPTION IS THE LAP-BUTTON HILL, AND IT IS A FACT ABOUT THE WATCH RATHER THAN A
   * SLIP. Its descents end on the lap button, so they reach the watch with no duration and cost the
   * plan's clock nothing (`hills-lap-button.test.ts` — the absence IS the instruction). The athlete
   * still spends those minutes, so the ALLOWANCE covers them and `duration` does not: the card says
   * what the clock will say, and the budget says what the day will cost.
   */
  budgetMinutes: number;
  warmupMinutes: number;
  cooldownMinutes: number;
  /** The seconds every CLOCKED step adds up to — what `materialize-plan` will sum. */
  plannedSeconds: number;
  /**
   * ⚠️ CARRIED THROUGH so the copy helper can be silent. The hill family's wrapper is inside its
   * token; `warmupMinutes` reports the floor it is known to clear, not a bracket this file added,
   * and a sentence claiming otherwise would be a number without provenance.
   */
  selfWrapped: boolean;
};

/**
 * ⛔ THE SAME EXPRESSION `materialize-plan:3746` USES, AND IT IS COPIED DELIBERATELY RATHER THAN
 * APPROXIMATED. That line is `Math.round(actualTotal / 60)`. A composer that used `floor` or
 * `ceil` here would disagree with the plan by a minute on exactly the sessions whose work is not a
 * whole number of minutes — which is the sprint session, the one that matters most.
 */
export const minutesFromSeconds = (s: number): number => Math.round(s / 60);

/** Run tokens. ⚠️ `warmup_run_{n}min_easy` is the shape `expandRunToken:1364` already parses. */
const runWarmup = (min: number) => `warmup_run_${min}min_easy`;
const runCooldown = (min: number) => `cooldown_run_${min}min_easy`;
/**
 * Bike tokens. ⚠️ `expandBikeToken:1936` parses `warmup_*_{n}min` and `:1942` parses
 * `cooldown*{n}min`, pricing them at 50-65% and 40-55% FTP. Nothing new is invented for the bike —
 * the branches were already there and no strength session had ever used them.
 */
const bikeWarmup = (min: number) => `warmup_bike_${min}min`;
const bikeCooldown = (min: number) => `cooldown_bike_${min}min`;

/**
 * ⛔ THE ONE PLACE A QUALITY SESSION GETS ITS LENGTH.
 *
 * `allowanceMinutes` is what the week has already set aside for this session — the constants that
 * used to masquerade as "how long this session is". They keep their values; what changes is their
 * MEANING. An allowance is a budget, and this spends it: the core takes what it takes, and
 * **everything left over becomes the warm-up and cool-down.** That is the whole ruling — *"the
 * budget stops being a number that leaks and becomes the thing that sizes the wrapper."*
 *
 * ⛔ THE FLOOR OUTRANKS THE ALLOWANCE, AND THAT IS THE SAFETY HALF. When the core is long enough
 * that less than `WARMUP_FLOOR_MIN` is left, the session goes OVER its allowance rather than
 * shortening the warm-up. The block's own yield order already says this in words (Hickson —
 * intensity is protected, duration is the expendable variable, the hard session is paid first and
 * the easy volume flexes around it); this is that rule applied to the wrapper instead of the work.
 */
export function wrapQualitySession(
  core: QualityCore,
  allowanceMinutes: number,
  sport: 'run' | 'bike',
): WrappedQuality {
  if (core.selfWrapped) {
    /**
     * ⛔ NO TOKEN IS ADDED — the wrapper is already inside the expander branch (`materialize-plan`
     * pushes 600 s either side on both hill branches), and appending a second cool-down would give
     * the athlete two. The hill family comes through this door anyway so the warm-up invariant
     * covers EVERY quality session rather than most of them: three of the four terrain options were
     * correct by the habit of whoever wrote their expander branch, and habit is not a guarantee.
     *
     * ⛔ BUT THE DURATION IS RECOMPUTED, AND THAT IS A REAL FIX. It was the allowance constant —
     * `HILL_SESSION_MIN` = 35 — on EVERY week, while the anchor weeks halve the rep count and come
     * out at 27. The leader weeks matched to the minute, which is why the leak was reported as
     * hill-family-clean; the anchor weeks were never computed. Same defect as the four below, three
     * weeks in twelve.
     */
    const plannedSeconds = core.workSeconds;
    return {
      fields: {
        duration: minutesFromSeconds(plannedSeconds),
        steps_preset: [...core.tokens],
      },
      // ⚠️ THE BUDGET STILL SUBTRACTS THE ALLOWANCE, NOT THIS WEEK'S LENGTH, and that asymmetry is
      // deliberate: the budget is computed ONCE for the block (see `qualityBudgetMinutes`), and
      // over-subtracting on the three anchor weeks is the safe direction — under-subtracting hands
      // the difference back as easy volume every week, which is the +3.5 mi defect the composer has
      // already fixed twice.
      budgetMinutes: allowanceMinutes,
      // ⚠️ REPORTED AS THE FLOOR, NOT AS A MEASUREMENT. The wrapper is inside the token; this file
      // knows it clears the floor and does not claim to know its exact split.
      warmupMinutes: WARMUP_FLOOR_MIN,
      cooldownMinutes: 0,
      plannedSeconds,
      selfWrapped: true,
    };
  }

  /**
   * What the allowance has left once the work — and any un-clockable recovery — is paid for.
   *
   * ⚠️ ROUNDED, NOT FLOORED, AND IT IS WORTH THE SENTENCE. A core whose seconds are not a whole
   * number of minutes (the sprint session is 822 s) leaves a fractional remainder; flooring it
   * throws away up to 59 seconds and the session lands a minute UNDER its allowance — which is a
   * small version of the leak this file exists to close. Rounding can overshoot by at most 30
   * seconds, which disappears in the final `Math.round`.
   */
  const leftoverMin = Math.round((allowanceMinutes * 60 - core.workSeconds) / 60);

  /**
   * ⚠️ THE WARM-UP TAKES THE LARGER HALF, ROUNDED UP. Two reasons, and neither is symmetry: the
   * warm-up is the half with the injury claim under it, and an odd leftover has to go somewhere.
   *
   * ⛔ AND THE FLOOR IS APPLIED HERE AND ONLY HERE. It was briefly applied twice — once to the
   * leftover and again in this clamp — and mutation testing on 2026-08-20 caught the second copy
   * doing nothing: deleting the first changed no output on any input. Two copies of one rule is the
   * disease this whole stage is closing, so the redundant one is gone rather than left as
   * belt-and-braces. `leftoverMin` may be NEGATIVE when the core outruns its allowance; the clamp
   * is what turns that into the floor, and the cool-down bottoms out at zero.
   */
  const warmupMinutes = Math.min(
    WARMUP_CEILING_MIN,
    Math.max(WARMUP_FLOOR_MIN, Math.ceil(leftoverMin / 2)),
  );
  const cooldownMinutes = Math.max(0, leftoverMin - warmupMinutes);

  const warmupTok = sport === 'run' ? runWarmup(warmupMinutes) : bikeWarmup(warmupMinutes);
  const cooldownTok = sport === 'run' ? runCooldown(cooldownMinutes) : bikeCooldown(cooldownMinutes);

  const plannedSeconds = core.workSeconds + (warmupMinutes + cooldownMinutes) * 60;
  const duration = minutesFromSeconds(plannedSeconds);

  return {
    fields: {
      duration,
      steps_preset: [
        warmupTok,
        ...core.tokens,
        // ⚠️ A ZERO-MINUTE COOL-DOWN IS OMITTED RATHER THAN EMITTED AS `cooldown_run_0min_easy`.
        // That token would parse (the regex takes any integer) and reach the watch as a zero-second
        // step — the same species of error as the one-second lap-button rest.
        ...(cooldownMinutes > 0 ? [cooldownTok] : []),
      ],
    },
    budgetMinutes: duration,
    warmupMinutes,
    cooldownMinutes,
    plannedSeconds,
    selfWrapped: false,
  };
}

/**
 * ⛔ THE CARD SAYS THE SESSION HAS A WARM-UP, BECAUSE OTHERWISE THE ATHLETE HAS TO GUESS.
 *
 * A prescription reading *"4 × 5 min at threshold"* beside a stated duration of 45 minutes leaves
 * 22 unexplained minutes, and the athlete's two available conclusions are "the number is wrong" or
 * "there is something here nobody told me about". Both are the §0f loss — a fact the engine holds
 * and never says.
 *
 * ⚠️ VOICE: fact, then what it means, no imperative, no encouragement. It does not say "warm up
 * properly" — it states what the session contains and lets the athlete act on it.
 * ⚠️ SILENT FOR A SELF-WRAPPED CORE. The hill family's warm-up is inside its token and its copy has
 * never mentioned it; adding a sentence there would be a change to three sessions this stage has no
 * reason to touch.
 */
export function wrapperNote(w: WrappedQuality): string {
  if (w.selfWrapped) return '';
  const tail = w.cooldownMinutes > 0
    ? ` and ${w.cooldownMinutes} after`
    : '';
  return ` The ${w.fields.duration} minutes include ${w.warmupMinutes} min easy before the work${tail}.`;
}

/**
 * ⛔ WHAT THE BUDGET SUBTRACTS FOR A SESSION THAT MOVES ACROSS A WAVE.
 *
 * The weekly volume budget is computed ONCE for the block while the session's core changes week to
 * week, so one number has to stand for three. It takes the LARGEST, which is the same call
 * `THRESHOLD_RUN_MIN` made before this file existed — and for the same reason: under-subtracting
 * hands the difference back as easy volume every week, silently, which is the +3.5 mi defect the
 * composer has already fixed twice.
 *
 * ⚠️ IT NOW USUALLY RETURNS THE ALLOWANCE EXACTLY. Every week of a wave spends the same total —
 * the core moves and the wrapper absorbs it — so the old "over-subtracts by two minutes on two
 * weeks in three" is gone rather than tolerated. The max only exceeds the allowance when the FLOOR
 * bites on some week of the wave, which is precisely when the budget SHOULD be bigger.
 */
export function qualityBudgetMinutes(
  cores: QualityCore[],
  allowanceMinutes: number,
  sport: 'run' | 'bike',
): number {
  if (cores.length === 0) return allowanceMinutes;
  return Math.max(...cores.map((c) => wrapQualitySession(c, allowanceMinutes, sport).budgetMinutes));
}

/**
 * ⛔ THE INVARIANT, CHECKED ON THIS FILE'S OWN ARITHMETIC — not on each caller.
 *
 * ⚠️ THIS IS NOT THE GUARD THE WORK ORDER FORBIDS. The thing that made a bare session impossible is
 * the SHAPE above: a builder declares a core and receives `{ duration, steps_preset }` together, so
 * there is no expression that produces tokens without a warm-up. This throws only if the arithmetic
 * in this file is wrong about its own output, and the real proof runs in `dump-plans.ts` across all
 * 61 shapes.
 */
export function assertWrapperInvariant(core: QualityCore, w: WrappedQuality): void {
  if (w.warmupMinutes < WARMUP_FLOOR_MIN) {
    throw new Error(
      `quality-session: warm-up ${w.warmupMinutes} min is below the ${WARMUP_FLOOR_MIN} min floor `
      + `for tokens [${core.tokens.join(', ')}]`,
    );
  }
  if (!core.selfWrapped && !w.fields.steps_preset[0].startsWith('warmup_')) {
    throw new Error(
      `quality-session: first step is "${w.fields.steps_preset[0]}", not a warm-up`,
    );
  }
}
