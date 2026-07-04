/**
 * HR plausibility — input-layer enforcement of D-237 for PRESENT-but-CORRUPT heart
 * rate (flaky strap / optical cadence-lock), distinct from missing-HR handling.
 * A workout whose HR trips these guards falls to the estimate path (RPE×duration)
 * with a `hr_rejected_corrupt` method — never trusted in TRIMP or zones. Raw HR is
 * preserved (non-destructive); this only decides whether to USE it in a verdict.
 *
 * Pure + fixturable. Detection inputs come from where the sample series lives
 * (compute-workout-summary / sensor processing); the scalar ceiling can also guard
 * `max_heart_rate` at ingest before it corrupts stored zone ceilings.
 *
 * Ceiling design (research-backed): anchor on the athlete's OBSERVED max, not a
 * formula — Tanaka et al. 2001 (208 − 0.7·age) has a population spread of ±10–12 bpm
 * and trained masters athletes legitimately exceed the formula line. So:
 *   - primary: ceiling = max(observed max HR over CLEAN sessions) + 15 bpm headroom
 *   - fallback (thin history): Tanaka + 30 bpm (deliberately generous — the +30 keeps
 *     the guard an IMPOSSIBLE-value check, not a training-zone cap; never reject a
 *     reading at or near a formula estimate).
 */

// ---------------------------------------------------------------------------
// Max-HR ceiling resolution
// ---------------------------------------------------------------------------

export interface CeilingResult {
  ceiling: number;
  basis: 'observed' | 'formula';
  observedMax: number | null;
  /** the Tanaka point estimate (208 − 0.7·age), for reporting; not the ceiling itself. */
  tanaka: number | null;
}

export function resolveMaxHrCeiling(args: {
  /** max HR from CLEAN (non-rejected) sessions that had HR — already vetted by the other filters. */
  observedMaxima: number[];
  age?: number | null;
  /** clean-session count below which we fall back to the formula. Default 5. */
  minCleanSessions?: number;
  observedHeadroom?: number; // default +15
  formulaHeadroom?: number;  // default +30
  fallbackAge?: number;      // used only when age is missing. Default 40.
}): CeilingResult {
  const clean = (args.observedMaxima || []).filter((v) => Number.isFinite(v) && v > 0);
  const minN = args.minCleanSessions ?? 5;
  const obsHead = args.observedHeadroom ?? 15;
  const formHead = args.formulaHeadroom ?? 30;
  const observedMax = clean.length ? Math.max(...clean) : null;

  const age = (typeof args.age === 'number' && args.age > 0) ? args.age : (args.fallbackAge ?? 40);
  const tanaka = Math.round(208 - 0.7 * age);

  // Primary: observed max + headroom, once we trust enough clean sessions.
  if (clean.length >= minN && observedMax != null) {
    return { ceiling: observedMax + obsHead, basis: 'observed', observedMax, tanaka };
  }
  // Fallback: generous formula ceiling (never a training cap).
  return { ceiling: tanaka + formHead, basis: 'formula', observedMax, tanaka };
}

/** A scalar max/avg HR above the ceiling is physiologically impossible → corrupt. */
export function exceedsCeiling(hr: number | null | undefined, ceiling: number): boolean {
  const v = Number(hr);
  return Number.isFinite(v) && v > ceiling;
}

// ---------------------------------------------------------------------------
// Cadence-lock detection — the PRIMARY corrupt-vs-real discriminator
// ---------------------------------------------------------------------------
// A real hard-interval session has HR climbing with EFFORT while cadence stays ~flat
// → low HR-cadence correlation, even at high HR. An optical/dry-electrode cadence-lock
// reads cadence AS HR → HR tracks cadence → high correlation. Correlation, NOT height,
// separates them.

/** Pearson correlation of two equal-length series; null if degenerate (zero variance / too short). */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  if (da === 0 || db === 0) return null; // a flat series (e.g. steady cadence) can't correlate
  return num / Math.sqrt(da * db);
}

export function isCadenceLocked(
  hrSeries: number[],
  cadenceSeries: number[],
  threshold = 0.85,
): { locked: boolean; correlation: number | null } {
  const r = pearson(hrSeries, cadenceSeries);
  return { locked: r != null && r > threshold, correlation: r };
}

// ---------------------------------------------------------------------------
// Impossible-slew — isolated single-sample spikes (70 → 180 → 90) no heart produces
// ---------------------------------------------------------------------------
// Detects a point far from BOTH neighbours in opposite directions (an isolated blip),
// not a sustained climb — so a legit ramp into an interval is never flagged.

export function detectHrSpikes(
  hrSeries: number[],
  jumpBpm = 40,
): { hasSpike: boolean; spikeCount: number; maxJump: number } {
  let spikeCount = 0, maxJump = 0;
  for (let i = 1; i < hrSeries.length - 1; i++) {
    const prev = hrSeries[i - 1], cur = hrSeries[i], next = hrSeries[i + 1];
    if (![prev, cur, next].every((v) => Number.isFinite(v))) continue;
    const up = cur - prev, down = cur - next;
    // isolated spike: jumps away from both neighbours in the SAME direction (both > jump, or both < -jump)
    if ((up > jumpBpm && down > jumpBpm) || (up < -jumpBpm && down < -jumpBpm)) {
      spikeCount += 1;
      maxJump = Math.max(maxJump, Math.abs(up), Math.abs(down));
    }
  }
  return { hasSpike: spikeCount > 0, spikeCount, maxJump };
}

// ---------------------------------------------------------------------------
// Combined verdict
// ---------------------------------------------------------------------------

export type HrCorruptReason = 'over_ceiling' | 'cadence_lock' | 'impossible_slew';

export function assessHrPlausibility(args: {
  maxHr?: number | null;
  ceiling: number;
  hrSeries?: number[];
  cadenceSeries?: number[];
  cadenceLockThreshold?: number;
  slewBpm?: number;
}): { corrupt: boolean; reasons: HrCorruptReason[]; correlation: number | null } {
  const reasons: HrCorruptReason[] = [];

  if (exceedsCeiling(args.maxHr, args.ceiling)) reasons.push('over_ceiling');

  let correlation: number | null = null;
  if (args.hrSeries?.length && args.cadenceSeries?.length) {
    const cl = isCadenceLocked(args.hrSeries, args.cadenceSeries, args.cadenceLockThreshold ?? 0.85);
    correlation = cl.correlation;
    if (cl.locked) reasons.push('cadence_lock');
  }

  if (args.hrSeries?.length) {
    if (detectHrSpikes(args.hrSeries, args.slewBpm ?? 40).hasSpike) reasons.push('impossible_slew');
  }

  return { corrupt: reasons.length > 0, reasons, correlation };
}
