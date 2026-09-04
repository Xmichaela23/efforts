// STATE v2 — shared per-discipline trend types.
// One shape for every discipline (architecture contract #1): a discipline produces a
// dated metric series + its thresholds, and feeds the shared `classifyTrend` primitive.
// Adding run/swim later (post-Q-038) is a new adapter, not new scaffolding.

// 'withheld' (2026-07-16): enough data to COMPUTE a direction but too few qualifying samples to ASSERT one.
// A distinct fourth direction-state — NOT 'holding' ("stable" is itself a claim sparse data can't back).
// Only produced when a caller passes classify's `directionFloor` opt (run durability this round). Consumers
// that roll up direction must treat it as non-directional (like needs_data), never as a movement.
// ⛔ GARMIN'S THREE STATES (2026-09-04, docs/SPEC-state-nothing-invented-2026-09-04.md): improving ↑,
// holding → ("maintaining"), sliding ↓; needs_data = one 28-day half has no session. `withheld` is gone
// with the volume floor that produced it.
export type TrendVerdict = 'improving' | 'holding' | 'sliding' | 'needs_data';

/** One dated metric reading. `value` is the discipline's metric (e1RM lbs, 20-min W, …). */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  value: number;
  /** Optional carrier for predicates (e.g. { name } for deload detection). Never trended. */
  meta?: Record<string, unknown>;
}

/** Per-discipline trend config. The numbers are Michael-approved (2026-06-13). */
export interface TrendThresholds {
  /** Two 28-day halves — 56, Garmin's recent-4-weeks-vs-the-4-before (the only window there is). */
  windowDays: number;
  /** At least one session in each half; the only floor. Carried for the receipt. */
  minSessions: number;
  /** Decimals the metric is DISPLAYED at (efficiency 3, drift 1, pace/watts/e1RM 0). Two averages that
   *  print the same digits are "the same" → holding. FIELD — Garmin: VO2 max is shown whole; Training
   *  Status shows → (maintaining) when the shown number has not moved. */
  precision: number;
  /** When the metric is "lower is better" (pace: sec/km, sec/100m), a DECREASE is improving.
   *  The primitive flips the sign for verdict assignment; `pctChange` in the result stays raw. */
  lowerIsBetter?: boolean;
}

/** Result of running a series through the shared primitive. */
export interface TrendResult {
  verdict: TrendVerdict;
  pctChange: number | null; // recent half vs prior half, one decimal; null when needs_data
  window: { days: number; start: string; end: string; /** first day of the recent 28-day half */ recentStart: string };
  sampleCount: number; // qualifying points inside the 56-day window after filtering
  earlyAvg: number | null; // average of the prior 28 days (null when needs_data)
  recentAvg: number | null; // average of the last 28 days — the headline number
  earlyCount: number; // sessions in the prior half
  recentCount: number; // sessions in the recent half
  points: TrendPoint[]; // the qualifying points actually used (in-window, post-exclude)
  /** Age in days of the newest in-window qualifying point (null when there are none). */
  newestAgeDays: number | null;
  /** Always false — the freshness gate is gone (Garmin recomputes on every activity). Kept so consumers keep their shape. */
  stale: boolean;
  /** Always 1 — the only floor is one session per half. Kept for the receipt's shape. */
  minSessions: number;
}
