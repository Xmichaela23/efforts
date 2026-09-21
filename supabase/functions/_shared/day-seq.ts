// =============================================================================
// day-seq — which of a day's same-sport sessions a planned row is (2026-09-20)
// =============================================================================
//
// ⛔ A DAY CAN HOLD TWO RIDES. Ride + Strength at seven rides prints two rides on days 3 and 5, and
// `ux_planned_unique_key` allowed one row per (plan, week, day, date, type), so activate-plan dropped the
// second in silence. `planned_workouts.day_seq` joins that index (20260921000000).
//
// ⛔ WHAT THE NUMBER MEANS. `day_seq % 100` is the row's PLACE among that day's sessions of the sport the PLAN
// wrote there (`swapped_from:` on a swapped row, its type otherwise): 0 for the first ride, 1 for the second, in
// the order the plan lists them. The place never changes, so a swap made on the second ride stays on the second
// ride through every rebuild (`enduranceSlotName`), and a rebuild pairs first with first (`restateEndurance`).
//
// ⚠️ THE HUNDREDS ARE ONLY FOR THE INDEX. The index is on the type the row HOLDS. A run swapped to a ride on a day
// that already has a first ride would repeat (ride, 0); it takes 100 instead — same place, free key.

/** OURS — an encoding stride, not a training number: places 0–99 per day, the hundreds keep the index key free. */
export const DAY_SEQ_STRIDE = 100;

/** The row's place among the day's sessions of the sport the plan wrote there. */
export function placeOf(daySeq: unknown): number {
  const n = Number(daySeq);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) % DAY_SEQ_STRIDE : 0;
}

/** The first `day_seq` holding `place` that is not in `taken`. */
export function freeDaySeq(place: number, taken: ReadonlySet<number>): number {
  let seq = placeOf(place);
  while (taken.has(seq)) seq += DAY_SEQ_STRIDE;
  return seq;
}

/**
 * The `day_seq` a row must carry once its type becomes `newType` — its own place, on a key no other row of the
 * plan holds that day. A row outside a plan is outside the index, so it keeps what it has.
 */
// deno-lint-ignore no-explicit-any
export async function daySeqForType(db: any, row: { id?: unknown; training_plan_id?: unknown; date?: unknown; day_seq?: unknown }, newType: string): Promise<number> {
  const own = Number(row?.day_seq ?? 0) || 0;
  if (!row?.training_plan_id || !row?.date) return own;
  const { data } = await db.from('planned_workouts')
    .select('id, day_seq')
    .eq('training_plan_id', row.training_plan_id)
    .eq('date', String(row.date).slice(0, 10))
    .eq('type', newType)
    .neq('id', row.id);
  const taken = new Set<number>(((data ?? []) as Array<{ day_seq?: unknown }>).map((r) => Number(r.day_seq ?? 0)));
  return freeDaySeq(placeOf(own), taken);
}
