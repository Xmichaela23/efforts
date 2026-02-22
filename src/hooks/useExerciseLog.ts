import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface ExerciseLogRow {
  id: string;
  workout_id: string;
  date: string;
  exercise_name: string;
  canonical_name: string;
  discipline: string;
  sets_completed: number | null;
  best_weight: number | null;
  best_reps: number | null;
  total_volume: number | null;
  avg_rir: number | null;
  estimated_1rm: number | null;
}

export interface LiftTrend {
  canonical: string;
  displayName: string;
  entries: { date: string; estimated_1rm: number; best_weight: number; best_reps: number }[];
  current1RM: number;
  peak1RM: number;
  trend: number | null;
}

export function useExerciseLog(weeksBack: number = 12) {
  const [exercises, setExercises] = useState<ExerciseLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); return; }

      const since = new Date();
      since.setDate(since.getDate() - weeksBack * 7);

      const { data, error: qErr } = await supabase
        .from('exercise_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', since.toISOString().slice(0, 10))
        .order('date', { ascending: true });

      if (qErr) throw qErr;
      setExercises((data ?? []) as ExerciseLogRow[]);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load exercise log');
    } finally {
      setLoading(false);
    }
  }, [weeksBack]);

  useEffect(() => { fetch(); }, [fetch]);

  const liftTrends: LiftTrend[] = (() => {
    const byCanonical = new Map<string, ExerciseLogRow[]>();
    for (const e of exercises) {
      if ((e.estimated_1rm ?? 0) <= 0) continue;
      const arr = byCanonical.get(e.canonical_name) ?? [];
      arr.push(e);
      byCanonical.set(e.canonical_name, arr);
    }

    return [...byCanonical.entries()]
      .filter(([, rows]) => rows.length >= 2)
      .map(([canonical, rows]) => {
        const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
        const entries = sorted.map(r => ({
          date: r.date,
          estimated_1rm: r.estimated_1rm!,
          best_weight: r.best_weight ?? 0,
          best_reps: r.best_reps ?? 0,
        }));
        const current = entries[entries.length - 1].estimated_1rm;
        const peak = Math.max(...entries.map(e => e.estimated_1rm));
        const first = entries[0].estimated_1rm;
        const trend = first > 0
          ? Math.round(((current - first) / first) * 1000) / 10
          : null;

        return {
          canonical,
          displayName: rows[0].exercise_name,
          entries,
          current1RM: current,
          peak1RM: peak,
          trend,
        };
      })
      .sort((a, b) => b.entries.length - a.entries.length);
  })();

  return { exercises, liftTrends, loading, error, refresh: fetch };
}
