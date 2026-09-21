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
