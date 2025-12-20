// Strength Overlay System
// 
// Two Tiers:
// 1. Runner-Specific (Default): Single-leg work, bodyweight + dumbbells, injury prevention
// 2. Strength Development: Heavy compound lifts, barbell training, max strength
//
// SCHEDULE:
// - Base Phase: Full frequency (2-3x/week)
// - Speed Phase: Maintain (2x/week max)
// - Race Prep: Maintain (2x/week)
// - Taper: None
// - Recovery weeks: Reduce by 1 session

import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure } from './types.ts';

type StrengthTier = 'runner_specific' | 'strength_development';

// ============================================================================
// MAIN OVERLAY FUNCTION
// ============================================================================

export function overlayStrength(
  plan: TrainingPlan,
  frequency: 1 | 2 | 3,
  phaseStructure: PhaseStructure,
  tier: StrengthTier = 'runner_specific'
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    const phase = getCurrentPhase(week, phaseStructure);
    const isRecovery = phaseStructure.recovery_weeks.includes(week);
    
    const strengthSessions = tier === 'runner_specific'
      ? getRunnerSpecificSessions(week, phase, frequency, isRecovery, sessions)
      : getStrengthDevelopmentSessions(week, phase, frequency, isRecovery, sessions);

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Baselines depend on tier
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: tier === 'strength_development' 
      ? ['squat1RM', 'deadlift1RM', 'bench1RM']
      : [] // Runner-specific doesn't need 1RM baselines
  };

  return modifiedPlan;
}

// ============================================================================
// RUNNER-SPECIFIC TIER
// ============================================================================

function getRunnerSpecificSessions(
  week: number,
  phase: Phase,
  requestedFrequency: number,
  isRecovery: boolean,
  runningSessions: Session[]
): Session[] {
  const sessions: Session[] = [];
  
  let phaseFrequency = getPhaseFrequency(phase.name, requestedFrequency);
  if (isRecovery && phaseFrequency > 0) {
    phaseFrequency = Math.max(0, phaseFrequency - 1);
  }
  
  if (phaseFrequency === 0) return sessions;
  
  const availableDays = findAvailableStrengthDays(runningSessions);
  const phaseParams = getRunnerSpecificParams(phase.name, isRecovery);
  
  // Session 1: Full Body or Lower Body (Monday preferred)
  if (phaseFrequency >= 1 && availableDays.includes('Monday')) {
    sessions.push(createRunnerFullBody(phase, phaseParams, 'Monday'));
  }
  
  // Session 2: Lower Body (Thursday/Friday preferred)
  if (phaseFrequency >= 2) {
    const day = availableDays.includes('Thursday') ? 'Thursday' 
              : availableDays.includes('Friday') ? 'Friday' 
              : availableDays.includes('Wednesday') ? 'Wednesday' : null;
    if (day) {
      sessions.push(createRunnerLowerBody(phase, phaseParams, day));
    }
  }
  
  // Session 3: Upper Body (Wednesday preferred) - Base phase only
  if (phaseFrequency >= 3 && availableDays.includes('Wednesday')) {
    sessions.push(createRunnerUpperBody(phase, phaseParams, 'Wednesday'));
  }
  
  return sessions;
}

interface RunnerParams {
  sets: number;
  reps: number;
  duration: number;
}

function getRunnerSpecificParams(phaseName: string, isRecovery: boolean): RunnerParams {
  const base: Record<string, RunnerParams> = {
    'Base': { sets: 3, reps: 12, duration: 45 },
    'Speed': { sets: 3, reps: 10, duration: 40 },
    'Race Prep': { sets: 2, reps: 12, duration: 35 },
    'Taper': { sets: 2, reps: 10, duration: 30 }
  };
  
  const params = base[phaseName] || base['Base'];
  
  if (isRecovery) {
    return { sets: 2, reps: params.reps, duration: 30 };
  }
  
  return params;
}

function createRunnerFullBody(phase: Phase, params: RunnerParams, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Bulgarian Split Squat', sets: params.sets, reps: params.reps, weight: 'Bodyweight or light DBs' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: 'Bodyweight or light DBs' },
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: params.reps, weight: 'Bodyweight' },
    { name: 'Dead Bugs', sets: params.sets, reps: 10, weight: 'Bodyweight' },
    { name: 'Plank', sets: params.sets, reps: '45s', weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Full Body Strength',
    description: `Single-leg work and core stability (${phase.name} phase)`,
    duration: params.duration,
    strength_exercises: exercises,
    tags: ['strength', 'full_body', 'runner_specific']
  };
}

function createRunnerLowerBody(phase: Phase, params: RunnerParams, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Walking Lunges', sets: params.sets, reps: params.reps, weight: 'Bodyweight or light DBs' },
    { name: 'Glute Bridges', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Single Leg RDL', sets: params.sets, reps: 10, weight: 'Bodyweight or light DBs' },
    { name: 'Clamshells', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Side Plank', sets: params.sets, reps: '30s', weight: 'Bodyweight' },
    { name: 'Calf Raises', sets: params.sets, reps: 20, weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Lower Body Strength',
    description: `Hip stability and glute activation (${phase.name} phase)`,
    duration: params.duration,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', 'runner_specific']
  };
}

function createRunnerUpperBody(phase: Phase, params: RunnerParams, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Push-ups', sets: params.sets, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Rows', sets: params.sets, reps: params.reps, weight: 'Bodyweight' },
    { name: 'Pike Push-ups', sets: params.sets, reps: 8, weight: 'Bodyweight' },
    { name: 'YTW Raises', sets: params.sets, reps: 10, weight: 'Light DBs or bands' },
    { name: 'Face Pulls', sets: params.sets, reps: 15, weight: 'Band' },
    { name: 'Plank', sets: params.sets, reps: '45s', weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Upper Body Strength',
    description: `Posture and shoulder stability (${phase.name} phase)`,
    duration: params.duration - 5,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', 'runner_specific']
  };
}

// ============================================================================
// STRENGTH DEVELOPMENT TIER (Original approach)
// ============================================================================

function getStrengthDevelopmentSessions(
  week: number,
  phase: Phase,
  requestedFrequency: number,
  isRecovery: boolean,
  runningSessions: Session[]
): Session[] {
  const sessions: Session[] = [];
  
  let phaseFrequency = getPhaseFrequency(phase.name, requestedFrequency);
  if (isRecovery && phaseFrequency > 0) {
    phaseFrequency = Math.max(0, phaseFrequency - 1);
  }
  
  if (phaseFrequency === 0) return sessions;
  
  const availableDays = findAvailableStrengthDays(runningSessions);
  const intensity = getStrengthDevIntensity(phase.name);
  
  // Full Body (Monday)
  if (phaseFrequency >= 1 && availableDays.includes('Monday')) {
    sessions.push(createStrengthDevFullBody(phase, intensity, 'Monday'));
  }
  
  // Lower Body (Thursday/Friday)
  if (phaseFrequency >= 2) {
    const day = availableDays.includes('Thursday') ? 'Thursday' 
              : availableDays.includes('Friday') ? 'Friday' : null;
    if (day) {
      sessions.push(createStrengthDevLowerBody(phase, intensity, day));
    }
  }
  
  // Upper Body (Wednesday) - Base phase only
  if (phaseFrequency >= 3 && availableDays.includes('Wednesday')) {
    sessions.push(createStrengthDevUpperBody(phase, intensity, 'Wednesday'));
  }
  
  return sessions;
}

interface StrengthDevParams {
  percent: number;
  sets: number;
  reps: number;
}

function getStrengthDevIntensity(phaseName: string): StrengthDevParams {
  switch (phaseName) {
    case 'Base': return { percent: 75, sets: 4, reps: 6 };
    case 'Speed': return { percent: 70, sets: 3, reps: 6 };
    case 'Race Prep': return { percent: 65, sets: 3, reps: 8 };
    case 'Taper': return { percent: 60, sets: 2, reps: 8 };
    default: return { percent: 70, sets: 3, reps: 6 };
  }
}

function createStrengthDevFullBody(_phase: Phase, intensity: StrengthDevParams, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Back Squat', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
    { name: 'Bench Press', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
    { name: 'Romanian Deadlift', sets: intensity.sets - 1, reps: intensity.reps + 2, weight: `${intensity.percent - 10}% 1RM` },
    { name: 'Barbell Row', sets: intensity.sets - 1, reps: intensity.reps + 2, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Plank', sets: 3, reps: '45s', weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Full Body Strength',
    description: 'Heavy compound lifts for maximum strength',
    duration: 50,
    strength_exercises: exercises,
    tags: ['strength', 'full_body', 'strength_development']
  };
}

function createStrengthDevUpperBody(_phase: Phase, intensity: StrengthDevParams, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Bench Press', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
    { name: 'Barbell Row', sets: intensity.sets, reps: intensity.reps + 2, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Overhead Press', sets: intensity.sets - 1, reps: intensity.reps, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Pull-ups', sets: 3, reps: 'AMRAP', weight: 'Bodyweight' },
    { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Light' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Upper Body Strength',
    description: 'Upper body for posture and arm drive',
    duration: 45,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', 'strength_development']
  };
}

function createStrengthDevLowerBody(_phase: Phase, intensity: StrengthDevParams, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Back Squat', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
    { name: 'Romanian Deadlift', sets: intensity.sets - 1, reps: intensity.reps + 2, weight: `${intensity.percent - 10}% 1RM` },
    { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: 'Moderate DBs' },
    { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Lower Body Strength',
    description: 'Heavy lower body for running power',
    duration: 50,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', 'strength_development']
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

function getPhaseFrequency(phaseName: string, requestedFrequency: number): number {
  switch (phaseName) {
    case 'Base': return requestedFrequency;
    case 'Speed': return Math.min(2, requestedFrequency);
    case 'Race Prep': return Math.min(2, requestedFrequency);
    case 'Taper': return 0;
    default: return requestedFrequency;
  }
}

function findAvailableStrengthDays(sessions: Session[]): string[] {
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const hardDays = new Set<string>();
  const longRunDays = new Set<string>();
  
  for (const session of sessions) {
    if (session.tags.some(t => ['hard_run', 'intervals', 'tempo', 'threshold', 'vo2max'].includes(t))) {
      hardDays.add(session.day);
    }
    if (session.tags.includes('long_run')) {
      longRunDays.add(session.day);
    }
  }

  const daysBeforeLongRun = new Set<string>();
  const dayBefore: Record<string, string> = {
    'Sunday': 'Saturday', 'Saturday': 'Friday', 'Friday': 'Thursday',
    'Thursday': 'Wednesday', 'Wednesday': 'Tuesday', 'Tuesday': 'Monday', 'Monday': 'Sunday'
  };
  
  for (const longDay of longRunDays) {
    const beforeDay = dayBefore[longDay];
    if (beforeDay) daysBeforeLongRun.add(beforeDay);
  }

  return allDays.filter(day => 
    !hardDays.has(day) && 
    !daysBeforeLongRun.has(day) &&
    !longRunDays.has(day)
  );
}
