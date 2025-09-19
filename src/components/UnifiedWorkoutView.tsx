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
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { supabase } from '@/lib/supabase';

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

  const { deletePlannedWorkout, plannedWorkouts } = usePlannedWorkouts();
  const isCompleted = String(workout.workout_status || workout.status || '').toLowerCase() === 'completed';
  const [activeTab, setActiveTab] = useState<string>(initialTab || (isCompleted ? 'completed' : 'planned'));
  const [editingInline, setEditingInline] = useState(false);
  const [assocOpen, setAssocOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [linkedPlanned, setLinkedPlanned] = useState<any | null>(null);
  const [hydratedPlanned, setHydratedPlanned] = useState<any | null>(null);
  // Suppress auto re-link fallback briefly after an explicit Unattach
  const suppressRelinkUntil = useRef<number>(0);

  // Resolve linked planned row for completed workouts
  useEffect(() => {
    if (!isCompleted) { 
      setLinkedPlanned(null); 
      return; 
    }

    // 1) If workout already has planned_id, find it in the planned workouts context
    const pid = (workout as any)?.planned_id as string | undefined;
    if (pid) {
      const planned = plannedWorkouts.find(p => p.id === pid);
      console.log('🔍 Found linkedPlanned by planned_id in context:', {
        id: planned?.id,
        name: planned?.name,
        hasStrengthExercises: !!planned?.strength_exercises,
        strengthExercises: planned?.strength_exercises
      });
      setLinkedPlanned(planned || null);
      return;
    }

    // 2) Skip legacy reverse-id path (completed_workout_id) – single-link model uses workouts.planned_id only

    // 3) Fallback: look for a same-day planned of same type in the context
    //    Skip this if we just explicitly unattached (to avoid immediate re-link UX)
    if (suppressRelinkUntil.current > Date.now()) {
      setLinkedPlanned(null);
      return;
    }
    
    if ((workout as any).date && (workout as any).type) {
      const planned = plannedWorkouts.find(p => 
        p.type === (workout as any).type && 
        p.date === String((workout as any).date).slice(0,10) &&
        ['planned', 'in_progress'].includes(p.workout_status)
      );
      console.log('🔍 Found linkedPlanned by same-day fallback in context:', {
        id: planned?.id,
        name: planned?.name,
        hasStrengthExercises: !!planned?.strength_exercises,
        strengthExercises: planned?.strength_exercises
      });
      setLinkedPlanned(planned || null);
      return;
    }

    setLinkedPlanned(null);
  }, [isCompleted, workout?.id, (workout as any)?.planned_id, (workout as any)?.date, (workout as any)?.type, plannedWorkouts]);

  // Auto-materialize planned row if Summary is opened and computed steps are missing
  useEffect(() => {
    if (!linkedPlanned) return;
    const ensureMaterialized = async () => {
      try {
        const hasSteps = Array.isArray((linkedPlanned as any)?.computed?.steps) && (linkedPlanned as any).computed.steps.length>0;
        if (hasSteps) return;
        // Materialize using plan/week from the planned row
        const planId = (linkedPlanned as any)?.training_plan_id as string | undefined;
        const weekNum = Number((linkedPlanned as any)?.week_number);
        if (!planId || !Number.isFinite(weekNum) || weekNum < 1) return;
        try {
          const mod = await import('@/services/plans/ensureWeekMaterialized');
          await mod.ensureWeekMaterialized(String(planId), Number(weekNum));
          // Refetch this planned row to get computed.steps populated
          const { data } = await supabase.from('planned_workouts').select('*').eq('id', (linkedPlanned as any).id).single();
          setLinkedPlanned(data || null);
          try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
        } catch {}
      } catch {}
    };
    // When switching to Summary tab, try a materialize pass
    if (activeTab === 'summary') ensureMaterialized();
  }, [linkedPlanned, activeTab]);

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
              setHydratedPlanned({ ...row, ...update });
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
    // Handle Garmin activity types FIRST (more reliable than stored type)
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
    
    // Check stored type (for manually created workouts)
    if (workout.type === 'run') return 'run';
    if (workout.type === 'ride') return 'ride';
    if (workout.type === 'swim') return 'swim';
    if (workout.type === 'strength') return 'strength';
    if (workout.type === 'walk') return 'walk';
    
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
                         activityType.charAt(0).toUpperCase() + activityType.slice(1);
    
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

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
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
            {isCompleted && workout?.planned_id && String((workout as any)?.type || '').toLowerCase() !== 'strength' && (
              <div className="mt-1 inline-flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-200">
                  Auto-linked to plan
                </span>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            try {
              if (origin === 'today') {
                window.dispatchEvent(new CustomEvent('nav:back:today'));
              } else if (origin === 'weekly') {
                window.dispatchEvent(new CustomEvent('nav:back:weekly'));
              }
            } catch {}
            onClose();
          }}
          className="h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
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
          <TabsContent value="planned" className="flex-1 p-4">
            <StructuredPlannedView 
              workout={isCompleted ? (hydratedPlanned || linkedPlanned || workout) : (hydratedPlanned || workout)}
              showHeader={String(((isCompleted ? (hydratedPlanned || linkedPlanned || workout) : (hydratedPlanned || workout)) as any)?.type||'').toLowerCase()==='swim'}
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
          <TabsContent value="summary" className="flex-1 p-4">
            {isCompleted && (
              <div className="mb-3 flex items-center gap-3">
                {(!workout.planned_id && !linkedPlanned) ? (
                  <Button variant="ghost" size="sm" onClick={()=>setAssocOpen(true)}>Associate with planned…</Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async()=>{
                      try {
                        const pid = String((workout as any).planned_id || (linkedPlanned as any)?.id || '');
                        console.log('🔍 Unattaching workout:', { workoutId: workout.id, plannedId: pid, linkedPlanned });
                        if (!pid) return;
                        // 1) Detach primary planned row (single-link)
                        const { error: plannedError } = await supabase.from('planned_workouts').update({ workout_status: 'planned', completed_workout_id: null }).eq('id', pid);
                        console.log('🔍 Planned workout update result:', plannedError);
                        // 2) Clear workout link ONLY (preserve computed metrics)
                        const { error: workoutError } = await supabase.from('workouts').update({ planned_id: null }).eq('id', workout.id);
                        console.log('🔍 Workout update result:', workoutError);
                        // Optional: recompute summary is not required; keep metrics as-is
                        try { (workout as any).planned_id = null; } catch {}
                        setLinkedPlanned(null);
                        // Prevent immediate fallback re-link detection for a short window
                        suppressRelinkUntil.current = Date.now() + 15000; // 15s
                        console.log('🔍 Unattach complete, suppression until:', new Date(suppressRelinkUntil.current));
                        try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
                        try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                      } catch {}
                    }}
                  >Unattach</Button>
                )}
                {/* Edit (opens Strength Logger) */}
                {String((workout as any)?.type||'').toLowerCase()==='strength' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={()=> setEditingInline(true)}
                  >Edit</Button>
                )}
                {onDelete && workout?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      try {
                        if (!confirm('Delete this workout?')) return;
                        onDelete?.(String((workout as any).id));
                      } catch {}
                    }}
                  >Delete</Button>
                )}
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
                        // Immediately compute server summary so Summary tab reflects latest alignment
                        try {
                          await supabase.functions.invoke('compute-workout-summary', {
                            body: { workout_id: String((workout as any)?.id) }
                          });
                          try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
                        } catch {}
                      } catch {}
                    }}
                  />
                )}
              </div>
            )}
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
              planned={isCompleted ? (linkedPlanned || null) : workout} 
              completed={isCompleted ? workout : null} 
            />
          </TabsContent>

          {/* Completed Tab */}
          <TabsContent value="completed" className="flex-1 -mt-8 !mt-0">
            {isCompleted ? (
              <div className="h-full">
                {onDelete && workout?.id && (
                  <div className="p-4 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        try {
                          if (!confirm('Delete this workout?')) return;
                          onDelete?.(String((workout as any).id));
                        } catch {}
                      }}
                    >Delete</Button>
                  </div>
                )}
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
