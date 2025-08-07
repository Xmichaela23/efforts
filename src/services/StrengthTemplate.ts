// StrengthTemplate.ts
// Scientifically sound strength training templates with detailed workouts
// No fallbacks, no complexity - just clean, reliable strength plans

export interface SessionTemplate {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'compound' | 'traditional' | 'cowboy_endurance' | 'cowboy_compound' | 'cowboy_endurance_upper' | 'cowboy_compound_upper';
  detailedWorkout?: string; // Detailed workout prescription
}

export interface UserBaselines {
  ftp?: number;
  fiveK?: string;
  easyPace?: string;
  swimPace100?: string;
  squat?: number;
  deadlift?: number;
  bench?: number;
  overheadPress1RM?: number;
  age?: number;
}

// Main strength template function
export function getStrengthTemplate(strengthType: string, trainingFrequency: number, longBikeDay?: string, longRunDay?: string): SessionTemplate[] {
  // Generate strength sessions based on type and frequency, intelligently distributed
  const sessions: SessionTemplate[] = [];
  
  // Define available days (excluding long session days)
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const longSessionDays = [longBikeDay, longRunDay].filter(day => day);
  const availableDays = allDays.filter(day => !longSessionDays.includes(day));
  
  switch (strengthType) {
    case 'traditional':
      // 2 sessions per week - distribute intelligently
      const traditionalDays = distributeSessions(availableDays, 2, longSessionDays);
      traditionalDays.forEach(day => {
        sessions.push({
          day,
          discipline: 'strength',
          type: 'endurance',
          duration: 45,
          intensity: 'Zone 2',
          description: 'Traditional strength training',
          zones: [2],
          strengthType: 'traditional'
        });
      });
      break;
      
    case 'compound':
      // 2 sessions per week - distribute intelligently
      const compoundDays = distributeSessions(availableDays, 2, longSessionDays);
      compoundDays.forEach(day => {
        sessions.push({
          day,
          discipline: 'strength',
          type: 'endurance',
          duration: 60,
          intensity: 'Zone 2',
          description: 'Compound strength training',
          zones: [2],
          strengthType: 'compound'
        });
      });
      break;
      
    case 'cowboy_endurance':
      // 3 sessions per week - 2 functional + 1 upper body focus
      const cowboyEnduranceDays = distributeSessions(availableDays, 2, longSessionDays);
      const upperBodyDay = findUpperBodyDay(availableDays, longSessionDays);
      
      // Add functional sessions
      cowboyEnduranceDays.forEach(day => {
        sessions.push({
          day,
          discipline: 'strength',
          type: 'endurance',
          duration: 45,
          intensity: 'Zone 2',
          description: 'Cowboy endurance strength',
          zones: [2],
          strengthType: 'cowboy_endurance'
        });
      });
      
      // Add upper body focus session (ensure it's not the same as functional days)
      if (upperBodyDay && !cowboyEnduranceDays.includes(upperBodyDay)) {
        sessions.push({
          day: upperBodyDay,
          discipline: 'strength',
          type: 'endurance',
          duration: 45,
          intensity: 'Zone 2',
          description: 'Cowboy upper body focus',
          zones: [2],
          strengthType: 'cowboy_endurance_upper'
        });
      } else if (upperBodyDay && cowboyEnduranceDays.includes(upperBodyDay)) {
        // If upper body day conflicts with functional day, find a different day
        const remainingDays = availableDays.filter(day => !cowboyEnduranceDays.includes(day) && !longSessionDays.includes(day));
        if (remainingDays.length > 0) {
          sessions.push({
            day: remainingDays[0],
            discipline: 'strength',
            type: 'endurance',
            duration: 45,
            intensity: 'Zone 2',
            description: 'Cowboy upper body focus',
            zones: [2],
            strengthType: 'cowboy_endurance_upper'
          });
        }
      }
      break;
      
    case 'cowboy_compound':
      // 3 sessions per week - 2 compound + 1 upper body focus, properly spaced
      const cowboyCompoundDays = distributeSessions(availableDays, 2, longSessionDays);
      const upperBodyDayCompound = findUpperBodyDay(availableDays, longSessionDays);
      
      // Add compound sessions
      cowboyCompoundDays.forEach(day => {
        sessions.push({
          day,
          discipline: 'strength',
          type: 'endurance',
          duration: 60,
          intensity: 'Zone 2',
          description: 'Cowboy compound strength',
          zones: [2],
          strengthType: 'cowboy_compound'
        });
      });
      
      // Add upper body focus session (ensure it's not adjacent to compound days)
      if (upperBodyDayCompound && !cowboyCompoundDays.includes(upperBodyDayCompound)) {
        // Check if upper body day is adjacent to any compound day
        const compoundDayIndices = cowboyCompoundDays.map(day => allDays.indexOf(day));
        const upperBodyDayIndex = allDays.indexOf(upperBodyDayCompound);
        const isAdjacent = compoundDayIndices.some(index => Math.abs(index - upperBodyDayIndex) <= 1);
        
        if (!isAdjacent) {
          sessions.push({
            day: upperBodyDayCompound,
            discipline: 'strength',
            type: 'endurance',
            duration: 60,
            intensity: 'Zone 2',
            description: 'Cowboy compound upper body',
            zones: [2],
            strengthType: 'cowboy_compound_upper'
          });
        } else {
          // Find a day that's not adjacent to compound days
          const nonAdjacentDays = availableDays.filter(day => {
            const dayIndex = allDays.indexOf(day);
            return !cowboyCompoundDays.includes(day) && 
                   !compoundDayIndices.some(index => Math.abs(index - dayIndex) <= 1);
          });
          
          if (nonAdjacentDays.length > 0) {
            sessions.push({
              day: nonAdjacentDays[0],
              discipline: 'strength',
              type: 'endurance',
              duration: 60,
              intensity: 'Zone 2',
              description: 'Cowboy compound upper body',
              zones: [2],
              strengthType: 'cowboy_compound_upper'
            });
          }
        }
      } else if (upperBodyDayCompound && cowboyCompoundDays.includes(upperBodyDayCompound)) {
        // If upper body day conflicts with compound day, find a non-adjacent day
        const compoundDayIndices = cowboyCompoundDays.map(day => allDays.indexOf(day));
        const nonAdjacentDays = availableDays.filter(day => {
          const dayIndex = allDays.indexOf(day);
          return !cowboyCompoundDays.includes(day) && 
                 !compoundDayIndices.some(index => Math.abs(index - dayIndex) <= 1);
        });
        
        if (nonAdjacentDays.length > 0) {
          sessions.push({
            day: nonAdjacentDays[0],
            discipline: 'strength',
            type: 'endurance',
            duration: 60,
            intensity: 'Zone 2',
            description: 'Cowboy compound upper body',
            zones: [2],
            strengthType: 'cowboy_compound_upper'
          });
        }
      }
      break;
      
    default:
      // No strength training
      break;
  }
  
  return sessions;
}

// Helper function to intelligently distribute strength sessions
function distributeSessions(availableDays: string[], sessionCount: number, longSessionDays: string[]): string[] {
  const selectedDays: string[] = [];
  
  // Prioritize days that are not adjacent to long sessions
  const priorityDays = availableDays.filter(day => {
    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(day);
    return !longSessionDays.some(longDay => {
      const longDayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(longDay);
      return Math.abs(dayIndex - longDayIndex) <= 1; // Not adjacent to long sessions
    });
  });
  
  // If we have enough priority days, use them
  if (priorityDays.length >= sessionCount) {
    return priorityDays.slice(0, sessionCount);
  }
  
  // Otherwise, use available days but avoid long session days
  return availableDays.slice(0, sessionCount);
}

// Helper function to find the best day for upper body focus
function findUpperBodyDay(availableDays: string[], longSessionDays: string[]): string {
  // Prefer a day that's not adjacent to long sessions
  const nonAdjacentDays = availableDays.filter(day => {
    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(day);
    return !longSessionDays.some(longDay => {
      const longDayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(longDay);
      return Math.abs(dayIndex - longDayIndex) <= 1;
    });
  });
  
  // Return the first available non-adjacent day, or the first available day
  return nonAdjacentDays[0] || availableDays[0];
}

// Generate detailed strength workouts
export function generateStrengthWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, userEquipment?: any): string {
  const { strengthType } = session;
  
  // Check available strength equipment - match exact options from TrainingBaselines
  const hasFullGym = userEquipment?.strength?.includes('Full commercial gym access');
  const hasBarbell = userEquipment?.strength?.includes('Full barbell + plates') || userEquipment?.strength?.includes('Squat rack or power cage');
  const hasDumbbells = userEquipment?.strength?.includes('Adjustable dumbbells') || userEquipment?.strength?.includes('Fixed dumbbells');
  const hasKettlebells = userEquipment?.strength?.includes('Kettlebells');
  const hasResistanceBands = userEquipment?.strength?.includes('Resistance bands');
  const hasPullUpBar = userEquipment?.strength?.includes('Pull-up bar');
  const hasCableMachine = userEquipment?.strength?.includes('Cable machine/functional trainer');
  const hasBench = userEquipment?.strength?.includes('Bench (flat/adjustable)');
  const hasBodyweightOnly = userEquipment?.strength?.includes('Bodyweight only');
  
  // Adjust intensity based on training phase
  const phaseMultiplier = getPhaseIntensityMultiplier(phase);
  const isPeakPhase = phase === 'peak';
  const isTaperPhase = phase === 'taper';
  
  // Get user's 1RM values - NO FALLBACKS
  if (!userPerformance.squat || !userPerformance.deadlift || !userPerformance.bench) {
    throw new Error('1RM data required for strength training: squat, deadlift, and bench press values must be provided');
  }
  
  const squat1RM = userPerformance.squat;
  const deadlift1RM = userPerformance.deadlift;
  const bench1RM = userPerformance.bench;
  
  // Calculate actual weights based on percentages - Endurance strength research (Lauersen et al., 2014)
  // Endurance athletes should use 60-75% 1RM for strength maintenance, not heavy lifting
  const squatWeight = Math.round(squat1RM * 0.65); // 65% of 1RM (endurance strength)
  const deadliftWeight = Math.round(deadlift1RM * 0.60); // 60% of 1RM (endurance maintenance)
  const benchWeight = Math.round(bench1RM * 0.65); // 65% of 1RM (endurance strength)
  const overheadWeight = Math.round(bench1RM * 0.60); // 60% of 1RM for overhead press
  const rowWeight = Math.round(bench1RM * 0.60); // 60% of 1RM for rows
  const powerCleanWeight = Math.round(deadlift1RM * 0.60); // 60% of 1RM for power cleans
  
  switch (strengthType) {
    case 'traditional':
      // Endurance strength: 3-4 sets, 8-12 reps, 2-3 min rest (Lauersen et al., 2014)
      const traditionalSets = isPeakPhase ? 4 : 3;
      const traditionalReps = isTaperPhase ? 6 : 10;
      
      if (hasFullGym || hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Squat ${traditionalSets}x${traditionalReps} @ ${squatWeight}lbs (2min rest), Deadlift ${traditionalSets}x6 @ ${deadliftWeight}lbs (3min rest), Bench Press ${traditionalSets}x${traditionalReps} @ ${benchWeight}lbs (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Goblet Squats ${traditionalSets}x${traditionalReps} (2min rest), Dumbbell Deadlifts ${traditionalSets}x6 (3min rest), Dumbbell Bench Press ${traditionalSets}x${traditionalReps} (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Goblet Squats ${traditionalSets}x${traditionalReps} (2min rest), Kettlebell Deadlifts ${traditionalSets}x6 (3min rest), Kettlebell Press ${traditionalSets}x${traditionalReps} (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasBarbell && !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bodyweight Squats ${traditionalSets}x${traditionalReps * 2} (2min rest), Single-leg Deadlifts ${traditionalSets}x8 each (3min rest), Push-ups ${traditionalSets}x${traditionalReps * 2} (2min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bodyweight Squats ${traditionalSets}x${traditionalReps * 2} (2min rest), Single-leg Deadlifts ${traditionalSets}x8 each (3min rest), Push-ups ${traditionalSets}x${traditionalReps * 2} (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'compound':
      // Endurance compound: 3-4 sets, 6-8 reps, 2-3 min rest (Rønnestad & Mujika, 2014)
      const compoundSets = isPeakPhase ? 4 : 3;
      const compoundReps = isTaperPhase ? 4 : 8;
      
      if (hasFullGym || hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Power Clean ${compoundSets}x4 @ ${powerCleanWeight}lbs (3min rest), Squat ${compoundSets}x${compoundReps} @ ${squatWeight}lbs (2min rest), Deadlift ${compoundSets}x4 @ ${deadliftWeight}lbs (3min rest)\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Clean ${compoundSets}x4 (3min rest), Goblet Squats ${compoundSets}x${compoundReps} (2min rest), Dumbbell Deadlifts ${compoundSets}x4 (3min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Clean ${compoundSets}x4 (3min rest), Kettlebell Goblet Squats ${compoundSets}x${compoundReps} (2min rest), Kettlebell Deadlifts ${compoundSets}x4 (3min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasBarbell && !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Jump Squats ${compoundSets}x8 (3min rest), Bodyweight Squats ${compoundSets}x${compoundReps * 2} (2min rest), Single-leg Deadlifts ${compoundSets}x6 each (3min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Jump Squats ${compoundSets}x8 (3min rest), Bodyweight Squats ${compoundSets}x${compoundReps * 2} (2min rest), Single-leg Deadlifts ${compoundSets}x6 each (3min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance':
      // Endurance functional: 3-4 sets, distance-based, 2-3 min rest (Beattie et al., 2017)
      const cowboySets = isPeakPhase ? 4 : 3;
      const cowboyDistance = isTaperPhase ? 75 : 100;
      
      if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Farmer's walks with dumbbells ${cowboySets}x${cowboyDistance}m (2min rest), Dumbbell carries ${cowboySets}x50m (2min rest), Pull-ups ${cowboySets}x6 (3min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Farmer's walks with kettlebells ${cowboySets}x${cowboyDistance}m (2min rest), Kettlebell carries ${cowboySets}x50m (2min rest), Pull-ups ${cowboySets}x6 (3min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Walking lunges ${cowboySets}x${cowboyDistance}m (2min rest), Bear crawls ${cowboySets}x50m (2min rest), Pull-ups ${cowboySets}x6 (3min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_compound':
      // Endurance compound: 3-4 sets, 6-8 reps, 2-3 min rest (Rønnestad & Mujika, 2014)
      const cowboyCompoundSets = isPeakPhase ? 4 : 3;
      const cowboyCompoundReps = isTaperPhase ? 4 : 8;
      
      if (hasFullGym || hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Deadlift ${cowboyCompoundSets}x${cowboyCompoundReps} @ ${deadliftWeight}lbs (3min rest), Overhead press ${cowboyCompoundSets}x${cowboyCompoundReps} @ ${overheadWeight}lbs (2min rest), Rows ${cowboyCompoundSets}x8 @ ${rowWeight}lbs (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Clean & Press ${cowboyCompoundSets}x${cowboyCompoundReps} (3min rest), Dumbbell Squat to Press ${cowboyCompoundSets}x${cowboyCompoundReps} (2min rest), Dumbbell Romanian Deadlift ${cowboyCompoundSets}x8 (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Clean & Press ${cowboyCompoundSets}x${cowboyCompoundReps} (3min rest), Kettlebell Squat to Press ${cowboyCompoundSets}x${cowboyCompoundReps} (2min rest), Kettlebell Romanian Deadlift ${cowboyCompoundSets}x8 (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasBarbell && !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Burpees ${cowboyCompoundSets}x${cowboyCompoundReps} (3min rest), Jump Squats ${cowboyCompoundSets}x${cowboyCompoundReps} (2min rest), Single-leg Romanian Deadlifts ${cowboyCompoundSets}x8 each (2min rest)\nCool-down: 5min static stretching`;
      } else {
        // Fallback to bodyweight if no specific equipment detected
        return `Warm-up: 5min dynamic stretching\nMain Set: Burpees ${cowboyCompoundSets}x${cowboyCompoundReps} (3min rest), Jump Squats ${cowboyCompoundSets}x${cowboyCompoundReps} (2min rest), Single-leg Romanian Deadlifts ${cowboyCompoundSets}x8 each (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance_upper':
      const upperSets = isPeakPhase ? 4 : 3;
      const upperReps = isTaperPhase ? 8 : 12;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bench Press ${upperSets}x${upperReps} @ ${benchWeight}lbs, Overhead Press ${upperSets}x${upperReps} @ ${overheadWeight}lbs, Barbell Rows ${upperSets}x${upperReps} @ ${rowWeight}lbs, Bicep Curls ${upperSets}x12 @ ${Math.round(benchWeight * 0.4)}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Bench Press ${upperSets}x${upperReps}, Dumbbell Overhead Press ${upperSets}x${upperReps}, Dumbbell Rows ${upperSets}x${upperReps} each, Dumbbell Curls ${upperSets}x12 each\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Floor Press ${upperSets}x${upperReps}, Kettlebell Press ${upperSets}x${upperReps}, Kettlebell Rows ${upperSets}x${upperReps} each, Kettlebell Curls ${upperSets}x12 each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Push-ups ${upperSets}x${upperReps * 2}, Pike Push-ups ${upperSets}x${upperReps}, Inverted Rows ${upperSets}x${upperReps}, Diamond Push-ups ${upperSets}x12\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_compound_upper':
      const compoundUpperSets = isPeakPhase ? 4 : 3;
      const compoundUpperReps = isTaperPhase ? 6 : 8;
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bench Press ${compoundUpperSets}x${compoundUpperReps} @ ${benchWeight}lbs, Overhead Press ${compoundUpperSets}x${compoundUpperReps} @ ${overheadWeight}lbs, Barbell Rows ${compoundUpperSets}x${compoundUpperReps} @ ${rowWeight}lbs, Close-Grip Bench Press ${compoundUpperSets}x8 @ ${Math.round(benchWeight * 0.8)}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Dumbbell Bench Press ${compoundUpperSets}x${compoundUpperReps}, Dumbbell Overhead Press ${compoundUpperSets}x${compoundUpperReps}, Dumbbell Rows ${compoundUpperSets}x${compoundUpperReps} each, Dumbbell Floor Press ${compoundUpperSets}x8 each\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Floor Press ${compoundUpperSets}x${compoundUpperReps}, Kettlebell Press ${compoundUpperSets}x${compoundUpperReps}, Kettlebell Rows ${compoundUpperSets}x${compoundUpperReps} each, Kettlebell Floor Press ${compoundUpperSets}x8 each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Push-ups ${compoundUpperSets}x${compoundUpperReps * 2}, Pike Push-ups ${compoundUpperSets}x${compoundUpperReps}, Inverted Rows ${compoundUpperSets}x${compoundUpperReps}, Diamond Push-ups ${compoundUpperSets}x8\nCool-down: 5min static stretching`;
      }
      
    default:
      return session.description;
  }
}

function getPhaseIntensityMultiplier(phase: string): number {
  switch (phase) {
    case 'base': return 1.0;
    case 'build': return 1.1;
    case 'peak': return 0.8; // Reduce strength during peak endurance
    case 'taper': return 0.6; // Minimal strength during taper
    default: return 1.0;
  }
}
