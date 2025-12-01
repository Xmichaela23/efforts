/**
 * PlannedWorkout - Single source of truth for planned workout data structure
 * 
 * This type represents a planned workout as it flows from the unified API
 * (get-week) through to UI components. All components should use this type
 * instead of manually mapping fields.
 */

export interface PlannedWorkout {
  // Core identifiers
  id: string;
  date: string;
  type: string;
  workout_status: 'planned' | 'completed' | 'skipped';
  
  // Name and description
  name: string | null;
  description: string | null;
  rendered_description: string | null;
  
  // Workout structure and steps
  computed: {
    steps: any[];
    total_duration_seconds: number | null;
  } | null;
  steps_preset: string[] | null;
  total_duration_seconds: number | null;
  
  // Exercise data
  strength_exercises: any[] | null;
  mobility_exercises: any[] | null;
  
  // Metadata
  tags: string[];
  export_hints: any | null;
  workout_structure: any | null;
  friendly_summary: string | null;
  
  // Optional fields used by specific components
  planned_id?: string;
  training_plan_id?: string | null;
  source?: string;
  provider?: string;
  workout_metadata?: any | null;
  
  // Brick/transition fields (for multi-sport workouts)
  brick_group_id?: string | null;
  brick_order?: number | null;
  transition_s?: number | null;
}

