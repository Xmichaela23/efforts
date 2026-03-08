import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  getLatestAthleteMemory,
  resolveAdaptiveMarathonDecisionFromMemory,
  resolveMarathonMinWeeksFromMemory,
} from '../_shared/athlete-memory.ts';

type GoalAction = 'keep' | 'replace';
type RequestMode = 'create' | 'build_existing' | 'link_existing';

interface CreateGoalRequest {
  user_id: string;
  mode?: RequestMode;
  action?: GoalAction;
  existing_goal_id?: string | null;
  replace_goal_id?: string | null;
  replace_plan_id?: string | null;
  plan_id?: string | null;
  goal?: {
    name: string;
    target_date: string;
    sport: string;
    distance: string | null;
    training_prefs: Record<string, any>;
    notes?: string | null;
  };
}

class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DISTANCE_TO_API: Record<string, string> = {
  '5K': '5k',
  '10K': '10k',
  'Half Marathon': 'half',
  Marathon: 'marathon',
  Ultra: 'marathon',
};

// Triathlon distance label → generate-triathlon-plan distance key
const TRI_DISTANCE_TO_API: Record<string, string> = {
  'Sprint': 'sprint',
  'sprint': 'sprint',
  'Olympic': 'olympic',
  'olympic': 'olympic',
  '70.3': '70.3',
  'Half-Iron': '70.3',
  'Half Iron': '70.3',
  'half-iron': '70.3',
  'Ironman': 'ironman',
  'ironman': 'ironman',
  'Full': 'ironman',
  'full': 'ironman',
};

const TRI_MIN_WEEKS: Record<string, Record<string, number>> = {
  sprint:  { beginner: 8,  intermediate: 6,  advanced: 6  },
  olympic: { beginner: 10, intermediate: 8,  advanced: 8  },
  '70.3':  { beginner: 14, intermediate: 12, advanced: 10 },
  ironman: { beginner: 20, intermediate: 18, advanced: 16 },
};

const MIN_WEEKS: Record<string, Record<string, number>> = {
  marathon: { beginner: 14, intermediate: 10, advanced: 8 },
  half: { beginner: 8, intermediate: 4, advanced: 4 },
  '10k': { beginner: 4, intermediate: 4, advanced: 4 },
  '5k': { beginner: 4, intermediate: 4, advanced: 4 },
};
const ADAPTIVE_MARATHON_DECISIONS_ENABLED = (Deno.env.get('ADAPTIVE_MARATHON_DECISIONS_ENABLED') ?? 'true') !== 'false';

function weeksBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

// How many weeks of plan do we need to cover a future race date?
// Uses ceil so a race on day 48 (6.857 weeks) counts as 7 plan weeks,
// placing the race correctly in the final week rather than one week past it.
function weeksUntilRace(today: Date, raceDate: Date): number {
  const ms = raceDate.getTime() - today.getTime();
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
}

function distanceToApiValue(distance: string | null): string {
  if (!distance) return '';
  return DISTANCE_TO_API[distance] || String(distance).toLowerCase();
}

function isMarathonDistance(distance: string | null | undefined): boolean {
  return String(distance || '').trim().toLowerCase() === 'marathon';
}

function currentWeekMondayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function invokeFunction(functionsBaseUrl: string, serviceKey: string, name: string, body: Record<string, any>) {
  const resp = await fetch(`${functionsBaseUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  let payload: any = null;
  try {
    payload = await resp.json();
  } catch {
    payload = null;
  }

  if (!resp.ok) {
    const detail = payload?.error || payload?.message || `${name} failed (${resp.status})`;
    throw new AppError('downstream_function_failed', detail, 400);
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const functionsBaseUrl = `${supabaseUrl}/functions/v1`;
  const supabase = createClient(supabaseUrl, serviceKey);

  let createdGoalId: string | null = null;
  let createdPlanId: string | null = null;

  try {
    const payload = (await req.json()) as CreateGoalRequest;
    const { user_id, mode = 'create', action, existing_goal_id, replace_goal_id, replace_plan_id, plan_id, goal, plan_start_date } = payload || ({} as CreateGoalRequest);

    if (!user_id) throw new AppError('missing_user_id', 'user_id required');
    if (!['create', 'build_existing', 'link_existing'].includes(mode)) throw new AppError('invalid_mode', 'mode must be create, build_existing, or link_existing');
    if (mode === 'link_existing') {
      if (!existing_goal_id || !plan_id) throw new AppError('missing_link_params', 'existing_goal_id and plan_id are required');
      const { data: goalRow, error: goalErr } = await supabase
        .from('goals')
        .select('id,user_id,goal_type,status')
        .eq('id', existing_goal_id)
        .eq('user_id', user_id)
        .maybeSingle();
      if (goalErr || !goalRow) throw new AppError('goal_not_found', goalErr?.message || 'Goal not found', 404);
      if (goalRow.goal_type !== 'event') throw new AppError('invalid_goal_type', 'Only event goals can be linked to generated plans');

      const { error: planLinkErr } = await supabase
        .from('plans')
        .update({ goal_id: existing_goal_id })
        .eq('id', plan_id)
        .eq('user_id', user_id);
      if (planLinkErr) throw new AppError('plan_link_failed', planLinkErr.message);

      return new Response(
        JSON.stringify({ success: true, mode: 'link_existing', goal_id: existing_goal_id, plan_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (mode === 'create') {
      if (!goal?.name || !goal?.target_date || !goal?.sport) throw new AppError('missing_goal_fields', 'goal name, target_date, and sport are required');
      if (!action || !['keep', 'replace'].includes(action)) throw new AppError('invalid_action', 'action must be keep or replace');
      if (String(goal.sport || '').toLowerCase() === 'run' && !goal.distance) {
        throw new AppError('missing_distance', 'Select a race distance to build a plan.');
      }

      // Keep-mode marathon spacing is now adaptive and memory-driven later in flow.
    } else if (!existing_goal_id) {
      throw new AppError('missing_goal_id', 'existing_goal_id required for build_existing mode');
    }

    let resolvedGoal = goal || null;
    if (mode === 'build_existing') {
      const { data: existingGoal, error: existingGoalErr } = await supabase
        .from('goals')
        .select('*')
        .eq('id', existing_goal_id)
        .eq('user_id', user_id)
        .maybeSingle();
      if (existingGoalErr || !existingGoal) throw new AppError('goal_not_found', existingGoalErr?.message || 'Goal not found', 404);
      if (existingGoal.goal_type !== 'event') throw new AppError('invalid_goal_type', 'Only event goals can auto-build');
      if ((existingGoal.status || 'active') !== 'active') throw new AppError('goal_not_active', 'Goal must be active to build a plan');
      if (String(existingGoal.sport || '').toLowerCase() === 'run' && !existingGoal.distance) {
        throw new AppError('missing_distance', 'Set a race distance on this goal before building a plan.');
      }
      resolvedGoal = {
        name: existingGoal.name,
        target_date: existingGoal.target_date,
        sport: existingGoal.sport,
        distance: existingGoal.distance,
        training_prefs: existingGoal.training_prefs || {},
        notes: existingGoal.notes || null,
      };
    }

    const sport = String(resolvedGoal?.sport || '').toLowerCase();
    const isTri = sport === 'triathlon' || sport === 'tri';

    if (!['run', 'triathlon', 'tri'].includes(sport)) {
      throw new AppError('unsupported_sport', `Auto-build is not yet supported for "${sport}" goals. Supported: run, triathlon.`);
    }

    const fitness = String(resolvedGoal?.training_prefs?.fitness || '').toLowerCase();
    const goalType = String(resolvedGoal?.training_prefs?.goal_type || '').toLowerCase();
    if (!fitness || !goalType) throw new AppError('missing_training_prefs', 'Missing fitness or training goal');

    // ── Triathlon path ────────────────────────────────────────────────────
    if (isTri) {
      const triDistanceApi = TRI_DISTANCE_TO_API[String(resolvedGoal?.distance || '')] ?? null;
      if (!triDistanceApi) {
        throw new AppError('missing_distance', 'Select a triathlon distance (Sprint, Olympic, 70.3, Ironman) to build a plan.');
      }
      const triFloorWeeks = TRI_MIN_WEEKS[triDistanceApi]?.[fitness] ?? 8;
      const weeksOutTri   = weeksUntilRace(new Date(), new Date(String(resolvedGoal?.target_date || '') + 'T12:00:00'));
      if (weeksOutTri < 1)  throw new AppError('race_date_in_past', 'Race date must be in the future.');
      if (weeksOutTri < triFloorWeeks) {
        throw new AppError('race_too_close',
          `A ${triDistanceApi} triathlon for a ${fitness} athlete needs at least ${triFloorWeeks} weeks. Your race is ${weeksOutTri} weeks out.`);
      }
      const triDurationWeeks = Math.max(triFloorWeeks, Math.min(weeksOutTri, 32));

      if (mode === 'create') {
        const newGoalPriority = action === 'keep' && existing_goal_id ? 'B' : 'A';
        const { data: createdGoal, error: goalInsertErr } = await supabase
          .from('goals')
          .insert({
            user_id,
            name: String(resolvedGoal?.name || '').trim(),
            goal_type: 'event',
            target_date: resolvedGoal?.target_date,
            sport: 'triathlon',
            distance: resolvedGoal?.distance || null,
            course_profile: {},
            target_metric: null,
            target_value: null,
            current_value: null,
            priority: newGoalPriority,
            status: 'active',
            training_prefs: resolvedGoal?.training_prefs || {},
            notes: resolvedGoal?.notes || null,
          })
          .select('*')
          .single();
        if (goalInsertErr || !createdGoal) throw new AppError('goal_create_failed', goalInsertErr?.message || 'Failed to create goal');
        createdGoalId = createdGoal.id;
      } else {
        createdGoalId = existing_goal_id || null;
      }

      // Detect concurrent run plans to avoid stacking duplicate run sessions.
      // Extract which days of the week the existing run plan places runs on,
      // then pass those to the tri generator so it defers to that plan's runs.
      const { data: otherActivePlans } = await supabase
        .from('plans')
        .select('id, config, sessions_by_week')
        .eq('user_id', user_id)
        .eq('status', 'active');

      const existingRunDaySet = new Set<string>();
      for (const op of otherActivePlans || []) {
        const opSport = String(op.config?.sport || op.config?.plan_type || '').toLowerCase();
        if (!['run', 'running'].includes(opSport)) continue;
        const sbw = op.sessions_by_week;
        if (!sbw || typeof sbw !== 'object') continue;
        for (const weekSessions of Object.values(sbw)) {
          if (!Array.isArray(weekSessions)) continue;
          for (const s of weekSessions) {
            const sType = String(s?.discipline || s?.type || '').toLowerCase();
            if (sType === 'run' && s?.day) {
              existingRunDaySet.add(String(s.day));
            }
          }
        }
      }

      // Read athlete baselines for discipline seeding
      const { data: triBaseline } = await supabase.from('user_baselines').select('*').eq('user_id', user_id).maybeSingle();
      const { data: triSnapshots } = await supabase
        .from('athlete_snapshot')
        .select('week_start, workload_by_discipline, acwr, workload_total')
        .eq('user_id', user_id)
        .order('week_start', { ascending: false })
        .limit(8);

      const latestSnap = triSnapshots?.[0] ?? null;
      const triGenerateBody: Record<string, any> = {
        user_id,
        distance:         triDistanceApi,
        fitness,
        goal:             goalType === 'speed' ? 'performance' : 'complete',
        duration_weeks:   triDurationWeeks,
        race_date:        resolvedGoal?.target_date,
        race_name:        resolvedGoal?.name,
        ftp:              triBaseline?.performance_numbers?.ftp ?? undefined,
        swim_pace_per_100_sec: triBaseline?.performance_numbers?.swimPacePer100 ?? triBaseline?.swim_pace_per_100_sec ?? undefined,
        days_per_week:    resolvedGoal?.training_prefs?.days_per_week ?? undefined,
        // Triathlon plans support 0/1/2 strength days — cap UI value of 3 to 2
        strength_frequency: Math.min(2, Number(resolvedGoal?.training_prefs?.strength_frequency ?? 0)),
        ...(plan_start_date ? { start_date: plan_start_date } : {}),
        // Days already covered by a concurrent run plan — tri generator defers to those sessions
        ...(existingRunDaySet.size > 0 ? { existing_run_days: [...existingRunDaySet] } : {}),
      };

      // Seed current discipline volumes from snapshot
      if (latestSnap?.workload_by_discipline) {
        const wd = latestSnap.workload_by_discipline;
        if (wd.run)   triGenerateBody.current_weekly_run_miles   = Math.round(wd.run / 10);
        if (wd.bike)  triGenerateBody.current_weekly_bike_hours  = Math.round(wd.bike / 60 * 10) / 10;
        if (wd.swim)  triGenerateBody.current_weekly_swim_yards  = Math.round(wd.swim / 2);
      }
      if (latestSnap?.acwr != null) triGenerateBody.current_acwr = Number(latestSnap.acwr);

      const triGenerated = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-triathlon-plan', triGenerateBody);
      const triPlanId = triGenerated?.plan_id;
      if (!triPlanId) throw new AppError('plan_generation_failed', triGenerated?.error || 'Triathlon plan generation returned no plan_id');
      createdPlanId = triPlanId;

      await supabase.from('plans').update({ goal_id: createdGoalId, plan_mode: 'rolling' }).eq('id', triPlanId).eq('user_id', user_id);
      await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: triPlanId });

      // End a specific replaced plan if caller passed replace_plan_id
      if (replace_plan_id) {
        const weekStart = currentWeekMondayISO();
        await supabase.from('planned_workouts').delete().eq('training_plan_id', replace_plan_id).gte('date', weekStart);
        await supabase.from('plans').update({ status: 'ended' }).eq('id', replace_plan_id).eq('user_id', user_id);
      }

      // Cancel the replaced triathlon goal and end its linked plans (mirrors run-path replace logic)
      if (mode === 'create' && action === 'replace' && replace_goal_id) {
        await supabase
          .from('goals')
          .update({ status: 'cancelled' })
          .eq('id', replace_goal_id)
          .eq('user_id', user_id);

        const { data: linkedPlans } = await supabase
          .from('plans')
          .select('id, status')
          .eq('user_id', user_id)
          .eq('goal_id', replace_goal_id)
          .eq('status', 'active');

        for (const lp of linkedPlans || []) {
          const weekStart = currentWeekMondayISO();
          await supabase.from('planned_workouts').delete().eq('training_plan_id', lp.id).gte('date', weekStart);
          await supabase.from('plans').update({ status: 'ended' }).eq('id', lp.id).eq('user_id', user_id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, mode, goal_id: createdGoalId, plan_id: triPlanId, sport: 'triathlon', distance: triDistanceApi }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // ── End triathlon path ────────────────────────────────────────────────

    const distanceApi = distanceToApiValue(resolvedGoal?.distance || null);
    if (!distanceApi) throw new AppError('missing_distance', 'Select a race distance to build a plan.');
    const floorWeeks = MIN_WEEKS[distanceApi]?.[fitness] ?? 4;
    const weeksOut = weeksUntilRace(new Date(), new Date(String(resolvedGoal?.target_date || '') + 'T12:00:00'));
    if (weeksOut < 1) {
      throw new AppError('race_date_in_past', 'Race date must be in the future.');
    }
    let adaptiveMarathonDecision: any = null;

    const [{ data: baseline }, { data: recentSnapshots }, { data: recentEndedPlans }] = await Promise.all([
      supabase.from('user_baselines').select('*').eq('user_id', user_id).maybeSingle(),
      supabase
        .from('athlete_snapshot')
        .select('week_start, run_long_run_duration, acwr, workload_total, workload_by_discipline')
        .eq('user_id', user_id)
        .order('week_start', { ascending: false })
        .limit(8),
      // Read recent ended plans for tombstone-based transition classification
      supabase
        .from('plans')
        .select('id, config, duration_weeks, created_at')
        .eq('user_id', user_id)
        .in('status', ['ended', 'completed'])
        .order('created_at', { ascending: false })
        .limit(3),
    ]);
    // Convenience alias: most recent snapshot (used below for weeklyMiles)
    const snapshot = recentSnapshots?.[0] ?? null;

    // ── Training Transition Classification ────────────────────────────────────
    // Read tombstones from recently ended plans to understand where the athlete
    // is coming from. This drives the plan shape (taper vs build vs bridge).
    type TransitionMode = 'peak_bridge' | 'recovery_rebuild' | 'fresh_build' | 'fitness_maintenance';
    interface TrainingTransition {
      mode: TransitionMode;
      reasoning: string;
      peak_long_run_miles?: number;
      weeks_since_last_plan?: number;
    }

    function classifyTrainingTransition(): TrainingTransition {
      const tombstone = recentEndedPlans?.[0]?.config?.tombstone;

      if (!tombstone) {
        return { mode: 'fresh_build', reasoning: 'No previous plan history found — building from current fitness.' };
      }

      const endedAt = tombstone.ended_at ? new Date(tombstone.ended_at) : null;
      const weeksSinceEnd = endedAt
        ? Math.floor((new Date().getTime() - endedAt.getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 999;

      const completionPct = tombstone.completion_pct ?? 0;
      const peakLongRun = tombstone.peak_long_run_miles ?? 0;
      const prevDiscipline = tombstone.discipline ?? 'run';
      const newDiscipline = (resolvedGoal?.sport || 'run').toLowerCase();
      const sameDiscipline = prevDiscipline === newDiscipline;

      // Peak bridge: was in a build, near or at peak, same discipline, new race ≤ 12 weeks out
      if (
        sameDiscipline &&
        completionPct >= 40 &&
        peakLongRun >= 14 &&
        weeksSinceEnd <= 3 &&
        weeksOut <= 12
      ) {
        return {
          mode: 'peak_bridge',
          reasoning: `You ended your ${tombstone.goal_name || 'previous plan'} at week ${tombstone.weeks_completed}/${tombstone.total_weeks} with a ${peakLongRun}-mile long run ${weeksSinceEnd <= 0 ? 'this week' : `${weeksSinceEnd} week${weeksSinceEnd === 1 ? '' : 's'} ago`}. Your fitness is at or near peak — bridging into ${weeksOut}-week taper.`,
          peak_long_run_miles: peakLongRun,
          weeks_since_last_plan: weeksSinceEnd,
        };
      }

      // Recovery rebuild: ended a plan but fitness has had time to decay (3-12 weeks ago)
      if (sameDiscipline && completionPct >= 20 && weeksSinceEnd > 3 && weeksSinceEnd <= 12) {
        return {
          mode: 'recovery_rebuild',
          reasoning: `Your last ${tombstone.goal_name || 'plan'} ended ${weeksSinceEnd} weeks ago at ${completionPct}% completion. Rebuilding conservatively from current fitness.`,
          peak_long_run_miles: peakLongRun,
          weeks_since_last_plan: weeksSinceEnd,
        };
      }

      // Default: fresh build
      return {
        mode: 'fresh_build',
        reasoning: weeksSinceEnd > 12
          ? `Last training block was ${weeksSinceEnd} weeks ago — treating as a fresh build.`
          : 'Building from current fitness.',
      };
    }

    const trainingTransition = classifyTrainingTransition();
    // ─────────────────────────────────────────────────────────────────────────

    // ── Athlete Current State ─────────────────────────────────────────────────
    // Derive athlete state signals from recent snapshots so generators can find
    // the right starting point rather than always using week-1 table defaults.
    let recent_long_run_miles: number | undefined;
    let weeks_since_peak_long_run: number | undefined;
    let current_acwr: number | undefined;
    let volume_trend: 'building' | 'holding' | 'declining' | undefined;

    // Seed recent_long_run_miles from tombstone if available (catches same-day
    // plan switches before the snapshot has been recomputed for today's run).
    if (trainingTransition.peak_long_run_miles && trainingTransition.peak_long_run_miles > 0) {
      recent_long_run_miles = trainingTransition.peak_long_run_miles;
      // Tombstone peak: use weeks_since_last_plan as a proxy for recency
      if (trainingTransition.weeks_since_last_plan != null) {
        weeks_since_peak_long_run = trainingTransition.weeks_since_last_plan;
      }
    }

    if (recentSnapshots && recentSnapshots.length > 0) {
      // Recent long run: peak from last 8 weeks (extended window, use max to avoid
      // diluting with recovery weeks that artificially lower the average).
      // Also track WHICH snapshot index held the peak so we know recency.
      const easyPaceSecPerMile: number = baseline?.effort_paces?.base ?? 600; // 10 min/mile default
      const snapshotsWithLongRun = recentSnapshots
        .map((s: any, idx: number) => ({
          duration: s.run_long_run_duration as number | null,
          weeksAgo: idx, // snapshots ordered newest-first, so index = weeks ago
        }))
        .filter((s): s is { duration: number; weeksAgo: number } =>
          s.duration != null && s.duration > 0);

      if (snapshotsWithLongRun.length > 0) {
        const peakSnapshot = snapshotsWithLongRun.reduce((best, s) =>
          s.duration > best.duration ? s : best);
        const snapshotLongRun = Math.round((peakSnapshot.duration * 60 / easyPaceSecPerMile) * 10) / 10;
        // Use whichever is higher: tombstone peak or snapshot peak
        if (!recent_long_run_miles || snapshotLongRun > recent_long_run_miles) {
          recent_long_run_miles = snapshotLongRun;
          weeks_since_peak_long_run = peakSnapshot.weeksAgo;
        }
      }

      // ACWR from the most recent snapshot
      const latestAcwr = recentSnapshots[0]?.acwr;
      if (latestAcwr != null && Number.isFinite(Number(latestAcwr))) {
        current_acwr = Number(latestAcwr);
      }

      // Volume trend: compare most-recent vs oldest of the 4 snapshots
      if (recentSnapshots.length >= 2) {
        const newest = Number(recentSnapshots[0]?.workload_total ?? 0);
        const oldest = Number(recentSnapshots[recentSnapshots.length - 1]?.workload_total ?? 0);
        if (oldest > 0) {
          const pct = (newest - oldest) / oldest;
          volume_trend = pct > 0.10 ? 'building' : pct < -0.10 ? 'declining' : 'holding';
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    let personalizedFloorWeeks = floorWeeks;
    if (distanceApi === 'marathon') {
      // Recompute memory immediately so marathon gating reads fresh longitudinal state.
      await invokeFunction(functionsBaseUrl, serviceKey, 'recompute-athlete-memory', { user_id });

      const latestMemory = await getLatestAthleteMemory(supabase, user_id);

      let spacingWeeks: number | null = null;
      if (mode === 'create' && action === 'keep' && existing_goal_id) {
        const { data: existingGoal } = await supabase
          .from('goals')
          .select('id, target_date, distance, goal_type, status')
          .eq('id', existing_goal_id)
          .eq('user_id', user_id)
          .maybeSingle();
        if (
          existingGoal &&
          existingGoal.goal_type === 'event' &&
          (existingGoal.status || 'active') === 'active' &&
          isMarathonDistance(existingGoal.distance) &&
          existingGoal.target_date &&
          resolvedGoal?.target_date
        ) {
          spacingWeeks = Math.abs(weeksBetween(new Date(existingGoal.target_date), new Date(resolvedGoal.target_date)));
      }
      }

      const adaptive = resolveAdaptiveMarathonDecisionFromMemory(latestMemory, {
        weeksOut,
        spacingWeeks,
        fitness,
      });
      adaptiveMarathonDecision = adaptive;
      console.log('[adaptive-marathon-decision]', {
        user_id,
        weeksOut,
        spacingWeeks,
        readiness_state: adaptive.readiness_state,
        recommended_mode: adaptive.recommended_mode,
        risk_tier: adaptive.risk_tier,
        decision_source: adaptive.decision_source,
      });

      if (ADAPTIVE_MARATHON_DECISIONS_ENABLED) {
        personalizedFloorWeeks = Math.max(1, adaptive.minimum_feasible_weeks);
      } else {
        const resolved = resolveMarathonMinWeeksFromMemory(latestMemory, fitness, floorWeeks);
        const confidence = resolved.confidence;
        const sufficiencyWeeks = resolved.sufficiencyWeeks;
        if (!Number.isFinite(confidence) || confidence < 0.35 || sufficiencyWeeks < 4) {
          throw new AppError(
            'insufficient_evidence_memory',
            'Marathon timeline needs at least 4 weeks of quality history before we can personalize safely.',
          );
        }
        if (!resolved.minWeeks) {
          throw new AppError(
            'memory_rule_missing',
            'Athlete memory is missing marathon readiness rules. Recompute memory and try again.',
          );
        }
        personalizedFloorWeeks = resolved.minWeeks;
      }
    }

    let allowRaceWeekSupportMode = false;
    if (distanceApi === 'marathon' && weeksOut <= 2) {
      const { data: activeRunPlan } = await supabase
        .from('plans')
        .select('id, plan_type, config, status')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const planType = String(activeRunPlan?.plan_type || '').toLowerCase();
      const planSport = String(activeRunPlan?.config?.sport || '').toLowerCase();
      const hasActiveRunContext = !!activeRunPlan && (planType.includes('run') || planSport === 'run');
      allowRaceWeekSupportMode = hasActiveRunContext;
    }

    if (!ADAPTIVE_MARATHON_DECISIONS_ENABLED && !allowRaceWeekSupportMode && weeksOut < personalizedFloorWeeks) {
      const msg = distanceApi === 'marathon'
        ? `Based on your recent training history, this marathon needs about ${personalizedFloorWeeks}+ weeks. Your selected race is ${weeksOut} weeks out. Choose Replace with a later date or pick a shorter race.`
        : `Your race is ${weeksOut} weeks away. ${distanceApi} needs at least ${personalizedFloorWeeks} weeks.`;
      throw new AppError(
        distanceApi === 'marathon' ? 'race_too_close_personalized' : 'race_too_close',
        msg,
      );
    }
    const adaptiveMode = adaptiveMarathonDecision?.recommended_mode as string | undefined;
    const adaptiveSupportMode = distanceApi === 'marathon' && ADAPTIVE_MARATHON_DECISIONS_ENABLED
      ? adaptiveMode === 'race_support' || adaptiveMode === 'bridge_peak'
      : false;
    const durationWeeks = adaptiveSupportMode
      ? Math.max(1, Math.min(weeksOut, adaptiveMode === 'race_support' ? 2 : 6))
      : allowRaceWeekSupportMode
        ? Math.max(1, Math.min(weeksOut, 2))
        : Math.max(personalizedFloorWeeks, Math.min(weeksOut, 20));

    if (goalType === 'speed') {
      const hasRaceTime = baseline?.effort_source_distance && baseline?.effort_source_time;
      const hasEffortScore = !!baseline?.effort_score;
      const hasThresholdPace = !!baseline?.effort_paces?.race;
      if (!hasRaceTime && !hasEffortScore && !hasThresholdPace) {
        throw new AppError('missing_pace_benchmark', 'Pace benchmark required: enter a recent race result or run quick calibration first.');
      }
    }

    if (mode === 'create') {
      const newGoalPriority = action === 'keep' && existing_goal_id ? 'B' : 'A';
      const { data: createdGoal, error: goalInsertErr } = await supabase
        .from('goals')
        .insert({
          user_id,
          name: String(resolvedGoal?.name || '').trim(),
          goal_type: 'event',
          target_date: resolvedGoal?.target_date,
          sport,
          distance: resolvedGoal?.distance || null,
          course_profile: {},
          target_metric: null,
          target_value: null,
          current_value: null,
          priority: newGoalPriority,
          status: 'active',
          training_prefs: resolvedGoal?.training_prefs || {},
          notes: resolvedGoal?.notes || null,
        })
        .select('*')
        .single();
      if (goalInsertErr || !createdGoal) throw new AppError('goal_create_failed', goalInsertErr?.message || 'Failed to create goal');
      createdGoalId = createdGoal.id;
    } else {
      createdGoalId = existing_goal_id || null;
    }

    const weeklyMiles = snapshot?.workload_by_discipline?.run
      ? Math.round(Number(snapshot.workload_by_discipline.run) / 10)
      : undefined;

    const generateBody: Record<string, any> = {
      user_id,
      distance: distanceApi,
      fitness,
      goal: goalType,
      duration_weeks: durationWeeks,
      approach: (allowRaceWeekSupportMode || adaptiveSupportMode) ? 'sustainable' : (goalType === 'complete' ? 'sustainable' : 'performance_build'),
      days_per_week: resolvedGoal?.training_prefs?.days_per_week
        ? `${resolvedGoal.training_prefs.days_per_week}-${Math.min(7, Number(resolvedGoal.training_prefs.days_per_week) + 1)}`
        : '4-5',
      race_date: resolvedGoal?.target_date,
      race_name: resolvedGoal?.name,
      current_weekly_miles: weeklyMiles,
      ...(recent_long_run_miles != null ? { recent_long_run_miles } : {}),
      ...(weeks_since_peak_long_run != null ? { weeks_since_peak_long_run } : {}),
      ...(current_acwr != null ? { current_acwr } : {}),
      ...(volume_trend ? { volume_trend } : {}),
      transition_mode: trainingTransition.mode,
      ...(plan_start_date ? { start_date: plan_start_date } : {}),
    };
    if (allowRaceWeekSupportMode || adaptiveSupportMode) {
      generateBody.race_week_mode = true;
    }

    if (generateBody.approach === 'performance_build') {
      if (baseline?.effort_source_distance && baseline?.effort_source_time) {
        generateBody.effort_source_distance = baseline.effort_source_distance;
        generateBody.effort_source_time = baseline.effort_source_time;
      } else if (baseline?.effort_score) {
        generateBody.effort_score = baseline.effort_score;
      }
      if (baseline?.effort_paces) generateBody.effort_paces = baseline.effort_paces;
    }

    if (resolvedGoal?.training_prefs?.strength_protocol && resolvedGoal.training_prefs.strength_protocol !== 'none') {
      generateBody.strength_protocol = resolvedGoal.training_prefs.strength_protocol;
      generateBody.strength_frequency = resolvedGoal.training_prefs.strength_frequency || 2;
      generateBody.strength_tier = 'strength_power';
    }

    // Structural load hint: tell the generator whether heavy lower-body
    // lifting will be overlaid so it can govern long-run volume in early weeks.
    // "heavy_lower" = neural_speed protocol with ≥2 sessions (85%+ 1RM squats/DLs).
    // "moderate"    = durability or any strength_power tier with ≥2 sessions.
    // "none"        = no strength, or bodyweight-only / upper-only protocols.
    const strengthFreq = Number(generateBody.strength_frequency ?? 0);
    const strengthProto = String(generateBody.strength_protocol ?? '');
    const strengthTier = String(generateBody.strength_tier ?? '');
    if (strengthFreq >= 2 && (strengthProto === 'neural_speed' || strengthTier === 'strength_power')) {
      generateBody.structural_load_hint = strengthProto === 'neural_speed' ? 'heavy_lower' : 'moderate';
    }

    const generated = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-run-plan', generateBody);
    const generatedPlanId = generated?.plan_id;
    if (!generatedPlanId) throw new AppError('plan_generation_failed', generated?.error || 'Plan generation returned no plan_id');
    createdPlanId = generatedPlanId;

    const { error: linkErr } = await supabase
      .from('plans')
      .update({ goal_id: createdGoalId, plan_mode: 'rolling' })
      .eq('id', generatedPlanId)
      .eq('user_id', user_id);
    if (linkErr) throw new AppError('plan_link_failed', linkErr.message);

    await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: generatedPlanId });

    // If the caller asked to replace a specific plan (e.g., End & Build), end it explicitly.
    if (replace_plan_id) {
      const weekStart = currentWeekMondayISO();
      await supabase.from('planned_workouts').delete().eq('training_plan_id', replace_plan_id).gte('date', weekStart);
      await supabase.from('plans').update({ status: 'ended' }).eq('id', replace_plan_id).eq('user_id', user_id);
    }

    // If rebuilding for an existing goal, retire any previously active linked plans for that same goal.
    if (mode === 'build_existing' && existing_goal_id) {
      const { data: priorLinkedPlans } = await supabase
        .from('plans')
        .select('id,status')
        .eq('user_id', user_id)
        .eq('goal_id', existing_goal_id)
        .eq('status', 'active');

      const weekStart = currentWeekMondayISO();
      for (const p of priorLinkedPlans || []) {
        if (p.id === generatedPlanId) continue;
        await supabase.from('planned_workouts').delete().eq('training_plan_id', p.id).gte('date', weekStart);
        await supabase.from('plans').update({ status: 'ended' }).eq('id', p.id).eq('user_id', user_id);
      }
    }

    // End unlinked active run plans to avoid duplicate active plan stacks.
    const { data: unlinkedPlans } = await supabase
      .from('plans')
      .select('id, config, plan_type, status')
      .eq('user_id', user_id)
      .is('goal_id', null)
      .in('status', ['active', 'paused']);

    for (const p of unlinkedPlans || []) {
      const planType = String(p.plan_type || '').toLowerCase();
      const planSport = String(p.config?.sport || '').toLowerCase();
      const looksRun = planSport === 'run' || planType.includes('run');
      if (!looksRun || p.id === generatedPlanId) continue;

      const weekStart = currentWeekMondayISO();
      await supabase.from('planned_workouts').delete().eq('training_plan_id', p.id).gte('date', weekStart);
      await supabase.from('plans').update({ status: 'ended' }).eq('id', p.id).eq('user_id', user_id);
    }

    if (mode === 'create' && action === 'replace' && replace_goal_id) {
      await supabase
        .from('goals')
        .update({ status: 'cancelled' })
        .eq('id', replace_goal_id)
        .eq('user_id', user_id);

      const { data: linkedPlans } = await supabase
        .from('plans')
        .select('id,status')
        .eq('user_id', user_id)
        .eq('goal_id', replace_goal_id)
        .eq('status', 'active');

      for (const lp of linkedPlans || []) {
        const weekStart = currentWeekMondayISO();
        await supabase.from('planned_workouts').delete().eq('training_plan_id', lp.id).gte('date', weekStart);
        await supabase.from('plans').update({ status: 'ended' }).eq('id', lp.id).eq('user_id', user_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        goal_id: createdGoalId,
        plan_id: generatedPlanId,
        // Training transition context — tells the UI how the plan was shaped
        transition_mode: trainingTransition.mode,
        transition_reasoning: trainingTransition.reasoning,
        readiness_state: adaptiveMarathonDecision?.readiness_state,
        recommended_mode: adaptiveMarathonDecision?.recommended_mode,
        risk_tier: adaptiveMarathonDecision?.risk_tier,
        spacing_assessment: adaptiveMarathonDecision?.spacing_assessment,
        decision_source: adaptiveMarathonDecision?.decision_source,
        why: adaptiveMarathonDecision?.why,
        constraints: adaptiveMarathonDecision?.constraints,
        next_actions: adaptiveMarathonDecision?.next_actions,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    // Best-effort rollback to avoid dangling entities.
    if (createdPlanId) {
      try {
        await supabase.from('planned_workouts').delete().eq('training_plan_id', createdPlanId);
        await supabase.from('plans').delete().eq('id', createdPlanId);
      } catch {
        // no-op
      }
    }
    if (createdGoalId) {
      try {
        await supabase.from('goals').delete().eq('id', createdGoalId);
      } catch {
        // no-op
      }
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Unknown error',
        error_code: err?.code || 'unknown_error',
        http_status: err?.status || 400,
      }),
      // Return 200 with structured error payload so clients consistently display
      // business-rule failures instead of generic transport errors.
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
