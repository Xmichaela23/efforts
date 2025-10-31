import { supabase } from '../lib/supabase';

/**
 * DUMB CLIENT - Workout Analysis Service
 * All business logic moved to server-side master orchestrator
 * Client only calls the master function and displays results
 */

export interface WorkoutAnalysisResult {
  success: boolean;
  analysis?: any;
  performance_assessment?: string | null;
  insights?: string[];
  key_metrics?: any;
  red_flags?: string[];
  strengths?: string[];
  [key: string]: any;
}

/**
 * DUMB CLIENT: Analyzes a workout by calling discipline-specific functions directly
 * Client knows workout type and routes to appropriate analyzer
 */
export async function analyzeWorkout(workoutId: string, workoutType: string): Promise<WorkoutAnalysisResult> {
  try {
    const functionName = getAnalysisFunction(workoutType);
    console.log(`🎯 DUMB CLIENT: Calling ${functionName} for workout ${workoutId} (type: ${workoutType})`);
    
    // Call discipline-specific function directly
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { workout_id: workoutId }
    });
    
    if (error) {
      throw new Error(`Analysis error: ${error.message}`);
    }
    
    // Extract the analysis results from the discipline function response
    return {
      success: true,
      analysis: data.analysis,
      performance_assessment: data.performance_assessment,
      insights: data.insights || [],
      key_metrics: data.key_metrics,
      red_flags: data.red_flags || [],
      strengths: data.strengths || [],
      detailed_analysis: data.detailed_analysis || null
    };
    
  } catch (error) {
    console.error('Workout analysis failed:', error);
    throw error;
  }
}

/**
 * Get the appropriate analysis function name based on workout type
 */
function getAnalysisFunction(type: string): string {
  switch (type.toLowerCase()) {
    case 'run':
    case 'running': 
      return 'analyze-running-workout';
    case 'strength':
    case 'strength_training': 
      return 'analyze-strength-workout';
    case 'ride':
    case 'cycling':
    case 'bike': 
      return 'analyze-cycling-workout';
    case 'swim':
    case 'swimming': 
      return 'analyze-swimming-workout';
    default: 
      throw new Error(`No analyzer available for workout type: ${type}`);
  }
}

/**
 * DUMB CLIENT: Analyzes a workout with retry logic
 * Calls discipline-specific functions directly
 */
export async function analyzeWorkoutWithRetry(
  workoutId: string, 
  workoutType: string,
  maxRetries: number = 2
): Promise<WorkoutAnalysisResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Analysis attempt ${attempt}/${maxRetries} for workout ${workoutId} (type: ${workoutType})`);
      return await analyzeWorkout(workoutId, workoutType);
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ Analysis attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`❌ All ${maxRetries} analysis attempts failed for workout ${workoutId}`);
  throw lastError || new Error('Analysis failed after all retries');
}

/**
 * DUMB CLIENT: Check if workout type is supported
 * This is just a display helper, not business logic
 */
export function isWorkoutTypeSupported(workoutType: string): boolean {
  const supportedTypes = [
    'strength', 'strength_training',
    'run', 'running',
    'ride', 'cycling', 'bike',
    'swim', 'swimming'
  ];
  
  return supportedTypes.includes(workoutType);
}

/**
 * DUMB CLIENT: Get display name for workout type
 * This is just a display helper, not business logic
 */
export function getWorkoutTypeDisplayName(workoutType: string): string {
  const displayNames: Record<string, string> = {
    'strength': 'Strength Training',
    'strength_training': 'Strength Training',
    'run': 'Running',
    'running': 'Running',
    'ride': 'Cycling',
    'cycling': 'Cycling',
    'bike': 'Cycling',
    'swim': 'Swimming',
    'swimming': 'Swimming'
  };
  
  return displayNames[workoutType] || 'Unknown Workout';
}
