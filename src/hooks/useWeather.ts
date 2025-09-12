import { useState, useEffect } from 'react';

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
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
    if (!enabled || !lat || !lng || !timestamp) {
      setWeather(null);
      return;
    }

    const fetchWeather = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-weather`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            lat,
            lng,
            timestamp,
            workout_id: workoutId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Weather fetch failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.weather) {
          setWeather(data.weather);
        } else if (data.error) {
          setError(data.error);
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
