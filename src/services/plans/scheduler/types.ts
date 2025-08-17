// Days
export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';

// Pools (must match pools registry IDs)
export type PoolId =
  | 'run_long_pool'
  | 'run_speed_vo2_pool'
  | 'run_threshold_pool'
  | 'run_easy_pool'
  | 'strength_power_pool'
  | 'strength_endurance_pool'
  | 'strength_hybrid_pool';

export type Level = 'new'|'experienced'|'veryExperienced';
export type StrengthTrack = 'power'|'endurance'|'hybrid';

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


