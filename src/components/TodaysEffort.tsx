import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWeather } from '@/hooks/useWeather';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkoutsToday } from '@/hooks/usePlannedWorkouts';
import { Calendar, Clock, Dumbbell } from 'lucide-react';
import { getDisciplineColor } from '@/lib/utils';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import WorkoutExecutionView from './WorkoutExecutionView';
import PlannedWorkoutSummary from './PlannedWorkoutSummary';

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [showFade, setShowFade] = useState(true);

  // 🔧 FIXED: Use Pacific timezone for date calculations to avoid timezone issues
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const activeDate = selectedDate || today;

  // Fast planned lookup for Today to avoid heavy payloads
  const { plannedToday, loading: plannedTodayLoading } = usePlannedWorkoutsToday(activeDate);

  // No persistence: we will use ephemeral geolocation below for today's weather

  const { weather } = useWeather({
    lat: dayLoc?.lat,
    lng: dayLoc?.lng,
    timestamp: `${activeDate}T12:00:00`,
    enabled: !!dayLoc,
  });

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

  // Toggle bottom fade only when not at bottom using IntersectionObserver sentinel
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      // If sentinel is visible within scroll container, we are at/near bottom → hide fade
      setShowFade(!entry.isIntersecting);
    }, { root, threshold: 1.0 });
    io.observe(sentinel);
    return () => { try { io.disconnect(); } catch {} };
  }, [scrollRef, sentinelRef]);

  const dateWorkoutsMemo = useMemo(() => {
    // Include today's planned rows and all completed rows
    const plannedSource = (plannedToday || []).filter((w:any)=> String(w.workout_status||'').toLowerCase()==='planned');
    const all = [...(workouts || []), ...plannedSource].filter((w:any)=> w.date === activeDate);
    const completed = all.filter((w:any)=> String(w.workout_status||w.status||'').toLowerCase()==='completed');
    const planned = all.filter((w:any)=> String(w.workout_status||w.status||'').toLowerCase()!=='completed');

    // Build set of types that already have a completed workout for the date
    const typeKey = (w:any)=> `${String(w.type||'').toLowerCase()}|${w.date}`;
    const completedTypes = new Set(completed.map(typeKey));

    // Keep planned only if there is no completed of the same type for the date
    const plannedKept = planned.filter((w:any)=> !completedTypes.has(typeKey(w)));

    // Return all completed (including multiples of same type) plus remaining planned
    return [...completed, ...plannedKept];
  }, [workouts, plannedToday, activeDate]);

  // FIXED: React to selectedDate prop changes properly
  useEffect(() => {
    // Split into activated (no 'optional') and optional
    const activated = dateWorkoutsMemo.filter((w:any)=> !(Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional')));
    const optionals = dateWorkoutsMemo.filter((w:any)=> Array.isArray(w?.tags) && w.tags.map((t:string)=>t.toLowerCase()).includes('optional'));
    setDisplayWorkouts([...activated, ...optionals]);
  }, [dateWorkoutsMemo]);
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
    // Remove duration display for strength in Today's Efforts per product request
    const duration = (workout.type === 'strength') ? '' : (workout.duration ? formatDuration(workout.duration) : '');
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
        const exercises = workout.strength_exercises || [];
        
        if (exercises.length > 0) {
          // Create exercise summaries with abbreviations
          const exerciseSummaries = exercises.map(ex => {
            const exerciseName = (ex.name || '').trim();
            const lower = exerciseName.toLowerCase();
            const sets = ex.sets?.length || 0;
            const avgReps = ex.sets?.reduce((total, set) => total + (set.reps || 0), 0) / (sets || 1);

            // Compute weight range across sets
            let weightRange = '0lbs';
            if (Array.isArray(ex.sets) && ex.sets.length > 0) {
              const weights = ex.sets.map((s:any)=> Number(s?.weight || 0)).filter((w:number)=> isFinite(w) && w>0);
              if (weights.length > 0) {
                const minWeight = Math.min(...weights);
                const maxWeight = Math.max(...weights);
                weightRange = (minWeight === maxWeight) ? `${minWeight}lbs` : `${minWeight}-${maxWeight}lbs`;
              } else {
                weightRange = '—';
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
            return `${abbreviation} ${sets}s ${Math.round(avgReps||0)}r ${weightRange}`.trim();
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
      } else {
        // Endurance: distance, pace/speed, heart rate, elevation
        // 🔧 FIXED: Use consistent distance formatting like CompletedTab
        let distance = 'N/A';
        const km = computeDistanceKm(workout);
        if (km && !isNaN(km)) {
          if (useImperial) distance = `${(km * 0.621371).toFixed(1)} mi`;
          else distance = `${km.toFixed(1)} km`;
        }
        
        const isRun = workout.type === 'run' || workout.type === 'walk';
        const isSwim = workout.type === 'swim';
        
                      // Handle pace/speed using transformed data from useWorkouts
              let paceSpeed = 'N/A';
              // useWorkouts.ts transforms: duration_seconds → duration (minutes), distance_meters → distance (km)
              const distanceKm = computeDistanceKm(workout) ?? Number(workout.distance);
              const durationMinutes = Number(workout.duration);
              const avgSpeedMps = Number(workout.avg_speed_mps);
              
              if (isSwim) {
                // Single source of truth: use server-computed overall stats only
                const comp = (workout as any)?.computed?.overall;
                const distM = Number(comp?.distance_m);
                const durS = Number(comp?.duration_s_moving);
                if (Number.isFinite(distM) && distM > 0 && Number.isFinite(durS) && durS > 0) {
                  const preferYards = !!useImperial;
                  const per100 = preferYards
                    ? durS / ((distM / 0.9144) / 100)
                    : durS / (distM / 100);
                  const mm = Math.floor(per100 / 60);
                  const ss = Math.round(per100 % 60);
                  paceSpeed = `${mm}:${String(ss).padStart(2,'0')} ${preferYards ? '/100yd' : '/100m'}`;
                }
              } else if (isRun && distanceKm && durationMinutes && distanceKm > 0 && durationMinutes > 0) {
                // Calculate pace from transformed distance/duration
                const distanceMiles = distanceKm * 0.621371; // Convert km to miles
                const paceMinPerMile = durationMinutes / distanceMiles;
                const minutes = Math.floor(paceMinPerMile);
                const seconds = Math.round((paceMinPerMile - minutes) * 60);
                paceSpeed = `${minutes}:${seconds.toString().padStart(2,'0')}/mi`;
              } else if (avgSpeedMps && avgSpeedMps > 0) {
                // Convert m/s to mph: multiply by 2.237
                const speedMph = avgSpeedMps * 2.237;
                paceSpeed = `${Math.round(speedMph * 10) / 10} mph`;
              }
        
        const heartRate = workout.avg_heart_rate || workout.metrics?.avg_heart_rate;
        const hrDisplay = heartRate && heartRate > 0 ? `${Math.round(heartRate)} bpm` : 'N/A';
        const elevation = workout.elevation_gain || workout.metrics?.elevation_gain;
        const elevationFt = elevation && elevation > 0 ? `${Math.round(elevation * 3.28084)} ft` : 'N/A';

        // For swims, only show distance and average pace
        if (isSwim) return [distance, paceSpeed];
        
        return [distance, paceSpeed, hrDisplay, elevationFt];
      }
    };
    
    return { discipline, duration, metrics: getMetrics() };
  };

  const activateOptional = async (w: any) => {
    try {
      const t: string[] = Array.isArray(w?.tags) ? w.tags : [];
      const next = t.filter((x:string)=> x.toLowerCase() !== 'optional');
      await fetch('/api/activate-optional', { method: 'POST', body: JSON.stringify({ id: w.id, tags: next }) }).catch(()=>{});
      try { const { supabase } = await import('@/lib/supabase'); await supabase.from('planned_workouts').update({ tags: next }).eq('id', w.id); } catch {}
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
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



  const blockLoading = (loading && (!(workouts && workouts.length))) || (plannedTodayLoading && (!(plannedToday && plannedToday.length)));
  if (blockLoading) {
    return (
      <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{fontFamily: 'Inter, sans-serif', height: 'var(--todays-h)'}}>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  // (Reverted) no horizontal scroll state

  return (
    <div className="w-full flex-shrink-0 flex flex-col overflow-hidden" style={{fontFamily: 'Inter, sans-serif', height: 'var(--todays-h)', position:'relative'}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {formatDisplayDate(activeDate)}
          </span>
          {/* Effort count removed for space */}
          {/* Weather chip (explicit-location only) */}
          {weather && (
            <span className="text-xs text-muted-foreground">
              · {Math.round(weather.temperature)}°F {weather.condition}
              {typeof weather.daily_high === 'number' ? ` • High ${Math.round(weather.daily_high)}°` : ''}
              {weather.sunrise && weather.sunset ? (()=>{ try { const fmt=(iso:string)=>{ const d=new Date(iso); return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }).replace(/\s?AM|\s?PM/i, m=> m.trim().toLowerCase()); }; return ` • ${fmt(weather.sunrise)}/${fmt(weather.sunset)}`; } catch { return '';} })() : ''}
            </span>
          )}
        </div>
      </div>

      {/* Content area - scrolls vertically (reverted) */}
      <div ref={scrollRef} className="flex-1 overflow-auto overscroll-contain scrollbar-hide">
        <div className="px-3 pb-2" style={{ paddingBottom: 48 }}>
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
                <button
                  key={workout.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const w: any = { ...workout };
                    if (w.workout_status === 'planned') {
                      w.__preferredTab = 'planned';
                    }
                    onEditEffort && onEditEffort(w);
                  }}
                  className={`w-full text-left p-1.5 rounded-md transition-colors hover:bg-gray-50 ${
                    workout.workout_status === 'completed' 
                      ? 'bg-green-50' 
                      : workout.workout_status === 'planned'
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  {/* Planned: always show grouped description; execution view only on drill-in */}
                  {workout.workout_status === 'planned' ? (
                    <PlannedWorkoutSummary workout={workout} baselines={baselines as any} />
                  ) : (
                    <div className="space-y-1">
                      {/* Title and Duration Row */}
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-base text-gray-900">
                          {(() => {
                            const type = String(workout.type || '').toLowerCase();
                            const desc = String(workout.description || '').toLowerCase();
                            const steps = Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : [];
                            if (type === 'strength') {
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
                            return workout.name || getDisplaySport(workout);
                          })()}
                          {workout.workout_status === 'planned' && (
                            <span className="text-xs ml-2 text-gray-500">(planned)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {/* Duration hidden for completed entries per product decision */}
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
                </button>
              ))}
            </div>
          </div>
        )}
          {/* Bottom sentinel to detect end-of-list */}
          <div ref={sentinelRef} style={{ height: 1 }} />
        </div>
      </div>
      {/* Bottom fade overlay (shown only when not at bottom) */}
      {showFade && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 40,
              pointerEvents: 'none',
              background:
                'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 55%, rgba(255,255,255,1) 100%)',
              boxShadow: 'inset 0 -10px 16px rgba(0,0,0,0.04)'
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 8,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 9999,
                background: 'rgba(255,255,255,0.9)',
                color: 'rgba(0,0,0,0.38)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default TodaysEffort;