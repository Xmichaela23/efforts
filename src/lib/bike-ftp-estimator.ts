/**
 * BIKE FTP, COMPOUNDED FROM TWO OPEN SIGNALS — specified in docs/SPEC-ftp-estimator-2026-09-04.md.
 *
 * ⛔ WHAT IT REPLACES, AND WHY. The learned FTP is `95% × the single best 20-minute effort in the last
 * 90 days` (`learn-fitness-profile:analyzeRides` STEP 4, tier 1). It can only report what the athlete
 * already produced: a season of easy riding has no qualifying effort, so the estimate sags — not because
 * fitness fell, but because nothing measured it. Garmin does not have that problem, because its model
 * reads the heart-rate-to-power relationship of EVERY ride rather than the peak of the hardest one.
 * Firstbeat's model is proprietary and is not reproduced here; the two open signals it rests on are.
 *
 *   SIGNAL A — power at threshold heart rate. Per ride, over aerobic steady minutes only, regress power
 *   on heart rate and evaluate the line at the athlete's learned threshold heart rate. An easy ride
 *   contributes. That is the whole point.
 *
 *   SIGNAL B — the power-duration curve. Assemble the BEST value at each duration across the window
 *   (different rides may supply different durations — TrainerRoad and Xert both build it this way),
 *   fit the two-parameter critical-power model P(t) = CP + W'/t, and convert CP to FTP.
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
// SIGNAL A, PART 1 — THE PER-RIDE SUBSTRATE (written at analysis time)
// =============================================================================

/**
 * One ride's aerobic steady minutes, reduced to (heart rate, power) pairs the LEARNER can regress
 * against ANY threshold heart rate later.
 *
 * ⛔ WHY BLOCKS ARE STORED AND NOT A FIT. The fit has to be cut at the athlete's threshold heart rate,
 * and that number is LEARNED — it moves, and `compute-workout-analysis` sees one activity at a time.
 * Storing the minute-blocks lets the learner cut wherever the current threshold sits, re-fit when it
 * moves, and reconstruct the exact raw regression (the OLS on block means IS the OLS on the blocks).
 * A 4-hour ride is at most 240 pairs of integers — smaller than one of the series already stored.
 *
 * ⚠️ IT JUDGES NOTHING. The warm-up skip and the coasting exclusion are the only opinions here, and
 * both are about what a "steady minute" is, not about the athlete.
 */
export type HrPowerBlocks = {
  /** seconds per block */
  block_s: number;
  /** seconds skipped at the start of the ride before the first block */
  skipped_s: number;
  /** mean heart rate per block, bpm, integer */
  hr: number[];
  /** mean power per block, watts, integer */
  w: number[];
};

/**
 * ⛔ SIXTY-SECOND BLOCKS. Heart rate follows power with a time constant of roughly 30-45 s at the onset
 * of exercise (the on-kinetics literature; the same lag the Efficiency Factor and Friel's decoupling
 * average over). One-minute means are long enough that the pair describes one steady state and short
 * enough that a 90-minute ride yields dozens of them.
 */
export const HR_POWER_BLOCK_S = 60;

/**
 * ⛔ THE FIRST TEN MINUTES ARE NOT READ. Heart rate lags power at the start and drifts upward through
 * the warm-up as body temperature rises (cardiac drift begins within the first ~10 min). The run's
 * pace-to-heart-rate read starts at 10 minutes for the same reason (commit 503120d4), so the two
 * sports agree on when a heart rate is settled enough to pair with an output.
 */
export const HR_POWER_WARMUP_SKIP_S = 600;

/**
 * ⛔ A STEADY MINUTE IS ONE THAT WAS PEDALLED. A block in which the athlete coasted for more than a few
 * seconds is not a steady state — the heart rate in it answers the effort before the coast. 90% of the
 * block's samples must carry pedalling power (> 0 W after `compute-workout-analysis` has filled missing
 * ride samples with 0; D-112 follow-up, commit d9ffe621).
 */
export const HR_POWER_MIN_PEDALLING_FRACTION = 0.9;

/**
 * ⛔ HEART RATE TRAILS POWER. The heart-rate response to a step in work rate has a time constant of
 * roughly 30-45 s (on-kinetics; the same lag the 30-s NP window and Friel's 60-s EF averaging exist to
 * absorb). Pairing minute k's power with minute k's heart rate smears the relationship on any ride
 * whose power moves — the heart rate that belongs to this minute's power arrives half a minute later.
 * So each block's heart rate is read over the window shifted LATER by one time constant. The
 * unshifted pairing was one of the reasons stop-and-go rides fitted at r² 0.02 on the first back-run.
 */
export const HR_LAG_S = 30;

/**
 * Build the per-ride block substrate from the index-aligned series. Returns null when the ride has
 * fewer than one usable block — the learner treats absent and null the same way.
 */
export function buildHrPowerBlocks(
  timeS: ReadonlyArray<number>,
  hrBpm: ReadonlyArray<number | null | undefined>,
  powerW: ReadonlyArray<number | null | undefined>,
): HrPowerBlocks | null {
  const n = Math.min(timeS.length, hrBpm.length, powerW.length);
  if (n < 2) return null;
  const t0 = timeS[0];
  const hr: number[] = [];
  const w: number[] = [];

  let blockStart = t0 + HR_POWER_WARMUP_SKIP_S;
  let i = 0;      // power cursor
  let j = 0;      // heart-rate cursor, HR_LAG_S behind in time (i.e. reading later samples)
  while (i < n && timeS[i] < blockStart) i += 1;
  while (j < n && timeS[j] < blockStart + HR_LAG_S) j += 1;

  while (i < n) {
    const blockEnd = blockStart + HR_POWER_BLOCK_S;
    let samples = 0, pedalled = 0, pSum = 0;
    let firstT: number | null = null, lastT: number | null = null;
    while (i < n && timeS[i] < blockEnd) {
      const t = timeS[i];
      const p = powerW[i];
      i += 1;
      if (!Number.isFinite(t)) continue;
      samples += 1;
      if (firstT == null) firstT = t;
      lastT = t;
      const pNum = typeof p === 'number' && Number.isFinite(p) ? p : 0;
      if (pNum > 0) { pedalled += 1; pSum += pNum; }
    }
    // The heart rate for this minute's power is read one lag later.
    let hrSamples = 0, hrSum = 0, hrCount = 0;
    const hrEnd = blockEnd + HR_LAG_S;
    while (j < n && timeS[j] < hrEnd) {
      const h = hrBpm[j];
      j += 1;
      if (!Number.isFinite(timeS[j - 1])) continue;
      hrSamples += 1;
      if (typeof h === 'number' && Number.isFinite(h) && h > 0) { hrSum += h; hrCount += 1; }
    }
    blockStart = blockEnd;
    if (samples === 0 || firstT == null || lastT == null) continue;
    // The block has to be substantially covered: a paused recording that resumes 40 s later is not a
    // minute of riding. Smart recording (Garmin) writes fewer rows than seconds, so the test is on the
    // span the rows cover, not on how many rows there are.
    if (lastT - firstT < HR_POWER_BLOCK_S * 0.75) continue;
    if (pedalled / samples < HR_POWER_MIN_PEDALLING_FRACTION) continue;
    if (hrSamples === 0 || hrCount / hrSamples < HR_POWER_MIN_PEDALLING_FRACTION) continue;
    hr.push(Math.round(hrSum / hrCount));
    w.push(Math.round(pSum / pedalled));
  }

  if (hr.length === 0) return null;
  return { block_s: HR_POWER_BLOCK_S, skipped_s: HR_POWER_WARMUP_SKIP_S, hr, w };
}

// =============================================================================
// SIGNAL A, PART 2 — THE PER-RIDE FIT (evaluated at learn time)
// =============================================================================

export type RideHrPowerFit = {
  /** projected power at threshold heart rate, watts; null = abstained */
  wattsAtThreshold: number | null;
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  /** blocks that survived the aerobic cut */
  nBlocks: number;
  /** heart-rate span the line was fitted across, bpm */
  hrSpanBpm: number;
  /** how far above the highest fitted heart rate the projection reaches, bpm */
  extrapolationBpm: number;
  /** relative standard error of the projection (0.03 = ±3%) — the data's own scatter, in one number */
  relSe: number | null;
  reason: string;
};

/**
 * ⛔ FIFTEEN STEADY MINUTES, from the spec (docs/SPEC-ftp-estimator-2026-09-04.md, Signal A: "require
 * ≥15 min of usable samples or the ride abstains"). It is a floor on how much of ONE ride a line may be
 * fitted through, not a borrowed threshold: 15 one-minute blocks leave 13 residual degrees of freedom,
 * where the t-multiplier on the projection's standard error has settled to ~2.2 (it is 4.3 at n=4 and
 * 12.7 at n=3) — below that the reported `relSe` stops meaning what it says. On the first back-run it
 * was the leading abstain reason (7 of 19 rides, several at 11-14 minutes): those rides are short OR
 * stop-and-go. Lowering it is a spec change, not a tuning knob.
 */
export const HR_POWER_MIN_BLOCKS = 15; // OURS — Garmin's equivalent floor is 20 min at high intensity; 15 kept so this read still speaks through an easy stretch. Ledger: docs/STATE-SOURCES.md

/**
 * ⛔ THE LINE NEEDS A SPAN TO HAVE A SLOPE. A ride held at one heart rate cannot say how power changes
 * with heart rate. The floor is one Friel heart-rate zone in width: his cycling zones are 7-8% of
 * threshold heart rate wide (Z2 = 82-89% LTHR, Z3 = 90-93%), so a fit that does not span at least one
 * zone is being asked to extrapolate from a point. Expressed as a fraction of threshold heart rate so it
 * scales with the athlete rather than being a fixed bpm.
 */
export const HR_POWER_MIN_SPAN_FRACTION = 0.10;

/**
 * ⛔ HOW FAR THE LINE MAY REACH. The regression is only evidence inside the heart rates it was fitted on;
 * the spec names over-extrapolation as this signal's main failure mode. The cap comes from the data's
 * own shape: a projection may reach no further above the highest fitted heart rate than the span the
 * line was fitted across (standard regression practice — extrapolating beyond the data by more than
 * its own range is not supported by it). A ride spanning 120-150 bpm may be read at 180; one spanning
 * 140-150 may be read at 160 and abstains for a threshold at 170.
 */
export const HR_POWER_MAX_EXTRAPOLATION_OF_SPAN = 1.0;

/**
 * ⛔ THE FIT HAS TO DESCRIBE THE RIDE. Below r² = 0.5 the line explains less than half of the power
 * variance and the "slope" is mostly noise. Steady aerobic riding pairs heart rate and power at 60-s
 * resolution with r² well above this (it is the premise of the Efficiency Factor); a ride that fails it
 * was intervals, stop-start or a heart-rate dropout, none of which is a steady-state read.
 */
export const HR_POWER_MIN_R2 = 0.5;

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

/**
 * Fit one ride's blocks and read the line at `thresholdHr`. Only blocks AT OR BELOW threshold heart rate
 * are fitted (the aerobic cut) — the relationship above threshold is a different physiology.
 */
export function fitRidePowerAtThresholdHr(
  blocks: HrPowerBlocks | null | undefined,
  thresholdHr: number,
): RideHrPowerFit {
  const abstain = (reason: string, extra: Partial<RideHrPowerFit> = {}): RideHrPowerFit => ({
    wattsAtThreshold: null, slope: null, intercept: null, r2: null, nBlocks: 0, hrSpanBpm: 0,
    extrapolationBpm: 0, relSe: null, reason, ...extra,
  });
  if (!blocks || !Array.isArray(blocks.hr) || !Array.isArray(blocks.w)) return abstain('no heart-rate/power blocks on the ride');
  if (!(thresholdHr > 0)) return abstain('no threshold heart rate to read the line at');

  const x: number[] = [], y: number[] = [];
  const total = Math.min(blocks.hr.length, blocks.w.length);
  for (let i = 0; i < total; i++) {
    const h = blocks.hr[i], p = blocks.w[i];
    if (!(h > 0) || !(p > 0)) continue;
    if (h > thresholdHr) continue; // above threshold: not aerobic steady state
    x.push(h); y.push(p);
  }
  const nBlocks = x.length;
  if (nBlocks < HR_POWER_MIN_BLOCKS) {
    return abstain(`${nBlocks} aerobic steady minutes, need ${HR_POWER_MIN_BLOCKS}`, { nBlocks });
  }
  const hrMax = Math.max(...x), hrMin = Math.min(...x);
  const hrSpanBpm = hrMax - hrMin;
  const minSpan = thresholdHr * HR_POWER_MIN_SPAN_FRACTION;
  if (hrSpanBpm < minSpan) {
    return abstain(`heart rate spanned ${hrSpanBpm} bpm, need ${Math.round(minSpan)} to fit a slope`, { nBlocks, hrSpanBpm });
  }
  const extrapolationBpm = Math.max(0, thresholdHr - hrMax);
  if (extrapolationBpm > hrSpanBpm * HR_POWER_MAX_EXTRAPOLATION_OF_SPAN) {
    return abstain(`threshold sits ${extrapolationBpm} bpm above the highest fitted heart rate; the line only spans ${hrSpanBpm}`, { nBlocks, hrSpanBpm, extrapolationBpm });
  }
  const f = olsWithIntercept(x, y);
  if (!(f.slope > 0)) {
    return abstain('power did not rise with heart rate', { nBlocks, hrSpanBpm, extrapolationBpm, slope: f.slope, r2: f.r2 });
  }
  if (f.r2 < HR_POWER_MIN_R2) {
    return abstain(`fit r² ${f.r2.toFixed(2)} is below ${HR_POWER_MIN_R2}; not a steady-state ride`, { nBlocks, hrSpanBpm, extrapolationBpm, slope: f.slope, intercept: f.intercept, r2: f.r2 });
  }
  const watts = f.intercept + f.slope * thresholdHr;
  // Standard error of the fitted mean at x0: s·sqrt(1/n + (x0-x̄)²/Sxx). Grows with scatter, with a
  // narrow span, and with distance from the data — the three things that make a projection unreliable.
  const se = Math.sqrt(f.s2 * (1 / f.n + ((thresholdHr - f.mx) ** 2) / f.sxx));
  const relSe = watts > 0 ? se / watts : null;
  return {
    wattsAtThreshold: Math.round(watts),
    slope: Number(f.slope.toFixed(3)),
    intercept: Number(f.intercept.toFixed(1)),
    r2: Number(f.r2.toFixed(3)),
    nBlocks, hrSpanBpm, extrapolationBpm,
    relSe: relSe == null ? null : Number(relSe.toFixed(4)),
    reason: 'fit',
  };
}

// =============================================================================
// SIGNAL A, PART 3 — THE AGGREGATE ACROSS RIDES
// =============================================================================

export type RideForSignalA = {
  /** ISO date, for the receipt */
  date: string;
  blocks: HrPowerBlocks | null | undefined;
  /**
   * `computed.analysis.efficiency.aerobic_decoupling_pct` — REPORTED in the receipt, never read by the
   * fit or the median. Reporting is what the number is for (see the note above HR_POWER_FIRST_HALF_FIRST).
   */
  decouplingPct?: number | null;
};

export type SignalResult = {
  value: number | null;
  confidence: Confidence | null;
  /** how many rides / durations stood the value up */
  n: number;
  reason: string;
};

export type SignalAResult = SignalResult & {
  /** every ride's per-ride read, for the receipt and the back-run */
  rides: Array<{ date: string; watts: number | null; reason: string; r2: number | null; relSe: number | null; decouplingPct: number | null }>;
};

/**
 * ⛔ FIVE PERCENT IS THE FIELD'S NOISE FLOOR ON FTP. Test-retest variation of a 20-min FTP test sits
 * around 3-5% (Coggan's guidance treats moves inside that as noise; TrainerRoad reports changes under
 * ~3% as no change). A set of rides whose middle half agrees within 5% is describing one number.
 */
export const FTP_NOISE_FRACTION = 0.05;

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function quantile(v: number[], q: number): number {
  const s = [...v].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function estimateFtpFromHrPower(rides: ReadonlyArray<RideForSignalA>, thresholdHr: number | null | undefined): SignalAResult {
  const out: SignalAResult['rides'] = [];
  if (!(thresholdHr && thresholdHr > 0)) {
    return { value: null, confidence: null, n: 0, reason: 'no learned ride threshold heart rate', rides: out };
  }
  const watts: number[] = [];
  for (const r of rides) {
    const f = fitRidePowerAtThresholdHr(r.blocks, thresholdHr);
    out.push({ date: r.date, watts: f.wattsAtThreshold, reason: f.reason, r2: f.r2, relSe: f.relSe, decouplingPct: typeof r.decouplingPct === 'number' ? r.decouplingPct : null });
    if (f.wattsAtThreshold != null) watts.push(f.wattsAtThreshold);
  }
  const n = watts.length;
  if (n === 0) return { value: null, confidence: null, n, reason: 'no ride produced a usable heart-rate-to-power fit', rides: out };
  // Median, not max: the spec's choice, because the max of many projections is the most optimistic
  // ride, and optimism compounds through every zone downstream.
  const med = median(watts);
  const spread = n >= 3 ? (quantile(watts, 0.75) - quantile(watts, 0.25)) / med : Infinity;
  let confidence: Confidence = 'low';
  if (n >= 5 && spread <= FTP_NOISE_FRACTION) confidence = 'high';
  else if (n >= 3 && spread <= FTP_NOISE_FRACTION * 2) confidence = 'medium';
  return {
    value: Math.round(med),
    confidence,
    n,
    reason: `median of ${n} rides' power at ${Math.round(thresholdHr)} bpm` + (Number.isFinite(spread) ? ` (middle half within ${(spread * 100).toFixed(1)}%)` : ''),
    rides: out,
  };
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
    hr_power: { value: number | null; confidence: Confidence | null; n: number; reason: string };
    power_duration: { value: number | null; confidence: Confidence | null; n: number; reason: string; cp: number | null; w_prime_j: number | null; r2: number | null };
  };
  /** best 20-minute power actually recorded in the ceiling window, watts */
  ceiling_20min: number | null;
};

/**
 * Publish the higher-confidence signal. When both are confident and disagree by more than the noise
 * floor, publish the LOWER at medium — an FTP set too high poisons every zone, workout target and plan
 * downstream; one set too low only makes sessions easy. Then the hard ceiling: never above the best
 * 20-minute power actually recorded. Both signals extrapolate; that number does not.
 */
export function compoundFtp(a: SignalAResult, b: SignalBResult, ceiling20min: number | null | undefined): CompoundFtp | null {
  const signals: CompoundFtp['signals'] = {
    hr_power: { value: a.value, confidence: a.confidence, n: a.n, reason: a.reason },
    power_duration: { value: b.value, confidence: b.confidence, n: b.n, reason: b.reason, cp: b.cp, w_prime_j: b.wPrime, r2: b.r2 },
  };
  const ceiling = typeof ceiling20min === 'number' && Number.isFinite(ceiling20min) && ceiling20min > 0 ? Math.round(ceiling20min) : null;

  let value: number, confidence: Confidence, source: string, sample_count: number;
  const aOk = a.value != null && a.confidence != null;
  const bOk = b.value != null && b.confidence != null;
  if (!aOk && !bOk) return null;
  if (aOk && bOk) {
    const av = a.value as number, bv = b.value as number;
    const bothConfident = confidenceRank(a.confidence) >= 1 && confidenceRank(b.confidence) >= 1;
    const disagree = Math.abs(av - bv) / Math.min(av, bv) > FTP_NOISE_FRACTION;
    if (bothConfident && disagree) {
      const lowerIsA = av <= bv;
      value = Math.min(av, bv);
      confidence = 'medium';
      source = `${lowerIsA ? 'power at threshold HR' : 'power-duration fit'} ${value} W — the lower of two confident signals that disagree (${av} W HR-power vs ${bv} W curve)`;
      sample_count = lowerIsA ? a.n : b.n;
    } else if (confidenceRank(b.confidence) > confidenceRank(a.confidence)) {
      value = bv; confidence = b.confidence as Confidence; sample_count = b.n;
      source = `power-duration fit (${b.reason}); HR-power read ${av} W agrees within noise`;
    } else {
      value = av; confidence = a.confidence as Confidence; sample_count = a.n;
      source = `power at threshold HR (${a.reason}); curve read ${bv} W` + (disagree ? '' : ' agrees within noise');
    }
  } else if (aOk) {
    value = a.value as number; confidence = a.confidence as Confidence; sample_count = a.n;
    source = `power at threshold HR (${a.reason}); no power-duration fit: ${b.reason}`;
  } else {
    value = b.value as number; confidence = b.confidence as Confidence; sample_count = b.n;
    source = `power-duration fit (${b.reason}); no HR-power read: ${a.reason}`;
  }

  if (ceiling != null && value > ceiling) {
    source = `${ceiling} W = best 20-min actually recorded (hard ceiling); estimate ${value} W was above it — ${source}`;
    value = ceiling;
  }
  return { value, confidence, source, sample_count, signals, ceiling_20min: ceiling };
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
