/**
 * EDGE FUNCTION: validate-reschedule
 * 
 * SMART SERVER: Validates workout rescheduling with Coach Brain integration
 * 
 * Input: { workout_id, new_date }
 * Output: { severity, reasons, before, after, suggestions, coachOptions }
 * 
 * Architecture: Smart Server, Dumb Client
 * - All validation logic happens server-side
 * - Coach Brain provides ranked reschedule options with scientific explanations
 * - Client just calls and displays results
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getRescheduleEngine } from '../_shared/coaching/index.ts';
import { buildTimeline, findDayIndex } from './timeline-builder.ts';
import { intentTitle } from '../_shared/intent-title.ts';
import { sessionTypeFor } from '../_shared/standing-plan/family-lines.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intensity classification
type IntensityBucket = 'hard' | 'medium' | 'easy';
type StrengthFocus = 'lower' | 'upper' | 'full' | 'unknown';
type WorkoutPurpose = 'quality_run' | 'long_run' | 'easy_run' | 'upper_body' | 'lower_body' | 'full_body' | 'other';

interface ValidationReason {
  code: string;
  message: string;
  data?: any;
}

interface ValidationResult {
  severity: 'green' | 'yellow' | 'red';
  reasons: ValidationReason[];
  before: {
    dailyWorkload: number | null;
    weekWorkload: number | null;
  };
  after: {
    dailyWorkload: number | null;
    weekWorkload: number | null;
  };
  suggestions?: string[]; // ISO date strings (general suggestions based on workload/intensity)
  planContext?: {
    isPlanWorkout: boolean;
    planName?: string;
    canonicalDate?: string;
    daysFromCanonical?: number;
    planPhase?: string;
    weekIntent?: string;
    isRecoveryWeek?: boolean;
    isTaperWeek?: boolean;
  };
  conflicts?: {
    sameTypeWorkouts: Array<{ id: string; name: string; type: string }>;
  };
}

// Hard workout indicators (from steps_preset tokens)
const HARD_TOKENS = [
  'interval', 'vo2', 'speed', 'anaerobic', 'neuro',
  'tempo', 'threshold', 'thr', 'ss', // sweet spot
  '5kpace', '10kpace', // fast paces
];

const EASY_TOKENS = [
  'easy', 'recovery', 'endurance', 'z1', 'z2',
  'warmup', 'cooldown', 'drill',
];

function classifyIntensity(workout: any): IntensityBucket {
  const type = String(workout.type || '').toLowerCase();
  const steps = Array.isArray(workout.steps_preset) ? workout.steps_preset : [];
  const desc = String(workout.description || '').toLowerCase();
  const name = String(workout.name || '').toLowerCase();
  
  const allText = [...steps, desc, name].join(' ').toLowerCase();
  
  // Check for hard indicators
  if (HARD_TOKENS.some(token => allText.includes(token))) {
    return 'hard';
  }
  
  // Check for easy indicators
  if (EASY_TOKENS.some(token => allText.includes(token))) {
    return 'easy';
  }
  
  // Default to medium
  return 'medium';
}

function isLongSession(workout: any): boolean {
  const type = String(workout.type || '').toLowerCase();
  const duration = workout.total_duration_seconds || workout.duration || 0;
  const durationMinutes = duration / 60;
  
  // Check plan tags/description first
  const desc = String(workout.description || '').toLowerCase();
  const name = String(workout.name || '').toLowerCase();
  // ⚠️ NOT ON A HARD WORKOUT (2026-09-19): "Long Surge and Float" is titled by its workout's name and is not the long session.
  if ((desc.includes('long') || name.includes('long')) && sessionTypeFor(workout) == null) {
    return true;
  }
  
  // Duration thresholds
  if (type === 'run' || type === 'running') {
    return durationMinutes > 90;
  }
  if (type === 'ride' || type === 'bike' || type === 'cycling') {
    return durationMinutes > 120;
  }
  if (type === 'swim' || type === 'swimming') {
    return durationMinutes > 60;
  }
  
  return false;
}

function classifyStrengthFocus(workout: any): StrengthFocus {
  if (workout.type !== 'strength') return 'unknown';
  
  const exercises = Array.isArray(workout.strength_exercises) 
    ? workout.strength_exercises 
    : [];
  
  if (exercises.length === 0) return 'unknown';
  
  const exerciseNames = exercises
    .map((ex: any) => String(ex.name || '').toLowerCase())
    .join(' ');
  
  // Lower body indicators
  const lowerKeywords = ['squat', 'deadlift', 'leg press', 'lunge', 'step-up', 'leg curl', 'leg extension'];
  const hasLower = lowerKeywords.some(kw => exerciseNames.includes(kw));
  
  // Upper body indicators
  const upperKeywords = ['bench', 'press', 'row', 'pull', 'chin', 'lat', 'bicep', 'tricep', 'shoulder'];
  const hasUpper = upperKeywords.some(kw => exerciseNames.includes(kw));
  
  if (hasLower && hasUpper) return 'full';
  if (hasLower) return 'lower';
  if (hasUpper) return 'upper';
  
  return 'unknown';
}

// Classify workout purpose (quality run, long run, easy run, upper body, lower body)
function classifyWorkoutPurpose(workout: any): WorkoutPurpose {
  const type = String(workout.type || '').toLowerCase();
  const steps = Array.isArray(workout.steps_preset) ? workout.steps_preset : [];
  const desc = String(workout.description || '').toLowerCase();
  const name = String(workout.name || '').toLowerCase();
  const allText = [...steps, desc, name].join(' ').toLowerCase();
  
  // Strength workouts
  if (type === 'strength') {
    const strengthFocus = classifyStrengthFocus(workout);
    if (strengthFocus === 'upper') return 'upper_body';
    if (strengthFocus === 'lower') return 'lower_body';
    if (strengthFocus === 'full') return 'full_body';
    return 'other';
  }
  
  // Running workouts
  if (type === 'run' || type === 'running') {
    // Long run indicators
    if (isLongSession(workout)) return 'long_run';
    
    // Quality run indicators (intervals, tempo, VO2, threshold)
    const qualityIndicators = ['interval', 'vo2', 'tempo', 'threshold', 'thr', '5kpace', '10kpace', 'speed', 'strides'];
    if (qualityIndicators.some(indicator => allText.includes(indicator))) {
      return 'quality_run';
    }
    
    // Easy run (recovery, easy, endurance, z1, z2)
    const easyIndicators = ['easy', 'recovery', 'endurance', 'z1', 'z2'];
    if (easyIndicators.some(indicator => allText.includes(indicator))) {
      return 'easy_run';
    }
    
    // Default to easy_run if no indicators
    return 'easy_run';
  }
  
  return 'other';
}

/**
 * ⛔ THERE IS NO SECOND WORKLOAD FORMULA HERE (2026-09-15, §8.0 #29). `estimateWorkload` lived at this spot —
 * duration × intensity² × 100, with a flat 80/50 for a lifting session — beside the drawer's own "Workload"
 * chip for the same session, so the popup and the chip disagreed on every row. The popup now sums
 * `planned_workouts.workload_planned`, the field `materialize-plan` and `rematerialize-standing-block` write
 * and the week totals and the chip read (`get-week:1593`). A row without it makes the popup say so.
 */

/** A planned row's stored workload, or null when the server has not priced it yet. */
/** The sport word the drag warning prints (Michael, 2026-09-20: run / ride / lift). */
function sportWord(type: unknown): string {
  const t = String(type ?? '').toLowerCase();
  if (t === 'strength') return 'lift';
  if (t === 'bike' || t === 'cycling') return 'ride';
  if (t === 'pilates_yoga') return 'yoga session';
  return t || 'session';
}

function posLoad(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { workout_id, new_date } = await req.json();
    
    if (!workout_id || !new_date) {
      return new Response(
        JSON.stringify({ error: 'Missing workout_id or new_date' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch workout
    const { data: workout, error: workoutError } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('id', workout_id)
      .eq('user_id', user.id)
      .single();

    if (workoutError || !workout) {
      return new Response(
        JSON.stringify({ error: 'Workout not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const oldDate = workout.date;
    const workoutStatus = String(workout.workout_status || '').toLowerCase();
    
    // Check if workout is part of a plan
    const trainingPlanId = workout.training_plan_id;
    const weekNumber = workout.week_number;
    const dayNumber = workout.day_number;
    let canonicalDate: string | null = null;
    let planName: string | null = null;
    let planPhase: string | null = null;
    let weekIntent: string | null = null;
    let isRecoveryWeek = false;
    let isTaperWeek = false;
    let startDateStr: string | null = null;
    let plan: any = null;
    let config: any = {};
    
    if (trainingPlanId && weekNumber && dayNumber) {
      // NOTE: planned_workouts.training_plan_id references the 'plans' table, not 'training_plans'
      // Try 'plans' table first (current system), then fallback to 'training_plans' (legacy)
      let planData = null;
      
      // Try 'plans' table first
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('id, name, config')
        .eq('id', trainingPlanId)
        .eq('user_id', user.id)
        .single();
      
      if (!plansError && plansData) {
        planData = plansData;
      } else {
        // Fallback: try 'training_plans' table (legacy)
        console.log('[validate-reschedule] Plan not found in plans table, trying training_plans...');
        const { data: legacyPlanData } = await supabase
          .from('training_plans')
          .select('id, name, config')
          .eq('id', trainingPlanId)
          .eq('user_id', user.id)
          .single();
        
        if (legacyPlanData) {
          planData = legacyPlanData;
        }
      }
      
      if (planData) {
        plan = planData;
        planName = plan.name;
        config = plan.config || {};
        startDateStr = config.user_selected_start_date || config.start_date;
        
        // Determine plan phase and week intent
        const weekIndex = Number(weekNumber) || 1;
        console.log('[validate-reschedule] Checking week type for week', weekIndex, 'config.phases:', config.phases ? Object.keys(config.phases) : 'none');
        
        if (config.phases) {
          for (const [phaseKey, phaseData] of Object.entries(config.phases)) {
            const phase = phaseData as any;
            if (phase.weeks && Array.isArray(phase.weeks) && phase.weeks.includes(weekIndex)) {
              planPhase = phaseKey;
              
              // Check if it's a recovery week
              if (phase.recovery_weeks && Array.isArray(phase.recovery_weeks) && phase.recovery_weeks.includes(weekIndex)) {
                isRecoveryWeek = true;
                weekIntent = 'recovery';
                console.log('[validate-reschedule] Detected recovery week from phases');
              } else if (phaseKey.toLowerCase().includes('taper')) {
                isTaperWeek = true;
                weekIntent = 'taper';
                console.log('[validate-reschedule] Detected taper week from phase name');
              } else if (phaseKey.toLowerCase().includes('peak')) {
                weekIntent = 'peak';
              } else if (phaseKey.toLowerCase().includes('base')) {
                weekIntent = 'baseline';
              } else {
                weekIntent = 'build';
              }
              break;
            }
          }
        }
        
        // Also check weekly_summaries (from plans.config.weekly_summaries OR weekly_summaries table)
        if (!weekIntent || !isRecoveryWeek) {
          // Check plans.config.weekly_summaries first (current system)
          const weeklySummaries = config.weekly_summaries || {};
          const weekSummary = weeklySummaries[String(weekIndex)] || {};
          const focusLabel = weekSummary.focus || weekSummary.focus_label;
          
          if (focusLabel) {
            const label = String(focusLabel).toLowerCase();
            console.log('[validate-reschedule] Checking weekly_summaries focus_label:', label);
            if (label.includes('recovery')) {
              isRecoveryWeek = true;
              weekIntent = 'recovery';
              console.log('[validate-reschedule] Detected recovery week from weekly_summaries');
            } else if (label.includes('taper')) {
              isTaperWeek = true;
              weekIntent = 'taper';
              console.log('[validate-reschedule] Detected taper week from weekly_summaries');
            } else if (label.includes('peak')) {
              weekIntent = 'peak';
            }
          } else {
            // Fallback: check weekly_summaries table (legacy)
            const { data: weeklySummary } = await supabase
              .from('weekly_summaries')
              .select('focus_label')
              .eq('training_plan_id', trainingPlanId)
              .eq('week_number', weekIndex)
              .eq('user_id', user.id)
              .single();
            
            if (weeklySummary?.focus_label) {
              const label = String(weeklySummary.focus_label).toLowerCase();
              console.log('[validate-reschedule] Checking weekly_summaries table focus_label:', label);
              if (label.includes('recovery')) {
                isRecoveryWeek = true;
                weekIntent = 'recovery';
                console.log('[validate-reschedule] Detected recovery week from weekly_summaries table');
              } else if (label.includes('taper')) {
                isTaperWeek = true;
                weekIntent = 'taper';
              } else if (label.includes('peak')) {
                weekIntent = 'peak';
              }
            }
          }
        }
        
        console.log('[validate-reschedule] Final week type detection:', { isRecoveryWeek, isTaperWeek, weekIntent, planPhase });
        
        if (startDateStr) {
          // Calculate canonical date: start_date + (week_number - 1) * 7 + (day_number - 1)
          try {
            const startDate = new Date(startDateStr + 'T12:00:00');
            const weeksOffset = (Number(weekNumber) || 1) - 1;
            const daysOffset = (Number(dayNumber) || 1) - 1;
            const canonical = new Date(startDate);
            canonical.setDate(canonical.getDate() + (weeksOffset * 7) + daysOffset);
            canonicalDate = canonical.toISOString().split('T')[0];
          } catch (e) {
            console.error('[validate-reschedule] Error calculating canonical date:', e);
          }
        }
      }
    }

    // ===== A) STATE RULES (hard blocks) =====
    if (workoutStatus === 'completed' || workoutStatus === 'in_progress') {
      return new Response(
        JSON.stringify({
          severity: 'red',
          reasons: [{
            code: 'read_only',
            message: 'Cannot reschedule completed or in-progress workouts'
          }],
          before: { dailyWorkload: 0, weekWorkload: 0 },
          after: { dailyWorkload: 0, weekWorkload: 0 }
        } as ValidationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Classify workout
    const intensity = classifyIntensity(workout);
    const isLong = isLongSession(workout);
    const strengthFocus = classifyStrengthFocus(workout);
    const workoutWorkload = posLoad((workout as any).workload_planned);
    const workoutPurpose = classifyWorkoutPurpose(workout);
    
    // Understand plan week structure (which day_number typically has which workout type)
    let planWeekStructure: Map<number, WorkoutPurpose[]> = new Map();
    let isPhaseTransition = false;
    let previousWeekPhase: string | null = null;
    
    if (trainingPlanId && weekNumber) {
      // Fetch workouts from same plan to understand week structure
      // Look at multiple weeks to get a pattern
      const { data: planWorkouts } = await supabase
        .from('planned_workouts')
        .select('day_number, type, steps_preset, description, name, strength_exercises, total_duration_seconds')
        .eq('training_plan_id', trainingPlanId)
        .eq('user_id', user.id)
        .in('workout_status', ['planned', 'in_progress'])
        .gte('week_number', Math.max(1, Number(weekNumber) - 2))
        .lte('week_number', Number(weekNumber) + 2)
        .order('week_number', { ascending: true })
        .order('day_number', { ascending: true });
      
      if (planWorkouts && planWorkouts.length > 0) {
        // Build structure: day_number -> typical workout purposes
        const dayPurposeMap = new Map<number, Map<WorkoutPurpose, number>>();
        
        for (const pw of planWorkouts) {
          const dn = Number(pw.day_number) || 1;
          const purpose = classifyWorkoutPurpose(pw);
          
          if (!dayPurposeMap.has(dn)) {
            dayPurposeMap.set(dn, new Map());
          }
          const purposeCount = dayPurposeMap.get(dn)!;
          purposeCount.set(purpose, (purposeCount.get(purpose) || 0) + 1);
        }
        
        // For each day, get the most common purpose(s)
        for (const [dayNum, purposeCounts] of dayPurposeMap.entries()) {
          const purposes: WorkoutPurpose[] = [];
          const sorted = Array.from(purposeCounts.entries()).sort((a, b) => b[1] - a[1]);
          // Take top 2 most common purposes for each day
          // More lenient: if we have at least 2 weeks of data, use >= 2; otherwise use >= 1
          const minOccurrences = planWorkouts.length >= 14 ? 2 : 1; // 14 = ~2 weeks of workouts
          for (let i = 0; i < Math.min(2, sorted.length); i++) {
            if (sorted[i][1] >= minOccurrences) {
              purposes.push(sorted[i][0]);
            }
          }
          if (purposes.length > 0) {
            planWeekStructure.set(dayNum, purposes);
          }
        }
        
        console.log('[validate-reschedule] Plan week structure detected:', 
          Array.from(planWeekStructure.entries()).map(([dn, p]) => `Day ${dn}: ${p.join(', ')}`).join('; '));
      }
      
      // Check if this is a phase transition (recovery → build, etc.)
      if (weekNumber && Number(weekNumber) > 1) {
        const prevWeek = Number(weekNumber) - 1;
        // Check previous week's phase
        if (config.phases) {
          for (const [phaseKey, phaseData] of Object.entries(config.phases)) {
            const phase = phaseData as any;
            if (phase.weeks && Array.isArray(phase.weeks) && phase.weeks.includes(prevWeek)) {
              previousWeekPhase = phaseKey;
              break;
            }
          }
        }
        isPhaseTransition = previousWeekPhase !== planPhase && previousWeekPhase !== null;
      }
    }
    
    // Calculate target date's day_number in the plan
    let targetDayNumber: number | null = null;
    if (trainingPlanId && startDateStr) {
      try {
        const startDate = new Date(startDateStr + 'T12:00:00');
        const targetDate = new Date(new_date + 'T12:00:00');
        const daysDiff = Math.round((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        // day_number = (daysDiff % 7) + 1, but we need to account for week_number
        // Actually, we need to find which week this date falls in
        const weeksFromStart = Math.floor(daysDiff / 7);
        const dayInWeek = ((daysDiff % 7) + 7) % 7; // Handle negative modulo
        targetDayNumber = dayInWeek + 1; // 1-7
        console.log('[validate-reschedule] Target date calculation:', {
          startDate: startDateStr,
          targetDate: new_date,
          daysDiff,
          dayInWeek,
          targetDayNumber
        });
      } catch (e) {
        console.error('[validate-reschedule] Error calculating target day_number:', e);
      }
    }
    
    console.log('[validate-reschedule] Workout purpose:', workoutPurpose, 'Target day:', targetDayNumber, 'Plan structure:', planWeekStructure.size > 0 ? 'detected' : 'not detected');

    // Fetch week context (target date ± 3 days = full week for proper validation)
    const contextStart = addDays(new_date, -3);
    const contextEnd = addDays(new_date, 3);
    
    const { data: contextWorkouts, error: contextError } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', contextStart)
      .lte('date', contextEnd)
      .neq('id', workout_id) // Exclude the workout being moved
      .in('workout_status', ['planned', 'in_progress']);

    /**
     * ⛔ THE WEEK IS THE PLAN'S WEEK (2026-09-15, §8.0 #30). The weekly number was summed over a seven-day
     * window centred on each date, so the "before" total counted the days around the NEW date — it under-counted
     * against the "after" number by construction. Both sides now sum the plan week (`week_number`) that holds
     * the date, from the rows of this plan.
     */
    const { data: planWeekRows } = trainingPlanId
      ? await supabase
        .from('planned_workouts')
        .select('id, date, week_number, workload_planned, workout_status')
        .eq('user_id', user.id)
        .eq('training_plan_id', trainingPlanId)
        .in('workout_status', ['planned', 'in_progress'])
      : { data: null } as { data: null };
    const weekOfDate = new Map<string, number>();
    const rowsByWeek = new Map<number, Array<{ id: string; workload_planned: unknown }>>();
    for (const r of (planWeekRows ?? []) as Array<Record<string, unknown>>) {
      const wk = Number(r.week_number);
      const d = String(r.date ?? '').slice(0, 10);
      if (!Number.isFinite(wk) || !d) continue;
      weekOfDate.set(d, wk);
      const arr = rowsByWeek.get(wk) ?? [];
      arr.push({ id: String(r.id), workload_planned: r.workload_planned });
      rowsByWeek.set(wk, arr);
    }

    if (contextError) {
      console.error('[validate-reschedule] Context fetch error:', contextError);
    }

    const contextByDate = new Map<string, any[]>();
    // Build map for full week (±3 days = 7 days total)
    for (let i = -3; i <= 3; i++) {
      const date = addDays(new_date, i);
      contextByDate.set(date, []);
    }

    (contextWorkouts || []).forEach((w: any) => {
      const date = w.date;
      if (contextByDate.has(date)) {
        contextByDate.get(date)!.push(w);
      }
    });

    // The day's stored load: `workload_planned` on the rows of that date. Null when a row on it has none.
    let loadUnknown = workoutWorkload == null;
    const calculateDayWorkload = (date: string): number => {
      const workouts = contextByDate.get(date) || [];
      let sum = 0;
      for (const w of workouts) {
        const load = posLoad((w as any).workload_planned);
        if (load == null) loadUnknown = true; else sum += load;
      }
      return sum;
    };

    /** The plan week holding this date, summed from its own rows (the moved row excluded — it is added by the caller). */
    const calculateWeekWorkload = (date: string): number => {
      const wk = weekOfDate.get(String(date).slice(0, 10));
      if (wk == null) { loadUnknown = true; return 0; }
      let sum = 0;
      for (const r of rowsByWeek.get(wk) ?? []) {
        if (r.id === workout_id) continue;
        const load = posLoad(r.workload_planned);
        if (load == null) loadUnknown = true; else sum += load;
      }
      return sum;
    };

    const movedLoad = workoutWorkload ?? 0;
    const beforeDaily = calculateDayWorkload(oldDate) + movedLoad;
    const beforeWeekly = calculateWeekWorkload(oldDate) + movedLoad;
    const afterDaily = calculateDayWorkload(new_date) + movedLoad;
    const afterWeekly = calculateWeekWorkload(new_date) + movedLoad;

    // Check for conflicts: same type workouts on target date
    const sameDayWorkouts = contextByDate.get(new_date) || [];
    const sameTypeWorkouts = sameDayWorkouts
      .filter((w: any) => w.type === workout.type && w.id !== workout_id)
      .map((w: any) => ({
        id: w.id,
        // The day's title in the book's terms (`_shared/intent-title.ts`, 2026-09-18) — the popup prints it.
        name: intentTitle(w.name) || `${w.type} workout`,
        type: w.type
      }));

    const reasons: ValidationReason[] = [];
    let severity: 'green' | 'yellow' | 'red' = 'green';
    
    // Check if target date conflicts with plan structure
    // e.g., don't put long run on quality day, don't put quality run on long run day
    if (targetDayNumber && planWeekStructure.has(targetDayNumber)) {
      const typicalPurposes = planWeekStructure.get(targetDayNumber)!;
      console.log('[validate-reschedule] Checking plan structure conflict:', {
        targetDayNumber,
        workoutPurpose,
        typicalPurposes
      });
      
      const conflictsWithStructure = typicalPurposes.some(purpose => {
        // Long run shouldn't go on quality day
        if (workoutPurpose === 'long_run' && purpose === 'quality_run') return true;
        // Quality run shouldn't go on long run day
        if (workoutPurpose === 'quality_run' && purpose === 'long_run') return true;
        // Don't put long run on upper body day (though upper body + long run is OK, it's not the plan structure)
        // Actually, let's be more lenient - only warn about quality/long conflicts
        return false;
      });
      
      if (conflictsWithStructure) {
        if (severity === 'green') severity = 'yellow';
        const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][targetDayNumber - 1] || `Day ${targetDayNumber}`;
        const typicalPurpose = typicalPurposes[0];
        const purposeName = typicalPurpose === 'quality_run' ? 'quality run day' : 
                           typicalPurpose === 'long_run' ? 'long run day' :
                           typicalPurpose === 'upper_body' ? 'upper body day' :
                           typicalPurpose === 'lower_body' ? 'lower body day' : 'different workout type';
        reasons.push({
          code: 'plan_structure_conflict',
          message: `${dayName} is typically a ${purposeName} in your plan. Moving ${workoutPurpose === 'long_run' ? 'long run' : workoutPurpose === 'quality_run' ? 'quality run' : 'this workout'} here conflicts with that structure.`,
          data: {
            targetDayNumber,
            typicalPurposes,
            workoutPurpose,
            suggestion: `Consider moving to a day that typically has ${workoutPurpose === 'long_run' ? 'long runs' : workoutPurpose === 'quality_run' ? 'quality runs' : 'this type of workout'}`
          }
        });
      }
    } else if (targetDayNumber) {
      console.log('[validate-reschedule] No plan structure found for day', targetDayNumber);
    }
    
    /**
     * ⛔ BOTH STAY (Michael, 2026-09-20). A session moved onto a day that already has one of its sport used to
     * replace it: the phone deleted every row listed here before the move. Build what the athlete tapped and
     * warn; never drop. A day may now hold two rides by design (activate-plan `day_seq`), and the delete would
     * have taken both. The rows are no longer returned as `conflicts`, so a phone still running the old delete
     * has nothing to delete.
     */
    if (sameTypeWorkouts.length > 0) {
      if (severity === 'green') severity = 'yellow';
      reasons.push({
        code: 'same_type_conflict',
        message: `This day already has a ${sportWord(workout.type)}. Both stay.`,
        data: { same_type: sameTypeWorkouts }
      });
    }
    
    // ===== PLAN CONTEXT: Warn if moving plan workout far from canonical date =====
    if (canonicalDate && canonicalDate !== new_date) {
      const canonical = new Date(canonicalDate + 'T12:00:00');
      const newDate = new Date(new_date + 'T12:00:00');
      const daysDiff = Math.abs(Math.round((newDate.getTime() - canonical.getTime()) / (1000 * 60 * 60 * 24)));
      
      if (daysDiff > 7) {
        if (severity === 'green') severity = 'yellow';
        const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : weekIntent === 'peak' ? " You're in peak week, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
        reasons.push({
          code: 'plan_date_drift',
          message: `Moving ${daysDiff} days from planned date.${phaseNote} this might throw off your training rhythm.`,
          data: { 
            canonicalDate, 
            newDate: new_date, 
            daysDiff,
            planName: planName || 'training plan',
            planPhase,
            weekIntent,
            suggestion: 'Try to stay closer to the planned date'
          }
        });
      } else if (daysDiff > 2) {
        if (severity === 'green') severity = 'yellow';
        const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
        reasons.push({
          code: 'plan_date_drift_minor',
          message: `Moving ${daysDiff} days from planned date.${phaseNote} minor shifts are usually fine.`,
          data: { 
            canonicalDate, 
            newDate: new_date, 
            daysDiff,
            planName: planName || 'training plan',
            planPhase,
            weekIntent
          }
        });
      }
    }

    // ===== B) INTENSITY SPACING =====
    // Science: High-intensity workouts require 48-72h recovery for optimal adaptation
    // (muscle glycogen resynthesis, protein synthesis, CNS recovery)
    // Consecutive days (<24h) = high injury risk, compromised quality
    // Within 48h = suboptimal but manageable for experienced athletes
    const targetDay = new_date;
    const prevDay = addDays(targetDay, -1);
    const nextDay = addDays(targetDay, 1);
    const prev2Day = addDays(targetDay, -2);
    const next2Day = addDays(targetDay, 2);

    if (intensity === 'hard') {
      // In recovery/taper weeks, be more lenient - skip warnings
      const isRecoveryOrTaper = isRecoveryWeek || isTaperWeek || weekIntent === 'recovery' || weekIntent === 'taper';
      
      // Check consecutive days (<24h) - science: too close, compromises recovery
      const prevWorkouts = contextByDate.get(prevDay) || [];
      const nextWorkouts = contextByDate.get(nextDay) || [];
      
      const prevHasHard = prevWorkouts.some((w: any) => classifyIntensity(w) === 'hard');
      const nextHasHard = nextWorkouts.some((w: any) => classifyIntensity(w) === 'hard');
      
      if (prevHasHard || nextHasHard) {
        // In recovery/taper, this is more acceptable
        if (!isRecoveryOrTaper) {
          if (severity === 'green') severity = 'yellow';
          const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : weekIntent === 'peak' ? " You're in peak week, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
          reasons.push({
            code: 'hard_consecutive',
            message: `Hard workouts back-to-back.${phaseNote} science says you need 48-72h between hard efforts.`,
            data: { 
              adjacentDay: prevHasHard ? prevDay : nextDay,
              planPhase,
              weekIntent,
              suggestion: 'Space them out by at least 2 days for proper recovery'
            }
          });
        }
      } else {
        // Check within 48h (2 days) - science: minimum recovery window, suboptimal
        if (!isRecoveryOrTaper) {
          const prev2Workouts = contextByDate.get(prev2Day) || [];
          const next2Workouts = contextByDate.get(next2Day) || [];
          const hasHardWithin2 = [...prev2Workouts, ...next2Workouts]
            .some((w: any) => classifyIntensity(w) === 'hard');
          
          if (hasHardWithin2) {
            if (severity === 'green') severity = 'yellow';
            const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : weekIntent === 'peak' ? " You're in peak week, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
            reasons.push({
              code: 'hard_within_2_days',
              message: `Hard workouts within 48h.${phaseNote} optimal recovery is 48-72h between hard efforts.`,
              data: { 
                nearbyHardDays: [prev2Day, next2Day].filter(d => {
                  const workouts = contextByDate.get(d) || [];
                  return workouts.some((w: any) => classifyIntensity(w) === 'hard');
                }),
                planPhase,
                weekIntent,
                suggestion: 'Aim for 2-3 days between hard workouts for best adaptation'
              }
            });
          }
        }
      }
    }

    // ===== C) LONG SESSION SPACING =====
    // Science: Long endurance sessions deplete glycogen, cause muscle damage
    // Need 24-48h for glycogen resynthesis and repair before next long session
    // Back-to-back long sessions = accumulated fatigue, compromised quality
    if (isLong) {
      const isRecoveryOrTaper = isRecoveryWeek || isTaperWeek || weekIntent === 'recovery' || weekIntent === 'taper';
      const prevWorkouts = contextByDate.get(prevDay) || [];
      const nextWorkouts = contextByDate.get(nextDay) || [];
      const sameDayWorkouts = contextByDate.get(targetDay) || [];
      
      const prevHasLong = prevWorkouts.some((w: any) => isLongSession(w));
      const nextHasLong = nextWorkouts.some((w: any) => isLongSession(w));
      
      if (prevHasLong || nextHasLong) {
        // In recovery/taper, long sessions are often reduced anyway
        if (!isRecoveryOrTaper) {
          if (severity === 'green') severity = 'yellow';
          const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
          reasons.push({
            code: 'long_adjacent',
            message: `Long sessions back-to-back.${phaseNote} glycogen needs 24-48h to resynthesize.`,
            data: { 
              adjacentDay: prevHasLong ? prevDay : nextDay,
              planPhase,
              weekIntent,
              suggestion: 'Space them out by at least 1 day for glycogen recovery'
            }
          });
        }
      }
      
      // Warn if long + strength same day (but less strict in recovery/taper)
      // Science: Concurrent training can cause interference effect
      // BUT: Upper body + long run = OK (different muscle groups, no interference)
      // Lower body + long run = interference (same muscle groups)
      const sameDayHasStrength = sameDayWorkouts.some((w: any) => w.type === 'strength');
      if (sameDayHasStrength && !isRecoveryOrTaper) {
        // Check what type of strength is on the same day
        const sameDayStrength = sameDayWorkouts.find((w: any) => w.type === 'strength');
        const sameDayStrengthFocus = sameDayStrength ? classifyStrengthFocus(sameDayStrength) : 'unknown';
        
        // Only warn if it's lower body or full body (interference with running)
        // Upper body + long run is fine (different muscle groups)
        if (sameDayStrengthFocus === 'lower' || sameDayStrengthFocus === 'full') {
          if (severity === 'green') severity = 'yellow';
          const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
          reasons.push({
            code: 'long_plus_lower_strength',
            message: `Long run + lower body strength same day.${phaseNote} this interferes with leg recovery.`,
            data: { 
              strengthFocus: sameDayStrengthFocus,
              planPhase,
              weekIntent,
              suggestion: 'Move lower body strength to another day (upper body + long run is fine)'
            }
          });
        }
        // If it's upper body, don't warn - it's fine
      }
    }

    // ===== D) STRENGTH SPACING =====
    // Science: Muscle protein synthesis (MPS) peaks 24-48h post-exercise
    // Lower body (large muscle groups): 48-72h optimal for MPS and recovery
    // Upper body (smaller groups): 24-48h usually sufficient
    // Full body: treat as lower body (48-72h)
    if (strengthFocus === 'lower' || strengthFocus === 'full') {
      const prevDayWorkouts = contextByDate.get(prevDay) || [];
      const prev2DayWorkouts = contextByDate.get(prev2Day) || [];
      const nextDayWorkouts = contextByDate.get(nextDay) || [];
      const next2DayWorkouts = contextByDate.get(next2Day) || [];
      
      const nearbyWorkouts = [...prevDayWorkouts, ...prev2DayWorkouts, ...nextDayWorkouts, ...next2DayWorkouts];
      const nearbyLower = nearbyWorkouts.some((w: any) => {
        const focus = classifyStrengthFocus(w);
        return focus === 'lower' || focus === 'full';
      });
      
      if (nearbyLower) {
        if (severity === 'green') severity = 'yellow';
        const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
        reasons.push({
          code: 'lower_strength_spacing',
          message: `Lower body lifts too close.${phaseNote} muscle protein synthesis needs 48-72h for legs.`,
          data: { 
            strengthFocus,
            planPhase,
            weekIntent,
            suggestion: 'Space them out by 2-3 days for optimal adaptation'
          }
        });
      }
    }
    
    // Upper body: smaller muscle groups, faster recovery (24-48h)
    if (strengthFocus === 'upper') {
      const prevDayWorkouts = contextByDate.get(prevDay) || [];
      const nextDayWorkouts = contextByDate.get(nextDay) || [];
      const nearbyUpper = [...prevDayWorkouts, ...nextDayWorkouts]
        .some((w: any) => classifyStrengthFocus(w) === 'upper');
      
      if (nearbyUpper) {
        if (severity === 'green') severity = 'yellow';
        reasons.push({
          code: 'upper_strength_consecutive',
          message: 'Upper body on consecutive days. Upper body recovers faster (24-48h), but back-to-back may be too much.',
          data: { 
            strengthFocus,
            suggestion: 'Space by at least 1 day'
          }
        });
      }
    }

    // ===== E) WORKLOAD CAPS =====
    // Science: Training stress accumulates; daily caps prevent overreaching
    // Based on duration × intensity² model (simplified TSS)
    // Normal: ~120 daily (allows 1 hard + 1 medium or 2 medium sessions)
    // Peak: ~140 daily (allows higher volume during peak training blocks)
    // These are guidelines - individual recovery varies
    // OURS — the daily caps (120, 140 in a peak week) and the warning lines (80, 100). No outside source: no app
    // publishes a daily workload ceiling, and these came in with the popup's own formula. Ledger row
    // "Reschedule popup caps"; Stage 5 sources them or strikes them (2026-09-15, §8.0 #29).
    const workloadCap = (weekIntent === 'peak' || planPhase?.toLowerCase().includes('peak')) ? 140 : 120;
    const workloadWarning = (weekIntent === 'peak' || planPhase?.toLowerCase().includes('peak')) ? 100 : 80;

    if (loadUnknown) {
      // The popup says so rather than inventing a number (§8.0 #29).
      reasons.push({ code: 'workload_unknown', message: 'Workload not worked out yet for this session.' });
    } else if (afterDaily > workloadCap) {
      if (severity === 'green') severity = 'yellow';
      const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : weekIntent === 'peak' ? " You're in peak week, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
      const capNote = (weekIntent === 'peak' || planPhase?.toLowerCase().includes('peak')) 
        ? ' peak weeks can handle more, but' 
        : '';
      reasons.push({
        code: 'workload_cap_exceeded',
        message: `Daily workload would be ${afterDaily}${capNote} that's really high.${phaseNote} this might be too much.`,
        data: { 
          workload: afterDaily, 
          cap: workloadCap,
          planPhase,
          weekIntent,
          suggestion: 'Split workouts or move one to a lighter day'
        }
      });
    } else if (afterDaily > workloadWarning) {
      if (severity === 'green') severity = 'yellow';
      const phaseNote = isRecoveryWeek ? " You're in a recovery week, so" : isTaperWeek ? " You're in taper, so" : weekIntent === 'peak' ? " You're in peak week, so" : planPhase ? ` You're in ${planPhase} phase, so` : '';
      reasons.push({
        code: 'workload_high',
        message: `Daily workload would be ${afterDaily}.${phaseNote} that's on the high side.`,
        data: { 
          workload: afterDaily, 
          threshold: workloadWarning,
          planPhase,
          weekIntent,
          suggestion: 'Make sure you recover well'
        }
      });
    }

    // Generate suggestions (find valid days in ±3 day window)
    // Context-aware: respect plan structure, avoid quality days for long runs, etc.
    const suggestionCandidates: Array<{ date: string; score: number }> = [];
    if (severity === 'red' || severity === 'yellow') {
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue; // Skip target day (already blocked)
        const candidateDate = addDays(new_date, i);
        
        // Skip if date is outside our context map
        if (!contextByDate.has(candidateDate)) continue;
        
        // Calculate candidate's day_number in plan (if applicable)
        let candidateDayNumber: number | null = null;
        if (trainingPlanId && startDateStr) {
          try {
            const startDate = new Date(startDateStr + 'T12:00:00');
            const targetDate = new Date(candidateDate + 'T12:00:00');
            const daysDiff = Math.round((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const dayInWeek = ((daysDiff % 7) + 7) % 7; // Handle negative modulo
            candidateDayNumber = dayInWeek + 1; // 1-7
          } catch (e) {
            // Ignore
          }
        }
        
        const candidateWorkload = calculateDayWorkload(candidateDate) + movedLoad;
        const candidateWorkouts = contextByDate.get(candidateDate) || [];
        const candidateHasHard = candidateWorkouts.some((w: any) => classifyIntensity(w) === 'hard');
        const candidateHasLong = candidateWorkouts.some((w: any) => isLongSession(w));
        const candidateHasStrength = candidateWorkouts.some((w: any) => w.type === 'strength');
        const candidateStrengthFocus = candidateHasStrength ? classifyStrengthFocus(candidateWorkouts.find((w: any) => w.type === 'strength')) : 'unknown';
        
        // Check if this candidate would be valid
        let isValidCandidate = true;
        let candidateScore = 0; // Lower is better
        
        // Check plan structure conflict (e.g., don't suggest quality day for long run)
        if (candidateDayNumber && planWeekStructure.has(candidateDayNumber)) {
          const typicalPurposes = planWeekStructure.get(candidateDayNumber)!;
          const conflictsWithStructure = typicalPurposes.some(purpose => {
            if (workoutPurpose === 'long_run' && purpose === 'quality_run') return true;
            if (workoutPurpose === 'quality_run' && purpose === 'long_run') return true;
            return false;
          });
          if (conflictsWithStructure) {
            isValidCandidate = false; // Don't suggest dates that conflict with plan structure
          }
        }
        
        // Hard workouts: can't be consecutive
        if (intensity === 'hard') {
          const prevDay = addDays(candidateDate, -1);
          const nextDay = addDays(candidateDate, 1);
          const prevWorkouts = contextByDate.get(prevDay) || [];
          const nextWorkouts = contextByDate.get(nextDay) || [];
          if (prevWorkouts.some((w: any) => classifyIntensity(w) === 'hard') ||
              nextWorkouts.some((w: any) => classifyIntensity(w) === 'hard')) {
            isValidCandidate = false;
          }
          if (candidateHasHard) {
            isValidCandidate = false; // Can't have two hard workouts same day
          }
        }
        
        // Long sessions: can't be adjacent
        if (isLong && candidateHasLong) {
          const prevDay = addDays(candidateDate, -1);
          const nextDay = addDays(candidateDate, 1);
          const prevWorkouts = contextByDate.get(prevDay) || [];
          const nextWorkouts = contextByDate.get(nextDay) || [];
          if (prevWorkouts.some((w: any) => isLongSession(w)) ||
              nextWorkouts.some((w: any) => isLongSession(w))) {
            isValidCandidate = false;
          }
        }
        
        // Lower body strength: can't be within 2 days
        if ((strengthFocus === 'lower' || strengthFocus === 'full') && candidateHasStrength) {
          const nearbyWorkouts = [
            ...(contextByDate.get(addDays(candidateDate, -1)) || []),
            ...(contextByDate.get(addDays(candidateDate, -2)) || []),
            ...(contextByDate.get(addDays(candidateDate, 1)) || []),
            ...(contextByDate.get(addDays(candidateDate, 2)) || []),
          ];
          const nearbyLower = nearbyWorkouts.some((w: any) => {
            const focus = classifyStrengthFocus(w);
            return focus === 'lower' || focus === 'full';
          });
          if (nearbyLower) {
            isValidCandidate = false;
          }
        }
        
        // Workload check
        // OURS — same two numbers as above; see the ledger row.
        if (candidateWorkload > 120) {
          isValidCandidate = false;
        } else if (candidateWorkload > 80) {
          candidateScore += 10; // Penalty for high workload
        }
        
        // Long + lower body strength same day: block (interference)
        // Long + upper body strength same day: OK (no interference)
        if (isLong && candidateHasStrength) {
          if (candidateStrengthFocus === 'lower' || candidateStrengthFocus === 'full') {
            isValidCandidate = false; // Block lower body + long run
          }
          // Upper body + long run is fine, no penalty
        }
        
        // Bonus: prefer dates that match plan structure
        if (candidateDayNumber && planWeekStructure.has(candidateDayNumber)) {
          const typicalPurposes = planWeekStructure.get(candidateDayNumber)!;
          if (typicalPurposes.includes(workoutPurpose)) {
            candidateScore -= 5; // Bonus for matching plan structure
          }
        }
        
        // Add to suggestions if valid, with score
        if (isValidCandidate) {
          suggestionCandidates.push({ date: candidateDate, score: candidateScore + candidateWorkload });
        }
      }
    }
    
    // Sort by score (lower is better) and limit to 3
    suggestionCandidates.sort((a, b) => a.score - b.score);
    const suggestions = suggestionCandidates.slice(0, 3).map(s => s.date);

    // Calculate days from canonical if plan workout
    let daysFromCanonical: number | undefined;
    if (canonicalDate) {
      const canonical = new Date(canonicalDate + 'T12:00:00');
      const newDate = new Date(new_date + 'T12:00:00');
      daysFromCanonical = Math.round((newDate.getTime() - canonical.getTime()) / (1000 * 60 * 60 * 24));
    }

    // ===== COACH BRAIN: Get ranked reschedule options =====
    let coachOptions: ValidationResult['coachOptions'] = undefined;
    
    try {
      // Build timeline (Current Week + Next Week)
      const timeline = await buildTimeline(
        supabase,
        user.id,
        oldDate, // Use original workout date to build timeline
        trainingPlanId
      );

      // Find the workout's position in timeline
      const dayIndex = findDayIndex(timeline, oldDate);
      
      if (dayIndex >= 0 && timeline[dayIndex]?.workout) {
        // Determine week type
        const weekType: 'recovery' | 'build' | 'taper' = 
          isRecoveryWeek ? 'recovery' :
          isTaperWeek ? 'taper' :
          'build';

        console.log('[validate-reschedule] Coach Brain context:', {
          isRecoveryWeek,
          isTaperWeek,
          weekIntent,
          weekType,
          planPhase
        });

        // Get the appropriate engine for this plan type
        const planType = config.approach || 'performance_build';
        const engine = getRescheduleEngine(planType);

        // Get ranked options
        const options = engine.getOptions({
          missedWorkout: workout,
          dayIndex,
          timeline,
          currentWeekType: weekType
        });
        
        console.log('[validate-reschedule] Coach Brain generated', options.length, 'options');

        // Convert to response format
        coachOptions = options.map(opt => ({
          rank: opt.rank,
          label: opt.label,
          action: opt.action,
          targetDateOffset: opt.targetDateOffset,
          riskLevel: opt.riskLevel,
          tags: opt.tags,
          analysis: opt.analysis
        }));
      }
    } catch (coachError: any) {
      console.error('[validate-reschedule] Coach Brain error:', coachError);
      // Non-fatal - continue without coach options
    }

    const result: ValidationResult = {
      severity,
      reasons,
      before: {
        dailyWorkload: loadUnknown ? null : beforeDaily,
        weekWorkload: loadUnknown ? null : beforeWeekly
      },
      after: {
        dailyWorkload: loadUnknown ? null : afterDaily,
        weekWorkload: loadUnknown ? null : afterWeekly
      },
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      planContext: trainingPlanId ? {
        isPlanWorkout: true,
        planName: planName || undefined,
        canonicalDate: canonicalDate || undefined,
        daysFromCanonical,
        planPhase: planPhase || undefined,
        weekIntent: weekIntent || undefined,
        isRecoveryWeek,
        isTaperWeek
      } : {
        isPlanWorkout: false
      },
      coachOptions
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[validate-reschedule] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
