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
import { buildWeek, buildAssessmentWeekSessions } from './week-builder.ts';
import { validatePlan, failedChecks } from './validator.ts';
import { scaledWeeklyTSS } from './science.ts';
import { parseLocalDate } from '../_shared/parse-local-date.ts';
import { resolveWeekConflicts, type WeekConflictContext } from '../_shared/week-conflict-resolver.ts';
import { reconcileAthleteStateWithWeekOptimizer } from './reconcile-athlete-state-week-optimizer.ts';
import { promote703SwimIntentForCutoffRisk } from './swim-tri-safety.ts';
import {
  buildQualityRunWeekBuilderFallbackTradeOff,
  humanizeScheduleTradeOffLine,
  plannedSessionLooksLikeStructuredQualityRun,
  sessionsByWeekHasStructuredQualityRun,
} from '../_shared/plan-generation-trade-offs.ts';
import {
  validateTrainingFloors,
  tightenPhaseBlocksForFloorRebuild,
  LONG_RUN_TSS_SHARE_MAX,
  LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE,
  LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK,
  WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX,
  WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI,
} from './validate-training-floors.ts';
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts';

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
    const { user_id, goals, athlete_state, athlete_memory, start_date, generation_trade_offs } = body;
    const preview = body.preview === true;
    const persistedTradeOffs = Array.isArray(generation_trade_offs) ? generation_trade_offs : [];

    console.log('[generate-combined-plan] ===== HANDLER ENTRY =====', {
      preview,
      goal_count: goals.length,
      swim_intent: athlete_state?.swim_intent ?? null,
    });

    // ── Input validation ────────────────────────────────────────────────────
    if (!user_id)                         return json({ error: 'user_id required' }, 400);
    if (!Array.isArray(goals) || goals.length < 1) return json({ error: 'At least one goal required' }, 400);
    if (!athlete_state?.current_ctl)      return json({ error: 'athlete_state.current_ctl required' }, 400);
    if (!athlete_state?.weekly_hours_available) return json({ error: 'weekly_hours_available required' }, 400);

    // Default loading pattern
    const loadingPattern = athlete_state.loading_pattern ?? '3:1';
    const startDate = start_date ? parseLocalDate(String(start_date).slice(0, 10)) : new Date();

    const state: AthleteState = {
      ...athlete_state,
      rest_days: athlete_state.rest_days ?? [],
    };

    const state703Cutoff = promote703SwimIntentForCutoffRisk(goals, state);

    // Used downstream for floor caps, quality_run rescue, and ramp-cap reporting.
    const hasTriGoal = goals.some((g) =>
      ['triathlon', 'tri'].includes(String(g.sport ?? '').toLowerCase()),
    );

    // Task 7 (consolidation): scheduling is the optimizer's responsibility for ALL combined-plan
    // entrypoints. The reconciler internally short-circuits (returns state unchanged) for AthleteStates
    // that cannot be optimized — e.g. when long_run_day is missing — so it is safe to call unconditionally.
    const scheduleState: AthleteState = reconcileAthleteStateWithWeekOptimizer(state703Cutoff);

    // ── Build phase timeline ────────────────────────────────────────────────
    const { blocks: builtBlocks, totalWeeks, raceAnchors } = buildPhaseTimeline(goals, startDate, scheduleState);
    let blocks = builtBlocks;
    blocks = applyLoadingPattern(blocks, loadingPattern);

    if (totalWeeks < 2) {
      return json({ error: 'Not enough time before earliest event to build a meaningful plan' }, 400);
    }

    if (totalWeeks >= 1) {
      console.log('[generate-combined-plan] athleteState before buildWeek:', {
        bike_quality_day: scheduleState.bike_quality_day,
        bike_easy_day: scheduleState.bike_easy_day,
        bike_quality_label: scheduleState.bike_quality_label,
        run_quality_day: scheduleState.run_quality_day,
        run_easy_day: scheduleState.run_easy_day,
        long_ride_day: scheduleState.long_ride_day,
        long_run_day: scheduleState.long_run_day,
        swim_easy_day: scheduleState.swim_easy_day,
        swim_quality_day: scheduleState.swim_quality_day,
        swim_third_day: scheduleState.swim_third_day,
        strength_preferred_days: scheduleState.strength_preferred_days,
        strength_sessions_cap: scheduleState.strength_sessions_cap,
        strength_intent: scheduleState.strength_intent,
        strength_optimizer_slots: scheduleState.strength_optimizer_slots,
        enforce_optimizer_anchor_days: scheduleState.enforce_optimizer_anchor_days,
        swim_intent: scheduleState.swim_intent,
        swim_load_source: scheduleState.swim_load_source,
        training_intent: scheduleState.training_intent,
        transition_mode: scheduleState.transition_mode,
        tri_approach: scheduleState.tri_approach,
        run_quality_placement: scheduleState.run_quality_placement,
        bike_quality_placement: scheduleState.bike_quality_placement,
      });
    }

    // ── Generate each week ─────────────────────────────────────────────────
    type GeneratedWeekFromBuilder = ReturnType<typeof buildWeek>;

    const generateAllWeeks = (
      blocksArg: typeof blocks,
      rebuild: false | 'normal' | 'deep' = false,
    ): GeneratedWeekFromBuilder[] => {
      const out: GeneratedWeekFromBuilder[] = [];
      let prevWeightedTSS = state.current_ctl * 7;
      for (let w = 1; w <= totalWeeks; w++) {
        const block = blockForWeek(blocksArg, w);
        const week = buildWeek(w, block, prevWeightedTSS, goals, scheduleState, athlete_memory, {
          totalWeeks,
          raceAnchors,
          phaseBlocks: blocksArg,
          ...(rebuild === 'deep'
            ? { physiologicalFloorRebuild: true, physiologicalFloorRebuildDeep: true }
            : rebuild === 'normal'
              ? { physiologicalFloorRebuild: true }
              : {}),
        });
        out.push(week);
        prevWeightedTSS = week.total_weighted_tss;
      }
      return out;
    };

    let generatedWeeks = generateAllWeeks(blocks);
    let physiologicalFloorRebuiltOnce = false;
    const floorOpts = { hasTri: hasTriGoal };
    let floors = validateTrainingFloors(generatedWeeks, floorOpts);
    const MAX_PHYSIOLOGICAL_FLOOR_PASSES = 12;
    let floorPass = 0;
    while (!floors.ok && floorPass < MAX_PHYSIOLOGICAL_FLOOR_PASSES) {
      blocks = tightenPhaseBlocksForFloorRebuild(blocks);
      physiologicalFloorRebuiltOnce = true;
      floorPass += 1;
      generatedWeeks = generateAllWeeks(blocks, 'normal');
      floors = validateTrainingFloors(generatedWeeks, floorOpts);
    }
    if (!floors.ok) {
      physiologicalFloorRebuiltOnce = true;
      generatedWeeks = generateAllWeeks(blocks, 'deep');
      floors = validateTrainingFloors(generatedWeeks, floorOpts);
      floorPass += 1;
    }
    if (!floors.ok) {
      const v0 = floors.violations[0];
      const hint =
        v0?.code === 'LONG_RUN_TSS_SHARE'
          ? ' Try lowering performance intent, weekly hours, or run quality folded into the long run.'
          : v0?.code === 'WEEK_OVER_WEEK_TSS_RAMP'
            ? ' Try a gentler loading pattern or shorter mesocycle.'
            : '';
      try {
        const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await invalidateUserTrainingCache(sb, user_id, 'generate-combined-plan:physiological_floors');
      } catch (e) {
        console.warn('[generate-combined-plan] cache bust after floor failure:', e);
      }
      return json(
        {
          success: false,
          error: `Training load limits could not be met: ${v0?.message ?? 'constraints violated after rebuild.'}${hint}`,
          physiological_floor_violations: floors.violations,
          physiological_floor_rebuilt_once: physiologicalFloorRebuiltOnce,
          physiological_floor_passes_attempted: floorPass,
        },
        400,
      );
    }

    // ── Validate ───────────────────────────────────────────────────────────
    const validation = validatePlan(
      generatedWeeks, blocks,
      state.current_ctl,
      state.weekly_hours_available,
      loadingPattern,
      hasTriGoal,
      scheduleState.transition_mode,
    );
    const failures = failedChecks(validation);
    if (failures.length > 0) {
      console.warn('[combined-plan] Validation failures:', failures);
      // Soft validation — log failures but proceed (hard fails handled by type system)
      // Future: return 400 for critical failures once the engine is battle-tested
    }

    // ── Build sessions_by_week (sessions format used by activate-plan) ─────
    const sessions_by_week: Record<string, any[]> = {};

    const serializeSession = (s: any) => ({
      day: s.day,
      type: s.type,
      discipline: s.type,
      name: s.name,
      description: s.description,
      duration: s.duration,
      steps_preset: s.steps_preset,
      tags: s.tags,
      ...(typeof s.route_url === 'string' && s.route_url.trim()
        ? { route_url: s.route_url.trim() }
        : {}),
      ...(typeof (s as { group_ride_route_snapshot?: unknown }).group_ride_route_snapshot === 'object' &&
        (s as { group_ride_route_snapshot?: unknown }).group_ride_route_snapshot !== null &&
        !Array.isArray((s as { group_ride_route_snapshot?: unknown }).group_ride_route_snapshot)
        ? {
          group_ride_route_snapshot: (s as { group_ride_route_snapshot: Record<string, unknown> })
            .group_ride_route_snapshot,
        }
        : {}),
      intensity_class: s.intensity_class,
      tss: s.tss,
      weighted_tss: s.weighted_tss,
      zone_targets: s.zone_targets,
      serves_goal: s.serves_goal,
      ...(typeof s.session_kind === 'string' && s.session_kind ? { session_kind: s.session_kind } : {}),
      ...(Array.isArray(s.strength_exercises) && s.strength_exercises.length > 0
        ? { strength_exercises: s.strength_exercises }
        : {}),
    });

    // When assessment_first: shift all training weeks +1, prepend assessment as week 1.
    const includeAssessmentWeek = scheduleState.assessment_week_preference === 'assessment_first';
    const weekOffset = includeAssessmentWeek ? 1 : 0;

    // Optimizer micro-grid can report "quality_run not placed" while week-builder still lands
    // structured quality from Arc defaults + anchor bumps. Surface what actually shipped.
    if (hasTriGoal && scheduleState.run_quality_day == null) {
      for (const gw of generatedWeeks) {
        const qrSession = gw.sessions.find((s) =>
          plannedSessionLooksLikeStructuredQualityRun(s as unknown as Record<string, unknown>),
        );
        if (!qrSession) continue;
        const dayPretty = String(qrSession.day ?? '').trim() || 'mid-week';
        const note = buildQualityRunWeekBuilderFallbackTradeOff(dayPretty, {
          bike_quality_day: scheduleState.bike_quality_day,
          long_ride_day: scheduleState.long_ride_day,
          long_run_day: scheduleState.long_run_day,
          swim_quality_day: scheduleState.swim_quality_day,
        });
        gw.week_trade_offs = [...(gw.week_trade_offs ?? []), note];
        break;
      }
    }

    for (const w of generatedWeeks) {
      sessions_by_week[String(w.weekNum + weekOffset)] = w.sessions.map(serializeSession);
    }

    if (includeAssessmentWeek) {
      const assessmentDisciplines: ('swim' | 'bike' | 'run')[] = hasTriGoal
        ? ['swim', 'bike', 'run']
        : ['run']; // marathon, HM, 5K, 10K — run baseline only
      sessions_by_week['1'] = buildAssessmentWeekSessions(assessmentDisciplines).map(serializeSession);
    }

    const persistedTradeOffsEffective = sessionsByWeekHasStructuredQualityRun(sessions_by_week)
      ? persistedTradeOffs.filter((t) => t.message_template_id !== 'quality_run_unplaced')
      : persistedTradeOffs;

    // Total duration including any prepended assessment week
    const effectiveTotalWeeks = totalWeeks + weekOffset;

    // ── Build plan_contract_v1 ─────────────────────────────────────────────
    const primaryGoal = goals.find(g => g.priority === 'A') ?? goals[0];
    const allGoalNames = goals.map(g => g.event_name).join(' + ');

    const plan_contract_v1 = {
      plan_type: 'multi_sport',
      discipline: 'multi',
      approach: 'combined_80_20',
      tri_approach: scheduleState.tri_approach ?? null,  // 'base_first' | 'race_peak' — read by coach narrative
      transition_mode: scheduleState.transition_mode ?? null,
      structural_load_hint: scheduleState.structural_load_hint ?? null,
      swim_volume_multiplier: scheduleState.swim_volume_multiplier ?? null,
      swim_intent: scheduleState.swim_intent ?? null,
      swim_load_source: scheduleState.swim_load_source ?? null,
      swim_cutoff_pressure_v1: scheduleState.swim_cutoff_pressure_v1 ?? null,
      long_run_day: scheduleState.long_run_day ?? null,
      long_ride_day: scheduleState.long_ride_day ?? null,
      swim_easy_day: scheduleState.swim_easy_day ?? null,
      swim_quality_day: scheduleState.swim_quality_day ?? null,
      swim_third_day: scheduleState.swim_third_day ?? null,
      run_quality_day: scheduleState.run_quality_day ?? null,
      run_easy_day: scheduleState.run_easy_day ?? null,
      bike_quality_day: scheduleState.bike_quality_day ?? null,
      bike_easy_day: scheduleState.bike_easy_day ?? null,
      run_quality_placement: scheduleState.run_quality_placement ?? null,
      bike_quality_placement: scheduleState.bike_quality_placement ?? null,
      strength_protocol: scheduleState.strength_protocol ?? null,
      strength_intent: scheduleState.strength_intent ?? null,
      training_intent: scheduleState.training_intent ?? null,
      strength_preferred_days: scheduleState.strength_preferred_days ?? null,
      strength_sessions_cap: scheduleState.strength_sessions_cap ?? null,
      rest_days: scheduleState.rest_days ?? [],
      race_anchors: Array.isArray(raceAnchors) && raceAnchors.length > 0 ? raceAnchors : null,
      goals_served: goals.map(g => g.id),
      goal_names: goals.map(g => ({ id: g.id, name: g.event_name, date: g.event_date, priority: g.priority })),
      sport: 'multi_sport',
      start_date: start_date ?? new Date().toISOString().slice(0, 10),
      duration_weeks: effectiveTotalWeeks,
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
      physiological_floors: {
        long_run_tss_share_max_single_sport: LONG_RUN_TSS_SHARE_MAX,
        tri_long_run_share_of_run_discipline_max: LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE,
        tri_long_run_share_of_total_week_fallback_max: LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK,
        week_over_week_raw_tss_ramp_max: hasTriGoal
          ? WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI
          : WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX,
        rebuilt_once: physiologicalFloorRebuiltOnce,
        rebuild_passes: floorPass,
        passed: true,
      },
      week_start_dow: 'Monday',
      week_trade_offs: Object.fromEntries(
        generatedWeeks
          .filter((w) => Array.isArray(w.week_trade_offs) && w.week_trade_offs.length > 0)
          .map((w) => [
            String(w.weekNum),
            (w.week_trade_offs as string[]).map((t) => humanizeScheduleTradeOffLine(t)),
          ]),
      ),
      conflict_events: Object.fromEntries(
        generatedWeeks
          .filter((w) => Array.isArray(w.conflict_events) && w.conflict_events!.length > 0)
          .map((w) => [String(w.weekNum), w.conflict_events!]),
      ),
    };

    const planName = effectiveTotalWeeks <= 10
      ? `${allGoalNames} — ${effectiveTotalWeeks}-Week Combined Plan`
      : `${allGoalNames} — Multi-Sport Plan`;

    const peakWeek = generatedWeeks.reduce((best, w) =>
      w.total_raw_tss > (best?.total_raw_tss ?? 0) ? w : best
    , generatedWeeks[0]);

    const avgTSS = Math.round(generatedWeeks.reduce((s, w) => s + w.total_raw_tss, 0) / effectiveTotalWeeks);

    const planUnits = state.plan_units === 'metric' ? 'metric' : 'imperial';
    const plan_config = {
      ...plan_contract_v1,
      sport: 'multi_sport',
      race_date: primaryGoal.event_date,
      race_name: primaryGoal.event_name,
      units: planUnits,
      swim_unit: 'yd',
      user_selected_start_date: start_date ?? new Date().toISOString().slice(0, 10),
    };

    const previewSummary = {
      name: planName,
      total_weeks: effectiveTotalWeeks,
      peak_weekly_tss: peakWeek.total_raw_tss,
      avg_weekly_tss: avgTSS,
      loading_pattern: loadingPattern,
      goals: goals.map(g => ({ id: g.id, name: g.event_name, date: g.event_date, priority: g.priority })),
      phase_summary: plan_contract_v1.phases,
    };

    if (preview) {
      // Run the resolver server-side so the client gets labelled options ready for the UI.
      const conflict_resolutions: Record<string, unknown[]> = {};
      for (const w of generatedWeeks) {
        const events = w.conflict_events ?? [];
        if (events.length === 0) continue;
        const ctx: WeekConflictContext = {
          isRecovery: w.isRecovery,
          isTaper: (w.phase as string) === 'taper',
          isRaceWeek: raceAnchors.some((a) => a.planWeek === w.weekNum),
          weeksToRace: (() => {
            const deltas = raceAnchors.map((a) => a.planWeek - w.weekNum).filter((d) => d >= 0);
            return deltas.length === 0 ? 999 : Math.min(...deltas);
          })(),
        };
        conflict_resolutions[String(w.weekNum)] = resolveWeekConflicts(events, ctx);
      }

      return json({
        success: true,
        preview_mode: true,
        plan_id: null,
        total_weeks: effectiveTotalWeeks,
        validation,
        validation_failures: failures,
        sessions_by_week,
        week_trade_offs: plan_contract_v1.week_trade_offs as Record<string, string[]>,
        plan_contract_v1,
        plan_config,
        conflict_resolutions,
        preview: previewSummary,
        generation_trade_offs: persistedTradeOffsEffective,
      });
    }

    // ── Write plan to DB ───────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .insert({
        user_id,
        name: planName,
        description: buildDescription(goals, effectiveTotalWeeks, loadingPattern, validation, peakWeek.total_raw_tss, avgTSS),
        plan_type: 'generated',
        status: 'active',
        duration_weeks: effectiveTotalWeeks,
        sessions_by_week,
        config: plan_config,
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
      total_weeks: effectiveTotalWeeks,
      validation,
      validation_failures: failures,
      preview: previewSummary,
      sessions_by_week,
      week_trade_offs: plan_contract_v1.week_trade_offs as Record<string, string[]>,
      generation_trade_offs: persistedTradeOffsEffective,
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
