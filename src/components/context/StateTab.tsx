import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import type {
  CoachWeekContextV1,
  RaceReadinessV1,
  RaceFinishProjectionV1,
  FitnessVerdictDivergence,
} from '@/hooks/useCoachWeekContext';
import { useExerciseLog } from '@/hooks/useExerciseLog';
// [D-374 → Step 2] The SAME axis the server gates coaching language on, so the row that renders and
// the verdict that fills it can never disagree about what a main lift is. `coached` is true on
// exactly one type row and that row is built from `MAIN_531_LIFTS`, so this is the same answer
// `isMain531Lift` gave — asked as a capability, from the table that also says what to render
// instead. See SPEC-strength-language, Step 2.
import { capabilitiesForExercise } from '@/lib/exercise-role';
import { trustedMaxReps } from '@/lib/estimate-1rm';
import { getDisciplineColor, hexToRgb } from '@/lib/context-utils';
import LoadBar from '@/components/LoadBar';
import { supabase, getStoredUserId, invokeFunctionFormData, invokeFunction } from '@/lib/supabase';
import { resolveEventTargetTimeSeconds } from '@/lib/goal-target-time';
import CourseStrategyModal from '@/components/CourseStrategyModal';
import { pickRaceFinishProjectionV1FromCoachData, pickRaceReadinessFromCoachData } from '@/lib/coach-payload';
import type { BlockVerdictResult } from '@/lib/analysis/goal-predictor';
import { planWizardRaceDistanceDisplay } from '@/lib/plan-wizard-distance-label';
import { resolveRaceHeader } from '@/lib/race-header';
import { actualFinishSecondsPreferElapsed, type WorkoutTimeRow } from '@/lib/race-finish-seconds';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import type { ArcReadiness } from '@/lib/arc-types';
import { shouldShowNudge } from '@/lib/nudge-policy';
import StatePerformanceSection from '@/components/context/StatePerformanceSection';
import StateHubTabs, { type StateLens } from '@/components/context/StateHubTabs';
import StateAdjustLens from '@/components/context/StateAdjustLens';
import { buildLoadHeadline, statusVolumeLabel } from '@/lib/load-headline';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { useSwimBaselineNudge } from '@/hooks/useSwimBaselineNudge';
import { useAppContext } from '@/contexts/AppContext';

const NUDGE_DISMISS_KEY = 'efforts.nudge.dismissed.';

function isNudgeSnoozed(kind: string): boolean {
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

function snoozeNudge(kind: string): void {
  try {
    window.localStorage.setItem(`${NUDGE_DISMISS_KEY}${kind}`, new Date().toISOString().slice(0, 10));
  } catch { void 0; }
}

type CoachDataProp = {
  data: CoachWeekContextV1 | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  revalidating?: boolean;
};

type PrimaryRaceReadinessRow = NonNullable<CoachWeekContextV1['primary_race_readiness']>;

// ── helpers ───────────────────────────────────────────────────────────────────

function trendColor(dir: string, tone?: string): string {
  if (tone === 'positive') return 'text-emerald-400/90';
  if (tone === 'danger') return 'text-red-400/90';
  if (tone === 'warning') return 'text-amber-400/90';
  if (dir === 'improving') return 'text-emerald-400/85';
  if (dir === 'declining') return 'text-amber-400/85';
  return 'text-white/55';
}


function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

/** Days from `ymd` to today (UTC-naive). Negative = future, positive = past. Null when invalid. */
function daysSinceYmd(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const target = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** Race references stay in State for the race week, then disappear once 7 days have passed. */
function isRaceWeekClosed(ymd: string | null | undefined): boolean {
  const d = daysSinceYmd(ymd);
  return d != null && d > 7;
}

/** Goal target finish clock from coach `goal_context.primary_event.target_time` (seconds). */
function fmtGoalClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const mi = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mi}:${String(s).padStart(2, '0')}`;
}

/** +MM:SS or +H:MM:SS vs a reference time (actual − goal; negative delta = faster than goal). */
function fmtSignedDeltaVsGoal(actualSec: number, goalSec: number): string {
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

function fmtSignedDeltaVsModel(actualSec: number, modelSec: number): string {
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
function fmtSignedDeltaVsProjection(actualSec: number, projSec: number): string {
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
function WeekAccentLine({ sentence, detail }: { sentence: string; detail: string | null }) {
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
function WeekMixBar({ counts, hasPlan, partialWeek }: { counts: Array<{ discipline: string; planned: number; done: number }>; hasPlan: boolean; partialWeek: boolean }) {
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
function fmtBodyAsOf(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return `as of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function isRunPrimary(pe: { sport?: string | null } | null | undefined): boolean {
  if (!pe) return false;
  const s = String(pe.sport || '').toLowerCase();
  return s === 'run' || s === 'running' || !pe.sport;
}

function goalMetaFromGoalLite(
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
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

function Chip({ label, value, valueClass }: { label?: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {label != null && <span className="text-white/60 text-[13px]">{label}</span>}
      {/* Values glow in the plate accent unless the caller pinned a colour (e.g. "week complete"). */}
      <span className={valueClass ?? 'readout-num'}>{value}</span>
    </span>
  );
}

function Dot() {
  return <span className="text-white/50 select-none">·</span>;
}

function assessmentColor(a: RaceReadinessV1['assessment']): string {
  if (a === 'ahead') return 'text-emerald-400/90';
  if (a === 'on_track') return 'text-emerald-400/85';
  if (a === 'behind') return 'text-amber-400/90';
  return 'text-red-400/90';
}

function assessmentLabel(a: RaceReadinessV1['assessment']): string {
  if (a === 'ahead') return 'ahead';
  if (a === 'on_track') return 'on track';
  if (a === 'behind') return 'stretch';
  return 'adjust target';
}

function signalToneColor(tone: string): string {
  if (tone === 'positive') return 'text-emerald-400/85';
  if (tone === 'warning') return 'text-amber-400/85';
  return 'text-white/65';
}

function hasRaceProjectionDetail(rr: RaceReadinessV1 | null | undefined): boolean {
  const secs = rr?.projection_display?.sections;
  if (secs && secs.length > 0) return true;
  return Boolean(rr?.projection_facts && rr.projection_facts.length > 0);
}

function RaceSection({
  projection,
  rr,
  goalMeta,
  planWizardDistance,
  planWizardTargetSeconds,
  primaryRaceReadiness,
  onOpenKeyRun,
  resolvedGoalId,
  courseRow,
  courseBusy,
  onAddCourse,
  onViewStrategy,
  /** When set, RACE shows official chip time and hides the training “Projected” model. */
  officialResult,
  /**
   * After race day: logged run on the race (elapsed not moving), with model projection for comparison.
   * Replaces the big “Projected” block until the user records an official result and ends the plan.
   */
  postRaceUnofficial,
  blockVerdict,
  divergence,
}: {
  projection: RaceFinishProjectionV1 | null;
  rr: RaceReadinessV1 | null;
  goalMeta: { name: string; weeks_out: number; distance: string; target_time_seconds: number | null } | null;
  /** From coach `plan.active_plans[].distance` (same as Plan Wizard / plan config). */
  planWizardDistance: string | null;
  /** `plans.config.target_time` from coach (Plan Wizard / generate-run-plan). Shown when coach RFP row is absent. */
  planWizardTargetSeconds: number | null;
  primaryRaceReadiness?: PrimaryRaceReadinessRow | null;
  onOpenKeyRun?: (workoutId: string) => void;
  resolvedGoalId: string | null;
  courseRow: { id: string; name: string } | null;
  courseBusy: boolean;
  onAddCourse: () => void;
  onViewStrategy: () => void;
  officialResult: {
    actual_seconds: number;
    goal_target_seconds: number | null;
    modelProjected?: { seconds: number; display: string } | null;
  } | null;
  postRaceUnofficial: { loggedSeconds: number; workoutId: string; daysAfterRace: number } | null;
  /** D-212 Piece 4 — block-adaptation third axis (the N-way room), rendered compact + drivers-gated. */
  blockVerdict: BlockVerdictResult | null;
  /** D-212 Cut 2 — spine↔projection divergence for the displayed goal; null/empty = aligned, render nothing. */
  divergence: FitnessVerdictDivergence | null;
}) {
  const distLabel = planWizardRaceDistanceDisplay(
    planWizardDistance ?? rr?.goal.distance ?? goalMeta?.distance ?? null,
  );
  // H4 (Q-107): the weeks-out + real-race gate are resolved below (they need hasAnyFinishTime) via
  // resolveRaceHeader — never fabricate a "0w out" countdown from the `?? 0` default.

  const statedSec = goalMeta?.target_time_seconds ?? null;
  const wizardSec =
    planWizardTargetSeconds != null && Number.isFinite(planWizardTargetSeconds) && planWizardTargetSeconds > 0
      ? Math.round(planWizardTargetSeconds)
      : null;
  /**
   * Stated goal: plan config / wizard first (intent), then goal meta, then coach plan_goal mirror.
   * No client-side pace math.
   */
  const statedGoalDisplay =
    wizardSec != null
      ? fmtGoalClock(wizardSec)
      : statedSec != null
        ? fmtGoalClock(statedSec)
        : projection?.plan_goal_display ?? null;

  const modelProjected = rr
    && Number.isFinite(rr.predicted_finish_time_seconds) &&
    rr.predicted_finish_time_seconds > 0
    ? { seconds: rr.predicted_finish_time_seconds, display: rr.predicted_finish_display }
    : null;

  if (officialResult) {
    return (
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0">RACE</span>
          <span className="text-[13px] text-white/55 text-right leading-snug">{distLabel} · result on file</span>
        </div>
        {statedGoalDisplay != null && (
          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] text-white/65 leading-snug">Your goal</p>
            <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
              {statedGoalDisplay}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] text-white/65 leading-snug">Completed</p>
          <span className="text-[22px] font-semibold tabular-nums text-emerald-300/90 tracking-tight">
            {fmtGoalClock(officialResult.actual_seconds)}
          </span>
          <p className="text-[12px] text-white/60 leading-snug max-w-[min(100%,320px)]">
            Official finish: elapsed (chip) time, not moving time. Training “projected” is replaced after you save this result.
          </p>
        </div>
        {officialResult.goal_target_seconds != null && (
          <p className="text-[13px] text-white/50">
            {fmtSignedDeltaVsGoal(officialResult.actual_seconds, officialResult.goal_target_seconds)}
          </p>
        )}
        {officialResult.modelProjected && (
          <p className="text-[13px] text-white/50 leading-snug">
            Model had projected {officialResult.modelProjected.display} · {fmtSignedDeltaVsModel(officialResult.actual_seconds, officialResult.modelProjected.seconds)}
          </p>
        )}
      </div>
    );
  }

  if (postRaceUnofficial) {
    const wk = postRaceUnofficial.daysAfterRace;
    const postLabel = wk === 1 ? '1 day after race' : wk < 7 ? `${wk} days after race` : 'after your race';
    return (
      <div className="px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0">RACE</span>
          <span className="text-[13px] text-white/55 text-right leading-snug">{distLabel} · {postLabel}</span>
        </div>
        {statedGoalDisplay != null && (
          <div className="flex flex-col gap-0.5">
            <p className="text-[12px] text-white/65 leading-snug">Your goal</p>
            <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
              {statedGoalDisplay}
            </span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <p className="text-[12px] text-white/65 leading-snug">Your finish (from log)</p>
          <span className="text-[22px] font-semibold tabular-nums text-emerald-300/90 tracking-tight">
            {fmtGoalClock(postRaceUnofficial.loggedSeconds)}
          </span>
          <p className="text-[12px] text-white/60 leading-snug max-w-[min(100%,320px)]">
            Elapsed (chip) time if your device reported it; otherwise we fall back to other durations. The large “Projected” block is hidden after race day so this stays primary.
          </p>
        </div>
        {modelProjected && (
          <div className="space-y-1">
            <p className="text-[12px] text-white/65 leading-snug">Model had projected (pre-race)</p>
            <p className="text-[20px] font-semibold tabular-nums text-white/75">
              {modelProjected.display}
            </p>
            <p className="text-[13px] text-white/50">
              {fmtSignedDeltaVsModel(postRaceUnofficial.loggedSeconds, modelProjected.seconds)}
            </p>
          </div>
        )}
        <p className="text-[12px] text-white/60 leading-snug">
          Race result auto-saves to My Record once your run is logged. The plan then moves to past on its own.
        </p>
      </div>
    );
  }
  /** Server fitness clock — prefer full race_readiness so headline matches delta + sections (same model path). */
  const projectedFromTraining =
    rr?.predicted_finish_display ??
    projection?.fitness_projection_display ??
    (projection &&
    projection.source_kind &&
    projection.source_kind !== 'plan_target' &&
    projection.anchor_display
      ? projection.anchor_display
      : null);
  const hasProjection = projectedFromTraining != null;
  const showProjectionPlaceholder = statedGoalDisplay != null && !hasProjection;
  const hasAnyFinishTime = statedGoalDisplay != null || hasProjection;
  // H4 (Q-107): gate the RACE header on a REAL race — no fabricated "0w out" from the `?? 0` default.
  const { hasRealRace, weeksOut: raceWeeksOut } = resolveRaceHeader({
    readinessWeeksOut: rr?.goal?.weeks_out ?? null,
    goalMetaWeeksOut: goalMeta?.weeks_out ?? null,
    hasAnyFinishTime,
  });

  return (
    <div className="px-3 py-3 space-y-2.5">
      {/* Header: goal + weeks out */}
      <div className="flex items-center justify-between gap-3">
        <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase shrink-0">RACE</span>
        {hasRealRace && (
          <span className="text-[13px] text-white/55 text-right leading-snug">{distLabel}{raceWeeksOut != null ? ` — ${raceWeeksOut}w out` : ''}</span>
        )}
      </div>

      {/* Goal (intent) vs projected finish (server fitness); terrain refines projected server-side when applicable. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          {statedGoalDisplay != null && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[12px] text-white/65 leading-snug">Your goal</p>
              <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
                {statedGoalDisplay}
              </span>
            </div>
          )}
          {hasProjection && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[12px] text-white/65 leading-snug">Projected</p>
              <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
                {projectedFromTraining}
              </span>
              {rr && (
                <p className="text-[12px] text-white/32 leading-snug max-w-[280px]">
                  Matches the gap and details below — one model, from your threshold, fade over distance, and data confidence.
                </p>
              )}
            </div>
          )}
          {showProjectionPlaceholder && (
            <p className="text-[13px] text-white/55 leading-snug pr-1">
              Can’t project a finish time yet (race date on the goal/plan, or baselines).
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
          {rr?.delta_display && (
            <span className={`text-[14px] font-medium tabular-nums ${assessmentColor(rr.assessment)}`}>
              {rr.delta_display}
            </span>
          )}
          {rr && (
            <span className={`text-[12px] font-semibold uppercase tracking-wider ${assessmentColor(rr.assessment)}`}>
              {assessmentLabel(rr.assessment)}
            </span>
          )}
        </div>
      </div>

      {/* Factual projection: framing + grouped sections (server); legacy flat list still supported */}
      {rr?.projection_display?.sections && rr.projection_display.sections.length > 0 && (
        <div className="space-y-3 pt-0.5">
          <p className="text-[12px] text-white/60 uppercase tracking-wide">From your data</p>
          {rr.projection_display.framing ? (
            <p className="text-[13px] text-white/60 leading-relaxed">{rr.projection_display.framing}</p>
          ) : null}
          {rr.projection_display.sections.map((sec) => (
            <div key={sec.label} className="space-y-1.5">
              <p className="text-[12px] font-semibold tracking-[0.1em] text-white/65 uppercase">{sec.label}</p>
              <ul className="list-disc pl-4 space-y-1 text-[13px] text-white/65 leading-relaxed">
                {sec.lines.map((line, i) => (
                  <li key={`${sec.label}-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {rr?.projection_facts && rr.projection_facts.length > 0 && !(rr.projection_display?.sections?.length) && (
        <div className="space-y-1.5 pt-0.5">
          <p className="text-[12px] text-white/60 uppercase tracking-wide">From your data</p>
          <ul className="list-disc pl-4 space-y-1.5 text-[13px] text-white/60 leading-relaxed">
            {rr.projection_facts.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {projection?.mismatch_blurb && !hasRaceProjectionDetail(rr) && (
        <p className="text-[13px] text-white/50 leading-relaxed">{projection.mismatch_blurb}</p>
      )}
      {!hasAnyFinishTime && (
        <p className="text-[13px] text-white/60 leading-snug">
          Add a race target in your plan to see your goal and projection.
        </p>
      )}

      {/* Target comparison — full race_readiness only */}
      {rr?.target_finish_display && (
        <div className="flex items-baseline gap-2 text-[13px] text-white/55">
          <span>Target {rr.target_finish_display}</span>
          <Dot />
          <span>Race pace {rr.predicted_race_pace_display}</span>
        </div>
      )}

      {/* VDOT trend */}
      {rr && (
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="text-white/55">VDOT {rr.current_vdot.toFixed(1)}</span>
          {rr.plan_vdot != null && rr.vdot_delta != null && rr.vdot_direction !== 'stable' && (
            <>
              <Dot />
              <span className={rr.vdot_direction === 'improved' ? 'text-emerald-400/85' : 'text-amber-400/85'}>
                {rr.vdot_delta > 0 ? '+' : ''}{rr.vdot_delta.toFixed(1)} since plan start
              </span>
            </>
          )}
        </div>
      )}

      {/* Legacy narrative — hidden when projection display supplies factual copy */}
      {rr && !hasRaceProjectionDetail(rr) && (
        <p className="text-[13px] text-white/65 leading-relaxed">{rr.assessment_message}</p>
      )}

      {resolvedGoalId && (
        <div className="pt-0.5">
          {courseBusy ? (
            <p className="text-[13px] text-white/60">Working on course…</p>
          ) : courseRow ? (
            <button
              type="button"
              onClick={onViewStrategy}
              className="w-full text-left text-[13px] text-sky-400/85 hover:text-sky-300/90 py-1"
            >
              View terrain strategy → <span className="text-white/60">{courseRow.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddCourse}
              className="w-full text-left text-[13px] text-sky-400/85 hover:text-sky-300/90 py-1"
            >
              Add course for terrain strategy based on your data →
            </button>
          )}
        </div>
      )}

      {/* KEY RUN — primary long-run race readiness (single signal; full block on Performance) */}
      {primaryRaceReadiness && onOpenKeyRun && (
        <button
          type="button"
          onClick={() => onOpenKeyRun(primaryRaceReadiness.workout_id)}
          className="w-full text-left rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-3 space-y-2.5 mt-1 active:opacity-90"
        >
          <span className="text-[12px] font-medium text-white/65 uppercase tracking-wide">Key run</span>
          <p className="text-[13px] text-white/50 tabular-nums">
            {fmtDate(primaryRaceReadiness.workout_date)} · {primaryRaceReadiness.distance_miles}mi
          </p>
          <p className="text-[14px] font-semibold text-white/90 leading-snug">{primaryRaceReadiness.headline}</p>
          {!!String(primaryRaceReadiness.tactical_instruction || '').trim() && (
            <div className="rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-2">
              <span className="text-[12px] font-medium text-white/65 uppercase tracking-wide">Race day</span>
              <p className="text-[13px] text-white/85 mt-0.5 leading-snug">{primaryRaceReadiness.tactical_instruction}</p>
            </div>
          )}
          {!!String(primaryRaceReadiness.projection || '').trim() && (
            <p className="text-[13px] text-white/65 leading-relaxed">{primaryRaceReadiness.projection}</p>
          )}
          <span className="text-[13px] font-normal text-white/60">View full analysis →</span>
        </button>
      )}

      {/* Training signals */}
      {rr && rr.training_signals.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          {rr.training_signals.map((s, i) => (
            <span key={i} className="text-[13px]">
              <span className="text-white/50">{s.label}</span>{' '}
              <span className={signalToneColor(s.tone)}>{s.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Pace zones */}
      {rr && (
        <div className="flex items-center gap-3 pt-0.5 text-[12px] text-white/65">
          <span>Easy {rr.pace_zones.easy}</span>
          <span>Threshold {rr.pace_zones.threshold}</span>
          <span>Race {rr.pace_zones.race}</span>
        </div>
      )}

      {/* Modifiers */}
      {rr && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-white/55">
          {rr.data_source === 'plan_targets' && (
            <span className="italic">Based on plan targets</span>
          )}
          {rr.durability_factor < 0.97 && (
            <span>Durability adj {((1 - rr.durability_factor) * 100).toFixed(1)}%</span>
          )}
          {rr.durability_factor >= 1.0 && (
            <span className="text-emerald-400/40">Durability +{((rr.durability_factor - 1) * 100).toFixed(1)}%</span>
          )}
          {rr.confidence_adjustment_pct > 0 && (
            <span>Confidence adj +{rr.confidence_adjustment_pct.toFixed(1)}%</span>
          )}
        </div>
      )}

      {/* Fitness verdicts (D-212 N-way room) — the block-adaptation third axis, beside the projection.
          Drivers-gated honesty: a seeded block_verdict (empty drivers, e.g. goal_probability 50) is the
          DORMANT "needs data" state, NOT a real probability — show a muted line, never a fake %. block_verdict
          null → hide. The colored-% branch is dark until block-adaptation data exists (Q-080). */}
      {blockVerdict && (
        blockVerdict.drivers.length === 0 ? (
          <p className="text-[13px] text-white/60 pt-0.5">Goal trajectory · needs more comparable sessions</p>
        ) : (
          <div className="flex items-baseline gap-2 pt-0.5 text-[13px]">
            <span className="text-white/50">Goal trajectory</span>
            <span className={
              blockVerdict.goal_probability_pct >= 70 ? 'text-emerald-400/85'
              : blockVerdict.goal_probability_pct >= 40 ? 'text-amber-400/85'
              : 'text-rose-400/85'
            }>{blockVerdict.goal_probability_pct}% on track</span>
          </div>
        )
      )}

      {/* D-212 Cut 2 — spine↔projection divergence: shown ONLY when verdicts genuinely disagree
          ("on-track finish, but swim sliding"). No divergence → render nothing (never "all agree"). */}
      {divergence && divergence.observations.length > 0 && (
        <div className="pt-0.5 space-y-0.5">
          {divergence.observations.map((o, i) => (
            <p key={i} className="text-[13px] text-amber-400/70 leading-snug">{o.note}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function StateTab({
  coachData,
  onClose,
  onSelectWorkout,
}: {
  coachData: CoachDataProp;
  onClose?: () => void;
  onSelectWorkout?: (workout: any) => void;
}) {
  const navigate = useNavigate();
  const { data, loading, error, refresh, revalidating } = coachData;
  const coachBusy = loading || Boolean(revalidating);
  const { liftTrends } = useExerciseLog(8);
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null); // D-232 BODY-row provenance tap
  const [stateLens, setStateLens] = useState<StateLens>('status'); // State-as-hub: Status / Adjust / Schedule (D-316)
  // Strength per-lift detail is COLLAPSED by default (Michael 2026-07-16) — the e1RM dot is the read;
  // the per-lift "from your logged sets" list is drill-down, folded until tapped.
  const [strengthDetailOpen, setStrengthDetailOpen] = useState<boolean>(false);
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null);
  const [stateCourseRow, setStateCourseRow] = useState<{ id: string; name: string } | null>(null);
  const [courseBusy, setCourseBusy] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyCourseId, setStrategyCourseId] = useState<string | null>(null);
  const stateCourseFileRef = useRef<HTMLInputElement>(null);
  const [fetchedOfficialResult, setFetchedOfficialResult] = useState<{
    actual_seconds: number;
    goal_target_seconds: number | null;
  } | null>(null);
  const [postRaceUnofficial, setPostRaceUnofficial] = useState<{
    loggedSeconds: number;
    workoutId: string;
    daysAfterRace: number;
  } | null>(null);
  const [longitudinalSignals, setLongitudinalSignals] = useState<unknown>(null);
  // Daily check-in readiness (Q-049). Named distinctly from the local
  // `readiness`/`readiness_state` (cycling form) used further down in render.
  const [checkinReadiness, setCheckinReadiness] = useState<ArcReadiness | null>(null);
  const [nudgeDismissNonce, setNudgeDismissNonce] = useState(0);
  const swimNudge = useSwimBaselineNudge(); // D-200: honored-swim-gated swim re-test nudge (State only)
  const { useImperial } = useAppContext(); // imperial → yards, metric → meters — for the SWIM sessions row distance

  useEffect(() => {
    fetchArcContext().then((arc) => {
      setLongitudinalSignals(arc?.longitudinal_signals ?? null);
      setCheckinReadiness((arc?.readiness as ArcReadiness | null) ?? null);
    });
  }, []);

  const nudgeDecision = shouldShowNudge(longitudinalSignals as Parameters<typeof shouldShowNudge>[0]);
  // D-302 slice 2: the grinding read (RIR below prescription) is rendered on the STRENGTH READ itself
  // (StatePerformanceSection), not as a nudge — so it lives in one place next to the e1RM verdict. Pulled
  // from the nudge allow-list (nudge-policy.ts) so it can't also fire a banner. One fact, one home.
  const strengthFatigue = Array.isArray(longitudinalSignals)
    && (longitudinalSignals as Array<{ id?: string }>).some((s) => s?.id === 'strength_rir_below_prescription');
  // nudgeDismissNonce is incremented on dismiss to force re-evaluation of isNudgeSnoozed.
  const showNudge =
    nudgeDismissNonce >= 0 &&
    nudgeDecision.show &&
    !!nudgeDecision.nudge_kind &&
    !!nudgeDecision.headline &&
    !isNudgeSnoozed(nudgeDecision.nudge_kind);

  const raceReadiness = pickRaceReadinessFromCoachData(data as CoachWeekContextV1 | null);
  const raceFinishProjection = pickRaceFinishProjectionV1FromCoachData(data as CoachWeekContextV1 | null);

  useEffect(() => {
    const gc = (data as CoachWeekContextV1 | null)?.goal_context;
    const planId = data?.weekly_state_v1?.plan?.plan_id ?? null;
    const goalFromPlan =
      planId && gc?.goals ? gc.goals.find(g => g.plan_id === planId && isRunPrimary(g)) : undefined;

    const goalIdFromCoach =
      raceFinishProjection?.goal_id?.trim() ||
      raceReadiness?.goal?.id?.trim() ||
      gc?.primary_event?.id?.trim() ||
      goalFromPlan?.id?.trim() ||
      null;

    if (!goalIdFromCoach) {
      setResolvedGoalId(null);
      setStateCourseRow(null);
      return;
    }
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;

    (async () => {
      let goalId: string | null = goalIdFromCoach;

      if (!goalId && raceReadiness) {
        const { data: goalsRows, error: goalsErr } = await supabase
          .from('goals')
          .select('id, name, status, sport')
          .eq('user_id', uid)
          .eq('status', 'active');
        if (goalsErr) {
          console.warn('[StateTab] goals lookup failed:', goalsErr.message);
          if (!cancelled) {
            setResolvedGoalId(null);
            setStateCourseRow(null);
          }
          return;
        }
        const g = (goalsRows || []).find(
          (x: { name?: string; sport?: string | null }) =>
            String(x.name || '') === raceReadiness.goal.name && String(x.sport || '').toLowerCase() === 'run',
        ) as { id: string } | undefined;
        goalId = g?.id ?? null;
      }

      if (!goalId || cancelled) {
        if (!cancelled) {
          setResolvedGoalId(null);
          setStateCourseRow(null);
        }
        return;
      }
      if (!cancelled) setResolvedGoalId(goalId);
      const { data: rc } = await supabase.from('race_courses').select('id, name').eq('goal_id', goalId).maybeSingle();
      if (cancelled) return;
      if (rc?.id) setStateCourseRow({ id: rc.id as string, name: String(rc.name || 'Course') });
      else setStateCourseRow(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    raceFinishProjection?.goal_id,
    raceReadiness?.goal?.id,
    raceReadiness?.goal?.name,
    raceReadiness?.goal?.weeks_out,
    data?.weekly_state_v1?.plan?.plan_id,
    (data as CoachWeekContextV1 | null)?.goal_context?.primary_event?.id,
    (data as CoachWeekContextV1 | null)?.goal_context?.goals
      ?.map(g => `${g.id}:${g.plan_id ?? '-'}`)
      .join('|'),
    raceFinishProjection ? 1 : 0,
    raceReadiness ? 1 : 0,
  ]);

  useEffect(() => {
    if (!resolvedGoalId) {
      setFetchedOfficialResult(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: row, error: rowErr } = await supabase
        .from('goals')
        .select('status, current_value, target_time, goal_type')
        .eq('id', resolvedGoalId)
        .maybeSingle();
      if (cancelled) return;
      if (rowErr || !row) {
        setFetchedOfficialResult(null);
        return;
      }
      if (
        String((row as { goal_type?: string }).goal_type) === 'event' &&
        String((row as { status?: string }).status) === 'completed' &&
        typeof (row as { current_value?: number }).current_value === 'number' &&
        (row as { current_value: number }).current_value > 0
      ) {
        const cv = (row as { current_value: number }).current_value;
        const tt = (row as { target_time?: number | null }).target_time;
        setFetchedOfficialResult({
          actual_seconds: Math.round(cv),
          goal_target_seconds:
            tt != null && Number.isFinite(Number(tt)) && Number(tt) > 0 ? Math.round(Number(tt)) : null,
        });
      } else {
        setFetchedOfficialResult(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedGoalId]);

  useEffect(() => {
    const d = data as CoachWeekContextV1 | null;
    if (!d?.weekly_state_v1) {
      setPostRaceUnofficial(null);
      return;
    }
    if (fetchedOfficialResult) {
      setPostRaceUnofficial(null);
      return;
    }
    const wsv0 = d.weekly_state_v1;
    const asY0 = d.as_of_date?.slice(0, 10) || '';
    const gc0 = d.goal_context;
    const planId0 = wsv0.plan?.plan_id ?? null;
    const gLink =
      planId0 && gc0?.goals
        ? gc0.goals.find(g => g.plan_id === planId0 && isRunPrimary(g))
        : undefined;
    const planA = (d as CoachWeekContextV1 & { plan?: { active_plans?: Array<{ plan_id?: string; race_date?: string | null }> } }).plan
      ?.active_plans;
    const entry0 = planId0 && planA ? planA.find(p => p.plan_id === planId0) : undefined;
    const raceY0 =
      gLink?.target_date?.slice(0, 10) ||
      (entry0?.race_date ? String(entry0.race_date).slice(0, 10) : null);
    if (!raceY0 || asY0 <= raceY0) {
      setPostRaceUnofficial(null);
      return;
    }
    const t0 = new Date(raceY0 + 'T12:00:00').getTime();
    const t1 = new Date(asY0 + 'T12:00:00').getTime();
    const dayDiff = Math.floor((t1 - t0) / 86400000);
    if (dayDiff < 1) {
      setPostRaceUnofficial(null);
      return;
    }
    const lcr = d.last_completed_race;
    if (lcr) {
      if (resolvedGoalId && lcr.goal_id === resolvedGoalId) {
        setPostRaceUnofficial(null);
        return;
      }
      if (gLink?.id && lcr.goal_id === gLink.id) {
        setPostRaceUnofficial(null);
        return;
      }
      if (gc0?.primary_event?.id && lcr.goal_id === gc0.primary_event.id) {
        setPostRaceUnofficial(null);
        return;
      }
    }
    const uid = getStoredUserId();
    if (!uid) {
      setPostRaceUnofficial(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data: wrows, error: wErr } = await supabase
        .from('workouts')
        .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed, name')
        .eq('user_id', uid)
        .eq('date', raceY0)
        .eq('workout_status', 'completed');
      if (cancelled) return;
      if (wErr) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      const rows = Array.isArray(wrows) ? wrows : [];
      if (rows.length === 0) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      const runish = (t: string) => {
        const x = (t || '').toLowerCase();
        return x === 'run' || x === 'running' || !x;
      };
      const runs = rows.filter((r) => runish(String((r as { type?: string }).type || '')));
      let pick: (typeof rows)[0] | null = null;
      if (runs.length === 1) pick = runs[0] ?? null;
      else if (runs.length > 1) {
        const dist = (r: (typeof rows)[0]) => {
          const m = Number(
            (r as { computed?: { overall?: { distance_m?: number } } })?.computed?.overall?.distance_m,
          );
          return Number.isFinite(m) && m > 0 ? m : 0;
        };
        pick = runs.reduce((a, b) => (dist(a) >= dist(b) ? a : b));
      }
      if (!pick) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      const sec = actualFinishSecondsPreferElapsed(pick as WorkoutTimeRow);
      if (sec == null || !Number.isFinite(sec) || sec <= 0) {
        if (!cancelled) setPostRaceUnofficial(null);
        return;
      }
      if (!cancelled) {
        setPostRaceUnofficial({
          loggedSeconds: sec,
          workoutId: String((pick as { id: string }).id),
          daysAfterRace: dayDiff,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, resolvedGoalId, fetchedOfficialResult]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-4 h-4 animate-spin text-white/65" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="py-8 text-center text-[13px] text-white/50">{error ?? 'No data'}</div>;
  }

  const wsv = data.weekly_state_v1;
  if (!wsv) return <div className="py-8 text-center text-[13px] text-white/50">Loading state…</div>;

  const week = wsv.week;
  const load = wsv.load;
  const rm = ((data as any)?.response_model ?? (wsv as any)?.response_model) as {
    visible_signals: Array<{ label: string; category?: string; trend: string; trend_icon?: string; trend_tone: string; detail: string; samples: number; provenance?: string | null; soreness_flag?: string | null }>;
    overall_training_read?: { summary: string; tone: 'positive' | 'warning' | 'neutral' | 'info' } | null;
    strength: { per_lift: Array<{ canonical_name: string; display_name: string; e1rm_trend: string; rir_current: number | null; sufficient: boolean; last_session_date?: string | null }> };
    endurance: unknown;
    assessment: { label: string; signals_concerning: number };
  } | undefined;
  const snap = (data as any)?.athlete_snapshot ?? null;
  const loadStatus = snap?.body_response?.load_status ?? null;
  const primaryRaceReadiness: PrimaryRaceReadinessRow | null = data?.primary_race_readiness ?? null;

  const gc = (data as CoachWeekContextV1).goal_context;
  const pe = gc?.primary_event;

  const goalMetaPrimary = pe ? goalMetaFromGoalLite(pe, gc?.upcoming_races) : null;
  const projGid = raceFinishProjection?.goal_id?.trim();
  const goalForProj = projGid && gc?.goals ? gc.goals.find(x => x.id === projGid) : undefined;
  const goalMetaFromProjection = goalForProj ? goalMetaFromGoalLite(goalForProj, gc?.upcoming_races) : null;
  const activePlanId = wsv.plan.plan_id;
  const goalLinkedToPlan =
    activePlanId && gc?.goals
      ? gc.goals.find(g => g.plan_id === activePlanId && isRunPrimary(g))
      : undefined;
  const goalMetaFromPlanLink = goalLinkedToPlan
    ? goalMetaFromGoalLite(goalLinkedToPlan, gc?.upcoming_races)
    : null;
  const goalMeta = goalMetaPrimary ?? goalMetaFromProjection ?? goalMetaFromPlanLink ?? null;

  const planRoot = (
    data as CoachWeekContextV1 & {
      plan?: {
        active_plans?: Array<{
          plan_id?: string | null;
          distance?: string | null;
          is_primary?: boolean;
          plan_target_finish_seconds?: number | null;
        }>;
      };
    }
  ).plan;
  const activePlans = planRoot?.active_plans;
  const planWizardDistance =
    (activePlanId && activePlans?.find(p => p.plan_id === activePlanId)?.distance) ??
    activePlans?.find(p => p.is_primary)?.distance ??
    activePlans?.[0]?.distance ??
    null;
  const planWizardTargetSeconds =
    (activePlanId && activePlans?.find(p => p.plan_id === activePlanId)?.plan_target_finish_seconds) ??
    activePlans?.find(p => p.is_primary)?.plan_target_finish_seconds ??
    activePlans?.[0]?.plan_target_finish_seconds ??
    null;

  const asYmd = data.as_of_date?.slice(0, 10) || '';
  const activePlanEntry = activePlanId ? activePlans?.find(p => p.plan_id === activePlanId) : undefined;
  const raceYmdForActivePlan =
    goalLinkedToPlan?.target_date?.slice(0, 10) ||
    (activePlanEntry?.race_date ? String(activePlanEntry.race_date).slice(0, 10) : null);

  const lastCompletedRace = data.last_completed_race ?? null;
  const officialFromCoach =
    lastCompletedRace &&
    ((resolvedGoalId && lastCompletedRace.goal_id === resolvedGoalId) ||
      (pe?.id && lastCompletedRace.goal_id === pe.id) ||
      (goalLinkedToPlan?.id && lastCompletedRace.goal_id === goalLinkedToPlan.id) ||
      (projGid && lastCompletedRace.goal_id === projGid))
      ? {
          actual_seconds: lastCompletedRace.actual_seconds,
          goal_target_seconds: lastCompletedRace.goal_target_seconds,
        }
      : null;
  const baseOfficial = fetchedOfficialResult ?? officialFromCoach;
  const modelFromRr =
    raceReadiness &&
    Number.isFinite(raceReadiness.predicted_finish_time_seconds) &&
    raceReadiness.predicted_finish_time_seconds > 0
      ? {
          seconds: raceReadiness.predicted_finish_time_seconds,
          display: raceReadiness.predicted_finish_display,
        }
      : null;
  const officialForRace = baseOfficial
    ? { ...baseOfficial, modelProjected: modelFromRr }
    : null;
  const lastRaceClosed = lastCompletedRace ? isRaceWeekClosed(lastCompletedRace.target_date) : false;
  const showTopLastRaceCard = Boolean(lastCompletedRace && !officialForRace && !lastRaceClosed);
  const showRecordRaceComplete =
    Boolean(
      wsv.plan.has_active_plan &&
        activePlanId &&
        raceYmdForActivePlan &&
        asYmd >= raceYmdForActivePlan &&
        goalLinkedToPlan &&
        isRunPrimary(goalLinkedToPlan) &&
        String(goalLinkedToPlan.goal_type || 'event') === 'event' &&
        !officialForRace,
    );
  /** Top amber bar would duplicate the in-RACE button after race day (post-race view scrolls that far). */
  const showAmberRecordBar = showRecordRaceComplete && !postRaceUnofficial;

  async function handleStateCourseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !resolvedGoalId) return;
    const uid = getStoredUserId();
    const { data: gRow } = await supabase.from('goals').select('name').eq('id', resolvedGoalId).maybeSingle();
    let planRows: { config?: Record<string, unknown> }[] | null = null;
    if (uid) {
      const { data } = await supabase
        .from('plans')
        .select('config')
        .eq('user_id', uid)
        .eq('goal_id', resolvedGoalId)
        .order('updated_at', { ascending: false })
        .limit(5);
      planRows = data;
    }
    let paceTargetSec =
      raceReadiness?.target_finish_time_seconds != null &&
      Number.isFinite(raceReadiness.target_finish_time_seconds) &&
      raceReadiness.target_finish_time_seconds > 0
        ? raceReadiness.target_finish_time_seconds
        : null;
    if (paceTargetSec == null) {
      for (const p of planRows || []) {
        const t = resolveEventTargetTimeSeconds({}, (p as { config?: Record<string, unknown> }).config ?? null);
        if (t != null) {
          paceTargetSec = t;
          break;
        }
      }
    }
    const coachPredSec =
      raceFinishProjection &&
      raceFinishProjection.goal_id === resolvedGoalId &&
      Number.isFinite(raceFinishProjection.anchor_seconds) &&
      raceFinishProjection.anchor_seconds > 0
        ? raceFinishProjection.anchor_seconds
        : raceReadiness &&
            (raceReadiness.goal.id === resolvedGoalId ||
              String(gRow?.name || '') === String(raceReadiness.goal.name)) &&
            Number.isFinite(raceReadiness.predicted_finish_time_seconds) &&
            raceReadiness.predicted_finish_time_seconds > 0
          ? raceReadiness.predicted_finish_time_seconds
          : null;
    if (paceTargetSec == null && coachPredSec == null) {
      window.alert(
        'No pacing target yet: set a race target on the goal or plan, or refresh State and try again.',
      );
      return;
    }
    setCourseBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', `${String(gRow?.name || raceReadiness?.goal?.name || 'Race')} course`);
      fd.append('goal_id', resolvedGoalId);
      const rd =
        gRow?.target_date != null
          ? String(gRow.target_date).slice(0, 10)
          : raceReadiness?.goal?.target_date != null
            ? String(raceReadiness.goal.target_date).slice(0, 10)
            : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) fd.append('race_date', rd);
      const { data: up, error: upErr } = await invokeFunctionFormData<{ course_id: string }>('course-upload', fd);
      if (upErr || !up?.course_id) {
        window.alert(upErr?.message || 'Upload failed');
        return;
      }
      const { error: stErr } = await invokeFunction('course-strategy', { course_id: up.course_id });
      if (stErr) {
        window.alert(stErr.message || 'Strategy failed');
        return;
      }
      setStateCourseRow({ id: up.course_id, name: `${String(gRow?.name || raceReadiness?.goal?.name || 'Race')} course` });
      setStrategyCourseId(up.course_id);
      setStrategyModalOpen(true);
    } finally {
      setCourseBusy(false);
    }
  }

  // ── WEEK header ──────────────────────────────────────────────────────────
  const weekLabel = week.index != null ? `WK ${week.index}` : 'WEEK';

  // ── BODY row — endurance signals only (strength signals go in STRENGTH row) ─
  const visibleSignals = (rm?.visible_signals ?? []).filter((s: any) => s.category === 'endurance');

  // ── STRENGTH row — server-computed per_lift from response_model ──────────
  // ⛔ THE CAP MUST NOT RUN BEFORE THE MAIN-LIFT FILTER — that is what hid the Overhead Press.
  //
  // `per_lift` arrives in `Object.entries(learned_fitness.strength_1rms)` order, and the coach
  // builds it for SEVEN lifts (the four, plus hip_thrust / trap_bar_deadlift / barbell_row). With
  // `.slice(0, 5)` applied first, positions 6-7 were cut BEFORE anything asked whether they were
  // main lifts — so an athlete whose press sorted sixth simply lost the row, with 6 logged sessions
  // and a typed baseline both present. Reproduced exactly: seven in, the cap keeps squat /
  // bench_press / deadlift / hip_thrust / trap_bar_deadlift, and the [D-374] filter then strips the
  // two accessories, leaving three rows and no press.
  //
  // ⚠️ IT WAS LATENT BEFORE [D-374] AND THAT IS WHY NOBODY SAW IT. The section used to render all
  // five sliced rows including accessories, so it looked full while the press was already missing.
  // Filtering after the cap didn't create the bug; it made it visible by dropping the row count.
  //
  // `perLift` KEEPS the old shape (sufficient + first 5) because `StateAdjustLens` reads it below
  // and this is not a change to that surface — only the card's own list is re-derived.
  const perLiftSufficient = (rm?.strength?.per_lift ?? []).filter((l: any) => l.sufficient);
  const perLift = perLiftSufficient.slice(0, 5);
  // ⛔ [D-374] "FROM YOUR LOGGED SETS" IS A MAIN-LIFT SECTION. Every row in it reads
  // `Working ~120 vs your 150 baseline` — a comparison against a TESTED 1RM. You test a max on the
  // four barbell lifts; you do not test one on a Hip Thrust. So an accessory can never fill that
  // column, and before [D-373] it fell through to the raw verdict and printed a red "back off
  // weight" instead. D-373 silenced the command; this removes the row that had nothing to say.
  // ⚠️ FILTERED HERE, NOT SERVER-SIDE, ON PURPOSE. `per_lift` is a shared contract — the coach reads
  // it for strength maxes (`coach/index.ts:3557`) and the block model iterates it (`block.ts:322`).
  // Narrowing it at the source would quietly change that reasoning. This is a DISPLAY choice about
  // which rows belong in one section, made with the same shared classifier the server gates on, so
  // the two cannot drift. `perLift` itself is left intact for the adjust lens below.
  // ⛔ Accessories are not being hidden as unimportant — they have no home YET. Per Michael's
  // direction on [Q-251], by-feel work should be read against the athlete's OWN history (reps at a
  // weight, volume over weeks), never against a tested max. That row is unbuilt. See [Q-253].
  // FILTER FIRST, THEN CAP — off the uncapped list, so a main lift can never be cut by an accessory
  // that happened to sort ahead of it. The cap is kept at the same 5 as a display bound; after the
  // filter it has nothing to cut in practice (5/3/1 has four slots, and only a variant like a
  // trap-bar deadlift adds a fifth main-class row).
  const perLiftMain = perLiftSufficient
    .filter((l: { canonical_name?: string | null }) =>
      capabilitiesForExercise(String(l?.canonical_name ?? '')).coached)
    .slice(0, 5);

  // ── "How your sessions went" — REBUILT (docs/STATE-WEEK-EXECUTION.md). The old per-discipline
  //    execution-row builders (run/ride/strength/swim `efficiency_label` chips) lived here and were
  //    DELETED: steady run/bike rows carried a FITNESS verdict that duplicated PERFORMANCE ("aerobic
  //    base needs work" said twice), and interval/execution % belongs to session detail, not this
  //    section. The section now renders neutral planned-vs-done COUNTS + one composed accent, off
  //    `wsv.week_execution_v1` (server-owned), further down in the JSX. ──

  // ── NEXT row ─────────────────────────────────────────────────────────────
  const sessionsRemaining = data.week?.key_sessions_remaining ?? [];
  const nextSessions = sessionsRemaining.slice(0, 3);

  // ── intent summary + readiness — server-computed ─────────────────────────
  const intentSummary = wsv.week.intent_summary ?? null;
  // 2026-08-11: the week-narrative blurb is retired from the UI (Michael — no value; it narrated the
  // planned-vs-actual bar directly beneath it and could contradict it). The server still computes
  // `coach.narrative` via composeCoachWeekInsight (_shared/insights/coach-week-insights.ts, D-306) — now
  // UNRENDERED / orphaned. Left for the app-wide audit to delete the composer + payload field (a bigger
  // call with its own ripples than a client render cut). This surface is client-only, no deploy.
  const raceWeekGuidance = wsv.coach?.grounded_race_week_guidance_v1;
  const trends = wsv.trends;
  const readinessLabel = trends.readiness_label;
  const readiness = trends.readiness_state;
  const readinessWhy = trends.readiness_why ?? null; // D-232: FATIGUED "Why:" — now NON-RPE factors only
  const readinessSuggestion = trends.readiness_suggestion ?? null; // D-232: loaded-legs one-line suggestion
  const readinessRpeDriver = trends.readiness_rpe_driver ?? null; // BODY-row driver (RPE clause only, Whoop pattern)
  const readinessColor =
    readiness === 'fresh' ? 'text-emerald-400/90' :
    readiness === 'adapting' ? 'text-sky-400/85' :
    readiness === 'overreached' ? 'text-red-400/90' :
    readiness === 'fatigued' ? 'text-amber-400/90' :
    'text-white/60';

  // #4 — deterministic glance headline (load + readiness + fitness, observation never a prescription).
  // The full LLM narrative goes behind an "open for more" expand (collapsed by default).
  // D-260/D-266: the LOAD verdict reads the RECONCILED load_status (the two-key engine, sole verdict
  // authority) — not raw ACWR. ACWR stays the gauge number only. If the server verdict is absent, the
  // headline omits the load slot (no ACWR-word fallback — ACWR never mints a verdict).
  const loadHeadline = buildLoadHeadline({
    loadLabel: statusVolumeLabel(loadStatus?.status),
    readinessState: readiness,
    readinessLabel, // D-232: refined chip label wins so the headline can't contradict the chip
    fitnessDirection: (trends as any).fitness_direction,
    isTaperOrPeak: week.intent === 'taper' || week.intent === 'peak',
    acwr: load.acwr, // D-268 Phase 5: "headroom" only when load is genuinely light (server-computed acwr)
  });


  // ── Cross-training signal (server-computed) ──────────────────────────────

  const hasUpcomingEvent = Boolean(pe || goalMeta || raceFinishProjection || raceReadiness);
  const isAimless = !wsv.plan.has_active_plan && !hasUpcomingEvent && !officialForRace && !postRaceUnofficial;
  // Arc-grounded empty-state copy authored by coach (response model). Falls back to a minimal
  // generic line only if the server payload is missing the field (e.g. older cache row).
  const serverEmptyState = wsv.empty_state ?? null;
  const aimlessHeadline = serverEmptyState?.headline ?? 'No active plan — training stays general fitness.';
  const aimlessSubtext =
    serverEmptyState?.subtitle ??
    'Mostly easy aerobic work, one harder day, and your usual strength. Without a goal to shape the week, back-to-back hard days add up faster than they help.';
  const aimlessCtaLabel = serverEmptyState?.cta_label ?? 'Set a goal';
  const aimlessCtaAction = serverEmptyState?.cta_action ?? 'create_goal';
  const aimlessCtaTarget = aimlessCtaAction === 'plan_season' ? '/goals' : '/goals';

  // Q-107 H3 nest: the per-lift rows render NESTED under the STRENGTH trend row inside
  // StatePerformanceSection (below), framed "from your logged sets" as provisional detail — so a
  // confident per-lift line can't read as a second, competing "STRENGTH" top-line when the spine
  // trend says needs-data. All state/handlers stay here; only the rendered node is passed down.
  const strengthPerLiftDetail: React.ReactNode = perLiftMain.length > 0 ? (
    // Layout 2026-08-11 (Michael): reclaim the horizontal space — the list used to indent 84px to align
    // under the parent label column, leaving each lift cramped in ~68% width. It now runs near-full-width
    // (a light border-l keeps the nesting cue) so the sets read clean, like Strong's exercise detail.
    <div className="mt-2 ml-1 pl-3 border-l border-white/[0.07] space-y-3.5">
      {/* Collapsed by default — the e1RM dot above is the read; this list is drill-down. */}
      <button
        type="button"
        onClick={() => setStrengthDetailOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] uppercase tracking-wider text-white/55 hover:text-white/55 transition-colors"
        aria-expanded={strengthDetailOpen}
      >
        <span className={`inline-block transition-transform duration-200 ${strengthDetailOpen ? 'rotate-90' : ''}`}>›</span>
        from your logged sets
        <span className="text-white/45 normal-case tracking-normal">· {perLiftMain.length} {perLiftMain.length === 1 ? 'lift' : 'lifts'}</span>
      </button>
      {strengthDetailOpen && perLiftMain.map((lt: any) => {
        // A SET HISTORY, LIKE STRONG/HEVY (2026-08-11, Michael: *"it should offer what the other apps
        // do"*). This section is titled "from your logged sets" — so it now shows exactly that: each main
        // lift's recent sessions (weight × reps · date · estimated 1RM), newest first. The old "Working
        // vs baseline" coaching line and the tap-to-adjust are GONE from here. Adjusting weight is a
        // Training-Max / baseline control (one number, weekly weights recalc from it — how 5/3/1 apps do
        // it, verified against Strong/Hevy/531 apps), and it lives on the Adjust tab (StateAdjustLens),
        // not as a per-row tweak buried in a read-only history. Data is `useExerciseLog`'s liftTrends —
        // already fetched above, no new query and no server change.
        const trend = liftTrends.find((t) => t.canonical === lt.canonical_name);
        const entries = trend?.entries ?? [];
        if (entries.length === 0) return null;
        const recent = [...entries].reverse().slice(0, 5); // newest first, most-recent handful
        // D-417: "best" is the strongest TRUSTED reading in the window — a high-rep set inflates its
        // estimate, so it can't be your best (that would rank by reps, not weight). Untrusted sets still
        // show in the list, they just can't win the tag. No trusted set → no "best" (bestIdx stays -1).
        const isTrusted = (e: { best_reps?: number | null }) =>
          Number(e.best_reps) > 0 && Number(e.best_reps) <= trustedMaxReps(lt.canonical_name);
        const bestIdx = recent.reduce(
          (bi, e, i) => (isTrusted(e) && (bi < 0 || (Number(e.estimated_1rm) || 0) > (Number(recent[bi].estimated_1rm) || 0))) ? i : bi,
          -1,
        );
        return (
          <div key={lt.canonical_name} className="space-y-1.5">
            <div className="text-[13px] text-white/80">{lt.display_name}</div>
            <div className="space-y-1">
              {recent.map((e, i) => {
                const dateLabel = e.date
                  ? new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                const est = Number(e.estimated_1rm) || 0;
                const isBest = i === bestIdx; // bestIdx is -1 when no trusted set exists (D-417)
                return (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                    <span className="text-white/75 tabular-nums">{e.best_weight} lb × {e.best_reps}</span>
                    {dateLabel && <span className="text-white/40">{dateLabel}</span>}
                    {est > 0 && isTrusted(e) && <span className="text-white/45 tabular-nums">e1RM {est} lb</span>}
                    {/* Sport colour, not green — green means bike (Michael 2026-08-15, with the PR tags). */}
                    {isBest && <span className="text-strength font-medium">best</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="pt-1 pb-4">
      {/* State-as-hub lens switcher (D-316): Status = the screen you know; Adjust/Schedule are new. */}
      <StateHubTabs value={stateLens} onChange={setStateLens} />

      {stateLens === 'adjust' && <StateAdjustLens perLift={perLift} />}
      {stateLens === 'schedule' && (
        <div className="px-2 py-10 text-center text-white/40 text-[13px] leading-snug">
          Schedule — rearrange your week: drag a session and everything re-flows around it. Coming next.
        </div>
      )}

      {stateLens === 'status' && (<>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4 px-0.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] font-semibold tracking-widest text-white/65 uppercase">{weekLabel}</span>
            {/* Chip Option A / research (Whoop): readiness is STRAIN-class — never headline/crown material.
                It moved to BODY as the row's driver. "WEEK" stays as the plain section header. */}
          </div>
          {isAimless ? (
            <>
              <span className="text-[15px] font-medium text-white/85 leading-snug">{aimlessHeadline}</span>
              <span className="text-[13px] text-white/50 leading-snug">{aimlessSubtext}</span>
              {aimlessCtaAction !== 'none' && (
                <button
                  type="button"
                  onClick={() => navigate(aimlessCtaTarget)}
                  className="mt-1 self-start rounded-lg border border-teal-400/30 bg-teal-500/10 px-3 py-1.5 text-[13px] font-medium text-teal-100/95 hover:bg-teal-500/15 active:opacity-90"
                >
                  {aimlessCtaLabel}
                </button>
              )}
            </>
          ) : (
            <>
              {intentSummary && (
                <span className="text-[15px] font-medium text-white/85 leading-snug">{intentSummary}</span>
              )}
              {loadHeadline && (
                <span className="text-[14px] font-medium text-white/80 leading-snug">{loadHeadline}</span>
              )}
              {(readinessWhy || readinessSuggestion) && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setNarrativeOpen((o) => !o)}
                    className="self-start flex items-center gap-1 text-[13px] text-white/65 hover:text-white/70 transition-colors mt-0.5 touch-manipulation"
                    aria-expanded={narrativeOpen}
                  >
                    {narrativeOpen ? 'Show less' : 'Show more'}
                    <ChevronDown className={`w-3 h-3 transition-transform ${narrativeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {narrativeOpen && (
                    <>
                      {/* D-232: the FATIGUED headline expands to its real factors, then the loaded-legs suggestion, then prose. */}
                      {readinessWhy && <span className="text-[13px] text-amber-300/70 leading-snug mt-1">{readinessWhy}</span>}
                      {readinessSuggestion && <span className="text-[13px] text-white/60 leading-snug mt-1">{readinessSuggestion}</span>}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {!isAimless && raceWeekGuidance && raceWeekGuidance.bullets.length > 0 && (
            <div
              className="mt-2 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5"
              role="region"
              aria-label="Race-week guidance"
            >
              <p className="text-[12px] font-semibold tracking-[0.12em] text-sky-300/85 uppercase mb-1.5">
                {raceWeekGuidance.title}
              </p>
              <ul className="text-[13px] text-white/72 leading-relaxed space-y-1.5 list-disc pl-3.5 marker:text-sky-400/50">
                {raceWeekGuidance.bullets.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={coachBusy}
          className="min-h-[44px] min-w-[44px] -mr-1 flex items-center justify-center rounded-lg text-white/60 hover:text-white/65 hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0 touch-manipulation relative z-10"
          aria-label={coachBusy ? 'Updating training data' : 'Refresh'}
        >
          <RefreshCw className={`w-4 h-4 ${coachBusy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Section clock label: LOAD + BODY are the FAST clock (how the last 7 days feel vs typical).
          Named once here; per-row specifics (WTD pts, RPE receipt) inherit it. */}
      <div className="px-1 mb-1 text-[12px] text-white/50 lowercase">load · rolling last 7 days vs your typical week</div>

      {/* READOUT PLATES (2026-08-15) — State wears the workout Details tab's card language
          (`readoutPlateStyle`, shared from src/lib/readout-plate.ts). The law from the logger
          palette applies: a discipline colour only ever means its discipline. These top sections
          (LOAD / BODY / the week mix) are MULTI-SPORT, so their plate is NEUTRAL — the sport
          colours inside them are data (bars, legend chips), never the card's own chrome. The
          per-discipline plates live in <StatePerformanceSection>, where a card belongs to one
          sport and may wear it. */}
      <div className="galaxy-card readout-texture readout-texture--spectral rounded-2xl divide-y divide-white/[0.055]" style={readoutPlateStyle(undefined, { galaxy: true })}>

        {/* LOAD — full-width gauge + sparkline */}
        <LoadBar load={load} loadStatus={loadStatus} weekIntent={week.intent} />

        {showTopLastRaceCard && lastCompletedRace && (
          <div className="px-3 py-2.5 border-b border-white/[0.055] space-y-1">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-white/50 uppercase">Last race</p>
            <p className="text-[13px] text-white/80">
              <span className="text-white/60">{lastCompletedRace.name}</span>
              <span className="text-white/60"> · {fmtDate(lastCompletedRace.target_date)}</span>
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-[20px] font-semibold tabular-nums text-white/90">
                {fmtGoalClock(lastCompletedRace.actual_seconds)}
              </span>
              <span className="text-[13px] text-white/65">actual (elapsed / chip)</span>
            </div>
            {lastCompletedRace.goal_target_seconds != null && (
              <p className="text-[13px] text-white/50">
                Goal {fmtGoalClock(lastCompletedRace.goal_target_seconds)}
                <Dot />
                <span
                  className={
                    lastCompletedRace.actual_seconds <= lastCompletedRace.goal_target_seconds
                      ? 'text-emerald-400/90'
                      : 'text-amber-400/85'
                  }
                >
                  {fmtSignedDeltaVsGoal(
                    lastCompletedRace.actual_seconds,
                    lastCompletedRace.goal_target_seconds,
                  )}
                </span>
              </p>
            )}
            {lastCompletedRace.projected_seconds != null && (
              <p className="text-[13px] text-white/50">
                Projected {fmtGoalClock(lastCompletedRace.projected_seconds)}
                <Dot />
                <span
                  className={
                    lastCompletedRace.actual_seconds <= lastCompletedRace.projected_seconds
                      ? 'text-emerald-400/90'
                      : 'text-amber-400/85'
                  }
                >
                  {fmtSignedDeltaVsProjection(
                    lastCompletedRace.actual_seconds,
                    lastCompletedRace.projected_seconds,
                  )}
                </span>
              </p>
            )}
          </div>
        )}

        {showAmberRecordBar && (
          <div className="px-3 py-2.5 border-b border-white/[0.055] space-y-1">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-amber-300/80 uppercase">Race day</p>
            <p className="text-[13px] text-white/55 leading-snug">
              Logging your race as a completed run auto-saves the elapsed (chip) result to My Record and ends this plan.
            </p>
          </div>
        )}

        {/* BODY */}
        <div className="px-3 py-3">
          <div className="flex items-start gap-3">
            <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase pt-0.5 w-[72px] shrink-0">BODY</span>
            <div className="flex-1 space-y-1.5 tabular-nums">
              {/* overall_training_read "This week" fallback DELETED 2026-07-24 — the ~25-branch summary
                  duplicated the load bar above (F8 / docs/COPY-VOICE.md). When BODY has no per-metric
                  signals it now simply reads "not enough data". */}
              {visibleSignals.length === 0 && (
                <Chip value="not enough data" valueClass="text-white/55" />
              )}
              {visibleSignals.map((s) => (
                <div key={s.label}>
                  {/* D-232 progressive disclosure: tap the row to reveal one line of provenance
                      (source = your own ratings · cross-discipline · 7d vs 28d). Only when provenance exists. */}
                  <button
                    type="button"
                    disabled={!s.provenance}
                    onClick={() => s.provenance && setExpandedSignal(expandedSignal === s.label ? null : s.label)}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <span className="text-[13px] text-white/70 shrink-0 w-[104px]">{s.label}</span>
                    <div className="flex-1 flex items-start gap-2 min-w-0">
                      <span className={`flex-1 text-[13px] text-left leading-snug ${trendColor(s.trend, s.trend_tone)}`}>{s.detail}</span>
                      {s.provenance && <span className="text-white/50 text-[11px] shrink-0 mt-0.5">{expandedSignal === s.label ? '▾' : '▸'}</span>}
                    </div>
                  </button>
                  {/* ⛔ THE PERSISTENCE LINE POINTS AT A DOOR, IT DOES NOT OPEN ONE ITSELF (D-354).
                      Soreness above this athlete's OWN normal for 4 of the last 6 sessions. It states
                      the fact and offers the Adjust tab; nothing changes unless the athlete goes and
                      changes it. ⚠️ Adjust is still a scaffold for endurance — strength steers work
                      (in the logger), ease/push does not exist yet. Sending someone there is honest
                      because that tab says so itself; it is not honest to pretend the line acts. */}
                  {s.soreness_flag && (
                    <button
                      type="button"
                      onClick={() => setStateLens('adjust')}
                      className="w-full flex items-baseline gap-2 text-left pl-[116px] -mt-0.5 mb-1"
                    >
                      <span className="text-[12px] text-white/60 leading-snug">{s.soreness_flag}</span>
                      <span className="text-[12px] text-white/40 shrink-0">Adjust ›</span>
                    </button>
                  )}
                  {/* Whoop pairing (verdict + its driver, together): the RPE driver — which session
                      moved the week — sits WITH the "how hard it feels" verdict, dim + always-visible.
                      RPE-clause only (server guarantees no non-RPE factor reaches this row). */}
                  {s.label === 'How hard it feels' && readinessRpeDriver && (
                    <p className="text-[13px] text-white/65 leading-snug mt-0.5">{readinessRpeDriver}</p>
                  )}
                  {fmtBodyAsOf(s.as_of_date) && (
                    <p className="text-[12px] text-white/45 leading-snug mt-0.5">{fmtBodyAsOf(s.as_of_date)}</p>
                  )}
                  {expandedSignal === s.label && s.provenance && (
                    <p className="text-[12px] text-white/60 leading-snug mt-1 max-w-[min(100%,320px)]">{s.provenance}</p>
                  )}
                </div>
              ))}
              {/* The BODY 'Cross-training' row is DELETED (D-354). BODY is only what the athlete
                  REPORTS — effort and soreness. This row compared declared targets against GPS
                  mileage, which the athlete already knows. The server no longer sends the field. */}
            </div>
          </div>
        </div>

        {/* READINESS — athlete-reported energy/soreness/sleep (Q-049 Phase 1, D-144).
            Raw + distinct sliders; shown ONLY when a recent check-in exists (no-data
            on absent, per Q3). Neutral tone — Phase 1 is visible-only, no good/bad
            judgement encoded. Trend arrow per signal (newest vs oldest in window)
            when ≥3 check-ins. */}
        {checkinReadiness?.latest && (() => {
          const L = checkinReadiness.latest!;
          const today = new Date().toISOString().slice(0, 10);
          const dayDiff = Math.round(
            (Date.parse(today + 'T00:00:00Z') - Date.parse(L.date + 'T00:00:00Z')) / 86400000,
          );
          const whenLabel = dayDiff <= 0 ? 'today' : dayDiff === 1 ? 'yesterday' : `${dayDiff}d ago`;
          const arrow = (k: 'energy' | 'soreness' | 'sleep') => {
            if (checkinReadiness.recent.length < 3) return '';
            const newest = checkinReadiness.recent[0][k];
            const oldest = checkinReadiness.recent[checkinReadiness.recent.length - 1][k];
            return newest > oldest ? ' ↑' : newest < oldest ? ' ↓' : ' →';
          };
          return (
            <div className="px-3 py-3">
              <Row label="READINESS">
                <Chip label="energy" value={`${L.energy}${arrow('energy')}`} />
                <Dot />
                <Chip label="soreness" value={`${L.soreness}${arrow('soreness')}`} />
                <Dot />
                <Chip label="sleep" value={`${L.sleep}${arrow('sleep')}`} />
                <Dot />
                <Chip value={whenLabel} valueClass="text-white/65" />
              </Row>
            </div>
          );
        })()}

        {/* "How your sessions went · last 7 days" — REBUILT (docs/STATE-WEEK-EXECUTION.md). Neutral
            per-discipline planned-vs-done COUNTS + at most ONE composed accent. No fitness verdicts here
            (that is PERFORMANCE, below); interval/execution % lives in session detail. Server owns the
            accent; this renders it (Law 4). Three states: counts+accent / counts-only / nothing. */}
        {(() => {
          const we = (wsv as any).week_execution_v1 as {
            counts?: Array<{ discipline: string; planned: number; done: number }>;
            accent?: { sentence: string; trace?: { detail?: string } } | null;
          } | null | undefined;
          const counts = Array.isArray(we?.counts) ? we!.counts! : [];
          const accent = we?.accent ?? null;
          if (counts.length === 0 && !accent) return null; // nothing to say → render nothing
          const hasPlan = !!wsv.plan?.has_active_plan;
          const totalPlanned = counts.reduce((s, c) => s + (c.planned || 0), 0);
          // F21/F26: partial week = the calendar week has not closed yet (end_date is still in the
          // future). daysSinceYmd = today − end_date, so < 0 means the week is still running.
          const endDays = daysSinceYmd((week as any)?.end_date ?? null);
          const partialWeek = endDays != null && endDays < 0;
          // Header: only claim "planned vs actual" when there IS a plan to compare against (F26).
          const showsPlanned = hasPlan && totalPlanned > 0;
          const sectionLabel = showsPlanned ? 'this week · planned vs actual' : 'this week';
          return (
            <>
              <div className="px-4 pt-3 text-[12px] text-white/50 lowercase tracking-[0.12em]">{sectionLabel}</div>
              {counts.length > 0 && <WeekMixBar counts={counts} hasPlan={hasPlan} partialWeek={partialWeek} />}
              {accent?.sentence && <WeekAccentLine sentence={accent.sentence} detail={accent.trace?.detail ?? null} />}
            </>
          );
        })()}

      </div>

      {/* PERFORMANCE — STATE v2 per-discipline trend (perf where data exists, adherence fallback). Under review; not yet shipped. */}
      {/* ⛔ `block` is the block-identity card the coach payload has carried since v150 — protocol,
          goal, week-in-cycle, deload, the plain phase word. The fitness rows below RENDER it; they
          do not re-derive any of it (Law 4). `planWeek` is the server's already-gated week number
          (null before a plan starts and after it ends), so the two always agree.
          Sits OUTSIDE the neutral plates: its rows are per-discipline, and each wears its own
          sport-keyed plate inside the section. */}
      <StatePerformanceSection strengthDetail={strengthPerLiftDetail} stateDisplay={wsv.trends?.display} primaryDiscipline={(wsv.plan as any)?.primary_discipline ?? null} planWeek={week.index ?? null} block={planRoot?.block ?? null} strengthFatigue={strengthFatigue} />

      <div className="mt-2 galaxy-card readout-texture readout-texture--spectral rounded-2xl divide-y divide-white/[0.055]" style={readoutPlateStyle(undefined, { galaxy: true })}>

        {/* SWIM re-test nudge (D-200) — fires after ≥4 weeks + ≥4 honored swims; auto-clears when the
            threshold is updated/tested (lastUpdatedAt moves). Dismiss = 7-day snooze (shared pattern). */}
        {swimNudge?.show && nudgeDismissNonce >= 0 && !isNudgeSnoozed('swim_retest') && (
          <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold tracking-[0.12em] text-sky-300/85 uppercase mb-1">Swim check-in</p>
                <p className="text-[13px] text-white/75 leading-snug">
                  About {Math.round(swimNudge.weeksSince)} weeks of steady swimming since your last update — a quick CSS test would refresh your threshold.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { snoozeNudge('swim_retest'); setNudgeDismissNonce((n) => n + 1); }}
                className="text-[13px] text-white/60 hover:text-white/70 shrink-0 touch-manipulation"
                aria-label="Dismiss swim check-in"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* SIGNAL — longitudinal nudge, only when there's an actionable signal */}
        {showNudge && (
          <div className="px-3 py-3">
            <div className="flex items-start gap-3">
              <span className="readout-label text-[12px] font-semibold tracking-[0.12em] uppercase pt-0.5 w-[72px] shrink-0">SIGNAL</span>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[13px] leading-snug flex-1 ${
                    nudgeDecision.severity === 'concern' ? 'text-amber-400/85' : 'text-white/75'
                  }`}>
                    {nudgeDecision.headline}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 p-0.5 text-white/50 hover:text-white/65 bg-transparent border-none cursor-pointer"
                    aria-label="Dismiss signal"
                    onClick={() => {
                      snoozeNudge(nudgeDecision.nudge_kind!);
                      setNudgeDismissNonce((n) => n + 1);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-1.5 text-[13px] text-teal-400/70 hover:text-teal-300/90 bg-transparent border-none cursor-pointer p-0"
                  onClick={() => navigate('/arc-setup', { state: { arcNudgeSeed: nudgeDecision.headline } })}
                >
                  Review with Arc →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STRENGTH per-lift detail moved (Q-107 H3) — now nested under the STRENGTH trend row inside
            <StatePerformanceSection> above (passed as strengthDetail). No second "STRENGTH" header. */}

        {/* RACE — visible during the build and through race week; disappears 7 days after the race. */}
        {(() => {
          // item 5 (Arc source-gate — relevance earned by live data, else null): RACE requires an
          // actual race signal, NOT a bare active plan. A non-race plan (e.g. Get Stronger) has
          // has_active_plan=true but no goal/projection → this used to render an empty RACE header.
          // (This is the QUICK half of the Q-120 overlap — a render narrowing, no logic added, so it
          // does not complicate the full Q-120 readiness-gating redesign.)
          // RACE only when there is a REAL race. Hard race artifacts (a computed projection / official
          // result) always qualify. A soft goal or readiness qualifies ONLY with an actual race DATE —
          // because goalMetaFromGoalLite defaults distance to 'marathon', so `goalMeta` is truthy for ANY
          // linked goal (incl. a non-race "Get Stronger" plan), which was leaking an empty RACE prompt.
          const hasRaceContent =
            raceFinishProjection ||
            officialForRace ||
            postRaceUnofficial ||
            (!!raceYmdForActivePlan && (raceReadiness || goalMeta));
          if (!hasRaceContent) return null;
          const upcomingDays = daysSinceYmd(raceYmdForActivePlan);
          const stillRaceWeek = upcomingDays == null || upcomingDays <= 7;
          if (!stillRaceWeek) return null;
          return (
          <RaceSection
            projection={raceFinishProjection}
            rr={raceReadiness}
            blockVerdict={data?.goal_prediction?.block_verdict ?? null}
            divergence={
              (data?.fitness_verdict_divergence ?? []).find(
                (d) => d.goal_id === raceReadiness?.goal?.id || d.goal_name === raceReadiness?.goal?.name,
              ) ?? null
            }
            goalMeta={goalMeta}
            planWizardDistance={planWizardDistance}
            planWizardTargetSeconds={planWizardTargetSeconds ?? null}
            primaryRaceReadiness={primaryRaceReadiness}
            resolvedGoalId={resolvedGoalId}
            courseRow={stateCourseRow}
            courseBusy={courseBusy}
            onAddCourse={() => stateCourseFileRef.current?.click()}
            onViewStrategy={() => {
              if (stateCourseRow?.id) {
                setStrategyCourseId(stateCourseRow.id);
                setStrategyModalOpen(true);
              }
            }}
            onOpenKeyRun={
              onSelectWorkout
                ? (workoutId) => {
                    onClose?.();
                    onSelectWorkout({ id: workoutId, workout_status: 'completed', type: 'run' });
                  }
                : undefined
            }
            officialResult={officialForRace}
            postRaceUnofficial={officialForRace ? null : postRaceUnofficial}
          />
          );
        })()}

        {/* NEXT */}
        <div className="px-3 py-3">
          <Row label="NEXT">
            {nextSessions.length === 0 && <Chip value="week complete" valueClass="text-white/55" />}
            {nextSessions.map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Dot />}
                <Chip label={fmtDate(s.date)} value={s.name ?? s.type} />
              </React.Fragment>
            ))}
          </Row>
        </div>
      </div>

      {wsv.plan.plan_name && (
        <div className="mt-2 px-0.5 text-[12px] text-white/60 uppercase tracking-widest">
          {wsv.plan.plan_name}
        </div>
      )}

      <input
        ref={stateCourseFileRef}
        type="file"
        accept=".gpx,application/gpx+xml,.xml"
        className="hidden"
        onChange={handleStateCourseFile}
      />
      <CourseStrategyModal
        open={strategyModalOpen}
        courseId={strategyCourseId}
        onClose={() => {
          setStrategyModalOpen(false);
          setStrategyCourseId(null);
        }}
      />
      </>)}
    </div>
  );
}
