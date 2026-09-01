import React from 'react';
import type { CoachWeekContextV1, RaceReadinessV1 } from '@/hooks/useCoachWeekContext';
import { getDisciplineColor, hexToRgb } from '@/lib/context-utils';

/**
 * STATE SCREEN PRIMITIVES — extracted from StateTab 2026-09-01 (Round 0a).
 * NO BEHAVIOUR CHANGE: every helper and sub-component below is verbatim from StateTab, with its
 * comments carried across. They live here so the blocks that use them can move between files
 * without dragging the layout's private helpers along.
 */

export const NUDGE_DISMISS_KEY = 'efforts.nudge.dismissed.';

export function isNudgeSnoozed(kind: string): boolean {
  try {
    const raw = window.localStorage.getItem(`${NUDGE_DISMISS_KEY}${kind}`);
    if (!raw) return false;
    const ymd = raw.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    return (Date.now() - new Date(`${ymd}T12:00:00`).getTime()) / 86400000 < 7;
  } catch {
    return false;
  }
}

export function snoozeNudge(kind: string): void {
  try {
    window.localStorage.setItem(`${NUDGE_DISMISS_KEY}${kind}`, new Date().toISOString().slice(0, 10));
  } catch { void 0; }
}

export type CoachDataProp = {
  data: CoachWeekContextV1 | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  revalidating?: boolean;
};

export type PrimaryRaceReadinessRow = NonNullable<CoachWeekContextV1['primary_race_readiness']>;

// ── helpers ───────────────────────────────────────────────────────────────────

export function trendColor(dir: string, tone?: string): string {
  if (tone === 'positive') return 'text-emerald-400/90';
  if (tone === 'danger') return 'text-red-400/90';
  if (tone === 'warning') return 'text-amber-400/90';
  if (dir === 'improving') return 'text-emerald-400/85';
  if (dir === 'declining') return 'text-amber-400/85';
  return 'text-white/55';
}


export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

/** Days from `ymd` to today (UTC-naive). Negative = future, positive = past. Null when invalid. */
export function daysSinceYmd(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const target = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** Race references stay in State for the race week, then disappear once 7 days have passed. */
export function isRaceWeekClosed(ymd: string | null | undefined): boolean {
  const d = daysSinceYmd(ymd);
  return d != null && d > 7;
}

/** Goal target finish clock from coach `goal_context.primary_event.target_time` (seconds). */
export function fmtGoalClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const mi = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mi}:${String(s).padStart(2, '0')}`;
}

/** +MM:SS or +H:MM:SS vs a reference time (actual − goal; negative delta = faster than goal). */
export function fmtSignedDeltaVsGoal(actualSec: number, goalSec: number): string {
  const d = actualSec - goalSec;
  if (d === 0) return 'on goal';
  const sign = d < 0 ? '−' : '+';
  const ad = Math.abs(Math.round(d));
  const h = Math.floor(ad / 3600);
  const mi = Math.floor((ad % 3600) / 60);
  const s = ad % 60;
  const body = h > 0 ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`;
  return `${sign}${body} vs goal`;
}

export function fmtSignedDeltaVsModel(actualSec: number, modelSec: number): string {
  const d = actualSec - modelSec;
  if (d === 0) return 'same as model projection';
  const sign = d < 0 ? '−' : '+';
  const ad = Math.abs(Math.round(d));
  const h = Math.floor(ad / 3600);
  const mi = Math.floor((ad % 3600) / 60);
  const s = ad % 60;
  const body = h > 0 ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`;
  return `${sign}${body} vs model`;
}

/** +MM:SS / −H:MM:SS vs the course-model projection (actual − projected). */
export function fmtSignedDeltaVsProjection(actualSec: number, projSec: number): string {
  const d = actualSec - projSec;
  if (d === 0) return 'on projection';
  const sign = d < 0 ? '−' : '+';
  const ad = Math.abs(Math.round(d));
  const h = Math.floor(ad / 3600);
  const mi = Math.floor((ad % 3600) / 60);
  const s = ad % 60;
  const body = h > 0 ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`;
  return `${sign}${body} vs projection`;
}

// STATE "how your sessions went" ACCENT — the one composed sentence for the week (server-owned, this
// only renders it — Law 4). docs/STATE-WEEK-EXECUTION.md. Deliberately neutral (grey, no icon-as-alarm):
// it is a heads-up, never a scold. Tap reveals the source measurement it was drawn from (traceability §5c).
export function WeekAccentLine({ sentence, detail }: { sentence: string; detail: string | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="px-4 pb-1.5 pt-0.5">
      <button
        type="button"
        onClick={() => { if (detail) setOpen((o) => !o); }}
        className="text-left text-[13px] leading-snug text-white/55 max-w-[min(100%,360px)]"
      >
        {sentence}
        {detail && <span className="text-white/50 text-[11px]"> {open ? '▾' : 'ⓘ'}</span>}
      </button>
      {open && detail && (
        <p className="mt-1 text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">Based on: {detail}</p>
      )}
    </div>
  );
}

// THE WEEK · MIX — planned vs actual by discipline, so a swap is SEEN, not just counted (a run traded
// for a swim shows the run share shrink and the swim share grow). Bars share one scale, so an over- or
// under-done week reads as a longer/shorter actual bar. Colors are the app's SPORT_COLORS.
export function WeekMixBar({ counts, hasPlan, partialWeek }: { counts: Array<{ discipline: string; planned: number; done: number }>; hasPlan: boolean; partialWeek: boolean }) {
  const ORDER = ['strength', 'run', 'ride', 'swim'];
  const NAME: Record<string, string> = { run: 'run', ride: 'bike', strength: 'strength', swim: 'swim' };
  const ordered = ORDER.map((d) => counts.find((c) => c.discipline === d)).filter(Boolean) as typeof counts;
  const totalPlanned = ordered.reduce((s, c) => s + c.planned, 0);
  const totalDone = ordered.reduce((s, c) => s + c.done, 0);
  const scale = Math.max(totalPlanned, totalDone, 1);
  // F26 (2026-07-20): a no-plan athlete has NOTHING planned, so there is no "planned" row to draw.
  // The old code drew an empty "planned" bar above a full "actual" bar — a shortfall a freeballer
  // never signed up for. When nothing was planned, show only what they did, labelled as such.
  const showPlanned = hasPlan && totalPlanned > 0;
  // F21 (2026-07-20): `done` is week-TO-DATE while `planned` is the WHOLE week (server: coach counts
  // planned over the full week, done bounded to [weekStart, today]). Drawn on one scale, a Monday
  // shows a full plan over an empty result with no explanation. The SENTENCE already guards partial
  // weeks (the Q-177 trap); the PICTURE never did. Label the result "so far" so the two bars aren't
  // read on the same footing.
  const doneLabel = !showPlanned ? 'this week' : partialWeek ? 'so far' : 'actual';
  const Bar = ({ label, pick }: { label: string; pick: (c: { planned: number; done: number }) => number }) => (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-white/60 w-12 shrink-0 lowercase">{label}</span>
      <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-white/[0.05]">
        {ordered.map((c) => {
          const v = pick(c);
          if (v <= 0) return null;
          return <div key={c.discipline} style={{ width: `${(v / scale) * 100}%`, backgroundColor: getDisciplineColor(c.discipline) }} />;
        })}
      </div>
    </div>
  );
  return (
    <div className="px-4 py-3 space-y-1.5">
      {showPlanned && <Bar label="planned" pick={(c) => c.planned} />}
      <Bar label={doneLabel} pick={(c) => c.done} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-14 pt-1">
        {ordered.filter((c) => c.planned > 0 || c.done > 0).map((c) => (
          <span key={c.discipline} className="inline-flex items-center gap-1 text-[12px] text-white/65">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getDisciplineColor(c.discipline) }} />
            {NAME[c.discipline] ?? c.discipline}
          </span>
        ))}
      </div>
    </div>
  );
}

// "as of {Mon D}" for a BODY row's newest session date — so a rolling 7d/week read isn't mistaken for
// today's data (BODY-4.8 freshness-legibility). Null-safe: no date → no stamp.
/**
 * A BODY row, as the coach payload sends it (`response_model.visible_signals`).
 *
 * ⛔ `as_of_date` IS REAL AND WAS MISSING FROM THE CLIENT TYPE UNTIL 2026-09-01. The server has
 * sent it since coach payload v85 ("BODY endurance signals carry as_of_date = newest session behind
 * the rolling read, rendered 'as of {date}'"), and `fmtBodyAsOf(s.as_of_date)` has been rendering it
 * the whole time — against a type that did not declare the field, so tsc reported it as an error on
 * every run and the screen worked anyway. Declared here rather than suppressed with `any`.
 */
export type VisibleSignal = {
  label: string;
  category?: string;
  trend: string;
  trend_icon?: string;
  trend_tone: string;
  detail: string;
  samples: number;
  provenance?: string | null;
  soreness_flag?: string | null;
  /** coach payload v85 — newest session behind the rolling read. */
  as_of_date?: string | null;
};

export function fmtBodyAsOf(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return `as of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function isRunPrimary(pe: { sport?: string | null } | null | undefined): boolean {
  if (!pe) return false;
  const s = String(pe.sport || '').toLowerCase();
  return s === 'run' || s === 'running' || !pe.sport;
}

export function goalMetaFromGoalLite(
  g: { name: string; sport?: string | null; distance?: string | null; target_time?: number | null } | null | undefined,
  upcoming: Array<{ name: string; weeks_out: number }> | undefined,
): { name: string; weeks_out: number; distance: string; target_time_seconds: number | null } | null {
  if (!g || !isRunPrimary(g)) return null;
  const weeksOutMeta = upcoming?.find(r => r.name === g.name)?.weeks_out ?? 0;
  const tt = (g as { target_time?: number | null }).target_time;
  return {
    name: g.name,
    weeks_out: weeksOutMeta,
    distance: g.distance || 'marathon',
    target_time_seconds:
      tt != null && Number.isFinite(Number(tt)) && Number(tt) > 0 ? Math.round(Number(tt)) : null,
  };
}

// ── sub-components ────────────────────────────────────────────────────────────

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      {/* readout-label (index.css): the Details tab's instrument label, tinted by the plate's
          accent — neutral white on these multi-sport plates. */}
      <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase w-[72px] shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 text-[13px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none">
        {children}
      </div>
    </div>
  );
}

export function Chip({ label, value, valueClass }: { label?: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {label != null && <span className="text-white/60 text-[13px]">{label}</span>}
      {/* Values glow in the plate accent unless the caller pinned a colour (e.g. "week complete"). */}
      <span className={valueClass ?? 'readout-num'}>{value}</span>
    </span>
  );
}

export function Dot() {
  return <span className="text-white/50 select-none">·</span>;
}

export function assessmentColor(a: RaceReadinessV1['assessment']): string {
  if (a === 'ahead') return 'text-emerald-400/90';
  if (a === 'on_track') return 'text-emerald-400/85';
  if (a === 'behind') return 'text-amber-400/90';
  return 'text-red-400/90';
}

export function assessmentLabel(a: RaceReadinessV1['assessment']): string {
  if (a === 'ahead') return 'ahead';
  if (a === 'on_track') return 'on track';
  if (a === 'behind') return 'stretch';
  return 'adjust target';
}

export function signalToneColor(tone: string): string {
  if (tone === 'positive') return 'text-emerald-400/85';
  if (tone === 'warning') return 'text-amber-400/85';
  return 'text-white/65';
}

export function hasRaceProjectionDetail(rr: RaceReadinessV1 | null | undefined): boolean {
  const secs = rr?.projection_display?.sections;
  if (secs && secs.length > 0) return true;
  return Boolean(rr?.projection_facts && rr.projection_facts.length > 0);
}

