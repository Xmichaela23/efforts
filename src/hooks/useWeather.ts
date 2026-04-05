import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  sunrise?: string;
  sunset?: string;
  daily_high?: number;
  daily_low?: number;
  timestamp: string;
}

interface UseWeatherProps {
  lat?: number;
  lng?: number;
  timestamp?: string;
  workoutId?: string;
  enabled?: boolean;
}

export function useWeather({ lat, lng, timestamp, workoutId, enabled = true }: UseWeatherProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Basic guards: require all inputs and numeric coords
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
        const { data, error: fnError } = await (supabase.functions.invoke as any)('get-weather', {
          body: {
            lat: Number(lat),
            lng: Number(lng),
            timestamp,
            workout_id: workoutId,
          },
        });
        if (cancelled) return;
        if (fnError) throw fnError;

        if (data?.weather) {
          setWeather(data.weather as WeatherData);
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

    // Defer until the browser is idle so map tiles / critical UI aren't competing with the edge call on first paint
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
  }, [lat, lng, timestamp, workoutId, enabled]);

  return { weather, loading, error };
}
