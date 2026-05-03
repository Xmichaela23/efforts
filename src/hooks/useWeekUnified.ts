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
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredUserId, supabase } from '@/lib/supabase';
import { fetchWeekUnified } from '@/lib/fetchWeekUnified';

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
  }, [queryClient]);

  const queryKeyBase = ['weekUnified', 'me', userId, fromISO, toISO] as const;
  const enabled = !!userId;

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled,
    queryFn: async () => {
      if (!userId) return { items: [] } as any;
      return fetchWeekUnified(fromISO, toISO) as Promise<{
        items: UnifiedItem[];
        weekly_stats: Record<string, unknown>;
        training_plan_context: unknown | null;
      }>;
    },
    placeholderData: keepPreviousData,
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
  // Show loading while fetching when there is no real data yet, or when showing previous week's placeholder (wrong dates for the requested range).
  const loading =
    enabled &&
    query.isFetching &&
    (query.isPlaceholderData || query.data === undefined);
  return { items, weeklyStats, trainingPlanContext, loading, error: (query.error as any)?.message || null };
}


