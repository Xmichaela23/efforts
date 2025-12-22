/**
 * Research-Based Exercise Configuration
 * 
 * Maps exercises to their primary 1RM reference and research-based ratios.
 * Sources:
 * - NSCA Essentials of Strength Training & Conditioning
 * - Schoenfeld et al. (2021) - Unilateral vs bilateral strength
 * - Helms et al. (2016) - Accessory movement prescriptions
 * 
 * Key Concepts:
 * - ratio: The exercise's 1RM relative to the primary lift (e.g., BSS = 0.60 of squat)
 * - displayFormat: How weight should be shown to the user
 * - isUnilateral: Whether the exercise works one side at a time
 * - perHandDivide: For dumbbell exercises, whether to divide total by 2
 */

export interface ExerciseConfig {
  primaryRef: 'squat' | 'deadlift' | 'bench' | 'overhead' | 'hipThrust' | null;
  ratio: number;           // 1RM ratio to primary lift
  displayFormat: 'total' | 'perHand' | 'perLeg' | 'bodyweight' | 'band';
  isUnilateral: boolean;
  notes?: string;
}

// Research-based exercise configurations
export const EXERCISE_CONFIG: Record<string, ExerciseConfig> = {
  // ============================================================================
  // KNEE DOMINANT (Squat Reference)
  // ============================================================================
  
  // Bulgarian Split Squat: Research shows ~60-70% of back squat 1RM (total load)
  // Speirs et al. (2016): BSS 1RM ≈ 60% of bilateral squat
  'bulgarian split squat': {
    primaryRef: 'squat',
    ratio: 0.60,
    displayFormat: 'perHand',
    isUnilateral: true,
    notes: 'Hold dumbbells at sides. Total load ~60% of squat 1RM.'
  },
  
  // Walking/Reverse Lunges: Similar to BSS but slightly less stable
  'walking lunge': {
    primaryRef: 'squat',
    ratio: 0.55,
    displayFormat: 'perHand',
    isUnilateral: true,
    notes: 'Hold dumbbells at sides or goblet position.'
  },
  'walking lunges': {
    primaryRef: 'squat',
    ratio: 0.55,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'reverse lunge': {
    primaryRef: 'squat',
    ratio: 0.55,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'reverse lunges': {
    primaryRef: 'squat',
    ratio: 0.55,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'lateral lunge': {
    primaryRef: 'squat',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // Goblet Squat: Limited by upper body hold capacity
  // Typically ~40-50% of back squat due to hold limitation
  'goblet squat': {
    primaryRef: 'squat',
    ratio: 0.45,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Single dumbbell/kettlebell at chest.'
  },
  
  // Step-ups: Heavily technique dependent
  'step up': {
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'step ups': {
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // Front Squat: ~85% of back squat (Gulick et al., 2015)
  'front squat': {
    primaryRef: 'squat',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Leg Press: Can handle more than squat (stable machine)
  'leg press': {
    primaryRef: 'squat',
    ratio: 1.50,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Leg Extension: Isolation, much lower load
  'leg extension': {
    primaryRef: 'squat',
    ratio: 0.35,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // ============================================================================
  // HIP DOMINANT (Deadlift Reference)
  // ============================================================================
  
  // Hip Thrust: Research shows can exceed DL 1RM when hip-focused
  // Contreras et al. (2017): Hip thrust 1RM averages ~90-110% of deadlift
  'hip thrust': {
    primaryRef: 'deadlift',
    ratio: 1.00,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Barbell or smith machine. Can match or exceed deadlift loads.'
  },
  'hip thrusts': {
    primaryRef: 'deadlift',
    ratio: 1.00,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Romanian Deadlift: ~70-80% of conventional (longer moment arm)
  'romanian deadlift': {
    primaryRef: 'deadlift',
    ratio: 0.75,
    displayFormat: 'total',
    isUnilateral: false
  },
  'rdl': {
    primaryRef: 'deadlift',
    ratio: 0.75,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Single Leg RDL: Unilateral, stability limited
  // ~35-40% of bilateral deadlift per leg
  'single leg rdl': {
    primaryRef: 'deadlift',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: true,
    notes: 'Hold dumbbell on opposite side of working leg.'
  },
  'single leg romanian deadlift': {
    primaryRef: 'deadlift',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // Glute Bridge: Bodyweight or light load
  'glute bridge': {
    primaryRef: 'deadlift',
    ratio: 0.40,
    displayFormat: 'total',
    isUnilateral: false
  },
  'glute bridges': {
    primaryRef: 'deadlift',
    ratio: 0.40,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Good Morning: Much lower due to lever arm
  'good morning': {
    primaryRef: 'deadlift',
    ratio: 0.40,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Sumo Deadlift: ~95% of conventional for most lifters
  'sumo deadlift': {
    primaryRef: 'deadlift',
    ratio: 0.95,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Leg Curl: Isolation, much lower
  'leg curl': {
    primaryRef: 'deadlift',
    ratio: 0.30,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // ============================================================================
  // UPPER PUSH (Bench Reference)
  // ============================================================================
  
  // Dumbbell Bench Press: Each DB ~37-40% of barbell bench (stability demand)
  'dumbbell bench press': {
    primaryRef: 'bench',
    ratio: 0.80, // Total DB load = 80% of barbell
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'db bench press': {
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Incline Bench: ~80-85% of flat bench
  'incline bench press': {
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  'incline bench': {
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dumbbell Incline: Each DB ~35% of flat barbell
  'dumbbell incline press': {
    primaryRef: 'bench',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Close Grip Bench: ~90% of regular bench
  'close grip bench press': {
    primaryRef: 'bench',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dips: Bodyweight + added load
  'dips': {
    primaryRef: 'bench',
    ratio: 0.0, // Bodyweight
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'dip': {
    primaryRef: 'bench',
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // Chest Fly: Isolation, much lower
  'chest fly': {
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'dumbbell fly': {
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // ============================================================================
  // UPPER PULL (Bench Reference as proxy)
  // ============================================================================
  
  // Barbell Row: ~80-90% of bench for strong pullers
  'barbell row': {
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  'barbell rows': {
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  'bent over row': {
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dumbbell Row: Each DB ~40-45% of bench
  'dumbbell row': {
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'dumbbell rows': {
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // Face Pull: Light prehab work
  'face pull': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'face pulls': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  
  // ============================================================================
  // SHOULDERS (Overhead Press Reference)
  // ============================================================================
  
  // Dumbbell Shoulder Press: Each DB ~30-35% of barbell OHP
  'dumbbell shoulder press': {
    primaryRef: 'overhead',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Lateral Raise: Very light, isolation
  // ~20-25% of OHP per dumbbell
  'lateral raise': {
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'lateral raises': {
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Front Raise: Similar to lateral
  'front raise': {
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Reverse Fly: Very light, posterior delt isolation
  'reverse fly': {
    primaryRef: 'overhead',
    ratio: 0.20,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'reverse flye': {
    primaryRef: 'overhead',
    ratio: 0.20,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // YTW Raises: Prehab, very light
  'ytw raises': {
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'perHand',
    isUnilateral: false,
    notes: 'Light dumbbells or plates for scapular health.'
  },
  'ytw raise': {
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // ============================================================================
  // EXPLOSIVE/PLYOMETRIC (Bodyweight)
  // ============================================================================
  
  'jump squat': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'jump squats': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'box jump': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'box jumps': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'broad jump': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'broad jumps': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bench jumps': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bounding': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // CORE (Bodyweight)
  // ============================================================================
  
  'plank': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'side plank': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'dead bug': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'dead bugs': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bird dog': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'bird dogs': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'pallof press': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'clamshell': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: true
  },
  'clamshells': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: true
  },
  
  // ============================================================================
  // CALF WORK (Bodyweight/Light)
  // ============================================================================
  
  'calf raise': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'calf raises': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'single leg calf raise': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'single leg calf raises': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  
  // ============================================================================
  // SWINGS (Deadlift Reference)
  // Kettlebell/dumbbell swings: ~20-25% of deadlift for explosive work
  // ============================================================================
  
  'kettlebell swing': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Explosive hip hinge. Weight should allow powerful hip snap.'
  },
  'kettlebell swings': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'dumbbell swing': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'dumbbell swings': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
};

/**
 * Look up exercise configuration, with fuzzy matching fallback
 */
export function getExerciseConfig(exerciseName: string): ExerciseConfig | null {
  const normalized = exerciseName.toLowerCase().trim();
  
  // Exact match first
  if (EXERCISE_CONFIG[normalized]) {
    return EXERCISE_CONFIG[normalized];
  }
  
  // Fuzzy match: check if exercise name contains any key
  for (const [key, config] of Object.entries(EXERCISE_CONFIG)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return config;
    }
  }
  
  return null;
}

/**
 * Get the baseline 1RM value for an exercise
 */
export function getBaseline1RM(
  config: ExerciseConfig,
  baselines: { squat?: number; deadlift?: number; bench?: number; overhead?: number; hipThrust?: number }
): number | null {
  if (!config.primaryRef) return null;
  
  switch (config.primaryRef) {
    case 'squat': return baselines.squat ?? null;
    case 'deadlift': return baselines.deadlift ?? null;
    case 'bench': return baselines.bench ?? null;
    case 'overhead': return baselines.overhead ?? null;
    case 'hipThrust': return baselines.hipThrust ?? null;
    default: return null;
  }
}

/**
 * Calculate prescribed weight from exercise config, baselines, and target percentage
 */
export function calculatePrescribedWeight(
  exerciseName: string,
  targetPercent: number, // e.g., 0.70 for 70% 1RM
  baselines: { squat?: number; deadlift?: number; bench?: number; overhead?: number; hipThrust?: number },
  reps?: number
): { weight: number | null; displayFormat: string; notes?: string } {
  const config = getExerciseConfig(exerciseName);
  
  if (!config) {
    // Unknown exercise - return null weight
    return { weight: null, displayFormat: 'total' };
  }
  
  if (config.displayFormat === 'bodyweight' || config.displayFormat === 'band') {
    // No weight calculation needed
    return { weight: 0, displayFormat: config.displayFormat, notes: config.notes };
  }
  
  const base1RM = getBaseline1RM(config, baselines);
  if (!base1RM) {
    return { weight: null, displayFormat: config.displayFormat, notes: config.notes };
  }
  
  // Calculate inferred 1RM for this exercise
  const inferred1RM = base1RM * config.ratio;
  
  // Apply target percentage and rep adjustment
  const repScale = getRepScale(reps);
  let prescribedTotal = inferred1RM * targetPercent * repScale;
  
  // Round to nearest 5 lbs
  prescribedTotal = Math.max(5, Math.round(prescribedTotal / 5) * 5);
  
  // For perHand exercises, divide by 2
  if (config.displayFormat === 'perHand') {
    prescribedTotal = Math.max(5, Math.round(prescribedTotal / 2 / 5) * 5);
  }
  
  return { 
    weight: prescribedTotal, 
    displayFormat: config.displayFormat,
    notes: config.notes
  };
}

/**
 * Rep-based load adjustment (Prilepin's chart inspired)
 * Higher reps = slightly lower percentage for same RPE
 */
function getRepScale(reps?: number): number {
  if (typeof reps !== 'number') return 1.0;
  if (reps <= 3) return 1.05;
  if (reps <= 5) return 1.02;
  if (reps <= 8) return 1.00;
  if (reps <= 12) return 0.97;
  if (reps <= 15) return 0.93;
  return 0.90;
}

/**
 * Format weight for display with appropriate label
 */
export function formatWeightDisplay(weight: number | null, displayFormat: string): string {
  if (weight === null) return '';
  if (weight === 0) return 'Bodyweight';
  
  switch (displayFormat) {
    case 'perHand':
      return `${weight} lb each`;
    case 'perLeg':
      return `${weight} lb per leg`;
    case 'total':
      return `${weight} lb`;
    case 'band':
      return 'Band';
    case 'bodyweight':
      return 'Bodyweight';
    default:
      return `${weight} lb`;
  }
}
