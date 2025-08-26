// workoutDisplayTemplates.ts
// Template functions that automatically populate workout displays with computed data
// These templates ensure consistent formatting across all UI contexts

import { formatPace, formatTime, formatDuration } from '@/lib/utils';

export interface WorkoutComputed {
  total_duration_seconds: number;
  steps: Array<{
    kind?: string;
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
  type: 'warmup' | 'main' | 'recovery' | 'cooldown';
  description: string;
  duration?: string;
  target?: string;
  range?: string;
  recovery?: string;
  repeats?: number;
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

// Template 1: Detailed breakdown for Planned Tab
export function generateDetailedWorkoutTemplate(
  computed: WorkoutComputed,
  baselines: UserBaselines,
  workoutType: string,
  description?: string
): WorkoutDisplay {
  console.log('🔍 generateDetailedWorkoutTemplate received:', { computed, baselines, workoutType, description });
  
  // Check if this is a strength workout
  if (isStrengthWorkout(computed)) {
    console.log('🔍 Detected strength workout, using strength template');
    return generateStrengthWorkoutTemplate(computed, baselines, workoutType, description);
  }

  // Handle case where there's no computed data - show minimal info
  if (!computed.steps || computed.steps.length === 0) {
    console.log('🔍 No computed steps, showing minimal info');
    return {
      title: workoutType,
      totalDuration: 'Duration not specified',
      steps: [{
        type: 'main',
        description: description || 'Workout details not available'
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
  const warmupSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('wu') || s.label?.toLowerCase().includes('warm'));
  const cooldownSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('cd') || s.label?.toLowerCase().includes('cool'));
  const mainSteps = computed.steps.filter(s => s.kind === 'work' && !s.label?.toLowerCase().includes('wu') && !s.label?.toLowerCase().includes('cd'));
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
    steps.push({
      type: 'warmup',
      description: `Warm-Up`,
      duration: formatTime(wu.seconds),
      target: wu.pace_sec_per_mi ? `@ ${formatPace(wu.pace_sec_per_mi)}` : undefined,
      range: wu.pace_range ? `Range: ${formatPace(wu.pace_range.lower)} – ${formatPace(wu.pace_range.upper)}` : undefined
    });
  }

  // Add main set
  if (mainSteps.length > 0) {
    const firstMain = mainSteps[0];
    mainSetRepeats = mainSteps.length;
    
    if (firstMain.ctrl === 'distance' && firstMain.original_units) {
      mainSetDescription = `${formatDistanceRange(firstMain.original_val || 0, firstMain.original_units)}`;
      
      if (firstMain.pace_sec_per_mi) {
        mainSetTarget = `@ ${formatPace(firstMain.pace_sec_per_mi)}`;
        mainSetRange = `Range: ${formatPace(firstMain.pace_range?.lower || firstMain.pace_sec_per_mi)} – ${formatPace(firstMain.pace_range?.upper || firstMain.pace_sec_per_mi)}`;
      }
    }

    // Add recovery info
    if (recoverySteps.length > 0) {
      const recovery = recoverySteps[0];
      recoveryDescription = `${formatTime(recovery.seconds)} @ ${formatPace(recovery.pace_sec_per_mi || baselines.easy_pace_sec_per_mi || 0)}`;
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
    steps.push({
      type: 'cooldown',
      description: `Cool-Down`,
      duration: formatTime(cd.seconds),
      target: cd.pace_sec_per_mi ? `@ ${formatPace(cd.pace_sec_per_mi)}` : undefined,
      range: cd.pace_range ? `Range: ${formatPace(cd.pace_range.lower)} – ${formatPace(cd.pace_range.upper)}` : undefined
    });
  }

  return {
    title,
    totalDuration: `~${Math.round(computed.total_duration_seconds / 60)} min`,
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

  const mainSteps = computed.steps.filter(s => s.kind === 'work' && !s.label?.toLowerCase().includes('wu') && !s.label?.toLowerCase().includes('cd'));
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
        const range = firstMain.pace_range ? 
          ` (${formatTime(firstMain.pace_range.lower)}–${formatTime(firstMain.pace_range.upper)})` : '';
        mainDescription = `@ ${formatPace(firstMain.pace_sec_per_mi)} — ${targetTime} per rep${range}`;
      }
    }
  }

  // Build recovery description
  if (recoverySteps.length > 0) {
    const recovery = recoverySteps[0];
    const recoveryTime = formatTime(recovery.seconds);
    const recoveryPace = recovery.pace_sec_per_mi ? 
      ` @ ${formatPace(recovery.pace_sec_per_mi)}` : '';
    const recoveryRange = recovery.pace_range ? 
      ` (${formatPace(recovery.pace_range.lower)}–${formatPace(recovery.pace_range.upper)})` : '';
    recoveryDescription = `Recovery ${recoveryTime}${recoveryPace}${recoveryRange}`;
  }

  // Build structure summary
  const hasWarmup = computed.steps.some(s => s.label?.toLowerCase().includes('wu'));
  const hasCooldown = computed.steps.some(s => s.label?.toLowerCase().includes('cd'));
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

  const steps: WorkoutStep[] = [];
  
  // Add warmup
  const warmupSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('wu') || s.label?.toLowerCase().includes('warm'));
  if (warmupSteps.length > 0) {
    const wu = warmupSteps[0];
    const warmupPace = wu.pace_sec_per_mi ? ` @ ${formatPace(wu.pace_sec_per_mi)}` : '';
    const warmupRange = wu.pace_range ? ` (${formatPace(wu.pace_range.lower)}–${formatPace(wu.pace_range.upper)})` : '';
    steps.push({
      type: 'warmup',
      description: `Warm-up ${formatTime(wu.seconds)}${warmupPace}${warmupRange}`
    });
  }

  // Add main set
  const mainSteps = computed.steps.filter(s => s.kind === 'work' && !s.label?.toLowerCase().includes('wu') && !s.label?.toLowerCase().includes('cd'));
  if (mainSteps.length > 0) {
    const firstMain = mainSteps[0];
    if (firstMain.ctrl === 'distance' && firstMain.original_units) {
      const distance = formatDistanceRange(firstMain.original_val || 0, firstMain.original_units);
      const mainPace = firstMain.pace_sec_per_mi ? ` @ ${formatPace(firstMain.pace_sec_per_mi)}` : '';
      const mainRange = firstMain.pace_range ? ` (${formatPace(firstMain.pace_range.lower)}–${formatPace(firstMain.pace_range.upper)})` : '';
      
      steps.push({
        type: 'main',
        description: `${mainSteps.length} × ${distance}${mainPace}${mainRange}`
      });
    }
  }

  // Add recovery info
  const recoverySteps = computed.steps.filter(s => s.kind === 'recovery');
  if (recoverySteps.length > 0) {
    const recovery = recoverySteps[0];
    const recoveryPace = recovery.pace_sec_per_mi ? ` @ ${formatPace(recovery.pace_sec_per_mi)}` : '';
    const recoveryRange = recovery.pace_range ? ` (${formatPace(recovery.pace_range.lower)}–${formatPace(recovery.pace_range.upper)})` : '';
    
    steps.push({
      type: 'recovery',
      description: `• with ${formatTime(recovery.seconds)}${recoveryPace}${recoveryRange}`
    });
  }

  // Add cooldown
  const cooldownSteps = computed.steps.filter(s => s.label?.toLowerCase().includes('cd') || s.label?.toLowerCase().includes('cool'));
  if (cooldownSteps.length > 0) {
    const cd = cooldownSteps[0];
    const cooldownPace = cd.pace_sec_per_mi ? ` @ ${formatPace(cd.pace_sec_per_mi)}` : '';
    const cooldownRange = cd.pace_range ? ` (${formatPace(cd.pace_range.lower)}–${formatPace(cd.pace_range.upper)})` : '';
    
    steps.push({
      type: 'cooldown',
      description: `Cool-down ${formatTime(cd.seconds)}${cooldownPace}${cooldownRange}`
    });
  }

  return {
    title: `${workoutType} (planned) — ~${Math.round(computed.total_duration_seconds / 60)} min`,
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
    return {
      title: workoutType,
      totalDuration: 'Duration not specified',
      steps: [{
        type: 'main',
        description: description || 'Strength workout details not available'
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
    totalDuration: `~${Math.round(computed.total_duration_seconds / 60)} min`,
    steps
  };
}
