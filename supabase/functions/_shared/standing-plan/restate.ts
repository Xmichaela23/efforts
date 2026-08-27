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
  /**
   * ⛔ WHETHER THE ATHLETE HAS ALREADY DONE IT. *"History stands"* is a per-SESSION fact, not a
   * per-week one — see `restateFromTest`. A row this is missing on is treated as not done, which is
   * the safe direction: it may be rewritten, and a rewrite of a future session costs nothing.
   */
  workout_status?: string | null;
  completed_workout_id?: string | null;
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
  /** ⛔ `null` TO means the weight did not move — this change is a SET COUNT, not a load. */
  to: number | null;
  /**
   * ⛔ THE ME SET LADDER'S MOVE, WHEN THIS ROW EARNED OR LOST ONE (A2, 2026-08-24).
   *
   * ⚠️ IT IS ITS OWN FIELD RATHER THAN A SECOND MEANING FOR `from`/`to`. A surface listing the
   * proposed changes has to be able to say *"the squat goes up ten pounds"* and *"the squat gains a
   * second set"* as different sentences; overloading one pair of numbers is how they become one.
   */
  sets?: { from: number; to: number };
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

/**
 * ⛔ HOW MANY WORK SETS A ROW PRESCRIBES — `set_plan` first, because that is what the logger draws.
 *
 * ⚠️ WARM-UPS ARE NOT COUNTED, the same rule p147 states for the dosing ledger. A row whose plan is
 * three warm-ups and one work set prescribes ONE set, and reading four here would tell the ladder a
 * pattern is at its cap when it is at its floor.
 */
function setCountOf(ex: StrengthExercise | null | undefined): number | null {
  if (!ex) return null;
  const plan = Array.isArray(ex.set_plan) ? ex.set_plan as PlannedSet[] : null;
  if (plan) {
    const work = plan.filter((s) => !s?.warmup).length;
    if (work > 0) return work;
  }
  const n = Number(ex.sets);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
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
/** ⛔ A SESSION THE ATHLETE HAS ALREADY DONE. Never rewritten, whatever week it is in. */
function isDone(row: PlannedRowish): boolean {
  if (row?.completed_workout_id) return true;
  const status = String(row?.workout_status ?? '').toLowerCase();
  return status === 'completed' || status === 'skipped';
}

export function restateFromTest(args: {
  composed: ComposedWeek[];
  planned: PlannedRowish[] | null | undefined;
  /**
   * ⛔⛔ THE CUT IS THE TEST, NOT THE WEEK (Michael, 2026-08-27: *"its a dumb rule should just fill
   * everything after test."*).
   *
   * ⛔ WHAT IT REPLACES AND WHY THAT WAS SELF-DEFEATING. The caller passed
   * `Math.max(TEST_WEEK_INDEX, currentWeek)` under the comment *"history and the live week stand"*.
   * **The test sits INSIDE the live week**, so protecting the live week protected exactly the
   * sessions the test had just enabled. His own block: tested Monday and Tuesday, and Thursday's
   * DE: Upper still read *"No weight is prescribed"* while week 2's identical session carried 105 lb.
   * Two intentions collapsed into one week-level cut and the wrong half won.
   *
   * ⚠️ AND THE OTHER HALF IS KEPT, AS A PER-SESSION GUARD. *"History stands"* is the real
   * constraint: a session already completed or skipped is never rewritten, in any week. An athlete
   * who did Wednesday must not find Wednesday changed.
   *
   * ⚠️ NOT FAKED BY DECREMENTING THE WEEK. That would expose the test sessions themselves; the cut
   * is a DATE inside the test week, taken from the last day the composed week marks as a test.
   */
  afterWeek: number;
  /**
   * The last test session's date, ISO. Rows in the test week ON OR BEFORE it are left alone; rows
   * after it are restated. ⚠️ Absent falls back to the old week-level behaviour, so a caller that
   * has not been taught the new rule cannot silently start rewriting a test day.
   */
  testDayCutoff?: string | null;
}): Restatement {
  /**
   * ⛔⛔ IT ACCUMULATES; IT USED TO OVERWRITE, AND THAT BECAME A SILENT NO-OP ON 2026-08-24.
   *
   * `bySlot.set(...)` was correct while a day held at most one strength session. The three-day plyo
   * placement (A3) puts a `type: 'strength'` drill session on frame day 1 **beside the lift** — so
   * the second write replaced `ME: Upper`'s exercises with a skip, and every ME row on that day
   * stopped being restated. Nothing would have failed: the diff would simply have come back short,
   * which is the exact "the test produced nothing" silence this file warns about at the bottom.
   *
   * ⚠️ CONCATENATING IS SAFE because the match below is on NAME as well as week and day, so two
   * sessions' rows sharing one bucket cannot cross-match.
   */
  const bySlot = new Map<string, StrengthExercise[]>();
  for (const wk of args.composed) {
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      const key = `${wk.week}|${s.day}`;
      bySlot.set(key, [...(bySlot.get(key) ?? []), ...(s.strength_exercises ?? [])]);
    }
  }

  const rows: RestatedRow[] = [];
  const changes: RestatedChange[] = [];
  const matched = new Set<string>();

  const cutoff = typeof args.testDayCutoff === 'string' ? args.testDayCutoff.slice(0, 10) : null;
  for (const row of args.planned ?? []) {
    const week = Number(row?.week_number);
    if (!Number.isFinite(week)) continue;
    /**
     * ⛔ THREE GATES, AND EACH ONE IS A HALF OF THE RULING.
     *   1. a session already done is never touched — history stands, per session;
     *   2. a week entirely before the cut is left alone;
     *   3. inside the cut week, only the days AFTER the last test session are restated.
     */
    if (isDone(row)) continue;
    const date = String(row?.date ?? '').slice(0, 10);
    if (week < args.afterWeek) continue;
    if (week === args.afterWeek) {
      // ⚠️ NO CUTOFF MEANS THE OLD RULE — the whole cut week is left alone rather than guessed at.
      if (!cutoff || !date || date <= cutoff) continue;
    }
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
      const from = topWorkWeight(ex);
      /**
       * ⛔ THE SET COUNT MOVES ON ITS OWN AXIS (A2, 2026-08-24). The ME ladder can add a set in a week
       * where the weight is unchanged, and the weight can move in a week where the count is not — so
       * a single `touched` test on the weight would silently drop every set change that landed on a
       * flat week. ⚠️ It is computed from `fresh` vs `ex` rather than from the ladder, so a row the
       * composer no longer authors cannot have its count rewritten by a pattern it does not belong to.
       */
      const toSets = setCountOf(fresh);
      const fromSets = setCountOf(ex);
      const setsMove = toSets != null && fromSets != null && toSets !== fromSets;
      const weightMoves = to != null && from !== to;
      /**
       * ⛔ AND LAST TIME'S RESULT MOVES ON A THIRD AXIS (2026-08-26) — the same trap `setsMove` was
       * written for, one field further along. The heavy slot's reps are what the athlete GOT, so they
       * change on a week where neither the weight nor the set count did; a diff that tested only
       * those two would compute the result correctly and never write it to a single calendar row.
       *
       * ⚠️ AND IT IS NOT A `changes` ENTRY. The change list is the PRESCRIPTION diff the athlete is
       * asked to accept; what they lifted last Tuesday is provenance the row displays, not a proposal.
       * The row is still rewritten — `touched` — so the number reaches the calendar.
       */
      const repsKey = (v: unknown) => (Array.isArray(v) ? v.map((n) => Number(n)).join(',') : '');
      const repsMove = repsKey((fresh as Record<string, unknown>).last_reps)
        !== repsKey((ex as Record<string, unknown>).last_reps);
      if (!weightMoves && !setsMove && !repsMove) return ex;
      touched = true;
      if (weightMoves || setsMove) {
        changes.push({
          week,
          day,
          movement: String(fresh.name),
          from,
          to: weightMoves ? to : null,
          ...(setsMove ? { sets: { from: fromSets as number, to: toSets as number } } : {}),
        });
      }
      /**
       * ⚠️ ONLY A PRESCRIBED WEIGHT REPLACES A WEIGHT. A HYP row carries no percentage by design
       * (p218) and stays "By feel" forever — so a set-count-only change leaves the load fields alone
       * rather than stamping `load_prescribed: true` over an auto-regulated row.
       */
      return {
        ...ex,
        ...(weightMoves
          ? {
            weight: fresh.weight,
            ...(fresh.percent_1rm != null ? { percent_1rm: fresh.percent_1rm } : {}),
            load_prescribed: true,
          }
          : {}),
        ...(setsMove ? { sets: toSets as number } : {}),
        // ⛔ THE SET PLAN CARRIES THE LOGGER'S REP PREFILL, so it travels whenever the result moves —
        // not only on a weight or set change. That is where "open the cell on what they got last
        // time" actually lands; without it the heavy set keeps opening at whatever it opened at when
        // the block was authored.
        ...((weightMoves || setsMove || repsMove) && fresh.set_plan ? { set_plan: fresh.set_plan } : {}),
        // ⚠️ WRITTEN AS AN ABSENCE TOO. A pattern that just took a jump has no last time at the new
        // weight, and the row has to STOP showing the old number rather than keep it forever.
        ...(repsMove
          ? (Array.isArray((fresh as Record<string, unknown>).last_reps)
            ? { last_reps: (fresh as Record<string, unknown>).last_reps }
            : { last_reps: undefined })
          : {}),
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
