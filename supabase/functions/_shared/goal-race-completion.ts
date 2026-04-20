/**
 * Detect when a completed workout is the user's goal race (e.g. marathon on target_date).
 * Used by analyze-running-workout to switch narratives from training-week framing to race performance.
 */

export interface GoalRaceCompletionMatch {
  matched: boolean;
  goalId?: string;
  /** goals.name — e.g. "Ojai Valley Marathon" */
  eventName: string;
  targetDate?: string | null;
  distanceKey?: string | null;
  /** From goals.target_time — the plan's goal finish time (seconds) */
  goalTimeSeconds?: number | null;
  /** Snapshot from goals.race_readiness_projection — fitness-based projection at last coach run */
  fitnessProjectionSeconds?: number | null;
  fitnessProjectionDisplay?: string | null;
}

function normDate(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  return iso.slice(0, 10);
}

function isMarathonGoalDistance(distance: string | null | undefined): boolean {
  if (!distance || typeof distance !== 'string') return false;
  const d = distance.toLowerCase().trim();
  if (d.includes('marathon')) return true;
  if (d === '42k' || d === '42.2k' || d.startsWith('42')) return true;
  if (d.includes('26.2')) return true;
  if (d.includes('ultra')) return false;
  return false;
}

/** Workout distance in meters (from computed.overall.distance_m or distance km). */
function workoutDistanceMeters(workout: { distance?: number | null; computed?: { overall?: { distance_m?: number | null } } }): number | null {
  const dm = Number(workout?.computed?.overall?.distance_m);
  if (Number.isFinite(dm) && dm > 0) return dm;
  const km = Number(workout?.distance);
  if (Number.isFinite(km) && km > 0) return km * 1000;
  return null;
}

/**
 * True when recorded distance is in the marathon range (includes GPS variance).
 */
export function isMarathonDistanceMeters(m: number | null): boolean {
  if (m == null || !Number.isFinite(m)) return false;
  return m >= 40_000 && m <= 44_800;
}

/**
 * Fetch active/completed event goal whose target_date matches the workout calendar day
 * and distance indicates marathon, and workout distance is marathon-length.
 */
export async function fetchGoalRaceCompletionForWorkout(
  supabase: any,
  userId: string,
  workout: { date?: string | null; type?: string | null; distance?: number | null; computed?: { overall?: { distance_m?: number | null } } },
): Promise<GoalRaceCompletionMatch> {
  const workoutDay = normDate(workout?.date ?? null);
  const distM = workoutDistanceMeters(workout);
  const sport = String(workout?.type || '').toLowerCase();
  const isRun = sport === 'run' || sport === 'running' || sport === '';
  if (!workoutDay || !isRun || !isMarathonDistanceMeters(distM)) {
    return { matched: false, eventName: '' };
  }

  try {
    // Fetch core match fields first; projection data fetched separately to avoid
    // a missing-column error silently killing the entire race detection.
    const { data: rows, error } = await supabase
      .from('goals')
      .select('id, name, target_date, distance, sport, goal_type, status, priority, target_time')
      .eq('user_id', userId)
      .eq('goal_type', 'event')
      .not('target_date', 'is', null);

    if (error) {
      console.error('[goal-race-completion] goals query error:', error.message);
      return { matched: false, eventName: '' };
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return { matched: false, eventName: '' };
    }

    // Allow ±1 day tolerance — race recording date and goal target_date often differ by one day.
    const workoutDateMs = new Date(workoutDay + 'T00:00:00Z').getTime();
    const candidates = rows.filter((g: any) => {
      const gDay = normDate(g.target_date);
      if (!gDay) return false;
      if (!isMarathonGoalDistance(g.distance)) return false;
      const diff = Math.abs(new Date(gDay + 'T00:00:00Z').getTime() - workoutDateMs);
      return diff <= 86_400_000; // within 1 day
    });

    if (candidates.length === 0) {
      return { matched: false, eventName: '' };
    }

    const rank = (p: string) => ({ A: 0, B: 1, C: 2 }[p] ?? 3);
    candidates.sort((a: any, b: any) => rank(String(a.priority || 'C')) - rank(String(b.priority || 'C')));

    const g = candidates[0];

    // Projection is opportunistic — fetch separately so a missing column never blocks race detection.
    let fitnessProjectionSeconds: number | null = null;
    let fitnessProjectionDisplay: string | null = null;
    try {
      const { data: projRow } = await supabase
        .from('goals')
        .select('race_readiness_projection')
        .eq('id', g.id)
        .single();
      const rrp = projRow?.race_readiness_projection ?? null;
      fitnessProjectionSeconds = rrp?.predicted_finish_time_seconds != null ? Number(rrp.predicted_finish_time_seconds) : null;
      fitnessProjectionDisplay = rrp?.predicted_finish_display ?? null;
    } catch { /* projection unavailable — continue without it */ }

    return {
      matched: true,
      goalId: String(g.id),
      eventName: String(g.name || 'Race').trim() || 'Race',
      targetDate: g.target_date ?? null,
      distanceKey: g.distance != null ? String(g.distance) : null,
      goalTimeSeconds: g.target_time != null ? Number(g.target_time) : null,
      fitnessProjectionSeconds,
      fitnessProjectionDisplay,
    };
  } catch {
    return { matched: false, eventName: '' };
  }
}
