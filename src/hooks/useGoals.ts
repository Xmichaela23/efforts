import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  goal_type: 'event' | 'capacity' | 'maintenance';
  target_date: string | null;
  sport: string | null;
  distance: string | null;
  course_profile: Record<string, any>;
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
  priority: 'A' | 'B' | 'C';
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  training_prefs: Record<string, any>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type GoalInsert = Omit<Goal, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshGoals = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setGoals([]);
        return;
      }
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setGoals((data ?? []) as Goal[]);
    } catch (err) {
      console.error('Error fetching goals:', err);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshGoals();
  }, [refreshGoals]);

  const addGoal = useCallback(async (goal: GoalInsert): Promise<Goal | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const toInsert = {
        ...goal,
        user_id: user.id,
        course_profile: goal.course_profile ?? {},
        training_prefs: goal.training_prefs ?? {},
      };
      const { data, error } = await supabase
        .from('goals')
        .insert([toInsert])
        .select()
        .single();
      if (error) throw error;
      const created = data as Goal;
      setGoals((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      console.error('Error adding goal:', err);
      return null;
    }
  }, []);

  const updateGoal = useCallback(async (id: string, updates: Partial<Goal>): Promise<Goal | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      const updated = data as Goal;
      setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)));
      return updated;
    } catch (err) {
      console.error('Error updating goal:', err);
      return null;
    }
  }, []);

  const deleteGoal = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      setGoals((prev) => prev.filter((g) => g.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting goal:', err);
      return false;
    }
  }, []);

  return {
    goals,
    loading,
    addGoal,
    updateGoal,
    deleteGoal,
    refreshGoals,
  };
}
