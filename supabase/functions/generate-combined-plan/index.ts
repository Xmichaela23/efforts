// @ts-nocheck
// Edge Function: generate-combined-plan
//
// Multi-sport combined plan engine. Implements the training science spec
// (Friel, 80/20 triathlon, Seiler polarized model, Hickson interference theory).
//
// Single entry point for generating a unified plan that integrates training
// for two or more concurrent events — one TSS budget, globally enforced
// hard/easy, proper brick placement, and multi-event taper protocols.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombinedPlanRequest, GoalInput, AthleteState, AthleteMemory } from './types.ts';
import { buildPhaseTimeline, applyLoadingPattern, blockForWeek } from './phase-structure.ts';
import { buildWeek } from './week-builder.ts';
import { validatePlan, failedChecks } from './validator.ts';
import { scaledWeeklyTSS } from './science.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body: CombinedPlanRequest = await req.json();
    const { user_id, goals, athlete_state, athlete_memory, start_date } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!user_id)                         return json({ error: 'user_id required' }, 400);
    if (!Array.isArray(goals) || goals.length < 1) return json({ error: 'At least one goal required' }, 400);
    if (!athlete_state?.current_ctl)      return json({ error: 'athlete_state.current_ctl required' }, 400);
    if (!athlete_state?.weekly_hours_available) return json({ error: 'weekly_hours_available required' }, 400);

    // Default loading pattern
    const loadingPattern = athlete_state.loading_pattern ?? '3:1';
    const startDate = start_date ? new Date(start_date) : new Date();

    const state: AthleteState = {
      ...athlete_state,
      rest_days: athlete_state.rest_days ?? [],
    };

    // ── Build phase timeline ────────────────────────────────────────────────
    let { blocks, totalWeeks } = buildPhaseTimeline(goals, startDate, state);
    blocks = applyLoadingPattern(blocks, loadingPattern);

    if (totalWeeks < 2) {
      return json({ error: 'Not enough time before earliest event to build a meaningful plan' }, 400);
    }

    // ── Generate each week ─────────────────────────────────────────────────
    const generatedWeeks = [];
    let prevWeightedTSS = state.current_ctl * 7; // baseline = CTL * 7

    for (let w = 1; w <= totalWeeks; w++) {
      const block = blockForWeek(blocks, w);
      const week = buildWeek(w, block, prevWeightedTSS, goals, state, athlete_memory);
      generatedWeeks.push(week);
      prevWeightedTSS = week.total_weighted_tss;
    }

    // ── Validate ───────────────────────────────────────────────────────────
    const hasTriGoal = goals.some(g => ['triathlon', 'tri'].includes((g.sport ?? '').toLowerCase()));
    const validation = validatePlan(
      generatedWeeks, blocks,
      state.current_ctl,
      state.weekly_hours_available,
      loadingPattern,
      hasTriGoal,
      state.transition_mode,
    );
    const failures = failedChecks(validation);
    if (failures.length > 0) {
      console.warn('[combined-plan] Validation failures:', failures);
      // Soft validation — log failures but proceed (hard fails handled by type system)
      // Future: return 400 for critical failures once the engine is battle-tested
    }

    // ── Build sessions_by_week (sessions format used by activate-plan) ─────
    const sessions_by_week: Record<string, any[]> = {};
    for (const w of generatedWeeks) {
      sessions_by_week[String(w.weekNum)] = w.sessions.map(s => ({
        day: s.day,
        type: s.type,
        discipline: s.type,
        name: s.name,
        description: s.description,
        duration: s.duration,
        steps_preset: s.steps_preset,
        tags: s.tags,
        timing: s.timing,
        // Extended fields (stored in JSONB, used by coach for context)
        intensity_class: s.intensity_class,
        tss: s.tss,
        weighted_tss: s.weighted_tss,
        zone_targets: s.zone_targets,
        serves_goal: s.serves_goal,
      }));
    }

    // ── Build plan_contract_v1 ─────────────────────────────────────────────
    const primaryGoal = goals.find(g => g.priority === 'A') ?? goals[0];
    const allGoalNames = goals.map(g => g.event_name).join(' + ');

    const plan_contract_v1 = {
      plan_type: 'multi_sport',
      discipline: 'multi',
      approach: 'combined_80_20',
      tri_approach: state.tri_approach ?? null,  // 'base_first' | 'race_peak' — read by coach narrative
      transition_mode: state.transition_mode ?? null,
      structural_load_hint: state.structural_load_hint ?? null,
      swim_volume_multiplier: state.swim_volume_multiplier ?? null,
      long_run_day: state.long_run_day ?? null,
      long_ride_day: state.long_ride_day ?? null,
      swim_easy_day: state.swim_easy_day ?? null,
      swim_quality_day: state.swim_quality_day ?? null,
      strength_protocol: state.strength_protocol ?? null,
      rest_days: state.rest_days ?? [],
      goals_served: goals.map(g => g.id),
      goal_names: goals.map(g => ({ id: g.id, name: g.event_name, date: g.event_date, priority: g.priority })),
      sport: 'multi_sport',
      start_date: start_date ?? new Date().toISOString().slice(0, 10),
      duration_weeks: totalWeeks,
      loading_pattern: loadingPattern,
      weekly_tss_target: Math.round(
        scaledWeeklyTSS('build', state.current_ctl, state.weekly_hours_available, 1.0)
      ),
      phases: blocks
        .filter((b, i, arr) => i === 0 || b.phase !== arr[i - 1].phase || b.primaryGoalId !== arr[i - 1].primaryGoalId)
        .map(b => ({
          name: b.phase,
          start_week: b.startWeek,
          primary_goal_id: b.primaryGoalId,
          tss_multiplier: b.tssMultiplier,
          sport_distribution: b.sportDistribution,
        })),
      tss_science: {
        run_impact_multiplier: 1.3,
        bike_impact_multiplier: 1.0,
        swim_impact_multiplier: 0.8,
        strength_budget_fraction: 0.5,
        intensity_model: '80_20_polarized',
      },
      validation,
      validation_failures: failures,
      week_start_dow: 'Monday',
    };

    // ── Write plan to DB ───────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const planName = totalWeeks <= 10
      ? `${allGoalNames} — ${totalWeeks}-Week Combined Plan`
      : `${allGoalNames} — Multi-Sport Plan`;

    const peakWeek = generatedWeeks.reduce((best, w) =>
      w.total_raw_tss > (best?.total_raw_tss ?? 0) ? w : best
    , generatedWeeks[0]);

    const avgTSS = Math.round(generatedWeeks.reduce((s, w) => s + w.total_raw_tss, 0) / totalWeeks);

    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .insert({
        user_id,
        name: planName,
        description: buildDescription(goals, totalWeeks, loadingPattern, validation, peakWeek.total_raw_tss, avgTSS),
        plan_type: 'generated',
        status: 'active',
        duration_weeks: totalWeeks,
        sessions_by_week,
        config: {
          ...plan_contract_v1,
          sport: 'multi_sport',
          race_date: primaryGoal.event_date,
          race_name: primaryGoal.event_name,
          units: 'imperial',
          swim_unit: 'yd',
          user_selected_start_date: start_date ?? new Date().toISOString().slice(0, 10),
        },
      })
      .select('id')
      .single();

    if (planErr || !plan?.id) {
      console.error('[combined-plan] DB write failed:', planErr);
      return json({ success: false, error: planErr?.message ?? 'Plan insert failed' }, 500);
    }

    return json({
      success: true,
      plan_id: plan.id,
      total_weeks: totalWeeks,
      validation,
      validation_failures: failures,
      preview: {
        name: planName,
        total_weeks: totalWeeks,
        peak_weekly_tss: peakWeek.total_raw_tss,
        avg_weekly_tss: avgTSS,
        loading_pattern: loadingPattern,
        goals: goals.map(g => ({ id: g.id, name: g.event_name, date: g.event_date, priority: g.priority })),
        phase_summary: plan_contract_v1.phases,
      },
    });

  } catch (e) {
    console.error('[combined-plan] Unhandled error:', e);
    return json({ success: false, error: String(e) }, 500);
  }
});

// ── Plan description prose ─────────────────────────────────────────────────────

function buildDescription(
  goals: GoalInput[],
  totalWeeks: number,
  pattern: string,
  v: any,
  peakTSS: number,
  avgTSS: number,
): string {
  const aGoals = goals.filter(g => g.priority === 'A').map(g => `${g.event_name} (${g.distance})`);
  const bGoals = goals.filter(g => g.priority === 'B').map(g => g.event_name);

  let desc = `${totalWeeks}-week integrated multi-sport plan targeting ${aGoals.join(' and ')}.`;
  if (bGoals.length > 0) desc += ` Also includes ${bGoals.join(', ')} as B-race(s).`;

  desc += ` Built on 80/20 polarized intensity distribution, TSS-budgeted across all sports with a 1.3× run impact adjustment for weight-bearing load.`;
  desc += ` Loading follows a ${pattern} pattern (${pattern === '3:1' ? '3 build weeks then 1 recovery' : '2 build weeks then 1 recovery'}).`;
  desc += ` Peak week: ~${peakTSS} TSS. Average: ~${avgTSS} TSS/week.`;

  if (!v.no_consecutive_hard_days)    desc += ' ⚠️ Hard/easy rule violations detected — review schedule.';
  if (!v.maintenance_floors_met)      desc += ' ⚠️ Some sport maintenance floors not met.';
  if (!v.tapers_present)              desc += ' ⚠️ No taper detected — review phase structure.';

  return desc;
}
