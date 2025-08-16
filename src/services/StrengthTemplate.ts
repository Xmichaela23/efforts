// StrengthTemplate.ts - 80/20 Triathlon Strength Training
// Based on David Warden's 5-Phase Periodized Strength System from "80/20 Triathlon" (2019)
// "Peak endurance performance cannot be achieved without some form of strength training" - 80/20 Triathlon
// No fallbacks, no complexity - just clean, science-based strength plans

export interface SessionTemplate {
  day: string;
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'brick';
  type: 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic';
  duration: number; // minutes
  intensity: string;
  description: string;
  zones: number[];
  strengthType?: 'power' | 'stability' | 'traditional' | 'traditional_lower' | 'traditional_upper' | 'cowboy_endurance' | 'cowboy_endurance_upper' | 'cowboy_endurance_walks';
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
      // 2 sessions per week - coached approach: Lower body + Upper body
      const traditionalDays = distributeSessions(availableDays, 2, longSessionDays);
      
      // Session 1: Lower body focus (Squat, Deadlift, Single-leg)
      sessions.push({
        day: traditionalDays[0],
        discipline: 'strength',
        type: 'endurance',
        duration: 55, // 3-4 sets × 8-12 reps × 3 exercises + rest periods
        intensity: 'Zone 2',
        description: 'Traditional lower body: Squat, Deadlift, Single-leg',
        zones: [2],
        strengthType: 'traditional_lower'
      });
      
      // Session 2: Upper body focus (Bench, Rows, Overhead Press)
      sessions.push({
        day: traditionalDays[1],
        discipline: 'strength',
        type: 'endurance',
        duration: 55, // 3-4 sets × 8-12 reps × 3-4 exercises + rest periods
        intensity: 'Zone 2',
        description: 'Traditional upper body: Bench Press, Rows, Overhead Press',
        zones: [2],
        strengthType: 'traditional_upper'
      });
      break;
      

      
    case 'cowboy_endurance':
      // 3 sessions per week - 2 functional + 1 upper body focus
      // Training science: Functional sessions should be 48-72 hours apart for recovery
      // Upper body session should be separated from functional sessions by at least 24 hours
      const availableDaysForStrength = availableDays.filter(day => !longSessionDays.includes(day));
      
      console.log('Cowboy Endurance Debug:', {
        availableDays,
        availableDaysForStrength,
        longSessionDays
      });
      
      // Ensure we have at least 3 days available for strength
      if (availableDaysForStrength.length < 3) {
        throw new Error(`Insufficient training days for Cowboy strength (3 sessions needed, only ${availableDaysForStrength.length} days available)`);
      }
      
      // Apply training science principles for distribution
      const distributedDays = distributeStrengthSessionsScientifically(availableDaysForStrength, longSessionDays, 3);
      
      // First session: Lower body endurance (squats, deadlifts, carries)
      sessions.push({
        day: distributedDays[0],
        discipline: 'strength',
        type: 'endurance',
        duration: 50, // 3-4 sets × 8-12 reps × 3 exercises + rest periods
        intensity: 'Zone 2',
        description: 'Cowboy lower body: Squats, Deadlifts, Carries',
        zones: [2],
        strengthType: 'cowboy_endurance'
      });
      
      // Second session: Functional endurance (walks, pulls, pushes)
      sessions.push({
        day: distributedDays[1],
        discipline: 'strength',
        type: 'endurance',
        duration: 45, // 3-4 sets × distance/time × 2-3 exercises + rest periods
        intensity: 'Zone 2',
        description: 'Cowboy functional: Farmer\'s Walks, Pull-ups, Push-ups',
        zones: [2],
        strengthType: 'cowboy_endurance_walks'
      });
      
      // 3rd session is upper body focus
      sessions.push({
        day: distributedDays[2],
        discipline: 'strength',
        type: 'endurance',
        duration: 40, // 3-4 sets × 8-12 reps × 3-4 exercises + rest periods
        intensity: 'Zone 2',
        description: 'Cowboy upper body: Bench Press, Overhead Press, Rows, Curls',
        zones: [2],
        strengthType: 'cowboy_endurance_upper'
      });
      
      console.log('Cowboy Endurance Sessions Generated:', sessions.map(s => ({ day: s.day, strengthType: s.strengthType })));
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

// Scientific distribution of strength sessions based on training principles
function distributeStrengthSessionsScientifically(availableDays: string[], longSessionDays: string[], sessionCount: number): string[] {
  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Training science principles (Lauersen et al., 2014; Beattie et al., 2017):
  // 1. Monday-Wednesday-Friday distribution is optimal for endurance athletes
  // 2. Avoid strength on long session days (Saturday/Sunday)
  // 3. Lower body strength: 48-72h recovery minimum
  // 4. Upper body strength: 24h recovery minimum
  // 5. Functional strength: 24-48h recovery (can integrate well)
  
  // Preferred distribution for 3 sessions: Monday, Wednesday, Friday
  const preferredDays = ['Monday', 'Wednesday', 'Friday'];
  const availablePreferredDays = preferredDays.filter(day => availableDays.includes(day));
  
  // If we have enough preferred days, use them
  if (availablePreferredDays.length >= sessionCount) {
    return availablePreferredDays.slice(0, sessionCount);
  }
  
  // Fallback: use available days but avoid long session days
  const fallbackDays = availableDays.filter(day => !longSessionDays.includes(day));
  
  // Ensure proper spacing (minimum 24h between sessions)
  const distributedDays: string[] = [];
  for (let i = 0; i < sessionCount && i < fallbackDays.length; i++) {
    if (i === 0) {
      distributedDays.push(fallbackDays[0]);
    } else {
      // Find next day with at least 24h spacing
      const previousDayIndex = weekDays.indexOf(distributedDays[distributedDays.length - 1]);
      const candidates = fallbackDays.filter(day => {
        const dayIndex = weekDays.indexOf(day);
        return dayIndex > previousDayIndex && (dayIndex - previousDayIndex) >= 1;
      });
      distributedDays.push(candidates[0] || fallbackDays[i]);
    }
  }
  
  return distributedDays;
}

// Generate detailed strength workouts
export function generateStrengthWorkout(session: SessionTemplate, userPerformance: UserBaselines, phase: string, userEquipment?: any, weekNumber?: number): string {
  const { strengthType } = session;
  
  const squat1RM = userPerformance.squat || 0;
  const deadlift1RM = userPerformance.deadlift || 0;
  const bench1RM = userPerformance.bench || 0;
  
  // Calculate actual weights based on percentages - Endurance strength research (Lauersen et al., 2014)
  // Endurance athletes should use 60-75% 1RM for strength maintenance, not heavy lifting
  const squatWeight = Math.round(squat1RM * 0.65);
  const deadliftWeight = Math.round(deadlift1RM * 0.60);
  const benchWeight = Math.round(bench1RM * 0.65);
  const overheadWeight = Math.round(bench1RM * 0.60);
  const rowWeight = Math.round(bench1RM * 0.60);
  const powerCleanWeight = Math.round(deadlift1RM * 0.60); // 60% of 1RM for power cleans
  
  // Progressive overload: Increase weight by 2.5-5% every 3-4 weeks
  const progressionMultiplier = getProgressionMultiplier(weekNumber || 1, phase);
  const adjustedSquatWeight = Math.round(squatWeight * progressionMultiplier);
  const adjustedDeadliftWeight = Math.round(deadliftWeight * progressionMultiplier);
  const adjustedBenchWeight = Math.round(benchWeight * progressionMultiplier);
  const adjustedOverheadWeight = Math.round(overheadWeight * progressionMultiplier);
  const adjustedRowWeight = Math.round(rowWeight * progressionMultiplier);
  
  // Get exercise variations based on week and phase
  const squatVariation = getExerciseVariations(phase, weekNumber || 1, 'squat')[0];
  const deadliftVariation = getExerciseVariations(phase, weekNumber || 1, 'deadlift')[0];
  const lungeVariation = getExerciseVariations(phase, weekNumber || 1, 'lunge')[0];
  const carryVariation = getExerciseVariations(phase, weekNumber || 1, 'carry')[0];
  const pullVariation = getExerciseVariations(phase, weekNumber || 1, 'pull')[0];
  const pushVariation = getExerciseVariations(phase, weekNumber || 1, 'push')[0];
  const rowVariation = getExerciseVariations(phase, weekNumber || 1, 'row')[0];
  const coreVariation = getExerciseVariations(phase, weekNumber || 1, 'core')[0];
  
  // Check available equipment - match UI options
  const hasFullGym = userEquipment?.strength?.includes('Full commercial gym access') || userEquipment?.strength?.includes('Full barbell + plates');
  const hasBarbell = userEquipment?.strength?.includes('Full barbell + plates') || userEquipment?.strength?.includes('Squat rack or power cage');
  const hasDumbbells = userEquipment?.strength?.includes('Adjustable dumbbells') || userEquipment?.strength?.includes('Fixed dumbbells');
  const hasKettlebells = userEquipment?.strength?.includes('Kettlebells');
  const hasPullUpBar = userEquipment?.strength?.includes('Pull-up bar');
  const hasResistanceBands = userEquipment?.strength?.includes('Resistance bands');
  const hasCableMachine = userEquipment?.strength?.includes('Cable machine/functional trainer');
  const hasBodyweightOnly = userEquipment?.strength?.includes('Bodyweight only') || (!hasBarbell && !hasDumbbells && !hasKettlebells);
  
  // Phase-based intensity adjustments
  const isBasePhase = phase === 'base';
  const isBuildPhase = phase === 'build';
  const isPeakPhase = phase === 'peak';
  const isTaperPhase = phase === 'taper';
  
  switch (strengthType) {
    case 'traditional_lower':
      // Lower body focus with progressive overload and variety
      const traditionalLowerSets = isPeakPhase ? 4 : 3;
      const traditionalLowerReps = isTaperPhase ? 6 : (isBasePhase ? 12 : 10);
      
      if (hasFullGym || hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${traditionalLowerSets}x${traditionalLowerReps} @ ${adjustedSquatWeight}lbs (2min rest), ${deadliftVariation} ${traditionalLowerSets}x6 @ ${adjustedDeadliftWeight}lbs (3min rest), ${lungeVariation} ${traditionalLowerSets}x8 each (2min rest)\nCool-down: 5min static stretching\n(based on your 1RMs: squat ${squat1RM}lb, deadlift ${deadlift1RM}lb)`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${traditionalLowerSets}x${traditionalLowerReps} @ ${Math.round(adjustedSquatWeight * 0.5)}lbs each (2min rest), ${deadliftVariation} ${traditionalLowerSets}x6 @ ${Math.round(adjustedDeadliftWeight * 0.5)}lbs each (3min rest), ${lungeVariation} ${traditionalLowerSets}x8 each (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${traditionalLowerSets}x${traditionalLowerReps} @ ${Math.round(adjustedSquatWeight * 0.5)}lbs (2min rest), ${deadliftVariation} ${traditionalLowerSets}x6 @ ${Math.round(adjustedDeadliftWeight * 0.5)}lbs (3min rest), ${lungeVariation} ${traditionalLowerSets}x8 each (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasResistanceBands) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Band Squats ${traditionalLowerSets}x${traditionalLowerReps * 2} (2min rest), Band Deadlifts ${traditionalLowerSets}x8 each (3min rest), Band Lunges ${traditionalLowerSets}x12 each (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasBarbell && !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${traditionalLowerSets}x${traditionalLowerReps * 2} (2min rest), ${lungeVariation} ${traditionalLowerSets}x8 each (3min rest), ${carryVariation} ${traditionalLowerSets}x20 each (2min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${traditionalLowerSets}x${traditionalLowerReps * 2} (2min rest), ${lungeVariation} ${traditionalLowerSets}x8 each (3min rest), ${carryVariation} ${traditionalLowerSets}x20 each (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'traditional_upper':
      // Upper body focus with progressive overload and variety
      const traditionalUpperSets = isPeakPhase ? 4 : 3;
      const traditionalUpperReps = isTaperPhase ? 6 : (isBasePhase ? 12 : 10);
      
      if (hasFullGym || hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${adjustedBenchWeight}lbs (2min rest), ${rowVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${adjustedRowWeight}lbs (2min rest), ${coreVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${adjustedOverheadWeight}lbs (2min rest)\nCool-down: 5min static stretching\n(based on your 1RMs: bench ${bench1RM}lb)`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${Math.round(adjustedBenchWeight * 0.5)}lbs each (2min rest), ${rowVariation} ${traditionalUpperSets}x${traditionalUpperReps} each @ ${Math.round(adjustedRowWeight * 0.5)}lbs each (2min rest), ${coreVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${Math.round(adjustedOverheadWeight * 0.5)}lbs each (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${Math.round(adjustedBenchWeight * 0.5)}lbs (2min rest), ${rowVariation} ${traditionalUpperSets}x${traditionalUpperReps} each @ ${Math.round(adjustedRowWeight * 0.5)}lbs each (2min rest), ${coreVariation} ${traditionalUpperSets}x${traditionalUpperReps} @ ${Math.round(adjustedOverheadWeight * 0.5)}lbs (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasResistanceBands) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Band Push-ups ${traditionalUpperSets}x${traditionalUpperReps * 2} (2min rest), Band Rows ${traditionalUpperSets}x${traditionalUpperReps} each (2min rest), Band Overhead Press ${traditionalUpperSets}x${traditionalUpperReps} (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasPullUpBar) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pullVariation} ${traditionalUpperSets}x${traditionalUpperReps * 2} (2min rest), ${pullVariation} ${traditionalUpperSets}x${traditionalUpperReps} (2min rest), ${coreVariation} ${traditionalUpperSets}x${traditionalUpperReps} (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasBarbell && !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${traditionalUpperSets}x${traditionalUpperReps * 2} (2min rest), ${rowVariation} ${traditionalUpperSets}x${traditionalUpperReps} (2min rest), ${coreVariation} ${traditionalUpperSets}x${traditionalUpperReps} (2min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${traditionalUpperSets}x${traditionalUpperReps * 2} (2min rest), ${rowVariation} ${traditionalUpperSets}x${traditionalUpperReps} (2min rest), ${coreVariation} ${traditionalUpperSets}x${traditionalUpperReps} (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'traditional':
      // Legacy case for backward compatibility
      const traditionalSets = isPeakPhase ? 4 : 3;
      const traditionalReps = isTaperPhase ? 6 : 10;
      
      if (hasFullGym || hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${traditionalSets}x${traditionalReps} @ ${adjustedSquatWeight}lbs (2min rest), ${deadliftVariation} ${traditionalSets}x6 @ ${adjustedDeadliftWeight}lbs (3min rest), ${benchWeight} ${traditionalSets}x${traditionalReps} @ ${adjustedBenchWeight}lbs (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Goblet Squats ${traditionalSets}x${traditionalReps} (2min rest), Dumbbell Deadlifts ${traditionalSets}x6 (3min rest), Dumbbell Bench Press ${traditionalSets}x${traditionalReps} (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Kettlebell Goblet Squats ${traditionalSets}x${traditionalReps} (2min rest), Kettlebell Deadlifts ${traditionalSets}x6 (3min rest), Kettlebell Press ${traditionalSets}x${traditionalReps} (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasBarbell && !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bodyweight Squats ${traditionalSets}x${traditionalReps * 2} (2min rest), Single-leg Deadlifts ${traditionalSets}x8 each (3min rest), Push-ups ${traditionalSets}x${traditionalReps * 2} (2min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: Bodyweight Squats ${traditionalSets}x${traditionalReps * 2} (2min rest), Single-leg Deadlifts ${traditionalSets}x8 each (3min rest), Push-ups ${traditionalSets}x${traditionalReps * 2} (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance':
      // Endurance lower body with progressive overload and variety
      const cowboySets = isPeakPhase ? 4 : 3;
      const cowboyReps = isTaperPhase ? 8 : (isBasePhase ? 15 : 12);
      const cowboyTime = isTaperPhase ? 30 : (isBasePhase ? 60 : 45);
      
      if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${cowboySets}x${cowboyReps} @ ${Math.round(adjustedSquatWeight * 0.5)}lbs each (2min rest), ${deadliftVariation} ${cowboySets}x8 @ ${Math.round(adjustedDeadliftWeight * 0.5)}lbs each (3min rest), ${lungeVariation} ${cowboySets}x12 each leg (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${cowboySets}x${cowboyReps} @ ${Math.round(adjustedSquatWeight * 0.5)}lbs (2min rest), ${deadliftVariation} ${cowboySets}x8 @ ${Math.round(adjustedDeadliftWeight * 0.5)}lbs (3min rest), ${lungeVariation} ${cowboySets}x12 each leg (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${cowboySets}x${cowboyReps * 2} (2min rest), ${lungeVariation} ${cowboySets}x8 each (3min rest), ${carryVariation} ${cowboySets}x12 each leg (2min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${squatVariation} ${cowboySets}x${cowboyReps * 2} (2min rest), ${lungeVariation} ${cowboySets}x8 each (3min rest), ${carryVariation} ${cowboySets}x12 each leg (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance_walks':
      // Endurance functional with progressive overload and variety
      const walksSets = isPeakPhase ? 4 : 3;
      const walksTime = isTaperPhase ? 30 : (isBasePhase ? 60 : 45);
      
      if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${carryVariation} ${walksSets}x${walksTime}sec @ ${Math.round(adjustedDeadliftWeight * 0.3)}lbs each (2min rest), ${pullVariation} ${walksSets}x6 (3min rest), ${rowVariation} ${walksSets}x12 each @ ${Math.round(adjustedRowWeight * 0.5)}lbs each (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${carryVariation} ${walksSets}x${walksTime}sec @ ${Math.round(adjustedDeadliftWeight * 0.3)}lbs each (2min rest), ${pullVariation} ${walksSets}x6 (3min rest), ${rowVariation} ${walksSets}x12 each @ ${Math.round(adjustedRowWeight * 0.5)}lbs each (2min rest)\nCool-down: 5min static stretching`;
      } else if (hasBodyweightOnly || !hasDumbbells && !hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${carryVariation} ${walksSets}x${walksTime}sec (2min rest), ${pullVariation} ${walksSets}x6 (3min rest), ${rowVariation} ${walksSets}x12 (2min rest)\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${carryVariation} ${walksSets}x${walksTime}sec (2min rest), ${pullVariation} ${walksSets}x6 (3min rest), ${rowVariation} ${walksSets}x12 (2min rest)\nCool-down: 5min static stretching`;
      }
      
    case 'cowboy_endurance_upper':
      const upperSets = isPeakPhase ? 4 : 3;
      const upperReps = isTaperPhase ? 8 : (isBasePhase ? 15 : 12);
      
      if (hasBarbell) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${upperSets}x${upperReps} @ ${adjustedBenchWeight}lbs, ${coreVariation} ${upperSets}x${upperReps} @ ${adjustedOverheadWeight}lbs, ${rowVariation} ${upperSets}x${upperReps} @ ${adjustedRowWeight}lbs, ${coreVariation} ${upperSets}x12 @ ${Math.round(adjustedBenchWeight * 0.4)}lbs\nCool-down: 5min static stretching`;
      } else if (hasDumbbells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${upperSets}x${upperReps} @ ${Math.round(adjustedBenchWeight * 0.5)}lbs each, ${coreVariation} ${upperSets}x${upperReps} @ ${Math.round(adjustedOverheadWeight * 0.5)}lbs each, ${rowVariation} ${upperSets}x${upperReps} each @ ${Math.round(adjustedRowWeight * 0.5)}lbs each, ${coreVariation} ${upperSets}x12 each @ ${Math.round(adjustedBenchWeight * 0.2)}lbs each\nCool-down: 5min static stretching`;
      } else if (hasKettlebells) {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${upperSets}x${upperReps} @ ${Math.round(adjustedBenchWeight * 0.5)}lbs, ${coreVariation} ${upperSets}x${upperReps} @ ${Math.round(adjustedOverheadWeight * 0.5)}lbs, ${rowVariation} ${upperSets}x${upperReps} each @ ${Math.round(adjustedRowWeight * 0.5)}lbs each, ${coreVariation} ${upperSets}x12 each @ ${Math.round(adjustedBenchWeight * 0.2)}lbs each\nCool-down: 5min static stretching`;
      } else {
        return `Warm-up: 5min dynamic stretching\nMain Set: ${pushVariation} ${upperSets}x${upperReps * 2}, ${coreVariation} ${upperSets}x${upperReps}, ${rowVariation} ${upperSets}x${upperReps}, ${coreVariation} ${upperSets}x12\nCool-down: 5min static stretching`;
      }
      
    default:
      return session.description;
  }
}

// Progressive overload: Increase weight by 2.5-5% every 3-4 weeks
function getProgressionMultiplier(weekNumber: number, phase: string): number {
  const baseMultiplier = 1.0;
  const weeklyIncrease = 0.025; // 2.5% per week
  const maxWeeks = 12;
  
  // Calculate progression based on week
  let progression = baseMultiplier + (weekNumber - 1) * weeklyIncrease;
  
  // Phase-based adjustments
  switch (phase) {
    case 'base':
      progression = Math.min(progression, 1.15); // Cap at 15% increase in base
      break;
    case 'build':
      progression = Math.min(progression, 1.25); // Cap at 25% increase in build
      break;
    case 'peak':
      progression = Math.min(progression, 1.30); // Cap at 30% increase in peak
      break;
    case 'taper':
      progression = Math.max(progression * 0.8, 1.0); // Reduce by 20% in taper
      break;
  }
  
  return progression;
}

// Exercise variety system with rotation
const getExerciseVariations = (phase: string, weekNumber: number, exerciseType: string): string[] => {
  const variations = {
    squat: {
      base: ['Goblet Squats', 'Front Squats', 'Back Squats', 'Bulgarian Split Squats'],
      build: ['Front Squats', 'Back Squats', 'Bulgarian Split Squats', 'Step-ups'],
      peak: ['Back Squats', 'Bulgarian Split Squats', 'Pistol Squats', 'Box Jumps'],
      taper: ['Bodyweight squats', 'Air squats', 'Wall sits', 'Step-ups']
    },
    deadlift: {
      base: ['Dumbbell Deadlifts', 'Romanian Deadlifts', 'Sumo Deadlifts', 'Single-leg Deadlifts'],
      build: ['Romanian Deadlifts', 'Sumo Deadlifts', 'Single-leg Deadlifts', 'Kettlebell Swings'],
      peak: ['Sumo Deadlifts', 'Single-leg Deadlifts', 'Clean & Press', 'Snatch Grip Deadlifts'],
      taper: ['Bodyweight deadlifts', 'Good mornings', 'Bird dogs', 'Superman holds']
    },
    lunge: {
      base: ['Walking Lunges', 'Reverse Lunges', 'Lateral Lunges', 'Split Squats'],
      build: ['Reverse Lunges', 'Lateral Lunges', 'Split Squats', 'Step-ups'],
      peak: ['Lateral Lunges', 'Split Squats', 'Box Jumps', 'Plyometric Lunges'],
      taper: ['Walking lunges', 'Step-ups', 'Bodyweight lunges', 'Wall sits']
    },
    carry: {
      base: ['Farmer\'s Walks', 'Suitcase Carries', 'Bear Crawls', 'Crab Walks'],
      build: ['Suitcase Carries', 'Bear Crawls', 'Crab Walks', 'Medicine Ball Carries'],
      peak: ['Bear Crawls', 'Crab Walks', 'Medicine Ball Carries', 'Sandbag Carries'],
      taper: ['Bodyweight carries', 'Plank walks', 'Crab walks', 'Bear crawls']
    },
    pull: {
      base: ['Pull-ups', 'Chin-ups', 'Assisted Pull-ups', 'Inverted Rows'],
      build: ['Chin-ups', 'Assisted Pull-ups', 'Inverted Rows', 'TRX Rows'],
      peak: ['Assisted Pull-ups', 'Inverted Rows', 'TRX Rows', 'Ring Rows'],
      taper: ['Bodyweight rows', 'Wall rows', 'Inverted rows', 'Assisted pull-ups']
    },
    push: {
      base: ['Dumbbell Bench Press', 'Push-ups', 'Incline Press', 'Decline Push-ups'],
      build: ['Push-ups', 'Incline Press', 'Decline Push-ups', 'Diamond Push-ups'],
      peak: ['Incline Press', 'Decline Push-ups', 'Diamond Push-ups', 'Plyometric Push-ups'],
      taper: ['Push-ups', 'Wall push-ups', 'Incline push-ups', 'Knee push-ups']
    },
    row: {
      base: ['Dumbbell Rows', 'Barbell Rows', 'Kettlebell Rows', 'Single-arm Rows'],
      build: ['Barbell Rows', 'Kettlebell Rows', 'Single-arm Rows', 'Cable Rows'],
      peak: ['Kettlebell Rows', 'Single-arm Rows', 'Cable Rows', 'T-bar Rows'],
      taper: ['Bodyweight rows', 'Band rows', 'Wall rows', 'Inverted rows']
    },
    core: {
      base: ['Planks', 'Side Planks', 'Dead Bugs', 'Bird Dogs'],
      build: ['Side Planks', 'Dead Bugs', 'Bird Dogs', 'Russian Twists'],
      peak: ['Dead Bugs', 'Bird Dogs', 'Russian Twists', 'Anti-rotation Press'],
      taper: ['Planks', 'Side planks', 'Dead bugs', 'Bird dogs']
    }
  };

  const phaseVariations = variations[exerciseType as keyof typeof variations]?.[phase as keyof typeof variations.squat] || variations.squat.base;
  const weekCycle = (weekNumber - 1) % phaseVariations.length;
  return [phaseVariations[weekCycle]];
};

function getPhaseIntensityMultiplier(phase: string): number {
  switch (phase) {
    case 'base': return 1.0;
    case 'build': return 1.1;
    case 'peak': return 0.8; // Reduce strength during peak endurance
    case 'taper': return 0.6; // Minimal strength during taper
    default: return 1.0;
  }
}
