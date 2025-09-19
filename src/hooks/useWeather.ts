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
      return;
    }

    const fetchWeather = async () => {
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
        if (fnError) throw fnError;
        
        if (data?.weather) {
          setWeather(data.weather as WeatherData);
        } else if (data?.error) {
          setError(String(data.error));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [lat, lng, timestamp, workoutId, enabled]);

  return { weather, loading, error };
}
