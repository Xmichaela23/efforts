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
          try { console.log('useWeekUnified:getSession', { hasSession: true, userId: session.user.id, fromISO, toISO }); } catch {}
        }
      } catch {}
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUserId(user ? user.id : null);
        try { console.log('useWeekUnified:getUser', { hasUser: !!user?.id, userId: user?.id, fromISO, toISO }); } catch {}
      } catch {}
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id || null);
      queryClient.invalidateQueries({ queryKey: ['weekUnified'] });
      try { console.log('useWeekUnified:onAuthStateChange', { uid: session?.user?.id || null }); } catch {}
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const queryKeyBase = ['weekUnified', 'me', userId, fromISO, toISO] as const;

  try { console.log('useWeekUnified:hook', { userId, enabled: !!userId, fromISO, toISO }); } catch {}

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { items: [] } as any;
      try { console.log('useWeekUnified:invoke', { fromISO, toISO, debug: true }); } catch {}
      const { data, error } = await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO, debug: true } });
      try { console.log('useWeekUnified:response', { error: error?.message || null, items: Array.isArray((data as any)?.items) ? (data as any).items.length : 0, warnings: (data as any)?.warnings }); } catch {}
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

  // Debug current React Query state and nudge if idle while enabled
  try { console.log('useWeekUnified:rq', { status: (query as any)?.status, fetchStatus: (query as any)?.fetchStatus, isFetching: (query as any)?.isFetching }); } catch {}
  useEffect(() => {
    try { console.log('useWeekUnified:refetchCheck', { enabled: !!userId, fetchStatus: (query as any)?.fetchStatus, status: (query as any)?.status }); } catch {}
    if (userId && (query as any)?.fetchStatus === 'idle') {
      try { query.refetch(); } catch {}
    }
  }, [userId, fromISO, toISO, (query as any)?.fetchStatus]);

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
  return { items, loading: query.isFetching || query.isPending, error: (query.error as any)?.message || null };
}


