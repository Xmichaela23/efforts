/**
 * useWeekUnified - DUMB CLIENT hook
 * 
 * Architecture:
 * - Calls get-week endpoint (smart server)
 * - Returns unified items with { planned, executed }
 * - NO client-side merging, matching, or computation
 * - Just renders what the server returns
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getStoredUserId } from '@/lib/supabase';

export type UnifiedItem = {
  id: string;
  date: string;
  type: string;
  status: 'planned' | 'completed' | 'skipped' | string | null;
  planned: any | null;
  executed: any | null;
};

export function useWeekUnified(fromISO: string, toISO: string) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(() => getStoredUserId());
  useEffect(() => {
    setUserId(getStoredUserId());
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setUserId(getStoredUserId());
      queryClient.invalidateQueries({ queryKey: ['weekUnified'] });
    });
    return () => subscription.unsubscribe();
  }, []);

  const queryKeyBase = ['weekUnified', 'me', userId, fromISO, toISO] as const;
  const enabled = !!userId;

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled,
    queryFn: async () => {
      if (!userId) return { items: [] } as any;
      const { data, error } = await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO } });
      if (error) throw error as any;
      const items: UnifiedItem[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
      return { 
        items,
        weekly_stats: (data as any)?.weekly_stats || { planned: 0, completed: 0 },
        training_plan_context: (data as any)?.training_plan_context || null,
      };
    },
    keepPreviousData: true,
    retry: false,
    staleTime: (import.meta.env?.DEV ? 5 : 60) * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // In unified mode, rely on standard query invalidation from navigations;
  // avoid global event-based invalidation to prevent render loops on calendar.
  // Allow targeted external refresh via `week:invalidate` (keepPreviousData prevents flicker)
  useEffect(() => {
    const handler = () => {
      try { queryClient.invalidateQueries({ queryKey: ['weekUnified'] }); } catch {}
    };
    window.addEventListener('week:invalidate', handler);
    return () => { window.removeEventListener('week:invalidate', handler); };
  }, [queryClient]);

  const items: UnifiedItem[] = (query.data as any)?.items || [];
  const weeklyStats = (query.data as any)?.weekly_stats || { planned: 0, completed: 0 };
  const trainingPlanContext = (query.data as any)?.training_plan_context || null;
  // v5: disabled queries stay `pending` with `fetchStatus: idle`, so `isPending` alone would spin forever.
  // Only show loading while a real fetch is in flight and we have no snapshot yet (keeps refetch from blanking UI).
  const loading = enabled && query.isFetching && query.data === undefined;
  return { items, weeklyStats, trainingPlanContext, loading, error: (query.error as any)?.message || null };
}


