import { useState, useEffect, useCallback } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';

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
  /** Target finish time in seconds (event goals), from DB */
  target_time?: number | null;
  /** v1 tri projection (server) — _shared/race-projections */
  projection?: Record<string, unknown> | null;
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
      const userId = getStoredUserId();
      if (!userId) {
        setGoals([]);
        return;
      }
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
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

  useEffect(() => {
    const onInvalidate = () => {
      void refreshGoals();
    };
    window.addEventListener('goals:invalidate', onInvalidate);
    return () => window.removeEventListener('goals:invalidate', onInvalidate);
  }, [refreshGoals]);

  const addGoal = useCallback(async (goal: GoalInsert): Promise<Goal | null> => {
    try {
      const userId = getStoredUserId();
      if (!userId) return null;
      const toInsert = {
        ...goal,
        user_id: userId,
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
      const userId = getStoredUserId();
      if (!userId) return null;
      const { data, error } = await supabase
        .from('goals')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
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

  const deleteGoal = useCallback(async (id: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const userId = getStoredUserId();
      if (!userId) return { ok: false, message: 'Not signed in.' };
      // Server-side cascade: tears down linked plan(s), invalidates coach cache,
      // recomputes projections on remaining goals, and (when the deleted goal
      // was on a combined plan with siblings) rebuilds the season plan.
      const { data, error } = await supabase.functions.invoke('delete-goal', {
        body: { goal_id: id, user_id: userId },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { success?: boolean; message?: string; error?: string };
      if (!payload.success) {
        return { ok: false, message: String(payload.error || 'Delete failed.') };
      }
      setGoals((prev) => prev.filter((g) => g.id !== id));
      window.dispatchEvent(new CustomEvent('plans:invalidate'));
      window.dispatchEvent(new CustomEvent('goals:invalidate'));
      return { ok: true, message: String(payload.message || 'Goal removed.') };
    } catch (err) {
      console.error('Error deleting goal:', err);
      return { ok: false, message: err instanceof Error ? err.message : 'Delete failed.' };
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
