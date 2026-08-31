// ============================================================================
// THE WORKING NUMBER — Viada's, and a DIFFERENT NUMBER from the previous program's training max.
//
// Source: p215. ⚠️ **IMAGE PENDING IN `book-sources/`** — the page was photographed 2026-08-22 and
// read in the planning chat; the file has not landed in the folder yet, so this is the one set of
// constants in the Standing Plan that cannot currently be re-checked against an image on disk.
// Corpus: `SOURCE-viada-hybrid-athlete.md` Part H. Gap G-7 closes when `p215.jpg` arrives.
//
// ⛔ THE SAME-WORD COLLISION, AND IT IS THE WHOLE REASON THIS FILE IS SEPARATE.
//
//     the previous program   `plans.config.training_max`   85% of a TRUE 1RM        three live readers
//     Viada     the working number            96% of a PREDICTED 1RM   this file, and nothing else
//
// **They never convert into each other, and no function in this module accepts both.** A helper
// taking `{ trainingMax, workingNumber }` would be the door through which one becomes the other.
// `wendler-531.ts` is untouched and Get Stronger ships on it unchanged.
// ============================================================================

/** The lifts the pretest covers. Same keys as `OneRepMaxes` so nothing has to be re-spelled. */
export type TestedLift = 'bench' | 'squat' | 'deadlift' | 'overheadPress';

export const TESTED_LIFTS: TestedLift[] = ['bench', 'squat', 'deadlift', 'overheadPress'];

/**
 * ⛔ 96% OF THE PREDICTED TRUE 1RM (p215). Not 85%, not of a true max, and not the previous program's.
 */
export const WORKING_MAX_FRACTION = 0.96;

/**
 * ⛔ THE NAME THE ATHLETE SEES, AND THE NAME THE READER LOOKS FOR — one table, both jobs.
 *
 * ⚠️ THIS WAS A DEFECT FOUND AT THE WIRING (slice 2). `testDaySession` wrote `name: lift` — the raw
 * key — so the test session showed an exercise called `overheadPress`, and the reader that has to
 * find that set again could not: the block's every weight depends on one logged set, and it was
 * being logged under a name nothing could resolve.
 *
 * ⛔ THESE ARE THE APP'S EXISTING FOUR NAMES, not new ones — the same strings `MAIN_LIFTS`
 * (`strength-primary-plan.ts`) and `rematerialize-strength-block`'s `LIFTS` already use, so a lift
 * carries one name across every plan this app builds.
 */
export const TESTED_LIFT_NAME: Record<TestedLift, string> = {
  bench: 'Bench Press',
  squat: 'Back Squat',
  deadlift: 'Deadlift',
  overheadPress: 'Overhead Press',
};

/**
 * ⛔ THE TEST TESTS THE MOVEMENT THE ATHLETE WILL ACTUALLY DO.
 *
 * When the athlete has named a competition lift for a pattern (pivot §6, his p275 permission), that
 * is the movement week one measures — not a canonical stand-in. It has to be: `exerciseForSlot`
 * only prescribes a weight when the movement IS the named competition lift, so testing "Back Squat"
 * and prescribing "Safety Bar Squat" would produce a working number nothing spends.
 *
 * ⚠️ OVERHEAD PRESS HAS NO PATTERN IN THIS FRAME and therefore no override — see `TESTED_LIFT_NAME`.
 */
export function testedLiftName(
  lift: TestedLift,
  competitionName: string | null | undefined,
): string {
  const named = typeof competitionName === 'string' ? competitionName.trim() : '';
  return named !== '' ? named : TESTED_LIFT_NAME[lift];
}


/**
 * ⛔ THE PRETEST, AS HE WRITES IT (p215). Warm up to roughly 75% of the PREDICTED max, then three
 * steps.
 *
 * ⛔ "PREDICTED MAX" IS THE NUMBER ALREADY ON FILE. The athlete's stored 1RM sets the warm-up
 * weights — it is the SEED for the test, never the answer to it. That distinction is the whole of
 * Michael's 2026-08-23 ruling: a fresh test runs for everyone at block start, and a stored baseline
 * may only aim it.
 *
 * ⛔⛔ THE UPPER TWO STEPS ARE DERIVED FROM THE WARM-UP, NOT FROM THE PREDICTED MAX (fixed
 * 2026-08-29). They used to be independent fractions `0.85` and `0.90` of the predicted max, and
 * **both were too heavy.** p215 does not give three fractions — it gives ONE weight and then two
 * additions to it:
 *
 * > *"Perform a regular warm-up in your chosen lift, slowly working your way up to a starting weight
 * > of 75 percent or so of your predicted max; perform 6 reps… [**A**]
 * > Multiply this weight by 0.1 and enter the number here [**B**]…
 * > Take half of number B and enter it here [**C**]…
 * > Add A and B and enter this weight here [**D**]… Perform 5 repetitions with this weight…
 * > Add number C to number D… Perform the maximum number of repetitions possible with this weight."*
 *
 * ⛔ SO **D = A + 0.1A = 1.1A** AND **E = D + 0.05A = 1.15A.** Against the predicted max that is
 * **0.825** and **0.8625**, not 0.85 and 0.90. His own worked example (p215): a 225 lb max gives
 * A=165, D=180 for 5, **E=190 for max reps — and it lands on 6.**
 *
 * ⛔ WHY THE OLD NUMBERS MATTERED, AND WHY THIS IS EXPRESSED AS MULTIPLES RATHER THAN AS TWO
 * CORRECTED FRACTIONS. At 0.90 the measured set returns roughly **4 reps where his example returns
 * 6**. p214 states the reason that is worse, not merely different: *"a 5- to 6-rep max seems to allow
 * for the best combination of reliability and precision"*, and Epley and Brzycki **diverge as the rep
 * count changes** — which is p215's own stated reason for averaging them. Testing high lands in the
 * noisier part of both curves, and **every prescribed weight in the block is computed from that one
 * set.** Writing the steps as multiples of A keeps them tied to his arithmetic, so they cannot drift
 * from the page again however A itself is rounded.
 *
 * ⚠️ ROUNDING IS OURS AND IS UNCHANGED — nearest loadable increment, applied to each step. His
 * example rounds by eye (168.75 → 165, 181.5 → 180, 189.75 → 190); we round consistently instead of
 * reproducing his hand-rounding, so a seeded 225 gives 170 / 185 / 195 rather than his 165/180/190.
 * ⛔ THE RATIO IS WHAT MATTERS, NOT THE HAND-MATCH: 195/225 = 86.7%, against his 190/225 = 84.4%,
 * and against the old code's 90%.
 */
export const PRETEST_WARMUP_FRACTION = 0.75;

/**
 * ⛔ MULTIPLES OF THE WARM-UP WEIGHT (A), which is p215's own unit. `fractionOfPredicted` is carried
 * alongside for readers that want the headline percentage; it is derived, never the source.
 */
export const PRETEST_STEPS: {
  multipleOfWarmup: number;
  fractionOfPredicted: number;
  reps: number | 'max';
}[] = [
  { multipleOfWarmup: 1.00, fractionOfPredicted: 0.75, reps: 6 },
  { multipleOfWarmup: 1.10, fractionOfPredicted: 0.825, reps: 5 },
  { multipleOfWarmup: 1.15, fractionOfPredicted: 0.8625, reps: 'max' },
];

/** The step that is actually measured — the last one, taken for max reps. */
export const PRETEST_MEASURED_STEP_INDEX = PRETEST_STEPS.length - 1;

/**
 * Epley. `1RM = w × (1 + r/30)`.
 * ⚠️ This is the app's existing single-formula e1RM and it reads about 1.6% HIGH against the average
 * below — the heavier direction. It is one half of the answer here, never the whole of it.
 */
export function epley1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/** Brzycki. `1RM = w × 36 / (37 − r)`. Diverges from Epley in the opposite direction as reps climb. */
export function brzycki1RM(weight: number, reps: number): number {
  return (weight * 36) / (37 - reps);
}

/**
 * ⛔ BOTH FORMULAS, AVERAGED, AND HE GIVES THE REASON: **they diverge as the rep count changes.**
 * The last pretest step is taken for MAX reps, so its rep count is not known in advance — which is
 * exactly the case where picking one formula picks an error whose size nobody can predict.
 *
 * ⚠️ Reps at or above 37 break Brzycki (the denominator hits zero and then inverts). A max-rep set
 * that long is not a strength test; it returns `null` rather than a number, and the caller must say
 * so instead of prescribing off it.
 */
export function predictedTrue1RM(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps >= 37) return null;
  return (epley1RM(weight, reps) + brzycki1RM(weight, reps)) / 2;
}

export type WorkingNumber = {
  lift: TestedLift;
  /** The averaged prediction from the measured set. */
  predicted1RM: number;
  /** ⛔ THE NUMBER THE PLAN PRESCRIBES FROM. 96% of the prediction. */
  workingNumber: number;
  /** What the test actually did — carried so a surface can show its own evidence. */
  measured: { weight: number; reps: number };
  cite: string;
};

/**
 * ⛔ THE ONE PLACE A WORKING NUMBER IS BORN. Takes the measured set; returns the number the plan
 * prescribes from.
 *
 * ⚠️ It does not accept a training max, a stored 1RM, or a previous working number. There is no
 * path from the previous program's number into this one.
 */
export function workingNumberFromTest(
  lift: TestedLift,
  measured: { weight: number; reps: number },
): WorkingNumber | null {
  const predicted = predictedTrue1RM(measured.weight, measured.reps);
  if (predicted == null) return null;
  return {
    lift,
    predicted1RM: predicted,
    workingNumber: predicted * WORKING_MAX_FRACTION,
    measured: { weight: measured.weight, reps: measured.reps },
    // ⚠️ IMAGE PENDING — see the file header and Part G item 7.
    cite: 'Viada p215 (image pending in book-sources/)',
  };
}

/**
 * The warm-up and work weights for the pretest itself, aimed by the athlete's STORED 1RM.
 *
 * ⛔ THE SEED IS NOT THE ANSWER. `predictedFromFile` only sets where the bar starts; the working
 * number comes from what the athlete actually does on the last step. A caller that skips the test
 * and derives a working number from the seed has rebuilt the thing this ruling removed.
 */
export function pretestSession(
  lift: TestedLift,
  predictedFromFile: number,
  roundTo: number,
): { fractionOfPredicted: number; weight: number; reps: number | 'max' }[] | null {
  if (!Number.isFinite(predictedFromFile) || predictedFromFile <= 0) return null;
  const step = Number.isFinite(roundTo) && roundTo > 0 ? roundTo : 5;
  // ⛔ A IS THE UNIT (p215). The warm-up weight is rounded to a loadable increment FIRST, and the
  // upper two steps are multiples of that rounded number — his arithmetic, not three independent
  // fractions. Rounding A first is what keeps 1.1A and 1.15A honest additions to the weight the
  // athlete actually put on the bar.
  const warmup = Math.round((predictedFromFile * PRETEST_WARMUP_FRACTION) / step) * step;
  const stepped = PRETEST_STEPS.map((s) => ({
    fractionOfPredicted: s.fractionOfPredicted,
    weight: Math.round((warmup * s.multipleOfWarmup) / step) * step,
    reps: s.reps,
  }));

  /**
   * ⛔⛔ A COLLIDED WARM-UP IS DROPPED, NEVER PRESCRIBED, AND THE MEASURED STEP NEVER MOVES.
   *
   * ⚠️ **OURS.** p215's arithmetic is 1.00A / 1.10A / 1.15A, and the top two are 0.05A apart — under
   * one loadable increment whenever A is below 100 lb at a 5 lb step. They then round to the SAME
   * weight, and the athlete is prescribed five reps at the test weight immediately before being
   * asked to take that weight for max clean reps. He rounds by eye on one worked example and never
   * addresses a light lift, so this is ours and is labelled.
   *
   * ⛔ FOUND ON MICHAEL'S OWN EXPORT, 2026-08-31, the morning he started the block: an 85 lb press
   * test read `75x6, 85x5, 85x1+`. It is not cosmetic — the pre-fatigue lands on the ONE set the
   * whole block's press numbers are derived from, so it under-reads the max and every prescribed
   * press weight for twelve weeks comes off the depressed number. Bench, squat and deadlift were
   * correct in the same export, which is why it survives a spot-check.
   *
   * ⛔ THE LAST STEP IS THE MEASUREMENT AND IS KEPT AT ITS OWN WEIGHT. So the drop falls on the
   * warm-up, and a light lifter gets a two-rung ramp rather than a nudged-apart three. Nudging would
   * change the tested weight, which is the one number here that may not be invented.
   * ⚠️ Same rule, same reasoning as `warmup.ts` (*"rungs that collide are dropped, not nudged
   * apart"*) — the two ramps now agree.
   */
  const measured = stepped[stepped.length - 1];
  const kept = stepped.filter((s, i) => {
    if (i === stepped.length - 1) return true;
    return stepped.slice(i + 1).every((later) => later.weight !== s.weight);
  });
  return kept.length > 0 ? kept : [measured];
}

/**
 * ⛔ THE FIRST WEEK IS THE TEST WEEK (Michael, 2026-08-23), and this is the rule that says so.
 *
 * His own advice, p275 and p247: pretest before a program so it reflects current potential. So a
 * block does not open on prescribed percentages — it opens on the p215 protocol, run as guided
 * sessions inside week one's lifting days. **Upper on day 1, lower on day 2** (the frame's own ME
 * days). Fully prescribed weights land in week two.
 *
 * ⚠️ A FRESH TEST FOR EVERYONE, every block. Not "if we have no number" — a stored number is a seed
 * and a stale seed is exactly what the test exists to correct.
 */
export const TEST_WEEK_INDEX = 1;

export function isTestWeek(week: number): boolean {
  return week === TEST_WEEK_INDEX;
}

/** Which lifts are tested on which of the frame's ME days. Upper day 1, lower day 2. */
export const TEST_DAY_LIFTS: Record<number, TestedLift[]> = {
  1: ['bench', 'overheadPress'],
  2: ['squat', 'deadlift'],
};

// ── READING THE TEST BACK ────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE HOLE SLICE 1 LEFT, AND THE ONE THIS FILE NOW CLOSES: *"nothing stores it, and the test
 * week's results have nowhere to land."*
 *
 * ⛔ THE READER CANNOT LIVE IN THE COMPOSER, and that is structural rather than stylistic. The
 * composer authors all twelve weeks at build time, so the test has not happened when the block is
 * written — every week after the first would compose with no working number and prescribe nothing.
 * Something has to come back afterwards and read what the athlete actually did.
 * `rematerialize-strength-block` exists for the identical reason on the Get Stronger side, states
 * the identical rule in its own header, and the two never meet: that one reads a the previous program AMRAP at
 * 95% of a training max, this one reads a p215 pretest. No function accepts both.
 *
 * ⚠️ DB SHAPE, DELIBERATELY LOOSE. This is what a stored `workouts` row looks like to a reader, not
 * a type this module owns.
 */
export type LoggedWorkoutRowish = {
  strength_exercises?: unknown;
  week_number?: number | null;
  workout_date?: string | null;
};

export type TestWeekReading = {
  working: Partial<Record<TestedLift, WorkingNumber>>;
  /** ⛔ WHAT COULD NOT BE READ, AND WHY. Never a silent absence — see `TEST_READ_ABSTAINS`. */
  missing: { lift: TestedLift; reason: string }[];
};

/**
 * ⛔ SILENCE IS NOT A NUMBER. A lift whose test set is absent, uncompleted, or unprovable comes back
 * in `missing` with the reason spelled out. The caller states it; nothing here substitutes.
 */
export const TEST_READ_ABSTAINS =
  'A lift with no completed test set keeps no working number, and the block leaves its slots on the '
  + '"by feel" contract rather than prescribing off a set nobody proved was taken.';

/**
 * Pull the working numbers out of week one's logged sessions.
 *
 * @param rows        stored `workouts` rows for this plan.
 * @param liftForName the movement names the block actually prescribed, per lift — the SAME table the
 *                    test session was written from (`testedLiftName`). ⛔ Exact, case-insensitive
 *                    name matching rather than a regex: the composer wrote the name, so the reader
 *                    may demand it back verbatim, and a second fuzzy matcher is a second authority
 *                    on what a lift is called.
 *
 * ⛔ THE `amrap` FLAG IS THE SIGNAL. `testDaySession` stamps it on exactly one set per lift — the
 * last pretest step, taken for max reps. Inferring "the heaviest set" instead would promote an
 * ordinary warm-up into a measurement.
 *
 * ⛔ AND IT MUST BE PROVABLY THE TEST WEEK. A row with no `week_number` cannot be shown to be week
 * one, and twelve weeks of prescription off an unprovable set is the failure this codebase keeps
 * finding. Unprovable is treated as absent, loudly, not as evidence.
 */
export function readTestWeek(
  rows: LoggedWorkoutRowish[] | null | undefined,
  liftForName: Partial<Record<TestedLift, string>>,
): TestWeekReading {
  const wanted = new Map<string, TestedLift>();
  for (const lift of TESTED_LIFTS) {
    const name = liftForName[lift];
    if (typeof name === 'string' && name.trim() !== '') wanted.set(name.trim().toLowerCase(), lift);
  }

  const best = new Map<TestedLift, { weight: number; reps: number }>();
  for (const row of rows ?? []) {
    // ⛔ PROVABLY WEEK ONE, or it is not the test.
    if (Number(row?.week_number) !== TEST_WEEK_INDEX) continue;
    const exercises = Array.isArray(row?.strength_exercises) ? row.strength_exercises : [];
    for (const ex of exercises as Record<string, unknown>[]) {
      const lift = wanted.get(String(ex?.name ?? '').trim().toLowerCase());
      if (!lift) continue;
      const sets = Array.isArray(ex?.sets) ? ex.sets : [];
      for (const set of sets as Record<string, unknown>[]) {
        if (set?.amrap !== true) continue;
        // ⚠️ COMPLETED ONLY. An untouched set carries whatever the prefill left in it, and reading
        // that as a measurement prescribes a block off a number nobody lifted.
        if (set?.completed !== true) continue;
        const weight = Number(set?.weight);
        const reps = Number(set?.reps);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        if (!Number.isInteger(reps) || reps < 1) continue;
        // ⚠️ THE LAST ATTEMPT WINS. An athlete who retook the test meant the second answer.
        best.set(lift, { weight, reps });
      }
    }
  }

  const working: Partial<Record<TestedLift, WorkingNumber>> = {};
  const missing: { lift: TestedLift; reason: string }[] = [];
  for (const lift of TESTED_LIFTS) {
    if (!wanted.has(String(liftForName[lift] ?? '').trim().toLowerCase())) {
      missing.push({ lift, reason: 'this block never prescribed a movement for it' });
      continue;
    }
    const measured = best.get(lift);
    if (!measured) {
      missing.push({ lift, reason: 'no completed test set in week one' });
      continue;
    }
    const wn = workingNumberFromTest(lift, measured);
    if (!wn) {
      missing.push({ lift, reason: `the logged set (${measured.weight} x ${measured.reps}) is not a strength test` });
      continue;
    }
    working[lift] = wn;
  }
  return { working, missing };
}
