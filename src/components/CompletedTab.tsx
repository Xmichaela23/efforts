console.log('🚨 COMPLETEDTAB COMPONENT LOADED');
import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Area } from 'recharts';

import { useAppContext } from '@/contexts/AppContext';
import ActivityMap from './ActivityMap';

// Custom styles for range sliders
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

// Interactive Elevation Profile Component
interface InteractiveElevationProfileProps {
  gpsTrack: any[] | null;
  workoutType: string;
  selectedMetric: string;
  useImperial: boolean;
}

const InteractiveElevationProfile: React.FC<InteractiveElevationProfileProps> = ({ 
  gpsTrack, 
  workoutType, 
  selectedMetric,
  useImperial
}) => {
  const [localSelectedMetric, setLocalSelectedMetric] = useState(selectedMetric);
  
  // Debug: Log when localSelectedMetric changes
  useEffect(() => {
    console.log(`🎯 localSelectedMetric changed to: ${localSelectedMetric}`);
  }, [localSelectedMetric]);
  const [scrollRange, setScrollRange] = useState<[number, number]>([0, 100]);

  // Debug: Log when metric changes
  useEffect(() => {
    console.log('🎯 Metric changed to:', localSelectedMetric);
  }, [localSelectedMetric]);
  
  if (!gpsTrack || gpsTrack.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No GPS data available
      </div>
    );
  }

  const getMetricValue = (point: any, index: number) => {
    switch (localSelectedMetric) {
      case 'heartrate':
        return point.heartRate || point.heart_rate || point.hr;
      case 'speed':
        const speedMPS = point.speedMetersPerSecond;
        if (speedMPS && useImperial) {
          return Math.round(speedMPS * 2.237); // Convert m/s to mph
        }
        return speedMPS;
      case 'power':
        return point.power || point.avgPower || point.maxPower;
      case 'vam':
        // Calculate VAM (climbing rate) between this point and previous point
        if (index === 0) return 0; // First point has no VAM
        
        const prevPoint = gpsTrack[index - 1];
        const prevElevation = prevPoint.elevation || prevPoint.altitude || 0;
        const currentElevation = point.elevation || point.altitude || 0;
        const elevationGain = Math.max(0, currentElevation - prevElevation); // Only positive gains
        
        // Get time difference between points
        const prevTime = prevPoint.timestamp || prevPoint.startTimeInSeconds || 0;
        const currentTime = point.timestamp || point.startTimeInSeconds || 0;
        const timeDiff = currentTime - prevTime;
        
        if (timeDiff <= 0 || elevationGain === 0) return 0;
        
        // Calculate VAM: elevation gain (m) / time (hours)
        const timeHours = timeDiff / 3600;
        const vam = elevationGain / timeHours;
        
        return Math.round(vam);
      default:
        return point.elevation;
    }
  };

  // Helper function to calculate distance between two GPS points
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

  // Process GPS data for chart with real distance and relative elevation
  const chartData = useMemo(() => {
    if (!gpsTrack || gpsTrack.length === 0) return [];
    
    let cumulativeDistance = 0;
    let baseElevation = null;
    
    return gpsTrack.map((point, index) => {
      // Calculate cumulative distance from GPS coordinates
      if (index > 0) {
        const prevPoint = gpsTrack[index - 1];
        const lat1 = prevPoint.latitudeInDegree || prevPoint.lat;
        const lon1 = prevPoint.longitudeInDegree || prevPoint.lng;
        const lat2 = point.latitudeInDegree || point.lat;
        const lon2 = point.longitudeInDegree || point.lng;
        
        if (lat1 && lon1 && lat2 && lon2) {
          cumulativeDistance += calculateDistance(lat1, lon1, lat2, lon2);
        }
      }
      
      // Debug: Log first few points to see actual data structure
      if (index < 3) {
        console.log(`GPS Point ${index}:`, {
          speedMPS: point.speedMetersPerSecond,
          heartRate: point.heartRate,
          power: point.power,
          elevation: point.elevation
        });
      }
      
      const metricValue = getMetricValue(point, index);
      
      // Convert elevation from meters to feet if imperial is enabled
      const elevationMeters = point.elevation || point.altitude || 0;
      const elevationImperial = useImperial ? elevationMeters * 3.28084 : elevationMeters;
      
      // Set base elevation to first point, then calculate relative elevation
      if (baseElevation === null) {
        baseElevation = elevationImperial;
      }
      const relativeElevation = elevationImperial - baseElevation;
      
      return {
        distance: parseFloat(cumulativeDistance.toFixed(2)),
        elevation: relativeElevation,
        absoluteElevation: elevationImperial,
        heartRate: point.heartRate || point.heart_rate || point.hr || null,
        speed: point.speed || point.speedMetersPerSecond || null,
        cadence: point.cadence || point.bikeCadenceInRPM || null,
        timestamp: point.timestamp || point.startTimeInSeconds || null,
        metricValue: metricValue
      };
    });
  }, [gpsTrack, localSelectedMetric, useImperial]);

  // For now, always show elevation data since that's what we have
  // TODO: When we get actual performance metrics from Garmin, filter by those
  const validData = chartData;

  console.log('Chart data debug:', {
    totalPoints: gpsTrack.length,
    chartDataPoints: chartData.length,
    validDataPoints: validData.length,
    localSelectedMetric,
    totalDistance: chartData.length > 0 ? chartData[chartData.length - 1].distance : 0,
    elevationRange: chartData.length > 0 ? {
      min: Math.min(...chartData.map(d => d.elevation)),
      max: Math.max(...chartData.map(d => d.elevation))
    } : { min: 0, max: 0 },
    samplePoint: chartData[0],
    metricValues: chartData.slice(0, 3).map(d => ({ distance: d.distance, metricValue: d.metricValue }))
  });

  const getMetricColor = () => {
    switch (localSelectedMetric) {
      case 'heartrate':
        return '#ef4444'; // Red
      case 'speed':
        return '#3b82f6'; // Blue
      case 'power':
        return '#8b5cf6'; // Purple
      case 'vam':
        return '#10b981'; // Green
      default:
        return '#6b7280'; // Gray
    }
  };

  const getMetricLabel = () => {
    switch (localSelectedMetric) {
      case 'heartrate':
        return 'Heart Rate (BPM)';
      case 'speed':
        return 'Speed (mph)';
      case 'power':
        return 'Power (W)';
      case 'vam':
        return 'VAM (m/h)';
      default:
        return 'Elevation (ft)';
    }
  };

  return (
    <div className="h-full">
      <style>{sliderStyles}</style>
      <div className="text-sm font-medium text-gray-700 mb-2">
        Elevation Profile (Relative to Start)
                     <span className="text-xs text-gray-500 ml-2">
               (VAM from GPS data)
             </span>
      </div>
      <ResponsiveContainer width="100%" height="70%">
        <ComposedChart data={validData}>
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
          
          {/* Left Y Axis - Elevation (Relative) */}
          <YAxis 
            yAxisId="left"
            orientation="left"
            tickFormatter={(value) => `${Math.round(value)} ${useImperial ? 'ft' : 'm'}`}
            stroke="#6b7280"
            fontSize={10}
            label={{ value: 'Elevation Change', angle: -90, position: 'insideLeft' }}
          />
          
          {/* Right Y Axis - Performance Metric */}
          <YAxis 
            yAxisId="right"
            orientation="right"
            tickFormatter={(value) => {
              if (localSelectedMetric === 'heartrate') return `${value} bpm`;
              if (localSelectedMetric === 'speed') return `${value.toFixed(1)} mph`;
              if (localSelectedMetric === 'power') return `${value.toFixed(0)} W`;
              if (localSelectedMetric === 'vam') return `${value} m/h`;
              return value;
            }}
            stroke={getMetricColor()}
            fontSize={10}
          />
          
          {/* Elevation Area */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="elevation"
            stroke="#9ca3af"
            strokeWidth={2}
            fill="#d1d5db"
            fillOpacity={0.3}
          />
          
          {/* Elevation Line - Highlight the actual elevation data we have */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="elevation"
            stroke="#1f2937"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#1f2937" }}
          />

          {/* Performance Metric Line - Only show when metric data is available */}
          {localSelectedMetric !== 'vam' && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="metricValue"
              stroke={getMetricColor()}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: getMetricColor() }}
            />
          )}
          
          {/* Tooltip */}
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const elevation = payload.find(p => p.dataKey === 'elevation')?.value;
                const metricValue = payload.find(p => p.dataKey === 'metricValue')?.value;
                
                return (
                  <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-medium">Distance: {label} mi</p>
                    <p className="text-gray-600">Elevation Change: {Math.round(Number(elevation) || 0)} {useImperial ? 'ft' : 'm'}</p>
                    <p className="text-xs text-gray-400">Relative to start point</p>
                                           {metricValue !== null && metricValue !== undefined && (localSelectedMetric !== 'vam' || Number(metricValue) > 0) ? (
                         <p className="text-gray-600" style={{ color: getMetricColor() }}>
                           {getMetricLabel()}: {metricValue}
                           {localSelectedMetric === 'heartrate' && ' bpm'}
                           {localSelectedMetric === 'speed' && ' mph'}
                           {localSelectedMetric === 'power' && ' W'}
                           {localSelectedMetric === 'vam' && ' m/h'}
                         </p>
                       ) : (
                         <p className="text-gray-500 text-xs">
                           {localSelectedMetric === 'vam' ? 'Flat section' : 'No data'}
                         </p>
                       )}
                  </div>
                );
              }
              return null;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Metric Selection Buttons */}
      <div className="mt-3 px-2">
        <div className="text-xs text-gray-600 mb-2">Metric overlay:</div>
        <div className="flex flex-wrap gap-2">
          {['Heart Rate', 'Speed', 'Power', 'VAM'].map((metric) => {
            const metricKey = metric.toLowerCase().replace(' ', '');
            return (
              <button
                key={metric}
                onClick={() => {
                  console.log(`🎯 Button clicked: ${metric} -> ${metricKey}`);
                  setLocalSelectedMetric(metricKey);
                }}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  localSelectedMetric === metricKey
                    ? 'bg-gray-200 text-black'
                    : 'bg-white text-black hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {metric}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scroll Control Slider */}
      <div className="mt-3 px-2">
        <div className="text-xs text-gray-600 mb-2">Scroll workout</div>
        <div className="relative">
          <input
            type="range"
            min="0"
            max="100"
            value={scrollRange[0]}
            onChange={(e) => setScrollRange([parseInt(e.target.value), scrollRange[1]])}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${scrollRange[0]}%, #3b82f6 ${scrollRange[0]}%, #3b82f6 ${scrollRange[1]}%, #e5e7eb ${scrollRange[1]}%, #e5e7eb 100%)`
            }}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={scrollRange[1]}
            onChange={(e) => setScrollRange([scrollRange[0], parseInt(e.target.value)])}
            className="absolute top-0 w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: 'transparent'
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-xs text-gray-500 mt-1">
          <span>{Math.round(scrollRange[0])}%</span>
          <span>{Math.round(scrollRange[1])}%</span>
        </div>
      </div>
    </div>
  );
};

interface CompletedTabProps {
 workoutType: 'ride' | 'run' | 'swim' | 'strength' | 'walk';
 workoutData: any;
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutType, workoutData }) => {
 const { useImperial } = useAppContext();
 const [selectedMetric, setSelectedMetric] = useState('heartrate');
 const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('powercurve');


 // 🔍 DEBUG: Log what CompletedTab receives
 console.log('🔍 COMPLETEDTAB DEBUG - workoutData received:', workoutData);
 console.log('🔍 COMPLETEDTAB DEBUG - friendly_name:', workoutData.friendly_name);
 console.log('🔍 COMPLETEDTAB DEBUG - timestamp:', workoutData.timestamp);
 console.log('🔍 COMPLETEDTAB DEBUG - start_position_lat:', workoutData.start_position_lat);
 console.log('🔍 COMPLETEDTAB DEBUG - start_position_long:', workoutData.start_position_long);
 console.log('🔍 COMPLETEDTAB DEBUG - avg_temperature:', workoutData.metrics?.avg_temperature);
 console.log('🔍 COMPLETEDTAB DEBUG - total_timer_time:', workoutData.metrics?.total_timer_time);
 console.log('🔍 COMPLETEDTAB DEBUG - moving_time:', workoutData.moving_time);
 console.log('🔍 COMPLETEDTAB DEBUG - elapsed_time:', workoutData.elapsed_time);
 console.log('🔍 COMPLETEDTAB DEBUG - gps_track:', workoutData.gps_track);
 console.log('🔍 COMPLETEDTAB DEBUG - gps_track length:', workoutData.gps_track?.length);

 // Helper functions
 const safeNumber = (value: any): string => {
   if (value === null || value === undefined || isNaN(value)) return 'N/A';
   return String(value);
 };

   const formatDuration = (seconds: any): string => {
    const num = Number(seconds);
    if (num === null || num === undefined || isNaN(num) || num === 0) {
      // Handle duration in minutes (from Garmin data) vs seconds
      const durationMinutes = workoutData.duration || 0;
      if (durationMinutes > 0) {
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:00`;
        }
        return `${minutes}:00`;
      }
      return '0:00';
    }
    
    // Handle duration in seconds
    const hours = Math.floor(num / 3600);
    const minutes = Math.floor((num % 3600) / 60);
    const secs = num % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

 const formatDistance = (km: any): string => {
   const num = Number(km);
   if (!num || isNaN(num)) return '0.0';
   
   if (useImperial) {
     return (num * 0.621371).toFixed(1);
   }
   return num.toFixed(1);
 };

 const formatSpeed = (speedValue: any): string => {
  // 🚨 TESTING: This is the UPDATED formatSpeed function - if you see this log, the fix is loaded!
  console.log('🚨 UPDATED formatSpeed function is running!');
  
  // 🔧 FIXED: This function should actually be looking for BEST PACE, not speed
  // For running/walking, we want the fastest pace (lowest time per km)
  // For cycling, we want the fastest speed (highest km/h)
  
  if (workoutType === 'run' || workoutType === 'walk') {
    // For running/walking: Look for best pace (fastest pace = lowest time per km)
    const maxPaceSecondsPerKm = Number(workoutData.max_pace);
    const avgPaceSecondsPerKm = Number(workoutData.avg_pace);
    
    console.log('🔍 formatSpeed (RUN/WALK) - looking for best pace:', {
      max_pace: workoutData.max_pace,
      avg_pace: workoutData.avg_pace,
      maxPaceSecondsPerKm,
      avgPaceSecondsPerKm
    });
    
    // Use max_pace (fastest pace) if available, otherwise avg_pace
    const paceSecondsPerKm = maxPaceSecondsPerKm || avgPaceSecondsPerKm;
    
    if (paceSecondsPerKm && paceSecondsPerKm > 0) {
      // Convert seconds per km to minutes per mile
      const paceSecondsPerMile = paceSecondsPerKm * 1.60934;
      const minutes = Math.floor(paceSecondsPerMile / 60);
      const seconds = Math.round(paceSecondsPerMile % 60);
      const paceString = `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
      console.log('🔍 formatSpeed returning best pace:', paceString);
      return paceString;
    }
  } else {
    // For cycling: Look for fastest speed (highest km/h)
    const maxSpeedKmh = Number(workoutData.max_speed);
    const avgSpeedKmh = Number(workoutData.avg_speed);
    
    console.log('🔍 formatSpeed (CYCLE) - looking for fastest speed:', {
      max_speed: workoutData.max_speed,
      avg_speed: workoutData.avg_speed,
      maxSpeedKmh,
      avgSpeedKmh
    });
    
    // Use max_speed (fastest speed) if available, otherwise avg_speed
    const speedKmh = maxSpeedKmh || avgSpeedKmh;
    
    if (speedKmh && speedKmh > 0) {
      // Convert km/h to mph: multiply by 0.621371
      const speedMph = speedKmh * 0.621371;
      console.log('🔍 formatSpeed returning fastest speed:', speedMph.toFixed(1), 'mph');
      return `${speedMph.toFixed(1)} mph`;
    }
  }
  
  console.log('🔍 formatSpeed returning N/A - no pace/speed data found');
  return 'N/A';
};

 const formatElevation = (m: any): string => {
   const num = Number(m);
   if (!num || isNaN(num) || num === 0) return '0';
   
   if (useImperial) {
     return Math.round(num * 3.28084).toString();
   }
   return num.toString();
 };

 const formatTemperature = (c: any): string => {
   console.log('🔍 formatTemperature called with:', c, typeof c);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible temperature sources
   const temp = c || 
                workoutData.avg_temperature || 
                workoutData.metrics?.avg_temperature ||
                workoutData.metrics?.temperature ||
                workoutData.temperature;
   const num = Number(temp);
   
   if (!num || isNaN(num)) {
     console.log('🔍 formatTemperature returning N/A because num is:', num, 'isNaN:', isNaN(num));
     return 'N/A';
   }
   
   // Always show Fahrenheit for now (settings toggle later)
   const f = Math.round((num * 9/5) + 32);
   console.log('🔍 formatTemperature converting:', num, '°C to', f, '°F');
   return `${f}°F`;
 };

 // Format pace using basic calculation from distance and duration
const formatPace = (paceValue: any): string => {
  // For max pace, use transformed max_pace field (seconds per km from useWorkouts)
  if (paceValue === (workoutData.metrics?.max_pace || workoutData.max_pace)) {
    const maxPaceSecondsPerKm = Number(workoutData.max_pace);
    if (maxPaceSecondsPerKm && maxPaceSecondsPerKm > 0) {
      // Convert seconds per km to seconds per mile: multiply by 1.60934
      const maxPaceSecondsPerMile = maxPaceSecondsPerKm * 1.60934;
      const minutes = Math.floor(maxPaceSecondsPerMile / 60);
      const seconds = Math.round(maxPaceSecondsPerMile % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
    }
  }
  
  // For average pace, calculate from distance and duration
  // useWorkouts.ts transforms Garmin data: duration_seconds → duration (minutes), distance_meters → distance (km)
  const distanceKm = Number(workoutData.distance); // Already in km from useWorkouts transformation
  const durationMinutes = Number(workoutData.duration); // Already in minutes from useWorkouts transformation
  
  console.log('🔍 formatPace debug:', {
    raw_distance_meters: workoutData.distance_meters,
    transformed_distance_km: workoutData.distance,
    raw_duration_seconds: workoutData.duration_seconds, 
    transformed_duration_minutes: workoutData.duration,
    calculated_distanceKm: distanceKm,
    calculated_durationMinutes: durationMinutes
  });
  
  if (distanceKm && durationMinutes && distanceKm > 0 && durationMinutes > 0) {
    // Convert km to miles
    const distanceMiles = distanceKm * 0.621371;
    // Calculate pace in minutes per mile
    const paceMinPerMile = durationMinutes / distanceMiles;
    
    const minutes = Math.floor(paceMinPerMile);
    const seconds = Math.round((paceMinPerMile - minutes) * 60);
    console.log('🔍 formatPace calculated:', `${minutes}:${seconds.toString().padStart(2, '0')}/mi`);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
  }
  
  return 'N/A';
};

 // Format swim pace (seconds per 100m) to MM:SS format
 const formatSwimPace = (seconds: any): string => {
   const num = Number(seconds);
   if (!num || isNaN(num)) return 'N/A';
   
   const minutes = Math.floor(num / 60);
   const secs = Math.floor(num % 60);
   return `${minutes}:${secs.toString().padStart(2, '0')}`;
 };

 const formatTime = (timestamp: any): string => {
   console.log('🔍 formatTime called with:', timestamp, typeof timestamp);
   
   // 🔧 GARMIN DATA EXTRACTION: Try multiple timestamp sources
   const timeValue = timestamp || 
                    workoutData.timestamp || 
                    workoutData.start_time || 
                    workoutData.created_at;
   
   if (!timeValue) return 'N/A';
   const date = new Date(timeValue);
   const result = date.toLocaleTimeString('en-US', { 
     timeZone: 'America/Los_Angeles', // PST/PDT
     hour: 'numeric', 
     minute: '2-digit',
     hour12: true 
   });
   console.log('🔍 formatTime result:', result);
   return result;
 };

 const formatDate = (dateStr: any): string => {
   // 🔧 GARMIN DATA EXTRACTION: Try multiple date sources
   const dateValue = dateStr || workoutData.date || workoutData.start_date;
   if (!dateValue) return 'N/A';
   
   // Handle ISO timestamp format (e.g., "2025-07-04T15:30:00Z")
   if (typeof dateValue === 'string' && dateValue.includes('T')) {
     const datePart = dateValue.split('T')[0]; // Extract "2025-07-04" part
     const dateParts = datePart.split('-'); // ["2025", "07", "04"]
     return `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}`; // "7/4"
   }
   
   // Handle date-only format (e.g., "2025-07-04")
   if (typeof dateValue === 'string' && dateValue.includes('-')) {
     const dateParts = dateValue.split('-'); // ["2025", "07", "04"]
     return `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}`; // "7/4"
   }
   
   return 'N/A';
 };

 const getCityFromCoordinates = (lat: any, lng: any): string => {
   console.log('🔍 getCityFromCoordinates called with:', lat, lng);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible coordinate sources
   const latNum = Number(lat || 
                        workoutData.start_position_lat || 
                        workoutData.latitude || 
                        workoutData.start_lat);
   const lngNum = Number(lng || 
                        workoutData.start_position_long || 
                        workoutData.longitude || 
                        workoutData.start_lng);
   
   if (!latNum || !lngNum) {
     console.log('🔍 getCityFromCoordinates returning Unknown - no valid coords');
     return 'Unknown';
   }
   
   // Los Angeles area - FIXED BOUNDS
   if (latNum >= 33.7 && latNum <= 34.5 && lngNum >= -118.9 && lngNum <= -117.9) {
     console.log('🔍 getCityFromCoordinates returning Los Angeles');
     return 'Los Angeles';
   }
   
   console.log('🔍 getCityFromCoordinates returning Unknown - coords not in LA area');
   return 'Unknown';
 };

 const generateTitle = (): string => {
   // 🔧 GARMIN DATA EXTRACTION: Use timestamp for Garmin activities, date for manual workouts
   const date = formatDate(workoutData.timestamp || workoutData.date);
   const city = getCityFromCoordinates(workoutData.start_position_lat, workoutData.start_position_long);
   const title = `${date} ${city} ${workoutData.type}`;
   console.log('🔍 generateTitle result:', title);
   console.log('🔍 generateTitle debugging:', {
     timestamp: workoutData.timestamp,
     date: workoutData.date,
     start_position_lat: workoutData.start_position_lat,
     start_position_long: workoutData.start_position_long,
     type: workoutData.type
   });
   return title;
 };

   // 🏠 PRIMARY METRICS - Dynamic based on workout type
  const getPrimaryMetrics = () => {
    const isRun = workoutType === 'run';
    const isBike = workoutType === 'ride';
    const isSwim = workoutType === 'swim';
    const isWalk = workoutType === 'walk';
    
    // Walking gets simplified metrics: time, distance, heart rate, calories, elevation
    if (isWalk) {
      return [
        {
          label: 'Duration', 
          value: formatDuration(workoutData.duration)
        },
        {
          label: 'Distance',
          value: formatDistance(workoutData.distance),
          unit: useImperial ? 'mi' : 'mi'
        },
        {
          label: 'Heart Rate',
          value: workoutData.metrics?.avg_heart_rate || workoutData.avg_heart_rate ? safeNumber(workoutData.metrics?.avg_heart_rate || workoutData.avg_heart_rate) : 'N/A',
          unit: 'bpm'
        },
        {
          label: 'Calories',
          value: workoutData.metrics?.calories || workoutData.calories ? safeNumber(workoutData.metrics?.calories || workoutData.calories) : 'N/A',
          unit: 'cal'
        },
        {
          label: 'Elevation',
          value: formatElevation(workoutData.elevation_gain || workoutData.metrics?.elevation_gain),
          unit: useImperial ? 'ft' : 'ft'
        }
      ];
    }
    
    const baseMetrics = [
      {
        label: 'Distance',
        value: formatDistance(workoutData.distance),
        unit: useImperial ? 'mi' : 'mi'
      },
      {
        label: 'Duration', 
        value: formatDuration(workoutData.duration)
      },
      {
        label: 'Heart Rate',
        value: workoutData.metrics?.avg_heart_rate || workoutData.avg_heart_rate ? safeNumber(workoutData.metrics?.avg_heart_rate || workoutData.avg_heart_rate) : 'N/A',
        unit: 'bpm'
      },
      {
        label: 'Elevation',
        value: formatElevation(workoutData.elevation_gain || workoutData.metrics?.elevation_gain),
        unit: useImperial ? 'ft' : 'ft'
      },
      {
        label: 'Calories',
        value: workoutData.metrics?.calories || workoutData.calories ? safeNumber(workoutData.metrics?.calories || workoutData.calories) : 'N/A',
        unit: 'cal'
      }
    ];

    // Add discipline-specific metrics
    if (isRun) {
      return [
        ...baseMetrics.slice(0, 3), // Distance, Duration, Heart Rate
        {
          label: 'Pace',
          value: formatPace(workoutData.metrics?.avg_pace || workoutData.avg_pace),
          unit: useImperial ? '/mi' : '/km'
        },
        {
          label: 'Cadence',
          value: workoutData.metrics?.avg_cadence || workoutData.avg_cadence ? safeNumber(workoutData.metrics?.avg_cadence || workoutData.avg_cadence) : 'N/A',
          unit: 'spm'
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    } else if (isBike) {
      return [
        ...baseMetrics.slice(0, 3), // Distance, Duration, Heart Rate
        {
          label: 'Power',
          value: workoutData.metrics?.avg_power || workoutData.avg_power ? safeNumber(workoutData.metrics?.avg_power || workoutData.avg_power) : 'N/A',
          unit: 'W'
        },
        {
          label: 'Speed',
          value: formatSpeed(workoutData.metrics?.avg_speed || workoutData.avg_speed),
          unit: useImperial ? 'mph' : 'mph'
        },
        {
          label: 'Cadence',
          value: workoutData.metrics?.avg_cadence || workoutData.avg_cadence ? safeNumber(workoutData.metrics?.avg_cadence || workoutData.avg_cadence) : 'N/A',
          unit: 'rpm'
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    } else if (isSwim) {
      return [
        ...baseMetrics.slice(0, 3), // Distance, Duration, Heart Rate
        {
          label: 'Pace',
          value: formatSwimPace(workoutData.metrics?.avg_pace || workoutData.avg_pace),
          unit: '/100m'
        },
        {
          label: 'Cadence',
          value: workoutData.metrics?.avg_cadence || workoutData.avg_cadence ? safeNumber(workoutData.metrics?.avg_cadence || workoutData.avg_cadence) : 'N/A',
          unit: 'spm'
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    }

    return baseMetrics;
  };

  const primaryMetrics = getPrimaryMetrics();

 // 🏠 ADVANCED METRICS - Dynamic based on workout type
 const getAdvancedMetrics = () => {
   const isRun = workoutType === 'run';
   const isBike = workoutType === 'ride';
   const isSwim = workoutType === 'swim';
   const isWalk = workoutType === 'walk';
   
   // Walking gets minimal advanced metrics
   if (isWalk) {
     return [
       {
         label: 'Avg Pace',
         value: formatPace(workoutData.metrics?.avg_pace || workoutData.avg_pace),
         unit: '/mi'
       },
       {
         label: 'Max Pace',
         value: formatPace(workoutData.metrics?.max_pace || workoutData.max_pace),
         unit: '/mi'
       }
     ];
   }
   
   const baseMetrics = [
     {
       label: 'Max HR',
       value: workoutData.metrics?.max_heart_rate || workoutData.max_heart_rate ? safeNumber(workoutData.metrics?.max_heart_rate || workoutData.max_heart_rate) : 'N/A',
       unit: 'bpm'
     },
     {
       label: 'Max Speed',
       value: workoutData.metrics?.max_speed || workoutData.max_speed ? formatSpeed(workoutData.metrics?.max_speed || workoutData.max_speed) : 'N/A',
       unit: useImperial ? 'mph' : 'mph'
     },
     {
       label: 'Max Cadence',
       value: workoutData.metrics?.max_cadence || workoutData.max_cadence ? safeNumber(workoutData.metrics?.max_cadence || workoutData.max_cadence) : 'N/A',
       unit: isRun ? 'spm' : 'rpm'
     }
   ];

   // Add discipline-specific metrics
   if (isRun) {
     return [
       ...baseMetrics,
       {
         label: 'Max Pace',
         value: formatPace(workoutData.metrics?.max_pace || workoutData.max_pace),
         unit: useImperial ? '/mi' : '/km'
       },
       {
         label: 'Steps',
         value: workoutData.metrics?.steps || workoutData.steps ? safeNumber(workoutData.metrics?.steps || workoutData.steps) : 'N/A'
       },
       {
         label: 'TSS',
         value: workoutData.metrics?.training_stress_score || workoutData.tss ? safeNumber(Math.round((workoutData.metrics?.training_stress_score || workoutData.tss) * 10) / 10) : 'N/A'
       }
     ];
   } else if (isBike) {
     return [
       ...baseMetrics,
       {
         label: 'Max Power',
         value: workoutData.metrics?.max_power || workoutData.max_power ? safeNumber(workoutData.metrics?.max_power || workoutData.max_power) : 'N/A',
         unit: 'W'
       },
       {
         label: 'TSS',
         value: workoutData.metrics?.training_stress_score || workoutData.tss ? safeNumber(Math.round((workoutData.metrics?.training_stress_score || workoutData.tss) * 10) / 10) : 'N/A'
       },
       {
         label: 'Intensity Factor',
         value: workoutData.metrics?.intensity_factor || workoutData.intensity_factor ? `${safeNumber(workoutData.metrics?.intensity_factor || workoutData.intensity_factor)}%` : 'N/A'
       }
     ];
   } else if (isSwim) {
     return [
       ...baseMetrics,
       {
         label: 'Max Pace',
         value: formatSwimPace(workoutData.metrics?.max_pace || workoutData.max_pace),
         unit: '/100m'
       },
       {
         label: 'TSS',
         value: workoutData.metrics?.training_stress_score || workoutData.tss ? safeNumber(Math.round((workoutData.metrics?.training_stress_score || workoutData.tss) * 10) / 10) : 'N/A'
       },
       {
         label: 'Intensity Factor',
         value: workoutData.metrics?.intensity_factor || workoutData.intensity_factor ? `${safeNumber(workoutData.metrics?.intensity_factor || workoutData.intensity_factor)}%` : 'N/A'
       }
     ];
   }

   return baseMetrics;
 };

 const advancedMetrics = getAdvancedMetrics();

 // 🏠 TRAINING METRICS - Pull real data from FIT file, remove Weighted Avg Power
 const calculateTotalWork = () => {
   console.log('🔍 calculateTotalWork - total_work:', workoutData.metrics?.total_work);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible work sources
   const totalWork = workoutData.metrics?.total_work || 
                    workoutData.total_work || 
                    workoutData.work;
   
   // Use total_work from FIT file if available (in Joules), convert to kJ
   if (totalWork) {
     const kj = Math.round(Number(totalWork) / 1000);
     console.log('✅ calculateTotalWork using total_work:', kj, 'kJ');
     return `${kj} kJ`;
   }
   // Fallback calculation if total_work not available
   else if (workoutData.metrics?.avg_power && workoutData.duration) {
     // Convert duration from minutes to seconds for proper kJ calculation
     const durationSeconds = workoutData.duration * 60;
     const kj = Math.round((workoutData.metrics.avg_power * durationSeconds) / 1000);
     console.log('✅ calculateTotalWork using fallback calc:', kj, 'kJ');
     return `${kj} kJ`;
   }
   console.log('✅ calculateTotalWork returning N/A');
   return 'N/A';
 };

 const calculateVAM = () => {
   console.log('🔍 calculateVAM - avg_vam:', workoutData.metrics?.avg_vam);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible VAM sources
   const avgVam = workoutData.metrics?.avg_vam || 
                 workoutData.avg_vam || 
                 workoutData.vam;
   
   // Use avg_vam from FIT file if available
   if (avgVam) {
     const vam = Math.round(Number(avgVam) * 1000); // Convert to m/h
     console.log('✅ calculateVAM using avg_vam:', vam, 'm/h');
     return `${vam} m/h`;
   }
   // Fallback calculation
   else if (workoutData.elevation_gain && workoutData.duration) {
     const elevationM = Number(workoutData.elevation_gain);
     // workoutData.duration is in MINUTES, convert to hours
     const durationHours = (workoutData.duration * 60) / 3600;
     const vam = Math.round(elevationM / durationHours);
     console.log('✅ calculateVAM using fallback calc:', vam, 'm/h');
     return `${vam} m/h`;
   }
   console.log('✅ calculateVAM returning N/A');
   return 'N/A';
 };

  // Enhanced VAM calculation for running with insights
 const calculateRunningVAM = () => {
   if (workoutType !== 'run') return null;
   
   const elevationGain = workoutData.elevation_gain || workoutData.metrics?.elevation_gain;
   const duration = workoutData.duration;
   
   if (!elevationGain || !duration) return null;
   
   const elevationM = Number(elevationGain);
   const durationHours = (duration * 60) / 3600;
   const vam = Math.round(elevationM / durationHours);
   
   // Professional VAM insights with actionable feedback
   let insight = '';
   let trainingZone = '';
   let racePacing = '';
   
   if (vam >= 1000) {
     insight = 'Elite climbing performance';
     trainingZone = 'VO2 Max / Anaerobic';
     racePacing = 'Suitable for short, steep races';
   } else if (vam >= 800) {
     insight = 'Advanced climbing strength';
     trainingZone = 'Threshold / Tempo';
     racePacing = 'Good for hilly 10K-21K';
   } else if (vam >= 600) {
     insight = 'Strong climbing ability';
     trainingZone = 'Aerobic / Endurance';
     racePacing = 'Ideal for marathon training';
   } else if (vam >= 400) {
     insight = 'Good climbing endurance';
     trainingZone = 'Aerobic Base';
     racePacing = 'Ultra-distance ready';
   } else {
     insight = 'Endurance-focused climbing';
     trainingZone = 'Recovery / Base';
     racePacing = 'Build climbing strength';
   }
   
   return { vam, insight, trainingZone, racePacing };
 };

 const formatMovingTime = () => {
   console.log('🔍 formatMovingTime checking:', {
     total_timer_time: workoutData.metrics?.total_timer_time,
     moving_time: workoutData.moving_time,
     elapsed_time: workoutData.elapsed_time
   });
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible moving time sources
   const timerTime = workoutData.metrics?.total_timer_time || 
                    workoutData.total_timer_time || 
                    workoutData.timer_time;
   const movingTime = workoutData.moving_time || 
                     workoutData.metrics?.moving_time;
   const elapsedTime = workoutData.elapsed_time || 
                      workoutData.metrics?.elapsed_time || 
                      workoutData.metrics?.total_elapsed_time;
   
   // Use total_timer_time from FIT file - this is the actual moving time
   if (timerTime) {
     console.log('🔍 formatMovingTime using total_timer_time');
     return formatDuration(timerTime);
   } else if (movingTime) {
     console.log('🔍 formatMovingTime using moving_time');
     return formatDuration(movingTime);
   } else if (elapsedTime) {
     console.log('🔍 formatMovingTime using elapsed_time');
     return formatDuration(elapsedTime);
   }
   console.log('🔍 formatMovingTime returning N/A');
   return 'N/A';
 };

 const trainingMetrics = [
   {
     label: 'Normalized Power',
     value: workoutData.metrics?.normalized_power ? `${safeNumber(workoutData.metrics.normalized_power)} W` : 'N/A'
   },
   {
     label: 'Training Load',
     value: workoutData.metrics?.training_stress_score ? safeNumber(Math.round(workoutData.metrics.training_stress_score)) : 'N/A'
   },
   {
     label: 'Total Work',
     value: calculateTotalWork()
   },
   {
     label: 'VAM',
     value: calculateVAM()
   },
   {
     label: 'Moving Time',
     value: formatMovingTime()
   }
 ];

 return (
  <div className="space-y-6 px-4 py-2" style={{fontFamily: 'Inter, sans-serif'}}>
     
     {/* 🏠 TITLE AND WEATHER HEADER */}
     <div className="flex items-center justify-between">
       <h1 className="text-2xl font-semibold text-black">
         {workoutData.name || generateTitle()}
       </h1>
       <div className="flex items-center gap-4 text-lg">
         <span className="text-black">
           {formatTime(workoutData.timestamp)}
         </span>
         {workoutData.avg_temperature && (
           <span className="text-black">
             {formatTemperature(workoutData.avg_temperature)}
           </span>
         )}
       </div>
     </div>
     
     {/* 🏠 DISTANCE + SHOW MAP ROW */}
     <div className="flex items-center gap-4 mb-6">
       <div className="px-1 py-0.5">
         <div className="text-xl font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatDistance(workoutData.distance)}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="text-xs text-[#666666]">mi</div>
           <div className="font-medium">Distance</div>
         </div>
       </div>
       

     </div>
     
     {/* 🏠 ALL METRICS - 3-column grid */}
     <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
       {/* Duration */}
       <div className="px-3 py-2">
         <div className="text-lg font-semibold text-black mb-1" style={{fontFeatureSettings: '"tnum"'}}>
           {formatDuration(workoutData.duration)}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Duration</div>
         </div>
       </div>
       
       {/* Heart Rate */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.metrics?.avg_heart_rate ? safeNumber(workoutData.metrics.avg_heart_rate) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Avg HR</div>
         </div>
       </div>
       
       {/* Dynamic Speed/Pace based on workout type */}
      {workoutType === 'run' || workoutType === 'walk' ? (
        <div className="px-2 py-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {formatPace(workoutData.metrics?.avg_pace || workoutData.avg_pace)}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Avg Pace</div>
          </div>
        </div>
      ) : workoutType === 'swim' ? (
        <div className="px-2 py-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {formatSwimPace(workoutData.metrics?.avg_pace || workoutData.avg_pace)}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Avg Pace</div>
          </div>
        </div>
      ) : (
        <div className="px-2 py-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {formatSpeed(workoutData.metrics?.avg_speed || workoutData.avg_speed)}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Avg Speed</div>
          </div>
        </div>
      )}
       
       {/* Dynamic Power/Cadence based on workout type */}
       {workoutType === 'ride' ? (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.avg_power || workoutData.avg_power ? safeNumber(workoutData.metrics?.avg_power || workoutData.avg_power) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Avg Power</div>
           </div>
         </div>
       ) : (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.avg_cadence || workoutData.avg_cadence ? safeNumber(workoutData.metrics?.avg_cadence || workoutData.avg_cadence) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Avg Cadence</div>
           </div>
         </div>
       )}
       
       {/* Elevation */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatElevation(workoutData.elevation_gain || workoutData.metrics?.elevation_gain)} ft
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Climbed</div>
         </div>
       </div>
       
       {/* Calories */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.metrics?.calories ? safeNumber(workoutData.metrics.calories) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Calories</div>
         </div>
       </div>
       
       {/* Max HR */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.metrics?.max_heart_rate ? safeNumber(workoutData.metrics.max_heart_rate) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Max HR</div>
         </div>
       </div>
       
       {/* Max Power - Only show for cycling */}
       {workoutType === 'ride' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.max_power ? safeNumber(workoutData.metrics.max_power) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Max Power</div>
           </div>
         </div>
       )}
       
       {/* Max Speed */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.metrics?.max_speed || workoutData.max_speed ? formatSpeed(workoutData.metrics?.max_speed || workoutData.max_speed) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Max Speed</div>
         </div>
       </div>
       
       {/* Max Cadence */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.metrics?.max_cadence ? safeNumber(workoutData.metrics.max_cadence) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Max Cadence</div>
         </div>
       </div>
       
       {/* TSS - Only show for cycling */}
       {workoutType === 'ride' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.training_stress_score ? safeNumber(Math.round(workoutData.metrics.training_stress_score * 10) / 10) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">TSS</div>
           </div>
         </div>
       )}

       {/* TSS - Show for running too */}
       {workoutType === 'run' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.training_stress_score ? safeNumber(Math.round(workoutData.metrics.training_stress_score * 10) / 10) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">TSS</div>
           </div>
         </div>
       )}
       
       {/* Intensity Factor - Only show for cycling */}
       {workoutType === 'ride' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.intensity_factor ? `${safeNumber(workoutData.metrics.intensity_factor)}%` : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Intensity Factor</div>
           </div>
         </div>
       )}


       
       {/* Normalized Power - Only show for cycling */}
       {workoutType === 'ride' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.normalized_power ? `${safeNumber(workoutData.metrics.normalized_power)}` : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Norm Power</div>
           </div>
         </div>
       )}


       
       {/* Training Load - Only show for cycling */}
       {workoutType === 'ride' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.metrics?.training_stress_score ? safeNumber(Math.round(workoutData.metrics.training_stress_score)) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Training Load</div>
           </div>
         </div>
       )}
       
       {/* Total Work - Only show for cycling */}
       {workoutType === 'ride' && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {calculateTotalWork()}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Total Work</div>
           </div>
         </div>
       )}
       
       {/* VAM - Enhanced for running */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {calculateVAM()}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">VAM</div>
           {workoutType === 'run' && (
             <div className="text-xs text-gray-500 mt-1">
               Climbing speed
             </div>
           )}
         </div>
       </div>
       
       {/* Running VAM Insight */}
       {workoutType === 'run' && calculateRunningVAM() && (
         <div className="px-2 py-1 bg-blue-50 rounded-lg border border-blue-200">
           <div className="text-sm font-medium text-blue-800 mb-1">
             {calculateRunningVAM()?.insight}
           </div>
           <div className="text-xs text-blue-600 mb-1">
             VAM: {calculateRunningVAM()?.vam} m/h
           </div>
           <div className="text-xs text-blue-700 font-medium">
             Training Zone: {calculateRunningVAM()?.trainingZone}
           </div>
           <div className="text-xs text-blue-600">
             {calculateRunningVAM()?.racePacing}
           </div>
         </div>
       )}


       
       {/* Moving Time */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatMovingTime()}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Moving Time</div>
         </div>
       </div>
     </div>

     {/* GPS ROUTE MAP & ELEVATION PROFILE SECTION - BOTH VISIBLE */}
     <div>

       {/* 🗺️ SIDE-BY-SIDE LAYOUT */}
       <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
         {/* GPS Route Map - Left side */}
         <div className="h-80 xl:col-span-1 relative overflow-hidden rounded-lg border border-gray-200">
           <ActivityMap
             gpsTrack={workoutData.gps_track}
             activityName={workoutData.name || generateTitle()}
             activityType={workoutType}
             startLocation={workoutData.start_position_lat && workoutData.start_position_long ? {
               lat: workoutData.start_position_lat,
               lng: workoutData.start_position_long
             } : null}
           />
         </div>
         
         {/* Elevation Profile - Right side (wider) */}
         <div className="h-96 xl:col-span-2 relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
           <InteractiveElevationProfile
             gpsTrack={workoutData.gps_track}
             workoutType={workoutType}
             selectedMetric={selectedMetric}
             useImperial={useImperial}
           />
         </div>
       </div>
     </div>

     {/* 📊 DETAILED ANALYTICS SECTION */}
     <div className="space-y-4 border-t border-gray-200 pt-4">
       
       {/* ANALYTICS TABS */}
       <div className="flex gap-6 text-sm">
         {/* Power Curve - Only show for cycling */}
         {workoutType === 'ride' && (
           <button 
             onClick={() => setActiveAnalyticsTab('powercurve')}
             className={`pb-1 ${activeAnalyticsTab === 'powercurve' ? 'text-black font-medium border-b-2 border-gray-400' : 'text-[#666666] hover:text-black'}`}
           >
             Power Curve
           </button>
         )}
         {/* Power Details - Only show for cycling */}
         {workoutType === 'ride' && (
           <button 
             onClick={() => setActiveAnalyticsTab('powerdetails')}
             className={`pb-1 ${activeAnalyticsTab === 'powerdetails' ? 'text-black font-medium border-b-2 border-gray-400' : 'text-[#666666] hover:text-black'}`}
           >
             Power Details
           </button>
         )}
         <button 
           onClick={() => setActiveAnalyticsTab('zones')}
           className={`pb-1 ${activeAnalyticsTab === 'zones' ? 'text-black font-medium border-b-2 border-gray-400' : 'text-[#666666] hover:text-black'}`}
         >
           Zones
         </button>
         <button 
           onClick={() => setActiveAnalyticsTab('userprofile')}
           className={`pb-1 ${activeAnalyticsTab === 'userprofile' ? 'text-black font-medium border-b-2 border-gray-400' : 'text-[#666666] hover:text-black'}`}
         >
           User Profile
         </button>
         <button 
           onClick={() => setActiveAnalyticsTab('norwegian')}
           className={`pb-1 ${activeAnalyticsTab === 'norwegian' ? 'text-black font-medium border-b-2 border-gray-400' : 'text-[#666666] hover:text-black'}`}
         >
           Norwegian
         </button>
       </div>

       {/* TAB CONTENT */}
       {activeAnalyticsTab === 'zones' && (
         <div>
           <h3 className="text-lg font-semibold mb-4 text-black">Heart Rate & Power Zones</h3>
           {/* 🔧 GARMIN DATA EXTRACTION: Extract zone data */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div>
               <h4 className="font-medium text-black mb-4">Heart Rate Zones</h4>
               <div className="space-y-2">
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Threshold HR:</span>
                   <span className="text-black">{workoutData.metrics?.threshold_heart_rate || workoutData.threshold_heart_rate ? `${workoutData.metrics?.threshold_heart_rate || workoutData.threshold_heart_rate} bpm` : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Max HR Setting:</span>
                   <span className="text-black">{workoutData.metrics?.default_max_heart_rate || workoutData.default_max_heart_rate ? `${workoutData.metrics?.default_max_heart_rate || workoutData.default_max_heart_rate} bpm` : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Resting HR:</span>
                   <span className="text-black">{workoutData.metrics?.resting_heart_rate || workoutData.resting_heart_rate ? `${workoutData.metrics?.resting_heart_rate || workoutData.resting_heart_rate} bpm` : 'N/A'}</span>
                 </div>
               </div>
             </div>
             {/* Power Zones - Only show for cycling */}
             {workoutType === 'ride' && (
               <div>
                 <h4 className="font-medium text-black mb-4">Power Zones</h4>
                 <div className="space-y-2">
                   <div className="flex justify-between">
                     <span className="text-[#666666]">FTP:</span>
                     <span className="text-black">{workoutData.metrics?.functional_threshold_power || workoutData.functional_threshold_power ? `${workoutData.metrics?.functional_threshold_power || workoutData.functional_threshold_power} W` : 'N/A'}</span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-[#666666]">Threshold Power:</span>
                     <span className="text-black">{workoutData.metrics?.threshold_power || workoutData.threshold_power ? `${workoutData.metrics?.threshold_power || workoutData.threshold_power} W` : 'N/A'}</span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-[#666666]">Power Calc Type:</span>
                     <span className="text-black">{workoutData.metrics?.pwr_calc_type || workoutData.pwr_calc_type || 'N/A'}</span>
                   </div>
                 </div>
               </div>
             )}
           </div>
         </div>
       )}

       {activeAnalyticsTab === 'powercurve' && (
         <div>
           <h3 className="text-lg font-semibold mb-4 text-black">Power Curve Analysis</h3>
           <div className="p-6">
             <p className="text-sm text-[#666666]">Power curve analysis will be displayed here...</p>
           </div>
         </div>
       )}

       {activeAnalyticsTab === 'powerdetails' && (
         <div>
           <h3 className="text-lg font-semibold mb-4 text-black">Power Details</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div>
               <h4 className="font-medium text-black mb-4">Pedal Metrics</h4>
               <div className="space-y-2">
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Pedal Smoothness:</span>
                   <span className="text-black">{workoutData.metrics?.avg_left_pedal_smoothness || workoutData.avg_left_pedal_smoothness ? `${workoutData.metrics?.avg_left_pedal_smoothness || workoutData.avg_left_pedal_smoothness}%` : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Torque Effectiveness:</span>
                   <span className="text-black">{workoutData.metrics?.avg_left_torque_effectiveness || workoutData.avg_left_torque_effectiveness ? `${workoutData.metrics?.avg_left_torque_effectiveness || workoutData.avg_left_torque_effectiveness}%` : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Left/Right Balance:</span>
                   <span className="text-black">{workoutData.metrics?.left_right_balance || workoutData.left_right_balance ? `${workoutData.metrics?.left_right_balance || workoutData.left_right_balance}%` : 'N/A'}</span>
                 </div>
               </div>
             </div>
             <div>
               <h4 className="font-medium text-black mb-4">Stroke Data</h4>
               <div className="space-y-2">
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Total Pedal Strokes:</span>
                   <span className="text-black">{(workoutData.metrics?.total_cycles || workoutData.total_cycles) ? (workoutData.metrics?.total_cycles || workoutData.total_cycles).toLocaleString() : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Avg Fractional Cadence:</span>
                   <span className="text-black">{(workoutData.metrics?.avg_fractional_cadence || workoutData.avg_fractional_cadence) ? (workoutData.metrics?.avg_fractional_cadence || workoutData.avg_fractional_cadence).toFixed(3) : 'N/A'}</span>
                 </div>
               </div>
             </div>
           </div>
         </div>
       )}

       {activeAnalyticsTab === 'userprofile' && (
         <div>
           <h3 className="text-lg font-semibold mb-4 text-black">User Profile</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div>
               <h4 className="font-medium text-black mb-4">Physical Data</h4>
               <div className="space-y-2">
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Weight:</span>
                   <span className="text-black">{(workoutData.metrics?.weight || workoutData.weight) ? `${workoutData.metrics?.weight || workoutData.weight} kg` : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Height:</span>
                   <span className="text-black">{(workoutData.metrics?.height || workoutData.height) ? `${((workoutData.metrics?.height || workoutData.height) * 1000).toFixed(0)} cm` : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Gender:</span>
                   <span className="text-black">{(workoutData.metrics?.gender || workoutData.gender) ? (workoutData.metrics?.gender || workoutData.gender).charAt(0).toUpperCase() + (workoutData.metrics?.gender || workoutData.gender).slice(1) : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Age:</span>
                   <span className="text-black">{(workoutData.metrics?.age || workoutData.age) ? `${workoutData.metrics?.age || workoutData.age} years` : 'N/A'}</span>
                 </div>
               </div>
             </div>
             <div>
               <h4 className="font-medium text-black mb-4">Settings</h4>
               <div className="space-y-2">
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Distance Units:</span>
                   <span className="text-black">{(workoutData.metrics?.dist_setting || workoutData.dist_setting) ? (workoutData.metrics?.dist_setting || workoutData.dist_setting).charAt(0).toUpperCase() + (workoutData.metrics?.dist_setting || workoutData.dist_setting).slice(1) : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">Weight Units:</span>
                   <span className="text-black">{(workoutData.metrics?.weight_setting || workoutData.weight_setting) ? (workoutData.metrics?.weight_setting || workoutData.weight_setting).charAt(0).toUpperCase() + (workoutData.metrics?.weight_setting || workoutData.weight_setting).slice(1) : 'N/A'}</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-[#666666]">HR Calc Type:</span>
                   <span className="text-black">{(workoutData.metrics?.hr_calc_type || workoutData.hr_calc_type) || 'N/A'}</span>
                 </div>
               </div>
             </div>
           </div>
         </div>
       )}

       {activeAnalyticsTab === 'norwegian' && (
         <div>
           <h3 className="text-lg font-semibold mb-4 text-black">Norwegian Method</h3>
           <div className="p-6">
             <p className="text-sm text-[#666666]">Norwegian method analysis will be displayed here...</p>
           </div>
         </div>
       )}

       {/* OVERVIEW SECTION */}
       <div>
         <h3 className="text-lg font-semibold mb-6 text-black">Overview</h3>
         
         {/* 7-Day Training Load */}
         <div className="p-6 mb-6">
           <h4 className="font-medium text-black mb-3">7-Day Training Load</h4>
           <p className="text-sm text-[#333333] mb-3">
             Cycling: 340 TSS • Running: 185 TSS • Strength: 95 Load • Swimming: 120 TSS
           </p>
           <p className="text-sm text-[#666666]">
             Your Tuesday/Thursday strength sessions correlate with 7% power improvement on weekend rides.
           </p>
         </div>

         {/* 6-Week Progression */}
         <div className="p-6 mb-6">
           <h4 className="font-medium text-black mb-3">6-Week Progression</h4>
           <p className="text-sm text-[#333333] mb-3">
             FTP: +12W (4.9%) • Threshold HR: -3 bpm • VO2 Max: +1.2 ml/kg/min
           </p>
           <p className="text-sm text-[#666666]">
             Strong aerobic development trend. Swimming easy days appear to enhance running recovery, with 15% faster HR 
             recovery after run intervals following swim sessions.
           </p>
         </div>

         {/* Recovery Status */}
         <div className="p-6 mb-6">
           <h4 className="font-medium text-black mb-3">Recovery Status</h4>
           <p className="text-sm text-[#333333] mb-3">
             Current Training Stress Balance: -24 (Optimal: -10 to -30)
           </p>
           <p className="text-sm text-[#666666]">
             Good training adaptation window. Your heavy squat sessions (Tuesday) show 18-hour recovery time before power 
             metrics return to baseline. Schedule easy spins Wednesday.
           </p>
         </div>

         {/* Cross-Training Correlations */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="p-6">
             <h4 className="font-medium text-black mb-3 flex items-center">
               🏃 Run ↔ Bike Correlation
             </h4>
             <p className="text-sm text-[#666666]">
               Your run cadence improvement (+3 rpm avg) coincides with bike power gains. Neuromuscular patterns 
               transferring between disciplines.
             </p>
           </div>
           
           <div className="p-6">
             <h4 className="font-medium text-black mb-3 flex items-center">
               🏊 Swim Recovery Impact
             </h4>
             <p className="text-sm text-[#666666]">
               Easy swim sessions reduce next-day resting HR by avg 4 bpm. Active recovery significantly enhancing 
               adaptation.
             </p>
           </div>
         </div>
       </div>

       {/* WORKOUT DATA */}
       <div className="border-t border-gray-200 pt-6">
         <h3 className="text-lg font-semibold mb-4 text-black">Workout Data</h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
           <div>
             <span className="text-[#666666]">Date: </span>
             <span className="text-black">
               {(workoutData.date || workoutData.start_date) ? new Date(workoutData.date || workoutData.start_date).toLocaleDateString() : 'N/A'}
             </span>
           </div>
           <div>
             <span className="text-[#666666]">Device: </span>
             <span className="text-black capitalize">
               {workoutData.friendly_name || workoutData.deviceInfo?.manufacturer || workoutData.device_name || 'N/A'}
             </span>
           </div>
           <div>
             <span className="text-[#666666]">Activity: </span>
             <span className="text-black capitalize">{workoutData.type || workoutData.activity_type || 'Ride'}</span>
           </div>
           <div>
             <span className="text-[#666666]">Training Effects: </span>
             <span className="text-black">
               {(workoutData.metrics?.total_training_effect || workoutData.total_training_effect) ? `Aerobic: ${(workoutData.metrics?.total_training_effect || workoutData.total_training_effect).toFixed(1)}` : 'N/A'}
               {(workoutData.metrics?.total_anaerobic_effect || workoutData.total_anaerobic_effect) ? ` • Anaerobic: ${(workoutData.metrics?.total_anaerobic_effect || workoutData.total_anaerobic_effect).toFixed(1)}` : ''}
             </span>
           </div>
           <div>
             <span className="text-[#666666]">Location: </span>
             <span className="text-black">
               {getCityFromCoordinates(workoutData.start_position_lat, workoutData.start_position_long)}
             </span>
           </div>
         </div>
       </div>
     </div>
   </div>
 );
};

export default CompletedTab;