// useStateTrends — assembles the STATE v2 per-discipline hybrid cards + two-part headline
// from the pure `@shared/state-trend` model (relocated to supabase/functions/_shared so
// client + Deno edge fns run ONE impl). Client-side read-only fetches (mirrors
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
  pickBestPwr20,
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
} from '@shared/state-trend';

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
  spw: Record<string, number>; // per-discipline sessions/week (Q-052 cadence input)
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

      // run — GAP pace at comparable (easy) effort over the 6wk window. The intent gate reads
      // workout_analysis.classified_type (joined below), NOT RPM.workout_intent (null at source).
      const runP = supabase
        .from('route_progress_metrics')
        .select('metric_date,effort_adjusted_pace_sec_per_km,workout_id')
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

      // cadence — per-discipline sessions/week over 90d (Q-052: scales freshness + min-session gates)
      const cadenceP = supabase
        .from('workouts')
        .select('type,date,workout_status')
        .eq('user_id', userId)
        .eq('workout_status', 'completed')
        .gte('date', isoMinus(90));

      const [bikeR, runR, swimR, plannedR, doneR, cadenceR] = await Promise.all([bikeP, runP, swimP, plannedP, doneP, cadenceP]);
      if (cancelled) return;

      // per-discipline cadence (sessions/week over 90d) — the athlete's OWN frequency
      const WEEKS_90D = 90 / 7;
      const cnt: Record<string, number> = {};
      for (const w of (cadenceR.data || []) as any[]) { const k = disciplineOf(w.type); if (k) cnt[k] = (cnt[k] || 0) + 1; }
      const spw: Record<string, number> = {};
      for (const k of ORDER) spw[k] = (cnt[k] || 0) / WEEKS_90D;

      // bike — pick the densest CURRENT pwr20 series across recent rides, not just the latest
      let bike: PerfSummary | null = null;
      const pwr20Candidates = (bikeR.data || []).map((r: any) => r?.workout_analysis?.pwr20_trend_v1).filter(Boolean);
      const bestPwr20 = pickBestPwr20(pwr20Candidates, asOf);
      if (bestPwr20) bike = perfFromTrend(computeBikeState(pwr20ToSeries(bestPwr20), asOf, spw.bike, bestPwr20.classified_type ?? null).trend);

      // run — join classified_type from workouts (the RPM source field workout_intent is null)
      const runRows = (runR.data || []) as any[];
      const runWids = [...new Set(runRows.map((r) => r.workout_id).filter(Boolean))];
      const runCtById = new Map<string, string | null>();
      if (runWids.length) {
        const { data: rw } = await supabase.from('workouts').select('id,workout_analysis').in('id', runWids);
        for (const w of (rw || []) as any[]) runCtById.set(w.id, w.workout_analysis?.classified_type ?? null);
      }
      const runJoined = runRows.map((r) => ({
        metric_date: r.metric_date,
        effort_adjusted_pace_sec_per_km: r.effort_adjusted_pace_sec_per_km,
        classified_type: runCtById.get(r.workout_id) ?? null,
      }));
      const run = perfFromTrend(computeRunState(routeMetricsToSeries(runJoined), asOf, spw.run).trend);

      // swim
      const swimRows = (swimR.data || []).map((r: any) => ({ date: r.date, pace_per_100m: Number(r.swim_facts?.pace_per_100m) }));
      const { series: swimSeries, dropped } = swimPaceToSeries(swimRows);
      const swim = perfFromTrend(computeSwimState(swimSeries, asOf, spw.swim, dropped).trend);

      // adherence counts
      const plannedBy: Record<string, number> = {};
      const doneBy: Record<string, number> = {};
      for (const p of (plannedR.data || []) as any[]) { const k = disciplineOf(p.type); if (k) plannedBy[k] = (plannedBy[k] || 0) + 1; }
      for (const w of (doneR.data || []) as any[]) {
        if (String(w.workout_status || '').toLowerCase() !== 'completed') continue;
        const k = disciplineOf(w.type); if (k) doneBy[k] = (doneBy[k] || 0) + 1;
      }

      setExtra({ bike, run, swim, plannedBy, doneBy, spw });
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
  const strength = computeStrengthState(liftSeries, asOf, extra?.spw?.strength ?? 0);

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
