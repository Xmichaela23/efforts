import { calculatePaceRangeAdherence } from '../adherence/pace-adherence.ts';
import { calculateIntervalHeartRate } from '../analysis/heart-rate.ts';
import { calculateIntervalElevation } from '../analysis/elevation.ts';

/**
 * Generate detailed interval breakdown with pace, duration, HR, and elevation metrics
 */
export function generateIntervalBreakdown(
  workIntervals: any[],
  allIntervals?: any[],
  overallPaceAdherence?: number,
  granularAnalysis?: any,
  sensorData?: any[],
  userUnits: 'metric' | 'imperial' = 'imperial',
  plannedWorkout?: any,
  rawWorkoutData?: any
): any {
  // For steady-state runs, workIntervals might be empty but allIntervals has the data
  // Use allIntervals if workIntervals is empty
  const intervalsToAnalyze = workIntervals.length > 0 ? workIntervals : (allIntervals || []).filter(i => i.executed);
  
  if (intervalsToAnalyze.length === 0) {
    return { available: false, message: 'No intervals to analyze' };
  }
  
  const breakdown = intervalsToAnalyze.map((interval, index) => {
    // Extract planned values
    const plannedDuration = interval.planned?.duration_s || 0;
    const plannedPace = interval.planned?.target_pace_s_per_mi || 0;
    
    // Extract actual values from executed object
    const actualDuration = interval.executed?.duration_s || interval.duration_s || 0;
    
    // ✅ FIX: Recalculate pace using moving time, not duration-based pace
    // The stored avg_pace_s_per_mi might be calculated from elapsed duration, not moving time
    // Use moving time from workout.computed.overall.duration_s_moving (same as Details tab)
    let actualPace = interval.executed?.avg_pace_s_per_mi || 0;
    const intervalDistanceM = interval.executed?.distance_m || 0;
    
    // ✅ CRITICAL: Use moving time from overall workout (same source as Details tab)
    // For steady-state runs, the interval IS the whole workout, so use overall moving time
    // For interval workouts, use the interval's moving time if available, otherwise calculate from sensor data
    const overallMovingTimeS = rawWorkoutData?.computed?.overall?.duration_s_moving || null;
    const overallDistanceM = rawWorkoutData?.computed?.overall?.distance_m || null;
    
    // If this is a single-interval workout (steady-state), use overall moving time
    if (intervalsToAnalyze.length === 1 && overallMovingTimeS && overallDistanceM && overallDistanceM > 0) {
      const miles = overallDistanceM / 1609.34;
      if (miles > 0) {
        actualPace = overallMovingTimeS / miles; // seconds per mile
        console.log(`🔍 [PACE RECALC] Steady-state: using overall moving_time=${overallMovingTimeS}s, distance=${overallDistanceM}m, pace=${actualPace.toFixed(0)}s/mi (${Math.floor(actualPace/60)}:${String(Math.round(actualPace%60)).padStart(2,'0')}/mi) [was: ${interval.executed?.avg_pace_s_per_mi || 'N/A'}s/mi]`);
      }
    } else if (sensorData && interval.sample_idx_start !== undefined && interval.sample_idx_end !== undefined && intervalDistanceM > 0) {
      // For interval workouts, calculate moving time from sensor samples
      const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
      if (intervalSamples.length > 1) {
        // Calculate moving time: count samples with valid pace (indicates movement)
        // Each sample represents 1 second if pace is valid
        let movingTimeSeconds = 0;
        
        for (const sample of intervalSamples) {
          // Valid pace range: 180-1200 s/mi (3-20 min/mi) indicates movement
          const pace = sample.pace_s_per_mi;
          if (pace && pace > 0 && pace >= 180 && pace <= 1200) {
            movingTimeSeconds += 1; // Each sample = 1 second
          }
        }
        
        // If we calculated moving time, recalculate pace using moving time and distance
        if (movingTimeSeconds > 0 && intervalDistanceM > 0) {
          const miles = intervalDistanceM / 1609.34;
          if (miles > 0) {
            actualPace = movingTimeSeconds / miles; // seconds per mile
            console.log(`🔍 [PACE RECALC] Interval ${index + 1}: moving_time=${movingTimeSeconds}s (from ${intervalSamples.length} samples), distance=${intervalDistanceM}m, pace=${actualPace.toFixed(0)}s/mi (${Math.floor(actualPace/60)}:${String(Math.round(actualPace%60)).padStart(2,'0')}/mi) [was: ${interval.executed?.avg_pace_s_per_mi || 'N/A'}s/mi]`);
          }
        }
      }
    }
    
    // Calculate duration adherence: how close actual is to planned (not just ratio)
    // If planned is 250s and actual is 245s, adherence = 100 - |245-250|/250 * 100 = 98%
    let durationAdherence = 0;
    if (plannedDuration > 0 && actualDuration > 0) {
      const durationDelta = Math.abs(actualDuration - plannedDuration);
      durationAdherence = Math.max(0, 100 - (durationDelta / plannedDuration) * 100);
    } else if (plannedDuration > 0 && actualDuration === 0) {
      durationAdherence = 0; // No actual duration recorded
    }
    
    // ✅ USE SAME SOURCE AS SUMMARY/DETAILS - get pace range from multiple sources
    // Check interval.pace_range first (enriched), then interval.planned.pace_range, then planned step
    let workPaceRange = interval.pace_range || interval.planned?.pace_range || interval.target_pace;
    if (!workPaceRange && plannedWorkout && interval.planned_step_id) {
      // Fallback: get from planned step directly (same as Summary/Details screens)
      const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
      workPaceRange = plannedStep?.pace_range;
    }
    const workRangeLower = workPaceRange?.lower || 0;
    const workRangeUpper = workPaceRange?.upper || 0;
    
    // Calculate pace adherence: use range if available, otherwise single target
    let paceAdherence = 0;
    if (workRangeLower > 0 && workRangeUpper > 0 && actualPace > 0) {
      // Use range-based adherence calculation
      paceAdherence = calculatePaceRangeAdherence(actualPace, workRangeLower, workRangeUpper);
    } else if (plannedPace > 0 && actualPace > 0) {
      // Fallback to single target calculation
      const paceDelta = Math.abs(actualPace - plannedPace);
      paceAdherence = Math.max(0, 100 - (paceDelta / plannedPace) * 100);
    }
    
    // Calculate overall performance score
    // Weight pace more heavily (70%) than duration (30%) for interval workouts
    // Pace is more important than exact duration match
    const overallScore = (paceAdherence * 0.7) + (durationAdherence * 0.3);
    
    // Calculate heart rate metrics for this work interval
    const hrMetrics = calculateIntervalHeartRate(sensorData || [], interval.sample_idx_start, interval.sample_idx_end);
    
    // Calculate elevation metrics for this work interval
    const elevationMetrics = calculateIntervalElevation(sensorData || [], interval.sample_idx_start, interval.sample_idx_end);
    
    // Debug logging for first interval
    if (index === 0) {
      console.log(`🔍 [INTERVAL BREAKDOWN DEBUG] Interval ${index + 1}:`);
      console.log(`  Planned duration: ${plannedDuration}s (${Math.floor(plannedDuration/60)}:${String(Math.round(plannedDuration%60)).padStart(2,'0')})`);
      console.log(`  Actual duration: ${actualDuration}s (${actualDuration > 0 ? `${Math.floor(actualDuration/60)}:${String(Math.round(actualDuration%60)).padStart(2,'0')}` : 'N/A'})`);
      console.log(`  Planned pace: ${plannedPace}s/mi (${plannedPace > 0 ? `${Math.floor(plannedPace/60)}:${String(Math.round(plannedPace%60)).padStart(2,'0')}/mi` : 'N/A'})`);
      console.log(`  Planned pace range: ${workRangeLower}-${workRangeUpper}s/mi`);
      console.log(`  Actual pace: ${actualPace}s/mi (${actualPace > 0 ? `${Math.floor(actualPace/60)}:${String(Math.round(actualPace%60)).padStart(2,'0')}/mi` : 'N/A'})`);
      console.log(`  Pace adherence: ${Math.round(paceAdherence)}%`);
      console.log(`  Duration adherence: ${Math.round(durationAdherence)}%`);
      console.log(`  Performance score: ${Math.round(overallScore)}%`);
      console.log(`  HR: avg=${hrMetrics.avg_heart_rate_bpm}, max=${hrMetrics.max_heart_rate_bpm}, min=${hrMetrics.min_heart_rate_bpm}`);
      console.log(`  Elevation: gain=${elevationMetrics.elevation_gain_m}m, loss=${elevationMetrics.elevation_loss_m}m, grade=${elevationMetrics.avg_grade_percent}%`);
    }
    
    return {
      interval_type: 'work',
      interval_number: index + 1,
      interval_id: interval.planned_step_id || null,
      planned_duration_s: plannedDuration,
      actual_duration_s: actualDuration,
      planned_distance_m: interval.planned?.distance_m || 0,
      actual_distance_m: interval.executed?.distance_m || 0,
      duration_adherence_percent: Math.round(durationAdherence),
      // Store pace range if available
      planned_pace_range_lower: workRangeLower,
      planned_pace_range_upper: workRangeUpper,
      planned_pace_min_per_mi: workRangeLower > 0 && workRangeUpper > 0 
        ? null // Use range instead
        : (plannedPace > 0 ? Math.round(plannedPace / 60 * 100) / 100 : 0),
      actual_pace_min_per_mi: actualPace > 0 ? Math.round(actualPace / 60 * 100) / 100 : 0,
      pace_adherence_percent: Math.round(paceAdherence),
      performance_score: Math.round(overallScore),
      // Heart rate metrics
      avg_heart_rate_bpm: hrMetrics.avg_heart_rate_bpm,
      max_heart_rate_bpm: hrMetrics.max_heart_rate_bpm,
      min_heart_rate_bpm: hrMetrics.min_heart_rate_bpm,
      // Elevation metrics
      elevation_start_m: elevationMetrics.elevation_start_m,
      elevation_end_m: elevationMetrics.elevation_end_m,
      elevation_gain_m: elevationMetrics.elevation_gain_m,
      elevation_loss_m: elevationMetrics.elevation_loss_m,
      net_elevation_change_m: elevationMetrics.net_elevation_change_m,
      avg_grade_percent: elevationMetrics.avg_grade_percent
    };
  });
  
  // Generate formatted section text for UI display (similar to mile-by-mile breakdown)
  const formatPace = (paceMinPerMi: number): string => {
    if (paceMinPerMi <= 0) return 'N/A';
    const minutes = Math.floor(paceMinPerMi);
    const seconds = Math.round((paceMinPerMi - minutes) * 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };
  
  const formatDuration = (seconds: number): string => {
    if (seconds <= 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  
  const formatPaceRange = (lower: number, upper: number): string => {
    if (lower <= 0 || upper <= 0) return 'N/A';
    const lowerMin = Math.floor(lower / 60);
    const lowerSec = Math.round(lower % 60);
    const upperMin = Math.floor(upper / 60);
    const upperSec = Math.round(upper % 60);
    return `${lowerMin}:${String(lowerSec).padStart(2, '0')}-${upperMin}:${String(upperSec).padStart(2, '0')}/mi`;
  };
  
  const formatPaceFromSeconds = (seconds: number): string => {
    if (seconds <= 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}/mi`;
  };
  
  // Calculate summary first (needed for coaching insight)
  const summary = breakdown.reduce((acc, i) => {
    acc.total += i.performance_score;
    if (i.performance_score >= 90) acc.high++;
    else if (i.performance_score >= 80) acc.good++;
    else if (i.performance_score >= 70) acc.fair++;
    else acc.poor++;
    return acc;
  }, { total: 0, high: 0, good: 0, fair: 0, poor: 0 });
  
  // Analyze warmup, recovery, and cooldown segments for pacing analysis
  let pacingAnalysisText = '';
  // COACHING INSIGHT removed - AI narrative provides this context now
  
  if (allIntervals && allIntervals.length > 0) {
    const warmupInterval = allIntervals.find((i: any) => (i.role === 'warmup' || i.kind === 'warmup') && i.executed);
    const recoveryIntervals = allIntervals.filter((i: any) => (i.role === 'recovery' || i.kind === 'recovery') && i.executed);
    const cooldownInterval = allIntervals.find((i: any) => (i.role === 'cooldown' || i.kind === 'cooldown') && i.executed);
    
    // Calculate work interval average adherence
    const workIntervalAdherence = breakdown.length > 0
      ? Math.round(breakdown.reduce((sum, i) => sum + i.pace_adherence_percent, 0) / breakdown.length)
      : 0;
    
    // Analyze warmup
    let warmupAnalysis = '';
    if (warmupInterval) {
      const warmupPlannedPace = warmupInterval.planned?.target_pace_s_per_mi || warmupInterval.planned?.pace_range?.lower || 0;
      const warmupActualPace = warmupInterval.executed?.avg_pace_s_per_mi || 0;
      const warmupPlannedRange = warmupInterval.planned?.pace_range;
      
      if (warmupPlannedRange && warmupActualPace > 0) {
        const warmupRangeLower = warmupPlannedRange.lower || 0;
        const warmupRangeUpper = warmupPlannedRange.upper || 0;
        const warmupActualFormatted = formatPaceFromSeconds(warmupActualPace);
        const warmupRangeFormatted = formatPaceRange(warmupRangeLower, warmupRangeUpper);
        const warmupDelta = warmupActualPace < warmupRangeLower 
          ? Math.round((warmupRangeLower - warmupActualPace) / 60) 
          : warmupActualPace > warmupRangeUpper 
            ? Math.round((warmupActualPace - warmupRangeUpper) / 60)
            : 0;
        const warmupStatus = warmupActualPace < warmupRangeLower ? 'too fast' : warmupActualPace > warmupRangeUpper ? 'too slow' : 'within range';
        
        warmupAnalysis = `- Warmup (${formatDuration(warmupInterval.planned?.duration_s || 0)}): ${warmupActualFormatted} actual vs ${warmupRangeFormatted} prescribed - ${warmupStatus}`;
        if (warmupDelta > 0) {
          warmupAnalysis += ` (${warmupDelta}s/mi ${warmupActualPace < warmupRangeLower ? 'faster' : 'slower'} than prescribed)`;
        }
      } else if (warmupPlannedPace > 0 && warmupActualPace > 0) {
        const warmupActualFormatted = formatPaceFromSeconds(warmupActualPace);
        const warmupPlannedFormatted = formatPaceFromSeconds(warmupPlannedPace);
        warmupAnalysis = `- Warmup (${formatDuration(warmupInterval.planned?.duration_s || 0)}): ${warmupActualFormatted} actual vs ${warmupPlannedFormatted} prescribed`;
      }
    }
    
    // Analyze recovery intervals
    let recoveryAnalysis = '';
    if (recoveryIntervals.length > 0) {
      const recoveryAdherences = recoveryIntervals.map((rec: any) => {
        const recPlannedPace = rec.planned?.target_pace_s_per_mi || rec.planned?.pace_range?.lower || 0;
        const recActualPace = rec.executed?.avg_pace_s_per_mi || 0;
        if (recPlannedPace > 0 && recActualPace > 0) {
          const recDelta = Math.abs(recActualPace - recPlannedPace);
          return Math.max(0, 100 - (recDelta / recPlannedPace) * 100);
        }
        return 0;
      }).filter((a: number) => a > 0);
      
      const avgRecoveryAdherence = recoveryAdherences.length > 0
        ? Math.round(recoveryAdherences.reduce((sum: number, a: number) => sum + a, 0) / recoveryAdherences.length)
        : 0;
      
      recoveryAnalysis = `- Recovery jogs (${recoveryIntervals.length}x ${formatDuration(recoveryIntervals[0]?.planned?.duration_s || 0)}): ~${avgRecoveryAdherence}% adherence - ${avgRecoveryAdherence >= 90 ? 'well controlled' : avgRecoveryAdherence >= 70 ? 'acceptable' : 'needs attention'}`;
    }
    
    // Analyze cooldown
    let cooldownAnalysis = '';
    if (cooldownInterval) {
      const cooldownPlannedPace = cooldownInterval.planned?.target_pace_s_per_mi || cooldownInterval.planned?.pace_range?.lower || 0;
      const cooldownActualPace = cooldownInterval.executed?.avg_pace_s_per_mi || 0;
      const cooldownPlannedRange = cooldownInterval.planned?.pace_range;
      
      if (cooldownPlannedRange && cooldownActualPace > 0) {
        const cooldownRangeLower = cooldownPlannedRange.lower || 0;
        const cooldownRangeUpper = cooldownPlannedRange.upper || 0;
        const cooldownActualFormatted = formatPaceFromSeconds(cooldownActualPace);
        const cooldownRangeFormatted = formatPaceRange(cooldownRangeLower, cooldownRangeUpper);
        const inRange = cooldownActualPace >= cooldownRangeLower && cooldownActualPace <= cooldownRangeUpper;
        
        cooldownAnalysis = `- Cooldown (${formatDuration(cooldownInterval.planned?.duration_s || 0)}): ${cooldownActualFormatted} - ${inRange ? 'within prescribed range' : 'outside prescribed range'}`;
      } else if (cooldownPlannedPace > 0 && cooldownActualPace > 0) {
        const cooldownActualFormatted = formatPaceFromSeconds(cooldownActualPace);
        const cooldownPlannedFormatted = formatPaceFromSeconds(cooldownPlannedPace);
        cooldownAnalysis = `- Cooldown (${formatDuration(cooldownInterval.planned?.duration_s || 0)}): ${cooldownActualFormatted} vs ${cooldownPlannedFormatted} prescribed`;
      }
    }
    
    // Generate PACING ANALYSIS section with transparent breakdown
    // Get segment adherence from granular analysis - it should always be there
    const segmentAdherence = granularAnalysis?.segment_adherence;
    
    // Use performance.pace_adherence as single source of truth (matches Summary view)
    // This is interval-average pace adherence, not time-in-range score
    // If performance.pace_adherence is not available, use the parameter (which should also be from performance)
    const paceAdherence = granularAnalysis?.performance?.pace_adherence ?? overallPaceAdherence;
    
    // Debug: Log what we're using
    if (granularAnalysis?.performance?.pace_adherence === undefined && overallPaceAdherence !== undefined) {
      console.warn(`⚠️ [BREAKDOWN] performance.pace_adherence not found, using parameter: ${overallPaceAdherence}%`);
    }
    
    // Always show breakdown when we have pace adherence and work intervals
    if (paceAdherence !== undefined && workIntervalAdherence > 0) {
      pacingAnalysisText = `PACE ADHERENCE BREAKDOWN (${Math.round(paceAdherence)}% overall):\n\n`;
      
      // Use segment adherence data - it should always be calculated and available
      if (segmentAdherence) {
          // Work intervals - use actual pace adherence from breakdown, not time-in-range
          if (breakdown.length > 0) {
            const workAdherences = breakdown.map((i: any) => i.pace_adherence_percent);
            const avgWorkAdherence = Math.round(workAdherences.reduce((sum: number, a: number) => sum + a, 0) / workAdherences.length);
            const workStatus = avgWorkAdherence >= 90 ? 'Excellent' : avgWorkAdherence >= 70 ? 'Good' : 'Needs Improvement';
            pacingAnalysisText += `${workStatus} - Work Intervals: ${avgWorkAdherence}% (${breakdown.length}/${breakdown.length} reps on target)\n`;
            pacingAnalysisText += `   • Interval 1-${breakdown.length}: ${workAdherences.join('-')}% adherence\n`;
            pacingAnalysisText += `   • ${avgWorkAdherence >= 90 ? 'Excellent consistency, no fading' : avgWorkAdherence >= 70 ? 'Good consistency' : 'Inconsistent pacing'}\n\n`;
          }
          
          // Warmup
          if (segmentAdherence.warmup && warmupInterval) {
            const warmupAdherence = segmentAdherence.warmup.adherence;
            const warmupStatus = warmupAdherence >= 90 ? 'Good' : warmupAdherence >= 70 ? 'Too Fast' : 'Too Fast';
            const warmupActual = warmupInterval.executed?.avg_pace_s_per_mi || 0;
            const warmupPlannedRange = warmupInterval.planned?.pace_range;
            
            if (warmupPlannedRange) {
              const warmupRangeFormatted = formatPaceRange(warmupPlannedRange.lower, warmupPlannedRange.upper);
              const warmupActualFormatted = formatPaceFromSeconds(warmupActual);
              const warmupDelta = warmupActual < warmupPlannedRange.lower 
                ? Math.round((warmupPlannedRange.lower - warmupActual) / 60)
                : warmupActual > warmupPlannedRange.upper
                  ? Math.round((warmupActual - warmupPlannedRange.upper) / 60)
                  : 0;
              
              pacingAnalysisText += `${warmupStatus} - Warmup: ${warmupAdherence}% ${warmupAdherence < 90 ? '(too fast)' : ''}\n`;
              pacingAnalysisText += `   • Prescribed: ${warmupRangeFormatted} easy pace\n`;
              pacingAnalysisText += `   • Actual: ${warmupActualFormatted}\n`;
              if (warmupDelta > 0) {
                pacingAnalysisText += `   • Impact: -${Math.round((100 - warmupAdherence) * 0.2)}% on overall pace score\n`;
              }
              pacingAnalysisText += `\n`;
            }
          }
          
          // Recovery - calculate from actual recovery intervals if available
          if (recoveryIntervals.length > 0) {
            const recoveryAdherences = recoveryIntervals.map((rec: any) => {
              const recPlannedPace = rec.planned?.target_pace_s_per_mi || rec.planned?.pace_range?.lower || 0;
              const recActualPace = rec.executed?.avg_pace_s_per_mi || 0;
              if (recPlannedPace > 0 && recActualPace > 0) {
                const recDelta = Math.abs(recActualPace - recPlannedPace);
                return Math.max(0, 100 - (recDelta / recPlannedPace) * 100);
              }
              return 0;
            }).filter((a: number) => a > 0);
            
            const avgRecoveryAdherence = recoveryAdherences.length > 0
              ? Math.round(recoveryAdherences.reduce((sum: number, a: number) => sum + a, 0) / recoveryAdherences.length)
              : (segmentAdherence.recovery ? segmentAdherence.recovery.adherence : 0);
            
            const recoveryStatus = avgRecoveryAdherence >= 90 ? 'Good' : avgRecoveryAdherence >= 70 ? 'Acceptable' : 'Needs Attention';
            pacingAnalysisText += `${recoveryStatus} - Recovery Jogs: ${avgRecoveryAdherence}% (${avgRecoveryAdherence >= 90 ? 'well controlled' : avgRecoveryAdherence >= 70 ? 'acceptable' : 'needs attention'})\n`;
            pacingAnalysisText += `   • ${recoveryIntervals.length}/${recoveryIntervals.length} recovery periods executed\n`;
            if (avgRecoveryAdherence < 90) {
              pacingAnalysisText += `   • Impact: -${Math.round((100 - avgRecoveryAdherence) * 0.2)}% on overall pace score\n`;
            }
            pacingAnalysisText += `\n`;
          }
          
          // Cooldown
          if (segmentAdherence.cooldown && cooldownInterval) {
            const cooldownAdherence = segmentAdherence.cooldown.adherence;
            const cooldownStatus = cooldownAdherence >= 90 ? 'Good' : cooldownAdherence >= 70 ? 'Slightly Too Fast' : 'Too Fast';
            const cooldownActual = cooldownInterval.executed?.avg_pace_s_per_mi || 0;
            const cooldownPlannedRange = cooldownInterval.planned?.pace_range;
            
            if (cooldownPlannedRange) {
              const cooldownRangeFormatted = formatPaceRange(cooldownPlannedRange.lower, cooldownPlannedRange.upper);
              const cooldownActualFormatted = formatPaceFromSeconds(cooldownActual);
              
              pacingAnalysisText += `${cooldownStatus} - Cooldown: ${cooldownAdherence}% ${cooldownAdherence < 90 ? '(slightly too fast)' : ''}\n`;
              pacingAnalysisText += `   • Prescribed: ${cooldownRangeFormatted} easy pace\n`;
              pacingAnalysisText += `   • Actual: ${cooldownActualFormatted}\n`;
              if (cooldownAdherence < 90) {
                pacingAnalysisText += `   • Impact: -${Math.round((100 - cooldownAdherence) * 0.2)}% on overall pace score\n`;
              }
              pacingAnalysisText += `\n`;
            }
          }
          
          // Summary explanation - only show if there's a meaningful discrepancy
          // "WHY THIS MATTERS" section removed - AI narrative provides this context
          // (paceAdherence < workIntervalAdherence - 10 check removed since AI handles interpretation)
        } else {
          // Segment data should always be available - log error if missing
          console.error(`❌ [BREAKDOWN] Segment adherence data missing! This should not happen.`);
          console.error(`   granularAnalysis keys:`, granularAnalysis ? Object.keys(granularAnalysis) : 'null');
          console.error(`   segment_adherence:`, granularAnalysis?.segment_adherence);
          
          // Still show work intervals at minimum
          pacingAnalysisText += `Work Intervals: ${workIntervalAdherence}% (${breakdown.length}/${breakdown.length} reps on target)\n`;
          pacingAnalysisText += `   • Interval 1-${breakdown.length}: ${breakdown.map((i: any) => i.pace_adherence_percent).join('-')}% adherence\n\n`;
        }
    }
    
    // COACHING INSIGHT removed - AI narrative provides this context now
  }
  
  // Build complete breakdown array with warmup, recovery, and cooldown
  const completeBreakdown: any[] = [];
  
    // Add warmup if it exists
    if (allIntervals && allIntervals.length > 0) {
      const warmupInterval = allIntervals.find((i: any) => (i.role === 'warmup' || i.kind === 'warmup') && i.executed);
      if (warmupInterval) {
        // ✅ USE SAME SOURCE AS SUMMARY/DETAILS - get pace_range from planned step
        let warmupPaceRange = warmupInterval.planned?.pace_range || warmupInterval.pace_range;
        if (!warmupPaceRange && plannedWorkout && warmupInterval.planned_step_id) {
          const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === warmupInterval.planned_step_id);
          warmupPaceRange = plannedStep?.pace_range;
        }
        const warmupRangeLower = warmupPaceRange?.lower || 0;
        const warmupRangeUpper = warmupPaceRange?.upper || 0;
        // ✅ SINGLE SOURCE OF TRUTH: Use executed.avg_pace_s_per_mi from compute-workout-summary
        const warmupActualPace = warmupInterval.executed?.avg_pace_s_per_mi || 0;
        const warmupPlannedDuration = warmupInterval.planned?.duration_s || 0;
        const warmupActualDuration = warmupInterval.executed?.duration_s || 0;
        
        // Calculate pace adherence for range (not single target)
        const warmupPaceAdherence = warmupRangeLower > 0 && warmupRangeUpper > 0 && warmupActualPace > 0
          ? calculatePaceRangeAdherence(warmupActualPace, warmupRangeLower, warmupRangeUpper)
          : 0;
        
        // Calculate duration adherence
        let warmupDurationAdherence = 0;
        if (warmupPlannedDuration > 0 && warmupActualDuration > 0) {
          const durationDelta = Math.abs(warmupActualDuration - warmupPlannedDuration);
          warmupDurationAdherence = Math.max(0, 100 - (durationDelta / warmupPlannedDuration) * 100);
        }
        
        // Calculate performance score using 70/30 weighting (pace/duration) - same as work intervals
        const warmupPerformanceScore = (warmupPaceAdherence * 0.7) + (warmupDurationAdherence * 0.3);
        
        // Calculate HR and elevation
        const warmupHR = calculateIntervalHeartRate(sensorData || [], warmupInterval.sample_idx_start, warmupInterval.sample_idx_end);
        const warmupElevation = calculateIntervalElevation(sensorData || [], warmupInterval.sample_idx_start, warmupInterval.sample_idx_end);
        
        // ✅ Get planned_label from compute-workout-summary (same source as Summary screen)
        const warmupPlannedLabel = warmupInterval.planned_label || null;
        
        completeBreakdown.push({
          interval_id: warmupInterval.planned_step_id || null,
          interval_type: 'warmup',
          planned_duration_s: warmupPlannedDuration,
          actual_duration_s: warmupActualDuration,
          planned_distance_m: warmupInterval.planned?.distance_m || warmupInterval.executed?.distance_m || 0,
          actual_distance_m: warmupInterval.executed?.distance_m || 0,
          planned_label: warmupPlannedLabel, // ✅ Same source as Summary screen
          duration_adherence_percent: Math.round(warmupDurationAdherence),
          // Store pace range (not single target)
          planned_pace_range_lower: warmupRangeLower,
          planned_pace_range_upper: warmupRangeUpper,
          planned_pace_min_per_mi: warmupRangeLower > 0 && warmupRangeUpper > 0 
            ? null // Use range instead
            : (warmupInterval.planned?.target_pace_s_per_mi || 0) / 60,
          actual_pace_min_per_mi: warmupActualPace > 0 ? Math.round(warmupActualPace / 60 * 100) / 100 : 0,
          pace_adherence_percent: Math.round(warmupPaceAdherence),
          performance_score: Math.round(warmupPerformanceScore),
          avg_heart_rate_bpm: warmupHR.avg_heart_rate_bpm,
          max_heart_rate_bpm: warmupHR.max_heart_rate_bpm,
          min_heart_rate_bpm: warmupHR.min_heart_rate_bpm,
          elevation_start_m: warmupElevation.elevation_start_m,
          elevation_end_m: warmupElevation.elevation_end_m,
          elevation_gain_m: warmupElevation.elevation_gain_m,
          elevation_loss_m: warmupElevation.elevation_loss_m,
          net_elevation_change_m: warmupElevation.net_elevation_change_m,
          avg_grade_percent: warmupElevation.avg_grade_percent
        });
      }
    
    // Add work intervals with recovery periods between them
    const recoveryIntervals = allIntervals.filter((i: any) => (i.role === 'recovery' || i.kind === 'recovery' || i.type === 'recovery' || i.type === 'rest') && i.executed);
    
    breakdown.forEach((workInterval, workIndex) => {
      // Add work interval - find matching interval in allIntervals to get planned_label
      const matchingWorkInterval = allIntervals?.find((i: any) => 
        i.planned_step_id === workInterval.interval_id
      );
      if (matchingWorkInterval?.planned_label) {
        workInterval.planned_label = matchingWorkInterval.planned_label;
      }
      completeBreakdown.push(workInterval);
      
      // Add recovery period after each work interval (except after the last one)
      if (workIndex < recoveryIntervals.length) {
        const recoveryInterval = recoveryIntervals[workIndex];
        // ✅ USE SAME SOURCE AS SUMMARY/DETAILS - get pace_range from planned step
        let recPaceRange = recoveryInterval.planned?.pace_range || recoveryInterval.pace_range;
        if (!recPaceRange && plannedWorkout && recoveryInterval.planned_step_id) {
          const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === recoveryInterval.planned_step_id);
          recPaceRange = plannedStep?.pace_range;
        }
        const recRangeLower = recPaceRange?.lower || 0;
        const recRangeUpper = recPaceRange?.upper || 0;
        // ✅ USE SAME SOURCE AS SUMMARY SCREEN - executed.avg_pace_s_per_mi (single source of truth)
        const recActualPace = recoveryInterval.executed?.avg_pace_s_per_mi || 0;
        const recPlannedDuration = recoveryInterval.planned?.duration_s || 0;
        const recActualDuration = recoveryInterval.executed?.duration_s || 0;
        
        // Calculate pace adherence for range
        const recPaceAdherence = recRangeLower > 0 && recRangeUpper > 0 && recActualPace > 0
          ? calculatePaceRangeAdherence(recActualPace, recRangeLower, recRangeUpper)
          : 0;
        
        // Calculate duration adherence for recovery
        let recDurationAdherence = 0;
        if (recPlannedDuration > 0 && recActualDuration > 0) {
          const durationDelta = Math.abs(recActualDuration - recPlannedDuration);
          recDurationAdherence = Math.max(0, 100 - (durationDelta / recPlannedDuration) * 100);
        }
        
        // Calculate performance score using 70/30 weighting (pace/duration) - same as work intervals
        const recPerformanceScore = (recPaceAdherence * 0.7) + (recDurationAdherence * 0.3);
        
        // Calculate HR and elevation
        const recHR = calculateIntervalHeartRate(sensorData || [], recoveryInterval.sample_idx_start, recoveryInterval.sample_idx_end);
        const recElevation = calculateIntervalElevation(sensorData || [], recoveryInterval.sample_idx_start, recoveryInterval.sample_idx_end);
        
        // ✅ Get planned_label from compute-workout-summary (same source as Summary screen)
        const recPlannedLabel = recoveryInterval.planned_label || null;
        
                 completeBreakdown.push({
                   interval_type: 'recovery',
                   interval_id: recoveryInterval.planned_step_id || null,
                   recovery_number: workIndex + 1,
                   planned_duration_s: recPlannedDuration,
                   actual_duration_s: recActualDuration,
                   planned_distance_m: recoveryInterval.planned?.distance_m || recoveryInterval.executed?.distance_m || 0,
                   actual_distance_m: recoveryInterval.executed?.distance_m || 0,
                   planned_label: recPlannedLabel, // ✅ Same source as Summary screen
                   duration_adherence_percent: Math.round(recDurationAdherence),
                   planned_pace_range_lower: recRangeLower,
                   planned_pace_range_upper: recRangeUpper,
                   planned_pace_min_per_mi: recRangeLower > 0 && recRangeUpper > 0 
                     ? null // Use range instead
                     : (recoveryInterval.planned?.target_pace_s_per_mi || 0) / 60,
                   actual_pace_min_per_mi: recActualPace > 0 ? Math.round(recActualPace / 60 * 100) / 100 : 0,
                   pace_adherence_percent: Math.round(recPaceAdherence),
                   performance_score: Math.round(recPerformanceScore),
                   avg_heart_rate_bpm: recHR.avg_heart_rate_bpm,
                   max_heart_rate_bpm: recHR.max_heart_rate_bpm,
                   min_heart_rate_bpm: recHR.min_heart_rate_bpm,
                   elevation_start_m: recElevation.elevation_start_m,
                   elevation_end_m: recElevation.elevation_end_m,
                   elevation_gain_m: recElevation.elevation_gain_m,
                   elevation_loss_m: recElevation.elevation_loss_m,
                   net_elevation_change_m: recElevation.net_elevation_change_m,
                   avg_grade_percent: recElevation.avg_grade_percent
                 });
      }
    });
    
    // Add cooldown if it exists
    const cooldownInterval = allIntervals.find((i: any) => (i.role === 'cooldown' || i.kind === 'cooldown') && i.executed);
    if (cooldownInterval) {
      // ✅ USE SAME SOURCE AS SUMMARY/DETAILS - get pace_range from planned step
      let cooldownPaceRange = cooldownInterval.planned?.pace_range || cooldownInterval.pace_range;
      if (!cooldownPaceRange && plannedWorkout && cooldownInterval.planned_step_id) {
        const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === cooldownInterval.planned_step_id);
        cooldownPaceRange = plannedStep?.pace_range;
      }
      const cooldownRangeLower = cooldownPaceRange?.lower || 0;
      const cooldownRangeUpper = cooldownPaceRange?.upper || 0;
        // ✅ USE SAME SOURCE AS SUMMARY SCREEN - executed.avg_pace_s_per_mi (single source of truth)
        const cooldownActualPace = cooldownInterval.executed?.avg_pace_s_per_mi || 0;
      const cooldownPlannedDuration = cooldownInterval.planned?.duration_s || 0;
      const cooldownActualDuration = cooldownInterval.executed?.duration_s || 0;
      
      // Calculate pace adherence for range
      const cooldownPaceAdherence = cooldownRangeLower > 0 && cooldownRangeUpper > 0 && cooldownActualPace > 0
        ? calculatePaceRangeAdherence(cooldownActualPace, cooldownRangeLower, cooldownRangeUpper)
        : 0;
      
      // Calculate duration adherence for cooldown
      let cooldownDurationAdherence = 0;
      if (cooldownPlannedDuration > 0 && cooldownActualDuration > 0) {
        const durationDelta = Math.abs(cooldownActualDuration - cooldownPlannedDuration);
        cooldownDurationAdherence = Math.max(0, 100 - (durationDelta / cooldownPlannedDuration) * 100);
      }
      
      // Calculate performance score using 70/30 weighting (pace/duration) - same as work intervals
      const cooldownPerformanceScore = (cooldownPaceAdherence * 0.7) + (cooldownDurationAdherence * 0.3);
      
        // Calculate HR and elevation
        const cooldownHR = calculateIntervalHeartRate(sensorData || [], cooldownInterval.sample_idx_start, cooldownInterval.sample_idx_end);
        const cooldownElevation = calculateIntervalElevation(sensorData || [], cooldownInterval.sample_idx_start, cooldownInterval.sample_idx_end);
        
        // ✅ Get planned_label from compute-workout-summary (same source as Summary screen)
        const cooldownPlannedLabel = cooldownInterval.planned_label || null;
        
                 completeBreakdown.push({
                   interval_type: 'cooldown',
                   interval_id: cooldownInterval.planned_step_id || null,
                   planned_duration_s: cooldownPlannedDuration,
                   actual_duration_s: cooldownActualDuration,
                   planned_distance_m: cooldownInterval.planned?.distance_m || cooldownInterval.executed?.distance_m || 0,
                   actual_distance_m: cooldownInterval.executed?.distance_m || 0,
                   planned_label: cooldownPlannedLabel, // ✅ Same source as Summary screen
                   duration_adherence_percent: Math.round(cooldownDurationAdherence),
                   planned_pace_range_lower: cooldownRangeLower,
                   planned_pace_range_upper: cooldownRangeUpper,
                   planned_pace_min_per_mi: cooldownRangeLower > 0 && cooldownRangeUpper > 0 
                     ? null // Use range instead
                     : (cooldownInterval.planned?.target_pace_s_per_mi || 0) / 60,
                   actual_pace_min_per_mi: cooldownActualPace > 0 ? Math.round(cooldownActualPace / 60 * 100) / 100 : 0,
                   pace_adherence_percent: Math.round(cooldownPaceAdherence),
                   performance_score: Math.round(cooldownPerformanceScore),
                   avg_heart_rate_bpm: cooldownHR.avg_heart_rate_bpm,
                   max_heart_rate_bpm: cooldownHR.max_heart_rate_bpm,
                   min_heart_rate_bpm: cooldownHR.min_heart_rate_bpm,
                   elevation_start_m: cooldownElevation.elevation_start_m,
                   elevation_end_m: cooldownElevation.elevation_end_m,
                   elevation_gain_m: cooldownElevation.elevation_gain_m,
                   elevation_loss_m: cooldownElevation.elevation_loss_m,
                   net_elevation_change_m: cooldownElevation.net_elevation_change_m,
                   avg_grade_percent: cooldownElevation.avg_grade_percent
                 });
    }
  } else {
    // If no allIntervals, just use work intervals
    completeBreakdown.push(...breakdown);
  }
  
  // Helper function to format pace range (local scope) - returns format WITHOUT /mi suffix
  const formatPaceRangeLocal = (lowerSeconds?: number, upperSeconds?: number): string => {
    if (!lowerSeconds || !upperSeconds) return 'N/A';
    const lowerMin = Math.floor(lowerSeconds / 60);
    const lowerSec = Math.round(lowerSeconds % 60);
    const upperMin = Math.floor(upperSeconds / 60);
    const upperSec = Math.round(upperSeconds % 60);
    return `${lowerMin}:${String(lowerSec).padStart(2, '0')}-${upperMin}:${String(upperSec).padStart(2, '0')}`;
  };
  
  // Start section text with pacing analysis (AI narrative is shown separately at top)
  let sectionText = pacingAnalysisText;
  sectionText += 'INTERVAL-BY-INTERVAL BREAKDOWN:\n\n';
  
  // Separate intervals by type for better formatting
  const warmupIntervals = completeBreakdown.filter(i => i.interval_type === 'warmup');
  const workIntervalsFiltered = completeBreakdown.filter(i => i.interval_type === 'work');
  const recoveryIntervals = completeBreakdown.filter(i => i.interval_type === 'recovery');
  const cooldownIntervals = completeBreakdown.filter(i => i.interval_type === 'cooldown');
  
  // Aggregate recovery stats
  let recoveryAggregate = null;
  if (recoveryIntervals.length > 0) {
    const recoveryPaces = recoveryIntervals.map(r => r.actual_pace_min_per_mi).filter(p => p > 0);
    const recoveryDurations = recoveryIntervals.map(r => r.actual_duration_s).filter(d => d > 0);
    const recoveryPaceAdherences = recoveryIntervals.map(r => r.pace_adherence_percent || 0).filter(p => p > 0);
    
    if (recoveryPaces.length > 0) {
      const avgRecoveryPace = recoveryPaces.reduce((sum, p) => sum + p, 0) / recoveryPaces.length;
      const avgRecoveryDuration = recoveryDurations.length > 0 
        ? recoveryDurations.reduce((sum, d) => sum + d, 0) / recoveryDurations.length 
        : 0;
      const avgRecoveryPaceAdherence = recoveryPaceAdherences.length > 0
        ? Math.round(recoveryPaceAdherences.reduce((sum, p) => sum + p, 0) / recoveryPaceAdherences.length)
        : 0;
      
      recoveryAggregate = {
        count: recoveryIntervals.length,
        avg_pace: avgRecoveryPace,
        avg_duration: avgRecoveryDuration,
        avg_pace_adherence: avgRecoveryPaceAdherence
      };
    }
  }
  
  // Generate breakdown: warmup, work intervals, recovery aggregate, cooldown
  const intervalsToShow = [...warmupIntervals, ...workIntervalsFiltered, ...cooldownIntervals];
  
  intervalsToShow.forEach((interval) => {
    // Format planned pace - use range if available, otherwise single target
    // ✅ USE SAME SOURCE AS SUMMARY/DETAILS - get pace range from planned step if not in interval
    let plannedPaceStr = 'N/A';
    let paceRangeLower = interval.planned_pace_range_lower;
    let paceRangeUpper = interval.planned_pace_range_upper;
    
    // If no range in interval, try to get from planned step (same as Summary/Details screens)
    if ((!paceRangeLower || !paceRangeUpper) && plannedWorkout && interval.planned_step_id) {
      const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
      if (plannedStep?.pace_range) {
        paceRangeLower = plannedStep.pace_range.lower;
        paceRangeUpper = plannedStep.pace_range.upper;
      }
    }
    
    // Check for pace range first (preferred - same source as Summary/Details)
    if (paceRangeLower && paceRangeUpper && paceRangeLower > 0 && paceRangeUpper > 0) {
      plannedPaceStr = formatPaceRangeLocal(paceRangeLower, paceRangeUpper) + '/mi';
    } else if (interval.planned_pace_min_per_mi && interval.planned_pace_min_per_mi > 0) {
      plannedPaceStr = formatPace(interval.planned_pace_min_per_mi) + '/mi';
    }
    
    const actualPace = formatPace(interval.actual_pace_min_per_mi);
    const actualDur = formatDuration(interval.actual_duration_s);
    
    // ✅ FIX: Use same source as Summary screen - planned_label from compute-workout-summary
    // The interval object should already have planned_label from compute-workout-summary
    let plannedLabelStr = interval.planned_label || '—';
    
    // Fallback: if no planned_label in interval, try to get from allIntervals
    if (plannedLabelStr === '—' && allIntervals && interval.interval_id) {
      const matchingInterval = allIntervals.find((i: any) => 
        i.planned_step_id === interval.interval_id || 
        (interval.interval_type === 'warmup' && (i.role === 'warmup' || i.kind === 'warmup')) ||
        (interval.interval_type === 'cooldown' && (i.role === 'cooldown' || i.kind === 'cooldown'))
      );
      if (matchingInterval?.planned_label && typeof matchingInterval.planned_label === 'string') {
        plannedLabelStr = matchingInterval.planned_label;
      }
    }
    
    // Last fallback: if still no planned_label, try to get from planned step directly (same logic as formatPlannedLabel)
    if (plannedLabelStr === '—' && plannedWorkout && interval.interval_id) {
      const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.interval_id);
      if (plannedStep) {
        // Use same logic as formatPlannedLabel: distance first, then time
        const meters = plannedStep.distance_m || plannedStep.distanceMeters || plannedStep.m || plannedStep.meters;
        if (meters && meters > 0) {
          const miles = meters / 1609.34;
          plannedLabelStr = miles < 1 ? `${miles.toFixed(2)} mi` : `${miles.toFixed(1)} mi`;
        } else {
          const seconds = plannedStep.duration_s || plannedStep.seconds || plannedStep.duration;
          if (seconds && seconds > 0) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            plannedLabelStr = secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}:00`;
          }
        }
      }
    }
    
    const intervalLabel = interval.interval_type === 'warmup' ? 'Warmup' :
                         interval.interval_type === 'cooldown' ? 'Cooldown' :
                         interval.interval_type === 'recovery' ? `Recovery ${interval.recovery_number || ''}` :
                         `Interval ${interval.interval_number || ''}`;
    
    sectionText += `${intervalLabel}:\n`;
    sectionText += `  Planned: ${plannedLabelStr} @ ${plannedPaceStr}\n`;
    sectionText += `  Actual: ${actualDur} @ ${actualPace}/mi\n`;
    if (interval.pace_adherence_percent !== undefined) {
    sectionText += `  Pace adherence: ${interval.pace_adherence_percent}%\n`;
    }
    if (interval.duration_adherence_percent !== undefined) {
    sectionText += `  Duration adherence: ${interval.duration_adherence_percent}%\n`;
    }
    if (interval.performance_score !== undefined) {
      sectionText += `  Performance score: ${interval.performance_score}%\n`;
    }
    if (interval.avg_heart_rate_bpm !== null && interval.avg_heart_rate_bpm !== undefined) {
      sectionText += `  Avg HR: ${interval.avg_heart_rate_bpm} bpm`;
      if (interval.max_heart_rate_bpm !== null) sectionText += ` (max: ${interval.max_heart_rate_bpm} bpm)`;
      sectionText += `\n`;
    }
             // ✅ NOTE: Per-interval elevations are GPS-estimated and may not sum to total
             // Total elevation uses Garmin barometric data (more accurate)
             if (interval.elevation_gain_m !== undefined && interval.elevation_gain_m > 0) {
               // Convert elevation based on user preference
               if (userUnits === 'imperial') {
                 const gainFt = Math.round(interval.elevation_gain_m * 3.28084);
                 const lossFt = Math.round(interval.elevation_loss_m * 3.28084);
                 sectionText += `  Elevation: +${gainFt}ft / -${lossFt}ft (GPS-estimated)`;
                 if (interval.avg_grade_percent !== null && interval.avg_grade_percent !== undefined) {
                   sectionText += ` (${interval.avg_grade_percent > 0 ? '+' : ''}${interval.avg_grade_percent}% grade)`;
                 }
                 sectionText += `\n`;
               } else {
                 sectionText += `  Elevation: +${interval.elevation_gain_m}m / -${interval.elevation_loss_m}m (GPS-estimated)`;
                 if (interval.avg_grade_percent !== null && interval.avg_grade_percent !== undefined) {
                   sectionText += ` (${interval.avg_grade_percent > 0 ? '+' : ''}${interval.avg_grade_percent}% grade)`;
                 }
                 sectionText += `\n`;
               }
             } else if (interval.avg_grade_percent !== null && interval.avg_grade_percent !== undefined) {
               // Show grade even if no elevation gain/loss
               sectionText += `  Grade: ${interval.avg_grade_percent > 0 ? '+' : ''}${interval.avg_grade_percent}%\n`;
             }
    sectionText += `
`;
  });
  
  // Add recovery aggregate line (collapsed)
  if (recoveryAggregate && recoveryAggregate.count > 0 && recoveryAggregate.avg_pace > 0 && recoveryAggregate.avg_duration > 0) {
    const avgRecPace = formatPace(recoveryAggregate.avg_pace);
    const avgRecDur = formatDuration(recoveryAggregate.avg_duration);
    sectionText += `Recovery Pacing:\n`;
    sectionText += `  Average: ${avgRecDur} @ ${avgRecPace}/mi across ${recoveryAggregate.count} recovery jogs\n`;
    sectionText += `  Pace adherence: ${recoveryAggregate.avg_pace_adherence}%\n\n`;
  }
  
  // ✅ FIX #1: Use Garmin barometric data (accurate), fallback to GPS sum only if unavailable
  // GPS noise accumulates across segments, so trust the device's barometric altimeter
  // Check multiple possible locations for elevation data
  let elevationGainM: number | null = null;
  let elevationSource = 'none';
  
  if (rawWorkoutData) {
    // Check all possible locations for elevation data
    if (rawWorkoutData.elevation_gain != null && Number.isFinite(rawWorkoutData.elevation_gain)) {
      elevationGainM = Number(rawWorkoutData.elevation_gain);
      elevationSource = 'workout.elevation_gain';
    } else if (rawWorkoutData.metrics?.elevation_gain != null && Number.isFinite(rawWorkoutData.metrics.elevation_gain)) {
      elevationGainM = Number(rawWorkoutData.metrics.elevation_gain);
      elevationSource = 'workout.metrics.elevation_gain';
    } else if (rawWorkoutData.total_elevation_gain != null && Number.isFinite(rawWorkoutData.total_elevation_gain)) {
      elevationGainM = Number(rawWorkoutData.total_elevation_gain);
      elevationSource = 'workout.total_elevation_gain';
    }
  }
  
  // Calculate GPS sum for comparison
  const gpsSumM = completeBreakdown.length > 0 
    ? completeBreakdown.reduce((sum, i) => sum + (i.elevation_gain_m || 0), 0)
    : 0;
  
  // Only use GPS sum as last resort if Garmin data is completely unavailable
  const totalElevationGain = (elevationGainM != null && Number.isFinite(elevationGainM) && elevationGainM > 0) 
    ? Number(elevationGainM) 
    : gpsSumM;
  
  const finalSource = (elevationGainM != null && Number.isFinite(elevationGainM) && elevationGainM > 0) 
    ? elevationSource 
    : 'GPS sum (fallback)';
  
  console.log(`🔍 [ELEVATION DEBUG] rawWorkoutData exists: ${!!rawWorkoutData}`);
  console.log(`🔍 [ELEVATION DEBUG] rawWorkoutData.elevation_gain: ${rawWorkoutData?.elevation_gain}`);
  console.log(`🔍 [ELEVATION DEBUG] rawWorkoutData.metrics?.elevation_gain: ${rawWorkoutData?.metrics?.elevation_gain}`);
  console.log(`🔍 [ELEVATION DEBUG] Source: ${finalSource}, Garmin value: ${elevationGainM}m, GPS sum: ${gpsSumM}m, Final: ${totalElevationGain}m (${Math.round(totalElevationGain * 3.28084)}ft)`);
  const totalElevationLoss = 0; // Garmin only provides gain, not loss breakdown
  
  sectionText += `SUMMARY:\n`;
  sectionText += `- Average performance: ${Math.round(summary.total / breakdown.length)}%\n`;
  sectionText += `- High (≥90%): ${summary.high} intervals\n`;
  sectionText += `- Good (80-89%): ${summary.good} intervals\n`;
  sectionText += `- Fair (70-79%): ${summary.fair} intervals\n`;
  sectionText += `- Poor (<70%): ${summary.poor} intervals\n`;
  
  // Add total elevation summary (using Garmin's barometric data)
  // Note: Per-interval elevations are GPS-estimated and may not sum to total
  if (totalElevationGain > 0) {
    if (userUnits === 'imperial') {
      const totalGainFt = Math.round(totalElevationGain * 3.28084);
      sectionText += `- Total elevation: ${totalGainFt}ft gain (barometric data, per-interval values are GPS-estimated)\n`;
    } else {
      sectionText += `- Total elevation: ${Math.round(totalElevationGain)}m gain (barometric data, per-interval values are GPS-estimated)\n`;
    }
  }
  
  // Add execution score breakdown if execution < 100% - ALWAYS SHOW WHEN < 100%
  if (granularAnalysis?.performance?.execution_adherence !== undefined) {
    const executionScore = granularAnalysis.performance.execution_adherence;
    // Use performance.pace_adherence as single source of truth (matches Summary view)
    const paceAdherence = granularAnalysis.performance.pace_adherence ?? overallPaceAdherence ?? 100;
    const durationAdherence = granularAnalysis.performance.duration_adherence ?? 99;
    
    if (executionScore < 100 && allIntervals && allIntervals.length > 0) {
      const warmupInterval = allIntervals.find((i: any) => (i.role === 'warmup' || i.kind === 'warmup') && i.executed);
      const recoveryIntervals = allIntervals.filter((i: any) => (i.role === 'recovery' || i.kind === 'recovery') && i.executed) || [];
      const cooldownInterval = allIntervals.find((i: any) => (i.role === 'cooldown' || i.kind === 'cooldown') && i.executed);
      
      if (warmupInterval) {
        // Get pace range from planned step (same source as Summary/Details)
        let warmupPaceRange = warmupInterval.planned?.pace_range || warmupInterval.pace_range;
        if (!warmupPaceRange && plannedWorkout && warmupInterval.planned_step_id) {
          const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === warmupInterval.planned_step_id);
          warmupPaceRange = plannedStep?.pace_range;
        }
        const warmupRangeLower = warmupPaceRange?.lower || 0;
        const warmupRangeUpper = warmupPaceRange?.upper || 0;
        // ✅ CALCULATE FROM SENSOR DATA (same as Summary screen) - not from executed.avg_pace_s_per_mi
        let warmupActualPace = 0;
        if (sensorData && warmupInterval.sample_idx_start !== undefined && warmupInterval.sample_idx_end !== undefined) {
          const warmupSamples = sensorData.slice(warmupInterval.sample_idx_start, warmupInterval.sample_idx_end + 1);
          const validPaceSamples = warmupSamples
            .map(s => s.pace_s_per_mi || (s.speedMetersPerSecond ? (1609.34 / s.speedMetersPerSecond) : null))
            .filter(p => p != null && p > 0 && Number.isFinite(p));
          if (validPaceSamples.length > 0) {
            warmupActualPace = validPaceSamples.reduce((sum, p) => sum + p, 0) / validPaceSamples.length;
          }
        }
        // Fallback to executed if sensor data not available
        if (warmupActualPace === 0) {
          warmupActualPace = warmupInterval.executed?.avg_pace_s_per_mi || 0;
        }
        const warmupPlannedDuration = warmupInterval.planned?.duration_s || 0;
        const warmupActualDuration = warmupInterval.executed?.duration_s || 0;
        
        const warmupPaceAdherence = warmupRangeLower > 0 && warmupRangeUpper > 0 && warmupActualPace > 0
          ? calculatePaceRangeAdherence(warmupActualPace, warmupRangeLower, warmupRangeUpper)
          : 0;
        const warmupDurationAdherence = warmupPlannedDuration > 0 && warmupActualDuration > 0
          ? Math.max(0, 100 - (Math.abs(warmupActualDuration - warmupPlannedDuration) / warmupPlannedDuration) * 100)
          : 0;
        
        // ALWAYS show breakdown when execution < 100% (not just when warmup adherence < 90%)
        if (executionScore < 100) {
          const formatPace = (sec: number) => {
            const mins = Math.floor(sec / 60);
            const secs = Math.round(sec % 60);
            return `${mins}:${String(secs).padStart(2, '0')}`;
          };
          const formatDuration = (sec: number) => {
            const mins = Math.floor(sec / 60);
            const secs = Math.round(sec % 60);
            return `${mins}:${String(secs).padStart(2, '0')}`;
          };
          const warmupPlannedRange = warmupRangeLower > 0 && warmupRangeUpper > 0
            ? `${formatPace(warmupRangeLower)}-${formatPace(warmupRangeUpper)}/mi`
            : 'prescribed pace';
          const warmupActualFormatted = warmupActualPace > 0 ? formatPace(warmupActualPace) + '/mi' : 'N/A';
          const warmupPlannedFormatted = formatDuration(warmupPlannedDuration);
          const warmupActualFormattedDur = formatDuration(warmupActualDuration);
          
          sectionText += '\n';
                   sectionText += `EXECUTION SCORE BREAKDOWN (${executionScore}%):\n`;
                   sectionText += `\n`;
                   sectionText += `✅ Work intervals: ${paceAdherence}% pace, ${durationAdherence}% duration (perfect)\n`;
                   if (recoveryIntervals.length > 0) {
                     sectionText += `✅ Recoveries: Well controlled\n`;
                   }
                   if (cooldownInterval) {
                     // Calculate cooldown metrics for display
                     let cooldownPaceRange = cooldownInterval.planned?.pace_range || cooldownInterval.pace_range;
                     if (!cooldownPaceRange && plannedWorkout && cooldownInterval.planned_step_id) {
                       const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === cooldownInterval.planned_step_id);
                       cooldownPaceRange = plannedStep?.pace_range;
                     }
                     let cooldownActualPaceFromSensor = 0;
                     if (sensorData && cooldownInterval.sample_idx_start !== undefined && cooldownInterval.sample_idx_end !== undefined) {
                       const samples = sensorData.slice(cooldownInterval.sample_idx_start, cooldownInterval.sample_idx_end + 1);
                       const validPaces = samples.map(s => s.pace_s_per_mi).filter(p => p && p > 0);
                       if (validPaces.length > 0) {
                         cooldownActualPaceFromSensor = validPaces.reduce((sum, p) => sum + p, 0) / validPaces.length;
                       }
                     }
                     if (cooldownActualPaceFromSensor === 0) {
                       cooldownActualPaceFromSensor = cooldownInterval.executed?.avg_pace_s_per_mi || 0;
                     }
                     const cooldownPaceAdh = cooldownPaceRange && cooldownActualPaceFromSensor > 0
                       ? calculatePaceRangeAdherence(cooldownActualPaceFromSensor, cooldownPaceRange.lower, cooldownPaceRange.upper)
                       : 100;
                     const cooldownDurAdh = cooldownInterval.planned?.duration_s && cooldownInterval.executed?.duration_s
                       ? Math.max(0, 100 - (Math.abs(cooldownInterval.executed.duration_s - cooldownInterval.planned.duration_s) / cooldownInterval.planned.duration_s) * 100)
                       : 100;
                     sectionText += `✅ Cooldown: ${Math.round(cooldownPaceAdh)}% pace, ${Math.round(cooldownDurAdh)}% duration\n`;
                   }
                   sectionText += `⚠️ Warmup: ${Math.round(warmupPaceAdherence)}% pace, ${Math.round(warmupDurationAdherence)}% duration (penalty source)\n`;
                   sectionText += `\nWARMUP PENALTY (-${100 - executionScore}% from pace only):\n`;
                   // ✅ FIX: Show distance instead of time in execution breakdown
                   const warmupPlannedDistM = warmupInterval.planned?.distance_m || warmupInterval.executed?.distance_m || 0;
                   const warmupPlannedDistStr = warmupPlannedDistM > 0 ? `${(warmupPlannedDistM / 1609.34).toFixed(warmupPlannedDistM / 1609.34 < 1 ? 2 : 1)} mi` : warmupPlannedFormatted;
                   sectionText += `Planned: ${warmupPlannedDistStr} @ ${warmupPlannedRange}\n`;
                   sectionText += `Actual: ${warmupActualFormattedDur} @ ${warmupActualFormatted}\n`;
                   sectionText += `\nIssue: Warmup pace was ${warmupActualFormatted} vs ${warmupPlannedRange} target (too fast)\n`;
                   sectionText += `Duration was perfect (${warmupPlannedFormatted} completed), but running warmup too fast reduces workout quality.\n`;
                   sectionText += `\nFix: Complete warmup at prescribed easy pace (${warmupPlannedRange}) to maximize workout benefit.\n`;
        } else if (executionScore < 100) {
          // Even if warmup is good, still explain why execution < 100%
          sectionText += '\n';
          sectionText += `EXECUTION SCORE BREAKDOWN (${executionScore}%):\n`;
          sectionText += `The execution score combines multiple factors:\n`;
          sectionText += `• Work interval pace adherence: ${paceAdherence}%\n`;
          sectionText += `• Duration adherence: ${durationAdherence}%\n`;
          sectionText += `• Overall consistency and segment execution\n`;
          sectionText += `The ${100 - executionScore}% gap comes from minor variations across all segments.\n`;
        }
      }
    }
  }
  
  // Coaching insight already added at the top

  // Recalculate summary for work intervals only (for performance scoring)
  const workIntervalsOnly = completeBreakdown.filter(i => i.interval_type === 'work');
  const workSummary = workIntervalsOnly.reduce((acc, i) => {
    if (i.performance_score !== undefined) {
      acc.total += i.performance_score;
      if (i.performance_score >= 90) acc.high++;
      else if (i.performance_score >= 80) acc.good++;
      else if (i.performance_score >= 70) acc.fair++;
      else acc.poor++;
    }
    return acc;
  }, { total: 0, high: 0, good: 0, fair: 0, poor: 0 });

  const result = {
    available: true,
    intervals: completeBreakdown, // Use complete breakdown with warmup/recovery/cooldown
    section: sectionText,  // Add section text for UI display
    summary: {
      average_performance_score: workSummary.total > 0 ? Math.round(workSummary.total / workIntervalsOnly.length) : 0,
      total_intervals: workIntervalsOnly.length, // Only count work intervals for performance summary
      high_performance_intervals: workSummary.high,
      good_performance_intervals: workSummary.good,
      fair_performance_intervals: workSummary.fair,
      poor_performance_intervals: workSummary.poor
    }
  };
  
  console.log(`✅ [INTERVAL BREAKDOWN] Generated section for ${completeBreakdown.length} total segments (${workIntervalsOnly.length} work intervals), section length: ${sectionText.length} chars`);
  console.log(`🔍 [INTERVAL BREAKDOWN] Section preview: ${sectionText.substring(0, 200)}...`);
  
  return result;
}
