/**
 * Normalize workout.weather_data (DB) or get-weather JSON into one shape for UI.
 * Backend uses snake_case for temps; keep optional fields aligned with get-weather.
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
  humidity: number;
  windSpeed: number;
  windDirection?: number;
  precipitation?: number;
  daily_high?: number;
  daily_low?: number;
  timestamp?: string;
};

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse JSON blob from workouts.weather_data or API response. */
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

  const humidity = num(w.humidity) ?? 0;
  const windSpeed = num(w.windSpeed) ?? 0;
  const condition = typeof w.condition === 'string' ? w.condition : '—';

  return {
    temperature,
    temperature_start_f: num(w.temperature_start_f),
    temperature_end_f: num(w.temperature_end_f),
    temperature_peak_f: num(w.temperature_peak_f),
    temperature_avg_f: num(w.temperature_avg_f),
    feels_like: num(w.feels_like),
    condition,
    humidity,
    windSpeed,
    windDirection: num(w.windDirection),
    precipitation: num(w.precipitation),
    daily_high: num(w.daily_high),
    daily_low: num(w.daily_low),
    timestamp: typeof w.timestamp === 'string' ? w.timestamp : undefined,
  };
}
