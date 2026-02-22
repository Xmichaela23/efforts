import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AthleteSnapshotRow {
  week_start: string;
  workload_total: number | null;
  workload_by_discipline: Record<string, number> | null;
  acwr: number | null;
  session_count: number | null;
  session_count_planned: number | null;
  adherence_pct: number | null;
  run_easy_pace_at_hr: number | null;
  run_easy_hr_trend: number | null;
  run_long_run_duration: number | null;
  run_interval_adherence: number | null;
  strength_volume_total: number | null;
  strength_volume_trend: number | null;
  strength_top_lifts: Record<string, {
    est_1rm: number;
    best_weight: number;
    best_reps: number;
    trend: string | null;
  }> | null;
  ride_avg_power: number | null;
  ride_efficiency_factor: number | null;
  avg_session_rpe: number | null;
  avg_readiness: Record<string, number> | null;
  rpe_trend: number | null;
  plan_id: string | null;
  plan_week_number: number | null;
  plan_phase: string | null;
  computed_at: string;
}

export function useAthleteSnapshot(weeksBack: number = 5) {
  const [snapshots, setSnapshots] = useState<AthleteSnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); return; }

      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      const startMonday = new Date(monday);
      startMonday.setDate(monday.getDate() - (weeksBack - 1) * 7);

      const { data, error: qErr } = await supabase
        .from('athlete_snapshot')
        .select('*')
        .eq('user_id', user.id)
        .gte('week_start', startMonday.toISOString().slice(0, 10))
        .order('week_start', { ascending: true });

      if (qErr) throw qErr;
      setSnapshots((data ?? []) as AthleteSnapshotRow[]);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load snapshots');
    } finally {
      setLoading(false);
    }
  }, [weeksBack]);

  useEffect(() => { fetch(); }, [fetch]);

  const current = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  return { snapshots, current, loading, error, refresh: fetch };
}
