// generate-combined-plan/science.ts
//
// All training science constants.
// Sources: Friel "Triathlete's Training Bible" 5e, Fitzgerald & Warden "80/20 Triathlon",
// Seiler 2010, Hickson 1980, Couzens ramp rate tables.

import type { Phase, Sport, Intensity, Priority, RunObservedFitness, PerDisciplinePosture } from './types.ts';

// ── D-033 / Phase 1 — run pace reconciler (LOCKED parameters) ───────────────
//
// Per `docs/PHASE-1-RUN-PACE-SPEC.md`:
//   - Trailing window: 4 weeks (sample-count gate at 3 of 4).
//   - Divergence threshold: 4% sustained median (relative to baseline).
//   - Asymmetric ratchet: worsening triggers at 2 consecutive weeks; improving at 4.
//     2× safety-favored ratio.
//   - **Engagement requires BOTH** (Path B, after spec amendment 2026-05-22):
//       (1) consecutive-week streak above the per-direction threshold count, AND
//       (2) 4-week median outside the ±4% band (in the matching direction).
//     The streak alone is not sufficient — the median must confirm the signal
//     across the full window. This is the load-bearing anti-volatility check;
//     it prevents a 2-week noisy slow run (e.g. heat / new shoes / mild illness)
//     from displacing baseline when the trailing window shows no sustained shift.
//   - ACWR gate on worsening: independent third check. Even when streak+median
//     both fire, the worsening engagement is suppressed (`baseline_acwr_gated`)
//     if any week in the worsening window has acwr > 1.3, or both weeks are null.
//     The improving path has NO acwr gate (fitness gains under load are
//     unambiguous).
//   - Confidence gating: mirrors arc-context.ts:learnedThresholdPaceUsable
//     (`medium`/`high` + sample_count ≥ 2 to be usable; otherwise observed wins
//     when sufficient or baseline-default when both insufficient).
// All values locked at spec level. Specs do NOT relitigate; this helper is a pure
// implementation of the locked decision tree.

const RUN_PACE_DIVERGENCE_THRESHOLD = 0.04;            // ±4% sustained
const RUN_PACE_WORSENING_CONSECUTIVE_WEEKS = 2;        // safety-favored fast trigger
const RUN_PACE_IMPROVING_CONSECUTIVE_WEEKS = 4;        // slow trigger; protects against PR-week false positives
const RUN_PACE_ACWR_GATE_THRESHOLD = 1.3;              // sports-science convention; >1.3 = caution / overload
const RUN_PACE_MIN_SAMPLE_COUNT = 2;                   // baseline-side; mirrors learnedThresholdPaceUsable

/**
 * Resolution outcome from `resolveRunEasyPace`. Carries the chosen pace value
 * plus a structured `source` enum + free-form `reasoning` for debug logs.
 * Athlete-facing UI does NOT consume these fields; reasoning lives in plan
 * trade-off messages emitted separately (future enhancement).
 */
export type ResolvedRunEasyPace = {
  paceSecPerKm: number;
  source:
    | 'baseline'                  // baseline value held; observed within ±4% noise band or insufficient
    | 'reconciled_worse'          // observed median slower; 2-week worsening; ACWR ≤ 1.3 → reconciliation engaged
    | 'reconciled_better'         // observed median faster; 4-week improving streak → reconciliation engaged
    | 'observed_no_baseline'      // baseline unusable (low confidence / sample_count); observed is the only signal
    | 'baseline_acwr_gated';      // worsening signal suppressed because ACWR > 1.3 in worsening window (fatigue, not decline)
  reasoning: string;
};

function runPaceMedian(values: (number | null)[]): number | null {
  const nonNull = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (nonNull.length < 3) return null;
  const sorted = [...nonNull].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function baselineUsable(
  b: { value?: number; confidence?: string; sample_count?: number } | null | undefined,
): b is { value: number; confidence: string; sample_count: number } {
  if (!b || typeof b !== 'object') return false;
  const v = b.value;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return false;
  if (b.confidence === 'low') return false;
  const sc = typeof b.sample_count === 'number' ? Math.floor(b.sample_count) : 0;
  if (sc < RUN_PACE_MIN_SAMPLE_COUNT) return false;
  return true;
}

/**
 * D-033 / Phase 1 run pace reconciler. Decision tree per spec §4.3 + §4.3.1 + §4.4.
 * Pure function — no side effects, no DB access, no environment reads. Fully
 * unit-testable in isolation.
 *
 *   1. Both missing → null. Caller falls back to existing default behavior.
 *   2. Baseline usable, observed missing → 'baseline'.
 *   3. Baseline unusable, observed present + ≥3 weeks of data → 'observed_no_baseline'.
 *   4. Both present. Compute streaks (consecutive newest-first weeks outside
 *      the ±4% band in each direction) and median divergence.
 *   5. Worsening engagement requires BOTH (a) `consecutiveSlow ≥ 2` AND
 *      (b) `median > +4%` above baseline. If only one fires, baseline holds.
 *      When both fire, ACWR gate is consulted: every week in the worsening
 *      window must have acwr ≤ 1.3 (or partial-data tolerance: null in one
 *      week + other ≤ 1.3 permitted; null in BOTH blocks). Gate fails →
 *      'baseline_acwr_gated'. Gate passes → 'reconciled_worse'.
 *   6. Improving engagement requires BOTH (a) `consecutiveFast ≥ 4` AND
 *      (b) `median < -4%` below baseline. No ACWR gate. Both fire →
 *      'reconciled_better'. Otherwise baseline.
 *   7. Else → 'baseline' (safety-favored tie-break).
 *
 * **Anti-volatility (three independent layers):**
 *   - Streak gate: a single anomalous week cannot satisfy `consecutiveSlow ≥ 2`.
 *   - Median gate: a 2-week noisy slow streak whose remaining 2 weeks are at
 *     baseline produces an in-band 4-week median and is rejected. The full
 *     trailing window must confirm the shift before the plan is displaced.
 *   - ACWR gate: even when streak+median both fire on the worsening path, an
 *     elevated workload ratio attributes the slowdown to accumulated training
 *     load rather than fitness decline.
 * See `docs/PHASE-1-RUN-PACE-SPEC.md` §4.3 + §4.3.1 + §6.2 + §6.10 for full reasoning.
 */
export function resolveRunEasyPace(
  baseline: { value?: number; confidence?: string; sample_count?: number } | null,
  observed: RunObservedFitness | null,
): ResolvedRunEasyPace | null {
  const baselineOk = baselineUsable(baseline);
  const observedMedian = observed ? observed.median_easy_pace_sec_per_km : null;
  const observedHasMedian = observedMedian != null && Number.isFinite(observedMedian) && observedMedian > 0;

  // Case 1: both missing.
  if (!baselineOk && !observedHasMedian) return null;

  // Case 2: baseline usable, observed missing or insufficient.
  if (baselineOk && !observedHasMedian) {
    return {
      paceSecPerKm: baseline!.value!,
      source: 'baseline',
      reasoning: 'observed run easy pace insufficient; baseline held',
    };
  }

  // Case 3: baseline unusable, observed sufficient.
  if (!baselineOk && observedHasMedian) {
    return {
      paceSecPerKm: observedMedian!,
      source: 'observed_no_baseline',
      reasoning: 'baseline low-confidence or insufficient samples; observed wins',
    };
  }

  // Both present from here.
  const baselineVal = baseline!.value!;
  const median = observedMedian!;
  const divergence = (median - baselineVal) / baselineVal;

  const weekly = observed!.weekly_easy_paces_sec_per_km;
  const weeklyAcwr = observed!.weekly_acwr;

  // Count consecutive weeks (newest first) outside the band in the same direction.
  // For worsening: weekly[i] > baseline × (1 + threshold).
  // For improving: weekly[i] < baseline × (1 - threshold).
  const slowBound = baselineVal * (1 + RUN_PACE_DIVERGENCE_THRESHOLD);
  const fastBound = baselineVal * (1 - RUN_PACE_DIVERGENCE_THRESHOLD);

  let consecutiveSlow = 0;
  let consecutiveFast = 0;
  for (let i = 0; i < weekly.length; i++) {
    const v = weekly[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) break; // null breaks the streak
    if (v > slowBound) consecutiveSlow++;
    else break;
  }
  for (let i = 0; i < weekly.length; i++) {
    const v = weekly[i];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) break;
    if (v < fastBound) consecutiveFast++;
    else break;
  }

  // Path B (spec amendment 2026-05-22): engagement requires BOTH streak AND
  // median to cross. Streak alone is not sufficient; the 4-week median must
  // confirm the signal across the trailing window. This protects against a
  // 2-week noisy slow streak whose remaining 2 weeks at baseline yield an
  // in-band median — a scenario where the ACWR gate alone (at moderate ACWR)
  // would otherwise let the plan tighten on insufficient evidence. See
  // `docs/PHASE-1-RUN-PACE-SPEC.md` §4.3 + §6.10.

  const streakSlowMet = consecutiveSlow >= RUN_PACE_WORSENING_CONSECUTIVE_WEEKS;
  const streakFastMet = consecutiveFast >= RUN_PACE_IMPROVING_CONSECUTIVE_WEEKS;
  const medianAboveSlowBand = divergence > RUN_PACE_DIVERGENCE_THRESHOLD;
  const medianBelowFastBand = divergence < -RUN_PACE_DIVERGENCE_THRESHOLD;

  // Worsening — streak AND median both required, then ACWR gate.
  if (streakSlowMet && medianAboveSlowBand) {
    // ACWR gate: every week in the worsening window must have acwr ≤ 1.3.
    // Null in BOTH weeks → block (can't distinguish; conservative).
    // Null in ONE week + other ≤ 1.3 → permit (partial-data tolerance).
    const worseningWindow = weeklyAcwr.slice(0, RUN_PACE_WORSENING_CONSECUTIVE_WEEKS);
    const anyElevated = worseningWindow.some((a) => typeof a === 'number' && a > RUN_PACE_ACWR_GATE_THRESHOLD);
    const allNull = worseningWindow.every((a) => a == null);
    if (anyElevated || allNull) {
      return {
        paceSecPerKm: baselineVal,
        source: 'baseline_acwr_gated',
        reasoning: `worsening pace signal (streak=${consecutiveSlow}, median +${(divergence * 100).toFixed(1)}%) suppressed: ACWR ${worseningWindow.map((a) => a == null ? 'null' : a.toFixed(2)).join('/')} in window suggests accumulated fatigue, not fitness decline`,
      };
    }
    return {
      paceSecPerKm: median,
      source: 'reconciled_worse',
      reasoning: `${consecutiveSlow}wk consecutive worsening + median ${median.toFixed(0)} (+${(divergence * 100).toFixed(1)}% above baseline ${baselineVal.toFixed(0)}); both streak and median gates passed; ACWR ≤ ${RUN_PACE_ACWR_GATE_THRESHOLD}; plan tightens`,
    };
  }

  // Improving — streak AND median both required. No ACWR gate.
  if (streakFastMet && medianBelowFastBand) {
    return {
      paceSecPerKm: median,
      source: 'reconciled_better',
      reasoning: `${consecutiveFast}wk consecutive improving + median ${median.toFixed(0)} (${(divergence * 100).toFixed(1)}% below baseline ${baselineVal.toFixed(0)}); both streak and median gates passed; plan loosens`,
    };
  }

  // Insufficient signal — one or both gates failed. Safety-favored → baseline.
  // This includes:
  //   - Median in-band + any streak count (case 4 in original spec; the spec §6.10
  //     regression pin lives in this branch when streak alone met but median didn't).
  //   - Median outside band + streak below threshold (single-week anomaly OR
  //     mid-streak inception).
  return {
    paceSecPerKm: baselineVal,
    source: 'baseline',
    reasoning: `insufficient signal: streak slow=${consecutiveSlow} fast=${consecutiveFast}, median ${median.toFixed(0)} (${(divergence * 100).toFixed(1)}% vs baseline ${baselineVal.toFixed(0)}); requires BOTH ≥${RUN_PACE_WORSENING_CONSECUTIVE_WEEKS}wk slow streak AND median >+${(RUN_PACE_DIVERGENCE_THRESHOLD * 100).toFixed(0)}% (worsening), OR ≥${RUN_PACE_IMPROVING_CONSECUTIVE_WEEKS}wk fast streak AND median <-${(RUN_PACE_DIVERGENCE_THRESHOLD * 100).toFixed(0)}% (improving); baseline held`,
  };
}


// ── §1.1  TSS impact multipliers ────────────────────────────────────────────
// Normalize systemic recovery cost across sports.
// Swim lowest (non-weight-bearing), run highest (eccentric load).
export const SPORT_IMPACT_MULTIPLIER: Record<Sport, number> = {
  run:      1.3,
  bike:     1.0,
  swim:     0.8,
  strength: 1.0, // treated as bike-equivalent systemic stress
  race:     1.0, // multi-sport / tri event day (bike-like systemic cost)
};

// Strength TSS counts at 50% toward the weekly budget (§12.2 open question default)
export const STRENGTH_BUDGET_FRACTION = 0.5;

// ── §1.2  TSS budget ranges by phase ────────────────────────────────────────
// TSS is in RAW units (not weighted). Weighted total used only for ramp rate.
export const PHASE_TSS_RANGES: Record<Phase, { min: number; max: number }> = {
  base:          { min: 250, max: 450 },
  build:         { min: 400, max: 600 },
  race_specific: { min: 450, max: 700 },
  taper:         { min: 200, max: 400 },
  recovery:      { min: 80,  max: 200 },
  // Rebuild = post-race ramp back from recovery toward the next goal's training. Sits between
  // recovery (80-200) and build (400-600); approximates pre-race phase × 0.85.
  rebuild:       { min: 320, max: 500 },
  // Retest (D-213 Cut 1): non-race sharpen-into-test terminal — rested for the test, taper-ish load.
  // Not emitted by any producer until Cut 4; values tunable then.
  retest:        { min: 200, max: 400 },
};

// TSS/hour by sport × intensity class.
// Derived from TSS = hours × IF² × 100:
//   Z2 IF ≈ 0.72 → 52/hr,  Z3 IF ≈ 0.87 → 76/hr,  Z4 IF ≈ 1.0 → 100/hr
export const TSS_PER_HOUR: Record<Sport, Record<Intensity, number>> = {
  run:      { EASY: 55, MODERATE: 75, HARD: 100 },
  bike:     { EASY: 50, MODERATE: 70, HARD: 100 },
  swim:     { EASY: 35, MODERATE: 55, HARD:  75 },
  strength: { EASY: 40, MODERATE: 55, HARD:  75 },
  race:     { EASY: 50, MODERATE: 70, HARD: 100 },
};

export function estimateSessionTSS(
  sport: Sport,
  intensity: Intensity,
  durationMin: number,
): number {
  const rate = TSS_PER_HOUR[sport][intensity] / 60; // per minute
  const raw = durationMin * rate;
  const adjusted = sport === 'strength' ? raw * STRENGTH_BUDGET_FRACTION : raw;
  return Math.round(adjusted);
}

export function weightedTSS(sport: Sport, rawTSS: number): number {
  return rawTSS * SPORT_IMPACT_MULTIPLIER[sport];
}

// ── §1.2 (continued)  Scale weekly TSS budget from athlete CTL + hours ───────
// Called by week-builder and validator.
export function scaledWeeklyTSS(
  phase: Phase,
  currentCTL: number,
  weeklyHours: number,
  tssMultiplier: number,
): number {
  const { min, max } = PHASE_TSS_RANGES[phase];
  const ctlFactor  = Math.min(1.5, Math.max(0.5, currentCTL / 60));
  const hourFactor = Math.min(1.5, Math.max(0.5, weeklyHours / 10));
  const mid = (min + max) / 2;
  return Math.round(Math.max(min, Math.min(max, mid * ctlFactor * hourFactor)) * tssMultiplier);
}

// ── §1.3  CTL ramp rate thresholds ──────────────────────────────────────────
// Returns { low, moderate } CTL/week ceilings for the given current CTL.
export function rampThresholds(currentCTL: number): { low: number; moderate: number } {
  if (currentCTL <= 45)  return { low: 4, moderate: 6 };
  if (currentCTL <= 70)  return { low: 5, moderate: 7 };
  if (currentCTL <= 100) return { low: 6, moderate: 8 };
  return { low: 7, moderate: 10 };
}

// Weekly TSS required to increase CTL by N points in 7 days.
// CTL = 42-day EMA of daily TSS.  Alpha = 1 - exp(-1/42).
// CTL_new = CTL_old + alpha * (avg_daily_tss - CTL_old)
// Solving for avg_daily_tss: avg_daily = CTL_old + delta / alpha
const ALPHA_CTL = 1 - Math.exp(-1 / 42);
export function weeklyTSSForCTLRamp(currentCTL: number, targetWeeklyRamp: number): number {
  const dailyDelta = targetWeeklyRamp / 7;
  const requiredDailyTSS = currentCTL + dailyDelta / ALPHA_CTL;
  return Math.round(requiredDailyTSS * 7);
}

// Compute projected new CTL after a week with this total weighted TSS.
export function projectedCTL(currentCTL: number, weeklyWeightedTSS: number): number {
  const dailyTSS = weeklyWeightedTSS / 7;
  return currentCTL + ALPHA_CTL * (dailyTSS - currentCTL);
}

// ── §2.1  Sport distribution by triathlon distance ───────────────────────────
// Values are midpoints; limiter_sport shift applied separately.
export const TRI_SPORT_DIST: Record<string, Record<Sport, number>> = {
  sprint:  { swim: 0.22, bike: 0.38, run: 0.32, strength: 0.08, race: 0 },
  olympic: { swim: 0.22, bike: 0.42, run: 0.30, strength: 0.06, race: 0 },
  '70.3':  { swim: 0.18, bike: 0.50, run: 0.26, strength: 0.06, race: 0 },
  ironman: { swim: 0.13, bike: 0.55, run: 0.26, strength: 0.06, race: 0 },
};

/** Wire-format tri distances + aliases; used for long-ride ceiling vs expected bike leg duration. */
export type TriRaceDistance = 'sprint' | 'olympic' | '70.3' | 'ironman' | 'half' | 'full' | string;

/** Conservative expected bike leg duration (hours) when no per-athlete projection is wired. */
export function expectedBikeDurationHours(distance: TriRaceDistance): number {
  switch (distance) {
    case 'sprint': return 1.0;
    case 'olympic': return 1.5;
    case '70.3':
    case 'half': return 3.0;
    case 'ironman':
    case 'full': return 6.0;
    default: return 3.0;
  }
}

/** Brick run length (mi) from race run distance and phase; distance-first for off-bike work. */
export function brickRunTargetMiles(distance: TriRaceDistance, phase: string): number {
  const raceRunMiles: Record<string, number> = {
    sprint: 3.1,
    olympic: 6.2,
    '70.3': 13.1,
    half: 13.1,
    ironman: 26.2,
    full: 26.2,
    half_marathon: 13.1,
    marathon: 26.2,
  };
  const raceRun = raceRunMiles[distance] ?? 13.1;

  const p = String(phase || '').toLowerCase();
  const multiplier = (() => {
    switch (p) {
      case 'base': return 0.20;
      case 'build': return 0.30;
      case 'peak':
      case 'race_specific': return 0.42;
      case 'taper': return 0.22;
      default: return 0.20;
    }
  })();

  const raw = raceRun * multiplier;
  return Math.min(8, Math.max(1.5, Math.round(raw * 2) / 2));
}

/**
 * §8.3 (RACE-WEEK-PROTOCOL): distance-aware race-day session spec. Replaces the
 * prior event-name string match (`event_name.includes('santa cruz') ? 320 : 330`)
 * + 70.3-hardcoded description. Keyed on the normalized distance tokens emitted by
 * create-goal-and-materialize-plan `normalizeDistance` ('sprint'|'olympic'|'70.3'|
 * 'ironman'), plus the science.ts aliases ('half'→70.3, 'full'/'140.6'→ironman).
 * Unknown / missing → 70.3 (engine-wide default convention, matching
 * expectedBikeDurationHours / brickRunTargetMiles defaults).
 *
 * Phase 2 scope decision (2026-05-18): distance-table only. Athlete-projection
 * refinement is intentionally deferred — only `projected_bike_hours` reaches the
 * overlay today; full RaceProjection threading is a follow-up (RACE-WEEK §8.3).
 *
 * Default durations: 70.3 anchored to the prior hardcoded 330 for continuity;
 * sprint/olympic/ironman are mid-pack finish defaults (tunable constants).
 */
const RACE_DAY_TABLE: Record<
  'sprint' | 'olympic' | '70.3' | 'ironman',
  { swim_mi: number; bike_mi: number; run_mi: number; duration_min: number }
> = {
  sprint:  { swim_mi: 0.47, bike_mi: 12.4, run_mi: 3.1,  duration_min: 90 },
  olympic: { swim_mi: 0.93, bike_mi: 24.8, run_mi: 6.2,  duration_min: 165 },
  '70.3':  { swim_mi: 1.2,  bike_mi: 56,   run_mi: 13.1, duration_min: 330 },
  ironman: { swim_mi: 2.4,  bike_mi: 112,  run_mi: 26.2, duration_min: 760 },
};

export function raceDaySessionSpec(distance: TriRaceDistance): {
  duration_min: number;
  tss: number;
  description: string;
  legs: { swim_mi: number; bike_mi: number; run_mi: number };
} {
  const d = String(distance || '').toLowerCase().trim();
  const key: keyof typeof RACE_DAY_TABLE =
    d === 'sprint' ? 'sprint' :
    d === 'olympic' ? 'olympic' :
    (d === 'ironman' || d === 'full' || d === '140.6') ? 'ironman' :
    (d === '70.3' || d === 'half') ? '70.3' :
    '70.3'; // unknown / missing → 70.3 (engine-wide default convention)
  const row = RACE_DAY_TABLE[key];
  const tss = Math.round(estimateSessionTSS('race', 'MODERATE', row.duration_min) * 0.9);
  const description =
    `Race day. Swim ${row.swim_mi}mi → Bike ${row.bike_mi}mi → Run ${row.run_mi}mi. ` +
    `No add-on training; execute pacing and fueling.`;
  return {
    duration_min: row.duration_min,
    tss,
    description,
    legs: { swim_mi: row.swim_mi, bike_mi: row.bike_mi, run_mi: row.run_mi },
  };
}

/**
 * RUN-PROTOCOL §4.5 ramp endpoints (LOCKED 2026-05-20). Long-run within-phase
 * ramp: `miles = lerp(START × peak, PEAK × peak, phaseProgress(weekInPhase, rampWeeks))`.
 * START/PEAK multipliers from RUN-PROTOCOL.md §4.5; only base/build/race_specific
 * have within-phase ramps. Rebuild/Taper/Recovery delegate to `longRunFloorMiles`
 * (peak-of-phase semantics — those phases are short windows / capped externally).
 */
const LONG_RUN_RAMP_ENDPOINTS: Record<'base' | 'build' | 'race_specific', { start: number; peak: number }> = {
  base:          { start: 0.65, peak: 0.75 },
  build:         { start: 0.75, peak: 0.85 },
  race_specific: { start: 0.85, peak: 1.00 },
};

/**
 * Brick-run within-phase ramp endpoints per RUN-PROTOCOL §4.3 / §5.7. Same lerp
 * pattern as long run, applied to `raceRunDistance × multiplier`.
 */
const BRICK_RUN_RAMP_ENDPOINTS: Record<'base' | 'build' | 'race_specific', { start: number; peak: number }> = {
  base:          { start: 0.15, peak: 0.20 },
  build:         { start: 0.25, peak: 0.30 },
  race_specific: { start: 0.36, peak: 0.42 },
};

/** RUN-PROTOCOL §4 ramp-window length per phase (weeks). Matches swim arc constants. */
export function rampWeeksForPhase(phase: Phase | string): number {
  const p = String(phase ?? '').toLowerCase();
  if (p === 'base') return 6;
  return 4; // build / race_specific / others
}

/** 1-based week index → [0,1] progress within phase ramp. Mirrors `_shared/swim-program-templates.ts:phaseProgress`. */
function runPhaseProgress(weekInPhase: number, rampWeeks: number): number {
  const w = Math.max(1, Math.round(weekInPhase));
  if (rampWeeks <= 1) return 1;
  const t = (w - 1) / (rampWeeks - 1);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Half-mile precision rounding (matches existing `longRunFloorMiles` / `brickRunTargetMiles` style). */
function roundHalfMile(mi: number): number {
  return Math.round(mi * 2) / 2;
}

/** Distance-keyed long-run peak target (mi). 70.3 = 13mi per RUN-PROTOCOL §4.5 LOCKED 2026-05-20 (lifted from 11 in Phase 3). */
function longRunPeakTarget(distance: TriRaceDistance): number {
  const peakTarget: Record<string, number> = {
    sprint: 4.0,
    olympic: 7.0,
    '70.3': 13.0,
    half: 13.0,
    ironman: 18.0,
    full: 18.0,
    half_marathon: 13.0,
    marathon: 18.0,
  };
  return peakTarget[distance] ?? 13.0;
}

/** Race-run distance (mi) used by brick-run ramp and brick floor math. */
function raceRunDistanceMiles(distance: TriRaceDistance): number {
  const raceRunMiles: Record<string, number> = {
    sprint: 3.1,
    olympic: 6.2,
    '70.3': 13.1,
    half: 13.1,
    ironman: 26.2,
    full: 26.2,
    half_marathon: 13.1,
    marathon: 26.2,
  };
  return raceRunMiles[distance] ?? 13.1;
}

/**
 * Long-run within-phase RAMP (RUN-PROTOCOL §4.5). For base/build/race_specific
 * phases, lerps from `START × peak` to `PEAK × peak` across `rampWeeks`.
 * Other phases delegate to `longRunFloorMiles` (peak-of-phase semantics).
 *
 * `weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` — the
 * recovery-non-resetting in-phase index. NEVER `weekInBlock` (always 1 per ADR 0002).
 *
 * **Rebuild-mode throttle (D-031, amends D-026 2026-05-22):** when `loadThrottle < 1.0`,
 * the lerp output is multiplied by the throttle factor and floored at the peak-of-base
 * value for the distance. This lets `tightenPhaseBlocksForFloorRebuild` shrink the
 * canonical lerp alongside the rest of the budget — the D-026 "lerp is canonical, not
 * budget-anchored" contract holds for normal generation (default `loadThrottle = 1.0`),
 * but rebuild mode is the explicit exception where every load source throttles together
 * (was the failure mode behind the Week 9→10 spike that couldn't converge). Floor source
 * is `longRunFloorMiles(distance, 'base')` — distance-aware peak-of-base = the smallest
 * "real" long run the spec ratifies for each race distance (e.g. 70.3 → 10mi, full IM →
 * 13.5mi, Olympic → 5.25mi → roundHalfMile 5.0mi, Sprint → 3.0mi). A throttled plan
 * still ships with a defensible durability anchor.
 */
export function longRunMilesForWeek(
  distance: TriRaceDistance,
  phase: Phase,
  weekInPhase: number,
  rampWeeks: number,
  loadThrottle: number = 1.0,
): number {
  const phaseKey = String(phase ?? '').toLowerCase() as 'base' | 'build' | 'race_specific';
  const endpoints = LONG_RUN_RAMP_ENDPOINTS[phaseKey];
  if (!endpoints) return longRunFloorMiles(distance, phase);
  const peak = longRunPeakTarget(distance);
  const start = peak * endpoints.start;
  const target = peak * endpoints.peak;
  const t = runPhaseProgress(weekInPhase, rampWeeks);
  const lerped = lerp(start, target, t);
  if (loadThrottle >= 1.0) return roundHalfMile(lerped);
  const floor = longRunFloorMiles(distance, 'base');
  return Math.max(floor, roundHalfMile(lerped * loadThrottle));
}

/**
 * Brick-run within-phase RAMP (RUN-PROTOCOL §4.3 / §5.7). Same lerp pattern as
 * `longRunMilesForWeek`. Other phases delegate to `brickRunTargetMiles`.
 *
 * **Rebuild-mode throttle (D-031, amends D-026 2026-05-22):** mirror of the long-run
 * throttle. Floor source is `brickRunTargetMiles(distance, 'base')` — distance-aware
 * peak-of-base (e.g. 70.3 → 2.5mi, full IM → 5.0mi, Sprint/Olympic → 1.5mi via the
 * existing clamp floor inside `brickRunTargetMiles`).
 */
export function brickRunMilesForWeek(
  distance: TriRaceDistance,
  phase: Phase | string,
  weekInPhase: number,
  rampWeeks: number,
  loadThrottle: number = 1.0,
): number {
  const phaseKey = String(phase ?? '').toLowerCase() as 'base' | 'build' | 'race_specific';
  const endpoints = BRICK_RUN_RAMP_ENDPOINTS[phaseKey];
  if (!endpoints) return brickRunTargetMiles(distance, phase as string);
  const raceRun = raceRunDistanceMiles(distance);
  const start = raceRun * endpoints.start;
  const target = raceRun * endpoints.peak;
  const t = runPhaseProgress(weekInPhase, rampWeeks);
  const raw = lerp(start, target, t);
  if (loadThrottle >= 1.0) return Math.min(8, Math.max(1.5, roundHalfMile(raw)));
  const floor = brickRunTargetMiles(distance, 'base');
  return Math.min(8, Math.max(floor, roundHalfMile(raw * loadThrottle)));
}

/**
 * Race-pace miles peak per RUN-PROTOCOL §4.3. The race-pace run ramps from 3mi
 * to this peak across race-specific weeks (`clamp(3, peak, 3 + (weekInPhase − 1))`).
 */
export function racePacePeakMiles(distance: TriRaceDistance): number {
  const d = String(distance ?? '').toLowerCase();
  if (d === 'sprint') return 3;
  if (d === 'olympic') return 5;
  if (d === 'ironman' || d === 'full' || d === '140.6' || d === 'marathon') return 8;
  return 6; // 70.3 / half / default
}

/** Minimum long-run mileage by race distance and calendar phase (after TSS-derived miles). */
export function longRunFloorMiles(distance: TriRaceDistance, phase: Phase): number {
  // Phase 3 lift (2026-05-21 per RUN-PROTOCOL §4.5 LOCKED 2026-05-20): 70.3 11 → 13.
  // Must move in lockstep with `longRunPeakTarget` above — Phase 1 deliberately
  // preserved the legacy values, Phase 3 lifts both together.
  const peakTarget: Record<string, number> = {
    sprint: 4.0,
    olympic: 7.0,
    '70.3': 13.0,
    half: 13.0,
    ironman: 18.0,
    full: 18.0,
    half_marathon: 13.0,
    marathon: 18.0,
  };
  const peak = peakTarget[distance] ?? 13.0;

  const multiplier = (() => {
    switch (phase) {
      case 'base': return 0.75;
      case 'build': return 0.85;
      case 'race_specific': return 1.00;
      // Rebuild = post-race ramp back; reads as pre-race build × ~1.0 to avoid resetting to base
      // floor right after the athlete just held a long-run progression. 0.85 matches build floor.
      case 'rebuild': return 0.85;
      // Taper long-run floor: keep pre–A-race Sunday run conservative (e.g. 70.3 ≈ 5 mi, not 6+).
      case 'taper': return 0.45;
      case 'recovery': return 0.40;
      default: return 0.75;
    }
  })();

  return Math.round(peak * multiplier * 2) / 2;
}

/**
 * Minimum long-ride hours by race distance and calendar phase. Mirror of {@link longRunFloorMiles}
 * for the cycling side; consumed by `validate-training-floors.ts#evaluateLongDayVolumeFloors` as a
 * **soft** trade-off (logged + surfaced in `week_trade_offs`, never blocks the build) and by
 * `enforceLongDayFloors` (hard — survives the rebuild loop's TSS compression).
 *
 * Peak target reuses {@link expectedBikeDurationHours} so a 70.3 in race-specific lands at 3.0h
 * (3.0h × 1.00) and a full at 6.0h (6.0h × 1.00). Taper / recovery return 0 — those phases are
 * skipped by the validator so the value is moot, but 0 makes the "no floor here" semantics explicit.
 */
export function longRideFloorHours(distance: TriRaceDistance, phase: Phase): number {
  const peak = expectedBikeDurationHours(distance);
  const multiplier = (() => {
    switch (phase) {
      case 'base': return 0.75;
      case 'build': return 0.85;
      case 'race_specific': return 1.00;
      // Rebuild mirrors build for the long-ride floor — keep the bike-leg ramp continuous past
      // a B-race instead of dropping to 0 (taper/recovery sentinel).
      case 'rebuild': return 0.85;
      case 'taper': return 0;
      case 'recovery': return 0;
      default: return 0;
    }
  })();
  return Math.round(peak * multiplier * 4) / 4;
}

/**
 * CYCLING-PROTOCOL §4.5 ramp endpoints (LOCKED 2026-05-21). Long-ride within-phase
 * ramp: `hours = lerp(START × peak, PEAK × peak, phaseProgress(weekInPhase, rampWeeks))`.
 * START/PEAK multipliers from CYCLING-PROTOCOL.md §4.5; only base/build/race_specific
 * have within-phase ramps. Rebuild/Taper/Recovery delegate to `longRideFloorHours`
 * (peak-of-phase semantics — those phases are short windows / capped externally).
 * Mirror of the run-side {@link LONG_RUN_RAMP_ENDPOINTS}.
 */
const LONG_RIDE_RAMP_ENDPOINTS: Record<'base' | 'build' | 'race_specific', { start: number; peak: number }> = {
  base:          { start: 0.65, peak: 0.75 },
  build:         { start: 0.75, peak: 0.85 },
  race_specific: { start: 0.85, peak: 1.00 },
};

/**
 * Long-ride within-phase RAMP (CYCLING-PROTOCOL §4.5). For base/build/race_specific
 * phases, lerps from `START × peak` to `PEAK × peak` across `rampWeeks`. Peak target
 * reuses {@link expectedBikeDurationHours} so a 70.3 in race-specific lands at 3.0h.
 * Other phases delegate to {@link longRideFloorHours} (peak-of-phase semantics).
 *
 * `weekInPhase` MUST be `weekInPhaseForTimeline(phaseBlocks, weekNum, block)` — the
 * recovery-non-resetting in-phase index. NEVER `weekInBlock` (always 1 per ADR 0002).
 *
 * Mirror of {@link longRunMilesForWeek}; rounded to 0.25hr precision to match
 * `longRideFloorHours` and the `longRide()` session-factory token granularity.
 */
export function longRideHoursForWeek(
  distance: TriRaceDistance,
  phase: Phase,
  weekInPhase: number,
  rampWeeks: number,
  loadThrottle: number = 1.0,
): number {
  const phaseKey = String(phase ?? '').toLowerCase() as 'base' | 'build' | 'race_specific';
  const endpoints = LONG_RIDE_RAMP_ENDPOINTS[phaseKey];
  if (!endpoints) return longRideFloorHours(distance, phase);
  const peak = expectedBikeDurationHours(distance);
  const start = peak * endpoints.start;
  const target = peak * endpoints.peak;
  const t = runPhaseProgress(weekInPhase, rampWeeks);
  const lerped = lerp(start, target, t);
  if (loadThrottle >= 1.0) return Math.round(lerped * 4) / 4;
  // D-031: rebuild-mode throttle. Floor source is `longRideFloorHours(distance, 'base')` —
  // distance-aware peak-of-base = the smallest "real" long ride per race distance
  // (70.3 → 2.25h, full IM → 4.5h, Olympic → 1.125h → 0.25-round 1.25h, Sprint → 0.75h).
  const floor = longRideFloorHours(distance, 'base');
  return Math.max(floor, Math.round(lerped * loadThrottle * 4) / 4);
}

// For a run-only event, all non-strength budget goes to run.
export const RUN_SPORT_DIST: Record<string, Record<Sport, number>> = {
  marathon:      { run: 0.82, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
  half_marathon: { run: 0.84, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
  '10k':         { run: 0.86, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
  '5k':          { run: 0.86, bike: 0.00, swim: 0.00, strength: 0.10, race: 0 },
};

// Blended distribution for multi-sport weeks (tri + run event concurrent).
// The tri distribution IS the combined plan distribution since it already
// includes run. Limiter shift and swim_intent shift applied on top.
//
// swim_intent focus shift (tri only): swim +0.06, funded from bike/run per swim_load_source:
//   split        → bike -0.04, run -0.02  (default 2:1 ratio)
//   protect_run  → bike -0.06, run unchanged
//   protect_bike → run -0.06,  bike unchanged
const SWIM_FOCUS_SHIFTS: Record<
  'split' | 'protect_run' | 'protect_bike',
  Partial<Record<'swim' | 'bike' | 'run', number>>
> = {
  split:        { swim: +0.06, bike: -0.04, run: -0.02 },
  protect_run:  { swim: +0.06, bike: -0.06, run:  0    },
  protect_bike: { swim: +0.06, bike:  0,    run: -0.06 },
};

// D-210 Cut 2: per-discipline posture collapses to all-develop at the whole-athlete terminals
// (taper/recovery/rebuild/retest, §3). Absent posture OR a terminal phase → {} (≡ all-develop, no
// override). Pure + exported for unit tests; Cuts 3-4 act on the returned (collapsed) posture.
const POSTURE_TERMINAL_PHASES = new Set<Phase>(['taper', 'recovery', 'rebuild', 'retest']);
export function effectiveDisciplinePosture(
  posture: PerDisciplinePosture | undefined,
  phase: Phase | undefined,
): PerDisciplinePosture {
  if (!posture || (phase != null && POSTURE_TERMINAL_PHASES.has(phase))) return {};
  return posture;
}

export function getBaseDistribution(
  primaryGoalSport: string,
  primaryDistance: string,
  limiterSport?: Sport,
  swimIntent?: 'focus' | 'race' | null,
  swimLoadSource?: 'split' | 'protect_run' | 'protect_bike' | null,
  // D-210 Cut 1: the per-block phase. Threaded so callers recompute per block, but UNUSED here — the
  // distribution is still phase-blind. Cuts 2-4 make it phase/posture-aware (the maintain/out behavior).
  phase?: Phase,
  // D-210 Cut 2: per-discipline posture (develop/maintain/out), collapsed to all-develop at terminals.
  posture?: PerDisciplinePosture,
): Record<Sport, number> {
  void phase; // intentionally unused in Cut 1 (the seam)
  // D-210 Cut 2: substrate only — compute the collapsed posture but apply NO shift yet. With the default
  // (absent posture ≡ all-develop) this is a no-op → byte-identical. Cut 3 = maintain floor, Cut 4 = out.
  const effPosture = effectiveDisciplinePosture(posture, phase);
  void effPosture;
  let dist: Record<Sport, number>;

  const isTri = ['triathlon', 'tri'].includes(primaryGoalSport.toLowerCase());
  if (isTri) {
    dist = { ...(TRI_SPORT_DIST[primaryDistance] ?? TRI_SPORT_DIST['70.3']) };
  } else {
    dist = { ...(RUN_SPORT_DIST[primaryDistance] ?? RUN_SPORT_DIST['marathon']) };
  }

  // §swim_intent focus shift (tri only): fund the third swim slot from bike/run budget.
  if (isTri && swimIntent === 'focus') {
    const source = swimLoadSource ?? 'split';
    const shift = SWIM_FOCUS_SHIFTS[source] ?? SWIM_FOCUS_SHIFTS.split;
    for (const [sport, delta] of Object.entries(shift) as [Sport, number][]) {
      dist[sport] = Math.max(0, (dist[sport] ?? 0) + delta);
    }
  }

  // §2.1 limiter shift: increase limiter sport by 7%, reduce others proportionally.
  // Applied after swim_intent shift so both compose correctly.
  if (limiterSport && limiterSport in dist) {
    const shift = 0.07;
    const current = dist[limiterSport] ?? 0;
    const newVal = Math.min(0.65, current + shift);
    const delta = newVal - current;
    dist[limiterSport] = newVal;
    const others = (Object.keys(dist) as Sport[]).filter(s => s !== limiterSport);
    others.forEach(s => { dist[s] = Math.max(0, (dist[s] ?? 0) - delta / others.length); });
  }

  return dist;
}

// §2.2  Maintenance volume floors (min sessions/week in non-recovery weeks)
export const MAINTENANCE_FLOORS: Partial<Record<Sport, { sessions: number; pct: number }>> = {
  swim:     { sessions: 1, pct: 0.08 },
  bike:     { sessions: 1, pct: 0.12 },
  run:      { sessions: 2, pct: 0.15 },
  strength: { sessions: 1, pct: 0.03 },
};

// ── §3.3  Zone distribution by phase ────────────────────────────────────────
// Fraction of total training time at each zone band.
export const PHASE_ZONE_DIST: Record<Phase, { low: number; tempo: number; high: number }> = {
  base:          { low: 0.87, tempo: 0.08, high: 0.05 },
  build:         { low: 0.80, tempo: 0.10, high: 0.10 },
  race_specific: { low: 0.77, tempo: 0.13, high: 0.10 },
  taper:         { low: 0.83, tempo: 0.07, high: 0.10 },
  recovery:      { low: 0.95, tempo: 0.05, high: 0.00 },
  // Rebuild = ramp-back from recovery; mostly aerobic with a small tempo touch to re-introduce
  // intensity safely. Closer to base than build (no VO2/threshold yet).
  rebuild:       { low: 0.88, tempo: 0.08, high: 0.04 },
  // Retest (D-213 Cut 1): race_specific-ish mix — keep some sharpness for the test effort.
  retest:        { low: 0.77, tempo: 0.13, high: 0.10 },
};

// ── §5.2  Brick frequency by phase ──────────────────────────────────────────
export const BRICKS_PER_WEEK: Record<Phase, number> = {
  base:          0,
  build:         1,
  race_specific: 2,
  taper:         1,
  recovery:      0,
  // Rebuild = rebuild each sport individually before stacking concurrent stimulus again.
  // Bricks (combined bike+run) interfere with the rebuild semantics AND — because bricks are
  // excluded from the standalone long-ride floor in validate-training-floors — a brick week
  // can leave a 1.8h bike leg in place when the rebuild long-ride floor expects 2.5h (70.3).
  // Forcing 0 bricks in rebuild guarantees a standalone long_ride session that
  // enforceLongDayFloors then lifts to the rebuild floor (peak × 0.85).
  rebuild:       0,
  // Retest (D-213 Cut 1): a test week, not a brick week.
  retest:        0,
};

// ── §6.1  Taper duration in weeks (distance × priority) ─────────────────────
const TAPER_WEEKS_BY_PRIORITY: Record<Priority, Record<string, number>> = {
  A: {
    sprint: 1,
    olympic: 1,
    '70.3': 2,
    half: 2,
    ironman: 3,
    full: 3,
    marathon: 3,
    half_marathon: 2,
    '10k': 1,
    '5k': 1,
  },
  B: {
    sprint: 1,
    olympic: 1,
    '70.3': 1,
    half: 1,
    ironman: 2,
    full: 2,
    marathon: 2,
    half_marathon: 1,
    '10k': 1,
    '5k': 1,
  },
  C: {
    sprint: 1,
    olympic: 1,
    '70.3': 1,
    half: 1,
    ironman: 1,
    full: 1,
    marathon: 1,
    half_marathon: 1,
    '10k': 1,
    '5k': 1,
  },
};

/** Taper length in weeks: B/C races get shorter tapers than A; 70.3 A uses 2w (not 3). */
export function taperWeeks(distance: string, priority: Priority | string): number {
  const d0 = String(distance || '').toLowerCase();
  const key = d0 === 'half_marathon' ? 'half' : d0;
  const pri = String(priority || 'A').toUpperCase();
  const tier = (pri === 'B' || pri === 'C' ? pri : 'A') as Priority;
  const byDist = TAPER_WEEKS_BY_PRIORITY[tier] ?? TAPER_WEEKS_BY_PRIORITY.A;
  if (typeof byDist[key] === 'number') return byDist[key];
  return 2;
}

// §6.4  Post-race mandatory recovery in days (distance × priority of the race that just finished)
const RECOVERY_DAYS_BY_PRIORITY: Record<Priority, Record<string, number>> = {
  A: {
    sprint: 5,
    olympic: 7,
    '70.3': 14,
    half: 14,
    ironman: 21,
    full: 21,
    marathon: 21,
    half_marathon: 14,
    '10k': 7,
    '5k': 5,
  },
  B: {
    sprint: 3,
    olympic: 5,
    '70.3': 7,
    half: 7,
    ironman: 14,
    full: 14,
    marathon: 14,
    half_marathon: 7,
    '10k': 5,
    '5k': 3,
  },
  C: {
    sprint: 3,
    olympic: 4,
    '70.3': 5,
    half: 5,
    ironman: 7,
    full: 7,
    marathon: 7,
    half_marathon: 5,
    '10k': 4,
    '5k': 3,
  },
};

/** Calendar days of easy-only / reduced load after a race; scales with priority (B/C shorter than A). */
export function recoveryDaysPostRace(distance: string, priority: Priority | string): number {
  const d0 = String(distance || '').toLowerCase();
  const key = d0 === 'half_marathon' ? 'half' : d0;
  const pri = String(priority || 'A').toUpperCase();
  const tier = (pri === 'B' || pri === 'C' ? pri : 'A') as Priority;
  const byDist = RECOVERY_DAYS_BY_PRIORITY[tier] ?? RECOVERY_DAYS_BY_PRIORITY.A;
  if (typeof byDist[key] === 'number') return byDist[key];
  return 7;
}

/** Whole weeks allocated to recovery block (min 1). */
export function recoveryWeeksPostRace(distance: string, priority: Priority | string): number {
  return Math.max(1, Math.ceil(recoveryDaysPostRace(distance, priority) / 7));
}

// ── §7.2  Mesocycle loading pattern ─────────────────────────────────────────
// Returns the TSS multiplier for week-within-block (1-indexed).
//
// D-061 / Item 1 — added '1:1' pattern to support `training_intent: 'first_race'`
// (every-2nd-week recovery — 1 build + 1 recovery). Recovery week ratio of 0.65
// matches the existing 3:1 / 2:1 recovery-week multiplier (consistent deload depth).
export function blockWeekMultiplier(weekInBlock: number, pattern: '3:1' | '2:1' | '1:1'): number {
  if (pattern === '3:1') {
    return [1.00, 1.08, 1.15, 0.65][weekInBlock - 1] ?? 1.00;
  }
  if (pattern === '2:1') {
    return [1.00, 1.10, 0.65][weekInBlock - 1] ?? 1.00;
  }
  // '1:1': build week, recovery week, build week, recovery week, ...
  return [1.00, 0.65][weekInBlock - 1] ?? 1.00;
}

// ── §4.2  Session intensity classification  ──────────────────────────────────
// Maps zone targets to intensity class.
export function classifyIntensity(zoneTargets: string): Intensity {
  const z = zoneTargets.toLowerCase();
  if (/z4|z5|vo2|threshold|intervals|tempo\s*(>|longer)/.test(z)) return 'HARD';
  if (/z3|tempo|moderate|sweet.?spot/.test(z)) return 'MODERATE';
  return 'EASY';
}

// ── §4.3  Sequencing constraint check ───────────────────────────────────────
// Returns true if placing `next` intensity on the day after `prev` is allowed.
export function hardEasyOk(prev: Intensity, next: Intensity): boolean {
  if (prev === 'HARD' && next === 'HARD') return false;
  return true;
}

// Days of the week ordered Mon-Sun (index 0-6)
export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

export const DAY_INDEX: Record<string, number> = Object.fromEntries(
  DAYS_OF_WEEK.map((d, i) => [d, i])
);
