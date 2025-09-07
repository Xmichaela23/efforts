import { useEffect, useState } from 'react';
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
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidateTs, setInvalidateTs] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRows([]); setLoading(false); return; }
        const k = key(user.id, fromISO, toISO);
        const m = !CACHE_DISABLED ? mem.get(k) : null;
        if (m && Date.now() - m.ts <= TTL) { setRows(m.rows); setLoading(false); return; }
        const s = !CACHE_DISABLED ? read(k) : null;
        if (s) { setRows(s.rows); setLoading(false); }
        const { data, error } = await supabase
          .from('workouts')
          .select('id,type,date,distance,workout_status,planned_id')
          .eq('user_id', user.id)
          .gte('date', fromISO)
          .lte('date', toISO)
          .order('date', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const safe = Array.isArray(data) ? data : [];
        setRows(safe);
        const payload = { ts: Date.now(), rows: safe };
        mem.set(k, payload);
        write(k, safe);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load workouts range');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromISO, toISO, invalidateTs]);

  // Realtime invalidate on workouts changes (attach/complete)
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;
        const k = key(user.id, fromISO, toISO);
        const invalidate = () => {
          try { mem.delete(k); localStorage.removeItem(`workoutsRange:${k}`); } catch {}
          setInvalidateTs(Date.now());
        };
        channel = supabase.channel(`workouts-range-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${user.id}` }, () => invalidate())
          .subscribe();
      } catch {}
    })();
    return () => { active = false; try { channel?.unsubscribe(); } catch {} };
  }, [fromISO, toISO]);

  return { rows, loading, error };
}
