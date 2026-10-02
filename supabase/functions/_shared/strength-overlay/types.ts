/**
 * The plan shapes the strength overlay reads and writes (`./index.ts`). Moved here from generate-run-plan/types.ts
 * when that builder was deleted (2026-10-01); adapt-plan's strength relayout uses the overlay on tri plans.
 */

export interface TrainingPlan {
  name: string;
  description: string;
  duration_weeks: number;
  swim_unit?: 'yd' | 'm';
  units: 'imperial' | 'metric';
  // E3b — glass-box volume reconciliation: per-week notes when the time budget exceeds what a legal
  // week (long-run distance-precise + easy runs 3–5mi on ≤3 days) can hold. Surfaced, never crammed.
  volume_notes?: string[];
  baselines_required: {
    run?: string[];
    bike?: string[];
    swim?: string[];
    strength?: string[];
  };
  weekly_summaries?: Record<string, WeeklySummary>;
  sessions_by_week: Record<string, Session[]>;
}

export interface Session {
  day: string;
  type: 'run' | 'bike' | 'swim' | 'strength';
  name: string;
  description: string;
  duration: number;
  steps_preset?: string[];
  strength_exercises?: StrengthExercise[];
  tags: string[];
  transition_s?: number;
  timing?: string; // e.g., 'AM (Priority)' or 'PM (6hr+ gap recommended)'
}

export interface StrengthExercise {
  name: string;
  sets: number;
  reps: number | string;
  weight: string;
  target_rir?: number; // Target Reps In Reserve (1-5). Lower = harder. Guides user effort.
  /** Builder-only; optional auto-regulatory note (e.g. drift cut). */
  notes?: string;
}

export interface WeeklySummary {
  focus: string;
  key_workouts: string[];
  estimated_hours: number;
  hard_sessions: number;
  total_miles?: number;
  notes: string;
  timing_note?: string; // Note about AM/PM scheduling for double days
}

export interface PhaseStructure {
  phases: Phase[];
  recovery_weeks: number[];
}

export interface Phase {
  name: string;
  start_week: number;
  end_week: number;
  weeks_in_phase: number;
  focus: string;
  quality_density: 'low' | 'medium' | 'high';
  volume_multiplier: number;
}
