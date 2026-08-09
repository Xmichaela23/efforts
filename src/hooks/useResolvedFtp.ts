import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';

/**
 * The athlete's usable FTP, by the same precedence every other surface uses.
 *
 * ⛔ IT EXISTS FOR THE HARD-RIDE SWAP, and the reason is narrow: a hard swap now writes real bike
 * tokens, and `materialize-plan`'s `expandBikeToken` turns those into watts by multiplying FTP. With
 * no FTP, `pctRange` returns `undefined` and the athlete gets a 4×4 interval session **with no
 * targets at all** — a worse artefact than the honest "no target" time block, and one that looks
 * like a real prescription. So the swap has to know before it offers itself.
 *
 * ⚠️ QUALITY-GATED, DELIBERATELY. `resolveCurrentFtp` reports its source; only `learned` (which it
 * already restricts to ≥medium confidence) and `manual` are accepted here. **`learned-low` is
 * rejected** — the same bar `materialize-plan:3271` applies before baking FTP into plan targets, and
 * for the same reason: a low-confidence estimate multiplied by 1.1–1.2 is a confident-looking watt
 * number built on a guess.
 *
 * ⚠️ NULL MEANS "DO NOT OFFER THE HARD RIDE". Unlike posture — where a missing signal is not a
 * verdict — a missing FTP is a real inability: the app cannot write the session. It fails CLOSED, and
 * that is the opposite direction from `useDeclaredPosture` on purpose. Easy swaps never consult it.
 */
export function useResolvedFtp(): number | null {
  const [ftp, setFtp] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      try {
        const { data } = await supabase
          .from('user_baselines')
          .select('performance_numbers, learned_fitness')
          .eq('user_id', userId)
          .maybeSingle();
        if (cancelled) return;
        const resolved = resolveCurrentFtp({
          learned_fitness: data?.learned_fitness,
          performance_numbers: data?.performance_numbers,
        } as Parameters<typeof resolveCurrentFtp>[0]);
        const usable =
          (resolved.source === 'learned' || resolved.source === 'manual') &&
          Number.isFinite(resolved.value) && (resolved.value as number) > 0;
        setFtp(usable ? (resolved.value as number) : null);
      } catch {
        // ⚠️ A failed read leaves FTP null, so the hard-ride swap is not offered. Failing closed is
        // correct here: the cost of not showing a control is an athlete who keeps their run; the
        // cost of showing it is a watt prescription with no watts in it.
        if (!cancelled) setFtp(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return ftp;
}

export default useResolvedFtp;
