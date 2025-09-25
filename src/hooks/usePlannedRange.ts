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

  // Track authenticated user id and respond to auth changes deterministically
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextId = session?.user?.id || null;
      setUserId(nextId);
      // Invalidate all plannedRange queries on auth changes so they refetch with new user context
      queryClient.invalidateQueries({ queryKey: ['plannedRange'] });
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const queryKeyBase = ['plannedRange', 'me', userId, fromISO, toISO] as const;

  // Deprecated: return empty; useWeekUnified should be used instead
  const query = { data: [], isFetching: false, isPending: false, error: null } as any;

  useEffect(() => {
    const handler = async () => {
      try {
        if (userId) {
          const k = cacheKey(userId, fromISO, toISO);
          memoryCache.delete(k);
          localStorage.removeItem(`plannedRange:${k}`);
          console.log('🗑️ Cleared plannedRange cache for:', k);
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: queryKeyBase });
    };
    window.addEventListener('planned:invalidate', handler);
    window.addEventListener('workouts:invalidate', handler); // Also listen for workout changes
    return () => {
      window.removeEventListener('planned:invalidate', handler);
      window.removeEventListener('workouts:invalidate', handler);
    };
  }, [fromISO, toISO, userId]);

  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    (async () => {
      try {
        if (!active) return;
        const invalidate = async () => {
          try {
            const k = cacheKey(userId, fromISO, toISO);
            memoryCache.delete(k);
            localStorage.removeItem(`plannedRange:${k}`);
          } catch {}
          queryClient.invalidateQueries({ queryKey: queryKeyBase });
        };
        channel = supabase.channel(`planned-range-${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'planned_workouts', filter: `user_id=eq.${userId}` }, async () => { await invalidate(); })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${userId}` }, async () => { await invalidate(); })
          .subscribe();
      } catch {}
    })();
    return () => { active = false; try { channel?.unsubscribe(); } catch {} };
  }, [fromISO, toISO, userId]);

  return { rows: [], loading: false, error: null } as any;
}
