/**
 * Shared Types for Coaching Engine
 * 
 * These types are compatible with Deno/Edge Functions
 * and work with planned_workouts data structure
 */

export interface PlannedWorkout {
  id: string;
  date: string;
  type: string;
  workout_status: 'planned' | 'completed' | 'skipped';
  name: string | null;
  description: string | null;
  steps_preset: string[] | null;
  tags: string[];
  strength_exercises?: any[] | null;
  [key: string]: any; // Allow additional fields
}

export interface Day {
  name: string;  // e.g., "Monday", "Tuesday"
  date: string;  // ISO date string
  workout?: PlannedWorkout | null;
}

export type RescheduleOption = {
  rank: 1 | 2 | 3 | 4 | 5;
  label: string;
  action: 'move' | 'split' | 'skip';
  targetDateOffset?: number;  // -1 (yesterday), +1 (tomorrow), etc.
  riskLevel: 'safe' | 'moderate' | 'high';
  tags: string[];
  analysis: {
    physiological: string;
    scheduling: string;
    verdict: string;
  };
};

export type RescheduleContext = {
  missedWorkout: PlannedWorkout;
  dayIndex: number;     // Index in the timeline array (0-based)
  timeline: Day[];       // Continuous array of days (Current Week + Next Week)
  currentWeekType: 'recovery' | 'build' | 'taper';
};

export interface RescheduleEngine {
  getOptions(context: RescheduleContext): RescheduleOption[];
}
