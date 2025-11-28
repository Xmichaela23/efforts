import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * =============================================================================
 * ANALYZE STRENGTH WORKOUT - DEDICATED EDGE FUNCTION
 * =============================================================================
 * 
 * PURPOSE: Comprehensive strength workout analysis with planned workout support
 * 
 * WHAT IT DOES:
 * - Analyzes strength exercises with RIR, weight, and reps
 * - Compares executed vs planned workout targets
 * - Provides historical progression analysis
 * - Handles unit conversion (kg/lbs) based on user preferences
 * - Generates plan-focused insights using GPT-4
 * - Understands phase-based progression and endurance integration
 * 
 * SUPPORTED WORKOUT TYPES:
 * - strength
 * - strength_training
 */

// Enhanced Plan Context Types and Functions
interface EnhancedPlanContext {
  // Basic plan info
  plan_type: string;
  phase: string;
  week: number;
  total_weeks: number;
  
  // Phase-specific context
  phase_description: string;
  phase_progression_rate: number;
  phase_focus: string;
  
  // Endurance integration context
  endurance_sport: string | null;
  strength_type: string;
  endurance_relationship: string;
  
  // Exercise progression context
  progression_rule: string;
  exercise_rotation: string;
  deload_week: boolean;
  
  // Plan-specific metadata
  weekly_focus: string;
  key_workouts: string[];
  plan_notes: string;
}

/**
 * Extract enhanced plan context from planned workout and training plan
 */
function extractEnhancedPlanContext(
  plannedWorkout: any, 
  trainingPlan: any, 
  weekNumber: number
): EnhancedPlanContext {
  const context: EnhancedPlanContext = {
    plan_type: 'unknown',
    phase: 'unknown',
    week: weekNumber,
    total_weeks: 0,
    phase_description: '',
    phase_progression_rate: 0.025, // Default 2.5% per week
    phase_focus: '',
    endurance_sport: null,
    strength_type: 'traditional',
    endurance_relationship: '',
    progression_rule: 'linear',
    exercise_rotation: 'none',
    deload_week: false,
    weekly_focus: '',
    key_workouts: [],
    plan_notes: ''
  };

  // Extract from training plan if available
  if (trainingPlan) {
    context.plan_type = trainingPlan.plan_type || 'unknown';
    context.total_weeks = trainingPlan.duration_weeks || 0;
    
    // Extract phase information
    if (trainingPlan.phases) {
      for (const [phaseName, phaseData] of Object.entries(trainingPlan.phases)) {
        const phase = phaseData as any;
        if (phase.weeks && phase.weeks.includes(weekNumber)) {
          context.phase = phaseName;
          context.phase_description = phase.description || '';
          break;
        }
      }
    }
    
    // Extract strength-specific context
    if (trainingPlan.strength) {
      // Determine strength type based on plan structure
      if (trainingPlan.strength.cowboy_upper) {
        context.strength_type = 'cowboy_endurance';
        context.endurance_relationship = 'Supports endurance performance with functional strength';
      } else if (trainingPlan.strength.traditional) {
        context.strength_type = 'traditional';
        context.endurance_relationship = 'Builds base strength for power development';
      }
    }
    
    // Extract weekly focus
    if (trainingPlan.weekly_summaries && trainingPlan.weekly_summaries[weekNumber]) {
      const weeklySummary = trainingPlan.weekly_summaries[weekNumber];
      context.weekly_focus = weeklySummary.focus || '';
      context.key_workouts = weeklySummary.key_workouts || [];
      context.plan_notes = weeklySummary.notes || '';
    }
  }

  // Extract from planned workout
  if (plannedWorkout) {
    // Override phase if specified in workout
    if (plannedWorkout.phase) {
      context.phase = plannedWorkout.phase;
    }
    
    // Extract strength type from tags or description
    const tags = plannedWorkout.tags || [];
    const description = plannedWorkout.description || '';
    
    if (tags.includes('cowboy_endurance') || description.includes('cowboy')) {
      context.strength_type = 'cowboy_endurance';
      context.endurance_relationship = 'Functional strength for endurance performance';
    } else if (tags.includes('traditional') || description.includes('traditional')) {
      context.strength_type = 'traditional';
      context.endurance_relationship = 'Traditional strength building';
    }
    
    // Extract progression context
    if (plannedWorkout.workout_structure) {
      const structure = plannedWorkout.workout_structure;
      context.progression_rule = structure.progression_rule || 'linear';
      context.exercise_rotation = structure.exercise_rotation || 'none';
    }
    
    // Check for deload week indicators
    context.deload_week = tags.includes('deload') || 
                         description.toLowerCase().includes('deload') ||
                         description.toLowerCase().includes('recovery');
  }

  // Set phase-specific progression rates
  switch (context.phase) {
    case 'base':
      context.phase_progression_rate = 0.02; // 2% per week
      context.phase_focus = 'Building base strength and movement patterns';
      break;
    case 'build':
      context.phase_progression_rate = 0.025; // 2.5% per week
      context.phase_focus = 'Progressive overload and strength development';
      break;
    case 'peak':
      context.phase_progression_rate = 0.03; // 3% per week
      context.phase_focus = 'Peak strength and power development';
      break;
    case 'taper':
      context.phase_progression_rate = -0.1; // 10% reduction
      context.phase_focus = 'Maintain strength while reducing volume';
      break;
  }

  // Determine endurance sport context
  if (context.plan_type === 'triathlon') {
    context.endurance_sport = 'triathlon';
  } else if (context.plan_type === 'hybrid') {
    context.endurance_sport = 'multi-sport';
  } else if (context.plan_type === 'run') {
    context.endurance_sport = 'running';
  } else if (context.plan_type === 'bike') {
    context.endurance_sport = 'cycling';
  }

  return context;
}

// Helper function to get user's local date
function getUserLocalDate(dateInput?: Date | string, userTimezone?: string): string {
  if (!dateInput) {
    return new Date().toLocaleDateString('en-CA');
  }
  
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  if (userTimezone) {
    try {
      return date.toLocaleDateString('en-CA', { timeZone: userTimezone });
    } catch (error) {
      console.log('Invalid timezone, using local time:', error);
    }
  }
  
  // Fallback to browser's local timezone
  return date.toLocaleDateString('en-CA');
}

// Helper function to normalize workout date
function normalizeWorkoutDate(workout: any, garminActivity?: any, userTimezone?: string): string {
  // Priority: workout.date > garminActivity.startTime > current date
  const dateSource = workout.date || garminActivity?.startTime || new Date().toISOString();
  
  return getUserLocalDate(dateSource, userTimezone);
}

// Helper function to check if two dates are the same day
function isSameDay(date1: string, date2: string, userTimezone?: string): boolean {
  return getUserLocalDate(date1, userTimezone) === getUserLocalDate(date2, userTimezone);
}

// Helper function to get analysis date range
function getAnalysisDateRange(daysBack: number = 7, userTimezone?: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  
  return {
    start: getUserLocalDate(start, userTimezone),
    end: getUserLocalDate(end, userTimezone)
  };
}

// Helper function to convert weight between units
function convertWeight(weight: number, fromUnit: string, toUnit: string): { value: number; unit: string } {
  if (fromUnit === toUnit) {
    return { value: weight, unit: toUnit };
  }
  
  // Convert to kg first, then to target unit
  let weightInKg = weight;
  if (fromUnit === 'lbs' || fromUnit === 'lb') {
    weightInKg = weight * 0.453592;
  }
  
  let convertedWeight = weightInKg;
  if (toUnit === 'lbs' || toUnit === 'lb') {
    convertedWeight = weightInKg / 0.453592;
  }
  
  return { value: Math.round(convertedWeight * 10) / 10, unit: toUnit };
}

// Helper function to parse strength exercises from string or array
function parseStrengthExercises(exercises: any): any[] {
  if (Array.isArray(exercises)) {
    return exercises;
  }
  
  if (typeof exercises === 'string') {
    try {
      return JSON.parse(exercises);
    } catch (error) {
      console.log('Failed to parse strength exercises string:', error);
      return [];
    }
  }
  
  return [];
}

// Helper function to extract enhanced plan metadata from workout and training plan
async function extractEnhancedPlanMetadata(
  plannedWorkout: any, 
  supabase: any, 
  userId: string, 
  weekNumber: number
): Promise<EnhancedPlanContext | null> {
  if (!plannedWorkout) return null;
  
  // Get training plan if available
  let trainingPlan = null;
  if (plannedWorkout.training_plan_id) {
    try {
      const { data: planData, error } = await supabase
        .from('training_plans')
        .select('*')
        .eq('id', plannedWorkout.training_plan_id)
        .single();
      
      if (!error && planData) {
        trainingPlan = planData;
      }
    } catch (error) {
      console.log('Failed to fetch training plan:', error);
    }
  }
  
  return extractEnhancedPlanContext(plannedWorkout, trainingPlan, weekNumber);
}

// Helper function to normalize planned exercise format
// Planned format: {name, sets: 4, reps: 5, weight: 85}
// Executed format: {name, sets: [{reps: 5, weight: 85}, ...]}
function normalizePlannedExercise(planned: any): any {
  // If already in executed format (has sets array), return as-is
  if (Array.isArray(planned.sets)) {
    return planned;
  }
  
  // Convert flat format to nested format
  const numSets = typeof planned.sets === 'number' ? planned.sets : 0;
  const reps = planned.reps || 0;
  const weight = typeof planned.weight === 'number' ? planned.weight : 0;
  const durationSeconds = planned.duration_seconds || null;
  const rir = planned.rir || null;
  
  // Create array of sets
  const sets = [];
  for (let i = 0; i < numSets; i++) {
    sets.push({
      reps: reps,
      weight: weight,
      duration_seconds: durationSeconds,
      rir: rir,
      completed: false // Planned sets are not completed
    });
  }
  
  return {
    ...planned,
    sets: sets
  };
}

// Helper function to match exercises between planned and executed
function matchExercises(plannedExercises: any[], executedExercises: any[]): any[] {
  const matches: any[] = [];
  
  for (const planned of plannedExercises) {
    // Normalize planned exercise to match executed format
    const normalizedPlanned = normalizePlannedExercise(planned);
    
    const executed = executedExercises.find(exec => 
      exec.name.toLowerCase().trim() === planned.name.toLowerCase().trim()
    );
    
    if (executed) {
      matches.push({
        name: planned.name,
        planned: normalizedPlanned, // Use normalized version
        executed: executed,
        matched: true
      });
    } else {
      matches.push({
        name: planned.name,
        planned: normalizedPlanned, // Use normalized version
        executed: null,
        matched: false
      });
    }
  }
  
  // Add any executed exercises that weren't planned
  for (const executed of executedExercises) {
    const alreadyMatched = matches.some(match => 
      match.name.toLowerCase().trim() === executed.name.toLowerCase().trim()
    );
    
    if (!alreadyMatched) {
      matches.push({
        name: executed.name,
        planned: null,
        executed: executed,
        matched: false
      });
    }
  }
  
  return matches;
}

// Helper function to calculate exercise adherence
function calculateExerciseAdherence(match: any, userUnits: string, planUnits: string): any {
  if (!match.matched || !match.planned || !match.executed) {
    return {
      set_completion: 0,
      weight_progression: 0,
      rir_adherence: null,
      volume_completion: 0
    };
  }
  
  const planned = match.planned;
  const executed = match.executed;
  
  // Parse sets
  const plannedSets = Array.isArray(planned.sets) ? planned.sets : [];
  const executedSets = Array.isArray(executed.sets) ? executed.sets : [];
  
  // Filter completed sets - a set is considered completed if:
  // 1. Explicitly marked as completed=true, OR
  // 2. Has reps/weight data indicating it was performed
  const completedSets = executedSets.filter((set: any) => {
    return set.completed === true || 
           (set.reps != null && set.reps > 0) || 
           (set.weight != null && set.weight > 0) ||
           (set.duration_seconds != null && set.duration_seconds > 0);
  });
  
  // Calculate set completion
  // If no planned sets, but we have executed sets with data, consider it 100% (freestyle workout)
  const setCompletion = plannedSets.length > 0 ? 
    (completedSets.length / plannedSets.length) * 100 : 
    (completedSets.length > 0 ? 100 : 0);
  
  // Calculate weight progression
  let weightProgression = 0;
  if (plannedSets.length > 0 && completedSets.length > 0) {
    const plannedWeight = plannedSets[0].weight || 0;
    const executedWeight = completedSets[0].weight || 0;
    
    // Convert weights to same unit for comparison
    const plannedConverted = convertWeight(plannedWeight, planUnits, userUnits);
    const executedConverted = convertWeight(executedWeight, userUnits, userUnits);
    
    weightProgression = plannedWeight > 0 ? 
      ((executedConverted.value - plannedConverted.value) / plannedConverted.value) * 100 : 0;
  }
  
  // Calculate RIR adherence and analysis
  let rirAdherence: number | null = null;
  let avgExecutedRIR: number | null = null;
  let rirConsistency: number | null = null;
  
  // Get planned RIR (if any)
  const plannedRIR = plannedSets.find((set: any) => set.rir !== null && set.rir !== undefined);
  
  // Get executed RIR data
  const executedRIRSets = completedSets.filter((set: any) => set.rir !== null && set.rir !== undefined);
  
  if (executedRIRSets.length > 0) {
    // Calculate average RIR
    avgExecutedRIR = executedRIRSets.reduce((sum: number, set: any) => sum + set.rir, 0) / executedRIRSets.length;
    
    // Calculate RIR consistency (standard deviation)
    const variance = executedRIRSets.reduce((sum: number, set: any) => 
      sum + Math.pow(set.rir - avgExecutedRIR!, 2), 0) / executedRIRSets.length;
    rirConsistency = Math.sqrt(variance);
    
    // Calculate adherence to planned RIR
    if (plannedRIR && avgExecutedRIR !== null) {
      rirAdherence = Math.abs(avgExecutedRIR - plannedRIR.rir);
    }
  }
  
  // Calculate volume completion
  const plannedVolume = plannedSets.reduce((sum: number, set: any) => 
    sum + ((set.reps || 0) * (set.weight || 0)), 0);
  const executedVolume = completedSets.reduce((sum: number, set: any) => 
    sum + ((set.reps || 0) * (set.weight || 0)), 0);
  
  const volumeCompletion = plannedVolume > 0 ? 
    (executedVolume / plannedVolume) * 100 : 0;
  
  return {
    set_completion: Math.round(setCompletion),
    weight_progression: Math.round(weightProgression * 10) / 10,
    rir_adherence: rirAdherence as number | null,
    avg_rir: avgExecutedRIR ? Math.round(avgExecutedRIR * 10) / 10 : null,
    rir_consistency: rirConsistency ? Math.round(rirConsistency * 10) / 10 : null,
    rir_sets_count: executedRIRSets.length,
    volume_completion: Math.round(volumeCompletion)
  };
}

// Helper function to get historical progression data
async function getStrengthProgression(
  supabase: any, 
  userId: string, 
  exerciseName: string, 
  currentDate: string, 
  userUnits: string
): Promise<any> {
  try {
    // Get last 8 weeks of strength workouts (reduced to 10 for faster queries)
    const { data: recentWorkouts, error } = await supabase
      .from('workouts')
      .select('id, date, strength_exercises, computed')
      .eq('user_id', userId)
      .eq('type', 'strength')
      .lt('date', currentDate)
      .order('date', { ascending: false })
      .limit(10); // Reduced from 20 to 10 for faster queries
    
    if (error) {
      console.log('Error fetching recent workouts:', error);
      return null;
    }
    
    if (!recentWorkouts || recentWorkouts.length === 0) {
      return null;
    }
    
    // Extract exercise data from each workout
    const exerciseHistory: any[] = [];
    
    for (const workout of recentWorkouts) {
      const exercises = parseStrengthExercises(workout.strength_exercises);
      const exercise = exercises.find((ex: any) => 
        ex.name.toLowerCase().trim() === exerciseName.toLowerCase().trim()
      );
      
      if (exercise && exercise.sets) {
        // A set is considered completed if explicitly marked OR has data indicating it was performed
        const completedSets = exercise.sets.filter((set: any) => {
          return set.completed === true || 
                 (set.reps != null && set.reps > 0) || 
                 (set.weight != null && set.weight > 0) ||
                 (set.duration_seconds != null && set.duration_seconds > 0);
        });
        if (completedSets.length > 0) {
          // Use actual weight from first set, not average (barbell training uses same weight per set)
          const actualWeight = completedSets.length > 0 ? (completedSets[0].weight || 0) : 0;
          
          if (actualWeight > 0) { // Only add if there's actual weight data
            exerciseHistory.push({
              date: workout.date,
              weight: actualWeight, // Use actual weight, not average
              unit: exercise.unit || 'lbs',
              sets: completedSets.length,
              reps: completedSets.length > 0 ? (completedSets[0].reps || 0) : 0 // Reps per set
            });
          }
        }
      }
    }
    
    if (exerciseHistory.length === 0) {
      return null;
    }
    
    // Calculate progression metrics
    const current = exerciseHistory[0];
    const lastSession = exerciseHistory[1];
    const fourWeekAvg = exerciseHistory.slice(0, 4).reduce((sum: number, item: any) => 
      sum + item.weight, 0) / Math.min(4, exerciseHistory.length);
    
    // Convert weights to user units for comparison
    const currentConverted = convertWeight(current.weight, current.unit, userUnits);
    const lastConverted = lastSession ? 
      convertWeight(lastSession.weight, lastSession.unit, userUnits) : null;
    const fourWeekConverted = convertWeight(fourWeekAvg, current.unit, userUnits);
    
    return {
      current_weight: currentConverted.value,
      current_weight_unit: currentConverted.unit,
      last_session: lastConverted ? {
        weight: lastConverted.value,
        weight_unit: lastConverted.unit,
        change: currentConverted.value - lastConverted.value,
        change_unit: currentConverted.unit,
        change_direction: currentConverted.value > lastConverted.value ? 'up' : 'down'
      } : null,
      four_week_avg: {
        weight: fourWeekConverted.value,
        weight_unit: fourWeekConverted.unit,
        change: currentConverted.value - fourWeekConverted.value,
        change_unit: currentConverted.unit,
        change_direction: currentConverted.value > fourWeekConverted.value ? 'up' : 'down'
      },
      trend: currentConverted.value > fourWeekConverted.value ? 'improving' : 'declining',
      status: Math.abs(currentConverted.value - fourWeekConverted.value) > 5 ? 'progress' : 'stable'
    };
    
  } catch (error) {
    console.log('Error calculating strength progression:', error);
    return null;
  }
}

/**
 * Generate comprehensive exercise-by-exercise breakdown
 */
function generateExerciseBreakdown(
  exerciseAdherence: any[],
  userUnits: string,
  planUnits: string
): any[] {
  // Include ALL exercises that were executed (not just matched ones)
  // This ensures exercises like Nordic Curls that weren't planned still appear
  return exerciseAdherence
    .filter(ex => ex.executed) // Only require executed, not matched
    .map(ex => {
      const planned = ex.planned;
      const executed = ex.executed;
      const adherence = ex.adherence;
      
      const plannedSets = Array.isArray(planned.sets) ? planned.sets : [];
      const executedSets = Array.isArray(executed.sets) ? executed.sets : [];
      // A set is considered completed if explicitly marked OR has data indicating it was performed
      const completedSets = executedSets.filter((s: any) => {
        return s.completed === true || 
               (s.reps != null && s.reps > 0) || 
               (s.weight != null && s.weight > 0) ||
               (s.duration_seconds != null && s.duration_seconds > 0);
      });
      
      // Detect if this is a time-based exercise (planks, wall sits, etc.)
      const isTimeBased = ex.name.toLowerCase().includes('plank') || 
                          ex.name.toLowerCase().includes('wall sit') ||
                          ex.name.toLowerCase().includes('hold') ||
                          completedSets.some((s: any) => s.duration_seconds && s.duration_seconds > 0 && (!s.reps || s.reps === 0));
      
      // Calculate planned vs actual metrics
      let plannedReps = 0;
      let actualReps = 0;
      let plannedDuration = 0;
      let actualDuration = 0;
      
      // Get per-set values for display (not totals)
      let plannedRepsPerSet = 0;
      let actualRepsPerSet = 0;
      let plannedDurationPerSet = 0;
      let actualDurationPerSet = 0;
      
      if (isTimeBased) {
        // For time-based exercises, use duration per set
        plannedDurationPerSet = plannedSets.length > 0 
          ? (plannedSets[0].duration_seconds || plannedSets[0].reps || 0) // Some plans store duration as "reps"
          : 0;
        actualDurationPerSet = completedSets.length > 0 
          ? (completedSets[0].duration_seconds || 0)
          : 0;
        // For display, show total duration but note it's per-set
        plannedDuration = plannedSets.reduce((sum: number, s: any) => sum + (s.duration_seconds || s.reps || 0), 0);
        actualDuration = completedSets.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0);
        plannedReps = plannedSets.length; // Count sets for time-based
        actualReps = completedSets.length; // Count sets for time-based
      } else {
        // For rep-based exercises, get reps per set (not total)
        plannedRepsPerSet = plannedSets.length > 0 ? (plannedSets[0].reps || 0) : 0;
        actualRepsPerSet = completedSets.length > 0 ? (completedSets[0].reps || 0) : 0;
        // Also calculate totals for adherence
        plannedReps = plannedSets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0);
        actualReps = completedSets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0);
      }
      
      const plannedWeight = plannedSets.length > 0 ? plannedSets[0].weight || 0 : 0;
      let actualWeight = completedSets.length > 0 ? completedSets[0].weight || 0 : 0;
      
      // For time-based exercises (planks), show "Bodyweight" instead of weight
      if (isTimeBased && actualWeight < 10) {
        actualWeight = 0; // Will be displayed as "Bodyweight"
      }
      
      // Calculate volumes - exclude time-based exercises from volume calculation
      const plannedVolume = isTimeBased ? 0 : plannedSets.reduce((sum: number, s: any) => 
        sum + ((s.reps || 0) * (s.weight || 0)), 0);
      const actualVolume = isTimeBased ? 0 : completedSets.reduce((sum: number, s: any) => 
        sum + ((s.reps || 0) * (s.weight || 0)), 0);
      
      // Get RIR data
      const plannedRIR = plannedSets.find((s: any) => s.rir != null)?.rir || null;
      const executedRIRs = completedSets
        .filter((s: any) => s.rir != null)
        .map((s: any) => s.rir);
      const avgRIR = executedRIRs.length > 0 
        ? executedRIRs.reduce((sum: number, r: number) => sum + r, 0) / executedRIRs.length 
        : null;
      
      // Calculate performance score (weight adherence 50%, RIR adherence 30%, set completion 20%)
      const weightScore = Math.max(0, 100 - Math.abs(adherence.weight_progression || 0));
      let performanceScore = 0;
      if (adherence.set_completion > 0) {
        const rirScore = adherence.rir_adherence != null 
          ? Math.max(0, 100 - (adherence.rir_adherence * 20)) // RIR diff of 1 = 20% penalty
          : 50; // Neutral if no RIR data
        performanceScore = (weightScore * 0.5) + (rirScore * 0.3) + (adherence.set_completion * 0.2);
      }
      
      return {
        name: ex.name,
        is_time_based: isTimeBased,
        planned: {
          sets: plannedSets.length,
          reps: plannedReps, // Total reps for adherence calculation
          reps_per_set: plannedRepsPerSet, // Per-set reps for display
          duration_seconds: plannedDuration, // Total duration
          duration_per_set: plannedDurationPerSet, // Per-set duration for display
          weight: plannedWeight,
          volume: plannedVolume,
          rir: plannedRIR
        },
        actual: {
          sets: completedSets.length,
          reps: actualReps, // Total reps for adherence calculation
          reps_per_set: actualRepsPerSet, // Per-set reps for display
          duration_seconds: actualDuration, // Total duration
          duration_per_set: actualDurationPerSet, // Per-set duration for display
          weight: actualWeight,
          volume: actualVolume,
          avg_rir: avgRIR,
          rir_values: executedRIRs
        },
        adherence: {
          set_completion: adherence.set_completion,
          load_adherence: weightScore, // Percentage based on weight difference
          rir_adherence: adherence.rir_adherence,
          volume_completion: adherence.volume_completion
        },
        performance_score: Math.round(performanceScore)
      };
    });
}

/**
 * Analyze RIR progression across sets for each exercise
 */
function analyzeRIRProgressionAcrossSets(exerciseAdherence: any[]): any {
  const rirPatterns: any[] = [];
  
  for (const ex of exerciseAdherence) {
    if (!ex.matched || !ex.executed) continue;
    
    const executedSets = Array.isArray(ex.executed.sets) ? ex.executed.sets : [];
    const completedSets = executedSets.filter((s: any) => s.completed && s.rir != null);
    
    if (completedSets.length < 2) continue; // Need at least 2 sets with RIR
    
    const rirValues = completedSets.map((s: any) => s.rir);
    const firstRIR = rirValues[0];
    const lastRIR = rirValues[rirValues.length - 1];
    const rirChange = lastRIR - firstRIR; // Positive = getting easier, negative = getting harder
    
    // Determine pattern
    let pattern = 'consistent';
    if (rirChange < -1) {
      pattern = 'increasing difficulty';
    } else if (rirChange > 1) {
      pattern = 'decreasing difficulty';
    } else if (Math.abs(rirChange) <= 1) {
      pattern = 'consistent';
    }
    
    rirPatterns.push({
      exercise_name: ex.name,
      rir_progression: rirValues.join(' → '),
      first_rir: firstRIR,
      last_rir: lastRIR,
      rir_change: rirChange,
      pattern: pattern,
      assessment: getRIRPatternAssessment(pattern, rirChange, rirValues.length)
    });
  }
  
  return {
    available: rirPatterns.length > 0,
    patterns: rirPatterns
  };
}

function getRIRPatternAssessment(pattern: string, rirChange: number, setCount: number): string {
  if (pattern === 'increasing difficulty') {
    return 'Good fatigue management. RIR decreased appropriately showing controlled stress accumulation.';
  } else if (pattern === 'decreasing difficulty') {
    return 'RIR increasing across sets may indicate insufficient load or incomplete effort. Consider increasing weight.';
  } else {
    return 'Very consistent RIR. May indicate load could be increased (RIR not changing suggests insufficient stress).';
  }
}

/**
 * Analyze volume and intensity distribution
 */
function analyzeVolumeAndIntensity(
  exerciseAdherence: any[],
  userUnits: string
): any {
  const matchedExercises = exerciseAdherence.filter(ex => ex.matched && ex.executed);
  
  let totalVolume = 0;
  const exerciseVolumes: any[] = [];
  const muscleGroups: Record<string, number> = {};
  
  for (const ex of matchedExercises) {
    // Skip time-based exercises from volume calculation
    const isTimeBased = ex.name?.toLowerCase().includes('plank') || 
                        ex.name?.toLowerCase().includes('wall sit') ||
                        ex.name?.toLowerCase().includes('hold') ||
                        (ex.executed && Array.isArray(ex.executed.sets) && 
                         ex.executed.sets.some((s: any) => s.duration_seconds && s.duration_seconds > 0 && (!s.reps || s.reps === 0)));
    
    if (isTimeBased) continue; // Time-based exercises don't contribute to volume
    
    const executedSets = Array.isArray(ex.executed.sets) ? ex.executed.sets : [];
    const completedSets = executedSets.filter((s: any) => {
      return s.completed === true || 
             (s.reps != null && s.reps > 0) || 
             (s.weight != null && s.weight > 0) ||
             (s.duration_seconds != null && s.duration_seconds > 0);
    });
    
    const exerciseVolume = completedSets.reduce((sum: number, s: any) => 
      sum + ((s.reps || 0) * (s.weight || 0)), 0);
    
    totalVolume += exerciseVolume;
    exerciseVolumes.push({
      name: ex.name,
      volume: exerciseVolume,
      percentage: 0 // Will calculate after total
    });
    
    // Categorize by muscle group (simple heuristic)
    const name = ex.name.toLowerCase();
    if (name.includes('squat') || name.includes('lunge') || name.includes('leg press')) {
      muscleGroups['knee_dominant'] = (muscleGroups['knee_dominant'] || 0) + exerciseVolume;
    } else if (name.includes('deadlift') || name.includes('hip') || name.includes('rdl') || name.includes('nordic')) {
      muscleGroups['hip_dominant'] = (muscleGroups['hip_dominant'] || 0) + exerciseVolume;
    } else if (name.includes('press') || name.includes('bench') || name.includes('shoulder')) {
      muscleGroups['upper_push'] = (muscleGroups['upper_push'] || 0) + exerciseVolume;
    } else if (name.includes('row') || name.includes('pull') || name.includes('lat')) {
      muscleGroups['upper_pull'] = (muscleGroups['upper_pull'] || 0) + exerciseVolume;
    } else {
      muscleGroups['other'] = (muscleGroups['other'] || 0) + exerciseVolume;
    }
  }
  
  // Calculate percentages
  exerciseVolumes.forEach(ev => {
    ev.percentage = totalVolume > 0 ? (ev.volume / totalVolume) * 100 : 0;
  });
  
  // Calculate muscle group percentages
  const muscleGroupPercentages: Record<string, number> = {};
  for (const [group, volume] of Object.entries(muscleGroups)) {
    muscleGroupPercentages[group] = totalVolume > 0 ? (volume / totalVolume) * 100 : 0;
  }
  
  return {
    total_volume: totalVolume,
    exercise_volumes: exerciseVolumes,
    muscle_group_distribution: muscleGroupPercentages,
    assessment: generateVolumeAssessment(muscleGroupPercentages, totalVolume)
  };
}

function generateVolumeAssessment(muscleGroups: Record<string, number>, totalVolume: number): string {
  const kneeDom = muscleGroups['knee_dominant'] || 0;
  const hipDom = muscleGroups['hip_dominant'] || 0;
  
  if (kneeDom > 0 && hipDom > 0) {
    const ratio = kneeDom / hipDom;
    if (ratio > 1.5) {
      return 'Knee-dominant focus. Consider adding more hip-dominant work for balance.';
    } else if (ratio < 0.67) {
      return 'Hip-dominant focus. Good posterior chain emphasis.';
    } else {
      return 'Good balance between knee and hip dominant movements.';
    }
  }
  
  return 'Volume distribution analysis available.';
}

/**
 * Check data quality issues
 */
function checkDataQuality(exerciseAdherence: any[], executedExercises: any[]): any {
  const issues: any[] = [];
  
  for (const ex of exerciseAdherence) {
    if (!ex.executed) continue;
    
    const executedSets = Array.isArray(ex.executed.sets) ? ex.executed.sets : [];
    // Use same completedSets logic as elsewhere - check for completed OR has data
    const completedSets = executedSets.filter((s: any) => {
      return s.completed === true || 
             (s.reps != null && s.reps > 0) || 
             (s.weight != null && s.weight > 0) ||
             (s.duration_seconds != null && s.duration_seconds > 0);
    });
    
    // Check for missing RIR data
    const setsWithRIR = completedSets.filter((s: any) => s.rir != null && s.rir !== undefined);
    if (completedSets.length > 0 && setsWithRIR.length < completedSets.length) {
      issues.push({
        exercise: ex.name,
        type: 'missing_rir',
        severity: 'warning',
        message: `Missing RIR data for ${completedSets.length - setsWithRIR.length} of ${completedSets.length} sets`
      });
    }
    
    // Check for suspiciously low weights (might be bodyweight or logging error)
    const avgWeight = completedSets.length > 0
      ? completedSets.reduce((sum: number, s: any) => sum + (s.weight || 0), 0) / completedSets.length
      : 0;
    
    if (avgWeight > 0 && avgWeight < 5 && !ex.name.toLowerCase().includes('bodyweight')) {
      issues.push({
        exercise: ex.name,
        type: 'low_weight',
        severity: 'info',
        message: `Average weight is ${avgWeight} lbs - verify if this is bodyweight or if logging needs correction`
      });
    }
    
    // Check for time-based exercises logged as reps
    const hasDuration = completedSets.some((s: any) => s.duration_seconds && s.duration_seconds > 0);
    const hasReps = completedSets.some((s: any) => s.reps && s.reps > 0);
    
    if (hasDuration && hasReps && ex.name.toLowerCase().includes('plank')) {
      issues.push({
        exercise: ex.name,
        type: 'time_based_exercise',
        severity: 'info',
        message: 'Time-based exercise (plank) - ensure duration is logged, not reps'
      });
    }
  }
  
  return {
    available: issues.length > 0,
    issues: issues,
    summary: issues.length === 0 
      ? 'All data complete' 
      : `${issues.length} data quality ${issues.length === 1 ? 'issue' : 'issues'} detected`
  };
}

/**
 * Calculate comprehensive execution summary
 */
function calculateExecutionSummary(
  exerciseAdherence: any[],
  overallAdherence: any,
  workout: any,
  volumeAnalysis: any
): any {
  const matchedExercises = exerciseAdherence.filter(ex => ex.matched);
  
  // Calculate total reps (excluding time-based exercises)
  let totalRepsPlanned = 0;
  let totalRepsExecuted = 0;
  
  for (const ex of matchedExercises) {
    // Check if this is a time-based exercise
    const isTimeBased = ex.name?.toLowerCase().includes('plank') || 
                        ex.name?.toLowerCase().includes('wall sit') ||
                        ex.name?.toLowerCase().includes('hold') ||
                        (ex.executed && Array.isArray(ex.executed.sets) && 
                         ex.executed.sets.some((s: any) => s.duration_seconds && s.duration_seconds > 0 && (!s.reps || s.reps === 0)));
    
    // Skip time-based exercises from rep counting
    if (isTimeBased) continue;
    
    if (ex.planned && Array.isArray(ex.planned.sets)) {
      totalRepsPlanned += ex.planned.sets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0);
    }
    if (ex.executed && Array.isArray(ex.executed.sets)) {
      // A set is considered completed if explicitly marked OR has data indicating it was performed
      const completedSets = ex.executed.sets.filter((s: any) => {
        return s.completed === true || 
               (s.reps != null && s.reps > 0) || 
               (s.weight != null && s.weight > 0) ||
               (s.duration_seconds != null && s.duration_seconds > 0);
      });
      totalRepsExecuted += completedSets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0);
    }
  }
  
  // Calculate average rest time (if available in workout metadata)
  // This would need to be calculated from timestamps if available
  
  // Calculate overall execution score
  const exerciseCompletion = overallAdherence.exercise_completion_rate || 0;
  const setCompletion = overallAdherence.set_completion_rate || 0;
  const loadAdherence = matchedExercises.length > 0
    ? matchedExercises.reduce((sum: number, ex: any) => {
        const weightScore = Math.max(0, 100 - Math.abs(ex.adherence.weight_progression || 0));
        return sum + weightScore;
      }, 0) / matchedExercises.length
    : 0;
  const rirAdherence = matchedExercises.filter(ex => ex.adherence.rir_adherence != null).length > 0
    ? matchedExercises
        .filter(ex => ex.adherence.rir_adherence != null)
        .reduce((sum: number, ex: any) => {
          const rirScore = Math.max(0, 100 - (ex.adherence.rir_adherence * 20));
          return sum + rirScore;
        }, 0) / matchedExercises.filter(ex => ex.adherence.rir_adherence != null).length
    : 100; // Default to 100% if no RIR data
  
  const overallExecution = (exerciseCompletion * 0.3) + 
                          (setCompletion * 0.2) + 
                          (loadAdherence * 0.3) + 
                          (rirAdherence * 0.2);
  
  return {
    exercises_completed: overallAdherence?.exercises_executed || 0,
    exercises_planned: overallAdherence?.exercises_planned || 0,
    sets_completed: overallAdherence?.sets_executed || 0,
    sets_planned: overallAdherence?.sets_planned || 0,
    reps_completed: totalRepsExecuted,
    reps_planned: totalRepsPlanned,
    total_volume: volumeAnalysis?.total_volume || 0,
    session_duration: Math.round(workout?.duration || 0),
    exercise_completion_rate: exerciseCompletion,
    set_completion_rate: setCompletion,
    rep_completion_rate: totalRepsPlanned > 0 ? (totalRepsExecuted / totalRepsPlanned) * 100 : 0,
    load_adherence: loadAdherence,
    rir_adherence: rirAdherence,
    overall_execution: Math.round(overallExecution)
  };
}

// Helper function to analyze Session RPE data
function analyzeSessionRPE(sessionRPE: number | null): any {
  if (sessionRPE === null || sessionRPE === undefined) {
    return null;
  }
  
  return {
    value: sessionRPE,
    intensity_level: sessionRPE <= 3 ? 'Light' :
                   sessionRPE <= 5 ? 'Moderate' :
                   sessionRPE <= 7 ? 'Hard' :
                   sessionRPE <= 9 ? 'Very Hard' : 'Maximal',
    is_high_intensity: sessionRPE >= 8,
    is_low_intensity: sessionRPE <= 4
  };
}

// Helper function to analyze Readiness Check data
function analyzeReadinessCheck(readiness: any): any {
  if (!readiness || typeof readiness !== 'object') {
    return null;
  }
  
  const { energy, soreness, sleep } = readiness;
  
  if (energy === undefined && soreness === undefined && sleep === undefined) {
    return null;
  }
  
  return {
    energy: energy || null,
    soreness: soreness || null,
    sleep: sleep || null,
    energy_level: energy ? (energy >= 8 ? 'High' : energy >= 6 ? 'Moderate' : 'Low') : null,
    soreness_level: soreness ? (soreness <= 2 ? 'Low' : soreness <= 5 ? 'Moderate' : 'High') : null,
    sleep_quality: sleep ? (sleep >= 8 ? 'Excellent' : sleep >= 7 ? 'Good' : sleep >= 6 ? 'Fair' : 'Poor') : null,
    overall_readiness: calculateOverallReadiness(energy, soreness, sleep)
  };
}

// Helper function to calculate overall readiness score
function calculateOverallReadiness(energy: number | null, soreness: number | null, sleep: number | null): string | null {
  const scores: number[] = [];
  
  if (energy !== null) {
    scores.push(energy / 10);
  }
  if (soreness !== null) {
    scores.push((10 - soreness) / 10); // Invert soreness (lower is better)
  }
  if (sleep !== null) {
    scores.push(sleep / 12); // Normalize sleep to 0-1 scale
  }
  
  if (scores.length === 0) return null;
  
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  
  if (avgScore >= 0.8) return 'Excellent';
  if (avgScore >= 0.6) return 'Good';
  if (avgScore >= 0.4) return 'Fair';
  return 'Poor';
}

// Main strength workout analysis function
async function analyzeStrengthWorkout(workout: any, plannedWorkout: any, userBaselines: any, supabase: any): Promise<any> {
  console.log('🔍 STRENGTH ANALYSIS START');
  console.log('🔍 Workout data:', {
    id: workout?.id,
    type: workout?.type,
    has_strength_exercises: !!workout?.strength_exercises,
    strength_exercises_type: typeof workout?.strength_exercises,
    strength_exercises_preview: typeof workout?.strength_exercises === 'string' 
      ? workout.strength_exercises.substring(0, 100) 
      : Array.isArray(workout?.strength_exercises) 
        ? `Array(${workout.strength_exercises.length})` 
        : workout?.strength_exercises
  });
  
  // Parse strength exercises with error handling
  let executedExercises: any[] = [];
  try {
    executedExercises = parseStrengthExercises(workout?.strength_exercises);
  } catch (e) {
    console.error('❌ Failed to parse executed exercises:', e);
    throw new Error(`Failed to parse strength exercises: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  let plannedExercises: any[] = [];
  try {
    plannedExercises = plannedWorkout ? parseStrengthExercises(plannedWorkout.strength_exercises) : [];
  } catch (e) {
    console.warn('⚠️ Failed to parse planned exercises:', e);
    plannedExercises = [];
  }
  
  console.log(`🔍 STRENGTH DEBUG: Parsed ${executedExercises.length} executed exercises`);
  console.log(`🔍 PLANNED DEBUG: Parsed ${plannedExercises.length} planned exercises`);
  
  // Debug planned exercises structure
  if (plannedExercises.length > 0) {
    console.log(`🔍 PLANNED EXERCISE DEBUG:`, JSON.stringify(plannedExercises[0], null, 2));
  } else if (plannedWorkout) {
    console.log(`🔍 PLANNED WORKOUT DEBUG:`, {
      has_strength_exercises: !!plannedWorkout.strength_exercises,
      strength_exercises_type: typeof plannedWorkout.strength_exercises,
      strength_exercises_preview: typeof plannedWorkout.strength_exercises === 'string' 
        ? plannedWorkout.strength_exercises.substring(0, 200)
        : plannedWorkout.strength_exercises
    });
  }
  
  if (executedExercises.length === 0) {
    return {
      status: 'no_data',
      message: 'No strength exercises found in workout'
    };
  }
  
  // Get user units preference
  const userUnits = userBaselines.units || 'imperial';
  const planUnits = plannedWorkout?.units || 'imperial';
  
  console.log(`🔍 UNITS DEBUG: User units: ${userUnits}, Plan units: ${planUnits}`);
  
  // Extract week number for context
  const weekNumber = plannedWorkout?.week_number || 1;
  
  // Extract enhanced plan metadata
  const planMetadata = await extractEnhancedPlanMetadata(
    plannedWorkout, 
    supabase, 
    workout.user_id, 
    weekNumber
  );
  console.log('📋 ENHANCED PLAN CONTEXT:', planMetadata);
  
  // Match exercises between planned and executed
  const exerciseMatches = matchExercises(plannedExercises, executedExercises);
  console.log(`🔍 EXERCISE MATCHES: ${exerciseMatches.length} total, ${exerciseMatches.filter(m => m.matched).length} matched`);
  
  // Calculate adherence for each exercise
  const exerciseAdherence = exerciseMatches.map(match => {
    const adherence = calculateExerciseAdherence(match, userUnits, planUnits);
    return {
      name: match.name,
      planned: match.planned,
      executed: match.executed,
      adherence: adherence,
      matched: match.matched
    };
  });
  
  // Calculate overall adherence
  const matchedExercises = exerciseAdherence.filter(ex => ex.matched);
  const overallAdherence = {
    exercises_planned: plannedExercises.length,
    exercises_executed: executedExercises.length,
    exercise_completion_rate: plannedExercises.length > 0 ? 
      (matchedExercises.length / plannedExercises.length) * 100 : 0,
    sets_planned: plannedExercises.reduce((sum: number, ex: any) => 
      sum + (Array.isArray(ex.sets) ? ex.sets.length : 0), 0),
    sets_executed: executedExercises.reduce((sum: number, ex: any) => {
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      // Count sets that are completed OR have reps/weight data (indicating they were performed)
      const completedCount = sets.filter((set: any) => {
        // Set is completed if explicitly marked, OR if it has reps/weight data
        return set.completed === true || 
               (set.reps != null && set.reps > 0) || 
               (set.weight != null && set.weight > 0) ||
               (set.duration_seconds != null && set.duration_seconds > 0);
      }).length;
      return sum + completedCount;
    }, 0),
    set_completion_rate: (() => {
      // Calculate set completion rate directly from executed exercises
      const totalPlannedSets = plannedExercises.reduce((sum: number, ex: any) => 
        sum + (Array.isArray(ex.sets) ? ex.sets.length : 0), 0);
      const totalCompletedSets = executedExercises.reduce((sum: number, ex: any) => {
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        const completedCount = sets.filter((set: any) => {
          return set.completed === true || 
                 (set.reps != null && set.reps > 0) || 
                 (set.weight != null && set.weight > 0) ||
                 (set.duration_seconds != null && set.duration_seconds > 0);
        }).length;
        return sum + completedCount;
      }, 0);
      return totalPlannedSets > 0 ? (totalCompletedSets / totalPlannedSets) * 100 : (totalCompletedSets > 0 ? 100 : 0);
    })(),
    weight_progression: 0,
    volume_completion: 0
  };
  
  if (matchedExercises.length > 0) {
    // Recalculate set_completion_rate from actual data, don't rely on individual adherence values
    const totalPlannedSets = matchedExercises.reduce((sum: number, ex: any) => 
      sum + (Array.isArray(ex.planned?.sets) ? ex.planned.sets.length : 0), 0);
    const totalCompletedSets = matchedExercises.reduce((sum: number, ex: any) => {
      const sets = Array.isArray(ex.executed?.sets) ? ex.executed.sets : [];
      const completedCount = sets.filter((set: any) => {
        return set.completed === true || 
               (set.reps != null && set.reps > 0) || 
               (set.weight != null && set.weight > 0) ||
               (set.duration_seconds != null && set.duration_seconds > 0);
      }).length;
      return sum + completedCount;
    }, 0);
    overallAdherence.set_completion_rate = totalPlannedSets > 0 
      ? (totalCompletedSets / totalPlannedSets) * 100 
      : (totalCompletedSets > 0 ? 100 : 0);
    overallAdherence.weight_progression = matchedExercises.reduce((sum: number, ex: any) => 
      sum + ex.adherence.weight_progression, 0) / matchedExercises.length;
    overallAdherence.volume_completion = matchedExercises.reduce((sum: number, ex: any) => 
      sum + ex.adherence.volume_completion, 0) / matchedExercises.length;
  }
  
  // Get historical progression for each exercise (enhanced with 4-week history)
  // Parallelize queries for better performance
  const progressionPromises = executedExercises.map(exercise => 
    getStrengthProgression(
      supabase, 
      workout.user_id, 
      exercise.name, 
      workout.date, 
      userUnits
    )
  );
  
  const progressionResults = await Promise.all(progressionPromises);
  const progressionData: any = {};
  executedExercises.forEach((exercise, index) => {
    if (progressionResults[index]) {
      progressionData[exercise.name] = progressionResults[index];
    }
  });
  
  console.log(`📊 PROGRESSION: Analyzed ${Object.keys(progressionData).length} exercises`);
  
  // Generate comprehensive exercise-by-exercise breakdown
  let exerciseBreakdown: any[] = [];
  try {
    exerciseBreakdown = generateExerciseBreakdown(exerciseAdherence, userUnits, planUnits);
  } catch (e) {
    console.error('❌ Error generating exercise breakdown:', e);
    exerciseBreakdown = [];
  }
  
  // Analyze RIR progression across sets for each exercise
  let rirProgression: any = null;
  try {
    rirProgression = analyzeRIRProgressionAcrossSets(exerciseAdherence);
  } catch (e) {
    console.error('❌ Error analyzing RIR progression:', e);
    rirProgression = null;
  }
  
  // Analyze volume and intensity distribution
  let volumeAnalysis: any = { total_volume: 0, muscle_group_distribution: {}, assessment: 'Unable to calculate' };
  try {
    volumeAnalysis = analyzeVolumeAndIntensity(exerciseAdherence, userUnits);
  } catch (e) {
    console.error('❌ Error analyzing volume and intensity:', e);
    volumeAnalysis = { total_volume: 0, muscle_group_distribution: {}, assessment: 'Unable to calculate' };
  }
  
  // Check data quality
  let dataQuality: any = { available: false, issues: [] };
  try {
    dataQuality = checkDataQuality(exerciseAdherence, executedExercises);
  } catch (e) {
    console.error('❌ Error checking data quality:', e);
    dataQuality = { available: false, issues: [] };
  }
  
  // Calculate comprehensive execution summary
  let executionSummary: any = null;
  try {
    executionSummary = calculateExecutionSummary(
      exerciseAdherence, 
      overallAdherence, 
      workout,
      volumeAnalysis
    );
  } catch (e) {
    console.error('❌ Error calculating execution summary:', e);
    executionSummary = {
      exercises_completed: overallAdherence.exercises_executed || 0,
      exercises_planned: overallAdherence.exercises_planned || 0,
      sets_completed: overallAdherence.sets_executed || 0,
      sets_planned: overallAdherence.sets_planned || 0,
      total_volume: 0,
      session_duration: Math.round(workout.duration || 0),
      exercise_completion_rate: overallAdherence.exercise_completion_rate || 0,
      set_completion_rate: overallAdherence.set_completion_rate || 0,
      rep_completion_rate: 0,
      load_adherence: 0,
      rir_adherence: 0,
      overall_execution: 0
    };
  }
  
  // Analyze Session RPE and Readiness data (from unified workout_metadata)
  // Parse workout_metadata if it's a string (JSONB from database)
  let workoutMetadata: any = {};
  try {
    if (typeof workout.workout_metadata === 'string') {
      workoutMetadata = JSON.parse(workout.workout_metadata);
    } else if (workout.workout_metadata && typeof workout.workout_metadata === 'object') {
      workoutMetadata = workout.workout_metadata;
    }
  } catch (e) {
    console.warn('Failed to parse workout_metadata:', e);
    workoutMetadata = {};
  }
  
  const sessionRPE = workoutMetadata.session_rpe ?? workout.session_rpe ?? null;
  const readiness = workoutMetadata.readiness ?? workout.readiness ?? null;
  const sessionRPEData = analyzeSessionRPE(sessionRPE);
  const readinessData = analyzeReadinessCheck(readiness);
  
  console.log(`📊 SESSION RPE: ${sessionRPEData ? 'Available' : 'Not provided'}`);
  console.log(`📊 READINESS: ${readinessData ? 'Available' : 'Not provided'}`);
  
  // Generate enhanced insights using GPT-4
  const insights = await generateEnhancedStrengthInsights(
    workout, 
    exerciseAdherence, 
    overallAdherence, 
    progressionData, 
    planMetadata, 
    userUnits,
    sessionRPEData,
    readinessData,
    executionSummary,
    exerciseBreakdown,
    rirProgression,
    volumeAnalysis,
    dataQuality
  );
  
  return {
    status: 'success',
    exercise_adherence: exerciseAdherence,
    overall_adherence: overallAdherence,
    progression_data: progressionData,
    plan_metadata: planMetadata,
    session_rpe: sessionRPEData,
    readiness: readinessData,
    insights: insights,
    units: userUnits,
    // New comprehensive analysis sections
    execution_summary: executionSummary,
    exercise_breakdown: exerciseBreakdown,
    rir_progression: rirProgression,
    volume_analysis: volumeAnalysis,
    data_quality: dataQuality
  };
}

// Generate enhanced strength-specific insights using GPT-4
async function generateEnhancedStrengthInsights(
  workout: any,
  exerciseAdherence: any[],
  overallAdherence: any,
  progressionData: any,
  planMetadata: EnhancedPlanContext | null,
  userUnits: string,
  sessionRPEData: any,
  readinessData: any,
  executionSummary: any,
  exerciseBreakdown: any[],
  rirProgression: any,
  volumeAnalysis: any,
  dataQuality: any
): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return ['AI analysis not available - please set up OpenAI API key'];
  }
  
  // Build enhanced context for GPT-4
  let context = `STRENGTH WORKOUT ANALYSIS

WORKOUT DETAILS:
- Date: ${workout.date}
- Type: ${workout.type}
- Duration: ${Math.round(workout.duration || 0)} minutes

PLANNED WORKOUT CONTEXT:`;
  
  if (planMetadata) {
    context += `
✅ THIS WORKOUT IS ATTACHED TO A PLAN:
- Plan Type: ${planMetadata.plan_type}
- Phase: ${planMetadata.phase} (Week ${planMetadata.week}/${planMetadata.total_weeks})
- Phase Focus: ${planMetadata.phase_focus}
- Progression Rate: ${(planMetadata.phase_progression_rate * 100).toFixed(1)}% per week
- Strength Type: ${planMetadata.strength_type}
- Endurance Integration: ${planMetadata.endurance_relationship}
- Weekly Focus: ${planMetadata.weekly_focus}
- Deload Week: ${planMetadata.deload_week ? 'Yes' : 'No'}`;
    
    if (planMetadata.key_workouts.length > 0) {
      context += `
- Key Workouts: ${planMetadata.key_workouts.join(', ')}`;
    }
    
    if (planMetadata.plan_notes) {
      context += `
- Plan Notes: ${planMetadata.plan_notes}`;
    }
    
    context += `
- Planned Exercises: ${overallAdherence.exercises_planned} exercises planned`;
  } else {
    context += `
⚠️ NO PLANNED WORKOUT: This workout was not attached to a planned workout. Analyze based on executed exercises only.`;
  }
  
  context += `

EXERCISE ADHERENCE:
- Exercises Planned: ${overallAdherence.exercises_planned}
- Exercises Executed: ${overallAdherence.exercises_executed}
- Exercise Completion Rate: ${overallAdherence.exercise_completion_rate.toFixed(1)}%
- Sets Planned: ${overallAdherence.sets_planned}
- Sets Executed (marked complete): ${overallAdherence.sets_executed}
- Set Completion Rate: ${overallAdherence.set_completion_rate.toFixed(1)}%
- Weight Progression: ${overallAdherence.weight_progression.toFixed(1)}%
- Volume Completion: ${overallAdherence.volume_completion.toFixed(1)}%

NOTE: "Sets Executed" counts only sets marked as "completed=true". If exercises were logged but sets weren't marked complete, this will be 0 even if the workout was performed.

EXERCISE DETAILS:`;
  
  for (const exercise of exerciseAdherence) {
    if (exercise.matched) {
      context += `
- ${exercise.name}: ${exercise.adherence.set_completion}% sets completed, ${exercise.adherence.weight_progression > 0 ? '+' : ''}${exercise.adherence.weight_progression}% weight change`;
      
      if (exercise.adherence.rir_adherence !== null) {
        context += `, RIR adherence: ${exercise.adherence.rir_adherence}`;
      }
    } else if (exercise.executed && !exercise.planned) {
      context += `
- ${exercise.name}: Added exercise (not planned)`;
    } else {
      context += `
- ${exercise.name}: Missed exercise (planned but not executed)`;
    }
  }
  
  context += `

HISTORICAL PROGRESSION DATA (from last 10 workouts):`;
  
  if (Object.keys(progressionData).length > 0) {
    for (const [exerciseName, progression] of Object.entries(progressionData)) {
      const prog = progression as any;
      context += `
- ${exerciseName}: Current weight ${prog.current_weight}${prog.current_weight_unit} (${prog.trend} trend)`;
      
      if (prog.last_session) {
        const change = prog.last_session.change;
        const changeStr = change > 0 ? `+${change}` : `${change}`;
        context += `, Last session: ${prog.last_session.weight}${prog.last_session.weight_unit} (${changeStr}${prog.last_session.weight_unit} ${prog.last_session.change_direction})`;
      }
      
      if (prog.four_week_avg) {
        const avgChange = prog.four_week_avg.change;
        const avgChangeStr = avgChange > 0 ? `+${avgChange}` : `${avgChange}`;
        context += `, 4-week avg: ${prog.four_week_avg.weight}${prog.four_week_avg.weight_unit} (${avgChangeStr}${prog.four_week_avg.weight_unit} vs avg)`;
      }
      
      context += `, Status: ${prog.status}`;
    }
  } else {
    context += `
- No historical data available (this may be first time performing these exercises)`;
  }
  
  // Add RIR analysis to context (summarized)
  const exercisesWithRIR = exerciseAdherence.filter(ex => ex.matched && ex.adherence.avg_rir !== null);
  if (exercisesWithRIR.length > 0) {
    const avgRIR = exercisesWithRIR.reduce((sum, ex) => sum + (ex.adherence.avg_rir || 0), 0) / exercisesWithRIR.length;
    context += `

RIR ANALYSIS:
- Exercises with RIR data: ${exercisesWithRIR.length}
- Average RIR across all exercises: ${avgRIR.toFixed(1)}`;
  } else {
    context += `

RIR ANALYSIS: No RIR data available`;
  }
  
  // Add Session RPE to context
  if (sessionRPEData) {
    context += `

SESSION RPE:
- Value: ${sessionRPEData.value}/10
- Intensity Level: ${sessionRPEData.intensity_level}
- High Intensity: ${sessionRPEData.is_high_intensity ? 'Yes' : 'No'}`;
  } else {
    context += `

SESSION RPE: Not provided`;
  }
  
  // Add Readiness Check to context
  if (readinessData) {
    context += `

READINESS CHECK:`;
    
    if (readinessData.energy !== null) {
      context += `
- Energy: ${readinessData.energy}/10 (${readinessData.energy_level})`;
    }
    
    if (readinessData.soreness !== null) {
      context += `
- Soreness: ${readinessData.soreness}/10 (${readinessData.soreness_level})`;
    }
    
    if (readinessData.sleep !== null) {
      context += `
- Sleep: ${readinessData.sleep}h (${readinessData.sleep_quality})`;
    }
    
    if (readinessData.overall_readiness) {
      context += `
- Overall Readiness: ${readinessData.overall_readiness}`;
    }
  } else {
    context += `

READINESS CHECK: Not provided`;
  }
  
  // Add comprehensive execution summary
  if (executionSummary) {
    context += `


═══════════════════════════════════════════════════════════════
EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════

• Exercises completed: ${executionSummary.exercises_completed}/${executionSummary.exercises_planned} (${executionSummary.exercise_completion_rate.toFixed(0)}%)
• Sets completed: ${executionSummary.sets_completed}/${executionSummary.sets_planned} (${executionSummary.set_completion_rate.toFixed(0)}%)
• Reps completed: ${executionSummary.reps_completed}/${executionSummary.reps_planned} (${executionSummary.rep_completion_rate.toFixed(0)}%)
• Total volume: ${executionSummary.total_volume.toLocaleString()} ${userUnits === 'imperial' ? 'lbs' : 'kg'}
• Session duration: ${executionSummary.session_duration} minutes
• Load adherence: ${executionSummary.load_adherence.toFixed(0)}%
• RIR adherence: ${executionSummary.rir_adherence.toFixed(0)}%
• Overall execution: ${executionSummary.overall_execution}%`;
  }

  // Add exercise-by-exercise breakdown
  if (exerciseBreakdown && exerciseBreakdown.length > 0) {
    context += `


═══════════════════════════════════════════════════════════════
EXERCISE-BY-EXERCISE BREAKDOWN
═══════════════════════════════════════════════════════════════`;
    
    for (const ex of exerciseBreakdown) {
      context += `


${ex.name}:`;
      
      if (ex.is_time_based) {
        // Format for time-based exercises (planks, wall sits, etc.)
        const plannedDurationStr = ex.planned.duration_seconds ? `${Math.round(ex.planned.duration_seconds)}s` : `${ex.planned.reps}s`;
        const actualDurationStr = ex.actual.duration_seconds ? `${Math.round(ex.actual.duration_seconds)}s` : 'N/A';
        context += `
  Planned: ${ex.planned.sets} sets × ${plannedDurationStr}${ex.planned.weight > 0 ? ` @ ${ex.planned.weight}${userUnits === 'imperial' ? 'lbs' : 'kg'}` : ''}${ex.planned.rir != null ? `, RIR ${ex.planned.rir}` : ''}`;
        context += `
  Actual: ${ex.actual.sets} sets × ${actualDurationStr}${ex.actual.weight > 0 ? ` @ ${ex.actual.weight}${userUnits === 'imperial' ? 'lbs' : 'kg'}` : ''}${ex.actual.avg_rir != null ? `, RIR ${ex.actual.avg_rir.toFixed(1)}` : ''}`;
        context += `
  Duration adherence: ${ex.planned.duration_seconds > 0 ? ((ex.actual.duration_seconds / ex.planned.duration_seconds) * 100).toFixed(0) : 'N/A'}%${ex.adherence.rir_adherence != null ? `, RIR adherence: ${ex.adherence.rir_adherence.toFixed(1)}` : ''}`;
      } else {
        // Format for rep-based exercises - show per-set reps, not total
        const plannedRepsDisplay = ex.planned.reps_per_set > 0 ? ex.planned.reps_per_set : (ex.planned.sets > 0 ? Math.round(ex.planned.reps / ex.planned.sets) : ex.planned.reps);
        const actualRepsDisplay = ex.actual.reps_per_set > 0 ? ex.actual.reps_per_set : (ex.actual.sets > 0 ? Math.round(ex.actual.reps / ex.actual.sets) : ex.actual.reps);
        
        // Format weights - show "Bodyweight" for low weights (< 10 lbs) or 0
        const plannedWeightValue = ex.planned.weight || 0;
        const actualWeightValue = ex.actual.weight || 0;
        const plannedWeightDisplay = plannedWeightValue >= 10 ? `${plannedWeightValue}${userUnits === 'imperial' ? 'lbs' : 'kg'}` : (plannedWeightValue > 0 ? `${plannedWeightValue}${userUnits === 'imperial' ? 'lbs' : 'kg'}` : '0lbs');
        const actualWeightDisplay = actualWeightValue >= 10 ? `${actualWeightValue}${userUnits === 'imperial' ? 'lbs' : 'kg'}` : (actualWeightValue > 0 && actualWeightValue < 10 ? `${actualWeightValue}${userUnits === 'imperial' ? 'lbs' : 'kg'}` : 'Bodyweight');
        
        const plannedRIRDisplay = ex.planned.rir != null ? `, RIR ${ex.planned.rir}` : '';
        const actualRIRDisplay = ex.actual.avg_rir != null ? `, RIR ${ex.actual.avg_rir.toFixed(1)}` : '';
        
        context += `
  • Planned: ${ex.planned.sets} sets × ${plannedRepsDisplay} reps @ ${plannedWeightDisplay}${plannedRIRDisplay}`;
        context += `
  • Actual: ${ex.actual.sets} sets × ${actualRepsDisplay} reps @ ${actualWeightDisplay}${actualRIRDisplay}`;
        context += `
  • Load adherence: ${ex.adherence.load_adherence.toFixed(0)}%${ex.adherence.rir_adherence != null ? `, RIR adherence: ${ex.adherence.rir_adherence.toFixed(1)}` : ''}`;
        context += `
  • Performance score: ${ex.performance_score}%`;
      }
    }
  }

  // Add RIR progression analysis
  if (rirProgression && rirProgression.available && rirProgression.patterns && rirProgression.patterns.length > 0) {
    context += `


═══════════════════════════════════════════════════════════════
FATIGUE & RECOVERY ANALYSIS
═══════════════════════════════════════════════════════════════`;
    
    for (const pattern of rirProgression.patterns) {
      context += `


${pattern.exercise_name}:`;
      context += `
  • RIR progression: ${pattern.rir_progression} (${pattern.pattern})`;
      context += `
  • Assessment: ${pattern.assessment}`;
    }
  }

  // Add volume and intensity analysis
  if (volumeAnalysis && volumeAnalysis.total_volume > 0) {
    context += `

VOLUME & INTENSITY ANALYSIS:
- Total volume: ${volumeAnalysis.total_volume.toLocaleString()} ${userUnits === 'imperial' ? 'lbs' : 'kg'}`;
    
    if (Object.keys(volumeAnalysis.muscle_group_distribution).length > 0) {
      context += `
- Muscle group distribution:`;
      for (const [group, percentage] of Object.entries(volumeAnalysis.muscle_group_distribution)) {
        const groupName = group.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        context += `
  ${groupName}: ${percentage.toFixed(1)}%`;
      }
    }
    
    context += `
- Assessment: ${volumeAnalysis.assessment}`;
  }

  // Add data quality flags
  if (dataQuality && dataQuality.available && dataQuality.issues && dataQuality.issues.length > 0) {
    context += `

DATA QUALITY NOTES:`;
    
    for (const issue of dataQuality.issues) {
      context += `
- ${issue.exercise}: ${issue.message} (${issue.severity})`;
    }
  }

  context += `

ANALYSIS REQUIREMENTS:
- ${planMetadata ? 'THIS WORKOUT IS ATTACHED TO A PLAN - prioritize plan adherence and phase-appropriate progression' : 'THIS WORKOUT IS NOT ATTACHED TO A PLAN - analyze based on executed exercises only'}
- Consider phase-appropriate progression (${planMetadata?.phase || 'N/A - no plan'} phase)
- Understand endurance integration context (${planMetadata?.endurance_relationship || 'general strength'})
- ${planMetadata ? 'Focus heavily on plan adherence - compare executed exercises to planned exercises' : 'No plan to compare against - focus on exercise execution and progression'}
- Use HISTORICAL PROGRESSION DATA to compare current performance to past workouts
- Highlight weight progression relative to phase expectations AND historical trends
- Reference last session comparisons and 4-week averages when available
- Note any missed or added exercises
- Comment on RIR data quality and consistency if available
- Factor in Session RPE alongside RIR and adherence metrics (if provided)
- Consider Session RPE in context of objective data (RIR, load, volume) - it's a subjective check, not primary metric
- Factor in Readiness Check data for performance interpretation
- Consider deload week context if applicable
- Keep insights factual and data-driven
- Use ${userUnits} units consistently
- Provide comprehensive analysis covering:
  1. EXECUTION SUMMARY: Highlight overall completion rates, volume, and execution score
  2. EXERCISE-BY-EXERCISE BREAKDOWN: For each main lift, compare planned vs actual (sets, reps, weight, RIR), calculate adherence, and provide performance score
  3. PROGRESSIVE OVERLOAD TRACKING: Use historical progression data to show 4-week trends, volume progression, and estimated 1RM changes
  4. FATIGUE & RECOVERY ANALYSIS: Analyze RIR progression patterns across sets (increasing/decreasing/consistent difficulty)
  5. VOLUME & INTENSITY ANALYSIS: Comment on volume distribution, muscle group balance, and training intensity
  6. PLAN COMPLIANCE: Compare actual execution to planned workout (if plan exists)
  7. DATA QUALITY FLAGS: Note any missing RIR data, incomplete sets, or logging issues
  8. COACHING INSIGHTS: Provide actionable recommendations (e.g., "Ready for load increase", "Continue current progression", "Verify logging")
- Format as structured sections with clear headings
- Be specific with numbers (e.g., "85 lbs → 85 lbs → 85 lbs (0% progression)" not "stable")
- Use progression data to identify plateaus and recommend load increases when RIR indicates capacity
- Reference RIR patterns to assess fatigue management and load appropriateness
- CRITICAL: You MUST generate a COMPREHENSIVE STRUCTURED ANALYSIS with ALL sections below
- DO NOT generate a simple summary paragraph - generate detailed sections with clear headings
- Format your response as structured sections with clear separators (use ─ or = for section dividers)
- Each section must be comprehensive and detailed, not just bullet points
- IMPORTANT: If set completion rate is 0% but exercise completion is high, do NOT create contradictory statements
- Instead, say something like: "All planned exercises were logged (${overallAdherence.exercises_executed}/${overallAdherence.exercises_planned}), but set completion data is incomplete" OR focus on what IS available (weight progression, RIR data, etc.)
- Never say "exercises completed but no sets completed" - this is confusing and contradictory
- If sets weren't marked complete, focus on other metrics like weight progression or RIR data instead
- Keep statements clear and non-contradictory

REQUIRED OUTPUT FORMAT:

═══════════════════════════════════════════════════════════════
EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════
[Detailed summary with specific numbers: X of Y exercises, X of Y sets, volume, duration, execution score]

───────────────────────────────────────────────────────────────
EXERCISE-BY-EXERCISE BREAKDOWN
───────────────────────────────────────────────────────────────
[For EACH exercise: Planned vs Actual, Load adherence, RIR adherence, Performance score, RIR pattern, Assessment]

───────────────────────────────────────────────────────────────
PROGRESSIVE OVERLOAD TRACKING
───────────────────────────────────────────────────────────────
[For each main lift: Last 3 sessions comparison, volume progression, estimated 1RM trends, Assessment with recommendations]

───────────────────────────────────────────────────────────────
FATIGUE & RECOVERY ANALYSIS
───────────────────────────────────────────────────────────────
[RIR progression patterns across sets for each exercise, fatigue management assessment]

───────────────────────────────────────────────────────────────
DATA QUALITY FLAGS
───────────────────────────────────────────────────────────────
[Any missing data, incomplete entries, logging issues with specific recommendations]

───────────────────────────────────────────────────────────────
COACHING INSIGHT
───────────────────────────────────────────────────────────────
[Actionable recommendations: Load increases, progression protocol, data quality fixes, next session targets]`;

  // Add timeout protection for OpenAI API call (60 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview', // Faster than gpt-4
        messages: [
          {
            role: 'system',
            content: `You are a strength training analysis expert. Generate COMPREHENSIVE, STRUCTURED analysis with detailed sections. DO NOT provide a simple summary paragraph - provide full structured analysis.

CRITICAL OUTPUT REQUIREMENTS:
- Generate ALL sections below in structured format with clear headings
- Use section dividers (════ or ───) to separate sections
- Be extremely detailed and specific with numbers
- Each exercise must have its own detailed breakdown
- Include specific recommendations for each exercise
- Reference historical progression data when available
- Identify data quality issues explicitly

REQUIRED SECTIONS (generate ALL of these):

1. EXECUTION SUMMARY
   - Specific numbers: "Completed X of Y exercises (Z%)"
   - "Completed X of Y sets (Z%)"
   - Total volume with comparison to planned
   - Session duration
   - Overall execution score breakdown
   - Session RPE (if provided) - include as supplementary context

2. EXERCISE-BY-EXERCISE BREAKDOWN
   - For EACH exercise: Planned vs Actual (sets, reps, weight, RIR)
   - Load adherence percentage
   - RIR adherence and pattern
   - Performance score
   - Specific assessment with recommendations

3. PROGRESSIVE OVERLOAD TRACKING
   - Last 3 sessions comparison for each main lift
   - Volume progression percentages
   - Estimated 1RM trends
   - Specific recommendations (e.g., "Increase to X lb next session")

4. FATIGUE & RECOVERY ANALYSIS
   - RIR progression pattern for each exercise (e.g., "4→3→3→3")
   - Assessment of fatigue management
   - Recovery capacity indicators

5. DATA QUALITY FLAGS
   - Missing RIR data
   - Incomplete entries
   - Logging issues (e.g., time-based exercises logged as reps)
   - Specific recommendations to fix

6. COACHING INSIGHT
   - Key observations per exercise
   - Specific load increase recommendations based on RIR and adherence
   - Next session targets
   - Data quality improvement suggestions
   - Note Session RPE if it significantly differs from objective metrics (RIR, load)

CRITICAL: Avoid contradictory statements. If exercise completion is high but set completion is 0%, focus on other available metrics (weight progression, RIR data, etc.) rather than creating confusing statements.

Be extremely specific with numbers: "85 lbs → 85 lbs → 85 lbs (0% progression)" not "stable". Use historical progression data to identify plateaus and recommend load increases when RIR indicates capacity.`
          },
          {
            role: 'user',
            content: context
          }
        ],
        max_tokens: 2000, // Reduced for faster generation while maintaining quality
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    clearTimeout(timeoutId);
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // Return the full structured analysis as a single string
    // Don't split it - the UI should display it as formatted text
    if (!content || content.trim().length === 0) {
      return ['Analysis completed - check metrics below'];
    }
    
    // Return as single comprehensive narrative (like running workouts)
    return [content.trim()];
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ OpenAI API call timed out after 60 seconds');
      return ['AI analysis timed out. The analysis took too long to generate. Please try again.'];
    }
    
    console.log('Error generating strength insights:', error);
    return ['AI analysis temporarily unavailable'];
  }
}

// CORS helper function
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  };
}

// Main edge function handler
Deno.serve(async (req) => {
  // Handle CORS preflight requests FIRST - before any other logic
  // This MUST be outside try-catch to ensure it always works
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  // Declare workout_id outside try block so it's accessible in catch
  let workout_id: string | undefined;
  let supabase: any = null;
  
  // Wrapper to ensure status is always set, even if function crashes early
  const ensureStatusSet = async (status: 'complete' | 'failed', error?: string) => {
    if (!workout_id || !supabase) return;
    try {
      await supabase
        .from('workouts')
        .update({ 
          analysis_status: status,
          analysis_error: error || null
        })
        .eq('id', workout_id);
    } catch (e) {
      console.error('❌ Failed to set status in ensureStatusSet:', e);
    }
  };
  
  try {
    const body = await req.json();
    workout_id = body.workout_id;
    
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    console.log(`=== STRENGTH WORKOUT ANALYSIS START ===`);
    console.log(`Analyzing strength workout: ${workout_id}`);
    
    // Initialize Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
    
    // Validate user authentication (extract from Authorization header)
    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authentication token' }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid authentication token' }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
        }
      });
    }
    
    const requestingUserId = userData.user.id;
    
    // Get workout data - try with workout_metadata first, fallback if column doesn't exist
    let workout: any = null;
    let workoutError: any = null;
    
    // First try to get workout with workout_metadata
    const resultWithMetadata = await supabase
      .from('workouts')
      .select('*, strength_exercises, planned_id, workout_metadata, session_rpe, readiness')
      .eq('id', workout_id)
      .maybeSingle();
    
    if (resultWithMetadata.error && resultWithMetadata.error.message?.includes('workout_metadata')) {
      // Column doesn't exist, try without it
      console.log('⚠️ workout_metadata column not available, fetching without it');
      const resultWithoutMetadata = await supabase
        .from('workouts')
        .select('*, strength_exercises, planned_id, session_rpe, readiness')
        .eq('id', workout_id)
        .maybeSingle();
      workout = resultWithoutMetadata.data;
      workoutError = resultWithoutMetadata.error;
    } else {
      workout = resultWithMetadata.data;
      workoutError = resultWithMetadata.error;
    }
    
    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message || 'No workout found'}`);
    }
    
    // Verify user has permission to access this workout
    if (workout.user_id !== requestingUserId) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not have access to this workout' }), {
        status: 403,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    // Check if it's a strength workout
    if (workout.type !== 'strength' && workout.type !== 'strength_training') {
      return new Response(JSON.stringify({ 
        error: 'This function only handles strength workouts',
        workout_type: workout.type 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
    
    console.log(`Workout type: ${workout.type}`);
    console.log(`Workout date: ${workout.date}`);
    
    // Set analysis status to 'analyzing' at start
    const { error: statusError } = await supabase
      .from('workouts')
      .update({ 
        analysis_status: 'analyzing',
        analysis_error: null 
      })
      .eq('id', workout_id);

    if (statusError) {
      console.warn('⚠️ Failed to set analyzing status:', statusError.message);
    }
    
    // Get user baselines
    const { data: baselinesData, error: baselinesError } = await supabase
      .from('user_baselines')
      .select('*')
      .eq('user_id', workout.user_id)
      .single();
    
    if (baselinesError) {
      console.log('No user baselines found, using defaults');
    }
    
    const userBaselines = {
      units: baselinesData?.units || 'imperial',
      ...baselinesData
    };
    
    // Get planned workout if available
    let plannedWorkout: any = null;
    if (workout.planned_id) {
      console.log(`Fetching planned workout: ${workout.planned_id}`);
      const { data: plannedData, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('*, strength_exercises, steps_preset, workout_structure')
        .eq('id', workout.planned_id)
        .single();
      
      if (plannedError) {
        console.log(`Failed to fetch planned workout: ${plannedError.message}`);
      } else {
        plannedWorkout = plannedData;
        console.log(`Found planned workout: ${plannedWorkout?.name}`);
      }
    }
    
    // Analyze the strength workout with timeout protection
    // Set a timeout of 2 minutes (120 seconds) for the entire analysis
    const analysisPromise = analyzeStrengthWorkout(workout, plannedWorkout, userBaselines, supabase);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Analysis timeout: Function took longer than 120 seconds')), 120000);
    });
    
    let analysis: any;
    try {
      analysis = await Promise.race([analysisPromise, timeoutPromise]);
    } catch (timeoutError) {
      console.error('❌ Analysis timed out:', timeoutError);
      await ensureStatusSet('failed', timeoutError instanceof Error ? timeoutError.message : 'Analysis timeout');
      throw timeoutError;
    }
    
    console.log('=== STRENGTH ANALYSIS COMPLETE ===');
    console.log('Status:', analysis.status);
    console.log('Insights count:', analysis.insights?.length || 0);
    
    // Transform analysis result to match expected structure (like running workouts)
    // Client expects: performance (object), detailed_analysis (object), narrative_insights (array)
    const performance = {
      overall_adherence: analysis.overall_adherence?.exercise_completion_rate ?? 0,
      set_completion_rate: analysis.overall_adherence?.set_completion_rate ?? 0,
      exercises_planned: analysis.overall_adherence?.exercises_planned ?? 0,
      exercises_executed: analysis.overall_adherence?.exercises_executed ?? 0,
      sets_planned: analysis.overall_adherence?.sets_planned ?? 0,
      sets_executed: analysis.overall_adherence?.sets_executed ?? 0
    };
    
    const detailedAnalysis = {
      exercise_adherence: analysis.exercise_adherence || [],
      overall_adherence: analysis.overall_adherence || {},
      progression_data: analysis.progression_data || {},
      plan_metadata: analysis.plan_metadata || null,
      session_rpe: analysis.session_rpe || null,
      readiness: analysis.readiness || null,
      workout_summary: {
        total_exercises: analysis.overall_adherence?.exercises_executed ?? 0,
        exercises_planned: analysis.overall_adherence?.exercises_planned ?? 0,
        exercise_completion_rate: analysis.overall_adherence?.exercise_completion_rate ?? 0,
        sets_completion_rate: analysis.overall_adherence?.set_completion_rate ?? 0
      },
      // New comprehensive analysis sections (with null safety)
      execution_summary: analysis.execution_summary || null,
      exercise_breakdown: Array.isArray(analysis.exercise_breakdown) ? analysis.exercise_breakdown : [],
      rir_progression: analysis.rir_progression || null,
      volume_analysis: analysis.volume_analysis || { total_volume: 0, muscle_group_distribution: {}, assessment: 'Unable to calculate' },
      data_quality: analysis.data_quality || { available: false, issues: [] }
    };
    
    // Save analysis results to database
    const updatePayload = {
      workout_analysis: {
        performance: performance,
        detailed_analysis: detailedAnalysis,
        narrative_insights: Array.isArray(analysis.insights) ? analysis.insights : [analysis.insights || 'Analysis completed'], // AI-generated insights
        insights: analysis.insights || [], // Keep for backward compatibility
        strengths: [], // Extract from progression_data if needed
        red_flags: [] // Extract from adherence if needed
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);
    
    if (updateError) {
      console.error('❌ Failed to save analysis to database:', updateError);
      // Still return the analysis even if DB update fails
    } else {
      console.log('✅ Analysis saved successfully to database');
    }
    
    // Ensure status is set to complete before returning
    await ensureStatusSet('complete');
    
    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
    
  } catch (error) {
    // Ensure status is set to failed, even if previous error handling failed
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    await ensureStatusSet('failed', errorMessage);
    console.error('❌ Error in strength workout analysis:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Set analysis status to 'failed' and capture error message
    // Use a separate try-catch to ensure this always runs
    let statusUpdateError = null;
    try {
      const { error: updateErr } = await supabase
        .from('workouts')
        .update({ 
          analysis_status: 'failed',
          analysis_error: error instanceof Error ? error.message : 'Internal server error'
        })
        .eq('id', workout_id);
      
      if (updateErr) {
        statusUpdateError = updateErr;
        console.error('❌ Failed to set error status:', updateErr);
        // Try one more time with a simpler update
        await supabase
          .from('workouts')
          .update({ analysis_status: 'failed' })
          .eq('id', workout_id);
      } else {
        console.log('✅ Set analysis status to failed');
      }
    } catch (statusError) {
      console.error('❌ Failed to set error status (second attempt):', statusError);
      // Last resort: try to at least clear the analyzing status
      try {
        await supabase
          .from('workouts')
          .update({ analysis_status: 'pending' })
          .eq('id', workout_id);
      } catch (finalError) {
        console.error('❌ Complete failure to update status:', finalError);
      }
    }
    
    // errorMessage already declared above, just get stack
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: errorMessage,
      stack: errorStack,
      workout_id: workout_id // workout_id is in outer scope
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
});
