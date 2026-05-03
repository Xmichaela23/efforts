import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** When true, fetches `session_detail_v1` (Performance tab) in a second request. */
  fetchSessionDetail?: boolean;
};

/** Persisted Performance payload (merge_session_detail_v1_into_workout_analysis). */
export function extractSessionDetailV1FromWorkout(w: unknown): Record<string, unknown> | null {
  if (!w || typeof w !== 'object') return null;
  let wa = (w as { workout_analysis?: unknown }).workout_analysis;
  if (typeof wa === 'string') {
    try {
      wa = JSON.parse(wa);
    } catch {
      /* Intentional silence: corrupt workout_analysis string → no embedded session_detail */
      return null;
    }
  }
  if (!wa || typeof wa !== 'object') return null;
  const sd = (wa as { session_detail_v1?: unknown }).session_detail_v1;
  if (!sd || typeof sd !== 'object') return null;
  return sd as Record<string, unknown>;
}

/** Never surface edge response-only flags from persisted JSON (or merged row). */
function stripEphemeralSessionDetailFields(
  sd: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!sd || typeof sd !== 'object') return sd;
  const { stale: _st, stale_reason: _sr, ...rest } = sd;
  return rest as Record<string, unknown>;
}

export function useWorkoutDetail(id?: string, opts?: WorkoutDetailOptions) {
  const queryClient = useQueryClient();
  const { workouts } = useAppContext();
  /** Sync init avoids one frame (or more) with hasSession false while queries are disabled; v5 would treat disabled queries as `isPending` and we must not use that for global loading. */
  const [hasSession, setHasSession] = useState(() => typeof window !== 'undefined' && !!getStoredUserId());
  const fetchSessionDetail = !!opts?.fetchSessionDetail;
  /** Next session_detail invoke skips server fast path (recompute / attach / invalidate). */
  const forceSessionDetailRefreshRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const uid = getStoredUserId();
    if (mounted) setHasSession(!!uid);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (mounted) setHasSession(!!s);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const isUuid = (v?: string | null) => !!v && /[0-9a-fA-F-]{36}/.test(v);

  const contextPreview = useMemo(() => {
    try {
      if (!id || !Array.isArray(workouts)) return null;
      const w = (workouts as any[]).find((x: any) => String(x?.id || '') === String(id));
      if (!w) return null;
      const hasGps = Array.isArray((w as any)?.gps_track) && (w as any).gps_track.length > 0;
      const sensorData = (w as any)?.sensor_data;
      const hasSensors = Array.isArray(sensorData) && sensorData.length > 0;
      return hasGps || hasSensors ? w : null;
    } catch (e) {
      console.warn('[useWorkoutDetail] contextPreview unexpected:', e);
      return null;
    }
  }, [id, workouts]);

  const optsKey = useMemo(() => JSON.stringify({
    scope: 'workout',
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

  const workoutQuery = useQuery({
    queryKey: ['workout-detail', id, optsKey],
    enabled: !!id && isUuid(id) && hasSession,
    queryFn: async () => {
      const normalized = JSON.parse(optsKey || '{}');
      const userId = getStoredUserId();
      if (!userId) throw new Error('Session expired - please log in again');
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) console.warn('[useWorkoutDetail] getSession (workout scope):', sessionErr.message);
      const accessToken = sessionData.session?.access_token ?? '';
      if (!accessToken) throw new Error('Session expired - please log in again');

      const { data, error } = await supabase.functions.invoke('workout-detail', {
        body: { id, ...normalized, scope: 'workout' },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (error) throw error;
      const remote = (data as any)?.workout || null;
      if (!remote) throw new Error('Workout not found');

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
      } catch (e) {
        /* Intentional fallback: merge is best-effort; edge workout payload is still valid */
        console.warn('[useWorkoutDetail] merge with context workout failed, using remote only:', e);
        merged = remote;
      }

      const embRaw = extractSessionDetailV1FromWorkout(merged);
      const emb = embRaw ? stripEphemeralSessionDetailFields(embRaw) : null;
      if (emb && id) {
        // Only seed if cache is empty — never overwrite existing data (even stale/invalidated),
        // or the session query won't re-run after a recompute invalidation.
        const existing = queryClient.getQueryData(['workout-detail', id, 'session_detail']);
        if (!existing) {
          queryClient.setQueryData(['workout-detail', id, 'session_detail'], { session_detail_v1: emb });
        }
      }

      return { workout: merged };
    },
    staleTime: 60_000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Session query: `enabled` tracks Performance tab. Toggling away before resolve aborts the
  // in-flight request (expected); that is not a refetch loop—no cache write on cancel. After a
  // successful fetch, staleTime keeps data fresh while disabled so re-opening Performance does
  // not refetch until stale (invalidation still busts cache via shared workout-detail prefix).
  const sessionQuery = useQuery({
    queryKey: ['workout-detail', id, 'session_detail'],
    enabled: !!id && isUuid(id) && hasSession && fetchSessionDetail,
    queryFn: async () => {
      const userId = getStoredUserId();
      if (!userId) throw new Error('Session expired - please log in again');
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) console.warn('[useWorkoutDetail] getSession (session_detail scope):', sessionErr.message);
      const accessToken = sessionData.session?.access_token ?? '';
      if (!accessToken) throw new Error('Session expired - please log in again');

      const forceRefresh = forceSessionDetailRefreshRef.current;
      forceSessionDetailRefreshRef.current = false;

      const { data, error } = await supabase.functions.invoke('workout-detail', {
        body: {
          id,
          scope: 'session_detail',
          ...(forceRefresh ? { force_refresh: true } : {}),
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (error) throw error;
      const sessionDetailV1 = (data as any)?.session_detail_v1 || null;
      console.log('[session_detail] cache_hit:', (data as any)?._cache_hit, 'narrative_text:', String(sessionDetailV1?.narrative_text || '').slice(0, 80) || null, 'is_goal_race:', sessionDetailV1?.race?.is_goal_race, '_rn_gate:', (sessionDetailV1 as any)?._rn_gate, '_rn_data:', (sessionDetailV1 as any)?._rn_data);
      return { session_detail_v1: sessionDetailV1 };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const detailHandler = () => {
      try {
        forceSessionDetailRefreshRef.current = true;
        queryClient.invalidateQueries({ queryKey: ['workout-detail'] });
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          try {
            forceSessionDetailRefreshRef.current = true;
            queryClient.invalidateQueries({ queryKey: ['workout-detail'] });
          } catch (e) {
            console.warn('[useWorkoutDetail] deferred invalidateQueries:', e);
          }
        }, 750);
      } catch (e) {
        console.warn('[useWorkoutDetail] workout-detail:invalidate handler:', e);
      }
    };
    window.addEventListener('workout-detail:invalidate', detailHandler);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('workout-detail:invalidate', detailHandler);
    };
  }, [queryClient]);

  const stableWorkout = useMemo(() => {
    const fromQuery = (workoutQuery.data as any)?.workout ?? null;
    if (fromQuery) return { ...fromQuery };
    const preview = contextPreview as any;
    return preview ? { ...preview } : null;
  }, [id, contextPreview, workoutQuery.data]);

  const embeddedSessionDetail = useMemo(() => {
    const raw = extractSessionDetailV1FromWorkout(stableWorkout);
    return stripEphemeralSessionDetailFields(raw);
  }, [stableWorkout]);

  const sessionDetailV1 = useMemo(() => {
    // Performance tab runs scope=session_detail (edge may attach response-only `stale`).
    // Details tab does not refetch — reusing cached edge payload would wrongly show
    // “Analysis updating…” from a prior Performance visit.
    if (!fetchSessionDetail) {
      return embeddedSessionDetail;
    }
    const fromEdge = (sessionQuery.data as { session_detail_v1?: unknown })?.session_detail_v1;
    if (fromEdge != null && typeof fromEdge === 'object') return fromEdge as Record<string, unknown>;
    return embeddedSessionDetail;
  }, [fetchSessionDetail, sessionQuery.data, embeddedSessionDetail]);

  const haveSessionForUi = sessionDetailV1 != null;
  // v5: disabled queries are still `isPending` with fetchStatus `idle` — do not OR `isPending` for loading UX.
  const workoutQueryEnabled = !!id && isUuid(id) && hasSession;
  const sessionQueryEnabled = workoutQueryEnabled && fetchSessionDetail;
  const sessionDetailLoading =
    sessionQueryEnabled &&
    !haveSessionForUi &&
    sessionQuery.isLoading;

  return {
    workout: stableWorkout,
    session_detail_v1: sessionDetailV1,
    loading: workoutQueryEnabled && workoutQuery.isLoading,
    sessionDetailLoading,
    error:
      (workoutQuery.error as any)?.message ||
      (fetchSessionDetail ? (sessionQuery.error as any)?.message : null) ||
      null,
  };
}
