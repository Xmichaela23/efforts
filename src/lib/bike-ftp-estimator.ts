/**
 * BIKE FTP FROM THE POWER-DURATION CURVE — specified in docs/SPEC-ftp-estimator-2026-09-04.md.
 *
 * ⛔ WHAT IT REPLACES, AND WHY. The learned FTP was `95% × the single best 20-minute effort in the last
 * 90 days` (`learn-fitness-profile:analyzeRides` STEP 4, now the thin-data fallback). It can only report
 * what the athlete already produced: a season of easy riding has no qualifying effort, so the estimate
 * sags — not because fitness fell, but because nothing measured it.
 *
 *   THE READ — the power-duration curve. Assemble the BEST value at each duration across the window
 *   (different rides may supply different durations — TrainerRoad and intervals.icu both build it this
 *   way), fit the two-parameter critical-power model P(t) = CP + W'/t over 2-20 min, and convert CP to
 *   FTP. Power only, no heart rate, no steady-minutes rule — what TrainerRoad's AI FTP Detection and
 *   intervals.icu's eFTP do.
 *
 * ⛔ POWER ONLY (2026-09-04, Michael: "just do what intervals.icu and TrainerRoad do"). A second read —
 * power at the learned threshold heart rate, the Garmin/Firstbeat shape — was built beside this the
 * same day and removed the same night; its 15-block floor was OURS. Ledger: docs/STATE-SOURCES.md.
 *
 * ⛔ ATHLETE-AGNOSTIC. No constant below was chosen because it makes one athlete's number land. Every
 * cutoff is cited to published practice or derived from the data's own scatter, and the reason sits
 * next to it. A reader who wants to move one has to argue with the citation, not with a result.
 *
 * ⛔ IT ABSTAINS, PER GATE, WITH A RECEIPT. Every gate returns a reason string rather than a hedged
 * number, for the reason LAW 2 exists in `learn-fitness-profile`: a value published without the
 * evidence to stand it up is worse than no value, because a null re-learns and a lie does not. A
 * low-confidence estimate is still PUBLISHED as low-confidence — the gate is on the evidence, not on
 * the athlete (no hard gates, TrainerRoad tier).
 *
 * ⛔ BIKE MATHS, IN A BIKE FILE. `run-critical-speed.ts` fits the same kind of line for running and
 * `_shared/swim/swim-css-learner.ts` for swimming. They are NOT shared with this on purpose: the
 * regression is fifteen lines with no opinion in it; every gate that matters is sport-specific.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */

// =============================================================================
// THE POWER CURVE'S DURATIONS
// =============================================================================

/**
 * The durations `compute-workout-analysis:calculatePowerCurve` stores per ride, in seconds, keyed by
 * the label it stores them under.
 *
 * ⛔ WIDENED 2026-09-04. It stored 5s / 1min / 5min / 20min / 60min. The 5s and 1min points are
 * anaerobic and cannot sit on a critical-power fit, which left 5 / 20 / 60 — three points, and the
 * 60-minute one only on a ride that pedalled for an hour. Three points is the floor a two-parameter
 * fit accepts, and one of them was usually missing. The added durations sample the curve where it
 * actually bends (2-12 min) and where FTP lives (30-45 min). Backfills for free on recompute.
 *
 * ⚠️ LABELS ARE THE STORED KEYS. Readers index `power_curve` by these strings; do not rename one.
 */
export const POWER_CURVE_DURATIONS: ReadonlyArray<{ label: string; seconds: number }> = [
  { label: '5s', seconds: 5 },
  { label: '1min', seconds: 60 },
  { label: '2min', seconds: 120 },
  { label: '3min', seconds: 180 },
  { label: '5min', seconds: 300 },
  { label: '8min', seconds: 480 },
  { label: '10min', seconds: 600 },
  { label: '12min', seconds: 720 },
  { label: '20min', seconds: 1200 },
  { label: '30min', seconds: 1800 },
  { label: '45min', seconds: 2700 },
  { label: '60min', seconds: 3600 },
];

/**
 * ⛔ THE DOMAIN OF THE MODEL: 2 TO 20 MINUTES. The two-parameter critical-power hyperbola is validated
 * on efforts of roughly 2-15 min (Hill 1993; Jones et al. 2010, "Critical power: implications for
 * determination of VO2max and exercise tolerance"; Vanhatalo et al. 2011 recommend predicting trials
 * of 2-15 min), with 20 min the customary upper bound in practice. Below 2 min the effort is W'-dominated
 * and the hyperbola does not describe it (5s and 1min are sprint capacity). ABOVE ~20 min the curve
 * bends BELOW the model — substrate depletion, cardiovascular drift and thermoregulation cost power the
 * hyperbola does not know about — so a fit that includes 30/45/60-min bests is a model applied outside
 * its domain, and it reports that as a low r².
 *
 * ⛔ VERIFIED ON THE FIRST BACK-RUN (2026-09-04): one athlete's 2-60 min bests refit as r² 0.871 over
 * 2-60 min (abstained), 0.951 over 2-30, 0.993 over 2-20. The r² gate was right; the domain was wrong.
 * The 30/45/60-min points stay ON the stored power curve — they are the FTP-range evidence other
 * readers want — they are just not handed to a model that does not cover them.
 */
export const CP_FIT_MIN_S = 120;
export const CP_FIT_MAX_S = 1200;

// =============================================================================
// SHARED SHAPES
// =============================================================================

export type Confidence = 'low' | 'medium' | 'high';

/** The confidence rank the resolver and the tier-cliff guard both use. */
export function confidenceRank(c: Confidence | string | null | undefined): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : c === 'low' ? 0 : -1;
}

// =============================================================================
// SHARED RESULT SHAPE
// =============================================================================

export type SignalResult = {
  value: number | null;
  confidence: Confidence | null;
  /** how many durations stood the value up */
  n: number;
  reason: string;
};

// =============================================================================
// SHARED MATHS
// =============================================================================

/**
 * ⛔ AEROBIC DECOUPLING IS NOT READ HERE — NOT AS A GATE, NOT AS A WEIGHT (2026-09-04, after the first
 * back-run). The 5% figure is a PLAN rule from the corpus (docs/SOURCE-viada-hybrid-athlete.md p107: a
 * session is terminated at 10% cardiac drift, 5% for hybrid athletes) and a REPORTING threshold in the
 * app (`compute-snapshot` carries `decoupling_mixed_effort` as "a confidence hedge — NOT a filter";
 * `analyze-cycling-workout` surfaces >5% as notable). It says when to stop a workout and what to flag to
 * the athlete. It was never a statement about which rides are fit to compute from, and the first draft
 * of this file borrowed it as an exclusion gate: 9 of 19 rides rejected, and a "median" of one ride.
 * A number that exists as a plan rule or a reporting threshold is not licensed as a filter elsewhere.
 *
 * The bias drift causes is real — heart rate rising at flat power tilts the fitted slope — and a fit
 * that is genuinely unusable is caught by the r², span and extrapolation gates on the fit's own
 * evidence, not on a borrowed training threshold. A "read the first half of the ride first, before
 * drift accumulates" rule was tried here and removed the same day: over the reference athlete's 19
 * rides it changed no fitted value and no median (159/195/169/135/190 with and without it), only two
 * of five fits even used a half, and it added a branch, a fallback and a receipt string for that.
 */

function olsWithIntercept(x: ReadonlyArray<number>, y: ReadonlyArray<number>) {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  const sse = Math.max(0, syy - slope * sxy);
  const s2 = n > 2 ? sse / (n - 2) : 0; // residual variance
  return { n, mx, my, sxx, slope, intercept, r2, s2 };
}

// =============================================================================
// SIGNAL B — THE POWER-DURATION FIT
// =============================================================================

export type SignalBResult = SignalResult & {
  cp: number | null;
  /** joules */
  wPrime: number | null;
  r2: number | null;
  /** the points the line was fitted on */
  points: Array<{ seconds: number; watts: number }>;
};

/**
 * ⛔ W' HAS A PHYSIOLOGICAL RANGE. Jones et al. 2010 report W' of roughly 10-25 kJ across trained
 * cyclists, with the population tail reaching about 5 kJ (untrained) and 40 kJ (elite sprinters). A fit
 * whose intercept falls outside 5-40 kJ is describing the noise in the points, not an athlete. Negative
 * W' means the curve slopes the wrong way.
 */
export const W_PRIME_SANE_J = { min: 5_000, max: 40_000 };

/**
 * ⛔ CP → FTP. Critical power is the asymptote of the hyperbola and sits slightly ABOVE the power an
 * athlete holds for an hour; the published comparisons put FTP 2-5% under CP (Morgan et al. 2019,
 * J Sports Sci; Karsten et al. 2015 found the two statistically indistinguishable, i.e. the low end of
 * that band). 0.97 is the middle of the band. Recorded in the source string so a reader can see which
 * convention produced the number.
 */
export const FTP_FROM_CP = 0.97;

/**
 * ⛔ THE CURVE HAS TO BE ONE CURVE. P against 1/t is a straight line under the model; r² below 0.9 means
 * the best efforts came from rides that do not describe one athlete on one day — typically a curve
 * where the long efforts were hard and the short ones were never attempted. The run's critical-speed
 * fit uses 0.95 on distance-against-time, which is always straighter (time is cumulative); 0.9 is the
 * equivalent floor for a power-against-1/t line.
 */
export const CP_MIN_R2 = 0.90;
export const CP_MIN_POINTS = 3;

/** Best watts at each duration, from `power_curve` labels → seconds via POWER_CURVE_DURATIONS. */
export function bestPerDuration(curves: ReadonlyArray<Record<string, unknown> | null | undefined>): Array<{ seconds: number; watts: number }> {
  const best = new Map<number, number>();
  for (const c of curves) {
    if (!c || typeof c !== 'object') continue;
    for (const { label, seconds } of POWER_CURVE_DURATIONS) {
      const v = Number((c as Record<string, unknown>)[label]);
      if (!Number.isFinite(v) || v <= 0) continue;
      if ((best.get(seconds) ?? 0) < v) best.set(seconds, v);
    }
  }
  return [...best.entries()].map(([seconds, watts]) => ({ seconds, watts })).sort((a, b) => a.seconds - b.seconds);
}

export function fitCriticalPower(points: ReadonlyArray<{ seconds: number; watts: number }>): SignalBResult {
  const abstain = (reason: string, pts = [] as Array<{ seconds: number; watts: number }>, extra: Partial<SignalBResult> = {}): SignalBResult => ({
    value: null, confidence: null, n: pts.length, reason, cp: null, wPrime: null, r2: null, points: pts, ...extra,
  });
  const pts = points
    .filter((p) => p.seconds >= CP_FIT_MIN_S && p.seconds <= CP_FIT_MAX_S && p.watts > 0)
    .sort((a, b) => a.seconds - b.seconds);
  if (pts.length < CP_MIN_POINTS) return abstain(`${pts.length} aerobic-band durations on the curve, need ${CP_MIN_POINTS}`, pts);
  // A best-per-duration curve must not rise with duration: a longer best that beats a shorter one
  // means the shorter one was never attempted and would drag CP up. Enforce the shape by clamping each
  // shorter duration to at least the longer best (the athlete demonstrably held ≥ that for less time).
  for (let i = pts.length - 2; i >= 0; i--) {
    if (pts[i].watts < pts[i + 1].watts) pts[i] = { ...pts[i], watts: pts[i + 1].watts };
  }
  const x = pts.map((p) => 1 / p.seconds);
  const y = pts.map((p) => p.watts);
  const f = olsWithIntercept(x, y);
  const cp = f.intercept;
  const wPrime = f.slope;
  if (!(wPrime > 0)) return abstain('curve does not fall with duration', pts, { cp, wPrime, r2: f.r2 });
  if (wPrime < W_PRIME_SANE_J.min || wPrime > W_PRIME_SANE_J.max) {
    return abstain(`implausible W' ${Math.round(wPrime / 1000)} kJ (expect roughly 5-40)`, pts, { cp, wPrime, r2: f.r2 });
  }
  if (f.r2 < CP_MIN_R2) return abstain(`fit r² ${f.r2.toFixed(3)} is below ${CP_MIN_R2}; the points do not describe one curve`, pts, { cp, wPrime, r2: f.r2 });
  const longest = pts[pts.length - 1].seconds;
  // Confidence: how many durations, how straight, and whether anything on the curve was long enough to
  // pin the asymptote (a 20-minute point is the field's own FTP window). Three points is the floor and
  // never exceeds medium.
  let confidence: Confidence = 'low';
  if (pts.length >= 5 && f.r2 >= 0.95 && longest >= 1200) confidence = 'high';
  else if (pts.length >= 3 && longest >= 1200) confidence = 'medium';
  return {
    value: Math.round(cp * FTP_FROM_CP),
    confidence,
    n: pts.length,
    reason: `CP ${Math.round(cp)} W × ${FTP_FROM_CP} from ${pts.length} durations (${pts[0].seconds / 60}-${longest / 60} min), r² ${f.r2.toFixed(3)}`,
    cp: Math.round(cp),
    wPrime: Math.round(wPrime),
    r2: Number(f.r2.toFixed(3)),
    points: pts,
  };
}

// =============================================================================
// COMBINING
// =============================================================================

export type CompoundFtp = {
  value: number;
  confidence: Confidence;
  /** the receipt — which signal, which convention, which guardrail fired */
  source: string;
  sample_count: number;
  signals: {
    power_duration: { value: number | null; confidence: Confidence | null; n: number; reason: string; cp: number | null; w_prime_j: number | null; r2: number | null };
  };
  /** best 20-minute power actually recorded in the ceiling window, watts */
  ceiling_20min: number | null;
};

/**
 * ⛔ POWER ONLY (2026-09-04, Michael: "just do what intervals.icu and TrainerRoad do"). The estimate is the
 * power-duration fit and nothing else — the read TrainerRoad's AI FTP Detection and intervals.icu's eFTP
 * both make, from power alone, with no heart-rate signal and no steady-minutes rule. A heart-rate-at-
 * threshold read (the Garmin/Firstbeat shape) was built beside it the same day and removed the same
 * night; its 15-block floor was OURS and Michael ruled it out. Then the hard ceiling: never above the
 * best 20-minute power actually recorded — the fit extrapolates, that number does not.
 */
export function compoundFtp(b: SignalBResult, ceiling20min: number | null | undefined): CompoundFtp | null {
  const signals: CompoundFtp['signals'] = {
    power_duration: { value: b.value, confidence: b.confidence, n: b.n, reason: b.reason, cp: b.cp, w_prime_j: b.wPrime, r2: b.r2 },
  };
  const ceiling = typeof ceiling20min === 'number' && Number.isFinite(ceiling20min) && ceiling20min > 0 ? Math.round(ceiling20min) : null;
  if (b.value == null || b.confidence == null) return null;
  let value = b.value as number;
  const confidence = b.confidence as Confidence;
  let source = `power-duration fit (${b.reason})`;
  if (ceiling != null && value > ceiling) {
    source = `${ceiling} W = best 20-min actually recorded (hard ceiling); estimate ${value} W was above it — ${source}`;
    value = ceiling;
  }
  return { value, confidence, source, sample_count: b.n, signals, ceiling_20min: ceiling };
}

/**
 * ⛔ RATE LIMIT. Real FTP does not move 20% between two learns; a single odd ride must not drag every
 * zone with it. The published value may move at most one noise-floor step (5%) per update against the
 * previous published value of THIS estimator. Coggan's own guidance is to re-test every 4-8 weeks and
 * treat sub-5% moves as noise, so 5% per learn (learns run weekly and on demand) bounds the estimate to
 * the pace real fitness changes at. A capped value is still the honest direction — it just arrives
 * over more than one update.
 */
export const FTP_MAX_STEP_FRACTION = 0.05;

export function rateLimitFtp(prevValue: number | null | undefined, next: CompoundFtp): CompoundFtp {
  if (!(typeof prevValue === 'number' && Number.isFinite(prevValue) && prevValue > 0)) return next;
  const maxUp = Math.round(prevValue * (1 + FTP_MAX_STEP_FRACTION));
  const maxDown = Math.round(prevValue * (1 - FTP_MAX_STEP_FRACTION));
  if (next.value > maxUp) {
    return { ...next, value: maxUp, source: `${maxUp} W, rate-limited from ${next.value} W (max +${FTP_MAX_STEP_FRACTION * 100}% per learn from ${prevValue} W) — ${next.source}` };
  }
  if (next.value < maxDown) {
    return { ...next, value: maxDown, source: `${maxDown} W, rate-limited from ${next.value} W (max -${FTP_MAX_STEP_FRACTION * 100}% per learn from ${prevValue} W) — ${next.source}` };
  }
  return next;
}
