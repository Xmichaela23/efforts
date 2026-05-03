import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

/** Bump when weather merge/cache semantics change so persisted workout rows refetch */
const WEATHER_SCHEMA_VERSION = 4;

interface WeatherData {
  /** Representative temp for the session: avg over [start, end] when duration provided, else start-hour slot. */
  temperature: number;
  /** Open-Meteo temps (°F) at workout start hour, end hour, and max in between — when duration_seconds was sent. */
  temperature_start_f?: number;
  temperature_end_f?: number;
  temperature_peak_f?: number;
  temperature_avg_f?: number;
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
  schema_version?: number;
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
    const body = await req.json();
    const { lat, lng, timestamp, workout_id, force_refresh } = body;
    const durationSecondsRaw = body.duration_seconds;
    const durationSeconds =
      durationSecondsRaw != null && Number.isFinite(Number(durationSecondsRaw))
        ? Math.min(6 * 3600, Math.max(0, Math.round(Number(durationSecondsRaw))))
        : null;

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

    // 1) Shared cache by geo + UTC hour bucket (day-only keys wrongly reused one hour for all workouts that day)
    const round = (n: number) => Math.round(n * 20) / 20; // ~0.05° buckets (~5.5km)
    const rlat = round(latNum);
    const rlng = round(lngNum);
    const workoutDate = new Date(tsStr);
    const day = workoutDate.toISOString().slice(0, 10);
    const hourSlotUtc = workoutDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const durBucket =
      durationSeconds != null && durationSeconds >= 60
        ? Math.min(86400, Math.round(durationSeconds / 300) * 300)
        : 0;
    const cacheKey = `${rlat}:${rlng}:${hourSlotUtc}:d${durBucket}`;
    
    if (!skipCache) {
      try {
        const { data: cached } = await supabase
          .from('weather_cache')
          .select('weather,expires_at')
          .eq('key', cacheKey)
          .maybeSingle();
        if (cached && cached.weather) {
          const exp = cached.expires_at ? new Date(cached.expires_at) : null as any;
          const w = cached.weather as WeatherData;
          if (
            exp &&
            exp.getTime() > Date.now() &&
            w?.schema_version === WEATHER_SCHEMA_VERSION
          ) {
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

    // 2) Per-workout cache + device temp (°C from Garmin/Strava) to prefer over reanalysis when present
    let deviceTempC: number | null = null;
    if (workout_id) {
      const { data: existing, error: existingErr } = await supabase
        .from('workouts')
        .select('weather_data, avg_temperature')
        .eq('id', workout_id)
        .maybeSingle();
      if (!existingErr && existing?.avg_temperature != null && Number.isFinite(Number(existing.avg_temperature))) {
        deviceTempC = Number(existing.avg_temperature);
      }
      if (!skipCache && !existingErr && existing?.weather_data) {
        const cached = existing.weather_data as WeatherData & { schema_version?: number };
        if (cached?.schema_version === WEATHER_SCHEMA_VERSION) {
          console.log('🌡️ [WEATHER] Returning from workout cache');
          return new Response(JSON.stringify({ weather: existing.weather_data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        console.log('🌡️ [WEATHER] Workout cache schema stale or missing; refetching');
      }
    }

    const weatherData = await fetchWeatherData(latNum, lngNum, tsStr, deviceTempC, durationSeconds);
    
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
        await supabase.from('weather_cache').upsert({ key, lat: latNum, lng: lngNum, day, weather: weatherData, expires_at: expires });
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

function parseOpenMeteoUtcHourMs(iso: string): number {
  if (!iso) return NaN;
  const s = /Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return Date.parse(s);
}

/** Open-Meteo archive with timezone=UTC returns sunrise/sunset without offset; treat as UTC instant for clients. */
function normalizeOpenMeteoUtcInstant(iso: string): string {
  const s = String(iso || '').trim();
  if (!s) return s;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return `${s}Z`;
}

function pickDailySunriseSunset(
  daily: { time?: string[]; sunrise?: (string | null)[]; sunset?: (string | null)[] } | undefined,
  utcDay: string,
): { sunrise?: string; sunset?: string } {
  if (!daily?.time?.length || !daily.sunrise?.length || !daily.sunset?.length) return {};
  const dayPrefix = utcDay.slice(0, 10);
  let idx = daily.time.findIndex((t) => String(t).slice(0, 10) === dayPrefix);
  if (idx < 0) idx = 0;
  const sr = daily.sunrise[idx];
  const ss = daily.sunset[idx];
  if (typeof sr !== 'string' || typeof ss !== 'string' || !sr || !ss) return {};
  return {
    sunrise: normalizeOpenMeteoUtcInstant(sr),
    sunset: normalizeOpenMeteoUtcInstant(ss),
  };
}

function nearestHourlyIndex(hourlyTime: string[], workoutMs: number): number {
  if (!hourlyTime?.length) return 0;
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < hourlyTime.length; i++) {
    const t = parseOpenMeteoUtcHourMs(hourlyTime[i]);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - workoutMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

async function fetchWeatherData(
  lat: number,
  lng: number,
  timestamp: string,
  deviceTempC: number | null,
  durationSeconds: number | null,
): Promise<WeatherData | null> {
  try {
    const workoutDate = new Date(timestamp);
    const workoutMs = workoutDate.getTime();
    const dateStr = workoutDate.toISOString().slice(0, 10);
    const endMs =
      durationSeconds != null && durationSeconds >= 60 ? workoutMs + durationSeconds * 1000 : workoutMs;
    const endDateStr = new Date(endMs).toISOString().slice(0, 10);
    const rangeStart = dateStr <= endDateStr ? dateStr : endDateStr;
    const rangeEnd = dateStr >= endDateStr ? dateStr : endDateStr;

    console.log(
      `🌡️ [WEATHER] Fetching Open-Meteo archive ${rangeStart}..${rangeEnd} at ${lat},${lng} (workout ${workoutDate.toISOString()} dur_s=${durationSeconds ?? 'n/a'})`,
    );

    // Open-Meteo archive API - free, no key required
    // Use timezone=UTC so all times are in UTC (consistent with our timestamp)
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${rangeStart}&end_date=${rangeEnd}&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&daily=sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC`;
    
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Open-Meteo API error: ${resp.status}`);
      return null;
    }
    
    const data = await resp.json();
    const { sunrise: srDaily, sunset: ssDaily } = pickDailySunriseSunset(data.daily, dateStr);
    const hourly = data.hourly;
    
    if (!hourly || !hourly.time || !hourly.temperature_2m) {
      console.error('Open-Meteo returned no hourly data');
      return null;
    }
    
    const startIdx = nearestHourlyIndex(hourly.time, workoutMs);
    const endIdx = nearestHourlyIndex(hourly.time, endMs);
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const windowTemps: number[] = [];
    for (let i = lo; i <= hi; i++) {
      const t = hourly.temperature_2m[i];
      if (t != null && Number.isFinite(Number(t))) windowTemps.push(Number(t));
    }
    const tempAtStart = hourly.temperature_2m[startIdx];
    const tempAtEnd = hourly.temperature_2m[endIdx];
    const tempStartRounded = tempAtStart != null ? Math.round(tempAtStart) : null;
    const tempEndRounded = tempAtEnd != null ? Math.round(tempAtEnd) : null;
    const tempPeakRounded =
      windowTemps.length > 0 ? Math.round(Math.max(...windowTemps)) : tempStartRounded;
    const tempAvgRounded =
      windowTemps.length > 0
        ? Math.round(windowTemps.reduce((a, b) => a + b, 0) / windowTemps.length)
        : tempStartRounded;

    console.log(
      `🌡️ [WEATHER] Hourly window idx ${lo}-${hi} (${hourly.time[startIdx]} → ${hourly.time[endIdx]}): start ${tempStartRounded}°F end ${tempEndRounded}°F peak ${tempPeakRounded}°F avg ${tempAvgRounded}°F`,
    );

    const bestIdx = startIdx;
    const temp = hourly.temperature_2m[bestIdx];
    const feelsLike = hourly.apparent_temperature?.[bestIdx];
    const humidity = hourly.relative_humidity_2m?.[bestIdx];
    const windSpeed = hourly.wind_speed_10m?.[bestIdx];
    const windDir = hourly.wind_direction_10m?.[bestIdx];
    const precip = hourly.precipitation?.[bestIdx];

    // Get daily high/low from the full response
    const temps = hourly.temperature_2m.filter((t: number | null) => t != null);
    const dailyHigh = temps.length ? Math.round(Math.max(...temps)) : undefined;
    const dailyLow = temps.length ? Math.round(Math.min(...temps)) : undefined;

    let temperature = Math.round(temp ?? 0);
    let temperature_start_f: number | undefined;
    let temperature_end_f: number | undefined;
    let temperature_peak_f: number | undefined;
    let temperature_avg_f: number | undefined;

    if (deviceTempC != null && Number.isFinite(deviceTempC)) {
      temperature = Math.round(deviceTempC * 9 / 5 + 32);
      temperature_start_f = temperature;
      temperature_end_f = temperature;
      temperature_peak_f = temperature;
      temperature_avg_f = temperature;
      console.log(`🌡️ [WEATHER] Display temp from device avg (°C): ${deviceTempC} → °F ${temperature}; humidity/wind from Open-Meteo slot`);
    } else if (
      durationSeconds != null &&
      durationSeconds >= 60 &&
      tempStartRounded != null &&
      tempEndRounded != null &&
      tempPeakRounded != null &&
      tempAvgRounded != null
    ) {
      temperature = tempAvgRounded;
      temperature_start_f = tempStartRounded;
      temperature_end_f = tempEndRounded;
      temperature_peak_f = tempPeakRounded;
      temperature_avg_f = tempAvgRounded;
      console.log(
        `🌡️ [WEATHER] Session window temps °F: avg=${temperature} start=${temperature_start_f} end=${temperature_end_f} peak=${temperature_peak_f}`,
      );
    } else {
      console.log(`🌡️ [WEATHER] Open-Meteo point: ${temperature}°F (feels like ${Math.round(feelsLike || temp)}°F) (high: ${dailyHigh}, low: ${dailyLow})`);
    }

    return {
      temperature,
      temperature_start_f,
      temperature_end_f,
      temperature_peak_f,
      temperature_avg_f,
      feels_like: feelsLike != null ? Math.round(feelsLike) : undefined,
      condition: '—', // Open-Meteo archive doesn't provide condition text
      humidity: Math.round(humidity ?? 0),
      windSpeed: Math.round(windSpeed ?? 0),
      windDirection: Math.round(windDir ?? 0),
      precipitation: precip ?? 0,
      sunrise: srDaily,
      sunset: ssDaily,
      daily_high: dailyHigh,
      daily_low: dailyLow,
      timestamp: timestamp,
      schema_version: WEATHER_SCHEMA_VERSION,
    };
    
  } catch (error) {
    console.error('Weather API error:', error);
    return null;
  }
}
