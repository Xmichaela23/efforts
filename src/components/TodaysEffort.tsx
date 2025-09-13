import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { Calendar, Clock, Dumbbell } from 'lucide-react';
import { getDisciplineColor } from '@/lib/utils';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import WorkoutExecutionView from './WorkoutExecutionView';

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
  const { plannedWorkouts, loading: plannedLoading } = usePlannedWorkouts();
  const [displayWorkouts, setDisplayWorkouts] = useState<any[]>([]);
  const [baselines, setBaselines] = useState<any | null>(null);

  // 🔧 FIXED: Use Pacific timezone for date calculations to avoid timezone issues
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const activeDate = selectedDate || today;

  const dateWorkoutsMemo = useMemo(() => {
    // Show only planned rows from planned_workouts; completed planned rows are hidden
    const plannedOnly = (plannedWorkouts || []).filter((w:any)=> String(w.workout_status||'').toLowerCase()==='planned');
    const allWorkouts = [...(workouts || []), ...plannedOnly];
    // Filter by date
    const sameDate = allWorkouts.filter((w: any) => w.date === activeDate);
    // De‑dupe by type/date: prefer completed workout over planned
    const byKey = new Map<string, any>();
    for (const w of sameDate) {
      const key = `${String(w.type||'').toLowerCase()}|${w.date}`;
      const isCompleted = String(w.workout_status||w.status||'').toLowerCase()==='completed';
      // If this is a planned row that is incorrectly marked completed (no matching completed workout in state), coerce to planned
      if (!isCompleted && Array.isArray((w as any).steps_preset)) {
        (w as any).workout_status = 'planned';
      }
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, w); continue; }
      const existingCompleted = String(existing.workout_status||existing.status||'').toLowerCase()==='completed';
      // Prefer completed over planned; if both completed (provider + DB), keep the DB one
      if (isCompleted && !existingCompleted) { byKey.set(key, w); continue; }
      if (isCompleted && existingCompleted) {
        const preferExistingDb = !(String((w?.id||'')).startsWith('garmin_') || String((w?.id||'')).startsWith('strava_'));
        if (preferExistingDb) byKey.set(key, w);
      }
    }
    return Array.from(byKey.values());
  }, [workouts, plannedWorkouts, activeDate]);

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
    const duration = workout.duration ? formatDuration(workout.duration) : 'N/A';
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
            const exerciseName = ex.name || '';
            const sets = ex.sets?.length || 0;
            const avgReps = ex.sets?.reduce((total, set) => total + (set.reps || 0), 0) / sets || 0;
            
            // Get weight range from all sets
            let weightRange = '0lbs';
            if (ex.sets && ex.sets.length > 0) {
              const weights = ex.sets.map(set => set.weight || 0).filter(w => w > 0);
              if (weights.length > 0) {
                const minWeight = Math.min(...weights);
                const maxWeight = Math.max(...weights);
                if (minWeight === maxWeight) {
                  weightRange = `${minWeight}lbs`;
                } else {
                  weightRange = `${minWeight}-${maxWeight}lbs`;
                }
              }
            }
            
            // Create exercise abbreviation
            let abbreviation = '';
            if (exerciseName.toLowerCase().includes('overhead press')) abbreviation = 'OHP';
            else if (exerciseName.toLowerCase().includes('bench press')) abbreviation = 'BP';
            else if (exerciseName.toLowerCase().includes('deadlift')) abbreviation = 'DL';
            else if (exerciseName.toLowerCase().includes('squat')) abbreviation = 'SQ';
            else if (exerciseName.toLowerCase().includes('row')) abbreviation = 'ROW';
            else if (exerciseName.toLowerCase().includes('curl')) abbreviation = 'CURL';
            else {
              // Take first letter of each word
              abbreviation = exerciseName.split(' ').map(word => word[0]).join('').toUpperCase();
            }
            
            return `${abbreviation} ${sets}s ${Math.round(avgReps)}r ${weightRange}`;
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
        
                      // Handle pace/speed using transformed data from useWorkouts
              let paceSpeed = 'N/A';
              // useWorkouts.ts transforms: duration_seconds → duration (minutes), distance_meters → distance (km)
              const distanceKm = computeDistanceKm(workout) ?? Number(workout.distance);
              const durationMinutes = Number(workout.duration);
              const avgSpeedMps = Number(workout.avg_speed_mps);
              
              if (isRun && distanceKm && durationMinutes && distanceKm > 0 && durationMinutes > 0) {
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



  if (loading || plannedLoading) {
    return (
      <div className="w-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{fontFamily: 'Inter, sans-serif', height: 'var(--todays-h)'}}>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  // (Reverted) no horizontal scroll state

  return (
    <div className="w-full flex-shrink-0 flex flex-col overflow-hidden" style={{fontFamily: 'Inter, sans-serif', height: 'var(--todays-h)'}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {formatDisplayDate(activeDate)}
          </span>
          {/* Show effort count inline */}
          {displayWorkouts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              · {displayWorkouts.length} effort{displayWorkouts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Content area - scrolls vertically (reverted) */}
      <div className="flex-1 overflow-auto overscroll-contain scrollbar-hide">
        <div className="px-3 pb-2">
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
                  {true ? (
                    <div className="space-y-1">
                      {/* Title and Duration Row */}
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-base text-gray-900">
                          {(() => {
                            const type = String(workout.type || '').toLowerCase();
                            const desc = String(workout.rendered_description || workout.description || '').toLowerCase();
                            const steps = Array.isArray((workout as any).steps_preset) ? (workout as any).steps_preset : [];
                            if (type === 'strength') {
                              if (/squat|deadlift|bench|ohp/.test(desc)) return 'Strength — Compounds';
                              if (/chin|row|pull|lunge|accessor/i.test(desc)) return 'Strength — Accessory';
                              if (/core/.test(desc)) return 'Strength — Core';
                              return 'Strength';
                            }
                            if (type === 'run') {
                              const joined = steps.join(' ').toLowerCase();
                              if (/longrun_/.test(joined) || /\blong\b/.test(desc)) return 'Run — Long';
                              if (/tempo/.test(desc)) return 'Run — Tempo';
                              if (/(intervals?)/.test(desc) || /(\d+)\s*[x×]\s*(\d+)/.test(desc)) return 'Run — Intervals';
                              return 'Run';
                            }
                            if (type === 'ride') {
                              const joined = steps.join(' ').toLowerCase();
                              if (/bike_vo2_/.test(joined) || /vo2/.test(desc)) return 'Ride — VO2';
                              if (/bike_thr_/.test(joined) || /threshold/.test(desc)) return 'Ride — Threshold';
                              if (/bike_ss_/.test(joined) || /sweet\s*spot|\bss\b/.test(desc)) return 'Ride — Sweet Spot';
                              if (/bike_endurance_/.test(joined) || /endurance|z2/.test(desc)) return 'Ride — Endurance';
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
                          <span className="text-muted-foreground">{formatRichWorkoutDisplay(workout).duration}</span>
                        </div>
                      </div>
                      {/* Grouped description only */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{stripCodes(workout.rendered_description || workout.description)}</span>
                      </div>
                    </div>
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
                          {/* status glyphs removed for cleaner layout */}
                          <span className="text-muted-foreground">
                            {(() => {
                              const base = formatRichWorkoutDisplay(workout).duration;
                              if (workout.workout_status !== 'planned') return base;
                              // Prefer computed.total_duration_seconds if present
                              try {
                                const comp: any = (workout as any).computed || null;
                                let secs: any = comp ? comp.total_duration_seconds : null;
                                if (typeof secs === 'string') secs = parseInt(secs, 10);
                                if (typeof secs === 'number' && isFinite(secs) && secs > 0) {
                                  const mins = Math.round(secs / 60);
                                  if (mins < 60) return `${mins}min`;
                                  const h = Math.floor(mins / 60); const m = mins % 60;
                                  return m ? `${h}h ${m}min` : `${h}h`;
                                }
                              } catch {}
                              // Else compute via normalizer
                              return base;
                            })()}
                          </span>
                          {(() => {
                            // Show computed status chip
                            try {
                              const comp: any = (workout as any).computed || null;
                              const ok = comp && Number(comp.total_duration_seconds) > 0 && Array.isArray(comp.steps) && comp.steps.length > 0;
                              return (
                                <span className={`px-1.5 py-0.5 rounded border text-[10px] ${ok ? 'text-green-700 border-green-300 bg-green-50' : 'text-red-700 border-red-300 bg-red-50'}`}>
                                  {ok ? 'v2 OK' : 'MISSING'}
                                </span>
                              );
                            } catch { return null; }
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
                </button>
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