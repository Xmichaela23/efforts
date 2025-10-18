import { supabase } from '../lib/supabase';

/**
 * Workout Analysis Service
 * Routes workouts to the appropriate analysis function based on workout type
 */

export interface WorkoutAnalysisResult {
  status: string;
  insights?: string[];
  key_metrics?: any;
  red_flags?: string[];
  execution_grade?: string | null;
  [key: string]: any;
}

/**
 * Determines the correct analysis function based on workout type
 */
function getAnalysisFunction(workoutType: string): string {
  switch (workoutType) {
    case 'strength':
    case 'strength_training':
      return 'analyze-strength-workout';
    case 'run':
    case 'running':
      return 'analyze-running-workout'; // Future: dedicated running function
    case 'ride':
    case 'cycling':
    case 'bike':
      return 'analyze-cycling-workout'; // Future: dedicated cycling function
    case 'swim':
    case 'swimming':
      return 'analyze-swimming-workout'; // Future: dedicated swimming function
    default:
      return 'analyze-workout'; // Fallback to general function
  }
}

/**
 * Analyzes a workout using the appropriate function
 */
export async function analyzeWorkout(workoutId: string, workoutType?: string): Promise<WorkoutAnalysisResult> {
  try {
    // If workout type not provided, fetch it
    let type = workoutType;
    if (!type) {
      const { data: workout, error } = await supabase
        .from('workouts')
        .select('type')
        .eq('id', workoutId)
        .single();
      
      if (error) {
        throw new Error(`Failed to fetch workout type: ${error.message}`);
      }
      
      type = workout.type;
    }
    
    // Determine the correct function
    const functionName = getAnalysisFunction(type);
    
    console.log(`🔍 ROUTING: ${type} workout to ${functionName}`);
    
    // Call the appropriate function
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { workout_id: workoutId }
    });
    
    if (error) {
      throw new Error(`Analysis error: ${error.message}`);
    }
    
    return data;
    
  } catch (error) {
    console.error('Workout analysis failed:', error);
    throw error;
  }
}

/**
 * Analyzes a workout with retry logic
 */
export async function analyzeWorkoutWithRetry(
  workoutId: string, 
  workoutType?: string, 
  maxRetries: number = 2
): Promise<WorkoutAnalysisResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeWorkout(workoutId, workoutType);
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
 * Checks if a workout type is supported for analysis
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
 * Gets the display name for an analysis function
 */
export function getAnalysisFunctionDisplayName(functionName: string): string {
  const displayNames: Record<string, string> = {
    'analyze-strength-workout': 'Strength Analysis',
    'analyze-running-workout': 'Running Analysis',
    'analyze-cycling-workout': 'Cycling Analysis',
    'analyze-swimming-workout': 'Swimming Analysis',
    'analyze-workout': 'General Analysis'
  };
  
  return displayNames[functionName] || 'Unknown Analysis';
}
