import React from 'react';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { loadRead } from '@/lib/load-read';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoadBarData {
  acwr: number | null;
  /** The ACWR ratio rests on a chronic base too short to trust (Gabbett ~4wk; Garmin/COROS/Intervals
   *  gate on an established base). Rendered "· provisional" so a bare high number isn't read as a real spike. */
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
  loadStatus: LoadBarStatus | null;
  weekIntent?: string | null;
  /** compact variant (calendar) — verdict + ACWR only, no composition strip. */
  compact?: boolean;
  /** ⛔ PROGRAMME-AWARE LOAD READ (2026-09-01). Whether a plan is active, and this week's planned vs
   *  done session totals (from `wsv.week_execution_v1.counts`, the SAME source the planned-vs-actual
   *  bar reads — no second notion of "missed"). Absent → treated as no plan. */
  hasActivePlan?: boolean;
  plannedThisWeek?: number;
  doneThisWeek?: number;
}

// ⛔ loadRead moved to src/lib/load-read.ts (2026-09-01) so the LOAD word and the glance HEADLINE
// share ONE programme-aware decision and cannot drift. Imported below.

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

// ── LoadBar ──────────────────────────────────────────────────────────────────
// The load section, composition-forward (2026-07-09). Research verdict: a glance surface leads with
// a VERDICT + an aggregate BREAKDOWN, never a per-day bar chart — every major app (TrainingPeaks,
// WHOOP, Garmin, Intervals.icu) keeps per-day granularity one tap deeper. So: the reconciled verdict
// leads, the weekly composition (which discipline carried the load — our differentiator) is the primary
// visual, ACWR is demoted to a reference number, and per-day detail lives in the calendar drill-down.

export default function LoadBar({ load, loadStatus, weekIntent, compact, hasActivePlan, plannedThisWeek, doneThisWeek }: LoadBarProps) {
  const isTaperOrPeak = weekIntent === 'taper' || weekIntent === 'peak';

  // ⛔ THE READ IS PROGRAMME-AWARE (2026-09-01) — see `loadRead`. It reads the reconciled two-key
  // status (D-260 sole authority) plus this week's planned-vs-done, and states a FACT or nothing —
  // never an imperative. `week` (test week) counts as prescribed-light/hard like taper/peak.
  const prescribedShaped = isTaperOrPeak || weekIntent === 'test';
  const read = loadRead(loadStatus?.status, prescribedShaped, hasActivePlan === true, plannedThisWeek ?? 0, doneThisWeek ?? 0);
  const showVerdict = read != null;

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
  const [showAcwrInfo, setShowAcwrInfo] = React.useState(false);

  return (
    <div className="px-3 py-3">
      {/* Verdict leads; ACWR is the demoted reference number (D-260: ACWR describes, never decides). */}
      <div className="flex items-center justify-between">
        {/* readout-label/readout-num (index.css): instrument typography off the plate's accent —
            neutral white here, since LOAD sits on the multi-sport plate. */}
        <span className="readout-label text-[11px] font-semibold tracking-[0.12em] uppercase">LOAD</span>
        <div className="flex items-center gap-2">
          {read && (
            <span className={`text-[15px] font-semibold tracking-tight ${read.cls}`}>{read.text}</span>
          )}
          {load.acwr != null && (
            <>
              {showVerdict && <Dot />}
              {/* ACWR is a BARE reference number — no zone word ("optimal"/"pushing"). The zone label
                  editorializes and competes with the engine's verdict (a 1.2 "optimal" next to a
                  "build more" verdict reads as a contradiction). One voice: the verdict judges, ACWR
                  is just the datapoint (D-260). */}
              <span className="text-[11px] tabular-nums text-white/40 leading-none">ACWR {load.acwr.toFixed(1)}</span>
              {load.acwr_provisional && (
                <span className="text-[10px] text-white/30 leading-none">· provisional</span>
              )}
              <button
                type="button"
                aria-label="What is ACWR?"
                onClick={() => setShowAcwrInfo((v) => !v)}
                className="text-white/30 hover:text-white/60 text-[10px] leading-none bg-transparent border-none cursor-pointer p-0"
              >
                {showAcwrInfo ? '▾' : 'ⓘ'}
              </button>
            </>
          )}
        </div>
      </div>

      {showAcwrInfo && (
        <div className="mt-2 space-y-1.5 text-[11px] leading-snug text-white/45">
          {/* Copy: Michael 2026-09-02 (voice-checked). Load points on runs follow the athlete's rating first. */}
          <p>
            <span className="text-white/70">Workload</span> — hours times intensity, on a scale where one hour
            at threshold is 100. On runs your rating sets the intensity when you gave one; otherwise heart rate
            against your threshold, or power against FTP. The bar splits your rolling-7-day total by sport.
          </p>
          <p>
            <span className="text-white/70">ACWR</span> — last 7 days of workload divided by your average week over
            the last 4. 1.0 is a normal week for you. Around 1.3 or more is a bigger jump than you usually take.
          </p>
          <p>
            <span className="text-white/70">The load read</span> (e.g. "balanced") combines all of it — your
            workload<span className="italic"> and</span> ACWR together with how your body's handling it
            (heart rate, effort, readiness) — so it can differ from the bare ratio on purpose.
          </p>
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
            <span className="readout-num text-[11px]">{Math.round(total)} pts · rolling 7d</span>
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
