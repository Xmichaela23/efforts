import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Area } from 'recharts';

// Custom styles for range slider
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .slider::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
`;

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
  const [scrollPosition, setScrollPosition] = useState(0);

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

  // Process GPS data for chart
  const chartData = useMemo(() => {
    if (!gpsTrack || gpsTrack.length === 0) return [];
    
    // Sample GPS track to 1000 points for smooth charts
    const sampledGpsTrack = sampleData(gpsTrack, 1000);
    
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
        case 'pace':
          if (index > 0) {
            const prevPoint = sampledGpsTrack[index - 1];
            const distance = calculateDistance(
              prevPoint.lat || prevPoint.latitudeInDegree,
              prevPoint.lng || prevPoint.longitudeInDegree,
              point.lat || point.latitudeInDegree,
              point.lng || point.longitudeInDegree
            );
            const timeDiff = (point.timestamp || point.startTimeInSeconds) - 
                            (prevPoint.timestamp || prevPoint.startTimeInSeconds);
            
            if (timeDiff > 0 && distance > 0.001) {
              const speedMph = (distance / timeDiff) * 3600;
              // Much wider speed range and lower distance threshold for more data
              if (speedMph >= 0.5 && speedMph <= 50) {
                metricValue = Math.round((60 / speedMph) * 100) / 100; // Convert to pace
              }
            }
          }
          break;
          
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
          
        case 'vam':
          if (index > 0) {
            // Use a wider window for more stable VAM calculation
            const windowSize = Math.min(15, index); // Look back up to 15 points
            const startIndex = Math.max(0, index - windowSize);
            
            let totalElevationGain = 0;
            let totalTime = 0;
            
            for (let i = startIndex + 1; i <= index; i++) {
              const prevPoint = sampledGpsTrack[i - 1];
              const currentPoint = sampledGpsTrack[i];
              
              const prevElevation = prevPoint.elevation || prevPoint.altitude || 0;
              const currentElevation = currentPoint.elevation || currentPoint.altitude || 0;
              const elevationGain = currentElevation - prevElevation; // Allow negative for descents
              
              const prevTime = prevPoint.timestamp || prevPoint.startTimeInSeconds || 0;
              const currentTime = currentPoint.timestamp || currentPoint.startTimeInSeconds || 0;
              const timeDiff = currentTime - prevTime;
              
              if (timeDiff > 0) {
                totalElevationGain += elevationGain;
                totalTime += timeDiff;
              }
            }
            
            if (totalTime > 0) {
              const timeHours = totalTime / 3600;
              const vam = totalElevationGain / timeHours;
              // Only show meaningful VAM values (filter out noise)
              if (Math.abs(vam) > 5) { // Lower threshold for more data
                metricValue = Math.round(vam);
              }
            }
          }
          break;
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

  // Get current position data for cursor
  const getCurrentPositionData = () => {
    if (!chartData || chartData.length === 0) return null;
    
    const currentIndex = Math.floor((scrollPosition / 100) * (chartData.length - 1));
    const currentPoint = chartData[currentIndex];
    
    if (!currentPoint) return null;
    
    // Calculate climb from previous point
    let climb = 0;
    if (currentIndex > 0) {
      const prevPoint = chartData[currentIndex - 1];
      climb = (currentPoint.absoluteElevation || 0) - (prevPoint.absoluteElevation || 0);
    }
    
    return {
      distance: currentPoint.distance,
      elevation: currentPoint.absoluteElevation,
      climb: climb,
      metricValue: currentPoint.metricValue,
      metricLabel: metricInfo.label,
      metricUnit: metricInfo.unit
    };
  };

  const currentData = getCurrentPositionData();

  console.log('🔍 CleanElevationChart rendering with:', {
    selectedMetric,
    chartDataLength: chartData?.length,
    currentData
  });

  return (
    <div className="h-full flex flex-col">
      <style>{sliderStyles}</style>
      
      {/* Metric Selection Buttons */}
      <div className="flex gap-6 px-4 py-3 border-b border-gray-100 bg-white shadow-sm">
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

      {/* Chart Container */}
      <div className="flex-1 p-4" style={{ minHeight: '400px', height: '400px' }}>
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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
            
            {/* Tooltip - Shows selected metric data */}
            <Tooltip
              position={{ x: 0, y: -120 }} // Position much higher to avoid covering buttons
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const elevation = payload.find(p => p.dataKey === 'absoluteElevation')?.value;
                  
                  // Find the data point for this distance to get metric value
                  const dataPoint = chartData.find(point => Math.abs(point.distance - Number(label)) < 0.1);
                  const metricValue = dataPoint?.metricValue;
                  
                  return (
                    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg z-50">
                      <p className="font-medium">Distance: {label} mi</p>
                      <p className="text-gray-600">Elevation: {Math.round(Number(elevation) || 0)} {useImperial ? 'ft' : 'm'}</p>
                      {metricValue && (
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

      {/* Scroll Control */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="text-xs text-gray-600 mb-2">Scroll through workout</div>
        <div className="relative">
          <input
            type="range"
            min="0"
            max="100"
            value={scrollPosition}
            onChange={(e) => setScrollPosition(parseInt(e.target.value))}
            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${scrollPosition}%, #e5e7eb ${scrollPosition}%, #e5e7eb 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Start</span>
            <span>{Math.round(scrollPosition)}%</span>
            <span>End</span>
          </div>
        </div>
      </div>

      {/* Current Position Data */}
      {currentData && (
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-700 mb-2">Current Position</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Distance:</span>
              <span className="ml-2 font-medium">{currentData.distance?.toFixed(1)} mi</span>
            </div>
            <div>
              <span className="text-gray-500">Elevation:</span>
              <span className="ml-2 font-medium">{Math.round(currentData.elevation || 0)} {useImperial ? 'ft' : 'm'}</span>
            </div>
            <div>
              <span className="text-gray-500">Climb:</span>
              <span className="ml-2 font-medium">
                {currentData.climb > 0 ? `+${Math.round(currentData.climb)}` : Math.round(currentData.climb)} {useImperial ? 'ft' : 'm'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">{currentData.metricLabel}:</span>
              <span className="ml-2 font-medium" style={{ color: metricInfo.color }}>
                {currentData.metricValue ? `${currentData.metricValue} ${currentData.metricUnit}` : 'No data'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CleanElevationChart;
