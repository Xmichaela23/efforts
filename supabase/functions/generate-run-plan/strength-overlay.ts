// Two-Tier Strength Overlay System
// 
// TIER 1: Injury Prevention
// - Single-leg work, hip stability, bodyweight + light dumbbells
// - Focus: Injury prevention, movement quality, runner-specific weaknesses
// - Equipment: Bodyweight, dumbbells (15-25 lbs), resistance band
//
// TIER 2: Strength & Power
// - Heavy compound lifts, loaded hip thrusts, explosive plyometrics
// - Focus: Maximum strength + power for running performance
// - Equipment: Rack, bench, barbell, dumbbells, bands (home gym OR commercial gym)
//
// SCHEDULE (both tiers):
// - 3x/week: Full Body (Mon), Upper (Wed), Lower (Fri)
// - 2x/week: Full Body (Mon), Lower (Fri)
// - Recovery weeks (4, 8): Reduce volume
// - Taper (week 12+): None or minimal

import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure } from './types.ts';

type StrengthTier = 'injury_prevention' | 'strength_power';
type EquipmentType = 'home_gym' | 'commercial_gym';

// ============================================================================
// MAIN OVERLAY FUNCTION
// ============================================================================

export function overlayStrength(
  plan: TrainingPlan,
  frequency: 2 | 3,
  phaseStructure: PhaseStructure,
  tier: StrengthTier = 'injury_prevention',
  equipment: EquipmentType = 'home_gym'
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};
  const totalWeeks = Object.keys(plan.sessions_by_week).length;

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    const phase = getCurrentPhase(week, phaseStructure);
    const isRecovery = phaseStructure.recovery_weeks.includes(week);
    const isTaper = phase.name === 'Taper';
    
    let strengthSessions: Session[];
    
    if (isTaper) {
      // Minimal taper week strength to maintain neuromuscular patterns
      strengthSessions = tier === 'injury_prevention'
        ? [createTaperSessionTier1()]
        : [createTaperSessionTier2(equipment)];
    } else {
      strengthSessions = tier === 'injury_prevention'
        ? getInjuryPreventionSessions(week, phase, frequency, isRecovery, sessions)
        : getStrengthPowerSessions(week, phase, frequency, isRecovery, sessions, equipment);
    }

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Baselines depend on tier
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: tier === 'strength_power' 
      ? ['squat1RM', 'deadlift1RM', 'bench1RM', 'hipThrust1RM']
      : [] // Injury Prevention doesn't need 1RM baselines
  };

  return modifiedPlan;
}

// ============================================================================
// TIER 1: INJURY PREVENTION
// ============================================================================

interface InjuryPreventionParams {
  sets: number;
  reps: string;
  duration: number;
  equipment: string;
  intensity: string;
}

function getInjuryPreventionParams(phaseName: string, isRecovery: boolean): InjuryPreventionParams {
  if (isRecovery) {
    return { sets: 2, reps: '12-15', duration: 30, equipment: 'Bodyweight only', intensity: 'light (RPE 5/10)' };
  }
  
  switch (phaseName) {
    case 'Base':
      return { sets: 3, reps: '12-15', duration: 45, equipment: 'Bodyweight + light DBs', intensity: 'moderate (RPE 6-7/10)' };
    case 'Speed':
      return { sets: 3, reps: '10-12', duration: 40, equipment: 'Bodyweight + DBs (20-25 lbs)', intensity: 'moderate (RPE 6-7/10)' };
    case 'Race Prep':
      return { sets: 2, reps: '12-15', duration: 35, equipment: 'Bodyweight + light DBs', intensity: 'light (RPE 5-6/10)' };
    default:
      return { sets: 3, reps: '12-15', duration: 45, equipment: 'Bodyweight + light DBs', intensity: 'moderate (RPE 6-7/10)' };
  }
}

function getInjuryPreventionSessions(
  week: number,
  phase: Phase,
  frequency: number,
  isRecovery: boolean,
  runningSessions: Session[]
): Session[] {
  const sessions: Session[] = [];
  const params = getInjuryPreventionParams(phase.name, isRecovery);
  const phaseWeek = week - phase.start_week + 1;
  
  // Session 1: Full Body (Monday)
  sessions.push(createInjuryPreventionFullBody(phase, params, phaseWeek, isRecovery));
  
  // Session 2: Lower Body (Friday) - always included for 2x or 3x
  sessions.push(createInjuryPreventionLowerBody(phase, params, phaseWeek, isRecovery));
  
  // Session 3: Upper Body (Wednesday) - only for 3x frequency
  // Keep upper body in recovery weeks but with reduced volume
  if (frequency >= 3) {
    sessions.push(createInjuryPreventionUpperBody(phase, params, phaseWeek, isRecovery));
  }
  
  return sessions;
}

function createInjuryPreventionFullBody(phase: Phase, params: InjuryPreventionParams, weekInPhase: number, isRecovery: boolean): Session {
  const exercises: StrengthExercise[] = isRecovery ? [
    { name: 'Bulgarian Split Squat', sets: 2, reps: 12, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: 2, reps: 10, weight: 'Bodyweight' },
    { name: 'Push-ups', sets: 2, reps: 12, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Bodyweight' },
    { name: 'Plank', sets: 2, reps: '45s', weight: 'Bodyweight' }
  ] : phase.name === 'Base' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: 12, weight: weekInPhase >= 3 ? '15-20 lbs per hand' : 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: weekInPhase >= 3 ? '15 lbs per hand' : 'Bodyweight' },
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Dead Bugs', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Plank', sets: params.sets, reps: '60s', weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: 10, weight: '20 lbs per hand' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: '25 lbs per hand' },
    { name: 'Push-ups', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Pallof Press', sets: params.sets, reps: 10, weight: 'Resistance Band' },
    { name: 'Side Plank', sets: params.sets, reps: '45s each', weight: 'Bodyweight' }
  ] : [
    { name: 'Walking Lunges', sets: params.sets, reps: 12, weight: '15 lbs per hand' },
    { name: 'Glute Bridges', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Bird Dogs', sets: params.sets, reps: 8, weight: 'Bodyweight' },
    { name: 'Plank', sets: params.sets, reps: '45s', weight: 'Bodyweight' }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;
  
  return {
    day: 'Monday',
    type: 'strength',
    name: 'Full Body Injury Prevention',
    description: `${weekDesc} - ${params.intensity}. Single-leg stability and core strength for injury prevention.`,
    duration: params.duration,
    strength_exercises: exercises,
    tags: ['strength', 'full_body', 'injury_prevention', `phase:${phase.name.toLowerCase()}`]
  };
}

function createInjuryPreventionUpperBody(phase: Phase, params: InjuryPreventionParams, weekInPhase: number, isRecovery: boolean = false): Session {
  // Recovery weeks: reduced sets
  const exercises: StrengthExercise[] = isRecovery ? [
    { name: 'Push-ups', sets: 2, reps: 12, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Bodyweight' },
    { name: 'YTW Raises', sets: 2, reps: 10, weight: '5 lbs' },
    { name: 'Face Pulls', sets: 2, reps: 15, weight: 'Resistance Band' },
    { name: 'Plank', sets: 2, reps: '30s', weight: 'Bodyweight' }
  ] : phase.name === 'Base' ? [
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Pike Push-ups', sets: params.sets, reps: 8, weight: 'Bodyweight' },
    { name: 'YTW Raises', sets: params.sets, reps: 10, weight: '5 lbs' },
    { name: 'Face Pulls', sets: params.sets, reps: 15, weight: 'Resistance Band' },
    { name: 'Plank', sets: params.sets, reps: '45s', weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Push-ups', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Pike Push-ups', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Lateral Raises', sets: params.sets, reps: 12, weight: '10 lbs' },
    { name: 'Reverse Flyes', sets: params.sets, reps: 12, weight: '8 lbs' },
    { name: 'Plank', sets: params.sets, reps: '60s', weight: 'Bodyweight' }
  ] : [
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'YTW Raises', sets: params.sets, reps: 12, weight: '5 lbs' },
    { name: 'Face Pulls', sets: params.sets, reps: 15, weight: 'Resistance Band' },
    { name: 'Plank', sets: params.sets, reps: '45s', weight: 'Bodyweight' }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;
  const intensity = isRecovery ? 'light (RPE 5/10). Reduced volume for recovery.' : params.intensity;

  return {
    day: 'Wednesday',
    type: 'strength',
    name: 'Upper Body Injury Prevention',
    description: `${weekDesc} - ${intensity} Shoulder stability and posture for arm drive.`,
    duration: isRecovery ? 30 : params.duration - 5,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', 'injury_prevention', `phase:${phase.name.toLowerCase()}`]
  };
}

function createInjuryPreventionLowerBody(phase: Phase, params: InjuryPreventionParams, weekInPhase: number, isRecovery: boolean): Session {
  const exercises: StrengthExercise[] = isRecovery ? [
    { name: 'Walking Lunges', sets: 2, reps: 12, weight: 'Bodyweight' },
    { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: 2, reps: 10, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: 2, reps: 15, weight: 'Bodyweight' },
    { name: 'Side Plank', sets: 2, reps: '30s each', weight: 'Bodyweight' }
  ] : phase.name === 'Base' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: 12, weight: weekInPhase >= 3 ? '15-20 lbs per hand' : 'Bodyweight' },
    { name: 'Walking Lunges', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Hip Thrusts', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Calf Raises', sets: params.sets, reps: 20, weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: 10, weight: '20 lbs per hand' },
    { name: 'Reverse Lunges', sets: params.sets, reps: 10, weight: '15 lbs per hand' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: '25 lbs per hand' },
    { name: 'Hip Thrusts', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Single Leg Calf Raises', sets: params.sets, reps: 15, weight: 'Bodyweight' }
  ] : [
    { name: 'Walking Lunges', sets: params.sets, reps: 12, weight: '15 lbs per hand' },
    { name: 'Glute Bridges', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Side Plank', sets: params.sets, reps: '45s each', weight: 'Bodyweight' }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;
  
  return {
    day: 'Friday',
    type: 'strength',
    name: 'Lower Body Injury Prevention',
    description: `${weekDesc} - ${params.intensity}. Hip stability and glute activation for injury prevention.`,
    duration: params.duration,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', 'injury_prevention', `phase:${phase.name.toLowerCase()}`]
  };
}

// ============================================================================
// TIER 2: STRENGTH & POWER
// ============================================================================

interface StrengthPowerParams {
  compoundPercent: number;
  hipThrustPercent: number;
  sets: number;
  reps: number;
  duration: number;
}

function getStrengthPowerParams(phaseName: string, weekInPhase: number, isRecovery: boolean): StrengthPowerParams {
  if (isRecovery) {
    // Recovery weeks: drop intensity
    return { compoundPercent: 70, hipThrustPercent: 70, sets: 3, reps: 6, duration: 40 };
  }
  
  switch (phaseName) {
    case 'Base':
      // Week 1: 70%, Week 2: 72%, Week 3: 75%
      const basePercent = 70 + (weekInPhase - 1) * 2;
      return { compoundPercent: Math.min(75, basePercent), hipThrustPercent: Math.min(75, basePercent), sets: 4, reps: 6, duration: 50 };
    case 'Speed':
      // Week 1: 65%, Week 2: 67%, Week 3: 70%
      const speedPercent = 65 + (weekInPhase - 1) * 2;
      return { compoundPercent: Math.min(70, speedPercent), hipThrustPercent: Math.min(70, speedPercent), sets: 3, reps: 6, duration: 50 };
    case 'Race Prep':
      return { compoundPercent: 65, hipThrustPercent: 60, sets: 2, reps: 8, duration: 35 };
    default:
      return { compoundPercent: 70, hipThrustPercent: 70, sets: 4, reps: 6, duration: 50 };
  }
}

function getStrengthPowerSessions(
  week: number,
  phase: Phase,
  frequency: number,
  isRecovery: boolean,
  runningSessions: Session[],
  equipment: EquipmentType
): Session[] {
  const sessions: Session[] = [];
  const weekInPhase = week - phase.start_week + 1;
  const params = getStrengthPowerParams(phase.name, weekInPhase, isRecovery);
  
  // Session 1: Full Body (Monday)
  sessions.push(createStrengthPowerFullBody(phase, params, weekInPhase, isRecovery, equipment));
  
  // Session 2: Lower Body (Friday)
  sessions.push(createStrengthPowerLowerBody(phase, params, weekInPhase, isRecovery, equipment));
  
  // Session 3: Upper Body (Wednesday) - only for 3x frequency
  // Keep upper body in recovery weeks but with reduced volume (handled by isRecovery param)
  if (frequency >= 3) {
    sessions.push(createStrengthPowerUpperBody(phase, params, weekInPhase, equipment, isRecovery));
  }
  
  return sessions;
}

function createStrengthPowerFullBody(phase: Phase, params: StrengthPowerParams, weekInPhase: number, isRecovery: boolean, equipment: EquipmentType): Session {
  const plyoExercise = equipment === 'commercial_gym' 
    ? { name: 'Box Jumps', sets: 3, reps: 5, weight: 'Bodyweight' }
    : { name: 'Bench Jumps', sets: 3, reps: 5, weight: 'Bodyweight' };
  
  const exercises: StrengthExercise[] = isRecovery ? [
    { name: 'Back Squat', sets: 3, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Hip Thrusts', sets: 3, reps: 8, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Bench Press', sets: 3, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Bulgarian Split Squat', sets: 2, reps: 8, weight: '25 lbs per hand' },
    { name: plyoExercise.name, sets: 2, reps: plyoExercise.reps, weight: plyoExercise.weight }
  ] : phase.name === 'Base' ? [
    { name: 'Back Squat', sets: params.sets, reps: params.reps, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Hip Thrusts', sets: weekInPhase >= 3 ? 4 : 3, reps: 8, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Bench Press', sets: 3, reps: params.reps, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: `${25 + (weekInPhase - 1) * 5} lbs per hand` },
    { ...plyoExercise, reps: weekInPhase >= 3 ? 6 : 5 },
    { name: 'Plank', sets: 3, reps: '60s', weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Back Squat', sets: params.sets, reps: params.reps, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Bench Press', sets: 3, reps: params.reps, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Single Leg Squat to Box', sets: 3, reps: 6, weight: 'Bodyweight' },
    { name: 'Jump Squats', sets: 3, reps: weekInPhase >= 2 ? 8 : 6, weight: 'Bodyweight' },
    { name: 'Plank', sets: 3, reps: '45s', weight: 'Bodyweight' }
  ] : [
    { name: 'Back Squat', sets: params.sets, reps: params.reps, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Hip Thrusts', sets: 2, reps: 12, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Push-ups', sets: 2, reps: 15, weight: 'Bodyweight' },
    { name: 'Bulgarian Split Squat', sets: 2, reps: 10, weight: 'Bodyweight' },
    { name: plyoExercise.name, sets: 2, reps: 5, weight: plyoExercise.weight }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;
  const phaseNote = phase.name === 'Base' 
    ? 'Heavy compounds build foundation. Hip thrusts are CRITICAL for running power.'
    : phase.name === 'Speed' 
    ? 'Explosive emphasis with jump squats. Focus on bar speed.'
    : 'Maintenance during high running volume.';

  return {
    day: 'Monday',
    type: 'strength',
    name: 'Full Body Strength & Power',
    description: `${weekDesc} - ${phaseNote} Target: ${params.sets} sets @ ${params.compoundPercent}% 1RM, RIR 2-3.`,
    duration: params.duration,
    strength_exercises: exercises,
    tags: ['strength', 'full_body', 'strength_power', `phase:${phase.name.toLowerCase()}`, equipment]
  };
}

function createStrengthPowerUpperBody(phase: Phase, params: StrengthPowerParams, weekInPhase: number, equipment: EquipmentType, isRecovery: boolean = false): Session {
  const latExercise = equipment === 'commercial_gym'
    ? { name: 'Lat Pulldown', sets: isRecovery ? 2 : 3, reps: 10, weight: '65% Bodyweight' }
    : { name: 'Inverted Rows', sets: isRecovery ? 2 : 3, reps: 10, weight: 'Bodyweight' };
  
  const facePullWeight = equipment === 'commercial_gym' ? 'Cable' : 'Resistance Band';
  
  // Recovery weeks: reduce sets by ~30%
  const exercises: StrengthExercise[] = isRecovery ? [
    { name: 'Bench Press', sets: 2, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Barbell Row', sets: 2, reps: 8, weight: `${params.compoundPercent - 5}% 1RM` },
    latExercise,
    { name: 'Face Pulls', sets: 2, reps: 15, weight: facePullWeight }
  ] : phase.name === 'Base' ? [
    { name: 'Bench Press', sets: 4, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Barbell Row', sets: 3, reps: 8, weight: `${params.compoundPercent - 5}% 1RM` },
    { name: 'Overhead Press', sets: 3, reps: 6, weight: `${params.compoundPercent - 5}% 1RM` },
    latExercise,
    { name: 'Face Pulls', sets: 3, reps: 15, weight: facePullWeight },
    { name: 'Plank', sets: 3, reps: '60s', weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Bench Press', sets: 3, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Barbell Row', sets: 3, reps: 8, weight: `${params.compoundPercent - 5}% 1RM` },
    { name: 'Push Press', sets: 3, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    latExercise,
    { name: 'Plyometric Push-ups', sets: 3, reps: 6, weight: 'Bodyweight' }
  ] : [
    { name: 'Bench Press', sets: 2, reps: 8, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Barbell Row', sets: 2, reps: 10, weight: `${params.compoundPercent - 5}% 1RM` },
    latExercise,
    { name: 'Face Pulls', sets: 2, reps: 15, weight: facePullWeight }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;
  const phaseNote = isRecovery 
    ? 'Reduced volume for recovery. Maintain movement patterns.'
    : phase.name === 'Speed' 
    ? 'Push press for explosive overhead power. Plyo push-ups for upper body power.'
    : 'Heavy pressing and pulling for running posture.';

  return {
    day: 'Wednesday',
    type: 'strength',
    name: 'Upper Body Strength & Power',
    description: `${weekDesc} - ${phaseNote}`,
    duration: isRecovery ? 35 : 45,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', 'strength_power', `phase:${phase.name.toLowerCase()}`, equipment]
  };
}

function createStrengthPowerLowerBody(phase: Phase, params: StrengthPowerParams, weekInPhase: number, isRecovery: boolean, equipment: EquipmentType): Session {
  const plyoExercise = phase.name === 'Speed'
    ? { name: 'Bounding', sets: 3, reps: '6 per leg', weight: 'Bodyweight' }
    : { name: 'Broad Jumps', sets: 3, reps: 3, weight: 'Bodyweight' };

  const exercises: StrengthExercise[] = isRecovery ? [
    { name: 'Deadlift', sets: 2, reps: 8, weight: `${params.compoundPercent - 5}% 1RM` },
    { name: 'Hip Thrusts', sets: 2, reps: 10, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Bulgarian Split Squat', sets: 2, reps: 10, weight: '20 lbs per hand' },
    { name: 'Broad Jumps', sets: 2, reps: 3, weight: 'Bodyweight' }
  ] : phase.name === 'Base' ? [
    { name: 'Deadlift', sets: 4, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Hip Thrusts', sets: 4, reps: 8, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: '30 lbs per hand' },
    { name: 'Single Leg RDL', sets: 3, reps: 8, weight: '25 lbs per hand' },
    { name: 'Broad Jumps', sets: 3, reps: 3, weight: 'Bodyweight' },
    { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Deadlift', sets: 3, reps: 6, weight: `${params.compoundPercent}% 1RM` },
    { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${params.hipThrustPercent}% 1RM` },
    { name: 'Single Leg Squat to Box', sets: 3, reps: 6, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: 3, reps: 8, weight: '25 lbs per hand' },
    plyoExercise,
    { name: 'Single Leg Calf Raises', sets: 3, reps: 12, weight: 'Bodyweight' }
  ] : [
    { name: 'Romanian Deadlift', sets: 2, reps: 8, weight: `${params.compoundPercent - 5}% 1RM` },
    { name: 'Hip Thrusts', sets: 2, reps: 12, weight: 'Bodyweight' },
    { name: 'Walking Lunges', sets: 2, reps: 12, weight: '20 lbs per hand' },
    { name: 'Single Leg RDL', sets: 2, reps: 10, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: 2, reps: 15, weight: 'Bodyweight' }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;
  const phaseNote = phase.name === 'Base'
    ? 'HEAVY hip thrusts for running power. Deadlifts build posterior chain.'
    : phase.name === 'Speed'
    ? 'Bounding develops horizontal power for stride length. Maintain hip thrust volume.'
    : 'Switch to RDL (less fatiguing), bodyweight hip thrusts for glute activation.';

  return {
    day: 'Friday',
    type: 'strength',
    name: 'Lower Body Strength & Power',
    description: `${weekDesc} - ${phaseNote}`,
    duration: params.duration,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', 'strength_power', `phase:${phase.name.toLowerCase()}`, equipment]
  };
}

// ============================================================================
// TAPER WEEK SESSIONS
// ============================================================================

function createTaperSessionTier1(): Session {
  return {
    day: 'Monday',
    type: 'strength',
    name: 'Full Body Injury Prevention - Taper',
    description: 'Taper Week - Minimal volume to maintain neuromuscular patterns. Very light (RPE 4-5/10). Just keep movement patterns active before race.',
    duration: 25,
    strength_exercises: [
      { name: 'Bodyweight Squats', sets: 2, reps: 10, weight: 'Bodyweight' },
      { name: 'Push-ups', sets: 2, reps: 10, weight: 'Bodyweight' },
      { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight' },
      { name: 'Plank', sets: 2, reps: '30s', weight: 'Bodyweight' }
    ],
    tags: ['strength', 'full_body', 'injury_prevention', 'phase:taper']
  };
}

function createTaperSessionTier2(equipment: EquipmentType): Session {
  const jumpExercise = equipment === 'commercial_gym'
    ? { name: 'Box Jumps', sets: 2, reps: 3, weight: 'Bodyweight' }
    : { name: 'Bench Jumps', sets: 2, reps: 3, weight: 'Bodyweight' };

  return {
    day: 'Monday',
    type: 'strength',
    name: 'Full Body Strength & Power - Taper',
    description: 'Taper Week - Absolute minimum to maintain patterns. 2x5 @ 50% 1RM. Keep movements sharp but fresh for race week.',
    duration: 25,
    strength_exercises: [
      { name: 'Back Squat', sets: 2, reps: 5, weight: '50% 1RM' },
      { name: 'Hip Thrusts', sets: 2, reps: 10, weight: 'Bodyweight' },
      { name: 'Push-ups', sets: 2, reps: 10, weight: 'Bodyweight' },
      jumpExercise
    ],
    tags: ['strength', 'full_body', 'strength_power', 'phase:taper', equipment]
  };
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

function getCurrentPhase(weekNumber: number, phaseStructure: PhaseStructure): Phase {
  for (const phase of phaseStructure.phases) {
    if (weekNumber >= phase.start_week && weekNumber <= phase.end_week) {
      return phase;
    }
  }
  return phaseStructure.phases[phaseStructure.phases.length - 1];
}
