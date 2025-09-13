import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';

import { useAppContext } from '@/contexts/AppContext';
import { useWorkouts } from '@/hooks/useWorkouts';
import ActivityMap from './ActivityMap';
import CleanElevationChart from './CleanElevationChart';
import EffortsViewerMapbox from './EffortsViewerMapbox';
import HRZoneChart from './HRZoneChart';
import PowerCadenceChart from './PowerCadenceChart';
import { useCompact } from '@/hooks/useCompact';
import { supabase } from '../lib/supabase';

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
  const compact = useCompact();
  
  const { updateWorkout } = useWorkouts();
  const [selectedMetric, setSelectedMetric] = useState('speed'); // Start with pace/speed
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState('powercurve');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPool, setEditingPool] = useState(false);
  const [poolLengthMeters, setPoolLengthMeters] = useState<number | null>(null);
  const [rememberDefault, setRememberDefault] = useState(false);
  const [hydrated, setHydrated] = useState<any>(workoutData);
  const [analysisInvoked, setAnalysisInvoked] = useState(false);
  const [showAdvancedRunDyn, setShowAdvancedRunDyn] = useState(false);
  const [showPower, setShowPower] = useState(false);
  const [summaryFetched, setSummaryFetched] = useState(false);
  
  useEffect(() => {
    setHydrated(workoutData);
  }, [workoutData]);

  // Silent fetch: hydrate computed summary (gap/distance) from DB on open (no compute trigger)
  useEffect(() => {
    (async () => {
      try {
        if (summaryFetched) return;
        const wid = (hydrated as any)?.id || (workoutData as any)?.id;
        if (!wid) return;
        const needGap = !((hydrated as any)?.computed?.overall?.gap_pace_s_per_mi);
        const needDist = !((hydrated as any)?.computed?.overall?.distance_m);
        if (!needGap && !needDist) return;
        setSummaryFetched(true);
        const { data } = await supabase
          .from('workouts')
          .select('computed')
          .eq('id', String(wid))
          .maybeSingle();
        const cmp = (() => { try { return typeof (data as any)?.computed === 'string' ? JSON.parse((data as any).computed) : (data as any)?.computed; } catch { return (data as any)?.computed; } })();
        if (cmp) setHydrated((prev:any) => ({ ...(prev || workoutData), computed: cmp }));
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated?.id, workoutData?.id]);
  
  // Ensure server analytics exist; trigger compute once if missing and we have an id
  useEffect(() => {
    (async () => {
      try {
        const wid = (hydrated as any)?.id || (workoutData as any)?.id;
        const hasAnalysis = Boolean((hydrated as any)?.computed?.analysis);
        if (!wid || hasAnalysis || analysisInvoked) return;
        setAnalysisInvoked(true);
        await supabase.functions.invoke('compute-workout-analysis', { body: { workout_id: String(wid) } });
        // Refresh computed
        const { data } = await supabase
          .from('workouts')
          .select('computed')
          .eq('id', String(wid))
          .maybeSingle();
        const cmp = (() => { try { return typeof (data as any)?.computed === 'string' ? JSON.parse((data as any).computed) : (data as any)?.computed; } catch { return (data as any)?.computed; } })();
        if (cmp) setHydrated((prev:any) => ({ ...(prev || workoutData), computed: cmp }));
      } catch {}
    })();
  }, [hydrated, workoutData, analysisInvoked]);
  
  // Dev hydration: if workout lacks samples but has a garmin_activity_id,
  // load rich fields (sensor_data, gps_track, swim_data) from garmin_activities
  useEffect(() => { /* no-op: workouts is canonical */ }, [workoutData]);
  
  // No need to initialize localSelectedMetric here - it's handled in the sub-component

   // Simple check: what fields are actually in workoutData?
  useEffect(() => {
    if (workoutData && workoutData.gps_track) {
      if (import.meta.env?.DEV) console.log('📊 workoutData loaded:', workoutData.name, 'GPS:', workoutData.gps_track?.length, 'Sensors:', (Array.isArray((workoutData as any)?.sensor_data?.samples) ? (workoutData as any).sensor_data.samples.length : (workoutData as any)?.sensor_data?.length));
      
      // Debug: Check what data we have
      if (import.meta.env?.DEV) console.log('🔍 CompletedTab workoutData debug:', {
        hasGpsTrack: !!workoutData.gps_track,
        gpsTrackLength: workoutData.gps_track?.length,
        hasSensorData: !!workoutData.sensor_data,
        sensorDataLength: workoutData.sensor_data?.length,
        sensorDataKeys: workoutData.sensor_data ? Object.keys(workoutData.sensor_data[0] || {}) : [],
        workoutDataKeys: Object.keys(workoutData || {})
      });
      
      // Additional debug: Check what we're about to pass to CleanElevationChart
      if (import.meta.env?.DEV) console.log('🔍 DEBUG - About to pass to CleanElevationChart:', {
        gpsTrack: workoutData.gps_track?.length,
        sensorData: (Array.isArray((workoutData as any)?.sensor_data?.samples) ? (workoutData as any).sensor_data.samples.length : (workoutData as any)?.sensor_data?.length),
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
  // Initialize pool length state from explicit, inferred, or default
  useEffect(() => {
    if (workoutType !== 'swim') return;
    try {
      const explicit = Number((workoutData as any)?.pool_length);
      if (Number.isFinite(explicit) && explicit > 0) { setPoolLengthMeters(explicit); return; }
      const defStr = typeof window !== 'undefined' ? window.localStorage.getItem('pool_length_default_m') : null;
      const def = defStr ? Number(defStr) : NaN;
      if (Number.isFinite(def) && def > 0) { setPoolLengthMeters(def); return; }
      // Fallback to inference later via helpers (keep null so helpers compute)
      setPoolLengthMeters(null);
    } catch { setPoolLengthMeters(null); }
  }, [workoutType, workoutData?.id]);


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
      <div className="space-y-2 px-2 pt-0 pb-2" style={{fontFamily: 'Inter, sans-serif'}}>
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
              {(() => {
                const km = (computeDistanceKm(workoutData) ?? Number(workoutData.distance)) || 0;
                return km ? `${formatDistance(km)} ${useImperial ? 'mi' : 'km'}` : 'N/A';
              })()}
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

  // 🔒 EXISTING GARMIN LOGIC - allow swims without GPS
  if (workoutType !== 'swim' && (!workoutData.gps_track || workoutData.gps_track.length === 0)) {
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

 const haversine = (lat: number, lon: number, lat2: number, lon2: number) => {
   const toRad = (d: number) => (d * Math.PI) / 180;
   const R = 6371000;
   const dLat = toRad(lat2 - lat);
   const dLon = toRad(lon2 - lon);
   const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
   return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
 };

 const computeDistanceKm = (w: any): number | null => {
  // Prefer server-computed overall distance (meters) when available
  try {
    const computedMeters = (w as any)?.computed?.overall?.distance_m;
    if (typeof computedMeters === 'number' && computedMeters > 0) return computedMeters / 1000;
  } catch {}
  // Prefer explicit meters → km if present
  const meters = (w as any)?.distance_meters ?? (w as any)?.metrics?.distance_meters ?? (w as any)?.strava_data?.original_activity?.distance;
  if (typeof meters === 'number' && meters > 0) return (meters as number) / 1000;
  // Else, if distance is already km (normalized), use as-is. If it's suspiciously large (meters), convert.
  if (typeof (w as any)?.distance === 'number' && (w as any).distance > 0) return (w as any).distance > 2000 ? (w as any).distance / 1000 : (w as any).distance;
  const track = Array.isArray((w as any)?.gps_track) ? (w as any).gps_track : null;
  if (track && track.length > 1) {
    let meters = 0;
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      if (a?.lat != null && a?.lng != null && b?.lat != null && b?.lng != null) {
        meters += haversine(a.lat, a.lng, b.lat, b.lng);
      }
    }
    if (meters > 0) return meters / 1000;
  }
  const steps = (w as any)?.steps ?? (w as any)?.metrics?.steps;
  if (typeof steps === 'number' && steps > 0) return (steps * 0.78) / 1000;
  return null;
};

 const formatDistance = (km: any): string => {
   const num = Number(km);
   if (!num || isNaN(num)) return '0.0';
   if (useImperial) return (num * 0.621371).toFixed(1);
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
  if (import.meta.env?.DEV) console.log('🚨 UPDATED formatSpeed function is running!');
  
  // 🔧 FIXED: This function should actually be looking for BEST PACE, not speed
  // For running/walking, we want the fastest pace (lowest time per km)
  // For cycling, we want the fastest speed (highest km/h)
  
  if (workoutType === 'run' || workoutType === 'walk') {
    // For running/walking: Look for best pace (fastest pace = lowest time per km)
    const maxPaceSecondsPerKm = Number(workoutData.max_pace);
    const avgPaceSecondsPerKm = Number(workoutData.avg_pace);
    
    if (import.meta.env?.DEV) console.log('🔍 formatSpeed (RUN/WALK) - looking for best pace:', {
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
      if (import.meta.env?.DEV) console.log('🔍 formatSpeed returning best pace:', paceString);
      return paceString;
    }
  } else {
    // For cycling: Look for fastest speed (highest km/h)
    const maxSpeedKmh = Number(workoutData.max_speed);
    const avgSpeedKmh = Number(workoutData.avg_speed);
    
    if (import.meta.env?.DEV) console.log('🔍 formatSpeed (CYCLE) - looking for fastest speed:', {
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
      if (import.meta.env?.DEV) console.log('🔍 formatSpeed returning fastest speed:', speedMph.toFixed(1), 'mph');
      return `${speedMph.toFixed(1)} mph`;
    }
  }
  
  if (import.meta.env?.DEV) console.log('🔍 formatSpeed returning N/A - no pace/speed data found');
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
   if (import.meta.env?.DEV) console.log('🔍 formatTemperature called with:', c, typeof c);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible temperature sources
   const temp = c || 
                workoutData.avg_temperature || 
                workoutData.metrics?.avg_temperature ||
                workoutData.metrics?.temperature ||
                workoutData.temperature;
   const num = Number(temp);
   
   if (!num || isNaN(num)) {
     if (import.meta.env?.DEV) console.log('🔍 formatTemperature returning N/A because num is:', num, 'isNaN:', isNaN(num));
     return 'N/A';
   }
   
   // Always show Fahrenheit for now (settings toggle later)
   const f = Math.round((num * 9/5) + 32);
   if (import.meta.env?.DEV) console.log('🔍 formatTemperature converting:', num, '°C to', f, '°F');
   return `${f}°F`;
 };

 // Format pace using basic calculation from distance and duration
const formatPace = (paceValue: any): string => {
  let secondsPerKm: number | null = null;
  const raw = Number(paceValue);
  if (Number.isFinite(raw) && raw > 0) {
    // Normalize: if value looks like minutes/km (< 30), convert to seconds/km
    secondsPerKm = raw < 30 ? raw * 60 : raw;
  }

  if (secondsPerKm != null) {
    const secondsPerMile = secondsPerKm * 1.60934; // km → mi
    const minutes = Math.floor(secondsPerMile / 60);
    const seconds = Math.round(secondsPerMile % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
  }

  // Fallback: compute average pace from distance (km) and duration (minutes)
  const distanceKm = Number(workoutData.distance);
  const durationMinutes = Number(workoutData.duration);
  if (distanceKm && durationMinutes && distanceKm > 0 && durationMinutes > 0) {
    const distanceMiles = distanceKm * 0.621371;
    const paceMinPerMile = durationMinutes / distanceMiles;
    const minutes = Math.floor(paceMinPerMile);
    const seconds = Math.round((paceMinPerMile - minutes) * 60);
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
   if (import.meta.env?.DEV) console.log('🔍 formatTime called with:', timestamp, typeof timestamp);
   
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
   if (import.meta.env?.DEV) console.log('🔍 formatTime result:', result);
   return result;
 };

 const formatDate = (dateStr: any): string => {
   // 🔧 GARMIN DATA EXTRACTION: Try multiple date sources
   const dateValue = dateStr || workoutData.date || workoutData.start_date;
   if (!dateValue) return 'N/A';
   
   if (import.meta.env?.DEV) console.log('🔍 formatDate debugging:', {
     input: dateStr,
     dateValue,
     type: typeof dateValue
   });
   
   // Create Date object - handle UTC timestamps properly
   const date = new Date(dateValue);
   
   if (import.meta.env?.DEV) console.log('🔍 Date object created:', {
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
   if (import.meta.env?.DEV) console.log('🔍 formatDate result:', result);
   
   return result;
 };

 const getCityFromCoordinates = (lat: any, lng: any): string => {
   if (import.meta.env?.DEV) console.log('🔍 getCityFromCoordinates called with:', lat, lng);
   
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
     if (import.meta.env?.DEV) console.log('🔍 getCityFromCoordinates returning Unknown - no valid coords');
     return 'Unknown';
   }
   
   // Location detection - coordinates will show actual location
   if (import.meta.env?.DEV) console.log('🔍 getCityFromCoordinates returning Unknown - no location detection implemented');
   return 'Unknown';
 };

 const generateTitle = (): string => {
   // 🔧 GARMIN DATA EXTRACTION: Use timestamp for Garmin activities, date for manual workouts
   const date = formatDate(workoutData.timestamp || workoutData.date);
   const city = getCityFromCoordinates(workoutData.start_position_lat, workoutData.start_position_long);
   const title = `${date} ${city} ${workoutData.type}`;
   if (import.meta.env?.DEV) console.log('🔍 generateTitle result:', title);
   if (import.meta.env?.DEV) console.log('🔍 generateTitle debugging:', {
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
          value: (() => {
            const km = (computeDistanceKm(workoutData) ?? Number(workoutData.distance)) || 0;
            return km ? formatDistance(km) : 'N/A';
          })(),
          unit: useImperial ? 'mi' : 'km'
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
        value: (() => {
          const km = (computeDistanceKm(workoutData) ?? Number(workoutData.distance)) || 0;
          return km ? formatDistance(km) : 'N/A';
        })(),
        unit: useImperial ? 'mi' : 'km'
      },
      {
        label: 'Duration', 
        value: formatDuration((workoutData as any)?.total_elapsed_time ?? (workoutData as any)?.elapsed_time ?? workoutData.duration)
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
          value: (() => {
            const v = (
              workoutData.avg_cadence ??
              workoutData.metrics?.avg_cadence ??
              workoutData.avg_running_cadence ??
              workoutData.avg_run_cadence ??
              workoutData.max_cadence ??
              workoutData.metrics?.max_cadence ??
              workoutData.max_running_cadence ??
              workoutData.max_run_cadence
            );
            const n = typeof v === 'string' ? parseFloat(v) : (v as number);
            return n != null && !isNaN(Number(n)) ? safeNumber(n) : 'N/A';
          })(),
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
          value: (() => {
            const v = (
              workoutData.avg_cadence ??
              workoutData.metrics?.avg_cadence ??
              workoutData.avg_bike_cadence ??
              workoutData.metrics?.avg_bike_cadence ??
              workoutData.max_cadence ??
              workoutData.metrics?.max_cadence ??
              workoutData.max_bike_cadence ??
              workoutData.metrics?.max_bike_cadence
            );
            const n = typeof v === 'string' ? parseFloat(v) : (v as number);
            return n != null && !isNaN(Number(n)) ? safeNumber(n) : 'N/A';
          })(),
          unit: 'rpm'
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    } else if (isSwim) {
      return [
        ...baseMetrics.slice(0, 3), // Distance, Duration, Heart Rate
        {
          label: 'Pace',
          value: (() => {
            const s = computeSwimAvgPaceSecPer100();
            return s ? formatSwimPace(s) : 'N/A';
          })(),
          unit: (() => (isYardPool() === true ? '/100yd' : '/100m'))()
        },
        {
          label: 'Cadence',
          value: workoutData.avg_cadence ? safeNumber(workoutData.avg_cadence) : 'N/A',
          unit: 'spm'
        },
        {
          label: 'Lengths',
          value: (() => {
            const n = (workoutData as any)?.number_of_active_lengths ?? ((workoutData as any)?.swim_data?.lengths ? (workoutData as any).swim_data.lengths.length : null);
            return n != null ? safeNumber(n) : 'N/A';
          })()
        },
        {
          label: 'Pool',
          value: formatPoolLengthLabel()
        },
        ...baseMetrics.slice(3) // Elevation, Calories
      ];
    }

    return baseMetrics;
  };

  // ----- Swim helpers -----
  const getDurationSeconds = (): number | null => {
    const t = Number(
      workoutData.total_timer_time ??
      workoutData.moving_time ??
      workoutData.elapsed_time ??
      (typeof workoutData.duration === 'number' ? workoutData.duration * 60 : null)
    );
    return Number.isFinite(t) && t > 0 ? t : null;
  };

  const getDistanceMeters = (): number | null => {
    const km = computeDistanceKm(workoutData);
    if (km != null && Number.isFinite(km) && km > 0) return km * 1000;
    return null;
  };

  const inferPoolLengthMeters = (): number | null => {
    const explicit = Number(poolLengthMeters ?? (workoutData as any).pool_length);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const distM = getDistanceMeters();
    const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
    if (distM && nLengths > 0) return distM / nLengths;
    return null;
  };

  const isYardPool = (): boolean | null => {
    const L = inferPoolLengthMeters();
    if (!L) return null;
    if (Math.abs(L - 22.86) <= 0.6) return true; // 25y
    if (Math.abs(L - 25) <= 0.8 || Math.abs(L - 50) <= 1.2 || Math.abs(L - 33.33) <= 1.0) return false;
    return null;
  };

  const computeSwimAvgPaceSecPer100 = (): number | null => {
    const sec = getDurationSeconds();
    const distM = getDistanceMeters();
    if (!sec || !distM || distM <= 0) return null;
    const yardPool = isYardPool();
    if (yardPool === true) {
      const distYd = distM / 0.9144;
      if (distYd <= 0) return null;
      return sec / (distYd / 100);
    }
    return sec / (distM / 100);
  };

  const formatPoolLengthLabel = (): string => {
    const L = inferPoolLengthMeters();
    if (!L) return 'N/A';
    const yardPool = isYardPool();
    if (yardPool === true) return '25 yd';
    const candidates = [25, 50, 33.33];
    let best = L; let label = `${Math.round(L)} m`;
    for (const c of candidates) {
      if (Math.abs(L - c) < Math.abs(best - (typeof best === 'number' ? best : c))) {
        best = c; label = `${c} m`;
      }
    }
    return label;
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
         value: (() => {
           const raw = workoutData.metrics?.max_pace || workoutData.max_pace;
           const n = Number(raw);
           if (!Number.isFinite(n) || n <= 0) return 'N/A';
           const secPerKm = n < 30 ? n * 60 : n;
           const secPerMile = secPerKm * 1.60934;
           if (secPerMile < 360) return 'N/A'; // guard: unrealistic for walk/hike
           return formatPace(raw);
         })(),
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
       value: (() => {
         const v = (
           workoutData.max_cadence ??
           workoutData.metrics?.max_cadence ??
           workoutData.max_running_cadence ??
           workoutData.max_bike_cadence ??
           workoutData.max_run_cadence ??
           workoutData.metrics?.max_bike_cadence ??
           workoutData.avg_cadence ??
           workoutData.metrics?.avg_cadence
         );
         const n = typeof v === 'string' ? parseFloat(v) : (v as number);
         return n != null && !isNaN(Number(n)) ? safeNumber(n) : 'N/A';
       })(),
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
   if (import.meta.env?.DEV) console.log('🔍 calculateTotalWork - total_work:', workoutData.metrics?.total_work);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible work sources
   const totalWork = workoutData.metrics?.total_work || 
                    workoutData.total_work || 
                    workoutData.work;
   
   // Use total_work from FIT file if available (in Joules), convert to kJ
   if (totalWork) {
     const kj = Math.round(Number(totalWork) / 1000);
     if (import.meta.env?.DEV) console.log('✅ calculateTotalWork using total_work:', kj, 'kJ');
     return `${kj} kJ`;
   }
   // Fallback calculation if total_work not available
   else if (workoutData.metrics?.avg_power && workoutData.duration) {
     // Convert duration from minutes to seconds for proper kJ calculation
     const durationSeconds = workoutData.duration * 60;
     const kj = Math.round((workoutData.metrics.avg_power * durationSeconds) / 1000);
     if (import.meta.env?.DEV) console.log('✅ calculateTotalWork using fallback calc:', kj, 'kJ');
     return `${kj} kJ`;
   }
   if (import.meta.env?.DEV) console.log('✅ calculateTotalWork returning N/A');
   return 'N/A';
 };

 // Derive average stride length for runs/walks (meters)
 const deriveStrideLengthMeters = (): number | null => {
   try {
     // Already provided?
     const metricVal = (workoutData as any)?.metrics?.avg_stride_length_m || (workoutData as any)?.avg_stride_length_m;
     if (Number.isFinite(metricVal)) return Number(metricVal);
     // From samples
     const samples = Array.isArray((hydrated as any)?.sensor_data?.samples)
       ? (hydrated as any).sensor_data.samples
       : (Array.isArray((hydrated as any)?.sensor_data) ? (hydrated as any).sensor_data : []);
     const arr = samples
       .map((s: any) => s.strideLengthInMeters ?? s.stride_length_m ?? s.strideLength ?? null)
       .filter((v: any) => Number.isFinite(v));
     if (arr.length > 10) {
       const avg = arr.reduce((a: number, b: number) => a + Number(b), 0) / arr.length;
       if (Number.isFinite(avg) && avg > 0) return avg;
     }
     // From distance and steps
     const km = computeDistanceKm(workoutData);
     const steps = Number((workoutData as any)?.steps ?? (workoutData as any)?.metrics?.steps);
     if (Number.isFinite(km) && Number.isFinite(steps) && steps > 0) {
       return (Number(km) * 1000) / steps;
     }
   } catch {}
   return null;
 };

 const formatStrideLength = (meters: number | null): string => {
   if (!Number.isFinite(meters as any) || (meters as any) <= 0) return 'N/A';
   const m = Number(meters);
   if (useImperial) {
     const inches = m * 39.3701;
     return `${inches.toFixed(1)} in`;
   }
   return `${(m * 100).toFixed(1)} cm`;
 };

 const calculateVAM = () => {
   if (import.meta.env?.DEV) console.log('🔍 calculateVAM - avg_vam:', workoutData.metrics?.avg_vam);
   
   // 🔧 GARMIN DATA EXTRACTION: Try all possible VAM sources
   const avgVam = workoutData.metrics?.avg_vam || 
                 workoutData.avg_vam || 
                 workoutData.vam;
   
   // Use avg_vam from FIT file if available
   if (avgVam) {
     const vam = Math.round(Number(avgVam) * 1000); // Convert to m/h
     if (import.meta.env?.DEV) console.log('✅ calculateVAM using avg_vam:', vam, 'm/h');
     return `${vam} m/h`;
   }
   // Fallback calculation
   else if (workoutData.elevation_gain && workoutData.duration) {
     const elevationM = Number(workoutData.elevation_gain);
     // workoutData.duration is in MINUTES, convert to hours
     const durationHours = (workoutData.duration * 60) / 3600;
     const vam = Math.round(elevationM / durationHours);
     if (import.meta.env?.DEV) console.log('✅ calculateVAM using fallback calc:', vam, 'm/h');
     return `${vam} m/h`;
   }
   if (import.meta.env?.DEV) console.log('✅ calculateVAM returning N/A');
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
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation - workoutType:', workoutType);
   if (workoutType !== 'run' && workoutType !== 'walk') {
     if (import.meta.env?.DEV) console.log('❌ GAP calculation skipped - not a run/walk:', workoutType);
     return null;
   }
   
   const distance = workoutData.distance;
   const duration = workoutData.duration;
   const elevationGain = workoutData.elevation_gain || workoutData.metrics?.elevation_gain;
   
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation - data:', { distance, duration, elevationGain });
   
   if (!distance || !duration || !elevationGain) {
     if (import.meta.env?.DEV) console.log('❌ GAP calculation skipped - missing data');
     return null;
   }
   
   // Convert to standard units - handle both km and miles
   let distanceMiles = Number(distance);
   let durationMinutes = Number(duration);
   let elevationFeet = Number(elevationGain);
   
   // If distance is in km, convert to miles
   if (distanceMiles > 10) { // Likely in km if > 10
     distanceMiles = distanceMiles * 0.621371; // km to miles
     if (import.meta.env?.DEV) console.log('🔍 Converted distance from km to miles:', distanceMiles);
   }
   
   // If duration is in seconds, convert to minutes
   if (durationMinutes > 60) { // Likely in seconds if > 60
     durationMinutes = durationMinutes / 60; // seconds to minutes
     if (import.meta.env?.DEV) console.log('🔍 Converted duration from seconds to minutes:', durationMinutes);
   }
   
   // If elevation is in meters, convert to feet
   if (elevationFeet > 1000) { // Likely in meters if > 1000
     elevationFeet = elevationFeet * 3.28084; // meters to feet
     if (import.meta.env?.DEV) console.log('🔍 Converted elevation from meters to feet:', elevationFeet);
   }
   
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation - converted units:', { distanceMiles, durationMinutes, elevationFeet });
   
   // Calculate actual pace (min/mi)
   const actualPaceMinutes = durationMinutes / distanceMiles;
   if (import.meta.env?.DEV) console.log('🔍 Actual pace (min/mi):', actualPaceMinutes);
   
   // Proper Strava GAP formula
   // Elevation gain per mile affects pace
   const elevationPerMile = elevationFeet / distanceMiles;
   if (import.meta.env?.DEV) console.log('🔍 Elevation per mile:', elevationPerMile);
   
   // Strava's GAP adjustment: more sophisticated than simple linear
   // Accounts for both uphill and downhill effects
   let gapAdjustment = 0;
   
   if (elevationPerMile > 0) {
     // Uphill: slows you down more than simple linear
     // Strava uses a curve that increases impact for steeper grades
     gapAdjustment = (elevationPerMile / 100) * 1.2; // 20% more impact than linear
     if (import.meta.env?.DEV) console.log('🔍 Uphill adjustment:', gapAdjustment);
   } else if (elevationPerMile < 0) {
     // Downhill: speeds you up, but not as much as uphill slows you down
     gapAdjustment = (Math.abs(elevationPerMile) / 100) * 0.8; // 80% of uphill benefit
     if (import.meta.env?.DEV) console.log('🔍 Downhill adjustment:', gapAdjustment);
   }
   
   // Calculate GAP
   // Uphill: add penalty (slower pace), Downhill: subtract benefit (faster pace)
   const gapPaceMinutes = actualPaceMinutes + gapAdjustment;
   if (import.meta.env?.DEV) console.log('🔍 GAP pace (min/mi):', gapPaceMinutes);
   
   // Format GAP pace (don't go below 0)
   const gapPace = formatPace(Math.max(0, gapPaceMinutes));
   if (import.meta.env?.DEV) console.log('🔍 Final GAP pace:', gapPace);
   
   return gapPace;
 };

 const formatMovingTime = () => {
   if (import.meta.env?.DEV) console.log('🔍 formatMovingTime checking:', {
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
     if (import.meta.env?.DEV) console.log('🔍 formatMovingTime using total_timer_time');
     return formatDuration(timerTime);
   } else if (movingTime) {
     if (import.meta.env?.DEV) console.log('🔍 formatMovingTime using moving_time');
     return formatDuration(movingTime);
   } else if (elapsedTime) {
     if (import.meta.env?.DEV) console.log('🔍 formatMovingTime using elapsed_time');
     return formatDuration(elapsedTime);
   }
   if (import.meta.env?.DEV) console.log('🔍 formatMovingTime returning N/A');
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
  <div className="space-y-2 px-2 pt-0 pb-2" style={{fontFamily: 'Inter, sans-serif'}}>
     
     
     {/* 🏠 SWIM SETTINGS (Pool length editor) */}
     {workoutType === 'swim' && (
       <div className="flex items-center justify-between mb-2">
         <div className="text-sm text-gray-600">Pool length</div>
         {!editingPool ? (
           <div className="flex items-center gap-2">
             <div className="text-sm font-medium">{formatPoolLengthLabel()}</div>
             <button className="text-xs underline text-gray-600 hover:text-black" onClick={()=>setEditingPool(true)}>Edit</button>
           </div>
         ) : (
           <div className="flex items-center gap-2">
             <select
               className="border rounded px-2 py-1 text-sm"
               value={(poolLengthMeters ?? inferPoolLengthMeters() ?? 25).toString()}
               onChange={(e)=> setPoolLengthMeters(Number(e.target.value))}
             >
               <option value="22.86">25 yd</option>
               <option value="25">25 m</option>
               <option value="33.33">33.33 m</option>
               <option value="50">50 m</option>
             </select>
             <label className="flex items-center gap-1 text-xs text-gray-600">
               <input type="checkbox" checked={rememberDefault} onChange={(e)=> setRememberDefault(e.target.checked)} />
               Remember as default
             </label>
             <button
               className="text-xs px-2 py-1 rounded bg-black text-white"
               onClick={async()=>{
                 try {
                   const m = Number(poolLengthMeters ?? inferPoolLengthMeters() ?? 25);
                   if (Number.isFinite(m) && m > 0) {
                     await updateWorkout?.(workoutData.id, { pool_length: m });
                     if (rememberDefault && typeof window !== 'undefined') {
                       try { window.localStorage.setItem('pool_length_default_m', String(m)); } catch {}
                     }
                   }
                 } catch {}
                 setEditingPool(false);
               }}
             >Save</button>
             <button className="text-xs underline text-gray-600 hover:text-black" onClick={()=> setEditingPool(false)}>Cancel</button>
           </div>
         )}
       </div>
     )}
     
     {/* 🏠 ALL METRICS - 3-column grid with tighter spacing */}
     <div className="grid grid-cols-3 gap-1">
       {/* General metrics - Only for non-cycling workouts */}
       {workoutType !== 'ride' && (
         <>
           {/* Distance */}
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
               {(() => {
                 const src = (hydrated || workoutData);
                 const km = (computeDistanceKm(src) ?? Number(src?.distance)) || 0;
                 return km ? `${formatDistance(km)} ${useImperial ? 'mi' : 'km'}` : 'N/A';
               })()}
             </div>
             <div className="text-xs text-[#666666] font-normal">
               <div className="font-medium">Distance</div>
             </div>
           </div>

           {/* Duration */}
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
               {formatDuration((workoutData as any)?.total_elapsed_time ?? (workoutData as any)?.elapsed_time ?? workoutData.duration)}
             </div>
             <div className="text-xs text-[#666666] font-normal">
               <div className="font-medium">Duration</div>
             </div>
           </div>
           
           {/* Avg HR */}
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
               {workoutData.avg_heart_rate ? safeNumber(workoutData.avg_heart_rate) : 'N/A'}
             </div>
             <div className="text-xs text-[#666666] font-normal">
               <div className="font-medium">Avg HR</div>
             </div>
           </div>
           
           {/* Avg Pace/Speed */}
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
         </>
       )}

       {/* Row 2: GAP, Max Speed, Avg Cadence */}
      {workoutType === 'run' && (
        <div className="px-2 py-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {(() => {
              const src = (hydrated || workoutData) as any;
              const gapSec = src?.computed?.overall?.gap_pace_s_per_mi ?? src?.metrics?.gap_pace_s_per_mi;
              if (Number.isFinite(gapSec) && (gapSec as number) > 0) {
                const sec = Number(gapSec);
                return `${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}/mi`;
              }
              return 'N/A';
            })()}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">GAP</div>
          </div>
        </div>
      )}

      <div className="px-2 py-1">
        <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
          {(workoutType === 'run' || workoutType === 'walk')
            ? (() => {
                // Preferred: stored max_pace (sec/km). Fallback: derive from samples.
                const stored = workoutData.metrics?.max_pace ?? workoutData.max_pace;
                let secPerKm: number | null = null;
                if (Number.isFinite(stored) && Number(stored) > 0) {
                  const n = Number(stored);
                  secPerKm = n < 30 ? n * 60 : n; // tolerate minutes value
                } else {
                  try {
                    const samples = Array.isArray((workoutData as any)?.sensor_data?.samples)
                      ? (workoutData as any).sensor_data.samples
                      : (Array.isArray((workoutData as any)?.sensor_data) ? (workoutData as any).sensor_data : []);
                    let maxMps = 0;
                    for (let i = 0; i < samples.length; i += 1) {
                      const s: any = samples[i] || {};
                      const v = (typeof s.speedMetersPerSecond === 'number' ? s.speedMetersPerSecond
                        : (typeof s.v === 'number' ? s.v
                        : (typeof s.speed === 'number' ? s.speed : NaN)));
                      if (Number.isFinite(v) && v > maxMps) maxMps = v;
                    }
                    if (maxMps > 0.5) secPerKm = 1000 / maxMps;
                  } catch {}
                }
                if (!Number.isFinite(secPerKm) || (secPerKm as number) <= 0) return 'N/A';
                const secPerMile = (secPerKm as number) * 1.60934;
                if (workoutType === 'walk' && secPerMile < 360) return 'N/A';
                return formatPace(secPerKm);
              })()
            : (workoutData.max_speed ? formatMaxSpeed(workoutData.max_speed) : 'N/A')}
        </div>
        <div className="text-xs text-[#666666] font-normal">
          <div className="font-medium">{(workoutType === 'run' || workoutType === 'walk') ? 'Max Pace' : 'Max Speed'}</div>
        </div>
      </div>
      
      {workoutType === 'ride' ? (
        <>
          {/* Distance */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {formatDistance(workoutData.distance_km || workoutData.distance_m / 1000)}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Distance</div>
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

          {/* Elevation Gain */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {formatElevation(workoutData.elevation_gain || workoutData.metrics?.elevation_gain)} ft
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Climbed</div>
            </div>
          </div>

          {/* Avg Speed */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {formatAvgSpeed(workoutData.avg_speed)}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg Speed</div>
            </div>
          </div>

          {/* Avg Power */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.avg_power ? safeNumber(workoutData.avg_power) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg Power</div>
            </div>
          </div>

          {/* Avg HR */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.avg_heart_rate ? safeNumber(workoutData.avg_heart_rate) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg HR</div>
            </div>
          </div>

          {/* Avg Cadence */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const v = (
                  workoutData.avg_cadence ??
                  workoutData.metrics?.avg_cadence ??
                  workoutData.avg_bike_cadence
                );
                return v != null ? safeNumber(v) : 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg Cadence</div>
            </div>
          </div>

          {/* VAM - only show if gain > ~150 ft/50 m */}
          {(() => {
            const gain = workoutData.elevation_gain || workoutData.metrics?.elevation_gain || 0;
            return gain > 150 ? (
              <div className="px-2 py-1">
                <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                  {calculateVAM()}
                </div>
                <div className="text-xs text-[#666666] font-normal">
                  <div className="font-medium">VAM</div>
                </div>
              </div>
            ) : null;
          })()}

          {/* Calories */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.calories ? safeNumber(workoutData.calories) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Calories</div>
            </div>
          </div>

          {/* Max Power */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const field = workoutData.max_power ?? workoutData.metrics?.max_power;
                if (field != null) return safeNumber(field);
                const sensors = Array.isArray(workoutData.sensor_data) ? workoutData.sensor_data : [];
                const maxSensor = sensors
                  .map((s: any) => Number(s.power))
                  .filter((n: any) => Number.isFinite(n))
                  .reduce((m: number, n: number) => Math.max(m, n), -Infinity);
                return Number.isFinite(maxSensor) ? safeNumber(maxSensor) : 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Power</div>
            </div>
          </div>

          {/* Max Speed */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.max_speed ? formatMaxSpeed(workoutData.max_speed) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Speed</div>
            </div>
          </div>

          {/* Max Cadence */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const field = (
                  workoutData.max_cadence ??
                  workoutData.metrics?.max_cadence ??
                  (workoutData as any)?.computed?.overall?.max_cadence_spm ??
                  workoutData.max_bike_cadence ??
                  workoutData.max_running_cadence
                );
                if (field != null) return safeNumber(field);
                const sensors = Array.isArray(workoutData.sensor_data) ? workoutData.sensor_data : [];
                const maxSensor = sensors
                  .map((s: any) => Number(s.cadence) || Number(s.bikeCadence) || Number(s.runCadence))
                  .filter((n: any) => Number.isFinite(n))
                  .reduce((m: number, n: number) => Math.max(m, n), -Infinity);
                return Number.isFinite(maxSensor) ? safeNumber(maxSensor) : 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Cadence</div>
            </div>
          </div>

          {/* Max HR */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.max_heart_rate ? safeNumber(workoutData.max_heart_rate) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max HR</div>
            </div>
          </div>
        </>
      ) : (
        <div className="px-2 py-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {(() => {
              const v = (
                workoutData.avg_cadence ??
                workoutData.metrics?.avg_cadence ??
                workoutData.avg_running_cadence
              );
              return v != null ? safeNumber(v) : 'N/A';
            })()}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Avg Cadence</div>
          </div>
        </div>
      )}
      
      {/* Row 3: Elevation, Calories, Max HR - Only for non-cycling workouts */}
      {workoutType !== 'ride' && (
        <>
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
     
          {(workoutType === 'run' || workoutType === 'walk') && (
            <div className="px-2 py-1">
              <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                {formatStrideLength(deriveStrideLengthMeters())}
              </div>
              <div className="text-xs text-[#666666] font-normal">
                <div className="font-medium">Stride Length</div>
              </div>
            </div>
          )}
     
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {workoutData.max_heart_rate ? safeNumber(workoutData.max_heart_rate) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max HR</div>
            </div>
          </div>

          {/* Row 4: Max Cadence, VAM - Only for non-cycling workouts */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const field = (
                  workoutData.max_cadence ??
                  workoutData.metrics?.max_cadence ??
                  (workoutData as any)?.computed?.overall?.max_cadence_spm ??
                  workoutData.max_bike_cadence ??
                  workoutData.max_running_cadence
                );
                if (field != null) return safeNumber(field);
                const sensors = Array.isArray(workoutData.sensor_data) ? workoutData.sensor_data : [];
                const maxSensor = sensors
                  .map((s: any) => Number(s.cadence) || Number(s.bikeCadence) || Number(s.runCadence))
                  .filter((n: any) => Number.isFinite(n))
                  .reduce((m: number, n: number) => Math.max(m, n), -Infinity);
                return Number.isFinite(maxSensor) ? safeNumber(maxSensor) : 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Cadence</div>
            </div>
          </div>
           
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
               {calculateVAM()}
             </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">VAM</div>
            </div>
           </div>
           
           {/* Moving Time - Final metric for non-cycling workouts */}
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
               {formatMovingTime()}
             </div>
             <div className="text-xs text-[#666666] font-normal">
               <div className="font-medium">Moving Time</div>
             </div>
           </div>
        </>
      )}
     </div>

     {/* GPS ROUTE MAP & ELEVATION PROFILE SECTION - FORCE PHYSICAL SEPARATION */}
     <div className="w-full">
       {/* Advanced synced viewer: Mapbox puck + interactive chart + splits */}
       {(() => {
         const series = (hydrated||workoutData)?.computed?.analysis?.series || null;
         const time_s = Array.isArray(series?.time_s) ? series.time_s : (Array.isArray(series?.time) ? series.time : []);
         const distance_m = Array.isArray(series?.distance_m) ? series.distance_m : [];
         const elev = Array.isArray(series?.elevation_m) ? series.elevation_m : [];
         const pace = Array.isArray(series?.pace_s_per_km) ? series.pace_s_per_km : [];
         const hr = Array.isArray(series?.hr_bpm) ? series.hr_bpm : [];
         if (!Array.isArray(distance_m) || distance_m.length < 2) return null;
         const len = Math.min(distance_m.length, time_s.length || distance_m.length);
         const samples = (()=>{
           const out:any[] = [];
           let ema: number | null = null, lastE: number | null = null, lastD: number | null = null, lastT: number | null = null;
           const a = 0.2;
           for (let i=0;i<len;i++){
             const t = Number(time_s?.[i] ?? i) || 0;
             const d = Number(distance_m?.[i] ?? 0) || 0;
             const e = typeof elev?.[i] === 'number' ? Number(elev[i]) : null;
             if (e != null) ema = (ema==null ? e : a*e + (1-a)*ema);
             const es = (ema != null) ? ema : (e != null ? e : (lastE != null ? lastE : 0));
             let grade: number | null = null, vam: number | null = null;
             if (lastE != null && lastD != null && lastT != null){
               const dd = Math.max(1, d - lastD);
               const dh = es - lastE;
               const dt = Math.max(1, t - lastT);
               grade = dh / dd;
               vam = (dh/dt) * 3600;
             }
             out.push({
               t_s: t,
               d_m: d,
               elev_m_sm: es,
               pace_s_per_km: Number.isFinite(pace?.[i]) ? Number(pace[i]) : null,
               hr_bpm: Number.isFinite(hr?.[i]) ? Number(hr[i]) : null,
               grade,
               vam_m_per_h: vam
             });
             lastE = es; lastD = d; lastT = t;
           }
           return out;
         })();
         // Build GPS-derived track once (for route and optional elevation fallback)
         const gpsRaw = (hydrated||workoutData)?.gps_track;
         const gps = Array.isArray(gpsRaw)
           ? gpsRaw
           : (typeof gpsRaw === 'string' ? (()=>{ try { const v = JSON.parse(gpsRaw); return Array.isArray(v)? v : []; } catch { return []; } })() : []);
         const track = gps
           .map((p:any)=>{
             const lng = p.lng ?? p.longitudeInDegree ?? p.longitude ?? p.lon;
             const lat = p.lat ?? p.latitudeInDegree ?? p.latitude;
             if ([lng,lat].every((v)=>Number.isFinite(v))) return [Number(lng), Number(lat)] as [number,number];
             return null;
           })
           .filter(Boolean) as [number,number][];
         // diagnostics
         try {
           const elevVals = samples.map((s:any)=>s.elev_m_sm).filter((v:any)=>Number.isFinite(v));
           const eMin = elevVals.length? Math.min(...elevVals) : null;
           const eMax = elevVals.length? Math.max(...elevVals) : null;
           // eslint-disable-next-line no-console
           console.log('[viewer] track pts:', track.length, 'samples:', samples.length, 'elev count:', elevVals.length, 'elev range:', eMin, eMax);
         } catch {}
         // If series elevation is effectively missing, derive from gps_track altitude
         try {
           const elevValsAll = samples.map((s:any)=>s.elev_m_sm).filter((v:any)=>Number.isFinite(v)) as number[];
           const elevFinite = elevValsAll.length;
           const eMin2 = elevValsAll.length ? Math.min(...elevValsAll) : 0;
           const eMax2 = elevValsAll.length ? Math.max(...elevValsAll) : 0;
           const eRange2 = Math.abs(eMax2 - eMin2);
           const missingOrFlat = elevFinite < Math.max(3, Math.floor(samples.length*0.2)) || eRange2 < 0.5;
           if (missingOrFlat) {
             const pts = gps.map((p:any)=>({
               lat: Number(p.lat ?? p.latitude ?? p.latitudeInDegree),
               lon: Number(p.lng ?? p.lon ?? p.longitude ?? p.longitudeInDegree),
               elev: (typeof p.elevation === 'number' ? Number(p.elevation) : (typeof p.altitude === 'number' ? Number(p.altitude) : NaN))
             })).filter((p:any)=>[p.lat,p.lon].every(Number.isFinite));
             if (pts.length > 1) {
               const R = 6371000;
               const hav = (a:any,b:any)=>{ const φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180; const dφ=(b.lat-a.lat)*Math.PI/180; const dλ=(b.lon-a.lon)*Math.PI/180; const s=Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2; return 2*R*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)); };
               const cum:number[] = [0];
               for (let i=1;i<pts.length;i++) cum[i] = cum[i-1] + hav(pts[i-1], pts[i]);
               const nearestIdx = (target:number)=>{ let lo=0, hi=cum.length-1; while(lo<hi){ const m=(lo+hi)>>1; (cum[m]<target)?(lo=m+1):(hi=m); } return lo; };
               for (let i=0;i<samples.length;i++) {
                 const idx = nearestIdx(samples[i].d_m);
                 const ei = pts[idx]?.elev;
                 if (Number.isFinite(ei)) samples[i].elev_m_sm = Number(ei);
               }
               // recompute grade/vam after setting elevation
               for (let i=1;i<samples.length;i++) {
                 const aS = samples[i-1], bS = samples[i];
                 const dd = Math.max(1, bS.d_m - aS.d_m);
                 const dh = (Number(bS.elev_m_sm) - Number(aS.elev_m_sm));
                 const dt = Math.max(1, bS.t_s - aS.t_s);
                 bS.grade = dh / dd;
                 bS.vam_m_per_h = (dh/dt) * 3600;
               }
             }
           }
         } catch {}
        return (
          <div className="mt-1 mx-[-16px]">
            <EffortsViewerMapbox
              samples={samples as any}
              trackLngLat={track}
              useMiles={!!useImperial}
              useFeet={!!useImperial}
              compact={compact}
              workoutData={workoutData}
            />
          </div>
        );
      })()}
      {(hydrated||workoutData)?.computed?.analysis?.events?.splits && (
        <div className="mx-[-16px] px-3 py-2">
          {!useImperial && Array.isArray((hydrated||workoutData).computed.analysis.events.splits.km) && (hydrated||workoutData).computed.analysis.events.splits.km.length > 0 && (
            <div className="mb-2">
              <div className="text-sm mb-1">Splits · km</div>
              <div className="space-y-1">
                {(hydrated||workoutData).computed.analysis.events.splits.km.map((s:any) => (
                  <div key={`km-${s.n}`} className="flex items-baseline justify-between text-sm">
                    <div className="text-[#666666]">{s.n}</div>
                    <div className="flex items-baseline gap-4">
                      {typeof s.avgHr_bpm === 'number' && <div className="text-[#666666]">{s.avgHr_bpm} bpm</div>}
                      {typeof s.avgCadence_spm === 'number' && <div className="text-[#666666]">{s.avgCadence_spm} spm</div>}
                      <div className="font-mono">{s.avgPace_s_per_km != null ? `${Math.floor(s.avgPace_s_per_km/60)}:${String(Math.round(s.avgPace_s_per_km%60)).padStart(2,'0')}/km` : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Heart Rate Zone Chart - replaces legacy splits */}
          {workoutType === 'run' && (() => {
            // Try multiple data sources
            let samples = [];
            if (Array.isArray((hydrated||workoutData)?.sensor_data?.samples)) {
              samples = (hydrated||workoutData).sensor_data.samples;
            } else if (Array.isArray((hydrated||workoutData)?.sensor_data)) {
              samples = (hydrated||workoutData).sensor_data;
            } else if (Array.isArray((hydrated||workoutData)?.time_series_data)) {
              samples = (hydrated||workoutData).time_series_data;
            }
            
            return samples.length > 0 && (
              <div className="mb-4">
                <HRZoneChart
                  samples={samples.map((s: any, i: number) => ({
                    t: i,
                    hr: s.hr_bpm || s.heartRate || s.heart_rate || s.hr || s.bpm || s.heart_rate_bpm || null
                  }))}
                  age={30}
                  sex="male"
                  zonePreset="run"
                  title="Heart Rate Zones"
                />
              </div>
            );
          })()}
        </div>
      )}

      {/* SEPARATE Power/Cadence Chart - at the bottom */}
      {(workoutType === 'run' || workoutType === 'ride') && (() => {
        // Try multiple data sources for sensor data
        let samples = [];
        if (Array.isArray((hydrated||workoutData)?.sensor_data?.samples)) {
          samples = (hydrated||workoutData).sensor_data.samples;
        } else if (Array.isArray((hydrated||workoutData)?.sensor_data)) {
          samples = (hydrated||workoutData).sensor_data;
        } else if (Array.isArray((hydrated||workoutData)?.time_series_data)) {
          samples = (hydrated||workoutData).time_series_data;
        }
        
        if (samples.length > 0) {
          // Extract power and cadence data
          const powerData = samples
            .map((s: any) => s.power || s.watts || null)
            .filter((p: any) => p !== null && p !== undefined);
          
          // Normalize cadence data
          const normalizeRunCadence = (v: any) => {
            let n = Number(v);
            if (!Number.isFinite(n)) return null;
            if (n < 10) n *= 60;     // steps/sec -> steps/min
            if (n < 130) n *= 2;     // strides/min -> steps/min
            return Math.round(n);
          };

          const pickCadenceSample = (s: any, sport: 'run'|'ride'|'walk') => {
            if (sport === 'ride') {
              return s.bikeCadence ?? s.cadence ?? null;   // rpm
            }
            // run/walk
            return normalizeRunCadence(
              s.runCadence ?? s.cadence ?? s.strideRate ?? s.stride_cadence
            );
          };

          const cadenceData = samples
            .map(s => pickCadenceSample(s, workoutType === 'ride' ? 'ride' : 'run'))
            .filter(v => v != null);
          
          // Only show if we have power or cadence data
          if (powerData.length > 0 || cadenceData.length > 0) {

            return (
              <div className="mb-4">
                <PowerCadenceChart 
                  power={powerData}
                  cadence={cadenceData}
                  initial="PWR"
                />
              </div>
            );
          }
        }
        return null;
      })()}
      {/* Zones histograms (minimal stacked bars) */}
      {((hydrated||workoutData)?.computed?.analysis?.zones) && (
        <div className="mx-[-16px] px-3 py-3 space-y-3">
          {Array.isArray((hydrated||workoutData).computed.analysis.zones?.hr?.bins) && (hydrated||workoutData).computed.analysis.zones.hr.bins.length > 0 && (()=>{
            const hrBins = (hydrated||workoutData).computed.analysis.zones.hr.bins as any[];
            const total = hrBins.reduce((a:number,b:any)=>a + (Number(b.t_s)||0), 0) || 1;
            return (
              <div>
                <div className="text-sm mb-1">HR zones</div>
                <div className="flex h-2 overflow-hidden" style={{ borderRadius: 2 }}>
                  {hrBins.map((b:any, i:number) => (
                    <div key={`hrz-${i}`} style={{ width: `${Math.max(0, (Number(b.t_s)||0) * 100 / total)}%` }} />
                  ))}
                </div>
                <div className="text-xs text-[#666666] mt-1">{(hydrated||workoutData).computed.analysis.zones.hr.schema}</div>
              </div>
            );
          })()}
          {Array.isArray((hydrated||workoutData).computed.analysis.zones?.pace?.bins) && (hydrated||workoutData).computed.analysis.zones.pace.bins.length > 0 && (()=>{
            const pBins = (hydrated||workoutData).computed.analysis.zones.pace.bins as any[];
            const total = pBins.reduce((a:number,b:any)=>a + (Number(b.t_s)||0), 0) || 1;
            return (
              <div>
                <div className="text-sm mb-1">Pace bands</div>
                <div className="flex h-2 overflow-hidden" style={{ borderRadius: 2 }}>
                  {pBins.map((b:any, i:number) => (
                    <div key={`pcz-${i}`} style={{ width: `${Math.max(0, (Number(b.t_s)||0) * 100 / total)}%` }} />
                  ))}
                </div>
                <div className="text-xs text-[#666666] mt-1">{(hydrated||workoutData).computed.analysis.zones.pace.schema}</div>
              </div>
            );
          })()}
        </div>
      )}
      {((hydrated||workoutData)?.computed?.analysis?.bests) && (
        <div className="mx-[-16px] px-3 py-2 space-y-1">
          <div className="text-sm mb-1">Bests</div>
          {Array.isArray((hydrated||workoutData).computed.analysis.bests?.pace_s_per_km) && (hydrated||workoutData).computed.analysis.bests.pace_s_per_km.length > 0 && (
            <div className="text-sm">
              {(hydrated||workoutData).computed.analysis.bests.pace_s_per_km.map((b:any, i:number) => (
                <div key={`bp-${i}`} className="flex items-baseline justify-between">
                  <div className="text-[#666666]">{b.duration_s/60} min</div>
                  <div className="font-mono">{`${Math.floor(b.value/60)}:${String(Math.round(b.value%60)).padStart(2,'0')}/km`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Single page-level attribution for map tiles */}
      <div className="mx-[-16px] px-3 pt-2 pb-6">
        <small style={{ display: 'block', fontSize: 10, color: '#9aa6b2' }}>
          © <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a>
          &nbsp;•&nbsp;
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>
        </small>
      </div>
    </div>
   </div>
 );
};

// --- Training Effect helpers ---
const getTrainingEffect = () => {
  const aerobic = (workoutData as any)?.metrics?.total_training_effect ?? (workoutData as any)?.total_training_effect ?? null;
  const anaerobic = (workoutData as any)?.metrics?.total_anaerobic_effect ?? (workoutData as any)?.total_anaerobic_effect ?? null;
  return {
    aerobic: Number.isFinite(aerobic) ? Number(aerobic) : null,
    anaerobic: Number.isFinite(anaerobic) ? Number(anaerobic) : null,
  };
};

// --- Running dynamics rollups (avg from samples when available) ---
const getRunDynamics = () => {
  const samples = Array.isArray((hydrated as any)?.sensor_data?.samples)
    ? (hydrated as any).sensor_data.samples
    : (Array.isArray((hydrated as any)?.sensor_data) ? (hydrated as any).sensor_data : []);
  if (!Array.isArray(samples) || samples.length < 5) return null;
  const take = (keyList: string[], scale: (n:number)=>number = (n)=>n) => {
    const vals = samples
      .map((s:any)=>{
        for (const k of keyList) {
          const v = (s as any)[k]; if (Number.isFinite(v)) return scale(Number(v));
        }
        return NaN;
      })
      .filter((n:number)=>Number.isFinite(n));
    if (vals.length < 5) return null;
    return vals.reduce((a:number,b:number)=>a+b,0)/vals.length;
  };
  const gct_ms = take(['groundContactTimeMs','ground_contact_time_ms']);
  const vo_mm = take(['verticalOscillationMm','vertical_oscillation_mm']);
  const vr_ratio = take(['verticalRatio','vertical_ratio']);
  const balance = take(['leftRightBalance','run_balance','left_right_balance']);
  const any = [gct_ms,vo_mm,vr_ratio,balance].some(v=>Number.isFinite(v as any));
  if (!any) return null;
  return { gct_ms, vo_mm, vr_ratio, balance };
};

// --- Power presence ---
const getPowerSummary = () => {
  const avg = (workoutData as any)?.avg_power ?? (workoutData as any)?.metrics?.avg_power ?? null;
  const max = (workoutData as any)?.max_power ?? (workoutData as any)?.metrics?.max_power ?? null;
  const np = (workoutData as any)?.normalized_power ?? (workoutData as any)?.metrics?.normalized_power ?? null;
  const weightKg = (()=>{
    const w = (workoutData as any)?.weight; // kg expected if from Garmin
    return Number.isFinite(w) ? Number(w) : null;
  })();
  const wkg = Number.isFinite(avg) && Number.isFinite(weightKg) && (weightKg as number) > 0 ? (Number(avg)/Number(weightKg)) : null;
  const zones = (hydrated as any)?.computed?.analysis?.zones?.power ?? null;
  const hasAny = [avg,max,np,wkg].some(v=>Number.isFinite(v as any)) || !!zones;
  if (!hasAny) return null;
  return { avg, max, np, wkg, zones };
};

export default CompletedTab;