// ============================================================================
// FOUNDATION DURABILITY PROTOCOL
// 
// Philosophy: Build resilient hips, knees, and ankles so you can keep training consistently.
// 
// Focus: Durability, not strength PRs
// - Joint-friendly, low-soreness patterns
// - Step-ups preferred over split squats
// - RPE/RIR-based loading for unilateral work
// - Consistent posture work across phases
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
  StrengthPhase,
} from './types.ts';

type LowerVariant = 'A' | 'B';

// ============================================================================
// PROTOCOL DEFINITION
// ============================================================================

export const foundationDurabilityProtocol: StrengthProtocol = {
  id: 'durability',
  legacy_ids: ['foundation_durability'], // Backwards compatibility
  name: 'Durability',
  description: 'Classic runner-strength exercises to build muscular support so you can handle training volume more reliably.',
  tradeoffs: [
    'No heavy compounds or strength PRs',
    'Progress is subtle and structural, not dramatic',
    'Designed for consistency, not performance-oriented lifting',
  ],
  createWeekSessions,
};

// ============================================================================
// SESSION GENERATION
// ============================================================================

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, weekIndex, totalWeeks, strengthFrequency } = context;
  const sessions: IntentSession[] = [];
  
  // Determine tier from equipment (commercial_gym = DBs/cables, home_gym = bodyweight/bands)
  const tier: 'commercial_gym' | 'home_gym' = 
    context.userBaselines.equipment === 'commercial_gym' 
      ? 'commercial_gym' 
      : 'home_gym';
  
  const isTaper = phase.name === 'Taper';
  
  if (isTaper) {
    return createTaperSessions(tier, weekIndex, totalWeeks);
  }
  
  // Handle frequency: default to 2 if undefined, treat 1 as 2 (explicit)
  const freqRaw = strengthFrequency ?? 2;
  const freq = Math.max(2, freqRaw);
  
  // 2x: Lower A + Upper Posture
  // 3x: Lower A + Upper Posture + Lower B (Upper in middle to give legs a break)
  if (freq <= 2) {
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, { variant: 'A' }));
    sessions.push(createUpperPostureSession(phase, weekInPhase, isRecovery, tier));
  } else {
    // 3x or higher
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, { variant: 'A' }));
    sessions.push(createUpperPostureSession(phase, weekInPhase, isRecovery, tier));
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, { variant: 'B' }));
  }
  
  return sessions;
}

// ============================================================================
// LOWER DURABILITY SESSION
// Variant A: Knee-dominant + calves + lateral hip
// Variant B: Hinge-dominant + hip + foot/ankle
// ============================================================================

function createLowerDurabilitySession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'commercial_gym' | 'home_gym',
  opts?: { variant: LowerVariant }
): IntentSession {
  const variant = opts?.variant ?? 'A';
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  if (variant === 'A') {
    // Variant A: Knee-dominant + calves + lateral hip
    if (tier === 'commercial_gym') {
      if (isRecovery) {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (light-moderate)' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'DBs (light-moderate)' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Soleus Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 30;
        description = 'Recovery Week - Light knee-dominant work. Maintain movement patterns, no fatigue.';
      } else if (phase.name === 'Base') {
        exercises.push(
          { name: 'Step-ups', sets: 3, reps: '12/leg', weight: 'DBs (moderate)' },
          { name: 'Lateral Lunges', sets: 3, reps: '12/leg', weight: 'DBs (moderate)' },
          { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight → single leg when easy' },
          { name: 'Soleus Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' },
          { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band' }
        );
        duration = 40;
        description = `Week ${weekInPhase} Base - Building knee stability and calf strength. Focus on control and balance.`;
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (moderate)' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'DBs (moderate)' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Moderate band' }
        );
        duration = 30;
        description = `Week ${weekInPhase} Speed - Maintain knee stability patterns. Running volume is high - keep this work controlled. Reduced volume to preserve quality.`;
      } else {
        // Race Prep
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (light)' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 25;
        description = `Week ${weekInPhase} Race Prep - Minimal knee-dominant work. Stay loose, no fatigue.`;
      }
    } else {
      // Home gym tier - Variant A
      if (isRecovery) {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '12/leg', weight: 'Bodyweight' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 25;
        description = 'Recovery Week - Light knee-dominant work. Maintain movement patterns.';
      } else if (phase.name === 'Base') {
        exercises.push(
          { name: 'Step-ups', sets: 3, reps: '15/leg', weight: 'Bodyweight → add light DBs when easy' },
          { name: 'Lateral Lunges', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
          { name: 'Calf Raises', sets: 3, reps: 20, weight: 'Bodyweight → single leg when easy' },
          { name: 'Soleus Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' },
          { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band' }
        );
        duration = 35;
        description = `Week ${weekInPhase} Base - Build knee stability with bodyweight. Progress step-ups by adding light dumbbells when 3x15 is easy.`;
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '12/leg', weight: 'Bodyweight' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 25;
        description = `Week ${weekInPhase} Speed - Maintain knee stability patterns. Controlled movement, no fatigue. Reduced volume to preserve quality.`;
      } else {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 20;
        description = `Week ${weekInPhase} Race Prep - Light knee work only. Stay loose.`;
      }
    }
  } else {
    // Variant B: Hinge-dominant + hip + foot/ankle
    if (tier === 'commercial_gym') {
      if (isRecovery) {
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 2, reps: '10/leg', weight: 'DB (light-moderate)' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Copenhagen Plank (Short Lever)', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 30;
        description = 'Recovery Week - Light hinge and hip work. Maintain movement patterns, no fatigue.';
      } else if (phase.name === 'Base') {
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 3, reps: '12/leg', weight: 'DB (moderate)' },
          { name: 'Glute Bridges', sets: 2, reps: '12-15', weight: 'Bodyweight → single leg when easy' },
          { name: 'Copenhagen Plank (Short Lever)', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Side Plank Abduction', sets: 2, reps: '12/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Bodyweight' },
          { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
        );
        duration = 40;
        description = `Week ${weekInPhase} Base - Building hip stability and foot/ankle strength. Focus on control and balance.`;
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 3, reps: '10/leg', weight: 'DB (moderate)' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Copenhagen Plank (Short Lever)', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 35;
        description = `Week ${weekInPhase} Speed - Maintain hip stability patterns. Running volume is high - keep this work controlled.`;
      } else {
        // Race Prep
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 2, reps: '10/leg', weight: 'DB (light)' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 25;
        description = `Week ${weekInPhase} Race Prep - Minimal hinge work. Stay loose, no fatigue.`;
      }
    } else {
      // Home gym tier - Variant B
      if (isRecovery) {
        exercises.push(
          { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 25;
        description = 'Recovery Week - Light hinge and hip work. Maintain movement patterns.';
      } else if (phase.name === 'Base') {
        exercises.push(
          { name: 'Single Leg RDL', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
          { name: 'Glute Bridges', sets: 3, reps: 15, weight: 'Bodyweight → single leg when easy' },
          { name: 'Side Plank Abduction', sets: 2, reps: '12/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Bodyweight' },
          { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
        );
        duration = 35;
        description = `Week ${weekInPhase} Base - Build hip stability and foot/ankle strength with bodyweight.`;
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Single Leg RDL', sets: 3, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 30;
        description = `Week ${weekInPhase} Speed - Maintain hip stability patterns. Controlled movement, no fatigue.`;
      } else {
        exercises.push(
          { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 20;
        description = `Week ${weekInPhase} Race Prep - Light hinge work only. Stay loose.`;
      }
    }
  }
  
  // Core work for all lower durability sessions
  exercises.push({
    name: 'Core Circuit',
    sets: 1,
    reps: '5 min',
    weight: 'Side planks, dead bugs, bird dogs'
  });
  
  // Apply target RIR
  const targetRIR = getTargetRIR(phase, isRecovery);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: `Lower Body: Durability${variant === 'A' ? ' (Knee Focus)' : ' (Hinge Focus)'}${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance', // Durability work is maintenance-focused, not growth
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:durability', `variant:${variant}`],
  };
}

// ============================================================================
// UPPER POSTURE SESSION
// Simple, consistent, low fatigue, high compliance
// ============================================================================

function createUpperPostureSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'commercial_gym' | 'home_gym'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  if (tier === 'commercial_gym') {
    // Commercial gym: same movements every week, only volume changes slightly
    const sets = isRecovery ? 2 : phase.name === 'Base' ? 4 : 3;
    
    exercises.push(
      { name: 'Cable Face Pulls', sets, reps: 15, weight: 'Moderate cable' },
      { name: 'Band Pull-Aparts', sets, reps: 15, weight: 'Moderate band' },
      { name: 'Cable Rows', sets: phase.name === 'Race Prep' ? 2 : 3, reps: 12, weight: 'Moderate, controlled' },
      { name: 'Prone Y/T/W Raises', sets: 2, reps: 12, weight: 'Light DBs (5-10 lb)' },
      { name: 'Dead Hang', sets: 2, reps: '30-45s', weight: 'Bodyweight (optional)' }
    );
    
    duration = isRecovery ? 25 : 30;
    description = isRecovery 
      ? 'Recovery Week - Light posture work. Maintain upper back strength.'
      : `Week ${weekInPhase} ${phase.name} - Upper back and posture work. Repeatable, low fatigue.`;
  } else {
    // Home gym: same movements every week
    const sets = isRecovery ? 2 : phase.name === 'Base' ? 4 : 3;
    
    exercises.push(
      { name: 'Band Face Pulls', sets, reps: 15, weight: 'Moderate band' },
      { name: 'Band Pull-Aparts', sets, reps: 15, weight: 'Moderate band' },
      { name: 'Inverted Rows', sets: phase.name === 'Race Prep' ? 2 : 3, reps: 12, weight: 'Feet elevated when easy' },
      { name: 'Wall Angels', sets: 2, reps: 12, weight: 'Bodyweight' },
      { name: 'Dead Hang', sets: 2, reps: '30-45s', weight: 'Bodyweight (optional, if bar exists)' }
    );
    
    duration = isRecovery ? 25 : 30;
    description = isRecovery
      ? 'Recovery Week - Light posture work. Maintain upper back strength.'
      : `Week ${weekInPhase} ${phase.name} - Upper back and posture work. Repeatable, low fatigue.`;
  }
  
  // Apply target RIR
  const targetRIR = getTargetRIR(phase, isRecovery);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: `Upper Body: Posture${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance', // Posture work is maintenance-focused, not growth
    tags: ['strength', 'upper_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:posture'],
  };
}

// ============================================================================
// TAPER SESSIONS
// LOWER_MAINTENANCE + UPPER_POSTURE (preferred) for taper week
// Optional light movement for race week
// ============================================================================

function createTaperSessions(
  tier: 'commercial_gym' | 'home_gym',
  week: number,
  totalWeeks: number
): IntentSession[] {
  const sessions: IntentSession[] = [];
  // week is 1-based (Week 1, Week 2, ..., Week N), so race week is when week === totalWeeks
  const isRaceWeek = week === totalWeeks;
  const taperRIR = 4;
  
  if (isRaceWeek) {
    // Race week: optional 10-15 min posture + glute bridge + calves
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'optional',
      name: 'Race Week: Light Movement (Optional)',
      description: 'Race week - Skip entirely or just 10-15 min of light movement. Nothing that will make you sore.',
      duration: 15,
      exercises: [
        { name: tier === 'commercial_gym' ? 'Cable Face Pulls' : 'Band Face Pulls', sets: 2, reps: 15, weight: tier === 'commercial_gym' ? 'Light cable' : 'Light band', target_rir: taperRIR },
        { name: 'Glute Bridges', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR },
        { name: 'Calf Raises', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR }
      ],
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', 'optional', `tier:${tier}`],
    });
  } else {
    // Taper week (not race week): LOWER_MAINTENANCE + UPPER_POSTURE
    const lowerExercises: StrengthExercise[] = tier === 'commercial_gym' 
      ? [
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (light)', target_rir: taperRIR },
          { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight', target_rir: taperRIR }
        ]
      : [
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight', target_rir: taperRIR }
        ];
    
    sessions.push({
      intent: 'LOWER_MAINTENANCE',
      priority: 'preferred',
      name: 'Taper: Lower Maintenance',
      description: 'Taper week - Light lower body work to maintain patterns. 50-60% effort max. Save energy for race day.',
      duration: 25,
      exercises: lowerExercises,
      repProfile: 'maintenance',
      tags: ['strength', 'lower_body', 'phase:taper', `tier:${tier}`],
    });
    
    const upperExercises: StrengthExercise[] = tier === 'commercial_gym'
      ? [
          { name: 'Cable Face Pulls', sets: 2, reps: 15, weight: 'Light cable', target_rir: taperRIR },
          { name: 'Band Pull-Aparts', sets: 2, reps: 15, weight: 'Light band', target_rir: taperRIR }
        ]
      : [
          { name: 'Band Face Pulls', sets: 2, reps: 15, weight: 'Light band', target_rir: taperRIR },
          { name: 'Band Pull-Aparts', sets: 2, reps: 15, weight: 'Light band', target_rir: taperRIR }
        ];
    
    sessions.push({
      intent: 'UPPER_POSTURE',
      priority: 'preferred',
      name: 'Taper: Upper Posture',
      description: 'Taper week - Light posture work to maintain patterns. 50-60% effort max.',
      duration: 20,
      exercises: upperExercises,
      repProfile: 'maintenance',
      tags: ['strength', 'upper_body', 'phase:taper', `tier:${tier}`],
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
  // Durability should never go hard - hard-cap at RIR 3-4
  if (isRecovery) return 4;
  
  switch (phase.name) {
    case 'Base':
      return 3; // RIR 3-4 (moderate effort)
    case 'Speed':
      return 3; // RIR 3-4 (never harder, even in speed phase)
    case 'Race Prep':
      return 4; // RIR 4 (easy effort)
    case 'Taper':
      return 4; // RIR 4-5 (very easy)
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
