// Normalized preset catalog used by the expander

export type RunPreset =
  | { kind: 'steady'; duration_s: number; target?: string }
  | { kind: 'interval'; reps: number; work: { duration_s?: number; dist_m?: number; target?: string }; rest?: { duration_s?: number; dist_m?: number } }
  | { kind: 'tempo'; dist_m: number; target?: string }
  | { kind: 'longrun'; duration_s: number; target?: string };

export type BikePreset = RunPreset; // reuse structure for simplicity

export type StrengthPreset = {
  exercise: string; // bench_press | back_squat | deadlift | overhead_press | row
  sets: number;
  reps: number | string; // number | 'AMRAP'
  intensity?: string; // e.g., '72%1RM'
  rest_s?: number;
};

export type Preset = RunPreset | BikePreset | StrengthPreset;

export const PRESETS: Record<string, Preset> = {
  // Run warmups/cooldowns
  warmup_run_quality_12min: { kind: 'steady', duration_s: 12 * 60, target: '{easy_pace}' },
  warmup_run_easy_10min: { kind: 'steady', duration_s: 10 * 60, target: '{easy_pace}' },
  cooldown_easy_10min: { kind: 'steady', duration_s: 10 * 60, target: '{easy_pace}' },

  // Intervals (Run)
  interval_6x400m_5kpace_R2min: { kind: 'interval', reps: 6, work: { dist_m: 400, target: '{5k_pace}' }, rest: { duration_s: 120 } },
  interval_8x800m_5kpace_R2min: { kind: 'interval', reps: 8, work: { dist_m: 800, target: '{5k_pace}' }, rest: { duration_s: 120 } },
  interval_6x800m_10kpace_R2min: { kind: 'interval', reps: 6, work: { dist_m: 800, target: '{10k_pace}' }, rest: { duration_s: 120 } },
  interval_6x1mi_5kpace_R2min: { kind: 'interval', reps: 6, work: { dist_m: 1609, target: '{5k_pace}' }, rest: { duration_s: 120 } },

  // Cruise intervals
  'cruise_4x1_5mi_5kpace_plus0:10_R3min': { kind: 'interval', reps: 4, work: { dist_m: 2414, target: '{5k_pace}+0:10' }, rest: { duration_s: 180 } },
  'cruise_5x1_5mi_5kpace_plus0:10_R3min': { kind: 'interval', reps: 5, work: { dist_m: 2414, target: '{5k_pace}+0:10' }, rest: { duration_s: 180 } },
  'cruise_3x2mi_5kpace_plus0:15_R3min': { kind: 'interval', reps: 3, work: { dist_m: 3219, target: '{5k_pace}+0:15' }, rest: { duration_s: 180 } },
  'cruise_4x2mi_5kpace_plus0:15_R3min': { kind: 'interval', reps: 4, work: { dist_m: 3219, target: '{5k_pace}+0:15' }, rest: { duration_s: 180 } },
  'cruise_2x3mi_5kpace_plus0:20_R3min': { kind: 'interval', reps: 2, work: { dist_m: 4828, target: '{5k_pace}+0:20' }, rest: { duration_s: 180 } },

  // Tempo
  'tempo_4mi_5kpace_plus0:45': { kind: 'tempo', dist_m: 6437, target: '{5k_pace}+0:45' },
  'tempo_5mi_5kpace_plus0:45': { kind: 'tempo', dist_m: 8047, target: '{5k_pace}+0:45' },
  'tempo_6mi_5kpace_plus0:40': { kind: 'tempo', dist_m: 9656, target: '{5k_pace}+0:40' },
  'tempo_7mi_5kpace_plus0:40': { kind: 'tempo', dist_m: 11265, target: '{5k_pace}+0:40' },
  'tempo_7mi_5kpace_plus0:35': { kind: 'tempo', dist_m: 11265, target: '{5k_pace}+0:35' },
  'tempo_8mi_5kpace_plus0:35': { kind: 'tempo', dist_m: 12875, target: '{5k_pace}+0:35' },
  'tempo_4mi_5kpace_plus1:00': { kind: 'tempo', dist_m: 6437, target: '{5k_pace}+1:00' },

  // Long runs
  longrun_90min_easypace_last10steady: { kind: 'longrun', duration_s: 90 * 60, target: '{easy_pace}' },
  longrun_100min_easypace: { kind: 'longrun', duration_s: 100 * 60, target: '{easy_pace}' },
  longrun_110min_easypace: { kind: 'longrun', duration_s: 110 * 60, target: '{easy_pace}' },
  longrun_120min_easypace: { kind: 'longrun', duration_s: 120 * 60, target: '{easy_pace}' },
  longrun_130min_easypace: { kind: 'longrun', duration_s: 130 * 60, target: '{easy_pace}' },
  longrun_140min_easypace: { kind: 'longrun', duration_s: 140 * 60, target: '{easy_pace}' },
  longrun_150min_easypace_finish_35min_MP: { kind: 'longrun', duration_s: 150 * 60, target: '{easy_pace}' },
  longrun_150min_easypace_3x20min_MP: { kind: 'longrun', duration_s: 150 * 60, target: '{easy_pace}' },
  longrun_135min_easypace_2x25min_MP: { kind: 'longrun', duration_s: 135 * 60, target: '{easy_pace}' },

  // Drills/strides/speed
  drills_A_B_skips_high_knees: { kind: 'steady', duration_s: 10 * 60 },
  strides_6x20s: { kind: 'interval', reps: 6, work: { duration_s: 20, target: 'fast' } },
  strides_4x20s: { kind: 'interval', reps: 4, work: { duration_s: 20, target: 'fast' } },
  speed_8x20s_R60s: { kind: 'interval', reps: 8, work: { duration_s: 20, target: 'fast' }, rest: { duration_s: 60 } },

  // Bike
  warmup_bike_quality_15min_fastpedal: { kind: 'steady', duration_s: 15 * 60, target: 'fastpedal' },
  cooldown_bike_easy_10min: { kind: 'steady', duration_s: 10 * 60, target: 'easy' },
  bike_vo2_6x3min_R3min: { kind: 'interval', reps: 6, work: { duration_s: 180, target: '{VO2_power}' }, rest: { duration_s: 180 } },
  bike_vo2_4x3min_R3min: { kind: 'interval', reps: 4, work: { duration_s: 180, target: '{VO2_power}' }, rest: { duration_s: 180 } },
  bike_thr_4x8min_R5min: { kind: 'interval', reps: 4, work: { duration_s: 480, target: '{threshold_power}' }, rest: { duration_s: 300 } },
  bike_thr_3x8min_R5min: { kind: 'interval', reps: 3, work: { duration_s: 480, target: '{threshold_power}' }, rest: { duration_s: 300 } },
  bike_thr_2x12min_R5min: { kind: 'interval', reps: 2, work: { duration_s: 720, target: '{threshold_power}' }, rest: { duration_s: 300 } },
  bike_ss_2x20min_R6min: { kind: 'interval', reps: 2, work: { duration_s: 1200, target: '{sweetspot_power}' }, rest: { duration_s: 360 } },
  bike_ss_2x22min_R6min: { kind: 'interval', reps: 2, work: { duration_s: 1320, target: '{sweetspot_power}' }, rest: { duration_s: 360 } },
  bike_ss_2x25min_R6min: { kind: 'interval', reps: 2, work: { duration_s: 1500, target: '{sweetspot_power}' }, rest: { duration_s: 360 } },
  'bike_endurance_50min_Z1-2_cad85-95': { kind: 'steady', duration_s: 50 * 60, target: 'Z1-2' },
  bike_endurance_50min_Z1: { kind: 'steady', duration_s: 50 * 60, target: 'Z1' },
  bike_endurance_120min_Z2: { kind: 'steady', duration_s: 120 * 60, target: 'Z2' },
  bike_endurance_150min_Z2: { kind: 'steady', duration_s: 150 * 60, target: 'Z2' },
  bike_endurance_180min_Z2: { kind: 'steady', duration_s: 180 * 60, target: 'Z2' },
  bike_recovery_35min_Z1: { kind: 'steady', duration_s: 35 * 60, target: 'Z1' },

  // Strength scaffolds (main blocks)
  strength_main_50min: { exercise: 'block_main', sets: 1, reps: 1, intensity: '50min' },
  strength_main_40min: { exercise: 'block_main', sets: 1, reps: 1, intensity: '40min' },
  strength_main_35min: { exercise: 'block_main', sets: 1, reps: 1, intensity: '35min' },
};

export function getPreset(token: string): Preset | undefined {
  return PRESETS[token as keyof typeof PRESETS];
}


// Swim catalogs (drills and equipment modifiers) — yards-first semantics
export type SwimCatalogEntry = {
  type: 'swim_drill' | 'swim_pull' | 'swim_kick' | 'swim_aerobic';
  label: string;
  cue: string;
  is_drill?: boolean;
  equipment?: string;
  aliases?: string[];
};

export const SWIM_CATALOG: Record<string, SwimCatalogEntry> = {
  catchup: { type: 'swim_drill', label: 'Drill — Catch-up', cue: 'Touch hands in front; long glide', is_drill: true, equipment: 'none', aliases: [] },
  singlearm: { type: 'swim_drill', label: 'Drill — Single Arm', cue: 'One arm swims, other arm forward', is_drill: true, equipment: 'none', aliases: ['single_arm'] },
  fist: { type: 'swim_drill', label: 'Drill — Fist Swim', cue: 'Closed fists to feel forearm catch', is_drill: true, equipment: 'none', aliases: [] },
  scullfront: { type: 'swim_drill', label: 'Drill — Scull (Front)', cue: 'Small figure-8 at front of stroke', is_drill: true, equipment: 'none', aliases: ['scull_front','front_scull'] },
  zipper: { type: 'swim_drill', label: 'Drill — Zipper', cue: 'Drag thumb up side; high elbow recov.', is_drill: true, equipment: 'none', aliases: [] },
  '616': { type: 'swim_drill', label: 'Drill — 6-1-6', cue: '6 kicks on side, 1 stroke, switch', is_drill: true, equipment: 'snorkel (optional)', aliases: ['six_one_six'] },
  doggypaddle: { type: 'swim_drill', label: 'Drill — Doggy Paddle', cue: 'Short strokes, head neutral', is_drill: true, equipment: 'none', aliases: ['dog_paddle'] },
  fingertipdrag: { type: 'swim_drill', label: 'Drill — Fingertip Drag', cue: 'Lightly drag fingertips; high elbow', is_drill: true, equipment: 'none', aliases: ['fingertip_drag'] },
  pull: { type: 'swim_pull', label: 'Pull', cue: 'Pull buoy, paddles optional', is_drill: false, equipment: 'pull buoy', aliases: [] },
  kick: { type: 'swim_kick', label: 'Kick', cue: 'Flutter kick, streamline or board', is_drill: false, equipment: 'kickboard (optional fins)', aliases: [] },
  aerobic: { type: 'swim_aerobic', label: 'Aerobic', cue: 'Easy aerobic swim', is_drill: false, equipment: 'none', aliases: [] }
};

export type SwimEquipModifier = { type: 'equipment_modifier'; label: string; cue: string; equipment: string };

export const SWIM_EQUIPMENT_MODS: Record<string, SwimEquipModifier> = {
  fins: { type: 'equipment_modifier', label: 'Fins', cue: 'Wear fins', equipment: 'fins' },
  paddles: { type: 'equipment_modifier', label: 'Paddles', cue: 'Hand paddles', equipment: 'paddles' },
  snorkel: { type: 'equipment_modifier', label: 'Snorkel', cue: 'Center-mount snorkel', equipment: 'snorkel' },
  buoy: { type: 'equipment_modifier', label: 'Pull Buoy', cue: 'Buoy between legs', equipment: 'pull buoy' },
  board: { type: 'equipment_modifier', label: 'Kickboard', cue: 'Kick with board', equipment: 'kickboard' }
};


