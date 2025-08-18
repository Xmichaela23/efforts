// Days
export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';

// Pools (must match pools registry IDs)
export type PoolId =
  | 'run_long_pool'
  | 'run_speed_vo2_pool'
  | 'run_threshold_pool'
  | 'run_easy_pool'
  // Bike pools (for future cross-discipline scheduling)
  | 'bike_long_pool'
  | 'bike_vo2_pool'
  | 'bike_threshold_pool'
  | 'bike_endurance_pool'
  // Swim pools (for future cross-discipline scheduling)
  | 'swim_technique_pool'
  | 'strength_power_pool'
  | 'strength_endurance_pool'
  | 'strength_hybrid_pool'
  | 'strength_upper_power'
  | 'strength_upper_endurance'
  | 'strength_upper_hybrid'
  | 'strength_upper'
  // Brick pools (first-class citizens)
  | 'brick_bike_run_threshold'
  | 'brick_bike_run_endurance'
  | 'mobility_pool';

export type Level = 'new'|'experienced'|'veryExperienced';
export type StrengthTrack = 'power'|'endurance'|'hybrid';
export type PlanPriority = 'endurance_first'|'balanced'|'strength_first';

export interface SimpleSchedulerParams {
  availableDays: Day[];
  longRunDay: Day;
  level: Level;
  strengthTrack: StrengthTrack;
  strengthDays: 2|3;
  preferredStrengthDays: Day[]; // 2–3
  includeMobility?: boolean;
  mobilityDays?: 0|1|2|3|4|5;
  preferredMobilityDays?: Day[];
  // optional, used only for AM/PM note guidance; defaults to 'endurance_first'
  priority?: PlanPriority;
}

export interface Slot {
  day: Day;
  poolId: PoolId;
  optional?: boolean;
}

export interface PlaceResult {
  slots: Slot[];
  notes: string[];
}

// ---------- UI-facing form (no business logic in UI) ----------
export interface PlanUIForm {
  longRunDay: Day;                   // single-select
  preferredStrengthDays: Day[];      // multi-select, must be 2 or 3
  availableDays: Day[];              // multi-select
  experience: Level;                 // new | experienced | veryExperienced
  strengthTrack: StrengthTrack;      // power | endurance | hybrid
  strengthDaysPerWeek: 2 | 3;        // UI limits to 2 or 3
}


