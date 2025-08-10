console.log('🚨 COMPLETEDTAB COMPONENT LOADED');
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Map } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

interface CompletedTabProps {
 workoutType: 'ride' | 'run' | 'swim' | 'strength' | 'walk';
 workoutData: any;
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutType, workoutData }) => {
 const { useImperial } = useAppContext();
 const [selectedMetric, setSelectedMetric] = useState('hr');
 const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('powercurve');
 const [showChart, setShowChart] = useState(true); // true = elevation chart, false = map

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
   
   // Parse "2025-07-04" directly without Date constructor to avoid timezone issues
   const dateParts = dateValue.split('-'); // ["2025", "07", "04"]
   return `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}`; // "7/4"
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
   const date = formatDate(workoutData.date);
   const city = getCityFromCoordinates(workoutData.start_position_lat, workoutData.start_position_long);
   const title = `${date} ${city} ${workoutData.type}`;
   console.log('🔍 generateTitle result:', title);
   console.log('🔍 generateTitle debugging:', {
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
     const durationHours = workoutData.duration / 3600;
     const vam = Math.round(elevationM / durationHours);
     console.log('✅ calculateVAM using fallback calc:', vam, 'm/h');
     return `${vam} m/h`;
   }
   console.log('✅ calculateVAM returning N/A');
   return 'N/A';
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
         <span className="text-black">
           {formatTemperature(workoutData.avg_temperature)}
         </span>
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
       
       <Button 
         onClick={() => setShowChart(!showChart)}
         className="px-6 py-2 bg-white text-black hover:bg-gray-100 border text-sm font-medium flex items-center gap-2"
       >
         <Map className="h-4 w-4" />
         {showChart ? 'Show Map' : 'Show Chart'}
       </Button>
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

       {/* Intensity Factor - Show for running too */}
       {workoutType === 'run' && (
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

       {/* Normalized Power - Show for running too */}
       {workoutType === 'run' && (
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
       
       {/* VAM */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {calculateVAM()}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">VAM</div>
         </div>
       </div>

       {/* Temperature - Show for all workout types */}
       <div className="px-2 py-1">
         <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {formatTemperature(workoutData.avg_temperature)}
         </div>
         <div className="text-xs text-[#666666] font-normal">
           <div className="font-medium">Temperature</div>
         </div>
       </div>
       
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

     {/* 🗺️ GPS ROUTE MAP / ELEVATION CHART SECTION */}
     <div>
       <h3 className="text-lg font-semibold mb-2 text-black">
         {showChart ? 'Elevation Profile' : 'GPS Route Map'}
       </h3>
       
       {/* 🎛️ CHART TABS - Between heading and chart */}
       <div className="flex gap-1 flex-wrap mb-2">
         {['Heart Rate', 'Speed', 'Power', 'VAM'].map((metric) => (
           <Button
             key={metric.toLowerCase().replace(' ', '')}
             onClick={() => setSelectedMetric(metric.toLowerCase().replace(' ', ''))}
             className={`px-3 py-1 text-sm font-medium ${
               selectedMetric === metric.toLowerCase().replace(' ', '')
                 ? 'bg-black text-white'
                 : 'bg-white text-black hover:bg-gray-100'
             }`}
           >
             {metric}
           </Button>
         ))}
       </div>
       
       <div className="h-80 relative overflow-hidden -mx-4 md:-mx-6">
         {showChart ? (
           /* Elevation Chart - FIXED: No frame, edge-to-edge, proper label spacing */
           <div className="absolute inset-0">
             <svg width="100%" height="100%" viewBox="0 0 400 200" className="w-full h-full">
               
               {/* Y-axis labels - FIXED: Moved from x="35" to x="45" for full visibility */}
               <text x="45" y="20" textAnchor="end" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>1,400 ft</text>
               <text x="45" y="40" textAnchor="end" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>1,200 ft</text>
               <text x="45" y="60" textAnchor="end" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>1,000 ft</text>
               <text x="45" y="80" textAnchor="end" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>800 ft</text>
               <text x="45" y="100" textAnchor="end" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>600 ft</text>
               <text x="45" y="120" textAnchor="end" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>400 ft</text>
               
               {/* Elevation fill - FIXED: Adjusted to start at x="50" */}
               <path
                 d="M50,100 L70,95 L90,90 L110,80 L130,70 L150,60 L170,50 L190,45 L210,47 L230,55 L250,62 L270,70 L290,77 L310,85 L330,90 L350,92 L370,90 L390,88 L390,140 L50,140 Z"
                 fill="#d1d5db"
                 fillOpacity="0.6"
               />
               
               {/* Elevation line - FIXED: Adjusted to start at x="50" */}
               <path
                 d="M50,100 L70,95 L90,90 L110,80 L130,70 L150,60 L170,50 L190,45 L210,47 L230,55 L250,62 L270,70 L290,77 L310,85 L330,90 L350,92 L370,90 L390,88"
                 stroke="#9ca3af"
                 strokeWidth="2"
                 fill="none"
               />
               
               {/* X-axis labels - FIXED: Better spacing to prevent crowding */}
               <text x="50" y="165" textAnchor="middle" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>0 mi</text>
               <text x="130" y="165" textAnchor="middle" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>3.0 mi</text>
               <text x="210" y="165" textAnchor="middle" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>6.0 mi</text>
               <text x="290" y="165" textAnchor="middle" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>9.0 mi</text>
               <text x="370" y="165" textAnchor="middle" className="text-xs text-gray-600" style={{fontFamily: 'system-ui'}}>12.0 mi</text>
               
             </svg>
           </div>
         ) : (
           /* GPS Route Map */
           <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
             <svg width="100%" height="100%" viewBox="0 0 800 300" className="absolute inset-0">
               {/* Simple route visualization as placeholder */}
               <path
                 d="M50,150 Q200,100 300,120 T500,140 Q600,160 750,180"
                 stroke="#ef4444"
                 strokeWidth="3"
                 fill="none"
                 strokeLinecap="round"
               />
               <path
                 d="M100,200 Q250,180 350,190 T550,200 Q650,210 700,220"
                 stroke="#ef4444"
                 strokeWidth="3"
                 fill="none"
                 strokeLinecap="round"
               />
               <circle cx="80" cy="200" r="6" fill="#ef4444" />
             </svg>
           </div>
         )}
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