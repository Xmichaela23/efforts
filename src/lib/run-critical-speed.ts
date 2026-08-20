/**
 * RUN CRITICAL SPEED — a MEASURED threshold pace, fitted from the athlete's own best efforts.
 *
 * ⛔ WHY THIS EXISTS, AND WHAT IT REPLACES. The run threshold learner takes every run whose AVERAGE
 * heart rate lands near threshold and medians their AVERAGE PACE over the whole activity. A
 * hill-repeat session averages near threshold heart rate, and its average pace includes every walk
 * back down — which is how a threshold pace SLOWER than the athlete's easy pace reached a real
 * screen (2026-08-19). Averaging a whole activity cannot measure a sustained effort. Looking inside
 * it can.
 *
 * ⛔ THIS IS THE MODEL THE OTHER TWO SPORTS ALREADY USE. The bike learns FTP from the best 20-minute
 * power window across rides; the swim fits a critical-speed curve across best efforts at distinct
 * durations and abstains when the curve does not hold. Running was the one discipline still
 * averaging. It is also what the field does — Strava's best-efforts table and power curve, every
 * critical-power tool — so this is not a new idea, it is the standard one, arriving late.
 *
 * ⛔ RUN MATHS, IN A RUN FILE. `_shared/swim/swim-css-learner.ts` fits the same line and is NOT
 * shared with this on purpose. What is common between them is a least-squares regression — fifteen
 * lines with no opinion in it, which cannot meaningfully drift. What is NOT common is every gate
 * that matters: swim rejects drill laps, kick laps, paddles and pool-length errors; running has to
 * reject downhill stretches, stopped time, treadmill pace and heart-rate dropouts. If the gates all
 * differ, "sharing" means sharing the regression and calling it reuse. The two files point at each
 * other so nobody merges them by accident.
 *
 * ⚠️ WHAT THIS MEASURES IS CRITICAL SPEED, WHICH IS NOT LITERALLY LACTATE THRESHOLD. CS is the
 * asymptote of the speed-duration curve — the boundary of the severe-intensity domain — and it sits
 * a few percent above maximal lactate steady state, which is closer to what a coach means by
 * "threshold pace". The app already made this call for swimming (the CSS fit is stored and shown as
 * the swim threshold), so treating CS as the run threshold is consistent with existing precedent
 * rather than a new claim. Recorded here so it is not rediscovered as a bug.
 *
 * ⛔ IT ABSTAINS. Every gate below returns null rather than a hedged number, for the reason LAW 2
 * exists in `learn-fitness-profile`: a value published without the evidence to stand it up is worse
 * than no value, because a null re-learns and a lie does not.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;

/**
 * One best effort pulled out of a single run: the fastest stretch of that DURATION inside it.
 *
 * ⚠️ DURATION-BASED, NOT DISTANCE-BASED, AND THE DIFFERENCE IS THE WHOLE POINT. The app already
 * computes a best 1-mile / 5K / 10K per run (`compute-workout-analysis:132`), but those only exist
 * when the run is long enough to contain the distance, and they cluster: a 10K runner's best mile
 * and best 5K sit close together on the curve, which is exactly the "no duration spread" case a
 * critical-speed fit refuses. Fixed durations sample the curve where it actually bends, and it is
 * the shape the bike's power curve already uses.
 */
export type RunEffort = {
  /** metres covered in the window. */
  distanceM: number;
  /** seconds of the window. Moving time — a window containing a stop is not an effort. */
  timeS: number;
  /** mean heart rate over the window, or null if the trace dropped out there. */
  avgHr: number | null;
  /** net elevation change over the window, metres. Negative = net descent. */
  netAscentM?: number | null;
  /** ISO date of the run, for recency filtering by the caller. */
  date: string;
};

export type RunCsConfidence = 'insufficient' | 'low' | 'moderate' | 'high';

export type RunCsResult = {
  /** MEASURED threshold pace, sec per KM — the unit `learned_fitness` stores. null = abstained. */
  csSecPerKm: number | null;
  /** The same value in sec per MILE — the unit every resolver speaks. */
  csSecPerMi: number | null;
  /** Anaerobic distance capacity, metres. The line's intercept; a plausibility check, not a product. */
  dPrimeM: number | null;
  r2: number | null;
  confidence: RunCsConfidence;
  /** How many distinct duration buckets survived every gate. */
  nPoints: number;
  /** Plain-language account of what happened — the receipt, and the abstention reason. */
  reason: string;
};

/**
 * ⛔ THE DURATION BUCKETS, AND WHY THESE. Bounded BELOW at 3 minutes because anything shorter is
 * dominated by anaerobic capacity and bends the line away from the asymptote the fit is trying to
 * find. Bounded ABOVE at 60 minutes because a longer effort drifts below critical speed for reasons
 * that are not fitness — fuelling, heat, boredom. Between those, five buckets spaced so a typical
 * threshold session (3 × 8 min) and a typical long tempo (25 min) land in different ones.
 *
 * ⚠️ These are BUCKET EDGES, not target durations. An effort is filed by which band its length falls
 * in, and only the fastest per band survives — one hard session cannot supply three points.
 */
const DURATION_BUCKETS_S = [180, 360, 720, 1200, 2100, 3600];

/**
 * ⛔ THE HARD-EFFORT GATE. A best 6-minute stretch inside an easy run is not a maximal effort, and a
 * curve fitted from jogging measures how fast the athlete jogs. Swim solves this with an RPE flag
 * and a named test protocol; running has heart rate on almost every activity, so the gate is
 * heart rate relative to the athlete's own threshold heart rate.
 *
 * 0.92 — the effort must be at or above 92% of threshold heart rate. Friel and Coggan both place the
 * bottom of the threshold zone near 95% of threshold HR; 0.92 sits deliberately just below that, so
 * a genuine sustained effort with cardiac lag at the start is not rejected on a rounding error,
 * while a Z2 run (which sits under ~89% of threshold HR by the same tables the easy band uses) can
 * never qualify. The band between the two is the tolerance, not a judgement about the athlete.
 *
 * ⚠️ NO HEART RATE, NO POINT. An effort whose window has no heart rate is DROPPED, not assumed hard.
 * That is the same call `learn-fitness-profile` makes when a run has no HR, and the same one the
 * stream reader already encodes by leaving dropped-out timestamps absent rather than zero.
 */
const HARD_EFFORT_HR_FRACTION = 0.92;

/**
 * ⛔ THE DOWNHILL GATE. A fast stretch that drops 40 metres is gravity, not fitness, and it is the
 * one contamination running has that neither of the other two sports does. Net descent steeper than
 * 1% of the window's distance is refused.
 *
 * ⚠️ ONE PERCENT IS A BAND, NOT A CLIFF. Course-measurement bodies treat 1 m/km of net drop as the
 * point where a road course stops being record-eligible; borrowing that line means the app refuses
 * what the sport already refuses, rather than picking a number. Rolling terrain that returns to
 * where it started has a net of roughly zero and passes, which is correct — the effort was real.
 *
 * ⚠️ ELEVATION IS OPTIONAL. When the window carries no elevation the effort is KEPT: refusing every
 * effort from a device without a barometer would silently exclude whole athletes, and the invariant
 * gate below still catches an implausible result. Absent data is not evidence of a hill.
 */
const MAX_NET_DESCENT_FRACTION = -0.01;

/** Sanity band for a fitted threshold pace, sec/MILE. Same band the pace resolvers use. */
const CS_SANE_SEC_PER_MI = { min: 180, max: 1200 };

/**
 * Plausible anaerobic distance capacity for running, metres. Reported D' in the literature clusters
 * around 100-300 m for trained runners; this band is deliberately wider than that, because its job
 * is to catch a fit that has gone geometrically wrong — two points nearly on top of each other, or a
 * curve bent by a mis-measured window — not to police an athlete's physiology.
 */
const D_PRIME_SANE_M = { min: 30, max: 600 };

function abstain(reason: string, n = 0): RunCsResult {
  return { csSecPerKm: null, csSecPerMi: null, dPrimeM: null, r2: null, confidence: 'insufficient', nPoints: n, reason };
}

/**
 * Fit a run threshold pace from best efforts.
 *
 * @param efforts        every candidate window across the athlete's recent runs
 * @param thresholdHrBpm the athlete's own threshold heart rate — the hard-effort gate's reference.
 *                       null means the gate CANNOT be applied, and the fit abstains rather than
 *                       running ungated: a curve from unverified efforts is the averaging bug again,
 *                       one level up.
 * @param easyPaceSecPerKm the athlete's MEASURED easy pace, for the invariant check. null skips it —
 *                       there is then no reference, and inventing one is the fabrication LAW 2
 *                       already deleted from the learner.
 */
export function fitRunCriticalSpeed(
  efforts: RunEffort[],
  thresholdHrBpm: number | null,
  easyPaceSecPerKm: number | null,
): RunCsResult {
  if (thresholdHrBpm == null || !Number.isFinite(thresholdHrBpm) || thresholdHrBpm <= 0) {
    return abstain('no threshold heart rate on file — the hard-effort gate cannot be applied, and an ungated fit measures jogging');
  }

  const wellFormed = (efforts || []).filter((e) =>
    e && Number.isFinite(e.distanceM) && e.distanceM > 0 && Number.isFinite(e.timeS) && e.timeS > 0
  );
  if (wellFormed.length === 0) return abstain('no usable best efforts');

  // ── GATE 1: was it actually hard? ──
  const hrFloor = thresholdHrBpm * HARD_EFFORT_HR_FRACTION;
  const hard = wellFormed.filter((e) => e.avgHr != null && Number.isFinite(e.avgHr) && e.avgHr >= hrFloor);
  if (hard.length === 0) {
    return abstain(`no effort reached ${Math.round(hrFloor)} bpm (${Math.round(HARD_EFFORT_HR_FRACTION * 100)}% of threshold HR) — nothing measured here was a threshold effort`);
  }

  // ── GATE 2: was it downhill? ──
  const level = hard.filter((e) => {
    if (e.netAscentM == null || !Number.isFinite(e.netAscentM)) return true;  // absent ≠ downhill
    return (e.netAscentM / e.distanceM) >= MAX_NET_DESCENT_FRACTION;
  });
  if (level.length === 0) return abstain('every hard effort was net downhill — that is gravity, not fitness', hard.length);

  // ── Best (fastest) effort per duration bucket. One session cannot supply three points. ──
  const byBucket = new Map<number, RunEffort>();
  for (const e of level) {
    let bi = -1;
    for (let i = 0; i < DURATION_BUCKETS_S.length - 1; i++) {
      if (e.timeS >= DURATION_BUCKETS_S[i] && e.timeS < DURATION_BUCKETS_S[i + 1]) { bi = i; break; }
    }
    if (bi < 0) continue;   // outside 3-60 min: too short to be aerobic, too long to hold CS
    const cur = byBucket.get(bi);
    if (!cur || (e.timeS / e.distanceM) < (cur.timeS / cur.distanceM)) byBucket.set(bi, e);
  }
  const pts = [...byBucket.values()].sort((a, b) => a.timeS - b.timeS);
  if (pts.length < 2) {
    return abstain(`hard efforts span ${pts.length} duration band(s); a critical-speed fit needs at least 2`, pts.length);
  }

  // ── GATE 3: monotonic. A longer effort cannot be FASTER than a shorter one on a real curve. ──
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].timeS / pts[i - 1].distanceM;
    const cur = pts[i].timeS / pts[i].distanceM;
    if (cur < prev - 0.002) {   // ~3 s/km of tolerance for GPS noise
      return abstain('a longer effort came out faster than a shorter one — not a clean speed-duration curve', pts.length);
    }
  }

  // ── THE FIT: distance = CS · time + D'. Least squares; the same line the swim learner draws. ──
  const X = pts.map((p) => p.timeS);
  const Y = pts.map((p) => p.distanceM);
  const n = X.length;
  const mx = X.reduce((a, b) => a + b, 0) / n;
  const my = Y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  if (sxx <= 0) return abstain('degenerate fit — no spread in effort duration', n);
  const cs = sxy / sxx;                       // metres per second
  const dPrime = my - cs * mx;                // metres
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  if (!(cs > 0)) return abstain('fit produced a non-positive critical speed', n);

  const csSecPerKm = 1000 / cs;
  const csSecPerMi = csSecPerKm * SEC_PER_KM_TO_SEC_PER_MI;

  // ── GATE 4: the sanity band every pace reader in this app already applies. ──
  if (csSecPerMi < CS_SANE_SEC_PER_MI.min || csSecPerMi > CS_SANE_SEC_PER_MI.max) {
    return abstain(`fitted pace ${Math.round(csSecPerMi)} s/mi is outside the plausible band`, n);
  }

  /**
   * ── GATE 5: THE INVARIANT. A threshold effort is faster than an easy effort.
   *
   * ⛔ THE SAME RULE, AT THE THIRD SITE. `learn-fitness-profile` applies it to its own candidates and
   * `run-threshold-from-easy.ts` applies it to inferred values. Here it applies to a MEASUREMENT —
   * so the answer is to REFUSE, never to clamp. A measurement that contradicts physiology is not a
   * measurement to be corrected into range; it is evidence that the windows were not what they
   * looked like.
   */
  if (easyPaceSecPerKm != null && Number.isFinite(easyPaceSecPerKm) && easyPaceSecPerKm > 0
      && csSecPerKm >= easyPaceSecPerKm) {
    return abstain(`fitted threshold ${Math.round(csSecPerKm)} s/km is not faster than measured easy pace ${Math.round(easyPaceSecPerKm)} s/km — impossible, so the efforts were not what they appeared`, n);
  }

  // ── GATE 6: do the points actually lie on a line? ──
  if (r2 < 0.95) return abstain(`fit R² ${r2.toFixed(3)} is below the 0.95 floor — the points do not describe one curve`, n);

  if (dPrime < D_PRIME_SANE_M.min || dPrime > D_PRIME_SANE_M.max) {
    return abstain(`implausible anaerobic capacity D' ${Math.round(dPrime)} m (expect roughly 100-300)`, n);
  }

  /**
   * Confidence tiers. More points and a tighter line earn more trust; two points is a LINE THROUGH
   * TWO POINTS, whose R² is 1.0 by construction and means nothing, so it can never exceed `low`.
   */
  let confidence: RunCsConfidence;
  if (n >= 4 && r2 >= 0.97) confidence = 'high';
  else if (n >= 3 && r2 >= 0.96) confidence = 'moderate';
  else confidence = 'low';

  return {
    csSecPerKm: Math.round(csSecPerKm),
    csSecPerMi: Math.round(csSecPerMi),
    dPrimeM: Math.round(dPrime),
    r2: Number(r2.toFixed(3)),
    confidence,
    nPoints: n,
    reason: `fitted from ${n} hard best-effort windows across ${n} duration bands`,
  };
}

/**
 * ⛔ THE EXTRACTOR — the fastest stretch of each TARGET DURATION inside one run.
 *
 * The run twin of `calculatePowerCurve` (`compute-workout-analysis:92`), which does exactly this for
 * the bike over watts. Same shape, same reason, one sport later.
 *
 * ⚠️ IT DOES NOT JUDGE. Every gate — was it hard, was it downhill, does it lie on a curve — belongs
 * to `fitRunCriticalSpeed`, which sees efforts from MANY runs and can compare them. This function's
 * whole job is to report what happened inside one activity, including the heart rate and the
 * elevation change the gates will need. A window that turns out to be a jog is still reported; the
 * fit is what refuses it.
 */

/** The durations sampled. Each is the lower edge of one of the fit's buckets, so each lands in its own. */
export const PACE_CURVE_TARGETS_S = [180, 360, 720, 1200, 2100] as const;

export type PaceCurvePoint = {
  distanceM: number;
  timeS: number;
  avgHr: number | null;
  netAscentM: number | null;
};

/** `{ '180': {...}, '720': {...} }` — only the durations the run was long enough to contain. */
export type RunPaceCurve = Record<string, PaceCurvePoint>;

/**
 * @param distanceM  cumulative metres, one entry per sample
 * @param timeS      cumulative seconds, same length and same clock
 * @param hrBpm      heart rate per sample; null where the trace dropped out
 * @param elevationM elevation per sample in metres; null where the device reports none
 *
 * ⚠️ CUMULATIVE, NOT PER-SAMPLE. Both series are running totals — that is the shape
 * `compute-workout-analysis` already builds them in, and the shape `calculateBestRunEfforts` beside
 * this one already consumes. A window's distance is the difference between its ends, which is also
 * why a stop inside a window shows up as a slow window rather than a gap.
 */
export function buildRunPaceCurve(
  distanceM: number[],
  timeS: number[],
  hrBpm: (number | null)[],
  elevationM?: (number | null)[],
): RunPaceCurve | null {
  const n = Math.min(distanceM?.length ?? 0, timeS?.length ?? 0);
  /**
   * ⛔ A RESOLUTION FLOOR, NOT A LENGTH CHECK. Three samples spanning ten minutes would happily
   * produce a "best 3-minute window", and it would be an interpolation between two points rather
   * than a measurement of anything. A window is only as trustworthy as the sampling underneath it.
   * (Verified by mutation: removing this changes the answer for a sparse trace.)
   */
  if (n < 10) return null;

  const totalTime = timeS[n - 1] - timeS[0];
  const curve: RunPaceCurve = {};

  for (const target of PACE_CURVE_TARGETS_S) {
    // ⚠️ AN OPTIMISATION, NOT A GUARD — say so, because mutation showed removing it changes nothing:
    // the `span < target` test inside the scan already refuses a window the run cannot contain. This
    // just skips scanning the whole trace for durations that were never going to fit.
    if (totalTime < target) continue;

    let best: PaceCurvePoint | null = null;
    let start = 0;
    for (let end = 1; end < n; end++) {
      // Advance `start` while the window is LONGER than the target, so it stays the shortest window
      // that still spans it — the tightest read of "distance covered in `target` seconds".
      while (start < end - 1 && (timeS[end] - timeS[start + 1]) >= target) start++;
      const span = timeS[end] - timeS[start];
      if (span < target) continue;

      const dist = distanceM[end] - distanceM[start];
      if (!(dist > 0)) continue;
      // Normalise to exactly `target` seconds so windows are comparable when samples are irregular.
      const scaled = dist * (target / span);
      if (best && scaled <= best.distanceM) continue;

      const hrSlice = hrBpm?.slice(start, end + 1).filter((h): h is number => h != null && Number.isFinite(h)) ?? [];
      const avgHr = hrSlice.length > 0 ? Math.round(hrSlice.reduce((a, b) => a + b, 0) / hrSlice.length) : null;

      let netAscentM: number | null = null;
      if (elevationM) {
        const a = elevationM[start];
        const b = elevationM[end];
        if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) netAscentM = b - a;
      }

      best = { distanceM: Math.round(scaled), timeS: target, avgHr, netAscentM };
    }

    if (best) curve[String(target)] = best;
  }

  return Object.keys(curve).length > 0 ? curve : null;
}

/** A stored curve → the fit's input shape. One place that knows the storage keys. */
export function paceCurveToEfforts(curve: RunPaceCurve | null | undefined, date: string): RunEffort[] {
  if (!curve || typeof curve !== 'object') return [];
  return Object.values(curve)
    .filter((p) => p && Number.isFinite(p.distanceM) && p.distanceM > 0 && Number.isFinite(p.timeS) && p.timeS > 0)
    .map((p) => ({
      distanceM: p.distanceM,
      timeS: p.timeS,
      avgHr: p.avgHr ?? null,
      netAscentM: p.netAscentM ?? null,
      date,
    }));
}
