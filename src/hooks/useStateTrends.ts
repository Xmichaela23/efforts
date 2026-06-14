// useStateTrends — assembles the STATE v2 per-discipline hybrid cards + two-part headline
// from the pure `@/lib/state-trend` model. Client-side read-only fetches (mirrors
// useExerciseLog's pattern). The model is pure TS, so this same assembly could move
// server-side (arc-context/coach payload) later with no change to the model — see the note
// at the bottom. Until run/swim performance thresholds are signed off, those rows are
// PROVISIONAL (the model marks them; nothing here trusts them for prescription).

import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useExerciseLog } from './useExerciseLog';
import {
  computeStrengthState,
  computeBikeState,
  pwr20ToSeries,
  computeRunState,
  routeMetricsToSeries,
  computeSwimState,
  swimPaceToSeries,
  computeAdherenceState,
  resolveDisciplineCard,
  perfFromTrend,
  synthesizeHeadline,
  ADHERENCE_WINDOW_DAYS,
  type DisciplineCard,
  type Headline,
  type LiftSeries,
  type PerfSummary,
} from '@/lib/state-trend';

const DAY = 86_400_000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const isoMinus = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

const disciplineOf = (t: unknown): string | null => {
  const s = String(t || '').toLowerCase();
  if (s.includes('run')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('strength')) return 'strength';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'bike';
  return null;
};

interface ExtraPerf {
  bike: PerfSummary | null;
  run: PerfSummary | null;
  swim: PerfSummary | null;
  plannedBy: Record<string, number>;
  doneBy: Record<string, number>;
}

export interface StateTrends {
  cards: DisciplineCard[];
  headline: Headline | null;
  loading: boolean;
}

const ORDER = ['strength', 'bike', 'run', 'swim'];

export function useStateTrends(): StateTrends {
  const { liftTrends, loading: liftsLoading } = useExerciseLog(12);
  const [extra, setExtra] = useState<ExtraPerf | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      const asOf = todayISO();

      // bike — latest ride carrying a pwr20_trend_v1 series
      const bikeP = supabase
        .from('workouts')
        .select('date,workout_analysis')
        .eq('user_id', userId)
        .in('type', ['ride', 'bike'])
        .not('workout_analysis', 'is', null)
        .order('date', { ascending: false })
        .limit(30);

      // run — GAP pace at comparable (easy) effort over the 6wk window
      const runP = supabase
        .from('route_progress_metrics')
        .select('metric_date,effort_adjusted_pace_sec_per_km,workout_intent')
        .eq('user_id', userId)
        .gte('metric_date', isoMinus(42))
        .order('metric_date', { ascending: true });

      // swim — pace per 100 over 8wk (Q-038-guarded inside the adapter)
      const swimP = supabase
        .from('workout_facts')
        .select('date,swim_facts')
        .eq('user_id', userId)
        .eq('discipline', 'swim')
        .gte('date', isoMinus(56))
        .order('date', { ascending: true });

      // adherence — this-week planned vs completed counts per discipline
      const adhStart = isoMinus(ADHERENCE_WINDOW_DAYS - 1);
      const plannedP = supabase
        .from('planned_workouts')
        .select('type,date')
        .eq('user_id', userId)
        .gte('date', adhStart)
        .lte('date', asOf);
      const doneP = supabase
        .from('workouts')
        .select('type,date,workout_status')
        .eq('user_id', userId)
        .gte('date', adhStart)
        .lte('date', asOf);

      const [bikeR, runR, swimR, plannedR, doneR] = await Promise.all([bikeP, runP, swimP, plannedP, doneP]);
      if (cancelled) return;

      // bike
      let bike: PerfSummary | null = null;
      const ride = (bikeR.data || []).find((r: any) => r?.workout_analysis?.pwr20_trend_v1?.points?.length);
      if (ride) bike = perfFromTrend(computeBikeState(pwr20ToSeries((ride as any).workout_analysis.pwr20_trend_v1), asOf).trend);

      // run
      const easy = (runR.data || []).filter((r: any) => String(r.workout_intent || '').toLowerCase().includes('easy'));
      const run = perfFromTrend(computeRunState(routeMetricsToSeries(easy), asOf).trend);

      // swim
      const swimRows = (swimR.data || []).map((r: any) => ({ date: r.date, pace_per_100m: Number(r.swim_facts?.pace_per_100m) }));
      const { series: swimSeries, dropped } = swimPaceToSeries(swimRows);
      const swim = perfFromTrend(computeSwimState(swimSeries, asOf, dropped).trend);

      // adherence counts
      const plannedBy: Record<string, number> = {};
      const doneBy: Record<string, number> = {};
      for (const p of (plannedR.data || []) as any[]) { const k = disciplineOf(p.type); if (k) plannedBy[k] = (plannedBy[k] || 0) + 1; }
      for (const w of (doneR.data || []) as any[]) {
        if (String(w.workout_status || '').toLowerCase() !== 'completed') continue;
        const k = disciplineOf(w.type); if (k) doneBy[k] = (doneBy[k] || 0) + 1;
      }

      setExtra({ bike, run, swim, plannedBy, doneBy });
    })();
    return () => { cancelled = true; };
  }, []);

  const loading = liftsLoading || extra == null;

  const asOf = todayISO();
  const liftSeries: LiftSeries[] = liftTrends.map((lt) => ({
    canonical: lt.canonical,
    displayName: lt.displayName,
    // NB: liftTrends entries carry no workout name, so deload-exclusion is inert on this path
    // (resolves when the WeekPhase flag is plumbed — see deload.ts). Acceptable interim.
    points: lt.entries.map((e) => ({ date: e.date, value: e.estimated_1rm })),
  }));
  const strength = computeStrengthState(liftSeries, asOf);

  const perfByDisc: Record<string, PerfSummary | null> = {
    strength: { verdict: strength.overall, pctChange: strength.overallPctChange },
    bike: extra?.bike ?? null,
    run: extra?.run ?? null,
    swim: extra?.swim ?? null,
  };

  const cards: DisciplineCard[] = ORDER.map((k) =>
    resolveDisciplineCard({
      discipline: k,
      performance: perfByDisc[k],
      adherence: computeAdherenceState({
        discipline: k,
        windowDays: ADHERENCE_WINDOW_DAYS,
        planned: extra?.plannedBy[k] || 0,
        completed: extra?.doneBy[k] || 0,
      }),
    }),
  );

  return { cards, headline: loading ? null : synthesizeHeadline(cards), loading };
}

// SCALABILITY NOTE: these fetches live client-side today (mirrors useExerciseLog). Because
// the trend model is pure TS, the same assembly can move into arc-context / the coach payload
// later and ship pre-computed cards — the model code is reused verbatim, only the data source
// moves. No re-architecture.
