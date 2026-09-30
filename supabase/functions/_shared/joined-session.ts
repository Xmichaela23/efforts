/**
 * ⛔ THE OTHER HALF OF A JOINED SESSION, READ FROM THE DATABASE (2026-09-27). A joined session (`JOINED_TAG`; p278's
 * Day 3 and Day 5 rides, p245 / p253's runs) is two planned rows and one session, so marking it done, linking a
 * recorded workout to it or unlinking one reaches both rows. The pairing rule is `movesWith`'s — the one the calendar
 * move, the calendar sync and the week feed use — asked here with the rows it needs.
 */
import { isJoinedPart, movesTogether, movesWith, plyoPair, type MoveRow } from './move-check/index.ts';
import { JOINED_TAG } from './standing-plan/frames.ts';
import { mergeJoinedRow, withPlyoHead } from './calendar-sync/plan.ts';

const isJoinedPartRow = (row: Record<string, any>): boolean => isJoinedPart(row as MoveRow);
const tagsOf = (row: { tags?: unknown } | null | undefined): string[] =>
  Array.isArray(row?.tags) ? (row!.tags as unknown[]).map(String) : [];
/** A row that can have a partner: a joined half, a plyo warm-up, or a run or ride the builder slotted (2026-09-29). */
const mayPair = (row: { tags?: unknown } | null | undefined): boolean =>
  tagsOf(row).some((t) => t === JOINED_TAG || t === 'plyo' || t.startsWith('slot:'));

async function sameDayRows(supabase: any, row: MoveRow): Promise<MoveRow[]> {
  if (!row?.training_plan_id || !row?.date) return [];
  const { data, error } = await supabase.from('planned_workouts')
    .select('id,date,type,name,workout_status,training_plan_id,tags')
    .eq('training_plan_id', row.training_plan_id)
    .eq('date', String(row.date).slice(0, 10));
  return error || !Array.isArray(data) ? [] : (data as MoveRow[]);
}

/**
 * The ids of the rows that go with `row` (none for a session that is on its own): a joined session's other half and,
 * since 2026-09-29, the plyo warm-up with its run or ride (`movesTogether`). Marking done, linking, unlinking and sending
 * reach all of them.
 */
export async function joinedPartnerIds(supabase: any, row: MoveRow & { user_id?: string | null }): Promise<string[]> {
  if (!mayPair(row) || !row.training_plan_id) return [];
  return movesTogether(row, await sameDayRows(supabase, row)).map((r) => String(r.id));
}
/**
 * ⛔ THE PLANNED SESSION A RECORDED WORKOUT IS COMPARED AGAINST, WHOLE (2026-09-27): a workout linked to half of a joined
 * session is measured against both halves' steps (`mergeJoinedRow`), since it rode both. ⛔ AND ITS PLYO WARM-UP IN
 * FRONT (2026-09-29, `withPlyoHead`): the watch's first lap is the warm-up step, so the steps the laps are matched to
 * start with it. `select` must include `id`, `date`, `tags`, `training_plan_id` and `computed`. Anything missing, and the
 * row comes back as it was.
 */
export async function plannedWhole<R extends Record<string, any>>(supabase: any, planned: R | null, select: string): Promise<R | null> {
  if (!planned || !mayPair(planned)) return planned;
  try {
    const rows = await sameDayRows(supabase, planned as any);
    let whole: R = planned;
    const partner = movesWith(planned as any, rows)[0] ?? null;
    if (partner) {
      const { data: part } = await supabase.from('planned_workouts').select(select).eq('id', partner.id).maybeSingle();
      if (part) {
        const [head, second] = (isJoinedPartRow(planned) ? [part, planned] : [planned, part]) as [R, R];
        whole = mergeJoinedRow(head, second);
      }
    }
    const pair = plyoPair(planned as any, rows);
    if (pair && !isPlyoRow(planned)) {
      const { data: warm } = await supabase.from('planned_workouts').select('id,strength_exercises').eq('id', pair.warmUp.id).maybeSingle();
      if (warm) whole = withPlyoHead(whole, warm);
    }
    return { ...whole, id: planned.id };
  } catch {
    return planned;
  }
}
const isPlyoRow = (row: { tags?: unknown }): boolean => tagsOf(row).some((t) => t.toLowerCase() === 'plyo');

/**
 * ⛔ WHETHER A SWAP TAPPED ON ONE HALF OF A JOINED SESSION ALSO GOES TO THE OTHER HALF (Michael, 2026-09-27: a swap on a
 * joined ride applies to the whole ride). The trainer, the other sport, the hike and every way back do — where the other
 * half's own sheet offers the same choice. A workout pick (`workout:`) does not: it names one of the tapped half's own
 * printed workouts.
 */
export function swapReachesJoinedHalf(optionId: string, otherHalfOptionIds: string[]): boolean {
  return !optionId.startsWith('workout:') && otherHalfOptionIds.includes(optionId);
}
