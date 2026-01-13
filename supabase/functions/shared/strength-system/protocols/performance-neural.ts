// ============================================================================
// PERFORMANCE NEURAL PROTOCOL
// 
// Philosophy: Heavy, low-volume lifting to support speed and efficiency without adding fatigue.
// 
// Focus: Running economy / force without fatigue
// - Heavy bilateral compounds (Back Squat, Trap Bar DL) for neural adaptation
// - Upper body strength work (Bench, Rows)
// - Low volume, high intensity
// - If bodyweight tier: downgrade LOWER_NEURAL → LOWER_MAINTENANCE
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
  StrengthPhase,
} from './types.ts';
import {
  RepProfile,
} from './intent-taxonomy.ts';

// ============================================================================
// PROTOCOL DEFINITION
// ============================================================================

export const performanceNeuralProtocol: StrengthProtocol = {
  id: 'neural_speed',
  legacy_ids: ['performance_neural'], // Backwards compatibility
  name: 'Neural Speed',
  description: 'Heavy, low-rep compound lifts to support power and efficiency without interfering with run training.',
  tradeoffs: [
    'Not a hypertrophy or high-volume program',
    'Requires good lifting technique and commercial gym equipment',
    'Bodyweight tier downgrades to maintenance work',
  ],
  createWeekSessions,
};

// ============================================================================
// SESSION GENERATION
// ============================================================================

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, weekIndex, totalWeeks, strengthFrequency, userBaselines } = context;
  const sessions: IntentSession[] = [];
  
  // Determine tier from equipment
  const tier: 'barbell' | 'bodyweight' = 
    userBaselines.equipment === 'commercial_gym' 
      ? 'barbell' 
      : 'bodyweight';
  
  const isTaper = phase.name === 'Taper';
  
  if (isTaper) {
    return createTaperSessions(tier, weekIndex, totalWeeks);
  }
  
  // If bodyweight tier, downgrade LOWER_NEURAL → LOWER_MAINTENANCE
  // (Can't do true neural loading without heavy weights)
  const lowerIntent = tier === 'barbell' ? 'LOWER_NEURAL' : 'LOWER_MAINTENANCE';
  
  // Handle frequency: default to 2 if undefined, treat 1 as 2 (explicit)
  // Guard against NaN from bad upstream parsing
  const freqRaw = strengthFrequency ?? 2;
  const freq = Number.isFinite(freqRaw) ? Math.max(2, freqRaw) : 2;
  
  // If frequency = 2: LOWER_NEURAL (or LOWER_MAINTENANCE if bodyweight) + UPPER_STRENGTH
  // If frequency = 3: LOWER_NEURAL (or LOWER_MAINTENANCE) + UPPER_STRENGTH + UPPER_MAINTENANCE (optional)
  if (freq <= 2) {
    if (lowerIntent === 'LOWER_NEURAL') {
      sessions.push(createLowerNeuralSession(phase, weekInPhase, isRecovery, tier));
    } else {
      sessions.push(createLowerMaintenanceSession(phase, weekInPhase, isRecovery, tier));
    }
    sessions.push(createUpperStrengthSession(phase, weekInPhase, isRecovery, tier, weekIndex, totalWeeks));
  } else {
    // 3x or higher
    if (lowerIntent === 'LOWER_NEURAL') {
      sessions.push(createLowerNeuralSession(phase, weekInPhase, isRecovery, tier));
    } else {
      sessions.push(createLowerMaintenanceSession(phase, weekInPhase, isRecovery, tier));
    }
    sessions.push(createUpperStrengthSession(phase, weekInPhase, isRecovery, tier, weekIndex, totalWeeks));
    sessions.push(createUpperMaintenanceSession(phase, weekInPhase, isRecovery, tier));
  }
  
  return sessions;
}

// ============================================================================
// LOWER NEURAL SESSION (Heavy, low-volume)
// ============================================================================

function createLowerNeuralSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  // Normalize weekInPhase (1-based) to guard against NaN, 0, or negative
  const wip = Number.isFinite(weekInPhase) ? weekInPhase : 1;
  const displayWeek = wip > 0 ? wip : 1;
  
  // Neural work requires barbell - this should only be called for barbell tier
  if (tier === 'barbell') {
    if (isRecovery) {
      // Recovery: reduced volume, maintain intensity for neural stimulus
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 3, weight: '75% 1RM' },
        { name: 'Trap Bar Deadlift', sets: 2, reps: 3, weight: '75% 1RM' }
      );
      duration = 25;
      description = 'Recovery Week - Minimal neural work. Maintain intensity, reduced volume.';
    } else if (phase.name === 'Base') {
      // True micro-dose: 2-3 sets of 2-4 reps @ 80-88%, RIR 3
      // wip is 1-based, so subtract 1 to get progression step (0,1,2,3...)
      const step = Math.min(3, Math.max(0, wip - 1));
      const load = 80 + (step * 2); // Progress 80% → 86% (true neural range)
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 3, weight: `${load}% 1RM` },
        { name: 'Trap Bar Deadlift', sets: 2, reps: 3, weight: `${load}% 1RM` }
      );
      duration = 30;
      description = `Week ${displayWeek} Base - Heavy neural micro-dose. Target: 3x3 squat, 2x3 trap @ ${load}% 1RM. Focus on speed and technique, RIR 3.`;
    } else if (phase.name === 'Speed') {
      // Speed phase: slightly higher intensity, same minimal volume
      const step = Math.min(2, Math.max(0, wip - 1));
      const load = 82 + (step * 2); // Progress 82% → 86%
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 2, weight: `${load}% 1RM` },
        { name: 'Trap Bar Deadlift', sets: 2, reps: 2, weight: `${load}% 1RM` }
      );
      duration = 25;
      description = `Week ${displayWeek} Speed - Heavy neural work. Target: 3x2 squat, 2x2 trap @ ${load}% 1RM. Minimal volume, high intensity, RIR 3.`;
    } else {
      // Race Prep: minimal maintenance
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 2, weight: '70% 1RM' }
      );
      duration = 20;
      description = `Week ${displayWeek} Race Prep - Minimal neural work. Just enough to maintain adaptations.`;
    }
  } else {
    // Should not reach here (bodyweight tier should use LOWER_MAINTENANCE)
    // But include fallback
    exercises.push(
      { name: 'Glute Bridges', sets: 3, reps: 15, weight: 'Bodyweight' },
      { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
    );
    duration = 20;
    description = 'Bodyweight maintenance work (neural loading not possible without heavy weights).';
  }
  
  // Apply target RIR (neural work: RIR 2-3)
  const targetRIR = getTargetRIR(phase, isRecovery, true); // true = neural work
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_NEURAL',
    priority: 'required',
    name: `Lower Body: Neural Loading${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'strength', // Neural work is low rep, high intensity
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:neural'],
  };
}

// ============================================================================
// LOWER MAINTENANCE SESSION (Bodyweight fallback)
// ============================================================================

function createLowerMaintenanceSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  // Normalize weekInPhase (1-based) to guard against NaN, 0, or negative
  const wip = Number.isFinite(weekInPhase) ? weekInPhase : 1;
  const displayWeek = wip > 0 ? wip : 1;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Hip Thrusts', sets: 2, reps: 10, weight: '50% 1RM' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 20;
      description = 'Recovery Week - Light maintenance work.';
    } else {
      exercises.push(
        { name: 'Hip Thrusts', sets: 3, reps: 12, weight: '55% 1RM' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
      );
      duration = 25;
      description = `Week ${displayWeek} - Light lower body maintenance. Bodyweight tier cannot do true neural loading.`;
    }
  } else {
    if (isRecovery) {
      exercises.push(
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
      );
      duration = 20;
      description = 'Recovery Week - Light maintenance work.';
    } else {
      exercises.push(
        { name: 'Glute Bridges', sets: 3, reps: 15, weight: 'Bodyweight' },
        { name: 'Walking Lunges', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
      );
      duration = 25;
      description = `Week ${displayWeek} - Light lower body maintenance. Bodyweight tier cannot do true neural loading.`;
    }
  }
  
  const targetRIR = getTargetRIR(phase, isRecovery, false);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_MAINTENANCE',
    priority: 'required',
    name: `Lower Body: Maintenance${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance',
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:maintenance'],
  };
}

// ============================================================================
// UPPER STRENGTH SESSION
// ============================================================================

function createUpperStrengthSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight',
  absoluteWeek: number,
  totalWeeks: number
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  let repProfile: RepProfile = 'strength';
  
  // Normalize weekInPhase (1-based) to guard against NaN, 0, or negative
  const wip = Number.isFinite(weekInPhase) ? weekInPhase : 1;
  const displayWeek = wip > 0 ? wip : 1;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Bench Press', sets: 2, reps: 6, weight: '70% 1RM' },
        { name: 'Barbell Rows', sets: 2, reps: 6, weight: '70% 1RM' },
        { name: 'Pull-ups', sets: 2, reps: '6-8', weight: 'Bodyweight' },
        { name: 'Overhead Press', sets: 2, reps: 5, weight: '60% 1RM', notes: 'Light - Focus on crisp technique' }
      );
      duration = 25;
      description = 'Recovery Week - Reduced volume. OHP maintained for posture.';
      repProfile = 'maintenance';
    } else if (phase.name === 'Base') {
      // Upper supportive work: moderate intensity, RIR 3 to match neural intent
      const step = Math.min(3, Math.max(0, wip - 1));
      const load = 70 + (step * 2); // Progress 70% → 76% (moderate, not max strength)
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 6, weight: `${load}% 1RM` },
        { name: 'Barbell Rows', sets: 3, reps: 6, weight: `${load}% 1RM` },
        { name: 'Pull-ups', sets: 3, reps: '6-8', weight: 'Add weight if able' },
        { name: 'Overhead Press', sets: 2, reps: 6, weight: `${Math.max(65, load - 5)}% 1RM` }
      );
      duration = 35;
      description = `Week ${displayWeek} Base - Upper body supportive work. Target: 3x6 @ ${load}% 1RM, RIR 3.`;
      repProfile = 'strength';
    } else if (phase.name === 'Speed') {
      // Speed phase: slightly higher intensity but still RIR 3 (not RIR 2)
      const step = Math.min(2, Math.max(0, wip - 1));
      const load = 72 + (step * 2); // Progress 72% → 76%
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 5, weight: `${load}% 1RM` },
        { name: 'Barbell Rows', sets: 3, reps: 5, weight: `${load}% 1RM` },
        { name: 'Pull-ups', sets: 3, reps: '5-6', weight: 'Add weight if able' },
        { name: 'Overhead Press', sets: 2, reps: 5, weight: `${Math.max(67, load - 5)}% 1RM` }
      );
      duration = 35;
      description = `Week ${displayWeek} Speed - Upper body supportive work. Target: 3x5 @ ${load}% 1RM, RIR 3.`;
      repProfile = 'strength';
    } else {
      // Race Prep
      exercises.push(
        { name: 'Bench Press', sets: 2, reps: 5, weight: '65% 1RM' },
        { name: 'Barbell Rows', sets: 2, reps: 5, weight: '65% 1RM' },
        { name: 'Pull-ups', sets: 2, reps: '6-8', weight: 'Bodyweight' },
        { name: 'Overhead Press', sets: 2, reps: 5, weight: 'Light', notes: 'Activation - Mobility focus' }
      );
      duration = 20;
      description = `Week ${displayWeek} Race Prep - Minimal upper body work. Maintain strength, no fatigue. OHP for activation.`;
      repProfile = 'maintenance';
    }
  } else {
    // Bodyweight tier
    if (isRecovery) {
      exercises.push(
        { name: 'Push-ups', sets: 2, reps: 10, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard' },
        { name: 'Pike Push-ups', sets: 2, reps: 8, weight: 'Standard' }
      );
      duration = 20;
      description = 'Recovery Week - Reduced volume.';
      repProfile = 'maintenance';
    } else if (phase.name === 'Base') {
      exercises.push(
        { name: 'Push-ups', sets: 3, reps: 10, weight: 'Progress: Diamond or Decline' },
        { name: 'Inverted Rows', sets: 3, reps: 10, weight: 'Feet elevated when easy' },
        { name: 'Pike Push-ups', sets: 2, reps: 10, weight: 'Elevate feet to progress' },
        { name: 'Pull-ups', sets: 3, reps: '5-8', weight: 'Assisted or negatives OK' }
      );
      duration = 30;
      description = `Week ${displayWeek} Base - Upper body strength with bodyweight progressions.`;
      repProfile = 'strength';
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Push-ups', sets: 3, reps: 8, weight: 'Advanced: Decline or Archer' },
        { name: 'Inverted Rows', sets: 3, reps: 8, weight: 'Feet elevated, slow tempo' },
        { name: 'Pike Push-ups', sets: 2, reps: 8, weight: 'Elevated pike' },
        { name: 'Pull-ups', sets: 3, reps: 'Max reps', weight: 'Aim for progression' }
      );
      duration = 30;
      description = `Week ${displayWeek} Speed - Upper body strength. Focus on progression.`;
      repProfile = 'strength';
    } else {
      exercises.push(
        { name: 'Push-ups', sets: 2, reps: 10, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard' }
      );
      duration = 20;
      description = `Week ${displayWeek} Race Prep - Minimal upper body work.`;
      repProfile = 'maintenance';
    }
  }
  
  // Upper work stays at RIR 3 to match neural low-fatigue intent (not RIR 2)
  const targetRIR = getTargetRIR(phase, isRecovery, false, true); // true = keep at RIR 3
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'UPPER_STRENGTH',
    priority: 'required',
    name: `Upper Body: Strength${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile,
    tags: ['strength', 'upper_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:strength'],
  };
}

// ============================================================================
// UPPER MAINTENANCE SESSION (Optional, for 3x frequency)
// ============================================================================

function createUpperMaintenanceSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  if (tier === 'barbell') {
    exercises.push(
      { name: 'Bench Press', sets: 2, reps: 8, weight: '50% 1RM' },
      { name: 'Barbell Rows', sets: 2, reps: 8, weight: '50% 1RM' },
      { name: 'Cable Face Pulls', sets: 2, reps: 15, weight: 'Light cable' }
    );
    duration = 20;
    description = 'Optional maintenance session. Light work to maintain patterns.';
  } else {
    exercises.push(
      { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard' },
      { name: 'Inverted Rows', sets: 2, reps: 12, weight: 'Standard' },
      { name: 'Band Face Pulls', sets: 2, reps: 15, weight: 'Light band' }
    );
    duration = 20;
    description = 'Optional maintenance session. Light work to maintain patterns.';
  }
  
  const targetRIR = 4; // Easy effort for maintenance
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'UPPER_MAINTENANCE',
    priority: 'optional',
    name: 'Upper Body: Maintenance (Optional)',
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance',
    tags: ['strength', 'upper_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:maintenance', 'optional'],
  };
}

// ============================================================================
// TAPER SESSIONS
// ============================================================================

function createTaperSessions(
  tier: 'barbell' | 'bodyweight',
  week: number,
  totalWeeks: number
): IntentSession[] {
  const sessions: IntentSession[] = [];
  // weekIndex is documented as 1-based, so race week is week === totalWeeks
  // Guard against edge cases where week or totalWeeks might be 0, negative, or NaN
  const w = Number.isFinite(week) && week > 0 ? week : 1;
  const tw = Number.isFinite(totalWeeks) && totalWeeks > 0 ? totalWeeks : 1;
  // Defensive: use >= to catch edge cases where week might be slightly off
  const isRaceWeek = w >= tw;
  const taperRIR = 4;
  
  if (isRaceWeek) {
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'optional',
      name: 'Race Week: Light Movement (Optional)',
      description: 'Race week - Skip entirely or just 10-15 min of light movement. Nothing that will make you sore.',
      duration: 15,
      exercises: [
        { name: 'Bodyweight Squats', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR },
        { name: 'Glute Bridges', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR },
        { name: 'Push-ups', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR }
      ],
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', 'optional', `tier:${tier}`],
    });
  } else {
    // Taper week (not race week): Light full-body maintenance
    // This is effectively full-body (squat + bench + rows), so use FULLBODY_MAINTENANCE intent
    const exercises: StrengthExercise[] = tier === 'barbell' 
      ? [
          { name: 'Back Squat', sets: 2, reps: 3, weight: '60% 1RM', target_rir: taperRIR },
          { name: 'Bench Press', sets: 2, reps: 8, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Barbell Rows', sets: 2, reps: 8, weight: '50% 1RM', target_rir: taperRIR }
        ]
      : [
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Push-ups', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR }
        ];
        
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'optional',
      name: 'Taper: Light Maintenance (Optional)',
      description: 'Taper week - Light work to maintain adaptations. 50-60% effort max. Skip if any fatigue.',
      duration: 25,
      exercises,
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', 'optional', `tier:${tier}`],
    });
  }
  
  return sessions;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTargetRIR(
  phase: StrengthPhase,
  isRecovery: boolean,
  isNeural: boolean,
  keepAtRIR3: boolean = false
): number {
  if (isRecovery) return 4;
  
  if (isNeural) {
    // Neural work: RIR 3 (hard but not to failure, avoids fatigue)
    // RIR 3 supports speed/efficiency without adding fatigue
    return 3;
  }
  
  // If keepAtRIR3 is true (for upper work in neural protocol), always return 3
  if (keepAtRIR3) return 3;
  
  switch (phase.name) {
    case 'Base':
      return 3;
    case 'Speed':
      return 3; // Keep at RIR 3 to match neural low-fatigue intent
    case 'Race Prep':
      return 3;
    case 'Taper':
      return 4;
    default:
      return 3;
  }
}

function applyTargetRIR(exercises: StrengthExercise[], targetRIR: number): StrengthExercise[] {
  return exercises.map(ex => ({
    ...ex,
    target_rir: targetRIR
  }));
}
