export const formatDuration = (seconds: number | null): string => {
  if (!Number.isFinite(seconds as any) || (seconds as number) < 0) return '—';
  const s = Math.floor(seconds as number);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${m}:${String(ss).padStart(2,'0')}`;
};

export const formatDistance = (km: number | null, imperial?: boolean): string => {
  if (!Number.isFinite(km as any) || (km as number) <= 0) return '—';
  const imp = typeof imperial === 'boolean' ? imperial : false;
  const v = imp ? (km as number) * 0.621371 : (km as number);
  return imp ? `${v.toFixed(1)} mi` : `${v.toFixed(1)} km`;
};

/**
 * THE ONE PACE FORMATTER (2026-09-15, §8.0 #2). Seconds per KM in; "8:27/mi" or "5:15/km" out.
 * ⛔ THE WHOLE PACE IS ROUNDED FIRST. Rounding the remainder on its own printed "7:60/mi" whenever the pace
 * landed within half a second of the minute — on the popup's threshold card, the share text and Today's line,
 * each of which had its own copy of this arithmetic. They call this now.
 */
export const formatPace = (secPerKm: number | null, imperial?: boolean): string => {
  if (!Number.isFinite(secPerKm as any) || (secPerKm as number) <= 0) return '—';
  const imp = typeof imperial === 'boolean' ? imperial : false;
  const total = Math.round(imp ? (secPerKm as number) * 1.60934 : (secPerKm as number));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2,'0')}/${imp ? 'mi' : 'km'}`;
};

export const formatSpeed = (mps: number | null, imperial: boolean): string => {
  if (!Number.isFinite(mps as any) || (mps as number) <= 0) return '—';
  const kmh = (mps as number) * 3.6;
  const v = imperial ? kmh * 0.621371 : kmh;
  return imperial ? `${v.toFixed(1)} mph` : `${v.toFixed(1)} km/h`;
};

export const formatElevation = (meters: number | null, imperial?: boolean): string => {
  if (!Number.isFinite(meters as any)) return '—';
  const imp = typeof imperial === 'boolean' ? imperial : false;
  const v = imp ? Math.round((meters as number) * 3.28084) : Math.round(meters as number);
  return imp ? `${v} ft` : `${v} m`;
};

// D-166: round TOTAL seconds first, THEN split — otherwise 119.5s → floor(1.99)=1 min + round(59.5)=60s
// prints "1:60" instead of "2:00". The single source of truth for swim pace m:ss; every surface (home
// card, Performance tab, Details tab) routes through this — do not re-roll floor(/60)+round(%60) inline.
export const formatSwimPace = (seconds: number | null): string => {
  if (!Number.isFinite(seconds as any) || (seconds as number) <= 0) return '—';
  const v = Math.round(seconds as number);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};
