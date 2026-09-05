// ============================================================================
// THE ME SET LADDER, READ OFF WHAT THE ATHLETE ACTUALLY LIFTED.
//
// ⛔ THE SAME SHAPE AS `demonstrated-history.ts` AND FOR THE SAME REASON: a set is earned on
// DEMONSTRATED work, never on an intention. There is no preference anywhere that adds a set.
//
// ⛔ AND IT DECIDES NOTHING. It reports what each pattern has earned; `composeWeek` prescribes it and
// `restateFromTest` proposes the change. Nothing here writes, exactly as
// `rematerialize-standing-block`'s own law requires — *"it proposes; it does not silently write."*
// ============================================================================

import type { ComposedWeek, MeRowIndex } from './compose.ts';
import { LOWER_PATTERNS, ME_SETS_BAND } from './compose.ts';
import {
  advanceStep,
  BAR_LADDER_START,
  barLadderStep,
  barSessionSignal,
  meLadderStep,
  meSessionOutcome,
  type BarLadderState,
  type BarSessionSignal,
  type LoggedMeSet,
  type MeLadderState,
  type MeSessionOutcome,
} from './progression.ts';
import { prescribe, type ViadaPattern } from '../strength-grid/index.ts';
import { weekdayOf } from './restate.ts';

/**
 * ⚠️ DB shape, deliberately loose — a completed strength workout joined to its planned week.
 *
 * ⚠️ NAMED FOR THIS READER, NOT GENERICALLY. `test-skip.ts` already exports a `LoggedStrengthRowish`
 * for a different question (was there a trustworthy max in the last N days), and two exports of one
 * name off the same barrel is an ambiguity `deno check` refuses outright.
 */
export type LoggedMeWorkoutRowish = {
  week_number?: number | null;
  /** The PLANNED row's date. ⚠️ A logged workout carries no plan week of its own. */
  date?: string | null;
  strength_exercises?: unknown;
};

export type MeLadderReading = {
  /** What each pattern has earned. Absent patterns are the band's low end by omission. */
  sets: Partial<Record<ViadaPattern, number>>;
  /**
   * ⛔ POUNDS THE BAR HAS EARNED ON TOP OF THE SCHEDULED RISE, per pattern (2026-08-26).
   *
   * ⚠️ IT IS AN OFFSET AND NOT A WEIGHT. `scheduledRise` still owns the floor — his one per cent
   * every three weeks — and this sits on top of it. Absent, or zero, is a pattern that has not
   * earned an increment, which is every pattern at the start of every block.
   */
  bar: Partial<Record<ViadaPattern, number>>;
  /**
   * ⚠️ THE WHOLE LADDER STATE, for the surfaces that need more than the number: what the athlete got
   * last time at this weight (stage 2's honest rep prefill), and which increments are stacked up and
   * therefore undoable. Provenance, never a decision.
   */
  barState: Partial<Record<ViadaPattern, BarLadderState>>;
  /**
   * ⛔ WHAT THE ATHLETE ACTUALLY GOT AT THE WEIGHT THEY ARE ON, most recent last (stage 2).
   *
   * ⚠️ IT IS `barState[p].recentReps` LIFTED OUT rather than a second computation, because two
   * surfaces need it and neither should reach into a ladder's internals to find it: the plan row
   * prints it, and the logger opens its rep cell on the last entry. ⛔ EMPTY AFTER A JUMP, and that
   * is correct — there is no last time at the NEW weight, and the row saying nothing beats it
   * repeating a number earned on a lighter bar.
   */
  lastReps: Partial<Record<ViadaPattern, number[]>>;
  /** Per pattern, the sessions that were read and what each one was. Provenance, never a decision. */
  history: Partial<Record<ViadaPattern, {
    week: number;
    day: string;
    movement: string;
    outcome: MeSessionOutcome;
    /** What the same session said about the BAR — a separate axis with a separate threshold. */
    bar: BarSessionSignal;
    /** The offset standing after this session, so a jump and its undo are both visible in the walk. */
    barOffsetLb: number;
  }[]>>;
  /** ⛔ ME rows the reader found no logged session for. Silence holds; saying so is not optional. */
  unread: number;
};

// ── THE DELOAD TRIGGER — a SECOND QUESTION over the reading above ───────────────────────────────

/**
 * ⛔⛔ HIS ONLY STATED DELOAD TRIGGER, p245 (Hypertrophy + 5K notes, read off the image 2026-08-29):
 *
 * > *"If performance begins to suffer, particularly **if the ME lifts underperform 2 weeks in a
 * > row**, consider running a single deload week."*
 *
 * ⛔ THIS IS A DIFFERENT QUESTION FROM `earnedMeSets`, OVER THE SAME DATA — the pattern `CLAUDE.md`
 * names: the ladder asks *"what has this pattern earned"* and walks per-pattern runs; this asks
 * *"did the whole block have two bad weeks back to back"*, which is a per-WEEK question across all
 * patterns at once. **Neither answer can be derived from the other**, which is why this is an
 * accessor beside the ladder rather than a field inside it.
 *
 * ⛔ AND IT READS `reading.history`, WHICH IS ALREADY RETURNED. No second walk, no second matcher.
 * A second name-matching pass over the logged rows is how two readers start disagreeing about which
 * session was which.
 *
 * ⛔⛔ IT PROPOSES. IT DOES NOT WRITE, AND IT DOES NOT INSERT A WEEK. Two reasons, neither of them a
 * preference: **p245 says "consider"**, and `rematerialize-standing-block`'s own law is *"it
 * proposes; it does not silently write."* The silent strength auto-progression was deleted from
 * `adapt-plan` for exactly this — *"the athlete opened the logger to a number they never agreed
 * to."* A deload rewrites a week the athlete is training against; it is the same act.
 */
export type DeloadProposal = {
  /** The week that should run the taper column if the athlete accepts. */
  week: number;
  /** The two weeks whose evidence triggered it, in order. */
  because: [number, number];
  /** Every ME session that came up short in those two weeks. Provenance, never a decision. */
  evidence: { week: number; day: string; movement: string }[];
  cite: string;
};

/**
 * ⚠️ WHAT COUNTS AS A WEEK THAT UNDERPERFORMED — OURS, AND p245 IS GENUINELY AMBIGUOUS.
 *
 * He writes *"the ME lifts"* (plural) and gives no rule for how many. Two readings are available:
 * **any** ME session in the week scoring `setback`, or **every** one of them. This takes ANY, and
 * the reason is the shape of the consequence rather than a view about training: the output is a
 * PROPOSAL the athlete can decline, so offering one week early costs a tap and missing one costs a
 * dug hole. ⛔ If this ever becomes an automatic insert, revisit this line first — the cost
 * asymmetry that justifies it disappears the moment the athlete stops being asked.
 */
export const DELOAD_WEEK_IS_BAD_IF_ANY_ME_SETBACK_IS_OURS =
  'p245 says "the ME lifts underperform 2 weeks in a row" without saying how many lifts. We count a '
  + 'week as underperforming if ANY heavy session in it came up short, because the result is a '
  + 'proposal the athlete can decline — offering one early costs a tap, missing one costs a hole.';

/**
 * ⛔⛔ A MISSED WEEK RESETS THE RUN — CORRECTED 2026-08-29, THE SAME DAY IT SHIPPED SKIPPING.
 *
 * ⚠️ WHAT THIS SAID FIRST, AND WHY IT WAS WRONG: *"a silent week is SKIPPED — counting it reads
 * absence as failure, resetting on it reads absence as success, so skipping is the only reading that
 * adds nothing."* The logic was sound and the premise was not. **It treated a missed week as
 * information the app does not have. The field treats it as information it does.**
 *
 * ⛔ THE PRECEDENT IS CONSISTENT AND IT POINTS ONE WAY: a missed week is **an unplanned recovery
 * week**, not a symptom.
 *   · one or two missed sessions — ignore them, carry on;
 *   · a whole missed week — *"treat it as an unplanned recovery week and start where you left off"*;
 *   · two weeks — measurable detraining begins (VO2max down 4-7% even in trained athletes);
 *   · a month — start the block over.
 *   (TrainRight, Koop, Wahoo — 2026-08-29. ⚠️ **Secondary sources, not a page of Viada.**)
 *
 * ⛔ SO THE ATHLETE ALREADY GOT THE REST, AND A DELOAD IS THE REST. Proposing one after a week off
 * offers a thing that already happened. Two short weeks separated by a week away are not *"2 weeks in
 * a row"* in any reading of p245 — the row was broken by the break.
 *
 * ⚠️ STILL OURS, AND STILL NOT SYMMETRICAL WITH COUNTING IT BAD. Resetting does not read absence as
 * *success*; it reads absence as **rest**, which is what the absence physically was. Counting it as a
 * bad week would still be reading absence as failure, and that stays refused.
 *
 * ⛔ WHAT THIS DOES **NOT** HANDLE, AND IT IS THE LARGER GAP: **time off should bring the WEIGHT
 * down, and nothing does that.** `scheduledRise` is a pure function of the week number, so an
 * athlete returning from a fortnight away is handed a heavier bar than they left — while the
 * literature says two weeks off is where detraining starts. **Raised, not built.** It changes
 * prescribed weights and belongs with the p112 "decrease load if you fail to achieve targets" gap,
 * not smuggled in behind a deload counter.
 */
export const DELOAD_MISSED_WEEK_RESETS_IS_OURS =
  'A week with no logged heavy session RESETS the run rather than being skipped or counted. The '
  + 'field treats a missed week as an unplanned recovery week - the athlete already got the rest a '
  + 'deload would have given them, so two short weeks either side of a break are not two in a row. '
  + 'Counting a missed week as a BAD week stays refused: that would read absence as failure.';

/**
 * ⛔ TWO IN A ROW, and the number is HIS — the one place in this module where a threshold is not
 * ours. p245 says two. It happens to match `STALL_CONFIRMATIONS` and `ME_CLEAN_SESSIONS_TO_EARN`,
 * which are ours and were chosen for symmetry with it.
 */
export const DELOAD_CONSECUTIVE_BAD_WEEKS = 2;

/**
 * Propose a deload week, or don't.
 *
 * @param reading    the ladder reading for this block — `history` is the only field read.
 * @param throughWeek evidence stops here, the same boundary `earnedMeSets` draws. The live week is
 *                    still being trained.
 * @param alreadyTaper weeks the block ALREADY runs as taper. ⛔ A block that is already deloading
 *                    week N must not be told to deload week N, and the two bad weeks that produced
 *                    an accepted proposal must not produce it again next restate.
 *
 * ⚠️ RETURNS THE LATEST PROPOSAL, NOT ALL OF THEM. Two bad weeks in week 3-4 and again in 8-9 is one
 * live decision — the athlete is being asked about the week in front of them, not offered a history
 * of weeks they have already trained through.
 */
export function deloadProposal(args: {
  reading: MeLadderReading;
  throughWeek: number;
  totalWeeks: number;
  alreadyTaper?: number[] | null;
}): DeloadProposal | null {
  const taper = new Set((args.alreadyTaper ?? []).filter((w) => Number.isFinite(w)));

  /** week -> the short sessions in it. A week absent from this map had no evidence either way. */
  const short = new Map<number, { week: number; day: string; movement: string }[]>();
  const evidenced = new Set<number>();

  for (const entries of Object.values(args.reading.history ?? {})) {
    for (const e of entries ?? []) {
      if (!Number.isFinite(e.week) || e.week > args.throughWeek) continue;
      // ⛔ `no_evidence` IS NOT A BAD WEEK. It is a matched row whose sets were never completed —
      // silence, which holds. It does not mark the week as evidenced either.
      if (e.outcome === 'no_evidence') continue;
      evidenced.add(e.week);
      if (e.outcome !== 'setback') continue;
      const bucket = short.get(e.week) ?? [];
      bucket.push({ week: e.week, day: e.day, movement: e.movement });
      short.set(e.week, bucket);
    }
  }

  /**
   * ⛔ CONSECUTIVE MEANS CONSECUTIVE ON THE CALENDAR, NOT "the next week that said something".
   *
   * The run is walked over week NUMBERS from 1 to `throughWeek`, so a week with no logged heavy
   * session breaks it — that is `DELOAD_MISSED_WEEK_RESETS_IS_OURS` expressed as a loop rather than
   * a comment. ⚠️ An earlier version walked only the evidenced weeks, which made weeks 3 and 5
   * "consecutive" across a missed week 4.
   */
  let proposal: DeloadProposal | null = null;
  const firstWeek = 1;
  const lastWeek = Math.max(firstWeek, Math.floor(args.throughWeek));
  for (let end = firstWeek + (DELOAD_CONSECUTIVE_BAD_WEEKS - 1); end <= lastWeek; end++) {
    const run: number[] = [];
    for (let w = end - (DELOAD_CONSECUTIVE_BAD_WEEKS - 1); w <= end; w++) run.push(w);
    // ⛔ EVERY WEEK IN THE RUN MUST HAVE SAID SOMETHING AND SAID IT WAS SHORT. A week absent from
    // `evidenced` is a missed week and breaks the run; a week that was trained and was not short
    // breaks it too.
    if (!run.every((w) => evidenced.has(w) && short.has(w))) continue;

    // The week to deload is the one after the second bad week — the next one the athlete trains.
    const target = run[run.length - 1] + 1;
    if (target > args.totalWeeks) continue;
    // ⛔ ALREADY DELOADING IS NOT A REASON TO DELOAD. This is also what stops an accepted proposal
    // from being re-offered every restate off the same two weeks.
    if (taper.has(target)) continue;

    proposal = {
      week: target,
      because: [run[0], run[run.length - 1]] as [number, number],
      evidence: run.flatMap((w) => short.get(w) ?? []),
      cite: 'Viada p245',
    };
  }
  return proposal;
}

/** ⛔ HIS REP BAND FOR ME (p218), read off stage 2 rather than restated. */
function meRepBand(): { lo: number; hi: number } {
  const p = prescribe('ME', 'barbell');
  return p.kind === 'barbell' ? p.reps : { lo: 1, hi: 1 };
}

/**
 * ⛔⛔ AN AUTOFILLED RIR IS NOT EVIDENCE, AND THIS IS THE ONE PLACE THAT DECIDES IT (2026-08-29).
 *
 * ⛔ D-203: the logger COMPLETES A SET WITH THE PRESCRIBED RIR when the athlete did not type one,
 * and stamps `rir_autofilled: true` on it. So `rir` is populated on most sets whether or not anyone
 * said anything, and the flag is the only thing that tells them apart.
 *
 * ⛔ WITHOUT THIS THE ENGINE GRADES ITS OWN SUGGESTION. `meSessionOutcome` reads `rir === 0` as the
 * grind that costs a set, and `progressionVerdict` gates advancement on the reserve — both would be
 * scoring a number the app wrote. **The tell would be an app telling an athlete they are handling
 * the weight well because it filled in the number that says so.**
 *
 * ⛔ TWO OTHER READERS IN THIS CODEBASE ALREADY DO EXACTLY THIS, and this is the third:
 *   · `compute-facts/strength-facts-lib.ts:197` — `… && !s.rir_autofilled` before it counts;
 *   · `analyze-strength-workout/index.ts:547` — the same filter on executed sets.
 * **The Viada engine was the one that did not**, and it is the engine that moves the bar.
 *
 * ⚠️ AUTOFILLED BECOMES ABSENT, NOT ZERO — the D-324 rule, unchanged. `meSessionOutcome` already
 * says an absent RIR is not a grind, and `progressionVerdict` already advances on reps alone when no
 * reserve was reported. So dropping the flagged ones lands both readers on their existing
 * "did not say" branch rather than on a new one.
 *
 * ⚠️ IT IS FIXED AT THE BOUNDARY, ONCE. `setsOf` is the only place a stored row becomes a
 * `LoggedMeSet`, and `earnedMeSets` is the only caller of both readers — so one condition here is
 * the whole fix, and a fourth reader cannot forget it.
 *
 * ⚠️ **THIS CHANGES LIVE VERDICTS.** Sessions previously scored on a suggested reserve will grade
 * differently — some advances that were gated on an autofilled number will now advance on reps
 * alone, and some `setback`s read off an autofilled 0 will stop firing. That is the point, and it is
 * why it lands before any surface is built on top of the signal.
 */
function setsOf(ex: Record<string, unknown>): LoggedMeSet[] {
  const raw = ex?.sets;
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((s) => ({
    reps: Number(s?.reps),
    weight: Number(s?.weight),
    // ⚠️ ABSENT STAYS ABSENT. `Number(undefined)` is NaN and would never equal 0, but writing it as
    // null makes the "did not say" case legible at the one place that reads it.
    // ⛔ AND AN AUTOFILLED NUMBER IS ABSENT — see the block above.
    rir: s?.rir_autofilled === true
      ? null
      : (typeof s?.rir === 'number' ? s.rir : null),
    completed: s?.completed === true,
  }));
}

/**
 * ⛔ WHAT EACH PATTERN'S ME SLOT HAS EARNED, AS OF `throughWeek`.
 *
 * @param composed    the block re-composed at its authored shape. ⚠️ It must be the SAME composition
 *                    the athlete trained against, or the movement names will not match and every
 *                    session reads as `unread` — the silent no-op `restateFromTest` warns about.
 * @param logged      completed strength workouts, each carrying the week and date of the PLANNED row
 *                    it was logged against.
 * @param throughWeek evidence stops here. The live week is still being trained and history is not
 *                    editable, which is the same boundary the restater draws.
 *
 * ⚠️ MATCHED ON WEEK + WEEKDAY + MOVEMENT NAME, the identical three keys `restateFromTest` uses. Two
 * are not enough: a day carries several movements, and bench appears on two days of the frame.
 */
export function earnedMeSets(args: {
  composed: ComposedWeek[];
  logged: LoggedMeWorkoutRowish[] | null | undefined;
  throughWeek: number;
  /**
   * ⚠️ THE SEAM FOR THE PLATE QUESTION, AND IT IS DELIBERATELY UNWIRED. `advanceStep` raises the
   * increment to something the athlete can actually load; absent leaves the 5 lb upper / 10 lb lower
   * default, which assumes the pair of 2.5s nearly everyone has. Nothing in the app writes this yet.
   */
  smallestPlatePairLb?: number | null;
}): MeLadderReading {
  const band = ME_SETS_BAND;
  const repBand = meRepBand();

  const index = new Map<string, MeRowIndex>();
  for (const wk of args.composed) {
    for (const row of wk.meRows ?? []) {
      if (row.week > args.throughWeek) continue;
      /**
       * ⛔ A "BY FEEL" ROW EARNS NOTHING AND SETS NO RUNG (Michael's squat, 2026-09-04). A composed ME
       * row with `weight: null` had no prescription — the by-feel week before the test is read. The set
       * the athlete logged against it is calibration, not evidence for the ladder: read as a rung it
       * became `recentReps [6]` at 105 and every later squat opened at 105 × 6, a rep count above the
       * ME band, copied from a set that was never prescribed. Skip the row; the test week's own read
       * (`readTestWeek`) is where those sets are measured.
       */
      if (row.weight == null) continue;
      index.set(`${row.week}|${row.day}|${row.movement.toLowerCase()}`, row);
    }
  }

  // ⚠️ THE RAW SETS TRAVEL WITH THE ROW. The set ladder reads an OUTCOME and the bar ladder reads the
  // reps themselves against a different threshold, so one walk feeds two mechanisms off one match.
  type Seen = { row: MeRowIndex; outcome: MeSessionOutcome; sets: LoggedMeSet[] };
  const seen: Seen[] = [];
  const matched = new Set<string>();

  for (const wkRow of args.logged ?? []) {
    const week = Number(wkRow?.week_number);
    // ⚠️ NO `week > throughWeek` TEST HERE, AND THAT IS MEASURED RATHER THAN ASSUMED. One stood here
    // and mutation testing showed it guarded nothing: the INDEX is already bounded above, so a logged
    // row past the boundary finds no entry and falls through on its own. A branch that cannot change
    // an answer is the dead guard this codebase keeps deleting (`lowerBodyHaircut` lost one the same
    // way). ⛔ The boundary itself is load-bearing — it lives on the index build.
    if (!Number.isFinite(week)) continue;
    const day = weekdayOf(wkRow?.date);
    if (!day) continue;
    const exercises = Array.isArray(wkRow?.strength_exercises) ? wkRow.strength_exercises : [];
    for (const ex of exercises as Record<string, unknown>[]) {
      const key = `${week}|${day}|${String(ex?.name ?? '').trim().toLowerCase()}`;
      const row = index.get(key);
      if (!row) continue;
      matched.add(key);
      const sets = setsOf(ex);
      seen.push({
        row,
        sets,
        outcome: meSessionOutcome({
          sets,
          prescribedSets: row.sets,
          repBand,
          prescribedWeight: row.weight,
        }),
      });
    }
  }

  /**
   * ⛔ IN THE ORDER THEY WERE TRAINED. The ladder is a run of consecutive sessions, so reading them
   * out of order would let a week-9 session earn a set that a week-3 setback should have cancelled.
   * ⚠️ Week first, then weekday, and the weekday order is the calendar's — `restate.ts` already owns
   * the weekday names and this borrows their index rather than sorting alphabetically, where Friday
   * precedes Monday.
   */
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  seen.sort((a, b) => (a.row.week - b.row.week)
    || (DAY_ORDER.indexOf(a.row.day) - DAY_ORDER.indexOf(b.row.day)));

  const state = new Map<ViadaPattern, MeLadderState>();
  const bars = new Map<ViadaPattern, BarLadderState>();
  const history: MeLadderReading['history'] = {};
  for (const s of seen) {
    const cur = state.get(s.row.pattern) ?? { sets: band.lo, cleanRun: 0 };
    state.set(s.row.pattern, meLadderStep(cur, s.outcome, band));

    /**
     * ⛔ THE BAR WALKS THE SAME SESSIONS ON ITS OWN AXIS (2026-08-26). The set ladder asks whether the
     * athlete has recovery to spare for a second set; the bar asks whether they finished the rep
     * range twice running. ⚠️ The thresholds differ on purpose — a set is earned within one rep of
     * the top, the bar needs the top itself — so the two must never be collapsed into one verdict.
     *
     * ⚠️ THE INCREMENT IS THE PATTERN'S, NOT THE SLOT'S: 10 lb on a lower-body lift, 5 on an upper,
     * raised to whatever the athlete's plates can actually make.
     */
    const stepLb = advanceStep(
      LOWER_PATTERNS.includes(s.row.pattern),
      args.smallestPlatePairLb ?? null,
    );
    const nextBar = barLadderStep(bars.get(s.row.pattern) ?? BAR_LADDER_START, {
      sets: s.sets, repBand, stepLb,
    });
    bars.set(s.row.pattern, nextBar);

    (history[s.row.pattern] ??= []).push({
      week: s.row.week,
      day: s.row.day,
      movement: s.row.movement,
      outcome: s.outcome,
      bar: barSessionSignal(s.sets, repBand).signal,
      barOffsetLb: nextBar.offsetLb,
    });
  }

  const sets: Partial<Record<ViadaPattern, number>> = {};
  for (const [pattern, st] of state) sets[pattern] = st.sets;

  // ⛔ ONLY A PATTERN THAT ACTUALLY EARNED SOMETHING APPEARS. A zero offset is the same prescription
  // as no offset, and reporting it would put every untested pattern in a diff that changed nothing.
  const bar: Partial<Record<ViadaPattern, number>> = {};
  const barState: Partial<Record<ViadaPattern, BarLadderState>> = {};
  const lastReps: Partial<Record<ViadaPattern, number[]>> = {};
  for (const [pattern, st] of bars) {
    barState[pattern] = st;
    if (st.offsetLb > 0) bar[pattern] = st.offsetLb;
    if (st.recentReps.length > 0) lastReps[pattern] = st.recentReps;
  }

  return {
    sets, bar, barState, lastReps, history,
    unread: [...index.keys()].filter((k) => !matched.has(k)).length,
  };
}
