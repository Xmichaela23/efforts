import { useEffect, useMemo, useState } from 'react';
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
  const [hasSession, setHasSession] = useState(false);

  // Check for active session
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) setHasSession(!!session);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (mounted) setHasSession(!!session);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const isUuid = (v?: string | null) => !!v && /[0-9a-fA-F-]{36}/.test(v);

  // Try to find an already-hydrated workout in context (fallback path)
  const fromContext = useMemo(() => {
    try {
      if (!id || !Array.isArray(workouts)) return null;
      const w = (workouts as any[]).find((x:any)=> String(x?.id||'') === String(id));
      if (!w) return null;
      // Consider it hydrated if it already has meaningful gps_track or sensor_data
      const hasGps = Array.isArray((w as any)?.gps_track) && (w as any).gps_track.length>0;
      // Check if sensor_data is actually an array/object with data, not just a string
      const sensorData = (w as any)?.sensor_data;
      const hasSensors = Array.isArray(sensorData) && sensorData.length > 0;
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
    enabled: !!id && isUuid(id) && !fromContext && hasSession,
    queryFn: async () => {
      // Build normalized options once
      const normalized = JSON.parse(optsKey || '{}');

      // Smart server, dumb client: server handles analysis computation
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired - please log in again');
      
      const body = { id, ...normalized } as any;
      console.log('[useWorkoutDetail] Calling workout-detail for:', id, 'with options:', normalized);
      const { data, error } = await supabase.functions.invoke('workout-detail', {
        body,
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      if (error) throw error;
      const remote = (data as any)?.workout || null;

      if (!remote) throw new Error('Workout not found');
      
      console.log('[useWorkoutDetail] Received workout data:', {
        id: remote.id,
        hasGpsTrack: !!remote.gps_track,
        gpsTrackLength: Array.isArray(remote.gps_track) ? remote.gps_track.length : 0,
        hasGpsTrackpoints: !!remote.gps_trackpoints
      });

      // Merge with base row from context to preserve scalars
      try {
        const base = Array.isArray(workouts) ? (workouts as any[]).find((x:any)=> String(x?.id||'') === String(id)) : null;
        if (base && remote) return { ...base, ...remote };
        return remote;
      } catch {
        return remote;
      }
    },
    staleTime: 60 * 60 * 1000, // 60 minutes - computed data is immutable once created
    gcTime: 6 * 60 * 60 * 1000, // 6 hours
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Allow external invalidation
  useEffect(() => {
    const handler = () => { 
      try { 
        queryClient.invalidateQueries({ queryKey: ['workout-detail'] }); 
        // Force immediate refetch by removing stale time
        queryClient.refetchQueries({ queryKey: ['workout-detail'] });
      } catch {} 
    };
    const detailHandler = () => { 
      try { 
        queryClient.invalidateQueries({ queryKey: ['workout-detail'] }); 
        queryClient.refetchQueries({ queryKey: ['workout-detail'] });
      } catch {} 
    };
    window.addEventListener('workouts:invalidate', handler);
    window.addEventListener('workout-detail:invalidate', detailHandler);
    return () => { 
      window.removeEventListener('workouts:invalidate', handler);
      window.removeEventListener('workout-detail:invalidate', detailHandler);
    };
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


