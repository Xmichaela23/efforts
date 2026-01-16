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
} from '../shared/strength-system/protocols/types.ts';

type StrengthTier = 'bodyweight' | 'barbell';
type StrengthFrequency = 2 | 3;

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
  noDoubles?: boolean
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};
  const totalWeeks = Object.keys(plan.sessions_by_week).length;

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
      },
    };

    // Generate intent sessions (no day assignment)
    const intentSessions = protocol.createWeekSessions(context);

    // Filter sessions based on frequency and protocol
    let filteredSessions = intentSessions;
    
    // Legacy behavior: upper_aesthetics doesn't handle frequency internally,
    // so we filter out upper body when frequency = 2
    if (protocol.id === 'upper_aesthetics' && frequency === 2) {
      filteredSessions = intentSessions.filter(
        s => s.intent !== 'UPPER_STRENGTH' && s.intent !== 'UPPER_MAINTENANCE'
      );
    }
    
    // Filter out optional sessions when frequency = 2
    // (Optional sessions are only included when frequency = 3)
    if (frequency === 2) {
      filteredSessions = filteredSessions.filter(s => s.priority !== 'optional');
    }

    // Apply guardrails (for now, empty - will be implemented later)
    const guardrails: any[] = [];

    // Assign to days using placement policy (with methodology-aware context if available)
    const placedSessions = simplePlacementPolicy.assignSessions(
      filteredSessions,
      primarySchedule,
      guardrails,
      methodology ? {
        methodology,
        protocol: protocolId,
        strengthFrequency: frequency,
        noDoubles: noDoubles || false,
      } : undefined
    );

    // Convert PlacedSession[] to Session[]
    const strengthSessions = placedSessions.map(placed => convertToSession(placed, tier));

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Baselines depend on tier
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: tier === 'barbell' 
      ? ['bench1RM', 'row1RM', 'hipThrust1RM', 'rdl1RM']
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
  noDoubles?: boolean
): TrainingPlan {
  // Map old tier names to new
  const newTier: StrengthTier = tier === 'injury_prevention' ? 'bodyweight' : 'barbell';
  return overlayStrength(plan, frequency, phaseStructure, newTier, protocolId, methodology, noDoubles);
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
