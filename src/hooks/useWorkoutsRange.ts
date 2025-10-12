import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const mem = new Map<string, { ts: number; rows: any[] }>();
const TTL = (import.meta.env?.DEV ? 5 : 24) * 60 * 60 * 1000; // dev 5h, prod 24h
const APP_VER = String((import.meta as any)?.env?.VITE_CACHE_VER || 'v3');
const CACHE_DISABLED = String((import.meta as any)?.env?.VITE_DEBUG_DISABLE_CACHE || '') === '1';

function key(userId: string, from: string, to: string) {
  return `${APP_VER}|${userId}|${from}|${to}`;
}

function read(keyStr: string) {
  try {
    const raw = localStorage.getItem(`workoutsRange:${keyStr}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || Date.now() - obj.ts > TTL) return null;
    return obj as { ts: number; rows: any[] };
  } catch { return null; }
}

function write(keyStr: string, rows: any[]) {
  try { localStorage.setItem(`workoutsRange:${keyStr}`, JSON.stringify({ ts: Date.now(), rows })); } catch {}
}

export function useWorkoutsRange(fromISO: string, toISO: string) {
  const queryClient = useQueryClient();

  // Track authenticated user id and respond to auth changes
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id || null;
      setUserId(nextId);
      // Invalidate all workoutsRange queries on auth changes
      queryClient.invalidateQueries({ queryKey: ['workoutsRange'] });
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const queryKeyBase = ['workoutsRange', 'me', userId, fromISO, toISO] as const;

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [] as any[];
      const k = key(userId, fromISO, toISO);
      const m = !CACHE_DISABLED ? mem.get(k) : null;
      if (m && Date.now() - m.ts <= TTL) return m.rows;
      if (import.meta.env?.DEV) {
        try { console.time?.(`⏱ workoutsRange query ${fromISO}→${toISO}`); } catch {}
      }
      const { data, error } = await supabase
        .from('workouts')
        .select('id,type,date,distance,workout_status,planned_id,strength_exercises,workload_planned,workload_actual,intensity_factor')
        .eq('user_id', userId)
        .gte('date', fromISO)
        .lte('date', toISO)
        .order('date', { ascending: true });
      if (import.meta.env?.DEV) {
        try { console.timeEnd?.(`⏱ workoutsRange query ${fromISO}→${toISO}`); } catch {}
      }
      if (error) throw error;
      const safe = Array.isArray(data) ? data.map((w:any)=> ({
        ...w,
        strength_exercises: (()=>{ try { return typeof w.strength_exercises==='string' ? JSON.parse(w.strength_exercises) : w.strength_exercises; } catch { return w.strength_exercises; } })(),
      })) : [];
      if (import.meta.env?.DEV) {
        try { console.log?.('workoutsRange rows:', safe.length); } catch {}
      }
      const payload = { ts: Date.now(), rows: safe };
      mem.set(k, payload);
      write(k, safe);
      return safe;
    },
    staleTime: (import.meta.env?.DEV ? 5 : 60) * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    (async () => {
      try {
        if (!active) return;
        const kstr = key(userId, fromISO, toISO);
        const invalidate = () => {
          try { mem.delete(kstr); localStorage.removeItem(`workoutsRange:${kstr}`); } catch {}
          queryClient.invalidateQueries({ queryKey: queryKeyBase });
        };
        channel = supabase.channel(`workouts-range-${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${userId}` }, () => invalidate())
          .subscribe();
      } catch {}
    })();
    return () => { active = false; try { channel?.unsubscribe(); } catch {} };
  }, [fromISO, toISO, userId]);

  return { rows: query.data || [], loading: query.isFetching || query.isPending, error: (query.error as any)?.message || null };
}
