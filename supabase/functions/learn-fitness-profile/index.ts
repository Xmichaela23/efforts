/**
 * =============================================================================
 * EDGE FUNCTION: learn-fitness-profile
 * =============================================================================
 * 
 * PURPOSE: Auto-learn user's fitness profile from workout data
 * 
 * WHAT IT DOES:
 * - Analyzes completed runs and rides with HR data
 * - Classifies workouts by effort type (easy, threshold, race)
 * - Extracts HR bands for each zone
 * - Detects threshold pace (running) and estimates FTP (cycling)
 * - Stores learned metrics in user_baselines
 * 
 * KEY INSIGHT: Properly trained athletes rarely hit max HR
 * So we anchor on THRESHOLD, not max:
 * - Easy HR from recovery/long runs
 * - Threshold HR from tempo runs, sustained efforts
 * - Race HR from 5K/10K efforts, hard intervals
 * 
 * INPUT: { user_id: string }
 * OUTPUT: LearnedFitnessProfile
 * =============================================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// CORS HEADERS
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface WorkoutRecord {
  id: string;
  type: string;
  date: string;
  duration: number;
  moving_time: number;
  distance: number;
  avg_heart_rate: number;
  max_heart_rate: number;
  avg_pace: number;  // seconds per km
  avg_power: number;
  avg_speed: number; // km/h
  workout_status: string;
}

interface LearnedMetric {
  value: number;
  confidence: 'low' | 'medium' | 'high';
  source: string;
  sample_count: number;
}

interface LearnedFitnessProfile {
  // Running metrics
  run_easy_hr: LearnedMetric | null;
  run_threshold_hr: LearnedMetric | null;
  run_race_hr: LearnedMetric | null;
  run_max_hr_observed: LearnedMetric | null;
  run_easy_pace_sec_per_km: LearnedMetric | null;
  run_threshold_pace_sec_per_km: LearnedMetric | null;
  
  // Cycling metrics
  ride_easy_hr: LearnedMetric | null;
  ride_threshold_hr: LearnedMetric | null;
  ride_max_hr_observed: LearnedMetric | null;
  ride_ftp_estimated: LearnedMetric | null;
  
  // Meta
  workouts_analyzed: number;
  last_updated: string;
  learning_status: 'insufficient_data' | 'learning' | 'confident';
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const payload = await req.json();
    const { user_id } = payload;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`🏃 Learning fitness profile for user ${user_id}`);

    // Calculate date range (last 90 days)
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const ninetyDaysAgoISO = ninetyDaysAgo.toLocaleDateString('en-CA');

    // ==========================================================================
    // FETCH WORKOUT DATA
    // ==========================================================================

    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('id, type, date, duration, moving_time, distance, avg_heart_rate, max_heart_rate, avg_pace, avg_power, avg_speed, workout_status')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .in('type', ['run', 'ride'])
      .gte('date', ninetyDaysAgoISO)
      .not('avg_heart_rate', 'is', null)
      .gt('avg_heart_rate', 60)  // Filter out bad data
      .order('date', { ascending: false });

    if (workoutsError) {
      console.error('❌ Error fetching workouts:', workoutsError);
      throw new Error(`Failed to fetch workouts: ${workoutsError.message}`);
    }

    const allWorkouts: WorkoutRecord[] = workouts || [];
    console.log(`📊 Found ${allWorkouts.length} workouts with HR data`);

    // Separate by type
    const runs = allWorkouts.filter(w => w.type === 'run');
    const rides = allWorkouts.filter(w => w.type === 'ride');

    console.log(`🏃 Runs: ${runs.length}, 🚴 Rides: ${rides.length}`);

    // ==========================================================================
    // ANALYZE RUNS
    // ==========================================================================

    const runProfile = analyzeRuns(runs);

    // ==========================================================================
    // ANALYZE RIDES
    // ==========================================================================

    const rideProfile = analyzeRides(rides);

    // ==========================================================================
    // BUILD LEARNED PROFILE
    // ==========================================================================

    const totalWorkouts = runs.length + rides.length;
    let learningStatus: 'insufficient_data' | 'learning' | 'confident' = 'insufficient_data';
    
    if (totalWorkouts >= 15) {
      learningStatus = 'confident';
    } else if (totalWorkouts >= 5) {
      learningStatus = 'learning';
    }

    const learnedProfile: LearnedFitnessProfile = {
      // Running
      run_easy_hr: runProfile.easy_hr,
      run_threshold_hr: runProfile.threshold_hr,
      run_race_hr: runProfile.race_hr,
      run_max_hr_observed: runProfile.max_hr_observed,
      run_easy_pace_sec_per_km: runProfile.easy_pace,
      run_threshold_pace_sec_per_km: runProfile.threshold_pace,
      
      // Cycling
      ride_easy_hr: rideProfile.easy_hr,
      ride_threshold_hr: rideProfile.threshold_hr,
      ride_max_hr_observed: rideProfile.max_hr_observed,
      ride_ftp_estimated: rideProfile.ftp_estimated,
      
      // Meta
      workouts_analyzed: totalWorkouts,
      last_updated: new Date().toISOString(),
      learning_status: learningStatus
    };

    // ==========================================================================
    // STORE IN USER_BASELINES
    // ==========================================================================

    // First, fetch existing baselines
    const { data: existingBaselines } = await supabase
      .from('user_baselines')
      .select('id, learned_fitness')
      .eq('user_id', user_id)
      .maybeSingle();

    if (existingBaselines?.id) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('user_baselines')
        .update({ 
          learned_fitness: learnedProfile,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingBaselines.id);

      if (updateError) {
        console.error('❌ Error updating baselines:', updateError);
      } else {
        console.log('✅ Updated learned_fitness in user_baselines');
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('user_baselines')
        .insert({
          user_id: user_id,
          learned_fitness: learnedProfile,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('❌ Error inserting baselines:', insertError);
      } else {
        console.log('✅ Created new user_baselines with learned_fitness');
      }
    }

    console.log(`✅ Fitness profile learned: status=${learningStatus}, workouts=${totalWorkouts}`);

    return new Response(JSON.stringify(learnedProfile), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Learn fitness profile error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// =============================================================================
// RUN ANALYSIS
// =============================================================================

interface RunAnalysisResult {
  easy_hr: LearnedMetric | null;
  threshold_hr: LearnedMetric | null;
  race_hr: LearnedMetric | null;
  max_hr_observed: LearnedMetric | null;
  easy_pace: LearnedMetric | null;
  threshold_pace: LearnedMetric | null;
}

function analyzeRuns(runs: WorkoutRecord[]): RunAnalysisResult {
  if (runs.length < 3) {
    return {
      easy_hr: null,
      threshold_hr: null,
      race_hr: null,
      max_hr_observed: null,
      easy_pace: null,
      threshold_pace: null
    };
  }

  // Calculate average pace across all runs for classification
  const validPaces = runs
    .filter(r => r.avg_pace && r.avg_pace > 0 && r.avg_pace < 1000) // sanity check
    .map(r => r.avg_pace);
  
  const avgPaceOverall = validPaces.length > 0 
    ? validPaces.reduce((a, b) => a + b, 0) / validPaces.length 
    : 0;

  // Classify runs by effort type
  const easyRuns: WorkoutRecord[] = [];
  const thresholdRuns: WorkoutRecord[] = [];
  const raceRuns: WorkoutRecord[] = [];

  runs.forEach(run => {
    const duration = run.moving_time || run.duration || 0;
    const pace = run.avg_pace || 0;
    const hr = run.avg_heart_rate || 0;

    if (!pace || !hr || duration < 10) return; // Skip incomplete data

    // Classification heuristics:
    // Easy: slower than 1.15× average pace, duration > 20 min
    // Threshold: sustained (20-60 min), faster than average but not sprint
    // Race: short and fast (< 45 min, significantly faster than avg)

    const paceRatio = pace / avgPaceOverall; // Higher = slower

    if (paceRatio > 1.12 && duration >= 20) {
      // Slow pace, longer duration = easy run
      easyRuns.push(run);
    } else if (paceRatio <= 0.92 && duration >= 15 && duration <= 45) {
      // Fast, short-medium duration = race effort
      raceRuns.push(run);
    } else if (paceRatio > 0.92 && paceRatio <= 1.05 && duration >= 20) {
      // Moderate-fast, sustained = threshold
      thresholdRuns.push(run);
    }
  });

  console.log(`  📊 Classified runs - Easy: ${easyRuns.length}, Threshold: ${thresholdRuns.length}, Race: ${raceRuns.length}`);

  // Extract HR metrics
  const easy_hr = extractHRMetric(easyRuns, 'easy runs');
  const threshold_hr = extractHRMetric(thresholdRuns, 'threshold runs');
  const race_hr = extractHRMetric(raceRuns, 'race efforts');

  // Find max observed HR
  const allMaxHRs = runs
    .filter(r => r.max_heart_rate && r.max_heart_rate > 100)
    .map(r => r.max_heart_rate);
  
  const max_hr_observed: LearnedMetric | null = allMaxHRs.length > 0 ? {
    value: Math.max(...allMaxHRs),
    confidence: allMaxHRs.length >= 5 ? 'high' : 'medium',
    source: 'max observed across all runs',
    sample_count: allMaxHRs.length
  } : null;

  // Extract pace metrics
  const easy_pace = extractPaceMetric(easyRuns, 'easy runs');
  const threshold_pace = extractPaceMetric(thresholdRuns, 'threshold runs');

  return {
    easy_hr,
    threshold_hr,
    race_hr,
    max_hr_observed,
    easy_pace,
    threshold_pace
  };
}

// =============================================================================
// RIDE ANALYSIS
// =============================================================================

interface RideAnalysisResult {
  easy_hr: LearnedMetric | null;
  threshold_hr: LearnedMetric | null;
  max_hr_observed: LearnedMetric | null;
  ftp_estimated: LearnedMetric | null;
}

function analyzeRides(rides: WorkoutRecord[]): RideAnalysisResult {
  if (rides.length < 3) {
    return {
      easy_hr: null,
      threshold_hr: null,
      max_hr_observed: null,
      ftp_estimated: null
    };
  }

  // Calculate average speed across all rides for classification
  const validSpeeds = rides
    .filter(r => r.avg_speed && r.avg_speed > 5 && r.avg_speed < 60) // sanity check km/h
    .map(r => r.avg_speed);
  
  const avgSpeedOverall = validSpeeds.length > 0 
    ? validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length 
    : 0;

  // Classify rides by effort type
  const easyRides: WorkoutRecord[] = [];
  const thresholdRides: WorkoutRecord[] = [];

  rides.forEach(ride => {
    const duration = ride.moving_time || ride.duration || 0;
    const speed = ride.avg_speed || 0;
    const hr = ride.avg_heart_rate || 0;

    if (!hr || duration < 15) return; // Skip incomplete data

    // Classification based on speed relative to average
    const speedRatio = avgSpeedOverall > 0 ? speed / avgSpeedOverall : 1;

    if (speedRatio < 0.9 && duration >= 30) {
      // Slow, longer duration = easy/endurance ride
      easyRides.push(ride);
    } else if (speedRatio >= 0.95 && duration >= 20 && duration <= 90) {
      // Faster, sustained = threshold effort
      thresholdRides.push(ride);
    }
  });

  console.log(`  📊 Classified rides - Easy: ${easyRides.length}, Threshold: ${thresholdRides.length}`);

  // Extract HR metrics
  const easy_hr = extractHRMetric(easyRides, 'easy rides');
  const threshold_hr = extractHRMetric(thresholdRides, 'threshold rides');

  // Find max observed HR
  const allMaxHRs = rides
    .filter(r => r.max_heart_rate && r.max_heart_rate > 100)
    .map(r => r.max_heart_rate);
  
  const max_hr_observed: LearnedMetric | null = allMaxHRs.length > 0 ? {
    value: Math.max(...allMaxHRs),
    confidence: allMaxHRs.length >= 5 ? 'high' : 'medium',
    source: 'max observed across all rides',
    sample_count: allMaxHRs.length
  } : null;

  // Estimate FTP from power data (if available)
  const ridesWithPower = rides.filter(r => r.avg_power && r.avg_power > 50);
  let ftp_estimated: LearnedMetric | null = null;

  if (ridesWithPower.length >= 3) {
    // Look for sustained efforts (20-60 min) with power
    const sustainedPowerEfforts = ridesWithPower
      .filter(r => {
        const duration = r.moving_time || r.duration || 0;
        return duration >= 20 && duration <= 90;
      })
      .map(r => r.avg_power)
      .sort((a, b) => b - a); // Highest first

    if (sustainedPowerEfforts.length >= 2) {
      // Take 95% of best sustained power as FTP estimate
      const bestPower = sustainedPowerEfforts[0];
      const estimatedFTP = Math.round(bestPower * 0.95);

      ftp_estimated = {
        value: estimatedFTP,
        confidence: sustainedPowerEfforts.length >= 5 ? 'high' : 'medium',
        source: '95% of best sustained power',
        sample_count: sustainedPowerEfforts.length
      };
    }
  }

  return {
    easy_hr,
    threshold_hr,
    max_hr_observed,
    ftp_estimated
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractHRMetric(workouts: WorkoutRecord[], source: string): LearnedMetric | null {
  const validHRs = workouts
    .filter(w => w.avg_heart_rate && w.avg_heart_rate > 60 && w.avg_heart_rate < 220)
    .map(w => w.avg_heart_rate);

  if (validHRs.length === 0) return null;

  // Use median for robustness against outliers
  const sorted = [...validHRs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    value: Math.round(median),
    confidence: validHRs.length >= 5 ? 'high' : (validHRs.length >= 3 ? 'medium' : 'low'),
    source: source,
    sample_count: validHRs.length
  };
}

function extractPaceMetric(workouts: WorkoutRecord[], source: string): LearnedMetric | null {
  const validPaces = workouts
    .filter(w => w.avg_pace && w.avg_pace > 150 && w.avg_pace < 900) // 2:30/km to 15:00/km
    .map(w => w.avg_pace);

  if (validPaces.length === 0) return null;

  // Use median for robustness
  const sorted = [...validPaces].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    value: Math.round(median),
    confidence: validPaces.length >= 5 ? 'high' : (validPaces.length >= 3 ? 'medium' : 'low'),
    source: source,
    sample_count: validPaces.length
  };
}

