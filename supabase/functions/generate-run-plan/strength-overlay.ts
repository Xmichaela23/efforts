// ============================================================================
// STRENGTH OVERLAY SYSTEM v3.0 - Protocol-based architecture
// 
// Uses shared strength-system module with protocol/placement/guardrails separation.
// ============================================================================

import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure } from './types.ts';
import { getProtocol } from '../shared/strength-system/protocols/selector.ts';
import { simplePlacementPolicy } from '../shared/strength-system/placement/simple.ts';
import { mapApproachToMethodology } from '../shared/strength-system/placement/strategy.ts';
import {
  ProtocolContext,
  StrengthPhase,
  PlacedSession,
  IntentSession,
} from '../shared/strength-system/protocols/types.ts';
import type { PlanningMemoryContext } from '../_shared/athlete-memory.ts';

/** Interference risk threshold above which we force noDoubles. Science: AMPK/mTOR conflict is highest within 6 hrs of concurrent sessions. */
const INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD = 0.65;

/** Minimum confidence required to display computed weight instead of "X% 1RM" text. */
const WEIGHT_RESOLUTION_CONFIDENCE_THRESHOLD = 0.7;

// ============================================================================
// STRENGTH 1RM WEIGHT RESOLVER
// ============================================================================

/**
 * Maps protocol exercise display names to their canonical anchor lift keys.
 * Must match the canonical keys in canonicalize.ts and STRENGTH_ANCHORS.
 */
const DISPLAY_TO_ANCHOR: Record<string, string> = {
  'back squat':          'squat',
  'squat':               'squat',
  'trap bar deadlift':   'trap_bar_deadlift',
  'deadlift':            'deadlift',
  'hip thrusts':         'hip_thrust',
  'hip thrust':          'hip_thrust',
  'bench press':         'bench_press',
  'barbell rows':        'barbell_row',
  'barbell row':         'barbell_row',
  'bent over row':       'barbell_row',
  'overhead press':      'overhead_press',
  'ohp':                 'overhead_press',
  'shoulder press':      'overhead_press',
};

/**
 * Parse a percentage from a weight string like "85% 1RM" or "75% 1RM".
 * Returns the percentage as a decimal (0.85), or null if not parseable.
 */
function parsePercentage(weight: string): number | null {
  const match = weight.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const pct = parseFloat(match[1]);
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct / 100 : null;
}

/**
 * Post-process all exercises in placed sessions to substitute computed weights
 * when the athlete's 1RM is known with sufficient confidence.
 *
 * "85% 1RM" → "225 lbs (85%)"  [when confidence >= 0.7]
 * "85% 1RM" → "85% 1RM"        [when confidence < 0.7 or no data]
 *
 * Also applies auto-regulatory set reduction for drift-flagged lifts:
 * a lift that dropped >7% since last memory snapshot gets sets cut by 1
 * (e.g., 3×3 → 2×3) and a note added.
 */
function resolveExerciseWeights(
  sessions: PlacedSession[],
  memoryContext: PlanningMemoryContext,
): PlacedSession[] {
  const { strength1RMs, driftFlaggedLifts } = memoryContext;
  if (Object.keys(strength1RMs).length === 0) return sessions;

  return sessions.map(session => {
    if (!session.exercises?.length) return session;

    const resolvedExercises = session.exercises.map((ex: StrengthExercise) => {
      const nameLower = (ex.name ?? '').toLowerCase().trim();
      const anchorKey = DISPLAY_TO_ANCHOR[nameLower];
      if (!anchorKey) return ex;

      const ruleKey = `${anchorKey}_1rm_est`;
      const rule = strength1RMs[ruleKey];
      if (!rule) return ex;

      let updatedEx = { ...ex };

      // Weight resolution: substitute actual lbs when confidence is sufficient
      if (rule.confidence >= WEIGHT_RESOLUTION_CONFIDENCE_THRESHOLD) {
        const pct = parsePercentage(String(ex.weight ?? ''));
        if (pct !== null) {
          const computedLbs = Math.round((rule.value * pct) / 5) * 5; // round to nearest 5 lbs
          updatedEx.weight = `${computedLbs} lbs (${Math.round(pct * 100)}%)`;
        }
      }

      // Auto-regulatory drift reduction: if this lift is flagged, cut sets by 1
      if (driftFlaggedLifts.includes(anchorKey) && typeof updatedEx.sets === 'number' && updatedEx.sets > 1) {
        updatedEx.sets = updatedEx.sets - 1;
        updatedEx.notes = (updatedEx.notes ? updatedEx.notes + ' · ' : '')
          + 'Auto-reduced: strength dipping as mileage increases. Maintain intensity, cut volume.';
      }

      return updatedEx;
    });

    return { ...session, exercises: resolvedExercises };
  });
}

type StrengthTier = 'bodyweight' | 'barbell';
type StrengthFrequency = 2 | 3;

// ============================================================================
// SENSITIVITY-GATED TAPER STEP-DOWN
// ============================================================================

interface TaperStrengthParams {
  /** How many strength sessions to include this taper week. */
  effectiveFrequency: 0 | 1 | 2;
  /** 0–1 multiplier applied to exercise sets. Keeps intensity high, cuts volume. */
  taperLoadScale: number;
  strategy: 'aggressive' | 'standard' | 'extended';
}

/**
 * Compute taper strength parameters based on taper_sensitivity from athlete_memory.
 *
 * Science (Mujika & Padilla 2003, Bosquet et al. 2007):
 * - Maintain intensity; cut volume 40–60%
 * - Frequency drop of ≤ 1 session/week preserves neuromuscular readiness
 * - High-sensitivity athletes peak faster → steeper step-down is safe
 * - Low-sensitivity athletes need gradual de-fatigue → maintain load longer
 *
 * Edge case: 1-week taper → normalise to the "final stage" cutback since
 * the athlete arrives at race week after only one reduced-load week.
 */
function getTaperStrengthParams(
  weekInTaper: number,
  taperLength: number,
  taperSensitivity: number | null,
): TaperStrengthParams {
  // Short taper (≤ 1 week): treat as final-stage immediately
  const effectiveWeek = taperLength <= 1 ? 2 : weekInTaper;
  const sensitivity = taperSensitivity ?? 0.5; // default: moderate

  if (sensitivity >= 0.65) {
    // Aggressive: cut to 1 session immediately; minimal load in final stage
    return {
      effectiveFrequency: 1,
      taperLoadScale: effectiveWeek === 1 ? 0.6 : 0.4,
      strategy: 'aggressive',
    };
  }

  if (sensitivity >= 0.35) {
    // Standard: 2 sessions at reduced load → 1 session light
    return {
      effectiveFrequency: weekInTaper === 1 ? 2 : 1,
      taperLoadScale: weekInTaper === 1 ? 0.75 : 0.55,
      strategy: 'standard',
    };
  }

  // Extended: gradual step-down, maintain 2 sessions longer
  if (weekInTaper <= 2) {
    return {
      effectiveFrequency: 2,
      taperLoadScale: weekInTaper === 1 ? 0.85 : 0.65,
      strategy: 'extended',
    };
  }
  return { effectiveFrequency: 1, taperLoadScale: 0.5, strategy: 'extended' };
}

/**
 * Scale exercise sets by taperLoadScale, floor at 1 set.
 * Intensity (weight prescription) is deliberately preserved — the golden rule of tapering.
 * Appends a taper note to the session description so athletes understand the rationale.
 */
function applyTaperLoadScale(
  sessions: IntentSession[],
  taperLoadScale: number,
  strategy: TaperStrengthParams['strategy'],
): IntentSession[] {
  if (taperLoadScale >= 1.0) return sessions;

  const strategyLabel: Record<TaperStrengthParams['strategy'], string> = {
    aggressive: 'Aggressive taper: volume cut, intensity preserved.',
    standard: 'Standard taper: reduced volume, maintained intensity.',
    extended: 'Extended taper: gradual volume reduction.',
  };

  return sessions.map(s => ({
    ...s,
    description: `${s.description} [${strategyLabel[strategy]}]`,
    exercises: s.exercises.map(ex => ({
      ...ex,
      sets: Math.max(1, Math.round(ex.sets * taperLoadScale)),
    })),
    tags: [...s.tags, `taper_load_scale:${taperLoadScale.toFixed(2)}`],
  }));
}

/**
 * After protocol generates taper sessions, filter to effectiveFrequency.
 * Preference order for a single session: upper/full-body > lower.
 * Lower sessions avoided when only 1 slot — protects pre-race legs.
 */
function filterToTaperFrequency(
  sessions: IntentSession[],
  effectiveFrequency: number,
): IntentSession[] {
  if (effectiveFrequency === 0 || sessions.length === 0) return [];
  if (sessions.length <= effectiveFrequency) return sessions;

  if (effectiveFrequency === 1) {
    // Prefer upper/full-body; only fall back to lower if that's all that exists
    const preferred = sessions.find(
      s => !s.intent.startsWith('LOWER') || s.intent === 'FULLBODY_MAINTENANCE'
    );
    return [preferred ?? sessions[0]];
  }

  return sessions.slice(0, effectiveFrequency);
}

// ============================================================================
// MAIN OVERLAY FUNCTION
// ============================================================================

export function overlayStrength(
  plan: TrainingPlan,
  frequency: StrengthFrequency,
  phaseStructure: PhaseStructure,
  tier: StrengthTier = 'bodyweight',
  protocolId?: string,
  methodology?: 'hal_higdon_complete' | 'jack_daniels_performance',
  noDoubles?: boolean,
  memoryContext?: PlanningMemoryContext,
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};
  const totalWeeks = Object.keys(plan.sessions_by_week).length;

  // Memory-driven noDoubles: if interference_risk is high, separate all sessions.
  const memoryDrivenNoDoubles =
    memoryContext?.interferenceRisk != null &&
    memoryContext.interferenceRisk >= INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD;
  const effectiveNoDoubles = (noDoubles ?? false) || memoryDrivenNoDoubles;
  if (memoryDrivenNoDoubles && !noDoubles) {
    console.log(
      `[PlanGen] Memory: interference_risk=${memoryContext!.interferenceRisk!.toFixed(2)} ≥ ${INTERFERENCE_RISK_NO_DOUBLES_THRESHOLD} → noDoubles forced`
    );
  }

  // Get protocol
  // - If protocolId is undefined (PlanWizard case - not exposed yet): use default
  // - If protocolId is provided: validate it exists, error if invalid (no fallback)
  const protocol = getProtocol(protocolId);

  // Extract primary sport schedule from plan (for placement/guardrails)
  const primarySchedule = extractPrimarySchedule(plan);

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    const phase = getCurrentPhase(week, phaseStructure);
    const isRecovery = phaseStructure.recovery_weeks.includes(week);
    // Calculate weekInPhase excluding recovery weeks
    // Count only non-recovery weeks from phase start to current week
    let weekInPhase = 0;
    for (let w = phase.start_week; w <= week; w++) {
      if (!phaseStructure.recovery_weeks.includes(w)) {
        weekInPhase++;
      }
    }

    // Taper sensitivity: compute params when in taper phase
    const isTaperPhase = phase.name === 'Taper';
    const taperParams = isTaperPhase
      ? getTaperStrengthParams(
          week - phase.start_week + 1,                // weekInTaper (1-based)
          phase.end_week - phase.start_week + 1,      // taperLength
          memoryContext?.taperSensitivity ?? null,
        )
      : null;

    if (taperParams) {
      console.log(
        `[PlanGen] Taper week ${week}: strategy=${taperParams.strategy}, freq=${taperParams.effectiveFrequency}, loadScale=${taperParams.taperLoadScale} (sensitivity=${memoryContext?.taperSensitivity ?? 'default'})`
      );
    }
    
    // Build protocol context
    const context: ProtocolContext = {
      weekIndex: week,
      weekInPhase,
      phase: convertPhase(phase),
      totalWeeks,
      isRecovery,
      primarySchedule,
      strengthFrequency: frequency,
      userBaselines: {
        // Will be populated during materialization
        equipment: tier === 'barbell' ? 'commercial_gym' : 'home_gym',
      },
      constraints: {
        maxSessionDuration: 60,
        taperLoadScale: taperParams?.taperLoadScale,
      },
    };

    // Generate intent sessions (no day assignment)
    let intentSessions = protocol.createWeekSessions(context);

    // Apply taper sensitivity post-protocol:
    // 1. Scale sets down (preserves intensity — the golden rule of tapering)
    // 2. Filter to effectiveFrequency (prefer upper/full-body when cutting to 1 session)
    if (taperParams) {
      intentSessions = applyTaperLoadScale(intentSessions, taperParams.taperLoadScale, taperParams.strategy);
      intentSessions = filterToTaperFrequency(intentSessions, taperParams.effectiveFrequency);
    }

    // Filter sessions based on frequency and protocol
    let filteredSessions = intentSessions;
    
    // Legacy behavior: upper_aesthetics doesn't handle frequency internally,
    // so we filter out upper body when frequency = 2
    if (protocol.id === 'upper_aesthetics' && frequency === 2) {
      filteredSessions = intentSessions.filter(
        s => s.intent !== 'UPPER_STRENGTH' && s.intent !== 'UPPER_MAINTENANCE'
      );
    }
    
    // Filter out optional sessions when frequency = 2, BUT skip this during taper weeks.
    // taperParams has already selected the right sessions; don't discard them because a
    // protocol labels its taper sessions 'optional'.
    if (frequency === 2 && !taperParams) {
      filteredSessions = filteredSessions.filter(s => s.priority !== 'optional');
    }

    // Apply guardrails (for now, empty - will be implemented later)
    const guardrails: any[] = [];

    // In taper weeks, use the sensitivity-gated frequency for slot assignment so
    // the placement strategy doesn't try to fill more slots than we have sessions.
    const placementFrequency = taperParams
      ? (taperParams.effectiveFrequency as 0 | 1 | 2 | 3)
      : frequency;

    // Assign to days using placement policy (with methodology-aware context if available)
    const placedSessions = simplePlacementPolicy.assignSessions(
      filteredSessions,
      primarySchedule,
      guardrails,
      methodology ? {
        methodology,
        protocol: protocolId,
        strengthFrequency: placementFrequency,
        noDoubles: effectiveNoDoubles,
        injuryHotspots: memoryContext?.injuryHotspots ?? [],
      } : undefined
    );

    // Resolve exercise weights from 1RM memory before converting to Session[]
    const resolvedPlaced = memoryContext
      ? resolveExerciseWeights(placedSessions, memoryContext)
      : placedSessions;

    // Convert PlacedSession[] to Session[]
    const strengthSessions = resolvedPlaced.map(placed => convertToSession(placed, tier));

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Baselines depend on tier
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: tier === 'barbell' 
      // Use the canonical keys stored in user_baselines.performance_numbers.
      // materialize-plan reads these directly (bench/squat/deadlift/overheadPress1RM),
      // and the baseline prompt UI writes overheadPress1RM (not overhead1RM).
      ? ['squat', 'deadlift', 'bench', 'overheadPress1RM']
      : [] // Bodyweight tier doesn't need 1RM baselines
  };

  return modifiedPlan;
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

function convertPhase(phase: Phase): StrengthPhase {
  return {
    name: phase.name,
    start_week: phase.start_week,
    end_week: phase.end_week,
    weeks_in_phase: phase.end_week - phase.start_week + 1,
  };
}

function convertToSession(placed: PlacedSession, tier: StrengthTier): Session {
  return {
    day: placed.day,
    type: 'strength',
    name: placed.name,
    description: placed.description,
    duration: placed.duration,
    strength_exercises: placed.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
      target_rir: ex.target_rir,
      notes: ex.notes,
    })),
    tags: [
      ...placed.tags,
      `tier:${tier}`,
      ...(placed.isOptional ? ['optional'] : []),
    ],
  };
}

/**
 * Normalize schedule to ensure all fields are arrays (never undefined)
 * This avoids ?. logic in placement/guardrails code
 */
function normalizePrimarySchedule(
  schedule: Partial<ProtocolContext['primarySchedule']>
): ProtocolContext['primarySchedule'] {
  return {
    longSessionDays: schedule.longSessionDays ?? [],
    qualitySessionDays: schedule.qualitySessionDays ?? [],
    easySessionDays: schedule.easySessionDays ?? [],
  };
}

function extractPrimarySchedule(plan: TrainingPlan): ProtocolContext['primarySchedule'] {
  // Extract primary sport schedule from plan sessions
  // Normalized across disciplines (running, cycling, triathlon)
  // For now, return default - will be enhanced later to parse actual sessions
  // 
  // Future: For multi-sport plans, this can be extended to return multiple schedules
  // or a scheduleBlocks array with discipline tags
  
  // Always normalize to arrays (never undefined) to avoid ?. logic in placement/guardrails
  return normalizePrimarySchedule({
    longSessionDays: ['Sunday'], // Default assumption - longest/highest volume session(s)
    // Future: Can add highFatigueDays: string[] for days with tempo + long-ish sessions
    qualitySessionDays: ['Tuesday', 'Thursday'], // Default assumption - quality/speed work
    easySessionDays: ['Monday', 'Wednesday', 'Friday', 'Saturday'], // Default assumption - easy/recovery sessions
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentPhase(weekNumber: number, phaseStructure: PhaseStructure): Phase {
  for (const phase of phaseStructure.phases) {
    if (weekNumber >= phase.start_week && weekNumber <= phase.end_week) {
      return phase;
    }
  }
  return phaseStructure.phases[phaseStructure.phases.length - 1];
}

// ============================================================================
// LEGACY SUPPORT - Map old tier names to new
// ============================================================================

export function overlayStrengthLegacy(
  plan: TrainingPlan,
  frequency: 2 | 3,
  phaseStructure: PhaseStructure,
  tier: 'injury_prevention' | 'strength_power' = 'injury_prevention',
  _equipment: 'home_gym' | 'commercial_gym' = 'home_gym',
  protocolId?: string,
  methodology?: 'hal_higdon_complete' | 'jack_daniels_performance',
  noDoubles?: boolean,
  memoryContext?: PlanningMemoryContext,
): TrainingPlan {
  // Map old tier names to new
  const newTier: StrengthTier = tier === 'injury_prevention' ? 'bodyweight' : 'barbell';
  return overlayStrength(plan, frequency, phaseStructure, newTier, protocolId, methodology, noDoubles, memoryContext);
}

// OLD FUNCTIONS REMOVED - Now in protocol system
// The following functions have been moved to:
// - supabase/functions/shared/strength-system/protocols/upper-priority-hybrid.ts
//
// Removed:
// - createMondayLowerBody
// - createWednesdayUpperBody
// - createFridayLowerBody
// - createTaperSessions
// - getTargetRIR
// - applyTargetRIR
//
// These are now handled by the protocol system.
