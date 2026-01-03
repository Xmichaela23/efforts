import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useWeather } from '@/hooks/useWeather';
import { useAppContext } from '@/contexts/AppContext';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { Calendar, Clock, Dumbbell, Activity } from 'lucide-react';
import { getDisciplineColor, getDisciplinePillClasses, getDisciplineCheckmarkColor } from '@/lib/utils';
import { resolveMovingSeconds } from '../utils/resolveMovingSeconds';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import WorkoutExecutionView from './WorkoutExecutionView';
import PlannedWorkoutSummary from './PlannedWorkoutSummary';
import { mapUnifiedItemToPlanned, mapUnifiedItemToCompleted } from '@/utils/workout-mappers';
import { useToast } from '@/components/ui/use-toast';

interface TodaysEffortProps {
  selectedDate?: string;
  onAddEffort: (type: string, date?: string) => void;
  onViewCompleted: () => void;
  onEditEffort?: (workout: any) => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ 
  selectedDate, 
  onAddEffort, 
  onViewCompleted, 
  onEditEffort 
}) => {
  const { useImperial, workouts, loading, loadUserBaselines, detailedPlans } = useAppContext();
  const [displayWorkouts, setDisplayWorkouts] = useState<any[]>([]);
  const [baselines, setBaselines] = useState<any | null>(null);
  const [dayLoc, setDayLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locTried, setLocTried] = useState(false);
  const [cityName, setCityName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Use local timezone to derive YYYY-MM-DD as seen by the user
  const today = new Date().toLocaleDateString('en-CA');
  const activeDate = selectedDate || today;

  // Helper functions for week calculation
  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    d.setHours(0, 0, 0, 0);
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  };

  const addDays = (date: Date, n: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  };

  const toDateOnlyString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Calculate week range for training plan context (needs week range to work properly)
  const activeDateObj = new Date(activeDate + 'T12:00:00');
  const weekStart = startOfWeek(activeDateObj);
  const weekEnd = addDays(weekStart, 6);
  const fromISO = toDateOnlyString(weekStart);
  const toISO = toDateOnlyString(weekEnd);

  // Unified lookup - use week range for training plan context, but filter items to active date
  const { items: allUnifiedItems = [], loading: unifiedLoading, trainingPlanContext } = useWeekUnified(fromISO, toISO);
  
  // Filter to only items for the active date
  const unifiedItems = allUnifiedItems.filter((item: any) => {
    const itemDate = String(item?.date || '').slice(0, 10);
    return itemDate === activeDate;
  });

  // No persistence: we will use ephemeral geolocation below for today's weather
  // Hard fetch of sets for today's completed strength if missing (dev-time only)
  useEffect(() => {
    (async () => {
      try {
        const todayStrength = (Array.isArray(unifiedItems) ? unifiedItems : []).find((it:any)=> String(it?.date).slice(0,10)===activeDate && String(it?.type||'').toLowerCase()==='strength' && String(it?.status||'').toLowerCase()==='completed');
        if (!todayStrength) return;
        const hasSets = Array.isArray(todayStrength?.executed?.strength_exercises) && todayStrength.executed.strength_exercises.length>0;
        if (hasSets) return;
        const { data } = await supabase.from('workouts').select('id,strength_exercises').eq('id', String(todayStrength.id)).maybeSingle();
        if (data && Array.isArray((data as any).strength_exercises)) {
          try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
        }
      } catch {}
    })();
  }, [unifiedItems, activeDate]);

  // Only fetch weather for today (we don't have historical weather data)
  const isTodayDate = activeDate === today;
  const { weather } = useWeather({
    lat: dayLoc?.lat,
    lng: dayLoc?.lng,
    timestamp: `${activeDate}T12:00:00`,
    enabled: !!dayLoc && isTodayDate, // Only enable for today
  });

  const { toast } = useToast();
  
  // Expanded details toggle per workout (id → boolean)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sendingToGarmin, setSendingToGarmin] = useState<string | null>(null);
  
  // Send workout to Garmin
  const handleSendToGarmin = async (e: React.MouseEvent, workout: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      setSendingToGarmin(workout.id);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Error', description: 'Please log in to send to Garmin', variant: 'destructive' });
        return;
      }
      
      const { data: result, error } = await supabase.functions.invoke('send-workout-to-garmin', {
        body: { workoutId: workout.id, userId: user.id }
      });
      
      if (error) {
        toast({ title: 'Error', description: `Failed to send: ${error.message}`, variant: 'destructive' });
      } else if (result?.success) {
        toast({ title: 'Sent!', description: 'Workout sent to Garmin' });
      } else {
        toast({ title: 'Error', description: result?.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to send to Garmin', variant: 'destructive' });
    } finally {
      setSendingToGarmin(null);
    }
  };
  
  // Check if workout is endurance type
  const isEnduranceType = (type: string) => {
    const t = (type || '').toLowerCase();
    return ['run', 'ride', 'bike', 'swim', 'cycling'].includes(t);
  };
  
  // Check if workout is strength/mobility type
  const isStrengthOrMobility = (type: string) => {
    const t = (type || '').toLowerCase();
    return ['strength', 'mobility', 'pilates_yoga'].includes(t);
  };
  
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // If today and no location yet, ask once and use ephemeral location (no persistence)
  useEffect(() => {
    if (locTried) return;
    if (activeDate !== today) return;
    if (dayLoc) return;
    setLocTried(true);
    try {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        setDayLoc({ lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude) });
      }, () => { /* ignore */ }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    } catch {}
  }, [activeDate, today, dayLoc, locTried]);

  // Secondary attempt: if initial geolocation didn't run (e.g., blocked), try once more on mount
  useEffect(() => {
    if (dayLoc) return;
    if (activeDate !== today) return;
    if (locTried) return;
    try {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        setDayLoc({ lat: Number(pos.coords.latitude), lng: Number(pos.coords.longitude) });
      });
    } catch {}
  }, [activeDate, today, dayLoc, locTried]);

  // Reverse geocoding to get city name from coordinates
  useEffect(() => {
    if (!dayLoc || activeDate !== today) {
      setCityName(null);
      return;
    }

    // Use OpenStreetMap Nominatim for reverse geocoding (free, no API key needed)
    const fetchCityName = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${dayLoc.lat}&lon=${dayLoc.lng}&format=json&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'Efforts App' // Required by Nominatim
            }
          }
        );
        const data = await response.json();
        let city = data.address?.city || 
                   data.address?.town || 
                   data.address?.village || 
                   data.address?.municipality ||
                   data.address?.county ||
                   null;
        
        // Make city names clearer for well-known cities
        if (city) {
          const cityLower = city.toLowerCase();
          // New York -> New York City
          if (cityLower === 'new york' || cityLower.includes('new york') && !cityLower.includes('city')) {
            city = 'New York City';
          }
          // Los Angeles -> Los Angeles (already clear)
          // San Francisco -> San Francisco (already clear)
          // Chicago -> Chicago (already clear)
          // etc.
        }
        
        setCityName(city);
      } catch (err) {
        // Silently fail - city name is optional
        setCityName(null);
      }
    };

    fetchCityName();
  }, [dayLoc, activeDate, today]);

  // Check if any workout is expanded
  const hasExpandedWorkout = Object.values(expanded).some(Boolean);


  const dateWorkoutsMemo = useMemo(() => {
    const items = Array.isArray(unifiedItems) ? unifiedItems : [];
    
    // Trust get-week completely - it already figured out what to show
    // If status='completed', show executed data
    // If status='planned', show planned data
    return items.map((it:any) => {
      const isCompleted = String(it?.status||'').toLowerCase()==='completed';
      
      if (isCompleted) {
        // Use mapper for completed workouts
        return mapUnifiedItemToCompleted(it);
      } else {
        // Use mapper for planned workouts - SINGLE SOURCE OF TRUTH
        return mapUnifiedItemToPlanned(it);
      }
    });
  }, [unifiedItems]);

  // FIXED: React to selectedDate prop changes properly - use a stable dependency
  useEffect(() => {
    // Split into activated (no 'optional') and optional
    const activated = dateWorkoutsMemo.filter((w:any)=> !(Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional')));
    const optionals = dateWorkoutsMemo.filter((w:any)=> Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'));
    setDisplayWorkouts([...activated, ...optionals]);
  }, [unifiedItems.length, activeDate]); // Use stable dependencies - length and date
  // Helper to clean authored codes from text (mirrors PlannedWorkoutView)
  const stripCodes = (text?: string) => String(text || '')
    .replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '')
    .replace(/\[[A-Za-z0-9_:+\-x\/]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();


  // Load baselines for planned summaries
  useEffect(() => {
    (async () => {
      try {
        const b = await loadUserBaselines();
        setBaselines(b || null);
      } catch (e) {
        setBaselines(null);
      }
    })();
  }, [loadUserBaselines]);

  // Icons removed - using text-only interface

  // Icon colors removed - using text-only interface

  // Format rich workout display - different for planned vs completed
  const formatRichWorkoutDisplay = (workout: any) => {
    const discipline = getDisplaySport(workout);
    // Display Moving Time (mm:ss) for non-strength; blank for strength
    const duration = (() => {
      if (workout.type === 'strength') return '';
      const sec = resolveMovingSeconds(workout);
      if (Number.isFinite(sec as any) && (sec as number) > 0) {
        const s = Math.round(sec as number);
        const m = Math.floor(s/60);
        const ss = s % 60;
        return `${m}:${String(ss).padStart(2,'0')}`;
      }
      return '';
    })();
    const isCompleted = workout.workout_status === 'completed';
    
    // Get metrics/description based on workout status
    const truncate = (text: string, max = 120) => {
      if (!text) return '';
      return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
    };

    // Distance helpers
    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371000; // meters
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const computeDistanceKm = (w: any): number | null => {
      // Priority 1: explicit km field
      const dk = w?.distance_km ?? w?.metrics?.distance_km;
      if (typeof dk === 'number' && isFinite(dk) && dk > 0) return dk;
      // Priority 2: explicit meters field → convert to km
      const m = w?.distance_meters ?? w?.metrics?.distance_meters ?? w?.strava_data?.original_activity?.distance;
      if (typeof m === 'number' && isFinite(m) && m > 0) return m / 1000;
      // Priority 3: generic distance → assume km (pipelines normalize to km)
      if (typeof w?.distance === 'number' && isFinite(w.distance) && w.distance > 0) return w.distance;
      if (typeof w?.distance === 'string') {
        const parsed = parseFloat(w.distance);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      // gps_track fallback
      const track = Array.isArray(w?.gps_track) ? w.gps_track : null;
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
      // steps fallback (~0.78 m per step average)
      const steps = w?.steps ?? w?.metrics?.steps;
      if (typeof steps === 'number' && steps > 0) return (steps * 0.78) / 1000;
      return null;
    };

    const getMetrics = () => {
      if (!isCompleted) {
        // PLANNED: Prefer precomputed friendly text if present
        const storedText = (workout as any).rendered_description;
        if (typeof storedText === 'string' && storedText.trim().length > 0) {
          // Planned cards should reflect the pre-rendered text only
          return [truncate(storedText, 200)];
        }
        // No stored text → do not synthesize from fallbacks anymore
        return [truncate(stripCodes(workout.description || ''), 200)];
      }
      
      // COMPLETED: Show actual metrics
      if (workout.type === 'strength') {
        // Strength: show exercise abbreviations with their set/rep/weight info
        // Read from strength_exercises field which contains the actual workout data
        const parseSets = (x:any)=> {
          if (Array.isArray(x)) return x;
          if (typeof x === 'string') { try { const p = JSON.parse(x); return Array.isArray(p) ? p : []; } catch { return []; } }
          return [];
        };
        const normalizeExercises = (src:any): any[] => {
          if (!src) return [];
          if (Array.isArray(src)) return src.map((ex:any)=> ({ ...ex, sets: parseSets(ex?.sets) }));
          if (typeof src === 'string') { try { const p = JSON.parse(src); return Array.isArray(p) ? p.map((ex:any)=> ({ ...ex, sets: parseSets(ex?.sets) })) : []; } catch { return []; } }
          return [];
        };
        const exercises = (()=>{
          const a = normalizeExercises(workout.strength_exercises);
          if (a.length) return a;
          const c = normalizeExercises((workout as any)?.completed_exercises);
          if (c.length) return c;
          const b = normalizeExercises((workout as any)?.computed?.strength_exercises);
          return b;
        })();
        try {
          // Debug logging removed to prevent infinite re-renders
        } catch {}
        
        if (exercises.length > 0) {
          // Create exercise summaries with abbreviations
          const exerciseSummaries = exercises.map(ex => {
            const exerciseName = (ex.name || '').trim();
            const lower = exerciseName.toLowerCase();
            const sets = ex.sets?.length || 0;
            const avgReps = ex.sets?.reduce((total, set) => total + (set.reps || 0), 0) / (sets || 1);

            // Compute weight range across sets
            let weightRange = '';
            if (Array.isArray(ex.sets) && ex.sets.length > 0) {
              const weights = ex.sets.map((s:any)=> Number(s?.weight || 0)).filter((w:number)=> isFinite(w) && w>0);
              if (weights.length > 0) {
                const minWeight = Math.min(...weights);
                const maxWeight = Math.max(...weights);
                weightRange = (minWeight === maxWeight) ? `${minWeight}lbs` : `${minWeight}-${maxWeight}lbs`;
              } else {
                weightRange = '';
              }
            }

            // Abbreviation map
            const abbrevFor = (): string => {
              const has = (s: string) => lower.includes(s);
              if (has('ohp') || has('overhead press') || has('shoulder press')) return 'OHP';
              if (has('bench press') || has('flat bench')) return 'BP';
              if (has('incline bench')) return 'IBP';
              if (has('deadlift') || has('dead lift')) return has('romanian') || has('rdl') ? 'RDL' : 'DL';
              if (has('front squat')) return 'FSQ';
              if (has('goblet squat')) return 'GSQ';
              if (has('squat')) return 'SQ';
              if (has('bent over row') || has('barbell row') || has('row')) return 'ROW';
              if (has('pull-up') || has('pull up')) return 'PU';
              if (has('chin-up') || has('chin up')) return 'CU';
              if (has('lat pulldown') || has('lat pull-down') || has('pulldown')) return 'LPD';
              if (has('face pull')) return 'FP';
              if (has('lateral raise') || has('lat raise')) return 'LR';
              if (has('hip thrust')) return 'HT';
              if (has('lunge')) return 'LNG';
              if (has('dip')) return 'DIP';
              if (has('curl')) return 'CURL';
              // Multi-word fallback: initials
              const words = exerciseName.split(/\s+/).filter(Boolean);
              if (words.length >= 2) return words.map(w => w[0]).join('').toUpperCase().slice(0,4);
              // Single-word fallback: first 3 letters
              return exerciseName.slice(0,3).toUpperCase();
            };

            const abbreviation = abbrevFor();
            const reps = Math.round(avgReps || 0);
            const lead = weightRange ? `${weightRange} ${sets}×${reps}` : `${sets}×${reps}`;
            return `${abbreviation} ${lead}`.trim();
          });
          
          return exerciseSummaries.map((summary, index) => {
            return {
              icon: Dumbbell,
              value: summary
            };
          });
        }

        // Fallback if no exercises
        return [
          { icon: Dumbbell, value: 'No exercises' }
        ];
      } else if (workout.type === 'mobility') {
        // Mobility: show simple set summaries from executed.mobility_exercises (unified source)
        const parseList = (src:any): any[] => {
          if (Array.isArray(src)) return src;
          if (typeof src === 'string') { try { const p = JSON.parse(src); return Array.isArray(p) ? p : []; } catch { return []; } }
          return [];
        };
        const items = parseList((workout as any)?.mobility_exercises) || parseList((workout as any)?.computed?.mobility_exercises);
        if (items.length > 0) {
          const codeFromName = (nm:string): string => {
            const name = String(nm||'').trim();
            const lower = name.toLowerCase();
            // Use simple initials for multi-word names; else first 3 letters
            const words = name.split(/\s+/).filter(Boolean);
            if (words.length >= 2) return words.map(w=>w[0]).join('').toUpperCase().slice(0,4);
            return name.slice(0,3).toUpperCase();
          };
          const chips = items.map((it:any)=>{
            const name = String(it?.name||'').trim();
            const dur = String(it?.duration||'');
            const m = dur.match(/(\d+)\s*[x×]\s*(\d+)/i);
            const sets = m ? parseInt(m[1],10) : undefined;
            const reps = m ? parseInt(m[2],10) : undefined;
            // Prefer weight_display (includes "each" for per-hand exercises)
            const weightDisplay = it?.weight_display;
            let w = it?.weight; let wNum = (typeof w==='number') ? w : (typeof w==='string' ? parseFloat(w): 0);
            if (!Number.isFinite(wNum)) wNum = 0;
            const parts: string[] = [];
            parts.push(codeFromName(name));
            if (typeof sets==='number' && typeof reps==='number') parts.push(`${sets}×${reps}`);
            if (weightDisplay && weightDisplay !== 'Bodyweight' && weightDisplay !== 'Band') {
              parts.push(`@ ${weightDisplay}`);
            } else if (wNum>0) {
              parts.push(`@ ${Math.round(wNum)} lb`);
            }
            const val = parts.join(' ');
            return { icon: Dumbbell, value: val || codeFromName(name) };
          });
          return chips;
        }
        return [ { icon: Dumbbell, value: 'No exercises' } ];
      } else if (workout.type === 'pilates_yoga') {
        // Pilates/Yoga: show session type, duration, RPE, and focus areas
        const metadata = (workout as any)?.workout_metadata || {};
        const sessionType = metadata.session_type || 'other';
        const rpe = metadata.session_rpe;
        const focusAreas = metadata.focus_area || [];
        const duration = workout.duration || 0;
        
        const sessionTypeLabels: { [key: string]: string } = {
          'pilates_mat': 'Pilates Mat',
          'pilates_reformer': 'Pilates Reformer',
          'yoga_flow': 'Yoga Flow',
          'yoga_restorative': 'Yoga Restorative',
          'yoga_power': 'Yoga Power',
          'yoga_hot': 'Yoga Flow', // Backward compatibility - map to Yoga Flow
          'other': 'Pilates/Yoga'
        };
        
        const metrics: any[] = [];
        metrics.push({ icon: Activity, value: sessionTypeLabels[sessionType] || 'Pilates/Yoga' });
        if (duration > 0) {
          metrics.push({ icon: Clock, value: `${duration}min` });
        }
        if (typeof rpe === 'number' && rpe >= 1 && rpe <= 10) {
          metrics.push({ icon: Activity, value: `RPE ${rpe}/10` });
        }
        if (focusAreas.length > 0) {
          const focusLabels = focusAreas.map((area: string) => {
            return area.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          });
          metrics.push({ icon: Activity, value: focusLabels.join(', ') });
        }
        
        return metrics.length > 0 ? metrics : [{ icon: Activity, value: 'Pilates/Yoga Session' }];
      } else {
        // Endurance: distance, pace/speed, power (rides), heart rate, elevation (unified executed.overall only)
        const isRun = workout.type === 'run' || workout.type === 'walk';
        const isSwim = workout.type === 'swim';
        const isRide = workout.type === 'ride' || workout.type === 'bike';
        const overall = (workout as any)?.computed?.overall || {};
        const distM = Number(overall?.distance_m ?? overall?.distanceMeters);
        const durS = Number(overall?.duration_s_moving ?? overall?.moving_seconds ?? overall?.duration_s);
        // Prefer canonical m/s; if missing, derive from distance_m / duration_s_moving
        let avgSpeedMpsOverall = Number(overall?.avg_speed_mps);
        if (!(Number.isFinite(avgSpeedMpsOverall) && avgSpeedMpsOverall > 0) && Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
          avgSpeedMpsOverall = distM / durS;
        }
        const avgPowerW = Number(overall?.avg_power_w ?? (workout as any)?.avg_power);
        // Distance text
        let distance = 'N/A';
        if (Number.isFinite(distM) && distM > 0) {
          if (useImperial) distance = `${(distM/1609.34).toFixed(1)} mi`;
          else distance = `${(distM/1000).toFixed(1)} km`;
        }
        // Pace/Speed
        let paceSpeed = 'N/A';
        if (isSwim) {
                // Single source of truth: use server-computed overall stats only
          if (Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
                  const preferYards = !!useImperial;
            const per100 = preferYards ? (durS / ((distM / 0.9144) / 100)) : (durS / (distM / 100));
                  const mm = Math.floor(per100 / 60);
                  const ss = Math.round(per100 % 60);
                  paceSpeed = `${mm}:${String(ss).padStart(2,'0')} ${preferYards ? '/100yd' : '/100m'}`;
                }
        } else if (isRun && Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
          // Pace min/mi from overall
          const miles = distM / 1609.34;
          const paceMinPerMile = (durS / 60) / miles;
          const minutes = Math.floor(paceMinPerMile);
          const seconds = Math.round((paceMinPerMile - minutes) * 60);
          paceSpeed = `${minutes}:${String(seconds).padStart(2,'0')}/mi`;
        } else if (isRide && (Number.isFinite(avgSpeedMpsOverall) && avgSpeedMpsOverall > 0)) {
          const speedMph = avgSpeedMpsOverall * 2.237;
          paceSpeed = `${Math.round(speedMph * 10) / 10} mph`;
        }

        const heartRate = Number(overall?.avg_hr ?? workout.avg_heart_rate ?? workout.metrics?.avg_heart_rate);
        const hrDisplay = (Number.isFinite(heartRate) && heartRate > 0) ? `${Math.round(heartRate)} bpm` : 'N/A';
        const elevationM = Number(overall?.elevation_gain_m ?? workout.elevation_gain ?? workout.metrics?.elevation_gain);
        const elevationFt = (Number.isFinite(elevationM) && elevationM > 0) ? `${Math.round(elevationM * 3.28084)} ft` : 'N/A';

        // Power text for rides (Avg W and %FTP when FTP is known)
        const powerText = (isRide && Number.isFinite(avgPowerW) && avgPowerW > 0) ? `${Math.round(avgPowerW)} W` : undefined;

        // For swims, only show distance and average pace
        if (isSwim) {
          // Prefer server overall; fall back to pool metadata or generic distance/duration
          const preferYards = !!useImperial; // user preference from baselines
          const comp = (workout as any)?.computed?.overall;
          let distM: number | null = Number(comp?.distance_m);
          let durS: number | null = Number(comp?.duration_s_moving ?? comp?.duration_s);
          if (!(Number.isFinite(distM) && (distM as number) > 0)) {
            // Try pool metadata
            const poolLenM = Number((workout as any)?.pool_length_m ?? (workout as any)?.pool_length);
            const nLengths = Number((workout as any)?.number_of_active_lengths);
            if (Number.isFinite(poolLenM) && Number.isFinite(nLengths) && poolLenM > 0 && nLengths > 0) {
              distM = poolLenM * nLengths;
            } else {
              // Try swim_data.lengths sum
              try {
                const lengths = Array.isArray((workout as any)?.swim_data?.lengths) ? (workout as any).swim_data.lengths : [];
                const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
                if (sum > 0) distM = sum; // meters
              } catch {}
            }
          }
          // Exact moving seconds via shared resolver (parses metrics JSON if needed)
          durS = Number(resolveMovingSeconds(workout));
          // As a last resort, distance from km field
          if (!(Number.isFinite(distM) && (distM as number) > 0)) {
            const km = computeDistanceKm(workout);
            if (Number.isFinite(km) && (km as number) > 0) distM = (km as number) * 1000;
          }
          const yards = (Number.isFinite(distM) && (distM as number) > 0) ? Math.round((distM as number) / 0.9144) : null;
          const meters = (Number.isFinite(distM) && (distM as number) > 0) ? Math.round(distM as number) : null;
          const distText = preferYards
            ? (yards != null ? `${yards.toLocaleString()} yd` : 'N/A')
            : (meters != null ? `${meters.toLocaleString()} m` : 'N/A');
          const durText = (Number.isFinite(durS) && (durS as number) > 0)
            ? (()=>{ const s=Math.round(durS as number); const m=Math.floor(s/60); const ss=s%60; return `${m}:${String(ss).padStart(2,'0')}`; })()
            : 'N/A';
          const per100 = (Number.isFinite(durS) && (durS as number) > 0 && ((preferYards && yards && yards>0) || (!preferYards && meters && meters>0)))
            ? (()=>{ const denom = preferYards ? (yards as number)/100 : (meters as number)/100; const per = (durS as number) / denom; const m_=Math.floor(per/60); const ss=Math.round(per%60); return `${m_}:${String(ss).padStart(2,'0')}/${preferYards ? '100yd' : '100m'}`; })()
            : 'N/A';
          return [distText, durText, per100];
        }
        
        // Add workload if available
        const workload = (workout as any).workload_actual || (workout as any).workload_planned;
        const workloadText = workload ? `${workload}` : undefined;
        
        return [distance, paceSpeed, powerText, hrDisplay, elevationFt, workloadText].filter(Boolean) as any;
      }
    };
    
    return { discipline, duration, metrics: getMetrics() };
  };

  const activateOptional = async (w: any) => {
    try {
      const t: string[] = Array.isArray(w?.tags) ? w.tags : [];
      const next = t.filter((x:string)=> x.toLowerCase() !== 'optional');
      await fetch('/api/activate-optional', { method: 'POST', body: JSON.stringify({ id: w.id, tags: next }) }).catch(()=>{});
      try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
    } catch {}
  };

  // Get discipline name
  // Display label: prefer provider sport when present (e.g., Hike, Gravel Ride)
  const getDisplaySport = (workout: any): string => {
    const provider = workout?.strava_data?.original_activity?.sport_type
      || workout?.provider_sport
      || '';

    if (typeof provider === 'string' && provider.trim().length > 0) {
      // Title case
      const label = provider.replace(/_/g, ' ');
      return label.charAt(0).toUpperCase() + label.slice(1);
    }

    return getDisciplineName(workout?.type);
  };

  const getDisciplineName = (type: string): string => {
    switch (type) {
      case 'run': return 'Run';
      case 'walk': return 'Walk';
      case 'ride': 
      case 'bike': return 'Ride';
      case 'swim': return 'Swim';
      case 'strength': return 'Lift';
      case 'mobility': return 'Mobility';
      case 'pilates_yoga': return 'Pilates/Yoga';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Get workout type/focus
  const getWorkoutType = (workout: any): string => {
    // Check for specific workout types in name or description
    const name = workout.name?.toLowerCase() || '';
    const description = workout.description?.toLowerCase() || '';
    const text = `${name} ${description}`;

    // Cardio workout types
    if (text.includes('tempo') || text.includes('threshold')) return 'Tempo';
    if (text.includes('endurance') || text.includes('long')) return 'Endurance';
    if (text.includes('intervals') || text.includes('intervals')) return 'Intervals';
    if (text.includes('drills') || text.includes('technique')) return 'Drills';
    if (text.includes('easy') || text.includes('recovery')) return 'Easy';
    if (text.includes('hard') || text.includes('race')) return 'Hard';

    // Strength workout types
    if (text.includes('upper') || text.includes('push')) return 'Upper';
    if (text.includes('lower') || text.includes('legs')) return 'Lower';
    if (text.includes('compound') || text.includes('full')) return 'Compound';
    if (text.includes('core') || text.includes('abs')) return 'Core';

    // Default types
    switch (workout.type) {
      case 'run': return 'Easy';
      case 'walk': return 'Easy';
      case 'ride': return 'Endurance';
      case 'swim': return 'Drills';
      case 'strength': return 'Compound';
      case 'mobility': return 'Stretch';
      case 'pilates_yoga': return 'Flexibility';
      default: return 'Workout';
    }
  };

  // Format duration
  const formatDuration = (duration: any): string => {
    if (!duration) return '';
    
    const minutes = typeof duration === 'number' ? duration : parseInt(duration);
    if (isNaN(minutes)) return '';
    
    if (minutes < 60) {
      return `${minutes}min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours}h`;
      } else {
        return `${hours}h ${remainingMinutes}min`;
      }
    }
  };

  // Format the date for display - compact format with date included
  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Check if it's today, yesterday, or tomorrow
    const isToday = dateString === today.toLocaleDateString('en-CA');
    const isYesterday = dateString === yesterday.toLocaleDateString('en-CA');
    const isTomorrow = dateString === tomorrow.toLocaleDateString('en-CA');

    // Get compact date format (e.g., "Aug 9")
    const compactDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    if (isToday) {
      return `Today, ${compactDate}`;
    } else if (isYesterday) {
      return `Yesterday, ${compactDate}`;
    } else if (isTomorrow) {
      return `Tomorrow, ${compactDate}`;
    } else {
      // Format as "Mon, Jan 15" for other dates
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const isPastDate = activeDate < today;
  const isToday = activeDate === today;



  const blockLoading = unifiedLoading && !Array.isArray(dateWorkoutsMemo) ? true : false;
  if (blockLoading) {
    return (
      <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{fontFamily: 'Inter, sans-serif', height: 'var(--todays-h)'}}>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  // (Reverted) no horizontal scroll state

  // Calculate header height for scroll container positioning
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(40); // Start with reasonable default

  useEffect(() => {
    if (headerRef.current) {
      const updateHeight = () => {
        const height = headerRef.current?.offsetHeight || 40;
        setHeaderHeight(height);
      };
      // Update immediately
      updateHeight();
      // Also update after a short delay to catch any layout changes
      const timeoutId = setTimeout(updateHeight, 100);
      const resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(headerRef.current);
      return () => {
        clearTimeout(timeoutId);
        resizeObserver.disconnect();
      };
    }
  }, [weather]);

  // Week navigation handlers
  const handlePrevWeek = () => {
    const newDate = new Date(activeDate + 'T12:00:00');
    newDate.setDate(newDate.getDate() - 7);
    // This would need to be passed up to parent - for now just log
    console.log('Navigate to prev week:', newDate.toLocaleDateString('en-CA'));
  };
  
  const handleNextWeek = () => {
    const newDate = new Date(activeDate + 'T12:00:00');
    newDate.setDate(newDate.getDate() + 7);
    console.log('Navigate to next week:', newDate.toLocaleDateString('en-CA'));
  };

  // Format week range label
  const formatWeekRange = () => {
    const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
    return `${monthFmt.format(weekStart)} ${weekStart.getDate()} – ${monthFmt.format(weekEnd)} ${weekEnd.getDate()}`;
  };

  return (
    <div className="w-full flex-shrink-0" style={{fontFamily: 'Inter, sans-serif', height: 'var(--todays-h)', position:'relative', overflow: 'visible', zIndex: 0}}>
      {/* Header - with backdrop blur for scroll-behind effect */}
      <div 
        ref={headerRef}
        className="mb-2 px-4 flex-shrink-0" 
        style={{ 
          position: 'relative', 
          zIndex: 10,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          marginLeft: '-1rem',
          marginRight: '-1rem',
          paddingLeft: '1.25rem',
          paddingRight: '1.25rem',
          paddingTop: '0.25rem',
          paddingBottom: '0.5rem',
        }}
      >
        <div className="space-y-1">
          {/* Line 1: Date */}
          <div>
            <span className="text-lg font-light tracking-wide text-foreground">
              {formatDisplayDate(activeDate)}
            </span>
          </div>

          {/* Line 2: Weather + Location (weather only for today) */}
          {(weather || cityName) && (
            <div className="flex items-center gap-1 flex-wrap">
              {weather && isTodayDate && (
                <span className="text-sm font-light text-white/60 tracking-normal">
                  {Math.round(weather.temperature)}°F {weather.condition}
                  {typeof weather.daily_high === 'number' ? ` • High ${Math.round(weather.daily_high)}°` : ''}
                  {weather.sunrise && weather.sunset ? (()=>{ try { const fmt=(iso:string)=>{ const d=new Date(iso); return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }).replace(/\s?AM|\s?PM/i, m=> m.trim().toLowerCase()); }; return ` • ${fmt(weather.sunrise)}/${fmt(weather.sunset)}`; } catch { return '';} })() : ''}
                </span>
              )}
              {/* City name from geolocation (show for any date if available) */}
              {cityName && (
                <span className="text-sm font-light text-white/60 tracking-normal">
                  {weather && isTodayDate ? ' • ' : ''}{cityName}
                </span>
              )}
            </div>
          )}

          {/* Line 3: Week + Focus + Event (all training context together) */}
          {trainingPlanContext && (trainingPlanContext.currentWeek || trainingPlanContext.focus || (trainingPlanContext.raceDate && trainingPlanContext.weeksToRace)) && (
            <div className="text-sm text-white/60 font-light tracking-normal">
              {trainingPlanContext.currentWeek && (
                <span>Week {trainingPlanContext.currentWeek}</span>
              )}
              {trainingPlanContext.currentWeek && trainingPlanContext.focus && (
                <span> • </span>
              )}
              {trainingPlanContext.focus && (
                <span>{trainingPlanContext.focus}</span>
              )}
              {trainingPlanContext.focus && trainingPlanContext.raceDate && trainingPlanContext.weeksToRace && trainingPlanContext.weeksToRace > 0 && (
                <span> • </span>
              )}
              {trainingPlanContext.raceDate && trainingPlanContext.weeksToRace && trainingPlanContext.weeksToRace > 0 && (
                <span className="text-orange-400">
                  {trainingPlanContext.weeksToRace} {trainingPlanContext.weeksToRace === 1 ? 'wk' : 'wks'} till {trainingPlanContext.raceName || 'race'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content area - scrolls vertically, starts from top so content can scroll behind header */}
      <div 
        ref={scrollRef}
        className="scrollbar-hide" 
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingTop: `${headerHeight + 8}px`,
        }}
      >
        {/* Sticky Week Of header with backdrop blur */}
        <div 
          className="sticky top-0 z-20 flex items-center justify-between py-2 px-2 mx-1 mb-2 rounded-xl border border-white/20"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}
        >
          <button
            aria-label="Previous week"
            className="px-2 py-1 rounded hover:bg-white/10 active:bg-white/20 text-white/80 text-sm"
            onClick={handlePrevWeek}
          >
            ‹
          </button>
          <span className="text-sm font-light tracking-normal text-white">
            Week of {formatWeekRange()}
          </span>
          <button
            aria-label="Next week"
            className="px-2 py-1 rounded hover:bg-white/10 active:bg-white/20 text-white/80 text-sm"
            onClick={handleNextWeek}
          >
            ›
          </button>
        </div>

        <div className="px-3" style={{ paddingBottom: hasExpandedWorkout ? 120 : 48 }}>
        {displayWorkouts.length === 0 ? (
          // Empty state
          <div className="flex items-center justify-center h-full px-4">
            <p className="text-muted-foreground text-xs text-center">
              {isPastDate 
                ? 'No effort logged' 
                : isToday 
                  ? 'No effort scheduled'
                  : 'No effort scheduled'
              }
            </p>
          </div>
        ) : (
          // Compact workout display - vertical list (reverted)
          <div className="">
            <div className="space-y-1">
              {displayWorkouts.map((workout) => (
                <div
                  key={workout.id}
                  className={`w-full text-left p-3 rounded-2xl transition-all backdrop-blur-lg border ${getDisciplinePillClasses(workout.type || workout.workout_type || '', workout.workout_status === 'completed')}`}
                >
                  {/* Planned: grouped like weekly (no coach summary, no per-step bullets) */}
                  {workout.workout_status === 'planned' ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        {/* Left: workout summary */}
                        <div className="flex-1 min-w-0">
                          <PlannedWorkoutSummary workout={workout} baselines={baselines as any} hideLines={!expanded[String(workout.id)]} />
                        </div>
                        
                        {/* Right: action + details */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isEnduranceType(workout.type || workout.workout_type || '') && (
                            <button
                              className="px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/30 text-white text-xs font-light tracking-wide hover:bg-white/[0.12] hover:border-white/40 transition-all duration-200 cursor-pointer shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_2px_8px_rgba(0,0,0,0.2)]"
                              onClick={(e) => handleSendToGarmin(e, workout)}
                            >
                              {sendingToGarmin === workout.id ? 'Sending...' : 'Send to Garmin'}
                            </button>
                          )}
                          {isStrengthOrMobility(workout.type || workout.workout_type || '') && (
                            <button
                              className="px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/30 text-white text-xs font-light tracking-wide hover:bg-white/[0.12] hover:border-white/40 transition-all duration-200 cursor-pointer shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_2px_8px_rgba(0,0,0,0.2)]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // Open the logger with this workout pre-filled
                                const w: any = { ...workout };
                                w.__openLogger = true;
                                onEditEffort && onEditEffort(w);
                              }}
                            >
                              Go to workout
                            </button>
                          )}
                          <button
                            className="px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white text-xs font-light tracking-wide hover:bg-white/[0.12] hover:border-white/30 transition-all duration-200 cursor-pointer"
                            onClick={(e)=>{ 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              const key = String(workout.id);
                              toggleExpanded(key);
                            }}
                          >
                            {expanded[String(workout.id)] ? 'hide' : 'details'}
                          </button>
                        </div>
                      </div>
                      {(() => { 
                        if (!expanded[String(workout.id)]) return null;
                        const type = String((workout as any)?.type||'').toLowerCase();
                        // Swim: use lightweight token summary to avoid heavy step expansion
                        if (type==='swim') {
                          try {
                            const toks: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t:any)=>String(t)) : [];
                            if (!toks.length) return null;
                            const preferYards = true; // authored units default to yards for this plan
                            const yd = (n:number, unit:string)=> unit.toLowerCase()==='yd'? n : Math.round(n/0.9144);
                            const lines: string[] = [];
                            const pushWUCD = (m:RegExpMatchArray, warm:boolean)=>{
                              const n = parseInt(m[1],10); const unit = String(m[2]||'yd'); const dist = preferYards? `${yd(n,unit)} yd` : `${n} ${unit}`;
                              lines.push(`${warm?'Warm‑up':'Cool‑down'} ${dist}`);
                            };
                            const add = (label:string, reps:number, dist:number, unit:string)=>{
                              const distance = preferYards? `${yd(dist,unit)} yd` : `${dist} ${unit}`;
                              lines.push(`${label} ${reps}×${distance}`);
                            };
                            toks.forEach((t)=>{
                              const s = String(t).toLowerCase();
                              let m = s.match(/swim_warmup_(\d+)(yd|m)/i); if (m) { pushWUCD(m, true); return; }
                              m = s.match(/swim_cooldown_(\d+)(yd|m)/i); if (m) { pushWUCD(m, false); return; }
                              m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)/i); if (m) { add(m[1].replace(/_/g,' '), parseInt(m[2],10), parseInt(m[3],10), m[4]); return; }
                              m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i); if (m) { add(m[4].replace(/_/g,' '), parseInt(m[1],10), parseInt(m[2],10), m[3]); return; }
                              m = s.match(/swim_pull_(\d+)x(\d+)(yd|m)/i); if (m) { add('Pull', parseInt(m[1],10), parseInt(m[2],10), m[3]); return; }
                              m = s.match(/swim_kick_(\d+)x(\d+)(yd|m)/i); if (m) { add('Kick', parseInt(m[1],10), parseInt(m[2],10), m[3]); return; }
                              m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i); if (m) { add('Aerobic', parseInt(m[1],10), parseInt(m[2],10), m[3]); return; }
                            });
                            return lines.length? (<ul className="list-disc pl-5 text-xs text-foreground">{lines.map((ln,idx)=>(<li key={idx}>{ln}</li>))}</ul>) : null;
                          } catch {}
                        }
                        // Non-swim: avoid duplicate details; PlannedWorkoutSummary already renders content
                        return null;
                      })()}
                    </div>
                  ) : (
                    <div 
                      className="space-y-1 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditEffort && onEditEffort(workout);
                      }}
                    >
                      {/* Title and Duration Row */}
                      <div className="flex items-center justify-between">
                        <div className="font-light tracking-normal text-base text-foreground">
                          {(() => {
                            const type = String(workout.type || '').toLowerCase();
                            const desc = String(workout.description || '').toLowerCase();
                            const steps = Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : [];
                            if (type === 'strength') {
                              // Check workout_structure.title first (from plans), then workout.name
                              const stTitle = String((workout as any)?.workout_structure?.title || '').trim();
                              const name = stTitle || workout.name;
                              if (name && name.trim() && name.toLowerCase() !== 'strength') {
                                // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
                                const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(name);
                                if (hasDateSuffix) {
                                  const nameWithoutDate = name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
                                  return nameWithoutDate || 'Strength';
                                }
                                return name;
                              }
                              // Fallback to description-based logic if no name
                              if (/squat|deadlift|bench|ohp/.test(desc)) return 'Strength — Compounds';
                              if (/chin|row|pull|lunge|accessor/i.test(desc)) return 'Strength — Accessory';
                              if (/core/.test(desc)) return 'Strength — Core';
                              return 'Strength';
                            }
                            if (type === 'run') {
                              const joined = steps.join(' ').toLowerCase();
                              if (/longrun_/.test(joined)) return 'Run — Long';
                              if (/tempo_/.test(joined)) return 'Run — Tempo';
                              if (/interval_/.test(joined)) return 'Run — Intervals';
                              return 'Run';
                            }
                            if (type === 'ride') {
                              const joined = steps.join(' ').toLowerCase();
                              if (/bike_vo2_/.test(joined)) return 'Ride — VO2';
                              if (/bike_thr_/.test(joined)) return 'Ride — Threshold';
                              if (/bike_ss_/.test(joined)) return 'Ride — Sweet Spot';
                              if (/bike_endurance_/.test(joined)) return 'Ride — Endurance';
                              return 'Ride';
                            }
                            if (type === 'swim') {
                              if (/drill|technique|swim_drills_|swim_technique_/.test(desc)) return 'Swim — Drills';
                              return 'Swim';
                            }
                            if (type === 'pilates_yoga') {
                              // Just return "Pilates" or "Yoga" - specific type goes in description
                              const nameLower = String(workout.name || '').toLowerCase();
                              const descLower = String(workout.description || '').toLowerCase();
                              const combined = (nameLower + ' ' + descLower).toLowerCase();
                              
                              // Determine if it's yoga or pilates
                              if (/yoga/i.test(combined)) return 'Yoga';
                              if (/pilates/i.test(combined)) return 'Pilates';
                              
                              return workout.name || 'Pilates/Yoga';
                            }
                            // Use workout.name if it's nice, otherwise fall back to getDisplaySport
                            const name = workout.name;
                            if (name) {
                              // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
                              const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(name);
                              if (hasDateSuffix) {
                                const nameWithoutDate = name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
                                // If what's left is just the type, use getDisplaySport instead
                                if (nameWithoutDate.toLowerCase() === type.toLowerCase()) {
                                  return getDisplaySport(workout);
                                }
                                return nameWithoutDate;
                              }
                              
                              // Check if it's a raw provider code or lowercase single word
                              const isRawProviderCode = name.match(/^(ROAD_BIKING|RUNNING|LAP_SWIMMING|OPEN_WATER_SWIMMING|CYCLING|SWIMMING)$/i);
                              const isGenericProvider = name.startsWith('Garmin ') || name.startsWith('Strava ');
                              const isLowercaseSingleWord = name === name.toLowerCase() && 
                                                            !name.includes(' ') && 
                                                            ['swim', 'run', 'ride', 'walk', 'strength'].includes(name.toLowerCase());
                              
                              // Only use existing name if it's actually nice
                              if (!isRawProviderCode && !isGenericProvider && !isLowercaseSingleWord) {
                                return name;
                              }
                            }
                            return getDisplaySport(workout);
                          })()}
                          {workout.workout_status === 'planned' && (
                            <span className="text-xs ml-2 text-muted-foreground">(planned)</span>
                          )}
                          {workout.workout_status === 'completed' && (
                            <span className={`ml-2 ${getDisciplineCheckmarkColor(workout.type || workout.workout_type || '')}`}>✓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {workout.workout_status === 'planned' && (() => {
                            const sec = resolveMovingSeconds(workout);
                            if (Number.isFinite(sec as any) && (sec as number) > 0) {
                              const mins = Math.round((sec as number) / 60);
                              return <span className="text-white font-light">{mins}:00</span>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      
                      {/* Metrics Row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {formatRichWorkoutDisplay(workout).metrics.map((metric: any, index: number) => (
                          <span key={index}>{typeof metric === 'string' ? metric : (metric && typeof metric.value === 'string' ? metric.value : '')}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default TodaysEffort;