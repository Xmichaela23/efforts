// ============================================================================
// THE WORKING NUMBER — Viada's, and a DIFFERENT NUMBER from Wendler's training max.
//
// Source: p215. ⚠️ **IMAGE PENDING IN `book-sources/`** — the page was photographed 2026-08-22 and
// read in the planning chat; the file has not landed in the folder yet, so this is the one set of
// constants in the Standing Plan that cannot currently be re-checked against an image on disk.
// Corpus: `SOURCE-viada-hybrid-athlete.md` Part H. Gap G-7 closes when `p215.jpg` arrives.
//
// ⛔ THE SAME-WORD COLLISION, AND IT IS THE WHOLE REASON THIS FILE IS SEPARATE.
//
//     Wendler   `plans.config.training_max`   85% of a TRUE 1RM        three live readers
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
 * ⛔ 96% OF THE PREDICTED TRUE 1RM (p215). Not 85%, not of a true max, and not Wendler's.
 */
export const WORKING_MAX_FRACTION = 0.96;

/**
 * ⛔ THE PRETEST, AS HE WRITES IT (p215). Warm up to roughly 75% of the PREDICTED max, then three
 * steps.
 *
 * ⛔ "PREDICTED MAX" IS THE NUMBER ALREADY ON FILE. The athlete's stored 1RM sets the warm-up
 * weights — it is the SEED for the test, never the answer to it. That distinction is the whole of
 * Michael's 2026-08-23 ruling: a fresh test runs for everyone at block start, and a stored baseline
 * may only aim it.
 */
export const PRETEST_STEPS: { fractionOfPredicted: number; reps: number | 'max' }[] = [
  { fractionOfPredicted: 0.75, reps: 6 },
  { fractionOfPredicted: 0.85, reps: 5 },
  { fractionOfPredicted: 0.90, reps: 'max' },
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
 * path from Wendler's number into this one.
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
  return PRETEST_STEPS.map((s) => ({
    fractionOfPredicted: s.fractionOfPredicted,
    weight: Math.round((predictedFromFile * s.fractionOfPredicted) / step) * step,
    reps: s.reps,
  }));
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
