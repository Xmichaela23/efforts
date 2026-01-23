import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useWeather } from '@/hooks/useWeather';
import { useAppContext } from '@/contexts/AppContext';
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { Calendar, Clock, Dumbbell, Activity } from 'lucide-react';
import { getDisciplineColor, getDisciplinePillClasses, getDisciplineCheckmarkColor } from '@/lib/utils';
import { getDisciplineGlowColor, getDisciplineTextClass, SPORT_COLORS, getDisciplineColorRgb, getDisciplineGlowStyle, getDisciplinePhosphorPill, getDisciplinePhosphorCore } from '@/lib/context-utils';
import { resolveMovingSeconds } from '../utils/resolveMovingSeconds';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import WorkoutExecutionView from './WorkoutExecutionView';
import PlannedWorkoutSummary from './PlannedWorkoutSummary';
import { WorkoutExecutionContainer } from './workout-execution';
import { mapUnifiedItemToPlanned, mapUnifiedItemToCompleted } from '@/utils/workout-mappers';
import { useToast } from '@/components/ui/use-toast';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isWatchConnectivityAvailable, sendWorkoutToWatch, convertToWatchWorkout } from '@/services/watchConnectivity';

// Component for expandable workout cards with fixed height
const WorkoutCardExpandable: React.FC<{
  workout: any;
  workoutType: string;
  baselines: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  getDisciplinePhosphorCore: (type: string) => string;
}> = ({ workout, workoutType, baselines, isExpanded, onToggleExpand, getDisciplinePhosphorCore }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpansion, setNeedsExpansion] = useState(false);
  
  // Check if content exceeds fixed height
  useEffect(() => {
    if (contentRef.current && !isExpanded) {
      // Use a small delay to ensure content is rendered
      setTimeout(() => {
        if (contentRef.current) {
          const scrollHeight = contentRef.current.scrollHeight;
          const clientHeight = contentRef.current.clientHeight;
          setNeedsExpansion(scrollHeight > clientHeight + 5); // 5px tolerance
        }
      }, 100);
    } else {
      setNeedsExpansion(false);
    }
  }, [isExpanded, workout]);
  
  return (
    <div className="space-y-1">
      <div
        ref={contentRef}
        style={{
          maxHeight: isExpanded ? 'none' : '120px', // Fixed height when collapsed
          overflow: isExpanded ? 'visible' : 'hidden',
          position: 'relative',
          transition: 'max-height 0.3s ease-out',
        }}
      >
        <PlannedWorkoutSummary workout={workout} baselines={baselines} hideLines={false} />
        {/* Fade gradient when collapsed and content overflows */}
        {!isExpanded && needsExpansion && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '40px',
              background: 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.9))',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {(needsExpansion || isExpanded) && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpand();
          }}
          className="text-xs font-light mt-1 w-full text-left"
          style={{ 
            color: getDisciplinePhosphorCore(workoutType),
            opacity: 0.7,
            cursor: 'pointer',
          }}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};

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
  const [selectedPlannedWorkout, setSelectedPlannedWorkout] = useState<any | null>(null);
  const [executingWorkout, setExecutingWorkout] = useState<any | null>(null);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());

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

  // Format week range for "Week of" header
  const formatWeekRange = (start: Date, end: Date) => {
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    
    if (sameMonth && sameYear) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}`;
    } else if (sameYear) {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
    } else {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
    }
  };

  const handleWeekNav = (direction: 'prev' | 'next') => {
    const newDate = direction === 'prev' 
      ? addDays(weekStart, -7) 
      : addDays(weekEnd, 1);
    // Dispatch event for AppLayout to update selectedDate
    window.dispatchEvent(new CustomEvent('week:navigate', { detail: { date: toDateOnlyString(newDate) } }));
  };

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
  const [sendingToWatch, setSendingToWatch] = useState<string | null>(null);
  const [watchAvailable, setWatchAvailable] = useState(false);
  
  // Check if Apple Watch is available (on iOS native app)
  useEffect(() => {
    isWatchConnectivityAvailable().then(setWatchAvailable);
  }, []);
  
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
  
  // Check if workout can be executed on phone (run or ride only for now)
  const isPhoneExecutable = (type: string) => {
    const t = (type || '').toLowerCase();
    return ['run', 'ride', 'bike', 'cycling'].includes(t);
  };
  
  // Mark workout as complete - creates workout record like imported/hooked workouts
  const handleMarkComplete = async (workout: any) => {
    try {
      setMarkingComplete(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Error', description: 'Please log in to mark workout as complete', variant: 'destructive' });
        return;
      }
      
      const workoutType = (workout.type || workout.workout_type || '').toLowerCase();
      const isRun = ['run', 'running', 'walk'].includes(workoutType);
      const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
      
      // Only create workout record for run/ride (these trigger RPE popup)
      if (isRun || isRide) {
        // Get duration from planned workout (in minutes)
        const durationMinutes = workout.duration || workout.computed?.total_duration_seconds 
          ? Math.round((workout.computed?.total_duration_seconds || 0) / 60) || workout.duration || 30
          : 30;
        
        // Create workout record in workouts table (like imported/hooked workouts)
        const workoutData: any = {
          user_id: user.id,
          type: workoutType,
          date: workout.date || activeDate,
          workout_status: 'completed',
          name: workout.name || workout.rendered_description || workout.description || `${workoutType} workout`,
          
          // Basic metrics (minimal since no actual workout data)
          duration: durationMinutes,
          moving_time: durationMinutes,
          elapsed_time: durationMinutes,
          
          // Link to planned workout
          planned_id: workout.id,
          
          // Provider info
          provider: 'manual',
          completedmanually: true,
          
          // Analysis status
          analysis_status: 'pending',
        };
        
        // Insert workout record
        const { data: createdWorkout, error: insertError } = await supabase
          .from('workouts')
          .insert(workoutData)
          .select('id')
          .single();
        
        if (insertError) {
          console.error('Error creating workout:', insertError);
          toast({ title: 'Error', description: `Failed to create workout: ${insertError.message}`, variant: 'destructive' });
          return;
        }
        
        // Also update planned_workouts status
        const { error: updateError } = await supabase
          .from('planned_workouts')
          .update({ workout_status: 'completed' })
          .eq('id', workout.id)
          .eq('user_id', user.id);
        
        if (updateError) {
          console.error('Error updating planned workout:', updateError);
          // Don't fail the whole operation if this fails
        }
        
        toast({ title: 'Workout marked as complete', variant: 'success' });
        setSelectedPlannedWorkout(null);
        
        // Refresh the view - the RPE popup will appear via realtime subscription
        try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
        try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
        try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
      } else {
        // For non-run/ride workouts, just update planned_workouts status
        const { error } = await supabase
          .from('planned_workouts')
          .update({ workout_status: 'completed' })
          .eq('id', workout.id)
          .eq('user_id', user.id);
        
        if (error) {
          toast({ title: 'Error', description: `Failed to mark as complete: ${error.message}`, variant: 'destructive' });
        } else {
          toast({ title: 'Workout marked as complete', variant: 'success' });
          setSelectedPlannedWorkout(null);
          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
          try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
        }
      }
    } catch (err) {
      console.error('Error marking workout as complete:', err);
      toast({ title: 'Error', description: 'Failed to mark workout as complete', variant: 'destructive' });
    } finally {
      setMarkingComplete(false);
    }
  };
  
  // Send workout to Apple Watch
  const handleSendToWatch = async (e: React.MouseEvent, workout: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      setSendingToWatch(workout.id);
      
      const workoutType = ['ride', 'bike', 'cycling'].includes((workout.type || workout.workout_type || '').toLowerCase()) ? 'ride' : 'run';
      const watchWorkout = convertToWatchWorkout(
        workout.id,
        workout.rendered_description || workout.description || workout.name || 'Workout',
        workoutType,
        workout.computed || { steps: [], total_duration_seconds: 0 }
      );
      
      const sent = await sendWorkoutToWatch(watchWorkout);
      
      if (sent) {
        toast({ title: 'Sent!', description: 'Workout sent to Apple Watch' });
        setSelectedPlannedWorkout(null);
      } else {
        toast({ title: 'Error', description: 'Failed to send to Apple Watch', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to send to Apple Watch', variant: 'destructive' });
    } finally {
      setSendingToWatch(null);
    }
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
        // Strength: show clean summary (exercise count + total volume)
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
        
        if (exercises.length > 0) {
          // Calculate total volume (sets × reps × weight)
          let totalVolume = 0;
          let totalSets = 0;
          exercises.forEach(ex => {
            const sets = ex.sets || [];
            totalSets += sets.length;
            sets.forEach((s: any) => {
              const reps = Number(s?.reps) || 0;
              const weight = Number(s?.weight) || 0;
              if (reps > 0 && weight > 0) {
                totalVolume += reps * weight;
              }
            });
          });
          
          const metrics: any[] = [];
          metrics.push({ icon: Dumbbell, value: `${exercises.length} exercises` });
          if (totalSets > 0) {
            metrics.push({ icon: Activity, value: `${totalSets} sets` });
          }
          if (totalVolume > 0) {
            const volumeK = totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : `${totalVolume}`;
            metrics.push({ icon: Activity, value: `${volumeK} lb` });
          }
          return metrics;
        }

        return [{ icon: Dumbbell, value: 'No exercises' }];
      } else if (workout.type === 'mobility') {
        // Mobility: show clean summary (exercise count + duration)
        const parseList = (src:any): any[] => {
          if (Array.isArray(src)) return src;
          if (typeof src === 'string') { try { const p = JSON.parse(src); return Array.isArray(p) ? p : []; } catch { return []; } }
          return [];
        };
        const items = parseList((workout as any)?.mobility_exercises) || parseList((workout as any)?.computed?.mobility_exercises);
        if (items.length > 0) {
          const metrics: any[] = [];
          metrics.push({ icon: Dumbbell, value: `${items.length} exercises` });
          
          // Calculate total sets if available
          let totalSets = 0;
          items.forEach((it: any) => {
            const dur = String(it?.duration || '');
            const m = dur.match(/(\d+)\s*[x×]/i);
            if (m) totalSets += parseInt(m[1], 10);
            else totalSets += 1; // Default 1 set if not specified
          });
          if (totalSets > 0) {
            metrics.push({ icon: Activity, value: `${totalSets} sets` });
          }
          
          return metrics;
        }
        return [{ icon: Dumbbell, value: 'No exercises' }];
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
  // Also detect indoor/treadmill runs from trainer flag or missing GPS
  const getDisplaySport = (workout: any): string => {
    const type = String(workout?.type || '').toLowerCase();
    const provider = workout?.strava_data?.original_activity?.sport_type
      || workout?.provider_sport
      || '';
    
    // Check for indoor/treadmill indicators - must be STABLE to avoid UI flicker
    const isTrainer = workout?.strava_data?.original_activity?.trainer === true;
    // Check GPS data - handle both array and JSON string formats
    const gpsTrack = workout?.gps_track;
    const hasGpsTrack = (Array.isArray(gpsTrack) && gpsTrack.length > 0) || 
                        (typeof gpsTrack === 'string' && gpsTrack.length > 10);
    // Check start position as fallback indicator
    const hasStartPosition = Number.isFinite(workout?.start_position_lat) && 
                             workout?.start_position_lat !== 0;
    // Only classify as indoor if we're sure: trainer flag OR (gps_track explicitly empty AND no start position)
    const isConfirmedIndoor = isTrainer || 
                              (Array.isArray(gpsTrack) && gpsTrack.length === 0 && !hasStartPosition);
    const isIndoorRun = (type === 'run' || type === 'walk') && isConfirmedIndoor;

    // For indoor runs, return "Indoor Run" or "Treadmill"
    if (isIndoorRun && type === 'run') {
      return isTrainer ? 'Treadmill' : 'Indoor Run';
    }
    if (isIndoorRun && type === 'walk') {
      return 'Indoor Walk';
    }

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

  return (
    <div className="w-full h-full flex flex-col" style={{fontFamily: 'Inter, sans-serif', position:'relative', overflow: 'hidden', zIndex: 0}}>
      {/* Scrollable container for Today panel */}
      <div 
        ref={scrollRef}
        className="scrollbar-hide flex flex-col h-full"
        style={{ 
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Today Panel Header - Live instrument cockpit (sticky, raised, glowing) */}
        <div 
          ref={headerRef}
          className="mb-3 flex-shrink-0" 
          style={{ 
            position: 'sticky',
            top: 0,
            zIndex: 20,
            // Raised panel with subtle elevation and glow field - solid background
            background: 'radial-gradient(ellipse at center top, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.9) 100%)',
            border: '0.5px solid rgba(255, 255, 255, 0.08)', // Slightly brighter border for panel definition
            borderRadius: '12px', // Rounded corners for mounted instrument feel
            padding: '0.75rem 1rem', // More padding for panel breathing room
            // Panel depth: raised above background with glow field
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.04) inset,
              0 2px 8px rgba(0,0,0,0.5),
              0 0 20px rgba(255, 240, 200, 0.08),
              0 0 40px rgba(255, 240, 200, 0.04)
            `, // Inner stroke + depth + warm glow field
            marginLeft: '-0.5rem',
            marginRight: '-0.5rem',
          }}
        >
          <div className="space-y-1">
            {/* Line 1: Date - Live channel (brightest, energized, more phosphor) */}
            <div>
              <span 
                className="text-sm font-light tracking-wide" 
                style={{ 
                  color: 'rgba(255, 255, 255, 1.0)', // Maximum brightness - primary instrument readout
                  textShadow: '0 0 3px rgba(255, 240, 200, 0.25), 0 0 6px rgba(255, 240, 200, 0.15), 0 0 2px rgba(255, 255, 255, 0.2)', // Stronger backlit LCD glow with warm phosphor
                }}
              >
                {formatDisplayDate(activeDate)}
              </span>
            </div>

            {/* Line 2: Weather + Location - Visible but secondary */}
            {(weather || cityName) && (
              <div className="flex items-center gap-1 flex-wrap">
                {weather && isTodayDate && (
                  <span className="text-xs font-light tracking-normal" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                    {Math.round(weather.temperature)}°F {weather.condition}
                    {typeof weather.daily_high === 'number' ? ` • High ${Math.round(weather.daily_high)}°` : ''}
                    {weather.sunrise && weather.sunset ? (()=>{ 
                      try { 
                        const fmt = (iso: string) => { 
                          const d = new Date(iso); 
                          return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }).replace(/\s?AM|\s?PM/i, (m) => m.trim().toLowerCase()); 
                        }; 
                        return ` • ${fmt(weather.sunrise)}/${fmt(weather.sunset)}`; 
                      } catch { 
                        return ''; 
                      }
                    })() : ''}
                  </span>
                )}
                {/* City name from geolocation (show for any date if available) */}
                {cityName && (
                  <span className="text-xs font-light tracking-normal" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                    {weather && isTodayDate ? ' • ' : ''}{cityName}
                  </span>
                )}
              </div>
            )}

            {/* Line 3: Week + Focus + Event - Yellow (run plan), dimmer than Today */}
            {trainingPlanContext && (trainingPlanContext.currentWeek || trainingPlanContext.focus || (trainingPlanContext.raceDate && trainingPlanContext.weeksToRace)) && (
              <div className="text-xs font-extralight tracking-normal" style={{ color: getDisciplinePhosphorCore('run'), opacity: 0.65 }}>
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
                  <span className="font-light" style={{ 
                    opacity: 0.8 // Slightly less bright than "Today" - yellow but dimmer
                  }}>
                    {trainingPlanContext.weeksToRace} {trainingPlanContext.weeksToRace === 1 ? 'wk' : 'wks'} till {trainingPlanContext.raceName || 'race'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="px-3" style={{ paddingBottom: hasExpandedWorkout ? 120 : 56 }}>
        {displayWorkouts.length === 0 ? (
          // Empty state - show "Rest" if there's an active plan, otherwise "No effort"
          <div className="flex items-center justify-center h-full px-4">
            <p className="text-center text-lg font-medium italic" style={{ color: 'rgba(255, 255, 255, 0.25)' }}>
              {trainingPlanContext
                ? 'Rest'
                : isPastDate
                  ? 'No effort logged'
                  : 'No effort scheduled'
              }
            </p>
          </div>
        ) : (
          // Compact workout display - vertical list (reverted)
          <div className="">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {displayWorkouts.map((workout) => {
                const workoutType = workout.type || workout.workout_type || '';
                const isCompleted = workout.workout_status === 'completed';
                // Today's workouts: completed = 'done' (filled), not completed = 'week' (empty border, no fill)
                // This matches calendar behavior - empty border when not completed
                const glowState: 'idle' | 'week' | 'done' | 'active' = isCompleted ? 'done' : 'week';
                const phosphorPill = getDisciplinePhosphorPill(workoutType, glowState);
                
                const workoutId = workout.id || String(workout.workout_status === 'planned' ? workout.workout_id : workout.id);
                const isExpanded = expandedWorkouts.has(workoutId);
                
                const toggleExpand = () => {
                  setExpandedWorkouts(prev => {
                    const next = new Set(prev);
                    if (isExpanded) {
                      next.delete(workoutId);
                    } else {
                      next.add(workoutId);
                    }
                    return next;
                  });
                };
                
                return (
                <div
                  key={workout.id}
                  className={`w-full text-left transition-all backdrop-blur-lg ${phosphorPill.className}`}
                  style={{
                    ...phosphorPill.style,
                    borderRadius: '4px', // More rectangular - tighter radius for label strips
                    padding: '0.5rem 0.75rem', // Reduced height - tighter vertical padding
                    // Inset stroke for mounted/cut-into-panel feel
                    boxShadow: phosphorPill.style.boxShadow 
                      ? `${phosphorPill.style.boxShadow}, 0 0 0 0.5px rgba(255, 255, 255, 0.08) inset`
                      : '0 0 0 0.5px rgba(255, 255, 255, 0.08) inset',
                    // Reduce outer border dominance - lighter border for less "floating bubble" feel
                    borderColor: phosphorPill.style.borderColor ? 
                      (typeof phosphorPill.style.borderColor === 'string' && phosphorPill.style.borderColor.includes('rgba') ?
                        (() => {
                          const rgbaMatch = phosphorPill.style.borderColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                          if (rgbaMatch) {
                            const [, r, g, b, alpha] = rgbaMatch;
                            const newAlpha = Math.max(0.12, parseFloat(alpha) * 0.6);
                            return `rgba(${r}, ${g}, ${b}, ${newAlpha})`;
                          }
                          return phosphorPill.style.borderColor;
                        })() : phosphorPill.style.borderColor) : undefined,
                    borderWidth: '0.5px', // Thinner border for less dominance
                    marginBottom: '0.25rem', // Tight spacing between chips
                  }}
                >
                  {/* Planned: show workout details with fixed height and expand */}
                  {workout.workout_status === 'planned' ? (
                    <WorkoutCardExpandable
                      workout={workout}
                      workoutType={workoutType}
                      baselines={baselines}
                      isExpanded={isExpanded}
                      onToggleExpand={toggleExpand}
                      getDisciplinePhosphorCore={getDisciplinePhosphorCore}
                    />
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
                        <div className="font-light tracking-normal text-base" style={{ color: getDisciplinePhosphorCore(workoutType) }}>
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
                            <span 
                              className="ml-2"
                              style={{
                                // Checkmarks use primary white text color - status indicator, not category
                                color: 'rgba(245, 245, 245, 0.9)', // Primary white text color (--text-active)
                                // No glow - checkmarks read as status, not category
                              }}
                            >✓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {workout.workout_status === 'planned' && (() => {
                            const sec = resolveMovingSeconds(workout);
                            if (Number.isFinite(sec as any) && (sec as number) > 0) {
                              const mins = Math.round((sec as number) / 60);
                              return <span className="font-light tabular-nums" style={{
                                color: 'rgba(255, 255, 255, 0.85)'
                              }}>{mins}:00</span>;
                            }
                            return null;
                          })()}
                          {/* Source attribution - only for completed runs/rides/swims */}
                          {workout.workout_status === 'completed' && (() => {
                            const type = String(workout?.type || '').toLowerCase();
                            const isRunRideSwim = type === 'run' || type === 'running' || type === 'ride' || type === 'cycling' || type === 'bike' || type === 'swim' || type === 'swimming';
                            if (!isRunRideSwim) return null;
                            
                            const source = (workout as any)?.source;
                            const isStravaImported = (workout as any)?.is_strava_imported;
                            const stravaId = (workout as any)?.strava_activity_id;
                            const garminId = (workout as any)?.garmin_activity_id;
                            const deviceInfo = (() => {
                              try {
                                const di = (workout as any)?.device_info || (workout as any)?.deviceInfo;
                                if (typeof di === 'string') return JSON.parse(di);
                                return di;
                              } catch { return null; }
                            })();
                            const rawDeviceName = deviceInfo?.device_name || deviceInfo?.deviceName || deviceInfo?.product;
                            const deviceName = rawDeviceName?.replace(/^Garmin\s+/i, '');

                            if (source === 'strava' || stravaId || isStravaImported) {
                              return (
                                <div className="flex items-center gap-1 ml-2">
                                  <img 
                                    src="/icons/strava-powered-by.svg" 
                                    alt="Powered by Strava" 
                                    className="h-2"
                                  />
                                  {deviceName && (
                                    <span className="text-gray-400 text-[10px] leading-tight">via {deviceName}</span>
                                  )}
                                </div>
                              );
                            }

                            if (source === 'garmin' || garminId) {
                              return (
                                <div className="flex items-center gap-0.5 ml-2">
                                  <span className="text-gray-400 text-[10px] leading-tight">via</span>
                                  <svg width="5" height="6" viewBox="0 0 10 12" className="flex-shrink-0">
                                    <polygon points="5,0 10,10 0,10" fill="#007CC3"/>
                                  </svg>
                                  <span className="text-[#007CC3] font-light text-[10px] leading-tight">Garmin</span>
                                  {deviceName && <span className="text-gray-400 text-[10px] leading-tight"> {deviceName}</span>}
                                </div>
                              );
                            }

                            return null;
                          })()}
                        </div>
                      </div>
                      
                      {/* Metrics Row */}
                      <div className="flex items-center gap-3 text-sm text-muted-foreground font-light">
                        {formatRichWorkoutDisplay(workout).metrics.map((metric: any, index: number) => (
                          <span key={index}>{typeof metric === 'string' ? metric : (metric && typeof metric.value === 'string' ? metric.value : '')}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
        </div>

      {/* Planned Workout Bottom Sheet */}
      <Drawer open={!!selectedPlannedWorkout} onOpenChange={(open) => !open && setSelectedPlannedWorkout(null)}>
        <DrawerContent 
          className="bg-black/90 backdrop-blur-xl border-white/20"
          style={{ maxHeight: '85vh' }}
        >
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-white font-light tracking-wide text-lg">
              {(() => {
                const w = selectedPlannedWorkout;
                if (!w) return 'Planned Workout';
                const type = String(w.type || w.workout_type || '').toLowerCase();
                const name = w.name || w.title || '';
                if (name && name.toLowerCase() !== type) return name;
                return type.charAt(0).toUpperCase() + type.slice(1);
              })()}
            </DrawerTitle>
            <DrawerDescription className="text-white/60 font-light">
              {(() => {
                const desc = selectedPlannedWorkout?.rendered_description || selectedPlannedWorkout?.description || 'No description available';
                if (/strides/i.test(desc)) {
                  const parts = desc.split(/(strides)/i);
                  return (
                    <span>
                      {parts.map((part, idx) => {
                        if (/^strides$/i.test(part)) {
                          return (
                            <TooltipProvider key={idx}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="underline decoration-dotted cursor-help">{part}</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-sm p-3 bg-gray-800 text-white border border-gray-700 rounded-lg shadow-lg">
                                  <p className="font-semibold mb-1">What are Strides?</p>
                                  <p>Short, controlled accelerations (approx. 100m) designed to wake up your legs. Reach 95% of max speed while staying completely relaxed. This is not a sprint.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        }
                        return <span key={idx}>{part}</span>;
                      })}
                    </span>
                  );
                }
                return desc;
              })()}
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '50vh' }}>
            {selectedPlannedWorkout && (
              <PlannedWorkoutSummary 
                workout={selectedPlannedWorkout} 
                baselines={baselines as any} 
                hideLines={false} 
              />
            )}
          </div>

          <DrawerFooter className="border-t border-white/10 pt-4">
            <div className="flex flex-col gap-3 w-full">
              {/* Top row: Start on Phone and Send to Garmin - side by side with yellow outlines */}
              <div className="flex gap-2 w-full">
                {selectedPlannedWorkout && isPhoneExecutable(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '') && (() => {
                  const workoutType = (selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                  const isRun = ['run', 'running', 'walk'].includes(workoutType);
                  const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
                  const sportColor = isRun ? SPORT_COLORS.run : (isRide ? SPORT_COLORS.ride : SPORT_COLORS.run); // default to run color
                  const rgb = getDisciplineColorRgb(isRun ? 'run' : (isRide ? 'ride' : 'run'));
                  
                  return (
                    <button
                      className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                      style={{
                        backgroundColor: 'transparent',
                        borderColor: sportColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() => {
                        setExecutingWorkout(selectedPlannedWorkout);
                        setSelectedPlannedWorkout(null);
                      }}
                    >
                      Start on Phone
                    </button>
                  );
                })()}
                
                {selectedPlannedWorkout && isEnduranceType(selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '') && (() => {
                  const workoutType = (selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                  const isRun = ['run', 'running', 'walk'].includes(workoutType);
                  const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
                  const sportColor = isRun ? SPORT_COLORS.run : (isRide ? SPORT_COLORS.ride : SPORT_COLORS.run); // default to run color
                  const rgb = getDisciplineColorRgb(isRun ? 'run' : (isRide ? 'ride' : 'run'));
                  
                  return (
                    <button
                      className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                      style={{
                        backgroundColor: 'transparent',
                        borderColor: sportColor,
                        borderWidth: '1px',
                        borderStyle: 'solid',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={(e) => {
                        handleSendToGarmin(e, selectedPlannedWorkout);
                      }}
                    >
                      {sendingToGarmin === selectedPlannedWorkout?.id ? 'Sending...' : 'Send to Garmin'}
                    </button>
                  );
                })()}
              </div>
              
              {/* Bottom row: Mark as Complete and Close - evenly spaced with yellow outlines */}
              <div className="flex gap-2 w-full">
                {selectedPlannedWorkout && (() => {
                  const workoutType = (selectedPlannedWorkout.type || selectedPlannedWorkout.workout_type || '').toLowerCase();
                  const isRun = ['run', 'running', 'walk'].includes(workoutType);
                  const isRide = ['ride', 'bike', 'cycling'].includes(workoutType);
                  const sportColor = isRun ? SPORT_COLORS.run : (isRide ? SPORT_COLORS.ride : SPORT_COLORS.run);
                  const rgb = getDisciplineColorRgb(isRun ? 'run' : (isRide ? 'ride' : 'run'));
                  
                  return (
                    <>
                      <button
                        className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                        style={{
                          backgroundColor: 'transparent',
                          borderColor: sportColor,
                          borderWidth: '1px',
                          borderStyle: 'solid',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => handleMarkComplete(selectedPlannedWorkout)}
                        disabled={markingComplete}
                      >
                        {markingComplete ? 'Marking...' : 'Mark as Complete'}
                      </button>
                      <button
                        className="flex-1 px-4 py-3 rounded-xl font-medium tracking-wide transition-all backdrop-blur-md text-white border"
                        style={{
                          backgroundColor: 'transparent',
                          borderColor: sportColor,
                          borderWidth: '1px',
                          borderStyle: 'solid',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `rgba(${rgb}, 0.15)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => setSelectedPlannedWorkout(null)}
                      >
                        Close
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      
      {/* Workout Execution Modal - Rendered via Portal to avoid z-index conflicts */}
      {executingWorkout && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black">
          <WorkoutExecutionContainer
            plannedWorkoutId={executingWorkout.id}
            plannedWorkoutStructure={executingWorkout.computed || { steps: [], total_duration_seconds: 0 }}
            workoutType={['ride', 'bike', 'cycling'].includes((executingWorkout.type || executingWorkout.workout_type || '').toLowerCase()) ? 'ride' : 'run'}
            workoutDescription={executingWorkout.rendered_description || executingWorkout.description || executingWorkout.name}
            onClose={() => setExecutingWorkout(null)}
            onComplete={(workoutId) => {
              setExecutingWorkout(null);
              // Refresh the view
              window.dispatchEvent(new CustomEvent('workouts:invalidate'));
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default TodaysEffort;