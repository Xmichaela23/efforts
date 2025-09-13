import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Simple in-memory cache keyed by ver|user|from|to
const memoryCache = new Map<string, { ts: number; rows: any[] }>();
// Short TTL in dev, longer in prod
const TTL_MS = (import.meta.env?.DEV ? 5 : 24) * 60 * 60 * 1000;
const APP_VER = String((import.meta as any)?.env?.VITE_CACHE_VER || 'v3');
const CACHE_DISABLED = String((import.meta as any)?.env?.VITE_DEBUG_DISABLE_CACHE || '') === '1';

function cacheKey(userId: string, from: string, to: string) {
  return `${APP_VER}|${userId}|${from}|${to}`;
}

function readStorage(key: string): { ts: number; rows: any[] } | null {
  try {
    const raw = localStorage.getItem(`plannedRange:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeStorage(key: string, rows: any[]) {
  try {
    localStorage.setItem(`plannedRange:${key}`, JSON.stringify({ ts: Date.now(), rows }));
  } catch {}
}

export function usePlannedRange(fromISO: string, toISO: string) {
  const queryClient = useQueryClient();

  const queryKeyBase = ['plannedRange', 'me', fromISO, toISO] as const;

  const query = useQuery({
    queryKey: queryKeyBase,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as any[];
      const key = cacheKey(user.id, fromISO, toISO);
      const mem = !CACHE_DISABLED ? memoryCache.get(key) : null;
      if (mem && Date.now() - mem.ts <= TTL_MS) return mem.rows;
      const [plannedRes, completedRes] = await Promise.all([
        supabase
          .from('planned_workouts')
          .select('id,name,type,date,workout_status,description,duration,week_number,day_number,training_plan_id,tags')
          .eq('user_id', user.id)
          .gte('date', fromISO)
          .lte('date', toISO)
          .order('date', { ascending: true }),
        supabase
          .from('workouts')
          .select('id,date,type,name,computed,planned_id')
          .eq('user_id', user.id)
          .gte('date', fromISO)
          .lte('date', toISO)
          .order('date', { ascending: true })
      ]);
      if (plannedRes.error) throw plannedRes.error;
      if (completedRes.error) throw completedRes.error;
      const plannedAll = Array.isArray(plannedRes.data) ? plannedRes.data : [];
      const completedAll = Array.isArray(completedRes.data) ? completedRes.data : [];
      const plannedActive = plannedAll.filter((w: any) => {
        const raw = (w as any).tags;
        let tags: any[] = [];
        if (Array.isArray(raw)) tags = raw;
        else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch {} }
        const isOptional = tags.map(String).map((t:string)=>t.toLowerCase()).includes('optional');
        const isCompleted = String((w as any).workout_status || '').toLowerCase() === 'completed';
        return !isOptional && !isCompleted;
      });
      const replaced = new Set<string>(completedAll.map((c:any)=>String(c.planned_id||'')).filter(Boolean));
      const plannedFinal = plannedActive.filter((p:any)=> !replaced.has(String(p.id)));
      const completedRows = completedAll.map((c:any)=>({
        id: c.id,
        name: c.name || 'Completed',
        type: c.type,
        date: c.date,
        workout_status: 'completed',
        completed_workout_id: c.id,
        computed: c.computed,
        planned_id: c.planned_id
      }));
      const completedKeys = new Set(completedRows.map((c:any)=> `${String(c.date)}|${String(c.type||'').toLowerCase()}`));
      const plannedSuppressed = plannedFinal.filter((p:any)=> !completedKeys.has(`${String(p.date)}|${String(p.type||'').toLowerCase()}`));
      const merged = [...plannedSuppressed, ...completedRows].sort((a:any,b:any)=> String(a.date).localeCompare(String(b.date)));
      const payload = { ts: Date.now(), rows: merged };
      memoryCache.set(key, payload);
      writeStorage(key, merged);
      return merged;
    },
    staleTime: (import.meta.env?.DEV ? 5 : 60) * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const handler = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const k = cacheKey(user.id, fromISO, toISO);
          memoryCache.delete(k);
          localStorage.removeItem(`plannedRange:${k}`);
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: queryKeyBase });
    };
    window.addEventListener('planned:invalidate', handler);
    return () => window.removeEventListener('planned:invalidate', handler);
  }, [fromISO, toISO]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;
        const invalidate = async () => {
          try {
            const k = cacheKey(user.id, fromISO, toISO);
            memoryCache.delete(k);
            localStorage.removeItem(`plannedRange:${k}`);
          } catch {}
          queryClient.invalidateQueries({ queryKey: queryKeyBase });
        };
        channel = supabase.channel(`planned-range-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'planned_workouts', filter: `user_id=eq.${user.id}` }, async () => { await invalidate(); })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${user.id}` }, async () => { await invalidate(); })
          .subscribe();
      } catch {}
    })();
    return () => { active = false; try { channel?.unsubscribe(); } catch {} };
  }, [fromISO, toISO]);

  return { rows: query.data || [], loading: query.isFetching || query.isPending, error: (query.error as any)?.message || null };
}
