import type { CyclingFtpBinsV1, ExecutedIntensityV1 } from './types.ts';

export function coerceNumber(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function round1(x: number | null): number | null {
  if (x == null) return null;
  return Math.round(x * 10) / 10;
}

export function round2(x: number | null): number | null {
  if (x == null) return null;
  return Math.round(x * 100) / 100;
}

export function formatMinutes(x: number | null): number | null {
  if (x == null) return null;
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.round(x);
}

export function computeFtpBinsMinutes(args: {
  powerSamplesW: number[];
  ftpW: number;
  samplePeriodS?: number; // defaults to 1s
}): CyclingFtpBinsV1 | null {
  const { powerSamplesW, ftpW, samplePeriodS = 1 } = args;
  if (!Array.isArray(powerSamplesW) || powerSamplesW.length < 60) return null;
  if (!Number.isFinite(ftpW) || ftpW <= 0) return null;

  const minsPerSample = samplePeriodS / 60;
  const bins: CyclingFtpBinsV1 = {
    lt_0_60_min: 0,
    p0_60_0_75_min: 0,
    p0_75_0_85_min: 0,
    p0_85_0_95_min: 0,
    p0_95_1_05_min: 0,
    p1_05_1_20_min: 0,
    gt_1_20_min: 0,
  };

  for (const p of powerSamplesW) {
    const pw = Number(p);
    if (!Number.isFinite(pw) || pw <= 0) continue;
    const r = pw / ftpW;
    if (r < 0.60) bins.lt_0_60_min += minsPerSample;
    else if (r < 0.75) bins.p0_60_0_75_min += minsPerSample;
    else if (r < 0.85) bins.p0_75_0_85_min += minsPerSample;
    else if (r < 0.95) bins.p0_85_0_95_min += minsPerSample;
    else if (r < 1.05) bins.p0_95_1_05_min += minsPerSample;
    else if (r < 1.20) bins.p1_05_1_20_min += minsPerSample;
    else bins.gt_1_20_min += minsPerSample;
  }

  // Round to nearest minute for display stability.
  (Object.keys(bins) as Array<keyof CyclingFtpBinsV1>).forEach((k) => {
    bins[k] = Math.round(bins[k]);
  });

  return bins;
}

export function classifyExecutedIntensity(args: {
  intensityFactor: number | null;
  ftpBins: CyclingFtpBinsV1 | null;
}): ExecutedIntensityV1 {
  const { intensityFactor, ftpBins } = args;
  const if0 = typeof intensityFactor === 'number' && Number.isFinite(intensityFactor) ? intensityFactor : null;
  if (if0 == null) return 'unknown';

  // Power-first, conservative thresholds.
  if (if0 < 0.65) return 'easy';
  if (if0 < 0.80) return 'moderate';
  if (if0 >= 0.80) {
    // If IF is high but bins show almost no time above threshold, treat as moderate (e.g. stale FTP).
    if (ftpBins && (ftpBins.p0_95_1_05_min + ftpBins.p1_05_1_20_min + ftpBins.gt_1_20_min) <= 3) {
      return 'moderate';
    }
    return 'hard';
  }
  return 'unknown';
}

