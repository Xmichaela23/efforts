import { supabase } from '../lib/supabase';

/**
 * DUMB CLIENT - Workout Analysis Service
 * All business logic moved to server-side master orchestrator
 * Client only calls the master function and displays results
 */

export interface WorkoutAnalysisResult {
  success: boolean;
  analysis?: any;
  execution_grade?: string | null;
  insights?: string[];
  key_metrics?: any;
  red_flags?: string[];
  strengths?: string[];
  [key: string]: any;
}

/**
 * DUMB CLIENT: Analyzes a workout by calling the master orchestrator
 * All logic (routing, orchestration, formatting) happens server-side
 */
export async function analyzeWorkout(workoutId: string): Promise<WorkoutAnalysisResult> {
  try {
    console.log(`🎯 DUMB CLIENT: Calling analyze-workout for workout ${workoutId}`);
    
    // Call the master orchestrator that routes to appropriate analyzers
    const { data, error } = await supabase.functions.invoke('analyze-workout', {
      body: { workout_id: workoutId }
    });
    
    if (error) {
      throw new Error(`Analysis error: ${error.message}`);
    }
    
    return {
      success: true,
      analysis: data,
      execution_grade: null, // Will be read from workout_analysis
      insights: [],
      key_metrics: null,
      red_flags: [],
      strengths: []
    };
    
  } catch (error) {
    console.error('Workout analysis failed:', error);
    throw error;
  }
}

/**
 * DUMB CLIENT: Analyzes a workout with retry logic
 * Still just calls the master orchestrator
 */
export async function analyzeWorkoutWithRetry(
  workoutId: string, 
  maxRetries: number = 2
): Promise<WorkoutAnalysisResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeWorkout(workoutId);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Analysis attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
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
