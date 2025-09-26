import React, { useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { X, Calendar, BarChart3, CheckCircle } from 'lucide-react';
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
import { useExecutionScore } from '@/hooks/useExecutionScore';

interface UnifiedWorkoutViewProps {
  workout: any;
  onClose: () => void;
  onUpdateWorkout?: (workoutId: string, updates: any) => void;
  onDelete?: (workoutId: string) => void;
  initialTab?: 'planned' | 'summary' | 'completed';
  origin?: 'today' | 'weekly' | 'other';
}

const UnifiedWorkoutView: React.FC<UnifiedWorkoutViewProps> = ({
  workout,
  onClose,
  onUpdateWorkout,
  onDelete,
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
  const [activeTab, setActiveTab] = useState<string>(initialTab || (isCompleted ? 'completed' : 'planned'));
  const [editingInline, setEditingInline] = useState(false);
  const [assocOpen, setAssocOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [linkedPlanned, setLinkedPlanned] = useState<any | null>(null);
  const [hydratedPlanned, setHydratedPlanned] = useState<any | null>(null);
  const recomputeGuardRef = useRef<Set<string>>(new Set());
  // Suppress auto re-link fallback briefly after an explicit Unattach
  const suppressRelinkUntil = useRef<number>(0);

  // Unified week data for the workout's date (single-day window)
  const dateIso = String((workout as any)?.date || '').slice(0,10);
  const { items: unifiedItems = [] } = useWeekUnified(dateIso, dateIso);

  // Resolve linked planned row for completed workouts
  useEffect(() => {
    (async () => {
      if (!isCompleted) { 
        setLinkedPlanned(null); 
        return; 
      }

      // 1) If workout already has planned_id, try to resolve from unified items
      const pid = (workout as any)?.planned_id as string | undefined;
      if (pid) {
        const fromUnified = (Array.isArray(unifiedItems)?unifiedItems:[]).find((it:any)=> String(it?.planned?.id||'') === String(pid));
        if (fromUnified && fromUnified.planned) {
          setLinkedPlanned({ id: fromUnified.planned.id, date: fromUnified.date, type: fromUnified.type, computed: fromUnified.planned.steps ? { steps: fromUnified.planned.steps, total_duration_seconds: fromUnified.planned.total_duration_seconds } : null, description: fromUnified.planned.description, tags: fromUnified.planned.tags, workout_status: 'planned' });
          return;
        }
      }

      // 2) Skip legacy reverse-id path (completed_workout_id) – single-link model uses workouts.planned_id only

      // 3) Fallback: look for a same-day planned of same type in the context
      //    Skip this if we just explicitly unattached (to avoid immediate re-link UX)
      if (suppressRelinkUntil.current > Date.now()) {
        setLinkedPlanned(null);
        return;
      }
      
      // 2) Fallback: same-day planned via unified feed
      if ((workout as any).date && (workout as any).type) {
        const plannedUnified = (Array.isArray(unifiedItems)?unifiedItems:[]).find((it:any)=> String(it.date) === String((workout as any).date).slice(0,10) && String(it.type).toLowerCase() === String((workout as any).type).toLowerCase() && !!it.planned);
        if (plannedUnified && plannedUnified.planned) {
          setLinkedPlanned({ id: plannedUnified.planned.id, date: plannedUnified.date, type: plannedUnified.type, computed: plannedUnified.planned.steps ? { steps: plannedUnified.planned.steps, total_duration_seconds: plannedUnified.planned.total_duration_seconds } : null, description: plannedUnified.planned.description, tags: plannedUnified.planned.tags, workout_status: 'planned' });
          return;
        }
      }

      setLinkedPlanned(null);
    })();
  }, [isCompleted, workout?.id, (workout as any)?.planned_id, (workout as any)?.date, (workout as any)?.type]);

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
              if (isCompleted && (workout as any)?.id) {
                await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: String((workout as any).id) } });
                try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
              }
            }
          } catch {}
          return;
        }
        // First try in-place expansion from steps_preset (works for single workouts outside plan weeks)
        try {
          const readStepsPresetLocal = (src: any): string[] | undefined => {
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
          // Refresh the latest planned row first
          let row = linkedPlanned as any;
          try {
            const { data } = await supabase.from('planned_workouts').select('*').eq('id', String((linkedPlanned as any).id)).maybeSingle();
            if (data) row = data;
          } catch {}
          let stepsPreset = readStepsPresetLocal((row as any)?.steps_preset);
          const rowHasV3 = (() => { try { return Array.isArray((row as any)?.computed?.steps) && (row as any).computed.steps.length>0 && Number((row as any)?.computed?.total_duration_seconds) > 0; } catch { return false; }})();
          const needsInlineHydrate = !rowHasV3 && Array.isArray(stepsPreset) && stepsPreset.length>0;
          if (needsInlineHydrate) {
            const { data: { user } } = await supabase.auth.getUser();
            let baselines: any = {};
            try {
              const { data: ub } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user?.id || '').maybeSingle();
              baselines = ub?.performance_numbers || {};
            } catch {}
            const { expand } = await import('@/services/plans/expander');
            const { resolveTargets, totalDurationSeconds } = await import('@/services/plans/targets');
            const atomic: any[] = expand(stepsPreset || [], (row as any).main, (row as any).tags);
            const resolved0: any[] = resolveTargets(atomic as any, baselines, ((row as any).export_hints || {}), String((row as any).type||'').toLowerCase());
            // Guarantee stable IDs on all steps (required for server mapping)
            const resolved: any[] = (resolved0 || []).map((st:any)=> ({ id: st?.id || (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`), ...st }));
            if (Array.isArray(resolved) && resolved.length) {
              const total = totalDurationSeconds(resolved as any);
              const update = { computed: { normalization_version: 'v3', steps: resolved, total_duration_seconds: total }, duration: Math.round(total/60) } as any;
              await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
              const authoritativeTotal = Number((row as any)?.total_duration_seconds);
              const merged = { ...row, ...(Number.isFinite(authoritativeTotal) && authoritativeTotal>0 ? { total_duration_seconds: authoritativeTotal } : {}), ...update };
              setLinkedPlanned(merged);
              try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
              try {
                if (isCompleted && (workout as any)?.id) {
                  await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: String((workout as any).id) } });
                  try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                }
              } catch {}
              return;
            }
          }
        } catch {}

        // Fallback removed: server now materializes; rely on materialize-plan when needed
      } catch {}
    };
    // When switching to Summary tab, try a materialize pass
    if (activeTab === 'summary') ensureMaterialized();
  }, [linkedPlanned, activeTab]);

  // Auto-trigger server compute on Summary open when attached plan exists but intervals are missing or lack planned_step_id
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        if (!isCompleted) return;
        const wid = String((workout as any)?.id || '');
        const pid = String(((linkedPlanned as any)?.id || (workout as any)?.planned_id || ''));
        if (!wid || !pid) return;

        // Check existing computed intervals and mapping
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
        const needs = (!intervals || !intervals.length) || intervals.every((it:any)=> !it?.planned_step_id);
        if (needs) {
          await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: wid } });
          try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
        }
      } catch {}
    })();
  }, [activeTab, isCompleted, linkedPlanned?.id, workout?.id]);

  // Summary tab planned: read-only; no client materialization
  useEffect(() => {
    (async () => {
      try {
        if (activeTab !== 'summary') return;
        const pid = String(((linkedPlanned as any)?.id || (workout as any)?.planned_id || ''));
        if (!pid) return;
        const { data: row } = await supabase
          .from('planned_workouts')
          .select('id,type,computed,steps_preset,export_hints,tags,workout_structure,rendered_description,description,name')
          .eq('id', pid)
          .maybeSingle();
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

        await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: wid } });
        try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
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
          await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: wid } });
          try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
        }
      } catch {}
    })();
  }, [activeTab, isCompleted, hydratedPlanned?.computed?.steps, workout?.id]);

  // If caller asks for a specific tab or the workout status changes (planned↔completed), update tab
  useEffect(() => {
    const desired = initialTab || (isCompleted ? 'completed' : 'planned');
    setActiveTab(desired);
  }, [initialTab, isCompleted, workout?.id]);

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
        const needsHydrate = !rowHasV3 && Array.isArray(stepsPreset) && stepsPreset.length>0;

        if (needsHydrate) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { setHydratedPlanned(row); return; }
          let baselines: any = {};
          try {
            const { data: ub } = await supabase.from('user_baselines').select('performance_numbers').eq('user_id', user.id).maybeSingle();
            baselines = ub?.performance_numbers || {};
          } catch {}
          try {
            const { expand } = await import('@/services/plans/expander');
            const { resolveTargets, totalDurationSeconds } = await import('@/services/plans/targets');
            const atomic: any[] = expand(stepsPreset || [], (row as any).main, (row as any).tags);
            const resolved: any[] = resolveTargets(atomic as any, baselines, ((row as any).export_hints || {}), String((row as any).type||'').toLowerCase());
            if (Array.isArray(resolved) && resolved.length) {
              const total = totalDurationSeconds(resolved as any);
              const update = {
                computed: { normalization_version: 'v3', steps: resolved, total_duration_seconds: total },
                duration: Math.round(total/60)
              } as any;
              await supabase.from('planned_workouts').update(update).eq('id', String(row.id));
              // Preserve authoritative DB total_duration_seconds if present on row
              const authoritativeTotal = Number((row as any)?.total_duration_seconds);
              setHydratedPlanned({ ...row, ...(Number.isFinite(authoritativeTotal) && authoritativeTotal>0 ? { total_duration_seconds: authoritativeTotal } : {}), ...update });
              try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
              return;
            }
          } catch {}
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
    } else if (workout.name && !workout.name.includes('Garmin Activity')) {
      const cleaned = humanize(String(workout.name));
      // If name looks like a provider code (had underscores or all-caps), prefer friendly sport
      if (/_/.test(String(workout.name)) || String(workout.name) === String(workout.name).toUpperCase()) {
        return friendlySport();
      }
      return cleaned;
    } else {
      return friendlySport();
    }
  };

  // --- Overall execution score inputs (computed once per render) ---
  const plannedRowForScore: any = (hydratedPlanned || linkedPlanned || (isCompleted ? workout : null)) as any;
  const computedStepsForScore: any[] = Array.isArray(plannedRowForScore?.computed?.steps) ? plannedRowForScore.computed.steps : [];
  const lightStepsForScore: any[] = Array.isArray((workout as any)?.computed?.planned_steps_light)
    ? (workout as any).computed.planned_steps_light.map((s:any)=> ({ id: s.planned_step_id, planned_index: s.planned_index, distanceMeters: s.meters, seconds: s.seconds }))
    : [];
  const plannedStepsForScore: any[] = computedStepsForScore.length ? computedStepsForScore : lightStepsForScore;
  const executedIntervalsForScore: any[] = Array.isArray((workout as any)?.computed?.intervals) ? (workout as any).computed.intervals : [];
  const workoutTypeForScore = String((workout as any)?.type || plannedRowForScore?.type || '').toLowerCase();
  const { score: overallScore, methodLabel: overallMethod } = useExecutionScore(
    workoutTypeForScore,
    plannedStepsForScore,
    executedIntervalsForScore
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-1 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100">
            <Calendar className="h-4 w-4" />
          </div>
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
                  // For completed workouts, try to get timestamp for time
                  if (workout.workout_status === 'completed' && workout.timestamp) {
                    const d = new Date(workout.timestamp);
                    if (!isNaN(d.getTime())) {
                      const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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
        {/* Close X removed per product decision; back handled by native nav */}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-transparent border-none">
          <TabsTrigger value="planned" className="flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <Calendar className="h-4 w-4" />
            Planned
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <BarChart3 className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
            <CheckCircle className="h-4 w-4" />
            Completed
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          {/* Planned Tab */}
          <TabsContent value="planned" className="flex-1 p-1">
            <StructuredPlannedView 
              workout={isCompleted ? (hydratedPlanned || linkedPlanned || workout) : (hydratedPlanned || workout)}
              showHeader={true}
            />
            {(() => {
              // Show inline launcher only for planned strength sessions (no card/frame)
              const row = isCompleted ? (linkedPlanned || null) : workout;
              const isPlanned = String((row as any)?.workout_status || '').toLowerCase() === 'planned';
              const isStrength = String((row as any)?.type || '').toLowerCase() === 'strength';
              if (!row || !isPlanned || !isStrength) return null;
              return (
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      try {
                        const planned = (row as any);
                        window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned } }));
                      } catch {}
                    }}
                  >Go to workout</Button>
                </div>
              );
            })()}
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary" className="flex-1 p-0">
            {/* Overall Execution card rendered inside MobileSummary to avoid duplication */}
            {isCompleted && (
              <div className="mb-1 flex items-center justify-end px-2">
                <div className="flex items-center gap-2">
                  {(!workout.planned_id && !linkedPlanned) ? (
                    <Button variant="ghost" size="sm" onClick={()=>setAssocOpen(true)}>Associate with planned…</Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async()=>{
                        try {
                          const pid = String((workout as any).planned_id || (linkedPlanned as any)?.id || '');
                          if (!pid) return;
                          await supabase.from('planned_workouts').update({ workout_status: 'planned', completed_workout_id: null }).eq('id', pid);
                          await supabase.from('workouts').update({ planned_id: null }).eq('id', workout.id);
                          try { (workout as any).planned_id = null; } catch {}
                          setLinkedPlanned(null);
                          suppressRelinkUntil.current = Date.now() + 15000; // 15s
                          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                          try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                        } catch {}
                      }}
                    >Unattach</Button>
                  )}
                  {String((workout as any)?.type||'').toLowerCase()==='strength' && (
                    <Button variant="ghost" size="sm" onClick={()=> setEditingInline(true)}>Edit</Button>
                  )}
                </div>
                {assocOpen && (
                  <AssociatePlannedDialog
                    workout={workout}
                    open={assocOpen}
                    onClose={()=>setAssocOpen(false)}
                    onAssociated={async(pid)=>{ 
                      try { (workout as any).planned_id = pid; } catch {}
                      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                      try {
                        const { data } = await supabase.from('planned_workouts').select('*').eq('id', pid).single();
                        setLinkedPlanned(data || null);
                        await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: String((workout as any)?.id) } });
                        try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                      } catch {}
                    }}
                  />
                )}
              </div>
            )}
            {(() => {
              if (overallScore == null) return null;
              const color = overallScore>=90 && overallScore<=110 ? 'text-green-600' : overallScore>=80 && overallScore<=120 ? 'text-yellow-600' : 'text-red-600';
              return (
                <div className="px-1 py-0.5">
                  <div className="flex flex-col items-center leading-tight">
                    <span className={`text-base font-semibold ${color}`}>{overallScore}%</span>
                    <span className="text-[12px] text-gray-700 font-medium truncate">{overallMethod}</span>
                  </div>
                </div>
              );
            })()}
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
            <MobileSummary 
              planned={isCompleted ? (hydratedPlanned || linkedPlanned || null) : (hydratedPlanned || workout)} 
              completed={isCompleted ? workout : null} 
            />
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
                      workoutData={workout}
                    />
                  </div>
                ) : workout.type === 'strength' ? (
                  <div className="p-4">
                    <h3 className="font-semibold mb-4">Strength Workout Completed</h3>
                    {/* Use StrengthCompletedView for strength workouts with sanitized sets */}
                    <StrengthCompletedView 
                      workoutData={{
                        ...workout,
                        strength_exercises: Array.isArray((workout as any).strength_exercises)
                          ? (workout as any).strength_exercises.map((ex: any) => ({
                              ...ex,
                              sets: Array.isArray(ex?.sets)
                                ? ex.sets.map((s: any) => ({
                                    reps: Number((s?.reps as any) ?? 0) || 0,
                                    weight: Number((s?.weight as any) ?? 0) || 0,
                                    rir: typeof s?.rir === 'number' ? s.rir : undefined,
                                    completed: Boolean(s?.completed)
                                  }))
                                : []
                            }))
                          : []
                      }}
                      plannedWorkout={linkedPlanned}
                    />
                    {assocOpen && (
                      <AssociatePlannedDialog
                        workout={workout}
                        open={assocOpen}
                        onClose={()=>setAssocOpen(false)}
                        onAssociated={async(pid)=>{ 
                          try { (workout as any).planned_id = pid; } catch {}
                          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                          try {
                            const { data } = await supabase.from('planned_workouts').select('*').eq('id', pid).single();
                            setLinkedPlanned(data || null);
                          } catch {}
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
