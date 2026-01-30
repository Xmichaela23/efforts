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
import RescheduleValidationPopup from './RescheduleValidationPopup';
import RescheduleDatePicker from './RescheduleDatePicker';
// Unified path only; remove legacy planned_workouts hooks
import { useWeekUnified } from '@/hooks/useWeekUnified';
import { supabase } from '@/lib/supabase';
// ✅ REMOVED: Client-side analysis - server provides all analysis data
import { useWorkoutDetail } from '@/hooks/useWorkoutDetail';
import { mapUnifiedItemToPlanned } from '@/utils/workout-mappers';
import { SPORT_COLORS, getDisciplineColor, getDisciplineColorRgb, getDisciplineGlowStyle, getDisciplinePhosphorCore } from '@/lib/context-utils';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';

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
  onAddGear?: () => void; // Callback to open gear management
  initialTab?: 'planned' | 'summary' | 'completed';
  origin?: 'today' | 'weekly' | 'other';
}

const UnifiedWorkoutView: React.FC<UnifiedWorkoutViewProps> = ({
  workout,
  onClose,
  onUpdateWorkout,
  onDelete,
  onNavigateToContext,
  onAddGear,
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
  const [activeTab, setActiveTab] = useState<string>(initialTab || (isCompleted ? 'summary' : 'planned'));
  const [editingInline, setEditingInline] = useState(false);
  const [assocOpen, setAssocOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [linkedPlanned, setLinkedPlanned] = useState<any | null>(null);
  const [hydratedPlanned, setHydratedPlanned] = useState<any | null>(null);
  const [updatedWorkoutData, setUpdatedWorkoutData] = useState<any | null>(null);
  const recomputeGuardRef = useRef<Set<string>>(new Set());
  // Suppress auto re-link fallback briefly after an explicit Unattach
  const suppressRelinkUntil = useRef<number>(0);
  
  // Reschedule validation state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReschedulePopup, setShowReschedulePopup] = useState(false);
  const [rescheduleValidation, setRescheduleValidation] = useState<any>(null);
  const [reschedulePending, setReschedulePending] = useState<{ workoutId: string; oldDate: string; newDate: string; workoutName: string } | null>(null);
  const { updatePlannedWorkout, deletePlannedWorkout } = usePlannedWorkouts();

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
        // Explicitly select workout_analysis, rpe, and gear_id to ensure they're included
        const { data: refreshedWorkout, error } = await supabase
          .from('workouts')
          .select('*, workout_analysis, rpe, gear_id')
          .eq('id', workout.id)
          .single();
        
        if (error) {
          console.error('❌ Failed to refresh workout data:', error);
          return;
        }
        
        if (refreshedWorkout) {
          console.log('✅ [UnifiedWorkoutView] Workout data refreshed, planned_id:', refreshedWorkout.planned_id);
          console.log('🔍 [REFRESH DEBUG] workout_analysis type:', typeof refreshedWorkout.workout_analysis);
          console.log('🔍 [REFRESH DEBUG] workout_analysis value:', refreshedWorkout.workout_analysis);
          // Parse JSONB fields that might be returned as strings
          const parsed = { ...refreshedWorkout };
          try {
            if (typeof parsed.workout_analysis === 'string') {
              parsed.workout_analysis = JSON.parse(parsed.workout_analysis);
              console.log('✅ [REFRESH DEBUG] Parsed workout_analysis from string');
            }
            if (typeof parsed.computed === 'string') {
              parsed.computed = JSON.parse(parsed.computed);
            }
            if (typeof parsed.metrics === 'string') {
              parsed.metrics = JSON.parse(parsed.metrics);
            }
          } catch (e) {
            console.warn('Failed to parse JSONB fields:', e);
          }
          console.log('🔍 [REFRESH DEBUG] Final parsed.workout_analysis:', parsed.workout_analysis ? 'present' : 'missing');
          console.log('🔍 [REFRESH DEBUG] Final parsed.workout_analysis?.performance:', parsed.workout_analysis?.performance);
          setUpdatedWorkoutData(parsed);
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
  // Prefer updatedWorkoutData (refreshed after changes) > hydratedCompleted (from useWorkoutDetail) > workout (prop)
  const completedData: any = isCompleted ? (updatedWorkoutData || hydratedCompleted || workout) : workout;

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
    const desired = initialTab || (isCompleted ? 'summary' : 'planned');
    setActiveTab(desired);
  }, [initialTab, isCompleted, workout?.id]);

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
    
    // Check for indoor/treadmill indicators - must be STABLE to avoid UI flicker
    const isTrainer = (workout as any)?.strava_data?.original_activity?.trainer === true;
    // Check GPS data - handle both array and JSON string formats
    const gpsTrack = (workout as any)?.gps_track;
    const hasGpsTrack = (Array.isArray(gpsTrack) && gpsTrack.length > 0) || 
                        (typeof gpsTrack === 'string' && gpsTrack.length > 10);
    // Check start position as fallback indicator
    const hasStartPosition = Number.isFinite((workout as any)?.start_position_lat) && 
                             (workout as any)?.start_position_lat !== 0;
    // Only classify as indoor if we're sure: trainer flag OR (gps_track explicitly empty AND no start position)
    const isConfirmedIndoor = isTrainer || 
                              (Array.isArray(gpsTrack) && gpsTrack.length === 0 && !hasStartPosition);
    const isIndoorRun = (activityType === 'run' || activityType === 'walk') && isConfirmedIndoor;
    
    const friendlySport = () => {
      if (activityType === 'swim') {
        if (/open\s*water|ocean|ow\b/.test(rawProvider)) return 'Open Water Swim';
        if (/lap|pool/.test(rawProvider)) return 'Pool Swim';
        return 'Swim';
      }
      if (activityType === 'run') {
        if (/trail/.test(rawProvider)) return 'Trail Run';
        // Indoor/treadmill detection
        if (isIndoorRun) return isTrainer ? 'Treadmill' : 'Indoor Run';
        return 'Run';
      }
      if (activityType === 'ride') {
        if (/gravel/.test(rawProvider)) return 'Gravel Ride';
        if (/mountain|mtb/.test(rawProvider)) return 'Mountain Bike';
        if (/road/.test(rawProvider)) return 'Road Ride';
        return 'Ride';
      }
      if (activityType === 'walk') {
        if (isIndoorRun) return 'Indoor Walk';
        return 'Walk';
      }
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
  
  // Workout type styling for visual continuity with loggers
  const workoutType = String(workout?.type || '').toLowerCase();
  const isMobility = workoutType === 'mobility';
  const isStrength = workoutType === 'strength';
  
  // Phosphor glow for mobility and strength cards
  const getCardStyle = () => {
    if (isMobility) {
      const glowStyle = getDisciplineGlowStyle('mobility', 'idle');
      return { ...glowStyle, background: 'radial-gradient(ellipse at center top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)' };
    }
    if (isStrength) {
      const glowStyle = getDisciplineGlowStyle('strength', 'idle');
      return { ...glowStyle, background: 'radial-gradient(ellipse at center top, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)' };
    }
    return {};
  };
  const getCardClass = () => {
    // Dark steel panel: neutral border, subtle inner stroke via shadow
    return 'backdrop-blur-xl border border-white/10 rounded-2xl mx-1 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)]';
  };
  const cardStyle = getCardStyle();
  const cardClass = getCardClass();
  const hasCardStyle = isMobility || isStrength;

  // Get workout type and sport color for gradient
  const workoutTypeForGradient = getWorkoutType();
  const sportColor = getDisciplineColor(workoutTypeForGradient);
  
  // Use centralized RGB conversion helper
  const sportRgb = getDisciplineColorRgb(workoutTypeForGradient);
  const sportPhosphorCore = getDisciplinePhosphorCore(workoutTypeForGradient);
  
  return (
    <div 
      className="fixed inset-0 flex flex-col z-40"
      style={{ 
        backgroundColor: '#000000',
        transform: 'none',
        left: 0,
        right: 0,
        overflowX: 'hidden',
        touchAction: 'pan-y pinch-zoom'
      }}
    >
      {/* Omni environment field (match header/tabbar supernova, with discipline tint) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.58,
          mixBlendMode: 'soft-light',
          backgroundColor: 'rgba(0, 0, 0, 0.16)',
          backgroundImage: `
            radial-gradient(ellipse at 50% 0%, rgba(255, 215, 0, 0.10) 0%, transparent 60%),
            radial-gradient(ellipse at 82% 38%, rgba(74, 158, 255, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 18% 42%, rgba(183, 148, 246, 0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 58% 60%, rgba(80, 200, 120, 0.06) 0%, transparent 62%),
            radial-gradient(ellipse at 44% 62%, rgba(255, 140, 66, 0.06) 0%, transparent 62%),
            radial-gradient(ellipse at 50% 18%, rgba(${sportRgb}, 0.10) 0%, transparent 62%),
            radial-gradient(ellipse at 78% 70%, rgba(${sportRgb}, 0.06) 0%, transparent 62%),
            linear-gradient(45deg, rgba(255,255,255,0.20) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.14) 1px, transparent 1px),
            linear-gradient(45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: 'cover, cover, cover, cover, cover, cover, cover, 26px 26px, 26px 26px, 52px 52px, 52px 52px',
          backgroundPosition: 'center, center, center, center, center, center, center, center, center, center, center',
          backgroundBlendMode: 'screen, screen, screen, screen, screen, screen, screen, soft-light, soft-light, soft-light, soft-light',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-12"
        style={{
          height: 220,
          mixBlendMode: 'screen',
          opacity: 0.55,
          filter: 'blur(22px) saturate(1.12)',
          transform: 'translateZ(0)',
          backgroundImage: `
            radial-gradient(160px 90px at 14% 55%, rgba(255, 215, 0, 0.38) 0%, rgba(255, 215, 0, 0.0) 72%),
            radial-gradient(180px 100px at 32% 60%, rgba(255, 140, 66, 0.30) 0%, rgba(255, 140, 66, 0.0) 74%),
            radial-gradient(180px 100px at 50% 58%, rgba(183, 148, 246, 0.28) 0%, rgba(183, 148, 246, 0.0) 74%),
            radial-gradient(180px 100px at 68% 60%, rgba(74, 158, 255, 0.26) 0%, rgba(74, 158, 255, 0.0) 74%),
            radial-gradient(160px 90px at 86% 55%, rgba(80, 200, 120, 0.22) 0%, rgba(80, 200, 120, 0.0) 72%),
            radial-gradient(220px 120px at 52% 62%, rgba(${sportRgb}, 0.18) 0%, rgba(${sportRgb}, 0.0) 74%),
            linear-gradient(to bottom, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.72) 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 680px at 50% 24%, rgba(${sportRgb}, 0.08) 0%, rgba(0,0,0,0) 62%),
            radial-gradient(1000px 600px at 50% 110%, rgba(${sportRgb}, 0.18) 0%, rgba(0,0,0,0) 58%),
            radial-gradient(900px 520px at 50% 92%, rgba(${sportRgb}, 0.16) 0%, rgba(0,0,0,0) 55%)
          `,
          mixBlendMode: 'screen',
          opacity: 0.62,
          filter: 'blur(10px) saturate(1.12)',
          transform: 'translateZ(0)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.58) 100%)',
        }}
      />
      <div 
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain min-h-0 relative"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          height: '100%',
          overscrollBehaviorX: 'none'
        }}
      >
      {/* Spacer for app header */}
      <div style={{ height: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px))' }} />
      {/* Header */}
      <div className="p-3">
        {/* Row 1: Title + Attach/Unattach */}
        <div className="flex items-center justify-between">
          <h2 className="font-light tracking-normal text-base text-white">
            {(() => {
              const st = String((hydratedPlanned as any)?.workout_structure?.title || (workout as any)?.workout_structure?.title || '').trim();
              if (st) return st;
              return generateWorkoutTitle();
            })()}
          </h2>
          {/* Attach/Unattach button - moved here */}
          {isCompleted && (
            (!currentPlannedId && !linkedPlanned) ? (
              <button
                onClick={()=>setAssocOpen(true)}
                className="px-4 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 font-light tracking-wide hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300 text-sm"
                style={{
                  borderColor: `rgba(${sportRgb}, 0.32)`,
                  boxShadow: `0 0 0 1px rgba(${sportRgb}, 0.10) inset, 0 0 18px rgba(${sportRgb}, 0.10)`,
                }}
              >Attach</button>
            ) : (
              <button
                onClick={async()=>{
                  try {
                    const pid = String(currentPlannedId || (linkedPlanned as any)?.id || '');
                    const wid = String((workout as any)?.id || '');
                    if (!pid || !wid) return;
                    suppressRelinkUntil.current = Date.now() + 15000;
                    try {
                      await supabase.from('workouts').update({ planned_id: null } as any).eq('id', wid);
                      await supabase.from('planned_workouts').update({ workout_status: 'planned' } as any).eq('id', pid);
                    } catch {}
                    setCurrentPlannedId(null);
                    setLinkedPlanned(null);
                    setHydratedPlanned(null);
                    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                    try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                    setActiveTab('completed');
                  } catch {}
                }}
                className="px-4 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-lg border border-white/25 text-white/90 font-light tracking-wide hover:bg-white/[0.12] hover:text-white hover:border-white/35 transition-all duration-300 text-sm"
                style={{
                  borderColor: `rgba(${sportRgb}, 0.30)`,
                  boxShadow: `0 0 0 1px rgba(${sportRgb}, 0.10) inset, 0 0 18px rgba(${sportRgb}, 0.08)`,
                }}
              >Unattach</button>
            )
          )}
        </div>
        
        {/* Row 2: Source attribution + View link */}
        {(() => {
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
            const stravaUrl = stravaId ? `https://www.strava.com/activities/${stravaId}` : null;
            
            return (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <img 
                  src="/icons/strava-powered-by.svg" 
                  alt="Powered by Strava" 
                  className="h-3"
                />
                {deviceName && <span className="text-gray-400 text-xs">via {deviceName}</span>}
                {stravaUrl && (
                  <>
                    <span className="text-gray-300">•</span>
                    <a 
                      href={stravaUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-[#FC5200] font-light underline underline-offset-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      View on Strava
                    </a>
                  </>
                )}
              </div>
            );
          }

          if (source === 'garmin' || garminId) {
            const garminUrl = garminId ? `https://connect.garmin.com/modern/activity/${garminId}` : null;
            return (
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-gray-400 text-xs">via</span>
                <svg width="8" height="10" viewBox="0 0 10 12" className="flex-shrink-0">
                  <polygon points="5,0 10,10 0,10" fill="#007CC3"/>
                </svg>
                <span className="text-[#007CC3] font-light text-xs">Garmin Connect</span>
                {deviceName && <span className="text-gray-400 text-xs">({deviceName})</span>}
                {garminUrl && (
                  <>
                    <span className="text-gray-300">•</span>
                    <a
                      href={garminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#007CC3] font-light underline underline-offset-2 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      View
                    </a>
                  </>
                )}
              </div>
            );
          }

          return null;
        })()}
        
        {/* Row 3: Date */}
        <div>
            <p className="text-sm text-gray-300 font-light tracking-normal leading-snug [font-variant-numeric:lining-nums_tabular-nums] [font-feature-settings:'lnum'_1,'tnum'_1] flex items-baseline">
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
          </div>
        {assocOpen && (
          <AssociatePlannedDialog
            workout={workout}
            open={assocOpen}
            onClose={()=>setAssocOpen(false)}
            onAssociated={async(pid)=>{ 
              setAssocOpen(false);
              try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
              try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
              try { window.dispatchEvent(new CustomEvent('week:invalidate')); } catch {}
            }}
          />
        )}
      </div>

      {/* Tabs - conditionally show based on link status */}
      {/* Planned workout (not completed): Planned tab only */}
      {/* Completed + linked: Planned, Performance, Details */}
      {/* Completed + not linked: Performance, Details */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          className={`grid w-full bg-white/[0.04] backdrop-blur-md border-b border-white/10 mb-0 py-0 ${
          !isCompleted ? 'grid-cols-1' : (isLinked ? 'grid-cols-3' : 'grid-cols-2')
        }`}
          style={{
            borderColor: `rgba(${sportRgb}, 0.16)`,
            backgroundImage: `radial-gradient(820px 160px at 50% 0%, rgba(${sportRgb}, 0.10) 0%, rgba(0,0,0,0) 70%)`,
            boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset, 0 0 22px rgba(${sportRgb}, 0.06)`,
          }}
        >
          {/* Planned tab: show for planned workouts OR completed+linked */}
          {(!isCompleted || isLinked) && (
            <TabsTrigger value="planned" className="flex items-center gap-2 py-1 font-light tracking-wide data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-white/30 data-[state=inactive]:text-gray-400 hover:text-gray-300 transition-colors">
              <Calendar className="h-4 w-4" />
              Planned
            </TabsTrigger>
          )}
          {/* Performance tab: show for all completed (planned = execution scores, unplanned = analysis) */}
          {isCompleted && (
            <TabsTrigger value="summary" className="flex items-center gap-2 py-1 font-light tracking-wide data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-white/30 data-[state=inactive]:text-gray-400 hover:text-gray-300 transition-colors">
              <ListCollapse className="h-4 w-4" />
              Performance
            </TabsTrigger>
          )}
          {/* Details tab: only show for completed workouts */}
          {isCompleted && (
            <TabsTrigger value="completed" className="flex items-center gap-2 py-1 font-light tracking-wide data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-white/30 data-[state=inactive]:text-gray-400 hover:text-gray-300 transition-colors">
              <List className="h-4 w-4" />
              Details
            </TabsTrigger>
          )}
        </TabsList>

        <div className="pt-3">
          {/* Planned Tab */}
          <TabsContent value="planned" className="flex-1 p-2">
            <div className={cardClass} style={cardStyle}>
              <div className={hasCardStyle ? 'p-4' : ''}>
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
                    <div className="mt-4">
                      <button
                        onClick={handleClick}
                        className={`w-full px-4 py-3 rounded-xl ${isMobility ? 'bg-purple-500/20 border-purple-500/40 hover:bg-purple-500/30' : isStrength ? 'bg-orange-500/20 border-orange-500/40 hover:bg-orange-500/30' : 'bg-white/[0.08] border-white/30 hover:bg-white/[0.12]'} backdrop-blur-md border text-white text-sm font-light tracking-wide transition-all`}
                      >Go to workout</button>
                    </div>
                  );
                })()}
                {/* Delete/Reschedule buttons for planned workouts */}
                {!isCompleted && onDelete && (
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white/60 hover:text-white/80 hover:bg-white/10"
                      onClick={async () => {
                        const currentDate = (unifiedWorkout as any)?.date || (workout as any)?.date || '';
                        const workoutId = (unifiedWorkout as any)?.id || (workout as any)?.id;
                        
                        if (!workoutId) {
                          alert('Cannot reschedule: workout ID not found');
                          return;
                        }
                        
                        if (!currentDate) {
                          alert('Unable to reschedule: missing date information');
                          return;
                        }

                        try {
                          console.log('[Reschedule] Fetching coach options for:', { workoutId, currentDate });
                          
                          // Call validate-reschedule with current date to get coach options
                          // (new_date = old_date means "show me options" without actually moving)
                          const { data, error } = await supabase.functions.invoke('validate-reschedule', {
                            body: {
                              workout_id: workoutId,
                              new_date: currentDate // Same date = just get options
                            }
                          });

                          if (error) {
                            console.error('[Reschedule] Error fetching options:', error);
                            alert('Error loading reschedule options. Please try again.');
                            return;
                          }

                          console.log('[Reschedule] Coach options:', data);

                          // Show validation popup with coach options
                          setRescheduleValidation(data);
                          setReschedulePending({
                            workoutId: workoutId,
                            oldDate: currentDate,
                            newDate: currentDate, // Will be updated when user selects an option
                            workoutName: (unifiedWorkout as any)?.name || (workout as any)?.name || `${(unifiedWorkout as any)?.type || (workout as any)?.type} workout`
                          });
                          setShowReschedulePopup(true);
                        } catch (err) {
                          console.error('[Reschedule] Error fetching options:', err);
                          alert('Error loading reschedule options. Please try again.');
                        }
                      }}
                    >
                      Reschedule
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={async () => {
                        if (confirm('Delete this planned workout?')) {
                          try {
                            const workoutId = String((unifiedWorkout as any)?.id);
                            await deletePlannedWorkout(workoutId);
                            
                            // Trigger invalidation to refresh calendar
                            window.dispatchEvent(new CustomEvent('workouts:invalidate'));
                            window.dispatchEvent(new CustomEvent('planned:invalidate'));
                            window.dispatchEvent(new CustomEvent('week:invalidate'));
                            
                            // Close the workout view
                            onClose();
                          } catch (err) {
                            console.error('[Delete] Error deleting planned workout:', err);
                            alert(`Error deleting workout: ${err instanceof Error ? err.message : 'Unknown error'}`);
                          }
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Performance Tab - execution (linked) or analysis (unplanned) */}
          <TabsContent value="summary" className="flex-1 p-2">
            <div className={cardClass} style={cardStyle}>
              <div className={hasCardStyle ? 'p-4' : ''}>
                {/* Inline Strength Logger editor */}
                {editingInline && String((workout as any)?.type||'').toLowerCase()==='strength' && (
                  <div className="mb-4 border border-white/20 rounded-md">
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
                <MobileSummary 
                  planned={isCompleted ? (hydratedPlanned || linkedPlanned || null) : (hydratedPlanned || workout)} 
                  completed={isCompleted ? (updatedWorkoutData || hydratedCompleted || workout) : null}
                  onNavigateToContext={onNavigateToContext}
                />
              </div>
            </div>
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
          <TabsContent value="completed" className="flex-1 px-1 py-2">
            <div className={cardClass} style={cardStyle}>
              <div className={hasCardStyle ? 'px-2 py-4' : ''}>
                {isCompleted ? (
                  <div>
                      {/* Delete control removed per product decision */}
                      {(workout.type === 'endurance' || workout.type === 'ride' || workout.type === 'run' || workout.type === 'swim' || workout.type === 'walk') ? (
                        <div>
                          <CompletedTab 
                            workoutType={getWorkoutType() as 'ride' | 'run' | 'swim' | 'strength' | 'walk'}
                            workoutData={completedData}
                            onAddGear={onAddGear}
                            isHydrating={detailLoading}
                          />
                        </div>
                      ) : (workout.type === 'strength' || workout.type === 'mobility' || workout.type === 'pilates_yoga') ? (
                        <div>
                          {/* StrengthCompletedView has its own header with workout name */}
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
                        <div>
                          <h3 className="font-light mb-4 text-white/90">Workout Completed</h3>
                          <p className="text-white/60">Workout type not yet supported in completed view.</p>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                    <h3 className="font-light text-amber-400 mb-2">Not Yet Completed</h3>
                    <p className="text-sm text-amber-300/80">
                      This workout hasn't been completed yet. Complete it to see detailed analytics.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
      {/* Spacer for nav bar */}
      <div style={{ height: 'calc(var(--tabbar-h, 56px) + env(safe-area-inset-bottom, 0px) + 16px)' }} />
      </div>

      {/* Date Picker */}
      {showDatePicker && (
        <RescheduleDatePicker
          currentDate={(unifiedWorkout as any)?.date || (workout as any)?.date || ''}
          onSelect={async (newDate) => {
            setShowDatePicker(false);
            const currentDate = (unifiedWorkout as any)?.date || '';
            const workoutId = (unifiedWorkout as any)?.id || (workout as any)?.id;
            
            if (newDate === currentDate) {
              return; // No change
            }
            
            try {
              console.log('[Reschedule] Validating:', { workoutId, oldDate: currentDate, newDate });
              
              // Validate reschedule
              const { data, error } = await supabase.functions.invoke('validate-reschedule', {
                body: {
                  workout_id: workoutId,
                  new_date: newDate
                }
              });

              if (error) {
                console.error('[Reschedule] Validation error:', error);
                alert('Error validating reschedule. Please try again.');
                return;
              }

              console.log('[Reschedule] Validation result:', data);

              // Show validation popup
              setRescheduleValidation(data);
              setReschedulePending({
                workoutId: workoutId,
                oldDate: currentDate,
                newDate: newDate,
                workoutName: (unifiedWorkout as any)?.name || (workout as any)?.name || `${(unifiedWorkout as any)?.type || (workout as any)?.type} workout`
              });
              setShowReschedulePopup(true);
            } catch (err) {
              console.error('[Reschedule] Error validating reschedule:', err);
              alert('Error validating reschedule. Please try again.');
            }
          }}
          onCancel={() => setShowDatePicker(false)}
        />
      )}

      {/* Reschedule Validation Popup */}
      {showReschedulePopup && rescheduleValidation && reschedulePending && (
        <RescheduleValidationPopup
          workoutId={reschedulePending.workoutId}
          workoutName={reschedulePending.workoutName}
          oldDate={reschedulePending.oldDate}
          newDate={reschedulePending.newDate}
          validation={rescheduleValidation}
          onConfirm={async () => {
            if (!reschedulePending || !updatePlannedWorkout) {
              console.error('[Reschedule] Missing reschedulePending or updatePlannedWorkout');
              return;
            }
            try {
              console.log('[Reschedule] Confirming reschedule:', reschedulePending);
              
              // Delete conflicting workouts (same type on same day)
              if (rescheduleValidation.conflicts?.sameTypeWorkouts) {
                for (const conflict of rescheduleValidation.conflicts.sameTypeWorkouts) {
                  try {
                    await deletePlannedWorkout(conflict.id);
                    console.log(`[Reschedule] Deleted conflicting workout: ${conflict.id}`);
                  } catch (err) {
                    console.error(`[Reschedule] Error deleting conflict ${conflict.id}:`, err);
                    // Continue anyway - the move will still work
                  }
                }
              }
              
              // Clear week_number and day_number so it's no longer tied to plan structure
              // This prevents the repairPlan function from reverting it to canonical date
              const result = await updatePlannedWorkout(reschedulePending.workoutId, {
                date: reschedulePending.newDate,
                week_number: null,
                day_number: null
              });
              
              console.log('[Reschedule] Update result:', result);
              
              // Trigger all invalidation events
              window.dispatchEvent(new CustomEvent('workouts:invalidate'));
              window.dispatchEvent(new CustomEvent('planned:invalidate'));
              window.dispatchEvent(new CustomEvent('week:invalidate'));
              
              setShowReschedulePopup(false);
              setReschedulePending(null);
              setRescheduleValidation(null);
              
              // Close the workout view to refresh
              setTimeout(() => {
                onClose();
              }, 100);
            } catch (err) {
              console.error('[Reschedule] Error rescheduling workout:', err);
              alert(`Error rescheduling workout: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }}
          onCancel={() => {
            setShowReschedulePopup(false);
            setReschedulePending(null);
            setRescheduleValidation(null);
          }}
          onSuggestionClick={async (date: string) => {
            if (!reschedulePending) return;
            try {
              const { data, error } = await supabase.functions.invoke('validate-reschedule', {
                body: {
                  workout_id: reschedulePending.workoutId,
                  new_date: date
                }
              });
              if (error) {
                console.error('Validation error:', error);
                return;
              }
              setRescheduleValidation(data);
              setReschedulePending({
                ...reschedulePending,
                newDate: date
              });
            } catch (err) {
              console.error('Error validating suggestion:', err);
            }
          }}
          onCoachOptionClick={async (option) => {
            if (!reschedulePending || !updatePlannedWorkout) return;

            try {
              if (option.action === 'move' && option.targetDateOffset !== undefined) {
                // Calculate target date
                const oldDateObj = new Date(reschedulePending.oldDate + 'T12:00:00');
                oldDateObj.setDate(oldDateObj.getDate() + option.targetDateOffset);
                const targetDate = oldDateObj.toISOString().split('T')[0];

                // Validate the move first
                const { data, error } = await supabase.functions.invoke('validate-reschedule', {
                  body: {
                    workout_id: reschedulePending.workoutId,
                    new_date: targetDate
                  }
                });

                if (error) {
                  console.error('[Reschedule] Validation error:', error);
                  alert('Error validating reschedule. Please try again.');
                  return;
                }

                // Delete conflicts if any
                if (data?.conflicts?.sameTypeWorkouts) {
                  for (const conflict of data.conflicts.sameTypeWorkouts) {
                    try {
                      await deletePlannedWorkout(conflict.id);
                      console.log(`[Reschedule] Deleted conflicting workout: ${conflict.id}`);
                    } catch (err) {
                      console.error(`[Reschedule] Error deleting conflict ${conflict.id}:`, err);
                    }
                  }
                }

                // Move the workout
                // Clear week_number and day_number so it's no longer tied to plan structure
                // This prevents the repairPlan function from reverting it to canonical date
                await updatePlannedWorkout(reschedulePending.workoutId, {
                  date: targetDate,
                  week_number: null,
                  day_number: null
                });

                // Trigger invalidation
                window.dispatchEvent(new CustomEvent('workouts:invalidate'));
                window.dispatchEvent(new CustomEvent('planned:invalidate'));
                window.dispatchEvent(new CustomEvent('week:invalidate'));

                // Close popup and workout view
                setShowReschedulePopup(false);
                setReschedulePending(null);
                setRescheduleValidation(null);
                setTimeout(() => onClose(), 100);
              } else if (option.action === 'skip') {
                // Skip the workout - mark as skipped or delete
                if (confirm(`Skip "${reschedulePending.workoutName}"? This will remove it from your plan.`)) {
                  await deletePlannedWorkout(reschedulePending.workoutId);

                  // Trigger invalidation
                  window.dispatchEvent(new CustomEvent('workouts:invalidate'));
                  window.dispatchEvent(new CustomEvent('planned:invalidate'));
                  window.dispatchEvent(new CustomEvent('week:invalidate'));

                  // Close popup and workout view
                  setShowReschedulePopup(false);
                  setReschedulePending(null);
                  setRescheduleValidation(null);
                  setTimeout(() => onClose(), 100);
                }
              } else if (option.action === 'split') {
                // Split functionality - show message for now
                alert('Split functionality coming soon. For now, you can manually create two shorter workouts on different days.');
              }
            } catch (err) {
              console.error('[Reschedule] Error executing coach option:', err);
              alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }}
        />
      )}
      {/* Instrument panel texture full-screen so it covers entire details (incl. splits) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          zIndex: 20,
          opacity: 1,
          mixBlendMode: 'soft-light',
          backgroundColor: 'rgba(0,0,0,0.22)',
          backgroundImage: `
            repeating-linear-gradient(0deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 1px, transparent 1px, transparent 9px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 9px),
            linear-gradient(45deg, rgba(255,255,255,0.65) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.52) 1px, transparent 1px),
            linear-gradient(45deg, rgba(255,255,255,0.40) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.34) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px, 20px 20px, 20px 20px, 20px 20px, 40px 40px, 40px 40px',
          backgroundPosition: 'center, center, center, center, center, center',
          backgroundBlendMode: 'soft-light, soft-light, soft-light, soft-light, soft-light, soft-light',
          filter: 'blur(0.2px) contrast(1.12)',
        }}
      />
    </div>
  );
};

export default UnifiedWorkoutView;
