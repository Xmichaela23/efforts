import React from 'react';
import { ChevronDown } from 'lucide-react';
import LoadBar from '@/components/LoadBar';
import { useAppContext } from '@/contexts/AppContext';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { getDisciplineColorRgb } from '@/lib/context-utils';
import { weekExecTotals } from '@/lib/week-exec-totals';

/**
 * ═══ THE LOAD CARD — fitness, fatigue, form, and what the week has covered ═══════════════════════
 *
 * ⛔ EXTRACTED FROM `WorkoutCalendar`, WHERE IT WAS INLINE, AND MOVED TO TODAY (Michael,
 * 2026-09-09). It sat at the bottom of the Week calendar; Today is the screen an athlete opens, and
 * this is the read they open it for. It renders in ONE place — under the day's sessions, above the
 * workload bars — and nowhere else.
 *
 * ⚠️ THE CARD ITSELF IS UNCHANGED. Same `LoadBar` with the same four inputs, the same per-sport
 * readout treatment, the same `galaxy-card readout-texture` shell. What moved is where it hangs.
 * Nothing about the numbers, the wording or the styling was touched on the way over — a move and a
 * restyle in one change is how a regression hides.
 *
 * ⛔ AND THE Run / Ride / Lifted ROW CAME OFF TODAY IN THE SAME CHANGE. This card already carries
 * those three figures; two rows of the same numbers under one another is the divergence-by-accretion
 * this screen keeps having to unpick.
 */

type WeeklyStats = {
  distances?: {
    run_meters?: number;
    cycling_meters?: number;
    swim_meters?: number;
  } | null;
};

type WeekItem = {
  type?: unknown;
  executed?: { strength_exercises?: Array<{ sets?: Array<{ weight?: unknown; reps?: unknown; completed?: unknown }> }> } | null;
};

const WeekLoadCard: React.FC<{
  /** `weeklyStats` from `useWeekUnified` — the server's per-sport distance for the week. */
  weeklyStats?: WeeklyStats | null;
  /** The week's unified items, for the logged strength volume. */
  items?: readonly unknown[];
  /**
   * The disclosure at the card's right edge. Present only when there is something to open —
   * the caller owns both the state and what appears underneath.
   */
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}> = ({ weeklyStats, items = [], expanded, onToggle, className = '' }) => {
  const { useImperial } = useAppContext();
  const coachCtx = useCoachWeekContext();

  const wsv = coachCtx.data?.weekly_state_v1;
  const snap = (coachCtx.data as { athlete_snapshot?: { body_response?: { load_status?: unknown } } } | null | undefined)?.athlete_snapshot ?? null;
  const loadStatus = (snap?.body_response?.load_status ?? null) as never;

  const metrics: Array<{ label: string; value: string; type: string }> = [];
  const d = weeklyStats?.distances;
  if (d) {
    if ((d.run_meters ?? 0) > 0)
      metrics.push({ label: 'Run:', value: useImperial ? `${(d.run_meters! / 1609.34).toFixed(1)} mi` : `${(d.run_meters! / 1000).toFixed(1)} km`, type: 'run' });
    if ((d.cycling_meters ?? 0) > 0)
      metrics.push({ label: 'Bike:', value: useImperial ? `${(d.cycling_meters! / 1609.34).toFixed(1)} mi` : `${(d.cycling_meters! / 1000).toFixed(1)} km`, type: 'bike' });
    if ((d.swim_meters ?? 0) > 0)
      metrics.push({ label: 'Swim:', value: useImperial ? `${Math.round(d.swim_meters! / 0.9144)} yd` : `${Math.round(d.swim_meters!)} m`, type: 'swim' });
  }

  let totalVol = 0;
  for (const raw of items as WeekItem[]) {
    if (String(raw?.type ?? '').toLowerCase() !== 'strength') continue;
    for (const ex of raw?.executed?.strength_exercises ?? []) {
      if (!ex?.sets) continue;
      for (const s of ex.sets) {
        if (s?.completed === false) continue;
        const w = Number(s?.weight) || 0;
        const r = Number(s?.reps) || 0;
        if (w > 0 && r > 0) totalVol += w * r;
      }
    }
  }
  if (totalVol > 0)
    metrics.push({ label: 'Strength:', value: `${totalVol.toLocaleString()} ${useImperial ? 'lb' : 'kg'}`, type: 'strength' });

  if (!wsv && metrics.length === 0) return null;

  return (
    // ⛔ ONE textured card holding LOAD *and* the week totals — the totals used to sit on bare black
    // below a textured LoadBar, which is what kept reading as "no texture" (Michael 2026-08-15,
    // third showing). The spectral grid wraps the whole data block.
    // ⚠️ `pr-7` ONLY WHERE THE CHEVRON IS. `LoadBar`'s row is justify-between, so its status text
    // ends at the card's right edge — exactly where the disclosure sits. The inset moves the text
    // clear instead of letting the two stack on the same pixels, which is the defect the swap glyph
    // hit on Today's card and had to be moved out of.
    <div className={`galaxy-card readout-texture readout-texture--nova rounded-xl border border-white/[0.10] pb-3 space-y-2 relative ${onToggle ? 'pr-7' : ''} ${className}`}>
      {/**
        * ⛔ THE CHEVRON AT THE RIGHT EDGE (Michael, 2026-09-09) — it opens the workload bars beneath
        * the card. ⚠️ It is a DISCLOSURE, not a link: the bars are the same week seen over five of
        * them, so they belong under the read rather than beside it, and an athlete who does not want
        * the history should not have to scroll past it.
        *
        * ⚠️ ABSOLUTELY POSITIONED so it cannot displace `LoadBar`'s own justify-between row, which
        * puts the verdict word right-of-centre; a flex sibling would push that off its column.
        */}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded === true}
          aria-label="Workload over five weeks"
          className="absolute right-2 top-2 z-10 p-1 rounded-xl text-white/45 hover:text-white/85 hover:bg-white/[0.08] transition-colors"
        >
          <ChevronDown
            className="h-4 w-4"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
          />
        </button>
      ) : null}
      {wsv && (
        // Same three inputs State passes (hasActivePlan · planned · done) — without them the
        // programme-aware read fell back to the bare status word, so Home and State could
        // print different load words for the same week (2026-09-03).
        <LoadBar
          load={wsv.load as never}
          loadStatus={loadStatus}
          weekIntent={wsv?.week?.intent}
          hasActivePlan={(wsv as { plan?: { has_active_plan?: boolean } })?.plan?.has_active_plan === true}
          plannedThisWeek={weekExecTotals(wsv as never).planned}
          doneThisWeek={weekExecTotals(wsv as never).done}
          compact
        />
      )}
      {metrics.length > 0 && (
        // Second column starts at 58% so Bike/Swim line up with the verdict word above
        // (Michael 2026-08-15: "move bike, not balanced"). LOAD's row is justify-between,
        // so the verdict sits right-of-centre — a plain 50/50 grid put Bike left of it.
        <div className="grid grid-cols-[60%_1fr] gap-x-4 gap-y-0.5 px-3">
          {/* READOUT TREATMENT, PER SPORT (2026-08-15). Each metric sets its own accent, so
              the label tints and the NUMBER glows in that sport's colour — the numbers were
              flat white while only the labels carried colour, which read as a legend rather
              than as instrument readouts. Same `readout-label`/`readout-num` pair State and
              the workout Performance tab use, so the week totals here and the discipline
              rows on State are one treatment. */}
          {metrics.map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 min-w-0"
              style={{ ['--card-accent-rgb' as string]: getDisciplineColorRgb(m.type) } as React.CSSProperties}
            >
              <span className="readout-label font-light leading-tight" style={{ fontSize: '0.82rem' }}>{m.label}</span>
              <span className="readout-num font-light leading-tight truncate" style={{ fontSize: '0.82rem' }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WeekLoadCard;
