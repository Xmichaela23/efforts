// =============================================================================
// session-frequency-defaults — derive per-discipline session counts from hours
// =============================================================================
// Canonical source of truth (consolidated 2026-05-11). Previously mirrored at
// `supabase/functions/_shared/session-frequency-defaults.ts`; the deno edge
// functions now import this file directly via `../../../src/lib/...` (same
// pattern as `src/lib/plan-tokens/swim-drill-tokens.ts`).
//
// Implements docs/SESSION-FREQUENCY-DEFAULTS.md §2 (hours_tier × days_per_week)
// matrix + §4 limiter shifts + §5 swim-intent floor + §7 strength integration.
// Out of scope here:
//   - §3 distance scaling (caller adjusts if needed)
//   - §8 recent training history ceiling (requires `workouts` data)
//   - §10 group ride / group run anchor modifications (orthogonal — handled
//     by anchor placement logic, doesn't change frequency)
//
// MATRIX (2026-05-11 — empirical synthesis of Triathlete.com 20-week,
// Mottiv 18-week, MyProCoach Intermediate; sources documented per cell):
//
//                  5 days        6 days         7 days
//   5-7 hr        2/2/2/1/0     2/2/3/1/0      2/2/3/1/0
//   8-10 hr       2/2/3/1/1     2/2/3/1/1      2/3/3/1/1 *
//   10-12 hr      2/3/3/1/1     3/3/3/1/1 *    3/3/3/1/1
//   12-14 hr      3/3/3/1/1     3/3/3/1/1      3/3/3/1/1
//   14+ hr        GATE-BLOCK    3/3/4/1/2      3/3/4/1/2
//
// Format: swim/bike/run/strength/brick (typical mid-build). For cells with a
// range in the empirical source (e.g. "2-3 bikes" or "3-4 runs"), the lower
// value is the BASELINE — §4 limiter shifts modulate upward. Strength stays
// decoupled (athlete intent drives it via §7, not endurance volume).
//
// * Cells where the source range was "2-3 bikes" or "3-4 runs" — chose the
//   higher value (3) because at this volume athletes typically train every
//   pillar 3×/wk by default. Limiter shifts can override.
//
// GATE-BLOCK: 14+ hr / 5 days has no supporting reference plan. The engine
// computes the 6-day fallback so plan generation doesn't halt, but emits a
// `notes` warning that the wizard should surface (Theme C — gate matrix).
// =============================================================================

export type LimiterSport = 'swim' | 'bike' | 'run';
export type SwimFreqIntent = 'race' | 'focus';
export type StrengthFreqIntent = 'performance' | 'support' | 'none';
export type DaysPerWeek = 4 | 5 | 6 | 7;

/**
 * Sport context for the frequency matrix. Triathlon is the only sport with a populated
 * matrix today; running / cycling / hybrid (no event) are typed for forward compatibility
 * per the product roadmap. Calling with an unsupported sport throws at runtime — the type
 * stub prevents future sport additions from being a refactor instead of a row-add.
 */
export type Sport = 'triathlon' | 'running' | 'cycling' | 'hybrid';

/** Pure inputs to the frequency-defaults computation. */
export interface SessionFrequencyInputs {
  weekly_hours_available: number;
  limiter_sport?: LimiterSport;
  swim_intent?: SwimFreqIntent;
  /**
   * `performance` ↔ co-equal in spec. `support` ↔ supplementary. `none` is the
   * explicit "no strength" case (caller maps `strength_sessions_cap === 0` to
   * 'none' at the AthleteState boundary; the type itself is not extended).
   */
  strength_intent?: StrengthFreqIntent;
  /**
   * Training days per week (4-7). Required by the §2 matrix as of 2026-05-11.
   * When omitted, defaults to 6 (the most common reference-plan default).
   *
   * 4 days clamps to 5-day cell values (no reference plan supports 4-day 70.3;
   * adding here as a guardrail rather than a gate). 14+hr × 5 days emits a
   * GATE-BLOCK warning in `notes` but still returns 6-day fallback values
   * so plan generation continues; the wizard is responsible for surfacing
   * the warning (Theme C).
   */
  days_per_week?: DaysPerWeek;
  /**
   * Sport context. Triathlon is the only populated sport in the matrix today
   * (matches Efforts's current product surface). Roadmap sports — running,
   * cycling, hybrid (no event) — throw at runtime so future additions are
   * a row-add rather than a refactor. Defaults to 'triathlon'.
   */
  sport?: Sport;
}

/**
 * Phase keys for `bricks_per_week_by_phase`. Mirrors `Phase` in
 * `generate-combined-plan/types.ts` — duplicated here to avoid backward dep on
 * `_shared` from a downstream module.
 */
export type FrequencyPhase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery' | 'rebuild';

/** Output: per-discipline session counts plus telemetry. */
export interface SessionFrequencyDefaults {
  swims_per_week: 0 | 1 | 2 | 3;
  bikes_per_week: 1 | 2 | 3;
  runs_per_week: 2 | 3 | 4 | 5;
  strength_per_week: 0 | 1 | 2 | 3;
  /**
   * Brick sessions per week, keyed by phase. The TYPICAL mid-build cap from
   * the (hours_tier × days_per_week) matrix is reflected here, but the actual
   * runtime brick count is determined by phase × tier logic landing in the
   * brick reconciliation pass (Theme A commit 3 — see `docs/BRICK-PROTOCOL.md`).
   */
  bricks_per_week_by_phase: Record<FrequencyPhase, 0 | 1 | 2>;
  hours_per_week: number;
  tier_label: '5-7' | '8-10' | '10-12' | '12-14' | '14+';
  days_per_week: DaysPerWeek;
  /** 'derived' = engine-computed default; 'override' = athlete override. */
  source: 'derived' | 'override';
  /** Notes about which §-rules fired (transparency / debug). */
  notes: string[];
  /**
   * True when the (hours, days) combination has no reference-plan support and
   * the engine fell back to a neighboring viable cell. Wizard gate (Theme C)
   * uses this to refuse the combination at submit time.
   */
  gate_block?: 'hours_too_high_for_days' | undefined;
}

type TierLabel = SessionFrequencyDefaults['tier_label'];

/** Cell of the (hours_tier × days_per_week) matrix. */
interface MatrixCell {
  swims: 1 | 2 | 3;
  bikes: 1 | 2 | 3;
  runs: 2 | 3 | 4 | 5;
}

/**
 * (sport × hours_tier × days_per_week) matrix. Triathlon is the only sport populated;
 * other sports throw at runtime when requested. Days 4 not represented — clamps to 5.
 * Days 5/6/7 are first-class. See file header for source provenance.
 *
 * NOTE: strength baseline + brick caps stay tier-only for now (not days-aware)
 * because:
 *   1. Strength: per Phase A decision, intent-driven; 1×/wk is the floor and
 *      2× requires `strength_intent: 'performance'` AND ≥10hr regardless of days.
 *   2. Brick caps: phase-driven (commit 3 next); the matrix-listed brick count
 *      here is the TYPICAL mid-build value, not the runtime per-week cap.
 */
type SportMatrix = Record<TierLabel, Record<5 | 6 | 7, MatrixCell>>;

const TRIATHLON_MATRIX: SportMatrix = {
  '5-7': {
    5: { swims: 2, bikes: 2, runs: 2 },
    6: { swims: 2, bikes: 2, runs: 3 },
    7: { swims: 2, bikes: 2, runs: 3 },
  },
  '8-10': {
    5: { swims: 2, bikes: 2, runs: 3 },
    6: { swims: 2, bikes: 2, runs: 3 },
    7: { swims: 2, bikes: 3, runs: 3 },
  },
  '10-12': {
    5: { swims: 2, bikes: 3, runs: 3 },
    6: { swims: 3, bikes: 3, runs: 3 },
    7: { swims: 3, bikes: 3, runs: 3 },
  },
  '12-14': {
    5: { swims: 3, bikes: 3, runs: 3 },
    6: { swims: 3, bikes: 3, runs: 3 },
    7: { swims: 3, bikes: 3, runs: 3 },
  },
  '14+': {
    // 5d: GATE-BLOCK at wizard; engine falls back to 6d cell.
    5: { swims: 3, bikes: 3, runs: 4 },
    6: { swims: 3, bikes: 3, runs: 4 },
    7: { swims: 3, bikes: 3, runs: 4 },
  },
};

const SPORT_MATRIX: Partial<Record<Sport, SportMatrix>> = {
  triathlon: TRIATHLON_MATRIX,
  // running:  TBD — distinct matrix when run-only plans gain matrix-aware frequency
  // cycling:  TBD — distinct matrix when cycling-only plans gain matrix-aware frequency
  // hybrid:   TBD — no-event athletes (Crawley/Bare hybrid framework) need their own cells
};

/** Tier-only fields preserved from the original hours-only design. */
interface TierExtras {
  strengthBaseline: 0 | 1 | 2;
  bricksByPhase: Record<FrequencyPhase, 0 | 1 | 2>;
}

const ZERO_BRICKS: Record<FrequencyPhase, 0 | 1 | 2> = {
  base: 0, build: 0, race_specific: 0, taper: 0, recovery: 0, rebuild: 0,
};

type SportTierExtras = Record<TierLabel, TierExtras>;

const TRIATHLON_TIER_EXTRAS: SportTierExtras = {
  '5-7':   { strengthBaseline: 0, bricksByPhase: ZERO_BRICKS },
  '8-10':  { strengthBaseline: 1, bricksByPhase: { ...ZERO_BRICKS, build: 1 } },
  '10-12': { strengthBaseline: 1, bricksByPhase: { ...ZERO_BRICKS, build: 1 } },
  '12-14': { strengthBaseline: 1, bricksByPhase: { ...ZERO_BRICKS, build: 1, race_specific: 1 } },
  '14+':   { strengthBaseline: 2, bricksByPhase: { ...ZERO_BRICKS, race_specific: 2 } },
};

const SPORT_TIER_EXTRAS: Partial<Record<Sport, SportTierExtras>> = {
  triathlon: TRIATHLON_TIER_EXTRAS,
};

function tierLabelFor(hours: number): TierLabel {
  if (hours < 8) return '5-7';
  if (hours < 10) return '8-10';
  if (hours < 12) return '10-12';
  if (hours < 14) return '12-14';
  return '14+';
}

/** Clamp arbitrary day inputs to the matrix-supported {5, 6, 7} range. */
function clampDaysForMatrix(days: DaysPerWeek | undefined): 5 | 6 | 7 {
  const d = days ?? 6;
  if (d <= 5) return 5;
  if (d >= 7) return 7;
  return 6;
}

/**
 * Compute the default session frequencies for a given athlete profile. Pure function — no
 * side effects, deterministic. Caller is responsible for converting downstream forms (e.g.
 * mapping AthleteState.strength_sessions_cap === 0 to strength_intent: 'none').
 */
export function computeSessionFrequencyDefaults(
  inputs: SessionFrequencyInputs,
): SessionFrequencyDefaults {
  const sport = inputs.sport ?? 'triathlon';
  const sportMatrix = SPORT_MATRIX[sport];
  const sportExtras = SPORT_TIER_EXTRAS[sport];
  if (!sportMatrix || !sportExtras) {
    throw new Error(
      `computeSessionFrequencyDefaults: sport='${sport}' is typed for future support but the matrix is not yet populated. ` +
        `Currently supported: triathlon. Roadmap: running, cycling, hybrid — add a matrix block here when implementing.`,
    );
  }

  const hours = inputs.weekly_hours_available;
  const tier = tierLabelFor(hours);
  const requestedDays = (inputs.days_per_week ?? 6) as DaysPerWeek;
  const matrixDays = clampDaysForMatrix(requestedDays);
  const cell = sportMatrix[tier][matrixDays];
  const extras = sportExtras[tier];

  const notes: string[] = [
    `sport=${sport}, tier=${tier} from ${hours}hr/week, days=${requestedDays} (matrix lookup at ${matrixDays}d)`,
  ];

  // Gate-block: 14+ hr / 5 days has no reference-plan support. Compute fallback at 6d cell
  // but flag the result so the wizard can refuse the combination upstream (Theme C).
  let gate_block: SessionFrequencyDefaults['gate_block'] = undefined;
  if (tier === '14+' && requestedDays === 5) {
    gate_block = 'hours_too_high_for_days';
    notes.push(
      '§2 gate-block: 14+ hr/wk requires ≥6 training days — no reference plan supports 14+hr on 5 days. Computed values are the 6-day fallback; wizard should refuse this combination.',
    );
  }

  if (matrixDays !== requestedDays) {
    notes.push(`§2 days-clamp: requested ${requestedDays}d clamped to matrix range {5,6,7}; using ${matrixDays}d cell`);
  }

  let swims: 0 | 1 | 2 | 3 = cell.swims;
  let bikes: 1 | 2 | 3 = cell.bikes;
  let runs: 2 | 3 | 4 | 5 = cell.runs;
  let strength: 0 | 1 | 2 | 3 = extras.strengthBaseline;

  // §5 — swim_intent='focus' floors swims at 3, even at <12hr. Apply BEFORE limiter so
  // a swim limiter on a focus athlete can still attempt §4 but finds swims already at 3.
  if (inputs.swim_intent === 'focus' && swims < 3) {
    notes.push(`§5: swim_intent=focus → swims raised from ${swims} to 3`);
    swims = 3;
  }

  // §4 — Limiter shifts. Run limiter does NOT add a 4th run below 14hr/week; it's handled
  // via intensity (longer long run, harder intervals, strides) by the builder, not frequency.
  if (inputs.limiter_sport === 'swim') {
    if (swims < 3) {
      const before = swims;
      swims = (swims + 1) as 1 | 2 | 3;
      notes.push(`§4: limiter=swim → swims +1 (${before}→${swims})`);
      // "Remove from easy bike (if 3 bikes) or no change" — drop easy bike when bikes was at 3.
      if (bikes === 3) {
        bikes = 2;
        notes.push('§4: bike was at 3 → easy bike dropped to keep total session budget (bikes 3→2)');
      }
    } else {
      notes.push('§4: limiter=swim but swims already at 3 — no change');
    }
  } else if (inputs.limiter_sport === 'bike') {
    if (bikes < 3) {
      const before = bikes;
      bikes = (bikes + 1) as 2 | 3;
      notes.push(`§4: limiter=bike → bikes +1 (${before}→${bikes})`);
      if (swims === 3) {
        swims = 2;
        notes.push('§4: swim was at 3 → easy swim dropped to keep total session budget (swims 3→2)');
      }
    } else {
      notes.push('§4: limiter=bike but bikes already at 3 — no change');
    }
  } else if (inputs.limiter_sport === 'run') {
    notes.push('§4: limiter=run → frequency unchanged (run-limiter handled via intensity, not frequency); 4th-run case at 14+hr w/ history not implemented this pass');
  }

  // §7 — strength_intent. 'none' forces 0; 'performance' (co-equal) is 2× at 10+hr, 1× <10hr;
  // 'support' (supplementary) is 1× regardless. Undefined intent falls back to tier baseline.
  if (inputs.strength_intent === 'none') {
    strength = 0;
    notes.push('§7: strength_intent=none → 0× strength');
  } else if (inputs.strength_intent === 'performance') {
    if (hours < 10) {
      strength = 1;
      notes.push('§7: strength_intent=performance + <10hr → 1× full-body (compressed schedule)');
    } else {
      strength = 2;
      notes.push('§7: strength_intent=performance + ≥10hr → 2× (1 upper + 1 lower)');
    }
  } else if (inputs.strength_intent === 'support') {
    strength = 1;
    notes.push('§7: strength_intent=support → 1× full-body or alternating upper/lower');
  } else {
    notes.push(`§7: strength_intent unset → tier-baseline ${strength}× strength`);
  }

  return {
    swims_per_week: swims,
    bikes_per_week: bikes,
    runs_per_week: runs,
    strength_per_week: strength,
    bricks_per_week_by_phase: extras.bricksByPhase,
    hours_per_week: hours,
    tier_label: tier,
    days_per_week: requestedDays,
    source: 'derived',
    notes,
    ...(gate_block ? { gate_block } : {}),
  };
}
