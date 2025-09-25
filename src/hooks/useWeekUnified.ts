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
    staleTime: (import.meta.env?.DEV ? 5 : 60) * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const handler = () => { queryClient.invalidateQueries({ queryKey: queryKeyBase }); };
    window.addEventListener('planned:invalidate', handler);
    window.addEventListener('workouts:invalidate', handler);
    return () => {
      window.removeEventListener('planned:invalidate', handler);
      window.removeEventListener('workouts:invalidate', handler);
    };
  }, [fromISO, toISO, userId]);

  const items: UnifiedItem[] = (query.data as any)?.items || [];
  return { items, loading: query.isFetching || query.isPending, error: (query.error as any)?.message || null };
}


