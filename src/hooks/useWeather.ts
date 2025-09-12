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
        const response = await fetch(`https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/get-weather`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY`,
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
