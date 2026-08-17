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

/**
 * ⛔ THE ORDER THE CARD ASKS ITS QUESTIONS IN — REQUIRED FIRST, THE OPTIONAL ONE LAST.
 *
 * ⚠️ IT LIVES HERE, BESIDE THE GATE, BECAUSE IT HAS BEEN GOT WRONG TWICE. The hard day originally
 * LED this card, which reads as a requirement — a declinable question in the first slot tells the
 * athlete they must answer it. It was moved once (2026-08-10) to sit under the two long days, and
 * then again to the bottom, under the counts. Order is a rule here, not a layout preference:
 * everything the athlete MUST answer comes first, and the one thing they may decline comes last.
 *
 * A literal array in the component is a rule nothing can check. This one is pinned by
 * `schedule-gate.test.ts`, so the next reorder has to argue with a test rather than a comment.
 */
export const SCHEDULE_ROW_ORDER = ['long', 'ride', 'runs', 'rides', 'hard'] as const;
export type ScheduleRowKey = typeof SCHEDULE_ROW_ORDER[number];

/**
 * The rows the athlete may leave unanswered. ⚠️ EXACTLY ONE. The hard day is a SESSION you can
 * decline and still have a complete week (D-327 permits one; it never required one). Everything
 * else is a parameter that always has a value — see the note in `scheduleBlockedReason` on why
 * frequency in particular is not optional however much it looks like it.
 */
export const SCHEDULE_OPTIONAL_ROWS: ReadonlySet<ScheduleRowKey> = new Set<ScheduleRowKey>(['hard']);

export type ScheduleGateInput = {
  /** Is the Long run / Runs a week pair on screen? Same predicate the rows use. */
  runShown: boolean;
  /** Is the Long ride / Rides a week pair on screen? Same predicate the rows use. */
  rideShown: boolean;
  longRunDay: string;
  longRideDay: string;
  /**
   * 0 = never picked, and it is NOT legal — see the note in `scheduleBlockedReason`. The server's
   * fallback for an unsent `run_days` is a hardcoded 2, so leaving this at 0 does not mean "the
   * engine decides", it means "the engine got 2 and nobody said so".
   */
  runDays: number;
  rideDays: number;
  /** Typed on the previous step. '' = never entered. */
  targetMiles: number | '';
  rideHours: number | '';
  /** The race path's club night, keyed by sport: `{}` = declined, `{ run: '' }` = half-answered. */
  qualityDays: Record<string, string>;
  /**
   * ⛔ THE STRONG FOCUS HARD DAYS — UP TO TWO, ANY MIX (§1i, 2026-08-17). `qualityDays` above is
   * keyed by sport and cannot express two hard runs, so the strength path sends this instead.
   * Absent → the gate reads only `qualityDays`, which is the pre-§1i behaviour exactly.
   */
  hardDays?: Array<{ discipline: string; day: string }>;
};

/**
 * A long day is only REQUIRED once the athlete has said enough for it to mean something: two or
 * more sessions AND a volume to spread across them. Below that there is nothing to anchor and the
 * engine places what it likes.
 */
export function longDayCalledFor(i: ScheduleGateInput, d: 'run' | 'bike'): boolean {
  return d === 'run'
    ? i.runDays >= 2 && Number(i.targetMiles) > 0
    // ⛔ ONE RIDE A WEEK NEEDS NO LONG-RIDE DAY. With a single ride there is nothing to distinguish
    // it FROM — it is the week's ride, long by default. The threshold is the rule, not an accident.
    : i.rideDays >= 2 && Number(i.rideHours) > 0;
}

export function scheduleBlockedReason(i: ScheduleGateInput): string | null {
  /**
   * ⛔ FREQUENCY IS REQUIRED, AND CALLING IT OPTIONAL WAS A LIE WITH A NUMBER BEHIND IT (2026-08-10).
   *
   * These two rows read "Optional · Auto" for one day. "Auto" was not the engine being clever —
   * `create-goal-and-materialize-plan/index.ts:2583` reads
   *
   *     endurance_frequency: run_days >= 2 && run_days <= 4 ? run_days : 2
   *
   * a hardcoded fallback of TWO. So the card told the athlete the app had it handled while it
   * quietly chose two runs a week; at 25 weekly miles that is two 12.5-mile runs, which is a
   * different plan, not a different phrasing of one.
   *
   * ⚠️ AND IT IS NOT THE SAME KIND OF QUESTION AS THE HARD DAY. The hard day is a SESSION you can
   * decline and the week is still complete. Frequency is a PARAMETER that always has a value:
   * weekly volume ÷ sessions = session length, and session length is what decides whether the week
   * is feasible at all. No plan builder in the field makes it optional, because there is no
   * "unanswered" state — only an answer the athlete gave or one given for them.
   *
   * ⛔ REQUIRING IT ALSO KILLS A TRAP THAT WAS REPORTED ON DEVICE: with the count unset,
   * `longDayCalledFor` was false and Continue was LIVE; picking a count made the long run required
   * and Continue DIED. Answering an optional question created a new requirement. Now the count is
   * asked from the start, so the gate only ever moves toward enabled — one reason at a time, each
   * replaced by the next, never a new one appearing because the athlete answered something.
   *
   * ⚠️ THIS DOES NOT REVERSE THE 2026-07-29 NO-PREFILL RULE. That rule says do not answer for the
   * athlete; a silent server-side 2 is answering for them with the answer hidden. The pills stay
   * unlit and the row reads "Pick one" — the principle is enforced here, not abandoned.
   */
  // ⛔ ONE-AT-A-TIME BY CONTRACT — the FIRST blocker in row order. The pinned sequence tests assert
  // this stays first-only. The full list lives in `scheduleBlockedReasons` below (single source); this
  // singular is just its head, so the two can never disagree.
  return scheduleBlockedReasons(i)[0] ?? null;
}

// ⛔ EVERY blocker at once, in row order (runs, rides, long run, long ride, hard). The gate is STILL
// one-at-a-time for the BOOLEAN (`scheduleCanContinue` reads `=== null` on the singular), but a card
// can show every unanswered required field together instead of making the athlete clear them one by
// one and meet the next — friction-free entry. This is the single source; the singular reads [0].
export function scheduleBlockedReasons(i: ScheduleGateInput): string[] {
  const out: string[] = [];
  if (i.runShown && i.runDays < 2) out.push('Runs a week has no number yet.');
  if (i.rideShown && i.rideDays < 1) out.push('Rides a week has no number yet.');
  if (i.runShown && longDayCalledFor(i, 'run') && !i.longRunDay) out.push('The long run has no day yet.');
  if (i.rideShown && longDayCalledFor(i, 'bike') && !i.longRideDay) out.push('The long ride has no day yet.');
  // Hard days are OPTIONAL (§1i permits up to two; never required one), so only a HALF-answer
  // blocks: a discipline chosen with no day leaves an anchor the solver cannot place. Declining
  // passes. ⚠️ ONE SENTENCE HOWEVER MANY SLOTS ARE HALF-ANSWERED — two copies of the same line is
  // noise, and the fix for both is the same tap.
  const halfAnswered = ['run', 'bike'].some((d) => d in i.qualityDays && !i.qualityDays[d])
    || (i.hardDays ?? []).some((h) => !h.day);
  if (halfAnswered) {
    out.push('A hard session has a discipline but no day. Tapping the discipline again drops it.');
  }
  return out;
}

/** Sugar for the caller — the button is enabled exactly when there is no sentence to show. */
export function scheduleCanContinue(i: ScheduleGateInput): boolean {
  return scheduleBlockedReason(i) === null;
}
