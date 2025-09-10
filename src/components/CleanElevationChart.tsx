import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Area } from 'recharts';



interface CleanElevationChartProps {
  gpsTrack: any[] | null;
  sensorData: any[] | null;
  workoutType: string;
  selectedMetric: string;
  useImperial: boolean;
  analysisSeries?: any | null; // optional server-computed series
}

const CleanElevationChart: React.FC<CleanElevationChartProps> = ({ 
  gpsTrack, 
  sensorData,
  workoutType, 
  selectedMetric: externalSelectedMetric,
  useImperial,
  analysisSeries
}) => {
  const [selectedMetric, setSelectedMetric] = useState<'pace' | 'heartrate' | 'vam'>('pace');

  // Read CSS variables (with fallbacks) for minimal/mobile visuals
  const theme = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        pace: '#3b82f6',
        gap: '#6366f1',
        hr: '#ef4444',
        cadence: '#10b981',
        elevStroke: '#9ca3af',
        grid: 'rgba(0,0,0,0.05)',
        textSecondary: '#666666',
        lw: { pace: 2, hr: 1.5, cadence: 1 },
        op: { pace: 1, hr: 0.6, cadence: 0.5 }
      } as const;
    }
    const css = getComputedStyle(document.documentElement);
    const val = (name: string, fallback: string) => (css.getPropertyValue(name) || fallback).trim();
    const num = (name: string, fallback: number) => {
      const v = css.getPropertyValue(name).trim().replace('px','');
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const opNum = (name: string, fallback: number) => {
      const v = Number(css.getPropertyValue(name).trim());
      return Number.isFinite(v) ? v : fallback;
    };
    return {
      pace: val('--series-pace', '#3b82f6'),
      gap: val('--series-gap', '#6366f1'),
      hr: val('--series-hr', '#ef4444'),
      cadence: val('--series-cadence', '#10b981'),
      elevStroke: val('--series-elev-stroke', '#9ca3af'),
      grid: val('--grid-hairline', 'rgba(0,0,0,0.05)'),
      textSecondary: val('--text-secondary', '#666666'),
      lw: {
        pace: num('--lw-pace', 2),
        hr: num('--lw-hr', 1.5),
        cadence: num('--lw-cadence', 1)
      },
      op: {
        pace: opNum('--op-pace', 1),
        hr: opNum('--op-hr', 0.6),
        cadence: opNum('--op-cadence', 0.5)
      }
    } as const;
  }, []);
  
  // Sync with external selectedMetric prop
  React.useEffect(() => {
    if (externalSelectedMetric === 'speed') {
      setSelectedMetric('pace');
    } else if (externalSelectedMetric === 'heartrate') {
      setSelectedMetric('heartrate');
    } else if (externalSelectedMetric === 'vam') {
      setSelectedMetric('vam');
    }
  }, [externalSelectedMetric]);


  // Early return only if neither server series nor GPS data exists
  const hasServerSeries = analysisSeries && (Array.isArray((analysisSeries as any).distance_m) || Array.isArray((analysisSeries as any).time_s));
  if (!hasServerSeries && (!gpsTrack || gpsTrack.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <div className="text-gray-500 text-lg mb-2">No GPS data available</div>
          <div className="text-gray-400 text-sm">This workout doesn't have GPS tracking data</div>
        </div>
      </div>
    );
  }

  // Calculate distance between two GPS points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Sample data to 1000 points for smooth, Strava-quality charts
  const sampleData = (data: any[], targetSamples: number = 1000) => {
    if (data.length <= targetSamples) return data;
    
    const step = data.length / targetSamples;
    const sampled = [];
    
    for (let i = 0; i < targetSamples; i++) {
      const index = Math.floor(i * step);
      sampled.push(data[index]);
    }
    
    return sampled;
  };

  // Normalize timestamps to seconds
  const getTimeSeconds = (p: any): number | null => {
    const raw = p?.timestamp ?? p?.startTimeInSeconds ?? null;
    if (raw == null) return null;
    const n = Number(raw);
    // If ms epoch, convert to seconds
    return n > 1e12 ? n / 1000 : n;
  };

  // Process data for chart (prefer server series)
  const chartData = useMemo(() => {
    // Prefer server-computed series when present, but only if elevation is usable
    if (analysisSeries && typeof analysisSeries === 'object') {
      try {
        const t = Array.isArray(analysisSeries.time) ? analysisSeries.time : (Array.isArray(analysisSeries.time_s) ? analysisSeries.time_s : []);
        const distance_m = Array.isArray(analysisSeries.distance_m) ? analysisSeries.distance_m : [];
        const elevation_m = Array.isArray(analysisSeries.elevation_m) ? analysisSeries.elevation_m : [];
        const pace_s_per_km = Array.isArray(analysisSeries.pace_s_per_km) ? analysisSeries.pace_s_per_km : [];
        const hr_bpm = Array.isArray(analysisSeries.hr_bpm) ? analysisSeries.hr_bpm : [];
        const cadence_spm = Array.isArray(analysisSeries.cadence_spm) ? analysisSeries.cadence_spm : [];
        const validElevCount = elevation_m.filter((v: any) => Number.isFinite(v)).length;
        const hasUsableElev = validElevCount >= 3 && distance_m.length >= 3;
        if (hasUsableElev) {
          const N = Math.max(distance_m.length, elevation_m.length, pace_s_per_km.length, hr_bpm.length, cadence_spm.length, t.length);
          const out: Array<{ distance: number; absoluteElevation: number | null; metricValue: number | null }> = [];
          let baseElevation: number | null = null;
          for (let i = 0; i < N; i += 1) {
            const distMi = Number.isFinite(distance_m[i]) ? (distance_m[i] / 1609.34) : (Number.isFinite(distance_m[i]) ? (distance_m[i] as number) : 0);
            const elevVal = Number.isFinite(elevation_m[i]) ? (useImperial ? elevation_m[i] * 3.28084 : elevation_m[i]) : null;
            if (baseElevation == null && elevVal != null) baseElevation = elevVal;
            const elev = elevVal;
            let metric: number | null = null;
            if (selectedMetric === 'pace') {
              metric = Number.isFinite(pace_s_per_km[i]) ? (pace_s_per_km[i] as number) : null;
            } else if (selectedMetric === 'heartrate') {
              metric = Number.isFinite(hr_bpm[i]) ? (hr_bpm[i] as number) : null;
            } else if (selectedMetric === 'vam') {
              metric = null; // server series may add vam later; keep null for now
            }
            out.push({ distance: parseFloat((distMi || 0).toFixed(2)), absoluteElevation: elev, metricValue: metric });
          }
          return out;
        }
      } catch {}
    }

    if (!gpsTrack || gpsTrack.length === 0) return [];
    
    // Sample GPS track based on selected metric for optimal smoothness
    let targetSamples = 1000; // Default for heart rate and VAM
    if (selectedMetric === 'pace') {
      targetSamples = 500; // Super smooth for pace
    }
    
    const sampledGpsTrack = sampleData(gpsTrack, targetSamples);
    
    let cumulativeDistance = 0;
    let baseElevation = null;
    
    return sampledGpsTrack.map((point, index) => {
      // Calculate cumulative distance
      if (index > 0) {
        const prevPoint = sampledGpsTrack[index - 1];
        const lat1 = prevPoint.lat || prevPoint.latitudeInDegree;
        const lon1 = prevPoint.lng || prevPoint.longitudeInDegree;
        const lat2 = point.lat || point.latitudeInDegree;
        const lon2 = point.lng || point.longitudeInDegree;
        
        if (lat1 && lon1 && lat2 && lon2) {
          cumulativeDistance += calculateDistance(lat1, lon1, lat2, lon2);
        }
      }
      
      // Get elevation data
      const elevationMeters = point.elevation || point.altitude || 0;
      const elevationImperial = useImperial ? elevationMeters * 3.28084 : elevationMeters;
      
      // Set base elevation to first point
      if (baseElevation === null) {
        baseElevation = elevationImperial;
      }
      
      // Calculate metric value based on selection
      let metricValue = null;
      switch (selectedMetric) {
        case 'pace': {
          // Use Strava-like smoothing: prefer smoothed speed (speed_mps) with a short rolling window
          const windowSec = 12; // ~10–15s smoothing
          const tCurr = getTimeSeconds(point);
          if (tCurr != null && index > 0) {
            // Find the earliest index within the time window
            let j = index - 1;
            while (j > 0) {
              const tPrev = getTimeSeconds(sampledGpsTrack[j]);
              if (tPrev != null && (tCurr - tPrev) >= windowSec) break;
              j--;
            }
            // Try averaging speed_mps if available
            let hasSpeed = false;
            let sumSpeedMps = 0;
            let countSpeed = 0;
            for (let k = j; k <= index; k++) {
              const s = sampledGpsTrack[k]?.speed_mps;
              if (Number.isFinite(s)) {
                hasSpeed = true;
                sumSpeedMps += s;
                countSpeed++;
              }
            }
            let speedMpsAvg: number | null = null;
            if (hasSpeed && countSpeed > 0) speedMpsAvg = sumSpeedMps / countSpeed;
            // Fallback: compute distance/time over window
            if (!Number.isFinite(speedMpsAvg as number)) {
              let distMiles = 0;
              for (let k = j + 1; k <= index; k++) {
                const a = sampledGpsTrack[k - 1];
                const b = sampledGpsTrack[k];
                const d = calculateDistance(
                  a.lat || a.latitudeInDegree, a.lng || a.longitudeInDegree,
                  b.lat || b.latitudeInDegree, b.lng || b.longitudeInDegree
                );
                distMiles += d || 0;
              }
              const tStart = getTimeSeconds(sampledGpsTrack[j]);
              if (tStart != null) {
                const dt = tCurr - tStart; // seconds
                if (dt > 0 && distMiles > 0.02) {
                  const speedMph = (distMiles / dt) * 3600;
                  speedMpsAvg = speedMph * 0.44704; // mph → m/s
                }
              }
            }
            if (Number.isFinite(speedMpsAvg as number) && (speedMpsAvg as number) > 0) {
              // Convert to pace (min/mi)
              const speedMph = (speedMpsAvg as number) * 2.23694;
              const paceMinPerMile = 60 / speedMph;
              metricValue = Math.round(paceMinPerMile * 100) / 100;
            }
          }
          break;
        }
          
        case 'heartrate':
          // Try multiple sources for heart rate data
          let hrValue = null;
          
          // First, check if heart rate is embedded in GPS track
          if (point.heartRate || point.heart_rate || point.hr) {
            hrValue = point.heartRate || point.heart_rate || point.hr;
          }
          // Then try sensor data with wider time window
          else if (sensorData && sensorData.length > 0) {
            const gpsTime = point.timestamp || point.startTimeInSeconds;
            
            // Debug: Log the first few sensor points to see the structure
            if (index === 0) {
              console.log('🔍 Heart Rate Debug - First GPS point:', {
                gpsTime,
                gpsPoint: point
              });
              console.log('🔍 Heart Rate Debug - First 3 sensor points:', sensorData.slice(0, 3));
            }
            
            let sensorPoint = sensorData.find(sensor => 
              sensor.timestamp === gpsTime || 
              sensor.startTimeInSeconds === gpsTime ||
              sensor.timestamp === point.startTimeInSeconds
            );
            
            // If no exact match, find closest within 60 seconds (wider window)
            if (!sensorPoint) {
              if (gpsTime) {
                sensorPoint = sensorData.reduce((closest, sensor) => {
                  const sensorTime = sensor.timestamp || sensor.startTimeInSeconds;
                  if (!sensorTime) return closest;
                  
                  const timeDiff = Math.abs(sensorTime - gpsTime);
                  if (!closest || timeDiff < closest.timeDiff) {
                    return { ...sensor, timeDiff };
                  }
                  return closest;
                }, null);
                
                // Only use if within 60 seconds (wider window)
                if (sensorPoint && sensorPoint.timeDiff <= 60) {
                  hrValue = sensorPoint.heartRate || sensorPoint.heart_rate || sensorPoint.hr;
                }
              }
            } else {
              hrValue = sensorPoint.heartRate || sensorPoint.heart_rate || sensorPoint.hr;
            }
            
            // Debug: Log what we found for this point
            if (index < 5) {
              console.log(`🔍 Heart Rate Debug - Point ${index}:`, {
                gpsTime,
                foundSensorPoint: sensorPoint,
                hrValue,
                sensorDataLength: sensorData.length
              });
            }
          }
          
          metricValue = hrValue;
          
          break;
          
        case 'vam': {
          if (index > 0) {
            // Time-based window for stability (≈ 30s)
            const windowSec = 30;
            const tCurr = getTimeSeconds(point);
            if (tCurr != null) {
              let j = index - 1;
              while (j > 0) {
                const tPrev = getTimeSeconds(sampledGpsTrack[j]);
                if (tPrev != null && (tCurr - tPrev) >= windowSec) break;
                j--;
              }
              let gain = 0;
              let totalSec = 0;
              for (let k = j + 1; k <= index; k++) {
                const a = sampledGpsTrack[k - 1];
                const b = sampledGpsTrack[k];
                const elevA = a.elevation || a.altitude || 0;
                const elevB = b.elevation || b.altitude || 0;
                const tA = getTimeSeconds(a) ?? 0;
                const tB = getTimeSeconds(b) ?? 0;
                const dt = tB - tA;
                if (dt > 0) {
                  gain += (elevB - elevA);
                  totalSec += dt;
                }
              }
              if (totalSec > 0) {
                const vam = gain / (totalSec / 3600); // m per hour
                if (Math.abs(vam) > 5) metricValue = Math.round(vam);
              }
            }
          }
          break;
        }
      }
      
      return {
        distance: parseFloat(cumulativeDistance.toFixed(2)),
        elevation: elevationImperial - baseElevation,
        absoluteElevation: elevationImperial,
        metricValue: metricValue,
        originalIndex: index
      };
    });
  }, [gpsTrack, sensorData, selectedMetric, useImperial, analysisSeries]);

  // Debug logging
  console.log('🔍 CleanElevationChart debug:', {
    gpsTrackLength: gpsTrack?.length,
    sampledGpsLength: gpsTrack ? sampleData(gpsTrack, 1000).length : 0,
    sensorDataLength: sensorData?.length,
    selectedMetric,
    chartDataLength: chartData?.length,
    firstPoint: chartData[0],
    lastPoint: chartData[chartData.length - 1],
    sampleMetricValues: chartData.slice(0, 5).map(point => ({
      distance: point.distance,
      elevation: point.elevation,
      metricValue: point.metricValue
    })),
    // Debug heart rate data specifically
    heartRateDebug: selectedMetric === 'heartrate' ? {
      firstGpsPoint: gpsTrack?.[0] ? {
        heartRate: gpsTrack[0].heartRate,
        heart_rate: gpsTrack[0].heart_rate,
        hr: gpsTrack[0].hr
      } : null,
      firstSensorPoint: sensorData?.[0] ? {
        heartRate: sensorData[0].heartRate,
        heart_rate: sensorData[0].heart_rate,
        hr: sensorData[0].hr,
        timestamp: sensorData[0].timestamp
      } : null
    } : null
  });

  // Get metric label, unit, and line styling
  const getMetricInfo = () => {
    switch (selectedMetric) {
      case 'pace':
        return { label: 'Pace', unit: 'min/mi', color: theme.pace, width: theme.lw.pace, opacity: theme.op.pace, dash: undefined as string | undefined };
      case 'heartrate':
        return { label: 'Heart Rate', unit: 'bpm', color: theme.hr, width: theme.lw.hr, opacity: theme.op.hr, dash: undefined };
      case 'vam':
        return { label: 'VAM', unit: 'm/h', color: theme.cadence, width: theme.lw.cadence, opacity: theme.op.cadence, dash: undefined };
      default:
        return { label: 'Metric', unit: '', color: theme.textSecondary, width: 1, opacity: 0.6, dash: undefined };
    }
  };

  const metricInfo = getMetricInfo();



  console.log('🔍 CleanElevationChart rendering with:', {
    selectedMetric,
    chartDataLength: chartData?.length
  });

  return (
    <div className="h-full flex flex-col">

      
      {/* Chart Container - full-bleed, minimal */}
      <div className="flex-1" style={{ minHeight: '400px', height: '400px' }}>
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={true} vertical={false} stroke={theme.grid} />
            
            {/* X Axis - Distance */}
            <XAxis 
              dataKey="distance" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => `${value.toFixed(1)} mi`}
              stroke={theme.textSecondary}
              fontSize={10}
            />
            
            {/* Left Y Axis - Elevation */}
            <YAxis 
              yAxisId="left"
              orientation="left"
              domain={['dataMin - 50', 'dataMax + 50']}
              tickFormatter={(value) => `${Math.round(value)} ${useImperial ? 'ft' : 'm'}`}
              stroke={theme.textSecondary}
              fontSize={10}
              width={40}
            />
            {/* Right Y Axis - Selected metric (hidden ticks) */}
            <YAxis yAxisId="right" orientation="right" hide domain={[ 'auto', 'auto' ]} />
            
            {/* Elevation Area */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="absoluteElevation"
              stroke={theme.elevStroke}
              strokeWidth={1}
              fill="transparent"
            />

            {/* Selected metric line */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="metricValue"
              stroke={metricInfo.color}
              strokeWidth={metricInfo.width as number}
              strokeOpacity={metricInfo.opacity as number}
              dot={false}
              isAnimationActive={false}
              {...(metricInfo.dash ? { strokeDasharray: metricInfo.dash } : {})}
            />
            
            {/* Tooltip - Simple and clean */}
            <Tooltip
              position={{ x: 0, y: -120 }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const elevation = payload.find(p => p.dataKey === 'absoluteElevation')?.value;
                  
                  // Find the data point for this distance to get metric value
                  const dataPoint = chartData.find(point => Math.abs(point.distance - Number(label)) < 0.1);
                  const metricValue = dataPoint?.metricValue;
                  
                  return (
                    <div style={{ background: 'transparent', padding: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>Dist {Number(label).toFixed(1)} mi</div>
                      <div style={{ fontSize: 12, color: theme.textSecondary }}>Elev {Math.round(Number(elevation) || 0)} {useImperial ? 'ft' : 'm'}</div>
                      {metricValue !== null && metricValue !== undefined && (
                        <div style={{ fontSize: 12, color: metricInfo.color }}>{metricInfo.label} {metricValue} {metricInfo.unit}</div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-gray-500 text-lg mb-2">No chart data available</div>
              <div className="text-gray-400 text-sm">Unable to generate elevation profile</div>
            </div>
          </div>
        )}
      </div>

      {/* Metric toggles - text only, minimal */}
      <div className="flex gap-6 px-4 py-3">
        <button
          onClick={() => setSelectedMetric('pace')}
          className={`text-sm font-medium px-0 py-0 ${selectedMetric === 'pace' ? 'underline' : ''}`}
          style={{ color: selectedMetric === 'pace' ? 'var(--toggle-active-color)' : 'var(--toggle-inactive-color)' }}
        >Pace</button>
        <button
          onClick={() => setSelectedMetric('heartrate')}
          className={`text-sm font-medium px-0 py-0 ${selectedMetric === 'heartrate' ? 'underline' : ''}`}
          style={{ color: selectedMetric === 'heartrate' ? 'var(--toggle-active-color)' : 'var(--toggle-inactive-color)' }}
        >BPM</button>
        <button
          onClick={() => setSelectedMetric('vam')}
          className={`text-sm font-medium px-0 py-0 ${selectedMetric === 'vam' ? 'underline' : ''}`}
          style={{ color: selectedMetric === 'vam' ? 'var(--toggle-active-color)' : 'var(--toggle-inactive-color)' }}
        >VAM</button>
      </div>

      {/* Minimal section label (optional) */}
      <div className="px-4 py-2">
        <h3 className="text-base font-medium text-foreground text-center">Elevation</h3>
      </div>




    </div>
  );
};

export default CleanElevationChart;
