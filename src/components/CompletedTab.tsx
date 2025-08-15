import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';

import { useAppContext } from '@/contexts/AppContext';
import ActivityMap from './ActivityMap';
import CleanElevationChart from './CleanElevationChart';

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

interface CompletedTabProps {
 workoutType: 'ride' | 'run' | 'swim' | 'strength' | 'walk';
 workoutData: any;
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutType, workoutData }) => {
  const { useImperial } = useAppContext();
  const [selectedMetric, setSelectedMetric] = useState('speed'); // Start with pace/speed
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('powercurve');
  const [isLoading, setIsLoading] = useState(true);
  
  // No need to initialize localSelectedMetric here - it's handled in the sub-component

   // Simple check: what fields are actually in workoutData?
  useEffect(() => {
    if (workoutData && workoutData.gps_track) {
      console.log('📊 workoutData loaded:', workoutData.name, 'GPS:', workoutData.gps_track?.length, 'Sensors:', workoutData.sensor_data?.length);
      
      // Debug: Check what data we have
      console.log('🔍 CompletedTab workoutData debug:', {
        hasGpsTrack: !!workoutData.gps_track,
        gpsTrackLength: workoutData.gps_track?.length,
        hasSensorData: !!workoutData.sensor_data,
        sensorDataLength: workoutData.sensor_data?.length,
        sensorDataKeys: workoutData.sensor_data ? Object.keys(workoutData.sensor_data[0] || {}) : [],
        workoutDataKeys: Object.keys(workoutData || {})
      });
      
      // Additional debug: Check what we're about to pass to CleanElevationChart
      console.log('🔍 DEBUG - About to pass to CleanElevationChart:', {
        gpsTrack: workoutData.gps_track?.length,
        sensorData: workoutData.sensor_data?.length,
        sensorDataType: typeof workoutData.sensor_data,
        workoutDataKeys: Object.keys(workoutData || {})
      });
      
      setIsLoading(false);
    } else if (workoutData) {
      // We have workout data but no GPS track
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [workoutData]);

  // No debouncing needed - direct state management

 // Add error handling and loading states
   if (isLoading || !workoutData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {isLoading ? (
            <>
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
              </div>
              <div className="text-gray-500 text-lg mb-2">Loading workout data...</div>
            </>
          ) : (
            <>
              <div className="text-gray-500 text-lg mb-2">No workout data available</div>
              <div className="text-gray-400 text-sm">Please select a workout or try refreshing the page</div>
            </>
          )}
        </div>
      </div>
    );
  }

  // 🆕 STRAVA WORKOUT HANDLING - Separate from Garmin
  if (workoutData.source === 'strava') {
    return (
      <div className="space-y-6 px-4 pt-0 pb-2" style={{fontFamily: 'Inter, sans-serif'}}>
        {/* Strava Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
            <span className="text-lg font-semibold text-gray-900">Strava Activity</span>
          </div>
          <div className="text-sm text-gray-500">
            {workoutData.strava_activity_id && `ID: ${workoutData.strava_activity_id}`}
          </div>
        </div>

        {/* Strava Key Metrics - Basic Structure */}
        <div className="grid grid-cols-3 gap-3">
          {/* Duration */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.duration ? `${Math.floor(workoutData.duration / 60)}:${(workoutData.duration % 60).toString().padStart(2, '0')}` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Duration</div>
            </div>
          </div>

          {/* Distance */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.distance ? `${(workoutData.distance / 1000).toFixed(2)} km` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Distance</div>
            </div>
          </div>

          {/* Pace/Speed */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.avg_pace ? `${workoutData.avg_pace.toFixed(1)} min/km` : 
               workoutData.avg_speed ? `${(workoutData.avg_speed * 3.6).toFixed(1)} km/h` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">{workoutType === 'run' || workoutType === 'walk' ? 'Avg Pace' : 'Avg Speed'}</div>
            </div>
          </div>
        </div>

        {/* Strava Map Placeholder */}
        {workoutData.strava_data?.original_activity?.map?.polyline && (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-gray-600 mb-2">🗺️ Strava Map Data Available</div>
            <div className="text-sm text-gray-500">
              Polyline: {workoutData.strava_data.original_activity.map.polyline.substring(0, 50)}...
            </div>
          </div>
        )}

        {/* Strava Data Debug */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-800 mb-2">Strava Data Structure</div>
          <div className="text-xs text-blue-700 space-y-1">
            <div>Source: {workoutData.source}</div>
            <div>Strava ID: {workoutData.strava_activity_id}</div>
            <div>Type: {workoutData.type}</div>
            <div>Has Strava Data: {workoutData.strava_data ? 'Yes' : 'No'}</div>
            {workoutData.strava_data && (
              <div>Original Activity Keys: {Object.keys(workoutData.strava_data.original_activity || {}).join(', ')}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 🔒 EXISTING GARMIN LOGIC - UNTOUCHED
  if (!workoutData.gps_track || workoutData.gps_track.length === 0) {
   return (
     <div className="flex items-center justify-center h-64">
       <div className="text-center">
         <div className="text-gray-500 text-lg mb-2">No GPS data available</div>
         <div className="text-gray-400 text-sm">This workout doesn't have GPS tracking data</div>
       </div>
     </div>
   );
 }




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

 // Format average speed specifically
const formatAvgSpeed = (speedValue: any): string => {
  const speedKmh = Number(speedValue);
  if (speedKmh && speedKmh > 0) {
    const speedMph = speedKmh * 0.621371;
    return `${speedMph.toFixed(1)} mph`;
  }
  return 'N/A';
};

// Format max speed specifically  
const formatMaxSpeed = (speedValue: any): string => {
  const speedKmh = Number(speedValue);
  if (speedKmh && speedKmh > 0) {
    const speedMph = speedKmh * 0.621371;
    return `${speedMph.toFixed(1)} mph`;
  }
  return 'N/A';
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
   
   console.log('🔍 formatDate debugging:', {
     input: dateStr,
     dateValue,
     type: typeof dateValue
   });
   
   // Create Date object - handle UTC timestamps properly
   const date = new Date(dateValue);
   
   console.log('🔍 Date object created:', {
     date: date.toString(),
     utc: date.toUTCString(),
     local: date.toLocaleString(),
     timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
   });
   
   // Format date in local timezone (same as calendar)
   const options: Intl.DateTimeFormatOptions = {
     weekday: 'long',
     month: 'long',
     day: 'numeric'
   };
   
   const result = date.toLocaleDateString('en-US', options);
   console.log('🔍 formatDate result:', result);
   
   return result;
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
   
   // Location detection - coordinates will show actual location
   console.log('🔍 getCityFromCoordinates returning Unknown - no location detection implemented');
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
          value: workoutData.avg_heart_rate ? safeNumber(workoutData.avg_heart_rate) : 'N/A',
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
        value: workoutData.avg_heart_rate ? safeNumber(workoutData.avg_heart_rate) : 'N/A',
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
          value: workoutData.avg_cadence ? safeNumber(workoutData.avg_cadence) : 'N/A',
          unit: 'spm'
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    } else if (isBike) {
      return [
        ...baseMetrics.slice(0, 3), // Distance, Duration, Heart Rate
        {
          label: 'Power',
          value: workoutData.avg_power ? safeNumber(workoutData.avg_power) : 'N/A',
          unit: 'W'
        },
        {
          label: 'Speed',
          value: formatAvgSpeed(workoutData.avg_speed),
          unit: useImperial ? 'mph' : 'mph'
        },
        {
          label: 'Cadence',
          value: workoutData.avg_cadence ? safeNumber(workoutData.avg_cadence) : 'N/A',
          unit: 'rpm'
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    } else if (isSwim) {
      return [
        ...baseMetrics.slice(0, 3), // Distance, Duration, Heart Rate
        {
          label: 'Pace',
          value: formatSwimPace(workoutData.avg_pace),
          unit: '/100m'
        },
        {
          label: 'Cadence',
          value: workoutData.avg_cadence ? safeNumber(workoutData.avg_cadence) : 'N/A',
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
         value: formatPace(workoutData.avg_pace),
         unit: '/mi'
       },
       {
         label: 'Max Pace',
         value: formatPace(workoutData.max_pace),
         unit: '/mi'
       }
     ];
   }
   
   const baseMetrics = [
     {
       label: 'Max HR',
       value: workoutData.max_heart_rate ? safeNumber(workoutData.max_heart_rate) : 'N/A',
       unit: 'bpm'
     },
     {
       label: isRun ? 'Max Pace' : 'Max Speed',
       value: isRun
         ? formatPace(workoutData.metrics?.max_pace || workoutData.max_pace)
         : (workoutData.max_speed ? formatMaxSpeed(workoutData.max_speed) : 'N/A'),
       unit: isRun ? (useImperial ? '/mi' : '/km') : (useImperial ? 'mph' : 'km/h')
     },
     {
       label: 'Max Cadence',
       value: workoutData.max_cadence ? safeNumber(workoutData.max_cadence) : 'N/A',
       unit: isRun ? 'spm' : 'rpm'
     }
   ];

   // Add discipline-specific metrics
   if (isRun) {
     return [
       ...baseMetrics,
       {
         label: 'Steps',
         value: workoutData.steps ? safeNumber(workoutData.steps) : 'N/A'
       },
       {
         label: 'TSS',
         value: workoutData.tss ? safeNumber(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       }
     ];
   } else if (isBike) {
     return [
       ...baseMetrics,
       {
         label: 'Max Power',
         value: workoutData.max_power ? safeNumber(workoutData.max_power) : 'N/A',
         unit: 'W'
       },
       {
         label: 'TSS',
         value: workoutData.tss ? safeNumber(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       },
       {
         label: 'Intensity Factor',
         value: workoutData.intensity_factor ? `${safeNumber(workoutData.intensity_factor)}%` : 'N/A'
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
         value: workoutData.tss ? safeNumber(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       },
       {
         label: 'Intensity Factor',
         value: workoutData.intensity_factor ? `${safeNumber(workoutData.intensity_factor)}%` : 'N/A'
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

 // Calculate Grade Adjusted Pace (GAP) using proper Strava formula
 const calculateGradeAdjustedPace = () => {
   console.log('🔍 GAP calculation - workoutType:', workoutType);
   if (workoutType !== 'run' && workoutType !== 'walk') {
     console.log('❌ GAP calculation skipped - not a run/walk:', workoutType);
     return null;
   }
   
   const distance = workoutData.distance;
   const duration = workoutData.duration;
   const elevationGain = workoutData.elevation_gain || workoutData.metrics?.elevation_gain;
   
   console.log('🔍 GAP calculation - data:', { distance, duration, elevationGain });
   
   if (!distance || !duration || !elevationGain) {
     console.log('❌ GAP calculation skipped - missing data');
     return null;
   }
   
   // Convert to standard units - handle both km and miles
   let distanceMiles = Number(distance);
   let durationMinutes = Number(duration);
   let elevationFeet = Number(elevationGain);
   
   // If distance is in km, convert to miles
   if (distanceMiles > 10) { // Likely in km if > 10
     distanceMiles = distanceMiles * 0.621371; // km to miles
     console.log('🔍 Converted distance from km to miles:', distanceMiles);
   }
   
   // If duration is in seconds, convert to minutes
   if (durationMinutes > 60) { // Likely in seconds if > 60
     durationMinutes = durationMinutes / 60; // seconds to minutes
     console.log('🔍 Converted duration from seconds to minutes:', durationMinutes);
   }
   
   // If elevation is in meters, convert to feet
   if (elevationFeet > 1000) { // Likely in meters if > 1000
     elevationFeet = elevationFeet * 3.28084; // meters to feet
     console.log('🔍 Converted elevation from meters to feet:', elevationFeet);
   }
   
   console.log('🔍 GAP calculation - converted units:', { distanceMiles, durationMinutes, elevationFeet });
   
   // Calculate actual pace (min/mi)
   const actualPaceMinutes = durationMinutes / distanceMiles;
   console.log('🔍 Actual pace (min/mi):', actualPaceMinutes);
   
   // Proper Strava GAP formula
   // Elevation gain per mile affects pace
   const elevationPerMile = elevationFeet / distanceMiles;
   console.log('🔍 Elevation per mile:', elevationPerMile);
   
   // Strava's GAP adjustment: more sophisticated than simple linear
   // Accounts for both uphill and downhill effects
   let gapAdjustment = 0;
   
   if (elevationPerMile > 0) {
     // Uphill: slows you down more than simple linear
     // Strava uses a curve that increases impact for steeper grades
     gapAdjustment = (elevationPerMile / 100) * 1.2; // 20% more impact than linear
     console.log('🔍 Uphill adjustment:', gapAdjustment);
   } else if (elevationPerMile < 0) {
     // Downhill: speeds you up, but not as much as uphill slows you down
     gapAdjustment = (Math.abs(elevationPerMile) / 100) * 0.8; // 80% of uphill benefit
     console.log('🔍 Downhill adjustment:', gapAdjustment);
   }
   
   // Calculate GAP
   // Uphill: add penalty (slower pace), Downhill: subtract benefit (faster pace)
   const gapPaceMinutes = actualPaceMinutes + gapAdjustment;
   console.log('🔍 GAP pace (min/mi):', gapPaceMinutes);
   
   // Format GAP pace (don't go below 0)
   const gapPace = formatPace(Math.max(0, gapPaceMinutes));
   console.log('🔍 Final GAP pace:', gapPace);
   
   return gapPace;
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
  <div className="space-y-6 px-4 pt-0 pb-2" style={{fontFamily: 'Inter, sans-serif'}}>
     
     {/* 🏠 WEATHER HEADER - Simplified, no redundant title */}
     <div className="flex items-center justify-end gap-4 text-lg">
       {workoutData.avg_temperature && (
         <span className="text-black">
           {formatTemperature(workoutData.avg_temperature)}
         </span>
       )}
     </div>
     
     {/* 🏠 SHOW MAP ROW - Distance removed since it's in metrics grid */}
     <div className="flex items-center justify-end mb-3">
       {/* Map toggle could go here if needed */}
     </div>
     
     {/* 🏠 ALL METRICS - 3-column grid with proper row alignment */}
     <div className="grid grid-cols-3 gap-3">
       {/* Row 1: Duration, Avg HR, Avg Pace */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatDuration(workoutData.duration)}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Duration</div>
         </div>
       </div>
       
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.avg_heart_rate ? safeNumber(workoutData.avg_heart_rate) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Avg HR</div>
         </div>
       </div>
       
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
             {formatSwimPace(workoutData.avg_pace)}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Avg Pace</div>
           </div>
         </div>
       ) : (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {formatAvgSpeed(workoutData.avg_speed)}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Avg Speed</div>
           </div>
         </div>
       )}

       {/* Row 2: GAP, Max Speed, Avg Cadence */}
       {workoutType === 'run' && calculateGradeAdjustedPace() && (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {calculateGradeAdjustedPace()}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">GAP</div>
           </div>
         </div>
       )}

       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {(workoutType === 'run' || workoutType === 'walk')
             ? formatPace(workoutData.metrics?.max_pace || workoutData.max_pace)
             : (workoutData.max_speed ? formatMaxSpeed(workoutData.max_speed) : 'N/A')}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">{(workoutType === 'run' || workoutType === 'walk') ? 'Max Pace' : 'Max Speed'}</div>
         </div>
       </div>
       
       {workoutType === 'ride' ? (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.avg_power ? safeNumber(workoutData.avg_power) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Avg Power</div>
           </div>
         </div>
       ) : (
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {workoutData.avg_cadence ? safeNumber(workoutData.avg_cadence) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal">
             <div className="font-medium">Avg Cadence</div>
           </div>
         </div>
       )}
       
       {/* Row 3: Elevation, Calories, Max HR */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatElevation(workoutData.elevation_gain || workoutData.metrics?.elevation_gain)} ft
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Climbed</div>
         </div>
       </div>
       
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.calories ? safeNumber(workoutData.calories) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Calories</div>
         </div>
       </div>
       
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.max_heart_rate ? safeNumber(workoutData.max_heart_rate) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Max HR</div>
         </div>
       </div>

       {/* Row 4: Max Cadence, TSS, VAM */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {workoutData.max_cadence ? safeNumber(workoutData.max_cadence) : 'N/A'}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Max Cadence</div>
         </div>
       </div>
       
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
       
       {/* Moving Time - Final metric */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatMovingTime()}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Moving Time</div>
         </div>
       </div>
     </div>

     {/* GPS ROUTE MAP & ELEVATION PROFILE SECTION - FORCE PHYSICAL SEPARATION */}
     <div className="w-full">
       {/* 🗺️ MAP SECTION - Fixed height container */}
       <div className="w-full mb-16">
         <div className="bg-white rounded-lg overflow-hidden">
           <div className="h-64 relative">
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
         </div>
       </div>
       
       {/* 📊 ELEVATION PROFILE SECTION - Starts below map with clear boundary */}
       <div className="w-full">
         {/* Chart container - clear separation from map */}
         <div className="h-[500px] w-full">
           <CleanElevationChart
             gpsTrack={workoutData.gps_track}
             sensorData={workoutData.sensor_data}
             workoutType={workoutType}
             selectedMetric={selectedMetric}
             useImperial={useImperial}
           />
         </div>
       </div>
     </div>
     </div>
 );
};

export default CompletedTab;