/**
 * ═══ A PLAN AT A GLANCE — its current week, each week's phase, and its totals ═══════════════════
 *
 * docs/AUDIT-client-decisions-2026-09-10.md item 15 (H-B09, H-P03, H-P02), 2026-09-10.
 *
 * ⛔ THREE THINGS THE PHONE WORKED OUT ON ITS OWN, AND GOT DIFFERENTLY FROM TODAY.
 *   · THE CURRENT WEEK. AppContext counted weeks from the raw start date (never moved back to its
 *     Monday); the plans screen counted from the first week-1 row's date. `get-week` counts from the
 *     configured start snapped to the plan's week start, so a plan that began mid-week, or was resumed,
 *     showed one week on Goals and another on Today. `resolvePlanWeekIndex` is that rule; this file
 *     calls it and nothing else.
 *   · THE PHASE. The plans screen guessed Taper / Deload / Peak from the week's text and called
 *     everything else Build; the Goals card read the strength block's raw phase list. The phase is
 *     `resolvePlanPhase` — the plan's own word (base, build, peak, taper, recovery, test…).
 *   · THE TOTALS. "N workouts", "total" and "avg/wk" were summed over the weeks opened on this visit and
 *     divided by the whole plan's length, so they changed as the athlete tapped weeks. They are summed
 *     here over every week of the plan.
 *
 * ⚠️ SAME COUNTING RULES THE SCREEN USED, moved as they were: an `optional` session adds no minutes
 * and is not counted; a `rest` row is not a session; the race day counts in the plan's total but not
 * in its weekly average or its phase total (a one-off event is not training volume); a week's miles
 * are the plan's own `weekly_summaries[week].total_miles`; with no session minutes at all the total
 * falls back to the plan's `weekly_summaries[].estimated_hours`.
 * ⚠️ THE LENGTH OF ONE SESSION is `resolvePlannedDurationSeconds`, the one planned-length ladder
 * (audit H-T01). A week with no materialized rows reads the plan blob's authored `duration` minutes.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "plan-overview" supabase/functions
 */
import { planHasStarted, resolvePlanWeekIndex, resolveWeekStartDowFromPlanConfig, weekStartOf } from './plan-week.ts';
import { resolvePlanPhase } from './plan-phase.ts';
import { resolvePlannedDurationSeconds } from './planned-duration.ts';

// deno-lint-ignore no-explicit-any
type Json = any;

export type PlanRowLike = {
  id?: string;
  duration_weeks?: number | null;
  current_week?: number | null;
  config?: Json;
  sessions_by_week?: Json;
};

export type PlannedRowLike = {
  week_number?: number | null;
  type?: string | null;
  name?: string | null;
  tags?: unknown;
  duration?: number | null;
  total_duration_seconds?: number | null;
  computed?: unknown;
  intervals?: unknown;
};

export type PlanWeekTotals = {
  week: number;
  /** The plan's own phase word for this week, first letter capitalised; null when the plan names none. */
  phase: string | null;
  /** Every non-optional session, the race day included. */
  minutes: number;
  /** `minutes` without the race day. */
  training_minutes: number;
  /** `weekly_summaries[week].total_miles`, or null when the plan wrote none. */
  miles: number | null;
  /** Sessions that are neither rest nor optional. */
  sessions: number;
};

export type PlanPhaseTotals = {
  phase: string;
  start_week: number;
  end_week: number;
  /** Training minutes (race day excluded), every week of the plan carrying this phase. */
  minutes: number;
  miles: number | null;
  sessions: number;
};

export type PlanOverview = {
  current_week_index: number | null;
  total_weeks: number | null;
  progress_pct: number | null;
  weeks: PlanWeekTotals[];
  phases: PlanPhaseTotals[];
  totals: {
    minutes: number;
    avg_minutes_per_week: number | null;
    sessions: number;
    miles: number | null;
  };
};

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function tagsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).toLowerCase());
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map((t) => String(t).toLowerCase()); } catch { /* not JSON */ }
  }
  return [];
}

/** How many weeks the plan runs: its column, its config, then its strength block's last phase week. */
export function planTotalWeeks(plan: PlanRowLike | null | undefined): number | null {
  const direct = positive(plan?.duration_weeks) ?? positive(plan?.config?.duration_weeks);
  if (direct != null) return Math.round(direct);
  const phases = plan?.config?.phase_structure?.phases;
  if (Array.isArray(phases) && phases.length > 0) {
    const end = Math.max(...phases.map((p: Json) => Number(p?.end_week) || 0));
    if (end > 0) return end;
  }
  return null;
}

/**
 * The plan week `asOfIso` falls in — `get-week`'s rule: the configured start moved to the plan's week
 * start, capped at the plan's length; with no start date, the week stored on the plan row.
 */
export function planCurrentWeekIndex(plan: PlanRowLike | null | undefined, asOfIso: string): number | null {
  const fromStart = resolvePlanWeekIndex(plan?.config ?? {}, asOfIso, planTotalWeeks(plan));
  if (fromStart != null) return fromStart;
  const stored = positive(plan?.current_week);
  return stored == null ? null : Math.round(stored);
}

/** The plan's own phase word for a week, first letter capitalised ("base" → "Base"). */
export function planPhaseWord(plan: PlanRowLike | null | undefined, week: number | null | undefined): string | null {
  const raw = resolvePlanPhase(plan?.config ?? null, week);
  const t = String(raw ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

export function planProgressPct(week: number | null, totalWeeks: number | null): number | null {
  if (week == null || totalWeeks == null || totalWeeks <= 0) return null;
  return Math.min(100, Math.round((week / totalWeeks) * 100));
}

/**
 * The day the plan's first week opens (the configured start moved to the plan's week start), and
 * whether `asOfIso` has reached it. `resolvePlanWeekIndex` clamps a pre-start date to week 1, so a
 * plan built for next Monday reads as "week 1" today; Today needs the honest answer to say the plan
 * has not started yet (Michael, 2026-09-11: land on Today with a note that the plan starts when it
 * starts). Null when the plan carries no start date.
 */
export function planStartsOn(plan: PlanRowLike | null | undefined): string | null {
  const cfg = plan?.config ?? {};
  const start = String(cfg?.user_selected_start_date || cfg?.start_date || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(start)) return null;
  return weekStartOf(start.slice(0, 10), resolveWeekStartDowFromPlanConfig(cfg));
}

/** The fields every plan in a list carries. */
export function planListFields(plan: PlanRowLike, asOfIso: string) {
  const current = planCurrentWeekIndex(plan, asOfIso);
  const total = planTotalWeeks(plan);
  return {
    current_week_index: current,
    current_phase: planPhaseWord(plan, current),
    total_weeks: total,
    progress_pct: planProgressPct(current, total),
    starts_on: planStartsOn(plan),
    has_started: planHasStarted(plan?.config ?? {}, asOfIso),
  };
}

function sessionMinutes(s: Json, fromRow: boolean): number {
  if (fromRow) {
    const secs = resolvePlannedDurationSeconds(s);
    return secs == null ? 0 : Math.max(1, Math.round(secs / 60));
  }
  return positive(s?.duration) ?? 0;
}

/** Every week's phase and totals, each phase's totals, and the plan's totals. */
export function buildPlanOverview(args: {
  plan: PlanRowLike;
  rows: PlannedRowLike[] | null | undefined;
  asOfIso: string;
}): PlanOverview {
  const { plan, asOfIso } = args;
  const rows = Array.isArray(args.rows) ? args.rows : [];
  const blob = plan?.sessions_by_week && typeof plan.sessions_by_week === 'object' ? plan.sessions_by_week : {};
  const summaries = plan?.config?.weekly_summaries && typeof plan.config.weekly_summaries === 'object' ? plan.config.weekly_summaries : {};

  const lastRowWeek = rows.reduce((m, r) => Math.max(m, Number(r?.week_number) || 0), 0);
  const lastBlobWeek = Object.keys(blob).reduce((m, k) => Math.max(m, Number(k) || 0), 0);
  const totalWeeks = planTotalWeeks(plan);
  const span = totalWeeks ?? Math.max(lastRowWeek, lastBlobWeek);

  const weeks: PlanWeekTotals[] = [];
  for (let w = 1; w <= span; w += 1) {
    const weekRows = rows.filter((r) => Number(r?.week_number) === w);
    const fromRows = weekRows.length > 0;
    const blobWeek = blob[String(w)] ?? blob[w];
    const sessions: Json[] = fromRows ? weekRows : (Array.isArray(blobWeek) ? blobWeek : []);
    let minutes = 0;
    let training = 0;
    let count = 0;
    for (const s of sessions) {
      const tags = tagsOf(s?.tags);
      if (tags.includes('optional')) continue;
      const m = sessionMinutes(s, fromRows);
      minutes += m;
      const raceDay = tags.includes('race_day') || /race\s+day/i.test(String(s?.name ?? ''));
      if (!raceDay) training += m;
      if (String(s?.type ?? '').toLowerCase() !== 'rest') count += 1;
    }
    const summary = summaries[String(w)] ?? {};
    const miles = typeof summary?.total_miles === 'number' && Number.isFinite(summary.total_miles) ? summary.total_miles : null;
    weeks.push({ week: w, phase: planPhaseWord(plan, w), minutes, training_minutes: training, miles, sessions: count });
  }

  const phases: PlanPhaseTotals[] = [];
  for (const wk of weeks) {
    if (!wk.phase) continue;
    let p = phases.find((x) => x.phase === wk.phase);
    if (!p) {
      p = { phase: wk.phase, start_week: wk.week, end_week: wk.week, minutes: 0, miles: null, sessions: 0 };
      phases.push(p);
    }
    p.end_week = wk.week;
    p.minutes += wk.training_minutes;
    p.sessions += wk.sessions;
    if (wk.miles != null) p.miles = (p.miles ?? 0) + wk.miles;
  }

  const summedMinutes = weeks.reduce((s, w) => s + w.minutes, 0);
  const summedTraining = weeks.reduce((s, w) => s + w.training_minutes, 0);
  const estimatedMinutes = Object.values(summaries).reduce((s: number, ws: Json) => s + Math.round((Number(ws?.estimated_hours) || 0) * 60), 0);
  const totalMinutes = summedMinutes > 0 ? summedMinutes : estimatedMinutes;
  const trainingMinutes = summedTraining > 0 ? summedTraining : estimatedMinutes;
  const milesWeeks = weeks.filter((w) => w.miles != null);

  const current = planCurrentWeekIndex(plan, asOfIso);
  return {
    current_week_index: current,
    total_weeks: totalWeeks,
    progress_pct: planProgressPct(current, totalWeeks),
    weeks,
    phases,
    totals: {
      minutes: totalMinutes,
      avg_minutes_per_week: totalWeeks && totalWeeks > 0 ? Math.round(trainingMinutes / totalWeeks) : null,
      sessions: weeks.reduce((s, w) => s + w.sessions, 0),
      miles: milesWeeks.length > 0 ? milesWeeks.reduce((s, w) => s + (w.miles ?? 0), 0) : null,
    },
  };
}
