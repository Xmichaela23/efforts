import React, { useState, useMemo } from 'react';
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
  useImperial: boolean;
}

const CleanElevationChart: React.FC<CleanElevationChartProps> = ({ 
  gpsTrack, 
  sensorData,
  workoutType, 
  useImperial
}) => {
  const [selectedMetric, setSelectedMetric] = useState<'pace' | 'heartrate' | 'vam'>('pace');
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

  // Process GPS data for chart
  const chartData = useMemo(() => {
    if (!gpsTrack || gpsTrack.length === 0) return [];
    
    let cumulativeDistance = 0;
    let baseElevation = null;
    
    return gpsTrack.map((point, index) => {
      // Calculate cumulative distance
      if (index > 0) {
        const prevPoint = gpsTrack[index - 1];
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
            const prevPoint = gpsTrack[index - 1];
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
              if (speedMph >= 2 && speedMph <= 25) {
                metricValue = Math.round((60 / speedMph) * 100) / 100; // Convert to pace
              }
            }
          }
          break;
          
        case 'heartrate':
          // Find corresponding sensor data
          const sensorPoint = sensorData?.find(sensor => 
            sensor.timestamp === point.timestamp || 
            sensor.timestamp === point.startTimeInSeconds
          );
          metricValue = sensorPoint?.heartRate || null;
          break;
          
        case 'vam':
          if (index > 0) {
            const prevPoint = gpsTrack[index - 1];
            const prevElevation = prevPoint.elevation || prevPoint.altitude || 0;
            const currentElevation = point.elevation || point.altitude || 0;
            const elevationGain = Math.max(0, currentElevation - prevElevation);
            
            const prevTime = prevPoint.timestamp || prevPoint.startTimeInSeconds || 0;
            const currentTime = point.timestamp || point.startTimeInSeconds || 0;
            const timeDiff = currentTime - prevTime;
            
            if (timeDiff > 0 && elevationGain > 0) {
              const timeHours = timeDiff / 3600;
              metricValue = Math.round(elevationGain / timeHours);
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

  return (
    <div className="h-full flex flex-col">
      <style>{sliderStyles}</style>
      
      {/* Metric Selection Buttons */}
      <div className="flex gap-6 px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setSelectedMetric('pace')}
          className={`text-sm font-medium transition-all ${
            selectedMetric === 'pace' 
              ? 'text-black border-b-2 border-black pb-1' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pace
        </button>
        <button
          onClick={() => setSelectedMetric('heartrate')}
          className={`text-sm font-medium transition-all ${
            selectedMetric === 'heartrate' 
              ? 'text-black border-b-2 border-black pb-1' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          BPM
        </button>
        <button
          onClick={() => setSelectedMetric('vam')}
          className={`text-sm font-medium transition-all ${
            selectedMetric === 'vam' 
              ? 'text-black border-b-2 border-black pb-1' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          VAM
        </button>
      </div>

      {/* Chart Container */}
      <div className="flex-1 p-4">
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
            
            {/* Tooltip */}
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const elevation = payload.find(p => p.dataKey === 'absoluteElevation')?.value;
                  
                  return (
                    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                      <p className="font-medium">Distance: {label} mi</p>
                      <p className="text-gray-600">Elevation: {Math.round(Number(elevation) || 0)} {useImperial ? 'ft' : 'm'}</p>
                      <p className="text-xs text-gray-400">Above sea level</p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
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
