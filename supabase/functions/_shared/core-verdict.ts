/**
 * core-verdict.ts — the segment fitness VERDICT (DESIGN-segments §5; Law 5 citizen logic).
 *
 * Pure logic, invoked ON THE SPINE (compute-snapshot / where State's efficiency verdict is born) —
 * NOT in a surface (session-detail/build.ts). Extracted here so it's fixture-testable and so the spine
 * only calls it. Reuses the sound read engine (routeHeadline/routeTrend from heat-adjust.ts).
 *
 * Leads with SAME-EFFORT PACE (efficiency = speed/HR) when enough HR-aligned efforts clear the floor;
 * falls back to RAW PACE (fixed geometry already removes hills) otherwise. Below the floor → NEVER a
 * direction, only "still_building" (the §5 floor; we simply don't call the engine's sub-8 half-vs-half
 * band — the direction is unrepresentable below N, not merely discouraged).
 *
 * CALIBRATION PARAMS (tunable, flagged NON-UNIVERSAL like coverage_frac / min_core_distance /
 * moving-speed — see D-255/D-256):
 *   • windowDays (default 183 ≈ 6 months). This is RECENCY RELEVANCE, not verdict tuning. Its job is to
 *     stop a stale, isolated effort from distorting the slope MAGNITUDE — never to manufacture a sign.
 *     Safeguard: the verdict proved STABLE across windows on real data (still_learning at 13mo/4.3mo/90d);
 *     the window fixes the number, never the direction. General principle it encodes: a sparse-early +
 *     dense-recent data shape gives a single old point high leverage on a regression slope; a recent
 *     window is the STRUCTURAL fix for that shape, not a one-off patch. (Matches Strava Performance
 *     Predictions' rolling ~24-week window.)
 *   • minEfforts (default 8). Looser than Strava's 20-activity floor — appropriate for a single-route
 *     segment, but the knob to WATCH as more cores come online (a 6-month window on only 8 efforts is
 *     thin). Never emit a direction below it.
 *
 * Pure — no clock inside (asOf is passed in). Fixtures: core-verdict.test.ts.
 */
import { routeHeadline, type RouteHeatRow } from './heat-adjust.ts';

export type Trend = ReturnType<typeof routeHeadline>;
export type VerdictDirection = 'improving' | 'holding' | 'declining' | 'still_learning' | 'still_building';

export interface CoreEffortRow {
  effort_date: string; // YYYY-MM-DD
  avg_pace_s_per_km: number | null;
  avg_hr_bpm: number | null;
  metric_source: 'hr_aligned' | 'raw_pace_only';
  temp_f?: number | null;
}

export interface CoreVerdictOpts {
  asOf: string; // YYYY-MM-DD "today" for windowing — required (pure module holds no clock)
  windowDays?: number; // recency window; default 183 (~6mo). CALIBRATION.
  minEfforts?: number; // N floor; default 8. CALIBRATION.
  heatNeutralTempF?: number; // temp fed to the read (heat parked D-251); default 60 = TEMP_REF_F → no adj
  rawFallbackHr?: number; // constant HR for the raw-pace trend (cancels in slope/mean); default 130
}

export interface CoreVerdict {
  metric: 'same_effort_pace' | 'raw_pace' | null;
  direction: VerdictDirection;
  trend: Trend | null;
  n: number; // efforts used in the window
  nHrAligned: number; // HR-aligned efforts in the window
  windowDays: number;
  minEfforts: number;
}

function daysBefore(asOf: string, ymd: string): number {
  return (new Date(asOf + 'T00:00:00Z').getTime() - new Date(ymd + 'T00:00:00Z').getTime()) / 86400000;
}

export function computeCoreVerdict(efforts: CoreEffortRow[], opts: CoreVerdictOpts): CoreVerdict {
  const windowDays = opts.windowDays ?? 183;
  const minEfforts = opts.minEfforts ?? 8;
  const temp = opts.heatNeutralTempF ?? 60;
  const rawHr = opts.rawFallbackHr ?? 130;

  const inWindow = (Array.isArray(efforts) ? efforts : []).filter((e) => {
    if (!e?.effort_date || e.avg_pace_s_per_km == null || e.avg_pace_s_per_km <= 0) return false;
    const d = daysBefore(opts.asOf, e.effort_date);
    return d >= 0 && d <= windowDays; // recency window (fixes magnitude leverage, not the sign)
  });
  const hrRows = inWindow.filter((e) => e.metric_source === 'hr_aligned' && e.avg_hr_bpm != null && e.avg_hr_bpm > 0);

  // Lead with same-effort pace (efficiency) when the HR-aligned population clears the floor.
  if (hrRows.length >= minEfforts) {
    const rows: RouteHeatRow[] = hrRows.map((e) => ({ date: e.effort_date, pace_s_per_km: e.avg_pace_s_per_km, hr: e.avg_hr_bpm, temp_f: temp, intent: null }));
    const trend = routeHeadline(rows);
    return { metric: 'same_effort_pace', direction: (trend?.direction ?? 'still_building') as VerdictDirection, trend, n: hrRows.length, nHrAligned: hrRows.length, windowDays, minEfforts };
  }

  // Fallback: raw pace over the fixed geometry (hills already removed). A constant HR makes routeHeadline
  // trend pure SPEED — the constant cancels in slope/mean, so the pct + CI are identical to a raw-pace
  // regression, and we reuse the same CI-gating instead of a parallel stats path.
  if (inWindow.length >= minEfforts) {
    const rows: RouteHeatRow[] = inWindow.map((e) => ({ date: e.effort_date, pace_s_per_km: e.avg_pace_s_per_km, hr: rawHr, temp_f: temp, intent: null }));
    const trend = routeHeadline(rows);
    return { metric: 'raw_pace', direction: (trend?.direction ?? 'still_building') as VerdictDirection, trend, n: inWindow.length, nHrAligned: hrRows.length, windowDays, minEfforts };
  }

  // Below the floor → still building history. NEVER a direction (the §5 gate — we do not call the
  // engine's sub-8 half-vs-half band; a direction here is unrepresentable, not merely discouraged).
  return { metric: null, direction: 'still_building', trend: null, n: inWindow.length, nHrAligned: hrRows.length, windowDays, minEfforts };
}
