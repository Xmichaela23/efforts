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

/**
 * MOVEMENT PATTERN — the SLOT. (Q-181.)
 *
 * ⛔ THIS IS NOT `primaryRef`, AND THE DIFFERENCE MATTERS. `primaryRef` answers "which 1RM do I derive
 * this exercise's working weight from" — a LOADING reference. The two coincide for barbell work and
 * COME APART BADLY elsewhere:
 *
 *     Barbell Row  ->  primaryRef: 'bench'      (a row loads at ~80% of your bench)
 *
 * The section comment above it says so in terms: "UPPER PULL (Bench Reference AS PROXY)". Building a
 * substitution filter on primaryRef therefore offered a BENCH PRESS as a substitute for a ROW — a push
 * for a pull, the opposite muscle group. It also left every BODYWEIGHT movement (pull-ups, push-ups,
 * planks) with `primaryRef: null` and therefore no pattern at all — even though a pull-up obviously has
 * one, and pull-ups are the single most-substituted exercise in the gym.
 *
 * ⛔ NOTHING BELOW IS INVENTED. The vocabulary is TRANSCRIBED from this file's own section headers
 * (KNEE DOMINANT / HIP DOMINANT / UPPER PUSH / UPPER PULL / SHOULDERS / PULL-UPS / PUSH-UPS / CORE /
 * CALF / PLYOMETRIC) — the taxonomy has been sitting here as comments the whole time. It also matches
 * the field's own rule for a good substitute: "a horizontal push is replaced by another horizontal push."
 */
export type MovementPattern =
  | 'knee_dominant'
  | 'hip_dominant'
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'core'
  | 'plyometric'
  | 'calf';

export interface ExerciseConfig {
  primaryRef: 'squat' | 'deadlift' | 'bench' | 'overhead' | 'hipThrust' | null;
  /** Q-181: the movement-pattern SLOT. NOT primaryRef — see MovementPattern above. */
  pattern?: MovementPattern | null;
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
  // PRIMARY COMPOUNDS — exact keys so "squat" / "deadlift" never fuzzy-match accessories first
  // ============================================================================

  squat: {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Barbell back squat — use squat 1RM directly.',
  },
  'back squat': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'barbell back squat': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
  },

  deadlift: {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Conventional deadlift — use deadlift / trap bar 1RM from baselines.',
  },
  'conventional deadlift': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'trap bar deadlift': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Trap bar — same 1RM slot as deadlift when conventional is unknown.',
  },

  // ============================================================================
  // KNEE DOMINANT (Squat Reference)
  // ============================================================================
  
  // Bulgarian Split Squat: Research shows ~60-70% of back squat 1RM (total load)
  // Speirs et al. (2016): BSS 1RM ≈ 60% of bilateral squat
  // Using 0.50 for general population (stability/balance demands)
  'bulgarian split squat': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,  // 0.50 = total load, divide by 2 for per-hand
    notes: 'Hold dumbbells at sides.'
  },
  
  // Walking/Reverse Lunges: Similar to BSS but slightly less stable
  'walking lunge': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,
    notes: 'Hold dumbbells at sides.'
  },
  'walking lunges': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true
  },
  'reverse lunge': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true
  },
  'reverse lunges': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.50,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true
  },
  // Lateral Lunge: Much lighter than BSS due to adductor/abductor limitation
  // Typical athlete can only lateral lunge ~30% of squat 1RM (goblet hold)
  'lateral lunge': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.30,
    displayFormat: 'total',  // Goblet hold - one weight
    isUnilateral: true
  },
  'lateral lunges': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.30,
    displayFormat: 'total',
    isUnilateral: true
  },
  
  // Goblet Squat: Limited by upper body hold capacity
  // Typically ~40-50% of back squat due to hold limitation
  'goblet squat': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.45,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Single dumbbell/kettlebell at chest.'
  },
  
  // Step-ups: Heavily technique dependent
  'step up': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'step ups': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // Front Squat: ~85% of back squat (Gulick et al., 2015)
  'front squat': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Leg Press: Can handle more than squat (stable machine)
  'leg press': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 1.50,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Leg Extension: Isolation, much lower load
  'leg extension': {
    pattern: 'knee_dominant',
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
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
    notes: 'Barbell or smith machine. Strong hip-dominant athletes may exceed this.'
  },
  'hip thrusts': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  
  // Romanian Deadlift: ~70-80% of conventional (longer moment arm)
  'romanian deadlift': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.75,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
  },
  'rdl': {
    pattern: 'hip_dominant',
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
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',  // One DB held opposite working leg
    isUnilateral: true,
    notes: 'Hold dumbbell on opposite side of working leg.'
  },
  'single leg romanian deadlift': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: true
  },
  
  // Glute Bridge: Bodyweight or light load
  'glute bridge': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.40,
    displayFormat: 'total',
    isUnilateral: false
  },
  'glute bridges': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.40,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Good Morning: Much lower due to lever arm
  'good morning': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.40,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Sumo Deadlift: ~95% of conventional for most lifters
  'sumo deadlift': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.95,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Leg Curl: Isolation, much lower
  'leg curl': {
    pattern: 'hip_dominant',
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
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Barbell bench press. Use bench 1RM baseline directly.'
  },
  'bench': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dumbbell Bench Press: Each DB ~37-40% of barbell bench (stability demand)
  'dumbbell bench press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.80, // Total DB load = 80% of barbell
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true  // 0.80 = total, divide by 2 for each hand
  },
  'db bench press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true
  },
  
  // Incline Bench: ~80-85% of flat bench
  'incline bench press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  'incline bench': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dumbbell Incline: Total ~70% of flat barbell
  'dumbbell incline press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true
  },
  
  // Close Grip Bench: ~90% of regular bench
  'close grip bench press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Dips: ~90% of bench press 1RM (total = bodyweight + added weight)
  // Most users won't need added weight, but advanced athletes might
  'dips': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.90, // Dip 1RM = 90% of bench 1RM
    displayFormat: 'total', // Will calculate total load, then subtract bodyweight
    isUnilateral: false,
    notes: 'Total load (bodyweight + added). Shows added weight if ≥10 lb, otherwise "Bodyweight".'
  },
  'dip': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.90,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Chest Fly: Isolation, much lower
  'chest fly': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'dumbbell fly': {
    pattern: 'horizontal_push',
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
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  'barbell rows': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  'bent over row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.80,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium'
  },
  
  // Dumbbell Row: Each DB ~40-45% of bench (per hand)
  // ratio is per-hand weight, not total
  'dumbbell row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'high'
  },
  'dumbbell rows': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'high'
  },
  
  // Generic "rows" alias (for abbreviated instructions)
  'rows': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.85,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
    notes: 'Generic rows - assumes barbell row weight.'
  },
  
  // Face Pull: Light prehab work
  'face pull': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'face pulls': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },

  // ── Q-212 THE BALANCE POOL — what a slot reaches for on a day the main lift already covers ──
  //
  // ⛔ THESE EXIST TO MAKE A QUERY ANSWERABLE. Before them, the push slot on a press day had
  // NOTHING to substitute to: every option on that menu was itself pushing. Michael's call, and it
  // is not "a weaker version of the same pattern" — *"the press day is already pushing-heavy and the
  // balancing work is what's missing."* So all three are `horizontal_pull`.
  //
  // ⚠️ THREE IS NOT A RICH POOL AND IS NOT CLAIMED TO BE. It is enough to answer the query on a
  // press day, which a slot with zero options cannot.
  //
  // ⚠️ `ratio: 0.0` + `primaryRef: null` on the two light ones is DELIBERATE, not a gap: assistance
  // rows carry `load_prescribed: false`, so nothing should derive a weight for them. A ratio here
  // would be a number invented to fill a field.
  'band pull apart': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'band pull aparts': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'rear delt fly': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'rear delt flyes': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  // ⛔ THE ONE THAT ADDS RANGE RATHER THAN MORE OF THE SAME (Michael: *"Face Pull variants aren't
  // it — Chest Supported Row would be the one"*). Face pulls and pull-aparts are both light,
  // high-rep rear-delt work; this is a loaded row, so the pool spans a real load range instead of
  // offering the same movement three ways.
  //
  // ⚠️ THE RATIO IS INHERITED, NOT INVENTED, AND IT IS THE ONE JUDGEMENT CALL HERE. `dumbbell row`
  // is `bench × 0.45` at `confidence: 'high'`; a chest-supported row is the same movement with the
  // torso braced, which removes the lower-back and cheat-rowing component rather than changing what
  // the arms do. Same reference, same ratio, **`confidence: 'medium'`** because that inheritance is
  // reasoned rather than measured — ±15% instead of ±10%.
  'chest supported row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: false,
    confidence: 'medium'
  },
  'chest supported rows': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: false,
    confidence: 'medium'
  },

  // ============================================================================
  // SHOULDERS (Overhead Press Reference)
  // ============================================================================
  
  // Dumbbell Shoulder Press: Total ~70% of barbell OHP
  'dumbbell shoulder press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true  // 0.70 = total, divide by 2 for each hand
  },
  'db shoulder press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.70,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true
  },
  
  // Standing/Seated Shoulder Press (OHP): Uses overhead 1RM directly
  'shoulder press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
  },
  'overhead press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
  },
  'standing barbell overhead press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high'
  },
  
  // Lateral Raise: Very light, isolation
  // ~20-25% of OHP per dumbbell
  'lateral raise': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'lateral raises': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'dumbbell lateral raise': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'dumbbell lateral raises': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Front Raise: Similar to lateral
  'front raise': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.25,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // Reverse Fly: Very light, posterior delt isolation
  // ⛔ PATTERN CORRECTED vertical_push → horizontal_pull (2026-08-03). A reverse fly IS a rear delt
  // fly — the same movement under a second name — and `rear delt fly` / `rear delt flye` have always
  // been `horizontal_pull`. One movement in two swap pools: which substitutes the app offered
  // depended purely on which of the two names the plan happened to write.
  //
  // ⚠️ THE SAME DEFECT CLASS AS `ytw raise` (fixed in the same pass) AND `squat jump` below. All
  // three were found by the swap audit — docs/AUDIT-accessory-swaps-2026-08-03.md — and all three are
  // "one movement, two names, two patterns". Shoulder/rear-delt work is scapular PULLING; there is
  // no press in it, and the whole family (face pull, band face pull, cable face pull, rear delt fly,
  // band pull apart, ytw raise) now sits together.
  'reverse fly': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.20,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  'reverse flye': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.20,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // YTW Raises: Prehab, very light
  // ⛔ PATTERN CORRECTED vertical_push → horizontal_pull (2026-08-03). A prone Y-T-W raise is
  // SCAPULAR RETRACTION AND UPWARD ROTATION — lower and mid traps, rhomboids, posterior delts. There
  // is no press in it. `pattern` is the SWAP SLOT, so at `vertical_push` this movement was offered
  // overhead presses as substitutes, and was itself offered as a substitute for one.
  //
  // ⚠️ NOT AN ANATOMY OPINION — THE FILE'S OWN FAMILY SAYS SO. Every other movement of this class
  // already sits at `horizontal_pull`: `face pull`, `band face pull`, `cable face pull`,
  // `rear delt fly`, `rear delt flye`, `band pull apart`. This entry was the outlier, and the
  // vocabulary has no dedicated scapular bucket to put it in instead.
  //
  // ⚠️ THIS RESOLVES A SPLIT RATHER THAN CREATING ONE. `prone y t w raise` (the same movement spelled
  // out) and `external rotation` were added on 2026-08-03 at `horizontal_pull`, which put one Y-T-W
  // in the pull pool and the other in the push pool. Moving THIS entry — rather than the two new ones
  // — is what makes all three agree, and it is the one that was wrong.
  //
  // ⚠️ `primaryRef` STAYS `overhead`, and that is not a contradiction: primaryRef is the LOADING
  // reference and pattern is the SLOT. `barbell row` is primaryRef 'bench' at pattern horizontal_pull
  // for the same reason. See MovementPattern's docblock.
  'ytw raises': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'perHand',
    isUnilateral: false,
    notes: 'Light dumbbells or plates for scapular health.'
  },
  'ytw raise': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'perHand',
    isUnilateral: false
  },
  
  // ============================================================================
  // EXPLOSIVE/PLYOMETRIC (Bodyweight)
  // ============================================================================
  
  'jump squat': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'jump squats': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'box jump': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'box jumps': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'broad jump': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'broad jumps': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bench jumps': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bounding': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // CORE (Bodyweight)
  // ============================================================================
  
  'plank': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  // Added 2026-07-25 for the Strength Focus assistance menu (`src/lib/assistance-menu.ts`). It was
  // OFFERED before it was DEFINED, and a name with no entry here does not fail loudly — it falls
  // through to the legacy weight path and gets priced off whichever 1RM the fallback picks. That is
  // exactly how a pull-up came to be prescribed at 110 lb off the athlete's bench (D-322).
  // Bodyweight, no reference lift, no ratio: the movement carries no external load.
  'hanging leg raise': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'hanging leg raises': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'side plank': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'dead bug': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'dead bugs': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bird dog': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'bird dogs': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'pallof press': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'clamshell': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: true
  },
  'clamshells': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: true
  },
  
  // ============================================================================
  // CALF WORK (Bodyweight/Light)
  // ============================================================================
  
  'calf raise': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'calf raises': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'single leg calf raise': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'single leg calf raises': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  
  // ============================================================================
  // PULL-UPS / BODYWEIGHT UPPER PULL
  // Pull-ups: Bodyweight by default, can add weight for advanced
  // ============================================================================
  
  'pull up': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Bodyweight. Add weight when 3x12 is easy.'
  },
  'pull ups': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pullup': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pullups': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'chin up': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'chin ups': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'lat pulldown': {
    pattern: 'vertical_pull',
    primaryRef: 'bench',
    ratio: 0.65,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // Inverted Rows: Bodyweight horizontal pull
  'inverted row': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Feet elevated for progression.'
  },
  'inverted rows': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // PUSH-UPS / BODYWEIGHT UPPER PUSH
  // ============================================================================
  
  'push up': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Standard → Diamond → Decline → Archer for progression.'
  },
  'push ups': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pushup': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'pushups': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'diamond push up': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'diamond push ups': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'decline push up': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'decline push ups': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'archer push up': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'archer push ups': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'pike push up': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Elevate feet to progress toward HSPU.'
  },
  'pike push ups': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // EXPLOSIVE LOWER BODY (Bodyweight)
  // ============================================================================
  
  'skater hop': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'skater hops': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'jump lunge': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'jump lunges': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  
  // ============================================================================
  // BAND EXERCISES
  // ============================================================================
  
  'lateral band walk': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
    notes: 'Mini band around ankles or above knees.'
  },
  'lateral band walks': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'band face pull': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  'band face pulls': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false
  },
  
  // ============================================================================
  // ADDITIONAL CORE (Bodyweight)
  // ============================================================================
  
  'copenhagen plank': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
    notes: 'Adductor-focused core stability.'
  },
  'copenhagen planks': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'core circuit': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'core work': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  
  // ============================================================================
  // SINGLE LEG GLUTE BRIDGE (Bodyweight)
  // ============================================================================
  
  'single leg glute bridge': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true
  },
  'single leg glute bridges': {
    pattern: 'hip_dominant',
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
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Explosive hip hinge. Weight should allow powerful hip snap.'
  },
  'kettlebell swings': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'dumbbell swing': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'dumbbell swings': {
    pattern: 'hip_dominant',
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
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  'db swings': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false
  },
  
  // ============================================================================
  // STEP-UPS (Squat Reference) - additional aliases
  // ============================================================================
  
  'box step up': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  'box step ups': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.40,
    displayFormat: 'perHand',
    isUnilateral: true
  },
  
  // ============================================================================
  // SQUAT VARIANTS (Bodyweight explosives)
  // ============================================================================
  
  // ⛔ PATTERN CORRECTED knee_dominant → plyometric (2026-08-03). A squat jump IS a jump squat — the
  // same movement, written the other way round — and `jump squat` / `jump squats` have always been
  // `plyometric`. This entry sat in the knee-dominant pool, so the app offered a Bulgarian Split
  // Squat, a Reverse Lunge, a Step Up and a Leg Extension as substitutes for a jump.
  //
  // ⚠️ AND IT WAS THE PATTERN, NOT THE TIER GATE, THAT STRANDED IT. With the intensity gate in place
  // this movement is `power` tier, and there were no other power movements in the knee-dominant pool
  // — so it went from six unsound options to none. Filing it where its own twin already lives gives
  // it back the RIGHT ones: box jump, broad jump, bounding, skater hop.
  // ⚠️ `equipmentForExercise` already read this correctly ("Jump Squat" contains "squat", and rule
  // order is what keeps it a jump) — only the config's pattern disagreed.
  'squat jump': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'squat jumps': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bodyweight squat': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'bodyweight squats': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'air squat': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },
  'air squats': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // RECONCILIATION WITH THE TYPE TABLE (2026-08-03). Purely additive — no existing entry is edited.
  //
  // ⛔ WHY THESE WERE MISSING AND WHY IT WAS NOT VISIBLE. Every name below already carries a declared
  // type in `exercise-role.ts`'s TYPE_TABLE — the app knows exactly what kind of movement it is — and
  // had NO entry here. That is not inert. `getExerciseConfig` ends in a LONGEST-SUBSTRING FUZZY
  // FALLBACK, so an unconfigured name does not return null; it lands on whichever neighbouring key
  // overlaps most, and then renders that neighbour's prescription.
  //
  // ⛔ THE WORST ONE, AND THE REASON THIS SECTION EXISTS: **`press`** — one of the app's own
  // MAIN_531_LIFTS, 5/3/1's name for the overhead press — matched `leg press` and was priced at
  // **ratio 1.5 of the SQUAT**. `military press` and `push press` are also main lifts and also had no
  // entry. Two more of the same class: `single leg squat` (a bodyweight pistol) matched `squat` and
  // was priced at 100% of the barbell back squat, and `band overhead press` matched `overhead press`
  // and was priced at 100% of the OHP max instead of being drawn as a band.
  //
  // ⛔ EVERY RATIO BELOW IS INHERITED FROM AN EXISTING SIBLING ENTRY IN THIS FILE, NOT CHOSEN.
  // A first pass at this section picked its own numbers (a DB row at 0.4, a step up at 0.15) and that
  // is exactly the guessing the file's header warns against — these ratios are load prescriptions.
  // The rule used instead: find the movement this one is a VARIANT of, take its ratio unchanged, and
  // change only what the equipment demands (perHand vs total vs band). Where no sibling exists, the
  // ratio is 0 — this file's existing way of saying "there is no number to derive" — and the
  // athlete's own logged weight drives the row instead of a fabricated prescription.
  //
  //     bodyweight / plyo / isometric / mobility → primaryRef null, ratio 0, displayFormat 'bodyweight'
  //                                                (precedent: `plank`, `box jump`, `bird dog`, `core circuit`)
  //     band                                     → primaryRef null, ratio 0, displayFormat 'band'
  //                                                (precedent: `band pull apart`, `clamshell`, `lateral band walk`)
  //     loaded_accessory                         → its sibling's ref + ratio, its own equipment's format
  //     barbell_main                             → the lift's own 1RM, ratio 1.0
  //
  // ⚠️ `ratioIsTotal` IS CARRIED WITH THE RATIO WHEN THE SIBLING HAS IT. On `dumbbell bench press` the
  // ratio is the TOTAL load and the display halves it per hand. Copying the ratio without the flag
  // would have doubled every one of those prescriptions.
  //
  // ⚠️ THE LOGGING MODE IS NOT SET HERE AND NEVER WAS. What the row asks for (weight × reps / reps /
  // time / distance) comes from the type table via `strength-logging-mode.ts`. A dead hang and a sled
  // push already logged as time/distance before this section existed. These entries fix the WEIGHT
  // PRESCRIPTION and the DISPLAY, not the mode.
  // ══════════════════════════════════════════════════════════════════════════════════════════════

  // ── MAIN LIFTS THAT HAD NO ENTRY (the `press` → `leg press` class) ───────────────────────────
  // Sibling: `overhead press` (overhead × 1.0, total) / `bench press` (bench × 1.0, total).
  press: {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high',
    notes: "5/3/1's name for the overhead press. Without this key it fuzzy-matched `leg press` at 1.5x squat.",
  },
  'military press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high',
  },
  'push press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    // ⚠️ Leg drive lets a push press move MORE than a strict press. The sibling's 1.0 is kept rather
    // than invented upward — erring low is this file's stated direction for a prescription.
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
  },
  'barbell bench press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high',
  },

  // ── PRESS VARIANTS that the new `press` key would otherwise have captured ────────────────────
  // ⚠️ THESE TWO ARE HERE BECAUSE OF THE KEY ABOVE. Both resolved to nothing before; adding `press`
  // made them fuzzy-match it and inherit a BARBELL total. They are dumbbell/kettlebell movements, so
  // they get the `dumbbell shoulder press` sibling (overhead × 0.7 total, shown per hand) instead.
  'dumbbell press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.7,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true,
    confidence: 'medium',
  },
  'kettlebell press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.7,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true,
    confidence: 'low',
  },

  // ── SERVER-KEYING + SHORTHAND ALIASES. Sibling: `dumbbell row` (bench × 0.45, perHand) ───────
  // ⚠️ `canonicalize()` on the server emits `db_row`, and the protocols write "DB Row". These
  // resolved by fuzzy luck or not at all; an exact key is not a new opinion, it is the same
  // prescription reached deterministically.
  'db row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'medium',
  },
  'light db row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    // ⚠️ SAME RATIO AS `dumbbell row`, DELIBERATELY. "Light" is a prescription cue in the protocol
    // text, and this file has no precedent for a light-modifier ratio. Inventing one (0.3?) would be
    // exactly the guess this section avoids. The athlete's logged weight carries the difference.
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'low',
  },
  'single arm row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'medium',
    notes: 'In the add-picker list with no entry. Explicit so the new bare `row` key cannot capture it as a two-handed total.',
  },
  // Sibling: `barbell row` (bench × 0.8, total) — a machine/cable row is one stack, one total load.
  row: {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.8,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
    notes: 'Bare "Row" — the same slot it already fuzzy-matched (`barbell row`), now reached exactly.',
  },
  'cable row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.8,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
  },
  // Sibling: `lat pulldown` (bench × 0.65, total) — the same movement, spelled with a space.
  'lat pull down': {
    pattern: 'vertical_pull',
    primaryRef: 'bench',
    ratio: 0.65,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'medium',
  },
  'explosive lat pull down': {
    pattern: 'vertical_pull',
    primaryRef: 'bench',
    // Same sibling ratio. "Explosive" is a speed cue, not a different load basis.
    ratio: 0.65,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'low',
  },
  // Sibling: `dumbbell bench press` (bench × 0.8 TOTAL, shown per hand).
  'db floor press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.8,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true,
    confidence: 'medium',
  },
  // Sibling: `dumbbell shoulder press` (overhead × 0.7 TOTAL, shown per hand).
  'db push press': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.7,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true,
    confidence: 'medium',
  },
  // Sibling: `romanian deadlift` (deadlift × 0.75). Dumbbells → per hand, so the ratio is the TOTAL
  // and the display halves it — the same shape `walking lunge` and `dumbbell bench press` use.
  'db romanian deadlift': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.75,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true,
    confidence: 'medium',
  },
  // Sibling: the existing `kb/db swings` (deadlift × 0.25, total). ONE bell, TWO hands.
  'db swing': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'low',
    notes: 'One bell, two hands — a total load, not per hand.',
  },
  'kb swing': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'low',
  },
  'kb db swing': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'low',
  },
  // Sibling: `rear delt flyes` — ratio 0, per hand. Copied exactly, including the absent ratio.
  'rear delt flye': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },

  // ── LOADED ACCESSORIES with no entry ─────────────────────────────────────────────────────────
  // Sibling: `hip thrust` (deadlift × 0.9, total). The bilateral barbell version IS that slot.
  'barbell hip thrust': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.9,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high',
  },
  // Sibling: `walking lunge` (squat × 0.5 TOTAL, shown per hand). The barbell version puts the same
  // load on the back as ONE implement, so only the format changes.
  'barbell walking lunge': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.5,
    displayFormat: 'total',
    isUnilateral: true,
    confidence: 'medium',
  },
  'dumbbell walking lunge': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.5,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,
    confidence: 'medium',
  },
  'sandbag lunge': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.5,
    displayFormat: 'total',
    isUnilateral: true,
    confidence: 'low',
    notes: 'One implement, carried — a total load. Same ratio as the walking lunge sibling.',
  },
  // Sibling: `step up` (squat × 0.4, per hand). "Explosive" is a speed cue, not a load basis.
  'explosive step up': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.4,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'low',
  },
  // Sibling: `ytw raise` (overhead × 0.15, per hand) — the nearest configured rear-delt/cuff work.
  // ⛔ A CABLE face pull carries real external load. Without this key it matched `face pull`, which
  // is configured `band`, so a stack-loaded movement was drawn as a band. One stack → total.
  'cable face pull': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'low',
  },
  'external rotation': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'perHand',
    isUnilateral: true,
    confidence: 'low',
  },
  // This IS a Y-T-W raise, spelled out. Copied from `ytw raise` exactly.
  'prone y t w raise': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'perHand',
    isUnilateral: false,
    confidence: 'low',
  },
  // ⛔ WEIGHTED — without this key it matched `single leg calf raise`, which is `bodyweight`, so the
  // added load had nowhere to go. ⚠️ RATIO 0 AND THAT IS THE HONEST ANSWER: this file has no
  // configured loaded calf raise to inherit from, and a calf-raise load is not a fraction of any
  // barbell max. The format is fixed so the weight has somewhere to go; the number stays the
  // athlete's own.
  'weighted single leg calf raise': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: true,
  },

  // ── BAND: the band IS the load. `_shared/workload.ts` prices it; a ratio is meaningless here ──
  'band row': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
  },
  'resistance band row': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
  },
  'band pull down': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
  },
  'band overhead press': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
    notes: 'Without this key it matched `overhead press` and was priced at 100% of the barbell OHP max.',
  },
  'band lateral raise': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
    notes: 'Without this key it matched `lateral raise` and was drawn as a per-hand dumbbell.',
  },
  'band lateral walk': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'band',
    isUnilateral: false,
    notes: 'The movement the existing `lateral band walk` covers, written the other way round.',
  },

  // ── BODYWEIGHT with no entry ─────────────────────────────────────────────────────────────────
  'band assisted pull up': {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'The BAND IS ASSISTANCE here, not load — `bandMeansAssistance` is the authority and the body is what moved. Typed `bodyweight`, never `band`.',
  },
  'inverted ring row': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  // ⛔ THE SERVER'S KEY FOR A CHIN-UP, AND IT WAS THE ONLY ONE MISSING. `canonicalize()` emits
  // `chinup`; `pullup` has had an entry all along and `chinup` did not, so the same lookup that
  // priced a pull-up correctly returned NULL for a chin-up. Copied from `chin up` exactly — this is
  // the same movement reached by the other of the app's two keyings, not a new opinion.
  chinup: {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'nordic hamstring curl': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'back extension': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'soleus raise': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'tibialis raise': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'single leg squat': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
    notes: 'Without this key it matched `squat` — a bodyweight pistol priced at 100% of the barbell back squat.',
  },

  // ── PLYO ─────────────────────────────────────────────────────────────────────────────────────
  'bench jump': {
    pattern: 'plyometric',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },

  // ── ISOMETRIC / MOBILITY: held, not repped. Time comes from the type table, not from here ─────
  // ⛔ `pattern` IS DELIBERATELY NULL ON `dead hang`, `wall sit`, `wall angel` AND `foot doming`, AND
  // THIS IS THE ONE THING IN THIS SECTION I COULD NOT DERIVE. `pattern` is the SWAP SLOT:
  // `getInSlotAlternatives` offers every config entry sharing a pattern as a substitute. Typing a
  // wall sit `knee_dominant` would offer it as a substitute for a Back Squat, and a dead hang
  // `vertical_pull` would offer it for Pull Ups — neither substitutes for anything. `MovementPattern`
  // has no `hold` or `carry` member, so there is no honest bucket. Null means "no slot": the entry
  // offers no alternatives and is offered as none (the loop compares patterns, and null never equals
  // a real one). Zero ripple, and it leaves the taxonomy question open rather than answering it
  // wrongly. Precedent for a null pattern already exists (`kb/db swings`).
  'plank hold': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'plank with shoulder tap': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'side plank abduction': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
  },
  'dead hang': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Held, not repped. Pattern null on purpose — a dead hang substitutes for nothing.',
  },
  'wall sit': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Held, not repped. Pattern null on purpose — a wall sit is not a substitute for a squat.',
  },
  'wall angel': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Mobility — done or timed, unloaded, and not a substitute for a loaded movement.',
  },
  'foot doming': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
    notes: 'Mobility — done or timed, unloaded.',
  },

  // ── CARRY: loaded, but measured in distance or time ──────────────────────────────────────────
  // ⛔ THE TYPE TABLE HAS A `carry` ROW AND THIS FILE HAD **ZERO** CARRY ENTRIES — every carry in the
  // vocabulary resolved to null or by fuzzy luck. The per-hand/total split below is NOT a new
  // opinion: it is transcribed from `equipmentForExercise` in `strength-logging-mode.ts`, which
  // already answers `dumbbell` (per hand) for farmer and suitcase carries and leaves the sled on the
  // default. Q-180 is the precedent AND the warning — a Farmers Carry drawn as one loaded barbell.
  // ⚠️ RATIO 0 THROUGHOUT: a carry load is not a fraction of any barbell max. `pattern` null for the
  // reason given above — a carry substitutes for nothing and the taxonomy has no slot for it.
  'farmers carry': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
    notes: 'Two implements, one per hand (Q-180).',
  },
  'farmer carry': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'farmer walk': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'suitcase carry': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: true,
    notes: 'One implement, one side — unilateral, and the per-hand label is still the honest one.',
  },
  'backpack carry': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'One implement on the back — a single total load, not per hand.',
  },
  'sled push': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'One implement. Sled load is not a fraction of any barbell max — friction and surface dominate.',
  },
  'sled pull': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // RECONCILED AGAINST THE ATHLETE'S ACTUAL PLANS AND LOGS (2026-08-03, second pass). Additive.
  //
  // ⛔ THE FIRST RECONCILIATION USED THE LIBRARY AND THAT WAS THE WRONG CORPUS. It diffed
  // `exercise-config.ts` against the exercise LIBRARY (TYPE_TABLE, ROLE_TABLE, the protocol
  // vocabulary) and closed every gap it found — while the moves actually sitting in the athlete's
  // `planned_workouts` and `workouts` went unchecked. Read-only pull of the 68 distinct strength
  // names he has really planned or logged: 15 had no exact key, and SIX of those were real.
  //
  // ⚠️ THE OTHER NINE ARE FINE AND ARE DELIBERATELY NOT ADDED — plurals and case variants that the
  // folding pass already lands on the right entry (`Goblet Squats` → `goblet squat`,
  // `Bulgarian Split Squats`, `Cable Face Pulls`, `Farmer Walks`, `Leg Curls`, `chinups`,
  // `Calf Raises (Bilateral)`, `Core Work (5 min - your choice)`,
  // `Weighted Single-Leg Calf Raises`). Adding keys for those would be noise.
  // ══════════════════════════════════════════════════════════════════════════════════════════════

  // ⛔ THE ONE MICHAEL NAMED. `Single Leg Hip Thrust` is in his plans AND his logs and had no entry,
  // so it fuzzy-matched the BILATERAL `hip thrust`: deadlift × 0.9, `displayFormat: 'total'`
  // (a loaded barbell) and `isUnilateral: false`. `assistance-menu.ts`'s header has flagged this in
  // writing the whole time — *"Two of them are known-wrong (`Single Leg Hip Thrust` carries the
  // two-legged 0.9× deadlift ratio)"* — and `strength-logging-mode.ts` carries the other half of the
  // same bug from a screenshot: *"A SINGLE-LEG HIP THRUST IS NOT A BARBELL LIFT … the logger drew a
  // 45 lb bar and a plate calculator over a movement loaded with one dumbbell or plate on the hip."*
  //
  // ⚠️ RATIO INHERITED FROM `single leg romanian deadlift` (deadlift × 0.25), which is this file's
  // own single-leg hip-dominant precedent and a structural twin: same reference lift, same pattern,
  // same `displayFormat: 'total'`, same `isUnilateral: true`. Halving 0.9 would have been a guess.
  // ⚠️ `displayFormat: 'total'` AND NOT `perHand`, on purpose: the load is ONE implement resting on
  // the hip, which is exactly why `equipmentForExercise` routes this movement to `goblet` rather than
  // `dumbbell`. A "lb/hand" label would be wrong in the other direction.
  // ⚠️ PATTERN IS `hip_dominant` — a hip thrust is hip extension, single-legged or not. That is also
  // what it already resolved to, so no swap list moves; this fixes the PRESCRIPTION and the DISPLAY.
  'single leg hip thrust': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.25,
    displayFormat: 'total',
    isUnilateral: true,
    confidence: 'low',
  },

  // ⛔ `Planks` RESOLVED TO A COPENHAGEN PLANK. Both are core holds so nothing caught it, but the
  // fuzzy fallback scores by LENGTH: `copenhagen planks` CONTAINS "planks" (score 6) and beats
  // `plank`, which is only a substring of it (score 5). The practical cost today is one field —
  // `isUnilateral: true` on a bilateral hold — and the real cost is that the day Copenhagen Plank
  // gains a ratio, every "Planks" in the athlete's log inherits it. He has this in plans AND logs.
  // Copied from `plank` exactly.
  planks: {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },

  // ⛔ `Nordic Curls` RESOLVED TO NOTHING AT ALL. `nordic hamstring curl` exists, but neither name is
  // a substring of the other, so the fuzzy pass returns null and the movement falls through to the
  // legacy weight path — the D-322 "Pull Up @ 110 lb" class. In his plans AND logs.
  // ⚠️ The SERVER keys it `nordic_curls`, separately from `nordic_hamstring_curl`, so the two names
  // are already tracked apart upstream; this entry only makes the client resolve the same movement.
  'nordic curls': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },

  // `Tricep Dips` had no key and landed on `dips` by luck of overlap. Same movement, so the values
  // were right — pinning it means they stay right rather than depending on the fuzzy scoring.
  'tricep dips': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.9,
    displayFormat: 'total',
    isUnilateral: false,
    notes: 'Total load (bodyweight + added), same as `dips`.',
  },

  // ⛔ `DB Thruster` RESOLVED TO NOTHING. A thruster is a front squat into an overhead press, and the
  // PRESS is the limiting half — so it takes the vertical-push slot and `db push press`'s ratio
  // (overhead × 0.7 TOTAL, shown per hand). ⚠️ `ratioIsTotal` travels with that ratio; without it the
  // prescription would double.
  'db thruster': {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 0.7,
    displayFormat: 'perHand',
    isUnilateral: false,
    ratioIsTotal: true,
    confidence: 'low',
  },

  // ⛔ `ohp` — HIS OWN SHORTHAND, LOGGED, AND IT RESOLVED TO NOTHING. Copied from `overhead press`.
  // ⚠️ THE SERVER ALREADY AGREES: `canonicalize('ohp')` returns `overhead_press`, so the strength
  // trend and the learned max have been folding it into the press all along while this lookup
  // returned null. Two vocabularies disagreeing about one logged session — the same defect class as
  // the Y-T-W / reverse-fly / squat-jump collisions. See the note on MAIN_531_LIFTS in
  // `exercise-role.ts`, which is the other half of closing it.
  ohp: {
    pattern: 'vertical_push',
    primaryRef: 'overhead',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
    confidence: 'high',
  },


  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // THE VOCABULARY GUARD'S BACKLOG, CLOSED (2026-08-03, third pass). Additive.
  //
  // ⛔ EVERY ENTRY BELOW WAS FOUND BY A TEST, NOT BY A SCREENSHOT. `exercise-config.vocabulary-guard`
  // walks the config, the type/role tables, the assistance menu, the add-picker and a snapshot of
  // what the athlete has actually planned and logged, and fails on anything resolving through the
  // fuzzy fallback. It found 65. Each one was a movement borrowing a neighbour's prescription — or
  // resolving to nothing at all and dropping onto the legacy weight path.
  //
  // ⛔ NO NUMBER BELOW WAS CHOSEN. Every entry copies a structural sibling already in this file and
  // changes only what the equipment or the laterality demands. Where no sibling with a real ratio
  // exists — arm isolation, cable core, carries — the ratio is 0, which is this file's existing way
  // of saying "there is no number to derive" (`rear delt fly` is the precedent) and lets the
  // athlete's own logged weight drive the row instead of a fabricated prescription.
  // ══════════════════════════════════════════════════════════════════════════════════════════════


  // ── PLURALS AND SPELLINGS: an exact copy of the entry they already meant ──────────────────
  'bulgarian split squats': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.5,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,
  },
  'cable face pulls': {
    pattern: 'horizontal_pull',
    primaryRef: 'overhead',
    ratio: 0.15,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'calf raises (bilateral)': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'chest flyes': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  chinups: {
    pattern: 'vertical_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'core work (5 min - your choice)': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'dumbbell flyes': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'farmer walks': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'goblet squats': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.45,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'leg curls': {
    pattern: 'hip_dominant',
    primaryRef: 'deadlift',
    ratio: 0.3,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'leg extensions': {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.35,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'nordic curl': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'plank with shoulder taps': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'ring dips': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.9,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'side plank with hip dip': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
  },
  squats: {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'tricep dip': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.9,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'weighted single-leg calf raises': {
    pattern: 'calf',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: true,
  },
  'decline bench press': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 1.0,
    displayFormat: 'total',
    isUnilateral: false,
  },

  // ── ⛔ CORRECTIONS: these MOVE a resolution. The review shortlist. ─────────────────────────
  // was borrowing `squat` at 100% of the barbell back squat
  'pistol squats': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
  },
  // was borrowing `push ups` — a horizontal push for a vertical one
  'handstand push ups': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  // was borrowing `rows` at 0.85 TOTAL; one bell is per hand
  'kettlebell rows': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
  },
  // was borrowing `glute bridge` at 0.4x deadlift; a march is unloaded
  'glute bridge march': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
  },
  // bare 'Lunges' — see the flagged calls
  lunges: {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.5,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,
  },

  // ── LOADED ISOLATION: an implement, but no derivable percentage ───────────────────────────────
  // ⛔ SIBLING IS `rear delt fly` — ref null, ratio 0, a loaded display. This file has no configured
  // arm-isolation or cable-core movement carrying a real ratio, so there is nothing to inherit a
  // number FROM. Ratio 0 is the honest answer and the established one; the format is set so the
  // weight the athlete logs has somewhere to go.
  'barbell curl': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'dumbbell curls': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'hammer curls': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'cable curls': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'tricep extensions': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'tricep pushdown': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'cable crossover': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'cable crunch': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'ab machine crunch': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'cable woodchopper': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'landmine twist': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'kettlebell snatches': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'turkish get ups': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: true,
  },

  // ── CARRIES ───────────────────────────────────────────────────────────────────────────────
  'overhead carry': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },

  // ── POSTERIOR-CHAIN BODYWEIGHT ────────────────────────────────────────────────────────────
  'hip extension': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'reverse hyperextension': {
    pattern: 'hip_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },

  // ── BODYWEIGHT CORE: reps or time, no load. Sibling `plank` / `hanging leg raise` (identical) ──
  crunch: {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'reverse crunch': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'cross body crunch': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'bicycle crunch': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'sit up': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'ghd sit up': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'roman chair sit up': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'v up': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'flutter kicks': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'scissor kicks': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'toe touches': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'russian twist': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'l sits': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'superman hold': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'stir the pot': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'stability ball rollout': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'ab wheel rollout': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'trx fallout': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'hanging knee raise': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'toes to bar': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'hanging windshield wipers': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  "captain's chair knee raise": {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },

  // ── ⚠️ CONDITIONING: THE TWO I COULD NOT GROUND IN A SIBLING ──────────────────────────────────
  // A burpee and a mountain climber are full-body conditioning. This file has no conditioning
  // family: the nearest shapes are `plank` (core, unloaded) and `box jump` (plyometric, unloaded),
  // and neither is the same thing. What IS certain is that they carry no external load and no
  // percentage, so ratio 0 / bodyweight is safe in every direction. `pattern: null` because putting
  // them in a real bucket would offer them as substitutes for loaded work in that bucket — the same
  // reasoning already applied to the holds and carries. ⛔ THIS IS THE ONE JUDGEMENT CALL IN THE PASS.
  burpees: {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'mountain climbers': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },


  // ── THE SINGULAR / `canonical()` FORMS OF THE ENTRIES ABOVE ───────────────────────────────────
  // ⛔ TWO NORMALIZERS, AND THEY DISAGREE ABOUT PLURALS. `exercise-role.ts`'s `canonical()`
  // DEPLURALIZES ("Flutter Kicks" → `flutter kick`) and strips punctuation; this file's
  // `foldExerciseName` does neither. So a type-table row keyed on the singular could not find a
  // config keyed on the plural, and the vocabulary guard — correctly — reported every one of them as
  // borrowing. Each is a byte-copy of its plural above; the two spellings are one movement.
  // ⚠️ `toe touche` / `kettlebell snatche` look wrong and are RIGHT: `canonical()` strips one
  // trailing 's', so that is genuinely the key the type axis asks for.
  burpee: {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'cable curl': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'captain s chair knee raise': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'chest flye': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'dumbbell curl': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'dumbbell flye': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.35,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'flutter kick': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'hammer curl': {
    pattern: 'horizontal_pull',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'handstand push up': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'hanging windshield wiper': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'kettlebell row': {
    pattern: 'horizontal_pull',
    primaryRef: 'bench',
    ratio: 0.45,
    displayFormat: 'perHand',
    isUnilateral: true,
  },
  'kettlebell snatche': {
    pattern: 'vertical_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'l sit': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  lunge: {
    pattern: 'knee_dominant',
    primaryRef: 'squat',
    ratio: 0.5,
    displayFormat: 'perHand',
    isUnilateral: true,
    ratioIsTotal: true,
  },
  'mountain climber': {
    pattern: null,
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'pistol squat': {
    pattern: 'knee_dominant',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: true,
  },
  'ring dip': {
    pattern: 'horizontal_push',
    primaryRef: 'bench',
    ratio: 0.9,
    displayFormat: 'total',
    isUnilateral: false,
  },
  'scissor kick': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'toe touche': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'tricep extension': {
    pattern: 'horizontal_push',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'perHand',
    isUnilateral: false,
  },
  'turkish get up': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: true,
  },


  // ── SERVER-KEYING FORMS. `canonicalize()` emits shapes this file's fold does not produce —
  // `turkish_getup` from "Turkish Get ups", `ab_rollout` from "Ab Wheel Rollout", and the
  // parenthetical stripped out of "Core Work (5 min - your choice)". Those keys reach
  // `per_lift.canonical_name` and the State row, so they must resolve here too. Byte-copies.
  'core work 5 min your choice': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },
  'turkish getup': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'total',
    isUnilateral: true,
  },
  'ab rollout': {
    pattern: 'core',
    primaryRef: null,
    ratio: 0.0,
    displayFormat: 'bodyweight',
    isUnilateral: false,
  },

};

/**
 * Fold an exercise name to a punctuation-insensitive form: lowercase, hyphens and
 * underscores to spaces, whitespace collapsed.
 *
 * D-322. This exists because the table is written in hyphenated form — `pull-up`,
 * `push-up`, `chin-up`, `pike push-up`, 17 keys in all — while callers write the
 * SPACED form. `getExerciseConfig` only lowercased and trimmed, so "Pull Up" missed
 * every one of them, returned null, and dropped the caller into materialize-plan's
 * legacy `pickPrimary1RMAndBase` fallback. That fallback derives a load from whichever
 * barbell 1RM it can find, so a PULL-UP was being prescribed off the athlete's BENCH
 * and rendered as "110 lb", climbing to 130 across the block.
 *
 * The entries themselves were always right — `pull-up` is `primaryRef: null,
 * displayFormat: 'bodyweight'`. They were simply unreachable. Every bodyweight
 * push/pull variant in the table had the same hole; pull-ups is just the one that
 * showed up in a plan.
 */
function foldExerciseName(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    // ⛔ THE APOSTROPHE IS DROPPED, AND Q-180 IS WHY. `"farmer's carry".includes('farmers carry')` is
    // FALSE, so the athlete's spelling and the plan's spelling of the SAME movement never met: the
    // plan writes "Farmers Carry", the exercise library and the athlete write "Farmer's Carry", and
    // this fold resolved the second to NOTHING — dropping it onto the legacy weight path.
    // `strength-logging-mode.ts` already learned this exact lesson (*"Strip punctuation, collapse
    // whitespace, then match"*) and fixed it for the EQUIPMENT question; the config lookup was still
    // carrying the bug for the PRESCRIPTION question. Same trap, two functions, found by the
    // vocabulary guard rather than by another screenshot.
    // ⚠️ Only apostrophes are added here. Hyphens and underscores were already folded; anything
    // wider (dropping every non-alphanumeric) would collapse `kb/db swings` onto `kbdb swings` and
    // is a bigger change than this fixes.
    .replace(/['’]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Folded key → config, built once. First writer wins, mirroring object key order. */
const FOLDED_CONFIG_INDEX: Record<string, ExerciseConfig> = (() => {
  const idx: Record<string, ExerciseConfig> = {};
  for (const [key, config] of Object.entries(EXERCISE_CONFIG)) {
    const folded = foldExerciseName(key);
    if (!(folded in idx)) idx[folded] = config;
  }
  return idx;
})();

/** Folded key → the CONFIG KEY that answered, so a resolution can name its source. Same order. */
const FOLDED_KEY_INDEX: Record<string, string> = (() => {
  const idx: Record<string, string> = {};
  for (const key of Object.keys(EXERCISE_CONFIG)) {
    const folded = foldExerciseName(key);
    if (!(folded in idx)) idx[folded] = key;
  }
  return idx;
})();

/**
 * HOW a name resolved — the seam the vocabulary guard and the tripwire both read.
 *
 * ⛔ `via: 'fuzzy'` MEANS THE MOVEMENT IS BORROWING A NEIGHBOUR'S PRESCRIPTION. That is not a
 * theoretical worry; it is how `Single Leg Hip Thrust` came to be priced at 0.9x the deadlift as a
 * two-legged barbell lift, how `Planks` came to resolve to a Copenhagen Plank, and how `press` — the
 * app's own name for the overhead press — came to be priced as a LEG PRESS at 1.5x squat. Every one
 * of those was found by hand, months apart, from a screenshot. The point of exposing this is that
 * the next one is found by a test instead.
 */
export type ConfigResolutionVia = 'exact' | 'folded' | 'fuzzy' | 'none';
export interface ConfigResolution {
  config: ExerciseConfig | null;
  via: ConfigResolutionVia;
  /** The config key that answered. Null when nothing did. */
  matchedKey: string | null;
}

/**
 * Resolve an exercise to its config AND report how.
 *
 * ⚠️ `exact` and `folded` are both trustworthy — folded is just punctuation/spacing-insensitive
 * ("Pull Up" → `pull-up`), a spelling difference, not a different movement. Only `fuzzy` is a guess.
 */
export function resolveExerciseConfig(exerciseName: string): ConfigResolution {
  const normalized = String(exerciseName ?? '').toLowerCase().trim();

  // Exact match first
  if (EXERCISE_CONFIG[normalized]) {
    return { config: EXERCISE_CONFIG[normalized], via: 'exact', matchedKey: normalized };
  }

  // Punctuation-insensitive exact match: "Pull Up" → `pull-up`. Runs BEFORE the fuzzy
  // pass so a spaced name resolves to its real entry rather than to whatever substring
  // happens to overlap most.
  const folded = foldExerciseName(exerciseName);
  if (FOLDED_CONFIG_INDEX[folded]) {
    return { config: FOLDED_CONFIG_INDEX[folded], via: 'folded', matchedKey: FOLDED_KEY_INDEX[folded] ?? null };
  }

  // Longest-key fuzzy match so "squat" hits primary `squat`, not "bulgarian split squat".
  // Compared on the FOLDED forms too, so "Barbell Pull Up" still reaches `pull-up`.
  let best: ExerciseConfig | null = null;
  let bestKey: string | null = null;
  let bestScore = -1;
  for (const [key, config] of Object.entries(EXERCISE_CONFIG)) {
    const fkey = foldExerciseName(key);
    let score = -1;
    if (folded.includes(fkey)) score = fkey.length;
    else if (fkey.includes(folded)) score = folded.length;
    if (score > bestScore) {
      bestScore = score;
      best = config;
      bestKey = key;
    }
  }
  return bestScore > 0
    ? { config: best, via: 'fuzzy', matchedKey: bestKey }
    : { config: null, via: 'none', matchedKey: null };
}

/** Names already warned about, so the tripwire fires once per name rather than once per render. */
const warnedFuzzyNames = new Set<string>();

/**
 * Look up exercise configuration, with fuzzy matching fallback.
 *
 * ⛔ THE FUZZY FALLBACK IS NOW LOUD. It used to be silent, and that silence is the single most
 * expensive thing in this file's history: an unconfigured name does not return null, it returns
 * whichever neighbouring key overlaps most, and then the app renders that neighbour's prescription
 * with complete confidence. Three shipped bugs from it, each found by eye from a screenshot weeks or
 * months later. It warns ONCE PER NAME, naming what it guessed from, so the next gap announces
 * itself the first time it is rendered.
 * ⚠️ Modelled on `typeForExercise`'s tripwire in `exercise-role.ts` — same shape, same reasoning,
 * and its docblock's rule applies here too: never make the default quiet.
 */
export function getExerciseConfig(exerciseName: string): ExerciseConfig | null {
  const r = resolveExerciseConfig(exerciseName);
  if (r.via === 'fuzzy') {
    const key = foldExerciseName(exerciseName);
    if (!warnedFuzzyNames.has(key)) {
      warnedFuzzyNames.add(key);
      console.warn(
        `[exercise-config] FUZZY MATCH: "${exerciseName}" has no entry — borrowing '${r.matchedKey}' ` +
          `(ratio ${r.config?.ratio}, ${r.config?.displayFormat}). Its prescription and display are ` +
          `that other movement's. Add a key to EXERCISE_CONFIG in src/lib/exercise-config.ts.`,
      );
    }
  }
  return r.config;
}

/** The broad training group of an exercise, from its movement pattern. Used by "add an exercise" to
 *  contain an added lift to matching-focus days (a hip-dominant lift lands where lower work already is,
 *  not on an upper day) and to derive a session's own focus from the lifts it holds. One source. */
export type MovementGroup = 'lower' | 'upper' | 'core' | null;

export function movementGroupOfPattern(pattern: MovementPattern | null | undefined): MovementGroup {
  if (pattern == null) return null;
  if (pattern === 'knee_dominant' || pattern === 'hip_dominant' || pattern === 'calf') return 'lower';
  if (pattern === 'horizontal_push' || pattern === 'horizontal_pull'
    || pattern === 'vertical_push' || pattern === 'vertical_pull') return 'upper';
  if (pattern === 'core') return 'core';
  return null; // plyometric etc. — not a strength-slot group
}

/** The training group of an exercise by NAME (resolves its config, then its pattern). */
export function getMovementGroup(exerciseName: string): MovementGroup {
  return movementGroupOfPattern(getExerciseConfig(exerciseName)?.pattern ?? null);
}

/**
 * THE COLLISION AXIS (Q-212) — coarser than `MovementPattern`, finer than `MovementGroup`.
 *
 * ⛔ IT IS NOT A DUPLICATE OF `MovementGroup` ABOVE, AND THE DIFFERENCE IS THE ENTIRE POINT.
 * `MovementGroup` answers *"does this belong on an upper or a lower day"* — it calls a bench press
 * and a pull-up both `upper`, which is correct for placement and useless here, because those two
 * are the pair this axis exists to tell apart. **Two groupings over one vocabulary, orthogonal
 * questions.** ⚠️ If a third is ever wanted, check both of these first.
 *
 * ⛔ WHY PUSH AND PULL COLLAPSE AND NOTHING ELSE DOES (§4.1a — owner: Michael, 2026-07-28).
 * A press day is `horizontal_push` OR `vertical_push`; bench and overhead press land on consecutive
 * days on the four-day template. Comparing exact patterns alone would let Dips (`horizontal_push`)
 * sit on an Overhead Press (`vertical_push`) day — **the precise case in the block that raised
 * Q-212** — so the two pushes must answer as one.
 *
 * ⛔ AND KNEE AND HIP MUST **NOT** COLLAPSE. They are the COMPLEMENT PAIR the rule pairs on purpose:
 * *"on a hip-dominant day, the single-leg slot gets knee-dominant work; on a knee-dominant day,
 * hip-dominant."* Folding them into one `legs` family would make them collide with each other and
 * invert the rule — it would forbid exactly the pairing that is wanted. Same for `core`,
 * `plyometric` and `calf`, which collide with nothing and stay themselves.
 *
 * ⚠️ NO CONSUMER YET, AND THAT IS DELIBERATE RATHER THAN AN OVERSIGHT. This is step 2 of 3; the rule
 * that reads it ships with the assistance pool (step 3). It is pinned by fixtures so it is a
 * derivation under test rather than dead code — but if step 3 is abandoned, **delete this**, because
 * an unread export is Q-211's whole disease.
 */
export type MovementFamily = 'push' | 'pull' | 'knee' | 'hip' | 'core' | 'plyometric' | 'calf' | null;

export function movementFamilyOfPattern(pattern: MovementPattern | null | undefined): MovementFamily {
  if (pattern == null) return null;
  switch (pattern) {
    case 'horizontal_push':
    case 'vertical_push':
      return 'push';
    case 'horizontal_pull':
    case 'vertical_pull':
      return 'pull';
    case 'knee_dominant': return 'knee';
    case 'hip_dominant': return 'hip';
    case 'core': return 'core';
    case 'plyometric': return 'plyometric';
    case 'calf': return 'calf';
  }
}

/**
 * THE COMPLEMENT — what Wendler pairs a main lift with, and it CROSSES THE PLANE.
 *
 * ⛔ NARROWED 2026-07-28 AFTER READING ALL FIVE ASSISTANCE TEMPLATES. My first version cited this
 * as Wendler's assistance principle. **It is not. Four of his five templates do the OPPOSITE**, and
 * they do it on purpose:
 *
 *   Boring But Big (p47)      Bench 5/3/1 -> Bench 5x10  + DB Row      SAME pattern, then balance
 *   Triumvirate (p48)         Press 5/3/1 -> Dips        + Chin-ups    SAME family, then balance
 *   Triumvirate (p48)         Squat 5/3/1 -> Leg Press   + Leg Curl    SAME pattern, then balance
 *   Periodization Bible (p51) Bench 5/3/1 -> Chest/Shoulders + Lats + Triceps
 *
 * The same-pattern movement is the HYPERTROPHY dose. p46's "if you train your chest, train your
 * back" means include both across the session — it does not mean exclude the one you just trained.
 *
 * ✅ **THE ONE TEMPLATE THAT CROSSES IS THE CONCURRENT ONE, AND THAT IS OURS.** p86 — the chapter on
 * combining 5/3/1 with heavy conditioning — gives ONE assistance movement per lift, before the
 * conditioning work, and every one of the four is the antagonist:
 *
 *   Bench Press (horizontal push) -> Chin-ups       (vertical pull)
 *   Press       (vertical push)   -> Bent Over Rows (horizontal pull)
 *   Deadlift    (hip dominant)    -> Front Squat    (knee dominant)
 *   Squat       (knee dominant)   -> Good Morning   (hip dominant)
 *
 * With one slot and conditioning to follow, there is no room for hypertrophy volume — so the slot
 * buys balance instead. That is exactly our athlete, and it is why this rule is right HERE and
 * would be wrong in a general strength block.
 *
 * ⛔ SO DO NOT "FIX" THIS BY COPYING BORING BUT BIG. Someone reading the other templates will
 * reasonably conclude the engine has it backwards. It does not — it is scoped to the concurrent
 * case, and the citation is p86, not p46 and not the assistance chapter generally.
 *
 * ⚠️ AND THE MAP IS STILL MINE. Four pairings, generalised into a symmetric rule. The reverse
 * directions (`horizontal_pull -> vertical_push`, `vertical_pull -> horizontal_push`) are pure
 * extrapolation — p86 never shows a pull as the MAIN lift, because 5/3/1 has no pulling main lift.
 * They exist so the map is total; nothing in the book supports them.
 */
const COMPLEMENT: Partial<Record<MovementPattern, MovementPattern>> = {
  horizontal_push: 'vertical_pull',
  vertical_push: 'horizontal_pull',
  horizontal_pull: 'vertical_push',
  vertical_pull: 'horizontal_push',
  knee_dominant: 'hip_dominant',
  hip_dominant: 'knee_dominant',
};

/** The pattern that balances this one, or null where p86 pairs nothing against it. */
export function complementOfPattern(p: MovementPattern | null | undefined): MovementPattern | null {
  return p == null ? null : (COMPLEMENT[p] ?? null);
}

/** The pattern that balances this exercise, by NAME. */
export function complementFor(exerciseName: string): MovementPattern | null {
  return complementOfPattern(getExerciseConfig(exerciseName)?.pattern ?? null);
}

/** The collision family of an exercise by NAME. ⛔ Reads the TYPED pattern, never the description. */
export function getMovementFamily(exerciseName: string): MovementFamily {
  return movementFamilyOfPattern(getExerciseConfig(exerciseName)?.pattern ?? null);
}

/**
 * Do these two movements load the same thing? ⛔ The question a slot asks about the day's main lift.
 * Absent on either side answers `false` — a missing pattern is not evidence of a clash (§0h).
 */
export function sharesMovementFamily(a: string, b: string): boolean {
  const fa = getMovementFamily(a);
  const fb = getMovementFamily(b);
  return fa != null && fb != null && fa === fb;
}

function firstPositiveBaseline(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
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
      return firstPositiveBaseline(baselines?.squat, baselines?.squat1RM, baselines?.squat_1rm);
    case 'deadlift': 
      return firstPositiveBaseline(baselines?.deadlift, baselines?.dead_lift);
    case 'bench': 
      return firstPositiveBaseline(baselines?.bench, baselines?.bench_press, baselines?.benchPress);
    case 'overhead': 
      return firstPositiveBaseline(
        baselines?.overheadPress1RM,
        baselines?.ohp,
        baselines?.overhead_press,
        baselines?.overhead,
      );
    case 'hipThrust': 
      return firstPositiveBaseline(baselines?.hipThrust, baselines?.hip_thrust);
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
  reps?: number,
  // Strength-primary rows pass false: their explicit % ALREADY encodes intensity (the composer
  // periodized it), so the rep scale would double-count — 100% must render as the real max, not
  // 106%. Mirrors `applyRepScale` in materialize-plan's calculateWeightFromConfig.
  applyRepScale: boolean = true,
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
  const exerciseNameLower = String(exerciseName ?? '').toLowerCase();
  if ((exerciseNameLower === 'dips' || exerciseNameLower === 'dip') && config.primaryRef === 'bench') {
    // Calculate target total load (bodyweight + added weight)
    const inferred1RM = base1RM * config.ratio; // Dip 1RM = 90% of bench
    const repScale = applyRepScale ? getRepScale(reps) : 1;
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
  const repScale = applyRepScale ? getRepScale(reps) : 1;
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

// ─── SWAP SEED (D-322) ────────────────────────────────────────────────────────
// When a slot is swapped to a different lift, what weight goes in the box?
//
// THE INVARIANT, and everything here exists to hold it:
//
//     swapping INTO a lift must give the weight the plan would have prescribed for
//     that lift, in this week, had it been the authored slot all along.
//
// So the seed is a plain derivation from the NEW lift's own reference at the block's
// authored intensity — never a transform of the OLD lift's number:
//
//     seed = baseline1RM(newRef) × newRatio × authored %1RM        (rounded to plate)
//
// The logger's swap sheet and materialize-plan's rest-of-plan path both call this, so
// "just today" and "rest of plan" agree by construction. They used to disagree because
// the client rescaled and the server derived.
//
// ⛔ WHY NOT SCALE OFF THE CURRENT LOAD — the bug this replaced, worth stating because
// the arithmetic looks equivalent and is not. `curW × newRatio / oldRatio` is algebraically
// the same derivation ONLY on unrounded numbers. Real prescriptions are rounded to the plate
// increment first, so the rescale multiplies that rounding error and then rounds again:
//
//     front squat  110 × 0.85 × 0.785 = 73.4  → displayed 75      (+1.6 rounding)
//     rescaled     75 × (1.00 / 0.85)  = 88.2 → 90
//     derived      110 × 1.00 × 0.785  = 86.4 → 85                 ← what the plan says
//
// Back-inferring the intensity from the displayed load has the identical defect one step
// removed: 75 / (110 × 0.85) = 0.802 against an authored 0.785. The authored % is the only
// intensity not downstream of a rounding step, which is why callers must pass it when they
// have it.
//
// ⛔ AND NOT THE ATHLETE'S LOG. Seeding from the last time they did the lift was tried and
// reverted: it silently leaves the protocol. It happens to look right on a lift they train at
// the block's intensity and is badly wrong on anything else — a Bulgarian split squat logged
// as accessory work at 20 lb seeds 20 where the block prescribes 45. A %1RM program's job is
// to prescribe, not to repeat. Load feedback belongs in the RIR loop, which is designed for
// it and is consent-gated (D-315); it does not belong in a substitution.

export interface SwapSeedResult {
  /** null = leave the box blank; no baseline for this lift's reference. */
  weight: number | null;
  displayFormat: string;
  /** Which branch produced it. */
  source: 'baseline' | 'none';
}

/**
 * Resolve the weight to seed a swapped-in lift with. Pure; see the block comment above.
 *
 * @param exerciseName  the lift being swapped IN
 * @param targetPercent the block's AUTHORED working %1RM (e.g. 0.785) — not one inferred
 *                      from a displayed load, except as a legacy fallback by the caller
 * @param baselines     performance_numbers
 * @param reps          target reps, for the rep scale
 * @param applyRepScale false for strength-primary rows, whose authored % already encodes
 *                      intensity per rep bracket
 */
export function resolveSwapSeedWeight(
  exerciseName: string,
  targetPercent: number,
  baselines: any,
  reps?: number,
  applyRepScale: boolean = true,
): SwapSeedResult {
  const config = getExerciseConfig(exerciseName);
  const derived = calculatePrescribedWeight(exerciseName, targetPercent, baselines, reps, applyRepScale);
  if (derived.weight != null) {
    return { weight: derived.weight, displayFormat: derived.displayFormat, source: 'baseline' };
  }
  return { weight: null, displayFormat: config?.displayFormat ?? 'total', source: 'none' };
}

/**
 * Reduce one logged exercise's sets to the heaviest set the athlete actually COMPLETED.
 * Uncompleted sets are excluded on purpose — an abandoned set is not evidence you can lift that
 * weight. Returns null when nothing qualifies, which drops the caller to its next fallback.
 *
 * D-322. ⛔ OWNERSHIP NOTE: this exists for the ADDED-EXERCISE weight chain, not for swaps. It was
 * originally written for swap history-seeding, and was DELETED when that was reverted — which
 * silently broke added-exercise prefill, because nothing recorded that a second consumer depended
 * on it. It is back with one owner. A future revert of swap work must not remove it again.
 */
export function heaviestCompletedWeight(sets: any[] | null | undefined): number | null {
  if (!Array.isArray(sets)) return null;
  let best = 0;
  for (const s of sets) {
    if (!s || s.completed !== true) continue;
    const w = Number(s.weight);
    if (Number.isFinite(w) && w > best) best = w;
  }
  return best > 0 ? best : null;
}

/**
 * Key an exercise name for cross-session matching: lowercase, drop (Left)/(Right),
 * collapse whitespace, drop a trailing plural 's' (Q-197, so "Hip Thrusts" matches
 * "Hip Thrust"). Applied to both the stored key and the lookup, so matching stays
 * self-consistent. Shared by the logger's prefill and the D-122 "last:" anchor.
 */
export function normalizeLiftKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s*\((?:left|right)\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
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
