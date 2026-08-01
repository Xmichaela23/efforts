import { useEffect, useState, useCallback } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';

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

export interface LiftTrendEntry {
  date: string;
  estimated_1rm: number;
  best_weight: number;
  best_reps: number;
  sets_completed: number;
}
/**
 * ⛔ THIS HOOK NO LONGER COMPUTES A DIRECTION (D-350, 2026-08-01). DO NOT ADD ONE BACK.
 *
 * It used to carry `trend` — first point to last point across 12 weeks, as a percentage — plus
 * `current1RM`, `peak1RM` and `latestRir`. Every one of them was read by exactly one surface,
 * `BlockSummaryTab`, which had been unmounted since 2026-03-31 and is now deleted.
 *
 * ⚠️ AND `trend` WAS THE SAME LIE D-347 DELETED FROM THE STATE SCREEN, still breathing on a second
 * surface. A 5/3/1 block prescribes its top set from ~65% up to ~95% of a training max, so an e1RM
 * produced once per cycle moves with the PRESCRIPTION. First-to-last across that ramp reads a
 * correctly-executed light week as a decline. D-347 removed the per-lift direction chip for exactly
 * this reason; this copy survived only because nothing rendered it.
 *
 * What remains is what the live callers actually read: the per-session POINTS. `StateTab` takes the
 * latest `best_weight` to prefill the adjust modal; `StrengthSummaryView` charts the entries. The
 * DIRECTION question is the server's — the spine's `per_lift` verdicts already answer it, protocol-
 * aware, which is the whole reason D-347 could delete the client's version.
 */
export interface LiftTrend {
  canonical: string;
  displayName: string;
  entries: LiftTrendEntry[];
}

export function useExerciseLog(weeksBack: number = 12, enabled: boolean = true) {
  const [exercises, setExercises] = useState<ExerciseLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    // S2: skip the query entirely when the caller doesn't need it (e.g. useStateTrends has the
    // server-assembled display contract). Additive — default enabled=true keeps every other caller.
    if (!enabled) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);

      const userId = getStoredUserId();
      if (!userId) { setError('Not authenticated'); return; }

      const since = new Date();
      since.setDate(since.getDate() - weeksBack * 7);

      const { data, error: qErr } = await supabase
        .from('exercise_log')
        .select('*')
        .eq('user_id', userId)
        .gte('date', since.toISOString().slice(0, 10))
        .order('date', { ascending: true });

      if (qErr) throw qErr;
      setExercises((data ?? []) as ExerciseLogRow[]);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load exercise log');
    } finally {
      setLoading(false);
    }
  }, [weeksBack, enabled]);

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
          sets_completed: r.sets_completed ?? 0,
        }));
        return {
          canonical,
          displayName: rows[0].exercise_name,
          entries,
        };
      })
      .sort((a, b) => b.entries.length - a.entries.length);
  })();

  return { exercises, liftTrends, loading, error, refresh: fetch };
}
