// Edge Function: generate-run-plan
// 
// Purpose: Generate personalized run training plans based on user parameters
// Supports 2 training approaches:
// - Simple Completion (Hal Higdon inspired) - for completion goals
// - Balanced Build (Jack Daniels inspired) - for time/speed goals

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { 
  GeneratePlanRequest, 
  GeneratePlanResponse,
  PlanPreview,
  PhaseInfo,
  TrainingPlan
} from './types.ts';
import { validateRequest, validatePlanSchema, validateTokens, detectScheduleConflicts } from './validation.ts';
import { SimpleCompletionGenerator } from './generators/simple-completion.ts';
import { BalancedBuildGenerator } from './generators/balanced-build.ts';
import { overlayStrength } from './strength-overlay.ts';
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
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid request',
          validation_errors: requestValidation.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate Effort Score for Balanced Build plans
    let effortScore: number | undefined;
    let effortPaces: TrainingPaces | undefined;
    
    if (request.approach === 'balanced_build') {
      // Use provided score (from wizard) or calculate from race data
      if (request.effort_score) {
        effortScore = request.effort_score;
        console.log(`[EffortScore] Using provided score: ${effortScore}`);
      } else if (request.effort_source_distance && request.effort_source_time) {
        effortScore = calculateEffortScore(
          request.effort_source_distance,
          request.effort_source_time
        );
        console.log(`[EffortScore] Calculated from race: ${effortScore}`);
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
      effort_score: effortScore,
      effort_paces: effortPaces
    };

    let plan: TrainingPlan;
    let phaseStructure;

    switch (request.approach) {
      case 'simple_completion': {
        const generator = new SimpleCompletionGenerator(generatorParams);
        plan = generator.generatePlan();
        phaseStructure = generator['determinePhaseStructure']();
        break;
      }
      case 'balanced_build': {
        const generator = new BalancedBuildGenerator(generatorParams);
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
      const tier = request.strength_tier || 'injury_prevention';
      const equipment = request.equipment_type || 'home_gym';
      plan = overlayStrength(plan, request.strength_frequency as 2 | 3, phaseStructure, tier, equipment);
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
          approach: request.approach,
          distance: request.distance,
          fitness: request.fitness,
          goal: request.goal,
          days_per_week: request.days_per_week,
          strength_frequency: request.strength_frequency || 0,
          user_selected_start_date: startDate,
          race_date: request.race_date || null,
          effort_score: effortScore || null,
          target_time: effortScore && request.distance ? getTargetTime(effortScore, request.distance) : null,
          baselines_required: plan.baselines_required,
          units: plan.units,
          weekly_summaries: plan.weekly_summaries
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

    // Save Effort Score and paces to user_baselines (for Balanced Build plans)
    if (request.approach === 'balanced_build' && effortScore && effortPaces) {
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
