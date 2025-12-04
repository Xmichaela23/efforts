/**
 * Calculate heart rate metrics for a specific interval
 */
export function calculateIntervalHeartRate(
  sensorData: any[],
  sampleStart?: number,
  sampleEnd?: number
): {
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  min_heart_rate_bpm: number | null;
} {
  if (sampleStart === undefined || sampleEnd === undefined || !sensorData || sensorData.length === 0) {
    return {
      avg_heart_rate_bpm: null,
      max_heart_rate_bpm: null,
      min_heart_rate_bpm: null
    };
  }
  
  const intervalSamples = sensorData.slice(sampleStart, sampleEnd + 1)
    .filter(s => s.heart_rate != null && s.heart_rate > 0 && s.heart_rate < 250);
  
  if (intervalSamples.length === 0) {
    return {
      avg_heart_rate_bpm: null,
      max_heart_rate_bpm: null,
      min_heart_rate_bpm: null
    };
  }
  
  const heartRates = intervalSamples.map(s => s.heart_rate);
  
  if (heartRates.length === 0) {
    return {
      avg_heart_rate_bpm: null,
      max_heart_rate_bpm: null,
      min_heart_rate_bpm: null
    };
  }
  
  const avg = heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length;
  const max = Math.max(...heartRates);
  const min = Math.min(...heartRates);
  
  return {
    avg_heart_rate_bpm: Math.round(avg),
    max_heart_rate_bpm: Math.round(max),
    min_heart_rate_bpm: Math.round(min)
  };
}

