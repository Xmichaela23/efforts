/**
 * Type definitions for cycling cross-workout queries — Tier 3 item 10 of running→cycling
 * delta map. Settled by D-010 (see docs/DECISIONS-LOG.md):
 *   1. Achievements = power-curve PRs (best 20-min FTP proxy / best 5-min VO2 proxy /
 *      best 1-min neuromuscular). 90-day rolling for "recent" + best-across-synced-rides
 *      ("best in Efforts") — surface both. NOT a true all-time/lifetime PR: Efforts only
 *      sees synced rides, so this is the recorded best, not the athlete's career best.
 *   2. vs-similar = match on classified_type + duration ±20%; compare against last 3.
 *   3. Limiter (triathletes) = W/kg vs age-group norms by race distance.
 *   4. Limiter (non-tri / no bodyweight) = NP trend vs 90-day mean.
 *
 * Mirrors `_shared/fact-packet/types.ts:VsSimilarV1` + `AchievementV1` shape conventions
 * so consumers can read across sports without sport-branching the high-level structure.
 */

/** Three durations per D-010. Maps directly to `power_curve['1min'|'5min'|'20min']`. */
export type CyclingPRDuration = '1min' | '5min' | '20min';

/** A single PR entry — value plus traceability back to the workout it came from. */
export type CyclingPREntry = {
  /** Best power in watts. */
  value: number;
  /** Workout date (YYYY-MM-DD). */
  date: string;
  /** Workout id — for client navigation back to the source ride. */
  workout_id: string;
};

/**
 * One duration's PR picture. `recent_pr` = best within last 90 days; `all_time_pr` =
 * best across all synced rides ("best in Efforts" — NOT a lifetime/career PR; Efforts
 * only sees synced rides). Both are computed EXCLUDING the current workout, so they are
 * always PRIOR-ride bests. `current_value` is this ride's value at the duration and
 * `set_on_current_ride` says whether this ride set/tied the recorded best — the only
 * fields a consumer may use to claim "set this ride".
 */
export type CyclingPRDurationEntry = {
  recent_pr: CyclingPREntry | null;
  all_time_pr: CyclingPREntry | null;
  /** This ride's power_curve value at this duration (W); null if absent/zero. */
  current_value: number | null;
  /**
   * True iff this ride set or tied the recorded best at this duration —
   * `current_value` present AND (no prior best OR current_value >= prior best).
   * PR-attribution guard: only when this is true may the narrative say the PR
   * was "set this ride". recent_pr/all_time_pr alone are prior-ride bests.
   */
  set_on_current_ride: boolean;
};

/**
 * Power-curve PRs across the athlete's synced ride history. `recent_pr` = best within
 * last 90 days; `all_time_pr` = best across synced rides (the recorded best — NOT a
 * lifetime PR). Entries are null when the athlete has no prior rides at that duration;
 * the whole `CyclingPRsV1` is null when `sample_size < 5` (insufficient data per D-010).
 */
export type CyclingPRsV1 = {
  /** Total ride count considered (excluding current workout). */
  sample_size: number;
  durations: {
    '1min': CyclingPRDurationEntry;
    '5min': CyclingPRDurationEntry;
    '20min': CyclingPRDurationEntry;
  };
};

/**
 * Cycling vs-similar comparison — current workout against last N matching rides where
 * "matching" = same `classified_type` AND duration within ±20% per D-010. Null when
 * `sample_size < 3` (insufficient comparison pool).
 */
export type CyclingVsSimilarV1 = {
  /** Number of past rides used for the comparison. Always ≥3 when this object is non-null. */
  sample_size: number;
  /** classified_type used for matching (e.g., 'threshold', 'sweet_spot', 'vo2'). */
  matched_type: string;
  /** Duration band that defined the match (in minutes). */
  duration_band_min: { lo: number; hi: number };
  /**
   * Delta = current_ride - avg_of_matches. Negative NP delta means current ride had
   * lower NP than typical; positive IF delta means current ride was harder than
   * typical; positive exec delta means better execution than typical.
   */
  np_delta_w: number | null;
  if_delta: number | null;
  exec_delta_pct: number | null;
  /** Plain-language summary for the LLM coach context. */
  assessment: 'above_typical' | 'typical' | 'below_typical' | 'mixed';
};

export type CyclingLimiterSource = 'wkg_vs_norms' | 'np_trend' | 'insufficient_data';

/**
 * Cycling limiter signal. For triathletes with bodyweight + FTP available: W/kg vs
 * age-group norms — flag bike when below mid-pack norm. For non-tri athletes or when
 * bodyweight is missing: NP trend vs 90d mean — surface direction but don't claim
 * "limiter" since cycling-only context can't tell what's being limited.
 *
 * Per D-010 tradeoff: W/kg-vs-norms is the actionable signal for triathletes; NP-trend
 * is the conservative fallback that works for everyone with enough ride history.
 */
export type CyclingLimiterV1 = {
  /**
   * 'bike' = athlete's cycling fitness flagged as below norm for race distance.
   * 'none' = bike not flagged (either above norm, or insufficient data to claim one
   * way or the other). 'trending_down' / 'trending_up' = NP-trend signals when W/kg
   * path isn't available; not a limiter claim, just a fitness-direction surface.
   */
  flag: 'bike' | 'none' | 'trending_down' | 'trending_up' | 'stable';
  source: CyclingLimiterSource;
  /** Plain-language detail line for the LLM coach context. */
  detail: string;
  /** When source='wkg_vs_norms': the computed W/kg. */
  wkg?: number | null;
  /** When source='np_trend': percent delta from 90-day mean NP. Negative = trending down. */
  np_trend_pct?: number | null;
};
