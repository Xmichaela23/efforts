// ============================================================================
// STRENGTH INTENT TAXONOMY v1.0
// 
// This is the foundation of the multi-protocol strength system.
// 
// Intents are abstract session types that protocols generate.
// Placement policies assign intents to days.
// Guardrails validate intent placement.
// 
// Key principle: Protocols output intents, not day-specific sessions.
// ============================================================================

export type StrengthIntent =
  // Lower Body
  | 'LOWER_NEURAL'
  | 'LOWER_DURABILITY'
  | 'LOWER_POWER'
  | 'LOWER_MAINTENANCE'
  // Upper Body
  | 'UPPER_STRENGTH'
  | 'UPPER_POSTURE'
  | 'UPPER_MAINTENANCE'
  // Full Body
  | 'FULLBODY_MAINTENANCE';

export type IntentPriority = 'required' | 'preferred' | 'optional';
export type SessionCost = 'low' | 'medium' | 'high';
export type RepProfile = 'strength' | 'hypertrophy' | 'maintenance';

export interface IntentMetadata {
  // Classification
  category: 'lower' | 'upper' | 'fullbody';
  isNeural: boolean; // Heavy, low rep, CNS-focused
  isDurability: boolean; // Unilateral, higher rep, stability-focused
  
  // Priority (default for this intent)
  priorityDefault: IntentPriority;
  
  // Session cost (helps guardrails auto-modify)
  sessionCost: SessionCost;
  
  // Timing constraints (hours to avoid after primary sport sessions)
  avoidWithinHoursOf?: {
    LONG?: number; // Long/high-volume session (long run, long ride, etc.)
    QUALITY?: number; // Quality/speed work (intervals, tempo, etc.)
  };
  
  // Volume caps (prevent overreaching)
  maxWeeklySets?: number;
  maxWeeklyWorkingReps?: number; // Better than sets alone for neural intents
  
  // Rep profile options (for intents that allow multiple styles)
  repProfileDefaults?: RepProfile[];
  
  // Exercise families that satisfy this intent
  exerciseFamilies: string[];
  
  // Rep/intensity ranges (guidelines, not hard limits)
  repRange: [number, number]; // [min, max]
  intensityRange: [number, number]; // [min% 1RM, max% 1RM]
  
  // Protocol eligibility (which protocols can generate this)
  allowedProtocols: string[];
}

// ============================================================================
// INTENT DEFINITIONS
// ============================================================================

export const INTENT_DEFS: Record<StrengthIntent, IntentMetadata> = {
  // ============================================================================
  // LOWER BODY INTENTS
  // ============================================================================
  
  LOWER_NEURAL: {
    category: 'lower',
    isNeural: true,
    isDurability: false,
    priorityDefault: 'required',
    sessionCost: 'high',
    avoidWithinHoursOf: {
      LONG: 48, // Must be 48h+ after long run
      QUALITY: 24, // 24h+ after quality work
    },
    maxWeeklySets: 9, // Cap total weekly sets
    maxWeeklyWorkingReps: 30, // Neural work: low reps, so cap by total reps
    repProfileDefaults: ['strength'],
    exerciseFamilies: ['bilateral_compound'], // Back Squat, Trap Bar DL, Front Squat
    repRange: [2, 5],
    intensityRange: [75, 90],
    allowedProtocols: ['neural_speed', 'upper_aesthetics'], // Only protocols that do heavy compounds
  },
  
  LOWER_DURABILITY: {
    category: 'lower',
    isNeural: false,
    isDurability: true,
    priorityDefault: 'required',
    sessionCost: 'medium',
    avoidWithinHoursOf: {
      LONG: 24, // Can be closer than neural (less CNS cost)
      QUALITY: 12, // Can be same day if needed
    },
    maxWeeklySets: 15, // Higher volume allowed
    maxWeeklyWorkingReps: 120, // Higher rep work
    repProfileDefaults: ['hypertrophy'],
    exerciseFamilies: ['unilateral_stability'], // Bulgarian Split Squat, Single Leg RDL, Lateral Lunges
    repRange: [8, 15],
    intensityRange: [50, 70],
    allowedProtocols: ['durability', 'upper_aesthetics'], // Foundation always, upper priority can include
  },
  
  LOWER_POWER: {
    category: 'lower',
    isNeural: true, // CNS-focused despite low volume
    isDurability: false,
    priorityDefault: 'preferred',
    sessionCost: 'high', // High CNS cost despite low volume
    avoidWithinHoursOf: {
      LONG: 36,
      QUALITY: 24, // Power work needs fresh CNS
    },
    maxWeeklySets: 6, // Very low volume
    maxWeeklyWorkingReps: 20, // Plyos: 3-5 reps per set
    repProfileDefaults: ['strength'],
    exerciseFamilies: ['plyometric', 'explosive'], // Box Jumps, Jump Squats, KB Swings
    repRange: [3, 5],
    intensityRange: [30, 50], // Bodyweight or light load
    allowedProtocols: ['neural_speed'], // Only performance protocol does power work
  },
  
  LOWER_MAINTENANCE: {
    category: 'lower',
    isNeural: false,
    isDurability: false,
    priorityDefault: 'optional',
    sessionCost: 'low',
    avoidWithinHoursOf: undefined, // Can go anywhere (light load)
    maxWeeklySets: 6,
    maxWeeklyWorkingReps: 60,
    repProfileDefaults: ['maintenance'],
    exerciseFamilies: ['light_compound', 'bodyweight'], // Hip Thrusts @ 50%, Glute Bridges
    repRange: [10, 15],
    intensityRange: [50, 60],
    allowedProtocols: ['upper_aesthetics', 'minimum_dose'], // Upper priority uses this, minimum dose can use it
  },
  
  // ============================================================================
  // UPPER BODY INTENTS
  // ============================================================================
  
  UPPER_STRENGTH: {
    category: 'upper',
    isNeural: false, // Upper doesn't compete with running
    isDurability: false,
    priorityDefault: 'required',
    sessionCost: 'medium',
    avoidWithinHoursOf: undefined, // Upper doesn't interfere with running
    maxWeeklySets: 16, // Can do more volume (doesn't compete)
    maxWeeklyWorkingReps: 120,
    repProfileDefaults: ['strength', 'hypertrophy'], // Can be either style
    exerciseFamilies: ['heavy_compound'], // Bench Press, Barbell Row, Overhead Press
    repRange: [4, 12], // 4-8 for strength, 8-12 for hypertrophy
    intensityRange: [65, 85],
    allowedProtocols: ['upper_aesthetics', 'neural_speed', 'durability'], // Most protocols do upper strength
  },
  
  UPPER_POSTURE: {
    category: 'upper',
    isNeural: false,
    isDurability: false,
    priorityDefault: 'preferred',
    sessionCost: 'low',
    avoidWithinHoursOf: undefined,
    maxWeeklySets: 12,
    maxWeeklyWorkingReps: 180, // High rep work
    repProfileDefaults: ['hypertrophy'],
    exerciseFamilies: ['rear_delt', 'upper_back'], // Face Pulls, Band Pulls, YTW Raises
    repRange: [12, 20],
    intensityRange: [40, 60], // Light bands or 50-60% 1RM
    allowedProtocols: ['upper_aesthetics', 'durability'], // Upper priority and foundation include posture work
  },
  
  UPPER_MAINTENANCE: {
    category: 'upper',
    isNeural: false,
    isDurability: false,
    priorityDefault: 'optional',
    sessionCost: 'low',
    avoidWithinHoursOf: undefined,
    maxWeeklySets: 6,
    maxWeeklyWorkingReps: 60,
    repProfileDefaults: ['maintenance'],
    exerciseFamilies: ['light_compound'], // Bench 2x8 @ 50%, Rows 2x8 @ 50%
    repRange: [8, 12],
    intensityRange: [50, 60],
    allowedProtocols: ['neural_speed', 'minimum_dose'], // Performance can use in taper, minimum dose uses it
  },
  
  // ============================================================================
  // FULL BODY INTENTS
  // ============================================================================
  
  FULLBODY_MAINTENANCE: {
    category: 'fullbody',
    isNeural: false,
    isDurability: false,
    priorityDefault: 'preferred',
    sessionCost: 'low',
    avoidWithinHoursOf: undefined,
    maxWeeklySets: 6, // One exercise per pattern
    maxWeeklyWorkingReps: 30, // Low total volume
    repProfileDefaults: ['maintenance'],
    exerciseFamilies: ['minimal_compound'], // One squat, one bench, one row
    repRange: [5, 8],
    intensityRange: [65, 75],
    allowedProtocols: ['minimum_dose', 'durability', 'neural_speed'], // Minimum dose uses full body; foundation/performance use it for taper optional
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get metadata for an intent
 */
export function getIntentMetadata(intent: StrengthIntent): IntentMetadata {
  return INTENT_DEFS[intent];
}

/**
 * Check if an intent is lower body
 */
export function isLowerIntent(intent: StrengthIntent): boolean {
  return INTENT_DEFS[intent].category === 'lower';
}

/**
 * Check if an intent is upper body
 */
export function isUpperIntent(intent: StrengthIntent): boolean {
  return INTENT_DEFS[intent].category === 'upper';
}

/**
 * Check if an intent is full body
 */
export function isFullBodyIntent(intent: StrengthIntent): boolean {
  return INTENT_DEFS[intent].category === 'fullbody';
}

/**
 * Get all intents allowed by a protocol
 */
export function getIntentsForProtocol(protocolId: string): StrengthIntent[] {
  return Object.entries(INTENT_DEFS)
    .filter(([_, metadata]) => metadata.allowedProtocols.includes(protocolId))
    .map(([intent]) => intent as StrengthIntent);
}

/**
 * Check if an intent requires spacing after long/high-volume sessions
 */
export function getMinHoursAfterLongSession(intent: StrengthIntent): number | undefined {
  return INTENT_DEFS[intent].avoidWithinHoursOf?.LONG;
}

/**
 * Check if an intent requires spacing after quality/speed sessions
 */
export function getMinHoursAfterQualitySession(intent: StrengthIntent): number | undefined {
  return INTENT_DEFS[intent].avoidWithinHoursOf?.QUALITY;
}
