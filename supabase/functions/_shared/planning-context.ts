/**
 * Shared training context for plan generation (generate-run-plan, wizard, goal flow).
 * Reads athlete_snapshot rows + ended-plan tombstones so starting volume matches reality.
 */
import type { CompletedEvent } from './arc-context.ts';

export type TrainingTransitionMode =
  | 'peak_bridge'
  | 'recovery_rebuild'
  | 'fresh_build'
  | 'fitness_maintenance';

export interface TrainingTransition {
  mode: TrainingTransitionMode;
  reasoning: string;
  peak_long_run_miles?: number;
  weeks_since_last_plan?: number;
}

export interface RunPlanningContext {
  transition: TrainingTransition;
  /** Rough weekly miles from latest snapshot run discipline load (same heuristic as goal flow). */
  current_weekly_miles?: number;
  recent_long_run_miles?: number;
  weeks_since_peak_long_run?: number;
  current_acwr?: number;
  volume_trend?: 'building' | 'holding' | 'declining';
}

export function classifyTrainingTransition(opts: {
  recentEndedPlans: Array<{ config: Record<string, unknown> | null }> | null | undefined;
  newDiscipline: string;
  weeksOut: number | null;
}): TrainingTransition {
  const { recentEndedPlans, newDiscipline, weeksOut } = opts;
  const tombstone = (recentEndedPlans?.[0]?.config as Record<string, unknown> | undefined)?.tombstone as
    | Record<string, unknown>
    | undefined;

  if (!tombstone) {
    return { mode: 'fresh_build', reasoning: 'No previous plan history found — building from current fitness.' };
  }

  const endedAt = tombstone.ended_at ? new Date(String(tombstone.ended_at)) : null;
  const weeksSinceEnd = endedAt
    ? Math.floor((Date.now() - endedAt.getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 999;

  const completionPct = Number(tombstone.completion_pct ?? 0);
  const peakLongRun = Number(tombstone.peak_long_run_miles ?? 0);
  const prevDiscipline = String(tombstone.discipline ?? 'run').toLowerCase();
  const sameDiscipline = prevDiscipline === newDiscipline.toLowerCase();

  const wOut = weeksOut ?? 999;

  if (
    sameDiscipline &&
    completionPct >= 40 &&
    peakLongRun >= 14 &&
    weeksSinceEnd <= 3 &&
    wOut <= 12
  ) {
    return {
      mode: 'peak_bridge',
      reasoning: `You ended your ${String(tombstone.goal_name || 'previous plan')} at week ${tombstone.weeks_completed}/${tombstone.total_weeks} with a ${peakLongRun}-mile long run ${weeksSinceEnd <= 0 ? 'this week' : `${weeksSinceEnd} week${weeksSinceEnd === 1 ? '' : 's'} ago`}. Your fitness is at or near peak — bridging into ${wOut}-week taper.`,
      peak_long_run_miles: peakLongRun,
      weeks_since_last_plan: weeksSinceEnd,
    };
  }

  if (sameDiscipline && completionPct >= 20 && weeksSinceEnd > 3 && weeksSinceEnd <= 12) {
    return {
      mode: 'recovery_rebuild',
      reasoning: `Your last ${String(tombstone.goal_name || 'plan')} ended ${weeksSinceEnd} weeks ago at ${completionPct}% completion. Rebuilding conservatively from current fitness.`,
      peak_long_run_miles: peakLongRun,
      weeks_since_last_plan: weeksSinceEnd,
    };
  }

  return {
    mode: 'fresh_build',
    reasoning: weeksSinceEnd > 12
      ? `Last training block was ${weeksSinceEnd} weeks ago — treating as a fresh build.`
      : 'Building from current fitness.',
  };
}

/** Heuristic long-run miles from a completed event when snapshots/tombstones are missing. */
export function recentLongRunMilesFromCompletedEvent(distance: string, sport: string): number {
  const d = (distance || '').toLowerCase();
  const s = (sport || '').toLowerCase();
  if (d.includes('marathon') && !d.includes('half') && !d.includes('70')) return 26.2;
  if (d.includes('half') || d.includes('13.1') || d.includes('21k') || d.includes('half marathon')) return 13.1;
  if (d.includes('70.3') || d.includes('half iron') || s.includes('tri')) return 16;
  if (d.includes('ironman') || d.includes('140.6')) return s.includes('tri') ? 18 : 26.2;
  if (d.includes('ultra') || d.includes('50k')) return 20;
  return 16;
}

/**
 * A recent run or tri finish (from Arc `recent_completed_events`) should start the next
 * run/tri plan in `recovery_rebuild` with the race treated as the long-run peak.
 */
export function findPostRaceRecoveryContext(
  events: CompletedEvent[] | null | undefined,
  newGoalSport: string,
):
  | {
      apply: true;
      event: CompletedEvent;
      recentLongRunMilesHint: number;
      reasoning: string;
    }
  | { apply: false } {
  const goal = (newGoalSport || '').toLowerCase();
  if (!['run', 'tri', 'triathlon'].includes(goal)) return { apply: false };
  if (!events?.length) return { apply: false };
  for (const e of events) {
    if (e.days_ago >= 21) continue;
    const s = (e.sport || '').toLowerCase();
    if (s === 'run' || s.includes('tri')) {
      const hint = recentLongRunMilesFromCompletedEvent(e.distance, e.sport);
      return {
        apply: true,
        event: e,
        recentLongRunMilesHint: hint,
        reasoning: `Recent race "${e.name}" (${e.days_ago}d ago) — starting in recovery rebuild from event peak.`,
      };
    }
  }
  return { apply: false };
}

/**
 * Pure: same inputs the goal flow already loads in one Promise.all.
 */
export function computeRunPlanningSignals(
  baseline: Record<string, unknown> | null | undefined,
  recentSnapshots: Array<Record<string, unknown>> | null | undefined,
  recentEndedPlans: Array<{ config: Record<string, unknown> | null }> | null | undefined,
  opts: {
    newDiscipline: string;
    weeksOut?: number | null;
  },
): RunPlanningContext {
  const newDiscipline = (opts.newDiscipline || 'run').toLowerCase();
  const weeksOut = opts.weeksOut ?? null;

  const snapshot = recentSnapshots?.[0] ?? null;
  const transition = classifyTrainingTransition({
    recentEndedPlans,
    newDiscipline,
    weeksOut,
  });

  const current_weekly_miles = snapshot?.workload_by_discipline &&
      typeof (snapshot.workload_by_discipline as any)?.run === 'number'
    ? Math.round(Number((snapshot.workload_by_discipline as any).run) / 10)
    : undefined;

  let recent_long_run_miles: number | undefined;
  let weeks_since_peak_long_run: number | undefined;
  let current_acwr: number | undefined;
  let volume_trend: 'building' | 'holding' | 'declining' | undefined;

  if (transition.peak_long_run_miles && transition.peak_long_run_miles > 0) {
    recent_long_run_miles = transition.peak_long_run_miles;
  }

  if (recentSnapshots && recentSnapshots.length > 0) {
    const easyPaceSecPerMile: number = (baseline as any)?.effort_paces?.base ?? 600;
    const snapshotsWithLongRun = recentSnapshots
      .map((s: any, idx: number) => ({
        duration: s.run_long_run_duration as number | null,
        weeksAgo: idx,
      }))
      .filter((s): s is { duration: number; weeksAgo: number } => s.duration != null && s.duration > 0);

    if (snapshotsWithLongRun.length > 0) {
      const peakSnapshot = snapshotsWithLongRun.reduce((best, s) => (s.duration > best.duration ? s : best));
      const snapshotLongRun = Math.round((peakSnapshot.duration * 60 / easyPaceSecPerMile) * 10) / 10;

      if (!recent_long_run_miles || snapshotLongRun > recent_long_run_miles) {
        recent_long_run_miles = snapshotLongRun;
      }
      weeks_since_peak_long_run = peakSnapshot.weeksAgo;
    }

    const latestAcwr = recentSnapshots[0]?.acwr;
    if (latestAcwr != null && Number.isFinite(Number(latestAcwr))) {
      current_acwr = Number(latestAcwr);
    }

    if (recentSnapshots.length >= 2) {
      const newest = Number(recentSnapshots[0]?.workload_total ?? 0);
      const oldest = Number(recentSnapshots[recentSnapshots.length - 1]?.workload_total ?? 0);
      if (oldest > 0) {
        const pct = (newest - oldest) / oldest;
        volume_trend = pct > 0.10 ? 'building' : pct < -0.10 ? 'declining' : 'holding';
      }
    }
  }

  return {
    transition,
    ...(current_weekly_miles != null && current_weekly_miles > 0 ? { current_weekly_miles } : {}),
    ...(recent_long_run_miles != null ? { recent_long_run_miles } : {}),
    ...(weeks_since_peak_long_run != null ? { weeks_since_peak_long_run } : {}),
    ...(current_acwr != null ? { current_acwr } : {}),
    ...(volume_trend ? { volume_trend } : {}),
  };
}

export async function buildRunPlanningContext(
  supabase: { from: (t: string) => any },
  userId: string,
  opts: {
    newDiscipline: string;
    weeksOut?: number | null;
  },
): Promise<RunPlanningContext> {
  const [{ data: baseline }, { data: recentSnapshots }, { data: recentEndedPlans }] = await Promise.all([
    supabase.from('user_baselines').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('athlete_snapshot')
      .select('week_start, run_long_run_duration, acwr, workload_total, workload_by_discipline')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(8),
    supabase
      .from('plans')
      .select('id, config, duration_weeks, created_at')
      .eq('user_id', userId)
      .in('status', ['ended', 'completed'])
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  return computeRunPlanningSignals(baseline, recentSnapshots, recentEndedPlans, opts);
}
