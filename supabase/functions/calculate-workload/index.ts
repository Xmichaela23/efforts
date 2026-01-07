/**
 * EDGE FUNCTION: calculate-workload
 * 
 * SMART SERVER: Calculates workload scores for individual workouts server-side
 * 
 * Formulas:
 * - Strength: workload = volume_factor × intensity² × 100 (volume-based, uses RIR)
 * - Other: workload = duration (hours) × intensity² × 100 (duration-based)
 * 
 * Input: { workout_id, workout_data? }
 *   - workout_id: Required
 *   - workout_data: Optional - if not provided, fetches from database (smart server)
 * 
 * Output: { workload_planned, workload_actual, intensity_factor }
 * 
 * Architecture: Smart Server, Dumb Client
 * - All calculations happen server-side
 * - Client only passes workout_id (or workout_data for efficiency)
 * - Server fetches data if needed and does all math
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Intensity factors for workload calculation
const INTENSITY_FACTORS = {
  run: {
    easypace: 0.65,
    warmup_run_easy: 0.65,
    cooldown_easy: 0.65,
    longrun_easypace: 0.70,
    '5kpace_plus1:00': 0.85,
    '5kpace_plus0:50': 0.87,
    '5kpace_plus0:45': 0.88,
    '5kpace_plus0:35': 0.90,
    '5kpace': 0.95,
    '10kpace': 0.90,
    marathon_pace: 0.82,
    speed: 1.10,
    strides: 1.05,
    interval: 0.95,
    tempo: 0.88,
    cruise: 0.88
  },
  bike: {
    Z1: 0.55,
    recovery: 0.55,
    Z2: 0.70,
    endurance: 0.70,
    warmup_bike: 0.60,
    cooldown_bike: 0.60,
    tempo: 0.80,
    ss: 0.90,
    thr: 1.00,
    vo2: 1.15,
    anaerobic: 1.20,
    neuro: 1.10
  },
  swim: {
    warmup: 0.60,
    cooldown: 0.60,
    drill: 0.50,
    easy: 0.65,
    aerobic: 0.75,
    pull: 0.70,
    kick: 0.75,
    threshold: 0.95,
    interval: 1.00
  },
  strength: {
    '@pct60': 0.70,
    '@pct65': 0.75,
    '@pct70': 0.80,
    '@pct75': 0.85,
    '@pct80': 0.90,
    '@pct85': 0.95,
    '@pct90': 1.00,
    main_: 0.85,
    acc_: 0.70,
    core_: 0.60,
    bodyweight: 0.65
  }
}

interface WorkoutData {
  type: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
  duration: number; // minutes (elapsed time)
  moving_time?: number; // minutes (moving time - prefer for run/bike/swim)
  steps_preset?: string[];
  strength_exercises?: Array<{
    name: string;
    sets: number;
    reps?: number | string;
    duration_seconds?: number; // For duration-based exercises like planks, holds, carries
    weight?: string;
  }>;
  mobility_exercises?: Array<{
    name: string;
    completed: boolean;
  }>;
  // Performance data for intensity inference
  avg_pace?: number; // seconds per km or seconds per mile
  avg_power?: number; // watts (cycling)
  avg_heart_rate?: number; // bpm
  functional_threshold_power?: number; // watts (for cycling intensity zones)
  threshold_heart_rate?: number; // bpm (for HR zones)
  max_heart_rate?: number; // bpm (for TRIMP calculation)
  resting_heart_rate?: number; // bpm (for TRIMP calculation)
  workout_metadata?: any; // Unified metadata: { session_rpe?, notes?, readiness? }
}

/**
 * Calculate TRIMP (Training Impulse) workload for cardio workouts
 * 
 * Uses Banister's TRIMP formula:
 * TRIMP = Duration (min) × ΔHR ratio × weighting factor
 * 
 * Where:
 * - ΔHR ratio = (avg_HR - resting_HR) / (max_HR - resting_HR)
 * - Weighting factor = 0.64 × e^(1.92 × ΔHR_ratio) for exponential stress curve
 * 
 * Scaled to match existing workload scale (~100 for 1 hour at threshold)
 */
function calculateTRIMPWorkload(workout: WorkoutData): number | null {
  const avgHR = workout.avg_heart_rate;
  const maxHR = workout.max_heart_rate;
  const restingHR = workout.resting_heart_rate || 60; // Default resting HR if not set
  
  // Need HR data and max HR for TRIMP
  if (!avgHR || !maxHR || avgHR <= 0 || maxHR <= 0) {
    return null; // Can't calculate TRIMP
  }
  
  // Ensure avg HR is within valid range
  if (avgHR < restingHR || avgHR > maxHR) {
    // HR data seems invalid, fall back to traditional calculation
    return null;
  }
  
  // Get effective duration (prefer moving_time)
  let durationMinutes = workout.duration;
  if ((workout.type === 'run' || workout.type === 'ride' || workout.type === 'bike' || workout.type === 'swim') 
      && workout.moving_time && workout.moving_time > 0) {
    durationMinutes = workout.moving_time;
  }
  
  if (!durationMinutes || durationMinutes <= 0) {
    return null;
  }
  
  // Calculate ΔHR ratio (0-1 scale, how close to max HR reserve)
  const hrReserve = maxHR - restingHR;
  const deltaHR = avgHR - restingHR;
  const hrRatio = deltaHR / hrReserve;
  
  // Banister's exponential weighting factor
  // This weights higher HR efforts exponentially more
  const weightingFactor = 0.64 * Math.exp(1.92 * hrRatio);
  
  // Raw TRIMP
  const rawTRIMP = durationMinutes * hrRatio * weightingFactor;
  
  // Scale to match existing workload scale
  // 1 hour at threshold (~88% max HR, hrRatio ~0.85) should ≈ 100
  // At hrRatio=0.85: weightingFactor = 0.64 × e^(1.92×0.85) = 0.64 × 5.11 = 3.27
  // Raw TRIMP = 60 × 0.85 × 3.27 = 167
  // Scale factor = 100 / 167 ≈ 0.6
  const scaleFactor = 0.6;
  const scaledWorkload = Math.round(rawTRIMP * scaleFactor);
  
  console.log(`[TRIMP] avgHR=${avgHR}, maxHR=${maxHR}, restHR=${restingHR}, duration=${durationMinutes}min`);
  console.log(`[TRIMP] hrRatio=${hrRatio.toFixed(3)}, weight=${weightingFactor.toFixed(2)}, raw=${rawTRIMP.toFixed(1)}, scaled=${scaledWorkload}`);
  
  return scaledWorkload;
}

/**
 * Calculate workload score for a workout
 * 
 * For strength workouts: workload = volume_factor × intensity² × 100
 *   - Volume factor based on total volume (weight × reps × sets)
 *   - Intensity from Session RPE (primary) or RIR (secondary) and exercise characteristics
 *   - Duration is NOT used (it's just logging time, not workout time)
 * 
 * For cardio (run/bike/swim) with HR data: TRIMP (Training Impulse)
 *   - Uses actual physiological stress, not just external load
 *   - Captures fatigue, heat, illness, altitude effects
 *   - Requires avg_heart_rate and max_heart_rate
 * 
 * For cardio without HR: workload = duration (hours) × intensity² × 100
 */
function calculateWorkload(workout: WorkoutData, sessionRPE?: number): number {
  // Strength workouts use volume-based calculation, not duration
  if (workout.type === 'strength' && workout.strength_exercises && workout.strength_exercises.length > 0) {
    return calculateStrengthWorkload(workout.strength_exercises, sessionRPE);
  }
  
  // Pilates/Yoga workouts use duration × RPE × modality_factor
  if (workout.type === 'pilates_yoga') {
    return calculatePilatesYogaWorkload(workout, sessionRPE);
  }
  
  // CARDIO WORKOUTS: Try TRIMP first (HR-based, most accurate)
  const isCardio = workout.type === 'run' || workout.type === 'ride' || workout.type === 'bike' || workout.type === 'swim';
  if (isCardio && workout.avg_heart_rate && workout.max_heart_rate) {
    const trimpWorkload = calculateTRIMPWorkload(workout);
    if (trimpWorkload !== null && trimpWorkload > 0) {
      console.log(`[Workload] Using TRIMP for ${workout.type}: ${trimpWorkload}`);
      return trimpWorkload;
    }
  }
  
  // FALLBACK: Duration-based calculation for cardio without HR
  // Prefer moving_time over duration for accurate workload (excludes stops)
  let effectiveDuration = workout.duration;
  if (isCardio && workout.moving_time && workout.moving_time > 0) {
    effectiveDuration = workout.moving_time;
  }
  
  if (!effectiveDuration) return 0;
  
  const durationHours = effectiveDuration / 60;
  const intensity = getSessionIntensity(workout, sessionRPE);
  
  console.log(`[Workload] Using duration-based for ${workout.type}: ${durationHours.toFixed(2)}h × ${intensity.toFixed(2)}² × 100`);
  return Math.round(durationHours * Math.pow(intensity, 2) * 100);
}

/**
 * Calculate workload for strength workouts based on volume and intensity
 * Formula: workload = volume_factor × intensity² × 100
 * 
 * Volume factor = total_volume / 10000 (normalized to reasonable scale)
 * Intensity from Session RPE (primary) or RIR (secondary) and exercise characteristics
 */
function calculateStrengthWorkload(exercises: any[], sessionRPE?: number): number {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return 0;
  }
  
  let totalVolume = 0; // Total weight × reps across all exercises
  let totalSets = 0;
  let totalRIR = 0;
  let rirCount = 0;
  
  exercises.forEach(ex => {
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      ex.sets.forEach((set: any) => {
        // Only count completed sets
        if (set.completed !== false) {
          const weight = Number(set.weight) || 0;
          const reps = Number(set.reps) || 0;
          totalVolume += weight * reps;
          totalSets += 1;
          
          // Collect RIR data
          if (typeof set.rir === 'number' && set.rir >= 0) {
            totalRIR += set.rir;
            rirCount += 1;
          }
        }
      });
    }
  });
  
  // Calculate intensity from Session RPE (primary) or RIR (secondary) and exercise characteristics
  const intensity = getStrengthIntensity(exercises, sessionRPE);
  
  // Volume factor: normalize total volume to a reasonable scale
  // 10,000 lbs = factor of 1.0, scales linearly
  // This means a 6,900 lb workout = 0.69 factor
  const volumeFactor = totalVolume / 10000;
  
  // Minimum volume factor to avoid zero workload for very light sessions
  const effectiveVolumeFactor = Math.max(volumeFactor, 0.1);
  
  // Calculate workload: volume_factor × intensity² × 100
  const workload = Math.round(effectiveVolumeFactor * Math.pow(intensity, 2) * 100);
  
  return workload;
}

/**
 * Get average intensity for a workout session
 * 
 * For Strength:
 *   Priority: Session RPE > RIR > Weight/Reps estimation
 * 
 * For Runs/Rides/Swims:
 *   Priority: steps_preset tokens > Performance inference (pace/power/HR) > Default
 *   NOTE: RPE is NOT used for runs/rides/swims (only strength)
 */
function getSessionIntensity(workout: WorkoutData, sessionRPE?: number): number {
  // Strength workouts use specialized calculation (with RPE)
  if (workout.type === 'strength' && workout.strength_exercises) {
    return getStrengthIntensity(workout.strength_exercises, sessionRPE);
  }
  
  // Pilates/Yoga workouts use RPE-based calculation
  if (workout.type === 'pilates_yoga') {
    return getPilatesYogaIntensity(workout, sessionRPE);
  }
  
  // Mobility workouts use completion-based calculation
  if (workout.type === 'mobility' && workout.mobility_exercises) {
    return getMobilityIntensity(workout.mobility_exercises);
  }
  
  // PRIORITY 1: Use steps_preset tokens (structured workouts)
  if (workout.steps_preset && workout.steps_preset.length > 0) {
    return getStepsIntensity(workout.steps_preset, workout.type);
  }
  
  // PRIORITY 2: Infer intensity from performance data (freeform workouts)
  // This is the primary method for runs/rides/swims without steps_preset
  if (workout.type === 'run' || workout.type === 'ride' || workout.type === 'bike' || workout.type === 'swim') {
    const inferredIntensity = inferIntensityFromPerformance(workout);
    if (inferredIntensity > 0) {
      return inferredIntensity;
    }
  }
  
  // PRIORITY 3: Default intensity by type (fallback)
  return getDefaultIntensityForType(workout.type);
}

/**
 * Infer intensity from actual performance metrics (for freeform workouts)
 * Used when no steps_preset is available
 * 
 * Priority for running:
 *   1. HR-based intensity (actual HR / threshold HR) - most accurate, personalized
 *   2. Pace-based fallback (heuristic, not personalized)
 * 
 * Priority for cycling:
 *   1. Power-based (avg power / FTP) - most accurate
 *   2. HR-based (actual HR / threshold HR)
 *   3. Default fallback
 */
function inferIntensityFromPerformance(workout: WorkoutData): number {
  // =========================================================================
  // RUNNING: Prefer HR-based intensity (personalized)
  // =========================================================================
  if (workout.type === 'run') {
    // Priority 1: HR-based intensity (if threshold HR available)
    if (workout.avg_heart_rate && workout.threshold_heart_rate) {
      const thr = workout.threshold_heart_rate;
      const hrPercent = workout.avg_heart_rate / thr;
      
      // Map HR zones to intensity factor
      // Threshold HR = intensity 1.0
      if (hrPercent >= 1.05) return 1.10;      // Above threshold (race/VO2 efforts)
      if (hrPercent >= 0.95) return 1.00;      // Threshold zone (95-105% THR)
      if (hrPercent >= 0.88) return 0.88;      // Tempo zone (88-95% THR)
      if (hrPercent >= 0.80) return 0.80;      // Marathon/moderate (80-88% THR)
      if (hrPercent >= 0.70) return 0.70;      // Easy zone (70-80% THR)
      return 0.60;                              // Recovery (<70% THR)
    }
    
    // Priority 1.5: Estimate intensity from max HR (if threshold not available)
    // Assumes threshold HR is ~88% of max HR
    if (workout.avg_heart_rate && workout.max_heart_rate && workout.max_heart_rate > 0) {
      const estimatedThr = workout.max_heart_rate * 0.88;
      const hrPercent = workout.avg_heart_rate / estimatedThr;
      
      console.log(`[Intensity] Run: using max HR fallback - avg ${workout.avg_heart_rate}, max ${workout.max_heart_rate}, est THR ${estimatedThr.toFixed(0)}, %THR ${(hrPercent * 100).toFixed(0)}%`);
      
      if (hrPercent >= 1.05) return 1.10;
      if (hrPercent >= 0.95) return 1.00;
      if (hrPercent >= 0.88) return 0.88;
      if (hrPercent >= 0.80) return 0.80;
      if (hrPercent >= 0.70) return 0.70;
      return 0.60;
    }
    
    // Priority 2: Pace-based fallback (less accurate, not personalized)
    if (workout.avg_pace) {
      let paceMinPerKm: number;
      
      // Handle different pace formats
      if (workout.avg_pace > 100) {
        // Likely seconds per km (e.g., 300 seconds = 5:00/km)
        paceMinPerKm = workout.avg_pace / 60;
      } else if (workout.avg_pace < 20) {
        // Likely minutes per km (e.g., 5.0 = 5:00/km)
        paceMinPerKm = workout.avg_pace;
      } else {
        // Unclear format, use as-is
        paceMinPerKm = workout.avg_pace;
      }
      
      // Heuristic intensity mapping (relative to typical paces)
      // These are population averages, not personalized
      if (paceMinPerKm < 4.0) return 1.00;      // Very fast (sub-4:00/km) - sprint/interval
      if (paceMinPerKm < 4.5) return 0.95;     // Fast (4:00-4:30/km) - 5K pace
      if (paceMinPerKm < 5.0) return 0.90;     // Moderate-fast (4:30-5:00/km) - 10K pace
      if (paceMinPerKm < 5.5) return 0.85;     // Moderate (5:00-5:30/km) - tempo
      if (paceMinPerKm < 6.0) return 0.80;     // Moderate-easy (5:30-6:00/km) - marathon pace
      if (paceMinPerKm < 6.5) return 0.75;     // Easy (6:00-6:30/km) - easy pace
      if (paceMinPerKm < 7.0) return 0.70;     // Very easy (6:30-7:00/km) - recovery
      return 0.65;                              // Recovery pace (>7:00/km)
    }
    
    return 0; // No inference possible for run
  }
  
  // Cycling: Infer from power (if FTP available) or heart rate
  if ((workout.type === 'ride' || workout.type === 'bike') && workout.avg_power && workout.functional_threshold_power) {
    const ftp = workout.functional_threshold_power;
    const intensityFactor = workout.avg_power / ftp;
    
    // Map power zones to intensity
    if (intensityFactor >= 1.05) return 1.15;      // VO2+ (>105% FTP)
    if (intensityFactor >= 0.95) return 1.00;      // Threshold (95-105% FTP)
    if (intensityFactor >= 0.85) return 0.90;      // Tempo (85-95% FTP)
    if (intensityFactor >= 0.75) return 0.80;      // Sweet Spot (75-85% FTP)
    if (intensityFactor >= 0.60) return 0.70;      // Z2 (60-75% FTP)
    if (intensityFactor >= 0.55) return 0.65;      // Z1 (55-60% FTP)
    return 0.55;                                   // Recovery (<55% FTP)
  }
  
  // Cycling: Infer from heart rate zones (if power unavailable)
  if ((workout.type === 'ride' || workout.type === 'bike') && workout.avg_heart_rate && workout.threshold_heart_rate) {
    const thr = workout.threshold_heart_rate;
    const hrPercent = workout.avg_heart_rate / thr;
    
    if (hrPercent >= 0.95) return 1.00;      // Z5 (>95% THR)
    if (hrPercent >= 0.90) return 0.90;      // Z4 (90-95% THR)
    if (hrPercent >= 0.85) return 0.80;      // Z3 (85-90% THR)
    if (hrPercent >= 0.75) return 0.70;      // Z2 (75-85% THR)
    return 0.60;                              // Z1 (<75% THR)
  }
  
  // Cycling: Fallback to max HR estimation (if no threshold HR)
  if ((workout.type === 'ride' || workout.type === 'bike') && workout.avg_heart_rate && workout.max_heart_rate && workout.max_heart_rate > 0) {
    const estimatedThr = workout.max_heart_rate * 0.90; // Cycling threshold ~90% of max
    const hrPercent = workout.avg_heart_rate / estimatedThr;
    
    console.log(`[Intensity] Ride: using max HR fallback - avg ${workout.avg_heart_rate}, max ${workout.max_heart_rate}, est THR ${estimatedThr.toFixed(0)}, %THR ${(hrPercent * 100).toFixed(0)}%`);
    
    if (hrPercent >= 0.95) return 1.00;
    if (hrPercent >= 0.90) return 0.90;
    if (hrPercent >= 0.85) return 0.80;
    if (hrPercent >= 0.75) return 0.70;
    return 0.60;
  }
  
  // Swimming: Infer from pace (similar to running)
  if (workout.type === 'swim' && workout.avg_pace) {
    // Swimming pace is typically slower, adjust thresholds
    const paceMinPer100m = workout.avg_pace / 60; // Assuming pace is per 100m
    
    if (paceMinPer100m < 1.5) return 1.00;   // Very fast
    if (paceMinPer100m < 2.0) return 0.95;   // Fast
    if (paceMinPer100m < 2.5) return 0.85;   // Moderate-fast
    if (paceMinPer100m < 3.0) return 0.75;   // Moderate
    return 0.65;                              // Easy
  }
  
  return 0; // No inference possible
}

/**
 * Get default intensity by workout type (fallback)
 */
function getDefaultIntensityForType(type: string): number {
  const defaults: { [key: string]: number } = {
    'run': 0.75,
    'ride': 0.70,
    'bike': 0.70,
    'swim': 0.75,
    'strength': 0.75,
    'mobility': 0.60,
    'pilates_yoga': 0.75,
    'walk': 0.40
  };
  
  return defaults[type] || 0.75;
}

/**
 * Get intensity from token steps
 */
function getStepsIntensity(steps: string[], type: string): number {
  const factors = INTENSITY_FACTORS[type as keyof typeof INTENSITY_FACTORS];
  if (!factors) return 0.75;
  
  const intensities: number[] = [];
  
  steps.forEach(token => {
    for (const [key, value] of Object.entries(factors)) {
      if (token.toLowerCase().includes(key.toLowerCase())) {
        intensities.push(value);
        break;
      }
    }
  });
  
  // Use max intensity - hard work dominates
  return intensities.length > 0 ? Math.max(...intensities) : 0.75;
}

/**
 * Get intensity for strength session based on RIR, Session RPE, and exercise characteristics
 * Handles both flat structure ({name, sets, reps, weight}) and nested structure ({name, sets: [{reps, weight, rir}]})
 * 
 * Priority:
 * 1. Session RPE (if available) - overall workout perception
 * 2. Average RIR across all sets - per-set effort
 * 3. Weight/reps estimation (fallback)
 * 
 * RIR (Reps in Reserve) mapping to intensity:
 * - RIR 0-1: Very high intensity (0.95-1.00)
 * - RIR 2: High intensity (0.90)
 * - RIR 3: Moderate-high intensity (0.85)
 * - RIR 4-5: Moderate intensity (0.75-0.80)
 * - RIR 6+: Low intensity (0.65-0.70)
 * 
 * Session RPE (Rate of Perceived Exertion) mapping to intensity:
 * - RPE 9-10: Very high intensity (0.95-1.00)
 * - RPE 7-8: High intensity (0.85-0.90)
 * - RPE 5-6: Moderate intensity (0.75-0.80)
 * - RPE 3-4: Low-moderate intensity (0.65-0.70)
 * - RPE 1-2: Low intensity (0.55-0.60)
 */
function getStrengthIntensity(exercises: any[], sessionRPE?: number): number {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    // If no exercises but we have session RPE, use that
    if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
      return mapRPEToIntensity(sessionRPE);
    }
    return 0.75; // Default intensity if no exercises and no RPE
  }
  
  // PRIORITY 1: Use Session RPE if available (overall workout perception)
  if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
    const rpeIntensity = mapRPEToIntensity(sessionRPE);
    // RPE is primary, but we can adjust slightly based on exercise data
    // For now, use RPE directly as it's the user's overall perception
    return rpeIntensity;
  }
  
  // PRIORITY 2: Calculate from RIR and exercise characteristics
  const intensities = exercises.map(ex => {
    let base = 0.75;
    
    // Check if this is the nested structure (has sets array)
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      // Nested structure: { name, sets: [{reps, weight, rir, ...}] }
      const completedSets = ex.sets.filter((s: any) => s.completed !== false);
      if (completedSets.length === 0) {
        // No completed sets, use default
        return base;
      }
      
      // Calculate average RIR across completed sets
      const rirValues = completedSets
        .map((s: any) => typeof s.rir === 'number' && s.rir >= 0 ? s.rir : null)
        .filter((rir: number | null) => rir !== null) as number[];
      
      if (rirValues.length > 0) {
        // Use RIR to determine intensity (primary method)
        const avgRIR = rirValues.reduce((a, b) => a + b, 0) / rirValues.length;
        
        // Map RIR to intensity
        if (avgRIR <= 1) base = 0.95;      // Very high intensity (0-1 RIR)
        else if (avgRIR <= 2) base = 0.90; // High intensity (2 RIR)
        else if (avgRIR <= 3) base = 0.85; // Moderate-high intensity (3 RIR)
        else if (avgRIR <= 4) base = 0.80; // Moderate intensity (4 RIR)
        else if (avgRIR <= 5) base = 0.75; // Moderate-low intensity (5 RIR)
        else base = 0.70;                   // Low intensity (6+ RIR)
      } else {
        // No RIR data, fall back to weight/reps estimation
        const avgWeight = completedSets.reduce((sum: number, s: any) => sum + (Number(s.weight) || 0), 0) / completedSets.length;
        const avgReps = completedSets.reduce((sum: number, s: any) => sum + (Number(s.reps) || 0), 0) / completedSets.length;
        
        // Check for duration-based exercises (planks, holds, carries)
        if (completedSets[0].duration_seconds && completedSets[0].duration_seconds > 0) {
          base = INTENSITY_FACTORS.strength.core_;
          const avgDuration = completedSets.reduce((sum: number, s: any) => sum + (Number(s.duration_seconds) || 0), 0) / completedSets.length;
          if (avgDuration > 90) base *= 1.05;
          return base;
        }
        
        // Estimate intensity from weight/reps (fallback when no RIR)
        if (avgWeight > 0) {
          if (avgReps <= 5 && avgWeight > 50) base = 0.90; // Heavy, low reps
          else if (avgReps <= 5) base = 0.85;
          else if (avgReps >= 13) base = 0.70; // Light, high reps
          else base = 0.80; // Moderate
        }
        
        // Adjust by reps
        if (avgReps <= 5) base *= 1.05;
        else if (avgReps >= 13) base *= 0.90;
      }
      
      return base;
    }
    
    // Flat structure: { name, sets, reps, weight } (backward compatibility)
    // Duration-based exercises (planks, holds, carries)
    if (ex.duration_seconds && ex.duration_seconds > 0) {
      base = INTENSITY_FACTORS.strength.core_;
      if (ex.duration_seconds > 90) base *= 1.05;
      return base;
    }
    
    // Rep-based exercises (traditional lifts)
    if (ex.weight && typeof ex.weight === 'string' && ex.weight.includes('% 1RM')) {
      const pct = parseInt(ex.weight);
      const roundedPct = Math.floor(pct / 5) * 5;
      const key = `@pct${roundedPct}` as keyof typeof INTENSITY_FACTORS.strength;
      base = INTENSITY_FACTORS.strength[key] || 0.75;
    } else if (ex.weight && typeof ex.weight === 'string' && ex.weight.toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength.bodyweight;
    }
    
    // Adjust by reps
    const reps = typeof ex.reps === 'number' ? ex.reps : 8;
    if (reps <= 5) base *= 1.05;
    else if (reps >= 13) base *= 0.90;
    
    return base;
  });
  
  return intensities.reduce((a, b) => a + b, 0) / intensities.length;
}

/**
 * Map Session RPE (1-10) to intensity factor
 * RPE is inverse - higher RPE = harder = higher intensity
 */
function mapRPEToIntensity(rpe: number): number {
  if (rpe >= 9) return 0.95;      // Very high intensity (9-10 RPE)
  if (rpe >= 8) return 0.90;      // High intensity (8 RPE)
  if (rpe >= 7) return 0.85;      // Moderate-high intensity (7 RPE)
  if (rpe >= 6) return 0.80;      // Moderate intensity (6 RPE)
  if (rpe >= 5) return 0.75;      // Moderate-low intensity (5 RPE)
  if (rpe >= 4) return 0.70;      // Low-moderate intensity (4 RPE)
  if (rpe >= 3) return 0.65;      // Low intensity (3 RPE)
  return 0.60;                    // Very low intensity (1-2 RPE)
}

/**
 * Calculate workload for pilates_yoga workouts
 * Formula: duration (minutes) × RPE
 * Pure sRPE method (research-validated, no modality factors)
 */
function calculatePilatesYogaWorkload(workout: WorkoutData, sessionRPE?: number): number {
  if (!workout.duration || workout.duration <= 0) return 0;
  
  // Get RPE from metadata (required for pilates_yoga)
  const metadata = workout.workout_metadata || {};
  const rpe = sessionRPE || metadata.session_rpe;
  
  if (!rpe || typeof rpe !== 'number' || rpe < 1 || rpe > 10) {
    // Cannot calculate workload without RPE
    console.warn('No RPE provided for pilates_yoga workout, cannot calculate workload');
    return 0;
  }
  
  // Pure sRPE method: duration (minutes) × RPE
  const workload = Math.round(workout.duration * rpe);
  
  return workload;
}

/**
 * Get intensity for pilates_yoga session (based on RPE)
 */
function getPilatesYogaIntensity(workout: WorkoutData, sessionRPE?: number): number {
  const metadata = workout.workout_metadata || {};
  const rpe = sessionRPE || metadata.session_rpe;
  
  if (!rpe || typeof rpe !== 'number' || rpe < 1 || rpe > 10) {
    // Default to moderate intensity if no RPE
    return 0.75;
  }
  
  // Map RPE (1-10) to intensity (0.55-0.95)
  return mapRPEToIntensity(rpe);
}

/**
 * Get intensity for mobility session
 */
function getMobilityIntensity(exercises: any[]): number {
  const completedCount = exercises.filter(ex => ex.completed).length;
  const totalCount = exercises.length;
  
  if (totalCount === 0) return 0.60;
  
  // Base mobility intensity
  const baseIntensity = 0.60;
  const completionRatio = completedCount / totalCount;
  
  // Slight increase based on completion rate
  return baseIntensity + (completionRatio * 0.1);
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { 
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        } 
      })
    }

    const { workout_id, workout_data } = await req.json()
    
    if (!workout_id) {
      return new Response(
        JSON.stringify({ error: 'workout_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // SMART SERVER: Always fetch workout_metadata from database (client doesn't pass it)
    // Also fetch full workout data if not provided
    let finalWorkoutData = workout_data;
    let workoutStatus = workout_data?.workout_status;
    let workoutMetadata: any = null;
    
    // Always fetch workout_metadata and user_id from database (even if workout_data is provided)
    // This ensures we get Session RPE for strength workouts and can fetch user's FTP
    let userId: string | null = null;
    
    console.log(`[calculate-workload] Looking up workout_id: ${workout_id}`);
    
    const { data: dbWorkout, error: dbError } = await supabaseClient
      .from('workouts')
      .select('workout_status, workout_metadata, user_id')
      .eq('id', workout_id)
      .single()
    
    console.log(`[calculate-workload] Query result: ${JSON.stringify({ dbWorkout, dbError })}`);
    
    if (!dbError && dbWorkout) {
      workoutStatus = workoutStatus || dbWorkout.workout_status || 'completed';
      workoutMetadata = dbWorkout.workout_metadata;
      userId = dbWorkout.user_id;
    } else {
      // Try planned_workouts table
      const { data: plannedWorkout, error: plannedError } = await supabaseClient
        .from('planned_workouts')
        .select('workout_status, workout_metadata, user_id')
        .eq('id', workout_id)
        .single()
      
      if (!plannedError && plannedWorkout) {
        workoutStatus = workoutStatus || plannedWorkout.workout_status || 'planned';
        workoutMetadata = plannedWorkout.workout_metadata;
        userId = plannedWorkout.user_id;
      }
    }
    
    // Fetch user's FTP, threshold HR, max HR, resting HR from user_baselines (including learned_fitness)
    let userFtp: number | null = null;
    let userThresholdHr: number | null = null;
    let runThresholdHr: number | null = null;
    let rideThresholdHr: number | null = null;
    let runMaxHr: number | null = null;
    let rideMaxHr: number | null = null;
    let restingHr: number | null = null;
    if (userId) {
      try {
        const { data: baseline } = await supabaseClient
          .from('user_baselines')
          .select('performance_numbers, learned_fitness')
          .eq('user_id', userId)
          .maybeSingle();
        
        // Priority 1: Use learned_fitness thresholds (more accurate, data-driven)
        if (baseline?.learned_fitness) {
          const learned = typeof baseline.learned_fitness === 'string' 
            ? JSON.parse(baseline.learned_fitness) 
            : baseline.learned_fitness;
          
          // Run threshold HR from learned data
          if (learned?.run?.threshold_hr?.value) {
            runThresholdHr = Number(learned.run.threshold_hr.value);
            console.log('[calculate-workload] Run THR from learned:', runThresholdHr);
          }
          
          // Run max HR from learned data (for TRIMP)
          if (learned?.run?.max_hr?.value) {
            runMaxHr = Number(learned.run.max_hr.value);
            console.log('[calculate-workload] Run MaxHR from learned:', runMaxHr);
          }
          
          // Ride threshold HR from learned data
          if (learned?.ride?.threshold_hr?.value) {
            rideThresholdHr = Number(learned.ride.threshold_hr.value);
            console.log('[calculate-workload] Ride THR from learned:', rideThresholdHr);
          }
          
          // Ride max HR from learned data (for TRIMP)
          if (learned?.ride?.max_hr?.value) {
            rideMaxHr = Number(learned.ride.max_hr.value);
            console.log('[calculate-workload] Ride MaxHR from learned:', rideMaxHr);
          }
          
          // FTP from learned data (if available)
          if (learned?.ride?.ftp_estimated?.value) {
            userFtp = Number(learned.ride.ftp_estimated.value);
            console.log('[calculate-workload] FTP from learned:', userFtp);
          }
        }
        
        // Priority 2: Use manual performance_numbers (fallback)
        if (baseline?.performance_numbers) {
          const perfNumbers = typeof baseline.performance_numbers === 'string' 
            ? JSON.parse(baseline.performance_numbers) 
            : baseline.performance_numbers;
          
          // Only use manual FTP if we don't have learned FTP
          if (!userFtp && perfNumbers?.ftp) {
            userFtp = Number(perfNumbers.ftp);
            console.log('[calculate-workload] FTP from manual baselines:', userFtp);
          }
          
          // Manual threshold HR as fallback
          if (perfNumbers?.thresholdHeartRate || perfNumbers?.threshold_heart_rate) {
            userThresholdHr = Number(perfNumbers.thresholdHeartRate || perfNumbers.threshold_heart_rate);
            console.log('[calculate-workload] THR from manual baselines:', userThresholdHr);
          }
          
          // Manual max HR (fallback for TRIMP)
          if (!runMaxHr && (perfNumbers?.maxHeartRate || perfNumbers?.max_heart_rate)) {
            runMaxHr = Number(perfNumbers.maxHeartRate || perfNumbers.max_heart_rate);
            rideMaxHr = runMaxHr; // Use same for ride if not learned
            console.log('[calculate-workload] MaxHR from manual baselines:', runMaxHr);
          }
          
          // Resting HR (for TRIMP calculation)
          if (perfNumbers?.restingHeartRate || perfNumbers?.resting_heart_rate) {
            restingHr = Number(perfNumbers.restingHeartRate || perfNumbers.resting_heart_rate);
            console.log('[calculate-workload] Resting HR from manual baselines:', restingHr);
          }
        }
      } catch (e) {
        console.error('[calculate-workload] Error fetching user baselines:', e);
      }
    }
    
    // If workout_data not provided, fetch full workout data
    if (!finalWorkoutData) {
      console.log(`[calculate-workload] Fetching full workout data for ${workout_id}`);
      const { data: workout, error: workoutError } = await supabaseClient
        .from('workouts')
        .select('type, duration, strength_exercises, mobility_exercises, workout_status, moving_time, avg_pace, avg_power, avg_heart_rate, max_heart_rate, functional_threshold_power, threshold_heart_rate')
        .eq('id', workout_id)
        .single()
      
      console.log(`[calculate-workload] Full workout query: ${JSON.stringify({ found: !!workout, error: workoutError?.message })}`);
      
      if (workoutError) {
        // Try planned_workouts table
        const { data: plannedWorkout, error: plannedError } = await supabaseClient
          .from('planned_workouts')
          .select('type, duration, strength_exercises, mobility_exercises, steps_preset, workout_status, moving_time')
          .eq('id', workout_id)
          .single()
        
        if (plannedError) {
          return new Response(
            JSON.stringify({ error: 'Workout not found and workout_data not provided' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          )
        }
        
        finalWorkoutData = plannedWorkout;
        workoutStatus = workoutStatus || plannedWorkout.workout_status || 'planned';
      } else {
        finalWorkoutData = workout;
        workoutStatus = workoutStatus || workout.workout_status || 'completed';
      }
    } else {
      workoutStatus = workoutStatus || workout_data.workout_status || 'completed';
    }
    
    // Inject user's FTP and threshold HR into workout data if not already present
    // This allows power/HR-based intensity calculation for Strava/Garmin imports
    // Use sport-specific learned thresholds when available
    if (userFtp && !finalWorkoutData.functional_threshold_power) {
      finalWorkoutData.functional_threshold_power = userFtp;
      console.log('[calculate-workload] Injected user FTP:', userFtp);
    }
    
    // Inject sport-specific threshold HR
    const workoutType = finalWorkoutData.type?.toLowerCase() || '';
    if (!finalWorkoutData.threshold_heart_rate) {
      if ((workoutType === 'run') && runThresholdHr) {
        finalWorkoutData.threshold_heart_rate = runThresholdHr;
        console.log('[calculate-workload] Injected run-specific THR:', runThresholdHr);
      } else if ((workoutType === 'ride' || workoutType === 'bike') && rideThresholdHr) {
        finalWorkoutData.threshold_heart_rate = rideThresholdHr;
        console.log('[calculate-workload] Injected ride-specific THR:', rideThresholdHr);
      } else if (userThresholdHr) {
        finalWorkoutData.threshold_heart_rate = userThresholdHr;
        console.log('[calculate-workload] Injected generic THR:', userThresholdHr);
      }
    }
    
    // Inject max HR for TRIMP calculation (sport-specific)
    if (!finalWorkoutData.max_heart_rate) {
      if ((workoutType === 'run') && runMaxHr) {
        finalWorkoutData.max_heart_rate = runMaxHr;
        console.log('[calculate-workload] Injected run-specific MaxHR:', runMaxHr);
      } else if ((workoutType === 'ride' || workoutType === 'bike') && rideMaxHr) {
        finalWorkoutData.max_heart_rate = rideMaxHr;
        console.log('[calculate-workload] Injected ride-specific MaxHR:', rideMaxHr);
      } else if (runMaxHr) {
        // Use run max HR as fallback for swim/other
        finalWorkoutData.max_heart_rate = runMaxHr;
        console.log('[calculate-workload] Injected generic MaxHR:', runMaxHr);
      }
    }
    
    // Inject resting HR for TRIMP calculation
    if (!finalWorkoutData.resting_heart_rate && restingHr) {
      finalWorkoutData.resting_heart_rate = restingHr;
      console.log('[calculate-workload] Injected resting HR:', restingHr);
    }
    
    // Parse workout_metadata if it's a string (JSONB from database)
    let parsedMetadata: any = {};
    if (workoutMetadata) {
      try {
        if (typeof workoutMetadata === 'string') {
          parsedMetadata = JSON.parse(workoutMetadata);
        } else if (typeof workoutMetadata === 'object') {
          parsedMetadata = workoutMetadata;
        }
      } catch (e) {
        console.warn('Failed to parse workout_metadata:', e);
      }
    }
    
    // Add metadata to finalWorkoutData for use in calculations
    if (Object.keys(parsedMetadata).length > 0) {
      finalWorkoutData.workout_metadata = parsedMetadata;
    }

    // Ensure workout_status is set
    if (!workoutStatus) {
      workoutStatus = 'completed'; // Default
    }

    // Extract session RPE from metadata (for strength and pilates_yoga workouts)
    // Runs/rides/swims don't use RPE - they use performance-based intensity
    const sessionRPE = (finalWorkoutData.type === 'strength' || finalWorkoutData.type === 'pilates_yoga') && parsedMetadata?.session_rpe 
      ? parsedMetadata.session_rpe 
      : undefined;
    
    // Calculate workload (all math happens server-side)
    const workload = calculateWorkload(finalWorkoutData, sessionRPE)
    const intensity = getSessionIntensity(finalWorkoutData, sessionRPE)
    
    // If workout is attached to a planned workout, fetch planned workload for comparison
    let plannedWorkload = null;
    if (workoutStatus === 'completed') {
      const { data: completedWorkout } = await supabaseClient
        .from('workouts')
        .select('planned_id')
        .eq('id', workout_id)
        .single()
      
      if (completedWorkout?.planned_id) {
        const { data: planned } = await supabaseClient
          .from('planned_workouts')
          .select('workload_planned')
          .eq('id', completedWorkout.planned_id)
          .single()
        
        if (planned?.workload_planned) {
          plannedWorkload = planned.workload_planned;
        }
      }
    }

    // Determine which table to update based on workout status
    const tableName = workoutStatus === 'planned' ? 'planned_workouts' : 'workouts'
    
    // Update the workout in the database
    const { error } = await supabaseClient
      .from(tableName)
      .update({
        workload_planned: workoutStatus === 'planned' ? workload : null,
        workload_actual: workoutStatus === 'completed' ? workload : null,
        intensity_factor: intensity
      })
      .eq('id', workout_id)

    if (error) {
      console.error('Database update error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to update workout' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Determine which workload method was used for debug info
    let workloadMethod = 'duration_intensity';
    const wType = finalWorkoutData?.type?.toLowerCase() || '';
    const isCardio = wType === 'run' || wType === 'ride' || wType === 'bike' || wType === 'swim';
    
    // Check if TRIMP was used (cardio with HR + max HR)
    if (isCardio && finalWorkoutData?.avg_heart_rate && finalWorkoutData?.max_heart_rate) {
      workloadMethod = 'trimp_hr_based';
    } else if (wType === 'strength') {
      workloadMethod = 'volume_based';
    } else if ((wType === 'run') && finalWorkoutData?.avg_heart_rate && finalWorkoutData?.threshold_heart_rate) {
      workloadMethod = 'hr_intensity';
    } else if ((wType === 'ride' || wType === 'bike') && userFtp && finalWorkoutData?.avg_power) {
      workloadMethod = 'power_intensity';
    } else if (finalWorkoutData?.steps_preset?.length > 0) {
      workloadMethod = 'steps_preset';
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        workout_id,
        workload_planned: workoutStatus === 'planned' ? workload : null,
        workload_actual: workoutStatus === 'completed' ? workload : null,
        intensity_factor: intensity,
        planned_workload: plannedWorkload, // For comparison when attached
        workload_difference: plannedWorkload !== null ? workload - plannedWorkload : null,
        // Debug info for workload calculation
        user_ftp: userFtp,
        run_threshold_hr: runThresholdHr,
        ride_threshold_hr: rideThresholdHr,
        run_max_hr: runMaxHr,
        ride_max_hr: rideMaxHr,
        resting_hr: restingHr,
        avg_power: finalWorkoutData?.avg_power,
        avg_heart_rate: finalWorkoutData?.avg_heart_rate,
        threshold_heart_rate: finalWorkoutData?.threshold_heart_rate,
        max_heart_rate: finalWorkoutData?.max_heart_rate,
        workload_method: workloadMethod
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
