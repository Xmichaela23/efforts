// ============================================================================
// MINIMUM DOSE PROTOCOL
// 
// Philosophy: Maintain strength with the least time and recovery cost.
// 
// Focus: Keep strength from sliding, minimal time/cost
// - Full body maintenance sessions (one squat, one bench, one row)
// - Low volume, moderate intensity
// - Optional sessions for 3x frequency
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
  StrengthPhase,
} from './types.ts';
import {
  StrengthIntent,
  IntentPriority,
  RepProfile,
} from './intent-taxonomy.ts';

// ============================================================================
// PROTOCOL DEFINITION
// ============================================================================

export const minimumDoseProtocol: StrengthProtocol = {
  id: 'minimum_dose',
  name: 'Minimum Dose',
  description: 'Maintain strength with the least time and recovery cost.',
  tradeoffs: [
    'Progress pauses; the goal is maintenance',
    'Minimal volume (not designed for gains)',
    'Time-efficient but won\'t build strength',
  ],
  createWeekSessions,
};

// ============================================================================
// SESSION GENERATION
// ============================================================================

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, weekIndex, totalWeeks, strengthFrequency } = context;
  const sessions: IntentSession[] = [];
  
  // Determine tier from equipment
  const tier: 'barbell' | 'bodyweight' = 
    context.userBaselines.equipment === 'commercial_gym' 
      ? 'barbell' 
      : 'bodyweight';
  
  const isTaper = phase.name === 'Taper';
  
  if (isTaper) {
    return createTaperSessions(tier, weekIndex, totalWeeks);
  }
  
  // Always include FULLBODY_MAINTENANCE (required)
  sessions.push(createFullBodyMaintenanceSession(phase, weekInPhase, isRecovery, tier));
  
  // If frequency = 2: FULLBODY_MAINTENANCE + UPPER_MAINTENANCE (optional)
  // If frequency = 3: FULLBODY_MAINTENANCE + UPPER_MAINTENANCE (optional) + LOWER_MAINTENANCE (optional)
  if (strengthFrequency === 2) {
    sessions.push(createUpperMaintenanceSession(phase, weekInPhase, isRecovery, tier));
  } else if (strengthFrequency === 3) {
    sessions.push(createUpperMaintenanceSession(phase, weekInPhase, isRecovery, tier));
    sessions.push(createLowerMaintenanceSession(phase, weekInPhase, isRecovery, tier));
  }
  
  return sessions;
}

// ============================================================================
// FULL BODY MAINTENANCE SESSION
// ============================================================================

function createFullBodyMaintenanceSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 8, weight: '60% 1RM' },
        { name: 'Bench Press', sets: 2, reps: 8, weight: '60% 1RM' },
        { name: 'Barbell Rows', sets: 2, reps: 8, weight: '60% 1RM' }
      );
      duration = 25;
      description = 'Recovery Week - Light full body work. One exercise per pattern.';
    } else if (phase.name === 'Base') {
      const load = 65 + (Math.min(4, weekInPhase) * 2); // Progress 65% → 73%
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 8, weight: `${load}% 1RM` },
        { name: 'Bench Press', sets: 3, reps: 8, weight: `${load}% 1RM` },
        { name: 'Barbell Rows', sets: 3, reps: 8, weight: `${load}% 1RM` }
      );
      duration = 30;
      description = `Week ${weekInPhase} Base - Full body maintenance. Target: 3x8 @ ${load}% 1RM. Minimal volume, maintain patterns.`;
    } else if (phase.name === 'Speed') {
      const load = 68 + (Math.min(3, weekInPhase) * 2); // Progress 68% → 74%
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 6, weight: `${load}% 1RM` },
        { name: 'Bench Press', sets: 3, reps: 6, weight: `${load}% 1RM` },
        { name: 'Barbell Rows', sets: 3, reps: 6, weight: `${load}% 1RM` }
      );
      duration = 30;
      description = `Week ${weekInPhase} Speed - Full body maintenance. Target: 3x6 @ ${load}% 1RM. Keep it minimal.`;
    } else {
      // Race Prep
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 6, weight: '60% 1RM' },
        { name: 'Bench Press', sets: 2, reps: 6, weight: '60% 1RM' },
        { name: 'Barbell Rows', sets: 2, reps: 6, weight: '60% 1RM' }
      );
      duration = 25;
      description = `Week ${weekInPhase} Race Prep - Minimal full body work. Just enough to maintain patterns.`;
    }
  } else {
    // Bodyweight tier
    if (isRecovery) {
      exercises.push(
        { name: 'Bodyweight Squats', sets: 2, reps: 12, weight: 'Bodyweight' },
        { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard' }
      );
      duration = 20;
      description = 'Recovery Week - Light full body work. One exercise per pattern.';
    } else if (phase.name === 'Base') {
      exercises.push(
        { name: 'Bodyweight Squats', sets: 3, reps: 15, weight: 'Bodyweight' },
        { name: 'Push-ups', sets: 3, reps: 12, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 3, reps: 12, weight: 'Standard' }
      );
      duration = 25;
      description = `Week ${weekInPhase} Base - Full body maintenance. Minimal volume, maintain patterns.`;
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Bodyweight Squats', sets: 3, reps: 12, weight: 'Bodyweight' },
        { name: 'Push-ups', sets: 3, reps: 10, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 3, reps: 10, weight: 'Standard' }
      );
      duration = 25;
      description = `Week ${weekInPhase} Speed - Full body maintenance. Keep it minimal.`;
    } else {
      exercises.push(
        { name: 'Bodyweight Squats', sets: 2, reps: 10, weight: 'Bodyweight' },
        { name: 'Push-ups', sets: 2, reps: 10, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard' }
      );
      duration = 20;
      description = `Week ${weekInPhase} Race Prep - Minimal full body work. Just enough to maintain patterns.`;
    }
  }
  
  // Apply target RIR
  const targetRIR = getTargetRIR(phase, isRecovery);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'required',
    name: `Full Body: Maintenance${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance',
    tags: ['strength', 'full_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:maintenance'],
  };
}

// ============================================================================
// UPPER MAINTENANCE SESSION (Optional)
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
      { name: 'Face Pulls', sets: 2, reps: 15, weight: 'Light band/cable' }
    );
    duration = 20;
    description = 'Optional upper body maintenance. Light work to maintain patterns.';
  } else {
    exercises.push(
      { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard' },
      { name: 'Inverted Rows', sets: 2, reps: 12, weight: 'Standard' },
      { name: 'Band Face Pulls', sets: 2, reps: 15, weight: 'Light band' }
    );
    duration = 20;
    description = 'Optional upper body maintenance. Light work to maintain patterns.';
  }
  
  const targetRIR = 4; // Easy effort
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
// LOWER MAINTENANCE SESSION (Optional)
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
  
  if (tier === 'barbell') {
    exercises.push(
      { name: 'Hip Thrusts', sets: 2, reps: 10, weight: '50% 1RM' },
      { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
      { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
    );
    duration = 20;
    description = 'Optional lower body maintenance. Light work to maintain patterns.';
  } else {
    exercises.push(
      { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
      { name: 'Walking Lunges', sets: 2, reps: '12/leg', weight: 'Bodyweight' },
      { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
    );
    duration = 20;
    description = 'Optional lower body maintenance. Light work to maintain patterns.';
  }
  
  const targetRIR = 4; // Easy effort
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_MAINTENANCE',
    priority: 'optional',
    name: 'Lower Body: Maintenance (Optional)',
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance',
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:maintenance', 'optional'],
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
  const isRaceWeek = week === totalWeeks;
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
    // Taper week (not race week): Light full body
    const exercises: StrengthExercise[] = tier === 'barbell' 
      ? [
          { name: 'Back Squat', sets: 2, reps: 6, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Bench Press', sets: 2, reps: 8, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Rows', sets: 2, reps: 8, weight: '50% 1RM', target_rir: taperRIR }
        ]
      : [
          { name: 'Bodyweight Squats', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Push-ups', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR }
        ];
        
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'preferred',
      name: 'Taper: Light Full Body',
      description: 'Taper week - Light full body work to maintain patterns. 50-60% effort max. Save energy for race day.',
      duration: 25,
      exercises,
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', `tier:${tier}`],
    });
  }
  
  return sessions;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTargetRIR(
  phase: StrengthPhase,
  isRecovery: boolean
): number {
  if (isRecovery) return 4;
  
  switch (phase.name) {
    case 'Base':
      return 3; // Moderate effort
    case 'Speed':
      return 3; // Moderate effort
    case 'Race Prep':
      return 3;
    case 'Taper':
      return 4; // Easy effort
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
