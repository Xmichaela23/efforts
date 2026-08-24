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
import { ME_SETS_BAND } from './compose.ts';
import {
  meLadderStep,
  meSessionOutcome,
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
  /** Per pattern, the sessions that were read and what each one was. Provenance, never a decision. */
  history: Partial<Record<ViadaPattern, { week: number; day: string; movement: string; outcome: MeSessionOutcome }[]>>;
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

  type Seen = { row: MeRowIndex; outcome: MeSessionOutcome };
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
      seen.push({
        row,
        outcome: meSessionOutcome({
          sets: setsOf(ex),
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
  const history: MeLadderReading['history'] = {};
  for (const s of seen) {
    const cur = state.get(s.row.pattern) ?? { sets: band.lo, cleanRun: 0 };
    state.set(s.row.pattern, meLadderStep(cur, s.outcome, band));
    (history[s.row.pattern] ??= []).push({
      week: s.row.week, day: s.row.day, movement: s.row.movement, outcome: s.outcome,
    });
  }

  const sets: Partial<Record<ViadaPattern, number>> = {};
  for (const [pattern, st] of state) sets[pattern] = st.sets;

  return { sets, history, unread: [...index.keys()].filter((k) => !matched.has(k)).length };
}
