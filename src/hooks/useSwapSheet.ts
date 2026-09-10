import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * ═══ THE INSTEAD SHEET, AS THE SERVER SENDS IT (2026-09-10, audit H-T15) ═════════════════════════
 *
 * ⛔ THE PHONE DOES NOT DECIDE A SWAP. `swap-session` sends which options a planned session offers,
 * with the words each shows, and writes the row or rows a tap asks for. These hooks fetch that and
 * post the tap; nothing here gates, words or builds a session.
 */
export type SwapSheetOption = {
  id: string;
  kind: string;
  venue: string | null;
  to: string;
  /** A sport swap — the only kind the workout drawer lists. */
  sport: boolean;
  label: string;
  line: string | null;
  warnings: string[];
};

export type SwapSheet = { header: string; rest_of_plan: boolean; options: SwapSheetOption[] };

const INVALIDATE_EVENTS = ['planned:invalidate', 'week:invalidate'] as const;

function useInvalidateTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    for (const e of INVALIDATE_EVENTS) window.addEventListener(e, bump);
    return () => { for (const e of INVALIDATE_EVENTS) window.removeEventListener(e, bump); };
  }, []);
  return tick;
}

/** The sheet for one planned session, or null while it loads, for no session, or when the read fails. */
export function useSwapSheet(plannedId: string | null | undefined): SwapSheet | null {
  const [sheet, setSheet] = useState<{ id: string; sheet: SwapSheet } | null>(null);
  const tick = useInvalidateTick();
  useEffect(() => {
    if (!plannedId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('swap-session', { body: { planned_id: plannedId } });
        if (cancelled) return;
        if (error || !data?.success) { setSheet(null); return; }
        setSheet({ id: plannedId, sheet: { header: data.header, rest_of_plan: data.rest_of_plan === true, options: data.options ?? [] } });
      } catch {
        // No sheet rather than a wrong one: the control hides, as it does when nothing is offered.
        if (!cancelled) setSheet(null);
      }
    })();
    return () => { cancelled = true; };
  }, [plannedId, tick]);
  return plannedId && sheet?.id === plannedId ? sheet.sheet : null;
}

/** The planned sessions among `plannedIds` that carry the swap glyph. */
export function useSportSwapIds(plannedIds: ReadonlyArray<string>): Set<string> {
  const key = [...new Set(plannedIds.filter(Boolean))].sort().join(',');
  const [ids, setIds] = useState<Set<string>>(new Set());
  const tick = useInvalidateTick();
  useEffect(() => {
    if (!key) { setIds(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('swap-session', { body: { planned_ids: key.split(',') } });
        if (cancelled) return;
        if (error || !data?.success) { setIds(new Set()); return; }
        const map = (data.sport_swap ?? {}) as Record<string, boolean>;
        setIds(new Set(Object.keys(map).filter((k) => map[k])));
      } catch {
        if (!cancelled) setIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [key, tick]);
  return ids;
}

/** Post a tap. Resolves with the toast's words; throws with the server's reason when nothing was written. */
export async function postSwap(plannedId: string, optionId: string, restOfPlan: boolean): Promise<{ receipt: string }> {
  const { data, error } = await supabase.functions.invoke('swap-session', {
    body: { planned_id: plannedId, option_id: optionId, scope: restOfPlan ? 'rest_of_plan' : 'today' },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'Could not swap this session');
  return { receipt: String(data.receipt ?? '') };
}
