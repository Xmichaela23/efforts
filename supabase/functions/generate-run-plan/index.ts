// Edge Function: generate-run-plan
// 
// Purpose: Generate personalized run training plans based on user parameters
// Supports 2 training approaches:
// - Sustainable (Hal Higdon inspired) - for completion goals
// - Performance Build (Jack Daniels inspired) - for time/speed goals

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { 
  GeneratePlanRequest, 
  GeneratePlanResponse,
  PlanPreview,
  PhaseInfo,
  TrainingPlan,
  PlanContractV1,
  PlanContractPhase,
  PlanContractKeySessionType,
  PlanContractWeekIntent,
  PhaseStructure
} from './types.ts';
import { validateRequest, validatePlanSchema, validateTokens, detectScheduleConflicts } from './validation.ts';
import { SustainableGenerator } from './generators/sustainable.ts';
import { PerformanceBuildGenerator } from './generators/performance-build.ts';
import { overlayStrength, overlayStrengthLegacy } from './strength-overlay.ts';
import { mapApproachToMethodology } from '../shared/strength-system/placement/strategy.ts';
import { addTimingLogic } from './timing-logic.ts';
import { 
  calculateEffortScore, 
  getPacesFromScore, 
  estimateScoreFromFitness,
  getTargetTime,
  type TrainingPaces 
} from './effort-score.ts';

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const request: GeneratePlanRequest = await req.json();
    
    // Validate request
    const requestValidation = validateRequest(request);
    if (!requestValidation.valid) {
      // Log canonical protocol for 400 rejects (for debugging/analytics)
      const protocolId = request.strength_protocol || 'none';
      console.error(`[PlanGen] Validation failed (protocol: ${protocolId}):`, requestValidation.errors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request',
          validation_errors: requestValidation.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate Effort Score for Performance Build plans
    let effortScore: number | undefined;
    let effortPaces: TrainingPaces | undefined;
    
    if (request.approach === 'performance_build') {
      // SMART SERVER: Prioritize raw data over pre-calculated values
      // Calculate from raw race/5K time if provided (source of truth)
      if (request.effort_source_distance && request.effort_source_time) {
        effortScore = calculateEffortScore(
          request.effort_source_distance,
          request.effort_source_time
        );
        console.log(`[EffortScore] Calculated from raw data (${request.effort_source_distance}m in ${request.effort_source_time}s): ${effortScore}`);
      } else if (request.effort_score) {
        // Fallback to provided score (for manual entry or when raw data unavailable)
        effortScore = request.effort_score;
        console.log(`[EffortScore] Using provided score: ${effortScore}`);
      } else {
        // Fallback to estimate from fitness level
        effortScore = estimateScoreFromFitness(request.fitness);
        console.log(`[EffortScore] Estimated from fitness: ${effortScore}`);
      }
      
      // Use provided paces (may be manually edited) or calculate from score
      if (request.effort_paces) {
        effortPaces = request.effort_paces;
        console.log(`[EffortScore] Using provided paces (source: ${request.effort_paces_source || 'unknown'})`);
      } else {
        // effortScore is guaranteed to be set at this point (set above in lines 79-93)
        if (effortScore === undefined) {
          console.error('[EffortScore] effortScore is undefined - this should not happen');
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Failed to calculate effort score. Please provide a race time or effort score.',
              validation_errors: ['Missing effort_score - required for performance_build plans']
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        effortPaces = getPacesFromScore(effortScore);
        console.log(`[EffortScore] Calculated paces from score`);
      }
      console.log(`[EffortScore] Paces - Base: ${effortPaces.base}s/mi, Race: ${effortPaces.race}s/mi`);
    }

    // Calculate start date early so generators can use it for race-day-aware tapering
    const startDate = request.start_date || calculateStartDate(request.duration_weeks, request.race_date);

    // Select and run generator
    const generatorParams = {
      distance: request.distance,
      fitness: request.fitness,
      goal: request.goal,
      duration_weeks: request.duration_weeks,
      days_per_week: request.days_per_week,
      user_id: request.user_id,
      start_date: startDate,
      race_date: request.race_date,
      race_name: request.race_name,
      current_weekly_miles: request.current_weekly_miles,
      effort_score: effortScore,
      effort_paces: effortPaces
    };

    let plan: TrainingPlan;
    let phaseStructure;

    switch (request.approach) {
      case 'sustainable': {
        const generator = new SustainableGenerator(generatorParams);
        plan = generator.generatePlan();
        phaseStructure = generator['determinePhaseStructure']();
        break;
      }
      case 'performance_build': {
        // Validate that effort_paces.race exists (required for M pace calculations)
        if (!effortPaces?.race) {
          console.error('[PlanGen] Missing effort_paces.race for performance_build plan');
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Performance build plans require race pace data (effort_paces.race). Please provide a race time or effort score.',
              validation_errors: ['Missing effort_paces.race - required for M pace calculations']
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const generator = new PerformanceBuildGenerator(generatorParams);
        plan = generator.generatePlan();
        phaseStructure = generator['determinePhaseStructure']();
        break;
      }
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown approach: ${request.approach}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Apply strength overlay if requested
    if (request.strength_frequency && request.strength_frequency > 0) {
      try {
        const tier = request.strength_tier || 'injury_prevention';
        const equipment = request.equipment_type || 'home_gym';
        
        // Protocol ID is already normalized to canonical format by validation
        // Only use protocol if tier is strength_power (validation ensures this)
        const protocolId = (tier === 'strength_power' && request.strength_protocol) 
          ? request.strength_protocol 
          : undefined;
        
        // Log canonical protocol at generation (for analytics/debugging)
        if (protocolId) {
          console.log(`[PlanGen] Applying strength protocol: ${protocolId} (tier: ${tier}, frequency: ${request.strength_frequency})`);
        }
        
        // Map approach to methodology for placement strategy
        const methodology = request.approach ? mapApproachToMethodology(request.approach) : undefined;
        const noDoubles = request.no_doubles || false; // Default to allowing doubles
        
        // Use legacy function to map old tier names ('injury_prevention', 'strength_power') to new ('bodyweight', 'barbell')
        plan = overlayStrengthLegacy(plan, request.strength_frequency as 2 | 3, phaseStructure, tier, equipment, protocolId, methodology, noDoubles);
      } catch (error: any) {
        // Protocol validation error - log canonical protocol for debugging
        const protocolId = request.strength_protocol || 'none';
        console.error(`[PlanGen] Invalid strength_protocol: ${protocolId}`, error);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error.message || 'Invalid strength_protocol'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Add AM/PM timing logic for double days (run + strength on same day)
    if (request.strength_frequency && request.strength_frequency > 0) {
      plan = addTimingLogic(plan);
    }

    // Validate generated plan
    const schemaValidation = validatePlanSchema(plan);
    if (!schemaValidation.valid) {
      console.error('Plan schema validation failed:', schemaValidation.errors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Generated plan failed validation',
          validation_errors: schemaValidation.errors 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Token validation (warnings only)
    const tokenValidation = validateTokens(plan);
    if (tokenValidation.warnings?.length) {
      console.warn('Token validation warnings:', tokenValidation.warnings);
    }

    // Conflict detection (warnings)
    const conflicts = detectScheduleConflicts(plan);
    if (conflicts.length > 0) {
      console.warn('Schedule conflicts detected:', conflicts);
    }

    // Build plan_contract_v1 (Context handshake - single stored contract)
    const plan_contract_v1 = buildPlanContractV1(plan, phaseStructure, request, startDate);

    // Save plan to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // startDate was already calculated above for the generator

    const { data: insertedPlan, error: insertError } = await supabase
      .from('plans')
      .insert({
        user_id: request.user_id,
        name: plan.name,
        description: plan.description,
        duration_weeks: plan.duration_weeks,
        current_week: 1,
        status: 'active', // Plan is active, activate-plan will create workouts
        plan_type: 'generated',
        config: {
          source: 'generated',
          plan_version: 'strength_protocols_v1', // Version stamp for plan structure
          approach: request.approach,
          distance: request.distance,
          fitness: request.fitness,
          goal: request.goal,
          days_per_week: request.days_per_week,
          strength_frequency: request.strength_frequency || 0,
          strength_tier: request.strength_tier || null,
          strength_protocol: request.strength_protocol || null, // Canonical protocol ID
          user_selected_start_date: startDate,
          race_date: request.race_date || null,
          race_name: request.race_name || null,
          effort_score: effortScore || null,
          // Use actual race pace from effort_paces.race (user's VDOT/goal) × distance
          // NOT VDOT table lookup - ensures consistency with race day generation
          target_time: request.effort_paces?.race && request.distance ? (() => {
            const raceDistanceMiles: Record<string, number> = {
              '5k': 3.10686,
              '10k': 6.21371,
              'half': 13.1,
              'marathon': 26.2
            };
            const distanceMiles = raceDistanceMiles[request.distance.toLowerCase()];
            if (distanceMiles) {
              // effort_paces.race is in seconds per mile, so: distance × pace = total seconds
              return Math.round(distanceMiles * request.effort_paces.race);
            }
            // Fallback to VDOT table if no race pace available
            return effortScore ? getTargetTime(effortScore, request.distance) : null;
          })() : (effortScore && request.distance ? getTargetTime(effortScore, request.distance) : null),
          baselines_required: plan.baselines_required,
          units: plan.units,
          weekly_summaries: plan.weekly_summaries,
          plan_contract_v1
        },
        sessions_by_week: plan.sessions_by_week,
        notes_by_week: {},
        weeks: []
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to save plan:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save plan', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save Effort Score and paces to user_baselines (for Performance Build plans)
    if (request.approach === 'performance_build' && effortScore && effortPaces) {
      const { error: baselinesError } = await supabase
        .from('user_baselines')
        .upsert({
          user_id: request.user_id,
          effort_score: effortScore,
          effort_source_distance: request.effort_source_distance || null,
          effort_source_time: request.effort_source_time || null,
          effort_score_status: request.effort_score_status || 'estimated',
          effort_paces: effortPaces,
          effort_paces_source: request.effort_paces_source || 'calculated',
          effort_updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (baselinesError) {
        console.warn('Failed to save Effort Score to baselines:', baselinesError);
        // Non-fatal - continue with plan generation
      } else {
        console.log(`[EffortScore] Saved to user_baselines: ${effortScore}, paces_source: ${request.effort_paces_source || 'calculated'}`);
      }
    }

    // Generate preview
    const preview = generatePreview(plan, phaseStructure);

    const response: GeneratePlanResponse = {
      success: true,
      plan_id: insertedPlan.id,
      preview
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating plan:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build plan_contract_v1 for Context handshake.
 * Every generator writes the same shape; Context reads only this. No inference.
 */
function buildPlanContractV1(
  plan: TrainingPlan,
  phaseStructure: PhaseStructure,
  request: GeneratePlanRequest,
  startDate: string
): PlanContractV1 {
  const duration = plan.duration_weeks;
  const phaseByName = (weekNum: number): PlanContractPhase => {
    if (phaseStructure.recovery_weeks.includes(weekNum)) return 'recovery';
    for (const p of phaseStructure.phases) {
      if (weekNum >= p.start_week && weekNum <= p.end_week) {
        const n = p.name.toLowerCase().trim();
        if (n === 'base') return 'base';
        if (n === 'speed') return 'build';
        if (n.includes('race prep')) return 'peak';
        if (n === 'taper') return 'taper';
        return 'build';
      }
    }
    return 'build';
  };

  const phase_by_week: PlanContractPhase[] = [];
  for (let w = 1; w <= duration; w++) phase_by_week.push(phaseByName(w));

  const week_intent_by_week: PlanContractWeekIntent[] = [];
  const summaries = plan.weekly_summaries || {};
  const taperPhase = phaseStructure.phases.find((p: { name: string }) => p.name === 'Taper');
  const taperMultipliers: Record<number, number> = {};
  if (taperPhase) {
    for (let w = taperPhase.start_week; w <= taperPhase.end_week; w++) {
      taperMultipliers[w] = taperPhase.volume_multiplier ?? 0.6;
    }
  }

  for (let weekIndex = 1; weekIndex <= duration; weekIndex++) {
    const summary = summaries[String(weekIndex)];
    const phase = phase_by_week[weekIndex - 1];
    const focus_label = summary?.focus ?? (phase === 'recovery' ? 'Recovery Week' : 'Training week');
    const focus_code = focusLabelToCode(focus_label, phase);
    const sessions = plan.sessions_by_week?.[String(weekIndex)] ?? [];
    const key_session_types = deriveKeySessionTypes(sessions);
    const isTaper = phase === 'taper';
    week_intent_by_week.push({
      week_index: weekIndex,
      focus_code,
      focus_label,
      disciplines: ['run'],
      key_session_types,
      hard_cap: 3,
      taper_multiplier: isTaper ? (taperMultipliers[weekIndex] ?? 0.6) : undefined
    });
  }

  const strengthEnabled = (request.strength_frequency ?? 0) > 0;
  const workload_disciplines = strengthEnabled ? ['run', 'strength'] : ['run'];

  return {
    version: 1,
    plan_type: 'run',
    start_date: startDate,
    duration_weeks: duration,
    week_start: 'mon',
    phase_by_week,
    week_intent_by_week,
    policies: {
      max_hard_per_week: 3,
      min_rest_gap_days: 1,
      taper_multipliers: Object.keys(taperMultipliers).length > 0 ? taperMultipliers : undefined
    },
    strength: strengthEnabled
      ? {
          enabled: true,
          protocol_id: request.strength_protocol ?? undefined,
          frequency_per_week: request.strength_frequency ?? undefined,
          intent: request.strength_tier === 'strength_power' ? 'neural' : 'durability',
          priority: 'support'
        }
      : undefined,
    goal: {
      event_type: request.distance ?? undefined,
      event_date: request.race_date ?? undefined,
      target: request.race_name ?? undefined
    },
    workload_model: {
      unit: 'load_points',
      include_disciplines: workload_disciplines
    }
  };
}

function focusLabelToCode(label: string, phase: PlanContractPhase): string {
  const l = label.toLowerCase();
  if (l.includes('recovery')) return 'recovery';
  if (l.includes('taper') || phase === 'taper') return 'taper';
  if (l.includes('vo2') || l.includes('speed')) return 'build_vo2_speed';
  if (l.includes('race prep') || l.includes('race-specific')) return 'peak_race_prep';
  if (l.includes('aerobic') || l.includes('foundation')) return 'base_aerobic';
  return phase === 'base' ? 'base_aerobic' : phase === 'peak' ? 'peak_race_prep' : 'build_vo2_speed';
}

function deriveKeySessionTypes(sessions: { tags?: string[]; type?: string }[]): PlanContractKeySessionType[] {
  const out: PlanContractKeySessionType[] = [];
  for (const s of sessions) {
    const tags = s.tags ?? [];
    if (tags.includes('long_run')) out.push('run_long');
    if (tags.some(t => t === 'intervals' || t === 'hard_run')) out.push('run_intervals');
    if (tags.some(t => t === 'tempo' || t === 'threshold')) out.push('run_tempo');
    if (s.type === 'strength') out.push('strength');
  }
  return [...new Set(out)];
}

/**
 * Calculate plan start date
 */
function calculateStartDate(durationWeeks: number, raceDate?: string): string {
  if (raceDate) {
    // Start date = race date - duration weeks
    const race = new Date(raceDate);
    race.setDate(race.getDate() - (durationWeeks * 7));
    // Adjust to Monday
    const day = race.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    race.setDate(race.getDate() + diff);
    return toISO(race);
  }

  // Default: next Monday
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  today.setDate(today.getDate() + daysUntilMonday);
  return toISO(today);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Generate plan preview for UI
 */
function generatePreview(plan: TrainingPlan, phaseStructure: any): PlanPreview {
  // Calculate totals
  let totalMinutes = 0;
  let qualitySessionsPerWeek = 0;
  let peakLongRun = 0;
  let weekCount = 0;

  for (const sessions of Object.values(plan.sessions_by_week)) {
    weekCount++;
    for (const session of sessions as any[]) {
      totalMinutes += session.duration || 0;
      
      if (session.tags?.some((t: string) => ['hard_run', 'intervals', 'tempo', 'threshold'].includes(t))) {
        qualitySessionsPerWeek++;
      }
      
      if (session.tags?.includes('long_run')) {
        const longRunMin = session.duration || 0;
        const estimatedMiles = longRunMin / 9; // Rough estimate
        if (estimatedMiles > peakLongRun) {
          peakLongRun = estimatedMiles;
        }
      }
    }
  }

  const avgMinutesPerWeek = totalMinutes / weekCount;
  const avgHoursPerWeek = avgMinutesPerWeek / 60;
  qualitySessionsPerWeek = Math.round(qualitySessionsPerWeek / weekCount);

  // Estimate volumes (rough conversion from minutes to miles)
  const avgPace = 9; // minutes per mile assumption
  const avgMilesPerWeek = avgMinutesPerWeek / avgPace;

  // Generate phase breakdown
  const phaseBreakdown: PhaseInfo[] = phaseStructure.phases.map((p: any) => ({
    name: p.name,
    weeks: p.start_week === p.end_week 
      ? `${p.start_week}` 
      : `${p.start_week}-${p.end_week}`,
    focus: p.focus
  }));

  return {
    name: plan.name,
    description: plan.description,
    duration_weeks: plan.duration_weeks,
    starting_volume_mpw: Math.round(avgMilesPerWeek * 0.7),
    peak_volume_mpw: Math.round(avgMilesPerWeek * 1.1),
    quality_sessions_per_week: qualitySessionsPerWeek,
    long_run_peak_miles: Math.round(peakLongRun),
    estimated_hours_per_week: `${avgHoursPerWeek.toFixed(1)}-${(avgHoursPerWeek * 1.2).toFixed(1)}`,
    phase_breakdown: phaseBreakdown
  };
}
