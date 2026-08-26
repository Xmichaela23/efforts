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

/** ⛔ HIS REP BAND FOR ME (p218), read off stage 2 rather than restated. */
function meRepBand(): { lo: number; hi: number } {
  const p = prescribe('ME', 'barbell');
  return p.kind === 'barbell' ? p.reps : { lo: 1, hi: 1 };
}

function setsOf(ex: Record<string, unknown>): LoggedMeSet[] {
  const raw = ex?.sets;
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((s) => ({
    reps: Number(s?.reps),
    weight: Number(s?.weight),
    // ⚠️ ABSENT STAYS ABSENT. `Number(undefined)` is NaN and would never equal 0, but writing it as
    // null makes the "did not say" case legible at the one place that reads it.
    rir: typeof s?.rir === 'number' ? s.rir : null,
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
