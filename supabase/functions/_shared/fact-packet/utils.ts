import type { HeatStressLevel, HrZone, TerrainType, WorkoutSegmentV1 } from './types.ts';

export function coerceNumber(v: any): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function secondsToPaceString(secPerMi: number | null | undefined): string | null {
  const s = coerceNumber(secPerMi);
  if (s == null || !(s > 0)) return null;
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, '0')}/mi`;
}

export function paceStringToSecondsPerMi(pace: any): number | null {
  // Accept "11:08/mi", "11:08", or number (already sec/mi)
  if (pace == null) return null;
  if (typeof pace === 'number' && Number.isFinite(pace) && pace > 0) return pace;
  const s = String(pace).trim();
  const m = s.match(/(\d+)\s*:\s*(\d{1,2})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const ss = Number(m[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  return mm * 60 + ss;
}

// Dew point derivation (Magnus formula). Input tempF, humidityPct; output dew point in F (rounded).
export function deriveDewPointF(tempF: number, humidityPct: number): number {
  const tF = clamp(tempF, -40, 140);
  const rh = clamp(humidityPct, 1, 100);
  const tempC = (tF - 32) * 5 / 9;
  const a = 17.625;
  const b = 243.04;
  const alpha = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  const dewPointC = (b * alpha) / (a - alpha);
  const dewPointF = dewPointC * 9 / 5 + 32;
  return Math.round(dewPointF);
}

export function getHeatStressLevel(dewPointF: number): HeatStressLevel {
  if (dewPointF >= 70) return 'severe';
  if (dewPointF >= 65) return 'moderate';
  if (dewPointF >= 60) return 'mild';
  return 'none';
}

export function estimatedHeatPaceImpact(dewPointF: number): { minSeconds: number; maxSeconds: number } {
  if (dewPointF >= 75) return { minSeconds: 25, maxSeconds: 45 };
  if (dewPointF >= 70) return { minSeconds: 15, maxSeconds: 30 };
  if (dewPointF >= 65) return { minSeconds: 8, maxSeconds: 20 };
  if (dewPointF >= 60) return { minSeconds: 3, maxSeconds: 10 };
  return { minSeconds: 0, maxSeconds: 0 };
}

export function classifyTerrain(elevationGainFt: number | null | undefined, distanceMi: number | null | undefined): TerrainType {
  const gain = coerceNumber(elevationGainFt);
  const mi = coerceNumber(distanceMi);
  if (gain == null || mi == null || !(mi > 0.2) || !(gain >= 0)) return 'flat';
  const ftPerMi = gain / mi;
  if (ftPerMi > 60) return 'hilly';
  if (ftPerMi >= 20) return 'rolling';
  return 'flat';
}

export function mapHrToZone(hr: number | null | undefined, zones: HrZone[] | null | undefined): string | null {
  const bpm = coerceNumber(hr);
  if (bpm == null || bpm <= 0) return null;
  const zs = Array.isArray(zones) ? zones : [];
  for (const z of zs) {
    const lo = coerceNumber(z?.minBpm);
    const hi = coerceNumber(z?.maxBpm);
    if (lo == null || hi == null) continue;
    if (bpm >= lo && bpm <= hi) return String(z.label || '').trim() || null;
  }
  return null;
}

export function calculateOverallHrDriftBpm(segments: WorkoutSegmentV1[]): number | null {
  const work = segments.filter((s) => !!s && typeof s.avg_hr === 'number' && (s.avg_hr as number) > 0);
  if (work.length < 2) return null;
  const first = coerceNumber(work[0].avg_hr);
  const last = coerceNumber(work[work.length - 1].avg_hr);
  if (first == null || last == null) return null;
  return Math.round(last - first);
}

export function calculatePaceFadePct(segments: WorkoutSegmentV1[]): number | null {
  const work = segments
    .filter((s) => !!s && typeof s.pace_sec_per_mi === 'number' && (s.pace_sec_per_mi as number) > 0)
    .filter((s) => !/warm|cool/i.test(String(s.name || '')));
  if (work.length < 2) return null;
  const midpoint = Math.floor(work.length / 2);
  const firstHalf = work.slice(0, midpoint);
  const secondHalf = work.slice(midpoint);
  if (!firstHalf.length || !secondHalf.length) return null;

  const avgPace = (arr: WorkoutSegmentV1[]): number | null => {
    let sum = 0;
    let w = 0;
    for (const s of arr) {
      const p = coerceNumber(s.pace_sec_per_mi);
      const d = coerceNumber(s.duration_s) ?? 0;
      if (p == null || !(p > 0)) continue;
      const wt = d > 0 ? d : 60;
      sum += p * wt;
      w += wt;
    }
    return w > 0 ? sum / w : null;
  };

  const p1 = avgPace(firstHalf);
  const p2 = avgPace(secondHalf);
  if (p1 == null || p2 == null || !(p1 > 0)) return null;
  const pct = ((p2 - p1) / p1) * 100;
  return Math.round(pct * 10) / 10;
}

export function calculateCardiacDecouplingPct(segments: WorkoutSegmentV1[]): number | null {
  // Coarse segment-based decoupling: compare pace/hr ratio in first vs second half.
  const work = segments
    .filter((s) => !/warm|cool/i.test(String(s.name || '')))
    .filter((s) => coerceNumber(s.pace_sec_per_mi) != null && coerceNumber(s.avg_hr) != null);
  if (work.length < 2) return null;
  const midpoint = Math.floor(work.length / 2);
  const firstHalf = work.slice(0, midpoint);
  const secondHalf = work.slice(midpoint);
  if (!firstHalf.length || !secondHalf.length) return null;

  const avgRatio = (arr: WorkoutSegmentV1[]): number | null => {
    let sum = 0;
    let w = 0;
    for (const s of arr) {
      const pace = coerceNumber(s.pace_sec_per_mi);
      const hr = coerceNumber(s.avg_hr);
      if (pace == null || hr == null || !(pace > 0) || !(hr > 0)) continue;
      const d = coerceNumber(s.duration_s) ?? 0;
      const wt = d > 0 ? d : 60;
      sum += (pace / hr) * wt;
      w += wt;
    }
    return w > 0 ? sum / w : null;
  };

  const r1 = avgRatio(firstHalf);
  const r2 = avgRatio(secondHalf);
  if (r1 == null || r2 == null || !(r1 > 0)) return null;
  const pct = ((r1 - r2) / r1) * 100;
  return Math.max(0, Math.round(pct * 10) / 10);
}

export function isoDateAddDays(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function isoWeekStartMonday(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  const diff = (dow === 0 ? -6 : 1) - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

