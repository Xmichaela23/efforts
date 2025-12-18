// Strength Overlay System
// 
// Purpose: Add strength sessions to run plans with interference management
// Used when user requests strength frequency (1-3x/week) with non-hybrid approaches

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
    
    // Determine strength frequency for this phase
    const phaseFrequency = getStrengthFrequencyForPhase(phase.name, frequency);
    
    if (phaseFrequency === 0) {
      modifiedSessions[weekStr] = sessions;
      continue;
    }

    // Find available days for strength (not quality run days, not before long run)
    const availableDays = findAvailableStrengthDays(sessions);
    const strengthSessions: Session[] = [];

    // Add upper body on Monday if available
    if (phaseFrequency >= 1 && availableDays.includes('Monday')) {
      strengthSessions.push(createUpperBodySession(week, phase));
    }

    // Add lower body on Thursday or Friday if available
    if (phaseFrequency >= 2) {
      if (availableDays.includes('Thursday')) {
        strengthSessions.push(createLowerBodySession(week, phase, 'Thursday'));
      } else if (availableDays.includes('Friday')) {
        strengthSessions.push(createLowerBodySession(week, phase, 'Friday'));
      }
    }

    // Add full body on Wednesday only in base phase
    if (phaseFrequency >= 3 && phase.name === 'Base' && availableDays.includes('Wednesday')) {
      strengthSessions.push(createFullBodySession(week, phase));
    }

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
 * Determine strength frequency based on phase and user preference
 */
function getStrengthFrequencyForPhase(phaseName: string, requestedFrequency: number): number {
  switch (phaseName) {
    case 'Base':
      // Base phase: Can do full requested frequency
      return requestedFrequency;
    case 'Speed':
      // Speed phase: Reduce by 1 (maintain)
      return Math.max(1, requestedFrequency - 1);
    case 'Race Prep':
      // Race prep: Minimal (0-1)
      return Math.min(1, requestedFrequency);
    case 'Taper':
      // Taper: None or very light
      return 0;
    default:
      return requestedFrequency;
  }
}

/**
 * Find days available for strength training
 * Rules:
 * - NEVER on interval/tempo/VO2 days
 * - NEVER day before long run
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

  // Find day before long run
  const daysBefore: Record<string, string> = {
    'Tuesday': 'Monday',
    'Wednesday': 'Tuesday',
    'Thursday': 'Wednesday',
    'Friday': 'Thursday',
    'Saturday': 'Friday',
    'Sunday': 'Saturday',
    'Monday': 'Sunday'
  };
  
  const daysBeforeLongRun = new Set<string>();
  for (const longDay of longRunDays) {
    const beforeDay = Object.entries(daysBefore).find(([_, before]) => before === longDay)?.[0];
    if (beforeDay) {
      // Actually we want the day BEFORE the long run
      for (const [day, nextDay] of Object.entries(daysBefore)) {
        if (nextDay === longDay.toLowerCase() || nextDay === longDay) {
          daysBeforeLongRun.add(day);
        }
      }
    }
  }
  
  // Simple approach: day before Sunday long run is Saturday
  if (longRunDays.has('Sunday')) {
    daysBeforeLongRun.add('Saturday');
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
      return { percent: 72, sets: 3, reps: 6 };
    case 'Race Prep':
      return { percent: 68, sets: 3, reps: 5 };
    case 'Taper':
      return { percent: 60, sets: 2, reps: 5 };
    default:
      return { percent: 70, sets: 3, reps: 6 };
  }
}

// ============================================================================
// SESSION CREATORS
// ============================================================================

function createUpperBodySession(_week: number, phase: Phase): Session {
  const intensity = getPhaseIntensity(phase.name);
  
  const exercises: StrengthExercise[] = [
    { name: 'Bench Press', sets: intensity.sets, reps: intensity.reps, weight: `${intensity.percent}% 1RM` },
    { name: 'Barbell Row', sets: intensity.sets, reps: intensity.reps + 2, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Overhead Press', sets: intensity.sets - 1, reps: intensity.reps, weight: `${intensity.percent - 5}% 1RM` },
    { name: 'Pull-ups', sets: 3, reps: 'AMRAP', weight: 'Bodyweight' },
    { name: 'Face Pulls', sets: 3, reps: 15, weight: '30% 1RM' }
  ];

  return {
    day: 'Monday',
    type: 'strength',
    name: 'Upper Body Strength',
    description: `Upper body strength session (${phase.name} phase intensity)`,
    duration: 45,
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
    description: `Runner-focused lower body strength (${phase.name} phase intensity)`,
    duration: 45,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body']
  };
}

function createFullBodySession(_week: number, phase: Phase): Session {
  const intensity = getPhaseIntensity(phase.name);
  
  const exercises: StrengthExercise[] = [
    { name: 'Goblet Squat', sets: 3, reps: 10, weight: 'Bodyweight' },
    { name: 'Push-ups', sets: 3, reps: 'AMRAP', weight: 'Bodyweight' },
    { name: 'Romanian Deadlift', sets: 3, reps: 8, weight: `${intensity.percent - 15}% 1RM` },
    { name: 'Inverted Row', sets: 3, reps: 10, weight: 'Bodyweight' },
    { name: 'Plank', sets: 3, reps: '45s', weight: 'Bodyweight' }
  ];

  return {
    day: 'Wednesday',
    type: 'strength',
    name: 'Full Body Strength',
    description: `Balanced full body session (${phase.name} phase - base building)`,
    duration: 40,
    strength_exercises: exercises,
    tags: ['strength', 'full_body']
  };
}
