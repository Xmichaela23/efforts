// Critical Swim Speed (CSS) learner — fits a swim THRESHOLD from clean, continuous, HARD efforts.
//
// CSS is the swim analog of FTP: the asymptote of the distance–time line. We fit
//   distance = CS · time + D'
// across the athlete's BEST effort per duration bucket (the critical-speed method), and read
// CSS pace = 100 / CS.
//
// GUARDED BY DESIGN — it ABSTAINS (returns null) unless the data earns a confidence tier. The
// caller must hand it only CLEAN, CONTINUOUS, full-stroke efforts (no equipment / drill / kick laps;
// no contaminated swims). These gates exist because mining dirty training swims produced a CSS slower
// than the athlete's typical pace (physically impossible) — see the swim audit:
//   1. >= 2 best-effort points at DISTINCT durations (the CS minimum)
//   2. MONOTONIC curve (a longer effort cannot be a faster pace than a shorter one)
//   3. CSS must be FASTER than the athlete's typical median (a threshold can't be slower than easy swimming)
//   4. plausible D' (anaerobic reserve ~10-60 m)
//   5. R^2 floor (the points actually lie on a line)
// CONFIRMED-HARD efforts (CSS test, or RPE>=7) count double toward confidence vs inferred-from-fastest.

export interface SwimEffort {
  distanceM: number;       // continuous effort distance, meters
  timeS: number;           // active swimming time, seconds (caller supplies clean time, not elapsed-with-rest)
  confirmedHard: boolean;  // CSS test or RPE>=7 — vs "hard" merely inferred from being the fastest
  date: string;            // ISO; for recency (caller may pre-filter stale efforts)
}

export type CssConfidence = 'insufficient' | 'very_low' | 'low' | 'moderate' | 'high';

export interface CssResult {
  cssSecPer100m: number | null;
  cssSecPer100yd: number | null;
  dPrimeM: number | null;
  r2: number | null;
  confidence: CssConfidence;
  nPoints: number;
  reason: string;
}

// duration buckets (seconds): <6, 6-12, 12-20, 20-35, 35+ min
const DURATION_BUCKETS_S = [0, 360, 720, 1200, 2100, Infinity];

function abstain(reason: string, n = 0): CssResult {
  return { cssSecPer100m: null, cssSecPer100yd: null, dPrimeM: null, r2: null, confidence: 'insufficient', nPoints: n, reason };
}

/** Fit CSS from clean efforts. typicalMedianSecPer100m = the athlete's typical pace (for the sanity gate); pass null to skip that gate. */
export function fitSwimCss(efforts: SwimEffort[], typicalMedianSecPer100m: number | null): CssResult {
  const valid = (efforts || []).filter((e) => e && e.distanceM >= 200 && e.timeS > 0);
  if (valid.length < 2) return abstain('fewer than 2 clean continuous efforts', valid.length);

  // best (fastest pace) per duration bucket
  const byBucket = new Map<number, SwimEffort>();
  for (const e of valid) {
    let bi = 0;
    for (let i = 1; i < DURATION_BUCKETS_S.length; i++) { if (e.timeS < DURATION_BUCKETS_S[i]) { bi = i - 1; break; } }
    const cur = byBucket.get(bi);
    if (!cur || (e.timeS / e.distanceM) < (cur.timeS / cur.distanceM)) byBucket.set(bi, e);
  }
  const pts = [...byBucket.values()].sort((a, b) => a.timeS - b.timeS);
  if (pts.length < 2) return abstain('best efforts span fewer than 2 distinct durations', pts.length);

  // monotonicity: a longer-duration effort must not be a FASTER pace than a shorter one (tolerance 0.02 s/m)
  for (let i = 1; i < pts.length; i++) {
    const pPrev = pts[i - 1].timeS / pts[i - 1].distanceM;
    const pCur = pts[i].timeS / pts[i].distanceM;
    if (pCur < pPrev - 0.02) return abstain('non-monotonic best-effort curve (a longer effort is faster than a shorter one) — not a clean CS curve', pts.length);
  }

  // linear fit: distance = CS*time + D'
  const X = pts.map((p) => p.timeS), Y = pts.map((p) => p.distanceM), n = X.length;
  const mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  if (sxx <= 0) return abstain('degenerate fit (no duration spread)', n);
  const CS = sxy / sxx, dPrime = my - CS * mx, r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  if (!(CS > 0)) return abstain('non-positive critical speed', n);
  const cssSecPer100m = 100 / CS;

  // sanity gates
  if (typicalMedianSecPer100m && cssSecPer100m >= typicalMedianSecPer100m)
    return abstain(`fitted CSS (${Math.round(cssSecPer100m)} s/100m) is not faster than typical median (${Math.round(typicalMedianSecPer100m)}) — impossible for a threshold`, n);
  if (dPrime < 5 || dPrime > 75) return abstain(`implausible anaerobic reserve D'=${Math.round(dPrime)} m (expect ~10-60)`, n);
  if (r2 < 0.95) return abstain(`fit R^2=${r2.toFixed(3)} below 0.95 floor`, n);

  // confidence tier — confirmed-hard efforts weighted double
  const hardCount = pts.filter((p) => p.confirmedHard).length;
  const weighted = n + hardCount;
  let confidence: CssConfidence;
  if (weighted >= 7 && hardCount >= 2 && r2 >= 0.97) confidence = 'high';
  else if (weighted >= 4 && hardCount >= 1 && r2 >= 0.97) confidence = 'moderate';
  else if (n >= 3) confidence = 'low';
  else confidence = 'very_low';

  return {
    cssSecPer100m: Math.round(cssSecPer100m),
    cssSecPer100yd: Math.round(cssSecPer100m * 0.9144),
    dPrimeM: Math.round(dPrime),
    r2: Number(r2.toFixed(3)),
    confidence,
    nPoints: n,
    reason: `fit from ${n} best-effort points (${hardCount} confirmed-hard)`,
  };
}
