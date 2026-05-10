// =============================================================================
// session-frequency-defaults — derive per-discipline session counts from hours
// =============================================================================
// Implements docs/SESSION-FREQUENCY-DEFAULTS.md §2 base table + §4 limiter
// shifts + §5 swim-intent floor + §7 strength integration. Out of scope here:
//   - §3 distance scaling (caller adjusts if needed)
//   - §8 recent training history ceiling (requires `workouts` data)
//   - §10 group ride / group run anchor modifications (orthogonal — handled
//     by anchor placement logic, doesn't change frequency)
// =============================================================================

export type LimiterSport = 'swim' | 'bike' | 'run';
export type SwimFreqIntent = 'race' | 'focus';
export type StrengthFreqIntent = 'performance' | 'support' | 'none';

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
}

/**
 * Phase keys for `bricks_per_week_by_phase`. Mirrors `Phase` in
 * `generate-combined-plan/types.ts` — duplicated here to avoid backward dep on
 * `_shared` from a downstream module.
 */
export type FrequencyPhase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery';

/** Output: per-discipline session counts plus telemetry. */
export interface SessionFrequencyDefaults {
  swims_per_week: 0 | 1 | 2 | 3;
  bikes_per_week: 1 | 2 | 3;
  runs_per_week: 2 | 3 | 4;
  strength_per_week: 0 | 1 | 2 | 3;
  /**
   * Brick sessions per week, keyed by phase, derived from §9 default-shape table:
   *   - 5-7 tier:   0 in all phases
   *   - 8-10 tier:  1 in build only
   *   - 10-12 tier: 1 in build only
   *   - 12-14 tier: 1 in build, 1 in race_specific
   *   - 14+ tier:   2 in race_specific only
   * Brick replaces a standalone long_ride + run with one combined session — count is
   * a CAP on brick-day count for the phase, not added to S/B/R session totals.
   */
  bricks_per_week_by_phase: Record<FrequencyPhase, 0 | 1 | 2>;
  hours_per_week: number;
  tier_label: '5-7' | '8-10' | '10-12' | '12-14' | '14+';
  /** 'derived' = engine-computed default; 'override' = athlete override. */
  source: 'derived' | 'override';
  /** Notes about which §-rules fired (transparency / debug). */
  notes: string[];
}

interface TierRow {
  /** Upper bound (exclusive). Tier matches when hours < upperExclusive. */
  upperExclusive: number;
  label: SessionFrequencyDefaults['tier_label'];
  swims: 1 | 2 | 3;
  bikes: 1 | 2 | 3;
  runs: 2 | 3 | 4;
  /** Default strength when intent is unset (matches "0–1" / "1" baseline rows in §2). */
  strengthBaseline: 0 | 1 | 2;
  /** Brick CAP per phase per §9 default-shape table. */
  bricksByPhase: Record<FrequencyPhase, 0 | 1 | 2>;
}

const ZERO_BRICKS: Record<FrequencyPhase, 0 | 1 | 2> = {
  base: 0, build: 0, race_specific: 0, taper: 0, recovery: 0,
};

// §2 base table (70.3). Per Phase A decision, boundaries are <8 / <10 / <12 / <14 / ≥14.
// Brick caps come from §9 default-shape tables per Phase A.5 instructions:
//   5-7 tier:   0 bricks in all phases
//   8-10 tier:  1 brick in build only
//   10-12 tier: 1 brick in build only
//   12-14 tier: 1 brick in build + 1 in race_specific
//   14+ tier:   2 bricks in race_specific only
const TIERS: TierRow[] = [
  {
    upperExclusive: 8,
    label: '5-7',
    swims: 2, bikes: 2, runs: 2, strengthBaseline: 0,
    bricksByPhase: ZERO_BRICKS,
  },
  {
    upperExclusive: 10,
    label: '8-10',
    swims: 2, bikes: 2, runs: 3, strengthBaseline: 1,
    bricksByPhase: { ...ZERO_BRICKS, build: 1 },
  },
  {
    upperExclusive: 12,
    label: '10-12',
    swims: 2, bikes: 3, runs: 3, strengthBaseline: 1,
    bricksByPhase: { ...ZERO_BRICKS, build: 1 },
  },
  {
    upperExclusive: 14,
    label: '12-14',
    swims: 3, bikes: 3, runs: 3, strengthBaseline: 1,
    bricksByPhase: { ...ZERO_BRICKS, build: 1, race_specific: 1 },
  },
  {
    upperExclusive: Infinity,
    label: '14+',
    swims: 3, bikes: 3, runs: 3, strengthBaseline: 2,
    bricksByPhase: { ...ZERO_BRICKS, race_specific: 2 },
  },
];

function tierFor(hours: number): TierRow {
  for (const t of TIERS) {
    if (hours < t.upperExclusive) return t;
  }
  return TIERS[TIERS.length - 1];
}

/**
 * Compute the default session frequencies for a given athlete profile. Pure function — no
 * side effects, deterministic. Caller is responsible for converting downstream forms (e.g.
 * mapping AthleteState.strength_sessions_cap === 0 to strength_intent: 'none').
 */
export function computeSessionFrequencyDefaults(
  inputs: SessionFrequencyInputs,
): SessionFrequencyDefaults {
  const tier = tierFor(inputs.weekly_hours_available);
  const notes: string[] = [
    `tier=${tier.label} from ${inputs.weekly_hours_available}hr/week`,
  ];

  let swims: 0 | 1 | 2 | 3 = tier.swims;
  let bikes: 1 | 2 | 3 = tier.bikes;
  let runs: 2 | 3 | 4 = tier.runs;
  let strength: 0 | 1 | 2 | 3 = tier.strengthBaseline;

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
    if (inputs.weekly_hours_available < 10) {
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
    bricks_per_week_by_phase: tier.bricksByPhase,
    hours_per_week: inputs.weekly_hours_available,
    tier_label: tier.label,
    source: 'derived',
    notes,
  };
}
