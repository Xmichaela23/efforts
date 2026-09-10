import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { isGarminSourced } from '@/lib/provider-attribution';

/**
 * ═══ IS THERE GARMIN DATA BEHIND THIS SCREEN? ═══════════════════════════════════════════════════
 *
 * docs/WORKORDER-garmin-strava-attribution-2026-09-09.md §3. The derived-data footer ("Insights
 * derived in part from Garmin device-sourced data.", Garmin API Brand Guidelines v6.30.2025) is shown
 * only when the athlete has a Garmin connection OR any Garmin-sourced row in the loaded window —
 * and never otherwise: Garmin's guidelines forbid their attribution where Garmin data is absent.
 *
 * ⛔ ONE FETCH FOR THE THREE FOOTERS (Today's header, State's load plate, the Performance tab). The
 * connection question is asked of the same two tables `TodaysEffort` already reads for the reauth
 * line (`device_connections`, `user_connections`; RLS limits both to the athlete's own rows) and
 * cached under one react-query key, so the surfaces do not each ask again.
 *
 * ⚠️ THE ROW SIDE READS THE APP CONTEXT'S `workouts` (`useWorkouts` selects `source`,
 * `garmin_activity_id`, `device_info` — the fields the reader needs) plus whatever rows the caller
 * has in hand (the Performance tab passes its one completed session).
 */
export function useGarminDataPresence(extraRows?: readonly unknown[]): boolean {
  const { workouts } = useAppContext();

  const connection = useQuery({
    queryKey: ['garmin-connection-present'],
    queryFn: async (): Promise<boolean> => {
      try {
        const [uc, dc] = await Promise.all([
          supabase.from('user_connections').select('provider').eq('provider', 'garmin').limit(1),
          supabase.from('device_connections').select('provider').eq('provider', 'garmin').limit(1),
        ]);
        return (uc.data?.length ?? 0) > 0 || (dc.data?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const rowsHaveGarmin = useMemo(() => {
    const rows = [...(Array.isArray(workouts) ? workouts : []), ...(extraRows ?? [])];
    return rows.some((r) => r && isGarminSourced(r));
  }, [workouts, extraRows]);

  return connection.data === true || rowsHaveGarmin;
}
