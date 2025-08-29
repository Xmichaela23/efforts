import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Simple in-memory cache keyed by from|to
const memoryCache = new Map<string, { ts: number; rows: any[] }>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cacheKey(userId: string, from: string, to: string) {
  return `${userId}|${from}|${to}`;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRows([]); setLoading(false); return; }
        const key = cacheKey(user.id, fromISO, toISO);
        // memory cache
        const mem = memoryCache.get(key);
        if (mem && Date.now() - mem.ts <= TTL_MS) {
          setRows(mem.rows);
          setLoading(false);
          return;
        }
        // localStorage cache
        const stor = readStorage(key);
        if (stor) {
          setRows(stor.rows);
          setLoading(false);
          // revalidate in background
        }
        const { data, error } = await supabase
          .from('planned_workouts')
          .select('id,name,type,date,workout_status,steps_preset,description,duration,computed')
          .eq('user_id', user.id)
          .gte('date', fromISO)
          .lte('date', toISO)
          .order('date', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const safe = Array.isArray(data) ? data : [];
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
  }, [fromISO, toISO]);

  return { rows, loading, error };
}
