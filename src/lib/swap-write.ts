/**
 * ═══ WHAT A SWAP ACTUALLY WRITES ═════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-endurance-swaps-2026-09-09.md §7.
 *
 * ⛔ TWO SCREENS APPLY A SWAP — Today's sheet and the workout drawer — and they each wrote
 * `option.patch` straight to the row. §7 makes the write more than the patch: a sport swap has to
 * hand over the composer's own session for the new sport, which needs a read the pure library cannot
 * do. Putting that in one screen would leave the other one still writing a shell, so it lives here
 * and both screens ask the same question.
 *
 * ⚠️ THE PURE LIBRARY STILL DECIDES WHAT IS OFFERED. This file only resolves what the offered thing
 * writes; every gate — posture, band, the ground-impact rule, unstarted-only — stays in
 * `session-discipline-swap`.
 */
import { supabase } from '@/lib/supabase';
import {
  disciplineOf,
  intensityOf,
  withLibrarySession,
  type SwapOption,
  type SwappableSession,
} from './session-discipline-swap';
import { swapTargetFamily, librarySwapSession } from './swap-library-session';

export type SwapWrite = {
  patch: Record<string, unknown>;
  /**
   * True when the row must go through `materialize-plan` before it is a real session. ⛔ A LIBRARY
   * SESSION IS ALWAYS TOKENS, so it always does — the watts and paces only exist once the expander
   * has run them against this athlete's numbers.
   */
  needsMaterialize: boolean;
};

/**
 * The row the swap writes, resolved against the athlete's own plan.
 *
 * ⚠️ THEIR OWN ROW IS THE FIRST ANSWER, and that is the point rather than an optimisation. Their
 * plan already holds the composer's session for that family — at their level, their volume, their
 * baselines. Re-deriving it would be a SECOND composer, and a second composer is how two screens
 * start disagreeing. `librarySwapSession` falls back to a fresh library build only when the plan has
 * no session of that family at all.
 *
 * ⚠️ AND A FAILED READ IS NOT A FAILED SWAP. If the query throws, the athlete's tap still writes the
 * patch the library built rather than being refused.
 */
export async function resolveSwapWrite(
  userId: string,
  row: SwappableSession & { id?: string; type?: string | null },
  option: SwapOption,
): Promise<SwapWrite> {
  const plain: SwapWrite = { patch: option.patch, needsMaterialize: option.needsMaterialize };
  // ⛔ A MACHINE OR A HIKE IS NOT A SPORT SWAP. p275's machine is the same session performed
  // elsewhere, so there is no other session to hand over — it changes a tag and nothing else.
  if ((option.kind ?? 'discipline') !== 'discipline') return plain;

  const from = disciplineOf(row?.type);
  if (!from || option.to === from) return plain;
  const band = intensityOf(row);
  const family = swapTargetFamily(from, band);
  if (!family) return plain;

  let template: SwappableSession | null = null;
  try {
    const { data } = await supabase
      .from('planned_workouts')
      .select('id,date,name,description,tags,duration,total_duration_seconds,steps_preset,workout_status')
      .eq('user_id', userId)
      .contains('tags', [`family:${family}`])
      .order('date', { ascending: true })
      // ⚠️ A FEW ROWS, NOT ONE. The earliest match can be a row THIS athlete already swapped, and a
      // swapped row is a copy of the composer's session rather than the composer's session.
      // `librarySwapSession` refuses those; asking for one row would hand it nothing to fall back on.
      .limit(8);
    template = (Array.isArray(data) ? data : [])
      .find((r: any) => !(r?.tags ?? []).includes('discipline_swapped')) as never ?? null;
  } catch (e) {
    console.warn('[swap] could not read the athlete\'s own session for', family, e);
  }

  const lib = librarySwapSession(row, from, band, template);
  if (!lib) return plain;
  return { patch: withLibrarySession(option.patch, row, lib), needsMaterialize: true };
}
