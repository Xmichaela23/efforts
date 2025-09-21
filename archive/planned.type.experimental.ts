export type PlannedWorkout = {
  id?: string;
  name?: string;
  type: 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'mobility';
  date?: string;
  description?: string;
  duration?: number; // minutes
  intervals?: any[];
  strength_exercises?: any[];
  workout_status?: 'planned' | 'in_progress' | 'completed' | 'sent_to_garmin';
  source?: 'manual' | 'plan_template' | 'training_plan';
};

