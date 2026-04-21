/**
 * Historical weather for a race date + start location (Open-Meteo archive, no API key).
 * Used when generating course strategy; may return null for future dates or API errors.
 */

export type RaceWeatherArchive = {
  startTempF: number;
  finishTempF: number;
  humidity: number;
  conditions: string;
};

/**
 * @param raceDateISO - YYYY-MM-DD (event local calendar day)
 * @param timezone - IANA zone for hourly array alignment (e.g. America/Los_Angeles)
 */
export async function fetchRaceWeatherArchive(
  startLat: number,
  startLng: number,
  raceDateISO: string,
  timezone = 'America/Los_Angeles',
): Promise<RaceWeatherArchive | null> {
  if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) return null;
  const day = String(raceDateISO).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  try {
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', String(startLat));
    url.searchParams.set('longitude', String(startLng));
    url.searchParams.set('start_date', day);
    url.searchParams.set('end_date', day);
    url.searchParams.set('hourly', 'temperature_2m,relativehumidity_2m,weathercode');
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('timezone', timezone);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn('[fetch-race-weather-archive] HTTP', res.status);
      return null;
    }
    const data = (await res.json()) as {
      hourly?: {
        temperature_2m?: number[];
        relativehumidity_2m?: number[];
        weathercode?: number[];
      };
    };

    const temps = data.hourly?.temperature_2m;
    const humidity = data.hourly?.relativehumidity_2m;
    const codes = data.hourly?.weathercode;
    if (!Array.isArray(temps) || temps.length < 13 || !Array.isArray(humidity)) {
      return null;
    }

    // Race start ~7am, finish ~noon local (indices in requested timezone)
    const startTempF = Math.round(temps[7] ?? temps[0] ?? 0);
    const finishTempF = Math.round(temps[12] ?? temps[temps.length - 1] ?? 0);
    const slice = humidity.slice(7, 13);
    const avgHumidity = slice.length > 0
      ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)
      : Math.round(humidity[0] ?? 0);

    const code = Array.isArray(codes) ? codes[9] : undefined;
    const conditions =
      code == null ? 'unknown'
      : code <= 1 ? 'sunny'
      : code <= 3 ? 'partly cloudy'
      : 'overcast/rain';

    return { startTempF, finishTempF, humidity: avgHumidity, conditions };
  } catch (err) {
    console.error('[fetch-race-weather-archive] failed:', err);
    return null;
  }
}
