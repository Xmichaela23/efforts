import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { WorkoutInterval, SwimWorkoutData } from '@/contexts/AppContext';

interface Workout {
  id: string;
  name: string;
  type: 'run' | 'ride' | 'strength' | 'swim';
  duration: number;
  date: string;
  description: string;
  intervals?: WorkoutInterval[];
  swimData?: SwimWorkoutData;
}

export const useWorkouts = () => {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .order('date', { ascending: true });
      
      if (error) throw error;
      setWorkouts(data || []);
    } catch (error) {
      console.error('Error fetching workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const addWorkout = async (workout: Omit<Workout, 'id'>) => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .insert([workout])
        .select()
        .single();
      
      if (error) throw error;
      setWorkouts(prev => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Error adding workout:', error);
      throw error;
    }
  };

  const deleteWorkout = async (id: string) => {
    try {
      const { error } = await supabase
        .from('workouts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      setWorkouts(prev => prev.filter(w => w.id !== id));
    } catch (error) {
      console.error('Error deleting workout:', error);
      throw error;
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, []);

  return {
    workouts,
    loading,
    addWorkout,
    deleteWorkout,
    refetch: fetchWorkouts
  };
};