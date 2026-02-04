import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

interface WeatherData {
  temperature: number;
  feels_like?: number;
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
    const { lat, lng, timestamp, workout_id, force_refresh } = await req.json();

    // Validate inputs strictly
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const tsStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
    const skipCache = force_refresh === true;
    
    if (skipCache) {
      console.log('🌡️ [WEATHER] Force refresh requested - skipping all caches');
    }
    
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

    // 1) Shared cache by geo/day with TTL window - SKIP if force_refresh
    const round = (n: number) => Math.round(n * 20) / 20; // ~0.05° buckets (~5.5km)
    const rlat = round(latNum);
    const rlng = round(lngNum);
    const day = new Date(tsStr).toISOString().slice(0, 10);
    const cacheKey = `${rlat}:${rlng}:${day}`;
    
    if (!skipCache) {
      try {
        const { data: cached } = await supabase
          .from('weather_cache')
          .select('weather,expires_at')
          .eq('key', cacheKey)
          .maybeSingle();
        if (cached && cached.weather) {
          const exp = cached.expires_at ? new Date(cached.expires_at) : null as any;
          if (exp && exp.getTime() > Date.now()) {
            console.log('🌡️ [WEATHER] Returning from shared cache');
            return new Response(JSON.stringify({ weather: cached.weather }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
        }
      } catch {}
    }
    
    // Store cacheKey for later write
    (globalThis as any).__wx_cache_key = cacheKey;
    
    // If force refresh, delete the old shared cache entry so we get fresh data
    if (skipCache) {
      try {
        await supabase.from('weather_cache').delete().eq('key', cacheKey);
        console.log('🌡️ [WEATHER] Deleted old shared cache entry');
      } catch {}
    }

    // 2) Per-workout cache on workouts.weather_data - SKIP if force_refresh
    if (!skipCache && workout_id) {
      const { data: existing, error: existingErr } = await supabase
        .from('workouts')
        .select('weather_data')
        .eq('id', workout_id)
        .maybeSingle();
      if (!existingErr && existing?.weather_data) {
        console.log('🌡️ [WEATHER] Returning from workout cache');
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
    const workoutHourUTC = workoutDate.getUTCHours();
    
    // IMPORTANT: Use UTC timezone to avoid server/local timezone issues
    // The workout timestamp is already in UTC, so we match against UTC hours
    const dateStr = workoutDate.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
    
    console.log(`🌡️ [WEATHER] Fetching historical weather for ${dateStr} UTC hour ${workoutHourUTC} at ${lat},${lng}`);
    console.log(`🌡️ [WEATHER] Workout timestamp: ${timestamp} -> ${workoutDate.toISOString()}`);
    
    // Open-Meteo archive API - free, no key required
    // Use timezone=UTC so all times are in UTC (consistent with our timestamp)
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC`;
    
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
    
    // Match workout UTC hour to Open-Meteo's UTC hours
    // Open-Meteo with timezone=UTC returns times like "2026-02-01T00:00", "2026-02-01T01:00", etc.
    // These are indices 0-23 for hours 0-23 UTC
    const bestIdx = workoutHourUTC;
    
    console.log(`🌡️ [WEATHER] Using UTC hour index ${bestIdx}, time in response: ${hourly.time[bestIdx]}`);
    
    const temp = hourly.temperature_2m[bestIdx];
    const feelsLike = hourly.apparent_temperature?.[bestIdx];
    const humidity = hourly.relative_humidity_2m?.[bestIdx];
    const windSpeed = hourly.wind_speed_10m?.[bestIdx];
    const windDir = hourly.wind_direction_10m?.[bestIdx];
    const precip = hourly.precipitation?.[bestIdx];
    
    // Get daily high/low from the full day's data
    const temps = hourly.temperature_2m.filter((t: number | null) => t != null);
    const dailyHigh = temps.length ? Math.round(Math.max(...temps)) : undefined;
    const dailyLow = temps.length ? Math.round(Math.min(...temps)) : undefined;
    
    console.log(`🌡️ [WEATHER] Open-Meteo result: ${Math.round(temp)}°F (feels like ${Math.round(feelsLike || temp)}°F) at UTC hour ${bestIdx} (high: ${dailyHigh}, low: ${dailyLow})`);
    
    return {
      temperature: Math.round(temp ?? 0),
      feels_like: feelsLike != null ? Math.round(feelsLike) : undefined,
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
