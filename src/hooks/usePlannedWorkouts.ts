import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { mapUnifiedItemToPlanned } from '@/utils/workout-mappers';
type PlannedWorkout = any;

/** Use server-provided planned_workout when present (smart server, dumb client) */
const toPlannedWorkout = (item: any): PlannedWorkout =>
  item?.planned_workout ?? mapUnifiedItemToPlanned(item);

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

      // Use get-week edge function (SMART SERVER) - fetches unified data with computed
      const todayIso = new Date().toISOString().slice(0, 10);
      const pastIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // last 7 days
      const futureIso = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // next ~4 months

      const { data, error } = await supabase.functions.invoke('get-week', { 
        body: { from: pastIso, to: futureIso } 
      });

      if (error) {
        throw error;
      }

      const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
      const plannedItems = items.filter((it: any) => !!it?.planned);
      const transformedWorkouts: PlannedWorkout[] = plannedItems.map(toPlannedWorkout);
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
    // longer cache to avoid churn; no refetch on focus/mount
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: false,
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
        mobility_exercises: (workoutData as any).mobility_exercises || [],
        steps_preset: (workoutData as any).steps_preset || null,
        workout_status: workoutData.workout_status || 'planned',
        source: workoutData.source || 'manual',
        training_plan_id: workoutData.training_plan_id,
        week_number: workoutData.week_number,
        day_number: workoutData.day_number,
        user_id: user.id,
        // Pass-through swim pool fields if provided by UI
        pool_unit: (workoutData as any).pool_unit ?? null,
        pool_length_m: (workoutData as any).pool_length_m ?? null
      };

      console.log('🔧 Saving planned workout:', toSave);

      const { data, error } = await supabase
        .from('planned_workouts')
        .insert([toSave])
        .select('id,name,type,date,description,duration,intervals,strength_exercises,mobility_exercises,workout_status,source,training_plan_id,week_number,day_number')
        .single();

      if (error) {
        console.error('❌ Error saving planned workout:', error);
        throw error;
      }

      // Calculate workload for the new planned workout
      console.log('🔧 Calculating workload for new planned workout:', data.id, toSave.type);
      try {
        const { data: workloadData, error: workloadError } = await supabase.functions.invoke('calculate-workload', {
          body: {
            workout_id: data.id,
            workout_data: {
              type: toSave.type,
              duration: toSave.duration,
              steps_preset: toSave.steps_preset,
              strength_exercises: toSave.strength_exercises,
              mobility_exercises: toSave.mobility_exercises,
              workout_status: 'planned'
            }
          }
        });
        
        if (workloadError) {
          console.error('❌ Edge Function error for planned workout:', data.id, workloadError);
        } else {
          console.log('✅ Workload calculated for planned workout:', data.id, workloadData);
        }
      } catch (workloadError) {
        console.error('❌ Failed to calculate workload for planned workout:', data.id, workloadError);
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
        mobility_exercises: (data as any).mobility_exercises || [],
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
        .select('id,name,type,date,description,duration,intervals,strength_exercises,mobility_exercises,workout_status,source,training_plan_id,week_number,day_number')
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
        mobility_exercises: (data as any).mobility_exercises || [],
        workout_status: data.workout_status,
        source: data.source,
        training_plan_id: data.training_plan_id,
        week_number: data.week_number,
        day_number: data.day_number,
        // expose swim pool fields on client state
        pool_unit: (data as any).pool_unit || null,
        pool_length_m: (data as any).pool_length_m || null
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

  // Removed extra on-mount fetch; React Query owns fetching

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

// Lightweight Today-only planned query for fast initial render
export const usePlannedWorkoutsToday = (dateIso: string) => {
  const [rows, setRows] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRows([]); return; }
        // Use unified server feed to guarantee identical shape as weekly
        const { data, error } = await (supabase.functions.invoke as any)('get-week', { body: { from: dateIso, to: dateIso } });
        if (error) throw error;
        const items: any[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
        // Use mapper - SINGLE SOURCE OF TRUTH
        const plannedForDay = items
          .filter((it:any)=> !!it?.planned)
          .map((it:any)=> toPlannedWorkout(it));
        if (!cancelled) setRows(plannedForDay as any);
      } catch (e:any) {
        if (!cancelled) setError(e?.message || 'Failed to load planned workouts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dateIso]);

  return { plannedToday: rows, loading, error };
};
