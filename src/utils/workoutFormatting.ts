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

export const formatPace = (secPerKm: number | null, imperial?: boolean): string => {
  if (!Number.isFinite(secPerKm as any) || (secPerKm as number) <= 0) return '—';
  const imp = typeof imperial === 'boolean' ? imperial : false;
  const perUnit = imp ? (secPerKm as number) * 1.60934 : (secPerKm as number);
  const m = Math.floor(perUnit / 60);
  const s = Math.round(perUnit % 60);
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

export const formatSwimPace = (seconds: number | null): string => {
  if (!Number.isFinite(seconds as any) || (seconds as number) <= 0) return '—';
  const mins = Math.floor((seconds as number) / 60);
  const secs = Math.round((seconds as number) % 60);
  return `${mins}:${String(secs).padStart(2,'0')}`;
};
