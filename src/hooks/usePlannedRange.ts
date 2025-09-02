import { useEffect, useMemo, useState } from 'react';
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
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidateTs, setInvalidateTs] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!readStorage(cacheKey('', fromISO, toISO))) setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRows([]); setLoading(false); return; }
        const key = cacheKey(user.id, fromISO, toISO);
        // memory cache
        const mem = !CACHE_DISABLED ? memoryCache.get(key) : null;
        if (mem && Date.now() - mem.ts <= TTL_MS) {
          setRows(mem.rows);
          setLoading(false);
          return;
        }
        // localStorage cache
        const stor = !CACHE_DISABLED ? readStorage(key) : null;
        if (stor) {
          setRows(stor.rows);
          setLoading(false);
          // revalidate in background
        }
        // Revalidate (SWR)
        const { data, error } = await supabase
          .from('planned_workouts')
          .select('id,name,type,date,workout_status,steps_preset,description,duration,computed,week_number,day_number,training_plan_id,tags')
          .eq('user_id', user.id)
          .gte('date', fromISO)
          .lte('date', toISO)
          .order('date', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const safeAll = Array.isArray(data) ? data : [];
        // Filter out optional-tagged planned rows (they appear only after activation when tag is removed)
        const safe = safeAll.filter((w: any) => {
          const raw = (w as any).tags;
          let tags: any[] = [];
          if (Array.isArray(raw)) tags = raw;
          else if (typeof raw === 'string') { try { const p = JSON.parse(raw); if (Array.isArray(p)) tags = p; } catch {} }
          return !tags.map(String).map((t:string)=>t.toLowerCase()).includes('optional');
        });
        setRows(safe);
        const payload = { ts: Date.now(), rows: safe };
        memoryCache.set(key, payload);
        writeStorage(key, safe);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load planned range');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromISO, toISO, invalidateTs]);

  useEffect(() => {
    const handler = async () => {
      // Clear caches for this window and refetch
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const key = cacheKey(user.id, fromISO, toISO);
          memoryCache.delete(key);
          localStorage.removeItem(`plannedRange:${key}`);
        }
      } catch {}
      setInvalidateTs(Date.now());
    };
    window.addEventListener('planned:invalidate', handler);
    return () => window.removeEventListener('planned:invalidate', handler);
  }, [fromISO, toISO]);

  return { rows, loading, error };
}
