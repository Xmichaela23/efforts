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

// Helper function to match exercises between planned and executed
function matchExercises(plannedExercises: any[], executedExercises: any[]): any[] {
  const matches: any[] = [];
  
  for (const planned of plannedExercises) {
    const executed = executedExercises.find(exec => 
      exec.name.toLowerCase().trim() === planned.name.toLowerCase().trim()
    );
    
    if (executed) {
      matches.push({
        name: planned.name,
        planned: planned,
        executed: executed,
        matched: true
      });
    } else {
      matches.push({
        name: planned.name,
        planned: planned,
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
  
  // Filter completed sets
  const completedSets = executedSets.filter((set: any) => set.completed);
  
  // Calculate set completion
  const setCompletion = plannedSets.length > 0 ? 
    (completedSets.length / plannedSets.length) * 100 : 0;
  
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
  
  // Calculate RIR adherence (if RIR was planned)
  let rirAdherence = null;
  const plannedRIR = plannedSets.find((set: any) => set.rir !== null && set.rir !== undefined);
  if (plannedRIR && completedSets.length > 0) {
    const executedRIR = completedSets.find((set: any) => set.rir !== null && set.rir !== undefined);
    if (executedRIR) {
      rirAdherence = Math.abs(executedRIR.rir - plannedRIR.rir);
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
    // Get last 8 weeks of strength workouts
    const { data: recentWorkouts, error } = await supabase
      .from('workouts')
      .select('id, date, strength_exercises, computed')
      .eq('user_id', userId)
      .eq('type', 'strength')
      .lt('date', currentDate)
      .order('date', { ascending: false })
      .limit(20);
    
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
        const completedSets = exercise.sets.filter((set: any) => set.completed);
        if (completedSets.length > 0) {
          const avgWeight = completedSets.reduce((sum: number, set: any) => 
            sum + (set.weight || 0), 0) / completedSets.length;
          
          exerciseHistory.push({
            date: workout.date,
            weight: avgWeight,
            unit: exercise.unit || 'lbs',
            sets: completedSets.length,
            reps: completedSets.reduce((sum: number, set: any) => 
              sum + (set.reps || 0), 0) / completedSets.length
          });
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

// Main strength workout analysis function
async function analyzeStrengthWorkout(workout: any, plannedWorkout: any, userBaselines: any, supabase: any): Promise<any> {
  console.log('🔍 STRENGTH ANALYSIS START');
  
  // Parse strength exercises
  const executedExercises = parseStrengthExercises(workout.strength_exercises);
  const plannedExercises = plannedWorkout ? 
    parseStrengthExercises(plannedWorkout.strength_exercises) : [];
  
  console.log(`🔍 STRENGTH DEBUG: Parsed ${executedExercises.length} executed exercises`);
  console.log(`🔍 PLANNED DEBUG: Parsed ${plannedExercises.length} planned exercises`);
  
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
    sets_executed: executedExercises.reduce((sum: number, ex: any) => 
      sum + (Array.isArray(ex.sets) ? ex.sets.filter((set: any) => set.completed).length : 0), 0),
    set_completion_rate: 0,
    weight_progression: 0,
    volume_completion: 0
  };
  
  if (matchedExercises.length > 0) {
    overallAdherence.set_completion_rate = matchedExercises.reduce((sum: number, ex: any) => 
      sum + ex.adherence.set_completion, 0) / matchedExercises.length;
    overallAdherence.weight_progression = matchedExercises.reduce((sum: number, ex: any) => 
      sum + ex.adherence.weight_progression, 0) / matchedExercises.length;
    overallAdherence.volume_completion = matchedExercises.reduce((sum: number, ex: any) => 
      sum + ex.adherence.volume_completion, 0) / matchedExercises.length;
  }
  
  // Get historical progression for each exercise
  const progressionData: any = {};
  for (const exercise of executedExercises) {
    const progression = await getStrengthProgression(
      supabase, 
      workout.user_id, 
      exercise.name, 
      workout.date, 
      userUnits
    );
    if (progression) {
      progressionData[exercise.name] = progression;
    }
  }
  
  console.log(`📊 PROGRESSION: Analyzed ${Object.keys(progressionData).length} exercises`);
  
  // Generate enhanced insights using GPT-4
  const insights = await generateEnhancedStrengthInsights(
    workout, 
    exerciseAdherence, 
    overallAdherence, 
    progressionData, 
    planMetadata, 
    userUnits
  );
  
  return {
    status: 'success',
    exercise_adherence: exerciseAdherence,
    overall_adherence: overallAdherence,
    progression_data: progressionData,
    plan_metadata: planMetadata,
    insights: insights,
    units: userUnits
  };
}

// Generate enhanced strength-specific insights using GPT-4
async function generateEnhancedStrengthInsights(
  workout: any,
  exerciseAdherence: any[],
  overallAdherence: any,
  progressionData: any,
  planMetadata: EnhancedPlanContext | null,
  userUnits: string
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

ENHANCED PLAN CONTEXT:`;
  
  if (planMetadata) {
    context += `
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
  } else {
    context += `
- No planned workout context available`;
  }
  
  context += `

EXERCISE ADHERENCE:
- Exercises Planned: ${overallAdherence.exercises_planned}
- Exercises Executed: ${overallAdherence.exercises_executed}
- Exercise Completion Rate: ${overallAdherence.exercise_completion_rate.toFixed(1)}%
- Set Completion Rate: ${overallAdherence.set_completion_rate.toFixed(1)}%
- Weight Progression: ${overallAdherence.weight_progression.toFixed(1)}%
- Volume Completion: ${overallAdherence.volume_completion.toFixed(1)}%

EXERCISE DETAILS:`;
  
  for (const exercise of exerciseAdherence) {
    if (exercise.matched) {
      context += `
- ${exercise.name}: ${exercise.adherence.set_completion}% sets completed, ${exercise.adherence.weight_progression > 0 ? '+' : ''}${exercise.adherence.weight_progression}% weight change`;
      
      if (exercise.adherence.rir_adherence !== null) {
        context += `, RIR adherence: ${exercise.adherence.rir_adherence}`;
      }
    } else if (exercise.executed) {
      context += `
- ${exercise.name}: Added exercise (not planned)`;
    } else {
      context += `
- ${exercise.name}: Missed exercise (planned but not executed)`;
    }
  }
  
  context += `

PROGRESSION DATA:`;
  
  for (const [exerciseName, progression] of Object.entries(progressionData)) {
    const prog = progression as any;
    context += `
- ${exerciseName}: ${prog.current_weight}${prog.current_weight_unit} (${prog.trend})`;
    
    if (prog.last_session) {
      context += `, Last session: ${prog.last_session.weight}${prog.last_session.weight_unit} (${prog.last_session.change_direction})`;
    }
  }
  
  context += `

ANALYSIS REQUIREMENTS:
- Consider phase-appropriate progression (${planMetadata?.phase || 'unknown'} phase)
- Understand endurance integration context (${planMetadata?.endurance_relationship || 'general strength'})
- Focus on plan adherence when plan is available
- Highlight weight progression relative to phase expectations
- Note any missed or added exercises
- Comment on RIR adherence if available
- Consider deload week context if applicable
- Keep insights factual and data-driven
- Use ${userUnits} units consistently
- Max 3 insights, each under 25 words`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a strength training analysis expert. Provide concise, factual insights about workout execution and progression. Focus on data-driven observations, not coaching advice.'
          },
          {
            role: 'user',
            content: context
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // Parse insights from response
    const insights = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
      .slice(0, 3);
    
    return insights.length > 0 ? insights : ['Analysis completed - check metrics below'];
    
  } catch (error) {
    console.log('Error generating strength insights:', error);
    return ['AI analysis temporarily unavailable'];
  }
}

// Main edge function handler
Deno.serve(async (req) => {
  try {
    const { workout_id } = await req.json();
    
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`=== STRENGTH WORKOUT ANALYSIS START ===`);
    console.log(`Analyzing strength workout: ${workout_id}`);
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get workout data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select('*, strength_exercises, planned_id')
      .eq('id', workout_id)
      .single();
    
    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }
    
    // Check if it's a strength workout
    if (workout.type !== 'strength' && workout.type !== 'strength_training') {
      return new Response(JSON.stringify({ 
        error: 'This function only handles strength workouts',
        workout_type: workout.type 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Workout type: ${workout.type}`);
    console.log(`Workout date: ${workout.date}`);
    
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
    let plannedWorkout = null;
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
    
    // Analyze the strength workout
    const analysis = await analyzeStrengthWorkout(workout, plannedWorkout, userBaselines, supabase);
    
    console.log('=== STRENGTH ANALYSIS COMPLETE ===');
    console.log('Status:', analysis.status);
    console.log('Insights count:', analysis.insights?.length || 0);
    
    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in strength workout analysis:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
