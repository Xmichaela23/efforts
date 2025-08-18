export type Discipline = 'run'|'ride'|'swim'|'strength'|'mobility'|'other';
export type Hardness = 'easy'|'moderate'|'hard';

export interface Template {
  id: string;
  name: string;
  discipline: Discipline;
  tags?: string[];
  hardness: Hardness;
  baseDurationMin?: number;
  structure: IntervalBlock[];
  progressionRule?: ProgressionRule;
  constraints?: Constraints;
  note?: string;
}

export interface IntervalBlock {
  role: 'warmup'|'main'|'cooldown'|'accessory';
  repeats?: number;
  work?: Interval;
  recover?: Interval;
  sequence?: Interval[];
}

export interface Interval {
  distance_m?: number;
  duration_s?: number;
  target?: Target;
  env?: { grade_pct?: string; surface?: 'road'|'trail'|'track'; equipment?: string };
}

export type Target =
  | { type: 'pace'; from: 'M'|'T'|'10k'|'5k'|'easy'; delta_s_per_km?: number }
  | { type: 'hr'; zone: 'Z1'|'Z2'|'Z3'|'Z4'|'Z5' }
  | { type: 'power'; pct_ftp: number }
  | { type: 'strength_pct1rm'; lift: string; pct: number; rir?: number }
  | { type: 'rpe'; value: number };

export interface ProgressionRule {
  weeks?: Record<number, Partial<ProgressionDelta>>;
  byPhase?: Partial<Record<'base'|'build'|'peak'|'taper', Partial<ProgressionDelta>>>;
}

export interface ProgressionDelta {
  add_repeats?: number;
  add_blocks?: number;
  duration_scale?: number;
  target_shift?: {
    pace_delta_s_per_km?: number;
    power_pct_ftp_delta?: number;
    strength_pct1rm_delta?: number;
  };
}

export interface Constraints {
  intendedDays?: ('Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun')[];
  minRestHoursBefore?: number;
  minRestHoursAfter?: number;
  avoidIfTagsInLastDays?: Array<{ tags: string[]; days: number }>;
  incompatibleWith?: string[]; // template ids or tag keys
}

export interface Pool {
  id: string;
  templateIds: string[];
  selection: { mode: 'roundRobin'|'noRepeat'|'weighted'; weights?: Record<string, number> };
}

export interface SkeletonWeek {
  weekNumber: number;
  phase: 'base'|'build'|'peak'|'taper';
  slots: Array<{ day:'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'; poolId: string; optional?: boolean }>;
  policies: { maxHardPerWeek: number; minRestGap: number; taperMultiplier?: number };
}

export interface Baselines {
  run?: { easy_pace_s_per_km: number; T_pace_s_per_km: number; M_pace_s_per_km: number; best5k_s?: number };
  bike?: { ftp_w: number; cp20_w?: number };
  strength?: { squat1rm_kg?: number; bench1rm_kg?: number; deadlift1rm_kg?: number; rirSummary?: { last2w_fastBar?: boolean } };
  meta?: { timeLevel: 'beginner'|'intermediate'|'advanced'; longRunDay?: 'Sat'|'Sun'; longBikeDay?: 'Sat'|'Sun' };
}

// ---- Plan configuration & caps ----
export type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';
export type StrengthTrack = 'power'|'endurance'|'hybrid';

export interface PlanConfig {
  durationWeeks: 8|12|16;
  timeLevel: 'beginner'|'intermediate'|'advanced';
  weeklyHoursTarget?: number;
  availableDays: Day[];
  longRunDay: 'Sat'|'Sun';
  runQualityDays: 1|2;
  strengthDaysPerWeek: 0|1|2|3;
  strengthDaysPreferred?: Day[];
  strengthTrack?: StrengthTrack;
  includeStrength: boolean;
  // Mobility options
  includeMobility?: boolean;
  mobilityDaysPerWeek?: 0|1|2|3|4|5;
  mobilityDaysPreferred?: Day[];
  standaloneMobility?: boolean;
  // Optional supplemental upper/core day toggle
  includeUpper?: boolean;
}

export const HardCaps = {
  weeklyHoursByLevel: {
    beginner:     { min: 3,  max: 6  },
    intermediate: { min: 5,  max: 9  },
    advanced:     { min: 7,  max: 12 },
  },
  absoluteWeeklyHoursMax: 14,
  maxHardSessionsPerWeek: 3,
  vo2PerSportPerWeek: 1,
  longRun: {
    maxByLevelMin: {
      beginner:     { minMin: 90,  maxMin: 120 },
      intermediate: { minMin: 120, maxMin: 150 },
      advanced:     { minMin: 150, maxMin: 180 }
    },
    maxIncreasePctPerWeek: 10
  },
  strength: {
    maxDays: 3,
    peakTaperPct1RMMax: 0.80,
    peakTaperSetsDrop: { min: 0.4, max: 0.6 }
  },
  spacing: {
    minRestGapHours: 24
  }
} as const;

export interface ValidationNote {
  code: string;
  message: string;
}

export interface ValidationResult {
  notes: ValidationNote[];
}


