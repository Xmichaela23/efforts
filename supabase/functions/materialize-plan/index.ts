// @ts-nocheck
// Function: materialize-plan
// Behavior: Expand planned_workouts into computed.steps (stable ids) + total duration.
// Supports run/ride/swim/strength tokens, workout_structure fallback, long_run_* tokens,
// and description-based single-step fallback. CORS enabled. Returns count materialized.
// - Reads planned_workouts rows by training_plan_id or single planned_workout id
// - Expands steps_preset tokens into computed.steps with stable ids
// - Resolves run paces (fiveK/easy) and bike power (FTP %) using user_baselines.performance_numbers
// - Persists computed.steps and duration
// - Applies user plan_adjustments to modify prescribed weights

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getExerciseConfig, getBaseline1RM, formatWeightDisplay } from './exercise-config.ts';

// Type for plan adjustments
type PlanAdjustment = {
  id: string;
  exercise_name: string;
  adjustment_factor?: number;
  absolute_weight?: number;
  weight_offset?: number; // Offset maintains plan progression (e.g., -10 lb)
  applies_from: string;
  applies_until?: string;
  status: string;
};

// Apply adjustment to a calculated weight
function applyAdjustment(
  exerciseName: string, 
  calculatedWeight: number | undefined, 
  adjustments: PlanAdjustment[], 
  workoutDate: string
): { weight: number | undefined; adjusted: boolean; adjustmentId?: string } {
  if (calculatedWeight == null || !adjustments.length) {
    return { weight: calculatedWeight, adjusted: false };
  }
  
  const normalizedName = exerciseName.toLowerCase().trim();
  
  // Find matching active adjustment for this exercise and date
  const adjustment = adjustments.find(adj => {
    if (adj.status !== 'active') return false;
    const adjName = adj.exercise_name.toLowerCase().trim();
    if (adjName !== normalizedName && !normalizedName.includes(adjName) && !adjName.includes(normalizedName)) return false;
    if (adj.applies_from > workoutDate) return false;
    if (adj.applies_until && adj.applies_until < workoutDate) return false;
    return true;
  });
  
  if (!adjustment) {
    return { weight: calculatedWeight, adjusted: false };
  }
  
  // Apply adjustment - priority: weight_offset > absolute_weight > adjustment_factor
  let adjustedWeight: number;
  if (adjustment.weight_offset != null) {
    // Offset maintains plan progression: 25→27→30 with -10 offset = 15→17→20
    adjustedWeight = Math.max(0, Math.round((calculatedWeight + adjustment.weight_offset) / 5) * 5);
  } else if (adjustment.absolute_weight != null) {
    adjustedWeight = adjustment.absolute_weight;
  } else if (adjustment.adjustment_factor != null) {
    adjustedWeight = Math.round(calculatedWeight * adjustment.adjustment_factor / 5) * 5;
  } else {
    return { weight: calculatedWeight, adjusted: false };
  }
  
  console.log(`🔧 Applied adjustment to ${exerciseName}: ${calculatedWeight} lb → ${adjustedWeight} lb`);
  return { weight: adjustedWeight, adjusted: true, adjustmentId: adjustment.id };
}

type Baselines = { 
  ftp?: number; 
  fiveK_pace?: any; fiveKPace?: any; fiveK?: any; 
  easyPace?: any; easy_pace?: any; 
  marathonPace?: any; marathon_pace?: any;
  equipment?: any;
  // New effort_paces from PlanWizard (seconds per mile)
  effort_paces?: {
    base: number;    // Easy pace
    race: number;    // Marathon pace
    steady: number;  // Threshold pace
    power: number;   // Interval/5K pace
    speed: number;   // Repetition pace
  };
};

function parsePaceToSecPerMi(v: any): number | null {
  try {
    if (v == null) return null;
    if (typeof v === 'number' && v > 0) return v; // already sec/mi
    const txt = String(v).trim();
    if (!txt) return null;
    // formats: mm:ss/mi or mm:ss /km
    const m = txt.match(/(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
    if (m) {
      const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const unit = m[3].toLowerCase();
      if (unit === 'mi') return sec;
      if (unit === 'km') return Math.round(sec * 1.60934);
      return sec;
    }
    // plain mm:ss
    const m2 = txt.match(/(\d{1,2}):(\d{2})/);
    if (m2) return parseInt(m2[1],10)*60 + parseInt(m2[2],10);
  } catch {}
  return null;
}

function secPerMiFromBaseline(b: Baselines, which: 'fivek'|'easy'|'marathon'|'threshold'): number | null {
  // PREFER effort_paces from PlanWizard (already in seconds per mile)
  if (b.effort_paces) {
    if (which === 'fivek' && b.effort_paces.power) {
      console.log(`[Paces] Using effort_paces.power for 5K: ${b.effort_paces.power}s/mi`);
      return b.effort_paces.power;
    }
    if (which === 'easy' && b.effort_paces.base) {
      console.log(`[Paces] Using effort_paces.base for easy: ${b.effort_paces.base}s/mi`);
      return b.effort_paces.base;
    }
    if (which === 'marathon' && b.effort_paces.race) {
      console.log(`[Paces] Using effort_paces.race for marathon: ${b.effort_paces.race}s/mi`);
      return b.effort_paces.race;
    }
    if (which === 'threshold' && b.effort_paces.steady) {
      console.log(`[Paces] Using effort_paces.steady for threshold: ${b.effort_paces.steady}s/mi`);
      return b.effort_paces.steady;
    }
  }
  
  // FALLBACK to legacy performance_numbers
  let raw: any;
  if (which === 'fivek') {
    raw = b.fiveK_pace ?? b.fiveKPace ?? b.fiveK;
  } else if (which === 'marathon') {
    raw = b.marathonPace ?? b.marathon_pace;
    // If no marathon pace, estimate from easy pace (+30sec slower)
    if (raw == null && (b.easyPace || b.easy_pace)) {
      const easyPace = parsePaceToSecPerMi(b.easyPace ?? b.easy_pace);
      if (easyPace) return easyPace - 30; // Marathon is faster than easy, typically ~30s/mi
    }
  } else if (which === 'threshold') {
    // Threshold not in legacy - estimate from 5K pace + 20s
    const fkp = secPerMiFromBaseline(b, 'fivek');
    if (fkp) return fkp + 20;
    return null;
  } else {
    raw = b.easyPace ?? b.easy_pace;
  }
  return parsePaceToSecPerMi(raw);
}

// Strength helpers: map exercise name to baseline key and compute prescribed weight
function oneRmFromBaselines(b: any, exerciseName: string): number | null {
  try {
    const n = String(exerciseName || '').toLowerCase();
    if (n.includes('bench')) return Number.isFinite(b?.bench) ? b.bench : null;
    if (n.includes('deadlift')) return Number.isFinite(b?.deadlift) ? b.deadlift : null;
    if (n.includes('squat')) return Number.isFinite(b?.squat) ? b.squat : null;
    if (n.includes('overhead') || n.includes('ohp') || (n.includes('press') && !n.includes('bench'))) {
      const v = b?.overheadPress1RM ?? b?.ohp ?? b?.overhead_press;
      return Number.isFinite(v) ? v : null;
    }
    // Unknown or bodyweight: no 1RM baseline
    return null;
  } catch { return null; }
}

// Calculate weight using research-based exercise config
function calculateWeightFromConfig(
  exerciseName: string,
  targetPercent: number,
  baselines: any,
  reps?: number
): { weight: number | null; displayFormat: string; notes?: string } {
  const config = getExerciseConfig(exerciseName);
  
  if (!config) {
    // Fallback to legacy calculation for unknown exercises
    return { weight: null, displayFormat: 'total' };
  }
  
  if (config.displayFormat === 'bodyweight' || config.displayFormat === 'band') {
    return { weight: 0, displayFormat: config.displayFormat, notes: config.notes };
  }
  
  const base1RM = getBaseline1RM(config, baselines);
  if (!base1RM) {
    return { weight: null, displayFormat: config.displayFormat, notes: config.notes };
  }
  
  // Calculate inferred 1RM for this exercise
  const inferred1RM = base1RM * config.ratio;
  
  // Apply target percentage and rep adjustment
  const repScale = repScaleFor(reps);
  let prescribedWeight = inferred1RM * targetPercent * repScale;
  
  // For perHand exercises: divide BEFORE rounding (so we round to real dumbbell weights)
  if (config.displayFormat === 'perHand' && config.ratioIsTotal) {
    prescribedWeight = prescribedWeight / 2;
  }
  
  // Round to nearest 5 lbs (matches real gym equipment)
  prescribedWeight = Math.max(5, Math.round(prescribedWeight / 5) * 5);
  
  return { 
    weight: prescribedWeight, 
    displayFormat: config.displayFormat,
    notes: config.notes
  };
}
function round5(n: number): number { return Math.max(5, Math.round(n / 5) * 5); }
function pctWeight(oneRm: number | null, pct?: number): number | undefined {
  if (oneRm == null) return undefined;
  if (!(typeof pct === 'number' && isFinite(pct) && pct > 0)) return undefined;
  return round5(oneRm * pct);
}

// Smart exercise type detection (matches client-side logic)
function isDumbbellExercise(exerciseName: string): boolean {
  const name = exerciseName.toLowerCase();
  
  // Explicit dumbbell naming
  if (name.includes('dumbbell') || name.includes('db ')) return true;
  
  // Common dumbbell exercise patterns
  const dbPatterns = [
    'bicep curl', 'biceps curl', 'hammer curl', 'concentration curl',
    'lateral raise', 'front raise', 'chest fly', 'chest flye',
    'arnold press', 'goblet squat', 'bulgarian split squat',
    'farmer walk', 'farmer walks'
  ];
  
  return dbPatterns.some(p => name.includes(p));
}

function parseWeightInput(input: any, oneRm: number | null): { weight?: number; percent_1rm?: number } {
  try {
    if (typeof input === 'number' && isFinite(input) && input >= 0) return { weight: Math.round(input) };
    const s = String(input || '').trim().toLowerCase();
    if (!s) return {};
    if (/(^|\b)(bw|body\s*weight|bodyweight)(\b|$)/.test(s)) return { weight: 0 };
    if (/amrap/.test(s)) return {}; // reps-only hint, not a weight
    // Match "70% 1RM" or "70%" or "0.7" style
    let m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const w = pctWeight(oneRm, pct);
      return { weight: w, percent_1rm: pct };
    }
    m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*1\s*rm/);
    if (m) {
      const pct = parseFloat(m[1]) / 100;
      const w = pctWeight(oneRm, pct);
      return { weight: w, percent_1rm: pct };
    }
    // Plain number inside string
    m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (m) {
      const n = Math.round(parseFloat(m[1]));
      if (isFinite(n)) return { weight: n };
    }
  } catch {}
  return {};
}

// Accessory mapping → primary 1RM with ratio
function getAccessoryRatio(movement: string): number {
  const m = String(movement || '').toLowerCase();
  // Primary lifts default to 1.0
  if (/bench|squat|deadlift|dead_lift|ohp|overhead/.test(m)) return 1.0;
  // Upper body pull (bench reference)
  if (m.includes('barbell_row') || m.includes('bent_over_row') || m.includes('pendlay_row') || m.includes('barbell row') || m.includes('bent over row') || m.includes('pendlay')) return 0.90;
  if (m.includes('t_bar_row') || /\bt[-_ ]?bar[-_ ]?row\b/.test(m)) return 0.80;
  if (m.includes('chest_supported_row') || m.includes('chest supported row')) return 0.85;
  if (m.includes('cable_row') || m.includes('cable row')) return 0.70;
  if (m.includes('lat_pulldown') || m.includes('pulldown') || m.includes('lat pulldown')) return 0.65;
  if (m.includes('inverted_row') || m.includes('inverted row')) return 0.65;
  if (m.includes('face_pull') || m.includes('face pull')) return 0.35;
  if (m.includes('reverse_fly') || m.includes('reverse_flye') || m.includes('reverse fly')) return 0.30;
  if (m.includes('chinup') || m.includes('chin_up') || m.includes('pullup') || m.includes('pull_up') || m.includes('chin-up') || m.includes('pull-up')) return 0.65;
  // Upper body push (bench reference)
  if (m.includes('dip')) return 0.90;
  if (m.includes('incline_bench') || m.includes('incline bench')) return 0.85;
  if (m.includes('close_grip_bench') || m.includes('close grip bench')) return 0.90;
  if (m.includes('db_bench_press') || m.includes('dumbbell_bench')) return 0.75;
  if (m.includes('db_incline_press') || m.includes('dumbbell_incline')) return 0.70;
  if (m.includes('db_fly') || m.includes('db_flye') || m.includes('dumbbell_fly')) return 0.45;
  if (m.includes('cable_fly') || m.includes('cable_flye')) return 0.40;
  if (m.includes('diamond_pushup') || m.includes('close_grip_pushup')) return 0.0;
  if (m.includes('pike_pushup')) return 0.0;
  if (m.includes('pushup') || m.includes('push_up')) return 0.0;
  // Shoulders (overhead reference)
  if (m.includes('lateral_raise')) return 0.35;
  if (m.includes('front_raise')) return 0.40;
  if (m.includes('rear_delt_fly') || m.includes('rear_delt_flye')) return 0.30;
  if (m.includes('db_shoulder_press') || m.includes('dumbbell_shoulder')) return 0.65;
  if (m.includes('overhead_tricep_extension') || m.includes('tricep_extension')) return 0.40;
  if (m.includes('push_press')) return 1.10;
  // Hip dominant (deadlift reference)
  if (m.includes('hip_thrust') || m.includes('hip thrust')) return 0.80;
  if (m.includes('romanian_deadlift') || m.includes('rdl')) return 0.70;
  if (m.includes('good_morning') || m.includes('good morning')) return 0.45;
  if (m.includes('single_leg_rdl') || m.includes('single leg rdl')) return 0.25;
  if (m.includes('glute_bridge') || m.includes('glute bridge')) return 0.60;
  if (m.includes('leg_curl') || m.includes('leg curl')) return 0.60;
  if (m.includes('sumo_deadlift') || m.includes('sumo')) return 0.95;
  if (m.includes('nordic_curl')) return 0.0;
  // Knee dominant (squat reference)
  if (m.includes('bulgarian_split_squat')) return 0.30;
  if (m.includes('walking_lunge') || m.includes('lunge')) return 0.35;
  if (m.includes('reverse_lunge')) return 0.35;
  if (m.includes('lateral_lunge')) return 0.30;
  if (m.includes('goblet_squat')) return 0.40;
  if (m.includes('step_up') || m.includes('step up')) return 0.25;
  if (m.includes('leg_press')) return 1.20;
  if (m.includes('leg_extension')) return 0.55;
  if (m.includes('front_squat')) return 0.85;
  if (m.includes('overhead_squat')) return 0.60;
  if (m.includes('jump_squat') || m.includes('box_jump')) return 0.0;
  if (m.includes('wall_sit')) return 0.0;
  if (m.includes('pistol_squat') || m.includes('pistol')) return 0.0;
  // Core & BW
  if (m.includes('plank') || m.includes('side_plank')) return 0.0;
  if (m.includes('ab_rollout') || m.includes('rollout')) return 0.0;
  if (m.includes('hanging_leg_raise')) return 0.0;
  if (m.includes('russian_twist')) return 0.0;
  if (m.includes('dead_bug')) return 0.0;
  if (m.includes('bird_dog')) return 0.0;
  if (m.includes('pallof_press')) return 0.0;
  if (m.includes('burpee')) return 0.0;
  if (m.includes('mountain_climber')) return 0.0;
  return 1.0;
}

function pickPrimary1RMAndBase(name: string, baselines: any): { base: number | null; ref: 'bench'|'squat'|'deadlift'|'overhead'|null; ratio: number; unilateral: boolean } {
  const n = String(name || '').toLowerCase();
  const bench = Number.isFinite(baselines?.bench) ? baselines.bench as number : null;
  const squat = Number.isFinite(baselines?.squat) ? baselines.squat as number : null;
  const deadlift = Number.isFinite(baselines?.deadlift) ? baselines.deadlift as number : null;
  const overhead = Number.isFinite(baselines?.overheadPress1RM ?? baselines?.ohp ?? baselines?.overhead) ? (baselines?.overheadPress1RM ?? baselines?.ohp ?? baselines?.overhead) as number : null;
  const unilateral = /(single|bulgarian|split|one arm|one leg|unilateral|pistol)/i.test(n);

  // Get accessory ratio for all exercises
  const ratio = getAccessoryRatio(n);
  
  // Direct primary lifts
  if (n.includes('bench')) return { base: bench, ref: 'bench', ratio: 1.0, unilateral };
  if (n.includes('squat') && !n.includes('goblet')) return { base: squat, ref: 'squat', ratio: 1.0, unilateral };
  if (n.includes('deadlift') || n.includes('dead_lift')) return { base: deadlift, ref: 'deadlift', ratio: 1.0, unilateral };
  if (n.includes('overhead') || n.includes('ohp')) return { base: overhead, ref: 'overhead', ratio: 1.0, unilateral };
  if (n.includes('push press')) return { base: overhead, ref: 'overhead', ratio, unilateral };

  // Accessory aliases
  
  // Upper body pull (bench reference)
  if (n.includes('row')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('pulldown') || n.includes('pull down')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('pullup') || n.includes('pull up') || n.includes('pull-up')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('chinup') || n.includes('chin up') || n.includes('chin-up')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('face pull')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('reverse fly') || n.includes('reverse flye')) return { base: bench, ref: 'bench', ratio, unilateral };
  
  // Upper body push (bench reference)
  if (n.includes('dip')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('incline')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('fly') || n.includes('flye')) return { base: bench, ref: 'bench', ratio, unilateral };
  if (n.includes('dumbbell') && (n.includes('press') || n.includes('bench'))) return { base: bench, ref: 'bench', ratio, unilateral };
  
  // Shoulders (overhead reference)
  if (n.includes('lateral raise')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('front raise')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('rear delt')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('shoulder')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  if (n.includes('tricep')) return { base: overhead, ref: 'overhead', ratio, unilateral };
  
  // Hip dominant (deadlift reference)
  if (n.includes('hip thrust')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('rdl') || n.includes('romanian')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('sumo')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('good morning')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('leg curl')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  if (n.includes('glute bridge')) return { base: deadlift, ref: 'deadlift', ratio, unilateral };
  
  // Knee dominant (squat reference)
  if (n.includes('lunge') || n.includes('split squat') || n.includes('goblet') || n.includes('step up')) return { base: squat, ref: 'squat', ratio, unilateral };
  if (n.includes('leg press')) return { base: squat, ref: 'squat', ratio, unilateral };
  if (n.includes('leg extension')) return { base: squat, ref: 'squat', ratio, unilateral };

  // Unknown
  return { base: null, ref: null, ratio: 1.0, unilateral };
}

function repScaleFor(reps?: number | string): number {
  if (typeof reps === 'string' && /amrap/i.test(reps)) return 1.00;
  const r = Number(reps);
  if (!Number.isFinite(r)) return 1.0;
  if (r <= 6) return 1.05;
  if (r <= 9) return 1.00;
  if (r <= 12) return 0.95;
  if (r <= 15) return 0.90;
  return 0.85;
}

// Extract percentage from weight string (e.g., "30% 1RM" -> 0.30)
function extractPercentageFromWeight(weight: any): number | undefined {
  try {
    const s = String(weight || '').trim().toLowerCase();
    if (!s) return undefined;
    // Match "70% 1RM" or "70%" or "0.7 1rm"
    let m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (m) return parseFloat(m[1]) / 100;
    m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*1\s*rm/);
    if (m) return parseFloat(m[1]) / 100;
  } catch {}
  return undefined;
}

// Map percentage intensity to band resistance level
function getBandResistanceFromPercentage(originalPercent: number): string {
  if (originalPercent <= 35) return "Light Band";
  if (originalPercent <= 55) return "Medium Band";
  if (originalPercent <= 75) return "Heavy Band";
  return "Extra Heavy Band";
}

// Equipment substitution based on user's available equipment
function substituteExerciseForEquipment(exerciseName: string, userEquipment: string[], percentOf1RM?: number): { name: string; notes?: string } {
  const name = String(exerciseName || '').toLowerCase();
  const equipment = Array.isArray(userEquipment) ? userEquipment : [];
  
  // Check for gym access (old and new naming conventions)
  const hasGymAccess = equipment.includes('Full commercial gym access') || equipment.includes('Commercial gym');
  
  // Check for specific equipment (supporting both old and new names)
  const hasBarbell = hasGymAccess || equipment.includes('Full barbell + plates') || equipment.includes('Barbell + plates') || equipment.includes('Squat rack or power cage') || equipment.includes('Squat rack / Power cage');
  const hasDumbbells = hasGymAccess || equipment.includes('Adjustable dumbbells') || equipment.includes('Fixed dumbbells') || equipment.includes('Dumbbells');
  const hasBench = hasGymAccess || equipment.includes('Bench (flat/adjustable)');
  const hasPullUpBar = hasGymAccess || equipment.includes('Pull-up bar');
  const hasCable = hasGymAccess || equipment.includes('Cable machine/functional trainer') || equipment.includes('Cable machine');
  const hasKettlebells = hasGymAccess || equipment.includes('Kettlebells');
  const hasResistanceBands = equipment.includes('Resistance bands');
  const bodyweightOnly = equipment.includes('Bodyweight only') || equipment.length === 0;
  
  let resultName = exerciseName;
  let notes: string | undefined = undefined;
  
  // Face Pulls (typically require cable)
  if (name.includes('face pull') && !hasCable) {
    if (hasResistanceBands) {
      resultName = 'Band Face Pulls';
      notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light-medium resistance';
    } else if (hasDumbbells) {
      resultName = 'Bent-Over Reverse Flyes';
    } else if (bodyweightOnly) {
      resultName = 'Reverse Flyes (bodyweight)';
    }
  }
  
  // Machine exercises - only substitute if no gym access
  if (name.includes('leg curl') && !hasGymAccess) {
    if (hasBarbell) {
      resultName = 'Nordic Curls';
    } else if (hasResistanceBands) {
      resultName = 'Band Leg Curls';
      notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'medium resistance';
    } else {
      resultName = 'Nordic Curls';
    }
  }
  
  if (name.includes('leg extension') && !hasGymAccess) {
    if (hasDumbbells) {
      resultName = 'Bulgarian Split Squats';
    } else {
      resultName = 'Bodyweight Lunges';
    }
  }
  
  // Lateral Raises
  if (name.includes('lateral raise')) {
    if (name.includes('dumbbell') && !hasDumbbells) {
      if (hasResistanceBands) {
        resultName = exerciseName.replace(/Dumbbell/gi, 'Band');
        notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light resistance';
      } else if (bodyweightOnly) {
        resultName = 'Scaption (bodyweight shoulder raises)';
      }
    } else if (name.includes('cable') && !hasCable) {
      if (hasDumbbells) {
        resultName = exerciseName.replace(/Cable/gi, 'Dumbbell');
      } else if (hasResistanceBands) {
        resultName = exerciseName.replace(/Cable/gi, 'Band');
        notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light resistance';
      }
    } else if (!name.includes('dumbbell') && !name.includes('band') && !name.includes('cable')) {
      // No equipment specified - default to dumbbell or substitute
      if (hasDumbbells) {
        resultName = `Dumbbell ${exerciseName}`;
      } else if (hasResistanceBands) {
        resultName = `Band ${exerciseName}`;
        notes = percentOf1RM ? getBandResistanceFromPercentage(percentOf1RM * 100) : 'light resistance';
      } else if (bodyweightOnly) {
        resultName = 'Scaption (bodyweight shoulder raises)';
      }
    }
  }
  
  // Add band notes for any band exercises that don't already have them (fallback)
  const finalName = String(resultName).toLowerCase();
  if (finalName.includes('band') && !notes) {
    if (percentOf1RM) {
      notes = getBandResistanceFromPercentage(percentOf1RM * 100);
    } else {
      // Legacy fallback if no percentage provided
      if (finalName.includes('face pull')) {
        notes = 'light-medium resistance';
      } else if (finalName.includes('leg curl')) {
        notes = 'medium resistance';
      } else if (finalName.includes('lateral raise') || finalName.includes('front raise')) {
        notes = 'light resistance';
      } else if (finalName.includes('row')) {
        notes = 'medium-heavy resistance';
      } else if (finalName.includes('pull') || finalName.includes('pushdown')) {
        notes = 'medium resistance';
      }
    }
  }
  
  return { name: resultName, notes };
}

function parseIntSafe(s?: string | number | null): number | null { const n = typeof s === 'number' ? s : parseInt(String(s||''), 10); return Number.isFinite(n) ? n : null; }

function uid(): string { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; } }

function minutesTokenToSeconds(tok: string): number | null {
  const m = tok.match(/(\d+)\s*min/i); if (m) return parseInt(m[1],10)*60; return null;
}

function expandRunToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = [];
  const lower = tok.toLowerCase();
  
  // Helper: convert miles to meters
  const milesToMeters = (mi: number) => Math.round(mi * 1609.34);
  
  // warmup/cooldown - TIME based
  if (/warmup/.test(lower) && /min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'warmup', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  if (/cooldown/.test(lower) && /min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 600; out.push({ id: uid(), kind:'cooldown', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  
  // warmup/cooldown - DISTANCE based (1mi)
  if (/warmup.*1mi/.test(lower)) {
    out.push({ id: uid(), kind:'warmup', distance_m: milesToMeters(1), pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  if (/cooldown.*1mi/.test(lower)) {
    out.push({ id: uid(), kind:'cooldown', distance_m: milesToMeters(1), pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  
  // Long run DISTANCE based with MP segment: longrun_18mi_easypace_last3mi_MP
  if (/longrun_\d+mi_easypace_last\d+mi_mp/.test(lower)) {
    const m = lower.match(/longrun_(\d+)mi_easypace_last(\d+)mi_mp/);
    if (m) {
      const totalMiles = parseInt(m[1], 10);
      const mpMiles = parseInt(m[2], 10);
      const easyMiles = totalMiles - mpMiles;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      const mpPace = secPerMiFromBaseline(baselines, 'marathon') || easyPace; // Fall back to easy if no MP baseline
      // Easy portion
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(easyMiles), pace_sec_per_mi: easyPace });
      // MP portion
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(mpMiles), pace_sec_per_mi: mpPace });
      return out;
    }
  }
  
  // Long run DISTANCE based: longrun_18mi_easypace
  if (/longrun_\d+mi_easypace/.test(lower)) {
    const m = lower.match(/longrun_(\d+)mi/);
    if (m) {
      const miles = parseInt(m[1], 10);
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
      return out;
    }
  }
  
  // Long run TIME based with MP segment: longrun_160min_easypace_last20min_MP
  if (/longrun_\d+min_easypace_last\d+min_mp/i.test(lower)) {
    const m = lower.match(/longrun_(\d+)min_easypace_last(\d+)min_mp/i);
    if (m) {
      const totalMin = parseInt(m[1], 10);
      const mpMin = parseInt(m[2], 10);
      const easyMin = totalMin - mpMin;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      const mpPace = secPerMiFromBaseline(baselines, 'marathon') || easyPace; // Fall back to easy if no MP baseline
      // Easy portion
      out.push({ id: uid(), kind: 'work', duration_s: easyMin * 60, pace_sec_per_mi: easyPace });
      // MP portion
      out.push({ id: uid(), kind: 'work', duration_s: mpMin * 60, pace_sec_per_mi: mpPace });
      return out;
    }
  }
  
  // long run TIME based (support longrun_Xmin, longrun_Xmin_easypace, and long_run_Xmin)
  if (/long[_-]?run_\d+min(?:_easypace)?/.test(lower)) {
    const m = lower.match(/long[_-]?run_(\d+)min/);
    if (m) {
      const sec = parseInt(m[1], 10) * 60;
      out.push({ id: uid(), kind: 'work', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
      return out;
    }
  }
  
  // Easy run DISTANCE based: run_easy_5mi
  if (/run_easy_\d+mi/.test(lower)) {
    const m = lower.match(/run_easy_(\d+)mi/);
    if (m) {
      const miles = parseInt(m[1], 10);
      out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: secPerMiFromBaseline(baselines, 'easy') || undefined });
      return out;
    }
  }
  
  // easy run TIME based: run_easy_Xmin
  if (/run_easy_\d+min/.test(lower)) {
    const m = lower.match(/run_easy_(\d+)min/); const sec = m ? parseInt(m[1],10)*60 : 1800; out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined }); return out;
  }
  
  // Marathon pace run DISTANCE based: run_mp_5mi or run_mp_26.2mi (supports decimals)
  if (/run_mp_[\d.]+mi/.test(lower)) {
    const m = lower.match(/run_mp_([\d.]+)mi/);
    if (m) {
      const miles = parseFloat(m[1]);
      if (Number.isFinite(miles) && miles > 0) {
        const mpPace = secPerMiFromBaseline(baselines, 'marathon') || secPerMiFromBaseline(baselines, 'easy') || undefined;
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: mpPace });
        return out;
      }
    }
  }
  // Tempo: tempo_25min_threshold (new style)
  if (/tempo_\d+min_threshold/.test(lower)) {
    const m = lower.match(/tempo_(\d+)min_threshold/);
    const sec = m ? parseInt(m[1],10)*60 : 1500;
    // Threshold pace is ~5K pace + 15-20 sec
    const fkp = secPerMiFromBaseline(baselines,'fivek');
    const pace = fkp != null ? (fkp + 20) : undefined;
    out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: pace }); 
    return out;
  }
  
  // Tempo: tempo_5mi_threshold (distance-based threshold)
  if (/tempo_\d+mi_threshold/.test(lower)) {
    const m = lower.match(/tempo_(\d+)mi_threshold/);
    if (m) {
      const miles = parseInt(m[1],10);
      const fkp = secPerMiFromBaseline(baselines,'fivek');
      const pace = fkp != null ? (fkp + 20) : undefined;
      out.push({ id: uid(), kind:'work', distance_m: milesToMeters(miles), pace_sec_per_mi: pace });
      return out;
    }
  }
  
  // Tempo: tempo_25min_5kpace_plus0:45 (legacy style)
  if (/tempo_\d+min_5kpace/.test(lower)) {
    const m = lower.match(/tempo_(\d+)min_5kpace(?:_plus(\d+):(\d+))?/);
    const sec = m ? parseInt(m[1],10)*60 : 1500;
    const fkp = secPerMiFromBaseline(baselines,'fivek');
    const plus = (m && m[2] && m[3]) ? (parseInt(m[2],10)*60 + parseInt(m[3],10)) : 0;
    const pace = (fkp!=null) ? (fkp + plus) : undefined;
    out.push({ id: uid(), kind:'work', duration_s: sec, pace_sec_per_mi: pace }); return out;
  }
  // Tempo: tempo_5mi_5kpace_plus1:00 (legacy distance-based)
  if (/tempo_\d+mi_5kpace/.test(lower)) {
    const m = lower.match(/tempo_(\d+)mi_5kpace(?:_plus(\d+):(\d+))?/);
    if (m) {
      const miles = parseInt(m[1],10);
      const dist_m = Math.round(miles * 1609.34);
      const fkp = secPerMiFromBaseline(baselines,'fivek');
      const plus = (m[2] && m[3]) ? (parseInt(m[2],10)*60 + parseInt(m[3],10)) : 0;
      const pace = (fkp!=null) ? (fkp + plus) : undefined;
      out.push({ id: uid(), kind:'work', distance_m: dist_m, pace_sec_per_mi: pace });
      return out;
    }
  }
  
  // Fartlek: fartlek_6x30-60s_moderate
  if (/fartlek_\d+x\d+-\d+s/.test(lower)) {
    const m = lower.match(/fartlek_(\d+)x(\d+)-(\d+)s/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const minSec = parseInt(m[2], 10);
      const maxSec = parseInt(m[3], 10);
      const avgSec = Math.round((minSec + maxSec) / 2);
      const fkp = secPerMiFromBaseline(baselines, 'fivek');
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      // Fartlek pickups are ~10K pace (5K + 10-15 sec)
      const pickupPace = fkp != null ? (fkp + 12) : undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', duration_s: avgSec, pace_sec_per_mi: pickupPace });
        // Recovery is roughly equal duration at easy pace
        if (i < reps - 1) out.push({ id: uid(), kind: 'recovery', duration_s: avgSec, pace_sec_per_mi: easyPace });
      }
      return out;
    }
  }
  
  // Cruise intervals: cruise_4x1mi_threshold_r60s or cruise_3x1.5mi_threshold_r60s
  if (/cruise_\d+x[\d.]+mi_threshold/.test(lower)) {
    const m = lower.match(/cruise_(\d+)x([\d.]+)mi_threshold(?:_r(\d+)s)?/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const miles = parseFloat(m[2]);
      const rest_s = m[3] ? parseInt(m[3], 10) : 60;
      const fkp = secPerMiFromBaseline(baselines, 'fivek');
      const thresholdPace = fkp != null ? (fkp + 20) : undefined;
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      for (let i = 0; i < reps; i++) {
        out.push({ id: uid(), kind: 'work', distance_m: milesToMeters(miles), pace_sec_per_mi: thresholdPace });
        if (rest_s > 0 && i < reps - 1) out.push({ id: uid(), kind: 'recovery', duration_s: rest_s, pace_sec_per_mi: easyPace });
      }
      return out;
    }
  }
  // Intervals: interval_5x800m_5kpace_r90s, interval_6x800m_5kpace_r120, interval_4x1mi_5kpace_R2min
  if (/interval_\d+x/.test(lower)) {
    // Handle both _r and _R, optional s/min suffix
    const m = lower.match(/interval_(\d+)x(\d+)(m|mi)_5kpace(?:_[rR](\d+)(s|min)?)?/);
    if (m) {
      const reps = parseInt(m[1],10);
      const val = parseInt(m[2],10);
      const unit = m[3];
      const dist_m = unit==='mi' ? Math.round(val*1609.34) : val;
      // Parse rest: if m[4] exists, check if m[5] is 'min' (multiply by 60) or default to seconds
      const rest_s = m[4] ? (m[5]==='min' ? parseInt(m[4],10)*60 : parseInt(m[4],10)) : 0;
      const pace = secPerMiFromBaseline(baselines,'fivek') || undefined;
      for (let i=0;i<reps;i+=1) {
        out.push({ id: uid(), kind:'work', distance_m: dist_m, pace_sec_per_mi: pace });
        if (rest_s>0 && i<reps-1) out.push({ id: uid(), kind:'recovery', duration_s: rest_s, pace_sec_per_mi: secPerMiFromBaseline(baselines,'easy')||undefined });
      }
      return out;
    }
  }
  
  // Strides: strides_4x100m or strides_6x20s
  // Strides are fast accelerations done AFTER the main run (warm-up)
  // For "Easy + Strides" workouts, strides come at the END
  if (/strides_\d+x/.test(lower)) {
    const m = lower.match(/strides_(\d+)x(\d+)(m|s)/);
    if (m) {
      const reps = parseInt(m[1], 10);
      const val = parseInt(m[2], 10);
      const unit = m[3];
      const easyPace = secPerMiFromBaseline(baselines, 'easy') || undefined;
      
      // Strides are fast but relaxed - no specific pace target, just "fast"
      // They're done at ~95% max speed but staying relaxed
      // Recovery is walk/jog (90s is standard)
      const rest_s = 90;
      
      for (let i = 0; i < reps; i++) {
        if (unit === 'm') {
          // Distance-based: 100m strides
          out.push({ 
            id: uid(), 
            kind: 'work', 
            distance_m: val,
            // No pace target - strides are "fast but relaxed", not a specific pace
            label: 'Stride'
          });
        } else {
          // Time-based: 20s strides
          out.push({ 
            id: uid(), 
            kind: 'work', 
            duration_s: val,
            label: 'Stride'
          });
        }
        // Recovery between strides: walk/jog (except after last one)
        if (i < reps - 1) {
          out.push({ 
            id: uid(), 
            kind: 'recovery', 
            duration_s: rest_s, 
            pace_sec_per_mi: easyPace,
            label: 'Walk/Jog'
          });
        }
      }
      return out;
    }
  }
  
  return out;
}

function expandBikeToken(tok: string, baselines: Baselines): any[] {
  const out: any[] = []; const lower = tok.toLowerCase(); const ftp = typeof baselines.ftp==='number'? baselines.ftp: undefined;
  console.log(`🔍 [BIKE DEBUG] Token: ${tok}, FTP: ${ftp}`);
  const pctRange = (lo:number, hi:number)=> {
    if (!ftp) return undefined;
    const result = { lower: Math.round(lo*ftp), upper: Math.round(hi*ftp) };
    console.log(`🔍 [BIKE DEBUG] pctRange(${lo}, ${hi}) = ${result.lower}-${result.upper}W`);
    return result;
  };
  
  // Warmup tokens with proper FTP-based power ranges
  if (/warmup_bike_quality_\d+min_fastpedal/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 900; 
    out.push({ id: uid(), kind:'warmup', duration_s: sec, power_range: pctRange(0.55, 0.70) }); 
    return out; 
  }
  if (/warmup_.*_\d+min/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 900; 
    out.push({ id: uid(), kind:'warmup', duration_s: sec, power_range: pctRange(0.50, 0.65) }); 
    return out; 
  }
  
  // Cooldown tokens with proper FTP-based power ranges
  if (/cooldown.*\d+min/.test(lower)) { 
    const sec = minutesTokenToSeconds(lower) ?? 600; 
    out.push({ id: uid(), kind:'cooldown', duration_s: sec, power_range: pctRange(0.40, 0.55) }); 
    return out; 
  }
  // Recovery zone tokens: bike_recovery_5min_Z1
  if (/bike_recovery_\d+min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 300;
    out.push({ id: uid(), kind:'recovery', duration_s: sec, power_range: pctRange(0.40, 0.55), label: 'Recovery' });
    return out;
  }
  // FTP Test: bike_ftp_test_20min - maximal sustainable effort (no upper cap!)
  if (/bike_ftp_test_\d+min/.test(lower)) {
    const sec = minutesTokenToSeconds(lower) ?? 1200;
    // No power_range - this is a maximal test, not a zone workout
    out.push({ id: uid(), kind:'work', duration_s: sec, label: 'FTP Test - Maximal Effort', notes: 'All-out sustainable effort' });
    return out;
  }
  // SS: bike_ss_3x12min_R4min
  let m = lower.match(/bike_ss_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { 
    const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; 
    console.log(`🔍 [BIKE DEBUG] Sweet spot match: ${reps}x${work/60}min, rest=${rest/60}min`);
    for(let i=0;i<reps;i++){ 
      const powerRange = pctRange(0.85,0.95);
      console.log(`🔍 [BIKE DEBUG] Adding work step ${i+1}/${reps} with power_range:`, powerRange);
      out.push({ id: uid(), kind:'work', duration_s: work, power_range: powerRange }); 
      if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); 
    } 
    return out; 
  }
  // Threshold: bike_thr_4x8min_R5min
  m = lower.match(/bike_thr_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(0.95,1.05) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // VO2: bike_vo2_5x4min_R4min
  m = lower.match(/bike_vo2_(\d+)x(\d+)min_r(\d+)min/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10)*60, rest=parseInt(m[3],10)*60; for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work, power_range: pctRange(1.1,1.2) }); if(rest) out.push({ id: uid(), kind:'recovery', duration_s: rest }); } return out; }
  // Endurance z2 time: bike_endurance_90min_Z2
  m = lower.match(/bike_endurance_(\d+)min/);
  if (m) { const sec=parseInt(m[1],10)*60; out.push({ id: uid(), kind:'work', duration_s: sec, power_range: pctRange(0.65,0.75) }); return out; }
  // Tempo steady time: bike_tempo_Xmin (map to race power ~80-85% FTP)
  m = lower.match(/bike_tempo_(\d+)min/);
  if (m) { const sec=parseInt(m[1],10)*60; out.push({ id: uid(), kind:'work', duration_s: sec, power_range: pctRange(0.80,0.85) }); return out; }
  // Race prep short efforts: bike_race_prep_4x90s
  m = lower.match(/bike_race_prep_(\d+)x(\d+)s/);
  if (m) { const reps=parseInt(m[1],10), work=parseInt(m[2],10); for(let i=0;i<reps;i++){ out.push({ id: uid(), kind:'work', duration_s: work }); out.push({ id: uid(), kind:'recovery', duration_s: work }); } return out; }
  // Openers quick: bike_openers
  if (/bike_openers/.test(lower)) { out.push({ id: uid(), kind:'work', duration_s: 8*60 }); return out; }
  return out;
}

function expandTokensForRow(row: any, baselines: Baselines, adjustments: PlanAdjustment[] = []): { steps: any[]; total_s: number } {
  const tokens: string[] = Array.isArray(row?.steps_preset) ? row.steps_preset : [];
  const discipline = String(row?.type||'').toLowerCase();
  const workoutDate = row?.date || new Date().toISOString().split('T')[0];
  const steps: any[] = [];
  // Infer session-level swim equipment from tags (e.g., req:board, req:fins, req:buoy, req:snorkel)
  const inferEquipFromTagsOrDesc = (): string | null => {
    try {
      const tags: string[] = Array.isArray((row as any)?.tags) ? (row as any).tags.map((t:any)=>String(t).toLowerCase()) : [];
      const desc: string = String((row as any)?.description || '').toLowerCase();
      if (!tags.length) return null;
      if (tags.some(t=>/req:board|\bboard\b/.test(t))) return 'board';
      if (tags.some(t=>/req:fins|\bfins\b/.test(t))) return 'fins';
      if (tags.some(t=>/req:buoy|\bbuoy\b/.test(t))) return 'buoy';
      if (tags.some(t=>/req:snorkel|\bsnorkel\b/.test(t))) return 'snorkel';
      // Fallback: infer from description keywords
      if (/\bwith\s+board\b|\bkick\s+board\b/.test(desc)) return 'board';
      if (/\bfins\b/.test(desc)) return 'fins';
      if (/\bpull\s+buoy\b|\bbuoy\b/.test(desc)) return 'buoy';
      if (/\bsnorkel\b/.test(desc)) return 'snorkel';
      return null;
    } catch { return null }
  };
  const sessionEquip = inferEquipFromTagsOrDesc();

  // Early path: Strength without tokens → expand from strength_exercises so computed is written
  if (discipline === 'strength' && tokens.length === 0) {
    try {
      const rawStrength: any = (row as any)?.strength_exercises;
      const exs: any[] = Array.isArray(rawStrength)
        ? rawStrength
        : (typeof rawStrength === 'string' ? (()=>{ try { return JSON.parse(rawStrength); } catch { return []; } })() : []);
      if (Array.isArray(exs) && exs.length > 0) {
        // Get user equipment for substitution
        const userEquipment: string[] = Array.isArray((baselines as any)?.equipment?.strength) ? (baselines as any).equipment.strength : [];
        
        for (const ex of exs) {
          const originalName = String(ex?.name||'exercise');
          const reps = (typeof ex?.reps==='number'? ex.reps : (typeof ex?.reps==='string'? ex.reps : undefined));
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          
          // Get percentage for band resistance guidance (from percent_1rm field OR weight string)
          let percentRaw = (typeof ex?.percent_1rm === 'number' ? ex.percent_1rm : (typeof ex?.load?.percent_1rm === 'number' ? ex.load.percent_1rm : undefined));
          if (!percentRaw) {
            // Try to extract from weight string (e.g., "30% 1RM")
            percentRaw = extractPercentageFromWeight((ex as any)?.weight);
          }
          
          // Apply equipment substitution with percentage for intelligent band guidance
          const substituted = substituteExerciseForEquipment(originalName, userEquipment, percentRaw);
          const name = substituted.name;
          const equipmentNotes = substituted.notes;
          
          // Debug band exercises
          if (name.toLowerCase().includes('band') && originalName.toLowerCase().includes('face pull')) {
            console.log(`🎯 Face Pulls substitution:`, { originalName, weight: (ex as any)?.weight, extractedPercent: percentRaw, finalNotes: equipmentNotes });
          }
          
          // Use research-based exercise config for weight calculation
          const exerciseConfig = getExerciseConfig(name);
          const isBandExercise = exerciseConfig?.displayFormat === 'band' || String(name).toLowerCase().includes('band');
          
          let prescribed: number | undefined = undefined;
          let percent_1rm: number | undefined = undefined;
          let resolved_from: string | undefined = undefined;
          let weightDisplay: string | undefined = undefined;
          let baselineMissing = false;
          let requiredBaseline: string | undefined = undefined;
          
          if (!isBandExercise && exerciseConfig) {
            // Use new research-based config for percentage-based weights
            const targetPercent = typeof percentRaw === 'number' ? percentRaw : 0.70; // Default 70%
            const result = calculateWeightFromConfig(name, targetPercent, baselines as any, reps);
            if (result.weight != null && result.weight > 0) {
              prescribed = result.weight;
              weightDisplay = formatWeightDisplay(result.weight, result.displayFormat);
            } else if (exerciseConfig.primaryRef) {
              // Weight couldn't be calculated - baseline is missing
              baselineMissing = true;
              requiredBaseline = exerciseConfig.primaryRef;
            }
            percent_1rm = targetPercent;
            resolved_from = exerciseConfig.primaryRef || undefined;
          } else if (!isBandExercise) {
            // Fallback to legacy calculation for unknown exercises
            const pick = pickPrimary1RMAndBase(name, baselines as any);
            const base1RM = pick.base;
            const ratio = pick.ratio;
            const inferred1RM = (base1RM != null && ratio != null) ? base1RM * ratio : base1RM;
            const parsed = parseWeightInput((ex as any)?.weight, inferred1RM);
            if (parsed.weight != null) prescribed = parsed.weight;
            else if (inferred1RM != null && typeof percentRaw === 'number' && percentRaw>0) {
              const scaled = inferred1RM * percentRaw * repScaleFor(reps);
              prescribed = round5(scaled);
            }
            if (prescribed != null && isDumbbellExercise(name)) {
              prescribed = round5(prescribed / 2);
              weightDisplay = `${prescribed} lb each`;
            } else if (prescribed != null) {
              weightDisplay = `${prescribed} lb`;
            }
            // Check if baseline is missing for non-bodyweight exercises
            if (prescribed == null && pick.ref != null) {
              baselineMissing = true;
              requiredBaseline = pick.ref;
            }
            percent_1rm = (typeof percentRaw==='number' ? percentRaw : (parsed.percent_1rm != null ? parsed.percent_1rm : undefined));
            resolved_from = pick.ref || undefined;
          }
          
          // Map baseline key to human-readable name
          const baselineLabel = requiredBaseline === 'squat' ? 'Squat' 
            : requiredBaseline === 'deadlift' ? 'Deadlift'
            : requiredBaseline === 'bench' ? 'Bench Press'
            : requiredBaseline === 'overhead' ? 'Overhead Press'
            : requiredBaseline;
          
          // Extract target RIR from the exercise (if present from overlay)
          const target_rir = typeof ex?.target_rir === 'number' ? ex.target_rir : undefined;
          
          // Apply plan adjustments if any
          const adjustResult = applyAdjustment(name, prescribed, adjustments, workoutDate);
          const finalWeight = adjustResult.weight;
          const wasAdjusted = adjustResult.adjusted;
          const originalWeight = wasAdjusted ? prescribed : undefined; // Store original for UI display
          
          // Update weight display if adjusted
          let finalWeightDisplay = weightDisplay;
          if (wasAdjusted && finalWeight != null) {
            const config = getExerciseConfig(name);
            finalWeightDisplay = formatWeightDisplay(finalWeight, config?.displayFormat || 'total');
          }
          
          const strength = { name, sets, reps, weight: finalWeight, weight_display: finalWeightDisplay, percent_1rm, resolved_from, notes: equipmentNotes, baseline_missing: baselineMissing, required_baseline: baselineLabel, target_rir, adjusted: wasAdjusted, original_weight: originalWeight } as any;
          if (name.toLowerCase().includes('band')) {
            console.log(`🎸 Band exercise created:`, { name, notes: equipmentNotes, hasNotes: !!equipmentNotes });
          }
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch {}
    // No details present: still emit a generic block so computed exists
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }

  // Strength WITH tokens: expand authored strength_exercises ONCE (not per-token)
  // Tokens are used for UI copy; the load prescription comes from strength_exercises.
  // Avoid the per-token duplication by handling this branch before iterating tokens.
  if (discipline === 'strength' && tokens.length > 0) {
    try {
      const rawStrength: any = (row as any)?.strength_exercises;
      const exs: any[] = Array.isArray(rawStrength)
        ? rawStrength
        : (typeof rawStrength === 'string' ? (()=>{ try { return JSON.parse(rawStrength); } catch { return []; } })() : []);
      if (exs.length) {
        // Get user equipment for substitution
        const userEquipment: string[] = Array.isArray((baselines as any)?.equipment?.strength) ? (baselines as any).equipment.strength : [];
        
        for (const ex of exs) {
          const originalName = String(ex?.name||'exercise');
          const reps = (typeof ex?.reps==='number'? ex.reps : (typeof ex?.reps==='string'? ex.reps : undefined));
          const sets = (typeof ex?.sets==='number'? ex.sets : undefined);
          
          // Get percentage for band resistance guidance (from percent_1rm field OR weight string)
          let percentRaw = (typeof ex?.percent_1rm === 'number' ? ex.percent_1rm : (typeof ex?.load?.percent_1rm === 'number' ? ex.load.percent_1rm : undefined));
          if (!percentRaw) {
            // Try to extract from weight string (e.g., "30% 1RM")
            percentRaw = extractPercentageFromWeight((ex as any)?.weight);
          }
          
          // Apply equipment substitution with percentage for intelligent band guidance
          const substituted = substituteExerciseForEquipment(originalName, userEquipment, percentRaw);
          const name = substituted.name;
          const equipmentNotes = substituted.notes;
          
          // Use research-based exercise config for weight calculation
          const exerciseConfig = getExerciseConfig(name);
          const isBandExercise = exerciseConfig?.displayFormat === 'band' || String(name).toLowerCase().includes('band');
          
          let prescribed: number | undefined = undefined;
          let percent_1rm: number | undefined = undefined;
          let resolved_from: string | undefined = undefined;
          let weightDisplay: string | undefined = undefined;
          let baselineMissing = false;
          let requiredBaseline: string | undefined = undefined;
          
          if (!isBandExercise && exerciseConfig) {
            // Use new research-based config for percentage-based weights
            const targetPercent = typeof percentRaw === 'number' ? percentRaw : 0.70;
            const result = calculateWeightFromConfig(name, targetPercent, baselines as any, typeof reps === 'number' ? reps : undefined);
            if (result.weight != null && result.weight > 0) {
              prescribed = result.weight;
              weightDisplay = formatWeightDisplay(result.weight, result.displayFormat);
            } else if (exerciseConfig.primaryRef) {
              // Weight couldn't be calculated - baseline is missing
              baselineMissing = true;
              requiredBaseline = exerciseConfig.primaryRef;
            }
            percent_1rm = targetPercent;
            resolved_from = exerciseConfig.primaryRef || undefined;
          } else if (!isBandExercise) {
            // Fallback to legacy calculation
            const pick = pickPrimary1RMAndBase(name, baselines as any);
            const base1RM = pick.base;
            const ratio = pick.ratio;
            const inferred1RM = (base1RM != null && ratio != null) ? base1RM * ratio : base1RM;
            const parsed = parseWeightInput((ex as any)?.weight, inferred1RM);
            if (parsed.weight != null) prescribed = parsed.weight;
            else if (inferred1RM != null && typeof percentRaw === 'number' && percentRaw>0) {
              const scaled = inferred1RM * (percentRaw as number) * repScaleFor(typeof reps==='number'? reps : undefined);
              prescribed = round5(scaled);
            }
            if (prescribed != null && isDumbbellExercise(name)) {
              prescribed = round5(prescribed / 2);
              weightDisplay = `${prescribed} lb each`;
            } else if (prescribed != null) {
              weightDisplay = `${prescribed} lb`;
            }
            // Check if baseline is missing for non-bodyweight exercises
            if (prescribed == null && pick.ref != null) {
              baselineMissing = true;
              requiredBaseline = pick.ref;
            }
            percent_1rm = (typeof percentRaw==='number' ? percentRaw : (parsed.percent_1rm != null ? parsed.percent_1rm : undefined));
            resolved_from = pick.ref || undefined;
          }
          
          // Map baseline key to human-readable name
          const baselineLabel = requiredBaseline === 'squat' ? 'Squat' 
            : requiredBaseline === 'deadlift' ? 'Deadlift'
            : requiredBaseline === 'bench' ? 'Bench Press'
            : requiredBaseline === 'overhead' ? 'Overhead Press'
            : requiredBaseline;
          
          // Extract target RIR from the exercise (if present from overlay)
          const target_rir = typeof ex?.target_rir === 'number' ? ex.target_rir : undefined;
          
          // Apply plan adjustments if any
          const adjustResult = applyAdjustment(name, prescribed, adjustments, workoutDate);
          const finalWeight = adjustResult.weight;
          const wasAdjusted = adjustResult.adjusted;
          const originalWeight = wasAdjusted ? prescribed : undefined; // Store original for UI display
          
          // Update weight display if adjusted
          let finalWeightDisplay = weightDisplay;
          if (wasAdjusted && finalWeight != null) {
            const config = getExerciseConfig(name);
            finalWeightDisplay = formatWeightDisplay(finalWeight, config?.displayFormat || 'total');
          }
          
          const strength = { name, sets, reps, weight: finalWeight, weight_display: finalWeightDisplay, percent_1rm, resolved_from, notes: equipmentNotes, baseline_missing: baselineMissing, required_baseline: baselineLabel, target_rir, adjusted: wasAdjusted, original_weight: originalWeight } as any;
          if (name.toLowerCase().includes('band')) {
            console.log(`🎸 Band exercise created:`, { name, notes: equipmentNotes, hasNotes: !!equipmentNotes });
          }
          steps.push({ id: uid(), kind:'strength', strength });
        }
        return { steps, total_s: 0 };
      }
    } catch {}
    // Fallback placeholder if no details present
    steps.push({ id: uid(), kind:'strength', strength: { name: 'strength block' } });
    return { steps, total_s: 0 };
  }
  console.log(`🔍 Parsing ${tokens.length} tokens for ${discipline}:`, tokens);
  for (const tok of tokens) {
    let added: any[] = [];
    if (discipline==='run' || discipline==='walk') added = expandRunToken(tok, baselines);
    else if (discipline==='ride' || discipline==='bike' || discipline==='cycling') added = expandBikeToken(tok, baselines);
    else if (discipline==='swim') {
      // Detailed swim expansion — one line per rep
      const s = String(tok).toLowerCase();
      const ydToM = (yd:number)=> Math.round(yd*0.9144);
      const pushWUCD = (n:number, unit:string, warm:boolean) => {
        const distM = unit==='yd'? ydToM(n) : n;
        steps.push({ id: uid(), kind: warm?'warmup':'cooldown', distance_m: distM });
      };
      let m: RegExpMatchArray | null = null;
      // Warmup/Cooldown distance tokens: swim_warmup_300yd_easy / swim_cooldown_200yd
      // Allow optional suffix after unit (e.g., _easy)
      m = s.match(/swim_(warmup|cooldown)_(\d+)(yd|m)(?:_[a-z0-9_]+)?/);
      if (m) { pushWUCD(parseInt(m[2],10), m[3], m[1]==='warmup'); continue; }
      // Drill (name first): swim_drill_<name>_4x50yd(_r15)?(_equipment)?
      m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) {
        const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); if(rest) steps.push({ id: uid(), kind:'recovery', duration_s: rest }); }
        continue;
      }
      // Drill (name first): swim_drill_catchup_4x50yd_r15 (optional equipment)
      m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?/);
      if (m) {
        const name=m[1].replace(/_/g,' '); const reps=parseInt(m[2],10); const dist=parseInt(m[3],10); const unit=m[4]; const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        console.log(`  ✅ Matched drill (name first): name="${name}", reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${equip}`);
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { 
          steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Drill (count first): swim_drills_6x50yd_fingertipdrag (optional _r15, optional equipment)
      // Use negative lookahead to prevent drill name from consuming _r\d+ pattern
      m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+?)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const name=m[4].replace(/_/g,' '); const rest=parseInt(m[5]||'0',10); const equip=m[6]||null;
        console.log(`  ✅ Matched drill (count first): name="${name}", reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${equip}`);
        const distM = unit==='yd'? ydToM(dist) : dist;
        for(let i=0;i<reps;i++) { 
          steps.push({ id: uid(), kind:'drill', distance_m: distM, label:`drill ${name}`, equipment: equip||undefined }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Aerobic sets: swim_aerobic_6x150yd[_easy](_r20)?
      m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_([a-z]+?))?(?:_r(\d+))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const label=m[4]||'aerobic'; const rest=parseInt(m[5]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        console.log(`  ✅ Matched aerobic: reps=${reps}, dist=${dist}${unit}, label="${label}", rest=${rest}s`);
        for(let i=0;i<reps;i++){ 
          steps.push({ id: uid(), kind:'work', distance_m: distM, label }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Threshold sets: swim_threshold_8x100yd(_r10)?
      m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)(?:_r(\d+))?$/);
      if (m) {
        const reps=parseInt(m[1],10); const dist=parseInt(m[2],10); const unit=m[3]; const rest=parseInt(m[4]||'0',10); const distM = unit==='yd'? ydToM(dist) : dist;
        console.log(`  ✅ Matched threshold: reps=${reps}, dist=${dist}${unit}, rest=${rest}s`);
        for(let i=0;i<reps;i++){ 
          steps.push({ id: uid(), kind:'work', distance_m: distM, label:'threshold' }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        }
        continue;
      }
      // Pull/Kick sets: swim_pull_4x100yd_r20_buoy
      m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?(?:_(fins|board|buoy|snorkel))?$/);
      if (m) { 
        const kind=m[1]; 
        const reps=parseInt(m[2],10); 
        const dist=parseInt(m[3],10); 
        const unit=m[4]; 
        const rest=parseInt(m[5]||'0',10); 
        const eq=m[6]|| sessionEquip || (kind==='pull'?'buoy': (kind==='kick'?'board':null)); 
        const distM=unit==='yd'? ydToM(dist):dist; 
        console.log(`  ✅ Matched ${kind}: reps=${reps}, dist=${dist}${unit}, rest=${rest}s, equip=${eq}`);
        for(let i=0;i<reps;i++){ 
          steps.push({ id: uid(), kind:'work', distance_m: distM, label:kind, equipment:eq||undefined }); 
          // Only add rest BETWEEN reps, not after the last rep
          if(rest && i < reps - 1) {
            steps.push({ id: uid(), kind:'recovery', duration_s: rest });
            console.log(`    🔄 Added recovery step: ${rest}s`);
          }
        } 
        continue; 
      }
      // Fallback distance/time
      if (/\d+yd/.test(s)) { const mm=s.match(/(\d+)yd/); const yd=mm?parseInt(mm[1],10):0; const mtr=ydToM(yd); steps.push({ id: uid(), kind:'work', distance_m: mtr }); continue; }
      if (/\d+min/.test(s)) { const sec=minutesTokenToSeconds(s) ?? 600; steps.push({ id: uid(), kind:'work', duration_s: sec }); continue; }
      steps.push({ id: uid(), kind:'work', duration_s: 300 });
      continue;
    }
    steps.push(...added);
  }
  // Fallback: if no tokens yielded steps, try to expand from workout_structure when present
  try {
    if (steps.length === 0 && row?.workout_structure && typeof row.workout_structure === 'object') {
      const ws: any = row.workout_structure;
      const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : [];
      const toSec = (val?: string | number | null): number => {
        if (typeof val === 'number' && isFinite(val) && val>0) return Math.round(val);
        const txt = String(val||'').trim();
        let m = txt.match(/(\d+)\s*min/i); if (m) return parseInt(m[1],10)*60;
        m = txt.match(/(\d+)\s*s(ec)?\b/i); if (m) return parseInt(m[1],10);
        m = txt.match(/^(\d{1,2}):(\d{2})$/); if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
        return 0;
      };
      const toMeters = (txt?: string | number | null): number => {
        if (typeof txt === 'number' && isFinite(txt) && txt>0) return Math.round(txt);
        const t = String(txt||'');
        let m = t.match(/(\d+(?:\.\d+)?)\s*(yd|yard|yards)\b/i); if (m) return Math.round(parseFloat(m[1])*0.9144);
        m = t.match(/(\d+(?:\.\d+)?)\s*m\b/i); if (m) return Math.round(parseFloat(m[1]));
        m = t.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/i); if (m) return Math.round(parseFloat(m[1])*1609.34);
        m = t.match(/(\d+(?:\.\d+)?)\s*km\b/i); if (m) return Math.round(parseFloat(m[1])*1000);
        return 0;
      };

      for (const seg of struct) {
        const kind = String(seg?.type||'').toLowerCase();
        if (kind === 'warmup' || kind === 'cooldown') {
          const dSec = toSec(seg?.duration);
          const dM = toMeters(seg?.distance);
          if (dM>0) steps.push({ id: uid(), kind: kind==='warmup'?'warmup':'cooldown', distance_m: dM });
          else if (dSec>0) steps.push({ id: uid(), kind: kind==='warmup'?'warmup':'cooldown', duration_s: dSec });
          continue;
        }
        if (kind === 'main_set' && String(seg?.set_type||'').toLowerCase()==='intervals') {
          const reps = Number(seg?.repetitions)||1;
          const work = seg?.work_segment || {};
          const rec = seg?.recovery_segment || {};
          const wSec = toSec(work?.duration);
          const wM = toMeters(work?.distance);
          const rSec = toSec(rec?.duration);
          for (let r=0;r<Math.max(1,reps);r+=1) {
            if (wM>0) steps.push({ id: uid(), kind: 'work', distance_m: wM });
            else if (wSec>0) steps.push({ id: uid(), kind: 'work', duration_s: wSec });
            if (r<reps-1 && rSec>0) steps.push({ id: uid(), kind: 'recovery', duration_s: rSec });
          }
          continue;
        }
        if (kind === 'main_set' && /aerobic/i.test(String(seg?.set_type||''))) {
          const reps = Number(seg?.repetitions)||1; const dist = toMeters(seg?.distance);
          for (let r=0;r<Math.max(1,reps);r+=1) {
            if (dist>0) steps.push({ id: uid(), kind: 'work', distance_m: dist, label: 'aerobic' });
          }
          continue;
        }
        if (kind === 'main_effort' || kind === 'main') {
          const dSec = toSec(seg?.duration); if (dSec>0) steps.push({ id: uid(), kind: 'work', duration_s: dSec });
          const dM = toMeters(seg?.distance); if (dM>0) steps.push({ id: uid(), kind: 'work', distance_m: dM });
          continue;
        }
      }
    }
  } catch {}
  // Final fallback (no parsing of description): if this is a run and row.duration is set,
  // create a single steady step using user's easy pace baseline
  try {
    if (steps.length === 0 && String(row?.type||'').toLowerCase()==='run') {
      const min = Number(row?.duration);
      if (Number.isFinite(min) && min>0) {
        const easy = secPerMiFromBaseline(baselines, 'easy');
        steps.push({ id: uid(), kind: 'work', duration_s: Math.round(min*60), pace_sec_per_mi: easy||undefined });
      }
    }
  } catch {}
  // Final fallback: parse rendered_description/description for a single steady step
  try {
    if (steps.length === 0) {
      const desc = String(row?.rendered_description || row?.description || '').toLowerCase();
      // Duration: prefer an explicit "total duration" marker
      let dMatch = desc.match(/total\s*duration\s*:\s*(\d{1,3}):(\d{2})/);
      if (!dMatch) dMatch = desc.match(/\b(\d{1,3}):(\d{2})\b/);
      const durSec = dMatch ? (parseInt(dMatch[1],10)*60 + parseInt(dMatch[2],10)) : 0;
      // Pace text like 10:30/mi or 5:00/km
      let pMatch = desc.match(/(\d{1,2}):(\d{2})\s*\/mi/);
      let paceSecPerMi: number | null = null;
      if (pMatch) {
        paceSecPerMi = parseInt(pMatch[1],10)*60 + parseInt(pMatch[2],10);
      } else {
        pMatch = desc.match(/(\d{1,2}):(\d{2})\s*\/km/);
        if (pMatch) {
          const spk = parseInt(pMatch[1],10)*60 + parseInt(pMatch[2],10);
          paceSecPerMi = Math.round(spk * 1.60934);
        }
      }
      if (durSec > 0 || (paceSecPerMi!=null)) {
        steps.push({ id: uid(), kind: 'work', duration_s: durSec>0?durSec:1800, pace_sec_per_mi: paceSecPerMi || undefined });
      }
    }
  } catch {}
  // Parse textual target ranges from description and attach as structured fields when missing
  try {
    const desc = String(row?.rendered_description || row?.description || '').toLowerCase();
    const parsePaceRange = (s:string): [number,number] | null => {
      // 10:00-10:30/mi or 5:00-5:15/km
      let m = s.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*\/(mi|km)/i);
      if (!m) return null;
      const a = parseInt(m[1],10)*60 + parseInt(m[2],10);
      const b = parseInt(m[3],10)*60 + parseInt(m[4],10);
      const unit = m[5].toLowerCase();
      if (unit === 'mi') return [Math.min(a,b), Math.max(a,b)];
      const aMi = Math.round(a * 1.60934); const bMi = Math.round(b * 1.60934);
      return [Math.min(aMi,bMi), Math.max(aMi,bMi)];
    };
    const parsePowerRange = (s:string): {lower:number, upper:number} | null => {
      // Handle absolute watt ranges like "200-250W"
      let m = s.match(/(\d{2,4})\s*[–-]\s*(\d{2,4})\s*w/i);
      if (m) {
        const lo = parseInt(m[1],10); const hi = parseInt(m[2],10);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo<=0 || hi<=0) return null;
        return { lower: Math.min(lo,hi), upper: Math.max(lo,hi) };
      }
      
      // Handle FTP percentage ranges like "85-95% FTP" or "90% FTP"
      const ftp = baselines?.ftp;
      if (typeof ftp === 'number' && ftp > 0) {
        // Range format: "85-95% FTP"
        m = s.match(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*%\s*(?:ftp)?/i);
        if (m) {
          const lo = parseInt(m[1],10); const hi = parseInt(m[2],10);
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo<=0 || hi<=0) return null;
          return { lower: Math.round(ftp * (lo/100)), upper: Math.round(ftp * (hi/100)) };
        }
        
        // Single percentage format: "90% FTP"
        m = s.match(/(\d{1,3})\s*%\s*(?:ftp)?/i);
        if (m) {
          const pct = parseInt(m[1],10);
          if (!Number.isFinite(pct) || pct<=0) return null;
          const center = Math.round(ftp * (pct/100));
          const tolerance = 0.05; // ±5% tolerance
          return { lower: Math.round(center * (1-tolerance)), upper: Math.round(center * (1+tolerance)) };
        }
      }
      
      return null;
    };
    const pr = parsePaceRange(desc);
    const pow = parsePowerRange(desc);
    if (pr || pow) {
      for (const st of steps) {
        const kind = String((st as any)?.kind || '').toLowerCase();
        if (kind === 'recovery' || kind === 'rest') continue;
        // Don't apply default power to maximal effort steps (like FTP tests)
        const label = String((st as any)?.label || '').toLowerCase();
        const isMaximalEffort = label.includes('maximal') || label.includes('ftp test') || label.includes('all-out');
        if (pr && !(Array.isArray((st as any)?.pace_range))) (st as any).pace_range = pr;
        if (pow && !isMaximalEffort && !((st as any)?.power_range && typeof (st as any).power_range.lower==='number')) (st as any).power_range = pow;
      }
    }
  } catch {}
  
  // For swim steps with distance but no duration, estimate duration using baseline pace
  if (discipline === 'swim') {
    try {
      // Parse baseline swim pace from various formats (string "mm:ss" or number seconds)
      const swimPacePer100Sec = (() => {
        // Try numeric format first (seconds per 100)
        const numPace = baselines?.swim_pace_per_100_sec ?? (row as any)?.baselines_template?.swim_pace_per_100_sec ?? (row as any)?.baselines?.swim_pace_per_100_sec;
        if (typeof numPace === 'number' && numPace > 0) {
          console.log(`  🏊 Using numeric baseline pace: ${numPace}s per 100`);
          return numPace;
        }
        
        // Try string format "mm:ss" (e.g., "2:10")
        const strPace = (baselines as any)?.swimPace100 ?? (row as any)?.baselines_template?.swimPace100 ?? (row as any)?.baselines?.swimPace100;
        if (typeof strPace === 'string' && /^\d{1,2}:\d{2}$/.test(strPace)) {
          const [mm, ss] = strPace.split(':').map((t:string)=>parseInt(t,10));
          const sec = mm*60 + ss;
          if (sec > 0) {
            console.log(`  🏊 Using string baseline pace: ${strPace} (${sec}s per 100)`);
            return sec;
          }
        }
        
        // Default fallback: 1:30/100 (90 seconds)
        console.log(`  🏊 No baseline found, using default: 90s per 100 (1:30/100)`);
        return 90;
      })();
      
      // Determine baseline unit from user's preferred units (imperial=yards, metric=meters)
      const userUnits = String((row as any)?.units || '').toLowerCase();
      const baselineUnit = (userUnits === 'imperial') ? 'yd' : 'm';
      const poolUnit = ((row as any)?.pool_unit as 'yd' | 'm' | null) || baselineUnit;
      
      console.log(`  🏊 Baseline unit: ${baselineUnit}, Pool unit: ${poolUnit}`);
      
      for (const st of steps) {
        // Skip if step already has duration
        if (typeof st.duration_s === 'number' && st.duration_s > 0) continue;
        
        // Check both camelCase and snake_case field names
        const distM = typeof st.distanceMeters === 'number' ? st.distanceMeters : (typeof st.distance_m === 'number' ? st.distance_m : 0);
        if (distM > 0) {
          // Convert distance to baseline unit, calculate duration, then apply
          let dist100: number;
          if (baselineUnit === 'yd') {
            // Baseline is per 100 yards
            const distYd = distM / 0.9144;
            dist100 = distYd / 100;
          } else {
            // Baseline is per 100 meters
            dist100 = distM / 100;
          }
          const calcDur = Math.round(dist100 * swimPacePer100Sec);
          st.duration_s = calcDur;
          console.log(`    ⏱️  ${distM}m → ${Math.round(distM/0.9144)}yd → ${dist100.toFixed(2)} × ${swimPacePer100Sec}s = ${calcDur}s`);
        }
      }
    } catch {}
  }
  
  const total_s = steps.reduce((s,st)=> s + (Number(st.duration_s)||0), 0);
  return { steps, total_s };
}

Deno.env.get; // keep Deno type active

function mmss(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2,'0')}`;
}

function toV3Step(st: any, row?: any): any {
  const out: any = { id: st?.id || uid() };
  
  // Duration: explicit or calculated from distance + pace
  if (typeof st?.duration_s === 'number') {
    out.seconds = Math.max(1, Math.round(st.duration_s));
  } else if (typeof st?.distance_m === 'number' && st.distance_m > 0) {
    // Calculate duration from distance and pace for distance-based steps
    const distM = st.distance_m;
    let paceSecPerMi: number | null = null;
    
    // Try to get pace from pace_range (use midpoint)
    if (Array.isArray(st?.pace_range) && st.pace_range.length === 2) {
      const a = Number(st.pace_range[0]);
      const b = Number(st.pace_range[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        paceSecPerMi = (a + b) / 2;
      }
    }
    // Fallback to single pace target
    if (!paceSecPerMi && typeof st?.pace_sec_per_mi === 'number' && st.pace_sec_per_mi > 0) {
      paceSecPerMi = st.pace_sec_per_mi;
    }
    
    // Calculate duration: distance (meters) / 1609.34 * pace (sec/mi)
    if (paceSecPerMi && paceSecPerMi > 0) {
      const miles = distM / 1609.34;
      const durationSec = miles * paceSecPerMi;
      out.seconds = Math.max(1, Math.round(durationSec));
    }
  }
  
  // Distance: explicit or calculated from duration + pace (for time-based steps)
  if (typeof st?.distance_m === 'number' && st.distance_m > 0) {
    out.distanceMeters = Math.max(1, Math.round(st.distance_m));
  } else if (typeof out.seconds === 'number' && out.seconds > 0) {
    // For time-based steps: calculate distance from duration and pace
    let paceSecPerMi: number | null = null;
    
    // Try to get pace from pace_range (use midpoint)
    if (Array.isArray(st?.pace_range) && st.pace_range.length === 2) {
      const a = Number(st.pace_range[0]);
      const b = Number(st.pace_range[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
        paceSecPerMi = (a + b) / 2;
      }
    }
    // Fallback to single pace target
    if (!paceSecPerMi && typeof st?.pace_sec_per_mi === 'number' && st.pace_sec_per_mi > 0) {
      paceSecPerMi = st.pace_sec_per_mi;
    }
    
    // Calculate distance: (duration_seconds / pace_sec_per_mi) * 1609.34 meters
    if (paceSecPerMi && paceSecPerMi > 0) {
      const miles = out.seconds / paceSecPerMi;
      const distanceMeters = miles * 1609.34;
      out.distanceMeters = Math.max(1, Math.round(distanceMeters));
    }
  }
  if (typeof st?.pace_sec_per_mi === 'number') {
    out.paceTarget = `${mmss(st.pace_sec_per_mi)}/mi`;
    
    // RACE DAY: No pace range - fixed M pace only (matches generator logic)
    // Check if this is a race day workout (from tags or description)
    const isRaceDay = (() => {
      if (!row) return false;
      const rowTags: string[] = Array.isArray((row as any)?.tags) ? (row as any).tags.map((t:any)=>String(t).toLowerCase()) : [];
      const desc: string = String((row as any)?.description || '').toLowerCase();
      return rowTags.includes('race_day') || rowTags.includes('marathon_pace') || /race\s+day/i.test(desc);
    })();
    
    if (isRaceDay) {
      // Race day: fixed pace, no range (exact M pace target)
      out.pace_range = { lower: st.pace_sec_per_mi, upper: st.pace_sec_per_mi };
    } else {
      // Calculate pace range with appropriate tolerance
      // Use strict tolerance for quality work (matches Garmin/TrainingPeaks standards)
      // Use lenient tolerance for easy/recovery/long runs (accounts for terrain, fatigue)
      const paceSec = st.pace_sec_per_mi;
      const tolerance = (st?.kind === 'work') 
        ? 0.02   // ±2% for quality work (~10-20s for most paces)
        : 0.06;  // ±6% for easy runs (~30-60s for most paces)
      
      const lower = Math.round(paceSec * (1 - tolerance));
      const upper = Math.round(paceSec * (1 + tolerance));
      out.pace_range = { lower, upper };
    }
  }
  if (Array.isArray(st?.pace_range) && st.pace_range.length===2) {
    const a = Number(st.pace_range[0]); const b = Number(st.pace_range[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a>0 && b>0) {
      // Store as object with numeric properties for analysis
      out.pace_range = { lower: a, upper: b };
    }
  }
  if (st?.power_range && typeof st.power_range.lower === 'number' && typeof st.power_range.upper === 'number') {
    const lo = Math.round(st.power_range.lower);
    const up = Math.round(st.power_range.upper);
    out.powerTarget = `${Math.round((lo + up) / 2)} W`;
    out.powerRange = { lower: lo, upper: up };
  }
  if (typeof st?.label === 'string') out.label = st.label;
  if (st?.equipment) out.equipment = st.equipment;
  if (st?.strength) out.strength = st.strength;
  if (typeof st?.planned_index === 'number') out.planned_index = st.planned_index;
  if (st?.kind) out.kind = st.kind;
  return out;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  try {
    const payload = await req.json();
    const planId: string | null = payload?.plan_id ?? null;
    const plannedRowId: string | null = payload?.planned_workout_id ?? null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Find rows to materialize
    let rows: any[] = [];
    if (plannedRowId) {
      console.log(`[materialize-plan] Looking for planned_workout_id: ${plannedRowId}`);
      const { data, error } = await supabase.from('planned_workouts').select('*').eq('id', plannedRowId).limit(1);
      if (error) console.error(`[materialize-plan] Error querying planned_workout_id:`, error);
      rows = data || [];
      console.log(`[materialize-plan] Found ${rows.length} row(s) for planned_workout_id`);
    } else if (planId) {
      console.log(`[materialize-plan] Looking for plan_id: ${planId}`);
      const { data, error } = await supabase.from('planned_workouts').select('*').eq('training_plan_id', planId).order('date');
      if (error) console.error(`[materialize-plan] Error querying plan_id:`, error);
      rows = data || [];
      console.log(`[materialize-plan] Found ${rows.length} row(s) for plan_id`);
      if (rows.length > 0) {
        console.log(`[materialize-plan] Sample row: type=${rows[0].type}, has_steps_preset=${Array.isArray(rows[0].steps_preset) && rows[0].steps_preset.length > 0}, steps_preset=${JSON.stringify(rows[0].steps_preset)}`);
      }
    } else {
      return new Response(JSON.stringify({ error:'plan_id or planned_workout_id required' }), { status:400, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
    }
    if (!rows.length) {
      console.warn(`[materialize-plan] No rows found to materialize - returning early`);
      return new Response(JSON.stringify({ success:true, materialized:0 }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
    }

    // Load baselines for user inferred from first row
    const userId = rows[0]?.user_id;
    let baselines: Baselines = {};
    try {
      const { data: ub } = await supabase.from('user_baselines').select('performance_numbers, equipment, effort_paces').eq('user_id', userId).maybeSingle();
      baselines = {
        ...(ub?.performance_numbers || {}),
        equipment: ub?.equipment || {},
        effort_paces: ub?.effort_paces || undefined
      } as any;
      if (ub?.effort_paces) {
        console.log(`[Paces] Found effort_paces from PlanWizard:`, ub.effort_paces);
      }
      console.log(`🔍 [FTP DEBUG] User ${userId} baselines:`, baselines);
      console.log(`🔍 [FTP DEBUG] FTP value:`, baselines?.ftp);
      console.log(`🔍 [EQUIPMENT DEBUG] Equipment:`, baselines?.equipment);
    } catch (e) {
      console.error(`❌ [FTP DEBUG] Error loading baselines:`, e);
    }

    // Load active plan adjustments for this user
    let adjustments: PlanAdjustment[] = [];
    try {
      const { data: adjData } = await supabase
        .from('plan_adjustments')
        .select('id, exercise_name, adjustment_factor, absolute_weight, weight_offset, applies_from, applies_until, status')
        .eq('user_id', userId)
        .eq('status', 'active');
      adjustments = adjData || [];
      if (adjustments.length > 0) {
        console.log(`🔧 Found ${adjustments.length} active plan adjustments for user`);
      }
    } catch (e) {
      console.error(`❌ Error loading plan adjustments:`, e);
    }

    let count = 0;
    for (const row of rows) {
      try {
        console.log(`📋 Materializing: ${row.type} - ${row.name} (${row.id})`);
        const tokens: string[] = Array.isArray(row?.steps_preset) ? row.steps_preset : [];
        const { steps, total_s } = expandTokensForRow(row, baselines, adjustments);
        console.log(`  ✅ Generated ${steps.length} steps, total_s: ${total_s} (${Math.floor(total_s/60)}:${String(total_s%60).padStart(2,'0')})`);
        
        // Log error if materialization failed but tokens exist
        if (steps.length === 0 && tokens.length > 0) {
          console.error(`❌ Materialization failed for ${row.id}:`);
          console.error(`   Type: ${row.type}`);
          console.error(`   Name: ${row.name}`);
          console.error(`   Tokens: ${tokens.join(', ')}`);
          console.error(`   This indicates tokens did not match any patterns or fallbacks failed`);
        }
        
        if (steps && steps.length) {
          // Count recovery steps
          const recoverySteps = steps.filter((st:any) => st.kind === 'recovery' || st.kind === 'rest').length;
          console.log(`  🔄 Recovery steps: ${recoverySteps}`);
          // Assign stable planned_index per step
          const withIndex = steps.map((st:any, idx:number)=> ({ ...st, planned_index: idx }));
          const v3 = withIndex.map((st: any) => toV3Step(st, row));
          // Recalculate total from v3 steps (which have calculated durations for distance-based steps)
          const actualTotal = v3.reduce((sum:number, st:any) => sum + (Number(st?.seconds) || 0), 0);
          // For strength workouts with no calculated duration, preserve the original duration from the plan
          const originalDuration = typeof row.duration === 'number' && row.duration > 0 ? row.duration : 0;
          const finalTotalSeconds = actualTotal > 0 ? actualTotal : (originalDuration * 60);
          const finalDuration = actualTotal > 0 ? Math.round(actualTotal / 60) : (originalDuration > 0 ? originalDuration : 1);
          const update: any = { computed: { normalization_version: 'v3', steps: v3, total_duration_seconds: finalTotalSeconds }, total_duration_seconds: finalTotalSeconds, duration: Math.max(1, finalDuration) };
          
          // Debug: Log band exercises before DB write
          const bandSteps = v3.filter((st:any) => st?.kind === 'strength' && st?.strength?.name?.toLowerCase().includes('band'));
          if (bandSteps.length > 0) {
            console.log(`💾 Writing ${bandSteps.length} band exercises to DB:`, bandSteps.map((st:any) => ({ name: st.strength.name, notes: st.strength.notes })));
          }
          
          await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
          count += 1;
        }
      } catch (err) {
        console.error(`❌ Error materializing ${row.id}:`, err);
      }
    }
    return new Response(JSON.stringify({ success:true, materialized: count }), { headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ error:String(e) }), { status:500, headers:{ ...corsHeaders, 'Content-Type':'application/json'} });
  }
});


