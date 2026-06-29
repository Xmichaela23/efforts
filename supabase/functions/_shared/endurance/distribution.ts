// Shared endurance model — intensity distribution + the forgiving↔sharp dial. PHASE_ZONE_DIST LIFTED
// FAITHFULLY from generate-combined-plan/science.ts. Polarized 80/20 (Foster; Seiler & Tønnessen;
// pyramidal-vs-polarized per Stöggl & Sperlich 2015). Two-copy-with-parity-lock vs combined.
//
// The forgiving↔sharp DIAL is the single intensity-aggressiveness parameter. For this stage it defaults
// to 'neutral' = the lifted per-phase distribution UNCHANGED (byte-identical). The forgiving/sharp SHIFT
// VALUES are TUNED GUARDRAILS, not a sourced coefficient (SPEC §2), and are DEFERRED — the parameter
// exists; its non-neutral values are a later tuning decision. See SPEC-shared-endurance-model.md.

import type { PhaseKey } from './volume.ts';

export interface ZoneDistribution {
  low: number;
  tempo: number;
  high: number;
}

/** Per-phase polarized intensity distribution (low/tempo/high fractions). */
export const PHASE_ZONE_DIST: Record<PhaseKey, ZoneDistribution> = {
  base:          { low: 0.87, tempo: 0.08, high: 0.05 },
  build:         { low: 0.80, tempo: 0.10, high: 0.10 },
  race_specific: { low: 0.77, tempo: 0.13, high: 0.10 },
  taper:         { low: 0.83, tempo: 0.07, high: 0.10 },
  recovery:      { low: 0.95, tempo: 0.05, high: 0.00 },
  rebuild:       { low: 0.88, tempo: 0.08, high: 0.04 },
  retest:        { low: 0.77, tempo: 0.13, high: 0.10 },
};

/** The aggressiveness dial. 'neutral' = the lifted distribution unchanged (byte-identical, this stage). */
export type IntensityDial = 'forgiving' | 'neutral' | 'sharp';

/**
 * Resolve the per-phase distribution for a given aggressiveness. This stage: only 'neutral' is wired
 * (returns PHASE_ZONE_DIST[phase] verbatim). 'forgiving'/'sharp' are accepted but currently return the
 * neutral distribution — their shift values are deferred tuned guardrails (NOT sourced coefficients),
 * to be set in a later tuning pass. The parameter exists so consumers can pass it from E3 onward.
 */
export function phaseDistribution(phase: PhaseKey, dial: IntensityDial = 'neutral'): ZoneDistribution {
  // dial intentionally not yet applied — see note above. Keeps this stage byte-identical.
  void dial;
  return { ...PHASE_ZONE_DIST[phase] };
}
