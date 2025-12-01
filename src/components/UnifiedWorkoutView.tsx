import React, { useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X, Calendar, ListCollapse, List } from 'lucide-react';
import CompletedTab from './CompletedTab';
import StrengthLogger from './StrengthLogger';
import AssociatePlannedDialog from './AssociatePlannedDialog';
import MobileSummary from './MobileSummary';
import WorkoutDetail from './WorkoutDetail';
import StrengthCompletedView from './StrengthCompletedView';
import StructuredPlannedView from './StructuredPlannedView';
// Unified path only; remove legacy planned_workouts hooks
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { supabase } from '@/lib/supabase';
// ✅ REMOVED: Client-side analysis - server provides all analysis data
import { useWorkoutDetail } from '@/hooks/useWorkoutDetail';
import { mapUnifiedItemToPlanned } from '@/utils/workout-mappers';

// Get unified planned workout data with pace ranges (same as Today's Effort and Weekly)
const getUnifiedPlannedWorkout = (workout: any, isCompleted: boolean, hydratedPlanned: any, linkedPlanned: any) => {
  // For completed workouts, use the linked planned workout
  if (isCompleted && (hydratedPlanned || linkedPlanned)) {
    return hydratedPlanned || linkedPlanned || workout;
  }
  
  // For planned workouts, the workout should already be from unified API with processed data
  // Server-side get-week function now processes paceTarget → pace_range objects
  
  
  return workout;
};


interface UnifiedWorkoutViewProps {
  workout: any;
  onClose: () => void;
  onUpdateWorkout?: (workoutId: string, updates: any) => void;
  onDelete?: (workoutId: string) => void;
  onNavigateToContext?: (workoutId: string) => void;
  initialTab?: 'planned' | 'summary' | 'completed';
  origin?: 'today' | 'weekly' | 'other';
}

const UnifiedWorkoutView: React.FC<UnifiedWorkoutViewProps> = ({
  workout,
  onClose,
  onUpdateWorkout,
  onDelete,
  onNavigateToContext,
  initialTab,
  origin = 'other'
}) => {
  if (!workout) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No workout selected</p>
      </div>
    );
  }

  // plannedWorkouts context removed; rely on server unified data/routes
  const isCompleted = String(workout.workout_status || workout.status || '').toLowerCase() === 'completed';
  const [currentPlannedId, setCurrentPlannedId] = useState<string | null>((workout as any)?.planned_id || null);
  const hasLink = Boolean(currentPlannedId);
  const [activeTab, setActiveTab] = useState<string>(initialTab || (isCompleted ? (hasLink ? 'summary' : 'completed') : 'planned'));
  const [editingInline, setEditingInline] = useState(false);
  const [assocOpen, setAssocOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [linkedPlanned, setLinkedPlanned] = useState<any | null>(null);
  const [hydratedPlanned, setHydratedPlanned] = useState<any | null>(null);
  const [updatedWorkoutData, setUpdatedWorkoutData] = useState<any | null>(null);
  const recomputeGuardRef = useRef<Set<string>>(new Set());
  // Suppress auto re-link fallback briefly after an explicit Unattach
  const suppressRelinkUntil = useRef<number>(0);

  // Unified week data for the workout's date (single-day window)
  const dateIso = String((workout as any)?.date || '').slice(0,10);
  const { items: unifiedItems = [] } = useWeekUnified(dateIso, dateIso);
  
  // Listen for workout invalidation events to refresh data (both singular and plural events)
  useEffect(() => {
    const handleWorkoutInvalidate = async () => {
      if (!isCompleted || !workout?.id) return;
      
      console.log('🔄 [UnifiedWorkoutView] Refreshing workout data after auto-attach or realtime update...');
      try {
        // Fetch the updated workout data from the database
        const { data: refreshedWorkout, error } = await supabase
          .from('workouts')
          .select('*')
          .eq('id', workout.id)
          .single();
        
        if (error) {
          console.error('❌ Failed to refresh workout data:', error);
          return;
        }
        
        if (refreshedWorkout) {
          console.log('✅ [UnifiedWorkoutView] Workout data refreshed, planned_id:', refreshedWorkout.planned_id);
          setUpdatedWorkoutData(refreshedWorkout);
        }
      } catch (error) {
        console.error('❌ Error refreshing workout data:', error);
      }
    };
    
    // Listen for both singular (analysis) and plural (realtime) invalidation events
    window.addEventListener('workout:invalidate', handleWorkoutInvalidate);
    window.addEventListener('workouts:invalidate', handleWorkoutInvalidate);
    return () => {
      window.removeEventListener('workout:invalidate', handleWorkoutInvalidate);
      window.removeEventListener('workouts:invalidate', handleWorkoutInvalidate);
    };
  }, [isCompleted, workout?.id]);
  
  // For planned workouts, use the same data structure as Today's Efforts
  const unifiedWorkout = (() => {
    if (isCompleted) {
      // For completed workouts, prefer updatedWorkoutData (refreshed after auto-attach) over workout prop
      return updatedWorkoutData || workout;
    }
    
    // For planned workouts, find the matching item in unified data and use the same structure as Today's Efforts
    const plannedId = (workout as any)?.id;
    const unifiedPlanned = unifiedItems.find((item: any) => 
      item.planned?.id === plannedId || item.id === plannedId
    );
    
    if (unifiedPlanned?.planned) {
      // Use mapper - SINGLE SOURCE OF TRUTH
      return mapUnifiedItemToPlanned(unifiedPlanned);
    }
    
    // If not found in unified data, use the original workout (this should not happen in normal flow)
    return workout;
  })();

  // Fetch current planned_id from database to ensure we have the latest state
  // Use planned_id from unified API data or updatedWorkoutData (refreshed after auto-attach)
  useEffect(() => {
    // Prefer updatedWorkoutData (refreshed from DB) over workout prop (may be stale)
    const sourceWorkout = updatedWorkoutData || unifiedWorkout;
    const plannedId = (sourceWorkout as any)?.planned_id || null;
    console.log('🔍 Using planned_id from:', updatedWorkoutData ? 'updatedWorkoutData' : 'unifiedWorkout', plannedId);
    setCurrentPlannedId(plannedId);
  }, [(unifiedWorkout as any)?.planned_id, updatedWorkoutData?.planned_id]);

  // Phase 1: On-demand completed detail hydration (gps/sensors) with fallback to context object
  const wid = String((workout as any)?.id || '');
  const { workout: hydratedCompleted, loading: detailLoading } = useWorkoutDetail(isCompleted ? wid : undefined, {
    include_gps: true,
    include_sensors: true,
    include_swim: true,
    resolution: 'high',
    normalize: true,
    version: 'v1'
  });
  const completedData: any = isCompleted ? (hydratedCompleted || workout) : workout;

  // Resolve linked planned row for completed workouts
  useEffect(() => {
    (async () => {
      if (!isCompleted) { 
        setLinkedPlanned(null); 
        return; 
      }

      // Use updatedWorkoutData if available (refreshed after auto-attach), otherwise workout prop
      const sourceWorkout = updatedWorkoutData || workout;
      
      // 1) If workout has planned_id, fetch it directly from the database (single source of truth)
      const pid = (sourceWorkout as any)?.planned_id as string | undefined || currentPlannedId;
      if (pid) {
        try {
          const { data: plannedRow } = await supabase
            .from('planned_workouts')
            .select('*')
            .eq('id', pid)
            .maybeSingle();
          if (plannedRow) {
            setLinkedPlanned(plannedRow);
            return;
          }
        } catch {}
        // If fetch failed but we have planned_id, keep current state
        return;
      }

      // 2) No planned_id - clear linked state
      setLinkedPlanned(null);
    })();
  }, [isCompleted, workout?.id, (workout as any)?.planned_id, updatedWorkoutData?.planned_id, currentPlannedId]);

  // Auto-materialize planned row if Summary is opened and computed steps are missing
  useEffect(() => {
    if (!linkedPlanned) return;
    const ensureMaterialized = async () => {
      try {
        const hasSteps = Array.isArray((linkedPlanned as any)?.computed?.steps) && (linkedPlanned as any).computed.steps.length>0;
        if (hasSteps) {
          // Enforce stable IDs if missing and recompute once
          try {
            const steps: any[] = (linkedPlanned as any).computed.steps;
            const needsIds = steps.some((st:any)=> !st?.id);
            if (needsIds) {
              const withIds = steps.map((st:any)=> ({ id: st?.id || (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`), ...st }));
              await supabase.from('planned_workouts').update({ computed: { ...(linkedPlanned as any).computed, steps: withIds } } as any).eq('id', String((linkedPlanned as any).id));
              const { data } = await supabase.from('planned_workouts').select('*').eq('id', String((linkedPlanned as any).id)).maybeSingle();
              if (data) setLinkedPlanned(data);
              // Enhanced analysis will be triggered when user opens Summary tab
            }
          } catch {}
          return;
        }
        // Server materialization: if steps missing, materialize on server
        try {
          const pid = String((linkedPlanned as any)?.id || '');
          if (pid) {
            await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: pid } });
            const { data: refreshed } = await supabase.from('planned_workouts').select('*').eq('id', pid).maybeSingle();
            if (refreshed && Array.isArray((refreshed as any)?.computed?.steps) && (refreshed as any).computed.steps.length>0) {
              setLinkedPlanned(refreshed);
              return;
            }
          }
        } catch (err) {
          console.warn('[UnifiedWorkoutView] Server materialization failed:', err);
        }
      } catch {}
    };
    // When switching to Summary tab, try a materialize pass
    if (activeTab === 'summary') ensureMaterialized();
  }, [linkedPlanned, activeTab]);

  // Auto-trigger server compute AND analysis on Summary open
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        if (!isCompleted) return;
        const wid = String((workout as any)?.id || '');
        const pid = String(((linkedPlanned as any)?.id || (workout as any)?.planned_id || ''));
        if (!wid) return;

        // Analysis is handled by auto-attach-planned
        // (calls compute-workout-summary → analyze-running-workout)
      } catch (error) {
        console.error('Summary tab analysis error:', error);
      }
    })();
  }, [activeTab, isCompleted, linkedPlanned?.id, workout?.id]);

  // Summary tab planned: read-only; trigger materialization if needed
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        const pid = String(((linkedPlanned as any)?.id || (workout as any)?.planned_id || ''));
        if (!pid) return;
        const { data: row } = await supabase
          .from('planned_workouts')
          .select('id,type,computed,steps_preset,export_hints,tags,workout_structure,rendered_description,description,name,strength_exercises,mobility_exercises')
          .eq('id', pid)
          .maybeSingle();
        
        // If computed.steps is missing for strength/mobility, trigger server materialization
        const workoutType = String(row?.type || '').toLowerCase();
        const hasComputed = Array.isArray((row as any)?.computed?.steps) && (row as any).computed.steps.length > 0;
        if (!hasComputed && (workoutType === 'strength' || workoutType === 'mobility')) {
          try {
            await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: pid } });
            // Refetch after materialization
            const { data: refreshed } = await supabase
              .from('planned_workouts')
              .select('id,type,computed,steps_preset,export_hints,tags,workout_structure,rendered_description,description,name,strength_exercises,mobility_exercises')
              .eq('id', pid)
              .maybeSingle();
            setHydratedPlanned(refreshed as any);
            return;
          } catch (e) {
            console.error('Failed to materialize planned workout:', e);
          }
        }
        
        setHydratedPlanned(row as any);
      } catch {}
    })();
  }, [activeTab, linkedPlanned?.id, (workout as any)?.planned_id]);

  // Race fixer: after planned hydration, if executed intervals exist but lack planned_step_id mapping, re-run compute once
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        if (!isCompleted) return;
        const wid = String((workout as any)?.id || '');
        if (!wid) return;
        const hasPlannedSteps = (() => { try { return Array.isArray((hydratedPlanned as any)?.computed?.steps) && (hydratedPlanned as any).computed.steps.length>0; } catch { return false; }})();
        if (!hasPlannedSteps) return; // wait until planned steps are present

        // Load latest intervals
        let intervals: any[] = [];
        try {
          const local = (workout as any)?.computed;
          if (local && Array.isArray(local?.intervals)) intervals = local.intervals;
        } catch {}
        if (!intervals || !intervals.length) {
          const { data } = await supabase.from('workouts').select('computed').eq('id', wid).maybeSingle();
          const cmp = (data as any)?.computed;
          if (cmp && Array.isArray(cmp?.intervals)) intervals = cmp.intervals;
        }
        if (!intervals || !intervals.length) return; // nothing to recompute yet

        const missingMapping = intervals.every((it:any)=> !it?.planned_step_id);
        if (!missingMapping) return;

        // Avoid repeated re-compute loops per workout id
        if (recomputeGuardRef.current.has(wid)) return;
        recomputeGuardRef.current.add(wid);

        // Enhanced analysis will be triggered when user opens Summary tab
      } catch {}
    })();
  }, [activeTab, isCompleted, hydratedPlanned?.computed?.steps, workout?.id]);

  // Ensure server snapshot exists: if planned steps exist but computed.planned_steps_light is missing, trigger compute once
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        if (!isCompleted) return;
        const wid = String((workout as any)?.id || '');
        if (!wid) return;
        const hasPlannedSteps = (() => { try { return Array.isArray((hydratedPlanned as any)?.computed?.steps) && (hydratedPlanned as any).computed.steps.length>0; } catch { return false; }})();
        if (!hasPlannedSteps) return;
        // Check current computed snapshot
        let plannedLight: any[] = [];
        try {
          const local = (workout as any)?.computed;
          if (local && Array.isArray(local?.planned_steps_light)) plannedLight = local.planned_steps_light;
        } catch {}
        if (!plannedLight || !plannedLight.length) {
          // Avoid double invoke using same guard
          if (recomputeGuardRef.current.has(`snap-${wid}`)) return;
          recomputeGuardRef.current.add(`snap-${wid}`);
          // Enhanced analysis will be triggered when user opens Summary tab
        }
      } catch {}
    })();
  }, [activeTab, isCompleted, hydratedPlanned?.computed?.steps, workout?.id]);

  // If caller asks for a specific tab or the workout status changes (planned↔completed), update tab
  useEffect(() => {
    const linked = Boolean((workout as any)?.planned_id) || Boolean(linkedPlanned?.id);
    const desired = initialTab || (isCompleted ? (linked ? 'summary' : 'completed') : 'planned');
    setActiveTab(desired);
  }, [initialTab, isCompleted, (workout as any)?.planned_id, linkedPlanned?.id, workout?.id]);

  // Strict server coordination on Summary open: ensure attach+compute without client fallbacks
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        if (!isCompleted) return;
        const wid = String((workout as any)?.id || '');
        if (!wid) return;
        // Prevent duplicate runs across re-renders
        const key = `summary-strict-${wid}`;
        if (recomputeGuardRef.current.has(key)) return;
        recomputeGuardRef.current.add(key);

        // Enhanced analysis will be triggered when user opens Summary tab
      } catch {}
    })();
  }, [activeTab, isCompleted, (workout as any)?.id, (workout as any)?.planned_id, linkedPlanned?.id, hydratedPlanned?.id]);

  // Helper to parse steps_preset that may be stored as JSON string
  const readStepsPreset = (src: any): string[] | undefined => {
    try {
      if (Array.isArray(src)) return src as string[];
      if (src && typeof src === 'object') return src as string[];
      if (typeof src === 'string' && src.trim().length) {
        const parsed = JSON.parse(src);
        return Array.isArray(parsed) ? (parsed as string[]) : undefined;
      }
    } catch {}
    return undefined;
  };

  // Hydrate planned rows (expand tokens → resolve targets → persist computed + duration) before rendering Planned tab
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'planned') return;
        const plannedRow = isCompleted ? (linkedPlanned || null) : (workout?.workout_status === 'planned' ? workout : null);
        if (!plannedRow || !plannedRow.id) { setHydratedPlanned(null); return; }

        // If already hydrated (v3 with steps and total), use it
        const hasV3 = (() => {
          try { return Array.isArray(plannedRow?.computed?.steps) && plannedRow.computed.steps.length>0 && Number(plannedRow?.computed?.total_duration_seconds) > 0; } catch { return false; }
        })();
        let stepsPreset = readStepsPreset((plannedRow as any).steps_preset);
        // Fetch latest row (in case caller provided a minimal object)
        let row = plannedRow;
        try {
          const { data } = await supabase.from('planned_workouts').select('*').eq('id', String(plannedRow.id)).maybeSingle();
          if (data) { row = data; stepsPreset = readStepsPreset((data as any).steps_preset) ?? stepsPreset; }
        } catch {}

        const rowHasV3 = (() => { try { return Array.isArray((row as any)?.computed?.steps) && (row as any).computed.steps.length>0 && Number((row as any)?.computed?.total_duration_seconds) > 0; } catch { return false; }})();
        const isStrength = String((row as any)?.type || '').toLowerCase() === 'strength';
        
        // Strength workouts: use server-side materialization for correct grouped structure
        if (isStrength && !rowHasV3) {
          try {
            const pid = String(row.id);
            await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: pid } });
            const { data: refreshed } = await supabase.from('planned_workouts').select('*').eq('id', pid).maybeSingle();
            if (refreshed) {
              setHydratedPlanned(refreshed);
              // Delay invalidate event to ensure state update completes first
              setTimeout(() => {
                try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
              }, 100);
              return;
            }
          } catch {}
        }
        
        // Server materialization: if steps missing, materialize on server
        if (!rowHasV3) {
          try {
            const pid = String((row as any)?.id || '');
            if (pid) {
              await supabase.functions.invoke('materialize-plan', { body: { planned_workout_id: pid } });
              const { data: refreshed } = await supabase.from('planned_workouts').select('*').eq('id', pid).maybeSingle();
              if (refreshed) {
                setHydratedPlanned(refreshed);
                setTimeout(() => {
                  try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                }, 100);
                return;
              }
            }
          } catch (err) {
            console.warn('[UnifiedWorkoutView] Server materialization failed:', err);
          }
        }
        setHydratedPlanned(row);
      } catch { setHydratedPlanned(null); }
    })();
  }, [activeTab, workout?.id, linkedPlanned?.id]);

  const getWorkoutType = () => {
    // Trust explicit stored type first (prevents misclassification when provider field is missing/ambiguous)
    const storedType = String((workout as any)?.type || '').toLowerCase();
    if (storedType === 'swim') return 'swim';
    if (storedType === 'run') return 'run';
    if (storedType === 'ride') return 'ride';
    if (storedType === 'strength') return 'strength';
    if (storedType === 'walk') return 'walk';

    // Otherwise, handle Garmin/Strava provider types
    if (workout.activity_type || (workout as any)?.provider_sport) {
      const raw = (workout.activity_type || (workout as any).provider_sport || '').toLowerCase();
      
      if (raw.includes('walking') || raw.includes('walk')) {
        return 'walk';
      }
      if (raw.includes('running') || raw.includes('run')) {
        return 'run';
      }
      if (raw.includes('cycling') || raw.includes('bike') || raw.includes('ride')) {
        return 'ride';
      }
      if (raw.includes('swimming') || raw.includes('swim')) {
        return 'swim';
      }
      if (raw.includes('strength') || raw.includes('weight')) {
        return 'strength';
      }
    }
    
    // Legacy/manual fallbacks
    // Fallback logic for legacy names (only if no activity_type match)
    if (workout.name?.toLowerCase().includes('walk')) {
      return 'walk';
    }
    if (workout.name?.toLowerCase().includes('run')) {
      return 'run';
    }
    if (workout.name?.toLowerCase().includes('cycle') || workout.name?.toLowerCase().includes('ride')) {
      return 'ride';
    }
    if (workout.name?.toLowerCase().includes('swim')) {
      return 'swim';
    }
    
    return 'ride'; // default to ride for cycling files
  };

  // Generate a nice title from GPS location + activity type
  const generateWorkoutTitle = () => {
    // If this completed workout is attached to a planned row, prefer the planned title
    const plannedRow: any = (hydratedPlanned || linkedPlanned) as any;
    if (plannedRow && (plannedRow.id || (workout as any)?.planned_id)) {
      const stTitle = String((plannedRow as any)?.workout_structure?.title || '').trim();
      if (stTitle) return stTitle;
      const t = String((plannedRow as any)?.type || '').toLowerCase();
      const typeLabel = t === 'run' ? 'Run' : t === 'ride' ? 'Ride' : t === 'swim' ? 'Swim' : t === 'strength' ? 'Strength' : 'Session';
      // For strength workouts attached to planned row, check name first
      if (t === 'strength') {
        const plannedName = String((plannedRow as any)?.name || '').trim();
        if (plannedName && plannedName.toLowerCase() !== 'strength') {
          // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
          const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(plannedName);
          if (hasDateSuffix) {
            const nameWithoutDate = plannedName.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
            return nameWithoutDate || 'Strength';
          }
          // Use the name directly (e.g., "Upper Body Volume" or "Lower Body - DELOAD")
          return plannedName;
        }
      }
      
      const rawDesc = String((plannedRow as any)?.name || (plannedRow as any)?.rendered_description || (plannedRow as any)?.description || '').toLowerCase();
      const tagsArr: any[] = Array.isArray((plannedRow as any)?.tags) ? (plannedRow as any).tags : [];
      const tags = tagsArr.map((x:any)=> String(x).toLowerCase());
      const focus = (() => {
        if (t === 'ride') {
          if (tags.includes('long_ride')) return 'Long Ride';
          if (/vo2/.test(rawDesc)) return 'VO2';
          if (/threshold|thr_/.test(rawDesc)) return 'Threshold';
          if (/sweet\s*spot|\bss\b/.test(rawDesc)) return 'Sweet Spot';
          if (/recovery/.test(rawDesc)) return 'Recovery';
          if (/endurance|\bz2\b/.test(rawDesc)) return 'Endurance';
          return 'Ride';
        }
        if (t === 'run') {
          if (tags.includes('long_run')) return 'Long Run';
          if (/tempo/.test(rawDesc)) return 'Tempo';
          if (/(intervals?)/.test(rawDesc) || /(\d+)\s*[x×]\s*(\d+)/.test(rawDesc)) return 'Intervals';
          return 'Run';
        }
        if (t === 'swim') {
          if (tags.includes('opt_kind:technique') || /drills|technique/.test(rawDesc)) return 'Technique';
          return 'Endurance';
        }
        if (t === 'strength') return 'Strength';
        // Generic fallbacks
        if (/sweet\s*spot|\bss\b/.test(rawDesc)) return 'Sweet Spot';
        if (/threshold|tempo|interval/.test(rawDesc)) return 'Quality';
        if (/endurance|long/.test(rawDesc)) return 'Endurance';
        return 'Planned';
      })();
      return `${typeLabel} — ${focus}`;
    }
    // Otherwise, prefer the saved workout name if present
    const explicitName = String((workout as any)?.name || '').trim();
    if (explicitName) return explicitName;
    // Planned: standardize to "Type — Focus" for consistency across app
    if (workout.workout_status === 'planned') {
      const t = String(workout.type || '').toLowerCase();
      const typeLabel = t === 'run' ? 'Run' : t === 'ride' ? 'Ride' : t === 'swim' ? 'Swim' : t === 'strength' ? 'Strength' : 'Session';
      
      // For strength workouts, check workout_structure.title first (from plans), then workout.name
      if (t === 'strength') {
        const stTitle = String((workout as any)?.workout_structure?.title || '').trim();
        const name = stTitle || String(workout.name || '').trim();
        if (name && name.toLowerCase() !== 'strength') {
          // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
          const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(name);
          if (hasDateSuffix) {
            const nameWithoutDate = name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
            return nameWithoutDate || 'Strength';
          }
          // Use the name directly (e.g., "Upper Body Volume" or "Lower Body - DELOAD")
          return name;
        }
      }
      
      const raw = String(workout.name || (workout as any).rendered_description || (workout as any).description || '').toLowerCase();
      const focus = (() => {
        if (/interval/.test(raw)) return 'Intervals';
        if (/tempo/.test(raw)) return 'Tempo';
        if (/long\s*run|long\s*ride|long\s*\d+\s*min/.test(raw)) return 'Long';
        if (/vo2/.test(raw)) return 'VO2';
        if (/threshold|thr\b/.test(raw)) return 'Threshold';
        if (/sweet\s*spot|ss\b/.test(raw)) return 'Sweet Spot';
        if (/endurance/.test(raw)) return 'Endurance';
        if (/technique/.test(raw)) return 'Technique';
        if (t === 'strength') return 'Strength';
        return 'Planned';
      })();
      return `${typeLabel} — ${focus}`;
    }

    const activityType = getWorkoutType();
    const rawProvider = String((workout as any)?.provider_sport || (workout as any)?.activity_type || '').toLowerCase();
    const humanize = (s: string) => s.replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const friendlySport = () => {
      if (activityType === 'swim') {
        if (/open\s*water|ocean|ow\b/.test(rawProvider)) return 'Open Water Swim';
        if (/lap|pool/.test(rawProvider)) return 'Pool Swim';
        return 'Swim';
      }
      if (activityType === 'run') {
        if (/trail/.test(rawProvider)) return 'Trail Run';
        return 'Run';
      }
      if (activityType === 'ride') {
        if (/gravel/.test(rawProvider)) return 'Gravel Ride';
        if (/mountain|mtb/.test(rawProvider)) return 'Mountain Bike';
        if (/road/.test(rawProvider)) return 'Road Ride';
        return 'Ride';
      }
      if (activityType === 'walk') return 'Walk';
      if (activityType === 'strength') return 'Strength Training';
      return humanize(rawProvider || activityType);
    };
    
    // Get location from coordinates if available
    const lat = workout.starting_latitude || workout.start_position_lat;
    const lng = workout.starting_longitude || workout.start_position_long;
    
    let location = '';
    if (lat && lng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      
      // Location detection removed - coordinates will show actual location
      location = 'Unknown Location';
    }
    
    // Format activity type nicely - use actual detected type, not stored type
    const formattedType = activityType === 'ride' ? 'Cycling' : 
                         activityType === 'run' ? 'Running' :
                         activityType === 'walk' ? 'Walking' :
                         activityType === 'swim' ? 'Swimming' :
                         activityType === 'strength' ? 'Strength Training' :
                         String(activityType).charAt(0).toUpperCase() + String(activityType).slice(1);
    
    // Create title: "Location + Friendly Sport" or sanitized name fallback
    if (location && location !== 'Unknown Location') {
      return `${location} ${friendlySport()}`;
    } else if (workout.name && !workout.name.includes('Garmin Activity') && !workout.name.includes('Strava Activity')) {
      // Check if name is already nice (not a raw provider code or lowercase single word)
      const nameStr = String(workout.name);
      
      // Check if it has a date suffix like "Strength - 11/24/2025" (from WorkoutBuilder)
      const hasDateSuffix = / - \d{1,2}\/\d{1,2}\/\d{4}$/.test(nameStr);
      if (hasDateSuffix) {
        const nameWithoutDate = nameStr.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
        // If what's left is just the type, use friendly sport instead
        const activityType = getWorkoutType();
        if (nameWithoutDate.toLowerCase() === activityType.toLowerCase()) {
          return friendlySport();
        }
        return nameWithoutDate;
      }
      
      const isProviderCode = /^(ROAD_BIKING|RUNNING|LAP_SWIMMING|OPEN_WATER_SWIMMING|CYCLING|SWIMMING)$/i.test(nameStr) ||
                            /_/.test(nameStr) && nameStr === nameStr.toUpperCase();
      const isLowercaseSingleWord = nameStr === nameStr.toLowerCase() && 
                                    !nameStr.includes(' ') && 
                                    ['swim', 'run', 'ride', 'walk', 'strength'].includes(nameStr.toLowerCase());
      
      if (!isProviderCode && !isLowercaseSingleWord) {
        // Name is already nice, use it as-is
        return nameStr;
      }
      // Name is a provider code or lowercase single word, use friendly sport instead
      return friendlySport();
    } else {
      return friendlySport();
    }
  };

  // ✅ REMOVED: All client-side analysis code
  // Client is now UI-only - all analysis comes from server (workout_analysis.performance)
  // Use updatedWorkoutData if available (refreshed after auto-attach), otherwise fall back to workout prop
  const sourceWorkout = updatedWorkoutData || workout;
  const isLinked = Boolean((sourceWorkout as any)?.planned_id) || Boolean(currentPlannedId) || Boolean(linkedPlanned?.id);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-1 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2" />
          <div>
            <h2 className="font-semibold text-lg">
              {(() => {
                const st = String((hydratedPlanned as any)?.workout_structure?.title || (workout as any)?.workout_structure?.title || '').trim();
                if (st) return st;
                return generateWorkoutTitle();
              })()}
            </h2>
            <p className="text-sm text-muted-foreground leading-snug font-sans [font-variant-numeric:lining-nums_tabular-nums] [font-feature-settings:'lnum'_1,'tnum'_1] flex items-baseline">
              {(() => {
                try {
                  // For completed workouts, use the date field for date and timestamp for time
                  if (workout.workout_status === 'completed' && workout.date) {
                    // Use the date field for the date (this is already in the correct timezone)
                    const dateStr = new Date(workout.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                    
                    // Use timestamp for time if available
                    if (workout.timestamp) {
                      const d = new Date(workout.timestamp);
                      if (!isNaN(d.getTime())) {
                        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        return (
                          <>
                            <span className="[font-variant-numeric:lining-nums_tabular-nums] [font-feature-settings:'lnum'_1,'tnum'_1]">{dateStr}</span>
                            <span className="mx-1">at</span>
                            <span className="[font-variant-numeric:lining-nums_tabular-nums] [font-feature-settings:'lnum'_1,'tnum'_1]">{timeStr}</span>
                          </>
                        );
                      }
                    }
                    
                    // Just return the date if no timestamp
                    return <span className="[font-variant-numeric:lining-nums_tabular-nums] [font-feature-settings:'lnum'_1,'tnum'_1]">{dateStr}</span>;
                  }
                  
                  // Fallback to date only
                  const ds = String(workout.date || '').trim();
                  if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
                    const d = new Date(ds + 'T00:00:00');
                    if (!isNaN(d.getTime())) {
                      const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
                      return <span className="[font-variant-numeric:lining-nums_tabular-nums] [font-feature-settings:'lnum'_1,'tnum'_1]">{dateStr}</span>;
                    }
                  }
                  const dn = Number((workout as any)?.day_number);
                  if (dn >= 1 && dn <= 7) {
                    const long = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
                    return long[dn - 1];
                  }
                } catch {}
                return 'Planned';
              })()}
            </p>
            {/* Auto-linked badge removed per product decision */}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted && (
            (() => {
              console.log('🔍 Button logic - currentPlannedId:', currentPlannedId, 'linkedPlanned:', linkedPlanned);
              return (!currentPlannedId && !linkedPlanned) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={()=>setAssocOpen(true)}
                >Attach</Button>
              ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={async()=>{
                  try {
                    const pid = String(currentPlannedId || (linkedPlanned as any)?.id || '');
                    const wid = String((workout as any)?.id || '');
                    if (!pid || !wid) return;
                    // disable re-link noise then detach
                    suppressRelinkUntil.current = Date.now() + 15000; // 15s
                    // Remove the database link and clear analysis to force re-analysis on reattach
                    try {
                      await supabase.from('workouts').update({ 
                        planned_id: null,
                        workout_analysis: null  // Clear analysis to force fresh analysis on reattach
                      } as any).eq('id', wid);
                      await supabase.from('planned_workouts').update({ workout_status: 'planned' } as any).eq('id', pid);
                    } catch {}
                    // Clear local state
                    setCurrentPlannedId(null);
                    setLinkedPlanned(null);
                    setHydratedPlanned(null); // Also clear hydratedPlanned
                    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                    try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                    setActiveTab('completed');
                  } catch {}
                }}
              >Unattach</Button>
              );
            })()
          )}
        </div>
        {assocOpen && (
          <AssociatePlannedDialog
            workout={workout}
            open={assocOpen}
            onClose={()=>setAssocOpen(false)}
            onAssociated={async(pid)=>{ 
              setAssocOpen(false);
              // Just dispatch invalidation - AppLayout and useEffects will handle the rest
              try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
              try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
              try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
            }}
          />
        )}
        {/* Close X removed per product decision; back handled by native nav */}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-transparent border-none mb-0 py-0">
          <TabsTrigger value="planned" className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <Calendar className="h-4 w-4" />
            Planned
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <ListCollapse className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <List className="h-4 w-4" />
            Details
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          {/* Planned Tab */}
          <TabsContent value="planned" className="flex-1 p-1">
            <StructuredPlannedView 
              workout={getUnifiedPlannedWorkout(unifiedWorkout, isCompleted, hydratedPlanned, linkedPlanned)}
              showHeader={true}
            />
            {(() => {
              // Show inline launcher for planned sessions (strength, mobility, and pilates_yoga)
              const row = isCompleted ? (linkedPlanned || null) : unifiedWorkout;
              const isPlanned = String((row as any)?.workout_status || '').toLowerCase() === 'planned';
              const type = String((row as any)?.type || '').toLowerCase();
              if (!row || !isPlanned || (type!=='strength' && type!=='mobility' && type!=='pilates_yoga')) return null;
              const handleClick = () => {
                try {
                  const rowAny: any = row as any;
                  const basePlanned = rowAny?.planned && typeof rowAny.planned === 'object' ? { ...rowAny.planned } : { ...rowAny };
                  // Always include date/type/name for the logger header and fallbacks
                  basePlanned.date = rowAny?.date || basePlanned.date;
                  basePlanned.type = basePlanned.type || type;
                  basePlanned.name = basePlanned.name || (
                    type==='mobility' ? 'Mobility Session' : 
                    type==='pilates_yoga' ? 'Pilates/Yoga Session' : 
                    'Strength'
                  );

                  if (type==='strength') {
                    window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: basePlanned } }));
                  } else if (type==='mobility') {
                    // Mobility → keep unified simple; route via app handler
                    window.dispatchEvent(new CustomEvent('open:mobilityLogger', { detail: { planned: basePlanned } }));
                  } else if (type==='pilates_yoga') {
                    window.dispatchEvent(new CustomEvent('open:pilatesYogaLogger', { detail: { planned: basePlanned } }));
                  }
                } catch {}
              };
              return (
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClick}
                  >Go to workout</Button>
                </div>
              );
            })()}
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary" className="flex-1 p-0">
            {/* Attach/Unattach moved to header to reduce padding */}
            {/* Header metrics now rendered by MobileSummary to keep stable Pace/Duration adherence */}
            {/* Inline Strength Logger editor */}
            {editingInline && String((workout as any)?.type||'').toLowerCase()==='strength' && (
              <div className="mb-4 border border-gray-200 rounded-md">
                <StrengthLogger
                  onClose={()=> setEditingInline(false)}
                  scheduledWorkout={(isCompleted ? workout : (linkedPlanned || workout))}
                  onWorkoutSaved={(saved)=>{
                    setEditingInline(false);
                    setActiveTab('summary');
                    try { (workout as any).id = (saved as any)?.id || (workout as any).id; } catch {}
                    try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                    try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                  }}
                  targetDate={(workout as any)?.date}
                />
              </div>
            )}
            {(() => {
              console.log('🔍 [UNIFIED DEBUG] isCompleted:', isCompleted, 'isLinked:', isLinked, 'linkedPlanned:', linkedPlanned);
              console.log('🔍 [DATA SOURCE DEBUG] updatedWorkoutData:', !!updatedWorkoutData, 'hydratedCompleted:', !!hydratedCompleted, 'workout:', !!workout);
              console.log('🔍 [DATA SOURCE DEBUG] updatedWorkoutData structure:', updatedWorkoutData?.workout_analysis ? 'has workout_analysis' : 'no workout_analysis');
              console.log('🔍 [DATA SOURCE DEBUG] hydratedCompleted structure:', hydratedCompleted?.workout_analysis ? 'has workout_analysis' : 'no workout_analysis');
              return isCompleted && !isLinked ? (
                <div className="px-3 py-2 text-sm text-gray-600">Attach this workout to a planned session to see planned vs actual.</div>
              ) : (
                <MobileSummary 
                  planned={isCompleted ? (hydratedPlanned || linkedPlanned || null) : (hydratedPlanned || workout)} 
                  completed={isCompleted ? (updatedWorkoutData || hydratedCompleted || workout) : null}
                  onNavigateToContext={onNavigateToContext}
                />
              );
            })()}
            {onDelete && workout?.id && (
              <Button
                variant="ghost"
                size="sm"
                className="fixed bottom-3 right-3 text-red-600 hover:text-red-700"
                onClick={() => {
                  try {
                    if (!confirm('Delete this workout?')) return;
                    onDelete?.(String((workout as any).id));
                  } catch {}
                }}
              >Delete</Button>
            )}
          </TabsContent>

          {/* Completed Tab */}
          <TabsContent value="completed" className="flex-1 p-1">
            {isCompleted ? (
              <div className="h-full">
                {/* Delete control removed per product decision */}
                {/* Delete control removed per product decision */}
                {(workout.type === 'endurance' || workout.type === 'ride' || workout.type === 'run' || workout.type === 'swim' || workout.type === 'walk') ? (
                  <div className="p-4">
                    <CompletedTab 
                      workoutType={getWorkoutType() as 'ride' | 'run' | 'swim' | 'strength' | 'walk'}
                      workoutData={completedData}
                    />
                  </div>
                ) : (workout.type === 'strength' || workout.type === 'mobility' || workout.type === 'pilates_yoga') ? (
                  <div className="p-4">
                    <h3 className="font-semibold mb-4">
                      {workout.type === 'mobility' ? 'Mobility' : 
                       workout.type === 'pilates_yoga' ? 'Pilates/Yoga' : 
                       'Strength'} Workout Completed</h3>
                    {/* Use StrengthCompletedView for both strength and mobility workouts */}
                    <StrengthCompletedView 
                      workoutData={completedData}
                      plannedWorkout={linkedPlanned}
                    />
                    {assocOpen && (
                      <AssociatePlannedDialog
                        workout={workout}
                        open={assocOpen}
                        onClose={()=>setAssocOpen(false)}
                        onAssociated={async(pid)=>{ 
                          setAssocOpen(false);
                          // Just dispatch invalidation - AppLayout and useEffects will handle the rest
                          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                          try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                          try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="p-4">
                    <h3 className="font-semibold mb-4">Workout Completed</h3>
                    <p className="text-muted-foreground">Workout type not yet supported in completed view.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-900 mb-2">Not Yet Completed</h3>
                  <p className="text-sm text-yellow-800">
                    This workout hasn't been completed yet. Complete it to see detailed analytics.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default UnifiedWorkoutView;
