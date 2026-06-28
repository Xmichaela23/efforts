// Periodization authority (seed) — Strength Island Phase One.
//
// One authority every modality queries (run / tri / combined / future bike) instead of each engine
// string-matching phase display names. Phase one seeds the CLASSIFICATION half only: map any engine's
// phase name to a typed kind, and answer "is this a rested terminal?". Later phases relocate the
// step-down/frequency/load logic itself into this module (see docs/ISLAND-PROPOSAL.md §5).
//
// See docs/SPEC-strength-island-phase1.md. The point: consumers ask for the KIND, never branch on the
// display string — which is what makes generate-run-plan's applyRetestTail Taper→Retest rename harmless
// (nothing downstream reads the name anymore).

export type PhaseKind =
  | 'base'
  | 'speed'
  | 'build'
  | 'race_prep'
  | 'taper'
  | 'retest'
  | 'recovery';

/**
 * Map an engine phase NAME → one typed kind. Handles the run engine's capitalized vocabulary
 * (`'Base' | 'Speed' | 'Race Prep' | 'Build' | 'Taper' | 'Retest'`) AND the combined engine's
 * lowercase enum (`'race_specific' | 'rebuild' | 'retest' | …`). Unknown → `'base'` (a non-terminal
 * loading kind) so an unrecognized name is never silently treated as a rested terminal.
 */
export function canonicalizePhaseName(name: string | null | undefined): PhaseKind {
  const n = String(name ?? '').trim().toLowerCase();
  switch (n) {
    case 'base': return 'base';
    case 'speed': return 'speed';
    case 'build': return 'build';
    case 'race prep':
    case 'race-prep':
    case 'race_specific':
    case 'race-specific': return 'race_prep';
    case 'taper': return 'taper';
    case 'retest': return 'retest';
    case 'recovery':
    case 'rebuild':
    case 'deload': return 'recovery';
    default: return 'base';
  }
}

/**
 * A rested terminal — the block's closing low-volume week(s): a race taper OR a non-race retest.
 * Strength steps down and endurance sheds speedwork + volume here, identically. This single predicate
 * replaces the `phase.name === 'Taper'` string-matches scattered across the run terminal consumers.
 */
export function isRestedTerminal(kind: PhaseKind): boolean {
  return kind === 'taper' || kind === 'retest';
}

/**
 * Bridge for the shared strength protocols, which still gate taper behavior on the literal name
 * `'Taper'` (Phase 4 moves their load curves into this authority). Until then, hand a rested terminal
 * the name the protocols already understand — mirrors generate-combined-plan `session-factory.ts:2238`
 * (`retest → 'Taper'`). Non-terminal phases pass their original name through unchanged.
 */
export function protocolPhaseName(kind: PhaseKind, originalName: string): string {
  return isRestedTerminal(kind) ? 'Taper' : originalName;
}
