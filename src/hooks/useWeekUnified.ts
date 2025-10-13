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
import { supabase } from '@/lib/supabase';

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
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Prefer getSession for immediate restoration from persisted auth
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && session?.user?.id) {
          setUserId(session.user.id);
        }
      } catch {}
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserId(user ? user.id : null);
      } catch {}
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id || null);
      queryClient.invalidateQueries({ queryKey: ['weekUnified'] });
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const queryKeyBase = ['weekUnified', 'me', userId, fromISO, toISO] as const;

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { items: [] } as any;
      const { data, error } = await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO } });
      if (error) throw error as any;
      const items: UnifiedItem[] = Array.isArray((data as any)?.items) ? (data as any).items : [];
      return { items };
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
  const weeklyAI = (query.data as any)?.weekly_ai || null;
  const weeklyStats = (query.data as any)?.weekly_stats || { planned: 0, completed: 0 };
  const trainingPlanContext = (query.data as any)?.training_plan_context || null;
  const dailyContext = (query.data as any)?.daily_context || '';
  return { items, weeklyAI, weeklyStats, trainingPlanContext, dailyContext, loading: query.isFetching || query.isPending, error: (query.error as any)?.message || null };
}


