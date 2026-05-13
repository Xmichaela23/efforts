/**
 * Shared resolver for the athlete's `strength_ordering_preference` per active plan.
 *
 * Replaces two independent fetch paths that previously diverged:
 *   - TodaysEffort.tsx had a React useEffect with `[dateWorkoutsMemo, detailedPlans]` deps.
 *     Both deps are objects that re-ref on every render; the cleanup function cancelled
 *     the in-flight fetch each time, so the fetch never completed. 813 pending requests
 *     to `goals?select=training_prefs&id=eq.<goal>` observed in DevTools Network tab.
 *     orderingPref stayed at the initial 'endurance_first' default. Top cards rendered
 *     Run-above-Lower (endurance_first semantics) for a strength_first athlete.
 *   - AllPlansInterface.tsx fetched inline inside `exportPlanToMarkdown()` (callback
 *     scope, no React lifecycle, ran to completion — worked correctly).
 *
 * Consolidation: one module-level cache, one fetch implementation, two consumer surfaces.
 * The hook is for render-time React consumers; the bare async function is for callback
 * consumers (click handlers, export builders) that can't call hooks. Both share the
 * same in-flight cache so a hook fetch and a callback fetch for the same planId don't
 * race.
 *
 * Cache lifetime: page load. Pref changes flow through GoalsScreen → next plan generation
 * (creates a new planId), so in-place invalidation isn't required for correctness. Refresh
 * the page to pick up a mid-plan pref change.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  readStrengthOrderingPreference,
  type StrengthOrderingPreference,
} from '@/lib/pairing-timing';

/** Resolved value per planId. Per-page-load lifetime. */
const cache = new Map<string, StrengthOrderingPreference>();

/** In-flight fetch dedupe — second concurrent caller awaits the same promise. */
const inflight = new Map<string, Promise<StrengthOrderingPreference>>();

/**
 * One-shot async fetch. Use from callback / non-render contexts (e.g. `exportPlanToMarkdown`
 * inside an onClick). React components should prefer the hook below for automatic state
 * management and re-render integration.
 */
export async function fetchStrengthOrderingPreference(
  planId: string | null | undefined,
): Promise<StrengthOrderingPreference> {
  if (!planId) return 'endurance_first';
  const cached = cache.get(planId);
  if (cached !== undefined) return cached;
  const pending = inflight.get(planId);
  if (pending) return pending;

  const promise = (async (): Promise<StrengthOrderingPreference> => {
    try {
      const { data: planRow } = await supabase
        .from('plans')
        .select('goal_id')
        .eq('id', planId)
        .maybeSingle();
      const goalId = (planRow?.goal_id as string | null | undefined) ?? null;
      if (!goalId) {
        cache.set(planId, 'endurance_first');
        return 'endurance_first';
      }
      const { data: goalRow } = await supabase
        .from('goals')
        .select('training_prefs')
        .eq('id', goalId)
        .maybeSingle();
      const pref = readStrengthOrderingPreference(
        goalRow as { training_prefs?: unknown } | null,
      );
      cache.set(planId, pref);
      return pref;
    } catch {
      // Network / RLS failure — fall back to default without polluting the cache so a
      // subsequent call can retry. The default matches the server's behavior when the
      // field is missing, so any sort downstream stays consistent until retry resolves.
      return 'endurance_first';
    } finally {
      inflight.delete(planId);
    }
  })();

  inflight.set(planId, promise);
  return promise;
}

/**
 * React hook. Depends only on `planId` (string) so dep-churn from object refs upstream
 * cannot cancel the fetch. `loading` is true only on the first uncached resolution.
 *
 * Returns `{ value, loading }` rather than just the value so consumers that need to defer
 * rendering (skeleton, etc.) can; today's consumers ignore `loading` because
 * 'endurance_first' is a safe default for first paint.
 */
export function useStrengthOrderingPreference(planId: string | null | undefined): {
  value: StrengthOrderingPreference;
  loading: boolean;
} {
  const [value, setValue] = useState<StrengthOrderingPreference>(() => {
    if (planId && cache.has(planId)) return cache.get(planId)!;
    return 'endurance_first';
  });
  const [loading, setLoading] = useState<boolean>(() => !!planId && !cache.has(planId));

  useEffect(() => {
    if (!planId) {
      setValue('endurance_first');
      setLoading(false);
      return;
    }
    if (cache.has(planId)) {
      setValue(cache.get(planId)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    fetchStrengthOrderingPreference(planId).then((pref) => {
      if (cancelled) return;
      setValue(pref);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [planId]);

  return { value, loading };
}
