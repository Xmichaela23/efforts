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
import { useWorkoutDetail } from '@/hooks/useWorkoutDetail';

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
  const hasLink = Boolean((workout as any)?.planned_id);
  const [activeTab, setActiveTab] = useState<string>(initialTab || (isCompleted ? (hasLink ? 'summary' : 'completed') : 'planned'));
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
        // Server-first: if steps missing, materialize on server (tokens/structure/description)
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
        } catch {}

        // Fallback: client expansion from steps tokens (last resort)
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

        const linkId = String((workout as any)?.planned_id || linkedPlanned?.id || hydratedPlanned?.id || '');
        if (!linkId) {
          try { await supabase.functions.invoke('auto-attach-planned', { body: { workout_id: wid } } as any); } catch {}
        }
        try { await supabase.functions.invoke('compute-workout-summary', { body: { workout_id: wid } } as any); } catch {}
        try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
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

  // --- Overall execution score (always call hook; provide empty inputs when unlinked) ---
  const isLinked = Boolean((workout as any)?.planned_id) || Boolean(linkedPlanned?.id);
  const plannedRowForScore: any = (hydratedPlanned || linkedPlanned) as any;
  const plannedStepsForScore: any[] = Array.isArray(plannedRowForScore?.computed?.steps) && isLinked ? plannedRowForScore.computed.steps : [];
  const executedIntervalsForScore: any[] = Array.isArray((workout as any)?.computed?.intervals) && isLinked ? (workout as any).computed.intervals : [];
  const workoutTypeForScore = String((workout as any)?.type || plannedRowForScore?.type || '').toLowerCase();
  const { score: overallScoreRaw, methodLabel: overallMethod } = useExecutionScore(
    workoutTypeForScore,
    plannedStepsForScore,
    executedIntervalsForScore
  );
  // Fallback overall score when mapping is missing: compare simple plan target vs actual
  const computeSimpleScore = (): number | null => {
    if (!isLinked) return null;
    const noMapping = plannedStepsForScore.length === 0 || executedIntervalsForScore.length === 0;
    if (!noMapping) return null;
    const sport = workoutTypeForScore;
    try {
      if (sport === 'ride' || sport === 'bike') {
        const planText = String((plannedRowForScore as any)?.rendered_description || (plannedRowForScore as any)?.description || '').toLowerCase();
        const targetRange = planText.match(/(\d+)\s*[–-]\s*(\d+)\s*w/);
        const targetSingle = planText.match(/@\s*(\d+)\s*w/) || planText.match(/\b(\d+)\s*w\b/);
        let target = null as number | null;
        if (targetRange) {
          const lo = parseInt(targetRange[1], 10); const hi = parseInt(targetRange[2], 10);
          if (Number.isFinite(lo) && Number.isFinite(hi) && hi>0) target = Math.round((lo+hi)/2);
        } else if (targetSingle) {
          const v = parseInt(targetSingle[1], 10); if (Number.isFinite(v) && v>0) target = v;
        }
        const overall = (completedData as any)?.computed?.overall || {};
        const actual = (completedData as any)?.avg_power
          ?? (completedData as any)?.metrics?.avg_power
          ?? overall.avg_power_w
          ?? overall.avg_power
          ?? null;
        if (target && typeof actual === 'number' && actual>0) {
          return Math.max(0, Math.round((actual / target) * 100));
        }
      }
      if (sport === 'run' || sport === 'walk') {
        // Compare pace: planned token like 8:30/mi in plan text
        const planText = String((plannedRowForScore as any)?.rendered_description || (plannedRowForScore as any)?.description || '').toLowerCase();
        const m = planText.match(/(\d+):(\d{2})\s*\/mi/);
        // Actual pace seconds per mile
        let secPerMi: number | null = null;
        const overall = (completedData as any)?.computed?.overall || {};
        {
          const paceRaw = Number(overall.avg_pace_s_per_mi);
          if (Number.isFinite(paceRaw)) {
            let v = paceRaw;
          // Normalize if stored in deciseconds (e.g., 6260 for 10:26)
          if (v > 1000) v = Math.round(v / 10);
          secPerMi = v;
          }
        }
        // Prefer distance/time calculation using meters to avoid unit confusion
        if (secPerMi == null) {
          const meters = Number((completedData as any)?.metrics?.distance_meters ?? overall.distance_m);
          const moving = Number((completedData as any)?.moving_time ?? (completedData as any)?.metrics?.moving_time ?? overall.duration_s_moving ?? overall.duration_s);
          if (Number.isFinite(meters) && meters>0 && Number.isFinite(moving) && moving>0) {
            const miles = meters / 1609.34;
            if (miles>0.05) secPerMi = Math.round(moving / miles);
          }
        }
        if (secPerMi == null) {
          const metricsPaceKm = (completedData as any)?.metrics?.avg_pace as number | undefined; // sec/km
          if (Number.isFinite(metricsPaceKm)) secPerMi = Math.round((metricsPaceKm as number) * 1.60934);
        }
        if (secPerMi == null) {
          const moving = Number((completedData as any)?.moving_time ?? (completedData as any)?.metrics?.moving_time);
          const distKmAssumed = Number((completedData as any)?.distance ?? (completedData as any)?.metrics?.distance_km);
          if (moving>0 && distKmAssumed>0) secPerMi = Math.round((moving / (distKmAssumed * 0.621371)));
        }
        if (m && secPerMi && secPerMi>0) {
          const target = parseInt(m[1],10)*60 + parseInt(m[2],10);
          if (target>0) {
            // Lower is better for pace → adherence = target/actual
            return Math.max(0, Math.round((target / secPerMi) * 100));
          }
        }
      }
    } catch {}
    return null;
  };
  const simpleScore = computeSimpleScore();
  const overallScore = (simpleScore != null ? simpleScore : (isLinked ? overallScoreRaw : null));

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
        <div className="flex items-center gap-2">
          {isCompleted && (
            (!workout.planned_id && !linkedPlanned) ? (
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
                    const pid = String((workout as any).planned_id || (linkedPlanned as any)?.id || '');
                    if (!pid) return;
                    // disable re-link noise then detach
                    suppressRelinkUntil.current = Date.now() + 15000; // 15s
                    // Soft-unattach only switches UI state; preserve DB linkage unless user confirms destructive unattach
                    try {
                      await supabase.from('planned_workouts').update({ workout_status: 'planned' } as any).eq('id', pid);
                    } catch {}
                    setLinkedPlanned(null);
                    try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                    try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                    setActiveTab('completed');
                  } catch {}
                }}
              >Unattach</Button>
            )
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
            <BarChart3 className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2 py-1 data-[state=active]:bg-transparent data-[state=active]:text-black data-[state=active]:underline data-[state=inactive]:text-gray-500 hover:text-gray-700">
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
              // Show inline launcher for planned sessions (strength and mobility)
              const row = isCompleted ? (linkedPlanned || null) : workout;
              const isPlanned = String((row as any)?.workout_status || '').toLowerCase() === 'planned';
              const type = String((row as any)?.type || '').toLowerCase();
              if (!row || !isPlanned || (type!=='strength' && type!=='mobility')) return null;
              const handleClick = () => {
                try {
                  const rowAny: any = row as any;
                  const basePlanned = rowAny?.planned && typeof rowAny.planned === 'object' ? { ...rowAny.planned } : { ...rowAny };
                  // Always include date/type/name for the logger header and fallbacks
                  basePlanned.date = rowAny?.date || basePlanned.date;
                  basePlanned.type = (type==='mobility') ? 'strength' : (basePlanned.type || type || 'strength');
                  basePlanned.name = basePlanned.name || (type==='mobility' ? 'Mobility Session' : 'Strength');

                  if (type==='strength') {
                    window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: basePlanned } }));
                  } else {
                    // Map mobility → strength format (sets×reps)
                    const raw = (rowAny?.planned?.mobility_exercises ?? rowAny?.mobility_exercises) as any;
                    const arr: any[] = Array.isArray(raw) ? raw : [];
                    const parsed = arr.map((m:any)=>{
                      const name = String(m?.name||'').trim() || 'Mobility';
                      const notes = String(m?.description || m?.notes || '').trim();
                      const durTxt = String(m?.duration || m?.plannedDuration || '').toLowerCase();
                      let sets = 1; let reps = 0;
                      const mr = durTxt.match(/(\d+)\s*x\s*(\d+)/i) || durTxt.match(/(\d+)\s*sets?\s*of\s*(\d+)/i);
                      if (mr) { sets = parseInt(mr[1],10)||1; reps = parseInt(mr[2],10)||0; }
                      return { name, sets, reps, weight: 0, notes };
                    });
                    const plannedForStrength = { ...basePlanned, type: 'strength', strength_exercises: parsed } as any;
                    window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: plannedForStrength } }));
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
            {isCompleted && !isLinked ? (
              <div className="px-3 py-2 text-sm text-gray-600">Attach this workout to a planned session to see planned vs actual.</div>
            ) : (
              <MobileSummary 
                planned={isCompleted ? (hydratedPlanned || linkedPlanned || null) : (hydratedPlanned || workout)} 
                completed={isCompleted ? completedData : null}
                hideTopAdherence
              />
            )}
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
