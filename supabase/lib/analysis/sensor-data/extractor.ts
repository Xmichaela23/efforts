/**
 * Shared Sensor Data Extraction Utilities
 * 
 * Used by:
 * - analyze-running-workout (extractSensorData)
 * - compute-workout-analysis (normalizeSamples)
 */

/**
 * Extract sensor data from various formats (Garmin, Strava, etc.)
 * Handles arrays, objects, JSON strings
 * Returns normalized sensor samples with pace, HR, elevation, power
 */
export function extractSensorData(data: any): any[] {
  console.log('🔍 Data type:', typeof data);
  console.log('🔍 Data is array:', Array.isArray(data));
  console.log('🔍 Data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
  
  if (!data) {
    console.log('⚠️ Data is null or undefined.');
    return [];
  }

  // Handle different data structures
  let dataArray = [];
  
  if (Array.isArray(data)) {
    // Direct array
    dataArray = data;
  } else if (typeof data === 'string') {
    // JSON string - try to parse it
    console.log('🔍 Parsing JSON string...');
    try {
      const parsed = JSON.parse(data);
      console.log('🔍 Parsed JSON type:', typeof parsed);
      console.log('🔍 Parsed JSON is array:', Array.isArray(parsed));
      
      if (Array.isArray(parsed)) {
        dataArray = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Check if it's an object with array properties
        if (parsed.samples && Array.isArray(parsed.samples)) {
          dataArray = parsed.samples;
        } else if (parsed.data && Array.isArray(parsed.data)) {
          dataArray = parsed.data;
        } else if (parsed.series && Array.isArray(parsed.series)) {
          dataArray = parsed.series;
        } else {
          console.log('⚠️ Parsed JSON is an object but no array property found.');
          console.log('🔍 Available properties:', Object.keys(parsed));
          return [];
        }
      } else {
        console.log('⚠️ Parsed JSON is not an array or object.');
        return [];
      }
    } catch (error) {
      console.log('⚠️ Failed to parse JSON string:', error.message);
      return [];
    }
  } else if (data && typeof data === 'object') {
    // Check if it's an object with array properties
    if (data.samples && Array.isArray(data.samples)) {
      dataArray = data.samples;
    } else if (data.data && Array.isArray(data.data)) {
      dataArray = data.data;
    } else if (data.series && Array.isArray(data.series)) {
      dataArray = data.series;
    } else if (data.intervals && Array.isArray(data.intervals)) {
      // Check if it's already processed analysis data
      console.log('🔍 Found intervals in computed data, checking for sensor data...');
      console.log('🔍 Intervals structure:', JSON.stringify(data.intervals[0], null, 2));
      // This might be processed analysis, not raw sensor data
      return [];
    } else {
      console.log('⚠️ Data is an object but no array property found.');
      console.log('🔍 Available properties:', Object.keys(data));
      console.log('🔍 Full data structure:', JSON.stringify(data, null, 2));
      return [];
    }
  } else {
    console.log('⚠️ Data is not an array, object, or string.');
    return [];
  }

  console.log(`📊 Raw sensor data length: ${dataArray.length}`);

  if (dataArray.length === 0) {
    console.log('⚠️ Sensor data array is empty.');
    return [];
  }

  // Log first few samples to understand structure
  console.log('🔍 First sample structure:', JSON.stringify(dataArray[0], null, 2));

  // Extract pace directly from available data sources
  const filteredSamples = dataArray.map((sample: any, index: number) => {
    // Check if sample has the required structure
    if (!sample || typeof sample !== 'object') {
      return null;
    }

    // Skip first sample as we need previous sample for cumulative distance calculations
    if (index === 0) return null;
    
    const prevSample = dataArray[index - 1];
    if (!prevSample) return null;

    // Extract pace using primary data sources - check multiple field name variations
    let pace_s_per_mi: number | null = null;
    let dataSource = 'unknown';
    
    // Get speed from various possible field names (Garmin API uses different names)
    const speedMps = sample.speedMetersPerSecond 
      ?? sample.speedInMetersPerSecond
      ?? sample.enhancedSpeedInMetersPerSecond
      ?? sample.currentSpeedInMetersPerSecond
      ?? sample.instantaneousSpeedInMetersPerSecond
      ?? sample.speed_mps
      ?? sample.enhancedSpeed;
    
    // Priority 1: Direct speed from device (Best - use this when available)
    if (speedMps != null && speedMps > 0) {
      pace_s_per_mi = 1609.34 / speedMps; // Convert m/s directly to s/mi
      dataSource = 'device_speed';
    }
    // Priority 2: Calculate from cumulative distance (Good - use this when speed not available)
    else {
      // Check multiple field name variations for distance
      const distMeters = sample.totalDistanceInMeters 
        ?? sample.distanceInMeters
        ?? sample.cumulativeDistanceInMeters
        ?? sample.totalDistance
        ?? sample.distance;
      
      const prevDistMeters = prevSample.totalDistanceInMeters
        ?? prevSample.distanceInMeters
        ?? prevSample.cumulativeDistanceInMeters
        ?? prevSample.totalDistance
        ?? prevSample.distance;
      
      if (distMeters != null && prevDistMeters != null) {
        const distanceDelta = distMeters - prevDistMeters;
        const timeDelta = sample.timestamp - prevSample.timestamp;
        
        if (distanceDelta > 0 && timeDelta > 0) {
          const speedMPS = distanceDelta / timeDelta;
          if (speedMPS > 0.5 && speedMPS < 10) { // Realistic running speeds
            pace_s_per_mi = 1609.34 / speedMPS; // Convert m/s directly to s/mi
            dataSource = 'cumulative_distance';
          }
        }
      }
    }

    if (pace_s_per_mi == null || pace_s_per_mi <= 0) {
      return null; // Filter out samples with no valid pace data
    }

    // Extract elevation from various possible field names
    const elevationM = sample.elevation 
      ?? sample.elevationInMeters 
      ?? sample.elevation_m 
      ?? sample.elev_m 
      ?? sample.altitude 
      ?? null;

    return {
      timestamp: sample.timestamp || index,
      pace_s_per_mi: pace_s_per_mi,
      power_w: sample.power || null,
      heart_rate: sample.heartRate || sample.heart_rate || null,
      elevation_m: elevationM != null && Number.isFinite(elevationM) ? Number(elevationM) : null,
      duration_s: 1,
      data_source: dataSource
    };
  }).filter(Boolean); // Remove null entries

  // Log data source distribution
  const dataSourceCounts = filteredSamples.reduce((acc: any, sample: any) => {
    const source = sample.data_source || 'unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`✅ Extracted ${filteredSamples.length} valid sensor samples.`);
  console.log('📊 Data source distribution:', dataSourceCounts);
  
  // Add data quality metadata
  const totalSamples = filteredSamples.length;
  const deviceSpeedPct = totalSamples > 0 ? (dataSourceCounts.device_speed || 0) / totalSamples : 0;
  const cumulativeDistancePct = totalSamples > 0 ? (dataSourceCounts.cumulative_distance || 0) / totalSamples : 0;
  const gpsCalculationPct = totalSamples > 0 ? (dataSourceCounts.gps_calculation || 0) / totalSamples : 0;
  
  // Calculate confidence level based on data source quality
  let confidenceLevel = 'low';
  if (deviceSpeedPct > 0.8) {
    confidenceLevel = 'high';
  } else if (deviceSpeedPct > 0.3 || cumulativeDistancePct > 0.5) {
    confidenceLevel = 'medium';
  }
  
  console.log(`📊 Data quality: ${(deviceSpeedPct * 100).toFixed(1)}% device speed, ${(cumulativeDistancePct * 100).toFixed(1)}% cumulative distance, ${(gpsCalculationPct * 100).toFixed(1)}% GPS calculation`);
  console.log(`🎯 Confidence level: ${confidenceLevel}`);
  
  // Add data quality metadata to each sample for later use
  const samplesWithQuality = filteredSamples.map(sample => ({
    ...sample,
    data_quality: {
      device_speed_coverage: deviceSpeedPct,
      cumulative_distance_coverage: cumulativeDistancePct,
      gps_calculation_coverage: gpsCalculationPct,
      confidence_level: confidenceLevel
    }
  }));
  
  return samplesWithQuality;
}

/**
 * Normalize sensor samples to standard format
 * Used by compute-workout-analysis for chart data
 */
export function normalizeSamples(samplesIn: any[]): Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> {
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










