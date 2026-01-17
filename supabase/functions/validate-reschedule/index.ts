/**
 * EDGE FUNCTION: validate-reschedule
 * 
 * SMART SERVER: Validates workout rescheduling with minimal v1 rules
 * 
 * Input: { workout_id, new_date }
 * Output: { severity, reasons, before, after, suggestions }
 * 
 * Architecture: Smart Server, Dumb Client
 * - All validation logic happens server-side
 * - Client just calls and displays results
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intensity classification
type IntensityBucket = 'hard' | 'medium' | 'easy';
type StrengthFocus = 'lower' | 'upper' | 'full' | 'unknown';

interface ValidationReason {
  code: string;
  message: string;
  data?: any;
}

interface ValidationResult {
  severity: 'green' | 'yellow' | 'red';
  reasons: ValidationReason[];
  before: {
    dailyWorkload: number;
    weekWorkload: number;
  };
  after: {
    dailyWorkload: number;
    weekWorkload: number;
  };
  suggestions?: string[]; // ISO date strings (general suggestions based on workload/intensity)
  planContext?: {
    isPlanWorkout: boolean;
    planName?: string;
    canonicalDate?: string;
    daysFromCanonical?: number;
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
  if (desc.includes('long') || name.includes('long')) {
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

// Simple workload estimation (reuse existing logic if available)
function estimateWorkload(workout: any): number {
  // For planned workouts, use duration × intensity² × 100
  const type = String(workout.type || '').toLowerCase();
  const duration = workout.total_duration_seconds || workout.duration || 0;
  const durationHours = duration / 3600;
  
  if (durationHours <= 0) return 0;
  
  // Get intensity factor
  const intensity = classifyIntensity(workout);
  const intensityFactor = intensity === 'hard' ? 1.0 : intensity === 'medium' ? 0.75 : 0.65;
  
  // Special handling for strength (volume-based, but simplified for validation)
  if (type === 'strength') {
    const exercises = Array.isArray(workout.strength_exercises) ? workout.strength_exercises : [];
    if (exercises.length > 0) {
      // Rough estimate: 50-100 for typical strength session
      return intensity === 'hard' ? 80 : 50;
    }
    return 0;
  }
  
  // Mobility/pilates_yoga: low workload
  if (type === 'mobility' || type === 'pilates_yoga') {
    return Math.round(durationHours * 0.75 * 0.75 * 100);
  }
  
  // Cardio: duration × intensity² × 100
  return Math.round(durationHours * Math.pow(intensityFactor, 2) * 100);
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
    
    if (trainingPlanId && weekNumber && dayNumber) {
      // Fetch plan to get start date
      const { data: plan } = await supabase
        .from('training_plans')
        .select('id, name, config')
        .eq('id', trainingPlanId)
        .eq('user_id', user.id)
        .single();
      
      if (plan) {
        planName = plan.name;
        const config = plan.config || {};
        const startDateStr = config.user_selected_start_date || config.start_date;
        
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
    const workoutWorkload = estimateWorkload(workout);

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

    // Calculate workloads
    const calculateDayWorkload = (date: string): number => {
      const workouts = contextByDate.get(date) || [];
      return workouts.reduce((sum, w) => sum + estimateWorkload(w), 0);
    };

    const calculateWeekWorkload = (centerDate: string): number => {
      let sum = 0;
      for (let i = -3; i <= 3; i++) {
        sum += calculateDayWorkload(addDays(centerDate, i));
      }
      return sum;
    };

    const beforeDaily = calculateDayWorkload(oldDate);
    const beforeWeekly = calculateWeekWorkload(oldDate);
    const afterDaily = calculateDayWorkload(new_date) + workoutWorkload;
    const afterWeekly = calculateWeekWorkload(new_date) + workoutWorkload;

    const reasons: ValidationReason[] = [];
    let severity: 'green' | 'yellow' | 'red' = 'green';
    
    // ===== PLAN CONTEXT: Warn if moving plan workout far from canonical date =====
    if (canonicalDate && canonicalDate !== new_date) {
      const canonical = new Date(canonicalDate + 'T12:00:00');
      const newDate = new Date(new_date + 'T12:00:00');
      const daysDiff = Math.abs(Math.round((newDate.getTime() - canonical.getTime()) / (1000 * 60 * 60 * 24)));
      
      if (daysDiff > 7) {
        if (severity === 'green') severity = 'yellow';
        reasons.push({
          code: 'plan_date_drift',
          message: `Moving ${daysDiff} days from planned date (${canonicalDate}). This may affect plan progression.`,
          data: { 
            canonicalDate, 
            newDate: new_date, 
            daysDiff,
            planName: planName || 'training plan'
          }
        });
      } else if (daysDiff > 2) {
        if (severity === 'green') severity = 'yellow';
        reasons.push({
          code: 'plan_date_drift_minor',
          message: `Moving ${daysDiff} days from planned date`,
          data: { 
            canonicalDate, 
            newDate: new_date, 
            daysDiff,
            planName: planName || 'training plan'
          }
        });
      }
    }

    // ===== B) INTENSITY SPACING =====
    const targetDay = new_date;
    const prevDay = addDays(targetDay, -1);
    const nextDay = addDays(targetDay, 1);
    const prev2Day = addDays(targetDay, -2);
    const next2Day = addDays(targetDay, 2);

    if (intensity === 'hard') {
      // Check consecutive days
      const prevWorkouts = contextByDate.get(prevDay) || [];
      const nextWorkouts = contextByDate.get(nextDay) || [];
      
      const prevHasHard = prevWorkouts.some((w: any) => classifyIntensity(w) === 'hard');
      const nextHasHard = nextWorkouts.some((w: any) => classifyIntensity(w) === 'hard');
      
      if (prevHasHard || nextHasHard) {
        severity = 'red';
        reasons.push({
          code: 'hard_consecutive',
          message: 'Hard workouts cannot be on consecutive days',
          data: { adjacentDay: prevHasHard ? prevDay : nextDay }
        });
      } else {
        // Check within 2 days (warn)
        const prev2Workouts = contextByDate.get(prev2Day) || [];
        const next2Workouts = contextByDate.get(next2Day) || [];
        const hasHardWithin2 = [...prev2Workouts, ...next2Workouts]
          .some((w: any) => classifyIntensity(w) === 'hard');
        
        if (hasHardWithin2) {
          if (severity === 'green') severity = 'yellow';
          reasons.push({
            code: 'hard_within_2_days',
            message: 'Hard workouts should have at least 2 days between them',
            data: { nearbyHardDays: [prev2Day, next2Day].filter(d => {
              const workouts = contextByDate.get(d) || [];
              return workouts.some((w: any) => classifyIntensity(w) === 'hard');
            })}
          });
        }
      }
    }

    // ===== C) LONG SESSION SPACING =====
    if (isLong) {
      const prevWorkouts = contextByDate.get(prevDay) || [];
      const nextWorkouts = contextByDate.get(nextDay) || [];
      const sameDayWorkouts = contextByDate.get(targetDay) || [];
      
      const prevHasLong = prevWorkouts.some((w: any) => isLongSession(w));
      const nextHasLong = nextWorkouts.some((w: any) => isLongSession(w));
      
      if (prevHasLong || nextHasLong) {
        severity = 'red';
        reasons.push({
          code: 'long_adjacent',
          message: 'Long sessions should have at least 1 day between them',
          data: { adjacentDay: prevHasLong ? prevDay : nextDay }
        });
      }
      
      // Warn if long + strength same day
      const sameDayHasStrength = sameDayWorkouts.some((w: any) => w.type === 'strength');
      if (sameDayHasStrength) {
        if (severity === 'green') severity = 'yellow';
        reasons.push({
          code: 'long_plus_strength',
          message: 'Long session and strength on the same day may be too much',
          data: { strengthFocus: strengthFocus }
        });
      }
    }

    // ===== D) STRENGTH SPACING =====
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
        severity = 'red';
        reasons.push({
          code: 'lower_strength_spacing',
          message: 'Lower body strength needs at least 2 days between sessions',
          data: { strengthFocus }
        });
      }
    }
    
    if (strengthFocus === 'upper') {
      const prevDayWorkouts = contextByDate.get(prevDay) || [];
      const nextDayWorkouts = contextByDate.get(nextDay) || [];
      const nearbyUpper = [...prevDayWorkouts, ...nextDayWorkouts]
        .some((w: any) => classifyStrengthFocus(w) === 'upper');
      
      if (nearbyUpper) {
        if (severity === 'green') severity = 'yellow';
        reasons.push({
          code: 'upper_strength_consecutive',
          message: 'Upper body strength on consecutive days may be too much',
          data: { strengthFocus }
        });
      }
    }

    // ===== E) WORKLOAD CAPS =====
    if (afterDaily > 120) {
      severity = 'red';
      reasons.push({
        code: 'workload_cap_exceeded',
        message: `Daily workload would exceed 120 (${afterDaily})`,
        data: { workload: afterDaily, cap: 120 }
      });
    } else if (afterDaily > 80) {
      if (severity === 'green') severity = 'yellow';
      reasons.push({
        code: 'workload_high',
        message: `Daily workload would be high (${afterDaily})`,
        data: { workload: afterDaily, threshold: 80 }
      });
    }

    // Generate suggestions (find valid days in ±3 day window)
    const suggestions: string[] = [];
    if (severity === 'red' || severity === 'yellow') {
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue; // Skip target day (already blocked)
        const candidateDate = addDays(new_date, i);
        
        // Skip if date is outside our context map
        if (!contextByDate.has(candidateDate)) continue;
        
        const candidateWorkload = calculateDayWorkload(candidateDate) + workoutWorkload;
        const candidateWorkouts = contextByDate.get(candidateDate) || [];
        const candidateHasHard = candidateWorkouts.some((w: any) => classifyIntensity(w) === 'hard');
        const candidateHasLong = candidateWorkouts.some((w: any) => isLongSession(w));
        const candidateHasStrength = candidateWorkouts.some((w: any) => w.type === 'strength');
        
        // Check if this candidate would be valid
        let isValidCandidate = true;
        let candidateScore = 0; // Lower is better
        
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
        if (candidateWorkload > 120) {
          isValidCandidate = false;
        } else if (candidateWorkload > 80) {
          candidateScore += 10; // Penalty for high workload
        }
        
        // Long + strength same day: penalty but not block
        if (isLong && candidateHasStrength) {
          candidateScore += 5; // Penalty
        }
        
        // Add to suggestions if valid, sorted by score
        if (isValidCandidate) {
          suggestions.push(candidateDate);
        }
      }
      
      // Sort by workload (lower is better) and limit to 3
      suggestions.sort((a, b) => {
        const aWorkload = calculateDayWorkload(a) + workoutWorkload;
        const bWorkload = calculateDayWorkload(b) + workoutWorkload;
        return aWorkload - bWorkload;
      });
      suggestions.splice(3);
    }

    // Calculate days from canonical if plan workout
    let daysFromCanonical: number | undefined;
    if (canonicalDate) {
      const canonical = new Date(canonicalDate + 'T12:00:00');
      const newDate = new Date(new_date + 'T12:00:00');
      daysFromCanonical = Math.round((newDate.getTime() - canonical.getTime()) / (1000 * 60 * 60 * 24));
    }

    const result: ValidationResult = {
      severity,
      reasons,
      before: {
        dailyWorkload: beforeDaily,
        weekWorkload: beforeWeekly
      },
      after: {
        dailyWorkload: afterDaily,
        weekWorkload: afterWeekly
      },
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      planContext: trainingPlanId ? {
        isPlanWorkout: true,
        planName: planName || undefined,
        canonicalDate: canonicalDate || undefined,
        daysFromCanonical
      } : {
        isPlanWorkout: false
      }
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
