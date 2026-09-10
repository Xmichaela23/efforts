/**
 * `arc.builder` from get-arc-context — the intake readout, built on the server by
 * `supabase/functions/get-arc-context/intake-readout.ts` with the functions the plan build uses.
 * The plan builder and the season wizard print these fields; the phone works none of them out.
 * Type only: the shape is owned by the server file.
 */
export type LiftOnFile = { value: number; source: 'locked' | 'learned' | 'typed' };

export type IntakeLiftKey = 'squat' | 'bench' | 'deadlift' | 'overheadPress1RM' | 'pullupMaxReps';

export type IntakeReadout = {
  has_pace_benchmark: boolean;
  hard_days_priceable: { run: boolean; bike: boolean };
  equipment_tier: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';
  performance_downgraded: boolean;
  lifts: Record<IntakeLiftKey, LiftOnFile | null>;
  barbell_lifts_on_file: 'all' | 'some' | 'none';
  strength_default: 'use' | 'test';
  /** Present only when the request sent `session_frequency`. Keyed by the hours option value. */
  session_frequency_by_tier?: Record<string, { swims: number; bikes: number; runs: number }>;
};
