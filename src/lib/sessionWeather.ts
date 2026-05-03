/**
 * Single source of truth — workout weather for the client
 *
 * **Persisted canonical payload:** `workouts.weather_data` (JSON from `get-weather` during analysis).
 * **Fallback:** `workouts.avg_temperature` (device °C) when no API blob exists.
 *
 * Merge / race + course strategy on the server lives in
 * `supabase/functions/_shared/race-debrief.ts` (`resolveRaceDebriefWeather`); field names here
 * match `get-weather` / `weather_data` so UI and edge analysis describe the same numbers.
 */

export type SessionWeatherForDisplay = {
  /** Representative / avg °F */
  temperature: number;
  temperature_start_f?: number;
  temperature_end_f?: number;
  temperature_peak_f?: number;
  temperature_avg_f?: number;
  feels_like?: number;
  condition: string;
  /** Omitted when unknown (e.g. device-only fallback). */
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  precipitation?: number;
  daily_high?: number;
  daily_low?: number;
  /** ISO instant (UTC); from Open-Meteo daily when present */
  sunrise?: string;
  sunset?: string;
  timestamp?: string;
};

export type WorkoutLikeForWeather = {
  weather_data?: unknown;
  avg_temperature?: number | null;
  start_position_lat?: number | null;
  start_position_long?: number | null;
  timestamp?: string | null;
  date?: string | null;
  moving_time?: number | null;
  computed?: { overall?: { duration_s_moving?: number | null } } | null;
};

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** True when `weather_data` parses to a full Open-Meteo-backed row (skip redundant client fetch). */
export function workoutHasStoredOpenMeteoBlob(workout: Pick<WorkoutLikeForWeather, 'weather_data'>): boolean {
  return parseWorkoutWeatherDataForDisplay(workout?.weather_data) != null;
}

/** Parse JSON blob from `workouts.weather_data` or `get-weather` response. */
export function parseWorkoutWeatherDataForDisplay(raw: unknown): SessionWeatherForDisplay | null {
  if (raw == null) return null;
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const w = o as Record<string, unknown>;
  const temperature = num(w.temperature);
  if (temperature == null) return null;

  const humidityRaw = num(w.humidity);
  const windRaw = num(w.windSpeed);
  const condition = typeof w.condition === 'string' ? w.condition : '—';

  return {
    temperature,
    temperature_start_f: num(w.temperature_start_f),
    temperature_end_f: num(w.temperature_end_f),
    temperature_peak_f: num(w.temperature_peak_f),
    temperature_avg_f: num(w.temperature_avg_f),
    feels_like: num(w.feels_like),
    condition,
    ...(humidityRaw != null ? { humidity: Math.round(humidityRaw) } : {}),
    ...(windRaw != null ? { windSpeed: Math.round(windRaw) } : {}),
    windDirection: num(w.windDirection),
    precipitation: num(w.precipitation),
    daily_high: num(w.daily_high),
    daily_low: num(w.daily_low),
    ...(typeof w.sunrise === 'string' && w.sunrise ? { sunrise: w.sunrise } : {}),
    ...(typeof w.sunset === 'string' && w.sunset ? { sunset: w.sunset } : {}),
    timestamp: typeof w.timestamp === 'string' ? w.timestamp : undefined,
  };
}

/** Device °C → display row when there is no `weather_data` temperature. */
export function sessionWeatherFromDeviceAvgTempC(avgTempC: number | null | undefined): SessionWeatherForDisplay | null {
  if (avgTempC == null || !Number.isFinite(Number(avgTempC)) || Number(avgTempC) === 0) return null;
  const f = Math.round((Number(avgTempC) * 9) / 5 + 32);
  return {
    temperature: f,
    condition: '—',
  };
}

/**
 * Best-effort display from a workout row only (no live fetch).
 * Prefer `weather_data`; else device average.
 */
export function resolveSessionWeatherFromWorkoutRow(
  workout: Pick<WorkoutLikeForWeather, 'weather_data' | 'avg_temperature'>,
): SessionWeatherForDisplay | null {
  return parseWorkoutWeatherDataForDisplay(workout?.weather_data) ?? sessionWeatherFromDeviceAvgTempC(workout?.avg_temperature);
}

/**
 * Header / map strip: persisted Open-Meteo blob wins (matches analysis), then client fetch, then device avg.
 */
export function mergeSessionWeatherForDisplay(args: {
  workout: Pick<WorkoutLikeForWeather, 'weather_data' | 'avg_temperature'>;
  fetched: SessionWeatherForDisplay | null;
}): SessionWeatherForDisplay | null {
  const fromBlob = parseWorkoutWeatherDataForDisplay(args.workout?.weather_data);
  if (fromBlob) return fromBlob;
  if (args.fetched) return args.fetched;
  return sessionWeatherFromDeviceAvgTempC(args.workout?.avg_temperature);
}

/** Args for `get-weather` / `useWeather` — one place for duration + timestamp rules. */
export function weatherInvokeArgsFromWorkout(workout: WorkoutLikeForWeather | null | undefined): {
  lat?: number;
  lng?: number;
  timestamp?: string;
  durationSeconds?: number;
} {
  if (!workout) return {};
  const lat = workout.start_position_lat;
  const lng = workout.start_position_long;
  const timestamp = (workout.timestamp ?? workout.date) || undefined;
  const w = workout as WorkoutLikeForWeather;
  const comp = Number(w?.computed?.overall?.duration_s_moving);
  let durationSeconds: number | undefined;
  if (Number.isFinite(comp) && comp >= 60) durationSeconds = Math.round(comp);
  else {
    const mv = Number(w?.moving_time);
    if (Number.isFinite(mv) && mv > 0) durationSeconds = mv < 1000 ? Math.round(mv * 60) : Math.round(mv);
  }
  return {
    lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : undefined,
    lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : undefined,
    timestamp,
    durationSeconds,
  };
}
