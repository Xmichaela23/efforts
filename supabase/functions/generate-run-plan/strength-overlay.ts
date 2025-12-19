// Strength Overlay System
// 
// Purpose: Add strength sessions to run plans with interference management
// Used when user requests strength frequency (1-3x/week) with non-hybrid approaches
//
// SCHEDULE:
// - Base Phase (3x): Mon Full Body, Wed Upper, Fri Lower
// - Speed Phase (2x): Mon Full Body, Thu Lower  
// - Race Prep (1x): Mon Upper ONLY (no legs - peak running load)
// - Taper: No strength
// - Recovery weeks: Reduce by 1 session

import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure } from './types.ts';

// ============================================================================
// STRENGTH OVERLAY FUNCTION
// ============================================================================

/**
 * Overlay strength sessions onto a running plan
 * Follows interference management rules
 */
export function overlayStrength(
  plan: TrainingPlan,
  frequency: 1 | 2 | 3,
  phaseStructure: PhaseStructure
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    const phase = getCurrentPhase(week, phaseStructure);
    const isRecovery = phaseStructure.recovery_weeks.includes(week);
    
    // Get strength sessions for this week
    const strengthSessions = getStrengthSessionsForWeek(
      week,
      phase,
      frequency,
      isRecovery,
      sessions
    );

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Add strength baselines requirement
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: ['squat', 'deadlift', 'bench', 'overheadPress1RM']
  };

  return modifiedPlan;
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Get strength sessions for a specific week based on phase and recovery status
 */
function getStrengthSessionsForWeek(
  week: number,
  phase: Phase,
  requestedFrequency: number,
  isRecovery: boolean,
  runningSessions: Session[]
): Session[] {
  const sessions: Session[] = [];
  
  // Determine base frequency for this phase
  let phaseFrequency = getPhaseFrequency(phase.name, requestedFrequency);
  
  // Recovery weeks: reduce by 1
  if (isRecovery && phaseFrequency > 0) {
    phaseFrequency = Math.max(0, phaseFrequency - 1);
  }
  
  if (phaseFrequency === 0) {
    return sessions;
  }
  
  // Find days that are safe for strength (not before long run, not on hard run days)
  const availableDays = findAvailableStrengthDays(runningSessions);
  
  // Phase-specific strength programming
  switch (phase.name) {
    case 'Base':
      // Base phase: Build strength foundation
      // 3x: Mon Full Body, Wed Upper, Fri Lower
      // 2x: Mon Full Body, Fri Lower
      // 1x: Mon Full Body
      if (phaseFrequency >= 1 && availableDays.includes('Monday')) {
        sessions.push(createFullBodySession(week, phase, 'Monday'));
      }
      if (phaseFrequency >= 2 && availableDays.includes('Friday')) {
        sessions.push(createLowerBodySession(week, phase, 'Friday'));
      } else if (phaseFrequency >= 2 && availableDays.includes('Thursday')) {
        sessions.push(createLowerBodySession(week, phase, 'Thursday'));
      }
      if (phaseFrequency >= 3 && availableDays.includes('Wednesday')) {
        sessions.push(createUpperBodySession(week, phase, 'Wednesday'));
      }
      break;
      
    case 'Speed':
      // Speed phase: Maintain strength with less interference
      // 2x: Mon Full Body, Thu Lower
      // 1x: Mon Full Body
      if (phaseFrequency >= 1 && availableDays.includes('Monday')) {
        sessions.push(createFullBodySession(week, phase, 'Monday'));
      }
      if (phaseFrequency >= 2) {
        if (availableDays.includes('Thursday')) {
          sessions.push(createLowerBodySession(week, phase, 'Thursday'));
        } else if (availableDays.includes('Wednesday')) {
          sessions.push(createLowerBodySession(week, phase, 'Wednesday'));
        }
      }
      break;
      
    case 'Race Prep':
      // Race prep: Upper body ONLY - legs are peak running load
      // No lower body strength to avoid interference with 17-20mi long runs + MP work
      if (phaseFrequency >= 1 && availableDays.includes('Monday')) {
        sessions.push(createUpperBodyMaintenanceSession(week, phase, 'Monday'));
      }
      break;
      
    case 'Taper':
      // Taper: No strength - focus on race freshness
      // Could optionally add very light upper body, but default to none
      break;
  }
  
  return sessions;
}

/**
 * Get base frequency for phase (before recovery adjustment)
 */
function getPhaseFrequency(phaseName: string, requestedFrequency: number): number {
  switch (phaseName) {
    case 'Base':
      // Base phase: Full requested frequency
      return requestedFrequency;
    case 'Speed':
      // Speed phase: Cap at 2x, reduce from 3 to 2
      return Math.min(2, requestedFrequency);
    case 'Race Prep':
      // Race prep: Cap at 1x (upper body only)
      return Math.min(1, requestedFrequency);
    case 'Taper':
      // Taper: None
      return 0;
    default:
      return requestedFrequency;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCurrentPhase(weekNumber: number, phaseStructure: PhaseStructure): Phase {
  for (const phase of phaseStructure.phases) {
    if (weekNumber >= phase.start_week && weekNumber <= phase.end_week) {
      return phase;
    }
  }
  return phaseStructure.phases[phaseStructure.phases.length - 1];
}

/**
 * Find days available for strength training
 * Rules:
 * - NEVER on interval/tempo/VO2 days
 * - NEVER day before long run (Saturday if long run is Sunday)
 * - Prefer easy run days or rest days
 */
function findAvailableStrengthDays(sessions: Session[]): string[] {
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Find days with hard workouts
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

  // Day before long run is off-limits for lower body
  const daysBeforeLongRun = new Set<string>();
  const dayBefore: Record<string, string> = {
    'Sunday': 'Saturday',
    'Saturday': 'Friday',
    'Friday': 'Thursday',
    'Thursday': 'Wednesday',
    'Wednesday': 'Tuesday',
    'Tuesday': 'Monday',
    'Monday': 'Sunday'
  };
  
  for (const longDay of longRunDays) {
    const beforeDay = dayBefore[longDay];
    if (beforeDay) {
      daysBeforeLongRun.add(beforeDay);
    }
  }

  // Filter available days
  return allDays.filter(day => 
    !hardDays.has(day) && 
    !daysBeforeLongRun.has(day) &&
    !longRunDays.has(day)
  );
}

/**
 * Get intensity parameters based on phase
 */
function getPhaseIntensity(phaseName: string): { percent: number; sets: number; reps: number } {
  switch (phaseName) {
    case 'Base':
      return { percent: 75, sets: 4, reps: 6 };
    case 'Speed':
      return { percent: 70, sets: 3, reps: 6 };
    case 'Race Prep':
      return { percent: 65, sets: 3, reps: 8 }; // Lighter, more reps
    case 'Taper':
      return { percent: 60, sets: 2, reps: 8 };
    default:
      return { percent: 70, sets: 3, reps: 6 };
  }
}

// ============================================================================
// SESSION CREATORS
// ============================================================================

function createFullBodySession(_week: number, phase: Phase, day: string): Session {
  const intensity = getPhaseIntensity(phase.name);
  
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
    description: `Compound lifts for running strength (${phase.name} phase)`,
    duration: 45,
    strength_exercises: exercises,
    tags: ['strength', 'full_body']
  };
}

function createUpperBodySession(_week: number, phase: Phase, day: string): Session {
  const intensity = getPhaseIntensity(phase.name);
  
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
    description: `Upper body for posture and arm drive (${phase.name} phase)`,
    duration: 40,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body']
  };
}

function createLowerBodySession(_week: number, phase: Phase, day: string): Session {
  const intensity = getPhaseIntensity(phase.name);
  
  const exercises: StrengthExercise[] = [
    { name: 'Back Squat', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
    { name: 'Romanian Deadlift', sets: intensity.sets - 1, reps: intensity.reps + 2, weight: `${intensity.percent - 10}% 1RM` },
    { name: 'Bulgarian Split Squat', sets: 3, reps: 8, weight: 'Bodyweight' },
    { name: 'Hip Thrusts', sets: 3, reps: 10, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Lower Body Strength',
    description: `Runner-focused lower body (${phase.name} phase)`,
    duration: 45,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body']
  };
}

/**
 * Light upper body session for Race Prep phase
 * NO lower body to avoid interference with peak running
 */
function createUpperBodyMaintenanceSession(_week: number, phase: Phase, day: string): Session {
  const exercises: StrengthExercise[] = [
    { name: 'Push-ups', sets: 3, reps: 15, weight: 'Bodyweight' },
    { name: 'Inverted Row', sets: 3, reps: 12, weight: 'Bodyweight' },
    { name: 'Overhead Press', sets: 3, reps: 10, weight: '60% 1RM' },
    { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Light' },
    { name: 'Plank', sets: 3, reps: '60s', weight: 'Bodyweight' }
  ];

  return {
    day,
    type: 'strength',
    name: 'Upper Body Maintenance',
    description: 'Light upper body to maintain strength during peak running',
    duration: 30,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', 'maintenance']
  };
}
