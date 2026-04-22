import { useState, useEffect, useMemo } from 'react';
import { fetchArcContext, type ArcContextPayload } from '@/lib/fetch-arc-context';
import { buildArcSetupFiveKSupplement } from '@/lib/arc-setup-system-prompt';

/**
 * Fetches `get-arc-context` for season / AL setup. Exposes a ready-to-append system string for the coach.
 */
export function useArcSetupContext(focusDate?: string) {
  const [arc, setArc] = useState<ArcContextPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const a = await fetchArcContext(focusDate);
        if (!cancelled) setArc(a);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusDate]);

  const fiveKSystemSupplement = useMemo(
    () => buildArcSetupFiveKSupplement(arc?.five_k_nudge ?? null),
    [arc?.five_k_nudge]
  );

  return { arc, loading, error, fiveKSystemSupplement };
}
