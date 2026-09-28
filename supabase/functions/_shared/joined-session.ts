/**
 * ⛔ THE OTHER HALF OF A JOINED SESSION, READ FROM THE DATABASE (2026-09-27). A joined session (`JOINED_TAG`; p278's
 * Day 3 and Day 5 rides, p245 / p253's runs) is two planned rows and one session, so marking it done, linking a
 * recorded workout to it or unlinking one reaches both rows. The pairing rule is `movesWith`'s — the one the calendar
 * move, the calendar sync and the week feed use — asked here with the rows it needs.
 */
import { isJoinedPart, movesWith, type MoveRow } from './move-check/index.ts';
import { JOINED_TAG } from './standing-plan/frames.ts';
import { mergeJoinedRow } from './calendar-sync/plan.ts';

const isJoinedPartRow = (row: Record<string, any>): boolean => isJoinedPart(row as MoveRow);

const hasJoinedTag = (row: { tags?: unknown } | null | undefined): boolean =>
  Array.isArray(row?.tags) && (row!.tags as unknown[]).map(String).includes(JOINED_TAG);

/** The ids of the rows that go with `row` (none for a session that is not joined). */
export async function joinedPartnerIds(supabase: any, row: MoveRow & { user_id?: string | null }): Promise<string[]> {
  if (!hasJoinedTag(row) || !row.training_plan_id) return [];
  const { data, error } = await supabase.from('planned_workouts')
    .select('id,date,type,name,workout_status,training_plan_id,tags')
    .eq('training_plan_id', row.training_plan_id)
    .eq('date', String(row.date).slice(0, 10))
    .contains('tags', [JOINED_TAG]);
  if (error || !Array.isArray(data)) return [];
  return movesWith(row, data as MoveRow[]).map((r) => String(r.id));
}

/**
 * ⛔ THE PLANNED SESSION A RECORDED WORKOUT IS COMPARED AGAINST, WHOLE (2026-09-27): a workout linked to half of a joined
 * session is measured against both halves' steps (`mergeJoinedRow`), since it rode both. `select` must include `id`,
 * `date`, `tags`, `training_plan_id` and `computed`. Anything missing, and the row comes back as it was.
 */
export async function plannedWhole<R extends Record<string, any>>(supabase: any, planned: R | null, select: string): Promise<R | null> {
  if (!planned) return planned;
  try {
    const ids = await joinedPartnerIds(supabase, planned as any);
    if (!ids.length) return planned;
    const { data: part } = await supabase.from('planned_workouts').select(select).eq('id', ids[0]).maybeSingle();
    if (!part) return planned;
    const [head, second] = (isJoinedPartRow(planned) ? [part, planned] : [planned, part]) as [R, R];
    return { ...mergeJoinedRow(head, second), id: planned.id };
  } catch {
    return planned;
  }
}

/**
 * ⛔ WHETHER A SWAP TAPPED ON ONE HALF OF A JOINED SESSION ALSO GOES TO THE OTHER HALF (Michael, 2026-09-27: a swap on a
 * joined ride applies to the whole ride). The trainer, the other sport, the hike and every way back do — where the other
 * half's own sheet offers the same choice. A workout pick (`workout:`) does not: it names one of the tapped half's own
 * printed workouts.
 */
export function swapReachesJoinedHalf(optionId: string, otherHalfOptionIds: string[]): boolean {
  return !optionId.startsWith('workout:') && otherHalfOptionIds.includes(optionId);
}
