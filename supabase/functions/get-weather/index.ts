import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

/**
 * Bump when weather merge/cache semantics change so persisted workout rows refetch.
 * ⛔ 4 → 5 (2026-09-09, work order §3b.1): the request now asks Open-Meteo for `weather_code` and
 * `dew_point_2m`. Every cached row was written without them, and without the bump a cached hit
 * would keep returning a payload the new block has no icon and no dew point for — the screen would
 * look broken for exactly as long as the cache lives.
 * ⛔ 5 → 6 (2026-09-09, DEVICE FINDING): today no longer comes from the ARCHIVE. The Today screen
 * asks for `<date>T12:00:00` — a placeholder meaning "today", not an hour anybody trained in — and
 * the archive answered with the reanalysis for noon UTC. On a device at 100°F it read 82°F. Today
 * now comes from the FORECAST endpoint's `current` block. Every row cached under schema 5 holds a
 * noon-archive number, so without the bump the wrong temperature survives the fix for as long as
 * the cache lives.
 * ⛔ 6 → 7 (2026-09-09, SESSION WEATHER): a session's hour was read as MIDNIGHT UTC and its day was
 * read off an archive that lags 2-5 days. Michael's Wednesday ride stored 76°F start and end for a
 * ride ridden at about 90°F. Every stored session-weather row was written by that arithmetic, so
 * without the bump the wrong temperature stays on every past session for as long as the row lives.
 */
const WEATHER_SCHEMA_VERSION = 7;

interface WeatherData {
  /** Representative temp for the session: avg over [start, end] when duration provided, else start-hour slot. */
  temperature: number;
  /** Open-Meteo temps (°F) at workout start hour, end hour, and max in between — when duration_seconds was sent. */
  temperature_start_f?: number;
  temperature_end_f?: number;
  temperature_peak_f?: number;
  temperature_avg_f?: number;
  feels_like?: number;
  /**
   * ⛔ `'—'` NO LONGER, WHERE OPEN-METEO ANSWERS (work order 2026-09-09 §3b.1). The archive does not
   * return condition TEXT, which is why this shipped as an em dash — but it does return a WMO
   * `weather_code`, and the screen wants an icon rather than a word. The code travels raw and the
   * client maps it; a picture is a display decision and does not belong in the payload.
   * ⚠️ STILL `'—'` when the request predates this or the code is missing, so nothing that reads
   * `condition` has to learn a new empty value.
   */
  weather_code?: number;
  condition: string;
  humidity: number;
  /** °F. Open-Meteo's `dew_point_2m`, shown beside humidity (§3b.1). Absent on rows fetched before. */
  dew_point?: number;
  /**
   * The head unit's own average, °F. ⚠️ NOT THE TEMPERATURE — see the note in `fetchWeatherData`. A
   * device measures its own microclimate; this is here so the reading survives, not so it is shown
   * instead of the air.
   */
  device_temp_f?: number;
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
    let tsStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString();
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

    /**
     * ═══ THE SESSION'S REAL START HOUR, BEFORE ANYTHING IS KEYED ON IT ═══════════════════════════
     *
     * ⛔ A DATE IS NOT AN HOUR, AND READING ONE AS AN HOUR IS MIDNIGHT UTC. (Michael's Wednesday
     * ride read 76°F start and end; it was about 90°F.) `analyze-running-workout` falls back to
     * `workout.date` when the sensor samples carry no start time, and the client's
     * `weatherInvokeArgsFromWorkout` falls back the same way — so a bare `2026-09-09` arrives here,
     * is parsed as `2026-09-09T00:00:00Z`, and the ride is priced at the coldest hour of the night.
     * At US-west longitudes midnight UTC is FIVE IN THE AFTERNOON THE DAY BEFORE, so the reading is
     * not even the right day.
     *
     * ⛔ THE ROW ALREADY HOLDS THE ANSWER. `ingest-activity` writes `workouts.timestamp` as the real
     * UTC instant for both providers — Strava's `start_date`, Garmin's `startTimeInSeconds` — and
     * nothing here was reading it. That is the fix: one column, already populated, never consulted.
     *
     * ⚠️ THE READ MOVED ABOVE THE CACHE KEY. It used to sit below, which meant the key, the hour
     * bucket and the endpoint decision were all made from the WRONG instant and the corrected one
     * arrived too late to matter.
     */
    let rowWeatherData: unknown = null;
    let rowDeviceTempC: number | null = null;
    if (workout_id) {
      const { data: row, error: rowErr } = await supabase
        .from('workouts')
        .select('timestamp, weather_data, avg_temperature')
        .eq('id', workout_id)
        .maybeSingle();
      if (!rowErr && row) {
        rowWeatherData = row.weather_data ?? null;
        if (row.avg_temperature != null && Number.isFinite(Number(row.avg_temperature))) {
          rowDeviceTempC = Number(row.avg_temperature);
        }
        /**
         * ⚠️ THE ROW WINS ONLY WHERE THE ARGUMENT IS NOT AN HOUR. A caller that sent a real instant
         * (the analyzer, off sensor samples) is more precise than the row's summary start, and
         * overruling it would be a regression on the path that already works. A date-only string, or
         * one that lands exactly on midnight UTC, is not an hour anybody trained in.
         */
        const rowTs = typeof row.timestamp === 'string' ? row.timestamp : null;
        const argIsHourless = !/T\d{2}:/.test(tsStr) || /T00:00:00(\.0+)?Z?$/.test(tsStr);
        if (rowTs && argIsHourless && Number.isFinite(Date.parse(rowTs))) {
          console.log(`🌡️ [WEATHER] Start hour corrected from the row: ${tsStr} → ${rowTs}`);
          tsStr = new Date(rowTs).toISOString();
        }
      }
    }

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

    /**
     * ⛔ TODAY IS NOT AN ARCHIVE QUESTION (2026-09-09 device finding: 82°F shown at 100°F).
     *
     * The Today screen asks for `<date>T12:00:00` — a PLACEHOLDER meaning "today", not an hour the
     * athlete trained in — with no `workout_id`, because there is no session yet. The archive
     * answered with the noon reanalysis, which is a different number from what it is like outside
     * right now, and in a hot afternoon it is 18°F different.
     *
     * ⚠️ THE TWO DECISIONS ARE SEPARATE, and conflating them is how the session paths would break:
     *
     *  - WHICH ENDPOINT. The archive is a reanalysis and is the right source for a past day; it is
     *    the wrong source for today. `requestedDay` within one UTC calendar day of now goes to the
     *    forecast endpoint (`past_days` covers the adjacency), everything older stays on the
     *    archive. ⚠️ ONE DAY, not a tuned window: an athlete's local calendar date is never more
     *    than one UTC day from now's UTC date (offsets run ±14h), so day-adjacency is exactly the
     *    set of dates that can BE today somewhere. Nothing is estimated about the location.
     *
     *  - WHICH HOUR. `current` is only right for a request that has no hour of its own. A session
     *    request always carries `workout_id` and a real start time, and must keep reading the hour
     *    it was run in — a run uploaded at 6pm must not be stamped with the 6pm temperature. So
     *    `current` is for the no-workout_id case only; a today session reads the forecast
     *    endpoint's HOURLY slot, which is the accuracy win on today's sessions for free.
     */
    const requestedDay = tsStr.slice(0, 10);
    const nowUtcDay = new Date().toISOString().slice(0, 10);
    const requestedDayIsTodayish = Math.abs(utcCalendarDayDiff(requestedDay, nowUtcDay)) <= 1;
    /**
     * ⛔⛔ THE ARCHIVE IS NOT A RECORD OF LAST WEEK — IT LAGS. Open-Meteo's archive is ERA5 reanalysis
     * and trails real time by roughly two to five days; asked for a ride from Wednesday it answers
     * with whatever the model has, which is not that ride's weather and on the most recent days is
     * nothing at all. A session inside that lag has to come off the FORECAST endpoint, which carries
     * its own recent past through `past_days`.
     *
     * ⚠️ FIVE DAYS, AND IT IS OPEN-METEO'S FIGURE, NOT ONE OF OURS — their archive documents a two-
     * to-five-day delay. Taking the far end is the safe read: a day the archive DOES have is served
     * just as well by the forecast endpoint's hourly series, so erring long costs nothing and erring
     * short is exactly the bug being fixed.
     */
    const ARCHIVE_LAG_DAYS = 5;
    const daysAgo = utcCalendarDayDiff(nowUtcDay, requestedDay);
    const requestedDayWithinArchiveLag = daysAgo >= 0 && daysAgo <= ARCHIVE_LAG_DAYS;
    // ⚠️ TODAY ONLY. A date further out than day-adjacency stays on the archive and therefore keeps
    // returning nothing, exactly as before — nothing in the app asks for future weather (the Today
    // screen's `useWeather` is gated on `isTodayDate`, and a workout is always in the past), and
    // widening this to the forecast window would be building a caller that does not exist.
    const useForecastEndpoint = requestedDayIsTodayish || requestedDayWithinArchiveLag;
    const wantsCurrentConditions = !workout_id && requestedDayIsTodayish;

    /**
     * ⚠️ `:cur` KEEPS THE TWO ANSWERS APART IN THE SHARED CACHE. A current-conditions row and a
     * noon-hourly row are both "today at this location"; without the marker a session that really
     * did start at noon would be served whatever it happens to be outside now.
     */
    const cacheKey = `${rlat}:${rlng}:${hourSlotUtc}:d${durBucket}${wantsCurrentConditions ? ':cur' : ''}`;
    
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

    /**
     * 2) Per-workout cache + device temp (°C from Garmin/Strava), preferred over reanalysis.
     * ⚠️ THE ROW WAS ALREADY READ ABOVE — one query, not two. It had to move up there so the real
     * start hour could correct `tsStr` before the cache key was built from it.
     */
    const deviceTempC: number | null = rowDeviceTempC;
    if (!skipCache && rowWeatherData) {
      const cached = rowWeatherData as WeatherData & { schema_version?: number };
      if (cached?.schema_version === WEATHER_SCHEMA_VERSION) {
        console.log('🌡️ [WEATHER] Returning from workout cache');
        return new Response(JSON.stringify({ weather: rowWeatherData }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      console.log('🌡️ [WEATHER] Workout cache schema stale or missing; refetching');
    }

    const weatherData = await fetchWeatherData(
      latNum,
      lngNum,
      tsStr,
      deviceTempC,
      durationSeconds,
      { useForecastEndpoint, wantsCurrentConditions },
    );
    
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

      // ⛔ BACKFILL THE ROUTE ROW'S CONDITIONS — THE HEAT ENGINE IS STARVED BY A RACE (2026-07-31).
      //
      // `compute-facts` writes `route_progress_metrics` (temp_f / humidity_pct / dew_point_f) by
      // reading `workouts.weather_data` — but the weather is fetched HERE, from
      // `analyze-running-workout`, which the ingest fan-out fires AND DOES NOT AWAIT. So on a normal
      // ingest compute-facts reads an empty `weather_data` and stamps null, and the temperature
      // arrives seconds later with nothing left to write it to.
      //
      // ⚠️ MEASURED, NOT ASSUMED: 49 of 164 route rows had a null `temp_f` while the workout beside
      // them carried a perfectly good `weather_data.temperature` — and it was the RECENT rows, the
      // ones a trend actually reads. The rows that did have it were the ones later recomputed.
      //
      // ⛔ THE HEAT DE-CONFOUND WAS NEVER A STUB. `_shared/heat-adjust.ts` fits the coefficient per
      // route by regression and refuses when heat and fitness are not separable — it was simply being
      // handed a third of its temperatures as null. `CAPABILITY-MAP` recorded this ordering bug on
      // 2026-07-17 and nothing acted on it. This is that fix: the writer of the weather fills the
      // derived columns, at the moment the value exists.
      //
      // ⚠️ Non-fatal and non-blocking. A missing route row is the normal case (treadmill, <1km, no
      // GPS) — `eq` simply matches nothing. Weather must never fail because a downstream table did.
      try {
        const tF = Number((weatherData as any)?.temperature);
        const rh = Number((weatherData as any)?.humidity);
        if (Number.isFinite(tF)) {
          const patch: Record<string, unknown> = { temp_f: tF };
          if (Number.isFinite(rh) && rh > 0 && rh <= 100) {
            patch.humidity_pct = rh;
            // Magnus, same formula `_shared/heat-adjust.ts:dewPointF` uses — kept inline rather than
            // imported so this function keeps no dependency on the trend layer.
            const tc = (tF - 32) * (5 / 9);
            const g = Math.log(rh / 100) + (17.62 * tc) / (243.12 + tc);
            const dc = (243.12 * g) / (17.62 - g);
            patch.dew_point_f = Math.round((dc * 9 / 5 + 32) * 10) / 10;
          }
          await supabase.from('route_progress_metrics').update(patch).eq('workout_id', workout_id);
        }
      } catch (e) {
        console.warn('[get-weather] route conditions backfill skipped:', e instanceof Error ? e.message : e);
      }
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

/**
 * Whole-day difference between two `YYYY-MM-DD` strings. Used only to ask "could this date be today
 * somewhere" — see the endpoint decision in the handler.
 */
function utcCalendarDayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.round((ta - tb) / 86400000);
}

/**
 * Daily max/min for one date out of a `daily=` block. The forecast endpoint is asked for several
 * days (`past_days` + `forecast_days`), so the old "max over every hour in the response" would have
 * returned a four-day high. ⚠️ Returns nothing rather than a wrong day when the date is absent.
 */
function pickDailyHighLow(
  daily: { time?: string[]; temperature_2m_max?: (number | null)[]; temperature_2m_min?: (number | null)[] } | undefined,
  utcDay: string,
): { daily_high?: number; daily_low?: number } {
  if (!daily?.time?.length) return {};
  const idx = daily.time.findIndex((t) => String(t).slice(0, 10) === utcDay.slice(0, 10));
  if (idx < 0) return {};
  const hi = daily.temperature_2m_max?.[idx];
  const lo = daily.temperature_2m_min?.[idx];
  return {
    daily_high: hi != null && Number.isFinite(Number(hi)) ? Math.round(Number(hi)) : undefined,
    daily_low: lo != null && Number.isFinite(Number(lo)) ? Math.round(Number(lo)) : undefined,
  };
}

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
  /** See the endpoint / hour decision in the handler — the two flags are not the same question. */
  opts: { useForecastEndpoint: boolean; wantsCurrentConditions: boolean } = {
    useForecastEndpoint: false,
    wantsCurrentConditions: false,
  },
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

    // ⛔ SAME FIELDS FROM EITHER ENDPOINT so one payload shape reaches the screen. Both are asked in
    // °F and mph, and both `timezone=UTC` — the hourly index math parses these strings as UTC.
    const HOURLY_FIELDS =
      'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation';
    const UNITS = 'temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC';

    let url: string;
    if (opts.useForecastEndpoint) {
      // ⚠️ `past_days=2` is what makes the one-day UTC adjacency safe: whichever side of the UTC
      // date line the athlete's local today falls on, its hours are in the response.
      const currentParam = opts.wantsCurrentConditions ? `&current=${HOURLY_FIELDS}` : '';
      url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&hourly=${HOURLY_FIELDS}${currentParam}` +
        `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min` +
        // ⚠️ `past_days=7`, NOT 2 — it has to cover the archive's own lag (`ARCHIVE_LAG_DAYS`) plus
        // the day of UTC adjacency, or a four-day-old session routed here finds no hour to read.
        `&past_days=7&forecast_days=2&${UNITS}`;
      console.log(
        `🌡️ [WEATHER] Fetching Open-Meteo FORECAST at ${lat},${lng} (${opts.wantsCurrentConditions ? 'current hour' : `hourly slot ${workoutDate.toISOString()}`} dur_s=${durationSeconds ?? 'n/a'})`,
      );
    } else {
      url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
        `&start_date=${rangeStart}&end_date=${rangeEnd}` +
        `&hourly=${HOURLY_FIELDS}&daily=sunrise,sunset&${UNITS}`;
      console.log(
        `🌡️ [WEATHER] Fetching Open-Meteo archive ${rangeStart}..${rangeEnd} at ${lat},${lng} (workout ${workoutDate.toISOString()} dur_s=${durationSeconds ?? 'n/a'})`,
      );
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Open-Meteo API error: ${resp.status}`);
      return null;
    }
    
    const data = await resp.json();
    const { sunrise: srDaily, sunset: ssDaily } = pickDailySunriseSunset(data.daily, dateStr);

    /**
     * ═══ WHAT IT IS LIKE OUTSIDE RIGHT NOW ══════════════════════════════════════════════════════
     *
     * The Today screen's request, and only that one. `current` is Open-Meteo's own latest hour, so
     * there is no slot to pick and no window to average — the reading is the reading.
     *
     * ⚠️ NO DEVICE OVERRIDE HERE, and it cannot arise: `deviceTempC` is only read off a workout row,
     * and this branch is reached only when there is no `workout_id`. A device average is the
     * temperature of a session that already happened; it is not the current conditions.
     * ⚠️ NO start/end/peak/avg either — those describe an effort's window, and there is no effort.
     */
    if (opts.wantsCurrentConditions && data.current && typeof data.current === 'object') {
      const cur = data.current as Record<string, unknown>;
      const n = (v: unknown): number | undefined => {
        const x = Number(v);
        return Number.isFinite(x) ? x : undefined;
      };
      const curTemp = n(cur.temperature_2m);
      if (curTemp != null) {
        const curFeels = n(cur.apparent_temperature);
        const curHum = n(cur.relative_humidity_2m);
        const curDew = n(cur.dew_point_2m);
        const curWind = n(cur.wind_speed_10m);
        const curWindDir = n(cur.wind_direction_10m);
        const curPrecip = n(cur.precipitation);
        const curCode = n(cur.weather_code);
        const { daily_high, daily_low } = pickDailyHighLow(data.daily, dateStr);

        console.log(
          `🌡️ [WEATHER] Current conditions ${cur.time ?? '?'}: ${Math.round(curTemp)}°F (feels ${curFeels != null ? Math.round(curFeels) : '—'}°F, rh ${curHum ?? '—'}%, dew ${curDew != null ? Math.round(curDew) : '—'}°F, code ${curCode ?? '—'}) high ${daily_high ?? '—'} low ${daily_low ?? '—'}`,
        );

        return {
          temperature: Math.round(curTemp),
          feels_like: curFeels != null ? Math.round(curFeels) : undefined,
          // ⚠️ Still no condition TEXT from Open-Meteo — the em dash stays and the icon comes off
          // `weather_code`, exactly as on the archive path.
          condition: '—',
          weather_code: curCode != null ? Math.round(curCode) : undefined,
          humidity: Math.round(curHum ?? 0),
          dew_point: curDew != null ? Math.round(curDew) : undefined,
          windSpeed: Math.round(curWind ?? 0),
          windDirection: Math.round(curWindDir ?? 0),
          precipitation: curPrecip ?? 0,
          sunrise: srDaily,
          sunset: ssDaily,
          daily_high,
          daily_low,
          timestamp: typeof cur.time === 'string' ? normalizeOpenMeteoUtcInstant(cur.time) : timestamp,
          schema_version: WEATHER_SCHEMA_VERSION,
        };
      }
      console.warn('[get-weather] forecast `current` had no temperature; falling back to the hourly slot');
    }

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
    // §3b.1 — the two fields this request never asked for. Both are read at the same slot as the
    // rest, so the whole block describes one hour rather than a mix of hours.
    const dewPoint = hourly.dew_point_2m?.[bestIdx];
    const weatherCode = hourly.weather_code?.[bestIdx];

    /**
     * Daily high/low. ⛔ THE OLD "max over every hour in the response" IS ONLY SAFE ON THE ARCHIVE,
     * whose range is the session's own day (or two). The forecast endpoint is asked for four days,
     * so that same line would have reported a four-day high as today's. The forecast path reads the
     * `daily=` block for the one date instead, and falls back to the hourly span if it is missing.
     */
    const dailyFromBlock = pickDailyHighLow(data.daily, dateStr);
    const temps = hourly.temperature_2m.filter((t: number | null) => t != null);
    const dailyHigh =
      dailyFromBlock.daily_high ?? (temps.length ? Math.round(Math.max(...temps)) : undefined);
    const dailyLow =
      dailyFromBlock.daily_low ?? (temps.length ? Math.round(Math.min(...temps)) : undefined);

    let temperature = Math.round(temp ?? 0);
    let temperature_start_f: number | undefined;
    let temperature_end_f: number | undefined;
    let temperature_peak_f: number | undefined;
    let temperature_avg_f: number | undefined;

    /**
     * ⛔⛔ THE DEVICE NO LONGER OVERRULES OPEN-METEO, AND THIS IS WHAT MADE THE WEDNESDAY RIDE READ
     * 76°F (measured 2026-09-09, ride `5aee2bcf`, Los Angeles, 2026-09-10T01:57Z).
     *
     * `workouts.avg_temperature` on that ride was 24.63 °C — exactly 76°F, and exactly the number
     * that reached the screen for start, end, peak and average alike. Open-Meteo's own answer for
     * that hour at those coordinates is 96.4°F, and the SAME PAYLOAD already carried its other
     * readings unchanged: `feels_like: 93`, `daily_high: 100`, `humidity: 35`, `dew_point: 61`. The
     * blob was internally contradictory — a 76°F ride that felt like 93°F on a 100°F day — because
     * one field came off a bike computer and every other field came off the weather.
     *
     * ⚠️ A HEAD UNIT MEASURES ITS OWN MICROCLIMATE, not the air. In a jersey pocket, in shade behind
     * a bag, or still cooling from indoors, it reads low; clamped in the sun on black bars it reads
     * high. It is a sensor on a frame; Open-Meteo is the measurement of the air the athlete rode in,
     * and the heat de-confound downstream (`_shared/heat-adjust.ts`) is fitted on air temperature.
     *
     * ⚠️ THE READING IS NOT THROWN AWAY — it travels as `device_temp_f`, its own field, so anything
     * that wants the head unit's number can have it and nothing has to guess which one it is looking
     * at. What changes is only which number is called the temperature.
     */
    if (
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
      // ⚠️ THE ARCHIVE STILL RETURNS NO CONDITION TEXT — the em dash stays, and the icon comes off
      // `weather_code` instead (§3b.1). Changing `condition` to a word would be inventing one.
      condition: '—',
      weather_code: Number.isFinite(Number(weatherCode)) ? Number(weatherCode) : undefined,
      humidity: Math.round(humidity ?? 0),
      dew_point: Number.isFinite(Number(dewPoint)) ? Math.round(Number(dewPoint)) : undefined,
      device_temp_f: deviceTempC != null && Number.isFinite(deviceTempC)
        ? Math.round(deviceTempC * 9 / 5 + 32) : undefined,
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
