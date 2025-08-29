import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PlannedWorkout } from '@/components/PlannedWorkoutView';

export const usePlannedWorkouts = () => {
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .select('*')
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
        // Filter out optional-tagged planned until user activates (optional tag removed)
        .filter((w: any) => {
          const tags: any[] = Array.isArray((w as any).tags) ? (w as any).tags : [];
          return !tags.map(String).map((t:string)=>t.toLowerCase()).includes('optional');
        })
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

        return {
          id: workout.id,
          name: workout.name,
          type: workout.type,
          date: workout.date,
          description: workout.description,
          duration: workout.duration,
          intervals: workout.intervals || [],
          strength_exercises: workout.strength_exercises || [],
          workout_status: workout.workout_status,
          source: workout.source,
          training_plan_id: workout.training_plan_id,
          week_number: workout.week_number,
          day_number: workout.day_number,
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

  // Initialize on mount
  useEffect(() => {
    fetchPlannedWorkouts();
  }, [fetchPlannedWorkouts]);

  // Refresh when other views broadcast invalidation
  useEffect(() => {
    const handler = () => {
      fetchPlannedWorkouts();
    };
    window.addEventListener('planned:invalidate', handler);
    return () => window.removeEventListener('planned:invalidate', handler);
  }, [fetchPlannedWorkouts]);

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
    refresh: fetchPlannedWorkouts
  };
};
