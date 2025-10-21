import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// ANALYZE-WORKOUT - MASTER ORCHESTRATOR EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-workout
// PURPOSE: Master orchestrator for all workout analysis
// 
// WHAT IT DOES:
// - This is the ONLY function the client should call
// - Routes workouts to appropriate sport-specific analyzers
// - Orchestrates compute-workout-summary and calculate-workout-metrics
// - Handles all business logic server-side (smart server architecture)
// - Formats responses consistently across all workout types
// 
// SUPPORTED WORKOUT TYPES:
// - run/running → analyze-running-workout
// - ride/cycling/bike → analyze-cycling-workout (future)
// - swim/swimming → analyze-swimming-workout (future)
// - strength/strength_training → analyze-strength-workout
// 
// CLIENT USAGE:
// - Single function call: supabase.functions.invoke('analyze-workout', { body: { workout_id } })
// - No business logic in client (dumb client architecture)
// 
// DATA FLOW:
// Client → analyze-workout → compute-workout-summary → calculate-workout-metrics → sport-specific-analyzer → workouts.workout_analysis
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: object, execution_grade: string, insights: string[], strengths: string[] }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { workout_id } = await req.json();

    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`🎯 MASTER ORCHESTRATOR: Analyzing workout ${workout_id}`);

    // Step 1: Get workout details (server-side)
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select('id, type, computed, calculated_metrics, planned_id')
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      console.error('Error loading workout:', workoutError?.message);
      return new Response(JSON.stringify({ error: 'Workout not found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log(`📊 Workout type: ${workout.type}`);

    // Step 2: Ensure foundation exists (server-side orchestration)
    if (!workout.computed) {
      console.log('🔄 Running compute-workout-analysis...');
      const { error: computeError } = await supabase.functions.invoke('compute-workout-analysis', {
        body: { workout_id }
      });
      
      if (computeError) {
        throw new Error(`Compute-workout-analysis failed: ${computeError.message}`);
      }
    }

    // Step 3: Ensure metrics are calculated (server-side orchestration)
    if (!workout.calculated_metrics) {
      console.log('📊 Running calculate-workout-metrics...');
      const { error: metricsError } = await supabase.functions.invoke('calculate-workout-metrics', {
        body: { workout_id }
      });
      
      if (metricsError) {
        console.warn('Metrics calculation failed, continuing with analysis:', metricsError.message);
      }
    }

    // Step 4: Get the analysis results from compute-workout-analysis
    // The granular analysis is now built into compute-workout-analysis
    const { data: workoutWithAnalysis, error: fetchError } = await supabase
      .from('workouts')
      .select('workout_analysis, computed, calculated_metrics')
      .eq('id', workout_id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch analysis results: ${fetchError.message}`);
    }

    // Step 5: Format response (server-side formatting)
    const formattedResponse = formatAnalysisResponse(workoutWithAnalysis, workout.type);

    console.log(`✅ Analysis complete for ${workout.type} workout`);

    return new Response(JSON.stringify({
      success: true,
      ...formattedResponse
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Master orchestrator error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

/**
 * Server-side routing logic
 */
function getAnalyzerFunction(workoutType: string): string | null {
  const analyzerMap: Record<string, string> = {
    'run': 'analyze-running-workout',
    'running': 'analyze-running-workout',
    'ride': 'analyze-cycling-workout',
    'cycling': 'analyze-cycling-workout',
    'bike': 'analyze-cycling-workout',
    'swim': 'analyze-swimming-workout',
    'swimming': 'analyze-swimming-workout',
    'strength': 'analyze-strength-workout',
    'strength_training': 'analyze-strength-workout'
  };

  return analyzerMap[workoutType?.toLowerCase()] || null;
}

/**
 * Server-side response formatting
 */
function formatAnalysisResponse(workoutData: any, workoutType: string) {
  const workoutAnalysis = workoutData.workout_analysis;
  
  // For running workouts, format the granular analysis
  if (workoutType === 'run' || workoutType === 'running') {
    if (workoutAnalysis) {
      return {
        analysis: {
          adherence_percentage: workoutAnalysis.adherence_percentage,
          execution_grade: workoutAnalysis.execution_grade,
          primary_issues: workoutAnalysis.primary_issues || [],
          strengths: workoutAnalysis.strengths || [],
          workout_type: workoutAnalysis.workout_type
        },
        execution_grade: workoutAnalysis.execution_grade,
        insights: workoutAnalysis.primary_issues || [],
        key_metrics: {
          adherence_percentage: workoutAnalysis.adherence_percentage,
          time_in_range_s: workoutAnalysis.time_in_range_s,
          time_outside_range_s: workoutAnalysis.time_outside_range_s
        },
        red_flags: workoutAnalysis.primary_issues || [],
        strengths: workoutAnalysis.strengths || []
      };
    } else {
      // No analysis available
      return {
        analysis: {
          execution_quality: {
            overall_grade: 'N/A',
            primary_issues: ['No analysis available'],
            strengths: []
          }
        },
        execution_grade: null,
        insights: [],
        key_metrics: null,
        red_flags: [],
        strengths: []
      };
    }
  }

  // For other workout types, return basic structure
  return {
    analysis: workoutAnalysis || {
      execution_quality: {
        overall_grade: 'N/A',
        primary_issues: [`No analyzer available for ${workoutType} workouts`],
        strengths: []
      }
    },
    execution_grade: workoutAnalysis?.execution_grade || null,
    insights: workoutAnalysis?.primary_issues || [],
    key_metrics: workoutAnalysis || null,
    red_flags: workoutAnalysis?.primary_issues || [],
    strengths: workoutAnalysis?.strengths || []
  };
}