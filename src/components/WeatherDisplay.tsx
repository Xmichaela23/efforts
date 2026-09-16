import React from 'react';
import type { SessionWeatherForDisplay } from '@/lib/sessionWeather';

interface WeatherDisplayProps {
  weather?: SessionWeatherForDisplay | null;
  /** The two headline lines, composed on the server (`display_metrics.weather_lines`, 2026-09-16). */
  lines?: { line1?: string | null; line2?: string | null } | null;
  loading?: boolean;
  /** Device avg temp from Strava/Garmin in °C (shown as °F) when API has no payload yet */
  fallbackTemperature?: number;
  className?: string;
}

const celsiusToF = (c: number) => Math.round((c * 9) / 5 + 32);

/**
 * ⛔ THE TWO LINES ARE THE SERVER'S (2026-09-16, Stage 4 session 3) — `display_metrics.weather_lines`.
 *
 * This composed them here: the rise over the session, whether the peak cleared the ends by enough to
 * be worth naming, and whether "feels like" sat far enough from the average to print. Both cut-offs
 * are OURS now, with ledger rows, beside the words they gate.
 * ⚠️ A response without the field prints no headline rather than rebuilding one.
 */

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({
  weather,
  lines,
  loading = false,
  fallbackTemperature,
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`flex items-center gap-1 text-sm ${className}`}>
        <span className="text-white/60 text-xs">Loading weather...</span>
      </div>
    );
  }

  if (weather) {
    const line1 = lines?.line1 ?? null;
    const line2 = lines?.line2 ?? null;
    const hum =
      weather.humidity != null && Number.isFinite(weather.humidity)
        ? `${Math.round(weather.humidity)}% humidity`
        : null;
    const wind =
      weather.windSpeed != null && weather.windSpeed > 0
        ? `${Math.round(weather.windSpeed)} mph wind`
        : null;
    const showCond = weather.condition && weather.condition !== '—';

    return (
      <div
        className={`flex flex-col gap-0.5 text-white/90 ${className}`}
        title="Uses workouts.weather_data when present (same as analysis); otherwise live Open-Meteo or device avg."
      >
        {line1 ? <span className="font-medium text-sm leading-snug">{line1}</span> : null}
        {line2 ? <span className="text-white/55 text-xs leading-snug">{line2}</span> : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-white/65 text-xs">
          {showCond ? <span>{weather.condition}</span> : null}
          {hum ? <span>{hum}</span> : null}
          {wind ? <span>{wind}</span> : null}
        </div>
      </div>
    );
  }

  if (fallbackTemperature != null && Number.isFinite(Number(fallbackTemperature))) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <span className="text-white/90" title="Prefer resolveSessionWeatherFromWorkoutRow — this prop is legacy">
          {celsiusToF(Number(fallbackTemperature))}°F
        </span>
        <span className="text-white/45 text-xs">device avg only</span>
      </div>
    );
  }

  return null;
};

export default WeatherDisplay;
