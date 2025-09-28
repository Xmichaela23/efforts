import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';

export type WorkoutDetailOptions = {
  include_gps?: boolean;
  include_sensors?: boolean;
  include_swim?: boolean;
  resolution?: 'low' | 'high';
  normalize?: boolean;
  version?: string;
};

export function useWorkoutDetail(id?: string, opts?: WorkoutDetailOptions) {
  const queryClient = useQueryClient();
  const { workouts } = useAppContext();

  // Try to find an already-hydrated workout in context (fallback path)
  const fromContext = useMemo(() => {
    try {
      if (!id || !Array.isArray(workouts)) return null;
      const w = (workouts as any[]).find((x:any)=> String(x?.id||'') === String(id));
      if (!w) return null;
      // Consider it hydrated if it already has gps_track or sensor_data
      const hasGps = Array.isArray((w as any)?.gps_track) && (w as any).gps_track.length>0;
      const hasSensors = !!(w as any)?.sensor_data;
      return (hasGps || hasSensors) ? w : null;
    } catch { return null; }
  }, [id, workouts]);

  const query = useQuery({
    queryKey: ['workout-detail', id, opts],
    enabled: !!id && !fromContext,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('not authenticated');
      const body = {
        id,
        include_gps: opts?.include_gps !== false,
        include_sensors: opts?.include_sensors === true ? true : false,
        include_swim: opts?.include_swim !== false,
        resolution: opts?.resolution || 'low',
        normalize: opts?.normalize !== false,
        version: opts?.version || 'v1',
      } as any;
      const { data, error } = await (supabase.functions.invoke as any)('workout-detail', { body });
      if (error) throw error;
      const workout = (data as any)?.workout || null;
      return workout;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Allow external invalidation
  useEffect(() => {
    const handler = () => { try { queryClient.invalidateQueries({ queryKey: ['workout-detail'] }); } catch {} };
    window.addEventListener('workouts:invalidate', handler);
    return () => { window.removeEventListener('workouts:invalidate', handler); };
  }, [queryClient]);

  return {
    workout: (fromContext as any) || (query.data as any) || null,
    loading: query.isFetching || query.isPending,
    error: (query.error as any)?.message || null,
  };
}


