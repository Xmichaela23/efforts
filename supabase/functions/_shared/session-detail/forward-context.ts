// =============================================================================
// FORWARD CONTEXT — "What this means for future races"
// =============================================================================
// After a goal race finishes, the debrief should look forward as well as back.
// This module composes a deterministic ForwardContextV1 block from ArcContext:
//
//   - Identifies the athlete's NEXT goal (after the race we're debriefing).
//   - Projects this race's discipline performance onto the next race using
//     Riegel-style scaling, with a multisport adjustment when the next race
//     is a triathlon/duathlon.
//   - Composes a phase-aware copy block (recovery / build / no-next-goal).
//
// Smart server, dumb client: SessionNarrative renders the strings verbatim.
// =============================================================================

import type { ArcContext, CompletedEvent, Goal } from '../arc-context.ts';
import { riegelProjectTime } from '../riegel.ts';
import type {
  ForwardContextNextGoal,
  ForwardContextV1,
} from './types.ts';

// ── Distance helpers ─────────────────────────────────────────────────────────

/** Canonical run-distance lookup (meters). Lower-cased keys; permissive matches. */
const RUN_DISTANCE_M: Record<string, number> = {
  '5k': 5000,
  '10k': 10000,
  '15k': 15000,
  'half marathon': 21097.5,
  'half-marathon': 21097.5,
  'half': 21097.5,
  'marathon': 42195,
  'full marathon': 42195,
  'full': 42195,
  'ultra': 50000, // conservative default for "ultra" without further detail
  '50k': 50000,
  '50 mile': 80467,
  '100k': 100000,
  '100 mile': 160934,
};

/** Run-leg distance (meters) for common multisport formats. */
const MULTISPORT_RUN_LEG_M: Record<string, number> = {
  'sprint': 5000, // 5K run leg (varies; 5K is the modal)
  'sprint triathlon': 5000,
  'olympic': 10000,
  'olympic triathlon': 10000,
  '70.3': 21097.5,
  'half ironman': 21097.5,
  'half-ironman': 21097.5,
  '140.6': 42195,
  'ironman': 42195,
  'full ironman': 42195,
  'duathlon': 10000, // run-bike-run; default to 10K total run
};

const MULTISPORT_KEYWORDS = [
  'tri', 'triathlon', '70.3', '140.6', 'ironman', 'duathlon',
];

const RUN_SPORTS = new Set(['run', 'running', 'trail', 'trail run']);

function normalizeKey(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

function isMultisportGoal(goal: Goal): boolean {
  const sport = normalizeKey(goal.sport);
  const dist = normalizeKey(goal.distance);
  if (sport === 'triathlon' || sport === 'duathlon') return true;
  for (const kw of MULTISPORT_KEYWORDS) {
    if (sport.includes(kw) || dist.includes(kw)) return true;
  }
  return false;
}

function runLegMetersForGoal(goal: Goal): number | null {
  const dist = normalizeKey(goal.distance);
  const sport = normalizeKey(goal.sport);
  if (isMultisportGoal(goal)) {
    if (MULTISPORT_RUN_LEG_M[dist] != null) return MULTISPORT_RUN_LEG_M[dist];
    if (MULTISPORT_RUN_LEG_M[sport] != null) return MULTISPORT_RUN_LEG_M[sport];
    // Fallback: scan known keys
    for (const [k, v] of Object.entries(MULTISPORT_RUN_LEG_M)) {
      if (dist.includes(k) || sport.includes(k)) return v;
    }
    return null;
  }
  if (RUN_SPORTS.has(sport)) {
    if (RUN_DISTANCE_M[dist] != null) return RUN_DISTANCE_M[dist];
    for (const [k, v] of Object.entries(RUN_DISTANCE_M)) {
      if (dist.includes(k)) return v;
    }
    return null;
  }
  return null;
}

function isRunGoal(goal: Goal): boolean {
  const sport = normalizeKey(goal.sport);
  return RUN_SPORTS.has(sport);
}

// ── Date / phase helpers ─────────────────────────────────────────────────────

function ymdToDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(fromYmd: string, toYmd: string): number | null {
  const a = ymdToDate(fromYmd);
  const b = ymdToDate(toYmd);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ── Time formatting ──────────────────────────────────────────────────────────

function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Round to nearest minute when ≥ 1 hour, else nearest 5 seconds. */
function fmtClockApprox(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) {
    const rounded = Math.round(s / 60) * 60;
    return fmtClock(rounded);
  }
  const rounded = Math.round(s / 5) * 5;
  return fmtClock(rounded);
}

// ── Multisport run-leg adjustment ────────────────────────────────────────────

/** Run-off-the-bike penalty for triathlon run legs. ~6% conservative. */
const MULTISPORT_RUN_PENALTY = 1.06;

/** Project a run finish time onto a target distance, with optional tri penalty. */
function projectRunTime(args: {
  raceFinishSeconds: number;
  raceDistanceMeters: number;
  targetDistanceMeters: number;
  multisportPenalty: boolean;
}): number {
  const { raceFinishSeconds, raceDistanceMeters, targetDistanceMeters, multisportPenalty } = args;
  let projected = riegelProjectTime({
    knownTimeSeconds: raceFinishSeconds,
    knownDistanceMeters: raceDistanceMeters,
    targetDistanceMeters,
  });
  if (multisportPenalty) projected *= MULTISPORT_RUN_PENALTY;
  return projected;
}

// ── Next-goal selection ──────────────────────────────────────────────────────

function pickNextGoalAfterRace(
  arc: ArcContext,
  asOfDate: string,
  excludeGoalId: string | null,
): ForwardContextNextGoal | null {
  const candidates = (arc.active_goals ?? [])
    .filter((g) => g.id !== excludeGoalId)
    .filter((g) => g.goal_type === 'event' && !!g.target_date && g.status !== 'completed' && g.status !== 'paused')
    .filter((g) => {
      const days = daysBetween(asOfDate, g.target_date as string);
      return days != null && days >= 0;
    })
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));

  const next = candidates[0];
  if (!next) return null;

  const days = daysBetween(asOfDate, next.target_date as string) ?? 0;
  const weeks = Math.max(1, Math.round(days / 7));
  return {
    id: next.id,
    name: next.name,
    target_date: String(next.target_date).slice(0, 10),
    sport: next.sport ?? null,
    distance: next.distance ?? null,
    days_until: days,
    weeks_until: weeks,
    is_multisport: isMultisportGoal(next),
  };
}

// ── Just-finished race info ──────────────────────────────────────────────────

type JustFinishedRace = {
  goal_id: string | null;
  event_name: string;
  finish_seconds: number;
  distance_meters: number | null;
  sport: 'run' | null;
};

function inferJustFinishedFromSession(
  sessionDetailV1: any,
  arc: ArcContext,
): JustFinishedRace | null {
  const race = sessionDetailV1?.race;
  if (!race?.is_goal_race) return null;
  const finish = Number(race?.actual_seconds);
  if (!Number.isFinite(finish) || finish <= 0) return null;
  const goalId = race?.goal_id ? String(race.goal_id) : null;

  // Try to recover canonical distance from the matching goal in arc.
  let distanceMeters: number | null = null;
  if (goalId) {
    const matched = (arc.active_goals ?? []).find((g) => g.id === goalId)
      ?? (arc.recent_completed_events ?? [])
        .map((e) => ({ id: e.id, sport: e.sport, distance: e.distance } as Goal))
        .find((g) => g.id === goalId);
    if (matched) distanceMeters = runLegMetersForGoal(matched as Goal);
  }
  // Session type tells us the discipline (this surface is run-only goal-race today).
  const isRun = String(sessionDetailV1?.type ?? '').toLowerCase() === 'run';
  return {
    goal_id: goalId,
    event_name: String(race?.event_name ?? sessionDetailV1?.name ?? 'race'),
    finish_seconds: finish,
    distance_meters: distanceMeters,
    sport: isRun ? 'run' : null,
  };
}

// ── Phase inference ──────────────────────────────────────────────────────────

function inferPostRacePhase(
  arc: ArcContext,
  justFinished: JustFinishedRace | null,
): string {
  // If Arc tells us, trust it.
  const phase = arc.athlete_identity?.current_phase ?? null;
  if (phase) return phase;
  // Otherwise default by goal distance: marathons → recovery, halfs/shorter → build.
  if (justFinished?.distance_meters != null && justFinished.distance_meters >= 30000) {
    return 'recovery';
  }
  return 'build';
}

// ── Public composer ──────────────────────────────────────────────────────────

export function buildForwardContext(args: {
  arc: ArcContext;
  sessionDetailV1: any;
  asOfDate: string;
}): ForwardContextV1 | null {
  const { arc, sessionDetailV1, asOfDate } = args;
  if (!sessionDetailV1?.race?.is_goal_race) return null;

  const justFinished = inferJustFinishedFromSession(sessionDetailV1, arc);
  if (!justFinished) return null;

  const nextGoal = pickNextGoalAfterRace(arc, asOfDate, justFinished.goal_id);
  const currentPhase = inferPostRacePhase(arc, justFinished);

  // Build projection line if we have everything we need.
  let projectionLine: string | null = null;
  if (
    nextGoal
    && justFinished.sport === 'run'
    && justFinished.distance_meters != null
    && justFinished.finish_seconds > 0
  ) {
    // Find the run leg of the next race (full distance for run goals, run leg for multisport).
    const nextGoalForLookup: Goal = {
      id: nextGoal.id,
      name: nextGoal.name,
      goal_type: 'event',
      target_date: nextGoal.target_date,
      sport: nextGoal.sport,
      distance: nextGoal.distance,
      priority: 'A',
      status: 'active',
      target_metric: null,
      target_value: null,
      current_value: null,
      projection: null,
      training_prefs: null,
    };
    const nextRunLegMeters = runLegMetersForGoal(nextGoalForLookup);
    if (nextRunLegMeters && nextRunLegMeters > 0) {
      const projected = projectRunTime({
        raceFinishSeconds: justFinished.finish_seconds,
        raceDistanceMeters: justFinished.distance_meters,
        targetDistanceMeters: nextRunLegMeters,
        multisportPenalty: nextGoal.is_multisport,
      });
      if (projected > 0) {
        const legLabel = nextGoal.is_multisport ? 'run leg' : 'finish';
        projectionLine = `Projected ${nextGoal.name} ${legLabel}: ~${fmtClockApprox(projected)} based on this result.`;
      }
    }
  }

  // Compose phase-aware copy.
  const eyebrow = 'What this means for future races';
  let headline = '';
  let body = '';

  const finishedDistanceCanon = canonicalRunLabel(justFinished.distance_meters);
  const negativeSplitConfirmed = hasNegativeSplitInsight(sessionDetailV1);

  // CASE A: there IS a next goal.
  if (nextGoal) {
    if (nextGoal.is_multisport) {
      // Just ran a stand-alone race; next race is a tri/du.
      const confirmer = negativeSplitConfirmed
        ? 'Run fitness is confirmed — a negative split on this effort is a strong signal.'
        : `Run fitness is locked in from this ${finishedDistanceCanon ?? 'race'}.`;
      headline = `Run leg at ${nextGoal.name} is your weapon.`;
      body = `${confirmer} Focus shifts to bike and swim now — the run is the leg you can rely on. ${nextGoal.weeks_until} ${nextGoal.weeks_until === 1 ? 'week' : 'weeks'} to ${nextGoal.name}.`;
    } else if (currentPhase === 'recovery') {
      headline = `Recovery first, then ${nextGoal.name}.`;
      body = `Easy aerobic work only this week — no quality sessions until load normalizes. Then ${nextGoal.weeks_until} ${nextGoal.weeks_until === 1 ? 'week' : 'weeks'} to build for ${nextGoal.name}.`;
    } else {
      // Same-discipline next race in build/maintenance.
      headline = `On track for ${nextGoal.name}.`;
      const confirmer = negativeSplitConfirmed
        ? 'A controlled negative split on this effort is a strong signal.'
        : `Today's ${finishedDistanceCanon ?? 'race'} is the floor we build from.`;
      body = `${confirmer} ${nextGoal.weeks_until} ${nextGoal.weeks_until === 1 ? 'week' : 'weeks'} to ${nextGoal.name} — train through it, sharpen as you go.`;
    }
  } else {
    // CASE B: no next goal queued.
    if (currentPhase === 'recovery') {
      headline = 'Recovery first.';
      body = 'Easy aerobic work only this week. When the body feels itself again, set your next race — your fitness is real and ready to be aimed at something.';
    } else {
      headline = 'Fitness is real. Aim it.';
      body = 'No next race set. Pick the season target now while this fitness is fresh — you have a hard floor to build from.';
    }
  }

  return {
    eyebrow,
    headline,
    body,
    projection_line: projectionLine,
    next_goal: nextGoal,
    current_phase: currentPhase,
  };
}

// ── Helpers shared across the module ─────────────────────────────────────────

function canonicalRunLabel(distanceMeters: number | null): string | null {
  if (distanceMeters == null) return null;
  if (distanceMeters >= 41000 && distanceMeters <= 43500) return 'marathon';
  if (distanceMeters >= 20500 && distanceMeters <= 21500) return 'half marathon';
  if (distanceMeters >= 9500 && distanceMeters <= 10500) return '10K';
  if (distanceMeters >= 4500 && distanceMeters <= 5500) return '5K';
  if (distanceMeters >= 49000 && distanceMeters <= 51000) return '50K';
  return null;
}

function hasNegativeSplitInsight(sessionDetailV1: any): boolean {
  const insights: Array<{ label?: unknown; value?: unknown }> = Array.isArray(sessionDetailV1?.adherence?.technical_insights)
    ? sessionDetailV1.adherence.technical_insights
    : [];
  for (const row of insights) {
    const v = String(row?.value ?? '').toLowerCase();
    if (v.includes('negative split')) return true;
  }
  const debrief = String(sessionDetailV1?.race_debrief_text ?? '').toLowerCase();
  if (debrief.includes('negative split')) return true;
  const narrative = String(sessionDetailV1?.narrative_text ?? '').toLowerCase();
  if (narrative.includes('negative split')) return true;
  return false;
}

// Re-export distance helpers used by tests (if any).
export const __test = {
  runLegMetersForGoal,
  isMultisportGoal,
  projectRunTime,
  fmtClockApprox,
  canonicalRunLabel,
};
