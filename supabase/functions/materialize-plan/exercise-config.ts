/**
 * Research-Based Exercise Configuration
 * 
 * Maps exercises to their primary baseline lift and research-based ratios.
 * These ratios are used to ESTIMATE TRAINING LOADS, not to predict actual 1RMs.
 * 
 * Sources:
 * - NSCA Essentials of Strength Training & Conditioning
 * - Schoenfeld et al. (2021) - Unilateral vs bilateral strength
 * - Helms et al. (2016) - Accessory movement prescriptions
 * - Contreras et al. (2017) - Hip thrust mechanics
 * 
 * IMPORTANT: Individual variation is ~10-20%. These ratios are:
 * ✅ Good for prescribing working weights (70-80% of estimated load)
 * ❌ Not accurate for testing or competition
 * 
 * Key Concepts:
 * - ratio: The exercise's estimated working capacity relative to the primary lift
 *   (conservative mid-point of research ranges for safe training load prescription)
 * - displayFormat: How weight should be shown to the user
 * - isUnilateral: Whether the exercise works one side at a time
 * - confidence: 'high' (±10%), 'medium' (±15%), 'low' (±20%) variance expected
 */

export interface ExerciseConfig {
  primaryRef: 'squat' | 'deadlift' | 'bench' | 'overhead' | 'hipThrust' | null;
  ratio: number;           // Training load ratio to primary lift (conservative estimate)
  displayFormat: 'total' | 'perHand' | 'perLeg' | 'bodyweight' | 'band' | 'dipsAdded';
  isUnilateral: boolean;
  ratioIsTotal?: boolean;  // TRUE = ratio gives total load, divide by 2 for perHand display
                           // FALSE/undefined = ratio already represents per-implement load
  confidence?: 'high' | 'medium' | 'low';  // Expected variance: high=±10%, medium=±15%, low=±20%
  notes?: string;
}

// Research-based exercise configurations
export const EXERCISE_CONFIG: Record<string, ExerciseConfig> = {
  // ============================================================================
  // KNEE DOMINANT (Squat Reference)
  // ============================================================================
  
  // Bulgarian Split Squat: Research shows ~60-70% of back squat 1RM (total load)
  // Speirs et al. (2016): BSS 1RM ≈ 60% of bilateral squat
  // Using 0.50 for general population (stability/balance demands)
  'bulgarian split squat': {
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,  // 0.50 = total load, divide by 2 for per-hand
    notes: 'Hold dumbbells at sides.'
  },
  
  // Walking/Reverse Lunges: Similar to BSS but slightly less stable
  'walking lunge': {
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,
    notes: 'Hold dumbbells at sides.'
  },
  'walking lunges': {
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true
  },
  'reverse lunge': {
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true
  },
  'reverse lunges': {
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true
  },
  // Lateral Lunge: Much lighter than BSS due to adductor/abductor limitation
  // Typical athlete can only lateral lunge ~30% of squat 1RM (goblet hold)
  'lateral lunge': {
    primaryRef: 'squat',
    ratio: 0.30,
    displayFormat: 'total',  // Goblet hold - one weight
    isUnilateral: true
  },
  'lateral lunges': {
    primaryRef: 'squat',
    ratio: 0.30,
    displayFormat: 'total',
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
  'step-ups': {
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
  
  // Hip Thrust: Research shows 90-110% of DL, using conservative 0.90 for training loads
  // Contreras et al. (2017): Hip thrust 1RM averages ~90-110% of deadlift
  // Using 0.90 (low end) for safe training load prescription
  'hip thrust': {
    primaryRef: 'deadlift',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
    notes: 'Barbell or smith machine. Strong hip-dominant athletes may exceed this.'
  },
  'hip thrusts': {
    primaryRef: 'deadlift',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  
  // Romanian Deadlift: ~70-80% of conventional (longer moment arm)
  'romanian deadlift': {
    primaryRef: 'deadlift',
    ratio: 0.75,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
  },
  'rdl': {
    primaryRef: 'deadlift',
    ratio: 0.75,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
  },
  
  // Single Leg RDL: Unilateral, heavily stability-limited
  // Uses ONE dumbbell (contralateral hold), so displayFormat is 'total' not 'perHand'
  // Conservative 0.25 ratio - balance is typically the limiter, not strength
  'single leg rdl': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',  // One DB held opposite working leg
    isUnilateral: true,
    notes: 'Hold dumbbell on opposite side of working leg.'
  },
  'single leg romanian deadlift': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
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
  
  // Barbell Bench Press: Primary lift, uses bench 1RM directly
  'bench press': {
    primaryRef: 'bench',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Barbell bench press. Use bench 1RM baseline directly.'
  },
  'bench': {
    primaryRef: 'bench',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dumbbell Bench Press: Each DB ~37-40% of barbell bench (stability demand)
  'dumbbell bench press': {
    primaryRef: 'bench',
    ratio: 0.80, // Total DB load = 80% of barbell
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true  // 0.80 = total, divide by 2 for each hand
  },
  'db bench press': {
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true
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
  
  // Dumbbell Incline: Total ~70% of flat barbell
  'dumbbell incline press': {
    primaryRef: 'bench',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true
  },
  
  // Close Grip Bench: ~90% of regular bench
  'close grip bench press': {
    primaryRef: 'bench',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dips: ~90% of bench press 1RM (total = bodyweight + added weight)
  // Most users won't need added weight, but advanced athletes might
  'dips': {
    primaryRef: 'bench',
    ratio: 0.90, // Dip 1RM = 90% of bench 1RM
    displayFormat: 'total', // Will calculate total load, then subtract bodyweight
    isUnilateral: false,
    notes: 'Total load (bodyweight + added). Shows added weight if ≥10 lb, otherwise "Bodyweight".'
  },
  'dip': {
    primaryRef: 'bench',
    ratio: 0.90,
    displayFormat: 'total',
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
  
  // Barbell Row: ~75-85% of bench for strict form
  // Using 0.80 for clean technique (no momentum)
  'barbell row': {
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  'barbell rows': {
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  'bent over row': {
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  
  // Dumbbell Row: Each DB ~40-45% of bench (per hand)
  // ratio is per-hand weight, not total
  'dumbbell row': {
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'high'
  },
  'dumbbell rows': {
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'high'
  },
  
  // Generic "rows" alias (for abbreviated instructions)
  'rows': {
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
    notes: 'Generic rows - assumes barbell row weight.'
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
  
  // Dumbbell Shoulder Press: Total ~70% of barbell OHP
  'dumbbell shoulder press': {
    primaryRef: 'overhead',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true  // 0.70 = total, divide by 2 for each hand
  },
  'db shoulder press': {
    primaryRef: 'overhead',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true
  },
  
  // Standing/Seated Shoulder Press (OHP): Uses overhead 1RM directly
  'shoulder press': {
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
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
  'dumbbell lateral raise': {
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'dumbbell lateral raises': {
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
  // PULL-UPS / BODYWEIGHT UPPER PULL
  // Pull-ups: Bodyweight by default, can add weight for advanced
  // ============================================================================
  
  'pull-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Bodyweight. Add weight when 3x12 is easy.'
  },
  'pull-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pullup': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pullups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'chin-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'chin-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'lat pulldown': {
    primaryRef: 'bench',
    ratio: 0.65,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Inverted Rows: Bodyweight horizontal pull
  'inverted row': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Feet elevated for progression.'
  },
  'inverted rows': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // PUSH-UPS / BODYWEIGHT UPPER PUSH
  // ============================================================================
  
  'push-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Standard → Diamond → Decline → Archer for progression.'
  },
  'push-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pushup': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pushups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'diamond push-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'diamond push-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'decline push-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'decline push-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'archer push-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'archer push-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'pike push-up': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Elevate feet to progress toward HSPU.'
  },
  'pike push-ups': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // EXPLOSIVE LOWER BODY (Bodyweight)
  // ============================================================================
  
  'skater hop': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'skater hops': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'jump lunge': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'jump lunges': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  
  // ============================================================================
  // BAND EXERCISES
  // ============================================================================
  
  'lateral band walk': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
    notes: 'Mini band around ankles or above knees.'
  },
  'lateral band walks': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'band face pull': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'band face pulls': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  
  // ============================================================================
  // ADDITIONAL CORE (Bodyweight)
  // ============================================================================
  
  'copenhagen plank': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
    notes: 'Adductor-focused core stability.'
  },
  'copenhagen planks': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'core circuit': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'core work': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // SINGLE LEG GLUTE BRIDGE (Bodyweight)
  // ============================================================================
  
  'single leg glute bridge': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'single leg glute bridges': {
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
  
  // Alias: KB/DB Swings (common in programming)
  'kb/db swings': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'kb swings': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'db swings': {
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // ============================================================================
  // STEP-UPS (Squat Reference) - additional aliases
  // ============================================================================
  
  'box step-up': {
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'box step-ups': {
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // ============================================================================
  // SQUAT VARIANTS (Bodyweight explosives)
  // ============================================================================
  
  'squat jump': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'squat jumps': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bodyweight squat': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bodyweight squats': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'air squat': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'air squats': {
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
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
 * Handles multiple field name variants for compatibility
 */
export function getBaseline1RM(
  config: ExerciseConfig,
  baselines: any // Accept any to handle various field name formats
): number | null {
  if (!config.primaryRef) return null;
  
  switch (config.primaryRef) {
    case 'squat': 
      return Number.isFinite(baselines?.squat) ? baselines.squat : null;
    case 'deadlift': 
      return Number.isFinite(baselines?.deadlift) ? baselines.deadlift : null;
    case 'bench': 
      return Number.isFinite(baselines?.bench) ? baselines.bench : null;
    case 'overhead': 
      // Check multiple field name variants (ohp, overheadPress1RM, overhead, overhead_press)
      const ohp = baselines?.overheadPress1RM ?? baselines?.ohp ?? baselines?.overhead ?? baselines?.overhead_press;
      return Number.isFinite(ohp) ? ohp : null;
    case 'hipThrust': 
      return Number.isFinite(baselines?.hipThrust) ? baselines.hipThrust : null;
    default: return null;
  }
}

/**
 * Calculate prescribed weight from exercise config, baselines, and target percentage
 */
export function calculatePrescribedWeight(
  exerciseName: string,
  targetPercent: number, // e.g., 0.70 for 70% 1RM
  baselines: any, // Accept any to handle various field name formats (ohp, overheadPress1RM, etc.)
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
  
  // Special handling for dips: calculate total load, then subtract bodyweight
  const exerciseNameLower = exerciseName.toLowerCase();
  if ((exerciseNameLower === 'dips' || exerciseNameLower === 'dip') && config.primaryRef === 'bench') {
    // Calculate target total load (bodyweight + added weight)
    const inferred1RM = base1RM * config.ratio; // Dip 1RM = 90% of bench
    const repScale = getRepScale(reps);
    const targetTotalLoad = inferred1RM * targetPercent * repScale;
    
    // Get bodyweight from baselines (check multiple field names)
    const bodyweight = baselines?.weight ?? baselines?.bodyweight ?? baselines?.bodyWeight;
    
    if (Number.isFinite(bodyweight) && bodyweight > 0) {
      // Calculate added weight needed
      const addedWeight = targetTotalLoad - bodyweight;
      
      // 10 lb threshold: only show added weight if >= 10 lb
      if (addedWeight >= 10) {
        const roundedAdded = Math.max(10, Math.round(addedWeight / 5) * 5);
        return {
          weight: roundedAdded,
          displayFormat: 'dipsAdded', // Special format for "+X lb"
          notes: config.notes
        };
      } else {
        // Bodyweight is sufficient (or close enough)
        return {
          weight: 0,
          displayFormat: 'bodyweight',
          notes: config.notes
        };
      }
    } else {
      // No bodyweight available - default to bodyweight
      return {
        weight: 0,
        displayFormat: 'bodyweight',
        notes: config.notes
      };
    }
  }
  
  // Standard calculation for other exercises
  // Calculate inferred 1RM for this exercise
  const inferred1RM = base1RM * config.ratio;
  
  // Apply target percentage and rep adjustment
  const repScale = getRepScale(reps);
  let prescribedWeight = inferred1RM * targetPercent * repScale;
  
  // For perHand exercises: divide BEFORE rounding (so we round to real dumbbell weights)
  if (config.displayFormat === 'perHand' && config.ratioIsTotal) {
    prescribedWeight = prescribedWeight / 2;
  }
  // If ratioIsTotal is false/undefined, ratio already represents per-implement load
  
  // Round to nearest 5 lbs (matches real gym equipment)
  prescribedWeight = Math.max(5, Math.round(prescribedWeight / 5) * 5);
  
  return { 
    weight: prescribedWeight, 
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
  if (weight === 0 && displayFormat !== 'dipsAdded') return 'Bodyweight';
  
  switch (displayFormat) {
    case 'perHand':
      return `${weight} lb each`;
    case 'perLeg':
      return `${weight} lb per leg`;
    case 'total':
      return `${weight} lb`;
    case 'dipsAdded':
      return `+${weight} lb`; // Added weight for dips
    case 'band':
      return 'Band';
    case 'bodyweight':
      return 'Bodyweight';
    default:
      return `${weight} lb`;
  }
}
