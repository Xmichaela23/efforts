/**
 * Compact Arc snapshot for Performance (`session_detail_v1`) — sourced from temporal `getArcContext`.
 */
import type { ArcContext, Goal } from '../arc-context.ts';
import { sanitizeUserFacingPhaseLabel, type ArcNarrativeContextV1, type ArcNarrativeMode } from '../arc-narrative-state.ts';

export const ARC_PERFORMANCE_BRIDGE_VERSION = 7;

export type ArcPerformancePrimaryGoalV1 = {
  id: string;
  name: string;
  target_date: string | null;
  sport: string | null;
  distance: string | null;
  days_until: number | null;
  weeks_until: number | null;
};

export type ArcPerformanceBridgeV1 = {
  version: number;
  built_at: string;
  focus_date: string;
  /** Deterministic vocabulary for prompts + downstream consumers */
  narrative_mode: ArcNarrativeMode | null;
  /** Populated when Arc could resolve temporal narrative context */
  days_since_last_goal_race: number | null;
  runs_since_last_race: number | null;
  days_until_next_block_start: number | null;
  last_race:
    | { name: string; distance: string | null; date: string }
    | null;
  next_goal: ArcPerformancePrimaryGoalV1 | null;
  /**
   * Coach-side / tooling context derived from temporal Arc — plan envelope, linkage hints, internal mode labels.
   * Not appended to athlete `narrative_text`; prompts use `ArcNarrativeContextV1` from `analyze-running-workout`.
   */
  coaching_context: string | null;
  primary_goal: ArcPerformancePrimaryGoalV1 | null;
  active_plan: {
    plan_id: string;
    week_number: number | null;
    phase: string | null;
    discipline: string | null;
  } | null;
};

function daysBetween(fromYmd: string, toYmd: string): number | null {
  const a = Date.parse(`${fromYmd}T12:00:00.000Z`);
  const b = Date.parse(`${toYmd}T12:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

function pickPrimaryGoalLegacy(goals: Goal[], focusYmd: string): Goal | null {
  const active = goals.filter((g) => String(g.status || '').toLowerCase() === 'active');
  if (!active.length) return null;
  const withDate = active.filter((g) => typeof g.target_date === 'string' && g.target_date.length >= 10);
  const futureOrToday = withDate.filter((g) => String(g.target_date).slice(0, 10) >= focusYmd.slice(0, 10));
  const pool = futureOrToday.length ? futureOrToday : withDate;
  const events = pool.filter((g) => String(g.goal_type || '').toLowerCase() === 'event');
  const ranked = (events.length ? events : pool.length ? pool : active).slice();
  ranked.sort((x, y) => String(x.target_date || '9999').localeCompare(String(y.target_date || '9999')));
  return ranked[0] ?? null;
}

function primaryFromNarrative(
  nc: ArcNarrativeContextV1 | null | undefined,
  focus_date: string,
): ArcPerformancePrimaryGoalV1 | null {
  const g = nc?.next_primary_goal;
  if (!g) return null;
  const td = g.target_date ? String(g.target_date).slice(0, 10) : null;
  const du = td ? daysBetween(focus_date, td) : null;
  const wu = du != null && du >= 0 ? Math.floor(du / 7) : null;
  return {
    id: g.id,
    name: g.name,
    target_date: td,
    sport: g.sport,
    distance: g.distance,
    days_until: du,
    weeks_until: wu,
  };
}

function buildCoachContext(params: {
  focusYmd: string;
  nc: ArcNarrativeContextV1 | null;
  primary: ArcPerformancePrimaryGoalV1 | null;
  plan: ArcPerformanceBridgeV1['active_plan'];
  hasLinkedPlannedSession: boolean;
}): string | null {
  const { focusYmd, nc, primary, plan, hasLinkedPlannedSession } = params;
  const parts: string[] = [];

  if (nc?.mode === 'recovery_read' && nc.last_goal_race) {
    const lr = nc.last_goal_race;
    const ds = nc.days_since_last_goal_race ?? '?';
    const rn = nc.runs_since_last_race ?? '?';
    const nx = nc.next_primary_goal;
    const blockIn =
      nc.days_until_next_block_start != null && Number.isFinite(nc.days_until_next_block_start)
        ? String(nc.days_until_next_block_start)
        : '?';
    parts.push(
      `Arc · **recovery read** (${ds} days since **${lr.name}** · ${lr.distance ?? 'event'}, ${lr.target_date}); about **run #${rn}** since that race.`,
    );
    if (nx?.name && nx.target_date) {
      parts.push(
        `Next Arc target **${nx.name}** (${nx.distance ?? 'event'}) on **${nx.target_date}** — heuristic structured block ramps in ~**${blockIn}** days; today is low-stress re-entry.`,
      );
    }
  } else if (nc?.mode === 'taper_read') {
    parts.push(`Arc · **taper read** — next A‑priority race is imminent for **${focusYmd}**.`);
  } else if (nc?.mode === 'race_debrief' && nc.last_goal_race) {
    parts.push(
      `Arc · **race debrief window** (${nc.days_since_last_goal_race ?? '?'}d since **${nc.last_goal_race.name}**, ${nc.last_goal_race.target_date}).`,
    );
  }

  if (primary?.name) {
    const du = primary.days_until;
    const wu = primary.weeks_until;
    if (!parts.length || nc?.mode !== 'recovery_read') {
      if (du != null && du >= 0 && du <= 14) {
        parts.push(
          `Primary Arc target **${primary.name}**${primary.distance ? ` (${primary.distance})` : ''} — **${du} day${du === 1 ? '' : 's'}** out on this workout date.`,
        );
      } else if (wu != null && wu >= 0 && wu <= 12) {
        parts.push(`**${primary.name}** sits **${wu} week${wu === 1 ? '' : 's'}** ahead on the stack.`);
      } else if (primary.target_date) {
        parts.push(
          `Primary Arc goal **${primary.name}**${primary.distance ? ` (${primary.distance})` : ''} on **${primary.target_date.slice(0, 10)}**.`,
        );
      }
    }
  }

  if (plan?.plan_id && nc?.mode !== 'recovery_read') {
    const w = plan.week_number != null ? `week ${plan.week_number}` : 'current week';
    const ph = plan.phase ? plan.phase : 'unspecified phase';
    parts.push(`Plan envelope (for this workout date): **${w}** · **${ph}**${plan.discipline ? ` (${plan.discipline})` : ''}.`);
  }

  if (!hasLinkedPlannedSession) {
    parts.push(
      'SESSION NOTE: Planned-workout row not linked — base insights on Arc narrative mode + logged physiology only; do not narrate a missing prescription card.',
    );
  }

  if (!parts.length) {
    return nc?.mode
      ? `Arc · narrative mode **${nc.mode}** on **${focusYmd}**.`
      : `Arc · no temporal goal/plan framing on **${focusYmd}** — treat as unstructured.`;
  }

  return parts.join(' ');
}

/**
 * Athlete-facing Performance Insights body — coaching read only (`workout_analysis` LLM paragraph).
 * Temporal Arc primes the model separately (`arc_narrative_context`), not prepended here.
 */
export function mergeArcPerformanceNarrative(params: {
  analysisNarrative: string | null;
  isGoalRaceSession: boolean;
}): string | null {
  if (params.isGoalRaceSession) return params.analysisNarrative;
  const b = (params.analysisNarrative || '').trim();
  return b || null;
}

export function buildArcPerformanceBridge(
  arc: ArcContext | null | undefined,
  focusYmd: string,
  hasLinkedPlannedSession: boolean,
): ArcPerformanceBridgeV1 {
  const built_at = new Date().toISOString();
  const focus_date = focusYmd.slice(0, 10);

  if (!arc) {
    return {
      version: ARC_PERFORMANCE_BRIDGE_VERSION,
      built_at,
      focus_date,
      narrative_mode: null,
      days_since_last_goal_race: null,
      runs_since_last_race: null,
      days_until_next_block_start: null,
      last_race: null,
      next_goal: null,
      coaching_context: hasLinkedPlannedSession
        ? null
        : 'Arc snapshot unavailable for this date — session logged without temporal plan framing.',
      primary_goal: null,
      active_plan: null,
    };
  }
  const nc = arc.arc_narrative_context ?? null;

  const pgFromNc = primaryFromNarrative(nc, focus_date);
  const pgGoalFallback = pgFromNc ? null : pickPrimaryGoalLegacy(arc.active_goals || [], focus_date);

  let primary: ArcPerformancePrimaryGoalV1 | null = pgFromNc;
  if (!primary && pgGoalFallback) {
    const td = pgGoalFallback.target_date ? String(pgGoalFallback.target_date).slice(0, 10) : null;
    const du = td ? daysBetween(focus_date, td) : null;
    const wu = du != null && du >= 0 ? Math.floor(du / 7) : null;
    primary = {
      id: pgGoalFallback.id,
      name: pgGoalFallback.name,
      target_date: td,
      sport: pgGoalFallback.sport,
      distance: pgGoalFallback.distance,
      days_until: du,
      weeks_until: wu,
    };
  }

  const ap = arc.active_plan;
  const active_plan =
    ap && ap.plan_id
      ? {
          plan_id: ap.plan_id,
          week_number: ap.week_number ?? null,
          phase: sanitizeUserFacingPhaseLabel(ap.phase) ?? null,
          discipline: ap.discipline ?? null,
        }
      : null;

  const last_race = nc?.last_goal_race
    ? {
        name: nc.last_goal_race.name,
        distance: nc.last_goal_race.distance,
        date: nc.last_goal_race.target_date,
      }
    : null;

  const coaching_context = buildCoachContext({
    focusYmd: focus_date,
    nc,
    primary,
    plan: active_plan,
    hasLinkedPlannedSession,
  });

  return {
    version: ARC_PERFORMANCE_BRIDGE_VERSION,
    built_at,
    focus_date,
    narrative_mode: nc?.mode ?? null,
    days_since_last_goal_race: nc?.days_since_last_goal_race ?? null,
    runs_since_last_race: nc?.runs_since_last_race ?? null,
    days_until_next_block_start: nc?.days_until_next_block_start ?? null,
    last_race,
    next_goal: primary,
    coaching_context,
    primary_goal: primary,
    active_plan,
  };
}
