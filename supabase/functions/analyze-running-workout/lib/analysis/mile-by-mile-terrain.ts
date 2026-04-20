/**
 * Mile-by-mile terrain breakdown: pace, elevation, grade, and comparison to target.
 * Used for continuous runs (not interval workouts).
 *
 * Pace per mile is **time over distance** (interpolated on cumulative distance vs time), not an
 * arithmetic mean of instantaneous pace samples — that was inflating split paces vs summary pace.
 */

/** Monotonic cumulative time (seconds) aligned with sensorData indices. */
function buildCumulativeTimeSec(sensorData: any[]): Float64Array {
  const n = sensorData.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const t0Raw = Number(sensorData[0]?.timestamp ?? 0);
  const useMs = t0Raw > 1e11;
  const t0 = useMs ? t0Raw / 1000 : t0Raw > 1e9 ? t0Raw : 0;
  let fallback = 0;
  for (let i = 0; i < n; i++) {
    const tr = Number(sensorData[i]?.timestamp ?? 0);
    let sec: number;
    if (useMs && tr > 1e11) {
      sec = tr / 1000 - t0;
    } else if (!useMs && tr > 1e6 && tr < 1e11) {
      sec = tr - t0;
    } else {
      fallback += i === 0 ? 0 : Number(sensorData[i]?.duration_s) || 1;
      sec = fallback;
    }
    out[i] = sec;
  }
  for (let i = 1; i < n; i++) {
    if (out[i] < out[i - 1]) out[i] = out[i - 1];
  }
  return out;
}

/** Linear interpolation: time (seconds) at distance `targetM` (meters) along the run. */
function timeAtDistance(
  cumDist: Float64Array,
  cumTime: Float64Array,
  n: number,
  targetM: number,
): number | null {
  if (n < 2) return null;
  if (targetM <= cumDist[0]) return cumTime[0];
  if (targetM >= cumDist[n - 1]) return cumTime[n - 1];
  for (let i = 1; i < n; i++) {
    const d0 = cumDist[i - 1];
    const d1 = cumDist[i];
    const t0 = cumTime[i - 1];
    const t1 = cumTime[i];
    if (targetM > d1) continue;
    if (d1 === d0) return t0;
    const f = (targetM - d0) / (d1 - d0);
    return t0 + f * (t1 - t0);
  }
  return cumTime[n - 1];
}

/**
 * Generate detailed mile-by-mile breakdown with pace analysis and comparison to target range
 */
export function generateMileByMileTerrainBreakdown(
  sensorData: any[],
  intervals: any[],
  granularAnalysis: any,
  plannedPaceInfo: any,
  workoutAvgPaceSeconds?: number | null
): any {
  console.log(`🔍 [MILE BREAKDOWN] Starting function. Sensor data: ${sensorData.length} samples, Intervals: ${intervals.length}`);

  if (sensorData.length === 0) {
    console.log('⚠️ [MILE BREAKDOWN] No sensor data');
    return null;
  }

  // Extract work intervals
  const workIntervals = intervals.filter(i => i.role === 'work' && i.executed);
  console.log(`🔍 [MILE BREAKDOWN] Work intervals: ${workIntervals.length}`);

  if (workIntervals.length === 0) {
    console.log('⚠️ [MILE BREAKDOWN] No work intervals found');
    return null;
  }

  // Get target pace range from plannedPaceInfo (passed from main function)
  // Fallback to extracting from intervals if not provided
  let targetLower: number | null = null;
  let targetUpper: number | null = null;
  let targetPaceS: number | null = null;
  let isRangeWorkout = false;

  console.log(`🔍 [MILE BREAKDOWN] plannedPaceInfo received:`, plannedPaceInfo ? JSON.stringify(plannedPaceInfo) : 'null');

  if (plannedPaceInfo) {
    console.log(`🔍 [MILE BREAKDOWN] plannedPaceInfo.type: ${plannedPaceInfo.type}`);
    if (plannedPaceInfo.type === 'range') {
      targetLower = plannedPaceInfo.lower || null;
      targetUpper = plannedPaceInfo.upper || null;
      isRangeWorkout = !!(targetLower && targetUpper && targetLower !== targetUpper);
      console.log(`🔍 [MILE BREAKDOWN] Extracted from plannedPaceInfo: lower=${targetLower}, upper=${targetUpper}, isRange=${isRangeWorkout}`);
    } else if (plannedPaceInfo.type === 'single') {
      targetPaceS = plannedPaceInfo.targetSeconds || null;
      console.log(`🔍 [MILE BREAKDOWN] Single target: ${targetPaceS}`);
    }
  }

  // Fallback: try to extract from intervals if plannedPaceInfo not available
  if (!targetLower && !targetPaceS) {
    console.log(`🔍 [MILE BREAKDOWN] Falling back to interval extraction`);
    const paceRange = workIntervals[0]?.pace_range || workIntervals[0]?.target_pace || null;
    console.log(`🔍 [MILE BREAKDOWN] paceRange from interval:`, paceRange);
    targetLower = paceRange?.lower || null;
    targetUpper = paceRange?.upper || null;
    targetPaceS = paceRange?.lower && paceRange?.lower === paceRange?.upper ? paceRange.lower : null;
    isRangeWorkout = !!(targetLower && targetUpper && targetLower !== targetUpper);
    console.log(`🔍 [MILE BREAKDOWN] Extracted from interval: lower=${targetLower}, upper=${targetUpper}, isRange=${isRangeWorkout}`);
  }

  // Get total distance from work intervals (distance is in executed object)
  const totalDistanceM = workIntervals.reduce((sum, i) => sum + (i.executed?.distance_m || 0), 0);
  const totalDistanceMi = totalDistanceM / 1609.34;

  console.log(`🔍 [MILE BREAKDOWN] Total distance: ${totalDistanceM.toFixed(2)}m (${totalDistanceMi.toFixed(2)} miles)`);

  if (totalDistanceMi < 0.5) {
    console.log(`⚠️ [MILE BREAKDOWN] Distance too short: ${totalDistanceMi.toFixed(2)} miles`);
    return null; // Too short for mile breakdown
  }

  // Cumulative distance from speed samples (same as before), then scale to executed distance so
  // mile boundaries align with workout totals (single source of truth vs interval distance).
  const len = sensorData.length;
  const cumDistRaw = new Float64Array(len);
  let runningM = 0;
  for (let i = 0; i < len; i++) {
    const s = sensorData[i];
    if (s.pace_s_per_mi && s.pace_s_per_mi > 0) {
      runningM += (1609.34 / s.pace_s_per_mi) * (s.duration_s || 1);
    }
    cumDistRaw[i] = runningM;
  }
  const rawEnd = cumDistRaw[len - 1] || 0;
  const scale = rawEnd > 10 && totalDistanceM > 0 ? totalDistanceM / rawEnd : 1;
  const cumDist = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    cumDist[i] = cumDistRaw[i] * scale;
  }
  const cumulativeDistanceM = cumDist[len - 1] || rawEnd;

  const cumTime = buildCumulativeTimeSec(sensorData);

  console.log(
    `🔍 [MILE BREAKDOWN] Cumulative distance: ${cumulativeDistanceM.toFixed(0)}m (${(cumulativeDistanceM / 1609.34).toFixed(1)} mi), scale=${scale.toFixed(4)} vs raw ${rawEnd.toFixed(0)}m`,
  );

  const mileSplits: any[] = [];
  const miles = Math.floor(totalDistanceMi);
  let searchStart = 0;

  for (let mile = 1; mile <= miles; mile++) {
    const mileStartM = (mile - 1) * 1609.34;
    const mileEndM = mile * 1609.34;

    const t0 = timeAtDistance(cumDist, cumTime, len, mileStartM);
    const t1 = timeAtDistance(cumDist, cumTime, len, mileEndM);
    if (t0 == null || t1 == null || t1 <= t0) continue;

    const segmentM = mileEndM - mileStartM;
    const avgPaceS = ((t1 - t0) / segmentM) * 1609.34;

    let hrSum = 0;
    let hrCount = 0;
    let firstElev: number | null = null;
    let lastElev: number | null = null;

    for (let i = searchStart; i < len; i++) {
      const d = cumDist[i];
      if (d < mileStartM) continue;
      if (d >= mileEndM) {
        searchStart = i;
        break;
      }

      const s = sensorData[i];
      const hr = s.heartRate ?? s.heart_rate ?? s.hr ?? s.heartRateInBeatsPerMinute;
      if (typeof hr === 'number' && hr > 40 && hr < 250) {
        hrSum += hr;
        hrCount++;
      }
      const elev = s.elevation_m ?? s.elevation ?? s.elevationInMeters ?? null;
      if (elev != null && Number.isFinite(elev)) {
        if (firstElev === null) firstElev = elev;
        lastElev = elev;
      }
    }

    if (!(avgPaceS > 0 && avgPaceS < 3600)) continue;

    const avgHrBpm = hrCount > 0 ? Math.round(hrSum / hrCount) : null;
    const elevGain = firstElev != null && lastElev != null ? Math.max(0, lastElev - firstElev) : null;
    const gradePercent = firstElev != null && lastElev != null
      ? ((lastElev - firstElev) / 1609.34) * 100
      : null;

    mileSplits.push({
      mile,
      pace_s_per_mi: avgPaceS,
      avg_hr_bpm: avgHrBpm,
      elevation_gain_m: elevGain,
      grade_percent: gradePercent,
      terrain_type: gradePercent != null && Math.abs(gradePercent) > 0.5
        ? (gradePercent > 0 ? 'uphill' : 'downhill')
        : 'flat',
      start_elevation_m: firstElev,
      end_elevation_m: lastElev,
    });
  }

  if (mileSplits.length === 0) {
    console.log('⚠️ [MILE BREAKDOWN] No mile splits generated.');
    return null;
  }

  console.log(`✅ [MILE BREAKDOWN] Generated ${mileSplits.length} mile splits from ${len} samples`);

  // Format as text section for UI display
  const formatPace = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  let sectionText = 'MILE-BY-MILE TERRAIN BREAKDOWN (Work Portion):\n\n';

  // Display target range or single target once at the top
  if (isRangeWorkout && targetLower && targetUpper) {
    sectionText += `Target range: ${formatPace(targetLower)}-${formatPace(targetUpper)}/mi\n\n`;
  } else if (targetPaceS) {
    sectionText += `Target pace: ${formatPace(targetPaceS)}/mi\n\n`;
  } else if (targetLower) {
    sectionText += `Target pace: ${formatPace(targetLower)}/mi\n\n`;
  }

  // Calculate target pace for single-target comparisons (use midpoint for range workouts if no single target)
  if (!targetPaceS && isRangeWorkout && targetLower && targetUpper) {
    targetPaceS = (targetLower + targetUpper) / 2; // Use midpoint for range workouts when comparing
  } else if (!targetPaceS && targetLower) {
    targetPaceS = targetLower; // Use lower bound if no single target set
  }

  // Analyze each mile
  let milesInRange = 0;
  const mileDetails: string[] = [];

  // Debug: Log range values
  if (targetLower && targetUpper) {
    console.log(`🔍 [MILE BREAKDOWN] Range: ${targetLower}s (${formatPace(targetLower)}) to ${targetUpper}s (${formatPace(targetUpper)})`);
  } else if (targetPaceS) {
    console.log(`🔍 [MILE BREAKDOWN] Target pace: ${targetPaceS}s (${formatPace(targetPaceS)})`);
  } else {
    console.log(`🔍 [MILE BREAKDOWN] No target pace range available`);
  }

  mileSplits.forEach(split => {
    const paceStr = formatPace(split.pace_s_per_mi);
    const milePaceSeconds = split.pace_s_per_mi;

    // Compare to target
    let comparison = '';
    let deltaS = 0;
    let inRange = false;

    if (isRangeWorkout && targetLower && targetUpper) {
      console.log(`🔍 [MILE ${split.mile}] Pace: ${paceStr} (${milePaceSeconds}s), Range: ${targetLower}-${targetUpper}s`);
      console.log(`   Within? ${milePaceSeconds >= targetLower && milePaceSeconds <= targetUpper}`);

      if (milePaceSeconds >= targetLower && milePaceSeconds <= targetUpper) {
        comparison = '✓ Within range';
        inRange = true;
        milesInRange++;
        deltaS = 0;
        console.log(`   ✅ Mile ${split.mile} WITHIN RANGE`);
      } else if (milePaceSeconds < targetLower) {
        deltaS = targetLower - milePaceSeconds;
        const deltaMin = Math.floor(deltaS / 60);
        const deltaSec = Math.round(deltaS % 60);
        comparison = `${deltaMin}:${String(deltaSec).padStart(2, '0')} faster than range start`;
        console.log(`   ⚡ Mile ${split.mile} FASTER by ${deltaS}s`);
      } else {
        deltaS = milePaceSeconds - targetUpper;
        const deltaMin = Math.floor(deltaS / 60);
        const deltaSec = Math.round(deltaS % 60);
        comparison = `${deltaMin}:${String(deltaSec).padStart(2, '0')} slower than range end`;
        console.log(`   🐌 Mile ${split.mile} SLOWER by ${deltaS}s`);
      }
    } else if (targetPaceS) {
      deltaS = milePaceSeconds - targetPaceS;
      const deltaAbs = Math.abs(deltaS);
      const deltaMin = Math.floor(deltaAbs / 60);
      const deltaSec = Math.round(deltaAbs % 60);
      const sign = deltaS > 0 ? '+' : '-';

      if (deltaAbs < 5) {
        comparison = '✓ On target';
        inRange = true;
        milesInRange++;
      } else {
        comparison = `${sign}${deltaMin}:${String(deltaSec).padStart(2, '0')} ${deltaS > 0 ? 'slower' : 'faster'} than target`;
      }
    }

    // Build terrain info if available
    let terrainInfo = '';
    if (split.grade_percent != null && split.elevation_gain_m != null) {
      const gradeStr = split.grade_percent.toFixed(1);
      const elevStr = Math.round(split.elevation_gain_m * 3.28084); // Convert to feet
      terrainInfo = ` on ${split.terrain_type} (${gradeStr}% grade, +${elevStr}ft)`;
    }

    let statusLine = '';
    if (inRange) {
      statusLine = `→ ✓ Within range`;
    } else {
      statusLine = `→ ${comparison}`;
    }

    mileDetails.push(`Mile ${split.mile}: ${paceStr}/mi${terrainInfo}\n${statusLine}`);
  });

  console.log(`✅ [MILE BREAKDOWN] Final count: ${milesInRange} of ${mileSplits.length} miles within range`);

  sectionText += mileDetails.join('\n\n') + '\n\n';

  // Add pattern analysis
  sectionText += 'PATTERN ANALYSIS:\n';

  const avgPaceS = workoutAvgPaceSeconds != null && workoutAvgPaceSeconds > 0
    ? workoutAvgPaceSeconds
    : (mileSplits.length > 0
        ? mileSplits.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / mileSplits.length
        : 0);

  const timeBasedAdherence = granularAnalysis?.overall_adherence != null
    ? Math.round(granularAnalysis.overall_adherence * 100)
    : null;

  const inRangePct = Math.round((milesInRange / mileSplits.length) * 100);

  if (timeBasedAdherence != null) {
    sectionText += `- Time spent in range: ${timeBasedAdherence}% (${timeBasedAdherence >= 50 ? 'good' : timeBasedAdherence >= 30 ? 'moderate' : 'poor'} overall pace judgment)\n`;
  }
  sectionText += `- Complete miles in range: ${milesInRange} of ${mileSplits.length} (${inRangePct}%${inRangePct >= 50 ? ' - good consistency' : inRangePct >= 30 ? ' - moderate consistency' : ' - poor consistency'})\n`;

  if (isRangeWorkout && targetLower && targetUpper) {
    if (avgPaceS >= targetLower && avgPaceS <= targetUpper) {
      sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (within range ✓)\n`;
    } else if (avgPaceS < targetLower) {
      const delta = targetLower - avgPaceS;
      const deltaMin = Math.floor(delta / 60);
      const deltaSec = Math.round(delta % 60);
      if (delta <= 5) {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (essentially within range, just ${deltaSec}s faster than range start)\n`;
      } else {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (${deltaMin}:${String(deltaSec).padStart(2, '0')} faster than range start)\n`;
      }
    } else {
      const delta = avgPaceS - targetUpper;
      const deltaMin = Math.floor(delta / 60);
      const deltaSec = Math.round(delta % 60);
      if (delta <= 5) {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (essentially within range, just ${deltaSec}s slower than range end)\n`;
      } else {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (${deltaMin}:${String(deltaSec).padStart(2, '0')} slower than range end)\n`;
      }
    }
  } else if (targetPaceS) {
    const delta = avgPaceS - targetPaceS;
    const deltaAbs = Math.abs(delta);
    const deltaMin = Math.floor(deltaAbs / 60);
    const deltaSec = Math.round(deltaAbs % 60);
    const sign = delta > 0 ? '+' : '-';
    sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (${sign}${deltaMin}:${String(deltaSec).padStart(2, '0')} vs target)\n`;
  }

  const fastMiles = isRangeWorkout && targetLower
    ? mileSplits.filter(s => s.pace_s_per_mi < targetLower)
    : [];
  const slowMiles = isRangeWorkout && targetUpper
    ? mileSplits.filter(s => s.pace_s_per_mi > targetUpper)
    : [];
  const inRangeMiles = isRangeWorkout && targetLower && targetUpper
    ? mileSplits.filter(s => s.pace_s_per_mi >= targetLower && s.pace_s_per_mi <= targetUpper)
    : [];

  if (isRangeWorkout) {
    if (inRangeMiles.length > 0) {
      const inRangeNumbers = inRangeMiles.map(s => s.mile).join(', ');
      sectionText += `- Within range: Miles ${inRangeNumbers} (${inRangeMiles.length} of ${mileSplits.length})\n`;
    }
    if (fastMiles.length > 0) {
      const fastMileNumbers = fastMiles.map(s => s.mile).join(', ');
      sectionText += `- Faster than range: Miles ${fastMileNumbers} (${fastMiles.length} of ${mileSplits.length})\n`;
    }
    if (slowMiles.length > 0) {
      const slowMileNumbers = slowMiles.map(s => s.mile).join(', ');
      sectionText += `- Slower than range: Miles ${slowMileNumbers} (${slowMiles.length} of ${mileSplits.length})\n`;
    }
  }

  const avgPaceFormatted = formatPace(avgPaceS);
  const avgPaceInRange = isRangeWorkout && targetLower && targetUpper
    ? (avgPaceS >= targetLower && avgPaceS <= targetUpper)
    : false;
  const avgPaceNearRange = isRangeWorkout && targetLower && targetUpper
    ? (avgPaceS < targetLower && (targetLower - avgPaceS) <= 5) || (avgPaceS > targetUpper && (avgPaceS - targetUpper) <= 5)
    : false;

  if (inRangePct >= 75) {
    sectionText += `- Overall: Excellent pace discipline for easy run${timeBasedAdherence != null ? `. The ${timeBasedAdherence}% time-in-range demonstrates consistent execution.` : '.'}\n`;
  } else if (inRangePct >= 50) {
    if (avgPaceInRange || avgPaceNearRange) {
      const paceStatus = avgPaceInRange ? 'within range' : 'essentially within range';
      sectionText += `- Overall: Good average pace control (${avgPaceFormatted}/mi ${paceStatus}). Primary opportunity: improve mile-to-mile consistency—only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) suggests pacing instability.${timeBasedAdherence != null ? ` The ${timeBasedAdherence}% time-in-range shows good pace judgment.` : ''}\n`;
    } else {
      sectionText += `- Overall: Good pace discipline for easy run${timeBasedAdherence != null ? `. The ${timeBasedAdherence}% time-in-range demonstrates good pace judgment, but only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) reveals inconsistent execution.` : '.'}\n`;
    }
  } else {
    if (avgPaceInRange || avgPaceNearRange) {
      const paceStatus = avgPaceInRange ? 'within range' : 'essentially within target';
      if (timeBasedAdherence != null && timeBasedAdherence > inRangePct) {
        sectionText += `- Overall: Excellent average pace control (${avgPaceFormatted}, within range). The ${timeBasedAdherence}% time-in-range demonstrates good pace judgment, but only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) reveals inconsistent execution within individual miles. This discrepancy indicates a surge-and-fade pattern—hitting the correct pace intermittently throughout each mile rather than maintaining steady effort. Primary opportunity: develop more consistent rhythm within each mile, not just achieving the right average pace.\n`;
      } else {
        sectionText += `- Overall: Excellent average pace control (${paceStatus}). Primary opportunity: improve mile-to-mile consistency—only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) indicates pacing instability across the run.${timeBasedAdherence != null ? ` The ${timeBasedAdherence}% time-in-range shows good pace judgment.` : ''}\n`;
      }
    } else {
      sectionText += `- Overall: Needs improvement - focus on staying within range${timeBasedAdherence != null ? `. The ${timeBasedAdherence}% time-in-range shows some pace judgment, but only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) reveals inconsistent execution.` : '.'}\n`;
    }
  }

  return {
    available: true,
    section: sectionText,
    splits: mileSplits,
    total_miles: mileSplits.length,
    miles_in_range: milesInRange,
    average_pace_s_per_mi: avgPaceS
  };
}
