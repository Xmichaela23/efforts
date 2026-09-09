import React from 'react';
import { ChevronDown } from 'lucide-react';
import { LoadKey, type LoadBarData } from '@/components/LoadBar';
import { formZone } from '@shared/fitness-fatigue';
import { useAppContext } from '@/contexts/AppContext';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { getDisciplineColor } from '@/lib/context-utils';

/**
 * ═══ THE LOAD CARD — fitness, fatigue, form, and what the week has covered ═══════════════════════
 *
 * ⛔ MOVED OFF THE WEEK CALENDAR, WHERE IT WAS INLINE, AND REDRAWN (Michael, 2026-09-09: it "looks
 * messy"). It renders in ONE place — Today, under the day's sessions — and nowhere else.
 *
 * ⛔⛔ TWO ROWS IN PROFILE'S NUMBER-ROW IDIOM (`ui/number-row.tsx`): the number in white, the label
 * grey beside it, nothing shouting. What it replaced was `LoadBar`'s compact head — the same three
 * numbers, but wrapped mid-row with `·` separators between them and a second line of sport-COLOURED
 * numbers underneath, so five colours and three type sizes competed in a block six lines tall.
 *
 *   · Row 1 — fitness / fatigue / form, with this week's change small beside each.
 *   · Row 2 — Run / Bike / Lifted, the value in white and a sport-colour DOT before the label. ⚠️ THE
 *     COLOUR MOVES TO THE DOT AND OFF THE TEXT. A coloured number reads as a status; the sport is
 *     which row this is, not how the week went, so it belongs in a mark rather than in the figure.
 *
 * ⛔ SAME NUMBERS, SAME SOURCES, NOTHING RECOMPUTED. Fitness / fatigue / form and their week-ago
 * deltas come off the coach payload's `fitness_fatigue` exactly as `LoadBar` reads them; the
 * distances are the server's `weeklyStats`; the lifted figure is the same `reps × weight` sum over
 * the week's logged sets. This file changed how they are drawn and nothing about what they are.
 *
 * ⛔ ONE CHEVRON, ON THE HEADER LINE. It opens the explanation AND the workload bars beneath the
 * card — the ⓘ is gone, so there are not two disclosures on one card doing different jobs. The
 * caller owns the state and renders the bars; see `TodayWeekBlocks`.
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

const fmt1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v));

/** This week's change, a signed number and never an arrow — the same rule `LoadBar` prints by. */
const delta = (now: number | null | undefined, then: number | null | undefined): string | null => {
  if (now == null || then == null || !Number.isFinite(now) || !Number.isFinite(then)) return null;
  const d = Math.round(now - then);
  return d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`;
};

/** TrainingPeaks' Form zones (Friel) — fresh and optimal read plain, high risk is flagged. */
const FORM_ZONE_CLS: Record<string, string> = {
  fresh: 'text-white/70', optimal: 'text-white/70', 'grey zone': 'text-white/45',
  transitional: 'text-white/50', 'high risk': 'text-[#FF5A5F]',
};

/** One cell of row 1: the number in white, the label grey under it, the change small beside it. */
const StatCell: React.FC<{ label: string; value: string | null; change?: string | null; after?: React.ReactNode }> = ({
  label, value, change, after,
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="flex items-baseline gap-1 min-w-0">
      <span className="text-[17px] font-light tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.92)' }}>
        {value ?? '—'}
      </span>
      {change ? <span className="text-[10.5px] tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.42)' }}>{change}</span> : null}
    </span>
    <span className="flex items-baseline gap-1 text-[11px] leading-none truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
      {label}
      {after}
    </span>
  </div>
);

/** One cell of row 2: the value in white, a sport-colour dot before the grey label. */
const SportCell: React.FC<{ label: string; value: string; sport: string }> = ({ label, value, sport }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[15px] font-light tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.92)' }}>
      {value}
    </span>
    <span className="flex items-center gap-1.5 text-[11px] leading-none truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
      <span
        aria-hidden="true"
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 6, height: 6, background: getDisciplineColor(sport) }}
      />
      {label}
    </span>
  </div>
);

const WeekLoadCard: React.FC<{
  /** `weeklyStats` from `useWeekUnified` — the server's per-sport distance for the week. */
  weeklyStats?: WeeklyStats | null;
  /** The week's unified items, for the logged strength volume. */
  items?: readonly unknown[];
  /** The disclosure on the header line. The caller owns the state and what appears underneath. */
  expanded?: boolean;
  onToggle?: () => void;
  /**
   * Whether the caller has workload bars to reveal. The card knows about its own explanation and
   * nothing about what renders beneath it, so the chevron's second reason to exist comes from here.
   */
  hasBars?: boolean;
  className?: string;
}> = ({ weeklyStats, items = [], expanded, onToggle, hasBars = false, className = '' }) => {
  const { useImperial } = useAppContext();
  const coachCtx = useCoachWeekContext();

  const wsv = coachCtx.data?.weekly_state_v1;
  const ff = ((wsv?.load as LoadBarData | undefined)?.fitness_fatigue) ?? null;
  const wk = ff?.week_ago ?? null;
  const zone = formZone(ff?.form);

  const metrics: Array<{ label: string; value: string; sport: string }> = [];
  const d = weeklyStats?.distances;
  if (d) {
    if ((d.run_meters ?? 0) > 0)
      metrics.push({ label: 'Run', sport: 'run', value: useImperial ? `${(d.run_meters! / 1609.34).toFixed(1)} mi` : `${(d.run_meters! / 1000).toFixed(1)} km` });
    if ((d.cycling_meters ?? 0) > 0)
      metrics.push({ label: 'Bike', sport: 'bike', value: useImperial ? `${(d.cycling_meters! / 1609.34).toFixed(1)} mi` : `${(d.cycling_meters! / 1000).toFixed(1)} km` });
    if ((d.swim_meters ?? 0) > 0)
      metrics.push({ label: 'Swim', sport: 'swim', value: useImperial ? `${Math.round(d.swim_meters! / 0.9144)} yd` : `${Math.round(d.swim_meters!)} m` });
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
    metrics.push({ label: 'Lifted', sport: 'strength', value: `${totalVol.toLocaleString()} ${useImperial ? 'lb' : 'kg'}` });

  const hasNumbers = ff != null && fmt1(ff.fitness) != null;
  if (!hasNumbers && metrics.length === 0) return null;

  return (
    <div className={`galaxy-card readout-texture readout-texture--nova rounded-xl border border-white/[0.10] px-3 py-3 ${className}`}>
      {/* ⛔ THE HEADER LINE: the word, then the chevron immediately right of it. No ⓘ — one control. */}
      <div className="flex items-center gap-1.5">
        <span className="readout-label text-[11px] font-semibold tracking-[0.12em] uppercase">LOAD</span>
        {/* ⚠️ NO CHEVRON WHERE THERE IS NOTHING TO OPEN. A control that reveals an empty space
            teaches the athlete to stop tapping controls. */}
        {onToggle && (hasNumbers || hasBars) ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded === true}
            aria-label="What fitness, fatigue and form mean, and workload over five weeks"
            className="p-0.5 rounded-xl text-white/40 hover:text-white/85 transition-colors"
          >
            <ChevronDown
              className="h-3.5 w-3.5"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}
            />
          </button>
        ) : null}
      </div>

      {hasNumbers ? (
        <div className="mt-2.5 grid grid-cols-3 gap-x-3">
          <StatCell label="fitness" value={String(fmt1(ff!.fitness))} change={delta(ff!.fitness, wk?.fitness)} />
          <StatCell label="fatigue" value={String(fmt1(ff!.fatigue))} change={delta(ff!.fatigue, wk?.fatigue)} />
          <StatCell
            label="form"
            value={`${(ff!.form ?? 0) > 0 ? '+' : ''}${fmt1(ff!.form)}`}
            change={delta(ff!.form, wk?.form)}
            /* ⚠️ FRIEL'S ZONE WORD STAYS, beside the label rather than beside the number — it is the
               one thing on this card that says what the figure MEANS, and losing it in a redraw
               would be a content change nobody asked for. */
            after={zone ? <span className={FORM_ZONE_CLS[zone] ?? 'text-white/45'}>{zone}</span> : null}
          />
        </div>
      ) : (
        <div className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.40)' }}>no sessions logged yet</div>
      )}

      {metrics.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-x-3">
          {metrics.map((m) => (
            <SportCell key={m.label} label={m.label} value={m.value} sport={m.sport} />
          ))}
        </div>
      )}

      {/* ⛔ THE EXPLANATION OPENS WITH THE CHEVRON — one owner for the words, `LoadKey` in `LoadBar`. */}
      {expanded && ff ? <LoadKey ff={ff} /> : null}
    </div>
  );
};

export default WeekLoadCard;
