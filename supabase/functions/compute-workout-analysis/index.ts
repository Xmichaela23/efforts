// Supabase Edge Function: compute-workout-analysis
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANALYSIS_VERSION = 'v0.1.8'; // elevation + NP + swim pace (no sample timeout)

function smoothEMA(values: (number|null)[], alpha = 0.25): (number|null)[] {
  let ema: number | null = null;
  const out: (number|null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      ema = ema == null ? v : alpha * v + (1 - alpha) * ema;
      out[i] = ema;
    } else {
      out[i] = ema; // hold last for continuity; UI can still smooth further
    }
  }
  return out;
}

// =============================================================================
// GRANULAR ADHERENCE ANALYSIS FUNCTIONS
// =============================================================================

interface PrescribedRange {
  lower: number;
  upper: number;
}

interface PlannedInterval {
  type: string;
  duration_s: number;
  pace_range?: PrescribedRange;
  power_range?: PrescribedRange;
}

interface ExecutedInterval {
  start_time_s: number;
  end_time_s: number;
  samples: Array<{
    time_s: number;
    pace_s_per_km?: number;
    power_w?: number;
    hr_bpm?: number;
  }>;
}

interface IntervalAnalysis {
  interval_type: string;
  prescribed_range: PrescribedRange;
  average_value: number;
  adherence_percentage: number;
  time_in_range_s: number;
  time_outside_range_s: number;
  issues: string[];
  grade: string;
}

interface PrescribedRangeAdherence {
  overallAdherence: number;
  timeInRange: number;
  timeOutsideRange: number;
  intervalAnalysis: IntervalAnalysis[];
  executionGrade: string;
  primaryIssues: string[];
  strengths: string[];
}

function calculatePrescribedRangeAdherence(
  executedIntervals: ExecutedInterval[],
  plannedIntervals: PlannedInterval[],
  overallMetrics: any
): PrescribedRangeAdherence {
  console.log('🔍 Starting granular adherence analysis...');
  console.log('📊 Executed intervals:', executedIntervals.length);
  console.log('📋 Planned intervals:', plannedIntervals.length);

  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  const intervalAnalysis: IntervalAnalysis[] = [];

  // Process each planned interval
  for (let i = 0; i < plannedIntervals.length; i++) {
    const planned = plannedIntervals[i];
    const executed = executedIntervals[i];

    if (!executed || !planned) {
      console.log(`⚠️ Skipping interval ${i} - missing data`);
      continue;
    }

    // Determine which metric to analyze (pace or power)
    const prescribedRange = planned.pace_range || planned.power_range;
    if (!prescribedRange) {
      console.log(`⚠️ Skipping interval ${i} - no prescribed range`);
      continue;
    }

    const metricType = planned.pace_range ? 'pace' : 'power';
    console.log(`📈 Analyzing interval ${i} (${planned.type}) - ${metricType} range: ${prescribedRange.lower}-${prescribedRange.upper}`);

    // Calculate adherence for this interval
    const intervalResult = calculateIntervalAdherence(executed, prescribedRange, metricType);
    
    intervalAnalysis.push({
      interval_type: planned.type,
      prescribed_range: prescribedRange,
      average_value: intervalResult.averageValue,
      adherence_percentage: intervalResult.adherencePercentage,
      time_in_range_s: intervalResult.timeInRange,
      time_outside_range_s: intervalResult.timeOutsideRange,
      issues: intervalResult.issues,
      grade: intervalResult.grade
    });

    totalTimeInRange += intervalResult.timeInRange;
    totalTimeOutsideRange += intervalResult.timeOutsideRange;

    console.log(`✅ Interval ${i} complete: ${intervalResult.adherencePercentage.toFixed(1)}% adherence, grade: ${intervalResult.grade}`);
  }

  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const overallAdherence = totalTime > 0 ? totalTimeInRange / totalTime : 0;

  console.log('📊 Overall adherence calculation:', {
    timeInRange: totalTimeInRange,
    timeOutsideRange: totalTimeOutsideRange,
    totalTime,
    adherence: overallAdherence
  });

  return {
    overallAdherence,
    timeInRange: totalTimeInRange,
    timeOutsideRange: totalTimeOutsideRange,
    intervalAnalysis,
    executionGrade: calculateHonestGrade(overallAdherence),
    primaryIssues: identifyPrimaryIssues(intervalAnalysis),
    strengths: identifyStrengths(intervalAnalysis)
  };
}

function calculateIntervalAdherence(
  executed: ExecutedInterval,
  prescribedRange: PrescribedRange,
  metricType: 'pace' | 'power'
): {
  averageValue: number;
  adherencePercentage: number;
  timeInRange: number;
  timeOutsideRange: number;
  issues: string[];
  grade: string;
} {
  let timeInRange = 0;
  let timeOutsideRange = 0;
  let totalValue = 0;
  let validSamples = 0;

  const samples = executed.samples || [];
  console.log(`🔍 Processing ${samples.length} samples for interval`);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const value = metricType === 'pace' ? sample.pace_s_per_km : sample.power_w;
    
    if (value === undefined || value === null) continue;

    // Convert pace to seconds per km if needed (assuming input is in seconds per mile)
    const normalizedValue = metricType === 'pace' ? value * 1.60934 : value;
    
    // Check if value is realistic
    if (metricType === 'pace' && (normalizedValue < 180 || normalizedValue > 1200)) {
      console.log(`⚠️ Skipping unrealistic pace: ${normalizedValue}s/km`);
      continue;
    }
    if (metricType === 'power' && (normalizedValue < 50 || normalizedValue > 1000)) {
      console.log(`⚠️ Skipping unrealistic power: ${normalizedValue}W`);
      continue;
    }

    totalValue += normalizedValue;
    validSamples++;

    // Calculate sample duration
    const nextSample = samples[i + 1];
    const sampleDuration = nextSample ? 
      Math.min(nextSample.time_s - sample.time_s, 10) : // Cap at 10 seconds
      1; // Default 1 second for last sample

    // Check if value is in prescribed range
    const isInRange = normalizedValue >= prescribedRange.lower && normalizedValue <= prescribedRange.upper;
    
    if (isInRange) {
      timeInRange += sampleDuration;
    } else {
      timeOutsideRange += sampleDuration;
    }
  }

  const averageValue = validSamples > 0 ? totalValue / validSamples : 0;
  const totalTime = timeInRange + timeOutsideRange;
  const adherencePercentage = totalTime > 0 ? timeInRange / totalTime : 0;

  const issues = identifyIntervalIssues(adherencePercentage, averageValue, prescribedRange, metricType);
  const grade = calculateIntervalGrade(adherencePercentage, executed);

  return {
    averageValue,
    adherencePercentage,
    timeInRange,
    timeOutsideRange,
    issues,
    grade
  };
}

function identifyIntervalIssues(
  adherence: number,
  averageValue: number,
  prescribedRange: PrescribedRange,
  metricType: 'pace' | 'power'
): string[] {
  const issues: string[] = [];
  
  if (adherence < 0.5) {
    issues.push('very_poor_adherence');
  } else if (adherence < 0.7) {
    issues.push('poor_adherence');
  }

  if (averageValue < prescribedRange.lower) {
    issues.push(metricType === 'pace' ? 'too_fast' : 'too_high_power');
  } else if (averageValue > prescribedRange.upper) {
    issues.push(metricType === 'pace' ? 'too_slow' : 'too_low_power');
  }

  return issues;
}

function calculateIntervalGrade(adherence: number, executed: ExecutedInterval): string {
  if (adherence >= 0.9) return 'A';
  if (adherence >= 0.8) return 'B';
  if (adherence >= 0.7) return 'C';
  if (adherence >= 0.6) return 'D';
  return 'F';
}

function calculateHonestGrade(overallAdherence: number): string {
  if (overallAdherence >= 0.9) return 'A';
  if (overallAdherence >= 0.8) return 'B';
  if (overallAdherence >= 0.7) return 'C';
  if (overallAdherence >= 0.6) return 'D';
  return 'F';
}

function identifyPrimaryIssues(intervalAnalysis: IntervalAnalysis[]): string[] {
  const issues: string[] = [];
  
  // Check for consistently too fast
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work');
  const tooFastCount = workIntervals.filter(i => i.issues.includes('too_fast')).length;
  if (tooFastCount > workIntervals.length / 2) {
    issues.push('Consistently too fast in work intervals');
  }

  // Check for fading
  const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
  const fadingCount = lastThird.filter(i => i.adherence_percentage < 0.7).length;
  if (fadingCount > lastThird.length / 2) {
    issues.push('Fading in final intervals - consider reducing target pace');
  }

  // Check for poor recovery
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  const poorRecoveryCount = recoveryIntervals.filter(i => i.adherence_percentage < 0.6).length;
  if (poorRecoveryCount > recoveryIntervals.length / 2) {
    issues.push('Poor recovery discipline - not slowing down enough');
  }

  return issues;
}

function identifyStrengths(intervalAnalysis: IntervalAnalysis[]): string[] {
  const strengths: string[] = [];
  
  // Check for strong finish
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work');
  const lastInterval = workIntervals[workIntervals.length - 1];
  if (lastInterval && lastInterval.adherence_percentage >= 0.8) {
    strengths.push('Strong finish - maintained pace through final interval');
  }

  // Check for consistent execution
  const consistentIntervals = workIntervals.filter(i => i.adherence_percentage >= 0.8).length;
  if (consistentIntervals >= workIntervals.length * 0.8) {
    strengths.push('Excellent consistency across all work intervals');
  }

  // Check for good recovery discipline
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  const goodRecoveryCount = recoveryIntervals.filter(i => i.adherence_percentage >= 0.7).length;
  if (goodRecoveryCount >= recoveryIntervals.length * 0.8) {
    strengths.push('Good recovery discipline - properly slowed down between intervals');
  }

  return strengths;
}

function parseTimeToSeconds(timeStr: string): number {
  // Parse time strings like "15:00", "1:30", "45" (seconds)
  if (!timeStr) return 300; // Default 5 minutes
  
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // Format: "15:00" (minutes:seconds)
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 1) {
    // Format: "45" (seconds) or "15" (minutes)
    const num = parseInt(parts[0]);
    return num > 60 ? num : num * 60; // Assume minutes if > 60
  }
  
  return 300; // Default 5 minutes
}

// Long run analysis for pace consistency, negative splits, and drift
function analyzeLongRun(computed: any, plannedInterval: any) {
  console.log('🏃 Analyzing long run...');
  
  const intervals = computed.analysis?.intervals || [];
  if (intervals.length === 0) {
    return {
      paceConsistency: 0,
      timeInRange: 0,
      timeOutsideRange: 0,
      segments: [],
      grade: 'F',
      issues: ['No interval data available'],
      strengths: []
    };
  }
  
  // Extract pace data from intervals
  const paceData = intervals.map((interval: any) => ({
    time: interval.start_time || 0,
    pace: interval.avg_pace || 0,
    duration: interval.duration || 0
  })).filter(d => d.pace > 0);
  
  if (paceData.length === 0) {
    return {
      paceConsistency: 0,
      timeInRange: 0,
      timeOutsideRange: 0,
      segments: [],
      grade: 'F',
      issues: ['No pace data available'],
      strengths: []
    };
  }
  
  // Calculate pace statistics
  const paces = paceData.map(d => d.pace);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const paceStdDev = Math.sqrt(paces.reduce((sum, pace) => sum + Math.pow(pace - avgPace, 2), 0) / paces.length);
  const paceCV = paceStdDev / avgPace; // Coefficient of variation
  
  // Calculate pace consistency (inverse of CV - lower CV = higher consistency)
  const paceConsistency = Math.max(0, Math.min(1, 1 - paceCV * 2)); // Scale CV to 0-1
  
  // Analyze segments (first 25%, middle 50%, final 25%)
  const totalDuration = paceData.reduce((sum, d) => sum + d.duration, 0);
  const first25Duration = totalDuration * 0.25;
  const middle50Duration = totalDuration * 0.5;
  const final25Duration = totalDuration * 0.25;
  
  let first25Pace = 0, middle50Pace = 0, final25Pace = 0;
  let first25Time = 0, middle50Time = 0, final25Time = 0;
  
  let currentTime = 0;
  for (const segment of paceData) {
    if (currentTime < first25Duration) {
      const segmentTime = Math.min(segment.duration, first25Duration - currentTime);
      first25Pace += segment.pace * segmentTime;
      first25Time += segmentTime;
    } else if (currentTime < first25Duration + middle50Duration) {
      const segmentTime = Math.min(segment.duration, first25Duration + middle50Duration - currentTime);
      middle50Pace += segment.pace * segmentTime;
      middle50Time += segmentTime;
    } else {
      const segmentTime = segment.duration;
      final25Pace += segment.pace * segmentTime;
      final25Time += segmentTime;
    }
    currentTime += segment.duration;
  }
  
  first25Pace = first25Time > 0 ? first25Pace / first25Time : avgPace;
  middle50Pace = middle50Time > 0 ? middle50Pace / middle50Time : avgPace;
  final25Pace = final25Time > 0 ? final25Pace / final25Time : avgPace;
  
  // Calculate negative split (second half faster than first half)
  const firstHalfPace = (first25Pace + middle50Pace) / 2;
  const secondHalfPace = (middle50Pace + final25Pace) / 2;
  const negativeSplit = secondHalfPace < firstHalfPace;
  const splitDifference = Math.abs(secondHalfPace - firstHalfPace) / firstHalfPace;
  
  // Calculate pace drift (final 25% vs middle 50%)
  const paceDrift = (final25Pace - middle50Pace) / middle50Pace;
  const significantDrift = Math.abs(paceDrift) > 0.05; // 5% threshold
  
  // Generate issues and strengths
  const issues: string[] = [];
  const strengths: string[] = [];
  
  if (paceCV > 0.05) {
    issues.push('Pace variability too high - work on steady pacing');
  }
  
  if (paceDrift > 0.05) {
    issues.push('Pace drift detected - consider starting slower');
  } else if (paceDrift < -0.05) {
    issues.push('Significant pace fade - may have started too fast');
  }
  
  if (paceConsistency >= 0.9) {
    strengths.push('Excellent pace consistency throughout');
  }
  
  if (negativeSplit && splitDifference > 0.02) {
    strengths.push('Strong negative split - great pacing discipline');
  }
  
  if (paceCV < 0.03) {
    strengths.push('Very steady pacing - excellent aerobic control');
  }
  
  // Calculate grade based on consistency and execution
  let grade = 'F';
  if (paceConsistency >= 0.9 && !significantDrift) {
    grade = 'A';
  } else if (paceConsistency >= 0.8 && paceDrift < 0.1) {
    grade = 'B';
  } else if (paceConsistency >= 0.7) {
    grade = 'C';
  } else if (paceConsistency >= 0.6) {
    grade = 'D';
  }
  
  // Create segment breakdown
  const segments = [
    {
      segment: 'First 25%',
      pace: first25Pace,
      duration: first25Time,
      grade: first25Pace <= avgPace * 1.05 ? 'A' : 'B'
    },
    {
      segment: 'Middle 50%',
      pace: middle50Pace,
      duration: middle50Time,
      grade: Math.abs(middle50Pace - avgPace) / avgPace < 0.03 ? 'A' : 'B'
    },
    {
      segment: 'Final 25%',
      pace: final25Pace,
      duration: final25Time,
      grade: final25Pace <= avgPace * 1.1 ? 'A' : 'B'
    }
  ];
  
  return {
    paceConsistency,
    timeInRange: totalDuration * paceConsistency,
    timeOutsideRange: totalDuration * (1 - paceConsistency),
    segments,
    grade,
    issues,
    strengths,
    paceCV,
    negativeSplit,
    paceDrift
  };
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Load workout essentials
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id, user_id, type, source, strava_activity_id, garmin_activity_id, gps_track, sensor_data, laps, computed, date, timestamp, swim_data, pool_length, number_of_active_lengths, distance, moving_time')
      .eq('id', workout_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const sport = String(w.type || 'run').toLowerCase();
    
    // Fetch user FTP from performance_numbers JSONB for cycling metrics
    let userFtp: number | null = null;
    try {
      if (w.user_id) {
        const { data: baseline } = await supabase
          .from('user_baselines')
          .select('performance_numbers')
          .eq('user_id', w.user_id)
          .maybeSingle();
        console.log('[FTP] Baseline data:', baseline);
        if (baseline?.performance_numbers) {
          const perfNumbers = typeof baseline.performance_numbers === 'string' 
            ? JSON.parse(baseline.performance_numbers) 
            : baseline.performance_numbers;
          console.log('[FTP] Parsed performance_numbers:', perfNumbers);
          if (perfNumbers?.ftp) {
            userFtp = Number(perfNumbers.ftp);
            console.log('[FTP] Extracted FTP:', userFtp);
          }
        }
      }
    } catch (e) {
      console.error('[FTP] Error fetching FTP:', e);
    }

    // Parse JSON columns if stringified
    function parseJson(val: any) {
      if (val == null) return null;
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return val; }
    }
    let gps = parseJson(w.gps_track) || [];
    let sensorRaw = parseJson(w.sensor_data) || [];
    let sensor = Array.isArray(sensorRaw?.samples) ? sensorRaw.samples : (Array.isArray(sensorRaw) ? sensorRaw : []);
    const laps = parseJson(w.laps) || [];

    // Minimal provider provenance for envelope
    const input = {
      provider: (w.source || '').toLowerCase() || null,
      sourceIds: {
        garminActivityId: w.garmin_activity_id || null,
        stravaActivityId: w.strava_activity_id || null,
      },
      units: { distance: 'm', elevation: 'm', speed: 'mps', pace: 's_per_km', hr: 'bpm', power: 'w' }
    };

    // Load Garmin row for fallback/date correction when available
    let ga: any = null;
    try {
      if ((w as any)?.garmin_activity_id && (w as any)?.user_id) {
        const { data } = await supabase
          .from('garmin_activities')
          .select('sensor_data,samples_data,gps_track,start_time,start_time_offset_seconds,raw_data')
          .eq('user_id', (w as any).user_id)
          .eq('garmin_activity_id', (w as any).garmin_activity_id)
          .maybeSingle();
        ga = data || null;
      }
    } catch {}

    // Correct workouts.date to provider-local date (prefer explicit local seconds if present)
    try {
      const tsIso: string | null = (w as any)?.timestamp || null;
      let expectedLocal: string | null = null;
      if (ga) {
        // Fallback: parse from raw_data if columns are not present
        try {
          const raw = parseJson(ga.raw_data) || {};
          const gSummary = raw?.summary || raw;
          const gIn = Number(gSummary?.startTimeInSeconds ?? raw?.startTimeInSeconds);
          const gOff = Number(gSummary?.startTimeOffsetInSeconds ?? raw?.startTimeOffsetInSeconds ?? ga.start_time_offset_seconds);
          if (Number.isFinite(gIn) && Number.isFinite(gOff)) {
            expectedLocal = new Date((gIn + gOff) * 1000).toISOString().split('T')[0];
          } else if (ga.start_time && Number.isFinite(ga.start_time_offset_seconds)) {
            expectedLocal = new Date(Date.parse(ga.start_time) + Number(ga.start_time_offset_seconds) * 1000).toISOString().split('T')[0];
          }
        } catch {}
      } else if (tsIso) {
        // As a last resort, treat timestamp as local already
        try { expectedLocal = new Date(tsIso).toISOString().split('T')[0]; } catch {}
      }
      if (expectedLocal && expectedLocal !== (w as any)?.date) {
        await supabase.from('workouts').update({ date: expectedLocal }).eq('id', (w as any).id);
      }
    } catch {}

    // If workouts JSON is empty, fall back to Garmin heavy JSON
    if (((sensor?.length ?? 0) < 2) && ((gps?.length ?? 0) < 2) && ga) {
      const sRaw = parseJson(ga.sensor_data) || parseJson(ga.samples_data) || [];
      sensor = Array.isArray(sRaw?.samples) ? sRaw.samples : (Array.isArray(sRaw) ? sRaw : []);
      gps = parseJson(ga.gps_track) || [];
    }

  // Build minimal provider-agnostic analysis rows (time, dist, elev, hr, cadences, power, speed)
  function normalizeSamples(samplesIn: any[]): Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> {
    const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> = [];
      for (let i=0;i<samplesIn.length;i+=1) {
        const s = samplesIn[i] || {} as any;
        const t = Number(
          s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? s.startTimeInSeconds ?? i
        );
        const d = Number(
          s.totalDistanceInMeters ?? s.distanceInMeters ?? s.cumulativeDistanceInMeters ?? s.totalDistance ?? s.distance
        );
        const elev = (typeof s.elevationInMeters === 'number' && s.elevationInMeters) || (typeof s.altitudeInMeters === 'number' && s.altitudeInMeters) || (typeof s.altitude === 'number' && s.altitude) || undefined;
        const hr = (typeof s.heartRate === 'number' && s.heartRate) || (typeof s.heart_rate === 'number' && s.heart_rate) || (typeof s.heartRateInBeatsPerMinute === 'number' && s.heartRateInBeatsPerMinute) || undefined;
      const cad_spm = (typeof s.stepsPerMinute === 'number' && s.stepsPerMinute) || (typeof s.runCadence === 'number' && s.runCadence) || undefined;
      // Bike cadence commonly lives in bikeCadenceInRPM/bikeCadence/cadence
      const cad_rpm = (typeof s.bikeCadenceInRPM === 'number' && s.bikeCadenceInRPM)
        || (typeof s.bikeCadence === 'number' && s.bikeCadence)
        || (typeof s.cadence === 'number' && s.cadence)
        || undefined;
      const power_w = (typeof s.power === 'number' && s.power) || (typeof s.watts === 'number' && s.watts) || undefined;
      const v_mps = (typeof s.speedMetersPerSecond === 'number' && s.speedMetersPerSecond) || (typeof s.v === 'number' && s.v) || undefined;
      out.push({ t: Number.isFinite(t)?t:i, d: Number.isFinite(d)?d:NaN, elev, hr, cad_spm, cad_rpm, power_w, v_mps });
      }
      out.sort((a,b)=>(a.t||0)-(b.t||0));
      if (!out.length) return out;
      // Fill distance if missing by integrating speed if provided, else leave NaN and fix later
      // Backfill NaNs with previous value
      let lastD = Number.isFinite(out[0].d) ? out[0].d : 0;
      out[0].d = lastD;
      for (let i=1;i<out.length;i+=1) {
        const d = out[i].d;
        if (!Number.isFinite(d) || d < lastD) {
          out[i].d = lastD; // enforce monotonic
        } else {
          lastD = d;
        }
      }
      return out;
    }

    // Build rows from sensor samples; fallback to GPS if needed
    let rows = normalizeSamples(sensor);
    if (rows.length < 2 && Array.isArray(gps) && gps.length > 1) {
      // Fallback: derive time/distance from gps_track
      function haversineMeters(a:any, b:any): number {
        const lat1 = Number(a.lat ?? a.latitudeInDegree ?? a.latitude);
        const lon1 = Number(a.lng ?? a.longitudeInDegree ?? a.longitude);
        const lat2 = Number(b.lat ?? b.latitudeInDegree ?? b.latitude);
        const lon2 = Number(b.lng ?? b.longitudeInDegree ?? b.longitude);
        if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 0;
        const R = 6371000; // m
        const dLat = (lat2-lat1) * Math.PI/180;
        const dLon = (lon2-lon1) * Math.PI/180;
        const sa = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        const c = 2*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa));
        return R*c;
      }
      const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
      let cum = 0;
      const getTs = (p:any) => Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0);
      const tStart = getTs(gps[0]) || 0;
      for (let i=0;i<gps.length;i+=1) {
        if (i>0) cum += haversineMeters(gps[i-1], gps[i]);
        const elev = (typeof gps[i]?.elevation === 'number' ? gps[i].elevation : (typeof gps[i]?.altitude === 'number' ? gps[i].altitude : undefined));
        out.push({ t: Math.max(0, getTs(gps[i]) - tStart), d: cum, elev });
      }
      rows = out;
    }
    // If distance never grows (provider didn't include distance in samples), rebuild from GPS
    if (rows.length >= 2) {
      const totalM = Math.max(0, (rows[rows.length-1].d||0) - (rows[0].d||0));
      if (totalM < 50 && Array.isArray(gps) && gps.length > 1) {
        const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
        let cum = 0; const getTs = (p:any)=>Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0); const tStart = getTs(gps[0]) || 0;
        for (let i=0;i<gps.length;i+=1) {
          if (i>0) cum += ( ()=>{ const a=gps[i-1], b=gps[i]; const lat1=Number(a.lat ?? a.latitudeInDegree ?? a.latitude); const lon1=Number(a.lng ?? a.longitudeInDegree ?? a.longitude); const lat2=Number(b.lat ?? b.latitudeInDegree ?? b.latitude); const lon2=Number(b.lng ?? b.longitudeInDegree ?? b.longitude); if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 0; const R=6371000; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180; const sa=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2; const c=2*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa)); return R*c; })();
          const elev = (typeof gps[i]?.elevation === 'number' ? gps[i].elevation : (typeof gps[i]?.altitude === 'number' ? gps[i].altitude : undefined));
          out.push({ t: Math.max(0, getTs(gps[i]) - tStart), d: cum, elev });
        }
        rows = out;
      }
    }
    // ELEVATION FIX: Merge elevation from GPS into sensor-based rows
    // Sensor data often lacks elevation, but GPS track has it
    if (rows.length >= 2 && Array.isArray(gps) && gps.length > 1) {
      const getTs = (p:any) => Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0);
      const tStart = getTs(gps[0]) || 0;
      
      // Build GPS elevation lookup by timestamp
      const gpsElevByTime = new Map<number, number>();
      for (const g of gps) {
        const t = Math.max(0, getTs(g) - tStart);
        const elev = (typeof g?.elevation === 'number' ? g.elevation : (typeof g?.altitude === 'number' ? g.altitude : undefined));
        if (typeof elev === 'number') {
          gpsElevByTime.set(t, elev);
        }
      }
      
      // Merge elevation into rows by closest timestamp match
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].elev == null) {
          const t = rows[i].t || 0;
          // Find closest GPS timestamp
          let closest = gpsElevByTime.get(t);
          if (closest == null) {
            // Search within ±2 seconds
            for (let dt = 1; dt <= 2 && closest == null; dt++) {
              closest = gpsElevByTime.get(t + dt) ?? gpsElevByTime.get(t - dt);
            }
          }
          if (closest != null) rows[i].elev = closest;
        }
      }
    }
    const hasRows = rows.length >= 2;
    const d0 = hasRows ? (rows[0].d || 0) : 0;
    const t0 = hasRows ? (rows[0].t || 0) : 0;

    // Series
    const time_s: number[] = [];
    const distance_m: number[] = [];
    const elevation_m: (number|null)[] = [];
  const pace_s_per_km: (number|null)[] = [];
    const hr_bpm: (number|null)[] = [];
  const cadence_spm: (number|null)[] = [];
  const cadence_rpm: (number|null)[] = [];
  const power_watts: (number|null)[] = [];
  const speed_mps: (number|null)[] = [];
  const grade_percent: (number|null)[] = [];
    if (hasRows) {
      for (let i=0;i<rows.length;i+=1) {
        const r = rows[i];
        time_s.push(Math.max(0, (r.t||0) - t0));
        distance_m.push(Math.max(0, (r.d||0) - d0));
        elevation_m.push(typeof r.elev === 'number' ? r.elev : null);
        hr_bpm.push(typeof r.hr === 'number' ? r.hr : null);
      cadence_spm.push(typeof r.cad_spm === 'number' ? r.cad_spm : null);
      cadence_rpm.push(typeof r.cad_rpm === 'number' ? r.cad_rpm : null);
      power_watts.push(typeof r.power_w === 'number' ? r.power_w : null);
        if (i>0) {
          const dt = Math.max(0, (rows[i].t||0) - (rows[i-1].t||0));
          const dd = Math.max(0, (rows[i].d||0) - (rows[i-1].d||0));
          const MIN_DD = 2.5; // meters
          if (dt > 0 && dd > MIN_DD) {
            pace_s_per_km.push(dt / (dd / 1000));
          speed_mps.push(dd / dt);
          const de = (typeof rows[i].elev === 'number' ? rows[i].elev : (typeof elevation_m[i] === 'number' ? (elevation_m[i] as number) : null))
                   - (typeof rows[i-1].elev === 'number' ? rows[i-1].elev : (typeof elevation_m[i-1] === 'number' ? (elevation_m[i-1] as number) : null));
          grade_percent.push(typeof de === 'number' && dd > 0 ? (de / dd) * 100 : (grade_percent[grade_percent.length-1] ?? null));
          } else {
            pace_s_per_km.push(pace_s_per_km[pace_s_per_km.length-1] ?? null);
          speed_mps.push(r.v_mps ?? speed_mps[speed_mps.length-1] ?? null);
          grade_percent.push(grade_percent[grade_percent.length-1] ?? null);
          }
        } else {
          pace_s_per_km.push(null);
        speed_mps.push(r.v_mps ?? null);
        grade_percent.push(null);
        }
      }
    }

    // Discipline-specific field visibility: ensure mutually exclusive primary metrics
    const isRide = /ride|bike|cycl/i.test(sport);
    const isRun = /run|walk/i.test(sport);
    try {
      if (isRide && !isRun) {
        // Rides: expose speed_mps and cadence_rpm only
        for (let i = 0; i < pace_s_per_km.length; i++) pace_s_per_km[i] = null;
        for (let i = 0; i < cadence_spm.length; i++) cadence_spm[i] = null;
      } else if (isRun && !isRide) {
        // Runs/Walks: expose pace_s_per_km and cadence_spm only
        for (let i = 0; i < speed_mps.length; i++) speed_mps[i] = null;
        for (let i = 0; i < cadence_rpm.length; i++) cadence_rpm[i] = null;
      }
    } catch {}

    // Normalized Power (NP) calculation for cyclists
    let normalizedPower: number | null = null;
    let intensityFactor: number | null = null;
    let variabilityIndex: number | null = null;
    
    try {
      if (isRide && hasRows && power_watts.some(p => p !== null)) {
        const windowSize = 30; // 30 seconds rolling window
        const rollingAvgs: number[] = [];
        
        for (let i = 0; i < rows.length; i++) {
          const windowStart = Math.max(0, i - windowSize + 1);
          const windowPowers = rows.slice(windowStart, i + 1)
            .map(r => r.power_w)
            .filter((p): p is number => p !== null && !isNaN(p));
          
          if (windowPowers.length > 0) {
            const avgPower = windowPowers.reduce((a, b) => a + b, 0) / windowPowers.length;
            rollingAvgs.push(Math.pow(avgPower, 4));
          }
        }
        
        if (rollingAvgs.length > 0) {
          const avgOfFourthPowers = rollingAvgs.reduce((a, b) => a + b, 0) / rollingAvgs.length;
          normalizedPower = Math.pow(avgOfFourthPowers, 0.25);
          
          // Variability Index: NP / Avg Power
          const powerValues = power_watts.filter((p): p is number => p !== null);
          if (powerValues.length > 0) {
            const avgPower = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
            if (avgPower > 0) {
              variabilityIndex = normalizedPower / avgPower;
            }
          }
          
          // Intensity Factor: NP / FTP (if user has FTP)
          if (userFtp && userFtp > 0) {
            intensityFactor = normalizedPower / userFtp;
          }
        }
      }
    } catch (e) {
      // NP is optional, don't fail
    }

    // Splits helper
    function computeSplits(splitMeters: number) {
      const out: any[] = [];
      if (!hasRows) return out;
      let startIdx = 0;
      let nextTarget = (rows[0].d||0) + splitMeters;
      for (let i=1;i<rows.length;i+=1) {
        if ((rows[i].d||0) >= nextTarget) {
          const s = rows[startIdx]; const e = rows[i];
          const dist_m = Math.max(0, (e.d||0) - (s.d||0));
          const dur_s = Math.max(1, (e.t||0) - (s.t||0));
          const pace = dist_m>0 ? dur_s/(dist_m/1000) : null;
          // Averages
          let hrVals:number[]=[]; let cadVals:number[]=[];
          for (let k=startIdx;k<=i;k+=1) { const h=rows[k].hr; if (typeof h==='number') hrVals.push(h); const c=rows[k].cad; if (typeof c==='number') cadVals.push(c); }
          const avgHr = hrVals.length? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
          const avgCad = cadVals.length? Math.round(cadVals.reduce((a,b)=>a+b,0)/cadVals.length) : null;
          out.push({ n: out.length+1, t0: Math.max(0,(s.t||0)-t0), t1: Math.max(0,(e.t||0)-t0), distance_m: Math.round(dist_m), avgPace_s_per_km: pace!=null? Math.round(pace): null, avgHr_bpm: avgHr, avgCadence_spm: avgCad });
          startIdx = i+1; nextTarget += splitMeters;
        }
      }
      return out;
    }

    // Light smoothing for elevation and pace to reduce noise/spikes
    const elevation_sm = hasRows ? smoothEMA(elevation_m, 0.25) : [];
  const pace_sm = hasRows ? smoothEMA(pace_s_per_km, 0.25) : [];
  const speed_sm = hasRows ? smoothEMA(speed_mps, 0.18) : [];
  const grade_sm = hasRows ? smoothEMA(grade_percent, 0.25) : [];

  const analysis: any = {
      version: ANALYSIS_VERSION,
      computedAt: new Date().toISOString(),
      input,
    // Always return consistent series structure with all 10 fields (even if empty)
    series: {
      time_s: hasRows ? time_s : [],
      distance_m: hasRows ? distance_m : [],
      elevation_m: hasRows ? elevation_sm : [],
      pace_s_per_km: hasRows ? pace_sm : [],
      speed_mps: hasRows ? speed_sm : [],
      hr_bpm: hasRows ? hr_bpm : [],
      cadence_spm: hasRows ? cadence_spm : [],
      cadence_rpm: hasRows ? cadence_rpm : [],
      power_watts: hasRows ? power_watts : [],
      grade_percent: hasRows ? grade_sm : []
    },
      events: {
        laps: Array.isArray(laps) ? laps.slice(0, 50) : [],
        splits: { km: computeSplits(1000), mi: computeSplits(1609.34) }
      },
    zones: {},
      bests: {},
      power: normalizedPower !== null ? {
        normalized_power: Math.round(normalizedPower),
        variability_index: variabilityIndex,
        intensity_factor: intensityFactor
      } : undefined,
      ui: { footnote: `Computed at ${ANALYSIS_VERSION}`, renderHints: { preferPace: sport === 'run' } }
    };

  // Zones histograms (auto-range for HR, FTP-based for power)
  try {
    // Auto-range bins for HR (works well with natural HR ranges)
    const binsFor = (values: (number|null)[], times: number[], n: number) => {
      const vals: number[] = [];
      for (let i=0;i<values.length;i++) if (typeof values[i] === 'number' && Number.isFinite(values[i] as number)) vals.push(values[i] as number);
      if (vals.length < 10) return null;
      const min = Math.min(...vals), max = Math.max(...vals);
      if (!(max>min)) return null;
      const step = (max - min) / n;
      const bins = new Array(n).fill(0);
      for (let i=1;i<times.length && i<values.length;i++) {
        const v = values[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const dt = Math.max(0, times[i] - times[i-1]);
        let idx = Math.floor((v - min) / step);
        if (idx >= n) idx = n - 1;
        if (idx < 0) idx = 0;
        bins[idx] += dt;
      }
      return { bins: bins.map((t_s:number, i:number)=>({ i, t_s, min: Math.round(min + i*step), max: Math.round(min + (i+1)*step) })), schema: 'auto-range' };
    };
    
    // FTP-based bins for power (uses custom boundaries)
    const binsForBoundaries = (values: (number|null)[], times: number[], boundaries: number[]) => {
      const vals: number[] = [];
      for (let i=0;i<values.length;i++) if (typeof values[i] === 'number' && Number.isFinite(values[i] as number)) vals.push(values[i] as number);
      if (vals.length < 10) return null;
      
      const bins = new Array(boundaries.length - 1).fill(0);
      for (let i=1;i<times.length && i<values.length;i++) {
        const v = values[i];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
        const dt = Math.max(0, times[i] - times[i-1]);
        
        // Find which zone this value falls into
        let zoneIdx = -1;
        for (let z=0; z<boundaries.length-1; z++) {
          if (v >= boundaries[z] && v < boundaries[z+1]) {
            zoneIdx = z;
            break;
          }
        }
        // Handle edge case: value equals max boundary
        if (zoneIdx === -1 && v >= boundaries[boundaries.length-2]) {
          zoneIdx = boundaries.length - 2;
        }
        
        if (zoneIdx >= 0 && zoneIdx < bins.length) {
          bins[zoneIdx] += dt;
        }
      }
      
      return { 
        bins: bins.map((t_s:number, i:number)=>({ 
          i, 
          t_s, 
          min: Math.round(boundaries[i]), 
          max: i === bins.length-1 ? Math.round(boundaries[i+1]) : Math.round(boundaries[i+1]) 
        })), 
        schema: 'ftp-based' 
      };
    };
    
    const hrZones = binsFor(hr_bpm, time_s, 5);
    if (hrZones) analysis.zones.hr = hrZones as any;
    
    // Power zones: FTP-based (using userFtp variable extracted earlier)
    const ftpForZones = userFtp || 200;
    console.log('[POWER ZONES] Using FTP:', ftpForZones, '(userFtp was:', userFtp, ')');
    const powerZoneBoundaries = [
      0,
      ftpForZones * 0.55,   // Z1 max: Active Recovery
      ftpForZones * 0.75,   // Z2 max: Endurance
      ftpForZones * 0.90,   // Z3 max: Tempo
      ftpForZones * 1.05,   // Z4 max: Threshold
      ftpForZones * 1.20,   // Z5 max: VO2 Max
      ftpForZones * 1.50,   // Z6 max: Anaerobic
      Infinity              // Z6+ (anything above)
    ];
    console.log('[POWER ZONES] Boundaries:', powerZoneBoundaries.slice(0, -1)); // Omit Infinity
    const pwrZones = binsForBoundaries(power_watts, time_s, powerZoneBoundaries);
    if (pwrZones) analysis.zones.power = pwrZones as any;
  } catch {}

    // --- DISABLED: Swim 100m splits calculation ---
    // Removed because:
    // 1. Causes timeouts/infinite loops on certain data
    // 2. Garmin doesn't provide accurate per-length timing for pool swims
    // 3. Only overall avg pace (calculated below) is reliable from the data we have
    // If splits are needed in the future, would require different data source or algorithm

    // Derive canonical overall for swims and endurance
    const overall = (() => {
      const cPrev = parseJson(w.computed) || {};
      const prevOverall = cPrev?.overall || {};
      const type = String(w.type || '').toLowerCase();
      // Endurance: prefer series totals when available
      if (type !== 'strength') {
        try {
          const distSeries = hasRows ? Number(distance_m[distance_m.length-1]||0) : NaN;
          const timeSeries = hasRows ? Number(time_s[time_s.length-1]||0) : NaN;
          // Swims: ensure non-zero distance
          if (type.includes('swim')) {
            let dist = Number.isFinite(distSeries) && distSeries>0 ? distSeries : null;
            if (!dist) {
              // lengths.sum
              const swim = parseJson((w as any).swim_data) || null;
              const lengths: any[] = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length) {
                const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
                if (sum>0) dist = Math.round(sum);
              }
              if (!dist) {
                const nLen = Number((w as any)?.number_of_active_lengths);
                const poolM = Number((w as any)?.pool_length);
                if (Number.isFinite(nLen) && nLen>0 && Number.isFinite(poolM) && poolM>0) dist = Math.round(nLen*poolM);
              }
            }
            // Extract time from Garmin: for pool swims, use distance/speed or non-uniform lengths
            let dur = null;
            let elapsedDur = null;
            
            // 1) Distance ÷ avg speed (Garmin's avgSpeed is based on moving time!)
            if (ga) {
              try {
                const raw = parseJson(ga.raw_data) || {};
                const summary = raw?.summary || {};
                const distM = Number(summary?.distanceInMeters ?? summary?.totalDistanceInMeters);
                const avgMps = Number(summary?.averageSpeedInMetersPerSecond);
                if (Number.isFinite(distM) && distM > 0 && Number.isFinite(avgMps) && avgMps > 0) {
                  dur = Math.round(distM / avgMps);
                  console.log(`🏊 Using distance/avgSpeed = ${dur}s for moving time`);
                }
              } catch {}
            }
            
            // 2) Try summing swim lengths (only if non-uniform, indicating real Garmin data)
            if (!dur) {
              const swim = parseJson((w as any).swim_data) || null;
              const lengths: any[] = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length > 0) {
                const durs = lengths.map(l => Number(l?.duration_s ?? 0)).filter(d => d > 0);
                if (durs.length) {
                  const min = Math.min(...durs);
                  const max = Math.max(...durs);
                  const essentiallyUniform = durs.length >= 3 && (max - min) <= 1;
                  if (!essentiallyUniform) {
                    const lengthSum = durs.reduce((a,b) => a + b, 0);
                    if (lengthSum > 0) {
                      dur = Math.round(lengthSum);
                      console.log(`🏊 Using sum of ${lengths.length} non-uniform lengths = ${dur}s`);
                    }
                  }
                }
              }
            }
            
            // 3) Extract elapsed time from samples
            if (ga) {
              try {
                const raw = parseJson(ga.raw_data) || {};
                const samples = Array.isArray(raw?.samples) ? raw.samples : [];
                if (samples.length > 0) {
                  const lastSample = samples[samples.length - 1];
                  const clockS = Number(lastSample?.clockDurationInSeconds);
                  if (Number.isFinite(clockS) && clockS > 0) elapsedDur = Math.round(clockS);
                }
              } catch {}
            }
            
            // 4) Fallback: timeSeries or summary duration
            if (!dur) {
              dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries) : null;
            }
            if (!dur && ga) {
              try {
                const raw = parseJson(ga.raw_data) || {};
                const garminDur = Number(raw?.summary?.durationInSeconds ?? raw?.durationInSeconds);
                if (Number.isFinite(garminDur) && garminDur > 0) dur = Math.round(garminDur);
              } catch {}
            }
            
            // Last resort fallback from workouts table fields (already in minutes, convert to seconds)
            if (!dur) {
              const moveMin = Number((w as any)?.moving_time);
              if (Number.isFinite(moveMin) && moveMin > 0) dur = Math.round(moveMin * 60);
            }
            if (!elapsedDur) {
              const elapsedMin = Number((w as any)?.elapsed_time);
              if (Number.isFinite(elapsedMin) && elapsedMin > 0) elapsedDur = Math.round(elapsedMin * 60);
            }
            return {
              ...(prevOverall||{}),
              distance_m: dist || prevOverall?.distance_m || 0,
              duration_s_moving: dur || prevOverall?.duration_s_moving || null,
              duration_s_elapsed: elapsedDur || prevOverall?.duration_s_elapsed || null,
            };
          }
          // Non-swim (runs, rides)
          const dist = Number.isFinite(distSeries) && distSeries>0 ? Math.round(distSeries)
            : (Number((w as any)?.distance)*1000 || prevOverall?.distance_m || null);
          // Extract duration from last sample (same as swims)
          let dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries) : null;
          let elapsedDur = null;

          if (!dur && ga) {
            try {
              const raw = parseJson(ga.raw_data) || {};
              const samples = Array.isArray(raw?.samples) ? raw.samples : [];
              if (samples.length > 0) {
                const lastSample = samples[samples.length - 1];
                const movingS = Number(lastSample?.movingDurationInSeconds);
                const clockS = Number(lastSample?.clockDurationInSeconds);
                if (Number.isFinite(movingS) && movingS > 0) dur = Math.round(movingS);
                if (Number.isFinite(clockS) && clockS > 0) elapsedDur = Math.round(clockS);
              }
              // Fallback to summary (even though we know it's NULL)
              if (!dur) {
                const garminDur = Number(raw?.summary?.durationInSeconds ?? raw?.durationInSeconds);
                if (Number.isFinite(garminDur) && garminDur > 0) dur = Math.round(garminDur);
              }
            } catch {}
          }
          // Last resort: convert moving_time from minutes to seconds
          if (!dur) {
            const moveMin = Number((w as any)?.moving_time);
            if (Number.isFinite(moveMin) && moveMin > 0) dur = Math.round(moveMin * 60);
          }
          return { ...(prevOverall||{}), distance_m: dist, duration_s_moving: dur, duration_s_elapsed: elapsedDur };
        } catch { return prevOverall || {}; }
      }
      return prevOverall || {};
    })();

    // Add swim pace metrics to analysis (needs overall data)
    if (sport.includes('swim')) {
      console.log('🏊 Swim overall:', { dist: overall?.distance_m, dur: overall?.duration_s_moving, elapsed: overall?.duration_s_elapsed });
      if (overall?.distance_m && overall?.duration_s_moving) {
        const dist = overall.distance_m;
        const dur = overall.duration_s_moving;
        const per100m = (dur / dist) * 100;
        const distYards = dist / 0.9144;
        const per100yd = (dur / distYards) * 100;
        analysis.swim = {
          avg_pace_per_100m: Math.round(per100m),
          avg_pace_per_100yd: Math.round(per100yd)
        };
        console.log('🏊 Swim pace calculated:', analysis.swim);
      } else {
        console.log('❌ Swim pace NOT calculated - missing distance or duration');
      }
    }

    // Write under workouts.computed with updated overall and analysis
    const computed = (() => {
      const c = parseJson(w.computed) || {};
      return { ...c, overall, analysis };
    })();

    console.log('📝 About to UPDATE:', {
      workout_id,
      type: String(w.type),
      has_overall: !!computed.overall,
      has_analysis: !!computed.analysis,
      analysis_version: computed.analysis?.version,
      swim_in_analysis: !!computed.analysis?.swim,
      power_in_analysis: !!computed.analysis?.power
    });

    // Add granular analysis for running workouts
    let workoutAnalysis = null;
    console.log('🔍 Checking granular analysis conditions:', {
      type: w.type,
      planned_id: w.planned_id,
      isRun: w.type === 'run',
      hasPlannedId: !!w.planned_id
    });
    
    if (w.type === 'run' && w.planned_id) {
      try {
        console.log('🏃 Running granular analysis for running workout...');
        
        // Get planned workout data
        const { data: plannedWorkout } = await supabase
          .from('planned_workouts')
          .select('intervals')
          .eq('id', w.planned_id)
          .single();
        
        console.log('📋 Planned workout data:', {
          found: !!plannedWorkout,
          hasIntervals: !!plannedWorkout?.intervals,
          intervalsType: typeof plannedWorkout?.intervals,
          intervalsLength: plannedWorkout?.intervals?.length
        });
        
        if (plannedWorkout?.intervals && plannedWorkout.intervals.length > 0) {
          console.log('📊 Planned intervals found:', plannedWorkout.intervals.length);
          
          // Check if this is a long run (single steady effort) or interval workout
          const isLongRun = plannedWorkout.intervals.length === 1 && 
            (plannedWorkout.intervals[0].effortLabel?.toLowerCase().includes('steady') ||
             plannedWorkout.intervals[0].effortLabel?.toLowerCase().includes('long') ||
             plannedWorkout.intervals[0].effortLabel?.toLowerCase().includes('easy'));
          
          if (isLongRun) {
            console.log('🏃 Long run detected - analyzing pace consistency');
            
            // Analyze long run: pace consistency, negative splits, drift
            const longRunAnalysis = analyzeLongRun(computed, plannedWorkout.intervals[0]);
            
            workoutAnalysis = {
              adherence_percentage: longRunAnalysis.paceConsistency,
              time_in_range_s: longRunAnalysis.timeInRange,
              time_outside_range_s: longRunAnalysis.timeOutsideRange,
              interval_breakdown: longRunAnalysis.segments,
              execution_grade: longRunAnalysis.grade,
              primary_issues: longRunAnalysis.issues,
              strengths: longRunAnalysis.strengths,
              analysis_version: 'v1.0.0',
              workout_type: 'long_run'
            };
            
            console.log('✅ Long run analysis completed:', {
              consistency: longRunAnalysis.paceConsistency,
              grade: longRunAnalysis.grade,
              issues: longRunAnalysis.issues.length
            });
          } else {
            console.log('🏃 Interval workout detected - analyzing target adherence');
            
            // Convert planned intervals to the format expected by granular analysis
            const convertedIntervals = plannedWorkout.intervals.map((interval: any, index: number) => {
              // Extract pace range from bpmTarget or effortLabel
              let paceRange = null;
              if (interval.bpmTarget) {
                // Convert BPM to pace range (rough approximation)
                const bpm = interval.bpmTarget.split('-').map((b: string) => parseInt(b.trim()));
                if (bpm.length === 2) {
                  // Rough conversion: 150-160 BPM ≈ 6:00-7:00/mi pace
                  const paceLower = 360 + (160 - bpm[1]) * 10; // seconds per mile
                  const paceUpper = 360 + (160 - bpm[0]) * 10;
                  paceRange = { lower: paceLower, upper: paceUpper };
                }
              }
              
              // Extract power range from effortLabel or use default
              let powerRange = null;
              if (interval.effortLabel?.toLowerCase().includes('threshold')) {
                powerRange = { lower: 250, upper: 300 }; // Default threshold range
              } else if (interval.effortLabel?.toLowerCase().includes('tempo')) {
                powerRange = { lower: 200, upper: 250 }; // Default tempo range
              }
              
              return {
                type: interval.effortLabel?.toLowerCase() || 'work',
                duration_s: interval.time ? parseTimeToSeconds(interval.time) : 300, // Default 5 min
                pace_range: paceRange,
                power_range: powerRange
              };
            });
            
            console.log('🔄 Converted intervals:', convertedIntervals.length);
            
            // Run granular adherence analysis
            const analysis = calculatePrescribedRangeAdherence(
              computed.analysis?.intervals || [],
              convertedIntervals,
              computed.overall
            );
            
            workoutAnalysis = {
              adherence_percentage: analysis.overallAdherence,
              time_in_range_s: analysis.timeInRange,
              time_outside_range_s: analysis.timeOutsideRange,
              interval_breakdown: analysis.intervalAnalysis,
              execution_grade: analysis.executionGrade,
              primary_issues: analysis.primaryIssues,
              strengths: analysis.strengths,
              analysis_version: 'v1.0.0',
              workout_type: 'intervals'
            };
            
            console.log('✅ Granular analysis completed:', {
              adherence: analysis.overallAdherence,
              grade: analysis.executionGrade,
              issues: analysis.primaryIssues.length
            });
          }
        }
      } catch (error) {
        console.error('❌ Granular analysis failed:', error);
      }
    }

    // Update workout with computed analysis and granular analysis
    const updateData = { computed };
    if (workoutAnalysis) {
      updateData.workout_analysis = workoutAnalysis;
    }
    
    const { error: upErr } = await supabase
      .from('workouts')
      .update(updateData)
      .eq('id', workout_id);
    
    console.log('✅ UPDATE result:', { error: upErr ? String(upErr) : null });
    
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ 
      success: true, 
      analysisVersion: ANALYSIS_VERSION,
      debug: {
        hasWorkoutAnalysis: !!workoutAnalysis,
        workoutType: w.type,
        plannedId: w.planned_id,
        analysisData: workoutAnalysis
      }
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
