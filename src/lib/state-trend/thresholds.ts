// APPROVED 2026-06-13 (Michael). Rationale: notes/state-v2-thresholds-and-swim-check.md.
// These are the "500-floor-class" judgment numbers — change only with sign-off.

import type { TrendThresholds } from './types';

// Strength — 6-week window, asymmetric. e1RM session noise from one RIR of Brzycki
// estimation ≈ ~3%, so the improve gate clears roughly one-RIR of noise; the slide gate
// is tighter (catch a real decline slightly earlier) but the dead-band still protects a deload.
export const STRENGTH_THRESHOLDS: TrendThresholds = {
  windowDays: 42, // 6 weeks
  improvePct: 2.5,
  slidePct: -2.0,
  minSessions: 4,
};

// Bike — 8-week window on the 20-min-power substrate (shown as "power at threshold").
// Power is a direct measurement (less noisy than rep-based e1RM) so the band is a touch
// tighter and symmetric; the ≥3 gate mirrors pwr20_trend_v1's own same-type-ride minimum.
export const BIKE_THRESHOLDS: TrendThresholds = {
  windowDays: 56, // 8 weeks
  improvePct: 2.0,
  slidePct: -2.0,
  minSessions: 3,
};

// Run — GAP pace at comparable effort (sec/km), 6wk to match strength's cadence. Pace moves
// in smaller % than load/e1RM; ±2.0% over 6wk at comparable effort is above day-to-day noise
// (heat/surface/fatigue), which the comparable-effort filter + 2-pt smoothing further damp.
// APPROVED 2026-06-13 (Michael) — trusted; not gated from the headline.
export const RUN_THRESHOLDS: TrendThresholds = {
  windowDays: 42, // 6 weeks
  improvePct: 2.0,
  slidePct: -2.0,
  minSessions: 4, // ≥4 comparable-effort (easy) runs before a GAP trend is asserted
  lowerIsBetter: true,
};

// Swim — pace per 100 (sec/100m), 8wk (swims are sparse, like bike). ⚠️ STAYS PROVISIONAL
// until Q-038 is fixed (Michael 2026-06-13): per-100 pace is Q-038-clouded (wrong-analyzer
// routing + duration unit bug). The values below are approved-by-analogy but swim is GATED
// OUT OF THE HEADLINE (see HEADLINE_GATED_DISCIPLINES) until Q-038 lands. The per-discipline
// row still shows the verdict, tagged "provisional".
export const SWIM_THRESHOLDS: TrendThresholds = {
  windowDays: 56, // 8 weeks
  improvePct: 1.5,
  slidePct: -1.5,
  minSessions: 3,
  lowerIsBetter: true,
};

// Adherence (the fallback axis) = weekly plan-compliance: "am I on plan THIS week". 7-day
// CONFIRMED (Michael 2026-06-13): matches the plan's weekly structure and agrees with D-147's
// this-week off-plan verdict. Deliberately distinct from the 6–8wk performance windows —
// different question (compliance vs fitness direction), correctly different window.
export const ADHERENCE_WINDOW_DAYS = 7;
