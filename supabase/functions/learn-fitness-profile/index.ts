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
  normalized_power: number;
  avg_speed: number; // km/h
  workout_status: string;
  computed: any; // May contain analysis.bests.power_20min
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
      .select('id, type, date, duration, moving_time, distance, avg_heart_rate, max_heart_rate, avg_pace, avg_power, normalized_power, avg_speed, workout_status, computed')
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

  // ==========================================================================
  // STEP 1: Find observed max HR (this is reliable)
  // ==========================================================================
  const allMaxHRs = runs
    .filter(r => r.max_heart_rate && r.max_heart_rate > 100 && r.max_heart_rate < 220)
    .map(r => r.max_heart_rate);
  
  const observedMaxHR = allMaxHRs.length > 0 ? Math.max(...allMaxHRs) : null;
  
  const max_hr_observed: LearnedMetric | null = observedMaxHR ? {
    value: observedMaxHR,
    confidence: allMaxHRs.length >= 5 ? 'high' : 'medium',
    source: 'max observed across all runs',
    sample_count: allMaxHRs.length
  } : null;

  console.log(`  📊 Observed max HR: ${observedMaxHR} from ${allMaxHRs.length} runs`);

  // ==========================================================================
  // STEP 2: Find threshold HR using HR-based detection (not pace)
  // Threshold is 85-92% of max HR in sustained efforts
  // ==========================================================================
  
  // Filter for sustained efforts (20-60 min) with valid HR
  const sustainedEfforts = runs.filter(r => {
    const duration = r.moving_time || r.duration || 0;
    const hr = r.avg_heart_rate || 0;
    return duration >= 20 && duration <= 60 && hr > 100 && hr < 220;
  });

  console.log(`  📊 Sustained efforts (20-60 min): ${sustainedEfforts.length}`);

  let threshold_hr: LearnedMetric | null = null;
  let thresholdHRValue: number | null = null;

  if (observedMaxHR && sustainedEfforts.length >= 2) {
    // Look for efforts in the threshold HR range (85-92% of max)
    const thresholdLow = observedMaxHR * 0.85;
    const thresholdHigh = observedMaxHR * 0.92;
    
    const thresholdCandidates = sustainedEfforts.filter(r => 
      r.avg_heart_rate >= thresholdLow && r.avg_heart_rate <= thresholdHigh
    );

    console.log(`  📊 Threshold candidates (${Math.round(thresholdLow)}-${Math.round(thresholdHigh)} bpm): ${thresholdCandidates.length}`);

    if (thresholdCandidates.length >= 2) {
      // Take median of threshold efforts
      const sortedHRs = thresholdCandidates.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      thresholdHRValue = sortedHRs[Math.floor(sortedHRs.length / 2)];
      
      threshold_hr = {
        value: Math.round(thresholdHRValue),
        confidence: thresholdCandidates.length >= 5 ? 'high' : 'medium',
        source: `median of ${thresholdCandidates.length} threshold efforts (85-92% max)`,
        sample_count: thresholdCandidates.length
      };
    } else {
      // Fallback: Take 95th percentile of all sustained efforts
      const sortedAllHRs = sustainedEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      if (sortedAllHRs.length >= 3) {
        const idx = Math.floor(sortedAllHRs.length * 0.95);
        thresholdHRValue = sortedAllHRs[Math.min(idx, sortedAllHRs.length - 1)];
        
        threshold_hr = {
          value: Math.round(thresholdHRValue),
          confidence: 'low',
          source: '95th percentile of sustained efforts (no clear threshold data)',
          sample_count: sortedAllHRs.length
        };
      } else {
        // Last resort: 88% of max HR
        thresholdHRValue = Math.round(observedMaxHR * 0.88);
        
        threshold_hr = {
          value: thresholdHRValue,
          confidence: 'low',
          source: '88% of observed max (estimated)',
          sample_count: 0
        };
      }
    }
  }

  console.log(`  📊 Threshold HR determined: ${thresholdHRValue} bpm`);

  // ==========================================================================
  // STEP 3: Find easy HR (bottom 25% of sustained efforts, or efforts < 75% max)
  // ==========================================================================
  
  let easy_hr: LearnedMetric | null = null;

  if (observedMaxHR) {
    const easyHRCeiling = observedMaxHR * 0.75;
    const easyEfforts = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      return duration >= 20 && hr > 100 && hr <= easyHRCeiling;
    });

    if (easyEfforts.length >= 3) {
      const sortedEasyHRs = easyEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      const medianEasyHR = sortedEasyHRs[Math.floor(sortedEasyHRs.length / 2)];
      
      easy_hr = {
        value: Math.round(medianEasyHR),
        confidence: easyEfforts.length >= 5 ? 'high' : 'medium',
        source: `median of ${easyEfforts.length} easy runs (<75% max)`,
        sample_count: easyEfforts.length
      };
    } else {
      // Fallback: 70% of max
      easy_hr = {
        value: Math.round(observedMaxHR * 0.70),
        confidence: 'low',
        source: '70% of observed max (estimated)',
        sample_count: 0
      };
    }
  }

  // ==========================================================================
  // STEP 4: Find race HR (efforts > 92% of max, typically short hard efforts)
  // ==========================================================================
  
  let race_hr: LearnedMetric | null = null;

  if (observedMaxHR) {
    const raceHRFloor = observedMaxHR * 0.92;
    const raceEfforts = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      // Race efforts: shorter duration (10-45 min), high HR
      return duration >= 10 && duration <= 45 && hr >= raceHRFloor;
    });

    if (raceEfforts.length >= 2) {
      const sortedRaceHRs = raceEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      const medianRaceHR = sortedRaceHRs[Math.floor(sortedRaceHRs.length / 2)];
      
      race_hr = {
        value: Math.round(medianRaceHR),
        confidence: raceEfforts.length >= 3 ? 'high' : 'medium',
        source: `median of ${raceEfforts.length} race/hard efforts (>92% max)`,
        sample_count: raceEfforts.length
      };
    }
  }

  // ==========================================================================
  // STEP 5: Find threshold PACE (pace at which threshold HR occurs)
  // This is the correct way - HR determines effort, pace follows
  // ==========================================================================
  
  let threshold_pace: LearnedMetric | null = null;
  let easy_pace: LearnedMetric | null = null;

  if (thresholdHRValue && observedMaxHR) {
    // Find runs where avg HR was within ±5 bpm of threshold HR
    const thresholdPaceRuns = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      const pace = r.avg_pace || 0;
      return duration >= 15 && 
             pace > 150 && pace < 900 && // Valid pace range
             Math.abs(hr - thresholdHRValue!) <= 5;
    });

    if (thresholdPaceRuns.length >= 2) {
      const sortedPaces = thresholdPaceRuns.map(r => r.avg_pace).sort((a, b) => a - b);
      const medianPace = sortedPaces[Math.floor(sortedPaces.length / 2)];
      
      threshold_pace = {
        value: Math.round(medianPace),
        confidence: thresholdPaceRuns.length >= 3 ? 'high' : 'medium',
        source: `pace at threshold HR (${thresholdPaceRuns.length} runs)`,
        sample_count: thresholdPaceRuns.length
      };
    }
  }

  // Find easy pace (pace when HR is in easy zone)
  if (easy_hr && observedMaxHR) {
    const easyPaceRuns = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      const pace = r.avg_pace || 0;
      return duration >= 20 && 
             pace > 150 && pace < 900 &&
             hr <= observedMaxHR * 0.75;
    });

    if (easyPaceRuns.length >= 3) {
      const sortedPaces = easyPaceRuns.map(r => r.avg_pace).sort((a, b) => a - b);
      const medianPace = sortedPaces[Math.floor(sortedPaces.length / 2)];
      
      easy_pace = {
        value: Math.round(medianPace),
        confidence: easyPaceRuns.length >= 5 ? 'high' : 'medium',
        source: `pace at easy HR (${easyPaceRuns.length} runs)`,
        sample_count: easyPaceRuns.length
      };
    }
  }

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

  // ==========================================================================
  // STEP 1: Find observed max HR
  // ==========================================================================
  const allMaxHRs = rides
    .filter(r => r.max_heart_rate && r.max_heart_rate > 100 && r.max_heart_rate < 220)
    .map(r => r.max_heart_rate);
  
  const observedMaxHR = allMaxHRs.length > 0 ? Math.max(...allMaxHRs) : null;
  
  const max_hr_observed: LearnedMetric | null = observedMaxHR ? {
    value: observedMaxHR,
    confidence: allMaxHRs.length >= 5 ? 'high' : 'medium',
    source: 'max observed across all rides',
    sample_count: allMaxHRs.length
  } : null;

  console.log(`  📊 Ride max HR: ${observedMaxHR} from ${allMaxHRs.length} rides`);

  // ==========================================================================
  // STEP 2: Find threshold HR using POWER + HR detection
  // 
  // For cycling, HR alone is unreliable (heat, fatigue, caffeine inflate HR on casual rides)
  // True threshold = high power AND high HR simultaneously
  // Filter: Only consider rides with power > 75th percentile as threshold candidates
  // ==========================================================================
  
  const sustainedEfforts = rides.filter(r => {
    const duration = r.moving_time || r.duration || 0;
    const hr = r.avg_heart_rate || 0;
    return duration >= 20 && duration <= 90 && hr > 100 && hr < 220;
  });

  let threshold_hr: LearnedMetric | null = null;

  // Get power distribution to filter for hard efforts
  const allPowers = rides
    .filter(r => r.avg_power && r.avg_power > 50)
    .map(r => r.avg_power)
    .sort((a, b) => a - b);
  
  // 75th percentile power = hard effort threshold
  const p75Power = allPowers.length >= 4 
    ? allPowers[Math.floor(allPowers.length * 0.75)] 
    : null;
  
  console.log(`  📊 Ride power distribution: ${allPowers.length} rides, P75=${p75Power}W`);

  if (observedMaxHR && sustainedEfforts.length >= 2) {
    const thresholdLow = observedMaxHR * 0.85;
    const thresholdHigh = observedMaxHR * 0.95; // Widened to 95% for cycling (more variability)
    
    // Filter for HARD efforts: must have power data AND be above 75th percentile
    // This excludes casual rides where HR is elevated but power is low
    let thresholdCandidates = sustainedEfforts.filter(r => {
      const inHRRange = r.avg_heart_rate >= thresholdLow && r.avg_heart_rate <= thresholdHigh;
      
      // If we have power data, require high power
      if (p75Power && r.avg_power) {
        return inHRRange && r.avg_power >= p75Power * 0.85; // Power must be at least 85% of P75
      }
      
      // No power data available - fall back to HR only (less reliable)
      return inHRRange;
    });

    console.log(`  📊 Threshold candidates (power-filtered): ${thresholdCandidates.length}`);

    if (thresholdCandidates.length >= 2) {
      // Take the HIGHER end of the HR range (true threshold, not tempo)
      const sortedHRs = thresholdCandidates.map(r => r.avg_heart_rate).sort((a, b) => b - a); // Descending
      // Take 25th percentile from top (not median - we want hard efforts, not average)
      const thresholdHRValue = sortedHRs[Math.floor(sortedHRs.length * 0.25)];
      
      threshold_hr = {
        value: Math.round(thresholdHRValue),
        confidence: thresholdCandidates.length >= 4 ? 'high' : 'medium',
        source: `from ${thresholdCandidates.length} hard rides (power-filtered, 85-95% max HR)`,
        sample_count: thresholdCandidates.length
      };
      console.log(`  💓 Threshold HR: ${thresholdHRValue} bpm`);
    } else if (thresholdCandidates.length === 1) {
      // Single hard effort - use it, it's better than a generic estimate
      const singleEffortHR = thresholdCandidates[0].avg_heart_rate;
      threshold_hr = {
        value: Math.round(singleEffortHR),
        confidence: 'low',
        source: 'from 1 hard ride (need more data)',
        sample_count: 1
      };
      console.log(`  💓 Threshold HR from single effort: ${singleEffortHR} bpm`);
    } else {
      // No hard efforts found - use 90% of max (higher estimate for cycling)
      // Cyclists tend to have higher threshold % than runners
      threshold_hr = {
        value: Math.round(observedMaxHR * 0.90),
        confidence: 'low',
        source: '90% of observed max (estimated - no hard rides found)',
        sample_count: 0
      };
      console.log(`  💓 Threshold HR fallback: ${Math.round(observedMaxHR * 0.90)} bpm (90% of max)`);
    }
  }

  // ==========================================================================
  // STEP 3: Find easy HR (<75% of max)
  // ==========================================================================
  
  let easy_hr: LearnedMetric | null = null;

  if (observedMaxHR) {
    const easyHRCeiling = observedMaxHR * 0.75;
    const easyEfforts = rides.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      return duration >= 30 && hr > 100 && hr <= easyHRCeiling;
    });

    if (easyEfforts.length >= 3) {
      const sortedEasyHRs = easyEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      const medianEasyHR = sortedEasyHRs[Math.floor(sortedEasyHRs.length / 2)];
      
      easy_hr = {
        value: Math.round(medianEasyHR),
        confidence: easyEfforts.length >= 5 ? 'high' : 'medium',
        source: `median of ${easyEfforts.length} easy rides (<75% max)`,
        sample_count: easyEfforts.length
      };
    } else {
      easy_hr = {
        value: Math.round(observedMaxHR * 0.70),
        confidence: 'low',
        source: '70% of observed max (estimated)',
        sample_count: 0
      };
    }
  }

  // ==========================================================================
  // STEP 4: Estimate FTP from power data
  // 
  // FTP estimation hierarchy:
  // 1. Pre-calculated 20-min best power × 0.95 (most accurate)
  // 2. Best Normalized Power from 20-60 min efforts × 0.95
  // 3. Best avg power × 1.05 × 0.95 (adjusted for NP/avg gap)
  // ==========================================================================
  
  const ridesWithPower = rides.filter(r => 
    (r.avg_power && r.avg_power > 50) || 
    (r.normalized_power && r.normalized_power > 50)
  );
  let ftp_estimated: LearnedMetric | null = null;

  if (ridesWithPower.length >= 3) {
    const sustainedPowerRides = ridesWithPower.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      return duration >= 20 && duration <= 90;
    });

    // Priority 1: Look for pre-calculated 20-min best power
    const bestsPower20: number[] = [];
    for (const r of sustainedPowerRides) {
      const p20 = r.computed?.analysis?.bests?.power_20min 
        || r.computed?.analysis?.power?.best_20min
        || r.computed?.bests?.power_20min;
      if (p20 && p20 > 50) {
        bestsPower20.push(p20);
      }
    }

    if (bestsPower20.length >= 2) {
      const best20MinPower = Math.max(...bestsPower20);
      const estimatedFTP = Math.round(best20MinPower * 0.95);
      
      ftp_estimated = {
        value: estimatedFTP,
        confidence: bestsPower20.length >= 3 ? 'high' : 'medium',
        source: `95% of 20-min best power (${bestsPower20.length} efforts)`,
        sample_count: bestsPower20.length
      };
      console.log(`  ⚡ FTP from 20-min bests: ${estimatedFTP}W (from ${best20MinPower}W)`);
    }

    // Priority 2: Use Normalized Power (better than avg power)
    if (!ftp_estimated) {
      const normalizedPowers = sustainedPowerRides
        .filter(r => r.normalized_power && r.normalized_power > 50)
        .map(r => r.normalized_power)
        .sort((a, b) => b - a);

      if (normalizedPowers.length >= 2) {
        // NP from a ~60 min hard ride is approximately equal to FTP
        // For shorter efforts (20-40 min), use 95% of best NP
        const bestNP = normalizedPowers[0];
        const estimatedFTP = Math.round(bestNP * 0.95);
        
        ftp_estimated = {
          value: estimatedFTP,
          confidence: normalizedPowers.length >= 4 ? 'high' : 'medium',
          source: `95% of best normalized power (${normalizedPowers.length} efforts)`,
          sample_count: normalizedPowers.length
        };
        console.log(`  ⚡ FTP from NP: ${estimatedFTP}W (from ${bestNP}W NP)`);
      }
    }

    // Priority 3: Use avg power with adjustment factor
    // NP is typically 1.02-1.10× avg power (higher for variable efforts)
    // Using 1.05× as middle ground
    if (!ftp_estimated) {
      const avgPowers = sustainedPowerRides
        .filter(r => r.avg_power && r.avg_power > 50)
        .map(r => r.avg_power)
        .sort((a, b) => b - a);

      if (avgPowers.length >= 2) {
        const bestAvgPower = avgPowers[0];
        // Adjust avg power to approximate NP, then take 95%
        const estimatedFTP = Math.round(bestAvgPower * 1.05 * 0.95);
        
        ftp_estimated = {
          value: estimatedFTP,
          confidence: avgPowers.length >= 5 ? 'medium' : 'low',
          source: `estimated from avg power (${avgPowers.length} efforts)`,
          sample_count: avgPowers.length
        };
        console.log(`  ⚡ FTP from avg power: ${estimatedFTP}W (from ${bestAvgPower}W avg)`);
      }
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

