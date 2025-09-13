import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PlannedWorkout } from '@/components/PlannedWorkoutView';

export const usePlannedWorkouts = () => {
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Get current user
  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  };

  // Fetch all planned workouts for the current user
  const fetchPlannedWorkouts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const user = await getCurrentUser();
      if (!user) {
        throw new Error('User must be authenticated to fetch planned workouts');
      }

      // Bound by date window to avoid loading entire history/future at once
      const todayIso = new Date().toISOString().slice(0, 10);
      const pastIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // last 7 days
      const futureIso = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // next ~4 months

      const { data, error } = await supabase
        .from('planned_workouts')
        .select('id,name,type,date,description,duration,workout_status,training_plan_id,week_number,day_number,tags,strength_exercises,computed,steps_preset,export_hints,rendered_description,units,completed_workout_id')
        .eq('user_id', user.id)
        .gte('date', pastIso)
        .lte('date', futureIso)
        .order('date', { ascending: true })
        .limit(1000);

      if (error) {
        throw error;
      }

      // Transform the data to match our PlannedWorkout interface
      const transformedWorkouts: PlannedWorkout[] = (data || [])
        // Don't filter anything - show all planned workouts for auto-attachment
        .map(workout => {
        // Normalize JSONB fields that may come back as strings
        const parseMaybeJson = (v: any) => {
          if (v == null) return v;
          if (typeof v === 'string') {
            try { return JSON.parse(v); } catch { return v; }
          }
          return v;
        };
        const stepsPreset = Array.isArray(workout.steps_preset)
          ? workout.steps_preset
          : Array.isArray(parseMaybeJson(workout.steps_preset))
            ? parseMaybeJson(workout.steps_preset)
            : [];
        const exportHints = parseMaybeJson(workout.export_hints) || null;
        const computed = parseMaybeJson((workout as any).computed) || null;
        const rendered = (workout as any).rendered_description || undefined;
        const units = (workout as any).units || undefined;
        const parsedTags = (() => {
          const raw = (workout as any).tags;
          if (Array.isArray(raw)) return raw as any[];
          if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {} }
          return [] as any[];
        })();
        // Parse view/expansion hints from DB columns (preferred) or from tags (schema-safe)
        const displayOverrides = parseMaybeJson((workout as any).display_overrides) || null;
        const expandSpecDb = parseMaybeJson((workout as any).expand_spec) || null;
        const paceAnnotationDb = (workout as any).pace_annotation || null;
        const parseExpandSpecFromTags = (tagsArr: string[]) => {
          const out: any = {};
          const idPrefixTag = tagsArr.find(t=>/^idprefix:/i.test(String(t)));
          if (idPrefixTag) out.id_prefix = String(idPrefixTag.split(':')[1]||'').trim();
          const expandTag = tagsArr.find(t=>/^expand:/i.test(String(t)));
          if (expandTag){
            const body = expandTag.split(':')[1] || '';
            const parts = body.split(';');
            for (const p of parts){
              const [k,v] = p.split('=');
              const key = String(k||'').trim().toLowerCase();
              const val = String(v||'').trim().toLowerCase();
              if (!key) continue;
              if (key === 'reps') out.reps = Number(val);
              if (key === 'omit_last_rest') out.omit_last_rest = (val==='1' || val==='true');
              if (key === 'work'){
                if (/^\d+\s*s$/.test(val)) { out.work = { time_s: Number(val.replace(/\D/g,'')) }; }
                else if (/^\d+\s*m$/.test(val)) { out.work = { distance_m: Number(val.replace(/\D/g,'')) }; }
                else if (/^\d+\s*mi$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.work = { distance_m: Math.round(n*1609.34) }; }
                else if (/^\d+\s*km$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.work = { distance_m: Math.round(n*1000) }; }
              }
              if (key === 'rest'){
                if (/^\d+\s*s$/.test(val)) { out.rest = { time_s: Number(val.replace(/\D/g,'')) }; }
                else if (/^\d+\s*m$/.test(val)) { out.rest = { distance_m: Number(val.replace(/\D/g,'')) }; }
                else if (/^\d+\s*mi$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.rest = { distance_m: Math.round(n*1609.34) }; }
                else if (/^\d+\s*km$/.test(val)) { const n = Number(val.replace(/\D/g,'')); out.rest = { distance_m: Math.round(n*1000) }; }
              }
            }
          }
          return (out.reps && (out.work || out.rest)) ? out : null;
        };
        const parseDisplayOverridesFromTags = (tagsArr: string[]) => {
          const view = tagsArr.find(t=>/^view:/i.test(String(t)));
          const pace = tagsArr.find(t=>/^pace_annotation:/i.test(String(t)));
          const ov: any = {};
          if (view && String(view.split(':')[1]||'').toLowerCase()==='unpack') ov.planned_detail = 'unpack';
          const pa = pace ? String(pace.split(':')[1]||'').toLowerCase() : '';
          return { overrides: Object.keys(ov).length?ov:null, pace_annotation: pa||null };
        };
        const { overrides: displayOverridesFromTags, pace_annotation: paceAnnoFromTags } = parseDisplayOverridesFromTags(parsedTags.map(String));
        const expandSpecFromTags = parseExpandSpecFromTags(parsedTags.map(String));

        return {
          id: workout.id,
          name: workout.name,
          type: workout.type,
          date: workout.date,
          description: workout.description,
          duration: workout.duration,
          intervals: workout.intervals || [],
          strength_exercises: parseMaybeJson(workout.strength_exercises) || [],
          workout_status: workout.workout_status,
          source: workout.source,
          training_plan_id: workout.training_plan_id,
          week_number: workout.week_number,
          day_number: workout.day_number,
          // ensure association is visible to consumers
          completed_workout_id: (workout as any).completed_workout_id || null,
          
          // expose tags for UI filters
          // @ts-ignore
          tags: parsedTags,
          // expose for optional activation UI
          // @ts-ignore
          steps_preset: stepsPreset,
          // @ts-ignore
          export_hints: exportHints,
          // @ts-ignore
          rendered_description: rendered,
          // @ts-ignore
          computed,
          // @ts-ignore
          units,
          // View hints (DB columns take precedence over tag-encoded hints)
          // @ts-ignore
          display_overrides: displayOverrides || displayOverridesFromTags || null,
          // @ts-ignore
          expand_spec: expandSpecDb || expandSpecFromTags || null,
          // @ts-ignore
          pace_annotation: paceAnnotationDb || paceAnnoFromTags || null,
        } as any;
      });

      setPlannedWorkouts(transformedWorkouts);
    } catch (err) {
      console.error('Error fetching planned workouts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch planned workouts');
    } finally {
      setLoading(false);
    }
  }, []);

  // React Query integration: keep cache warm and allow invalidation
  const { refetch } = useQuery({
    queryKey: ['planned', 'windowed'],
    queryFn: fetchPlannedWorkouts,
    // small stale window; avoid refetch on focus to keep UI snappy
    staleTime: 1000 * 60 * 3,
    cacheTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Add a new planned workout
  const addPlannedWorkout = async (workoutData: Omit<PlannedWorkout, 'id'>) => {
    try {
      setError(null);

      const user = await getCurrentUser();
      if (!user) {
        throw new Error('User must be authenticated to save planned workouts');
      }

      console.log('🔧 Adding planned workout for user:', user.id);
      console.log('🔍 DEBUG - Planned workout data to save:', workoutData);

      const toSave = {
        name: workoutData.name,
        type: workoutData.type,
        date: workoutData.date,
        duration: workoutData.duration,
        description: workoutData.description || '',
        intervals: workoutData.intervals || [],
        strength_exercises: workoutData.strength_exercises || [],
        workout_status: workoutData.workout_status || 'planned',
        source: workoutData.source || 'manual',
        training_plan_id: workoutData.training_plan_id,
        week_number: workoutData.week_number,
        day_number: workoutData.day_number,
        user_id: user.id
      };

      console.log('🔧 Saving planned workout:', toSave);

      const { data, error } = await supabase
        .from('planned_workouts')
        .insert([toSave])
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving planned workout:', error);
        throw error;
      }

      const newWorkout: PlannedWorkout = {
        id: data.id,
        name: data.name,
        type: data.type,
        date: data.date,
        description: data.description,
        duration: data.duration,
        intervals: data.intervals || [],
        strength_exercises: data.strength_exercises || [],
        workout_status: data.workout_status,
        source: data.source,
        training_plan_id: data.training_plan_id,
        week_number: data.week_number,
        day_number: data.day_number
      };

      console.log('✅ Successfully created planned workout:', newWorkout);
      setPlannedWorkouts(prev => [newWorkout, ...prev]);
      return newWorkout;
    } catch (err) {
      console.error('❌ Error in addPlannedWorkout:', err);
      setError(err instanceof Error ? err.message : 'Failed to add planned workout');
      throw err;
    }
  };

  // Update an existing planned workout
  const updatePlannedWorkout = async (id: string, updates: Partial<PlannedWorkout>) => {
    try {
      setError(null);

      const user = await getCurrentUser();
      if (!user) {
        throw new Error('User must be authenticated to update planned workouts');
      }

      const { data, error } = await supabase
        .from('planned_workouts')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const updatedWorkout: PlannedWorkout = {
        id: data.id,
        name: data.name,
        type: data.type,
        date: data.date,
        description: data.description,
        duration: data.duration,
        intervals: data.intervals || [],
        strength_exercises: data.strength_exercises || [],
        workout_status: data.workout_status,
        source: data.source,
        training_plan_id: data.training_plan_id,
        week_number: data.week_number,
        day_number: data.day_number
      };

      setPlannedWorkouts(prev => 
        prev.map(workout => 
          workout.id === id ? updatedWorkout : workout
        )
      );

      return updatedWorkout;
    } catch (err) {
      console.error('Error updating planned workout:', err);
      setError(err instanceof Error ? err.message : 'Failed to update planned workout');
      throw err;
    }
  };

  // Delete a planned workout
  const deletePlannedWorkout = async (id: string) => {
    try {
      setError(null);

      const user = await getCurrentUser();
      if (!user) {
        throw new Error('User must be authenticated to delete planned workouts');
      }

      const { error } = await supabase
        .from('planned_workouts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setPlannedWorkouts(prev => prev.filter(workout => workout.id !== id));
    } catch (err) {
      console.error('Error deleting planned workout:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete planned workout');
      throw err;
    }
  };

  // Get planned workouts for a specific date
  const getPlannedWorkoutsForDate = useCallback((date: string) => {
    return plannedWorkouts.filter(workout => workout.date === date);
  }, [plannedWorkouts]);

  // Get planned workouts by type
  const getPlannedWorkoutsByType = useCallback((type: PlannedWorkout['type']) => {
    return plannedWorkouts.filter(workout => workout.type === type);
  }, [plannedWorkouts]);

  // Get planned workouts by status
  const getPlannedWorkoutsByStatus = useCallback((status: PlannedWorkout['workout_status']) => {
    return plannedWorkouts.filter(workout => workout.workout_status === status);
  }, [plannedWorkouts]);

  // Mark workout as completed (this would typically move it to the completed workouts system)
  const markWorkoutCompleted = async (id: string) => {
    try {
      await updatePlannedWorkout(id, { workout_status: 'completed' });
      // Note: In a full implementation, you might want to move this to the completed workouts table
      // and remove it from planned workouts, or keep it for comparison purposes
    } catch (err) {
      console.error('Error marking workout as completed:', err);
      throw err;
    }
  };

  // Initialize on mount (first fetch)
  useEffect(() => {
    fetchPlannedWorkouts();
  }, [fetchPlannedWorkouts]);

  // Refresh when other views broadcast invalidation
  useEffect(() => {
    const handler = () => {
      // use refetch to collaborate with React Query cache
      refetch();
    };
    window.addEventListener('planned:invalidate', handler);
    return () => window.removeEventListener('planned:invalidate', handler);
  }, [refetch, fetchPlannedWorkouts]);

  return {
    plannedWorkouts,
    loading,
    error,
    addPlannedWorkout,
    updatePlannedWorkout,
    deletePlannedWorkout,
    markWorkoutCompleted,
    getPlannedWorkoutsForDate,
    getPlannedWorkoutsByType,
    getPlannedWorkoutsByStatus,
    refresh: async () => { await queryClient.invalidateQueries({ queryKey: ['planned'] }); await refetch(); }
  };
};
