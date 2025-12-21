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
    { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Bodyweight' }
  ] : phase.name === 'Base' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: 12, weight: weekInPhase >= 3 ? '15-20 lbs per hand' : 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: weekInPhase >= 3 ? '15 lbs per hand' : 'Bodyweight' },
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Dead Bugs', sets: params.sets, reps: '10 each side', weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: 10, weight: '20 lbs per hand' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: '25 lbs per hand' },
    { name: 'Push-ups', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Pallof Press', sets: params.sets, reps: '10 each side', weight: 'Light band' }
  ] : [
    { name: 'Walking Lunges', sets: params.sets, reps: '12 per leg', weight: '15 lbs per hand' },
    { name: 'Glute Bridges', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Bird Dogs', sets: params.sets, reps: '8 each side', weight: 'Bodyweight' }
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
    { name: 'YTW Raises', sets: 2, reps: '10 each position', weight: '5 lbs per hand' },
    { name: 'Face Pulls', sets: 2, reps: 15, weight: 'Light band' }
  ] : phase.name === 'Base' ? [
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Pike Push-ups', sets: params.sets, reps: 8, weight: 'Bodyweight' },
    { name: 'YTW Raises', sets: params.sets, reps: '10 each position', weight: '5 lbs per hand' },
    { name: 'Face Pulls', sets: params.sets, reps: 15, weight: 'Light band' }
  ] : phase.name === 'Speed' ? [
    { name: 'Push-ups', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Pike Push-ups', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Lateral Raises', sets: params.sets, reps: 12, weight: '8-12 lbs per hand' },
    { name: 'Reverse Flyes', sets: params.sets, reps: 12, weight: '5-10 lbs per hand' }
  ] : [
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'YTW Raises', sets: params.sets, reps: '12 each position', weight: '5 lbs per hand' },
    { name: 'Face Pulls', sets: params.sets, reps: 15, weight: 'Light band' }
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
    { name: 'Walking Lunges', sets: 2, reps: '12 per leg', weight: 'Bodyweight' },
    { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: 2, reps: '10 per leg', weight: 'Bodyweight' },
    { name: 'Clamshells', sets: 2, reps: '15 per side', weight: 'Bodyweight or light band' }
  ] : phase.name === 'Base' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: '12 per leg', weight: weekInPhase >= 3 ? '15-20 lbs per hand' : 'Bodyweight' },
    { name: 'Walking Lunges', sets: params.sets, reps: '12 per leg', weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: '10 per leg', weight: 'Bodyweight' },
    { name: 'Hip Thrusts', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: params.sets, reps: '15 per side', weight: 'Bodyweight or light band' },
    { name: 'Calf Raises', sets: params.sets, reps: 20, weight: 'Bodyweight' }
  ] : phase.name === 'Speed' ? [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: '10 per leg', weight: '20 lbs per hand' },
    { name: 'Reverse Lunges', sets: params.sets, reps: '10 per leg', weight: '15 lbs per hand' },
    { name: 'Single Leg RDL', sets: params.sets, reps: '10 per leg', weight: '25 lbs per hand' },
    { name: 'Hip Thrusts', sets: params.sets, reps: 12, weight: 'Bodyweight' },
    { name: 'Clamshells', sets: params.sets, reps: '15 per side', weight: 'Light band' },
    { name: 'Single Leg Calf Raises', sets: params.sets, reps: '15 per leg', weight: 'Bodyweight' }
  ] : [
    { name: 'Walking Lunges', sets: params.sets, reps: '12 per leg', weight: '15 lbs per hand' },
    { name: 'Glute Bridges', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: '10 per leg', weight: 'Bodyweight' },
    { name: 'Clamshells', sets: params.sets, reps: '15 per side', weight: 'Bodyweight or light band' }
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
// TIER 2: STRENGTH & POWER (Marathon-Specific)
// 
// Structure: 2 mandatory lower body sessions + 1 optional upper body
// - Lower Body A (Monday): Posterior Chain & Power (Hip thrusts, RDL, plyos)
// - Lower Body B (Friday): Quad Strength & Stability (Squats, single-leg work)
// - Upper Body (Wednesday): OPTIONAL - only if 3-day selected
//
// Key changes from hybrid programming:
// - No conventional deadlifts (use RDL instead - less CNS fatigue)
// - No heavy overhead pressing (not running-specific)
// - Hip thrusts 2x/week (good for glute strength and horizontal power)
// - Frequent single-leg work for running stability
// ============================================================================

function getLoadForWeek(week: number, phaseName: string, weekInPhase: number, isRecovery: boolean): number {
  if (isRecovery) return 70;
  
  switch (phaseName) {
    case 'Base':
      // Week 1: 70%, Week 2: 72%, Week 3: 74%
      return Math.min(74, 70 + (weekInPhase - 1) * 2);
    case 'Speed':
      // Week 1: 65%, Week 2: 67%, Week 3: 69%
      return Math.min(69, 65 + (weekInPhase - 1) * 2);
    case 'Race Prep':
      return 60;
    case 'Taper':
      return 50;
    default:
      return 70;
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
  const load = getLoadForWeek(week, phase.name, weekInPhase, isRecovery);
  
  // Monday: Lower Body A (Posterior Chain & Power)
  sessions.push(createLowerBodyA(phase, weekInPhase, load, isRecovery, equipment));
  
  // Wednesday: Upper Body Optional (only if 3-day selected)
  if (frequency >= 3) {
    sessions.push(createUpperBodyOptional(phase, weekInPhase, isRecovery, equipment));
  }
  
  // Friday: Lower Body B (Quad Strength & Stability)
  sessions.push(createLowerBodyB(phase, weekInPhase, load, isRecovery, equipment));
  
  return sessions;
}

// ============================================================================
// LOWER BODY A (Monday): Posterior Chain & Power
// Focus: Hip thrusts (heavy), RDL, Bulgarian split squats, plyometrics
// ============================================================================

function createLowerBodyA(phase: Phase, weekInPhase: number, load: number, isRecovery: boolean, equipment: EquipmentType): Session {
  const plyoExercise = equipment === 'commercial_gym'
    ? { name: 'Box Jumps', sets: 3, reps: 5 }
    : { name: 'Bench Jumps', sets: 3, reps: 5 };

  let exercises: StrengthExercise[];
  let duration: number;
  let description: string;

  if (isRecovery) {
    // Recovery weeks (4, 8): Reduced volume, minimal plyos
    exercises = [
      { name: 'Hip Thrusts', sets: 3, reps: 8, weight: '70% 1RM' },
      { name: 'Romanian Deadlift', sets: 3, reps: 8, weight: '70% 1RM' },
      { name: 'Bulgarian Split Squat', sets: 2, reps: 8, weight: '15-20 lbs per hand' },
      { name: plyoExercise.name, sets: 2, reps: 3, weight: 'Bodyweight' }
    ];
    duration = 40;
    description = `Recovery - Reduced volume for adaptation. No heavy plyometrics. Target: 3 sets @ 70% 1RM, RIR 4-5.`;
  } else if (phase.name === 'Base') {
    // Base phase (Weeks 1-3): Build foundation
    exercises = [
      { name: 'Hip Thrusts', sets: 4, reps: 8, weight: `${load}% 1RM` },
      { name: 'Romanian Deadlift', sets: 3, reps: 8, weight: `${load}% 1RM` },
      { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: '20-25 lbs per hand' },
      { name: plyoExercise.name, sets: 3, reps: weekInPhase >= 3 ? 6 : 5, weight: 'Bodyweight' }
    ];
    duration = 45;
    description = `Week ${weekInPhase} Base - Hip thrusts build glute strength for running power. RDL develops hamstring/glute with minimal fatigue. Target: 4 sets @ ${load}% 1RM, RIR 2-3.`;
  } else if (phase.name === 'Speed') {
    // Speed phase (Weeks 5-7): Explosive emphasis
    // Swing weight scales with deadlift 1RM (~20-25% for explosive work)
    const swingPercent = 20 + (weekInPhase * 2); // Week 1: 22%, Week 2: 24%, Week 3: 26%
    const swingExercise = equipment === 'commercial_gym'
      ? { name: 'Kettlebell Swings', sets: 3, reps: 12, weight: `${swingPercent}% deadlift 1RM` }
      : { name: 'Dumbbell Swings', sets: 3, reps: 12, weight: `${swingPercent}% deadlift 1RM` };
    exercises = [
      { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${load}% 1RM` },
      { name: 'Romanian Deadlift', sets: 3, reps: 8, weight: `${load}% 1RM` },
      { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: '25-30 lbs per hand' },
      { name: 'Jump Squats', sets: 3, reps: weekInPhase >= 2 ? 8 : 6, weight: 'Bodyweight' },
      swingExercise
    ];
    duration = 45;
    description = `Week ${weekInPhase} Speed - Explosive emphasis with jump squats and swings. RDL maintains posterior chain. Target: 3 sets @ ${load}% 1RM, RIR 2-3.`;
  } else {
    // Race Prep (Weeks 9-11): Maintenance only
    exercises = [
      { name: 'Hip Thrusts', sets: 2, reps: 12, weight: 'Bodyweight' },
      { name: 'Romanian Deadlift', sets: 2, reps: 10, weight: '60% 1RM' },
      { name: 'Single Leg RDL', sets: 2, reps: '10 per leg', weight: '15-20 lbs per hand' },
      { name: plyoExercise.name, sets: 2, reps: 5, weight: 'Bodyweight' }
    ];
    duration = 35;
    description = `Week ${weekInPhase} Race Prep - Maintenance only during high running volume. Bodyweight hip thrusts for glute activation. Target: 2 sets @ 60% 1RM or Bodyweight, RIR 3-4.`;
  }

  return {
    day: 'Monday',
    type: 'strength',
    name: `Posterior Chain & Power${isRecovery ? ' - Recovery' : ''}`,
    description,
    duration,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', 'strength_power', `phase:${phase.name.toLowerCase()}`, equipment, 'focus:posterior_chain']
  };
}

// ============================================================================
// LOWER BODY B (Friday): Quad Strength & Stability
// Focus: Squats, hip thrusts (lighter), single-leg work, calf raises
// ============================================================================

function createLowerBodyB(phase: Phase, weekInPhase: number, load: number, isRecovery: boolean, equipment: EquipmentType): Session {
  let exercises: StrengthExercise[];
  let duration: number;
  let description: string;

  if (isRecovery) {
    // Recovery weeks (4, 8): Lighter squat variation, reduced volume
    exercises = [
      { name: 'Goblet Squat', sets: 3, reps: 10, weight: '25-35 lbs' },
      { name: 'Hip Thrusts', sets: 2, reps: 10, weight: 'Bodyweight' },
      { name: 'Bulgarian Split Squat', sets: 2, reps: 8, weight: '15-20 lbs per hand' },
      { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
      { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
    ];
    duration = 40;
    description = `Recovery - Reduced volume, no heavy squats. Maintain single-leg patterns. Target: 3 sets @ 60-70% 1RM, RIR 4-5.`;
  } else if (phase.name === 'Base') {
    // Base phase (Weeks 1-3): Build quad strength
    exercises = [
      { name: 'Back Squat', sets: 4, reps: 6, weight: `${load}% 1RM` },
      { name: 'Hip Thrusts', sets: 3, reps: 8, weight: `${Math.max(65, load - 5)}% 1RM` },
      { name: 'Walking Lunges', sets: 3, reps: '10 per leg', weight: '15-25 lbs per hand' },
      { name: 'Single Leg RDL', sets: 3, reps: 8, weight: '15-20 lbs per hand' },
      { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
    ];
    duration = 45;
    description = `Week ${weekInPhase} Base - Back squat builds quad strength. Hip thrusts for glute power. Single-leg work for running stability. Target: 4 sets @ ${load}% 1RM, RIR 2-3.`;
  } else if (phase.name === 'Speed') {
    // Speed phase (Weeks 5-7): Add horizontal power
    exercises = [
      { name: 'Back Squat', sets: 3, reps: 6, weight: `${load}% 1RM` },
      { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${load}% 1RM` },
      { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: '25-30 lbs per hand' },
      { name: 'Broad Jumps', sets: 3, reps: 3, weight: 'Bodyweight' },
      { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
    ];
    duration = 45;
    description = `Week ${weekInPhase} Speed - Reduced squat load to accommodate explosive work. Broad jumps develop horizontal power. Target: 3 sets @ ${load}% 1RM, RIR 2-3.`;
  } else {
    // Race Prep (Weeks 9-11): Single-leg stability maintenance
    exercises = [
      { name: 'Goblet Squat', sets: 2, reps: 10, weight: '25-35 lbs' },
      { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
      { name: 'Bulgarian Split Squat', sets: 2, reps: 10, weight: '15-20 lbs per hand' },
      { name: 'Single Leg RDL', sets: 2, reps: 10, weight: '15-20 lbs per hand' },
      { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
    ];
    duration = 35;
    description = `Week ${weekInPhase} Race Prep - Focus on single-leg stability with minimal fatigue. No heavy barbell work. Target: 2 sets, light loads, RIR 3-4.`;
  }

  return {
    day: 'Friday',
    type: 'strength',
    name: `Quad Strength & Stability${isRecovery ? ' - Recovery' : ''}`,
    description,
    duration,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', 'strength_power', `phase:${phase.name.toLowerCase()}`, equipment, 'focus:quad_stability']
  };
}

// ============================================================================
// UPPER BODY OPTIONAL (Wednesday)
// Only included if user selects 3 days/week
// Minimal running benefit - for balance and aesthetics only
// ============================================================================

function createUpperBodyOptional(phase: Phase, weekInPhase: number, isRecovery: boolean, equipment: EquipmentType): Session {
  const pushExercise = equipment === 'commercial_gym'
    ? { name: 'Dumbbell Bench Press', sets: 3, reps: isRecovery ? 12 : 10, weight: '20-35 lbs per hand' }
    : { name: 'Push-ups', sets: 3, reps: isRecovery ? 12 : 15, weight: 'Bodyweight' };
  
  const rowExercise = equipment === 'commercial_gym'
    ? { name: 'Dumbbell Rows', sets: 3, reps: isRecovery ? 12 : 10, weight: '25-40 lbs per hand' }
    : { name: 'Inverted Rows', sets: 3, reps: isRecovery ? 12 : 10, weight: 'Bodyweight' };

  const exercises: StrengthExercise[] = [
    pushExercise,
    rowExercise,
    { name: 'Face Pulls', sets: 2, reps: 15, weight: 'Light band' }
  ];

  const weekDesc = isRecovery ? 'Recovery' : `Week ${weekInPhase} ${phase.name}`;

  return {
    day: 'Wednesday',
    type: 'strength',
    name: 'Upper Body Maintenance',
    description: `${weekDesc} - Optional upper body for balance and posture. Push-ups, rows, and core maintain arm drive mechanics. Minimal running benefit - skip if fatigued.`,
    duration: 30,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', 'strength_power', `phase:${phase.name.toLowerCase()}`, equipment, 'optional', 'focus:upper_maintenance']
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
      { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight' }
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
