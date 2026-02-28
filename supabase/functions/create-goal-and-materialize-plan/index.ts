import { createClient } from 'jsr:@supabase/supabase-js@2';

type GoalAction = 'keep' | 'replace';
type RequestMode = 'create' | 'build_existing' | 'link_existing';

interface CreateGoalRequest {
  user_id: string;
  mode?: RequestMode;
  action?: GoalAction;
  existing_goal_id?: string | null;
  replace_goal_id?: string | null;
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

const MIN_WEEKS: Record<string, Record<string, number>> = {
  marathon: { beginner: 14, intermediate: 6, advanced: 6 },
  half: { beginner: 8, intermediate: 4, advanced: 4 },
  '10k': { beginner: 4, intermediate: 4, advanced: 4 },
  '5k': { beginner: 4, intermediate: 4, advanced: 4 },
};

function weeksBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function distanceToApiValue(distance: string | null): string {
  if (!distance) return 'marathon';
  return DISTANCE_TO_API[distance] || String(distance).toLowerCase();
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
    const { user_id, mode = 'create', action, existing_goal_id, replace_goal_id, plan_id, goal } = payload || ({} as CreateGoalRequest);

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
    if (sport !== 'run') throw new AppError('unsupported_sport', 'Only run event goals can auto-build right now');

    const fitness = String(resolvedGoal?.training_prefs?.fitness || '').toLowerCase();
    const goalType = String(resolvedGoal?.training_prefs?.goal_type || '').toLowerCase();
    if (!fitness || !goalType) throw new AppError('missing_training_prefs', 'Missing fitness or training goal');

    const distanceApi = distanceToApiValue(resolvedGoal?.distance || null);
    const floorWeeks = MIN_WEEKS[distanceApi]?.[fitness] ?? 4;
    const weeksOut = weeksBetween(new Date(), new Date(String(resolvedGoal?.target_date || '')));
    if (weeksOut < floorWeeks) {
      throw new AppError('race_too_close', `Your race is ${weeksOut} weeks away. ${distanceApi} needs at least ${floorWeeks} weeks.`);
    }
    const durationWeeks = Math.max(floorWeeks, Math.min(weeksOut, 20));

    const [{ data: baseline }, { data: snapshot }] = await Promise.all([
      supabase.from('user_baselines').select('*').eq('user_id', user_id).maybeSingle(),
      supabase
        .from('athlete_snapshot')
        .select('*')
        .eq('user_id', user_id)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

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
      approach: goalType === 'complete' ? 'sustainable' : 'performance_build',
      days_per_week: resolvedGoal?.training_prefs?.days_per_week
        ? `${resolvedGoal.training_prefs.days_per_week}-${Math.min(7, Number(resolvedGoal.training_prefs.days_per_week) + 1)}`
        : '4-5',
      race_date: resolvedGoal?.target_date,
      race_name: resolvedGoal?.name,
      current_weekly_miles: weeklyMiles,
    };

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

      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('planned_workouts').delete().eq('training_plan_id', p.id).gte('date', today);
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
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from('planned_workouts').delete().eq('training_plan_id', lp.id).gte('date', today);
        await supabase.from('plans').update({ status: 'ended' }).eq('id', lp.id).eq('user_id', user_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        goal_id: createdGoalId,
        plan_id: generatedPlanId,
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
      }),
      { status: err?.status || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
