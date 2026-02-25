/**
 * Unified workout metadata structure - single source of truth
 * 
 * This replaces scattered fields (rpe, notes, readiness) with a unified
 * JSONB structure stored in workout_metadata column.
 */

export type PilatesYogaSessionType = 
  | 'pilates_mat'
  | 'pilates_reformer'
  | 'yoga_flow'
  | 'yoga_restorative'
  | 'yoga_power'
  | 'other';

export type SessionFeeling = 
  | 'energizing'
  | 'challenging'
  | 'restorative'
  | 'frustrating'
  | 'flow_state';

export type Environment = 
  | 'studio'
  | 'home'
  | 'virtual'
  | 'outdoor';

export type FocusArea = 
  | 'core'
  | 'upper_body'
  | 'lower_body'
  | 'flexibility'
  | 'balance'
  | 'full_body';

export interface WorkoutMetadata {
  session_rpe?: number;  // Session RPE (1-10) - REQUIRED for pilates_yoga
  notes?: string;         // User notes about the workout
  readiness?: {           // Pre-workout readiness check-in
    energy: number;       // Energy level (1-10)
    soreness: number;     // Muscle soreness (1-10)
    sleep: number;        // Sleep hours (0-12)
  };
  // Pilates/Yoga specific fields
  session_type?: PilatesYogaSessionType;  // REQUIRED for pilates_yoga
  session_feeling?: SessionFeeling;       // Optional
  environment?: Environment;              // Optional
  is_heated?: boolean;                    // Optional (for yoga sessions)
  instructor?: string;                    // Optional
  focus_area?: FocusArea[];              // Optional
  studio_name?: string;                   // Optional - Studio or teacher name
  teacher_rating?: number;                // Optional - Teacher rating (1-10)
}

/**
 * Extract metadata from workout object
 * 
 * Server (backfill + trigger + get-week/workout-detail) ensures workout_metadata.session_rpe
 * is canonical. Client just reads - no merge logic (dumb client).
 */
export function getWorkoutMetadata(workout: any): WorkoutMetadata {
  return workout?.workout_metadata || {};
}

/**
 * Get session RPE from workout (with backward compatibility)
 * Run/ride: rpe column; strength/pilates: workout_metadata.session_rpe
 */
export function getSessionRPE(workout: any): number | undefined {
  const meta = getWorkoutMetadata(workout);
  const fromMeta = meta?.session_rpe;
  if (typeof fromMeta === 'number' && fromMeta >= 1 && fromMeta <= 10) return fromMeta;
  const fromCol = (workout as any)?.rpe ?? (workout as any)?.session_rpe;
  if (typeof fromCol === 'number' && fromCol >= 1 && fromCol <= 10) return fromCol;
  return undefined;
}

/**
 * Get notes from workout (with backward compatibility)
 */
export function getWorkoutNotes(workout: any): string | undefined {
  const meta = getWorkoutMetadata(workout);
  return meta.notes;
}

/**
 * Get readiness data from workout (with backward compatibility)
 */
export function getWorkoutReadiness(workout: any): { energy: number; soreness: number; sleep: number } | undefined {
  const meta = getWorkoutMetadata(workout);
  return meta.readiness;
}

/**
 * Create metadata object from individual fields (for saving)
 */
export function createWorkoutMetadata(params: {
  session_rpe?: number;
  notes?: string;
  readiness?: { energy: number; soreness: number; sleep: number };
  session_type?: PilatesYogaSessionType;
  session_feeling?: SessionFeeling;
  environment?: Environment;
  is_heated?: boolean;
  instructor?: string;
  focus_area?: FocusArea[];
  studio_name?: string;
  teacher_rating?: number;
}): WorkoutMetadata {
  const metadata: WorkoutMetadata = {};
  
  if (typeof params.session_rpe === 'number') {
    metadata.session_rpe = params.session_rpe;
  }
  
  if (params.notes && typeof params.notes === 'string' && params.notes.trim().length > 0) {
    metadata.notes = params.notes.trim();
  }
  
  if (params.readiness && typeof params.readiness === 'object') {
    metadata.readiness = params.readiness;
  }
  
  if (params.session_type) {
    metadata.session_type = params.session_type;
  }
  
  if (params.session_feeling) {
    metadata.session_feeling = params.session_feeling;
  }
  
  if (params.environment) {
    metadata.environment = params.environment;
  }
  
  if (params.is_heated === true) {
    metadata.is_heated = true;
  }
  
  if (params.instructor && typeof params.instructor === 'string' && params.instructor.trim().length > 0) {
    metadata.instructor = params.instructor.trim();
  }
  
  if (Array.isArray(params.focus_area) && params.focus_area.length > 0) {
    metadata.focus_area = params.focus_area;
  }
  
  if (params.studio_name && typeof params.studio_name === 'string' && params.studio_name.trim().length > 0) {
    metadata.studio_name = params.studio_name.trim();
  }
  
  if (typeof params.teacher_rating === 'number' && params.teacher_rating >= 1 && params.teacher_rating <= 10) {
    metadata.teacher_rating = params.teacher_rating;
  }
  
  return metadata;
}

