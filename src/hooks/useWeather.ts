import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  parseWorkoutWeatherDataForDisplay,
  type SessionWeatherForDisplay,
} from '@/lib/sessionWeather';

export type { SessionWeatherForDisplay };

/**
 * ⛔ THE PHONE KEEPS EACH READING WHILE THE APP IS OPEN (2026-09-17, Michael). Swiping the Today card between days
 * asked the server again for a day already on screen a moment ago, and the block sat empty for the round trip.
 * Keep times (Michael approved 2026-09-17), the same as `get-weather`'s shared cache: today 15 minutes; a future day
 * 1 hour; the last 5 days once a day; an older day until the app closes. A day is fetched only when it is shown.
 * Nothing is written to storage.
 */
const READING_CACHE = new Map<string, { weather: SessionWeatherForDisplay; heatNote: string | null; at: number }>();
const MIN_MS = 60 * 1000;
const ARCHIVE_LAG_DAYS = 5; // FIELD — Open-Meteo's archive delay
/** How long a kept reading is good for; Infinity = never fetched again while the app is open. */
function readingKeepMs(timestamp: string, current: boolean | undefined): number {
  if (current) return 15 * MIN_MS;
  const day = String(timestamp).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return 15 * MIN_MS;
  if (day > today) return 60 * MIN_MS;
  const cutoff = new Date(Date.now() - ARCHIVE_LAG_DAYS * 86400000).toISOString().slice(0, 10);
  return day < cutoff ? Infinity : 24 * 60 * MIN_MS;
}

interface UseWeatherProps {
  lat?: number;
  lng?: number;
  timestamp?: string;
  workoutId?: string;
  /** Moving duration in seconds — passed to get-weather so Open-Meteo returns start/end/peak across the effort */
  durationSeconds?: number;
  enabled?: boolean;
  /** Today card only: true asks for what it is like outside now; false for a day's reading at `timestamp`. */
  current?: boolean;
}

export function useWeather({
  lat,
  lng,
  timestamp,
  workoutId,
  durationSeconds,
  enabled = true,
  current,
}: UseWeatherProps) {
  // A kept reading paints on the first frame, not one frame after (2026-09-21).
  const keptAtMount = (() => {
    if (!enabled || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || !timestamp) return null;
    const k = READING_CACHE.get(JSON.stringify([Number(lat).toFixed(2), Number(lng).toFixed(2), timestamp, workoutId ?? null, durationSeconds ?? null, current ?? null]));
    return k && Date.now() - k.at < readingKeepMs(timestamp, current) ? k : null;
  });
  const [weather, setWeather] = useState<SessionWeatherForDisplay | null>(() => keptAtMount()?.weather ?? null);
  // ⛔ The hot-day line, decided by `get-weather` (2026-09-10, audit H-T07). Null means say nothing.
  const [heatNote, setHeatNote] = useState<string | null>(() => keptAtMount()?.heatNote ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || !timestamp) {
      setWeather(null);
      setHeatNote(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Places match to 2 decimals (about 1 km): a fresh location a few metres off is the same weather (2026-09-21).
    const cacheKey = JSON.stringify([Number(lat).toFixed(2), Number(lng).toFixed(2), timestamp, workoutId ?? null, durationSeconds ?? null, current ?? null]);
    const kept = READING_CACHE.get(cacheKey);
    if (kept && Date.now() - kept.at < readingKeepMs(timestamp, current)) {
      setWeather(kept.weather);
      setHeatNote(kept.heatNote);
      setLoading(false);
      setError(null);
      return;
    }
    // ⛔ A NEW DAY CLEARS THE OLD READING FIRST (2026-09-17) — otherwise yesterday's weather sits under today's date
    // until the fetch lands, now that the Today card asks for every day.
    setWeather(null);
    setHeatNote(null);

    const fetchWeather = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      try {
        const body: Record<string, unknown> = {
          lat: Number(lat),
          lng: Number(lng),
          timestamp,
          workout_id: workoutId,
        };
        if (typeof current === 'boolean') body.current = current;
        if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds >= 60) {
          body.duration_seconds = Math.min(6 * 3600, Math.round(durationSeconds));
        }

        const { data, error: fnError } = await (supabase.functions.invoke as any)('get-weather', {
          body,
        });
        if (cancelled) return;
        if (fnError) throw fnError;

        if (data?.weather) {
          const parsed = parseWorkoutWeatherDataForDisplay(data.weather);
          const note = typeof data?.heat_note === 'string' && data.heat_note ? data.heat_note : null;
          if (parsed) READING_CACHE.set(cacheKey, { weather: parsed, heatNote: note, at: Date.now() });
          setWeather(parsed);
          setHeatNote(note);
        } else if (data?.error) {
          setError(String(data.error));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const ric = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : null;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (ric) {
      idleId = ric(() => fetchWeather(), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(fetchWeather, 400);
    }

    return () => {
      cancelled = true;
      setLoading(false);
      if (idleId != null && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [lat, lng, timestamp, workoutId, enabled, durationSeconds, current]);

  return { weather, heatNote, loading, error };
}
