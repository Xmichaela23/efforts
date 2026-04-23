// Edge Function: generate-triathlon-plan
//
// Generates personalized triathlon training plans for sprint / olympic / 70.3 / ironman.
// Mirrors the generate-run-plan contract: receives athlete context, returns a plan_id.
// plan_contract_v1 discipline: 'tri', includes bike + swim + run + optional strength.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  GenerateTriPlanRequest,
  GenerateTriPlanResponse,
  TriPlanPreview,
  TRI_VOLUME,
  TRI_RACE_DISTANCES,
  type TriDistance,
} from './types.ts';
import { validateRequest, validatePlanSchema } from './validation.ts';
import { TriathlonGenerator } from './generators/tri-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const request: GenerateTriPlanRequest = await req.json();

    // ── Validation ─────────────────────────────────────────────────────────
    const validation = validateRequest(request);
    if (!validation.valid) {
      console.error('[TriPlanGen] Validation failed:', validation.errors);
      return json({ success: false, error: 'Invalid request', validation_errors: validation.errors }, 400);
    }
    if (validation.warnings?.length) {
      console.warn('[TriPlanGen] Warnings:', validation.warnings);
    }

    // ── Start date ──────────────────────────────────────────────────────────
    const startDate = request.start_date ?? calculateStartDate(request.duration_weeks, request.race_date);

    // ── Generate plan ───────────────────────────────────────────────────────
    // Resolve approach: caller may supply it directly, or it is derived from `goal`.
    const approach = request.approach ?? (request.goal === 'performance' ? 'race_peak' : 'base_first');

    const generator = new TriathlonGenerator({
      distance:                    request.distance,
      fitness:                     request.fitness,
      goal:                        request.goal,
      approach,
      duration_weeks:              request.duration_weeks,
      start_date:                  startDate,
      race_date:                   request.race_date,
      race_name:                   request.race_name,
      units:                       request.units ?? 'imperial',
      current_weekly_run_miles:    request.current_weekly_run_miles,
      current_weekly_bike_hours:   request.current_weekly_bike_hours,
      current_weekly_swim_yards:   request.current_weekly_swim_yards,
      recent_long_run_miles:       request.recent_long_run_miles,
      recent_long_ride_hours:      request.recent_long_ride_hours,
      ftp:                         request.ftp,
      swim_pace_per_100_sec:       request.swim_pace_per_100_sec,
      current_acwr:                request.current_acwr,
      volume_trend:                request.volume_trend,
      transition_mode:             request.transition_mode,
      training_intent:             request.training_intent,
      strength_frequency:          request.strength_frequency ?? 0,
      equipment_type:              request.equipment_type,
      limiter_sport:               request.limiter_sport,
      existing_run_days:           request.existing_run_days,
    });

    const plan = generator.generatePlan();
    const phaseStructure = generator.determinePhaseStructure();

    // ── Schema validation ───────────────────────────────────────────────────
    const schemaCheck = validatePlanSchema(plan.sessions_by_week as Record<string, any[]>);
    if (!schemaCheck.valid) {
      console.error('[TriPlanGen] Schema validation failed:', schemaCheck.errors);
      return json({ success: false, error: 'Generated plan failed schema validation', validation_errors: schemaCheck.errors }, 500);
    }

    // ── Build plan_contract_v1 ──────────────────────────────────────────────
    const plan_contract_v1 = buildPlanContractV1(plan, phaseStructure, request, startDate);

    // ── Save to database ────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: inserted, error: insertErr } = await supabase
      .from('plans')
      .insert({
        user_id:        request.user_id,
        name:           plan.name,
        description:    plan.description,
        duration_weeks: plan.duration_weeks,
        current_week:   1,
        status:         'active',
        plan_type:      'generated',
        config: {
          source:                   'generated',
          plan_version:             'triathlon_v1',
          sport:                    'triathlon',
          distance:                 request.distance,
          fitness:                  request.fitness,
          goal:                     request.goal,
          approach,                 // 'base_first' | 'race_peak' — read by coach narrative
          days_per_week:            request.days_per_week ?? null,
          strength_frequency:       request.strength_frequency ?? 0,
          user_selected_start_date: startDate,
          race_date:                request.race_date ?? null,
          race_name:                request.race_name ?? null,
          ftp:                      request.ftp ?? null,
          swim_pace_per_100_sec:    request.swim_pace_per_100_sec ?? null,
          units:                    plan.units,
          swim_unit:                plan.swim_unit,
          baselines_required:       plan.baselines_required,
          weekly_summaries:         plan.weekly_summaries,
          plan_contract_v1,
        },
        sessions_by_week: plan.sessions_by_week,
        notes_by_week:    {},
        weeks:            [],
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      console.error('[TriPlanGen] DB insert failed:', insertErr);
      return json({ success: false, error: 'Failed to save plan', details: insertErr?.message }, 500);
    }

    // ── Preview ─────────────────────────────────────────────────────────────
    const preview = buildPreview(plan, phaseStructure, request.distance);

    const response: GenerateTriPlanResponse = {
      success: true,
      plan_id: inserted.id,
      preview,
    };

    console.log(`[TriPlanGen] Created plan ${inserted.id} for ${request.user_id} — ${request.distance} ${request.fitness} ${request.duration_weeks}w`);
    return json(response, 200);

  } catch (err) {
    console.error('[TriPlanGen] Unhandled error:', err);
    return json({ success: false, error: String(err) }, 500);
  }
});

// ============================================================================
// PLAN CONTRACT V1
// ============================================================================

function buildPlanContractV1(
  plan: any,
  phaseStructure: any,
  request: GenerateTriPlanRequest,
  startDate: string,
) {
  const duration = plan.duration_weeks;

  const phaseByWeek: string[] = [];
  for (let w = 1; w <= duration; w++) {
    if (phaseStructure.recovery_weeks.includes(w)) {
      phaseByWeek.push('recovery');
      continue;
    }
    const phase = phaseStructure.phases.find((p: any) => w >= p.start_week && w <= p.end_week);
    const name = (phase?.name ?? 'Build').toLowerCase();
    if (name === 'base')                            phaseByWeek.push('base');
    else if (name === 'taper')                      phaseByWeek.push('taper');
    else if (name === 'race-specific')              phaseByWeek.push('peak');
    else                                            phaseByWeek.push('build');
  }

  const weekIntents = [];
  for (let w = 1; w <= duration; w++) {
    const phase  = phaseByWeek[w - 1];
    const sessions: any[] = plan.sessions_by_week?.[String(w)] ?? [];
    const keyTypes: string[] = [];
    for (const s of sessions) {
      if (s.tags?.includes('long_run'))                                   keyTypes.push('run_long');
      if (s.tags?.some((t: string) => ['intervals','hard_run'].includes(t))) keyTypes.push('run_intervals');
      if (s.tags?.some((t: string) => ['tempo','threshold'].includes(t) && s.type === 'run')) keyTypes.push('run_tempo');
      if (s.tags?.some((t: string) => ['threshold','sweet_spot'].includes(t) && s.type === 'bike')) keyTypes.push('bike_threshold');
      if (s.tags?.includes('long_ride'))                                  keyTypes.push('bike_long');
      if (s.tags?.includes('swim_intervals'))                             keyTypes.push('swim_endurance');
      if (s.type === 'strength')                                          keyTypes.push('strength');
    }

    const summary = plan.weekly_summaries?.[String(w)];
    const taperPhase = phaseStructure.phases.find((p: any) => p.name === 'Taper');
    const isTaper = taperPhase && w >= taperPhase.start_week;

    weekIntents.push({
      week_index:       w,
      focus_code:       phase === 'recovery' ? 'recovery' : phase === 'taper' ? 'taper' : phase === 'peak' ? 'peak_race_prep' : phase === 'base' ? 'base_aerobic' : 'build_vo2_speed',
      focus_label:      summary?.focus ?? phase,
      disciplines:      ['swim', 'bike', 'run'],
      key_session_types: [...new Set(keyTypes)],
      hard_cap:         4,
      taper_multiplier: isTaper ? (taperPhase.volume_multiplier ?? 0.55) : undefined,
    });
  }

  const disciplines = ['swim', 'bike', 'run'];
  if ((request.strength_frequency ?? 0) > 0) disciplines.push('strength');

  return {
    version:        1,
    plan_type:      'tri',
    start_date:     startDate,
    duration_weeks: duration,
    week_start:     'mon',
    phase_by_week:  phaseByWeek,
    week_intent_by_week: weekIntents,
    policies: {
      max_hard_per_week: 4,
      min_rest_gap_days: 1,
    },
    goal: {
      event_type: request.distance,
      event_date: request.race_date ?? undefined,
      target:     request.race_name ?? undefined,
    },
    workload_model: {
      unit:                'load_points',
      include_disciplines: disciplines,
    },
    schedule_preferences: {
      long_ride_day: 'sat',
      long_run_day:  'sun',
    },
  };
}

// ============================================================================
// PREVIEW
// ============================================================================

function buildPreview(plan: any, phaseStructure: any, distance: TriDistance): TriPlanPreview {
  let totalMins = 0;
  let peakMins  = 0;
  let weekCount = 0;

  for (const sessions of Object.values(plan.sessions_by_week) as any[][]) {
    const weekMins = sessions.reduce((s: number, w: any) => s + (w.duration ?? 0), 0);
    totalMins += weekMins;
    if (weekMins > peakMins) peakMins = weekMins;
    weekCount++;
  }

  const avgHr  = Math.round((totalMins / Math.max(1, weekCount)) / 60 * 10) / 10;
  const peakHr = Math.round(peakMins / 60 * 10) / 10;

  const race = TRI_RACE_DISTANCES[distance];

  const phaseBreakdown = phaseStructure.phases.map((p: any) => ({
    name:  p.name,
    weeks: p.start_week === p.end_week ? `${p.start_week}` : `${p.start_week}–${p.end_week}`,
    focus: p.focus,
  }));

  return {
    name:              plan.name,
    description:       plan.description,
    duration_weeks:    plan.duration_weeks,
    peak_hours_per_week:  `${peakHr}h`,
    avg_hours_per_week:   `${avgHr}h`,
    phase_breakdown:   phaseBreakdown,
    disciplines:       ['Swim', 'Bike', 'Run'],
  };
}

// ============================================================================
// DATE HELPERS
// ============================================================================

function calculateStartDate(durationWeeks: number, raceDate?: string): string {
  if (raceDate) {
    const race = new Date(raceDate + 'T12:00:00');
    const dow  = race.getDay();
    race.setDate(race.getDate() + (dow === 0 ? -6 : 1 - dow)); // Monday of race week
    race.setDate(race.getDate() - (durationWeeks - 1) * 7);
    return toISO(race);
  }
  const today = new Date();
  const dow   = today.getDay();
  today.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toISO(today);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
