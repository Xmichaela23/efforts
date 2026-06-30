// ============================================================================
// THE CONDUCTOR — phased strength ARC  (SPEC-product-shape, Program 1: Get Strong)
//
// Sequences strength protocols ACROSS the plan's phases (base → power → sharpen)
// instead of running one flat protocol the whole block. Orchestration only —
// every protocol it sequences already exists and is proven:
//   base    → strength_focus_build   (5×5-derived, U/L/U/L, compound)
//   power   → strength_focus_power   (neural/RFD)
//   sharpen → strength_focus_power, volume trimmed by phase + the overlay's taper logic
//   hold    → deload (taper/retest), handled by the overlay's existing rested-terminal path
//
// This is the layer the capability audit found missing (gap #3): the protocols
// and the phase structure both exist; the conductor is the per-phase selection
// that runs the arc. It does NOT touch the compound spine, the U/L/U/L balance
// (D-220), or invent any protocol.
//
// Program 2 (Maintain — endurance leads, strength supports) is a flat support
// dose, no arc: durability/minimum_dose across every phase.
// ============================================================================

import { canonicalizePhaseName } from '../../_shared/periodization/index.ts';

export type StrengthProgram = 'get_strong' | 'maintain';

/** The strength-focus lanes ARE the Get Strong arc — their presence signals the conductor. */
export function isGetStrongArc(protocolId: string | undefined): boolean {
  return protocolId === 'strength_focus_build' || protocolId === 'strength_focus_power';
}

/**
 * Resolve the strength protocol for ONE phase of the arc.
 *
 * @param phaseName the plan's phase name (run/combined engines name them
 *   'Base' / 'Build' / 'Speed' / 'Race Prep' / 'Taper' / 'Retest' / …). Canonicalized
 *   to PhaseKind via the periodization authority, so any engine's naming works.
 * @param program  Get Strong (the arc) vs Maintain (flat support).
 */
export function resolveStrengthArcProtocol(phaseName: string, program: StrengthProgram): string {
  // Maintain: endurance leads, strength is a support slot — flat across every phase. No arc.
  if (program === 'maintain') return 'durability';

  // Get Strong: strength leads — the base→power→sharpen arc.
  const kind = canonicalizePhaseName(phaseName);
  switch (kind) {
    case 'base':
      return 'strength_focus_build';   // 5×5-derived compound base — build the foundation
    case 'speed':
    case 'build':
      return 'strength_focus_power';   // explosive / RFD — convert the base to power
    case 'race_prep':
      return 'strength_focus_power';   // sharpen — power emphasis; the overlay trims volume into the peak
    case 'taper':
    case 'retest':
    case 'recovery':
      // Hold / deload into the strength retest. The overlay's rested-terminal path (getTaperStrengthParams +
      // filterToTaperFrequency) already deloads load + frequency here; keep the build-lane content so the
      // movements stay familiar while volume drops. (minimum_dose is the eventual "hold" protocol but is
      // deferred from the runtime allow-list — revisit when it's surfaced.)
      return 'strength_focus_build';
    default:
      return 'strength_focus_build';
  }
}
