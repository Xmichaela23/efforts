/**
 * THE MOVE'S WRITE ON THE PHONE (2026-09-21, docs/STAGE0-lost-day-2026-09-21.md).
 *
 * ⛔ ONE WAY TO MOVE A SESSION. The calendar and the session screen both build their update here. The
 * row keeps its plan week and day and records the plan date it left (`moved_from:`), so the calendar
 * load, a plan rebuild and a weights update all still know which plan session it is. The rule for the
 * note — first day kept, cleared on moving back — lives in `_shared/moved-from.ts` beside its readers.
 */
import { supabase } from '@/lib/supabase';
import { tagsAfterMove } from '../../supabase/functions/_shared/moved-from.ts';

export { MOVED_FROM_PREFIX, movedOrigin, planDateOf, tagsAfterMove } from '../../supabase/functions/_shared/moved-from.ts';

/** The update a move writes: the new date and the row's tags with the note applied. Reads the row's current tags. */
export async function movePatch(id: string, newDate: string): Promise<{ date: string; tags: string[] }> {
  const { data, error } = await supabase.from('planned_workouts').select('date, tags').eq('id', id).maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Planned session not found');
  return { date: newDate, tags: tagsAfterMove(data as { date?: unknown; tags?: unknown }, newDate) };
}

/**
 * ⛔ A MOVE AND THE ROWS THAT GO WITH IT (2026-09-23). `validate-reschedule` names them (`moves_with`: the other part of
 * a joined run, Viada p245 / p253); the phone writes the same move for each. The phone decides nothing.
 */
export async function moveWithPartners(
  update: (id: string, patch: { date: string; tags: string[] }) => Promise<unknown>,
  id: string, newDate: string, withIds: unknown,
): Promise<unknown> {
  const result = await update(id, await movePatch(id, newDate));
  for (const other of Array.isArray(withIds) ? withIds.map(String) : []) await update(other, await movePatch(other, newDate));
  return result;
}

/**
 * ⛔ WHAT "CAN'T TRAIN THIS DAY" SAVES FOR ONE SESSION (PM review, 2026-09-22). Every session a lost day touches carries
 * `lost_day:<that day>` — so a later lost day in the week plans it again, and a lost day is told apart from a day the
 * athlete skipped themselves. A session that comes off is skipped (the app's own skip, recorded, never deleted); one
 * that is placed — including one an earlier lost day took off — is dated there and back on the plan.
 */
export async function lostDayPatch(
  id: string, s: { to: string; lostDay: string; dropped: boolean },
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('planned_workouts').select('date, tags').eq('id', id).maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Planned session not found');
  const row = data as { date?: unknown; tags?: unknown };
  const base = Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [];
  const mark = (tags: string[]) => [...tags.filter((t) => !t.startsWith('lost_day:')), `lost_day:${s.lostDay}`];
  if (s.dropped) return { workout_status: 'skipped', skip_reason: null, tags: mark(base) };
  return { date: s.to, workout_status: 'planned', tags: mark(tagsAfterMove({ ...row, tags: base }, s.to)) };
}

