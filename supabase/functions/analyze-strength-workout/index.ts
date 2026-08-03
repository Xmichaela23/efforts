import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { energyLevel, sorenessLevel, sleepQuality, overallReadinessLabel } from '../_shared/readiness-scale.ts';
import { isPlanTransitionWindowByWeekIndex } from '../_shared/plan-week.ts';
// ⛔ SEVEN IMPORTS DELETED WITH THE NARRATIVE LLM (2026-08-02): `getArcContext`,
// `ArcNarrativeContextV1`, `arcModeSystemAddon` / `arcNarrativeFactBlock`, the whole narrative-core
// group (`buildReasoningScaffold`, `validateNarrative`, `strengthAdapter`, `applyGroundingContext`,
// `spineVerdictFor`), the novel-movement detectors, and `spineDirectionToTrend`. Every one of them
// existed to build or police a PROMPT. Verified dead by reference count before removal, not assumed.
// ⚠️ The modules themselves are untouched and still serve the run and cycling analyzers and the
// coach — this is a caller losing its use for them, not a shared capability being retired.
// D-208: role classifier — execution scoring weights a skipped accessory less than a main lift.
import { roleForExercise, ROLE_WEIGHT } from '../../../src/lib/exercise-role.ts';
import { isPerformedStrengthSet } from '../_shared/strength/performed-set.ts';
import { matchExercises } from '../_shared/strength/match-exercises.ts';
import { buildSubstitutionNote } from '../_shared/strength/substitution-note.ts';
import { rirVerdictFromDelta } from '../_shared/strength-profiles.ts';

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
  
  // Plan-aware context (NEW)
  session_description?: string;
  session_tags?: string[];
  plan_description?: string;
  weekly_summary?: {
    focus?: string;
    key_workouts?: string[];
    notes?: string;
    hard_sessions?: number;
  } | null;
  progression_history?: string[] | null;
  target_rir?: string | null;
  parsed_phase?: string;
  parsed_week?: number;
  parsed_total_weeks?: number;
  exercise_notes?: Record<string, string>;
}

/**
 * Extract enhanced plan context from planned workout and training plan
 */
// D-204 / Q-178: THE definition of a performed set now lives in `_shared/strength/performed-set.ts`
// (imported above), so it can be pin-tested. The inline copy was deleted 2026-07-13 — do not
// re-inline it, and do not write a second one. Read that file before changing the rule.

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
// Parse progression history from description (e.g., "70% → 72% → 75%")
// Parse progression history from description or structured tags
function parseProgressionHistory(description: string, tags: string[]): string[] | null {
  // First try structured tag (most reliable)
  if (tags && Array.isArray(tags)) {
    const loadProgressionTag = tags.find((t: string) => t.startsWith('load_progression:'));
    if (loadProgressionTag) {
      const progression = loadProgressionTag.split(':')[1];
      // Format: "70_72_75_70_77_78_80_80" -> ["70%", "72%", "75%", ...]
      return progression.split('_').map(p => `${p}%`);
    }
  }
  
  // Fallback to description parsing (e.g., "70%→72%→75%")
  if (description) {
    const match = description.match(/(\d+%.*?→.*?\d+%)/);
    if (match) {
      return match[0].split('→').map(p => p.trim());
    }
  }
  
  return null;
}

// Parse target RIR from description or tags
function parseTargetRIR(description: string, tags: string[]): string | null {
  // Try description first
  if (description) {
    const match = description.match(/target RIR (\d+-?\d*)/i);
    if (match) return match[1];
  }
  // Try tags
  if (tags && Array.isArray(tags)) {
    const rirTag = tags.find((t: string) => t.startsWith('target_rir:'));
    if (rirTag) return rirTag.split(':')[1];
  }
  return null;
}

// Parse phase info from tags
function parsePhaseFromTags(tags: string[]): { phase: string | null, week: string | null, totalWeeks: string | null } {
  if (!tags || !Array.isArray(tags)) return { phase: null, week: null, totalWeeks: null };
  
  const phaseTag = tags.find((t: string) => t.startsWith('phase:'));
  const phase = phaseTag ? phaseTag.split(':')[1].replace(/_/g, ' ') : null;
  
  const weekTag = tags.find((t: string) => t.startsWith('week:'));
  let week: string | null = null;
  let totalWeeks: string | null = null;
  if (weekTag) {
    const parts = weekTag.split(':')[1].split('_of_');
    week = parts[0];
    totalWeeks = parts[1];
  }
  
  return { phase, week, totalWeeks };
}

// Parse exercise-specific notes from description
function parseExerciseNotes(description: string): Record<string, string> {
  const notes: Record<string, string> = {};
  if (!description) return notes;
  
  // Match patterns like "EXERCISE_NAME: details"
  const matches = description.matchAll(/([A-Z][A-Z\s]+):\s*([^.]+)/g);
  for (const match of matches) {
    const exercise = match[1].trim();
    const note = match[2].trim();
    notes[exercise] = note;
  }
  
  return notes;
}

async function extractEnhancedPlanMetadata(
  plannedWorkout: any, 
  supabase: any, 
  userId: string, 
  weekNumber: number
): Promise<EnhancedPlanContext | null> {
  if (!plannedWorkout) return null;
  
  // Verify planned workout belongs to user (authorization check)
  if (plannedWorkout.user_id && plannedWorkout.user_id !== userId) {
    console.warn('⚠️ Planned workout does not belong to user - skipping plan context');
    return null;
  }
  
  // Get training plan if available
  // NOTE: planned_workouts.training_plan_id references the 'plans' table, not 'training_plans'
  let trainingPlan = null;
  if (plannedWorkout.training_plan_id) {
    try {
      // Try 'plans' table first (current system)
      const { data: planData, error } = await supabase
        .from('plans')
        .select('*')
        .eq('id', plannedWorkout.training_plan_id)
        .eq('user_id', userId) // Authorization: verify plan belongs to user
        .single();
      
      if (!error && planData) {
        // Double-check user ownership (defense in depth)
        if (planData.user_id === userId) {
          trainingPlan = planData;
        } else {
          console.warn('⚠️ Training plan does not belong to user - skipping plan context');
        }
      } else if (error) {
        // Fallback: try 'training_plans' table (legacy)
        console.log('⚠️ Plan not found in plans table, trying training_plans...');
        const { data: legacyPlanData, error: legacyError } = await supabase
          .from('training_plans')
          .select('*')
          .eq('id', plannedWorkout.training_plan_id)
          .eq('user_id', userId)
          .single();
        
        if (!legacyError && legacyPlanData && legacyPlanData.user_id === userId) {
          trainingPlan = legacyPlanData;
        }
      }
    } catch (error) {
      console.log('Failed to fetch training plan:', error);
    }
  }
  
  const baseContext = extractEnhancedPlanContext(plannedWorkout, trainingPlan, weekNumber);
  
  // Extract additional plan-aware context
  const sessionDescription = plannedWorkout.description || '';
  const sessionTags = plannedWorkout.tags || [];
  const planDescription = trainingPlan?.description || '';
  
  // Parse weekly summary if available
  let weeklySummary = null;
  if (trainingPlan?.config?.weekly_summaries && trainingPlan.config.weekly_summaries[weekNumber]) {
    weeklySummary = trainingPlan.config.weekly_summaries[weekNumber];
  } else if (trainingPlan?.weekly_summaries && trainingPlan.weekly_summaries[weekNumber]) {
    weeklySummary = trainingPlan.weekly_summaries[weekNumber];
  }
  
  // Parse progression history (from structured tag or description)
  const progressionHistory = parseProgressionHistory(sessionDescription, sessionTags);
  
  // Parse target RIR
  const targetRIR = parseTargetRIR(sessionDescription, sessionTags);
  
  // Parse phase info
  const { phase: parsedPhase, week: parsedWeek, totalWeeks: parsedTotalWeeks } = parsePhaseFromTags(sessionTags);
  
  // Parse exercise-specific notes
  const exerciseNotes = parseExerciseNotes(sessionDescription);
  
  // Enhance context with parsed data
  return {
    ...baseContext,
    // Add plan-aware fields
    session_description: sessionDescription,
    session_tags: sessionTags,
    plan_description: planDescription,
    weekly_summary: weeklySummary,
    progression_history: progressionHistory,
    target_rir: targetRIR,
    parsed_phase: parsedPhase || baseContext.phase,
    parsed_week: parsedWeek ? parseInt(parsedWeek) : weekNumber,
    parsed_total_weeks: parsedTotalWeeks ? parseInt(parsedTotalWeeks) : baseContext.total_weeks,
    exercise_notes: exerciseNotes
  };
}

// Helper function to normalize planned exercise format
// Planned format: {name, sets: 4, reps: 5, weight: 85}
// Q-181: normalizePlannedExercise / normalizeExerciseName / matchExercises now live in
// `_shared/strength/match-exercises.ts` (imported above) so they can be PIN-TESTED. matchExercises is
// the core of EVERY strength execution score — it had no fixture at all. The inline copies were
// deleted 2026-07-14. Do not re-inline them, and do not write a second matcher.
//
// The behaviour change: A DECLARED SWAP IS NOT A SKIP. An executed exercise carrying
// `substituted_for` matches the planned exercise it replaces, so the athlete is no longer docked
// twice for an honest substitution (a skip on the planned lift AND zero credit for the work done).
// An UNDECLARED miss is still a skip — that guard is the first fixture in the test file.

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
  const completedSets = executedSets.filter(isPerformedStrengthSet);
  
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

  // Target RIR: exercise-level target_rir is the source of truth (set by protocol).
  // Fall back to set-level rir on the first planned set if not present.
  const exerciseTargetRIR: number | null =
    typeof planned.target_rir === 'number' ? planned.target_rir
    : typeof planned.target_rir === 'string' ? Number(planned.target_rir) || null
    : plannedSets.find((s: any) => s.rir != null)?.rir ?? null;

  // Get executed RIR data
  // D-203/provenance: only count RIR the athlete actually entered/confirmed. Auto-filled
  // RIR (suggested target, or prefill from a prior session) is the prescription, not
  // observed effort — counting it makes adherence read as perfect by construction. Legacy
  // rows lack the flag and count as observed.
  const executedRIRSets = completedSets.filter((set: any) => set.rir !== null && set.rir !== undefined && !set.rir_autofilled);

  if (executedRIRSets.length > 0) {
    avgExecutedRIR = executedRIRSets.reduce((sum: number, set: any) => sum + set.rir, 0) / executedRIRSets.length;

    const variance = executedRIRSets.reduce((sum: number, set: any) =>
      sum + Math.pow(set.rir - avgExecutedRIR!, 2), 0) / executedRIRSets.length;
    rirConsistency = Math.sqrt(variance);

    if (exerciseTargetRIR !== null) {
      rirAdherence = Math.round((avgExecutedRIR - exerciseTargetRIR) * 10) / 10;
    }
  }

  // RIR verdict — directional signal, not a score. Shared ±1.0 band (VERDICT_DEVIATION via
  // rirVerdictFromDelta) so the Details table, the AI prose, and the State row can't land in
  // different tiers for the same set (this table previously used a ±1.5 outlier).
  const rirVerdict = rirVerdictFromDelta(rirAdherence);

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
    target_rir: exerciseTargetRIR,
    rir_adherence: rirAdherence,
    rir_verdict: rirVerdict,
    avg_rir: avgExecutedRIR != null ? Math.round(avgExecutedRIR * 10) / 10 : null,
    rir_consistency: rirConsistency != null ? Math.round(rirConsistency * 10) / 10 : null,
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
        const completedSets = exercise.sets.filter(isPerformedStrengthSet);
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

// D-189: canonical per-exercise e1RM trend from exercise_log (the single-source — estimated1RM → exercise_log,
// written by compute-facts). Current session's e1RM per lift + the most recent PRIOR session's e1RM →
// a per-exercise trend. Returns [] gracefully on any error (honest blank — the narrative then states no
// e1RM, never invents one). Never recomputes e1RM here; reads the canonical stored value.
async function getE1rmTrend(
  supabase: any,
  userId: string,
  workoutId: string,
  workoutDate: string,
): Promise<Array<{ exercise: string; canonical: string; current_e1rm: number; prior_e1rm: number | null; trend: 'up' | 'down' | 'flat' | null }>> {
  try {
    const { data: cur } = await supabase
      .from('exercise_log')
      .select('canonical_name, exercise_name, estimated_1rm')
      .eq('workout_id', workoutId);
    const rows = (cur ?? []).filter((r: any) => Number(r?.estimated_1rm) > 0);
    const out: Array<{ exercise: string; canonical: string; current_e1rm: number; prior_e1rm: number | null; trend: 'up' | 'down' | 'flat' | null }> = [];
    for (const r of rows) {
      const { data: prev } = await supabase
        .from('exercise_log')
        .select('estimated_1rm, date')
        .eq('user_id', userId)
        .eq('canonical_name', r.canonical_name)
        .lt('date', workoutDate)
        .gt('estimated_1rm', 0)
        .order('date', { ascending: false })
        .limit(1);
      const prior = prev?.[0]?.estimated_1rm != null ? Number(prev[0].estimated_1rm) : null;
      const current = Number(r.estimated_1rm);
      let trend: 'up' | 'down' | 'flat' | null = null;
      if (prior != null && prior > 0) {
        const d = current - prior;
        trend = Math.abs(d) < 2.5 ? 'flat' : d > 0 ? 'up' : 'down'; // 2.5 lb dead-band (smallest plate)
      }
      out.push({ exercise: r.exercise_name || r.canonical_name, canonical: r.canonical_name, current_e1rm: current, prior_e1rm: prior, trend });
    }
    return out;
  } catch (e) {
    console.warn('[analyze-strength] getE1rmTrend failed (non-fatal → honest blank):', (e as Error)?.message ?? e);
    return [];
  }
}

// ── 1RM / baseline TEST recognition + result (Q-097/Q-102 phase 2) ──────────────
// A test is measurement, not training: no execution/volume/adherence framing. It reports the
// per-lift result (reps × weight → e1RM), the prior-test → this-test delta, and the baseline
// outcome (computed fresh at display time from performance_numbers — see build.ts). Marker: the
// `1rm_test` tag OR a name containing "baseline test" (mirrors StrengthLogger's isBaselineTestWorkout).
function detectStrengthTest(workout: any, plannedWorkout: any): boolean {
  const nm = (s: any) => String(s || '').toLowerCase();
  if (nm(workout?.name).includes('baseline test') || nm(plannedWorkout?.name).includes('baseline test')) return true;
  const tags = [
    ...(Array.isArray(workout?.tags) ? workout.tags : []),
    ...(Array.isArray(plannedWorkout?.tags) ? plannedWorkout.tags : []),
  ].map((t: any) => nm(t));
  return tags.includes('1rm_test');
}

// Canonical baseline key from an exercise name — mirrors StrengthLogger.getBaselineKeyForExercise.
function strengthTestKey(name: string): 'squat' | 'deadlift' | 'bench' | 'overheadPress1RM' | 'pullupMaxReps' | null {
  const n = String(name || '').toLowerCase();
  if (n.includes('squat') && !n.includes('goblet') && !n.includes('jump')) return 'squat';
  if (n.includes('deadlift')) return 'deadlift';
  if (n.includes('bench') && n.includes('press')) return 'bench';
  if ((n.includes('overhead') || n.includes('ohp')) && n.includes('press')) return 'overheadPress1RM';
  if (n.includes('pull-up') || n.includes('pullup') || n.includes('pull up')) return 'pullupMaxReps';
  return null;
}

const DEADLIFT_TEST_NOTE = "e1RM formulas read deadlift conservative — a flat number isn't necessarily a flat lift.";

// Per-lift test result: the measured facts (reps × weight → e1RM), the prior→now e1RM delta, and the
// baseline outcome vs the stored 1RM. Outcome uses performance_numbers AT ANALYSIS TIME — accurate when
// baselines are saved before the workout is finalized (the natural order) or after a recompute.
function buildStrengthTestResult(executedExercises: any[], e1rmTrend: any[], perf: any): any {
  const lifts: any[] = [];
  for (const ex of (Array.isArray(executedExercises) ? executedExercises : [])) {
    const key = strengthTestKey(ex?.name || '');
    if (!key) continue;
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    // The scored set: the amrap/rep-max flag first; else the last performed working set; else the heaviest.
    const working =
      sets.find((s: any) => s?.amrap === true || s?.repMaxTest === true) ||
      [...sets].reverse().find((s: any) => s?.setType === 'working' && isPerformedStrengthSet(s)) ||
      [...sets].filter(isPerformedStrengthSet).sort((a: any, b: any) => (Number(b?.weight) || 0) - (Number(a?.weight) || 0))[0] ||
      null;
    if (!working) continue;
    const reps = Number(working.reps);
    const weight = Number(working.weight);
    const isPullup = key === 'pullupMaxReps';
    const zeroRep = !(reps > 0);
    const trendRow = (Array.isArray(e1rmTrend) ? e1rmTrend : []).find((e: any) =>
      strengthTestKey(String(e?.canonical || e?.exercise || '')) === key);
    // 1RM lifts: e1RM from the canonical trend. Pull-ups: the rep count IS the value (no e1RM).
    const e1rm = isPullup ? (Number.isFinite(reps) ? reps : null) : (trendRow?.current_e1rm ?? null);
    const priorE1rm = isPullup ? (null) : (trendRow?.prior_e1rm ?? null);
    // Baseline outcome vs the stored 1RM (pull-ups compare rep count; 1RM lifts compare e1RM).
    const storedRaw = Number(perf?.[key]);
    const stored = Number.isFinite(storedRaw) && storedRaw > 0 ? storedRaw : null;
    const value = e1rm; // e1rm already holds reps for pull-ups
    let outcome: 'new_baseline' | 'updated' | 'kept' | null = null;
    if (zeroRep) outcome = null;
    else if (stored == null) outcome = 'new_baseline';
    else if (value != null && Math.round(value) >= stored) outcome = 'updated';
    else outcome = 'kept';
    lifts.push({
      name: ex.name,
      key,
      reps: Number.isFinite(reps) ? reps : null,
      weight: isPullup ? null : (Number.isFinite(weight) && weight > 0 ? weight : null),
      unit: isPullup ? 'reps' : 'lb',
      e1rm: e1rm != null ? Math.round(e1rm) : null,
      prior_e1rm: priorE1rm != null ? Math.round(priorE1rm) : null,
      stored,
      outcome,
      zero_rep: zeroRep,
      note: key === 'deadlift' ? DEADLIFT_TEST_NOTE : null,
    });
  }
  if (lifts.length === 0) return null;
  return { headline: '1RM Test', lifts };
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
      const planned = ex.planned || {};
      const executed = ex.executed || {};
      const adherence = ex.adherence || {};
      
      const plannedSets = Array.isArray(planned.sets) ? planned.sets : [];
      const executedSets = Array.isArray(executed.sets) ? executed.sets : [];
      // A set is considered completed if explicitly marked OR has data indicating it was performed
      const completedSets = executedSets.filter(isPerformedStrengthSet);
      
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
          target_rir: adherence.target_rir,
          rir_adherence: adherence.rir_adherence,
          rir_verdict: adherence.rir_verdict,
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
    const completedSets = executedSets.filter(isPerformedStrengthSet);
    
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
    const completedSets = executedSets.filter(isPerformedStrengthSet);
    
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
      const completedSets = ex.executed.sets.filter(isPerformedStrengthSet);
      totalRepsExecuted += completedSets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0);
    }
  }
  
  // Calculate average rest time (if available in workout metadata)
  // This would need to be calculated from timestamps if available
  
  // Calculate overall execution score
  const setCompletion = overallAdherence.set_completion_rate || 0;

  // Q-181 — NEVER GRADE WHAT YOU CANNOT ANCHOR (the Q-180 rule).
  //
  // A DECLARED swap counts as COMPLETED (the slot was filled — that is the whole point, no dock), but
  // it must NOT be graded on LOAD or RIR: the substitute carries no prescription of its own, and
  // comparing a hip thrust's weight to a Bulgarian split squat's target is nonsense. Grading it would
  // just be inventing a verdict from a number that means nothing.
  //
  // So load/RIR average over the ANCHORED matches only. If every matched exercise was swapped, there is
  // no load signal at all — the term must not PENALISE (the athlete did the work; we simply cannot
  // grade the load) and must not REWARD. It goes silent at 100, exactly as rirAdherence already does
  // when there is no RIR data. Exercise-completion still carries the honest verdict.
  //
  // ⚠️ The `matchedExercises.length > 0` outer guard STAYS: a session where nothing matched at all is
  // still a 0, not a free 100.
  const anchoredExercises = matchedExercises.filter((ex: any) => !ex.substituted);
  const loadAdherence = matchedExercises.length > 0
    ? (anchoredExercises.length > 0
        ? anchoredExercises.reduce((sum: number, ex: any) => {
            const weightScore = Math.max(0, 100 - Math.abs(ex.adherence.weight_progression || 0));
            return sum + weightScore;
          }, 0) / anchoredExercises.length
        : 100) // every match was an un-anchored swap → no load signal, no penalty
    : 0;
  // Q-181: swaps are excluded here too — a RIR target belongs to the exercise that was PRESCRIBED.
  const rirAnchored = anchoredExercises.filter((ex: any) => ex.adherence.rir_adherence != null);
  const rirAdherence = rirAnchored.length > 0
    ? rirAnchored.reduce((sum: number, ex: any) => {
        const rirScore = Math.max(0, 100 - (ex.adherence.rir_adherence * 20));
        return sum + rirScore;
      }, 0) / rirAnchored.length
    : 100; // Default to 100% if no RIR data

  // D-208: ROLE-WEIGHTED exercise completion. Each planned exercise contributes its role weight
  // (primary/secondary 1.0, accessory 0.5) to both numerator and denominator, so skipping a
  // prehab/postural accessory dings ~half of what skipping a main lift does — instead of the old
  // flat matched/planned that treated every exercise as equal. Only exercise-completion needs
  // this: set-completion is already computed over matched exercises only (a skip never touches it).
  // Planned entries = exerciseAdherence rows with a `planned` side (excludes executed-but-unplanned).
  const plannedEntries = exerciseAdherence.filter((ex: any) => ex?.planned != null);
  const weightedPlanned = plannedEntries.reduce((s: number, ex: any) => s + ROLE_WEIGHT[roleForExercise(ex.name)], 0);
  const weightedMatched = plannedEntries
    .filter((ex: any) => ex.matched)
    .reduce((s: number, ex: any) => s + ROLE_WEIGHT[roleForExercise(ex.name)], 0);
  const exerciseCompletion = weightedPlanned > 0
    ? (weightedMatched / weightedPlanned) * 100
    : (overallAdherence.exercise_completion_rate || 0);

  const overallExecution = (exerciseCompletion * 0.3) +
                          (setCompletion * 0.2) +
                          (loadAdherence * 0.3) +
                          (rirAdherence * 0.2);

  // D-208: component attribution — the SHARED structure consumed by both the score (above) and
  // the "what moved it" microcopy. Lists each component's score + weighted contribution, the
  // exercises that were skipped (with role), and which component cost the most points.
  const skipped = plannedEntries
    .filter((ex: any) => !ex.matched)
    .map((ex: any) => ({ name: ex.name, role: roleForExercise(ex.name) }));
  const components = [
    { key: 'exercise_completion', label: 'Exercises done', weight: 0.3, score: Math.round(exerciseCompletion) },
    { key: 'set_completion', label: 'Sets done', weight: 0.2, score: Math.round(setCompletion) },
    { key: 'load', label: 'Load vs prescribed', weight: 0.3, score: Math.round(loadAdherence) },
    { key: 'rir', label: 'RIR vs target', weight: 0.2, score: Math.round(rirAdherence) },
  ].map((c) => ({ ...c, contribution: Math.round(c.score * c.weight), lost: Math.round((100 - c.score) * c.weight) }));
  // Primary mover = the component that cost the most points (largest weighted shortfall). Null on a clean session.
  const primaryMover = components.reduce((a, b) => (b.lost > a.lost ? b : a), components[0]);
  const componentAttribution = {
    components,
    skipped,
    primary_mover: primaryMover && primaryMover.lost > 0 ? primaryMover.key : null,
  };

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
    overall_execution: Math.round(overallExecution),
    component_attribution: componentAttribution,
    // Q-181 — THE SWAP RECEIPT. Deterministic, computed from `primaryRef`; NOT LLM prose. An IN-SLOT
    // swap is SILENT (nothing was missed — field standard). An OUT-OF-SLOT swap is never docked either,
    // and gets ONE honest sentence naming what changed. It names the trade; it never predicts its cost.
    substitutions: matchedExercises
      .filter((ex: any) => ex.substituted && ex.substituted_with)
      .map((ex: any) => buildSubstitutionNote(String(ex.name ?? ''), String(ex.substituted_with ?? ''), ex.substitution_inferred === true)),
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
  
  // Bands + overall label from the shared, unit-tested readiness scale (D-235): energy/soreness Hooper 1–7,
  // sleep objective HOURS. Centralized so the missed-normalizer class (D-234) can't recur silently.
  return {
    energy: energy || null,
    soreness: soreness || null,
    sleep: sleep || null,
    energy_level: energyLevel(energy ?? null),
    soreness_level: sorenessLevel(soreness ?? null),
    sleep_quality: sleepQuality(sleep ?? null),
    overall_readiness: overallReadinessLabel(energy ?? null, soreness ?? null, sleep ?? null)
  };
}

// Helper function to calculate overall readiness score
// calculateOverallReadiness → moved to _shared/readiness-scale.ts (overallReadinessLabel), D-235:
// unit-tested + scale-guarded. The old local version assumed 0–10 for energy/soreness and was missed by
// the D-234 soreness pass — the extracted, fixtured version prevents that recurring.

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
      matched: match.matched,
      // Q-181: a DECLARED swap. Counts as COMPLETED (the slot was filled — no dock), but it is
      // UN-ANCHORED for load/RIR: the executed exercise has no prescription of its own, and grading
      // a hip thrust against a Bulgarian split squat's target is nonsense.
      substituted: (match as any).substituted === true,
      substituted_with: (match as any).substituted_with,
      // D-370: was this pairing DECLARED by the athlete or INFERRED by the matcher? Carried so the
      // receipt below says "filled the slot" rather than "swapped" — the app must not report its own
      // inference as something the athlete told it.
      substitution_inferred: (match as any).inferred === true
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
      const completedCount = sets.filter(isPerformedStrengthSet).length;
      return sum + completedCount;
    }, 0),
    set_completion_rate: (() => {
      // Calculate set completion rate directly from executed exercises
      const totalPlannedSets = plannedExercises.reduce((sum: number, ex: any) => 
        sum + (Array.isArray(ex.sets) ? ex.sets.length : 0), 0);
      const totalCompletedSets = executedExercises.reduce((sum: number, ex: any) => {
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        const completedCount = sets.filter(isPerformedStrengthSet).length;
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
      const completedCount = sets.filter(isPerformedStrengthSet).length;
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

  // D-189: canonical per-exercise e1RM trend from exercise_log.estimated_1rm (estimated1RM → exercise_log,
  // the app's clean single-source — written by compute-facts before this analyzer runs). This is the
  // PREREQUISITE for the narrative-core strength migration: the prompt's "estimated-1RM trend" line had
  // NO data behind it (rule-6 fabrication vector) because the packet read raw strength_exercises, never
  // the canonical e1RM. Now it reads the real value; the e1RM-trend addendum becomes expressible.
  const e1rmTrend = await getE1rmTrend(supabase, workout.user_id, workout.id, workout.date);
  console.log(`📊 e1RM: ${e1rmTrend.length} exercises with canonical estimated_1rm (${e1rmTrend.filter((e: any) => e.prior_e1rm != null).length} with a prior to trend)`);

  // Q-097/Q-102 phase 2: a 1RM/baseline TEST is measurement, not training. When detected, emit the
  // structured test result (reps×weight→e1RM + prior→now delta) and let downstream SUPPRESS the
  // execution/volume/adherence framing and the training narrative — a test has no "execution score."
  const isTest = detectStrengthTest(workout, plannedWorkout);
  const testResultV1 = isTest ? buildStrengthTestResult(executedExercises, e1rmTrend, userBaselines?.performance_numbers || {}) : null;
  if (isTest) console.log(`🧪 TEST detected → ${testResultV1?.lifts?.length ?? 0} lift result(s); execution/narrative suppressed`);

  // Generate comprehensive exercise-by-exercise breakdown
  let exerciseBreakdown: any[] = [];
  try {
    exerciseBreakdown = generateExerciseBreakdown(exerciseAdherence, userUnits, planUnits);
    console.log(`📊 EXERCISE BREAKDOWN: Generated ${exerciseBreakdown.length} exercises`);
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

  // ⛔ EVERYTHING THE NARRATOR NEEDED WENT WITH IT (2026-08-02) — see the deletion note further down.
  //
  // Deleted here, and every one of these existed ONLY to feed the LLM paragraph:
  //   · the Temporal Arc fetch (`getArcContext`) + `strength_spine_verdict`, and the `spine_direction`
  //     tagging of `e1rmTrend` rows. ⚠️ `spine_direction` has exactly one consumer in the codebase —
  //     `_shared/narrative-core/adapters/strength.ts`, the reasoning scaffold the deleted prompt was
  //     built from. Nothing renders it, nothing persists it.
  //   · `novelFact` — an 8-WEEK HISTORY QUERY per analysis, whose only job was giving the validator
  //     a list of movement names it was obliged to mention (Q-111 §2 rule 9).
  //   · `isUnplannedSession` — the flag for prompt rule 8 ("no plan → no target claim").
  //
  // That is TWO database round-trips removed from every strength analysis and every recompute, on top
  // of the model call itself.
  //
  // ⚠️ `getE1rmTrend` ABOVE STAYS. It is not narrator-only: `buildStrengthTestResult` reads it for the
  // test frame, and the e1RM numbers are the receipt behind the all-out set. Only the spine TAGGING of
  // its rows was for the paragraph.
  //
  // ⛔ IF A DETERMINISTIC STRENGTH LINE IS EVER BUILT, DO NOT START BY RESTORING THIS BLOCK. It is the
  // input list for a *prompt*, not for a fact. A deterministic composer would name its own inputs, and
  // "the Arc said taper" is not something a session ledger has any business asserting.
  const insights: string[] = [];

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
    data_quality: dataQuality,
    // Q-097/Q-102 phase 2 — a test carries its result + a flag so downstream drops training framing.
    is_test: isTest,
    test_result_v1: testResultV1,
  };
}

// ⛔ THE STRENGTH NARRATIVE LLM IS DELETED (2026-08-02, Michael: *"we are stripping all the ai out
// of the app... strength uses it for the synopsis it doesnt even show, we dont need it, it should be
// a ledger"*).
//
// WHAT WAS HERE: `generateEnhancedStrengthInsights` — a ~730-line Claude call (system prompt, e1RM
// block, novel-movement block, unplanned block, register block, a 2-attempt validator loop, and
// `capNarrative` to trim the result to four sentences). It ran on EVERY strength analysis and EVERY
// recompute, twice when the first draft broke a reasoning rule.
//
// ⛔ AND ITS OUTPUT HAD REACHED NOBODY SINCE 2026-07-30. The client stopped rendering the strength
// narrative that day — Michael, on the paragraph itself: *"we need to lose the narrative... we killed
// it for strength"* — and the deletion note in `MobileSummary.tsx` records why: on a correctly
// executed 5/3/1 session it printed three claims and all three were wrong, including "27% under the
// prescribed weight" for an athlete who lifted exactly what was written (it compared a 55/65/75 ramp
// against the top-set number). [D-338] removed the block that hosted it. The call kept running for a
// month, billing on every recompute, writing a paragraph into a field no surface read.
//
// ⚠️ THE SCREEN IS A LEDGER AND NEEDS NO PARAGRAPH. What replaced it is already shipped and better:
// the set rows, the all-out set with its rep record, the assistance totals ([D-370]), and the swap
// receipt — which is DETERMINISTIC prose (`_shared/strength/substitution-note.ts`), computed from the
// movement-pattern table and checkable by hand. That is the model for anything this screen ever says.
//
// ⛔ THIS IS NOT A BAN ON LLMs IN THE APP. Michael, same message: *"we may keep it in race builder so
// dont get rid of all of it."* `_shared/llm.ts` stays, and so does every caller of it — the coach,
// the race-readiness line, `course-strategy`, `arc-setup-chat`, `extract-races`. What died is the
// output-LLM on the STRENGTH SESSION SCREEN specifically.
//
// ⚠️ `insights` IS NOW ALWAYS EMPTY, and the fields fed from it go null by their own existing
// guards — `session_state_v1.narrative.text` (null, source 'none'), `summary.bullets` ([]), and
// top-level `ai_summary` (null). Those were already the values for any session where the LLM failed,
// so no consumer meets a shape it has not always handled. ⛔ Do NOT "restore" a paragraph here by
// wiring a deterministic composer into `insights` without deciding, first, that the screen wants
// prose at all — the run and ride composers exist because those screens have a story to tell about
// pacing and drift. A strength ledger does not.

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

    // D-103: in-handler user-JWT auth gate REMOVED. Pre-D-103 this analyzer
    // required `supabase.auth.getUser(token)` to return a user.id — but every
    // internal invoker (recompute-workout, ingest-activity, bulk-reanalyze-
    // workouts) calls with the service-role token, which has no user.id, so
    // every internal call returned 401 silently. recompute-workout swallowed
    // the error at index.ts:116-119 and returned ok:true to the client. Net
    // effect: strength narratives have been silently failing to generate
    // since the gate was added. Mirror cycling + run analyzers which trust
    // the service-role caller and use workout.user_id read from the DB row.
    // The 403 cross-check below (was line 2418) is also removed since
    // requestingUserId no longer exists; workout.user_id is read directly
    // for downstream queries.

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

    // D-103: per-user cross-check removed alongside the JWT gate above.
    // Caller authorization is now enforced upstream by recompute-workout
    // (validates user JWT at index.ts:48 + verifies `workouts.user_id ===
    // user.id` at :69 before invoking) and by ingest-activity (service-role
    // context — webhook-trusted). Matches cycling/run analyzer pattern.

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
        .select('*, strength_exercises, steps_preset, workout_structure, user_id, training_plan_id')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id) // Authorization: verify planned workout belongs to user
        .single();
      
      if (plannedError) {
        console.log(`Failed to fetch planned workout: ${plannedError.message}`);
      } else {
        // Double-check user ownership (defense in depth)
        if (plannedData.user_id === workout.user_id) {
          plannedWorkout = plannedData;
          console.log(`Found planned workout: ${plannedWorkout?.name}`);
        } else {
          console.warn('⚠️ Planned workout does not belong to user - skipping plan context');
        }
      }
    }
    
    // Analyze the strength workout
    const analysis = await analyzeStrengthWorkout(workout, plannedWorkout, userBaselines, supabase);
    
    console.log('=== STRENGTH ANALYSIS COMPLETE ===');
    console.log('Status:', analysis.status);
    console.log('Insights count:', analysis.insights?.length || 0);
    
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
    const transitionWeekIndex =
      Number((analysis as any)?.plan_metadata?.parsed_week ?? (analysis as any)?.plan_metadata?.week ?? null);
    const isTransitionWindow = isPlanTransitionWindowByWeekIndex(
      Number.isFinite(transitionWeekIndex) ? transitionWeekIndex : null,
    );

    const sessionStateV1 = {
      version: 1,
      owner: 'analysis',
      generated_at: new Date().toISOString(),
      workout_id: workout_id,
      discipline: 'strength',
      glance: (() => {
        // A 1RM/baseline TEST has NO execution score — it's a measurement, not a session. Suppressing
        // it here stops the "Execution %" chip from narrating a test as a graded workout (Q-097/Q-102).
        if (analysis.is_test) return { status_label: '1RM Test', execution_score: null };
        // The execution score lives in execution_summary.overall_execution (weight 30% /
        // RIR 20% / set-completion 20% / exercise-completion 30%). The old code read
        // `performance.execution_score`, a field that never existed on the performance object —
        // so glance.execution_score was ALWAYS null and the Performance screen showed no score.
        const execScore = typeof analysis.execution_summary?.overall_execution === 'number'
          ? analysis.execution_summary.overall_execution
          : null;
        return {
          status_label: execScore != null
            ? (execScore >= 85 ? 'Strong execution' : execScore >= 70 ? 'Solid execution' : 'Needs adjustment')
            : null,
          execution_score: execScore,
        };
      })(),
      // Q-097/Q-102 phase 2 — test flag + structured result, threaded to session_detail_v1 by build.ts.
      is_test: analysis.is_test === true,
      test_result_v1: analysis.test_result_v1 || null,
      narrative: {
        text: Array.isArray(analysis.insights) && analysis.insights.length > 0
          ? String(analysis.insights[0] || '')
          : null,
        source: Array.isArray(analysis.insights) && analysis.insights.length > 0 ? 'analysis' : 'none',
      },
      summary: {
        title: 'Insights',
        bullets: Array.isArray(analysis.insights) ? analysis.insights.slice(0, 4).map((s: any) => String(s || '').trim()).filter(Boolean) : [],
      },
      details: {
        execution_summary: analysis.execution_summary || null,
      },
      guards: {
        is_transition_window: isTransitionWindow,
        suppress_deviation_language: isTransitionWindow,
      },
    };

    const strengthFactsExercises = (analysis.exercise_adherence || []).map((ea: any) => {
      const plannedSets = Array.isArray(ea?.planned?.sets) ? ea.planned.sets : [];
      const plannedWeight = plannedSets.length > 0 ? (plannedSets[0]?.weight ?? null) : null;
      const plannedReps = plannedSets.length > 0 ? (plannedSets[0]?.reps ?? null) : null;
      return {
        name: ea?.name ?? '',
        planned_weight: typeof plannedWeight === 'number' ? plannedWeight : null,
        planned_reps: typeof plannedReps === 'number' ? plannedReps : null,
        adherence_pct: typeof ea?.adherence?.set_completion === 'number' ? ea.adherence.set_completion : null,
      };
    });

    // D-102: thin strength_fact_packet_v1 — mirrors the run / cycling fact packet
    // pattern. Carries the smallest set of facts the INSIGHTS narrative needs to
    // lead with execution + phase context + RIR delta. Endurance load context
    // reserved-but-unwired in v1 (analyzer doesn't fetch athlete_snapshot today;
    // wiring is a follow-up that doesn't block the prompt-cap refactor).
    const strengthFactPacketV1 = (() => {
      const rirEntries = (analysis.exercise_adherence || [])
        .map((ea: any) => ({
          target: typeof ea?.adherence?.target_rir === 'number' ? ea.adherence.target_rir : null,
          actual: typeof ea?.adherence?.avg_rir === 'number' ? ea.adherence.avg_rir : null,
        }))
        .filter((e: { target: number | null; actual: number | null }) => e.target != null || e.actual != null);
      const meanOrNull = (xs: number[]): number | null =>
        xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
      const avgTargetRir = meanOrNull(rirEntries.map((e: { target: number | null }) => e.target).filter((v: number | null): v is number => typeof v === 'number'));
      const avgActualRir = meanOrNull(rirEntries.map((e: { actual: number | null }) => e.actual).filter((v: number | null): v is number => typeof v === 'number'));
      const rirDelta = (avgActualRir != null && avgTargetRir != null)
        ? Math.round((avgActualRir - avgTargetRir) * 10) / 10
        : null;
      // Same shared ±1.0 band as the Details table + State (VERDICT_DEVIATION). Was ±1.0 already, so
      // behavior is unchanged here — routed through the one helper for single-source.
      const rirVerdict = rirVerdictFromDelta(rirDelta);
      const phaseFacts = (() => {
        const pm = (analysis as any).plan_metadata as EnhancedPlanContext | null;
        if (!pm) return { phase: null, week_in_phase: null, plan_intent: null, plan_type: null };
        return {
          phase: pm.parsed_phase ?? pm.phase ?? null,
          week_in_phase: typeof pm.parsed_week === 'number' ? pm.parsed_week : (typeof pm.week === 'number' ? pm.week : null),
          plan_intent: pm.strength_type ?? null,
          plan_type: pm.plan_type ?? null,
        };
      })();
      const overall = (analysis as any).overall_adherence ?? {};
      const volume = (analysis as any).volume_analysis ?? {};
      return {
        version: 1,
        discipline: 'strength' as const,
        generated_at: new Date().toISOString(),
        facts: {
          ...phaseFacts,
          avg_target_rir: avgTargetRir,
          avg_actual_rir: avgActualRir,
          rir_delta: rirDelta,
          rir_verdict: rirVerdict,
          total_volume_lb: typeof volume?.total_volume === 'number' ? volume.total_volume : null,
          exercises_completed: typeof overall?.exercises_executed === 'number' ? overall.exercises_executed : 0,
          exercises_planned: typeof overall?.exercises_planned === 'number' ? overall.exercises_planned : 0,
          set_completion_pct: typeof overall?.set_completion_rate === 'number' ? overall.set_completion_rate : null,
          session_rpe: typeof (analysis as any)?.session_rpe?.rpe === 'number' ? (analysis as any).session_rpe.rpe : null,
        },
        // D-102: reserved for the future endurance-load wiring (fetch from
        // athlete_snapshot.weekly_workload + last-long-day signals). Null in
        // v1 — the prompt rule is tolerant; if facts.endurance_load_context
        // is null the narrative skips that clause.
        endurance_load_context: null,
      };
    })();

    // D-102: lift narrative to top-level ai_summary. Pre-fix the LLM output
    // lived only in workout_analysis.session_state_v1.narrative.text — cycling
    // and run analyzers expose it at workout_analysis.ai_summary for client
    // parity (used by the cached-summary path in workout-detail + the
    // session_detail_v1 builder). This makes strength match.
    // A TEST has no training narrative — the test-result frame (per-lift e1RM + delta) IS the story.
    // Null the ai_summary so no "phase/volume/execution" prose is shown for a measurement. (Q-097/Q-102)
    const liftedAiSummary: string | null = analysis.is_test
      ? null
      : (Array.isArray(analysis.insights) && analysis.insights.length > 0
        ? String(analysis.insights[0] || '').trim() || null
        : null);

    const updatePayload = {
      workout_analysis: {
        performance: performance,
        detailed_analysis: detailedAnalysis,
        strengths: [], // Extract from progression_data if needed
        session_state_v1: sessionStateV1,
        red_flags: [], // Extract from adherence if needed
        strength_facts: { exercises: strengthFactsExercises },
        // Q-097/Q-102 phase 2 — top-level test flag + result for the session_detail_v1 builder.
        is_test: analysis.is_test === true,
        test_result_v1: analysis.test_result_v1 || null,
        // D-102: top-level ai_summary + fact packet (matches run/cycling parity).
        ai_summary: liftedAiSummary,
        ai_summary_generated_at: liftedAiSummary ? new Date().toISOString() : null,
        strength_fact_packet_v1: strengthFactPacketV1,
        // D-079 parity: cycling/run write recomputed_at so workout-detail's
        // isSessionDetailStale check fires correctly after analyzer reruns.
        recomputed_at: new Date().toISOString(),
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
