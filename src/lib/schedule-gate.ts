/**
 * WHY "YOUR WEEK" IS NOT FINISHED YET — one sentence, or null when it is.
 *
 * ⛔ IT LIVES IN `src/lib` SO IT CAN BE RUN. It was an inline expression in `NonRaceBuilder.tsx`,
 * which is TSX and therefore untestable by `deno test`, and it shipped a state where the athlete
 * looked at a fully built six-day week — every anchor placed, the preview rendered — beside a dead
 * Continue button. A rule that decides whether the flow can proceed and cannot be executed by a test
 * is the exact shape of rule this repo has been burned by before (`anchor-days.ts` was extracted for
 * the same reason).
 *
 * ── WHAT WENT WRONG, SO NOBODY RESTORES IT ───────────────────────────────────────────────────────
 *
 * The old gate required `runDays > 0` and `rideDays > 0` for every posture-present discipline. Two
 * independent faults:
 *
 *   1. **0 IS THE LEGAL UNSET.** The counts ship at 0 under the 2026-07-29 no-prefill rule (a pill
 *      that arrives lit is an answer, not a question), and `assemblePayload` sends `run_days` only
 *      when `>= 2` and `ride_days` only when set — so never picking one omits the field and the
 *      engine keeps its own default. The payload path called the count optional and the gate called
 *      it required. That is why the preview could build a perfect week while the button refused.
 *
 *   2. **IT ASKED ABOUT ROWS THE CARD DOES NOT SHOW.** The gate keyed off "posture is not out" while
 *      the Rides row renders only for `bike === 'maintain'` — so a `develop` bike hid the question
 *      and still demanded its answer, with no control on screen to satisfy it.
 *
 * ⚠️ SO THE CALLER PASSES WHAT IT RENDERS. `runShown`/`rideShown` are the SAME booleans the rows are
 * built from. A question that is not on screen can never block the screen.
 *
 * ⚠️ AND IT RETURNS A SENTENCE, NEVER A BOOLEAN. A disabled button that says nothing is
 * indistinguishable from a broken one. The caller derives "can continue" from `=== null`, so the
 * button and the explanation are the same decision and cannot drift apart.
 *
 * ⚠️ VOICE: fact-first, no imperative — the app names what is missing and what a tap would do, it
 * does not instruct. Asserted against `voiceViolation()` in the test beside this file.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/schedule-gate.test.ts
 */

export type ScheduleGateInput = {
  /** Is the Long run / Runs a week pair on screen? Same predicate the rows use. */
  runShown: boolean;
  /** Is the Long ride / Rides a week pair on screen? Same predicate the rows use. */
  rideShown: boolean;
  longRunDay: string;
  longRideDay: string;
  /** 0 = never picked, which is legal — the engine places them. */
  runDays: number;
  rideDays: number;
  /** Typed on the previous step. '' = never entered. */
  targetMiles: number | '';
  rideHours: number | '';
  /** The one hard day, keyed by sport: `{}` = declined, `{ run: '' }` = half-answered. */
  qualityDays: Record<string, string>;
};

/**
 * A long day is only REQUIRED once the athlete has said enough for it to mean something: two or
 * more sessions AND a volume to spread across them. Below that there is nothing to anchor and the
 * engine places what it likes.
 */
export function longDayCalledFor(i: ScheduleGateInput, d: 'run' | 'bike'): boolean {
  return d === 'run'
    ? i.runDays >= 2 && Number(i.targetMiles) > 0
    : i.rideDays >= 2 && Number(i.rideHours) > 0;
}

export function scheduleBlockedReason(i: ScheduleGateInput): string | null {
  if (i.runShown && longDayCalledFor(i, 'run') && !i.longRunDay) return 'The long run has no day yet.';
  if (i.rideShown && longDayCalledFor(i, 'bike') && !i.longRideDay) return 'The long ride has no day yet.';
  // ⛔ THE HARD DAY IS OPTIONAL (D-327 permits one; it never required one), so only a HALF-answer
  // blocks. A discipline with no day leaves an anchor the solver cannot place; declining the whole
  // question is a complete answer and passes.
  for (const d of ['run', 'bike']) {
    if (d in i.qualityDays && !i.qualityDays[d]) {
      return 'The hard day has a discipline but no day. Tapping the discipline again drops it.';
    }
  }
  return null;
}

/** Sugar for the caller — the button is enabled exactly when there is no sentence to show. */
export function scheduleCanContinue(i: ScheduleGateInput): boolean {
  return scheduleBlockedReason(i) === null;
}
