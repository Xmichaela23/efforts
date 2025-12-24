/**
 * Generate AI-powered narrative insights from structured analysis data
 * Converts metrics and patterns into human-readable observations
 */

import { buildWorkoutContext } from './prompt-builders.ts';
import { buildAdherenceContext } from './prompt-builders.ts';
import { extractPlanContext } from './prompt-builders.ts';
import { extractPlannedPaceInfo } from './prompt-builders.ts';
import { buildPrompt } from './prompt-builders.ts';
import { callOpenAI } from './prompt-builders.ts';

export async function generateAINarrativeInsights(
  sensorData: any[],
  workout: any,
  plannedWorkout: any,
  granularAnalysis: any,
  performance: any,
  detailedAnalysis: any,
  userUnits: 'metric' | 'imperial' = 'imperial',
  supabase: any = null
): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiKey) {
    console.warn('⚠️ OPENAI_API_KEY not set, skipping AI narrative generation');
    return null;
  }

  console.log('🤖 [DEBUG] Building workout context for AI from sensor data...');
  
  // Build all context objects
  const workoutContext = buildWorkoutContext(workout, sensorData, userUnits);
  const adherenceContext = buildAdherenceContext(performance, granularAnalysis);
  const planContext = await extractPlanContext(plannedWorkout, workout, supabase);
  const plannedPaceInfo = extractPlannedPaceInfo(plannedWorkout, userUnits);
  
  // Detect workout type
  const hasIntervals = detectIntervalWorkout(plannedWorkout);
  
  console.log('🤖 [DEBUG] Final workoutContext for AI:', JSON.stringify(workoutContext, null, 2));
  console.log(`🔍 [INTERVAL DETECTION] hasIntervals: ${hasIntervals}`);
  
  // Build the prompt
  const prompt = buildPrompt(
    workoutContext,
    adherenceContext,
    planContext,
    plannedPaceInfo,
    hasIntervals,
    detailedAnalysis,
    granularAnalysis,
    plannedWorkout,
    workout
  );
  
  console.log('🤖 [DEBUG] Sending prompt to OpenAI with context:', {
    duration: workoutContext.duration_minutes,
    distance: workoutContext.distance,
    distance_unit: workoutContext.distance_unit,
    avg_pace: workoutContext.avg_pace,
    pace_unit: workoutContext.pace_unit,
    avg_hr: workoutContext.avg_heart_rate,
    max_hr: workoutContext.max_heart_rate
  });

  // Call OpenAI API
  const insights = await callOpenAI(openaiKey, prompt);
  
  console.log(`✅ Generated ${insights.length} AI narrative insights`);
  console.log('✅ First insight preview:', insights[0]?.substring(0, 100));
  
  return insights;
}

/**
 * Detect if this is an interval workout
 */
function detectIntervalWorkout(plannedWorkout: any): boolean {
  if (!plannedWorkout) return false;
  
  const steps = plannedWorkout?.computed?.steps || [];
  const workSteps = steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work' || step.step_type === 'interval') && 
    (step.pace_range || step.target_pace)
  );
  const recoverySteps = steps.filter((step: any) => 
    step.kind === 'recovery' || step.role === 'recovery'
  );
  
  // Multiple work segments = interval workout
  // OR explicit interval/repeat step_type
  // OR alternating work/recovery pattern (at least 2 work segments)
  return workSteps.length > 1 || 
    steps.some((step: any) => step.step_type === 'interval' || step.step_type === 'repeat') ||
    (workSteps.length >= 1 && recoverySteps.length >= 1 && steps.length > 2);
}

