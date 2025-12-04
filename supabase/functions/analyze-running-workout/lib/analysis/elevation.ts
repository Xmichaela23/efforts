/**
 * Calculate elevation metrics for a specific interval
 */
export function calculateIntervalElevation(
  sensorData: any[],
  sampleStart?: number,
  sampleEnd?: number
): {
  elevation_start_m: number | null;
  elevation_end_m: number | null;
  elevation_gain_m: number;
  elevation_loss_m: number;
  net_elevation_change_m: number | null;
  avg_grade_percent: number | null;
} {
  if (sampleStart === undefined || sampleEnd === undefined || !sensorData || sensorData.length === 0) {
    return {
      elevation_start_m: null,
      elevation_end_m: null,
      elevation_gain_m: 0,
      elevation_loss_m: 0,
      net_elevation_change_m: null,
      avg_grade_percent: null
    };
  }
  
  const intervalSamples = sensorData.slice(sampleStart, sampleEnd + 1);
  const elevations = intervalSamples
    .map(s => s.elevation_m || s.elevation || s.elevationInMeters)
    .filter(e => e != null && Number.isFinite(e));
  
  if (elevations.length === 0) {
    return {
      elevation_start_m: null,
      elevation_end_m: null,
      elevation_gain_m: 0,
      elevation_loss_m: 0,
      net_elevation_change_m: null,
      avg_grade_percent: null
    };
  }
  
  const elevationStart = elevations[0];
  const elevationEnd = elevations[elevations.length - 1];
  
  let elevationGain = 0;
  let elevationLoss = 0;
  
  for (let i = 1; i < elevations.length; i++) {
    const delta = elevations[i] - elevations[i - 1];
    if (delta > 0) {
      elevationGain += delta;
    } else if (delta < 0) {
      elevationLoss += Math.abs(delta);
    }
  }
  
  // Calculate average grade - need distance for this
  let avgGrade = null;
  const distances = intervalSamples
    .map(s => s.distance_m || s.distance || 0)
    .filter(d => d != null && Number.isFinite(d) && d > 0);
  
  if (distances.length > 1) {
    const totalDistanceM = distances[distances.length - 1] - distances[0];
    if (totalDistanceM > 0) {
      const netElevationChangeM = elevationEnd - elevationStart;
      avgGrade = (netElevationChangeM / totalDistanceM) * 100;
    }
  }
  
  return {
    elevation_start_m: Math.round(elevationStart * 10) / 10,
    elevation_end_m: Math.round(elevationEnd * 10) / 10,
    elevation_gain_m: Math.round(elevationGain * 10) / 10,
    elevation_loss_m: Math.round(elevationLoss * 10) / 10,
    net_elevation_change_m: Math.round((elevationEnd - elevationStart) * 10) / 10,
    avg_grade_percent: avgGrade != null ? Math.round(avgGrade * 10) / 10 : null
  };
}

