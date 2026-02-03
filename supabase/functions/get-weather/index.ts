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

    // Prepare Supabase client (for workout caching and shared cache)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1) Shared cache by geo/day with TTL window
    try {
      const round = (n: number) => Math.round(n * 20) / 20; // ~0.05° buckets (~5.5km)
      const rlat = round(latNum);
      const rlng = round(lngNum);
      const day = new Date(tsStr).toISOString().slice(0, 10);
      const cacheKey = `${rlat}:${rlng}:${day}`;
      const { data: cached } = await supabase
        .from('weather_cache')
        .select('weather,expires_at')
        .eq('key', cacheKey)
        .maybeSingle();
      if (cached && cached.weather) {
        const exp = cached.expires_at ? new Date(cached.expires_at) : null as any;
        if (exp && exp.getTime() > Date.now()) {
          return new Response(JSON.stringify({ weather: cached.weather }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
      // carry cacheKey forward for write
      (globalThis as any).__wx_cache_key = cacheKey;
    } catch {}

    // 2) Per-workout cache on workouts.weather_data (if provided)
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

    // Write shared cache with 30-minute TTL (if table exists)
    try {
      const key = (globalThis as any).__wx_cache_key as string | undefined;
      if (key) {
        const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await supabase.from('weather_cache').upsert({ key, lat: latNum, lng: lngNum, day: new Date(tsStr).toISOString().slice(0,10), weather: weatherData, expires_at: expires });
      }
    } catch {}

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
  try {
    // Use Open-Meteo's FREE historical weather API (no API key needed)
    // This gives us actual weather at the workout time, not "current" weather
    const workoutDate = new Date(timestamp);
    const dateStr = workoutDate.toISOString().slice(0, 10); // YYYY-MM-DD
    const workoutHour = workoutDate.getUTCHours();
    
    console.log(`🌡️ [WEATHER] Fetching historical weather for ${dateStr} hour ${workoutHour} at ${lat},${lng}`);
    
    // Open-Meteo archive API - free, no key required
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
    
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Open-Meteo API error: ${resp.status}`);
      return null;
    }
    
    const data = await resp.json();
    const hourly = data.hourly;
    
    if (!hourly || !hourly.time || !hourly.temperature_2m) {
      console.error('Open-Meteo returned no hourly data');
      return null;
    }
    
    // Find the hour closest to workout time
    // Open-Meteo returns times like "2026-01-25T08:00" in local timezone
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < hourly.time.length; i++) {
      const hourTime = new Date(hourly.time[i]);
      const diff = Math.abs(hourTime.getTime() - workoutDate.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    
    const temp = hourly.temperature_2m[bestIdx];
    const humidity = hourly.relative_humidity_2m?.[bestIdx];
    const windSpeed = hourly.wind_speed_10m?.[bestIdx];
    const windDir = hourly.wind_direction_10m?.[bestIdx];
    const precip = hourly.precipitation?.[bestIdx];
    
    // Get daily high/low from the full day's data
    const temps = hourly.temperature_2m.filter((t: number | null) => t != null);
    const dailyHigh = temps.length ? Math.round(Math.max(...temps)) : undefined;
    const dailyLow = temps.length ? Math.round(Math.min(...temps)) : undefined;
    
    console.log(`🌡️ [WEATHER] Open-Meteo result: ${Math.round(temp)}°F at hour ${bestIdx} (high: ${dailyHigh}, low: ${dailyLow})`);
    
    return {
      temperature: Math.round(temp ?? 0),
      condition: '—', // Open-Meteo archive doesn't provide condition text
      humidity: Math.round(humidity ?? 0),
      windSpeed: Math.round(windSpeed ?? 0),
      windDirection: Math.round(windDir ?? 0),
      precipitation: precip ?? 0,
      sunrise: undefined, // Could add with separate API call if needed
      sunset: undefined,
      daily_high: dailyHigh,
      daily_low: dailyLow,
      timestamp: timestamp
    };
    
  } catch (error) {
    console.error('Weather API error:', error);
    return null;
  }
}
