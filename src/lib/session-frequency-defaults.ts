/**
 * Frontend mirror of `supabase/functions/_shared/session-frequency-defaults.ts`.
 * Keep in sync — this file contains the same constants, types, and logic so the
 * Arc wizard can compute defaults at submit time without importing across the
 * Vite/Deno build boundary.
 *
 * Implements docs/SESSION-FREQUENCY-DEFAULTS.md §2 base table + §4 limiter
 * shifts + §5 swim-intent floor + §7 strength integration. Out of scope:
 *   - §3 distance scaling (caller adjusts if needed)
 *   - §8 recent training history ceiling (requires `workouts` data)
 *   - §10 group ride / group run anchor modifications
 */

export type LimiterSport = 'swim' | 'bike' | 'run';
export type SwimFreqIntent = 'race' | 'focus';
export type StrengthFreqIntent = 'performance' | 'support' | 'none';

export interface SessionFrequencyInputs {
  weekly_hours_available: number;
  limiter_sport?: LimiterSport;
  swim_intent?: SwimFreqIntent;
  /** `performance` ↔ co-equal. `support` ↔ supplementary. `none` ↔ no strength. */
  strength_intent?: StrengthFreqIntent;
}

export type FrequencyPhase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery';

export interface SessionFrequencyDefaults {
  swims_per_week: 0 | 1 | 2 | 3;
  bikes_per_week: 1 | 2 | 3;
  runs_per_week: 2 | 3 | 4;
  strength_per_week: 0 | 1 | 2 | 3;
  bricks_per_week_by_phase: Record<FrequencyPhase, 0 | 1 | 2>;
  hours_per_week: number;
  tier_label: '5-7' | '8-10' | '10-12' | '12-14' | '14+';
  source: 'derived' | 'override';
  notes: string[];
}

interface TierRow {
  upperExclusive: number;
  label: SessionFrequencyDefaults['tier_label'];
  swims: 1 | 2 | 3;
  bikes: 1 | 2 | 3;
  runs: 2 | 3 | 4;
  strengthBaseline: 0 | 1 | 2;
  bricksByPhase: Record<FrequencyPhase, 0 | 1 | 2>;
}

const ZERO_BRICKS: Record<FrequencyPhase, 0 | 1 | 2> = {
  base: 0, build: 0, race_specific: 0, taper: 0, recovery: 0,
};

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

export function computeSessionFrequencyDefaults(
  inputs: SessionFrequencyInputs,
): SessionFrequencyDefaults {
  const tier = tierFor(inputs.weekly_hours_available);
  const notes: string[] = [`tier=${tier.label} from ${inputs.weekly_hours_available}hr/week`];

  let swims: 0 | 1 | 2 | 3 = tier.swims;
  let bikes: 1 | 2 | 3 = tier.bikes;
  const runs: 2 | 3 | 4 = tier.runs;
  let strength: 0 | 1 | 2 | 3 = tier.strengthBaseline;

  if (inputs.swim_intent === 'focus' && swims < 3) {
    notes.push(`§5: swim_intent=focus → swims raised from ${swims} to 3`);
    swims = 3;
  }

  if (inputs.limiter_sport === 'swim') {
    if (swims < 3) {
      const before = swims;
      swims = (swims + 1) as 1 | 2 | 3;
      notes.push(`§4: limiter=swim → swims +1 (${before}→${swims})`);
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
