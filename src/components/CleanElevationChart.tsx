import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Area } from 'recharts';



interface CleanElevationChartProps {
  gpsTrack: any[] | null;
  sensorData: any[] | null;
  workoutType: string;
  selectedMetric: string;
  useImperial: boolean;
}

const CleanElevationChart: React.FC<CleanElevationChartProps> = ({ 
  gpsTrack, 
  sensorData,
  workoutType, 
  selectedMetric: externalSelectedMetric,
  useImperial
}) => {
  const [selectedMetric, setSelectedMetric] = useState<'pace' | 'heartrate' | 'vam'>('pace');
  
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


  // Early return if no GPS data
  if (!gpsTrack || gpsTrack.length === 0) {
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

  // Process GPS data for chart
  const chartData = useMemo(() => {
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
  }, [gpsTrack, sensorData, selectedMetric, useImperial]);

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

  // Get metric label and unit
  const getMetricInfo = () => {
    switch (selectedMetric) {
      case 'pace':
        return { label: 'Pace', unit: 'min/mi', color: '#3b82f6' };
      case 'heartrate':
        return { label: 'Heart Rate', unit: 'bpm', color: '#ef4444' };
      case 'vam':
        return { label: 'VAM', unit: 'm/h', color: '#10b981' };
      default:
        return { label: 'Metric', unit: '', color: '#6b7280' };
    }
  };

  const metricInfo = getMetricInfo();



  console.log('🔍 CleanElevationChart rendering with:', {
    selectedMetric,
    chartDataLength: chartData?.length
  });

  return (
    <div className="h-full flex flex-col">

      
      {/* Chart Container - Simple and clean */}
      <div className="flex-1" style={{ minHeight: '400px', height: '400px' }}>
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            
            {/* X Axis - Distance */}
            <XAxis 
              dataKey="distance" 
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => `${value.toFixed(1)} mi`}
              stroke="#6b7280"
              fontSize={10}
            />
            
            {/* Left Y Axis - Elevation */}
            <YAxis 
              yAxisId="left"
              orientation="left"
              domain={['dataMin - 50', 'dataMax + 50']}
              tickFormatter={(value) => `${Math.round(value)} ${useImperial ? 'ft' : 'm'}`}
              stroke="#6b7280"
              fontSize={10}
              width={40}
            />
            
            {/* Elevation Area */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="absoluteElevation"
              stroke="#6b7280"
              strokeWidth={1.5}
              fill="#e5e7eb"
              fillOpacity={0.4}
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
                    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                      <p className="font-medium">Distance: {label} mi</p>
                      <p className="text-gray-600">Elevation: {Math.round(Number(elevation) || 0)} {useImperial ? 'ft' : 'm'}</p>
                      {metricValue !== null && metricValue !== undefined && (
                        <p className="text-gray-600">{metricInfo.label}: {metricValue} {metricInfo.unit}</p>
                      )}
                      <p className="text-xs text-gray-400">At this position</p>
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

      {/* Metric Selection Buttons - Underneath Chart */}
      <div className="flex gap-6 px-4 py-3 border-t border-gray-100">
        <button
          onClick={() => setSelectedMetric('pace')}
          className={`text-sm font-medium transition-all px-3 py-1 rounded ${
            selectedMetric === 'pace' 
              ? 'text-black border-b-2 border-black pb-1 bg-blue-50' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Pace
        </button>
        <button
          onClick={() => setSelectedMetric('heartrate')}
          className={`text-sm font-medium transition-all px-3 py-1 rounded ${
            selectedMetric === 'heartrate' 
              ? 'text-black border-b-2 border-black pb-1 bg-red-50' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          BPM
        </button>
        <button
          onClick={() => setSelectedMetric('vam')}
          className={`text-sm font-medium transition-all px-3 py-1 rounded ${
            selectedMetric === 'vam' 
              ? 'text-black border-b-2 border-black pb-1 bg-green-50' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          VAM
        </button>
      </div>

      {/* Elevation Profile Title - Below Buttons */}
      <div className="px-4 py-3 border-t border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 text-center">Elevation Profile</h3>
      </div>




    </div>
  );
};

export default CleanElevationChart;
