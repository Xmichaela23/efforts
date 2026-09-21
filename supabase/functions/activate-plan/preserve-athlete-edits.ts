// =============================================================================
// preserve-athlete-edits — what survives activate-plan's delete-and-reinsert
// =============================================================================
//
// ⛔ THE DEFECT THIS CLOSES. `activate-plan` deletes every planned row for a plan before inserting
// the new ones — deliberately, as an idempotency guard against duplicates. Everything the ATHLETE
// had done to those rows died with them: a skipped session came back unskipped, and a discipline
// swap (run → ride) came back a run. The plan blob is regenerated faithfully; the athlete's own
// edits to it were never in the blob, so they were never regenerated.
//
// ⚠️ IT WAS ALWAYS BROKEN — the swap only made it VISIBLE. Skips have been lost on every
// re-activation since the guard was written; nobody noticed because a re-activation usually
// accompanies a genuinely new plan, where there is nothing to preserve. Fixed generally rather than
// for the swap alone, because a swap-only fix would leave the skip bug sitting under it.
//
// ⛔ THE KEY IS THE SLOT, AND IT IS THE TABLE'S OWN. `activate-plan:433` documents the unique
// constraint as `(training_plan_id, week_number, day_number, date, type)`. The stable part of that
// is everything EXCEPT `type` — because `type` is precisely what a discipline swap changes. So the
// slot is `week_number | day_number | date`, and a row is "the same session" when it lands in the
// same slot of the same week.
//
// ⚠️ CONSERVATIVE BY CONSTRUCTION. A rebuild whose content genuinely changed will not match slots,
// and an unmatched slot preserves NOTHING — the new plan wins. This restores what the athlete did to
// a week that is otherwise identical; it does not try to port edits onto a different plan.

import { DAY_SEQ_STRIDE, placeOf } from '../_shared/day-seq.ts';
import { movedOrigin, planDateOf, tagsAfterMove } from '../_shared/moved-from.ts';

/** The subset of a planned row this module reads or writes. Loosely typed — the caller holds rows. */
export type PlannedRowLike = {
  week_number?: number | null;
  day_number?: number | null;
  date?: string | null;
  type?: string | null;
  /** Place among the day's sessions of the same type, 0 first (`activate-plan`, 2026-09-20). */
  day_seq?: number | null;
  name?: string | null;
  description?: string | null;
  steps_preset?: string[] | null;
  tags?: string[] | null;
  workout_status?: string | null;
  skip_reason?: string | null;
  skip_note?: string | null;
};

/** The tag `session-discipline-swap.ts` writes. It is what makes a swap recognisable after the fact. */
export const SWAP_TAG = 'discipline_swapped';

/**
 * ⛔ THE PLAN'S DATE, NOT THE ROW'S (2026-09-21). A moved row carries `moved_from:<plan date>` and keeps its week and
 * day (`_shared/moved-from.ts`); it is still the plan's session for the day it left, so it pairs with that slot.
 */
const slotKey = (r: PlannedRowLike): string =>
  `${r.week_number ?? ''}|${r.day_number ?? ''}|${planDateOf(r)}`;

const typeKey = (r: PlannedRowLike): string =>
  `${slotKey(r)}|${String(r.type ?? '').toLowerCase()}|${Number(r.day_seq ?? 0)}`;

const hasSwapTag = (r: PlannedRowLike): boolean =>
  Array.isArray(r.tags) && r.tags.some((t) => String(t) === SWAP_TAG);

/** The sport the plan wrote for a row: its `swapped_from:` tag when swapped, its type otherwise. */
const originOf = (r: PlannedRowLike): string => {
  for (const t of r.tags ?? []) {
    const raw = String(t);
    if (raw.startsWith('swapped_from:') && raw.length > 'swapped_from:'.length) return raw.slice('swapped_from:'.length).toLowerCase();
  }
  return String(r.type ?? '').toLowerCase();
};

/**
 * ⛔ PAIR BY SPORT AND PLACE, NOT BY LIST POSITION (2026-09-20). The old rows come back from the database in no
 * set order, and a day can now hold two rides (`day_seq`). Paired by position, a skip on the first ride could
 * land on the second, or on the lift sharing the day. Each old row is paired with a new row of the sport the plan
 * wrote for it, first ride with first ride by `day_seq`; the new rows are already in the plan's order.
 * ⚠️ A swapped row written before `swapped_from:` existed names no origin; when the sports do not line up, the
 * slot falls back to position, which is what it did before.
 */
function pairInSlot(olds: PlannedRowLike[], news: PlannedRowLike[]): Array<[PlannedRowLike, PlannedRowLike]> {
  const group = (rows: PlannedRowLike[], sport: (r: PlannedRowLike) => string) => {
    const m = new Map<string, PlannedRowLike[]>();
    for (const r of rows) m.set(sport(r), [...(m.get(sport(r)) ?? []), r]);
    return m;
  };
  const oldBy = group(olds, originOf);
  const newBy = group(news, (r) => String(r.type ?? '').toLowerCase());
  const lined = oldBy.size === newBy.size && [...oldBy].every(([k, v]) => newBy.get(k)?.length === v.length);
  if (!lined) return olds.map((o, i) => [o, news[i]]);
  const pairs: Array<[PlannedRowLike, PlannedRowLike]> = [];
  for (const [k, os] of oldBy) {
    const sorted = [...os].sort((a, b) => placeOf(a.day_seq) - placeOf(b.day_seq));
    const ns = newBy.get(k)!;
    sorted.forEach((o, i) => pairs.push([o, ns[i]]));
  }
  return pairs;
}

export type PreserveResult = {
  /** The same array reference the caller passed, mutated in place — see the note in `apply`. */
  rows: PlannedRowLike[];
  /** One line per preserved edit, for the function log. Silence about a restored edit is a lie. */
  notes: string[];
};

/**
 * Re-apply athlete-owned state from the rows about to be deleted onto the rows about to be inserted.
 *
 * ⛔ WHAT IS ATHLETE-OWNED, AND NOTHING ELSE IS:
 *   • the SKIP (`workout_status: 'skipped'` + its reason and note) — a decision about a session;
 *   • the DISCIPLINE SWAP (`type` / `name` / `description` / `steps_preset`), and only on a row
 *     carrying `discipline_swapped`, which is the tag the swap writes for exactly this purpose.
 *
 * ⛔ EVERYTHING ELSE IS THE PLAN'S AND MUST BE REGENERATED. Durations, tokens, strength loads,
 * coaching notes and computed steps all come from the blob and the athlete's current baselines — a
 * rebuild exists to refresh them. Preserving those would freeze a stale plan under a new one, which
 * is the opposite of the bug.
 *
 * ⚠️ A COMPLETED SESSION IS NOT PRESERVED HERE, deliberately. Completion lives on `workouts`, linked
 * by `planned_id`; re-stamping `workout_status: 'completed'` onto a fresh row would assert a link
 * this module cannot see and does not own.
 */
export function preserveAthleteEdits(
  newRows: PlannedRowLike[],
  existingRows: ReadonlyArray<PlannedRowLike>,
): PreserveResult {
  const notes: string[] = [];
  if (!Array.isArray(newRows) || newRows.length === 0) return { rows: newRows ?? [], notes };
  if (!Array.isArray(existingRows) || existingRows.length === 0) return { rows: newRows, notes };

  /**
   * ⛔ ONE ROW PER SLOT OR NOTHING. A day can hold a lift AND a run, so a slot key alone is
   * ambiguous when `day_number` is absent or repeated. Where the old and new week disagree on how
   * many sessions a slot holds, this preserves nothing for that slot and says so — a wrong
   * re-application is worse than a lost one, because the athlete cannot see that it happened.
   */
  const oldBySlot = new Map<string, PlannedRowLike[]>();
  for (const r of existingRows) {
    const k = slotKey(r);
    const arr = oldBySlot.get(k) ?? [];
    arr.push(r);
    oldBySlot.set(k, arr);
  }
  const newBySlot = new Map<string, PlannedRowLike[]>();
  for (const r of newRows) {
    const k = slotKey(r);
    const arr = newBySlot.get(k) ?? [];
    arr.push(r);
    newBySlot.set(k, arr);
  }

  /** Types already claimed in the rebuilt week — a restored swap may not collide with the unique key. */
  const claimedTypes = new Set(newRows.map(typeKey));

  for (const [k, olds] of oldBySlot) {
    const news = newBySlot.get(k);
    if (!news || news.length !== olds.length) {
      const edited = olds.filter((o) => hasSwapTag(o) || movedOrigin(o) != null || String(o.workout_status ?? '').toLowerCase() === 'skipped');
      if (edited.length > 0) {
        notes.push(`slot ${k}: the rebuilt week has a different shape, so ${edited.length} athlete edit(s) were not carried over`);
      }
      continue;
    }

    for (const [oldRow, newRow] of pairInSlot(olds, news)) {

      if (String(oldRow.workout_status ?? '').toLowerCase() === 'skipped') {
        newRow.workout_status = 'skipped';
        if (oldRow.skip_reason != null) newRow.skip_reason = oldRow.skip_reason;
        if (oldRow.skip_note != null) newRow.skip_note = oldRow.skip_note;
        notes.push(`slot ${k}: kept the athlete's skip`);
      }

      /**
       * ⛔ THE MOVE (2026-09-21). A session the athlete moved goes back to the day they moved it to, with its note.
       * ⚠️ NOT A COMPLETED ONE: completion is not carried here (see above), and a fresh row is a session not yet done.
       */
      const movedTo = movedOrigin(oldRow) ? String(oldRow.date ?? '').slice(0, 10) : '';
      if (movedTo && String(oldRow.workout_status ?? '').toLowerCase() !== 'completed') {
        newRow.tags = tagsAfterMove(newRow, movedTo);
        newRow.date = movedTo;
        notes.push(`slot ${k}: kept the athlete's move to ${movedTo}`);
      }

      if (!hasSwapTag(oldRow)) continue;
      const from = String(newRow.type ?? '').toLowerCase();
      const to = String(oldRow.type ?? '').toLowerCase();
      if (!to || to === from) continue;

      // ⛔ NEVER INTO A KEY THAT IS ALREADY TAKEN. The index is `(plan, week, day, date, type, day_seq)`;
      // a run→ride swap on a day the new plan already rides keeps its place and adds 100 to stay off
      // the ride's key (`_shared/day-seq.ts`, 2026-09-20). Before `day_seq` it could not be restored.
      let seq = placeOf(newRow.day_seq);
      while (claimedTypes.has(`${slotKey(newRow)}|${to}|${seq}`)) seq += DAY_SEQ_STRIDE;
      const wouldBe = `${slotKey(newRow)}|${to}|${seq}`;
      claimedTypes.delete(typeKey(newRow));
      newRow.day_seq = seq;
      newRow.type = oldRow.type ?? newRow.type;
      if (oldRow.name != null) newRow.name = oldRow.name;
      if (oldRow.description != null) newRow.description = oldRow.description;
      // The swap clears the source discipline's token on purpose; carry that decision, not the token.
      newRow.steps_preset = oldRow.steps_preset ?? null;
      newRow.tags = Array.isArray(oldRow.tags) ? [...oldRow.tags] : [SWAP_TAG];
      // ⚠️ The old tags carry any `moved_from:` note too. Re-read against the row's date, so a move not restored
      // above (a completed row) loses its note rather than claiming a day the row is not on.
      newRow.tags = tagsAfterMove(newRow, String(newRow.date ?? ''));
      claimedTypes.add(wouldBe);
      notes.push(`slot ${k}: kept the athlete's ${from} → ${to} swap`);
    }
  }

  return { rows: newRows, notes };
}
