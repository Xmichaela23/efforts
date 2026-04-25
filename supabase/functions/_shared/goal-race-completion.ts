/**
 * Detect when a completed workout is the user's goal race (e.g. marathon on target_date).
 * Used by analyze-running-workout to switch narratives from training-week framing to race performance.
 *
 * Single source of truth hierarchy (highest → lowest):
 *  PATH 0: coach_cache.payload.race_finish_projection_v1 — coach is the brain; has goal_id,
 *          race date, all projection numbers already computed.
 *  PATH 1: plans table — plan.config.race_date + plan.goal_id for direct goal lookup.
 *  PATH 2: goals table — direct query by goal_type='event' + target_date.
 */

export interface GoalRaceCompletionMatch {
  matched: boolean;
  goalId?: string;
  /** goals.name — e.g. "Ojai Valley Marathon" */
  eventName: string;
  targetDate?: string | null;
  distanceKey?: string | null;
  /** From goals.target_time or coach_cache plan_goal_seconds */
  goalTimeSeconds?: number | null;
  /** Server VDOT-based projection from coach_cache.race_finish_projection_v1.fitness_projection_seconds */
  fitnessProjectionSeconds?: number | null;
  fitnessProjectionDisplay?: string | null;
}

function normDate(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  return iso.slice(0, 10);
}

function workoutDistanceMeters(workout: { distance?: number | null; computed?: { overall?: { distance_m?: number | null } } }): number | null {
  const dm = Number(workout?.computed?.overall?.distance_m);
  if (Number.isFinite(dm) && dm > 0) return dm;
  const km = Number(workout?.distance);
  if (Number.isFinite(km) && km > 0) return km * 1000;
  return null;
}

export function isMarathonDistanceMeters(m: number | null): boolean {
  if (m == null || !Number.isFinite(m)) return false;
  return m >= 40_000 && m <= 44_800;
}

export async function fetchGoalRaceCompletionForWorkout(
  supabase: any,
  userId: string,
  workout: { date?: string | null; type?: string | null; distance?: number | null; computed?: { overall?: { distance_m?: number | null } } },
): Promise<GoalRaceCompletionMatch> {
  const workoutDay = normDate(workout?.date ?? null);
  const distM = workoutDistanceMeters(workout);
  const sport = String(workout?.type || '').toLowerCase();
  const isRun = sport === 'run' || sport === 'running' || sport === '';

  console.log(`[goal-race-completion] workoutDay=${workoutDay} distM=${distM} isRun=${isRun} isMarathon=${isMarathonDistanceMeters(distM)}`);

  if (!workoutDay || !isRun || !isMarathonDistanceMeters(distM)) {
    return { matched: false, eventName: '' };
  }

  const workoutDateMs = new Date(workoutDay + 'T00:00:00Z').getTime();

  try {
    // ── PATH 0: coach_cache — single source of truth ──────────────────────────
    // The coach already resolved goal_id, race date, projected finish, and goal time.
    // Use service role so RLS never blocks this read.
    const { data: cacheRow } = await supabase
      .from('coach_cache')
      .select('payload')
      .eq('user_id', userId)
      .maybeSingle();

    const proj = cacheRow?.payload?.race_finish_projection_v1 ?? null;
    if (proj?.goal_id) {
      // Coach knows the goal — find the race date via goal or plan
      const goalId = String(proj.goal_id);

      // Fetch the goal to get its target_date and name
      const { data: g } = await supabase
        .from('goals')
        .select('id, name, target_date, distance, target_time')
        .eq('id', goalId)
        .maybeSingle();

      // Determine the authoritative race date: prefer goal.target_date, then look in plans
      let raceDate: string | null = normDate(g?.target_date);

      if (!raceDate) {
        // goal.target_date is null — look it up from the linked plan's config.
        // Include 'ended' / 'paused' so debriefs still resolve after complete-race
        // transitions the plan to 'ended'.
        const { data: planRow } = await supabase
          .from('plans')
          .select('config')
          .eq('goal_id', goalId)
          .eq('user_id', userId)
          .in('status', ['active', 'paused', 'completed', 'ended'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        raceDate = normDate(planRow?.config?.race_date ?? planRow?.config?.raceDate ?? null);
      }

      console.log(`[goal-race-completion] PATH0: goal_id=${goalId} name=${g?.name} raceDate=${raceDate} workoutDay=${workoutDay}`);

      if (raceDate) {
        const diff = Math.abs(new Date(raceDate + 'T00:00:00Z').getTime() - workoutDateMs);
        if (diff <= 86_400_000) {
          console.log(`[goal-race-completion] PATH0 MATCH: diff=${diff}ms`);
          return {
            matched: true,
            goalId,
            eventName: String(g?.name || 'Race').trim() || 'Race',
            targetDate: raceDate,
            distanceKey: g?.distance != null ? String(g.distance) : null,
            // Plan goal time from coach projection (source of truth), fall back to goals.target_time
            goalTimeSeconds: proj.plan_goal_seconds != null
              ? Number(proj.plan_goal_seconds)
              : g?.target_time != null ? Number(g.target_time) : null,
            // Fitness projection from coach's VDOT computation
            fitnessProjectionSeconds: proj.fitness_projection_seconds != null
              ? Number(proj.fitness_projection_seconds)
              : null,
            fitnessProjectionDisplay: proj.fitness_projection_display ?? null,
          };
        }
      }
    }

    // ── PATH 1: plans table — race_date + goal_id ─────────────────────────────
    // Include 'ended' / 'paused' so the debrief still finds the linked plan
    // (and therefore the projection) after complete-race ends the plan.
    const { data: plans, error: plansError } = await supabase
      .from('plans')
      .select('id, goal_id, config')
      .eq('user_id', userId)
      .in('status', ['active', 'paused', 'completed', 'ended'])
      .order('updated_at', { ascending: false })
      .limit(5);

    if (!plansError && Array.isArray(plans)) {
      for (const plan of plans) {
        const raceDate = normDate(plan.config?.race_date ?? plan.config?.raceDate ?? null);
        if (!raceDate) continue;
        const diff = Math.abs(new Date(raceDate + 'T00:00:00Z').getTime() - workoutDateMs);
        if (diff > 86_400_000) continue;

        // Race date matches. Try to get the goal via goal_id first.
        let g: any = null;
        if (plan.goal_id) {
          const { data: gRow } = await supabase
            .from('goals')
            .select('id, name, target_date, distance, target_time, race_readiness_projection')
            .eq('id', plan.goal_id)
            .maybeSingle();
          g = gRow;
        }

        // Fall back: search goals by user + event type + date even without goal_id link
        if (!g) {
          const { data: gRows } = await supabase
            .from('goals')
            .select('id, name, target_date, distance, target_time, race_readiness_projection')
            .eq('user_id', userId)
            .eq('goal_type', 'event');
          // pick any goal whose target_date matches, or just take the first event goal
          g = (gRows ?? []).find((r: any) => {
            const d = normDate(r.target_date);
            return d && Math.abs(new Date(d + 'T00:00:00Z').getTime() - workoutDateMs) <= 86_400_000;
          }) ?? (gRows ?? [])[0] ?? null;
        }

        // Even if no goal row, synthesize from plan config — plan is enough to confirm this is the race
        const eventName = g?.name ?? plan.config?.race_name ?? plan.name ?? 'Race';
        const goalId = g?.id ? String(g.id) : undefined;
        const rrp = g?.race_readiness_projection ?? null;

        // Goal time: goal.target_time → plan.config.target_time → plan.config.target_finish_time_seconds
        const goalTimeSeconds =
          g?.target_time != null ? Number(g.target_time) :
          plan.config?.target_time != null ? Number(plan.config.target_time) :
          plan.config?.target_finish_time_seconds != null ? Number(plan.config.target_finish_time_seconds) :
          null;

        // Fitness projection: goal.race_readiness_projection → coach_cache.race_finish_projection_v1
        // (coach cache may have been computed pre-race even if race_finish_projection_v1.goal_id now differs)
        const cachedProj = cacheRow?.payload?.race_finish_projection_v1 ?? null;
        const fitnessProjectionSeconds =
          rrp?.predicted_finish_time_seconds != null ? Number(rrp.predicted_finish_time_seconds) :
          cachedProj?.fitness_projection_seconds != null ? Number(cachedProj.fitness_projection_seconds) :
          null;
        const fitnessProjectionDisplay =
          rrp?.predicted_finish_display ??
          cachedProj?.fitness_projection_display ??
          null;

        console.log(`[goal-race-completion] PATH1 MATCH via plan ${plan.id}: goal=${goalId} name=${eventName} raceDate=${raceDate} goalTime=${goalTimeSeconds} fitnessProj=${fitnessProjectionSeconds}`);

        return {
          matched: true,
          goalId,
          eventName: String(eventName).trim() || 'Race',
          targetDate: g?.target_date ?? raceDate,
          distanceKey: g?.distance != null ? String(g.distance) : null,
          goalTimeSeconds,
          fitnessProjectionSeconds,
          fitnessProjectionDisplay,
        };
      }
    }

    // ── PATH 2: direct goals query ────────────────────────────────────────────
    const { data: rows, error: goalsError } = await supabase
      .from('goals')
      .select('id, name, target_date, distance, target_time')
      .eq('user_id', userId)
      .eq('goal_type', 'event')
      .not('target_date', 'is', null);

    if (goalsError) {
      console.error('[goal-race-completion] goals query error:', goalsError.message);
      return { matched: false, eventName: '' };
    }

    console.log(`[goal-race-completion] PATH2: ${rows?.length ?? 0} event goals`);

    const candidates = (rows ?? []).filter((g: any) => {
      const gDay = normDate(g.target_date);
      if (!gDay) return false;
      const diff = Math.abs(new Date(gDay + 'T00:00:00Z').getTime() - workoutDateMs);
      return diff <= 86_400_000;
    });

    if (candidates.length === 0) return { matched: false, eventName: '' };

    const rank = (p: string) => ({ A: 0, B: 1, C: 2 }[p] ?? 3);
    candidates.sort((a: any, b: any) => rank(String(a.priority || 'C')) - rank(String(b.priority || 'C')));
    const g = candidates[0];

    let fitnessProjectionSeconds: number | null = null;
    let fitnessProjectionDisplay: string | null = null;
    try {
      const { data: pr } = await supabase.from('goals').select('race_readiness_projection').eq('id', g.id).single();
      const rrp = pr?.race_readiness_projection ?? null;
      fitnessProjectionSeconds = rrp?.predicted_finish_time_seconds != null ? Number(rrp.predicted_finish_time_seconds) : null;
      fitnessProjectionDisplay = rrp?.predicted_finish_display ?? null;
    } catch { /* optional */ }

    console.log(`[goal-race-completion] PATH2 MATCH: goal=${g.id} name=${g.name}`);
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

  } catch (e) {
    console.error('[goal-race-completion] unexpected error:', e);
    return { matched: false, eventName: '' };
  }
}
