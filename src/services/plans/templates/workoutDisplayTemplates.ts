// workoutDisplayTemplates.ts
// Template functions that automatically populate workout displays with computed data
// These templates ensure consistent formatting across all UI contexts

import { formatPace, formatTime, formatDuration } from '@/lib/utils';

export interface WorkoutComputed {
  total_duration_seconds: number;
  steps: Array<{
    kind?: string;
    intensity?: string;
    ctrl?: 'time' | 'distance';
    seconds?: number;
    pace_sec_per_mi?: number;
    pace_range?: { lower: number; upper: number };
    target_watts?: number;
    power_range?: { lower: number; upper: number };
    swim_pace_sec_per_100?: number;
    swim_pace_range_per_100?: { lower: number; upper: number };
    label?: string;
    original_val?: number;
    original_units?: string;
    // Strength workout fields
    exercise_name?: string;
    sets?: number;
    reps?: number;
    percentage?: number;
    calculated_weight?: number;
    rest_time?: number;
  }>;
}

export interface UserBaselines {
  fiveK_pace_sec_per_mi?: number;
  easy_pace_sec_per_mi?: number;
  ftp?: number;
  swim_pace_per_100_sec?: number;
  // Strength 1RMs
  squat?: number;
  bench?: number;
  deadlift?: number;
  overheadPress1RM?: number;
  barbellRow?: number;
}

export interface WorkoutDisplay {
  title: string;
  totalDuration: string;
  totalDurationRange?: string;
  steps: WorkoutStep[];
}

export interface WorkoutStep {
  type: 'warmup' | 'main' | 'recovery' | 'cooldown' | 'option' | 'alternative';
  description: string;
  duration?: string;
  target?: string;
  range?: string;
  recovery?: string;
  repeats?: number;
  isOptional?: boolean;
  isAlternative?: boolean;
}

// Helper functions for formatting
function formatPaceRange(pace: number, tolerance: number): string {
  const lower = Math.round(pace * (1 - tolerance));
  const upper = Math.round(pace * (1 + tolerance));
  return `${formatPace(lower)} – ${formatPace(upper)}`;
}

// Helper function to detect strength workouts
export function isStrengthWorkout(computed: WorkoutComputed): boolean {
  return computed.steps.some(step => 
    step.exercise_name || 
    (step.sets && step.reps) ||
    step.percentage
  );
}

// Helper function to calculate weight from 1RM and percentage
function calculateWeight(oneRM: number, percentage: number): number {
  return Math.round(oneRM * (percentage / 100));
}

function formatTimeRange(seconds: number, tolerance: number): string {
  const lower = Math.round(seconds * (1 - tolerance));
  const upper = Math.round(seconds * (1 + tolerance));
  return `${formatTime(lower)} – ${formatTime(upper)}`;
}

function formatDistanceRange(distance: number, units: string): string {
  if (units === 'mi') return `${distance} mi`;
  if (units === 'm') return `${Math.round(distance)} m`;
  if (units === 'yd') return `${Math.round(distance)} yd`;
  return `${distance} ${units}`;
}

// Helper function to parse workout descriptions for optional workouts and alternatives
function parseWorkoutOptions(description: string): {
  mainWorkout: string;
  alternatives: string[];
  isOptional: boolean;
} {
  const isOptional = description.toLowerCase().includes('(optional)') || description.toLowerCase().includes('optional');
  
  // Split by "Alternative:" or "OR" to separate main workout from alternatives
  const alternativeSeparators = ['Alternative:', 'OR', 'Alternative -', 'Alternative -'];
  let mainWorkout = description;
  let alternatives: string[] = [];
  
  for (const separator of alternativeSeparators) {
    if (description.includes(separator)) {
      const parts = description.split(separator);
      mainWorkout = parts[0].trim();
      alternatives = parts.slice(1).map(alt => alt.trim()).filter(alt => alt.length > 0);
      break;
    }
  }
  
  // Clean up main workout (remove optional tag)
  mainWorkout = mainWorkout.replace(/\(optional\)/i, '').trim();
  
  return {
    mainWorkout,
    alternatives,
    isOptional
  };
}

// Helper function to parse strength workout descriptions with inline rest times
function parseStrengthWorkoutWithRest(description: string): Array<{name: string, sets: string, weight: string, rest: string}> {
  const exercises: Array<{name: string, sets: string, weight: string, rest: string}> = [];
  
  // Split by semicolons and clean up
  const exerciseStrings = description.split(';').map(ex => ex.trim()).filter(ex => ex.length > 0);
  
  exerciseStrings.forEach(exerciseStr => {
    // Remove the "Includes rest:" part if present
    const cleanExercise = exerciseStr.replace(/Includes rest:.*$/i, '').trim();
    
    // Parse exercise name, sets, weight, and rest time
    // Pattern: "Exercise Name sets x weight x reps rest_time"
    // or "Exercise Name sets×reps rest_time" (for bodyweight)
    
    // Try to match: "Deadlift 5 x 135 x 5 2-3 minutes rest"
    let match = cleanExercise.match(/^(.+?)\s+(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s+(.+)$/i);
    if (match) {
      exercises.push({
        name: match[1].trim(),
        sets: `${match[2]}×${match[4]}`,
        weight: `${match[3]} lbs`,
        rest: match[5].trim()
      });
      return;
    }
    
    // Try to match: "Bench press 5 x 140 x 5 90–120 s"
    match = cleanExercise.match(/^(.+?)\s+(\d+)\s*x\s*(\d+)\s*x\s*(\d+)\s+(.+)$/i);
    if (match) {
      exercises.push({
        name: match[1].trim(),
        sets: `${match[2]}×${match[4]}`,
        weight: `${match[3]} lbs`,
        rest: match[5].trim()
      });
      return;
    }
    
    // Try to match: "Bulgarian split squat 3×8–10 60–90 s"
    match = cleanExercise.match(/^(.+?)\s+(\d+)×(\d+(?:–\d+)?)\s+(.+)$/i);
    if (match) {
      exercises.push({
        name: match[1].trim(),
        sets: `${match[2]}×${match[3]}`,
        weight: 'Bodyweight',
        rest: match[4].trim()
      });
      return;
    }
    
    // Fallback: just use the whole string as description
    exercises.push({
      name: cleanExercise,
      sets: '',
      weight: '',
      rest: ''
    });
  });
  
  return exercises;
}

// Template 1: Detailed breakdown for Planned Tab
export function generateDetailedWorkoutTemplate(
  computed: WorkoutComputed,
  baselines: UserBaselines,
  workoutType: string,
  description?: string
): WorkoutDisplay {
  // Check if this is a strength workout
  if (isStrengthWorkout(computed)) {
    return generateStrengthWorkoutTemplate(computed, baselines, workoutType, description);
  }

  // Handle case where there's no computed data - show minimal info
  if (!computed.steps || computed.steps.length === 0) {
    // Check if this is an optional workout or has alternatives
    if (description) {
      const options = parseWorkoutOptions(description);
      const steps: WorkoutStep[] = [];
      
      // Add main workout
      if (options.mainWorkout) {
        steps.push({
          type: 'main',
          description: options.mainWorkout,
          isOptional: options.isOptional
        });
      }
      
      // Add alternatives
      options.alternatives.forEach(alt => {
        steps.push({
          type: 'alternative',
          description: alt,
          isAlternative: true
        });
      });
      
      return {
        title: `${workoutType}${options.isOptional ? ' (Optional)' : ''}`,
        totalDuration: 'Duration not specified',
        steps
      };
    }
    
    return {
      title: workoutType,
      totalDuration: 'Duration not specified',
      steps: [{
        type: 'main',
        description: 'Workout details not available'
      }]
    };
  }

  const steps: WorkoutStep[] = [];
  let mainSetRepeats = 0;
  let mainSetDescription = '';
  let mainSetTarget = '';
  let mainSetRange = '';
  let recoveryDescription = '';

  // Analyze computed steps to build workout structure
  const warmupSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('wu') || s.label?.toLowerCase().includes('warm') || s.label === 'WU');
  const cooldownSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('cd') || s.label?.toLowerCase().includes('cool') || s.label === 'CD');
  const mainSteps = computed.steps.filter(s => s.kind === 'work' && !s.label?.toLowerCase().includes('wu') && !s.label?.toLowerCase().includes('cd') && s.label !== 'WU' && s.label !== 'CD');
  const recoverySteps = computed.steps.filter(s => s.kind === 'recovery');

  // Generate title
  let title = workoutType;
  if (mainSteps.length > 0) {
    const firstMain = mainSteps[0];
    if (firstMain.ctrl === 'distance' && firstMain.original_units) {
      const distance = formatDistanceRange(firstMain.original_val || 0, firstMain.original_units);
      title = `${mainSteps.length}×${distance}`;
      
      if (firstMain.pace_sec_per_mi && baselines.fiveK_pace_sec_per_mi) {
        title += ` @ ${formatPace(baselines.fiveK_pace_sec_per_mi)}`;
      }
    }
  }

  // Add warmup step
  if (warmupSteps.length > 0) {
    const wu = warmupSteps[0];
    let target, range;
    
    // Handle bike workouts (power-based)
    if (wu.target_watts) {
      target = `@ ${wu.target_watts}W`;
      range = wu.power_range ? `Range: ${wu.power_range.lower}–${wu.power_range.upper}W` : undefined;
    }
    // Handle run workouts (pace-based)
    else if (wu.pace_sec_per_mi) {
      const isJog = wu.label === 'jog' || wu.intensity === 'easy';
      target = `@ ${formatPace(wu.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
      range = wu.pace_range ? `Range: ${formatPace(wu.pace_range.lower)} – ${formatPace(wu.pace_range.upper)}` : undefined;
    }
    
    steps.push({
      type: 'warmup',
      description: `Warm-Up`,
      duration: formatTime(wu.seconds),
      target,
      range
    });
  }

  // Add main set
  if (mainSteps.length > 0) {
    const firstMain = mainSteps[0];
    mainSetRepeats = mainSteps.length;
    
    if (firstMain.ctrl === 'distance' && firstMain.original_units) {
      mainSetDescription = `${formatDistanceRange(firstMain.original_val || 0, firstMain.original_units)}`;
      
      // Handle bike workouts (power-based)
      if (firstMain.target_watts) {
        mainSetTarget = `@ ${firstMain.target_watts}W`;
        mainSetRange = firstMain.power_range ? `Range: ${firstMain.power_range.lower}–${firstMain.power_range.upper}W` : undefined;
      }
      // Handle run workouts (pace-based)
      else if (firstMain.pace_sec_per_mi) {
        const isJog = firstMain.label === 'jog' || firstMain.intensity === 'easy';
        mainSetTarget = `@ ${formatPace(firstMain.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
        mainSetRange = firstMain.pace_range ? `Range: ${formatPace(firstMain.pace_range?.lower || firstMain.pace_sec_per_mi)} – ${formatPace(firstMain.pace_range?.upper || firstMain.pace_sec_per_mi)}` : undefined;
      }
    }

    // Add recovery info
    if (recoverySteps.length > 0) {
      const recovery = recoverySteps[0];
      let recoveryTarget = '';
      
      // Handle bike recovery (power-based)
      if (recovery.target_watts) {
        recoveryTarget = ` @ ${recovery.target_watts}W`;
      }
      // Handle run recovery (pace-based)
      else if (recovery.pace_sec_per_mi) {
        recoveryTarget = ` @ ${formatPace(recovery.pace_sec_per_mi)}`;
      }
      // Fallback to easy pace for runs
      else if (baselines.easy_pace_sec_per_mi) {
        recoveryTarget = ` @ ${formatPace(baselines.easy_pace_sec_per_mi)}`;
      }
      
      recoveryDescription = `${formatTime(recovery.seconds)}${recoveryTarget}`;
    }

    steps.push({
      type: 'main',
      description: `Main Set – ${mainSetRepeats} Repeats`,
      repeats: mainSetRepeats,
      target: mainSetTarget,
      range: mainSetRange,
      recovery: recoveryDescription
    });
  }

  // Add cooldown step
  if (cooldownSteps.length > 0) {
    const cd = cooldownSteps[0];
    let target, range;
    
    // Handle bike workouts (power-based)
    if (cd.target_watts) {
      target = `@ ${cd.target_watts}W`;
      range = cd.power_range ? `Range: ${cd.power_range.lower}–${cd.power_range.upper}W` : undefined;
    }
    // Handle run workouts (pace-based)
    else if (cd.pace_sec_per_mi) {
      const isJog = cd.label === 'jog' || cd.intensity === 'easy';
      target = `@ ${formatPace(cd.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
      range = cd.pace_range ? `Range: ${formatPace(cd.pace_range.lower)} – ${formatPace(cd.pace_range.upper)}` : undefined;
    }
    
    steps.push({
      type: 'cooldown',
      description: `Cool-Down`,
      duration: formatTime(cd.seconds),
      target,
      range
    });
  }

  return {
    title,
    totalDuration: formatDuration(computed.total_duration_seconds),
    steps
  };
}

// Template 2: Summary view for Plan Page
export function generateSummaryWorkoutTemplate(
  computed: WorkoutComputed,
  baselines: UserBaselines,
  workoutType: string,
  description?: string
): WorkoutDisplay {
  // Check if this is a strength workout
  if (isStrengthWorkout(computed)) {
    return generateStrengthWorkoutTemplate(computed, baselines, workoutType, description);
  }

  // Handle case where there's no computed data but we have a description
  if (!computed.steps || computed.steps.length === 0) {
    if (description) {
      const options = parseWorkoutOptions(description);
      const steps: WorkoutStep[] = [];
      
      // Add main workout
      if (options.mainWorkout) {
        steps.push({
          type: 'main',
          description: options.mainWorkout,
          isOptional: options.isOptional
        });
      }
      
      // Add alternatives
      options.alternatives.forEach(alt => {
        steps.push({
          type: 'alternative',
          description: alt,
          isAlternative: true
        });
      });
      
      return {
        title: `${workoutType}${options.isOptional ? ' (Optional)' : ''}`,
        totalDuration: 'Duration not specified',
        steps
      };
    }
  }

  const mainSteps = computed.steps.filter(s => s.kind === 'work' && !s.label?.toLowerCase().includes('wu') && !s.label?.toLowerCase().includes('cd') && s.label !== 'WU' && s.label !== 'CD');
  const recoverySteps = computed.steps.filter(s => s.kind === 'recovery');
  
  let title = workoutType;
  let mainDescription = '';
  let recoveryDescription = '';
  let structureSummary = '';

  // Build main workout description
  if (mainSteps.length > 0) {
    const firstMain = mainSteps[0];
    if (firstMain.ctrl === 'distance' && firstMain.original_units) {
      const distance = formatDistanceRange(firstMain.original_val || 0, firstMain.original_units);
      title = `${mainSteps.length}×${distance}`;
      
      if (firstMain.pace_sec_per_mi) {
        const targetTime = formatTime(firstMain.seconds);
        const isJog = firstMain.label === 'jog' || firstMain.intensity === 'easy';
        const range = firstMain.pace_range ? 
          ` (${formatTime(firstMain.pace_range.lower)}–${formatTime(firstMain.pace_range.upper)})` : '';
        mainDescription = `@ ${formatPace(firstMain.pace_sec_per_mi)}${isJog ? ' (jog)' : ''} — ${targetTime} per rep${range}`;
      }
    }
  }

  // Build recovery description
  if (recoverySteps.length > 0) {
    const recovery = recoverySteps[0];
    const recoveryTime = formatTime(recovery.seconds);
    const isJog = recovery.label === 'jog' || recovery.intensity === 'easy';
    const recoveryPace = recovery.pace_sec_per_mi ? 
      ` @ ${formatPace(recovery.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}` : '';
    const recoveryRange = recovery.pace_range ? 
      ` (${formatPace(recovery.pace_range.lower)}–${formatPace(recovery.pace_range.upper)})` : '';
    recoveryDescription = `Recovery ${recoveryTime}${recoveryPace}${recoveryRange}`;
  }

  // Build structure summary
  const hasWarmup = computed.steps.some(s => s.label?.toLowerCase().includes('wu') || s.label === 'WU');
  const hasCooldown = computed.steps.some(s => s.label?.toLowerCase().includes('cd') || s.label === 'CD');
  const structureParts = [];
  if (hasWarmup) structureParts.push('Warm-up');
  if (mainSteps.length > 0) structureParts.push('Intervals');
  if (hasCooldown) structureParts.push('Cool-down');
  structureSummary = structureParts.join(' • ');

  return {
    title: `${title}${mainDescription}`,
    totalDuration: formatDuration(computed.total_duration_seconds),
    steps: [{
      type: 'main',
      description: `${recoveryDescription}. (${structureSummary})`
    }]
  };
}

// Template 3: Execution guide for Today's Efforts
export function generateExecutionTemplate(
  computed: WorkoutComputed,
  baselines: UserBaselines,
  workoutType: string,
  description?: string
): WorkoutDisplay {
  // Check if this is a strength workout
  if (isStrengthWorkout(computed)) {
    return generateStrengthWorkoutTemplate(computed, baselines, workoutType, description);
  }

  // Handle case where there's no computed data but we have a description
  if (!computed.steps || computed.steps.length === 0) {
    if (description) {
      const options = parseWorkoutOptions(description);
      const steps: WorkoutStep[] = [];
      
      // Add main workout
      if (options.mainWorkout) {
        steps.push({
          type: 'main',
          description: options.mainWorkout,
          isOptional: options.isOptional
        });
      }
      
      // Add alternatives
      options.alternatives.forEach(alt => {
        steps.push({
          type: 'alternative',
          description: alt,
          isAlternative: true
        });
      });
      
      return {
        title: `${workoutType}${options.isOptional ? ' (Optional)' : ''}`,
        totalDuration: 'Duration not specified',
        steps
      };
    }
  }

  const steps: WorkoutStep[] = [];
  
  // Add warmup
  const warmupSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('wu') || s.label?.toLowerCase().includes('warm') || s.label === 'WU');
  if (warmupSteps.length > 0) {
    const wu = warmupSteps[0];
    let warmupTarget = '';
    let warmupRange = '';
    
    // Handle bike workouts (power-based)
    if (wu.target_watts) {
      warmupTarget = ` @ ${wu.target_watts}W`;
      warmupRange = wu.power_range ? ` (${wu.power_range.lower}–${wu.power_range.upper}W)` : '';
    }
    // Handle run workouts (pace-based)
    else if (wu.pace_sec_per_mi) {
      const isJog = wu.label === 'jog' || wu.intensity === 'easy';
      warmupTarget = ` @ ${formatPace(wu.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
      warmupRange = wu.pace_range ? ` (${formatPace(wu.pace_range.lower)}–${formatPace(wu.pace_range.upper)})` : '';
    }
    
    steps.push({
      type: 'warmup',
      description: `Warm-up ${formatTime(wu.seconds)}${warmupTarget}${warmupRange}`
    });
  }

  // Add main set
  const mainSteps = computed.steps.filter(s => s.kind === 'work' && !s.label?.toLowerCase().includes('wu') && !s.label?.toLowerCase().includes('cd') && s.label !== 'WU' && s.label !== 'CD');
  if (mainSteps.length > 0) {
    const firstMain = mainSteps[0];
    if (firstMain.ctrl === 'distance' && firstMain.original_units) {
      const distance = formatDistanceRange(firstMain.original_val || 0, firstMain.original_units);
      let mainTarget = '';
      let mainRange = '';
      
      // Handle bike workouts (power-based)
      if (firstMain.target_watts) {
        mainTarget = ` @ ${firstMain.target_watts}W`;
        mainRange = firstMain.power_range ? ` (${firstMain.power_range.lower}–${firstMain.power_range.upper}W)` : '';
      }
      // Handle run workouts (pace-based)
      else if (firstMain.pace_sec_per_mi) {
        const isJog = firstMain.label === 'jog' || firstMain.intensity === 'easy';
        mainTarget = ` @ ${formatPace(firstMain.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
        mainRange = firstMain.pace_range ? ` (${formatPace(firstMain.pace_range.lower)}–${formatPace(firstMain.pace_range.upper)})` : '';
      }
      
      steps.push({
        type: 'main',
        description: `${mainSteps.length} × ${distance}${mainTarget}${mainRange}`
      });
    }
  }

  // Add recovery info
  const recoverySteps = computed.steps.filter(s => s.kind === 'recovery');
  if (recoverySteps.length > 0) {
    const recovery = recoverySteps[0];
    let recoveryTarget = '';
    let recoveryRange = '';
    
    // Handle bike recovery (power-based)
    if (recovery.target_watts) {
      recoveryTarget = ` @ ${recovery.target_watts}W`;
      recoveryRange = recovery.power_range ? ` (${recovery.power_range.lower}–${recovery.power_range.upper}W)` : '';
    }
    // Handle run recovery (pace-based)
    else if (recovery.pace_sec_per_mi) {
      const isJog = recovery.label === 'jog' || recovery.intensity === 'easy';
      recoveryTarget = ` @ ${formatPace(recovery.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
      recoveryRange = recovery.pace_range ? ` (${formatPace(recovery.pace_range.lower)}–${formatPace(recovery.pace_range.upper)})` : '';
    }
    
    steps.push({
      type: 'recovery',
      description: `• with ${formatTime(recovery.seconds)}${recoveryTarget}${recoveryRange}`
    });
  }

  // Add cooldown
  const cooldownSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('cd') || s.label?.toLowerCase().includes('cool') || s.label === 'CD');
  if (cooldownSteps.length > 0) {
    const cd = cooldownSteps[0];
    let cooldownTarget = '';
    let cooldownRange = '';
    
    // Handle bike workouts (power-based)
    if (cd.target_watts) {
      cooldownTarget = ` @ ${cd.target_watts}W`;
      cooldownRange = cd.power_range ? ` (${cd.power_range.lower}–${cd.power_range.upper}W)` : '';
    }
    // Handle run workouts (pace-based)
    else if (cd.pace_sec_per_mi) {
      const isJog = cd.label === 'jog' || cd.intensity === 'easy';
      cooldownTarget = ` @ ${formatPace(cd.pace_sec_per_mi)}${isJog ? ' (jog)' : ''}`;
      cooldownRange = cd.pace_range ? ` (${formatPace(cd.pace_range.lower)}–${formatPace(cd.pace_range.upper)})` : '';
    }
    
    steps.push({
      type: 'cooldown',
      description: `Cool-down ${formatTime(cd.seconds)}${cooldownTarget}${cooldownRange}`
    });
  }

  return {
    title: `${workoutType} (planned)`,
    totalDuration: formatDuration(computed.total_duration_seconds),
    steps
  };
}

// Strength workout templates
export function generateStrengthWorkoutTemplate(
  computed: WorkoutComputed,
  baselines: UserBaselines,
  workoutType: string,
  description?: string
): WorkoutDisplay {
  const steps: WorkoutStep[] = [];
  
  // Handle case where there's no computed data
  if (!computed.steps || computed.steps.length === 0) {
    // Parse the workout description to format each exercise with its rest time
    if (description) {
      const formattedExercises = parseStrengthWorkoutWithRest(description);
      
      // Create individual steps for each exercise
      formattedExercises.forEach(exercise => {
        steps.push({
          type: 'main',
          description: exercise.name,
          duration: exercise.sets,
          target: exercise.weight,
          recovery: exercise.rest
        });
      });
      
      return {
        title: workoutType,
        totalDuration: 'Duration not specified',
        steps
      };
    }
    
    // Fallback if no description
    return {
      title: workoutType,
      totalDuration: 'Duration not specified',
      steps: [{
        type: 'main',
        description: 'Strength workout details not available'
      }]
    };
  }
  
  // Group exercises by type (main lifts, accessories)
  const mainLifts = computed.steps.filter(s => s.exercise_name && s.sets && s.reps && s.percentage);
  
  mainLifts.forEach((exercise, index) => {
    if (exercise.exercise_name && exercise.sets && exercise.reps && exercise.percentage) {
      // Calculate actual weight from 1RM baseline
      let calculatedWeight = 0;
      const exerciseName = exercise.exercise_name.toLowerCase();
      
      if (exerciseName.includes('squat') && baselines.squat) {
        calculatedWeight = calculateWeight(baselines.squat, exercise.percentage);
      } else if (exerciseName.includes('bench') && baselines.bench) {
        calculatedWeight = calculateWeight(baselines.bench, exercise.percentage);
      } else if (exerciseName.includes('deadlift') && baselines.deadlift) {
        calculatedWeight = calculateWeight(baselines.deadlift, exercise.percentage);
      } else if (exerciseName.includes('ohp') || exerciseName.includes('overhead') && baselines.overheadPress1RM) {
        calculatedWeight = calculateWeight(baselines.overheadPress1RM, exercise.percentage);
      } else if (exerciseName.includes('row') && baselines.barbellRow) {
        calculatedWeight = calculateWeight(baselines.barbellRow, exercise.percentage);
      }
      
      steps.push({
        type: 'main',
        description: `${exercise.exercise_name}`,
        duration: `${exercise.sets}×${exercise.reps}`,
        target: `@ ${exercise.percentage}%`,
        range: calculatedWeight > 0 ? `(${calculatedWeight} lbs)` : undefined,
        recovery: exercise.rest_time ? `${exercise.rest_time}min rest` : undefined
      });
    }
  });

  return {
    title: workoutType,
    totalDuration: formatDuration(computed.total_duration_seconds),
    steps
  };
}
