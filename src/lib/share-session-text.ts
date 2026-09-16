import { parseExercises, shareBody } from '@shared/strava/strength-description.ts';
import { formatPace } from '@/utils/workoutFormatting';

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
 * ⛔ THE SERVER'S TOTALS, NOTHING REBUILT HERE (2026-09-15, §8.0 #36). The share line read
 * `moving_seconds` and `computed.overall` off whatever row the drawer happened to hold — and
 * `AppLayout` re-reads that row with `select('*')`, where `moving_seconds` does not exist as a column, so a
 * shared session lost its time (and a logged lift never had one). Distance, pace, speed, heart rate and
 * elevation were then worked out again on the phone beside the server's own answers for the same session.
 *
 * The two server sources, both already in the drawer:
 *   · `session_detail_v1.completed_totals` — moving seconds, distance, pace (sec/mi), average heart rate
 *     (Performance prints these);
 *   · `display_metrics` from workout-detail — a ride's average speed and the elevation as numbers
 *     (the Details tab prints these).
 */
export type ShareTotals = {
  completed_totals?: {
    moving_s?: number | null; duration_s?: number | null; distance_m?: number | null;
    avg_pace_s_per_mi?: number | null; avg_hr?: number | null; swim_pace_per_100_s?: number | null;
  } | null;
  display_metrics?: { avg_speed_mps?: number | null; elevation_gain_m?: number | null } | null;
  strength_totals?: { volume_lb?: number | null } | null;
};

const fin = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** Session length in seconds — the server's moving seconds off `completed_totals`. */
export function sessionSeconds(t: ShareTotals | null | undefined): number {
  const ct = t?.completed_totals ?? null;
  return fin(ct?.moving_s) ?? fin(ct?.duration_s) ?? 0;
}

/** The endurance line: every figure as the server sent it. */
export function enduranceLine(type: string, t: ShareTotals | null | undefined, useImperial: boolean): string {
  const ct = t?.completed_totals ?? null;
  const dm = t?.display_metrics ?? null;
  const distM = fin(ct?.distance_m);
  const durS = sessionSeconds(t);
  const parts: string[] = [];
  if (distM != null) {
    if (type === 'swim') parts.push(useImperial ? `${Math.round(distM / 0.9144).toLocaleString()} yd` : `${Math.round(distM).toLocaleString()} m`);
    else parts.push(useImperial ? `${(distM / 1609.34).toFixed(1)} mi` : `${(distM / 1000).toFixed(1)} km`);
  }
  if (durS > 0) parts.push(fmtHMS(durS));
  if (type === 'run' || type === 'walk') {
    // The server's pace, in the one formatter (§8.0 #2). It is sec/MILE; `formatPace` takes sec/km.
    const paceMi = fin(ct?.avg_pace_s_per_mi);
    if (paceMi != null) parts.push(formatPace(paceMi / 1.60934, useImperial));
  } else if (type === 'ride' || type === 'bike' || type === 'cycling') {
    const mps = fin(dm?.avg_speed_mps);
    if (mps != null) parts.push(useImperial ? `${Math.round(mps * 2.237 * 10) / 10} mph` : `${Math.round(mps * 3.6 * 10) / 10} km/h`);
  } else if (type === 'swim') {
    const per100 = fin(ct?.swim_pace_per_100_s);
    if (per100 != null) parts.push(`${fmtHMS(Math.round(per100))}/100`);
  }
  const hr = fin(ct?.avg_hr);
  if (hr != null) parts.push(`${Math.round(hr)} bpm`);
  const elevM = fin(dm?.elevation_gain_m);
  if (elevM != null && type !== 'swim') parts.push(useImperial ? `${Math.round(elevM * 3.28084)} ft` : `${Math.round(elevM)} m`);
  return parts.join(' · ');
}

export function shareSessionText(w: any, useImperial: boolean, totals?: ShareTotals | null): string {
  const type = String(w?.type || '').toLowerCase();
  const isStrength = type === 'strength' || type === 'mobility' || type === 'pilates_yoga';
  const name = String(w?.name || (isStrength ? 'Strength' : type.charAt(0).toUpperCase() + type.slice(1))).trim();
  const t: ShareTotals | null = totals ?? null;
  const secs = sessionSeconds(t);
  const head = [name, fmtDate(w?.date), secs > 0 ? fmtHMS(secs) : ''].filter(Boolean).join(' · ');
  if (isStrength) {
    // The pounds are the server's one volume (§8.0 #32), not a sum taken here.
    const body = shareBody(parseExercises(w?.strength_exercises), t?.strength_totals?.volume_lb ?? null);
    // shareBody ends with "Logged in Efforts · efforts.work"; the friend's copy ends with the site alone.
    const lifts = body.replace(/\n?Logged in Efforts · efforts\.work\s*$/, '').trim();
    return [head, '', lifts, '', 'efforts.work'].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return [head, enduranceLine(type, t, useImperial), '', 'efforts.work'].filter((l, i) => i === 0 || l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
