// useStateTrends — renders the STATE v2 per-discipline hybrid cards from the server-assembled display
// contract. The assembly itself lives on the SERVER: compute-snapshot runs `assembleStateTrends` and
// caches it as athlete_snapshot.state_trends_v1; the coach forwards it as weekly_state_v1.trends.display.
// This hook is a PURE RENDERER — it does zero verdict math. There is no client fallback assembly: one
// brain (the server), one source of truth. If the contract isn't present yet, the screen shows a loading
// state rather than re-deriving a second (and, as it turned out, differently-fed) answer on the client.
//
// The only client fetch left here is the two config reads below (declared posture + active disciplines),
// which are config, not computed verdicts.

import { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';
import {
  disciplineOf,
  isoMinus,
  sanitizePosture,
  type BikeFitness,
  type RunFitness,
  type StrengthFitness,
  type DisciplineCard,
  type Headline,
  type PerfSummary,
  type StateDisplayV1,
  type SwimVolume,
  type FitnessMode,
  type FitnessAnchor,
} from '@shared/state-trend';

export interface StateTrends {
  cards: DisciplineCard[];
  headline: Headline | null;
  bikeFitness: BikeFitness | null; // the bike row's "Power · Efficiency" dual read
  runFitness: RunFitness | null;   // Tier 1: run row's "Decoupling · Efficiency" dual read
  strengthFitness: StrengthFitness | null; // strength row's "Volume · e1RM · sessions" composite
  swimRest: PerfSummary | null;    // D-194: swim rest-fraction (work:rest) trend
  swimVolume: SwimVolume | null;   // swim VOLUME facts (count/total/longest) — the described-not-graded row
  fitnessMode: Record<string, FitnessMode>; // SLICE 1: per-row anchoring mode (dot only where 'anchored')
  fitnessAnchors: Record<string, FitnessAnchor>; // per-row rendered anchor (tick + auto/confirmed label)
  cadenceCounts: Record<string, number>; // per-discipline 90d session count — the stable sort key
  posture: Record<string, string> | null; // declared per_discipline_posture (config) — drives Building/Holding grouping
  activeDisciplines: string[]; // disciplines with a session in the last ~4wk — "still doing it" vs "dropped"
  loading: boolean;
}

// `displayContract` is the server-assembled State display block (coach weekly_state_v1.trends.display).
// Present → render it verbatim. Absent → loading (the server hasn't produced it yet); we never recompute here.
export function useStateTrends(displayContract?: StateDisplayV1 | null): StateTrends {
  // Declared posture (per_discipline_posture) — config, not computed. The contract's card.posture can lag a
  // stale snapshot, so the Building/Holding grouping reads THIS. One tiny goals read (the same one compute-snapshot does).
  const [declaredPosture, setDeclaredPosture] = useState<Record<string, string> | null>(null);
  // Disciplines with a session in the last ~4 weeks — the detraining onset window (VO2max starts dropping
  // at 2–4wk; Garmin's own "Detraining" gate). Drives "still doing it" vs "dropped" for the dim.
  const [activeDisciplines, setActiveDisciplines] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      const [goalR, wkR] = await Promise.all([
        supabase.from('goals').select('training_prefs')
          .eq('user_id', userId).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('workouts').select('type').eq('user_id', userId).gte('date', isoMinus(28)),
      ]);
      if (cancelled) return;
      const prefs = goalR.data?.training_prefs as { per_discipline_posture?: unknown } | null | undefined;
      setDeclaredPosture((sanitizePosture(prefs?.per_discipline_posture) as Record<string, string>) ?? null);
      const active = new Set<string>();
      for (const w of ((wkR.data ?? []) as Array<{ type?: string }>)) { const d = disciplineOf(w.type); if (d) active.add(d); }
      setActiveDisciplines([...active]);
    })();
    return () => { cancelled = true; };
  }, []);

  // The server already assembled this exact contract (compute-snapshot ran assembleStateTrends and cached it;
  // the coach forwards it). Render it verbatim — one truth, zero client math. `headline` is dropped
  // (StatePerformanceSection never consumed it).
  if (displayContract) {
    return {
      cards: displayContract.cards,
      headline: null,
      bikeFitness: displayContract.bikeFitness,
      runFitness: displayContract.runFitness,
      strengthFitness: displayContract.strengthFitness,
      swimRest: displayContract.swimRest,
      swimVolume: displayContract.swimVolume ?? null,
      fitnessMode: displayContract.fitnessMode ?? {},
      fitnessAnchors: displayContract.fitnessAnchors ?? {},
      cadenceCounts: displayContract.cadenceCounts,
      posture: declaredPosture,
      activeDisciplines,
      loading: false,
    };
  }

  // No server contract yet → nothing to render. We do NOT recompute on the client (single source of truth:
  // compute-snapshot owns assembly). Show the loading state until the coach payload carries the contract.
  return {
    cards: [], headline: null, bikeFitness: null, runFitness: null, strengthFitness: null,
    swimRest: null, swimVolume: null, fitnessMode: {}, fitnessAnchors: {}, cadenceCounts: {},
    posture: declaredPosture, activeDisciplines, loading: true,
  };
}
