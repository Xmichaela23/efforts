/**
 * =============================================================================
 * ANALYZE-WORKOUT EDGE FUNCTION
 * =============================================================================
 * 
 * PURPOSE: Generate immediate post-workout analysis using granular sample data
 * 
 * WHAT IT DOES:
 * - Analyzes a single completed workout using raw sensor samples
 * - Calculates execution grade based on pace/power consistency and HR drift
 * - Generates quick AI insights (3 bullets, max 60 words)
 * - Identifies red flags (poor recovery, extreme variability, etc.)
 * - Stores analysis in workout record for future reference
 * 
 * INPUT: { workout_id: string }
 * 
 * OUTPUT: {
 *   execution_grade: string,           // "A+", "A", "B+", "C", "F"
 *   quick_insights: string[],          // 3 actionable bullet points
 *   key_metrics: {
 *     power_distribution: {...},       // Power zones, variability, NP
 *     hr_responsiveness: {...},        // HR drift, recovery rate
 *     pace_variability: {...},         // Consistency score, pace range
 *     normalized_metrics: {...},       // TSS, intensity factor
 *     intensity_analysis: {...}        // High/moderate/low classification
 *   },
 *   red_flags: string[]                // Warning signs to address
 * }
 * 
 * KEY FEATURES:
 * - Uses sensor_data.samples for granular analysis (not workout averages)
 * - Calculates pace/power variability from actual samples
 * - Analyzes HR drift and recovery patterns
 * - Determines intensity from power zones or HR zones
 * - Provides immediate feedback after workout completion
 * - Stores results in database for historical tracking
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const payload = await req.json();
    const { workout_id } = payload;

    if (!workout_id) {
      return new Response(JSON.stringify({
        error: 'workout_id is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`Analyzing workout ${workout_id}`);

    // Get workout with full sensor data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select('*, sensor_data, computed')
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }

    // Get user baselines
    const { data: baselinesData, error: baselinesError } = await supabase
      .from('user_baselines')
      .select('baselines')
      .eq('user_id', workout.user_id)
      .single();

    const userBaselines = baselinesData?.baselines || {};

    console.log(`Analyzing ${workout.type} workout with ${workout.sensor_data?.samples?.length || 0} samples`);

    // Analyze using granular sample data
    const analysis = analyzeWorkoutWithSamples(workout, userBaselines);

    // Calculate execution grade
    const grade = calculateExecutionGrade(workout, analysis);

    // Generate quick insights (GPT-4 with SHORT response)
    const insights = await generateQuickInsights(workout, analysis, userBaselines);

    // Identify red flags
    const redFlags = identifyRedFlags(analysis);

    const result = {
      execution_grade: grade,
      quick_insights: insights,
      key_metrics: extractKeyMetrics(analysis),
      red_flags: redFlags
    };

    // Store analysis in workout record for future reference
    await supabase
      .from('workouts')
      .update({ 
        workout_analysis: result,
        updated_at: new Date().toISOString()
      })
      .eq('id', workout_id);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Analyze workout error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

/**
 * =============================================================================
 * ANALYZE WORKOUT WITH SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze a single workout using granular sensor data samples
 * 
 * WHAT IT DOES:
 * - Extracts sensor_data.samples from the workout
 * - Delegates to specific analysis functions based on workout type
 * - Analyzes pace variability, power distribution, HR responsiveness
 * - Calculates normalized power and intensity analysis
 * - Falls back to computed data if no sensor samples available
 * 
 * INPUT: 
 * - workout: Single workout with sensor_data and computed fields
 * - userBaselines: User's fitness baselines (FTP, 5K pace, max HR)
 * 
 * OUTPUT: Comprehensive analysis object with all metrics and distributions
 */
function analyzeWorkoutWithSamples(workout: any, userBaselines: any): any {
  const sensorData = workout.sensor_data?.samples || [];
  const computed = typeof workout.computed === 'string' ? JSON.parse(workout.computed) : workout.computed;
  
  console.log(`Processing ${sensorData.length} sensor samples for ${workout.type} workout`);

  if (sensorData.length === 0) {
    console.log('No sensor data available, using computed data only');
    return analyzeWorkoutFromComputed(workout, computed, userBaselines);
  }

  const analysis = {
    power_distribution: null,
    hr_responsiveness: null,
    pace_variability: null,
    normalized_metrics: null,
    intensity_analysis: null
  };

  // Analyze based on workout type
  if (workout.type === 'run' || workout.type === 'running') {
    analysis.pace_variability = analyzePaceVariability(sensorData, computed);
    analysis.hr_responsiveness = analyzeHRResponsiveness(sensorData, computed);
    analysis.intensity_analysis = analyzeRunIntensity(sensorData, computed, userBaselines);
  } else if (workout.type === 'ride' || workout.type === 'cycling' || workout.type === 'bike') {
    analysis.power_distribution = analyzePowerDistribution(sensorData, computed, userBaselines);
    analysis.hr_responsiveness = analyzeHRResponsiveness(sensorData, computed);
    analysis.normalized_metrics = calculateNormalizedPower(sensorData, userBaselines);
    analysis.intensity_analysis = analyzeBikeIntensity(sensorData, computed, userBaselines);
  } else if (workout.type === 'swim' || workout.type === 'swimming') {
    analysis.hr_responsiveness = analyzeHRResponsiveness(sensorData, computed);
    analysis.intensity_analysis = analyzeSwimIntensity(sensorData, computed, userBaselines);
  }

  return analysis;
}

/**
 * =============================================================================
 * ANALYZE PACE VARIABILITY
 * =============================================================================
 * 
 * PURPOSE: Calculate pace consistency and variability from sensor samples
 * 
 * WHAT IT DOES:
 * - Extracts pace samples from sensor_data.samples (speedMetersPerSecond)
 * - Converts speed to seconds per mile for pace analysis
 * - Calculates average, fastest, and slowest paces
 * - Computes variability percentage and consistency score
 * - Returns pace range and consistency metrics
 * 
 * INPUT: 
 * - sensorData: Array of sensor samples with speed data
 * - computed: Computed workout data (fallback)
 * 
 * OUTPUT: Object with consistency_score, variability_percent, pace_range
 */
function analyzePaceVariability(sensorData: any[], computed: any): any {
  const paceSamples = sensorData
    .map(s => {
      if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
        return (1000 / s.speedMetersPerSecond) * 60; // Convert to seconds per mile
      }
      return null;
    })
    .filter(p => p !== null);

  if (paceSamples.length === 0) {
    return {
      consistency_score: null,
      variability_percent: null,
      pace_range: null
    };
  }

  const avgPace = paceSamples.reduce((sum, p) => sum + p, 0) / paceSamples.length;
  const maxPace = Math.min(...paceSamples); // Fastest pace
  const minPace = Math.max(...paceSamples); // Slowest pace
  const variability = calculateVariability(paceSamples);
  const variabilityPercent = (variability / avgPace) * 100;

  return {
    consistency_score: Math.max(0, 100 - variabilityPercent),
    variability_percent: Math.round(variabilityPercent * 10) / 10,
    pace_range: {
      avg: secondsToPace(avgPace),
      fastest: secondsToPace(maxPace),
      slowest: secondsToPace(minPace)
    }
  };
}

/**
 * =============================================================================
 * ANALYZE POWER DISTRIBUTION
 * =============================================================================
 * 
 * PURPOSE: Calculate power zones and distribution from sensor samples
 * 
 * WHAT IT DOES:
 * - Extracts power samples from sensor_data.samples (power/powerInWatts)
 * - Calculates average, maximum, and minimum power values
 * - Computes power variability (max/avg ratio)
 * - Calculates time spent in each power zone (1-5) based on FTP
 * - Returns comprehensive power analysis for bike workouts
 * 
 * INPUT: 
 * - sensorData: Array of sensor samples with power data
 * - computed: Computed workout data (fallback)
 * - userBaselines: User's FTP baseline for zone calculations
 * 
 * OUTPUT: Object with avg_power, max_power, power_variability, time_in_zones
 */
function analyzePowerDistribution(sensorData: any[], computed: any, userBaselines: any): any {
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  if (powerSamples.length === 0) {
    return {
      avg_power: null,
      max_power: null,
      power_variability: null,
      time_in_zones: null
    };
  }

  const avgPower = powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length;
  const maxPower = Math.max(...powerSamples);
  const minPower = Math.min(...powerSamples);
  const powerVariability = maxPower / avgPower;

  // Calculate time in power zones
  const timeInZones = calculatePowerZones(powerSamples, userBaselines.ftp);

  return {
    avg_power: Math.round(avgPower),
    max_power: maxPower,
    min_power: minPower,
    power_variability: Math.round(powerVariability * 100) / 100,
    time_in_zones: timeInZones
  };
}

/**
 * Analyze HR responsiveness from sensor data
 */
function analyzeHRResponsiveness(sensorData: any[], computed: any): any {
  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (hrSamples.length === 0) {
    return {
      avg_hr: null,
      max_hr: null,
      hr_drift_percent: null,
      recovery_rate: null
    };
  }

  const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
  const maxHR = Math.max(...hrSamples);
  const hrDrift = calculateHRDrift(hrSamples);

  // Calculate recovery rate (if we have enough data)
  let recoveryRate: number | null = null;
  if (hrSamples.length > 30) {
    const last30Seconds = hrSamples.slice(-30);
    const first30Seconds = hrSamples.slice(0, 30);
    const endAvg = last30Seconds.reduce((sum, hr) => sum + hr, 0) / last30Seconds.length;
    const startAvg = first30Seconds.reduce((sum, hr) => sum + hr, 0) / first30Seconds.length;
    recoveryRate = Math.round(startAvg - endAvg);
  }

  return {
    avg_hr: Math.round(avgHR),
    max_hr: maxHR,
    hr_drift_percent: Math.round(hrDrift * 10) / 10,
    recovery_rate: recoveryRate
  };
}

/**
 * Calculate normalized power from sensor data
 */
function calculateNormalizedPower(sensorData: any[], userBaselines: any): any {
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  if (powerSamples.length === 0) {
    return {
      normalized_power: null,
      intensity_factor: null,
      training_stress_score: null
    };
  }

  // Calculate 30-second rolling average
  const rollingAverages = [];
  for (let i = 0; i < powerSamples.length - 29; i++) {
    const window = powerSamples.slice(i, i + 30);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAverages.push(avg);
  }

  // Calculate 4th power average (normalized power approximation)
  const fourthPowerSum = rollingAverages.reduce((sum, p) => sum + Math.pow(p, 4), 0);
  const normalizedPower = Math.pow(fourthPowerSum / rollingAverages.length, 0.25);

  // Calculate intensity factor and TSS
  const intensityFactor = userBaselines.ftp ? normalizedPower / userBaselines.ftp : null;
  const durationHours = powerSamples.length / 3600; // Assuming 1 sample per second
  const trainingStressScore = intensityFactor ? Math.round(intensityFactor * intensityFactor * durationHours * 100) : null;

  return {
    normalized_power: Math.round(normalizedPower),
    intensity_factor: intensityFactor ? Math.round(intensityFactor * 1000) / 1000 : null,
    training_stress_score: trainingStressScore
  };
}

/**
 * Analyze run intensity from sensor data
 */
function analyzeRunIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  const paceSamples = sensorData
    .map(s => {
      if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
        return (1000 / s.speedMetersPerSecond) * 60;
      }
      return null;
    })
    .filter(p => p !== null);

  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (paceSamples.length === 0 && hrSamples.length === 0) {
    return { intensity: 'unknown', analysis: 'No data available' };
  }

  let intensity = 'unknown';
  let analysis = 'No data available';

  if (paceSamples.length > 0) {
    const avgPace = paceSamples.reduce((sum, p) => sum + p, 0) / paceSamples.length;
    
    if (userBaselines.fiveK_pace) {
      const baselineSeconds = paceToSeconds(userBaselines.fiveK_pace);
      const pacePercent = (avgPace / baselineSeconds) * 100;
      
      if (pacePercent <= 110) {
        intensity = 'high';
        analysis = `High intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
      } else if (pacePercent <= 130) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
      }
    }
  } else if (hrSamples.length > 0) {
    const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
    
    if (userBaselines.max_hr) {
      const hrPercent = (avgHR / userBaselines.max_hr) * 100;
      
      if (hrPercent >= 85) {
        intensity = 'high';
        analysis = `High intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else if (hrPercent >= 75) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${hrPercent.toFixed(1)}% max HR)`;
      }
    }
  }

  return { intensity, analysis };
}

/**
 * Analyze bike intensity from sensor data
 */
function analyzeBikeIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (powerSamples.length === 0 && hrSamples.length === 0) {
    return { intensity: 'unknown', analysis: 'No data available' };
  }

  let intensity = 'unknown';
  let analysis = 'No data available';

  if (powerSamples.length > 0) {
    const avgPower = powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length;
    const maxPower = Math.max(...powerSamples);
    const powerVariability = maxPower / avgPower;
    
    if (userBaselines.ftp) {
      const ftpPercent = (avgPower / userBaselines.ftp) * 100;
      
      if (ftpPercent >= 90) {
        intensity = 'high';
        analysis = `High intensity (${ftpPercent.toFixed(1)}% of FTP)`;
      } else if (ftpPercent >= 75) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${ftpPercent.toFixed(1)}% of FTP)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${ftpPercent.toFixed(1)}% of FTP)`;
      }
    } else if (powerVariability >= 2.0) {
      intensity = 'high';
      analysis = `High intensity (power variability ${powerVariability.toFixed(2)})`;
    }
  } else if (hrSamples.length > 0) {
    const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
    
    if (userBaselines.max_hr) {
      const hrPercent = (avgHR / userBaselines.max_hr) * 100;
      
      if (hrPercent >= 85) {
        intensity = 'high';
        analysis = `High intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else if (hrPercent >= 75) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${hrPercent.toFixed(1)}% max HR)`;
      }
    }
  }

  return { intensity, analysis };
}

/**
 * Analyze swim intensity from sensor data
 */
function analyzeSwimIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (hrSamples.length === 0) {
    return { intensity: 'unknown', analysis: 'No data available' };
  }

  const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
  
  let intensity = 'unknown';
  let analysis = 'No data available';

  if (userBaselines.max_hr) {
    const hrPercent = (avgHR / userBaselines.max_hr) * 100;
    
    if (hrPercent >= 85) {
      intensity = 'high';
      analysis = `High intensity (${hrPercent.toFixed(1)}% max HR)`;
    } else if (hrPercent >= 75) {
      intensity = 'moderate';
      analysis = `Moderate intensity (${hrPercent.toFixed(1)}% max HR)`;
    } else {
      intensity = 'low';
      analysis = `Low intensity (${hrPercent.toFixed(1)}% max HR)`;
    }
  }

  return { intensity, analysis };
}

/**
 * Fallback analysis using computed data only
 */
function analyzeWorkoutFromComputed(workout: any, computed: any, userBaselines: any): any {
  return {
    power_distribution: workout.avg_power ? {
      avg_power: workout.avg_power,
      max_power: workout.max_power,
      power_variability: workout.max_power && workout.avg_power ? workout.max_power / workout.avg_power : null
    } : null,
    hr_responsiveness: workout.avg_heart_rate ? {
      avg_hr: workout.avg_heart_rate,
      max_hr: workout.max_heart_rate,
      hr_drift_percent: null,
      recovery_rate: null
    } : null,
    pace_variability: computed?.overall?.avg_pace_s_per_mi ? {
      consistency_score: null,
      variability_percent: null,
      pace_range: {
        avg: secondsToPace(computed.overall.avg_pace_s_per_mi),
        fastest: null,
        slowest: null
      }
    } : null,
    normalized_metrics: workout.normalized_power ? {
      normalized_power: workout.normalized_power,
      intensity_factor: workout.intensity_factor,
      training_stress_score: workout.tss
    } : null,
    intensity_analysis: { intensity: 'unknown', analysis: 'Limited data available' }
  };
}

/**
 * =============================================================================
 * CALCULATE EXECUTION GRADE
 * =============================================================================
 * 
 * PURPOSE: Calculate overall workout execution grade based on analysis metrics
 * 
 * WHAT IT DOES:
 * - Starts with base score of 100 points
 * - Deducts points for poor adherence to planned workout
 * - Deducts points for poor pace/power consistency
 * - Deducts points for high HR drift (poor pacing)
 * - Deducts points for extreme power variability
 * - Converts final score to letter grade (A+ to F)
 * 
 * INPUT: 
 * - workout: Workout with computed execution data
 * - analysis: Comprehensive analysis object with all metrics
 * 
 * OUTPUT: Letter grade string ("A+", "A", "B+", "C", "F", etc.)
 */
function calculateExecutionGrade(workout: any, analysis: any): string {
  let score = 100;

  // Check adherence to planned workout
  if (workout.computed?.execution_score) {
    const adherence = workout.computed.execution_score;
    if (adherence < 80) score -= 20;
    else if (adherence < 90) score -= 10;
    else if (adherence >= 95) score += 5;
  }

  // Check consistency
  if (analysis.pace_variability?.consistency_score) {
    const consistency = analysis.pace_variability.consistency_score;
    if (consistency < 70) score -= 15;
    else if (consistency < 80) score -= 10;
    else if (consistency >= 90) score += 5;
  }

  // Check HR drift
  if (analysis.hr_responsiveness?.hr_drift_percent) {
    const drift = analysis.hr_responsiveness.hr_drift_percent;
    if (drift > 10) score -= 15;
    else if (drift > 5) score -= 10;
    else if (drift < 2) score += 5;
  }

  // Check power variability for bikes
  if (analysis.power_distribution?.power_variability) {
    const variability = analysis.power_distribution.power_variability;
    if (variability > 3.0) score -= 10; // Too much variability
    else if (variability < 1.5 && workout.type !== 'ride') score -= 5; // Too steady for intervals
  }

  // Convert score to grade
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 45) return 'D';
  return 'F';
}

/**
 * Generate quick insights using GPT-4
 */
async function generateQuickInsights(workout: any, analysis: any, userBaselines: any): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return ['Analysis completed', 'Check metrics below', 'No AI insights available'];
  }

  try {
    const prompt = `Analyze this ${workout.type} workout:

EXECUTION:
- Adherence: ${workout.computed?.execution_score || 'N/A'}%
- Duration: ${workout.duration || 'N/A'} minutes
- Distance: ${workout.distance || 'N/A'} km

QUALITY:
${analysis.pace_variability ? `- Pace consistency: ${analysis.pace_variability.consistency_score || 'N/A'}%` : ''}
${analysis.power_distribution ? `- Power variability: ${analysis.power_distribution.power_variability || 'N/A'}` : ''}
${analysis.hr_responsiveness ? `- HR drift: ${analysis.hr_responsiveness.hr_drift_percent || 'N/A'}%` : ''}

INTENSITY:
- Analysis: ${analysis.intensity_analysis?.analysis || 'Unknown'}

Provide 3 bullets:
1. Overall execution quality
2. Key strength
3. One thing to watch

Max 60 words total.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Generate quick workout insights. Be concise. No emojis. Direct language only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Parse bullets from response
    const bullets = content.split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 3);

    return bullets.length > 0 ? bullets : ['Analysis completed', 'Check metrics below', 'Review performance data'];

  } catch (error) {
    console.error('GPT-4 error:', error);
    return ['Analysis completed', 'Check metrics below', 'AI insights unavailable'];
  }
}

/**
 * Identify red flags in the analysis
 */
function identifyRedFlags(analysis: any): string[] {
  const flags: string[] = [];

  // HR drift red flags
  if (analysis.hr_responsiveness?.hr_drift_percent && analysis.hr_responsiveness.hr_drift_percent > 15) {
    flags.push('High HR drift (>15%) - possible dehydration or overexertion');
  }

  // Power variability red flags
  if (analysis.power_distribution?.power_variability && analysis.power_distribution.power_variability > 4.0) {
    flags.push('Extreme power variability (>4.0) - check pacing strategy');
  }

  // Pace consistency red flags
  if (analysis.pace_variability?.consistency_score && analysis.pace_variability.consistency_score < 60) {
    flags.push('Poor pace consistency (<60%) - focus on pacing');
  }

  // Recovery rate red flags
  if (analysis.hr_responsiveness?.recovery_rate && analysis.hr_responsiveness.recovery_rate < 10) {
    flags.push('Poor HR recovery (<10 bpm) - may need more rest');
  }

  return flags;
}

/**
 * Extract key metrics for display
 */
function extractKeyMetrics(analysis: any): any {
  return {
    power_distribution: analysis.power_distribution,
    hr_responsiveness: analysis.hr_responsiveness,
    pace_variability: analysis.pace_variability,
    normalized_metrics: analysis.normalized_metrics,
    intensity_analysis: analysis.intensity_analysis
  };
}

/**
 * Calculate power zones from samples
 */
function calculatePowerZones(powerSamples: number[], ftp: number): any {
  if (!ftp || powerSamples.length === 0) {
    return null;
  }

  const zones = {
    zone1: 0, // < 55% FTP
    zone2: 0, // 55-75% FTP
    zone3: 0, // 75-90% FTP
    zone4: 0, // 90-105% FTP
    zone5: 0  // > 105% FTP
  };

  powerSamples.forEach((power: number) => {
    const percent = (power / ftp) * 100;
    if (percent < 55) zones.zone1++;
    else if (percent < 75) zones.zone2++;
    else if (percent < 90) zones.zone3++;
    else if (percent < 105) zones.zone4++;
    else zones.zone5++;
  });

  // Convert to percentages
  const total = powerSamples.length;
  return {
    zone1: Math.round((zones.zone1 / total) * 100),
    zone2: Math.round((zones.zone2 / total) * 100),
    zone3: Math.round((zones.zone3 / total) * 100),
    zone4: Math.round((zones.zone4 / total) * 100),
    zone5: Math.round((zones.zone5 / total) * 100)
  };
}

// Helper functions
function calculateVariability(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateHRDrift(hrSamples: number[]): number {
  if (hrSamples.length < 10) return 0;
  const firstHalf = hrSamples.slice(0, Math.floor(hrSamples.length / 2));
  const secondHalf = hrSamples.slice(Math.floor(hrSamples.length / 2));
  const firstAvg = firstHalf.reduce((sum, hr) => sum + hr, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, hr) => sum + hr, 0) / secondHalf.length;
  return ((secondAvg - firstAvg) / firstAvg) * 100;
}

function paceToSeconds(pace: string): number {
  const [minutes, seconds] = pace.split(':').map(Number);
  return minutes * 60 + seconds;
}

function secondsToPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}