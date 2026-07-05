// useStateTrends — assembles the STATE v2 per-discipline hybrid cards + two-part headline from the
// pure `@shared/state-trend` model. The assembly itself now lives in ONE shared function,
// `assembleStateTrends`, that BOTH this hook and the server (compute-snapshot, which caches
// athlete_snapshot.state_trends_v1) call. Identical model + identical assembly → identical output
// given identical rows. That structural equality is the single-source guarantee: the STATE screen
// and the cached spine cannot drift, because there is one code path. This hook only does the
// client-side fetches (mirrors useExerciseLog's pattern); everything downstream is shared.

import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useExerciseLog } from './useExerciseLog';
import {
  assembleStateTrends,
  disciplineOf,
  todayISO,
  isoMinus,
  STATE_TREND_WINDOWS,
  type BikeFitness,
  type DisciplineCard,
  type Headline,
  type StateTrendInputs,
  type ExerciseLogLite,
  type PerfSummary,
} from '@shared/state-trend';

interface RawInputs {
  bikeRows: StateTrendInputs['bikeRows'];
  runJoined: StateTrendInputs['runJoined'];
  swimRows: StateTrendInputs['swimRows'];
  plannedBy: Record<string, number>;
  doneBy: Record<string, number>;
  cadenceCounts: Record<string, number>;
}

export interface StateTrends {
  cards: DisciplineCard[];
  headline: Headline | null;
  bikeFitness: BikeFitness | null; // the bike row's "Power · Efficiency" dual read
  swimRest: PerfSummary | null;    // D-194: swim rest-fraction (work:rest) trend
  loading: boolean;
}

export function useStateTrends(): StateTrends {
  const { exercises, loading: liftsLoading } = useExerciseLog(STATE_TREND_WINDOWS.liftWeeks);
  const [raw, setRaw] = useState<RawInputs | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      const asOf = todayISO();

      // bike — latest rides carrying workout_analysis (bike_fitness_v1)
      const bikeP = supabase
        .from('workouts')
        .select('date,workout_analysis,workout_metadata')
        .eq('user_id', userId)
        .in('type', ['ride', 'bike'])
        .not('workout_analysis', 'is', null)
        .order('date', { ascending: false })
        .limit(STATE_TREND_WINDOWS.bikeLimit);

      // run — GAP pace at comparable (easy) effort. Intent gate reads classified_type (joined below),
      // NOT RPM.workout_intent (null at source). Fetch the 90d CADENCE window (not the 42d trend window):
      // assemble derives the comparable-easy-run cadence from these rows for the min-session floor, and
      // classifyTrend windows the trend itself to runDays (42d) internally (D-237 run-row floor fix).
      const runP = supabase
        .from('route_progress_metrics')
        .select('metric_date,effort_adjusted_pace_sec_per_km,workout_id')
        .eq('user_id', userId)
        .gte('metric_date', isoMinus(STATE_TREND_WINDOWS.cadenceDays))
        .order('metric_date', { ascending: true });

      // Q-110: pace-at-HR efficiency lives in workout_facts.run_facts (NOT route_progress_metrics),
      // so fetch it separately and join by date — this is the run card's fitness verdict now.
      const runFactsP = supabase
        .from('workout_facts')
        .select('date,run_facts')
        .eq('user_id', userId)
        .eq('discipline', 'run')
        .gte('date', isoMinus(STATE_TREND_WINDOWS.cadenceDays));

      // swim — pace per 100 over 8wk (Q-038-guarded inside the adapter)
      const swimP = supabase
        .from('workout_facts')
        .select('date,swim_facts')
        .eq('user_id', userId)
        .eq('discipline', 'swim')
        .gte('date', isoMinus(STATE_TREND_WINDOWS.swimDays))
        .order('date', { ascending: true });

      // adherence — this-week planned vs completed counts per discipline
      const adhStart = isoMinus(STATE_TREND_WINDOWS.adherenceDays - 1);
      const plannedP = supabase.from('planned_workouts').select('type,date').eq('user_id', userId).gte('date', adhStart).lte('date', asOf);
      const doneP = supabase.from('workouts').select('type,date,workout_status').eq('user_id', userId).gte('date', adhStart).lte('date', asOf);

      // cadence — per-discipline sessions/week over 90d
      const cadenceP = supabase
        .from('workouts')
        .select('type,date,workout_status')
        .eq('user_id', userId)
        .eq('workout_status', 'completed')
        .gte('date', isoMinus(STATE_TREND_WINDOWS.cadenceDays));

      const [bikeR, runR, swimR, plannedR, doneR, cadenceR, runFactsR] = await Promise.all([bikeP, runP, swimP, plannedP, doneP, cadenceP, runFactsP]);
      if (cancelled) return;

      // cadence counts
      const cadenceCounts: Record<string, number> = {};
      for (const w of (cadenceR.data || []) as any[]) { const k = disciplineOf(w.type); if (k) cadenceCounts[k] = (cadenceCounts[k] || 0) + 1; }

      // bike rows → flatten bike_fitness_v1
      const bikeRows = (bikeR.data || []).map((r: any) => ({
        date: r.date,
        classified_type: r.workout_analysis?.classified_type ?? null,
        w20: r.workout_analysis?.bike_fitness_v1?.w20 ?? null,
        hr_at_band: r.workout_analysis?.bike_fitness_v1?.hr_at_band ?? null,
        band_source: r.workout_analysis?.bike_fitness_v1?.band_source ?? null,
        hr_corrupt: !!r.workout_metadata?.hr_corrupt,
      }));

      // run — join classified_type from workouts (RPM source field workout_intent is null)
      const runRows = (runR.data || []) as any[];
      const runWids = [...new Set(runRows.map((r) => r.workout_id).filter(Boolean))];
      const runCtById = new Map<string, string | null>();
      if (runWids.length) {
        const { data: rw } = await supabase.from('workouts').select('id,workout_analysis').in('id', runWids);
        for (const w of (rw || []) as any[]) runCtById.set(w.id, w.workout_analysis?.classified_type ?? null);
      }
      // Q-110: join pace-at-HR efficiency (run_facts) by date onto the run series.
      const runPaceAtHrByDate = new Map<string, number>();
      for (const f of (runFactsR.data || []) as any[]) {
        const v = f.run_facts?.pace_at_easy_hr;
        if (typeof v === 'number') runPaceAtHrByDate.set(f.date, v);
      }
      const runJoined = runRows.map((r) => ({
        metric_date: r.metric_date,
        effort_adjusted_pace_sec_per_km: r.effort_adjusted_pace_sec_per_km,
        pace_at_easy_hr: runPaceAtHrByDate.get(r.metric_date) ?? null,
        classified_type: runCtById.get(r.workout_id) ?? null,
      }));

      // Q-061 parity: exclude equipment/drill-contaminated swims — MUST match compute-snapshot's
      // filter (the structural-equality guarantee), else the live STATE card and the cached spine drift.
      // D-194: carry rest_fraction + distance_m for the rest-fraction trend (same row shape as server).
      const swimRows = (swimR.data || [])
        .filter((r: any) => r.swim_facts?.pace_equipment_contaminated !== true && r.swim_facts?.swam_as_planned !== false)
        .map((r: any) => ({
          date: r.date,
          pace_per_100m: Number(r.swim_facts?.pace_per_100m),
          rest_fraction: r.swim_facts?.rest_fraction ?? null,
          distance_m: Number(r.swim_facts?.distance_m),
        }));

      const plannedBy: Record<string, number> = {};
      const doneBy: Record<string, number> = {};
      for (const p of (plannedR.data || []) as any[]) { const k = disciplineOf(p.type); if (k) plannedBy[k] = (plannedBy[k] || 0) + 1; }
      for (const w of (doneR.data || []) as any[]) {
        if (String(w.workout_status || '').toLowerCase() !== 'completed') continue;
        const k = disciplineOf(w.type); if (k) doneBy[k] = (doneBy[k] || 0) + 1;
      }

      setRaw({ bikeRows, runJoined, swimRows, plannedBy, doneBy, cadenceCounts });
    })();
    return () => { cancelled = true; };
  }, []);

  const loading = liftsLoading || raw == null;
  if (loading) return { cards: [], headline: null, bikeFitness: null, swimRest: null, loading: true };

  const exerciseRows: ExerciseLogLite[] = (exercises || []).map((e) => ({
    date: e.date,
    canonical_name: e.canonical_name,
    exercise_name: e.exercise_name,
    estimated_1rm: e.estimated_1rm,
  }));

  const result = assembleStateTrends({ asOf: todayISO(), exerciseRows, ...raw! });
  return { cards: result.cards, headline: result.headline, bikeFitness: result.bikeFitness, swimRest: result.swimRest, loading: false };
}

// SCALABILITY NOTE (now realized): the assembly is `assembleStateTrends` in @shared/state-trend,
// called identically by compute-snapshot to cache athlete_snapshot.state_trends_v1. This hook is
// just the client's data source; the verdict logic is single-source across client + server.
