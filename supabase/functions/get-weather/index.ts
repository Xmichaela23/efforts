import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

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

interface WeatherResponse {
  weather?: WeatherData;
  error?: string;
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: { 'Access-Control-Allow-Origin': '*' } 
    });
  }

  try {
    const { lat, lng, timestamp, workout_id } = await req.json();

    // Validate inputs strictly
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const tsStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || !tsStr) {
      return new Response(JSON.stringify({
        error: 'Invalid lat, lng, or timestamp'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return new Response(JSON.stringify({ error: 'lat/lng out of range' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Check if we already have weather data for this workout
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (workout_id) {
      const { data: existing, error: existingErr } = await supabase
        .from('workouts')
        .select('weather_data')
        .eq('id', workout_id)
        .maybeSingle();
      if (!existingErr && existing?.weather_data) {
        return new Response(JSON.stringify({ weather: existing.weather_data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Get weather data from OpenWeatherMap
    const weatherData = await fetchWeatherData(latNum, lngNum, tsStr);
    
    if (!weatherData) {
      return new Response(JSON.stringify({ 
        error: 'Unable to fetch weather data' 
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // Store weather data in workout record if workout_id provided
    if (workout_id) {
      await supabase
        .from('workouts')
        .update({ weather_data: weatherData })
        .eq('id', workout_id);
    }

    return new Response(JSON.stringify({ 
      weather: weatherData 
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });

  } catch (error) {
    console.error('Weather lookup error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});

async function fetchWeatherData(lat: number, lng: number, timestamp: string): Promise<WeatherData | null> {
  const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
  if (!apiKey) {
    console.error('OPENWEATHER_API_KEY not configured');
    return null;
  }

  try {
    // Preferred: One Call 3.0 for current + daily (sunrise/sunset + highs)
    const urlOneCall = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&appid=${apiKey}&units=imperial&exclude=minutely,hourly,alerts`;
    const resp = await fetch(urlOneCall);
    if (!resp.ok) {
      throw new Error(`Weather API error: ${resp.status}`);
    }
    const data = await resp.json();
    const current = data.current || {};
    const daily0 = Array.isArray(data.daily) && data.daily.length ? data.daily[0] : {};

    const sunriseUnix = daily0?.sunrise || current?.sunrise;
    const sunsetUnix = daily0?.sunset || current?.sunset;
    const sunriseIso = sunriseUnix ? new Date(sunriseUnix * 1000).toISOString() : undefined;
    const sunsetIso = sunsetUnix ? new Date(sunsetUnix * 1000).toISOString() : undefined;

    return {
      temperature: Math.round(current?.temp ?? 0),
      condition: (current?.weather && current.weather[0]?.main) || '—',
      humidity: Math.round(current?.humidity ?? 0),
      windSpeed: Math.round(current?.wind_speed ?? 0),
      windDirection: Math.round(current?.wind_deg ?? 0),
      precipitation: (current?.rain?.['1h'] ?? current?.snow?.['1h'] ?? 0) as number,
      sunrise: sunriseIso,
      sunset: sunsetIso,
      daily_high: daily0?.temp?.max != null ? Math.round(daily0.temp.max) : undefined,
      daily_low: daily0?.temp?.min != null ? Math.round(daily0.temp.min) : undefined,
      timestamp: timestamp
    };
    
  } catch (error) {
    console.error('Weather API error:', error);
    return null;
  }
}
