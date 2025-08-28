import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const mem = new Map<string, { ts: number; rows: any[] }>();
const TTL = 24 * 60 * 60 * 1000; // 24h

function key(userId: string, from: string, to: string) {
  return `${userId}|${from}|${to}`;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRows([]); setLoading(false); return; }
        const k = key(user.id, fromISO, toISO);
        const m = mem.get(k);
        if (m && Date.now() - m.ts <= TTL) { setRows(m.rows); setLoading(false); return; }
        const s = read(k);
        if (s) { setRows(s.rows); setLoading(false); }
        const { data, error } = await supabase
          .from('workouts')
          .select('id,type,date,distance,workout_status')
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
  }, [fromISO, toISO]);

  return { rows, loading, error };
}
