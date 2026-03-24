import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, getStoredUserId } from '@/lib/supabase';
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
      const uid = getStoredUserId();
      if (mounted) setHasSession(!!uid);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (mounted) setHasSession(!!s);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const isUuid = (v?: string | null) => !!v && /[0-9a-fA-F-]{36}/.test(v);

  // Rich row from list context (GPS/sensors) — used only until workout-detail returns.
  // PR-1: We always call workout-detail anyway so session_detail_v1 is never skipped.
  const contextPreview = useMemo(() => {
    try {
      if (!id || !Array.isArray(workouts)) return null;
      const w = (workouts as any[]).find((x: any) => String(x?.id || '') === String(id));
      if (!w) return null;
      const hasGps = Array.isArray((w as any)?.gps_track) && (w as any).gps_track.length > 0;
      const sensorData = (w as any)?.sensor_data;
      const hasSensors = Array.isArray(sensorData) && sensorData.length > 0;
      return hasGps || hasSensors ? w : null;
    } catch {
      return null;
    }
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
    enabled: !!id && isUuid(id) && hasSession,
    queryFn: async () => {
      // Build normalized options once
      const normalized = JSON.parse(optsKey || '{}');

      // Smart server, dumb client: server handles analysis computation
      // Get current session for auth
      const userId = getStoredUserId();
      if (!userId) throw new Error('Session expired - please log in again');
      const accessToken = (() => {
        try {
          const raw = localStorage.getItem('sb-yyriamwvtvzlkumqrvpm-auth-token');
          return raw ? (JSON.parse(raw) as any)?.access_token ?? '' : '';
        } catch { return ''; }
      })();
      
      const body = { id, ...normalized } as any;
      console.log('[useWorkoutDetail] Calling workout-detail for:', id, 'with options:', normalized);
      const { data, error } = await supabase.functions.invoke('workout-detail', {
        body,
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (error) throw error;
      const remote = (data as any)?.workout || null;
      const sessionDetailV1 = (data as any)?.session_detail_v1 || null;

      if (!remote) throw new Error('Workout not found');

      // Merge with base row from context to preserve scalars and GPS/sensors if edge omitted them
      let merged: any;
      try {
        const base = Array.isArray(workouts) ? (workouts as any[]).find((x: any) => String(x?.id || '') === String(id)) : null;
        if (base && remote) {
          merged = { ...base, ...remote };
          const remoteGps = remote.gps_track;
          const baseGps = base.gps_track;
          if (Array.isArray(remoteGps) && remoteGps.length > 0) {
            merged.gps_track = remoteGps;
          } else if (Array.isArray(baseGps) && baseGps.length > 0) {
            merged.gps_track = baseGps;
          }
          const remoteSamples = remote.samples;
          const baseSamples = base.samples;
          if (Array.isArray(remoteSamples) && remoteSamples.length > 0) {
            merged.samples = remoteSamples;
          } else if (Array.isArray(baseSamples) && baseSamples.length > 0) {
            merged.samples = baseSamples;
          }
          const remoteSd = remote.sensor_data;
          const baseSd = base.sensor_data;
          const remoteSdLen = Array.isArray(remoteSd) ? remoteSd.length : 0;
          const baseSdLen = Array.isArray(baseSd) ? baseSd.length : 0;
          if (remoteSdLen > 0) {
            merged.sensor_data = remoteSd;
          } else if (baseSdLen > 0) {
            merged.sensor_data = baseSd;
          }
        } else {
          merged = remote;
        }
      } catch {
        merged = remote;
      }

      return { workout: merged, session_detail_v1: sessionDetailV1 };
    },
    staleTime: 60_000, // 60s — workout details don't change unless explicitly recomputed
    gcTime: 6 * 60 * 60 * 1000, // 6 hours
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Allow external invalidation — only respond to workout-detail-specific events.
  // NOT workouts:invalidate — that fires on every list change / realtime update
  // and caused a write-back loop (workout-detail writes session_detail_v1 →
  // realtime fires workouts:invalidate → refetch → write-back → loop).
  useEffect(() => {
    const detailHandler = () => {
      try {
        queryClient.invalidateQueries({ queryKey: ['workout-detail'] });
      } catch {}
    };
    window.addEventListener('workout-detail:invalidate', detailHandler);
    return () => {
      window.removeEventListener('workout-detail:invalidate', detailHandler);
    };
  }, [queryClient]);

  const stableWorkout = useMemo(() => {
    const fromQuery = (query.data as any)?.workout ?? null;
    if (fromQuery) return { ...fromQuery };
    const preview = contextPreview as any;
    return preview ? { ...preview } : null;
  }, [id, contextPreview, query.data]);

  const sessionDetailV1 = useMemo(() => {
    return (query.data as any)?.session_detail_v1 ?? null;
  }, [query.data]);

  return {
    workout: stableWorkout,
    session_detail_v1: sessionDetailV1,
    loading: query.isFetching || query.isPending,
    error: (query.error as any)?.message || null,
  };
}


