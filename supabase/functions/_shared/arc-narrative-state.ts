/**
 * Deterministic narrative mode + post-race / block-transition signals for Arc.
 * All deltas use `focusYmd` as the temporal cursor (not "today").
 */

export type ArcNarrativeMode =
  | 'recovery_read'
  | 'race_debrief'
  | 'taper_read'
  | 'peak_read'
  | 'build_read'
  | 'unstructured_read';

export type ArcNarrativeGoalRef = {
  id: string;
  name: string;
  target_date: string | null;
  sport: string | null;
  distance: string | null;
  priority: string;
};

export type ArcNarrativeLastRace = {
  name: string;
  distance: string | null;
  target_date: string;
};

/** Normalized bucket for plan.phase string ( substring match ). */
export type ArcPlanPhaseBucket = 'peak' | 'base' | 'build' | 'taper' | 'recovery' | 'unspecified';

/** Strip planner-internal markers from phase labels shown to athletes (e.g. "(generated)"). */
export function sanitizeUserFacingPhaseLabel(phaseRaw: string | null | undefined): string | null {
  let s = String(phaseRaw ?? '').trim();
  if (!s) return null;
  s = s.replace(/\s*\([^)]*\bgenerated\b[^)]*\)/gi, '').trim();
  return s || null;
}

export type ArcNarrativeContextV1 = {
  version: 1;
  focus_date: string;
  mode: ArcNarrativeMode;
  days_since_last_goal_race: number | null;
  runs_since_last_race: number | null;
  days_until_next_block_start: number | null;
  days_until_next_goal_race: number | null;
  last_goal_race: ArcNarrativeLastRace | null;
  /** Primary dated goal horizon as-of focus_date (temporal stack). */
  next_primary_goal: ArcNarrativeGoalRef | null;
  /** Phase label from ActivePlanSummary as-of date, simplified for branching. */
  plan_phase_normalized: ArcPlanPhaseBucket;
  /** Weeks assumed as “block lead” before next event for block-start estimate heuristics. */
  assumed_block_lead_weeks: number | null;
};

function ymdToUtcMs(ymd: string): number {
  return new Date(`${ymd}T12:00:00.000Z`).getTime();
}

export function calendarDaysBetween(fromYmd: string, toYmd: string): number | null {
  const a = ymdToUtcMs(fromYmd);
  const b = ymdToUtcMs(toYmd);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(ymd + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function goalCreatedOnOrBefore(goalCreatedAtIso: string | null | undefined, focusYmd: string): boolean {
  if (!goalCreatedAtIso) return true;
  const d = String(goalCreatedAtIso).slice(0, 10);
  return d <= focusYmd;
}

/**
 * Goal counts as upcoming / in-stack on focus day (not cancelled, existed by then).
 */
export function goalIsUpcomingStackAsOf(
  g: {
    status: string;
    target_date?: string | null;
    created_at?: string | null;
  },
  focusYmd: string,
): boolean {
  const st = String(g.status || '').toLowerCase();
  if (st === 'cancelled') return false;
  if (!goalCreatedOnOrBefore(g.created_at ?? null, focusYmd)) return false;

  const td = g.target_date ? String(g.target_date).slice(0, 10) : '';
  // Completed races before focus → not upcoming.
  if (st === 'completed') {
    if (td && td < focusYmd) return false;
    return false;
  }
  if (st !== 'active' && st !== 'paused') return false;

  // Event goals without a date → still stack for capacity-style; prefer dated for primary pick elsewhere.
  if (td && td < focusYmd) return false;

  return true;
}

/** Pick earliest future (or focus-day) dated event goal; then any dated goal; else null. */
export function pickTemporalPrimaryGoal(
  rows: Array<{
    id: string;
    name: string;
    goal_type: string;
    target_date: string | null;
    sport: string | null;
    distance: string | null;
    priority: string;
    status: string;
    created_at?: string | null;
  }>,
  focusYmd: string,
): ArcNarrativeGoalRef | null {
  const pool = rows.filter((r) => goalIsUpcomingStackAsOf(r, focusYmd));
  const events = pool.filter((r) => String(r.goal_type || '').toLowerCase() === 'event');
  const withDate = events.filter((r) => typeof r.target_date === 'string' && r.target_date.length >= 10);
  const future = withDate.filter((r) => String(r.target_date).slice(0, 10) >= focusYmd);
  const ranked = (future.length ? future : withDate).slice().sort((a, b) => {
    const da = String(a.target_date || '9999-12-31');
    const db = String(b.target_date || '9999-12-31');
    return da.localeCompare(db);
  });
  const chosen = ranked[0];
  if (!chosen) return null;
  return {
    id: String(chosen.id),
    name: String(chosen.name || 'Untitled'),
    target_date: chosen.target_date ? String(chosen.target_date).slice(0, 10) : null,
    sport: chosen.sport != null ? String(chosen.sport) : null,
    distance: chosen.distance != null ? String(chosen.distance) : null,
    priority: String(chosen.priority || 'A'),
  };
}

/**
 * Most recent **event** goal whose race day is strictly before `focusYmd`.
 * Includes goals still `active`/`paused` with a past `target_date` so Arc stays honest when
 * `status` flips to `completed` late (e.g. recovery runs before the DB marked the race done).
 */
export function pickLastCompletedGoalRaceBefore(
  rows: Array<{
    name: unknown;
    distance: unknown;
    target_date: unknown;
    status: unknown;
    goal_type: unknown;
    completed_at?: unknown;
  }>,
  focusYmd: string,
): ArcNarrativeLastRace | null {
  const focus = focusYmd.slice(0, 10);
  const candidates = rows
    .filter((r) => String(r.status || '').toLowerCase() !== 'cancelled')
    .filter((r) => String(r.goal_type || '').toLowerCase() === 'event')
    .map((r) => ({
      name: String(r.name || 'Race'),
      distance: r.distance != null ? String(r.distance) : null,
      td: r.target_date != null ? String(r.target_date).slice(0, 10) : '',
    }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.td) && x.td < focus);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.td.localeCompare(a.td));
  const x = candidates[0];
  return { name: x.name, distance: x.distance, target_date: x.td };
}

export function normalizePlanPhase(phaseRaw: string | null | undefined): ArcPlanPhaseBucket {
  const s = String(phaseRaw || '').toLowerCase();
  if (!s.trim()) return 'unspecified';
  if (/\bpeak\b|race\s*prep|sharpen/.test(s)) return 'peak';
  if (/\btaper\b/.test(s)) return 'taper';
  if (/\brecovery\b|\bdeload\b/.test(s)) return 'recovery';
  if (/\bbuild\b|\bthreshold\b|\btempo\b|\bprogress/.test(s)) return 'build';
  if (/\bbase\b|\bfoundation\b|\bendurance\b/.test(s)) return 'base';
  return 'unspecified';
}

function defaultBlockLeadWeeks(distance: string | null | undefined, phaseBucket: ArcPlanPhaseBucket): number {
  const d = String(distance || '').toLowerCase();
  if (/\b140\.|full|iron\b|ironman\b/.test(d)) return 20;
  if (/70\.3|half\s*iron|middle/.test(d)) return 17;
  if (/marathon|42/.test(d)) return 13;
  if (/half|21k|21\.|13\.1/.test(d)) return 11;
  if (phaseBucket === 'peak' || phaseBucket === 'build') return 13;
  return 11;
}

/**
 * Estimate calendar date when structured block work “begins” toward `next_goal` on focus day.
 * Uses (target_date − leadWeeks × 7). Intentionally heuristic — no migration.
 */
function estimateNextBlockStartYmd(nextGoalTarget: string | null, leadWeeks: number): string | null {
  if (!nextGoalTarget || !/^\d{4}-\d{2}-\d{2}$/.test(nextGoalTarget)) return null;
  return addDaysYmd(nextGoalTarget, -leadWeeks * 7);
}

export function selectArcNarrativeMode(params: {
  focusYmd: string;
  daysSinceLastGoalRace: number | null;
  daysUntilNextBlockStart: number | null;
  daysUntilNextGoalRace: number | null;
  nextGoalPriority: string | null;
  phaseBucket: ArcPlanPhaseBucket;
  hasActiveTemporalPlan: boolean;
}): ArcNarrativeMode {
  const {
    daysSinceLastGoalRace,
    daysUntilNextBlockStart: _unusedBlockHorizon,
    daysUntilNextGoalRace,
    nextGoalPriority,
    phaseBucket,
    hasActiveTemporalPlan,
  } = params;
  void _unusedBlockHorizon;

  const dSince = daysSinceLastGoalRace;
  const dRace =
    daysUntilNextGoalRace != null && Number.isFinite(daysUntilNextGoalRace) ? daysUntilNextGoalRace : null;

  const pri = String(nextGoalPriority || 'A').toUpperCase();
  /** Imminent A-priority race wins over post-race windows (taper + debrief can overlap on calendar). */
  if (dRace != null && dRace >= 0 && dRace <= 14 && pri === 'A') {
    return 'taper_read';
  }

  if (dSince != null && dSince >= 0 && dSince <= 7) {
    return 'race_debrief';
  }

  if (dSince != null && dSince >= 8 && dSince <= 21) {
    return 'recovery_read';
  }

  if (hasActiveTemporalPlan) {
    if (phaseBucket === 'peak') return 'peak_read';
    if (phaseBucket === 'base' || phaseBucket === 'build') return 'build_read';
  }

  return 'unstructured_read';
}

export type BuildArcNarrativeContextInput = {
  focusYmd: string;
  /** Upcoming-stack goals filtered or full list; picker applies temporal rules. */
  goalRowsForPrimary: Parameters<typeof pickTemporalPrimaryGoal>[0];
  /** Completed (+ active if needed) goal rows with status, goal_type, target_date for last-race lookup. */
  completedGoalRowsForLastRace: Parameters<typeof pickLastCompletedGoalRaceBefore>[0];
  /** Resolved plan phase label (already from temporal plan resolution), or null. */
  activePlanPhase: string | null;
  /** False when no temporal plan wraps focus_date. */
  hasActiveTemporalPlan: boolean;
  /** Count of completed run workouts strictly after last race date through focusYmd inclusive. */
  runsSinceLastRace: number | null;
};

export function buildArcNarrativeContextV1(inp: BuildArcNarrativeContextInput): ArcNarrativeContextV1 {
  const focusYmd = inp.focusYmd.slice(0, 10);
  const next_primary_goal = pickTemporalPrimaryGoal(inp.goalRowsForPrimary, focusYmd);
  const last_goal_race = pickLastCompletedGoalRaceBefore(inp.completedGoalRowsForLastRace, focusYmd);

  const days_since_last_goal_race =
    last_goal_race ? calendarDaysBetween(last_goal_race.target_date, focusYmd) : null;

  const days_until_next_goal_race =
    next_primary_goal?.target_date
      ? calendarDaysBetween(focusYmd, next_primary_goal.target_date)
      : null;

  const plan_phase_normalized = normalizePlanPhase(inp.activePlanPhase);

  const assumed_block_lead_weeks = next_primary_goal
    ? defaultBlockLeadWeeks(next_primary_goal.distance, plan_phase_normalized)
    : null;

  const blockStart =
    assumed_block_lead_weeks != null && next_primary_goal?.target_date
      ? estimateNextBlockStartYmd(next_primary_goal.target_date, assumed_block_lead_weeks)
      : null;

  const days_until_next_block_start =
    blockStart ? calendarDaysBetween(focusYmd, blockStart) : null;

  const mode = selectArcNarrativeMode({
    focusYmd,
    daysSinceLastGoalRace: days_since_last_goal_race,
    daysUntilNextBlockStart: days_until_next_block_start,
    daysUntilNextGoalRace: days_until_next_goal_race,
    nextGoalPriority: next_primary_goal?.priority ?? null,
    phaseBucket: plan_phase_normalized,
    hasActiveTemporalPlan: inp.hasActiveTemporalPlan,
  });

  return {
    version: 1,
    focus_date: focusYmd,
    mode,
    days_since_last_goal_race,
    runs_since_last_race:
      inp.runsSinceLastRace != null && Number.isFinite(inp.runsSinceLastRace) ? inp.runsSinceLastRace : null,
    days_until_next_block_start,
    days_until_next_goal_race,
    last_goal_race,
    next_primary_goal,
    plan_phase_normalized,
    assumed_block_lead_weeks,
  };
}
