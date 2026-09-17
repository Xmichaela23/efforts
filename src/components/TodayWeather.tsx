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

const TodayWeather: React.FC<{
  weather?: SessionWeatherForDisplay | null;
  /**
   * ⛔ THE CITY RIDES ON THE SUNRISE/SUNSET LINE (Michael, 2026-09-09, on the device). It had a row
   * of its own under the date, where it read as a fourth fact about the day; it is not about the
   * day, it is where these numbers were measured — so it belongs beside them, right-aligned.
   */
  city?: string | null;
  className?: string;
  /** The block's own spacing, set by the screen that places it. */
  style?: React.CSSProperties;
}> = ({ weather, city, className = '', style }) => {
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
      style={{ color: 'rgba(255,255,255,0.62)', ...style }}
    >
      {/* ⛔ THREE LINES SINCE 2026-09-17 (Michael, screenshot): the reading with sunrise and sunset at the far end
          of its line; the conditions; the city with the credit. It was four — sunrise had its own row and so
          did the credit. No word changed. The sun times wrap under the reading on a very narrow phone. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <div className="flex items-center gap-2">
          {Icon ? <Icon aria-hidden="true" className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.78)' }} /> : null}
          <span className="text-[0.95rem] font-light tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>
            {temp}°F
          </span>
          {/* ⚠️ SAME WORDING THE SESSION HEADER ALREADY USES — "Feels like N°" (`WeatherDisplay`). */}
          {feels != null ? (
            <span className="text-[0.72rem] font-light tabular-nums whitespace-nowrap">Feels like {feels}°</span>
          ) : null}
        </div>
        {/* Sunrise and sunset are the icons, so the pair carries two times and no labels. */}
        {(up || down) ? (
          <div className="flex items-center gap-x-3 text-[0.7rem] font-light tabular-nums">
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

      {/* ⛔ THE CITY AND THE CREDIT SHARE THE LAST LINE. ⚠️ THE LINE DRAWS FOR THE CREDIT ALONE TOO — and the city
          draws whenever there is one, so an athlete on a device-temperature fallback is still told where the
          reading is from. The city gives way first (`truncate`); the credit never shrinks — on the sunrise row
          it squeezed the city to "Phoen…" (2026-09-10).
          ⛔ THE CREDIT IS A LINK, BESIDE THE DATA. Open-Meteo's licence (open-meteo.com/en/licence, read
          2026-09-17): "You must include a link next to any location Open-Meteo data are displayed." It was
          plain text, and it cannot move to the foot of the screen. The tap does not open the card behind it. */}
      <div className="flex items-baseline justify-between gap-x-3 text-[0.7rem] font-light">
        <span className="truncate min-w-0">{city ?? ''}</span>
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 whitespace-nowrap text-[11px]"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          Weather by Open-Meteo
        </a>
      </div>
    </div>
  );
};

export default TodayWeather;
