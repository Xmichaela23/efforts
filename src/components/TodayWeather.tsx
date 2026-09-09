import React from 'react';
import { Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudFog, CloudLightning, Sunrise, Sunset, Wind, Droplets } from 'lucide-react';
import type { SessionWeatherForDisplay } from '@/lib/sessionWeather';

/**
 * ═══ THE WEATHER, AT THE TOP OF TODAY ═══════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-today-screen-2026-09-09.md §3b.1. Temperature and feels-like, the condition as an
 * ICON, humidity with dew point beside it, wind, and sunrise/sunset.
 *
 * ⛔ ICONS, NEVER EMOJI. `lucide-react`, which the app already draws every other glyph from.
 *
 * ⛔ THE CONDITION IS A CODE, NOT A WORD. Open-Meteo's archive returns no condition text — that is
 * why `condition` has always been `'—'` — but it does return a WMO `weather_code`, which
 * `get-weather` now asks for. The code travels raw and the mapping to a picture lives here, because
 * which glyph stands for "overcast" is a display decision.
 *
 * ⚠️ EVERY FIELD IS OPTIONAL AND EVERY ONE IS GUARDED. A row written before
 * `WEATHER_SCHEMA_VERSION` 5 carries no code and no dew point, and the device-temperature fallback
 * carries nothing but a temperature. Each part renders only when its number is there; nothing is
 * substituted for a missing one.
 */

/**
 * WMO weather code → glyph, per the work order's own banding.
 *
 *   0 clear · 1-2 mainly clear / partly cloudy · 3 overcast · 45-48 fog · 51-67 drizzle and rain
 *   (including freezing) · 71-77 snow · 80-82 rain showers · 85-86 snow showers · 95-99 thunderstorm
 *
 * ⚠️ AN UNKNOWN CODE DRAWS NOTHING rather than a guess — the block simply has no icon that day.
 */
export function weatherIconFor(code: number | undefined): typeof Sun | null {
  if (code == null || !Number.isFinite(code)) return null;
  const c = Math.round(code);
  if (c === 0) return Sun;
  if (c === 1 || c === 2) return CloudSun;
  if (c === 3) return Cloud;
  if (c >= 45 && c <= 48) return CloudFog;
  if (c >= 51 && c <= 67) return CloudRain;
  if (c >= 71 && c <= 77) return CloudSnow;
  if (c >= 80 && c <= 82) return CloudRain;
  if (c >= 85 && c <= 86) return CloudSnow;
  if (c >= 95 && c <= 99) return CloudLightning;
  return null;
}

/** `6:32am` — the shape the date line already used for sunrise and sunset. */
function clock(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      .replace(/\s?AM|\s?PM/i, (m) => m.trim().toLowerCase());
  } catch {
    return null;
  }
}

const chip = 'inline-flex items-center gap-1 whitespace-nowrap';

const TodayWeather: React.FC<{ weather?: SessionWeatherForDisplay | null; className?: string }> = ({
  weather,
  className = '',
}) => {
  if (!weather || !Number.isFinite(Number(weather.temperature))) return null;

  const Icon = weatherIconFor(weather.weather_code);
  const temp = Math.round(Number(weather.temperature));
  const feels =
    weather.feels_like != null && Number.isFinite(weather.feels_like)
      ? Math.round(weather.feels_like)
      : null;
  const humidity =
    weather.humidity != null && Number.isFinite(weather.humidity) ? Math.round(weather.humidity) : null;
  const dew =
    weather.dew_point != null && Number.isFinite(weather.dew_point) ? Math.round(weather.dew_point) : null;
  const wind =
    weather.windSpeed != null && Number.isFinite(weather.windSpeed) && weather.windSpeed > 0
      ? Math.round(weather.windSpeed)
      : null;
  const up = clock(weather.sunrise);
  const down = clock(weather.sunset);

  return (
    <div
      className={`flex flex-col gap-1 ${className}`}
      style={{ color: 'rgba(255,255,255,0.62)' }}
    >
      {/* The reading itself, with the condition as a picture beside it. */}
      <div className="flex items-center gap-2">
        {Icon ? <Icon aria-hidden="true" className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.78)' }} /> : null}
        <span className="text-[0.95rem] font-light tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>
          {temp}°F
        </span>
        {/* ⚠️ SAME WORDING THE SESSION HEADER ALREADY USES — "Feels like N°" (`WeatherDisplay`). */}
        {feels != null ? (
          <span className="text-[0.72rem] font-light tabular-nums">Feels like {feels}°</span>
        ) : null}
      </div>

      {/* Humidity with the dew point beside it, then wind. Same forms `WeatherDisplay` prints. */}
      {(humidity != null || dew != null || wind != null) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.7rem] font-light tabular-nums">
          {humidity != null ? (
            <span className={chip}>
              <Droplets aria-hidden="true" className="h-3 w-3" />
              {humidity}% humidity
            </span>
          ) : null}
          {dew != null ? <span className={chip}>{dew}° dew point</span> : null}
          {wind != null ? (
            <span className={chip}>
              <Wind aria-hidden="true" className="h-3 w-3" />
              {wind} mph wind
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ⛔ SUNRISE AND SUNSET ARE THE ICONS, so the row carries two times and no labels. */}
      {(up || down) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.7rem] font-light tabular-nums">
          {up ? (
            <span className={chip}>
              <Sunrise aria-hidden="true" className="h-3 w-3" />
              {up}
            </span>
          ) : null}
          {down ? (
            <span className={chip}>
              <Sunset aria-hidden="true" className="h-3 w-3" />
              {down}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default TodayWeather;
