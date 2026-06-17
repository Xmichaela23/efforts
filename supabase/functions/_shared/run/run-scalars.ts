// Run scalar resolver — the ONE public entry + the ONE guard home for a run's per-workout pace + HR.
//
// Invariant (continuity audit 2026-06-16, D-185): every surface that shows a run's pace/HR — the
// Performance card (session-detail/build.ts), the narrative (analyze-running-workout via the fact
// packet), compute-facts, and the Details metrics (workout-detail) — reads the SAME computed value
// from here, instead of each re-deriving its own. Before this, the narrative used the robust, guarded
// `resolveOverallPaceSecPerMi` (unit-corruption + plausibility reconciliation) while the card read the
// RAW `computed.overall.avg_pace_s_per_mi` and compute-facts used a third, simpler derivation — the
// swim-D-182 latent fracture for run. Mirrors swim's resolveSwimScalars and ride's rideComputedNp.
//
// SINGLE GUARD HOME: rather than reimplement a third pace algorithm (which would re-introduce the
// drift), this DELEGATES to the established, narrative-trusted primitives in `../fact-packet/`:
//   - pace: `resolveOverallPaceSecPerMi` — reconciles stored avg_pace vs distance+duration, rejects
//           unit-corruption (the avg-pace plausibility + duration-unit guards live there).
//   - HR:   `getOverallAvgHr` — first POSITIVE of overall.avg_hr / overall.avg_heart_rate / raw
//           avg_heart_rate; a literal 0 (no strap / treadmill) is MISSING, never propagated (Q-054/
//           D-112 zero-not-null class — so a 0 HR can never poison a downstream GAP/decoupling calc).
// AUTHORITATIVE LAYER = `computed.overall` (GPS-sample-derived) per D-182's standing decision that
// non-swims keep computed.overall; raw columns are the fallback inside those primitives.
//
// Honest-blank discipline (same as the state spine): a missing/zero input yields null — never 0,
// never a garbage pace, never a fabricated GAP.

import {
  resolveOverallPaceSecPerMi,
  resolveOverallDistanceMi,
  resolveMovingDurationMinutes,
} from '../fact-packet/pace-resolution.ts';
import { getOverallAvgHr } from '../fact-packet/queries.ts';

const KM_PER_MI = 0.621371;

export interface RunScalars {
  /** Authoritative avg pace, sec per mile (guarded/reconciled). null when unknown (never 0). */
  paceSecPerMi: number | null;
  /** Same pace expressed sec per km — derived from paceSecPerMi, NOT an independent computation. */
  paceSecPerKm: number | null;
  /** Avg HR, bpm. null when missing/zero (a 0 is MISSING, never propagated — Q-054/D-112). */
  avgHr: number | null;
  distanceMeters: number | null;
  movingSeconds: number | null;
}

const pos = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Resolve a run's authoritative per-workout pace + HR. The ONE call every surface makes; guards live
 * in the delegated `../fact-packet/` primitives so they apply uniformly to card, narrative and facts.
 */
export function resolveRunScalars(workout: any): RunScalars {
  const paceSecPerMi = resolveOverallPaceSecPerMi(workout); // guarded/reconciled; null when implausible
  const paceSecPerKm = paceSecPerMi != null ? Math.round(paceSecPerMi * KM_PER_MI) : null;
  const avgHr = getOverallAvgHr(workout); // already first-positive guarded (0 → null)

  const distMi = resolveOverallDistanceMi(workout);
  const distanceMeters = distMi > 0 ? Math.round(distMi * 1609.34) : null;
  const durMin = resolveMovingDurationMinutes(workout);
  const movingSeconds = durMin != null && durMin > 0 ? Math.round(durMin * 60) : null;

  return { paceSecPerMi, paceSecPerKm, avgHr, distanceMeters, movingSeconds };
}

/**
 * Read-through accessor for the run's overall GAP (sec/mi). GAP is sample-derived — only the analyzer
 * computes it — so this NEVER recomputes; it reads the analyzer's persisted scalar and returns an
 * HONEST null when none exists yet (overall-GAP persistence is a filed fast-follow, D-185). Do NOT
 * fabricate GAP from total elevation here — that approximation is the CompletedTab bug the audit flagged.
 */
export function resolveRunGap(workout: any): number | null {
  const wa = workout?.workout_analysis ?? {};
  return pos(wa?.overall?.avg_gap_s_per_mi)
    ?? pos(wa?.derived?.avg_gap_s_per_mi)
    ?? pos(workout?.computed?.overall?.avg_gap_s_per_mi)
    ?? pos(workout?.computed?.overall?.gap_pace_s_per_mi)
    ?? null;
}

/**
 * Read-through accessor for the run's decoupling (already single-sourced by the HR analyzer into
 * workout_analysis.heart_rate_summary, D-036). Provided so "one place reads run's signals" holds;
 * value-preserving — reads the same field the card already does. Honest nulls (no 0-from-missing).
 */
export function resolveRunDecoupling(workout: any): { pct: number | null; basis: string | null; assessment: string | null } {
  const hrs = workout?.workout_analysis?.heart_rate_summary ?? {};
  const pctRaw = Number(hrs?.decouplingPct);
  return {
    pct: Number.isFinite(pctRaw) ? pctRaw : null, // decoupling can be small/negative → only null when truly absent
    basis: typeof hrs?.decouplingBasis === 'string' ? hrs.decouplingBasis : null,
    assessment: typeof hrs?.decouplingAssessment === 'string' ? hrs.decouplingAssessment : null,
  };
}
