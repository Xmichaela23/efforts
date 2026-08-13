// Load floor — the sport-agnostic ALWAYS-ON read under a discipline's measurement signals (Q-255).
//
// The measurement reads (bike: terrain-binned 20-min power, HR-at-power efficiency; run: decoupling,
// GAP-at-easy) only speak when qualifying sessions exist, so a row can go silent on an athlete who is
// riding regularly — the exact failure Q-255 records ("6 rides in 8 weeks · a few more and this reads
// your aerobic fitness", the night after a ride). Every reference app keeps an always-on layer under
// its performance reads for exactly this reason, and they all use the same model:
//
//   Banister impulse-response, as productized by Coggan (TrainingPeaks PMC) and copied by Strava:
//   fitness = 42-day exponentially-weighted daily load (CTL), fatigue = 7-day (ATL),
//   form = fitness − fatigue (TSB). Garmin renders the same inputs as WORDS (Productive /
//   Maintaining / …) rather than numbers.
//
// This module renders VERDICT WORDS from numbers the app already computes per ride
// (`analyze-cycling-workout` → `workout_analysis.fitness_v1`, cached weekly on
// `athlete_snapshot.ctl/atl/tsb`). It computes nothing new — it is a reader (Law: surfaces render).
//
// ⛔ BANDS ARE FIELD-SOURCED, NOT HAND-PICKED (checked 2026-08-13):
//   Freshness (TSB): Friel's guidance + intervals.icu's rendered zones (same lineage) —
//     > +25  transition-grade freshness (detraining risk if sustained)   [intervals.icu: > +20 "Transition";
//     +5..+25  fresh (Friel: +15..+25 ideal race form)                    Friel: race at +15..+25]
//     −10..+5  neutral ("grey zone" — neither training deep nor fresh)
//     −30..−10 productive training fatigue (Friel/intervals: "optimal")
//     < −30  high-risk fatigue (intervals.icu "High Risk"; Friel: overtraining territory)
//   Fitness trend (CTL slope/week): Friel & Couzens put a SAFE BUILD at ~5–8 CTL/week; anything
//     sustained ≥ +1/wk is genuinely rising, ≤ −1/wk genuinely falling. The ±1 dead-band is the
//     smallest whole-point move per week — below it the 42-day average is flat by construction.
//     (±1 is a rendering dead-band on an already-smoothed number, not a physiology claim.)

export type LoadFitnessTrend = 'building' | 'holding' | 'fading';
export type LoadFreshness = 'very_fresh' | 'fresh' | 'neutral' | 'working' | 'heavily_fatigued';

export interface LoadFloor {
  /** Current fitness (CTL) — 42-day weighted daily load, whole number. */
  ctl: number;
  /** Current form (TSB = CTL − ATL), whole number. */
  tsb: number;
  /** CTL slope rendered as a word; null when no prior point exists to trend against. */
  fitness_trend: LoadFitnessTrend | null;
  /** CTL change per week behind the trend word; null when no prior point. */
  ctl_delta_per_week: number | null;
  /** TSB band rendered as a word — always present when the floor is. */
  freshness: LoadFreshness;
  /** Age in days of the newest ride behind the load numbers — the floor counts EVERY ride, so its
   *  recency must not borrow the measurement signals' qualifying-rides-only stamp (which ignored a
   *  ride from yesterday while the load line counted it). Null when the caller didn't say. */
  newest_ride_age_days: number | null;
}

export interface LoadFloorInput {
  ctl: number | null | undefined;
  tsb: number | null | undefined;
  /** CTL from an earlier snapshot week (~4 weeks back preferred) for the trend read. */
  ctlPrior?: number | null;
  /** Days between the prior CTL's week and now — scales the delta to per-week. */
  daysBetween?: number | null;
  /** Age in days of the newest ride carrying the load numbers (pass-through to the floor). */
  newestRideAgeDays?: number | null;
}

const TREND_DEADBAND_PER_WEEK = 1.0;

export function freshnessFromTsb(tsb: number): LoadFreshness {
  if (tsb > 25) return 'very_fresh';
  if (tsb >= 5) return 'fresh';
  if (tsb >= -10) return 'neutral';
  if (tsb >= -30) return 'working';
  return 'heavily_fatigued';
}

/** Null when there is no current CTL/TSB — the floor only renders real numbers, never a guess. */
export function computeLoadFloor(inp: LoadFloorInput): LoadFloor | null {
  // == null before Number(): Number(null) is 0, which would render a fake floor of "fitness 0".
  const ctl = inp.ctl == null ? NaN : Number(inp.ctl);
  const tsb = inp.tsb == null ? NaN : Number(inp.tsb);
  if (!Number.isFinite(ctl) || !Number.isFinite(tsb)) return null;

  let trend: LoadFitnessTrend | null = null;
  let deltaPerWeek: number | null = null;
  const prior = inp.ctlPrior == null ? NaN : Number(inp.ctlPrior);
  const days = inp.daysBetween == null ? NaN : Number(inp.daysBetween);
  if (Number.isFinite(prior) && Number.isFinite(days) && days >= 7) {
    deltaPerWeek = Math.round(((ctl - prior) / days) * 7 * 10) / 10;
    trend = deltaPerWeek >= TREND_DEADBAND_PER_WEEK ? 'building'
      : deltaPerWeek <= -TREND_DEADBAND_PER_WEEK ? 'fading'
      : 'holding';
  }

  return {
    ctl: Math.round(ctl),
    tsb: Math.round(tsb),
    fitness_trend: trend,
    ctl_delta_per_week: deltaPerWeek,
    freshness: freshnessFromTsb(Math.round(tsb)),
    newest_ride_age_days: inp.newestRideAgeDays == null || !Number.isFinite(Number(inp.newestRideAgeDays))
      ? null : Math.max(0, Math.round(Number(inp.newestRideAgeDays))),
  };
}
