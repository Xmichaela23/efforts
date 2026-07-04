// STATE v2 — shared per-discipline trend types.
// One shape for every discipline (architecture contract #1): a discipline produces a
// dated metric series + its thresholds, and feeds the shared `classifyTrend` primitive.
// Adding run/swim later (post-Q-038) is a new adapter, not new scaffolding.

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
  windowDays: number; // trailing window the trend is measured over
  improvePct: number; // (effective) change >= this → improving
  slidePct: number; // (effective) change <= this (negative) → sliding
  minSessions: number; // qualifying points below this → needs_data
  /** When the metric is "lower is better" (pace: sec/km, sec/100m), a DECREASE is improving.
   *  The primitive flips the sign for verdict assignment; `pctChange` in the result stays raw. */
  lowerIsBetter?: boolean;
  /** STALENESS GATE: if the NEWEST qualifying point is older than this many days, the trend is
   *  no longer current → decays to needs_data (honest), even with enough in-window points. Window
   *  membership alone is not recency. Omit to disable the gate for a discipline. */
  freshnessDays?: number;
}

/** Result of running a series through the shared primitive. */
export interface TrendResult {
  verdict: TrendVerdict;
  pctChange: number | null; // null when needs_data
  window: { days: number; start: string; end: string };
  sampleCount: number; // qualifying points inside the window after filtering
  earlyAvg: number | null; // noise-guard endpoint averages (null when needs_data)
  recentAvg: number | null;
  points: TrendPoint[]; // the qualifying points actually used (in-window, post-exclude)
  /** Age in days of the newest in-window qualifying point (null when there are none). */
  newestAgeDays: number | null;
  /** True when an otherwise-real verdict was decayed to needs_data by the staleness gate. */
  stale: boolean;
  /** The cadence-scaled min-session floor used for the needs_data gate — carried so the
   *  glass-box receipt cites the REAL threshold ("need 4"), not a hardcoded default. */
  minSessions: number;
}
