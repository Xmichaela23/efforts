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
// OUTPUT: { success: boolean, analysis: object, performance_assessment: string, insights: string[], strengths: string[] }
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

    // Step 2: Call discipline-specific analysis functions directly
    let analysisResult = null;
    
    if (workout.type === 'run' || workout.type === 'running') {
      console.log('🏃 Calling analyze-running-workout directly...');
      const { data: runningAnalysis, error: runningError } = await supabase.functions.invoke('analyze-running-workout', {
        body: { workout_id }
      });
      
      if (runningError) {
        console.error('❌ Running analysis failed:', runningError.message);
        throw new Error(`Running analysis failed: ${runningError.message}`);
      }
      
      analysisResult = runningAnalysis.analysis;
    } else if (workout.type === 'strength') {
      console.log('💪 Calling analyze-strength-workout directly...');
      const { data: strengthAnalysis, error: strengthError } = await supabase.functions.invoke('analyze-strength-workout', {
        body: { workout_id }
      });
      
      if (strengthError) {
        console.error('❌ Strength analysis failed:', strengthError.message);
        throw new Error(`Strength analysis failed: ${strengthError.message}`);
      }
      
      analysisResult = strengthAnalysis.analysis;
    } else {
      // For other workout types, return basic structure
      analysisResult = {
        analysis: {
          execution_quality: {
            performance_assessment: 'Unable to assess',
            primary_issues: [`No analyzer available for ${workout.type} workouts`],
            strengths: []
          }
        }
      };
    }

    // Step 3: Format response (server-side formatting)
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
  // Handle direct response from discipline-specific functions
  if (workoutType === 'run' || workoutType === 'running') {
    if (analysisResult) {
      return {
        analysis: analysisResult,
        performance_assessment: analysisResult.performance_assessment,
        insights: analysisResult.primary_issues || [],
        key_metrics: {
          adherence_percentage: analysisResult.adherence_percentage,
          time_in_range_s: analysisResult.time_in_range_s,
          time_outside_range_s: analysisResult.time_outside_range_s
        },
        red_flags: analysisResult.primary_issues || [],
        strengths: analysisResult.strengths || []
      };
    } else {
      // No analysis available
      return {
        analysis: {
          execution_quality: {
            performance_assessment: 'Unable to assess',
            primary_issues: ['No analysis available'],
            strengths: []
          }
        },
        performance_assessment: null,
        insights: [],
        key_metrics: null,
        red_flags: [],
        strengths: []
      };
    }
  }

  // For other workout types, return the analysis result directly
  return {
    analysis: analysisResult || {
      execution_quality: {
        performance_assessment: 'Unable to assess',
        primary_issues: [`No analyzer available for ${workoutType} workouts`],
        strengths: []
      }
    },
    performance_assessment: analysisResult?.performance_assessment || null,
    insights: analysisResult?.primary_issues || [],
    key_metrics: analysisResult || null,
    red_flags: analysisResult?.primary_issues || [],
    strengths: analysisResult?.strengths || []
  };
}