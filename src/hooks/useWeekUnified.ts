import type { SpacingLine } from '@shared/standing-plan/spacing-line.ts';
/**
 * useWeekUnified - DUMB CLIENT hook
 * 
 * Architecture:
 * - Calls get-week endpoint (smart server)
 * - Returns unified items with { planned, executed }
 * - NO client-side merging, matching, or computation
 * - Just renders what the server returns
 */
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredUserId, supabase } from '@/lib/supabase';
import { fetchWeekUnified } from '@/lib/fetchWeekUnified';

export type UnifiedItem = {
  id: string;
  date: string;
  type: string;
  status: 'planned' | 'completed' | 'skipped' | string | null;
  planned: any | null;
  executed: any | null;
  /** The day's listing order, 1-based within the date, decided by get-week (audit H-T16). */
  day_order?: number | null;
};

export function useWeekUnified(fromISO: string, toISO: string) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(() => getStoredUserId());
  useEffect(() => {
    setUserId(getStoredUserId());
    // ⛔ ONLY A CHANGE OF ACCOUNT CLEARS THE SAVED WEEK (2026-09-30). The auth library sends every new
    // listener an initial session event, and sends another on each token refresh (app resume). Clearing on
    // every event re-fetched the week each time Today, the calendar or a workout opened, despite the
    // hour-long fresh window above. The key already carries the user id, so a different account never
    // reads another's week; this clears the old account's copies when the signed-in user changes.
    let lastUserId = getStoredUserId();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      const nextUserId = getStoredUserId();
      setUserId(nextUserId);
      if (nextUserId === lastUserId) return;
      lastUserId = nextUserId;
      queryClient.invalidateQueries({ queryKey: ['weekUnified'] });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const queryKeyBase = ['weekUnified', 'me', userId, fromISO, toISO] as const;
  const enabled = !!userId;

  const query = useQuery({
    queryKey: queryKeyBase,
    enabled,
    queryFn: async () => {
      if (!userId) return { items: [] } as any;
      return fetchWeekUnified(fromISO, toISO) as Promise<{
        items: UnifiedItem[];
        weekly_stats: Record<string, unknown>;
        training_plan_context: unknown | null;
        /** The line for a day with nothing on it, per date — `_shared/empty-day-line.ts` (2026-09-17). */
        empty_day_lines: Record<string, string> | null;
        /** Today's two scheduling sentences, per date — `_shared/standing-plan/spacing-line.ts` (2026-09-18). */
        spacing_lines: Record<string, SpacingLine | null> | null;
      }>;
    },
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: (import.meta.env?.DEV ? 5 : 60) * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // In unified mode, rely on standard query invalidation from navigations;
  // avoid global event-based invalidation to prevent render loops on calendar.
  // Allow targeted external refresh via `week:invalidate` (keepPreviousData prevents flicker).
  // A changed planned row or workout changes the week too (2026-09-30): nine senders of `planned:invalidate`
  // or `workouts:invalidate` (link a workout, recompute, materialize, plan setup) never sent `week:invalidate`.
  // The refetch on every mount used to hide that; with the week now held for its fresh window, they refresh it here.
  useEffect(() => {
    const handler = () => {
      try { queryClient.invalidateQueries({ queryKey: ['weekUnified'] }); } catch {}
    };
    const events = ['week:invalidate', 'planned:invalidate', 'workouts:invalidate'];
    events.forEach((e) => window.addEventListener(e, handler));
    return () => { events.forEach((e) => window.removeEventListener(e, handler)); };
  }, [queryClient]);

  const items: UnifiedItem[] = (query.data as any)?.items || [];
  const weeklyStats = (query.data as any)?.weekly_stats || { planned: 0, completed: 0 };
  const trainingPlanContext = (query.data as any)?.training_plan_context || null;
  const emptyDayLines: Record<string, string> = (query.data as any)?.empty_day_lines || {};
  const spacingLines: Record<string, SpacingLine | null> = (query.data as any)?.spacing_lines || {};
  // Show loading while fetching when there is no real data yet, or when showing previous week's placeholder (wrong dates for the requested range).
  const loading =
    enabled &&
    query.isFetching &&
    (query.isPlaceholderData || query.data === undefined);
  return { items, weeklyStats, trainingPlanContext, emptyDayLines, spacingLines, loading, error: (query.error as any)?.message || null };
}


