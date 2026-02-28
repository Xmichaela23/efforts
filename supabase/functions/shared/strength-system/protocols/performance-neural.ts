// ============================================================================
// PERFORMANCE NEURAL PROTOCOL
// 
// Philosophy: True heavy loading for neural adaptation and running economy.
// 
// Grounded in Rønnestad et al. and concurrent training research:
// - Lower body: 85-90% 1RM, 2-3 reps, RIR 1-2 → maximal motor unit recruitment
//   without hypertrophy (volume too low to trigger muscle growth)
// - Upper body: real strength work (72-82% 1RM, RIR 1-2) because it doesn't
//   interfere with running adaptations
// - Speed phase adds post-activation potentiation (heavy lift → box jumps)
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
  description: 'Heavy compound lifts for genuine neural adaptation and running economy. Lower body: true heavy loading (85-90% 1RM) at low volume for maximal motor unit recruitment without hypertrophy. Upper body: real strength work — it doesn\'t interfere with running so there\'s no reason to hold back.',
  tradeoffs: [
    'Not a hypertrophy program — low volume by design',
    'Requires solid lifting technique and access to barbell equipment',
    'Bodyweight tier downgrades to maintenance (neural loading requires heavy external load)',
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
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 3, weight: '80% 1RM' },
        { name: 'Trap Bar Deadlift', sets: 2, reps: 3, weight: '80% 1RM' }
      );
      duration = 25;
      description = 'Recovery Week - Touch heavy weights to maintain neural pathways. 80% should feel controlled and crisp.';
    } else if (phase.name === 'Base') {
      // 85-88% at 3 reps = RIR 2→1 (5-6RM doing 3). Genuine neural range.
      const step = Math.min(3, Math.max(0, wip - 1));
      const load = 85 + step; // 85% → 86% → 87% → 88%
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 3, weight: `${load}% 1RM`, notes: '2-3 min rest between sets. Bar speed should be fast and controlled.' },
        { name: 'Trap Bar Deadlift', sets: 2, reps: 3, weight: `${load}% 1RM`, notes: '2-3 min rest. Reset each rep from the floor.' }
      );
      duration = 35;
      description = `Week ${displayWeek} Base - Heavy neural loading. 3x3 squat + 2x3 trap bar @ ${load}% 1RM, RIR ${load <= 86 ? 2 : 1}. These should feel genuinely heavy but never grinding.`;
    } else if (phase.name === 'Speed') {
      // 87-89% at 2 reps = RIR 1-2 (~3-4RM doing 2). Peak neural stimulus.
      const step = Math.min(2, Math.max(0, wip - 1));
      const load = 87 + step; // 87% → 88% → 89%
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 2, weight: `${load}% 1RM`, notes: '3 min rest. Every rep explosive.' },
        { name: 'Trap Bar Deadlift', sets: 2, reps: 2, weight: `${load}% 1RM` },
        { name: 'Box Jumps', sets: 3, reps: 3, weight: 'Max height', notes: 'Perform within 60-90s of your last squat set to exploit post-activation potentiation. Full recovery (90s) between box jump sets.' }
      );
      duration = 35;
      description = `Week ${displayWeek} Speed - Peak neural work with potentiation. 3x2 squat + 2x2 trap @ ${load}%, then box jumps. RIR 1. Every rep should be explosive.`;
    } else {
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 2, weight: '80% 1RM', notes: 'Maintain neural pathways without accumulating fatigue.' }
      );
      duration = 20;
      description = `Week ${displayWeek} Race Prep - Maintain neural pathways. 2x2 at 80% should feel easy and fast.`;
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
      const step = Math.min(3, Math.max(0, wip - 1));
      const load = 72 + (step * 2); // 72% → 74% → 76% → 78%
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 6, weight: `${load}% 1RM` },
        { name: 'Barbell Rows', sets: 3, reps: 6, weight: `${load}% 1RM` },
        { name: 'Pull-ups', sets: 3, reps: '6-8', weight: 'Add weight when bodyweight is easy' },
        { name: 'Overhead Press', sets: 3, reps: 6, weight: `${Math.max(65, load - 5)}% 1RM` }
      );
      duration = 40;
      description = `Week ${displayWeek} Base - Upper body strength. 3x6 @ ${load}% 1RM, RIR 2. Push these — upper body doesn't interfere with running.`;
      repProfile = 'strength';
    } else if (phase.name === 'Speed') {
      const step = Math.min(2, Math.max(0, wip - 1));
      const load = 78 + (step * 2); // 78% → 80% → 82%
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 5, weight: `${load}% 1RM` },
        { name: 'Barbell Rows', sets: 3, reps: 5, weight: `${load}% 1RM` },
        { name: 'Pull-ups', sets: 3, reps: '4-6', weight: 'Weighted — add load each week' },
        { name: 'Overhead Press', sets: 2, reps: 5, weight: `${Math.max(72, load - 5)}% 1RM` }
      );
      duration = 40;
      description = `Week ${displayWeek} Speed - Upper body peak strength. 3x5 @ ${load}% 1RM, RIR 1. No reason to hold back on upper body.`;
      repProfile = 'strength';
    } else {
      // Race Prep
      exercises.push(
        { name: 'Bench Press', sets: 2, reps: 5, weight: '65% 1RM' },
        { name: 'Barbell Rows', sets: 2, reps: 5, weight: '65% 1RM' },
        { name: 'Pull-ups', sets: 2, reps: '6-8', weight: 'Bodyweight' },
        // Keep OHP qualitative in race prep to avoid fatigue; users choose a very easy load.
        { name: 'Overhead Press', sets: 2, reps: 5, weight: 'Light', notes: 'Activation + posture. Very easy load: move fast, no grind (RPE 4–5 / leave ~5+ reps in the tank).' }
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
  
  const targetRIR = getTargetRIR(phase, isRecovery, false);
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
  isNeural: boolean
): number {
  if (isRecovery) return 3;
  
  if (isNeural) {
    switch (phase.name) {
      case 'Base': return 2;
      case 'Speed': return 1;
      case 'Race Prep': return 3;
      case 'Taper': return 4;
      default: return 2;
    }
  }
  
  // Upper body — doesn't interfere with running, push it
  switch (phase.name) {
    case 'Base': return 2;
    case 'Speed': return 1;
    case 'Race Prep': return 3;
    case 'Taper': return 4;
    default: return 2;
  }
}

function applyTargetRIR(exercises: StrengthExercise[], targetRIR: number): StrengthExercise[] {
  return exercises.map(ex => ({
    ...ex,
    target_rir: targetRIR
  }));
}
