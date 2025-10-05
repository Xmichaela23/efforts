import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';

import { useAppContext } from '@/contexts/AppContext';
import { useWorkouts } from '@/hooks/useWorkouts';
import CleanElevationChart from './CleanElevationChart';
import EffortsViewerMapbox from './EffortsViewerMapbox';
import HRZoneChart from './HRZoneChart';
import { useCompact } from '@/hooks/useCompact';
import { supabase } from '../lib/supabase';
import { computeDistanceKm } from '@/utils/workoutDataDerivation';
import { formatDuration, formatPace, formatElevation, formatDistance, formatSwimPace } from '@/utils/workoutFormatting';
import { useWorkoutData } from '@/hooks/useWorkoutData';
// keeping local logic for now; Today's view uses shared resolver

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
  workoutData: any;
}

const CompletedTab: React.FC<CompletedTabProps> = ({ workoutData }) => {
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
  const [showVam, setShowVam] = useState(false);
  const [plannedTokens, setPlannedTokens] = useState<string[] | null>(null);
  const [plannedLabel, setPlannedLabel] = useState<string | null>(null);
  const norm = useWorkoutData(hydrated||workoutData);
  
  // Debug: log norm data AND raw workoutData to diagnose speed issue
  console.log('[CompletedTab] RAW workoutData:', {
    avg_speed: workoutData?.avg_speed,
    metrics_avg_speed: workoutData?.metrics?.avg_speed,
    has_computed: !!workoutData?.computed,
    has_series: !!workoutData?.computed?.analysis?.series,
    series_keys: workoutData?.computed?.analysis?.series ? Object.keys(workoutData.computed.analysis.series) : []
  });
  console.log('[CompletedTab] norm data:', {
    avg_speed_kmh: norm.avg_speed_kmh,
    avg_speed_mps: norm.avg_speed_mps,
    avg_pace_s_per_km: norm.avg_pace_s_per_km,
    distance_km: norm.distance_km,
    duration_s: norm.duration_s,
    elevation_gain_m: norm.elevation_gain_m
  });
  
  useEffect(() => {
    setHydrated((prev: any) => {
      // Prefer latest props, but do not regress defined scalar fields to undefined/null.
      const next = { ...(prev || {}), ...(workoutData || {}) } as any;
      if ((workoutData as any)?.max_speed == null && (prev as any)?.max_speed != null) {
        next.max_speed = (prev as any).max_speed;
      }
      return next;
    });
  }, [workoutData]);

  // Single hydration path: rely on parent hook to supply computed/series; no duplicate fetches here
  
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

  // Memoized derived data keyed by workout id (prevents duplicate heavy work)
  // Directly use server-provided series; only derive track coords locally for the map
  const workoutIdKey = String((hydrated as any)?.id || (workoutData as any)?.id || '');
  const memo = useMemo(() => {
    const src = (hydrated || workoutData) as any;
    const gpsRaw = src?.gps_track;
    const gps = Array.isArray(gpsRaw)
      ? gpsRaw
      : (typeof gpsRaw === 'string' ? (()=>{ try { const v = JSON.parse(gpsRaw); return Array.isArray(v)? v : []; } catch { return []; } })() : []);
    const track: [number,number][] = gps
      .map((p:any)=>{
        const lng = p.lng ?? p.longitudeInDegree ?? p.longitude ?? p.lon;
        const lat = p.lat ?? p.latitudeInDegree ?? p.latitude;
        if ([lng,lat].every((v)=>Number.isFinite(v))) return [Number(lng), Number(lat)] as [number,number];
        return null;
      })
      .filter(Boolean) as [number,number][];
    const series = src?.computed?.analysis?.series || null;
    console.log('[memo] series check:', { has_series: !!series, series_keys: series ? Object.keys(series) : [] });
    return { track, series } as const;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutIdKey, hydrated?.computed?.analysis?.series, workoutData?.computed?.analysis?.series]);
  // Initialize pool length state from explicit, inferred, or default
  useEffect(() => {
    if (workoutData && workoutData.swim_data) {
      try {
        const explicit = Number((workoutData as any)?.pool_length);
        if (Number.isFinite(explicit) && explicit > 0) { setPoolLengthMeters(explicit); return; }
        const defStr = typeof window !== 'undefined' ? window.localStorage.getItem('pool_length_default_m') : null;
        const def = defStr ? Number(defStr) : NaN;
        if (Number.isFinite(def) && def > 0) { setPoolLengthMeters(def); return; }
        // Fallback to inference later via helpers (keep null so helpers compute)
        setPoolLengthMeters(null);
      } catch { setPoolLengthMeters(null); }
    }
  }, [workoutData?.swim_data]);

  // If this workout is linked to a planned row, fetch its tokens/label for display
  useEffect(() => {
    (async () => {
      try {
        const pid = (workoutData as any)?.planned_id;
        if (!pid) { setPlannedTokens(null); setPlannedLabel(null); return; }
        const { data } = await supabase
          .from('planned_workouts')
          .select('name, steps_preset, computed')
          .eq('id', String(pid))
          .maybeSingle();
        if (!data) { setPlannedTokens(null); setPlannedLabel(null); return; }
        const tokens = (() => {
          try {
            if (Array.isArray((data as any).steps_preset)) return (data as any).steps_preset.map((t:any)=> String(t));
            if (typeof (data as any).steps_preset === 'string') { const arr = JSON.parse((data as any).steps_preset); return Array.isArray(arr) ? arr.map((t:any)=> String(t)) : null; }
          } catch {}
          return null;
        })();
        setPlannedTokens(tokens);
        setPlannedLabel(((data as any)?.name || null));
      } catch { setPlannedTokens(null); setPlannedLabel(null); }
    })();
  }, [workoutData?.planned_id]);


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
      <>
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
        <div className="grid grid-cols-3 gap-3 px-2">
          {/* Duration */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const kmFrom = (() => {
                  try {
                    const computedMeters = (workoutData as any)?.computed?.overall?.distance_m;
                    if (typeof computedMeters === 'number' && computedMeters > 0) return computedMeters / 1000;
                  } catch {}
                  const meters = (workoutData as any)?.distance_meters ?? (workoutData as any)?.metrics?.distance_meters ?? (workoutData as any)?.strava_data?.original_activity?.distance;
                  if (typeof meters === 'number' && meters > 0) return meters / 1000;
                  const d = Number((workoutData as any)?.distance);
                  return Number.isFinite(d) ? (d > 2000 ? d / 1000 : d) : 0;
                })();
                const km = kmFrom || 0;
                if (workoutData.swim_data) {
                  const meters = Math.round(km * 1000);
                  if (!meters) return 'N/A';
                  return useImperial ? `${Math.round(meters / 0.9144)} yd` : `${meters} m`;
                }
                const fmt = (n:number) => useImperial ? (n * 0.621371).toFixed(1) : n.toFixed(1);
                return km ? `${fmt(km)} ${useImperial ? 'mi' : 'km'}` : 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Distance</div>
            </div>
          </div>

          {/* Pace/Speed */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                console.log('[Speed Display] norm.avg_speed_kmh:', norm.avg_speed_kmh, 'isFinite:', Number.isFinite(norm.avg_speed_kmh));
                if (Number.isFinite(norm.avg_pace_s_per_km as any)) {
                  return formatPace(norm.avg_pace_s_per_km as number, useImperial);
                }
                if (Number.isFinite(norm.avg_speed_kmh as any) && norm.avg_speed_kmh !== null) {
                  const kmh = Number(norm.avg_speed_kmh);
                  return useImperial ? `${(kmh * 0.621371).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;
                }
                return 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">{Number.isFinite(norm.avg_pace_s_per_km as any) ? 'Avg Pace' : 'Avg Speed'}</div>
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
      </>
    );
  }

  // 🔒 EXISTING GARMIN LOGIC - allow swims without GPS
  if (workoutData.swim_data && (!workoutData.gps_track || workoutData.gps_track.length === 0)) {
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

  

 

 

 

 // Format average speed specifically
const formatAvgSpeed = (speedValue: any): string => {
  const speedKmh = Number(speedValue);
  if (speedKmh && speedKmh > 0) {
    const speedMph = speedKmh * 0.621371;
    return `${speedMph.toFixed(1)} mph`;
  }
  return 'N/A';


// Format max speed specifically  
const formatMaxSpeed = (speedValue: any): string => {
  const speedKmh = Number(speedValue);
  if (speedKmh && speedKmh > 0) {
    const speedMph = speedKmh * 0.621371;
    return `${speedMph.toFixed(1)} mph`;
  }
  return 'N/A';
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

  // Primary metrics helper removed; metrics render inline and via norm

  // ----- Moving time resolver (strict) -----
  // Only use explicitly provided moving-time fields; do not infer from cadence or distance.
  

  // ----- Elapsed time resolver (exact seconds when available) -----
  

  

  /* removed legacy inferPoolLengthMeters */
    // 1) Explicit per-workout override/state
    const explicit = Number(poolLengthMeters ?? (workoutData as any).pool_length);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    // 2) Planned setting (if present on hydratedPlanned) – look for pool_length_m or tokens like 25m/25yd
    try {
      const planned: any = (workoutData as any)?.planned || (hydrated as any)?.planned || null;
      const pl = Number((planned as any)?.pool_length_m);
      if (Number.isFinite(pl) && pl > 0) return pl;
      const tokens: string[] = Array.isArray((planned as any)?.steps_preset) ? (planned as any).steps_preset.map((t:any)=>String(t)) : [];
      const joined = tokens.join(' ').toLowerCase();
      const m = joined.match(/\b(25|33(?:\.33)?|50)\s*m\b/);
      if (m) return Number(m[1]);
      const y = joined.match(/\b(25|50)\s*yd\b/);
      if (y) return Number(y[1]) * 0.9144;
    } catch {}
    // 3) User baselines preference
    try {
      const pn = (window as any)?.__APP_BASELINES__?.performanceNumbers || {};
      const bLen = Number(pn?.swim_pool_length_m ?? pn?.swimPoolLengthM);
      if (Number.isFinite(bLen) && bLen > 0) return bLen;
    } catch {}
    // 4) Infer from lengths when distance is available
    const distM = norm.distance_m;
    const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
    if (distM && nLengths > 0) return distM / nLengths;
    // 5) Local default
    try {
      const defStr = typeof window !== 'undefined' ? window.localStorage.getItem('pool_length_default_m') : null;
      const def = defStr ? Number(defStr) : NaN;
      if (Number.isFinite(def) && def > 0) return def;
    } catch {}
    return null;
  };

  /* removed legacy isYardPool */

  /* removed legacy computeSwimAvgPaceSecPer100 */

  /* removed legacy formatPoolLengthLabel */

  const formatMetersCompact = (m: number | null | undefined): string => {
    const n = Number(m);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1000) return `${Math.round(n/10)/100} km`;
    return `${Math.round(n)} m`;
  };

  const getSwimLengths = (): Array<{ distance_m?: number; duration_s?: number; strokes?: number }> => {
    try {
      const arr = (hydrated as any)?.swim_data?.lengths || (workoutData as any)?.swim_data?.lengths;
      if (Array.isArray(arr)) return arr as any[];
    } catch {}
    return [];
  };

  const computeAvgStrokeRate = (): number | null => {
    const v = Number((workoutData as any)?.avg_swim_cadence ?? (workoutData as any)?.avg_cadence);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
    try {
      const samples = Array.isArray((workoutData as any)?.sensor_data?.samples)
        ? (workoutData as any).sensor_data.samples : (Array.isArray((workoutData as any)?.sensor_data) ? (workoutData as any).sensor_data : []);
      const vals = samples.map((s:any)=> Number(s.swimCadenceInStrokesPerMinute ?? s.cadence)).filter((n:number)=> Number.isFinite(n) && n>0);
      if (vals.length) return Math.round(vals.reduce((a:number,b:number)=>a+b,0)/vals.length);
    } catch {}
    return null;
  };

  const computeAvgStrokesPerLength = (): number | null => {
    try {
      const nLengths = Number((workoutData as any)?.number_of_active_lengths);
      const totalStrokes = Number((workoutData as any)?.strokes ?? (workoutData as any)?.metrics?.strokes);
      if (Number.isFinite(nLengths) && nLengths>0 && Number.isFinite(totalStrokes) && totalStrokes>0) {
        return Math.round((totalStrokes / nLengths) * 10) / 10;
      }
      const lengths = getSwimLengths();
      const strokes = lengths.map((l:any)=> Number(l?.strokes ?? l?.stroke_count)).filter((n:number)=> Number.isFinite(n));
      if (strokes.length && lengths.length) return Math.round((strokes.reduce((a:number,b:number)=>a+b,0) / lengths.length) * 10) / 10;
    } catch {}
    return null;
  };

  type DetectedSet = { label: string; distance_m: number; pace_per100_s: number | null };

  // Build fixed-distance splits at 100m or 100yd based on pool
  const buildHundredSplits = (): Array<{ idx: number; duration_s: number; avg_hr: number | null; unit: 'm' | 'yd' }> => {
    try {
      const lengths = getSwimLengths();
      if (!lengths.length) return [];
      const Lm = Number(poolLengthMeters ?? (workoutData as any)?.pool_length) || 25; // default assumption
      const isYd = Lm >= 20 && Lm <= 26; // Yard pools are typically 25 yards (~22.86m)
      const unitLenM = isYd ? 91.44 : 100;
      const perSplit = Math.max(1, Math.round(unitLenM / Lm));
      const splits: Array<{ idx: number; duration_s: number; avg_hr: number | null; unit: 'm' | 'yd' }> = [];
      let idx = 1;
      for (let i = 0; i < lengths.length; i += perSplit) {
        const chunk = lengths.slice(i, i + perSplit);
        if (chunk.length < perSplit) break; // require full chunk for a clean split
        let dur = 0;
        let strokesSum: number | null = 0;
        const hrVals: number[] = [];
        for (const len of chunk) {
          const t = Number((len as any)?.duration_s ?? (len as any)?.duration ?? 0);
          dur += Number.isFinite(t) ? t : 0;
          const st = Number((len as any)?.strokes ?? (len as any)?.stroke_count);
          if (Number.isFinite(st)) strokesSum = (strokesSum as number) + st; else strokesSum = strokesSum;
          const hr = Number((len as any)?.avg_heart_rate ?? (len as any)?.hr_bpm);
          if (Number.isFinite(hr) && hr > 40 && hr < 230) hrVals.push(Math.round(hr));
        }
        const avgHr = hrVals.length ? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
        splits.push({ idx: idx++, duration_s: Math.round(dur), avg_hr: avgHr, unit: isYd ? 'yd' : 'm' });
      }
      return splits;
    } catch { return []; }
  };
  const detectSets = (): { summary: string[]; performance: DetectedSet[] } => {
    const outSummary: string[] = [];
    const outPerf: DetectedSet[] = [];
    // Prefer laps if present
    let laps: any[] = [];
    try {
      const raw = (hydrated as any)?.laps ?? (workoutData as any)?.laps;
      if (typeof raw === 'string') { const j = JSON.parse(raw); if (Array.isArray(j)) laps = j; }
      else if (Array.isArray(raw)) laps = raw;
    } catch {}
    if (laps.length > 0) {
      const norm = laps.map((l:any)=>({
        d: Number(l.totalDistanceInMeters ?? l.distanceInMeters ?? l.distance_m ?? l.distance ?? 0),
        t: Number(l.durationInSeconds ?? l.duration_s ?? l.time ?? 0)
      })).filter(x=> x.d>0 && x.t>0);
      if (norm.length) {
        // Identify repeats by most common lap distance
        const counts: Record<string, number> = {};
        for (const l of norm) { const key = String(Math.round(l.d/25)*25); counts[key] = (counts[key]||0)+1; }
        const bestKey = Object.keys(counts).sort((a,b)=> counts[b]-counts[a])[0];
        const mainD = Number(bestKey);
        const main = norm.filter(l=> Math.abs(l.d - mainD) <= Math.max(10, mainD*0.05));
        if (main.length>=3) {
          const per100 = main.map(l=> (l.t/(l.d/100))).filter(Number.isFinite);
          const avgPer100 = per100.length? (per100.reduce((a,b)=>a+b,0)/per100.length) : null;
          const plusMinus = (()=>{
            if (!per100.length || !avgPer100) return '±0s';
            const dev = per100.reduce((a,b)=> a + Math.abs(b-avgPer100), 0)/per100.length;
            return `±${Math.round(dev)}s`;
          })();
          outSummary.push(`Main: ${main.length}x${Math.round(mainD)}m - ${avgPer100?formatSwimPace(avgPer100):'—' } avg (${plusMinus} consistency)`);
          let i=1; for (const l of main) {
            const p100 = l.t/(l.d/100);
            outPerf.push({ label: `${Math.round(mainD)}m #${i++}`, distance_m: l.d, pace_per100_s: p100 });
          }
        }
        // Warmup = first lap if longer/slow; Cooldown = last lap if short
        const first = norm[0];
        if (first) {
          const p100 = first.t/(first.d/100); outSummary.unshift(`Warmup: ${Math.round(first.d)}m - ${formatSwimPace(p100)}`);
        }
        const last = norm[norm.length-1];
        if (last && last!==first) {
          const p100 = last.t/(last.d/100); outSummary.push(`Cooldown: ${Math.round(last.d)}m - ${formatSwimPace(p100)}`);
        }
        return { summary: outSummary, performance: outPerf };
      }
    }
    // Fallback: lengths
    const lengths = getSwimLengths();
    if (lengths.length) {
      const L = (() => {
        // Inline pool length inference (replaces inferPoolLengthMeters)
        const explicit = Number(poolLengthMeters ?? (workoutData as any)?.pool_length);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const distM = norm.distance_m;
        const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
        if (distM && nLengths > 0) return distM / nLengths;
        return 25;
      })();
      const total = lengths.reduce((a:number,l:any)=> a + Number(l?.distance_m ?? L), 0);
      const dur = lengths.reduce((a:number,l:any)=> a + Number(l?.duration_s ?? l?.duration ?? 0), 0);
      if (total>0 && dur>0) {
        const p100 = dur/(total/100);
        outSummary.push(`Main: ${formatMetersCompact(total)} - ${formatSwimPace(p100)}`);
      }
    }
    return { summary: outSummary, performance: outPerf };
  };

  // Compute SWOLF (avg seconds per length + avg strokes per length)
  const computeSwolf = (): number | null => {
    try {
      const nLengths = Number((workoutData as any)?.number_of_active_lengths) || (Array.isArray((workoutData as any)?.swim_data?.lengths) ? (workoutData as any).swim_data.lengths.length : 0);
      const dur = Number(norm.duration_s);
      if (!nLengths || !dur) return null;
      let totalStrokes: number | null = null;
      const s1 = Number((workoutData as any)?.strokes ?? (workoutData as any)?.metrics?.strokes);
      if (Number.isFinite(s1) && s1 > 0) totalStrokes = Number(s1);
      if (totalStrokes == null && Array.isArray((workoutData as any)?.swim_data?.lengths)) {
        const arr = (workoutData as any).swim_data.lengths as any[];
        const sum = arr
          .map((l:any)=> Number(l?.strokes ?? l?.stroke_count))
          .filter((n:any)=> Number.isFinite(n))
          .reduce((a:number,b:number)=> a + Number(b), 0);
        if (sum > 0) totalStrokes = sum;
      }
      const avgSecPerLen = dur / nLengths;
      const avgStrokesPerLen = totalStrokes != null ? (totalStrokes / nLengths) : null;
      const swolf = avgStrokesPerLen != null ? Math.round(avgSecPerLen + avgStrokesPerLen) : null;
      return Number.isFinite(swolf as any) ? (swolf as number) : null;
    } catch { return null; }
  };

  // primaryMetrics removed; metrics are rendered directly where needed

 // 🏠 ADVANCED METRICS - Dynamic based on workout type
 const getAdvancedMetrics = () => {
   const isRun = workoutData.swim_data;
   const isBike = workoutData.ride_data;
   const isSwim = workoutData.swim_data;
   const isWalk = workoutData.walk_data;
   
   // Walking gets minimal advanced metrics
   if (isWalk) {
     return [
       {
         label: 'Avg Pace',
         value: (Number.isFinite(norm.avg_pace_s_per_km as any) ? formatPace(norm.avg_pace_s_per_km as number, useImperial) : 'N/A'),
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
      value: Number.isFinite(norm.max_hr as any) ? String(norm.max_hr) : 'N/A',
       unit: 'bpm'
     },
     {
       label: isRun ? 'Max Pace' : 'Max Speed',
       value: isRun
        ? formatPace(workoutData.metrics?.max_pace || (workoutData as any)?.max_pace)
       : (Number.isFinite((workoutData as any)?.max_speed as any)
          ? (() => { const kmh = Number((workoutData as any).max_speed); if (!Number.isFinite(kmh)) return 'N/A'; return useImperial ? `${(kmh*0.621371).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`; })()
          : 'N/A'),
       unit: isRun ? (useImperial ? '/mi' : '/km') : (useImperial ? 'mph' : 'km/h')
     },
    // Max cadence / stroke rate removed per request
   ];

   // Add discipline-specific metrics
   if (isRun) {
     return [
       ...baseMetrics,
       {
         label: 'Steps',
         value: workoutData.steps ? String(workoutData.steps) : 'N/A'
       },
       {
         label: 'TSS',
         value: workoutData.tss ? String(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       }
     ];
   } else if (isBike) {
     return [
       ...baseMetrics,
       {
         label: 'Max Power',
        value: Number.isFinite(norm.max_power as any) ? String(norm.max_power) : 'N/A',
         unit: 'W'
       },
       {
         label: 'TSS',
         value: workoutData.tss ? String(Math.round(workoutData.tss * 10) / 10) : 'N/A'
       },
       {
         label: 'Intensity Factor',
         value: workoutData.intensity_factor ? `${workoutData.intensity_factor}%` : 'N/A'
       }
     ];
  } else if (isSwim) {
    // Hide elevation-like advanced rows for pool; keep HR/Max Pace/TSS/IF
    const baseForSwim = baseMetrics.filter(m => m.label !== 'Elevation');
    return [
      ...baseForSwim,
      {
        label: 'Max Pace',
        value: formatSwimPace(workoutData.metrics?.max_pace || workoutData.max_pace),
        unit: '/100m'
      },
      {
        label: 'TSS',
        value: workoutData.tss ? String(Math.round(workoutData.tss * 10) / 10) : 'N/A'
      },
      {
        label: 'Intensity Factor',
        value: workoutData.intensity_factor ? `${workoutData.intensity_factor}%` : 'N/A'
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
  else if (workoutData.metrics?.avg_power && norm.duration_s) {
     // Convert duration from minutes to seconds for proper kJ calculation
    const durationSeconds = Number(norm.duration_s);
     const kj = Math.round((workoutData.metrics.avg_power * durationSeconds) / 1000);
     if (import.meta.env?.DEV) console.log('✅ calculateTotalWork using fallback calc:', kj, 'kJ');
     return `${kj} kJ`;
   }
   if (import.meta.env?.DEV) console.log('✅ calculateTotalWork returning N/A');
   return 'N/A';
 };

 // Derive average stride length for runs/walks (meters)
 

 

 

  // Enhanced VAM calculation for running with insights
 const calculateRunningVAM = () => {
  if (!workoutData.swim_data) return null;
  
  const elevationGain = (workoutData as any)?.elevation_gain ?? (workoutData as any)?.metrics?.elevation_gain;
  const duration = Number(norm.duration_s);
   
  if (!elevationGain || !duration) return null;
   
   const elevationM = Number(elevationGain);
  const durationHours = duration / 3600;
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
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation');
   if (!workoutData.swim_data && !workoutData.walk_data) {
     if (import.meta.env?.DEV) console.log('❌ GAP calculation skipped - not a run/walk:', workoutData.swim_data);
     return null;
   }
   
  const distance = norm.distance_m;
  const duration = Number(norm.duration_s);
  const elevationGain = (workoutData as any)?.elevation_gain ?? (workoutData as any)?.metrics?.elevation_gain;
   
   if (import.meta.env?.DEV) console.log('🔍 GAP calculation - data:', { distance, duration, elevationGain });
   
  if (!distance || !duration || !elevationGain) {
     if (import.meta.env?.DEV) console.log('❌ GAP calculation skipped - missing data');
     return null;
   }
   
   // Convert to standard units - handle both km and miles
   let distanceMiles = Number(distance);
  let durationMinutes = Number(duration) / 60; // norm is seconds -> minutes
   let elevationFeet = Number(elevationGain);
   
   // If distance is in km, convert to miles
   if (distanceMiles > 10) { // Likely in km if > 10
     distanceMiles = distanceMiles * 0.621371; // km to miles
     if (import.meta.env?.DEV) console.log('🔍 Converted distance from km to miles:', distanceMiles);
   }
   
  // duration is already seconds converted to minutes
   
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
  // Prefer our unified swim-aware resolver
  const s = Number(norm.duration_s);
  if (Number.isFinite(s as any) && (s as number) > 0) return formatDuration(s as number);
  // Fallback: legacy fields
  const raw = (workoutData as any)?.metrics?.total_timer_time
    ?? (workoutData as any)?.total_timer_time
    ?? (workoutData as any)?.moving_time
    ?? (workoutData as any)?.metrics?.moving_time
    ?? (workoutData as any)?.elapsed_time
    ?? (workoutData as any)?.metrics?.elapsed_time
    ?? null;
  return formatDuration(raw);
};

 const trainingMetrics = [
   {
     label: 'Normalized Power',
     value: workoutData.metrics?.normalized_power ? `${workoutData.metrics.normalized_power} W` : 'N/A'
   },
   {
     label: 'Training Load',
     value: workoutData.metrics?.training_stress_score ? String(Math.round(workoutData.metrics.training_stress_score)) : 'N/A'
   },
   {
     label: 'Total Work',
     value: calculateTotalWork()
   },
   {
     label: 'VAM',
    value: (() => {
      const vam = (norm.elevation_gain_m && norm.duration_s && norm.duration_s > 0)
        ? (norm.elevation_gain_m / (norm.duration_s / 3600))
        : null;
      return Number.isFinite(vam as any) && (vam as number) > 0 ? Math.round(vam as number) : '—';
    })()
   },
   {
     label: 'Moving Time',
     value: formatMovingTime()
   }
 ];

 return (
  <>
     {/* 🏠 ALL METRICS - 3-column grid with tighter spacing */}
     {workoutData.swim_data ? (
       <div className="grid grid-cols-3 gap-1 px-2">
         {/* Distance */}
         <div className="px-2 pb-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {(() => {
               const src = (hydrated || workoutData);
               const km = (computeDistanceKm(src) ?? Number((src as any)?.distance)) || 0;
               const meters = Math.round(km * 1000);
               if (!meters) return 'N/A';
               return useImperial ? `${Math.round(meters / 0.9144)} yd` : `${meters} m`;
             })()}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Distance</div></div>
         </div>

         {/* Moving Time */}
         <div className="px-2 pb-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>{formatMovingTime()}</div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Moving Time</div></div>
         </div>

         {/* Avg Pace /100 */}
         <div className="px-2 pb-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => { return 'N/A'; })()}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Avg Pace {useImperial ? '/100yd' : '/100m'}</div></div>
         </div>

         {/* Duration (Elapsed) */}
         <div className="px-2 py-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {norm.elapsed_s ? formatDuration(norm.elapsed_s) : 'N/A'}
          </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Duration</div></div>
         </div>

         {/* Avg HR */}
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {Number.isFinite(norm.avg_hr as any) ? String(norm.avg_hr) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Avg HR</div></div>
         </div>

         {/* Lengths */}
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {(() => { const n = (workoutData as any)?.number_of_active_lengths ?? ((workoutData as any)?.swim_data?.lengths ? (workoutData as any).swim_data.lengths.length : null); return n != null ? String(n) : 'N/A'; })()}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Lengths</div></div>
         </div>

         {/* Avg stroke rate */}
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {(() => { const v = computeAvgStrokeRate(); return v != null ? String(v) : 'N/A'; })()}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Avg stroke rate</div></div>
         </div>

         {/* Pool length */}
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
             {(() => {
               const Lm = Number(poolLengthMeters ?? (workoutData as any)?.pool_length);
               if (!Lm) return 'N/A';
               const isYd = Lm >= 20 && Lm <= 26;
               return isYd ? `${Math.round(Lm / 0.9144)} yd` : `${Lm} m`;
             })()}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Pool</div></div>
         </div>

         {/* Max HR */}
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {Number.isFinite(norm.max_hr as any) ? String(norm.max_hr) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Max HR</div></div>
         </div>

         {/* Calories */}
         <div className="px-2 py-1">
           <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {Number.isFinite(norm.calories as any) ? String(norm.calories) : 'N/A'}
           </div>
           <div className="text-xs text-[#666666] font-normal"><div className="font-medium">Calories</div></div>
         </div>
       </div>
     ) : (
       <div className="grid grid-cols-3 gap-1 px-2">
       {/* General metrics - Only for non-cycling workouts */}
       {workoutData.ride_data && workoutData.walk_data && (
         <>
          {/* Distance */}
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
               {(() => {
                 const src = (hydrated || workoutData);
                 const km = (computeDistanceKm(src) ?? Number(src?.distance)) || 0;
                if (workoutData.swim_data) {
                  const meters = Math.round(km * 1000);
                  if (!meters) return 'N/A';
                  return useImperial ? `${Math.round(meters / 0.9144)} yd` : `${meters} m`;
                }
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
             {(() => {
               if (workoutData.swim_data) {
                 // Duration (elapsed) must use explicit elapsed fields; do not use moving-time resolver
                 const s = (workoutData as any)?.metrics?.total_elapsed_time
                       ?? (workoutData as any)?.total_elapsed_time
                       ?? (workoutData as any)?.elapsed_time
                       ?? (workoutData as any)?.metrics?.elapsed_time
                       ?? (typeof (workoutData as any)?.duration === 'number' ? (workoutData as any).duration * 60 : null);
                 return Number.isFinite(Number(s)) && Number(s) > 0 ? formatDuration(Number(s)) : 'N/A';
               }
               return formatDuration((workoutData as any)?.total_elapsed_time ?? (workoutData as any)?.elapsed_time ?? workoutData.duration);
             })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Duration</div>
            </div>
          </div>
           
           {/* Avg HR */}
           <div className="px-2 py-1">
             <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {Number.isFinite(norm.avg_hr as any) ? String(norm.avg_hr) : 'N/A'}
             </div>
             <div className="text-xs text-[#666666] font-normal">
               <div className="font-medium">Avg HR</div>
             </div>
           </div>
           
           {/* Avg Pace/Speed */}
          {workoutData.swim_data ? (
             <div className="px-2 py-1">
               <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                {Number.isFinite(norm.avg_pace_s_per_km as any) ? formatPace(norm.avg_pace_s_per_km as number, useImperial) : 'N/A'}
               </div>
               <div className="text-xs text-[#666666] font-normal">
                 <div className="font-medium">Avg Pace</div>
               </div>
             </div>
           ) : workoutData.ride_data ? (
             <div className="px-2 py-1">
               <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
           {(() => { return 'N/A'; })()}
               </div>
               <div className="text-xs text-[#666666] font-normal">
                 <div className="font-medium">Avg Pace {useImperial ? '/100yd' : '/100m'}</div>
               </div>
             </div>
           ) : (
             <div className="px-2 py-1">
               <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                {Number.isFinite(norm.avg_speed_kmh as any) ? (useImperial ? `${((norm.avg_speed_kmh as number)*0.621371).toFixed(1)} mph` : `${(norm.avg_speed_kmh as number).toFixed(1)} km/h`) : 'N/A'}
               </div>
               <div className="text-xs text-[#666666] font-normal">
                 <div className="font-medium">Avg Speed</div>
               </div>
             </div>
           )}

          {/* Swim-only cards: Lengths, Pool */}
          {workoutData.swim_data && (
            <>
              <div className="px-2 py-1">
                <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                  {(() => { const n = (workoutData as any)?.number_of_active_lengths ?? ((workoutData as any)?.swim_data?.lengths ? (workoutData as any).swim_data.lengths.length : null); return n != null ? String(n) : 'N/A'; })()}
                </div>
                <div className="text-xs text-[#666666] font-normal">
                  <div className="font-medium">Lengths</div>
                </div>
              </div>
              <div className="px-2 py-1">
                <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                  {(() => {
                    const Lm = Number(poolLengthMeters ?? (workoutData as any)?.pool_length);
                    if (!Lm) return 'N/A';
                    const isYd = Lm >= 20 && Lm <= 26;
                    return isYd ? `${Math.round(Lm / 0.9144)} yd` : `${Lm} m`;
                  })()}
                </div>
                <div className="text-xs text-[#666666] font-normal">
                  <div className="font-medium">Pool</div>
                </div>
              </div>
            </>
          )}
         </>
       )}

       {/* Row 2: GAP, Max Speed, Avg Cadence */}
      {workoutData.swim_data && (
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

      {workoutData.ride_data && workoutData.walk_data && (
      <div className="px-2 py-1">
        <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
          {(workoutData.swim_data || workoutData.walk_data)
            ? (() => {
                // Preferred: stored max_pace (sec/km). Fallback: derive from samples.
                const stored = (workoutData as any)?.metrics?.max_pace ?? (workoutData as any)?.max_pace;
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
                if (workoutData.walk_data && secPerMile < 360) return 'N/A';
                return formatPace(secPerKm);
              })()
            : (() => {
                const speedKmh = Number((workoutData as any)?.max_speed);
                if (speedKmh && speedKmh > 0) {
                  return useImperial ? `${(speedKmh * 0.621371).toFixed(1)} mph` : `${speedKmh.toFixed(1)} km/h`;
                }
                return 'N/A';
              })()}
        </div>
        <div className="text-xs text-[#666666] font-normal">
          <div className="font-medium">{(workoutData.swim_data || workoutData.walk_data) ? 'Max Pace' : 'Max Speed'}</div>
        </div>
      </div>
      )}
      
      {(workoutData.type === 'ride' || norm.sport === 'ride') ? (
        <>
          {/* Row 1 */}
          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.distance_km ? `${(useImperial ? norm.distance_km * 0.621371 : norm.distance_km).toFixed(1)} ${useImperial ? 'mi' : 'km'}` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Distance</div>
            </div>
          </div>

          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.duration_s ? formatDuration(norm.duration_s) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Duration</div>
            </div>
          </div>

          <div className="px-2 pb-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {formatMovingTime()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Moving Time</div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.avg_speed_kmh ? `${(useImperial ? norm.avg_speed_kmh * 0.621371 : norm.avg_speed_kmh).toFixed(1)} ${useImperial ? 'mph' : 'km/h'}` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg Speed</div>
            </div>
          </div>

          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.max_speed_mps ? `${(useImperial ? norm.max_speed_mps * 2.23694 : norm.max_speed_mps * 3.6).toFixed(1)} ${useImperial ? 'mph' : 'km/h'}` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Speed</div>
            </div>
          </div>

          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.avg_power ? `${norm.avg_power} W` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg Power</div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.max_power ? `${norm.max_power} W` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Power</div>
            </div>
          </div>

          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.normalized_power ? `${norm.normalized_power} W` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Norm Power</div>
            </div>
          </div>

          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.avg_hr ? `${norm.avg_hr} bpm` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Avg HR</div>
            </div>
          </div>

          {/* Row 4 */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.max_hr ? `${norm.max_hr} bpm` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max HR</div>
            </div>
          </div>

          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.elevation_gain_m ? `${(useImperial ? norm.elevation_gain_m * 3.28084 : norm.elevation_gain_m).toFixed(0)} ${useImperial ? 'ft' : 'm'}` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Elevation</div>
            </div>
          </div>

          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {norm.avg_cycling_cadence_rpm ? `${norm.avg_cycling_cadence_rpm} rpm` : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Cadence</div>
            </div>
          </div>

          {/* Calories removed from grid - keeping Calories below if needed */}
          <div className="px-2 py-1" style={{display: 'none'}}>
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {Number.isFinite(norm.calories as any) ? String(norm.calories) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Calories</div>
            </div>
          </div>

          {/* Max Power */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const field = (workoutData as any)?.max_power ?? (workoutData as any)?.metrics?.max_power;
                if (field != null) return String(field);
                const sensors = Array.isArray(workoutData.sensor_data) ? workoutData.sensor_data : [];
                const maxSensor = sensors
                  .map((s: any) => Number(s.power))
                  .filter((n: any) => Number.isFinite(n))
                  .reduce((m: number, n: number) => Math.max(m, n), -Infinity);
                return Number.isFinite(maxSensor) ? String(maxSensor) : 'N/A';
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max Power</div>
            </div>
          </div>

          {/* Removed duplicate Max Speed row previously here */}

          {/* Max Cadence / Stroke rate removed */}

          {/* Max HR */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {Number.isFinite(norm.max_hr as any) ? String(norm.max_hr) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max HR</div>
            </div>
          </div>

          {/* Duration (Elapsed) */}
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => {
                const s = (workoutData as any)?.metrics?.total_elapsed_time
                      ?? (workoutData as any)?.total_elapsed_time
                      ?? (workoutData as any)?.elapsed_time
                      ?? (workoutData as any)?.metrics?.elapsed_time
                      ?? (typeof (workoutData as any)?.duration === 'number' ? (workoutData as any).duration * 60 : null);
                return formatDuration(s || 0);
              })()}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Duration</div>
            </div>
          </div>
        </>
      ) : null}
      
      {/* Row 3: Elevation, Calories, Max HR - Only for non-cycling workouts; hide Elevation for pool swims */}
      {(() => {
        const isSwim = workoutData.swim_data;
        const hasLengths = Number((workoutData as any)?.number_of_active_lengths) > 0
          || (Array.isArray((workoutData as any)?.swim_data?.lengths) && (workoutData as any).swim_data.lengths.length > 0);
        const providerStr = String((workoutData as any)?.provider_sport || (workoutData as any)?.activity_type || (workoutData as any)?.name || '').toLowerCase();
        const openWaterHint = /open\s*water|ocean|ow\b/.test(providerStr);
        const poolHint = /lap|pool/.test(providerStr);
        const hasGps = Array.isArray((workoutData as any)?.gps_track) && (workoutData as any).gps_track.length > 10;
        const isPoolSwim = isSwim && (hasLengths || poolHint || (!openWaterHint && !hasGps));
        return workoutData.ride_data ? (
        <>
          {/* Hide climb for pool swim */}
          {!isPoolSwim && (
            <div className="px-2 py-1">
              <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {(() => { return Number.isFinite(norm.elevation_gain_m as any) ? `${formatElevation(norm.elevation_gain_m as number, useImperial)} ${useImperial ? 'ft' : 'm'}` : 'N/A'; })()}
              </div>
              <div className="text-xs text-[#666666] font-normal">
                <div className="font-medium">Elevation Gain</div>
              </div>
            </div>
          )}
     
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {Number.isFinite(norm.calories as any) ? String(norm.calories) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Calories</div>
            </div>
          </div>
     
          {(norm.distance_m && norm.duration_s && norm.duration_s > 0) && (
            <div className="px-2 py-1">
              <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                {(() => {
                  const spm = Number((hydrated||workoutData)?.avg_running_cadence ?? (hydrated||workoutData)?.avg_run_cadence);
                  if (!Number.isFinite(spm) || spm <= 0) return '—';
                  const m = Number(norm.distance_m);
                  const s = Number(norm.duration_s);
                  if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(s) || s <= 0) return '—';
                  const stride = m / (spm * (s / 60));
                  return Number.isFinite(stride) && stride > 0 ? `${stride.toFixed(2)}m` : '—';
                })()}
              </div>
              <div className="text-xs text-[#666666] font-normal">
                <div className="font-medium">Stride Length</div>
              </div>
            </div>
          )}
     
          <div className="px-2 py-1">
            <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
              {Number.isFinite(norm.max_hr as any) ? String(norm.max_hr) : 'N/A'}
            </div>
            <div className="text-xs text-[#666666] font-normal">
              <div className="font-medium">Max HR</div>
            </div>
          </div>

          {/* Row 4: Cadence card (hidden for swim); VAM hidden for pool swims */}
          {workoutData.swim_data && (
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
                  if (field != null) return String(field);
                  const sensors = Array.isArray(workoutData.sensor_data) ? workoutData.sensor_data : [];
                  const maxSensor = sensors
                    .map((s: any) => Number(s.cadence) || Number(s.bikeCadence) || Number(s.runCadence))
                    .filter((n: any) => Number.isFinite(n))
                    .reduce((m: number, n: number) => Math.max(m, n), -Infinity);
                  return Number.isFinite(maxSensor) ? String(maxSensor) : 'N/A';
                })()}
              </div>
              <div className="text-xs text-[#666666] font-normal">
                <div className="font-medium">Max Cadence</div>
              </div>
            </div>
          )}
          {!isPoolSwim && (
            <div className="px-2 py-1">
              <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
                {(() => {
                  const val = (workoutData as any)?.elevation_gain;
                  return val != null ? formatElevation(val) : 'N/A';
                })()}
              </div>
              <div className="text-xs text-[#666666] font-normal">
                <div className="font-medium">Elevation Gain</div>
              </div>
            </div>
          )}
           
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
       ) : null;
      })()}
     </div>
     )}

     {/* GPS ROUTE MAP & ELEVATION PROFILE SECTION - hidden for pool swims */}
     <div className="w-full">
        {/* Top metrics (data-driven) */}
        <div className="mx-[-16px] px-3 py-2 mb-2">
          {(() => {
            const useMi = !!useImperial;
            const distKm = norm.distance_km ?? 0;
            const movingSec = norm.duration_s;
            const avgSpeedKmh = Number((hydrated||workoutData)?.avg_speed) || null;
            const avgPaceSpKm = (hydrated||workoutData)?.metrics?.avg_pace ?? (hydrated||workoutData)?.avg_pace ?? null;
            const avgHr = norm.avg_hr;
            const avgPwr = norm.avg_power;
            const gain = norm.elevation_gain_m;
            const calcVam = (() => {
              try {
                const dist = (computeDistanceKm(hydrated||workoutData) ?? Number((hydrated||workoutData)?.distance) ?? 0) * 1000;
                const movingSec = (hydrated||workoutData)?.moving_time ?? (hydrated||workoutData)?.metrics?.moving_time ?? (hydrated||workoutData)?.computed?.overall?.duration_s_moving ?? null;
                const elevGainM = Number(gain);
                if (!Number.isFinite(elevGainM) || !Number.isFinite(movingSec as any) || (movingSec as number) <= 0) return null;
                const hours = (movingSec as number) / 3600;
                const vam = hours > 0 ? Math.round(elevGainM / hours) : null;
                return Number.isFinite(vam as any) && (vam as number) > 0 ? (vam as number) : null;
              } catch { return null; }
            })();
            const cal = (hydrated||workoutData)?.calories ?? null;
            const cad = (hydrated||workoutData)?.avg_cadence ?? (hydrated||workoutData)?.avg_bike_cadence ?? (hydrated||workoutData)?.avg_run_cadence ?? null;

            const fmtDist = (km:number)=> useMi ? (km*0.621371).toFixed(1) : km.toFixed(1);
            const fmtTime = (s:number)=>{ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=Math.floor(s%60); return h>0?`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`:`${m}:${String(ss).padStart(2,'0')}`; };
            const fmtSpeed = (kmh:number)=> useMi ? `${(kmh*0.621371).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;
            const fmtPace = (spkm:number)=>{ const spUnit = useMi ? spkm*1.60934 : spkm; const m=Math.floor(spUnit/60), s=Math.round(spUnit%60); return `${m}:${String(s).padStart(2,'0')}/${useMi?'mi':'km'}`; };

            return (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{distKm?fmtDist(distKm):'—'} {useMi?'mi':'km'}</div>
                  <div className="text-xs text-[#666666]">Distance</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{Number.isFinite(movingSec as any)?fmtTime(movingSec as number):'—'}</div>
                  <div className="text-xs text-[#666666]">Moving Time</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{
                    avgSpeedKmh ? fmtSpeed(avgSpeedKmh) : (Number.isFinite(avgPaceSpKm as any)?fmtPace(avgPaceSpKm as number):'—')
                  }</div>
                  <div className="text-xs text-[#666666]">{avgSpeedKmh? 'Avg Speed':'Avg Pace'}</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{Number.isFinite(avgHr as any)?avgHr:'—'}</div>
                  <div className="text-xs text-[#666666]">Avg HR</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{Number.isFinite(avgPwr as any)?avgPwr:'—'}</div>
                  <div className="text-xs text-[#666666]">Avg Power</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{Number.isFinite(gain as any)?(useImperial?Math.round((gain as number)*3.28084):Math.round(gain as number)):'—'} {useImperial?'ft':'m'}</div>
                  <div className="text-xs text-[#666666]">Elevation Gain</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{Number.isFinite(cad as any)?Math.round(cad as number):'—'}</div>
                  <div className="text-xs text-[#666666]">Cadence</div>
                </div>
                <div>
                  <div className="text-base font-semibold tabular-nums mb-0.5">{Number.isFinite(cal as any)?cal:'—'}</div>
                  <div className="text-xs text-[#666666]">Calories</div>
                </div>
                {Number.isFinite(gain as any) && (
                  <div>
                    <div className="text-base font-semibold tabular-nums mb-0.5">{(() => { try { const elev = Number(gain); const dur = Number(movingSec); if (Number.isFinite(elev) && elev > 0 && Number.isFinite(dur) && dur > 0) { const vam = Math.round(elev / (dur/3600)); return vam; } } catch {} return '—'; })()}</div>
                    <div className="text-xs text-[#666666]">VAM</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
       {/* Advanced synced viewer: Mapbox puck + interactive chart + splits */}
       {(() => {
         const isSwim = workoutData.swim_data;
         const hasLengths = Number((workoutData as any)?.number_of_active_lengths) > 0
           || (Array.isArray((workoutData as any)?.swim_data?.lengths) && (workoutData as any).swim_data.lengths.length > 0);
         const providerStr = String((workoutData as any)?.provider_sport || (workoutData as any)?.activity_type || (workoutData as any)?.name || '').toLowerCase();
         const openWaterHint = /open\s*water|ocean|ow\b/.test(providerStr);
         const poolHint = /lap|pool/.test(providerStr);
         const hasGps = Array.isArray((workoutData as any)?.gps_track) && (workoutData as any).gps_track.length > 10;
         const isPoolSwim = isSwim && (hasLengths || poolHint || (!openWaterHint && !hasGps));
        if (isPoolSwim) {
           return (
             <div className="mx-[-16px] px-3 py-2">
               <div className="text-sm text-gray-600">No route data (pool swim)</div>
             </div>
           );
         }
        const series = (hydrated||workoutData)?.computed?.analysis?.series || null;
         const time_s = Array.isArray(series?.time_s) ? series.time_s : (Array.isArray(series?.time) ? series.time : []);
         const distance_m = Array.isArray(series?.distance_m) ? series.distance_m : [];
         const elev = Array.isArray(series?.elevation_m) ? series.elevation_m : [];
         const pace = Array.isArray(series?.pace_s_per_km) ? series.pace_s_per_km : [];
         const hr = Array.isArray(series?.hr_bpm) ? series.hr_bpm : [];
        // Proceed even if series is missing; map will still render from gps_track
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
        // No client-side series transformation; use server-provided series as-is
        return (
          <div className="mt-6 mb-6 mx-[-16px]" style={{ minHeight: 700 }}>
              <EffortsViewerMapbox
              samples={(memo?.series || series) as any}
              trackLngLat={(memo?.track || track) as any}
              useMiles={!!useImperial}
              useFeet={!!useImperial}
              compact={compact}
              workoutData={workoutData}
              />
          </div>
        );
      })()}

      {/* Zones section (HR only) - render once */}
      {(() => {
        const zonesHr = (hydrated||workoutData)?.computed?.analysis?.zones?.hr;
        if (!(zonesHr?.bins?.length)) return null;
        return (
          <div className="mt-6 mx-[-16px] px-3 py-3 space-y-4">
            {zonesHr?.bins?.length ? (
              <div className="my-4">
                <HRZoneChart zoneDurationsSeconds={zonesHr.bins.map((b:any)=> Number(b.t_s)||0)} title="Heart Rate Zones" />
              </div>
            ) : null}
          </div>
        );
      })()}

      {(hydrated||workoutData)?.computed?.analysis?.events?.splits && (
        <div className="mt-6 mx-[-16px] px-3 py-3">
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
        </div>
      )}

      {/* VAM section removed; now a chart tab inside EffortsViewerMapbox */}
      {/* SEPARATE Power/Cadence Chart - at the bottom */}
      {(workoutData.swim_data || workoutData.ride_data) && (() => {
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

          const pickCadenceSample = (s: any) => {
            // Prefer rpm if present
            const rpm = s.bikeCadence ?? s.cadence ?? null;
            if (Number.isFinite(rpm)) return Number(rpm); // rpm
            // Else derive spm
            const rc = s.runCadence ?? s.cadence ?? s.strideRate ?? s.stride_cadence;
            return normalizeRunCadence(rc);
          };

          const cadenceData = samples
            .map(s => pickCadenceSample(s))
            .filter(v => v != null);
          
          // Old Power/Cadence chart removed (now integrated into main viewer tabs)
        }
        return null;
      })()}
      {/* (Removed old mini zones histograms to avoid duplicate zones under splits) */}
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
   </>
 );
};

// --- Training Effect helpers ---
const getTrainingEffect = (workoutData: any) => {
  const aerobic = (workoutData as any)?.metrics?.total_training_effect ?? (workoutData as any)?.total_training_effect ?? null;
  const anaerobic = (workoutData as any)?.metrics?.total_anaerobic_effect ?? (workoutData as any)?.total_anaerobic_effect ?? null;
  return {
    aerobic: Number.isFinite(aerobic) ? Number(aerobic) : null,
    anaerobic: Number.isFinite(anaerobic) ? Number(anaerobic) : null,
  };
};

// --- Running dynamics rollups (avg from samples when available) ---
const getRunDynamics = (hydrated: any) => {
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
const getPowerSummary = (workoutData: any, hydrated: any) => {
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