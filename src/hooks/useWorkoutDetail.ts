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

  const isUuid = (v?: string | null) => !!v && /[0-9a-fA-F-]{36}/.test(v);

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

  // Stable key for options to avoid refetch loops from new object identity each render
  const optsKey = useMemo(() => JSON.stringify({
    include_gps: opts?.include_gps !== false,
    include_sensors: opts?.include_sensors === true,
    include_swim: opts?.include_swim !== false,
    resolution: opts?.resolution || 'low',
    normalize: opts?.normalize !== false,
    version: opts?.version || 'v1',
  }), [
    opts?.include_gps,
    opts?.include_sensors,
    opts?.include_swim,
    opts?.resolution,
    opts?.normalize,
    opts?.version,
  ]);

  const query = useQuery({
    queryKey: ['workout-detail', id, optsKey],
    enabled: !!id && isUuid(id) && !fromContext,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // Allow function to authorize with service role when available; fall back to anon
      const normalized = JSON.parse(optsKey || '{}');
      const body = {
        id,
        ...normalized,
      } as any;
      const { data, error } = await (supabase.functions.invoke as any)('workout-detail', { body });
      if (error) throw error;
      const remote = (data as any)?.workout || null;
      // Merge with base row from context to preserve scalar columns (single source of truth)
      try {
        const base = Array.isArray(workouts) ? (workouts as any[]).find((x:any)=> String(x?.id||'') === String(id)) : null;
        if (base && remote) return { ...base, ...remote };
        return remote;
      } catch {
        return remote;
      }
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

  // Stable reference: memoize the returned object by workout id
  const stableWorkout = useMemo(() => {
    const w = (fromContext as any) || (query.data as any) || null;
    return w ? { ...w } : null;
    // Note: returning a new object only when the source w changes
  }, [id, fromContext, query.data]);

  return {
    workout: stableWorkout,
    loading: query.isFetching || query.isPending,
    error: (query.error as any)?.message || null,
  };
}


