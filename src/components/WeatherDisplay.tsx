import React from 'react';
import type { SessionWeatherForDisplay } from '@/lib/sessionWeather';

interface WeatherDisplayProps {
  weather?: SessionWeatherForDisplay | null;
  loading?: boolean;
  /** Device avg temp from Strava/Garmin in °C (shown as °F) when API has no payload yet */
  fallbackTemperature?: number;
  className?: string;
}

const celsiusToF = (c: number) => Math.round((c * 9) / 5 + 32);

function headline(w: SessionWeatherForDisplay): { line1: string; line2?: string } {
  const s = w.temperature_start_f;
  const e = w.temperature_end_f;
  const peak = w.temperature_peak_f;
  const avg = w.temperature_avg_f ?? w.temperature;

  if (s != null && e != null && Number.isFinite(s) && Number.isFinite(e)) {
    const rise = Math.round(e) - Math.round(s);
    const riseStr = rise >= 0 ? `+${rise}°` : `${rise}°`;
    const parts: string[] = [`${riseStr} over the session`];
    if (peak != null && Number.isFinite(peak) && peak > Math.max(s, e) + 0.5) {
      parts.push(`peak ${Math.round(peak)}°`);
    }
    const line1 = `${Math.round(s)}° start → ${Math.round(e)}° end (${parts.join(' · ')})`;
    const line2 =
      w.temperature_avg_f != null && Number.isFinite(w.temperature_avg_f)
        ? `Avg across window ${Math.round(w.temperature_avg_f)}°`
        : undefined;
    return { line1, line2 };
  }

  const line2 = [
    w.feels_like != null && Number.isFinite(w.feels_like) && Math.abs(w.feels_like - avg) >= 2
      ? `Feels like ${Math.round(w.feels_like)}°`
      : null,
    w.daily_low != null && w.daily_high != null
      ? `That day ${Math.round(w.daily_low)}–${Math.round(w.daily_high)}°`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    line1: `${Math.round(avg)}°F (representative)`,
    line2: line2 || undefined,
  };
}

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({
  weather,
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
    const { line1, line2 } = headline(weather);
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
        <span className="font-medium text-sm leading-snug">{line1}</span>
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
