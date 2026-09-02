/**
 * The six-week endurance checkpoint (D-462 follow-up, built 2026-09-02 by the plan materialization
 * audit session; server = `endurance-checkpoint`). ONE dry-run call when the athlete has an active plan;
 * `due` decides whether the sheet renders. `answer('accept' | 'keep')` applies and records. Mirrors
 * `useStrengthCalibration`'s shape: invoke once, keep the read, expose the action.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CheckpointNumber = {
  key: 'threshold_pace' | 'ftp' | 'lthr';
  on_plan: number | null;
  live: number | null;
  source: string | null;
  delta: number | null;
  moves: boolean;
  large: boolean;
  unit: 'sec/mi' | 'W' | 'bpm';
};
export type CheckpointEvidenceHalf = { sessions: number; avg_hr: number | null; avg_work: number | null; avg_rpe: number | null; avg_drift_pct: number | null };
export type CheckpointEvidence = {
  sport: 'run' | 'ride';
  sessions: number;
  early: CheckpointEvidenceHalf;
  late: CheckpointEvidenceHalf;
  hr_change_bpm: number | null;
  rpe_change: number | null;
  drift_change_pct: number | null;
  work_change: number | null;
};
export type CheckpointRead = {
  loading: boolean;
  due: boolean;
  week: number | null;
  currentWeek: number | null;
  numbers: CheckpointNumber[];
  evidence: { run: CheckpointEvidence | null; ride: CheckpointEvidence | null };
  rowsPending: number;
  rowsStamped: number;
  /** set after an answer: what happened, for the announce line */
  answered: { decision: 'accept' | 'keep'; rowsRepriced: number } | null;
  answer: (decision: 'accept' | 'keep') => Promise<boolean>;
};

export function useEnduranceCheckpoint(enabled = true): CheckpointRead {
  const [state, setState] = useState<Omit<CheckpointRead, 'answer'>>({
    loading: enabled, due: false, week: null, currentWeek: null, numbers: [], evidence: { run: null, ride: null },
    rowsPending: 0, rowsStamped: 0, answered: null,
  });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false, due: false })); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('endurance-checkpoint', { body: {} });
        if (cancelled || !alive.current) return;
        if (!data?.success || !data?.due) { setState((s) => ({ ...s, loading: false, due: false, currentWeek: data?.current_week ?? null })); return; }
        setState({
          loading: false, due: true, week: data.week ?? null, currentWeek: data.current_week ?? null,
          numbers: Array.isArray(data.numbers) ? data.numbers : [],
          evidence: { run: data.evidence?.run ?? null, ride: data.evidence?.ride ?? null },
          rowsPending: Number(data.rows_pending) || 0, rowsStamped: Number(data.rows_stamped) || 0, answered: null,
        });
      } catch {
        if (!cancelled && alive.current) setState((s) => ({ ...s, loading: false, due: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  const answer = useCallback(async (decision: 'accept' | 'keep') => {
    try {
      const { data } = await supabase.functions.invoke('endurance-checkpoint', { body: { apply: true, decision } });
      if (!data?.success) return false;
      if (alive.current) setState((s) => ({ ...s, due: false, answered: { decision, rowsRepriced: Number(data.rows_repriced) || 0 } }));
      return true;
    } catch { return false; }
  }, []);

  return { ...state, answer };
}
