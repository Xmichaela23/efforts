import React, { useMemo } from 'react';
import LoadWeeksCard from '@/components/context/LoadWeeksCard';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { useAppContext } from '@/contexts/AppContext';
import { weekTotals, weekTotalRows } from '@/lib/week-totals';

/**
 * ═══ THE WEEK, UNDER THE DAY ═════════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3b.2 and §3b.3 — the load bars, one per sport the
 * athlete does, and one row of this week's counts under them.
 *
 * ⛔ THE LOAD CARD IS NOT NEW AND NOT MOVED-FROM-A-SCREEN. `LoadWeeksCard` was built for State and
 * has been imported there without ever being RENDERED — a dead import in
 * `StatePerformanceSection`. So nothing comes off State: the card simply starts appearing, here,
 * for the first time. The dead import goes in the same change so the next reader does not go
 * looking for the version that was supposedly removed.
 *
 * ⛔ THE NUMBERS ARE READ, NEVER COMPUTED HERE. The bars come from the server's display contract
 * (`state_trends_v1.display.loadByDiscipline`); the counts come from the week `get-week` already
 * returned, through `@/lib/week-totals`, which uses the app's own distance and volume readers.
 *
 * ⚠️ ONE PER SPORT THE ATHLETE DOES. A sport with no load in the window renders nothing —
 * `LoadWeeksCard` returns null for it — so a runner who does not swim sees no swim bars.
 */

type LoadRead = { week: number | null; typical: number | null; weeks?: number[] } | null | undefined;

const TodayWeekBlocks: React.FC<{ weekRows: readonly unknown[]; className?: string }> = ({
  weekRows,
  className = '',
}) => {
  const { data } = useCoachWeekContext();
  const { useImperial } = useAppContext();

  const loadByDiscipline = (data?.weekly_state_v1?.trends?.display as
    | { loadByDiscipline?: Record<string, LoadRead> }
    | null
    | undefined)?.loadByDiscipline;

  const rows = useMemo(() => weekTotalRows(weekTotals(weekRows), useImperial), [weekRows, useImperial]);

  const cards = (['run', 'ride', 'swim'] as const)
    .map((sport) => ({ sport, load: loadByDiscipline?.[sport] }))
    .filter((c) => !!c.load);

  return (
    <div className={className}>
      {/**
        * ⚠️ THE BARS AND THE COUNTS ARE INDEPENDENT, and the counts do not wait for the bars. The
        * load figures come from the server's snapshot, which does not exist for an account whose
        * first week has not been analysed yet; the counts come from the week itself and are
        * answerable from the moment there is a week. Gating both on the snapshot is how the whole
        * block would vanish for exactly the athlete most likely to look at it.
        */}
      {cards.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03]">
          {cards.map(({ sport, load }) => (
            <LoadWeeksCard key={sport} sport={sport} load={load} />
          ))}
        </div>
      ) : null}

      {/* ⛔ NUMBERS ONLY, NO SENTENCE (§3b.3). */}
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.40)' }}>
              {r.label}
            </span>
            <span className="text-[13px] font-light tabular-nums" style={{ color: 'rgba(255,255,255,0.82)' }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TodayWeekBlocks;
