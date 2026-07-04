/**
 * Shared ACWR (acute:chronic workload ratio) authority.
 *
 * ONE place that turns a set of per-day workloads into an acute:chronic ratio.
 * Before this, five sites computed it independently and disagreed on window
 * shape, load source, coupling, discipline weighting, and the thin-base guard
 * (see docs/DECISIONS-LOG.md D-236 and the Step 6 divergence trace (i)–(vi)).
 *
 * Design (D-236, the five convergence points):
 *   1. One load source — CANONICAL is `workouts.workload_actual`. Callers pass
 *      rows already carrying that number as `workload`; this module never reads
 *      the DB (same "callers adapt their shapes" contract as _shared/workload.ts).
 *   2. Discipline-weight hook — `weightFn(type, name)`; omit for a raw all-
 *      discipline total, or pass getRunningFatigueWeight / getCyclingFatigueWeight
 *      for the discipline-weighted variants. Same code path, different weights —
 *      not three formulas.
 *   3. Explicit window config — `acuteDays`, `chronicDays`, `includeAsOfDate`.
 *      The B-vs-C off-by-one is now a flag, not an accident.
 *   4. Shared thin-base floor — `CHRONIC_LOAD_FLOOR`; below it the ratio is null
 *      everywhere (kills the "coach nulls, fact-packet inflates" asymmetry).
 *   5. acwr-state.ts is the SOLE classifier — the ratio→status mapping lives
 *      only in getAcwrStatus; this module never re-inlines thresholds.
 *
 * Classifier + thresholds: _shared/acwr-state.ts (re-exported here for callers).
 */

import {
  getAcwrStatus,
  type AcwrPlanContext,
  type AcwrStatus,
} from './acwr-state.ts';

export { getAcwrStatus, ACWR_RATIO_THRESHOLDS } from './acwr-state.ts';
export type { AcwrStatus, AcwrPlanContext, AcwrWeekIntent } from './acwr-state.ts';

// ---------------------------------------------------------------------------
// The thin-base floor (was coach's CHRONIC_LOAD_FLOOR, now shared)
// ---------------------------------------------------------------------------

/**
 * Chronic-load floor below which the ratio is untrustworthy and reported as
 * null. A thin chronic base (early in a block, after a long layoff) makes the
 * denominator tiny and inflates the ratio into meaningless territory. Coach
 * already suppressed this at 500; every other site reported the inflated number.
 * Now uniform.
 */
export const CHRONIC_LOAD_FLOOR = 500;

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface LoadRow {
  /** Workout date. Accepts 'YYYY-MM-DD' or an ISO timestamp; only the date part is used. */
  date: string;
  /** CANONICAL load: workouts.workload_actual for the completed workout. */
  workload: number | null | undefined;
  /** Discipline (run / ride / swim / strength / …), for optional weighting. */
  type?: string | null;
  /** Workout name, for the strength focus split inside the fatigue-weight fns. */
  name?: string | null;
}

export interface AcwrWindow {
  /** Acute window length in days. Default 7. */
  acuteDays?: number;
  /** Chronic window length in days. Default 28. */
  chronicDays?: number;
  /**
   * Whether both windows include asOfDate itself.
   *   true  → windows END ON asOfDate      (coach / "as of today, load so far")
   *   false → windows END the day BEFORE   (fact-packet / "load carried INTO this workout")
   * Default true.
   */
  includeAsOfDate?: boolean;
}

export interface AcwrOptions {
  /** The day the ratio is "as of". 'YYYY-MM-DD' or ISO timestamp. */
  asOfDate: string;
  window?: AcwrWindow;
  /**
   * Per-row multiplier. Omit for a raw all-discipline total (weight 1).
   * Pass getRunningFatigueWeight / getCyclingFatigueWeight for weighted ACWR.
   */
  weightFn?: (type?: string | null, name?: string | null) => number;
  /** Override the shared thin-base floor (defaults to CHRONIC_LOAD_FLOOR). */
  chronicLoadFloor?: number;
  /** Plan context for status classification (build/recovery/taper gating). */
  planContext?: AcwrPlanContext | null;
}

export interface AcwrResult {
  /**
   * The acute:chronic ratio ROUNDED to 2 decimals, or null when the chronic
   * base is too thin (chronicLoad < floor) or zero. Null is a first-class
   * "don't trust it" — never coerce it to a number. Use this for display,
   * persistence, and status classification (the canonical reported value).
   */
  ratio: number | null;
  /**
   * The same ratio UNROUNDED (full float), or null under the same conditions.
   * For consumers that compare against a threshold at 2-decimal precision and
   * must stay byte-identical to a pre-existing unrounded computation (e.g. a
   * `< 0.85` taper gate). Prefer `ratio` unless exact continuity is required.
   */
  ratioRaw: number | null;
  /** Summed (weighted) load in the acute window. */
  acuteLoad: number;
  /** Summed (weighted) load in the chronic window. */
  chronicLoad: number;
  /** acuteLoad / acuteDays. */
  acuteAvgDaily: number;
  /** chronicLoad / chronicDays. */
  chronicAvgDaily: number;
  /** getAcwrStatus(ratio, planContext), or null when ratio is null. */
  status: AcwrStatus | null;
  /** True when the chronic base was below the floor (why ratio is null). */
  thinBase: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers (local, so this module has no cross-deps)
// ---------------------------------------------------------------------------

/** Extract the 'YYYY-MM-DD' date part from a date-or-timestamp string. */
function toDateOnly(s: string): string | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Add `delta` days to a 'YYYY-MM-DD' key, returning a 'YYYY-MM-DD' key. UTC math, no TZ drift. */
function addDays(ymd: string, delta: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const t = Date.UTC(y, mo - 1, d) + delta * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// The one computation
// ---------------------------------------------------------------------------

/**
 * Compute the acute:chronic workload ratio from per-day load rows.
 *
 * The windows are coupled by construction — the chronic window CONTAINS the
 * acute window (the standard Gabbett coupled ACWR). Rows outside the chronic
 * window are ignored. Rows are summed per calendar day, then per window.
 */
export function computeAcwr(rows: LoadRow[], opts: AcwrOptions): AcwrResult {
  const asOf = toDateOnly(opts.asOfDate);
  const acuteDays = opts.window?.acuteDays ?? 7;
  const chronicDays = opts.window?.chronicDays ?? 28;
  const includeAsOfDate = opts.window?.includeAsOfDate ?? true;
  const floor = opts.chronicLoadFloor ?? CHRONIC_LOAD_FLOOR;
  const weightFn = opts.weightFn;

  const empty: AcwrResult = {
    ratio: null, ratioRaw: null, acuteLoad: 0, chronicLoad: 0,
    acuteAvgDaily: 0, chronicAvgDaily: 0, status: null, thinBase: false,
  };
  if (!asOf || !Array.isArray(rows) || acuteDays <= 0 || chronicDays <= 0) {
    return empty;
  }

  // Weighted load per calendar day.
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = toDateOnly(r.date);
    if (!d) continue;
    const raw = Number(r.workload);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const w = weightFn ? weightFn(r.type, r.name) : 1;
    if (!Number.isFinite(w) || w <= 0) continue;
    byDay.set(d, (byDay.get(d) ?? 0) + raw * w);
  }

  // includeAsOfDate=true  → day offsets 0..N-1 back from asOf (ends ON asOf).
  // includeAsOfDate=false → day offsets 1..N   back from asOf (ends day BEFORE).
  const startOffset = includeAsOfDate ? 0 : 1;
  const sumWindow = (days: number): number => {
    let sum = 0;
    for (let i = startOffset; i < startOffset + days; i += 1) {
      sum += byDay.get(addDays(asOf, -i)) ?? 0;
    }
    return sum;
  };

  const acuteLoad = sumWindow(acuteDays);
  const chronicLoad = sumWindow(chronicDays);
  const acuteAvgDaily = acuteLoad / acuteDays;
  const chronicAvgDaily = chronicLoad / chronicDays;

  const thinBase = chronicLoad < floor;
  const ratioRaw = (!thinBase && chronicAvgDaily > 0)
    ? acuteAvgDaily / chronicAvgDaily
    : null;
  const ratio = ratioRaw != null ? Math.round(ratioRaw * 100) / 100 : null;
  const status = ratio != null ? getAcwrStatus(ratio, opts.planContext ?? null) : null;

  return { ratio, ratioRaw, acuteLoad, chronicLoad, acuteAvgDaily, chronicAvgDaily, status, thinBase };
}
