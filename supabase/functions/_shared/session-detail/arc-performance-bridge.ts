/**
 * Compact Arc snapshot for Performance (`session_detail_v1`) — same `getArcContext`
 * source as Coach / planning. Keeps the workout screen anchored to athlete truth.
 */
import type { ArcContext, Goal } from '../arc-context.ts';

export const ARC_PERFORMANCE_BRIDGE_VERSION = 1;

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
  /** One or two sentences: phase, goal horizon, and whether a plan card is linked. */
  framing: string | null;
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

function pickPrimaryGoal(goals: Goal[], focusYmd: string): Goal | null {
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

function buildFraming(params: {
  focusYmd: string;
  primary: ArcPerformancePrimaryGoalV1 | null;
  plan: ArcPerformanceBridgeV1['active_plan'];
  hasLinkedPlannedSession: boolean;
}): string | null {
  const { focusYmd, primary, plan, hasLinkedPlannedSession } = params;
  const parts: string[] = [];

  if (primary?.name) {
    const du = primary.days_until;
    const wu = primary.weeks_until;
    if (du != null && du >= 0 && du <= 14) {
      parts.push(
        `Arc: your primary target is **${primary.name}**${primary.distance ? ` (${primary.distance})` : ''} — **${du} day${du === 1 ? '' : 's'}** out as of this session.`,
      );
    } else if (wu != null && wu >= 0 && wu <= 8) {
      parts.push(
        `Arc: **${primary.name}** is about **${wu} week${wu === 1 ? '' : 's'}** away; read today's work in that light.`,
      );
    } else if (primary.target_date) {
      parts.push(
        `Arc: primary goal **${primary.name}**${primary.distance ? ` (${primary.distance})` : ''} on **${primary.target_date.slice(0, 10)}**.`,
      );
    } else {
      parts.push(`Arc: primary goal **${primary.name}**.`);
    }
  }

  if (plan?.plan_id) {
    const w = plan.week_number != null ? `week ${plan.week_number}` : 'current week';
    const ph = plan.phase ? plan.phase : 'unspecified phase';
    parts.push(`Active plan: **${w}** · **${ph}**${plan.discipline ? ` (${plan.discipline})` : ''}.`);
  }

  if (!hasLinkedPlannedSession) {
    parts.push(
      'This workout is **not linked** to a plan session card — any session analysis is grounded in Arc goals and week intent, not a missing prescription row.',
    );
  }

  if (!parts.length) {
    return 'Arc: no dated primary goal or active plan week on file for this date — treat this session as standalone effort and recovery signals.';
  }

  return parts.join(' ');
}

/**
 * Single Performance narrative: Arc framing first, then analysis copy (when present).
 * Goal-race sessions keep analysis narrative null here; race debrief is overlaid later in workout-detail.
 */
export function mergeArcPerformanceNarrative(params: {
  framing: string | null;
  analysisNarrative: string | null;
  isGoalRaceSession: boolean;
}): string | null {
  if (params.isGoalRaceSession) return params.analysisNarrative;
  const f = (params.framing || '').trim();
  const b = (params.analysisNarrative || '').trim();
  if (!f && !b) return null;
  if (!b) return f || null;
  if (!f) return b;
  return `${f} ${b}`.trim();
}

export function buildArcPerformanceBridge(
  arc: ArcContext | null | undefined,
  focusYmd: string,
  hasLinkedPlannedSession: boolean,
): ArcPerformanceBridgeV1 | null {
  if (!arc) return null;
  const built_at = new Date().toISOString();
  const focus_date = focusYmd.slice(0, 10);

  const pgGoal = pickPrimaryGoal(arc.active_goals || [], focus_date);
  let primary: ArcPerformancePrimaryGoalV1 | null = null;
  if (pgGoal) {
    const td = pgGoal.target_date ? String(pgGoal.target_date).slice(0, 10) : null;
    const du = td ? daysBetween(focus_date, td) : null;
    const wu = du != null && du >= 0 ? Math.floor(du / 7) : null;
    primary = {
      id: pgGoal.id,
      name: pgGoal.name,
      target_date: td,
      sport: pgGoal.sport,
      distance: pgGoal.distance,
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
          phase: ap.phase ?? null,
          discipline: ap.discipline ?? null,
        }
      : null;

  const framing = buildFraming({
    focusYmd: focus_date,
    primary,
    plan: active_plan,
    hasLinkedPlannedSession,
  });

  return {
    version: ARC_PERFORMANCE_BRIDGE_VERSION,
    built_at,
    focus_date,
    framing,
    primary_goal: primary,
    active_plan,
  };
}
