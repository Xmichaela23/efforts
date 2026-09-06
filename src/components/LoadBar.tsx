import React from 'react';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { formZone } from '@shared/fitness-fatigue';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadBarData {
  /**
   * TrainingPeaks' Performance Management Chart — THE load read (2026-09-04, Michael: one reference per metric).
   * fitness = 42-day exponential average of daily workload (CTL), fatigue = 7-day (ATL), form = yesterday's
   * fitness − yesterday's fatigue (TSB). Server-computed (`_shared/fitness-fatigue.ts`) over the whole history.
   */
  fitness_fatigue?: { fitness: number | null; fatigue: number | null; form: number | null; week_ago?: { fitness: number | null; fatigue: number | null; form: number | null } | null } | null;
  /** Kept on the payload for the coach; NOT rendered here since 2026-09-04 (ACWR is Gabbett's — neither Garmin nor TrainingPeaks). */
  acwr?: number | null;
  acwr_provisional?: boolean;
  wtd_actual_load: number | null;
  wtd_planned_load?: number | null;
  daily_load_7d: Array<{
    date: string;
    load: number;
    dominant_type: string;
    by_type?: Array<{ type: string; load: number }>;
  }>;
}

export interface LoadBarStatus {
  status: 'under' | 'on_target' | 'productive' | 'elevated' | 'high';
}

interface LoadBarProps {
  load: LoadBarData;
  /** Kept for the callers' sake (State and Home pass it); NOT read since 2026-09-04 — the reconciled load word is off the bar. */
  loadStatus?: LoadBarStatus | null;
  weekIntent?: string | null;
  /** compact variant (calendar) — the three numbers only, no composition strip. */
  compact?: boolean;
  hasActivePlan?: boolean;
  plannedThisWeek?: number;
  doneThisWeek?: number;
}

// ⛔ THE LOAD WORD IS OFF THIS BAR (2026-09-04). `loadRead` (src/lib/load-read.ts) still gates the glance
// headline on StateTab; the bar prints TrainingPeaks' three numbers and nothing the app decided.

// ── Helpers ──────────────────────────────────────────────────────────────────

// ⛔ loadVolumeColor + statusVolumeLabel removed here (2026-09-01) — the load word is now the
// programme-aware `loadRead` above, which carries its own colour.


// One discipline vocabulary app-wide (Michael 2026-07-22): "bike" not "Ride" (swim-bike-run is the tri
// canon), lowercase to match the calm secondary-label style everywhere else on the screen.
const DISPLAY_NAME: Record<string, string> = {
  run: 'run', running: 'run', bike: 'bike', ride: 'bike', cycling: 'bike',
  swim: 'swim', swimming: 'swim', strength: 'strength', strength_training: 'strength',
  weight: 'strength', weights: 'strength', mobility: 'mobility', pilates_yoga: 'mobility',
};
function disciplineName(type: string): string {
  const t = (type || '').toLowerCase();
  return DISPLAY_NAME[t] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other');
}

function Dot() {
  return <span className="text-white/30 select-none">·</span>;
}

// TrainingPeaks' Form zones (Friel): the word beside the form number — fresh and optimal read plain, the
// grey zone dim, transitional dim, high risk flagged.
const FORM_ZONE_CLS: Record<string, string> = {
  fresh: 'text-white/85', optimal: 'text-white/85', 'grey zone': 'text-white/55',
  transitional: 'text-white/60', 'high risk': 'text-[#FF5A5F]',
};

// ── LoadBar ──────────────────────────────────────────────────────────────────
// The load section: TrainingPeaks' fitness · fatigue · form on the first line (2026-09-04), then the weekly
// composition (which discipline carried the load — our differentiator, and the same "TSS by sport" split
// TrainingPeaks draws on its dashboard) as the primary visual. Per-day detail lives in the calendar.

export default function LoadBar({ load, compact }: LoadBarProps) {
  // ⛔ THE LOAD READ IS TRAININGPEAKS' PMC, WHOLE (2026-09-04, Michael: "each metric has to have an absolute
  // reference point", never a hodgepodge). Fitness · Fatigue · Form, and Friel's Form zone word beside form.
  // WHAT THIS REPLACED: the reconciled load word ("balanced" — the app's own reconciler, D-260) and the
  // ACWR ratio (Gabbett). Neither is Garmin's or TrainingPeaks' rule; both stay on the payload for the coach.
  const ff = load.fitness_fatigue ?? null;
  const zone = formZone(ff?.form);
  const fmt1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v));
  // The week's change beside each number (intervals.icu's tile). Printed as a signed number, never an arrow.
  const delta = (now: number | null | undefined, then: number | null | undefined) => {
    if (now == null || then == null || !Number.isFinite(now) || !Number.isFinite(then)) return null;
    const d = Math.round(now - then); return d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`;
  };
  const wk = ff?.week_ago ?? null;
  const Delta = ({ v }: { v: string | null }) => v ? <span className="ml-0.5 text-[10.5px] text-white/45 tabular-nums">{v}</span> : null;

  // Weekly COMPOSITION — aggregate the 7-day load by discipline (from by_type; fall back to the
  // day's dominant_type). This is the primary load visual; the per-day rhythm lives in the calendar.
  const dailyLoad = load.daily_load_7d ?? [];
  const byDiscipline = new Map<string, number>();
  for (const d of dailyLoad) {
    const segs = d.by_type && d.by_type.length > 0
      ? d.by_type
      : (d.load > 0 ? [{ type: d.dominant_type, load: d.load }] : []);
    for (const s of segs) {
      const t = (s.type || '').toLowerCase();
      if (!t || t === 'none' || !(s.load > 0)) continue;
      byDiscipline.set(t, (byDiscipline.get(t) ?? 0) + s.load);
    }
  }
  const total = [...byDiscipline.values()].reduce((a, b) => a + b, 0);
  const rawComp = [...byDiscipline.entries()]
    .map(([type, l]) => ({ type, load: l, pct: total > 0 ? (l / total) * 100 : 0 }))
    .sort((a, b) => b.load - a.load);
  // Displayed integer percentages via LARGEST-REMAINDER rounding, so the labels sum to EXACTLY 100.
  // Rounding each independently can total 99 or 101 (e.g. 42+24+21+12 = 99). The bar WIDTHS still use
  // the raw fractional pct (flexGrow below), so the segments stay proportionally exact.
  const targetSum = total > 0 ? 100 : 0;
  const comp = rawComp.map((c) => ({ ...c, displayPct: Math.floor(c.pct) }));
  let leftover = targetSum - comp.reduce((a, c) => a + c.displayPct, 0);
  for (const c of [...comp].sort((a, b) => (b.pct % 1) - (a.pct % 1))) {
    if (leftover <= 0) break;
    c.displayPct += 1;
    leftover -= 1;
  }
  const dominant = comp[0]?.type ?? null;

  return (
    <div className="px-3 py-3">
      {/* Fitness · Fatigue · Form — TrainingPeaks' three numbers on one line, the Form zone word beside form. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="readout-label text-[11px] font-semibold tracking-[0.12em] uppercase">LOAD</span>
        {ff && fmt1(ff.fitness) != null ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-white/45 leading-none [&>span]:whitespace-nowrap">
            <span>fitness <span className="readout-num text-[13px] text-white/85">{fmt1(ff.fitness)}</span><Delta v={delta(ff.fitness, wk?.fitness)} /></span>
            <Dot />
            <span>fatigue <span className="readout-num text-[13px] text-white/85">{fmt1(ff.fatigue)}</span><Delta v={delta(ff.fatigue, wk?.fatigue)} /></span>
            <Dot />
            <span>
              form <span className="readout-num text-[13px] text-white/85">{(ff.form ?? 0) > 0 ? '+' : ''}{fmt1(ff.form)}</span>
              {zone && <span className={`ml-1 ${FORM_ZONE_CLS[zone] ?? 'text-white/55'}`}>{zone}</span>}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-white/40 leading-none">no sessions logged yet</span>
        )}
      </div>
      {ff && fmt1(ff.fitness) != null && (
        <div className="mt-1.5 text-[11px] text-white/50 leading-snug">
          fitness: the last 6 weeks · fatigue: the last week · form = fitness − fatigue, above zero fresh, below zero carrying load · small numbers: this week's change
        </div>
      )}

      {/* Composition strip — the primary load visual (full surface only). */}
      {!compact && comp.length > 0 && total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="readout-label text-[11px] uppercase tracking-[0.08em]">Where your load is going</span>
            {/* The composition below is the ROLLING last-7-days load (daily_load_7d). Show that same
                window's total here — NOT wtd_actual_load (week-to-date), which is a different window and
                mislabeled this number as WTD over a 7-day bar. `total` is the sum the bar itself represents. */}
            <span className="readout-num text-[11px]">{Math.round(total)} pts · last 7 days</span>
          </div>
          <div className="flex h-6 rounded-md overflow-hidden gap-[2px]">
            {comp.map((c) => {
              const isDom = c.type === dominant;
              return (
                <div
                  key={c.type}
                  className="flex items-center justify-center min-w-[6px]"
                  style={{
                    flexGrow: c.pct, flexBasis: 0,
                    backgroundColor: getDisciplineColor(c.type),
                    boxShadow: isDom ? 'inset 0 0 0 1.5px rgba(255,255,255,0.42)' : undefined,
                  }}
                  title={`${disciplineName(c.type)} ${c.displayPct}%`}
                >
                  {/* ⛔ NO TEXT INSIDE THE BAR (FIXLIST 1e, 2026-09-01). Every percentage was printed
                      TWICE — once here and again in the legend two lines below, which already carries
                      the swatch, the sport name and the share for EVERY segment in that sport's colour.
                      ⚠️ AND THE IN-BAR LABEL WAS INCONSISTENT BY CONSTRUCTION: it was gated on
                      `c.pct >= 26`, so on a typical split only the dominant segment cleared it. The bar
                      read as one labelled block beside two anonymous ones, sitting over a legend that
                      labelled all three. The segment's own colour plus the legend swatch is the tie,
                      and the dominant segment keeps its inset ring above — a mark, not a second
                      caption. The `title` tooltip keeps the per-segment read on hover. */}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2">
            {comp.map((c) => (
              // Each legend entry carries its OWN sport accent, so its share glows in that sport's
              // colour rather than sitting flat white next to a colour swatch (2026-08-15). The
              // swatch stays — it ties the entry to its segment in the bar above.
              <span
                key={c.type}
                className="inline-flex items-center gap-1.5 text-[12.5px] text-white/70"
                style={{ ['--card-accent-rgb' as any]: getDisciplineColorRgb(c.type) }}
              >
                <span className="inline-block w-2 h-2 rounded-[2px]" style={{ backgroundColor: getDisciplineColor(c.type) }} />
                <span className={c.type === dominant ? 'text-white font-semibold' : ''}>{disciplineName(c.type)}</span>
                <span className="readout-num text-[11px]">{c.displayPct}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
