/**
 * workout-mappers.ts - Single source of truth for transforming unified API data
 * 
 * All components should use these mapper functions instead of manually
 * transforming unified items. This ensures consistency and makes it easy
 * to add new fields.
 */

import { PlannedWorkout } from '@/types/planned-workout';

/**
 * Maps a unified item from get-week API to a PlannedWorkout
 * 
 * This is the SINGLE SOURCE OF TRUTH for planned workout transformation.
 * If you need to add a new field, add it here and it will be available everywhere.
 */
export function mapUnifiedItemToPlanned(item: any): PlannedWorkout {
  const planned = item.planned || {};
  
  // This function is only called when item.planned exists (filtered at call site)
  // So workout_status is ALWAYS 'planned' for items mapped by this function
  const workoutStatus = 'planned';
  
  return {
    // Core identifiers
    id: planned.id || item.id,
    date: item.date,
    type: item.type || planned.type,
    workout_status: workoutStatus as PlannedWorkout['workout_status'],
    
    // Name and description
    name: planned.name || null,
    description: planned.description || null,
    rendered_description: planned.rendered_description || planned.description || null,
    
    // Workout structure and steps
    computed: (Array.isArray(planned.steps) && planned.steps.length > 0) 
      ? { 
          steps: planned.steps, 
          total_duration_seconds: planned.total_duration_seconds || null 
        }
      : null,
    steps_preset: planned.steps_preset ?? null,
    total_duration_seconds: planned.total_duration_seconds || null,
    
    // Exercise data
    strength_exercises: planned.strength_exercises ?? null,
    mobility_exercises: planned.mobility_exercises ?? null,
    
    // Metadata
    tags: Array.isArray(planned.tags) ? planned.tags : [],
    export_hints: planned.export_hints ?? null,
    workout_structure: planned.workout_structure ?? null,
    friendly_summary: planned.friendly_summary ?? null,
    
    // Optional fields
    planned_id: planned.id,
    training_plan_id: planned.training_plan_id ?? null,
    source: item.source || 'training_plan',
    provider: item.provider || 'workouts',
    workout_metadata: planned.workout_metadata ?? null,
    
    // Brick/transition fields
    brick_group_id: planned.brick_group_id ?? null,
    brick_order: planned.brick_order ?? null,
    transition_s: planned.transition_s ?? null,
  };
}

/**
 * Maps a unified item to a completed workout structure
 * Used by TodaysEffort for completed workouts
 */
export function mapUnifiedItemToCompleted(item: any): any {
  // Source tracking fields MUST come from top-level item, not from item.executed
  // Put them BEFORE spreading item.executed to ensure they're not overwritten
  const mapped = {
    id: item.id,
    date: item.date,
    type: item.type,
    workout_status: 'completed',
    // Source tracking for display (same as details screen) - put BEFORE spread to ensure they're not overwritten
    source: item.source || null,
    is_strava_imported: item.is_strava_imported || null,
    strava_activity_id: item.strava_activity_id || null,
    garmin_activity_id: item.garmin_activity_id || null,
    device_info: item.device_info || null,
    // Then spread executed data (metrics, distance, duration, etc.)
    // This might overwrite some fields, but source tracking is already set above
    ...item.executed,
    computed: item.executed || null,
  };
  
  return mapped;
}

