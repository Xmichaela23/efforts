import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useWeekRange(fromISO: string, toISO: string) {
  const queryClient = useQueryClient();

  // Track user id (auth-gated)
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserId(user ? user.id : null);
      } catch {}
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id || null);
      queryClient.invalidateQueries({ queryKey: ['weekRange'] });
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const queryKeyBase = ['weekRange', 'me', userId, fromISO, toISO] as const;

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { planned: [], workouts: [] } as any;
      const { data, error } = await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO } });
      if (error) throw error as any;
      const planned = Array.isArray((data as any)?.planned) ? (data as any).planned : [];
      const workouts = Array.isArray((data as any)?.workouts) ? (data as any).workouts : [];
      return { planned, workouts };
    },
    staleTime: (import.meta.env?.DEV ? 5 : 60) * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Invalidate on planned/workouts updates
  useEffect(() => {
    const handler = () => { queryClient.invalidateQueries({ queryKey: queryKeyBase }); };
    window.addEventListener('planned:invalidate', handler);
    window.addEventListener('workouts:invalidate', handler);
    return () => {
      window.removeEventListener('planned:invalidate', handler);
      window.removeEventListener('workouts:invalidate', handler);
    };
  }, [fromISO, toISO, userId]);

  const planned = (query.data as any)?.planned || [];
  const workouts = (query.data as any)?.workouts || [];
  return { planned, workouts, loading: query.isFetching || query.isPending, error: (query.error as any)?.message || null };
}


