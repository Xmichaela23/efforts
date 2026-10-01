import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredUserId } from '@/lib/supabase';
import { fetchArcContext, type ArcContextPayload } from '@/lib/fetch-arc-context';
import { buildArcSetupFiveKSupplement } from '@/lib/arc-setup-system-prompt';

/**
 * Fetches `get-arc-context` for season / AL setup. Exposes a ready-to-append system string for the coach.
 */
export function useArcSetupContext(focusDate?: string) {
  /**
   * ⛔ ONE SHARED FETCH (2026-09-30). The Focus screen now draws the three focus cards from this payload's setup words
   * and the builder opens right after it; each used to fetch `get-arc-context` on its own. Fresh for 60 s (OURS — covers
   * Focus → builder; after that a mount paints the held copy and fetches again behind it, so an edited number shows);
   * `reload` fetches again after the athlete saves a number mid-flow (Your numbers, 2026-09-22).
   */
  const queryClient = useQueryClient();
  const key = ['arc-setup-context', getStoredUserId() ?? 'anon', focusDate ?? null] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchArcContext(focusDate),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const arc: ArcContextPayload | null = q.data ?? null;
  const loading = q.isLoading;
  const error: unknown = q.error ?? null;

  const fiveKSystemSupplement = useMemo(
    () => buildArcSetupFiveKSupplement(arc?.five_k_nudge ?? null),
    [arc?.five_k_nudge]
  );

  return { arc, loading, error, fiveKSystemSupplement, reload: () => { void queryClient.invalidateQueries({ queryKey: key }); } };
}
