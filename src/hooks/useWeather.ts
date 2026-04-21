import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  parseWorkoutWeatherDataForDisplay,
  type SessionWeatherForDisplay,
} from '@/lib/sessionWeather';

export type { SessionWeatherForDisplay };

interface UseWeatherProps {
  lat?: number;
  lng?: number;
  timestamp?: string;
  workoutId?: string;
  /** Moving duration in seconds — passed to get-weather so Open-Meteo returns start/end/peak across the effort */
  durationSeconds?: number;
  enabled?: boolean;
}

export function useWeather({
  lat,
  lng,
  timestamp,
  workoutId,
  durationSeconds,
  enabled = true,
}: UseWeatherProps) {
  const [weather, setWeather] = useState<SessionWeatherForDisplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || !timestamp) {
      setWeather(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchWeather = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      try {
        const body: Record<string, unknown> = {
          lat: Number(lat),
          lng: Number(lng),
          timestamp,
          workout_id: workoutId,
        };
        if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds >= 60) {
          body.duration_seconds = Math.min(6 * 3600, Math.round(durationSeconds));
        }

        const { data, error: fnError } = await (supabase.functions.invoke as any)('get-weather', {
          body,
        });
        if (cancelled) return;
        if (fnError) throw fnError;

        if (data?.weather) {
          const parsed = parseWorkoutWeatherDataForDisplay(data.weather);
          setWeather(parsed);
        } else if (data?.error) {
          setError(String(data.error));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const ric = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : null;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (ric) {
      idleId = ric(() => fetchWeather(), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(fetchWeather, 400);
    }

    return () => {
      cancelled = true;
      setLoading(false);
      if (idleId != null && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [lat, lng, timestamp, workoutId, enabled, durationSeconds]);

  return { weather, loading, error };
}
