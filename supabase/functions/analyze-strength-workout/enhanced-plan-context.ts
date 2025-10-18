/**
 * Enhanced Plan Context Analysis for Strength Workouts
 * Understands phase-based progression, endurance integration, and plan-specific nuances
 */

export interface EnhancedPlanContext {
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
export function extractEnhancedPlanContext(
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

/**
 * Calculate expected progression based on enhanced context
 */
export function calculateExpectedProgression(
  context: EnhancedPlanContext,
  exerciseName: string,
  baseWeight: number
): {
  expected_weight: number;
  progression_reason: string;
  phase_appropriate: boolean;
} {
  const weeksIntoPhase = context.week % 4; // Assume 4-week phases
  const progressionMultiplier = 1 + (context.phase_progression_rate * weeksIntoPhase);
  
  let expectedWeight = baseWeight * progressionMultiplier;
  let progressionReason = '';
  let phaseAppropriate = true;

  // Phase-specific adjustments
  switch (context.phase) {
    case 'base':
      expectedWeight = Math.min(expectedWeight, baseWeight * 1.15); // Cap at 15% increase
      progressionReason = 'Base phase: Conservative 2% weekly progression';
      break;
    case 'build':
      expectedWeight = Math.min(expectedWeight, baseWeight * 1.25); // Cap at 25% increase
      progressionReason = 'Build phase: Moderate 2.5% weekly progression';
      break;
    case 'peak':
      expectedWeight = Math.min(expectedWeight, baseWeight * 1.30); // Cap at 30% increase
      progressionReason = 'Peak phase: Aggressive 3% weekly progression';
      break;
    case 'taper':
      expectedWeight = Math.max(expectedWeight, baseWeight * 0.8); // Reduce by 20%
      progressionReason = 'Taper phase: Reduced volume, maintained intensity';
      break;
  }

  // Deload week adjustments
  if (context.deload_week) {
    expectedWeight = baseWeight * 0.7; // 30% reduction
    progressionReason = 'Deload week: 30% weight reduction for recovery';
    phaseAppropriate = true;
  }

  // Exercise-specific adjustments
  if (context.strength_type === 'cowboy_endurance') {
    // More conservative progression for endurance-focused strength
    expectedWeight = expectedWeight * 0.9;
    progressionReason += ' (Endurance-focused: Conservative progression)';
  }

  return {
    expected_weight: Math.round(expectedWeight * 10) / 10,
    progression_reason: progressionReason,
    phase_appropriate: phaseAppropriate
  };
}

/**
 * Generate enhanced insights based on plan context
 */
export function generateEnhancedInsights(
  context: EnhancedPlanContext,
  exerciseAdherence: any[],
  progressionData: any
): string[] {
  const insights: string[] = [];

  // Phase-appropriate progression insights
  if (context.phase !== 'unknown') {
    const phaseInsight = `${context.phase.charAt(0).toUpperCase() + context.phase.slice(1)} phase: ${context.phase_focus}`;
    insights.push(phaseInsight);
  }

  // Endurance integration insights
  if (context.endurance_sport && context.strength_type === 'cowboy_endurance') {
    const enduranceInsight = `Endurance integration: ${context.endurance_relationship}`;
    insights.push(enduranceInsight);
  }

  // Progression insights
  const improvingExercises = exerciseAdherence.filter(ex => 
    ex.matched && ex.adherence.weight_progression > 0
  );
  
  if (improvingExercises.length > 0) {
    const avgProgression = improvingExercises.reduce((sum, ex) => 
      sum + ex.adherence.weight_progression, 0) / improvingExercises.length;
    
    if (avgProgression > 5) {
      insights.push(`Strong progression: ${avgProgression.toFixed(1)}% average weight increase`);
    } else if (avgProgression > 0) {
      insights.push(`Steady progression: ${avgProgression.toFixed(1)}% average weight increase`);
    }
  }

  // Deload week insights
  if (context.deload_week) {
    insights.push('Deload week: Focus on recovery and movement quality');
  }

  return insights;
}
