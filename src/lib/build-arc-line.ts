/**
 * Home one-liner copy from ArcContext (phase + next goal). Server orders active_goals by target_date.
 */

export type ArcIdentity = {
  current_phase?: unknown;
};

export type ArcGoalLite = {
  name?: unknown;
  target_date?: string | null;
};

export type ArcForHomeLine = {
  athlete_identity?: ArcIdentity | Record<string, unknown> | null;
  active_goals?: ArcGoalLite[] | null;
  active_plan?: { phase?: string | null; plan_phase?: string | null } | null;
};

function daysUntil(targetDate: string | null | undefined): number | null {
  if (targetDate == null || String(targetDate).trim() === '') return null;
  const d = new Date(String(targetDate).slice(0, 10) + 'T12:00:00');
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return (target - today) / 86400000;
}

function capitalizePhase(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param arc — full get-arc-context payload; null if fetch failed or not loaded
 */
export function buildArcLine(arc: ArcForHomeLine | null | undefined): string {
  if (!arc || typeof arc !== 'object') return '';

  // Only show CTA if there are no active goals
  if (!Array.isArray(arc.active_goals) || arc.active_goals.length === 0) {
    return 'Set up your season →';
  }

  const id = arc.athlete_identity;
  const identity = id && typeof id === 'object' && !Array.isArray(id) ? (id as ArcIdentity) : null;
  const phaseRaw = identity?.current_phase ?? 'training';
  const phase = typeof phaseRaw === 'string' ? phaseRaw.toLowerCase() : 'training';

  const nextGoal = arc.active_goals[0];
  const goalName = nextGoal && typeof nextGoal.name === 'string' && nextGoal.name.trim() ? nextGoal.name.trim() : '';

  let weeksOut: number | null = null;
  if (nextGoal?.target_date != null) {
    const days = daysUntil(String(nextGoal.target_date));
    if (days != null && days >= 0) {
      weeksOut = Math.round(days / 7);
    }
  }

  if (phase === 'recovery') {
    return weeksOut != null && goalName
      ? `Recovery · ${goalName} in ${weeksOut} weeks`
      : 'Recovery';
  }

  if (phase === 'build') {
    return weeksOut != null && goalName
      ? `Build · ${goalName} in ${weeksOut} weeks`
      : 'Build block';
  }

  const label = phase ? capitalizePhase(phase) : 'Training';
  return weeksOut != null && goalName ? `${label} · ${goalName} in ${weeksOut} weeks` : label;
}

/** True when the home line is the season CTA (tappable → /goals). */
export function arcLineNeedsGoalsSetup(arc: ArcForHomeLine | null | undefined): boolean {
  if (!arc || typeof arc !== 'object') return false;
  return !Array.isArray(arc.active_goals) || arc.active_goals.length === 0;
}
