import { parseExercises, shareBody } from '@shared/strava/strength-description.ts';

/**
 * The text a completed session becomes when the athlete shares it with a friend (2026-09-07).
 * Plain text for the phone's share sheet: name, date, length; the lifts (the same lines Strava gets,
 * from `_shared/strava/strength-description.ts`) or one summary line for a run, ride or swim; then
 * the site. No picture, no card — text is what a share sheet carries.
 *
 * The endurance line reads the same fields Home's completed row reads (`getCompactEnduranceMetrics`
 * in TodaysEffort.tsx). ⛔ ITS LENGTH IS THE SERVER'S `moving_seconds` (2026-09-10, audit H-D10).
 */

const fmtHMS = (secs: number): string => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

const fmtDate = (iso: string): string => {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

/**
 * Session length in seconds — the server's `moving_seconds` (2026-09-10, audit H-D10). This used to
 * try provider seconds, the phone's moving-time resolver and three minute columns in turn; a row the
 * server sent no time for shares no time.
 */
export function sessionSeconds(w: any): number {
  const n = Number(w?.moving_seconds);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function enduranceLine(w: any, useImperial: boolean): string {
  const type = String(w?.type || '').toLowerCase();
  const overall = w?.computed?.overall || w?.overall || {};
  const distM = Number(overall?.distance_m ?? overall?.distanceMeters ?? overall?.distance_meters);
  const durS = sessionSeconds(w);
  const avgHr = Number(overall?.avg_hr ?? w?.avg_heart_rate ?? w?.metrics?.avg_heart_rate);
  const elevM = Number(overall?.elevation_gain_m ?? w?.elevation_gain ?? w?.metrics?.elevation_gain);
  const parts: string[] = [];
  if (Number.isFinite(distM) && distM > 0) {
    if (type === 'swim') parts.push(useImperial ? `${Math.round(distM / 0.9144).toLocaleString()} yd` : `${Math.round(distM).toLocaleString()} m`);
    else parts.push(useImperial ? `${(distM / 1609.34).toFixed(1)} mi` : `${(distM / 1000).toFixed(1)} km`);
  }
  if (Number.isFinite(durS) && durS > 0) parts.push(fmtHMS(durS));
  if (Number.isFinite(durS) && durS > 0 && Number.isFinite(distM) && distM > 0) {
    if (type === 'run' || type === 'walk') {
      const per = useImperial ? (durS / 60) / (distM / 1609.34) : (durS / 60) / (distM / 1000);
      const mm = Math.floor(per); const ss = Math.round((per - mm) * 60);
      parts.push(`${mm}:${String(ss).padStart(2, '0')}/${useImperial ? 'mi' : 'km'}`);
    } else if (type === 'ride' || type === 'bike' || type === 'cycling') {
      const mps = Number(overall?.avg_speed_mps) || distM / durS;
      if (mps > 0) parts.push(useImperial ? `${Math.round(mps * 2.237 * 10) / 10} mph` : `${Math.round(mps * 3.6 * 10) / 10} km/h`);
    }
  }
  if (Number.isFinite(avgHr) && avgHr > 0) parts.push(`${Math.round(avgHr)} bpm`);
  if (Number.isFinite(elevM) && elevM > 0 && type !== 'swim') parts.push(useImperial ? `${Math.round(elevM * 3.28084)} ft` : `${Math.round(elevM)} m`);
  return parts.join(' · ');
}

export function shareSessionText(w: any, useImperial: boolean): string {
  const type = String(w?.type || '').toLowerCase();
  const isStrength = type === 'strength' || type === 'mobility' || type === 'pilates_yoga';
  const name = String(w?.name || (isStrength ? 'Strength' : type.charAt(0).toUpperCase() + type.slice(1))).trim();
  const secs = sessionSeconds(w);
  const head = [name, fmtDate(w?.date), secs > 0 ? fmtHMS(secs) : ''].filter(Boolean).join(' · ');
  if (isStrength) {
    const body = shareBody(parseExercises(w?.strength_exercises));
    // shareBody ends with "Logged in Efforts · efforts.work"; the friend's copy ends with the site alone.
    const lifts = body.replace(/\n?Logged in Efforts · efforts\.work\s*$/, '').trim();
    return [head, '', lifts, '', 'efforts.work'].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return [head, enduranceLine(w, useImperial), '', 'efforts.work'].filter((l, i) => i === 0 || l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Opens the phone's share sheet; on the web, the browser's share sheet or the clipboard. */
export async function shareSession(text: string, title: string): Promise<'shared' | 'copied'> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text });
    return 'shared';
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title, text }); return 'shared'; } catch { /* dismissed or unsupported: fall through */ }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
