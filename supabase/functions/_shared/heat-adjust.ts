// Heat de-confounding for per-route efficiency (Familiar Routes — docs/DESIGN-familiar-routes.md).
//
// The honest version of Strava's "am I getting faster on my loop": same route already cancels the
// hills (identical every time); this removes the remaining confound — HEAT. Heat inflates HR, so a
// hot run at unchanged fitness reads as LOWER efficiency (efficiency = speed / HR). We normalize each
// run's efficiency back to a neutral condition so runs across a season are comparable.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PROHIBITION (load-bearing — read before touching `k` or DEFAULT_HEAT_K).
//   `k` is an HR-SIDE coefficient: the FRACTIONAL RISE IN HR per °F of dew point above neutral, at a
//   fixed effort. Pace-side coefficients (Vermeer's 0.025 min/mi/°F, RunDida %-slowdown tables)
//   answer a DIFFERENT question — "how much to slow down to hold effort" — and are STRUCTURALLY
//   INVALID as a source for `k`. Dropping a pace coefficient into `k` makes the correction
//   confidently wrong while looking sourced. The literature validates the SHAPE (dew point > temp/RH;
//   one-sided; ~55°F neutral); only the athlete's OWN hot-vs-cool same-route paired runs can supply
//   `k`'s magnitude. That paired-run tune is the ONLY valid calibration, not a fallback.
//   Receipts: Ely et al. (dew point as the heat-stress variable); Garmin/Firstbeat (one-sided,
//   ~72°F threshold-gated — nobody scales cool runs DOWN). See DESIGN-familiar-routes.md §4.2.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

import {
  computeEfficiencyIndex,
  ROUTE_EFF_MIN_POINTS,
  type RouteEfficiency,
} from "./efficiency-index.ts";

// Neutral reference: at/below this dew point, evaporative cooling works and no adjustment is applied.
// Conservative end of the 55–60°F industry consensus band (Vermeer's knee is 60°F).
export const DEW_REF_F = 55;

// UNVALIDATED POPULATION PLACEHOLDER, declared as such (D-237 / Law 2). 0.005 = a 0.5% HR rise per °F
// of dew point above neutral. It exists only so the pipeline has a documented default before
// calibration; it MUST be replaced by a value fit from the athlete's own hot-vs-cool same-route runs
// (see PROHIBITION). Do NOT treat this number as validated, and do NOT derive it from a pace coefficient.
export const DEFAULT_HEAT_K = 0.005;

/**
 * Dew point (°F) from temperature (°F) + relative humidity (%), via the Magnus formula.
 * Dew point — not temperature or RH alone — is the heat-stress variable: it measures the moisture
 * that governs whether sweat can evaporate (RH misleads: 90% at 40°F is fine, 90% at 80°F is not).
 * Returns null when inputs are missing/out of range — NEVER a fabricated 0 (a real 0°F dew point and
 * "we don't know" must stay distinguishable, same rule as the resting-HR fix).
 */
export function dewPointF(
  tempF: number | null | undefined,
  humidityPct: number | null | undefined,
): number | null {
  if (tempF == null || humidityPct == null) return null; // missing ≠ 0 (Number(null) === 0)
  const t = Number(tempF);
  const rh = Number(humidityPct);
  if (!Number.isFinite(t) || !Number.isFinite(rh) || rh <= 0 || rh > 100) return null;
  const tc = (t - 32) * (5 / 9);
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(rh / 100) + (a * tc) / (b + tc);
  const dewC = (b * gamma) / (a - gamma);
  if (!Number.isFinite(dewC)) return null;
  return Math.round((dewC * (9 / 5) + 32) * 10) / 10;
}

/**
 * Heat-adjust a run's efficiency index back to the neutral reference condition.
 *   heat_penalty     = k * max(0, dew_point_f - DEW_REF_F)   // one-sided: heat only ever inflates HR
 *   adj_efficiency   = efficiency_index * (1 + heat_penalty) // undo the HR drag → neutral-day value
 *
 * ONE-SIDED by design: below the reference dew point the penalty is 0, so a cool run is returned
 * UNCHANGED — we never scale a cool run down to look artificially fast (matches Garmin's gate).
 *
 * `efficiencyIndex` MUST be the raw speed/HR index (computeEfficiencyIndex). Do NOT pass an
 * already-HR-normalized quantity (e.g. `effort_adjusted_pace_sec_per_km`) — that double-counts HR.
 *
 * When conditions are unknown (dewPointF null) the value is returned UNCHANGED: we cannot correct
 * for weather we didn't measure, and inventing a correction would be the exact lie this prevents.
 * Result is unrounded for clean composition; callers round for display/storage.
 */
/**
 * One-sided heat load above the neutral reference: max(0, dew − DEW_REF_F). The hinged predictor
 * used EVERYWHERE heat enters — both the linear-k correction and the regression's heat covariate —
 * so cool runs (dew ≤ ref) contribute exactly 0 and are never scaled. null when dew is unknown.
 */
export function heatTerm(dew: number | null | undefined): number | null {
  if (dew == null) return null;
  const d = Number(dew);
  if (!Number.isFinite(d)) return null;
  return Math.max(0, d - DEW_REF_F);
}

export function adjEfficiency(
  efficiencyIndex: number | null | undefined,
  dew: number | null | undefined,
  k: number = DEFAULT_HEAT_K,
): number | null {
  if (efficiencyIndex == null) return null; // missing efficiency ≠ 0 (Number(null) === 0)
  const e = Number(efficiencyIndex);
  if (!Number.isFinite(e)) return null;
  const ht = heatTerm(dew);                  // unknown conditions → null → no correction, never invented
  const kk = Number(k);
  if (ht == null || !Number.isFinite(kk)) return e;
  return e * (1 + kk * ht);
}

// ── The route trend read (Familiar Routes §4.3, build step 3) ──────────────────────────────────────

// Efficiency-index change within this band reads as "holding", not a real move. Mirrors the
// (unexported) band in efficiency-index.ts so the raw and heat-adjusted reads agree on "holding".
const HEAT_HOLDING_PCT = 2;

// Non-comparable efforts — dropped before trending, because a hard day's pace:HR is a DIFFERENT
// effort, not a fitness signal (§4.3 "easy/steady aerobic runs only; drop intervals/races").
// A BLOCKLIST (not an allowlist) on purpose: it removes the efforts that genuinely break
// comparability while KEEPING unlabeled/unknown-intent runs, so a mostly-unlabeled history still
// trends instead of collapsing to familiarity-only. Tunable as the intent vocabulary grows.
const NON_COMPARABLE_INTENTS = new Set([
  "intervals", "interval", "fartlek", "tempo", "tempo_run", "tempo_finish",
  "threshold", "race", "races", "race_specific", "race_ready", "sprint", "hill", "hilly",
]);

/** True when a run's intent is comparable easy/steady aerobic work (or simply unlabeled). */
export function isComparableIntent(intent: string | null | undefined): boolean {
  if (intent == null) return true; // unknown → keep (blocklist philosophy)
  return !NON_COMPARABLE_INTENTS.has(String(intent).toLowerCase());
}

export interface RouteHeatRow {
  date?: string;
  pace_s_per_km?: number | null;
  hr?: number | null;
  dew_point_f?: number | null;
  intent?: string | null;
}

/**
 * Heat-adjusted same-route efficiency DIRECTION — the honest "am I getting faster on this loop".
 * For each comparable easy/steady run: efficiency_index (raw speed/HR) → adjEfficiency (undo heat) →
 * half-vs-half (oldest→newest) direction, same shape as routeEfficiencyDirection. A RISING adjusted
 * index = improving. Returns null (caller shows familiarity-only, never a faked trend) when fewer
 * than ROUTE_EFF_MIN_POINTS comparable runs have usable pace + HR.
 *
 * This is the deconfound the old route line lacked: same route already cancels the hills; adjEfficiency
 * cancels the heat. A hot summer stretch at unchanged fitness reads HOLDING here, not "declining".
 */
export function routeEfficiencyDirectionHeatAdjusted(
  history: RouteHeatRow[] | null | undefined,
  k: number = DEFAULT_HEAT_K,
): RouteEfficiency | null {
  const idx = (Array.isArray(history) ? history : [])
    .filter((r) => isComparableIntent(r?.intent))
    .map((r) => ({
      date: String(r?.date ?? ""),
      v: adjEfficiency(computeEfficiencyIndex(r?.pace_s_per_km, r?.hr), r?.dew_point_f, k),
    }))
    .filter((r): r is { date: string; v: number } => r.v != null);
  if (idx.length < ROUTE_EFF_MIN_POINTS) return null;
  idx.sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.ceil(idx.length / 2);
  const avg = (arr: Array<{ v: number }>) => arr.reduce((s, r) => s + r.v, 0) / arr.length;
  const first = avg(idx.slice(0, mid));
  const second = avg(idx.slice(mid));
  if (!(first > 0)) return null;
  const pct = Math.round(((second - first) / first) * 1000) / 10;
  const direction = pct >= HEAT_HOLDING_PCT ? "improving" : pct <= -HEAT_HOLDING_PCT ? "declining" : "holding";
  return { direction, pct, points: idx.length };
}

// ── The joint robust regression path (Familiar Routes §4, build step 4, Option B) ───────────────────
//
// The honest weather-removed fitness trend for a data-rich route. Model:
//     efficiency ~ β0 + β_heat·heatTerm + β_time·time            (one JOINT fit, Option B)
// fit by Huber IRLS so a single GPS-glitch / sick-day run can't swing the line. We read β_time (the
// fitness trend with heat partialled out) WITH a confidence interval and gate the verdict on the CI.
//
// Why joint and not "residualize efficiency on dew, then trend residuals over time": for a seasonal
// runner dew point and time are correlated, so the naive two-step biases β_time (Frisch–Waugh–Lovell).
// One joint fit partials both out simultaneously. This is the load-bearing correction.
//
// Heat inclusion is decided by the heat term's SPREAD, not just N:
//   • heatTerm ~constant (all-cool, or all-same-heat) → heat can't confound the time slope (a constant
//     is absorbed by the intercept) → drop it, regress efficiency ~ time. (method "regression_time_only")
//   • heatTerm well-varied (SD ≥ HEAT_SPREAD_MIN) → include it; the fit LEARNS the per-route heat
//     coefficient from the data — no external k on this path. (method "regression")
//   • heatTerm varies weakly (present but under-identified) → NOT separable from fitness → do not guess
//     it; fall back to the calibrated-k linear correction. (method "linear_k")

export const MIN_REGRESSION_N = 8;   // below this → linear-k half-vs-half fallback (data-poor)
const HEAT_CONSTANT_EPS = 1e-9;      // heatTerm SD below this → heat is constant/absent → drop the term
const HEAT_SPREAD_MIN = 4;           // °F SD of heatTerm needed to identify β_heat; between → fallback

export type TrendDirection = "improving" | "holding" | "declining" | "still_learning";

export interface RouteTrend {
  method: "regression" | "regression_time_only" | "linear_k";
  direction: TrendDirection;
  pct: number;                    // % efficiency change over the route's observed span (point estimate)
  ci: [number, number] | null;   // 95% CI of pct (regression paths); null on the linear_k fallback
  points: number;                // # comparable runs used
  heatCoefPctPerF: number | null; // learned per-route heat effect (%/°F above ref); null unless heat in model
  spanDays: number | null;
}

interface RouteTrendRow extends RouteHeatRow {}

// ---- small deterministic numerics (no libs; p ≤ 3) ----
function mean(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / a.length;
}
function sd(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function madScale(r: number[]): number {
  const m = median(r);
  return median(r.map((x) => Math.abs(x - m))) / 0.6745; // robust σ estimate
}
// Invert a small square matrix via Gauss–Jordan with partial pivoting. null if singular.
function matInv(A: number[][]): number[][] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}
function matVec(A: number[][], v: number[]): number[] {
  return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}
// 97.5th percentile of Student's t (two-sided 95% CI). Table df 1..30; smooth approach to 1.96 beyond.
const T_975 = [
  0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160,
  2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052,
  2.048, 2.045, 2.042,
];
function tCrit(df: number): number {
  const d = Math.max(1, Math.floor(df));
  if (d <= 30) return T_975[d];
  return 1.96 + 2.4 / d; // ≈2.04 at 30, →1.96 for large df
}

// Weighted least squares normal equations → { beta, (XᵀWX)⁻¹ }.
function wls(X: number[][], y: number[], w: number[]): { beta: number[]; inv: number[][] } | null {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const wi = w[i];
    for (let a = 0; a < p; a++) {
      b[a] += wi * X[i][a] * y[i];
      for (let c = 0; c < p; c++) A[a][c] += wi * X[i][a] * X[i][c];
    }
  }
  const inv = matInv(A);
  if (!inv) return null;
  return { beta: matVec(inv, b), inv };
}

interface HuberFit {
  beta: number[];
  seBeta: number[];
  df: number;
}
// Huber-M robust joint fit via IRLS. c = 1.345 (95% Gaussian efficiency). Covariance is the
// WLS-at-convergence approximation Var(β) ≈ σ̂²·(XᵀWX)⁻¹ — deterministic and honest for a directional read.
function huberFit(X: number[][], y: number[]): HuberFit | null {
  const n = y.length;
  const p = X[0].length;
  const c = 1.345;
  let w = new Array(n).fill(1);
  let beta: number[] | null = null;
  let inv: number[][] | null = null;
  for (let iter = 0; iter < 25; iter++) {
    const res = wls(X, y, w);
    if (!res) return null;
    const nb = res.beta;
    inv = res.inv;
    const r = y.map((yi, i) => yi - matVec([X[i]], nb)[0]);
    const s = madScale(r);
    const converged = beta ? beta.every((bj, j) => Math.abs(bj - nb[j]) < 1e-9) : false;
    beta = nb;
    if (s <= 1e-12) break; // near-perfect fit
    w = r.map((ri) => {
      const u = Math.abs(ri / s);
      return u <= c ? 1 : c / u;
    });
    if (converged) break;
  }
  if (!beta || !inv) return null;
  const r = y.map((yi, i) => yi - matVec([X[i]], beta!)[0]);
  const sw = w.reduce((a, b) => a + b, 0);
  const df = sw - p;
  if (df <= 0) return null;
  const sigma2 = w.reduce((a, wi, i) => a + wi * r[i] * r[i], 0) / df;
  const seBeta = beta.map((_, j) => Math.sqrt(Math.max(0, sigma2 * inv![j][j])));
  return { beta, seBeta, df };
}

function ymdToDays(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000; // integer day ordinal, TZ-safe
}

function verdict(point: number, lo: number, hi: number): TrendDirection {
  const band = HEAT_HOLDING_PCT;
  if (lo > 0 && point >= band) return "improving";   // confidently positive AND meaningful
  if (hi < 0 && point <= -band) return "declining";  // confidently negative AND meaningful
  if (lo > -band && hi < band) return "holding";     // CI rules out a meaningful move → confidently flat
  return "still_learning";                            // too uncertain to claim anything
}

function regressionTrend(
  reg: Array<{ day: number; eff: number; ht: number }>,
  includeHeat: boolean,
): RouteTrend | null {
  const meanEff = mean(reg.map((p) => p.eff));
  if (!(meanEff > 0)) return null;
  const meanDay = mean(reg.map((p) => p.day));
  const yr = (day: number) => (day - meanDay) / 365.25; // time in years → well-conditioned normal eqns
  const X = reg.map((p) => (includeHeat ? [1, p.ht, yr(p.day)] : [1, yr(p.day)]));
  const y = reg.map((p) => p.eff);
  const fit = huberFit(X, y);
  if (!fit) return null;
  const tIdx = includeHeat ? 2 : 1;
  const spanYears = (Math.max(...reg.map((p) => p.day)) - Math.min(...reg.map((p) => p.day))) / 365.25;
  const toPct = (perYear: number) => (perYear * spanYears) / meanEff * 100;
  const point = toPct(fit.beta[tIdx]);
  const sePct = Math.abs(toPct(fit.seBeta[tIdx]));
  const half = tCrit(fit.df) * sePct;
  const lo = point - half;
  const hi = point + half;
  return {
    method: includeHeat ? "regression" : "regression_time_only",
    direction: verdict(point, lo, hi),
    pct: Math.round(point * 10) / 10,
    ci: [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10],
    points: reg.length,
    heatCoefPctPerF: includeHeat ? Math.round((fit.beta[1] / meanEff * 100) * 100) / 100 : null,
    spanDays: Math.round(spanYears * 365.25),
  };
}

/**
 * THE route trend read (Familiar Routes §3–§6, build step 4/5). Routes each route to the honest method:
 * data-rich + weather-varied → joint robust regression (heat learned from the data, CI-gated verdict);
 * data-poor or weather-uniform → the calibrated-k linear correction + half-vs-half. Returns null when
 * even the fallback can't honestly speak (caller shows familiarity-only, never a faked trend).
 */
export function routeTrend(
  history: RouteTrendRow[] | null | undefined,
  k: number = DEFAULT_HEAT_K,
): RouteTrend | null {
  const reg = (Array.isArray(history) ? history : [])
    .filter((r) => isComparableIntent(r?.intent))
    .map((r) => ({
      day: ymdToDays(r?.date),
      eff: computeEfficiencyIndex(r?.pace_s_per_km, r?.hr),
      ht: heatTerm(r?.dew_point_f),
    }))
    .filter((p): p is { day: number; eff: number; ht: number } =>
      p.day != null && p.eff != null && p.ht != null
    );

  if (reg.length >= MIN_REGRESSION_N) {
    const heatSpread = sd(reg.map((p) => p.ht));
    if (heatSpread < HEAT_CONSTANT_EPS) return regressionTrend(reg, false); // heat constant/absent → time-only
    if (heatSpread >= HEAT_SPREAD_MIN) return regressionTrend(reg, true);   // well-identified → joint
    // else: heat present but under-identified → fall through to calibrated-k (don't guess β_heat)
  }

  const hv = routeEfficiencyDirectionHeatAdjusted(history, k); // linear-k × half-vs-half
  if (!hv) return null;
  return {
    method: "linear_k",
    direction: hv.direction,
    pct: hv.pct,
    ci: null,
    points: hv.points,
    heatCoefPctPerF: null,
    spanDays: null,
  };
}
