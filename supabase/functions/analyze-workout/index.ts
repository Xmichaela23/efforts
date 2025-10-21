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

    // Step 4: Route to appropriate analyzer (server-side routing)
    const analyzerFunction = getAnalyzerFunction(workout.type);
    
    if (!analyzerFunction) {
      console.log(`⚠️ No analyzer for workout type: ${workout.type}`);
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          execution_quality: {
            overall_grade: 'N/A',
            primary_issues: [`No analyzer available for ${workout.type} workouts`],
            strengths: []
          }
        }
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log(`🔍 ROUTING: ${workout.type} → ${analyzerFunction}`);

    // Step 5: Call sport-specific analyzer (server-side execution)
    const { data: analysisResult, error: analysisError } = await supabase.functions.invoke(analyzerFunction, {
      body: { workout_id }
    });

    if (analysisError) {
      throw new Error(`Analysis failed: ${analysisError.message}`);
    }

    // Step 6: Format response (server-side formatting)
    const formattedResponse = formatAnalysisResponse(analysisResult, workout.type);

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
function formatAnalysisResponse(analysisResult: any, workoutType: string) {
  // For running workouts, format the granular analysis
  if (workoutType === 'run' || workoutType === 'running') {
    return {
      analysis: analysisResult.analysis,
      execution_grade: analysisResult.analysis?.execution_quality?.overall_grade,
      insights: analysisResult.analysis?.execution_quality?.primary_issues || [],
      key_metrics: analysisResult.analysis?.range_analysis || {},
      red_flags: analysisResult.analysis?.execution_quality?.primary_issues || [],
      strengths: analysisResult.analysis?.execution_quality?.strengths || []
    };
  }

  // For other workout types, return as-is
  return analysisResult;
}