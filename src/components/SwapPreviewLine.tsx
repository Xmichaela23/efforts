import React, { useEffect, useState } from 'react';
import { getStoredUserId } from '@/lib/supabase';
import { resolveSwapWrite } from '@/lib/swap-write';
import {
  disciplineOf,
  intensityOf,
  resolveMinutes,
  type SwapOption,
  type SwappableSession,
} from '@/lib/session-discipline-swap';
import { swapLineFor, swapSessionLine } from '@/lib/swap-copy';

/**
 * ═══ THE LINE UNDER ONE OPTION ON THE INSTEAD SHEET ═════════════════════════════════════════════
 *
 * Michael, 2026-09-10: a sport swap's line describes the session you get — `Easy Run, 45 min. Takes
 * this ride's place.` — not a rule about when the swap is allowed.
 *
 * ⛔ THE SESSION IS THE ONE THE TAP WILL WRITE. `resolveSwapWrite` is the resolver the apply path
 * already calls: it finds the athlete's own composed row of the target family, falls back to the
 * library's session at their level, and merges it over the shell. Asking it here, with the same row
 * and the same option, is the only way the sheet's "45 min" is the row's 45 min.
 *
 * ⚠️ IT IS A READ, SO THE LINE ARRIVES A MOMENT AFTER THE SHEET DOES. Until then the option shows its
 * name and no line — never a placeholder number that the resolved one then replaces.
 *
 * ⚠️ MACHINES AND THE WAY BACK ARE UNCHANGED. A machine is the same session somewhere else, and the
 * revert is the plan's own row; both keep their approved lines from `swapLineFor`.
 */
export const SwapPreviewLine: React.FC<{
  row: SwappableSession & { id?: string };
  option: SwapOption;
  className?: string;
}> = ({ row, option, className = '' }) => {
  const kind = option.kind ?? 'discipline';
  const isSession = kind === 'discipline' || kind === 'hike';
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!isSession) return;
    let cancelled = false;
    const replacing = (disciplineOf(row?.type) ?? 'run') as 'ride' | 'run' | 'swim';
    const long = intensityOf(row) === 'long';

    if (kind === 'hike') {
      // The hike keeps the long session's own minutes; there is no other session to resolve.
      setLine(swapSessionLine({ name: 'Hike', minutes: resolveMinutes(row), long: true, replacing }));
      return;
    }

    (async () => {
      try {
        const userId = getStoredUserId();
        if (!userId) return;
        const write = await resolveSwapWrite(userId, row as never, option);
        if (cancelled) return;
        const patch = write.patch as { name?: unknown; duration?: unknown };
        // ⚠️ A SHELL PATCH CARRIES NO DURATION — the row keeps its own time, so its own minutes are
        // the length it will have.
        const minutes = Number(patch.duration) > 0 ? Number(patch.duration) : resolveMinutes(row);
        setLine(swapSessionLine({ name: String(patch.name ?? ''), minutes, long, replacing }));
      } catch (e) {
        // A failed read is no line, never a wrong one.
        console.warn('[swap] could not resolve the session for the sheet line', e);
        if (!cancelled) setLine(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, kind, option.to, option.venue]);

  const text = isSession ? line : swapLineFor(option);
  if (!text) return null;
  return <div className={className}>{text}</div>;
};

export default SwapPreviewLine;
