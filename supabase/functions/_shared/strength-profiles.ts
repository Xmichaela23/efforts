// =============================================================================
// STRENGTH PROTOCOL PROFILES + PHASE RULES
// =============================================================================
// Single source of truth for protocol-specific progression/deload thresholds
// and phase gating rules. Consumed by:
//   - adapt-plan (auto/suggest weight adjustments)
//   - response-model/weekly (computeLiftVerdict UI verdicts)
//
// All decisions are based on DEVIATION from target RIR, never absolute RIR.
//   deviation = actual_rir - target_rir
//   positive  → athlete has more in reserve than prescribed (underloaded)
//   negative  → athlete has less in reserve than prescribed (overloaded)
// =============================================================================

export type StrengthProtocolId =
  | 'durability'
  | 'neural_speed'
  | 'upper_aesthetics'
  | 'triathlon'
  | 'triathlon_performance'
  | 'minimum_dose';

export type StrengthProtocolProfile = {
  /** Default target RIR when no exercise-level override exists. */
  defaultTargetRir: { lower: number; upper: number };

  progression: {
    /** Deviation (actual − target) must be >= this to consider adding load. */
    minDeviation: number;
    /** e1RM gain % (0.03 = 3%) must be >= this before suggesting progression. */
    minGainPct: number;
  };

  deload: {
    /** Deviation (actual − target) must be <= this (negative) to trigger deload. */
    maxDeviation: number;
    /** Minimum sessions showing the pattern before acting. */
    minSessions: number;
  };
};

// ---------------------------------------------------------------------------
// Protocol profiles
// ---------------------------------------------------------------------------
// durability  – high rep, endurance support, conservative progression
// neural      – low rep, heavy loads, tighter tolerances, faster reaction
// upper_aesth – hybrid: neural lower + hypertrophy upper
// triathlon   – similar to durability, extra interference tolerance
// tri_perf    – periodized tri compounds; slightly tighter than tri support
// minimum     – maintenance; progression only when clearly underloaded
// ---------------------------------------------------------------------------

export const PROTOCOL_PROFILES: Record<StrengthProtocolId, StrengthProtocolProfile> = {
  durability: {
    defaultTargetRir: { lower: 2.5, upper: 2.5 },
    progression: { minDeviation: 0.5, minGainPct: 0.03 },
    deload:      { maxDeviation: -1.0, minSessions: 3 },
  },

  neural_speed: {
    defaultTargetRir: { lower: 1.5, upper: 2 },
    progression: { minDeviation: 0.25, minGainPct: 0.02 },
    deload:      { maxDeviation: -0.5, minSessions: 2 },
  },

  upper_aesthetics: {
    defaultTargetRir: { lower: 1.5, upper: 2 },
    progression: { minDeviation: 0.5, minGainPct: 0.03 },
    deload:      { maxDeviation: -0.75, minSessions: 3 },
  },

  triathlon: {
    defaultTargetRir: { lower: 2.5, upper: 2.5 },
    progression: { minDeviation: 0.5, minGainPct: 0.03 },
    deload:      { maxDeviation: -1.0, minSessions: 3 },
  },

  triathlon_performance: {
    defaultTargetRir: { lower: 2, upper: 2 },
    progression: { minDeviation: 0.35, minGainPct: 0.025 },
    deload:      { maxDeviation: -0.75, minSessions: 3 },
  },

  minimum_dose: {
    defaultTargetRir: { lower: 2, upper: 2 },
    progression: { minDeviation: 0.75, minGainPct: 0.05 },
    deload:      { maxDeviation: -1.0, minSessions: 3 },
  },
};

const DEFAULT_PROFILE: StrengthProtocolProfile = PROTOCOL_PROFILES.durability;

// ---------------------------------------------------------------------------
// Phase rules
// ---------------------------------------------------------------------------

export type PlanPhaseId = 'base' | 'build' | 'peak' | 'taper' | 'recovery';

export type PhaseRule = {
  /** Whether weight progression adjustments are allowed in this phase. */
  allowProgress: boolean;
  /**
   * Multiplier on the deload deviation threshold.
   * Lower values = less sensitive to low RIR (avoids false positives in easy weeks).
   * Applied as: adjustedThreshold = profile.deload.maxDeviation * deloadSensitivity
   */
  deloadSensitivity: number;
};

export const PHASE_RULES: Record<PlanPhaseId, PhaseRule> = {
  base:     { allowProgress: true,  deloadSensitivity: 1.0  },
  build:    { allowProgress: true,  deloadSensitivity: 1.0  },
  peak:     { allowProgress: false, deloadSensitivity: 0.5  },
  taper:    { allowProgress: false, deloadSensitivity: 0.5  },
  recovery: { allowProgress: false, deloadSensitivity: 0.25 },
};

const DEFAULT_PHASE_RULE: PhaseRule = PHASE_RULES.build;

// ---------------------------------------------------------------------------
// Verdict thresholds (shared between weekly.ts and adapt-plan)
// ---------------------------------------------------------------------------
// These are intentionally wider than the adapt-plan thresholds to avoid
// flip-flopping the UI week-to-week. ±0.5 RIR is noise, ±1.0 is signal.

export const VERDICT_DEVIATION = {
  ADD_WEIGHT: 1.0,    // deviation >= +1.0 → "add weight"
  BACK_OFF:  -1.0,    // deviation <= -1.0 → "back off weight"
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOWER_BODY_CANONICALS = new Set([
  'back_squat', 'front_squat', 'squat', 'deadlift', 'trap_bar_deadlift',
  'romanian_deadlift', 'rdl', 'leg_press', 'split_squat', 'lunge', 'hip_thrust',
]);

export function isLowerBodyLift(canonical: string): boolean {
  return LOWER_BODY_CANONICALS.has(canonical.toLowerCase().replace(/\s+/g, '_'));
}

export function resolveProfile(protocolId: string | null | undefined): StrengthProtocolProfile {
  if (!protocolId) return DEFAULT_PROFILE;
  return PROTOCOL_PROFILES[protocolId as StrengthProtocolId] ?? DEFAULT_PROFILE;
}

export function resolvePhaseRule(phaseTag: string | null | undefined): PhaseRule {
  if (!phaseTag) return DEFAULT_PHASE_RULE;
  const key = phaseTag.toLowerCase() as PlanPhaseId;
  return PHASE_RULES[key] ?? DEFAULT_PHASE_RULE;
}

/**
 * Returns the protocol's default target RIR for a given lift.
 * If a per-exercise target exists (from planned workout), prefer that.
 */
export function getTargetRir(
  profile: StrengthProtocolProfile,
  canonical: string,
  exerciseLevelTarget?: number | null,
): number {
  if (exerciseLevelTarget != null && Number.isFinite(exerciseLevelTarget)) {
    return exerciseLevelTarget;
  }
  return isLowerBodyLift(canonical)
    ? profile.defaultTargetRir.lower
    : profile.defaultTargetRir.upper;
}
