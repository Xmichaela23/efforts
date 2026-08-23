// ============================================================================
// RESTATING THE BLOCK — week one's test becomes weeks two onward's weights.
//
// ⛔ WHY THIS EXISTS AT ALL, AND IT IS STRUCTURAL. `sessions_by_week` is authored ONCE, for the whole
// block, at build time. The test is in week one. So when the block is written there is no working
// number for any lift, and every strength row after the test composes on the app's auto-regulated
// contract — the movement and the reps, and nothing about the weight. Something has to come back
// afterwards and read what the athlete actually did.
//
// ⛔ `rematerialize-strength-block` EXISTS FOR THE IDENTICAL REASON ON THE GET STRONGER SIDE, states
// it in its own header, and this file borrows its two LAWS rather than its arithmetic:
//
//   1. **It proposes; it does not silently write.** A dry run returns the diff; applying is a tap.
//      That law is not caution — the auto-progression that used to move strength load on every
//      ingest was DELETED because *"the athlete opened the logger to a number they never agreed to."*
//   2. **Only weeks that have not started.** History is not editable, and a session already logged
//      against a prescription keeps the prescription it was judged against.
//
// ⛔ AND THE TWO NEVER MEET. That one walks a Wendler training max through cycle verdicts. This one
// re-runs THIS composer with the working numbers filled in and takes the difference. No function
// accepts both numbers.
// ============================================================================

import type { ComposedWeek, PlannedSet, StrengthExercise } from './compose.ts';

/** ⚠️ DB shape, deliberately loose — a materialized calendar row as this reader sees it. */
export type PlannedRowish = {
  id?: string | null;
  week_number?: number | null;
  date?: string | null;
  strength_exercises?: unknown;
};

export type RestatedRow = {
  id: string;
  week: number;
  day: string;
  strength_exercises: StrengthExercise[];
};

export type RestatedChange = {
  week: number;
  day: string;
  movement: string;
  /** ⛔ `null` FROM means the row carried no weight at all — the "by feel" contract it opened on. */
  from: number | null;
  to: number;
};

export type Restatement = {
  rows: RestatedRow[];
  changes: RestatedChange[];
  /** Rows the composer has an answer for but that could not be matched. Never silent. */
  unmatched: { week: number; day: string; reason: string }[];
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The weekday a materialized row falls on. ⚠️ Parsed as UTC — a local parse shifts a date by one. */
export function weekdayOf(dateIso: string | null | undefined): string | null {
  const t = Date.parse(`${String(dateIso ?? '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return DAY_NAMES[new Date(t).getUTCDay()];
}

function topWorkWeight(ex: StrengthExercise | null | undefined): number | null {
  if (!ex) return null;
  const plan = Array.isArray(ex.set_plan) ? ex.set_plan as PlannedSet[] : [];
  const work = plan.filter((s) => !s?.warmup);
  const last = work[work.length - 1];
  if (last && Number.isFinite(Number(last.weight))) return Number(last.weight);
  const w = Number(ex.weight);
  return Number.isFinite(w) && w > 0 ? w : null;
}

/**
 * ⛔ THE DIFF, ON WEEKS THAT HAVE NOT STARTED.
 *
 * @param composed         the block re-composed WITH the working numbers — the same pure composer
 *                         that wrote the block, so the shape is identical and only the loads move.
 *                         ⛔ Never a second prescription table: a rewrite that invented its own
 *                         percentages would be a different programme wearing this one's name.
 * @param planned          the materialized calendar rows for this plan.
 * @param afterWeek        history and the live week stand. Only weeks strictly after this move.
 *
 * ⚠️ MATCHED ON WEEK + WEEKDAY + MOVEMENT NAME, all three. Week and day alone are not enough (a day
 * carries several movements) and name alone is not enough (bench appears on two days of the frame).
 * A composed session with no matching row is REPORTED, not dropped.
 */
export function restateFromTest(args: {
  composed: ComposedWeek[];
  planned: PlannedRowish[] | null | undefined;
  afterWeek: number;
}): Restatement {
  const bySlot = new Map<string, StrengthExercise[]>();
  for (const wk of args.composed) {
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      bySlot.set(`${wk.week}|${s.day}`, s.strength_exercises ?? []);
    }
  }

  const rows: RestatedRow[] = [];
  const changes: RestatedChange[] = [];
  const matched = new Set<string>();

  for (const row of args.planned ?? []) {
    const week = Number(row?.week_number);
    if (!Number.isFinite(week) || week <= args.afterWeek) continue;
    const day = weekdayOf(row?.date);
    if (!day || !row?.id) continue;
    const wanted = bySlot.get(`${week}|${day}`);
    if (!wanted) continue;
    matched.add(`${week}|${day}`);

    const existing = Array.isArray(row?.strength_exercises)
      ? row.strength_exercises as StrengthExercise[]
      : null;
    if (!existing) continue;

    let touched = false;
    const next = existing.map((ex) => {
      const fresh = wanted.find((w) => String(w.name).toLowerCase() === String(ex?.name ?? '').toLowerCase());
      // ⛔ A ROW THE COMPOSER NO LONGER AUTHORS IS LEFT ALONE. The accessory floor can fill a session
      // differently between runs; silently deleting a movement the athlete can already see on their
      // calendar is a bigger change than this function is allowed to make.
      if (!fresh) return ex;
      const to = topWorkWeight(fresh);
      /**
       * ⚠️ ONLY A PRESCRIBED WEIGHT REPLACES ANYTHING. A HYP row carries no percentage by design
       * (p218) and stays "By feel" forever — overwriting it would reintroduce forced progression on
       * auto-regulated work.
       *
       * ⛔ AND THE TEST FOR THAT IS `to == null`, NOT `load_prescribed === false`. A
       * `load_prescribed: false` clause stood here and mutation testing showed it guarded nothing:
       * every row the composer marks that way carries the string "By feel" rather than a number, so
       * `topWorkWeight` already returns null for all of them. A branch that cannot change an answer
       * is the dead guard this codebase keeps deleting (`lowerBodyHaircut` lost one the same way).
       */
      if (to == null) return ex;
      const from = topWorkWeight(ex);
      if (from === to) return ex;
      touched = true;
      changes.push({ week, day, movement: String(fresh.name), from, to });
      return {
        ...ex,
        weight: fresh.weight,
        ...(fresh.percent_1rm != null ? { percent_1rm: fresh.percent_1rm } : {}),
        ...(fresh.set_plan ? { set_plan: fresh.set_plan } : {}),
        load_prescribed: true,
      };
    });
    if (touched) rows.push({ id: String(row.id), week, day, strength_exercises: next });
  }

  // ⛔ WHAT THE COMPOSER HAD AN ANSWER FOR AND COULD NOT PLACE. Silence here would read as
  // "everything was rewritten", which is the failure mode this codebase keeps finding.
  const unmatched: { week: number; day: string; reason: string }[] = [];
  for (const key of bySlot.keys()) {
    const [w, d] = key.split('|');
    if (Number(w) <= args.afterWeek) continue;
    if (matched.has(key)) continue;
    unmatched.push({ week: Number(w), day: d, reason: 'no materialized row for this day' });
  }

  return { rows, changes, unmatched };
}
