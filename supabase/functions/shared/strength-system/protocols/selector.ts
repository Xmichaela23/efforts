// ============================================================================
// PROTOCOL SELECTOR
// 
// Routes protocol ID to protocol implementation.
// ============================================================================

import { StrengthProtocol } from './types.ts';
import { upperPriorityHybridProtocol } from './upper-priority-hybrid.ts';
import { foundationDurabilityProtocol } from './foundation-durability.ts';
import { performanceNeuralProtocol } from './performance-neural.ts';
import { minimumDoseProtocol } from './minimum-dose.ts';
import { triathlonProtocol } from './triathlon.ts';
import { triathlonPerformanceProtocol } from './triathlon_performance.ts';
import { fiveByFiveProtocol } from './five-by-five.ts';
import { strengthFocusBuildProtocol, strengthFocusPowerProtocol } from './strength-focus-split.ts';

// Canonical protocol IDs (new canonical format)
export type ProtocolId =
  | 'durability'
  | 'neural_speed'
  | 'upper_aesthetics'
  | 'minimum_dose'
  | 'triathlon'
  | 'triathlon_performance'
  | 'five_by_five'
  | 'strength_focus_build'   // Q-088 freq-4 U/L/U/L (build lane)
  | 'strength_focus_power';  // Q-088 freq-4 U/L/U/L (power lane)

// Legacy IDs (temporary backward compatibility - TODO: Remove after 2025-03-01)
type LegacyProtocolId = 'upper_priority_hybrid' | 'foundation_durability' | 'performance_neural';

/**
 * Normalize protocol ID to canonical format
 * Converts legacy IDs to new canonical IDs
 * TODO: Remove legacy support after 2025-03-01
 * 
 * @throws Error if protocolId is not a valid canonical or legacy ID
 */
export function normalizeProtocolId(protocolId: string): ProtocolId {
  // Supported protocols (runtime list - excludes minimum_dose until frontend supports it)
  const canonical = new Set<ProtocolId>([
    'durability',
    'neural_speed',
    'upper_aesthetics',
    'triathlon',
    'triathlon_performance',
    'five_by_five',
    'strength_focus_build',
    'strength_focus_power',
  ]);
  
  // If already canonical, return as-is
  if (canonical.has(protocolId as ProtocolId)) {
    return protocolId as ProtocolId;
  }
  
  // Map legacy IDs to canonical
  const legacyToNew: Record<string, ProtocolId> = {
    'foundation_durability': 'durability',
    'performance_neural': 'neural_speed',
    'upper_priority_hybrid': 'upper_aesthetics',
  };
  
  const normalized = legacyToNew[protocolId];
  if (!normalized) {
    const canonicalList = Array.from(canonical).join(', ');
    const legacyList = Object.keys(legacyToNew).join(', ');
    throw new Error(`Invalid protocol ID: "${protocolId}". Must be canonical (${canonicalList}) or legacy (${legacyList})`);
  }
  
  return normalized;
}

/**
 * Check if a protocol ID is valid/available (accepts both legacy and new IDs)
 * Note: minimum_dose is not in the supported runtime list (deferred)
 */
export function isValidProtocol(protocolId: string): boolean {
  const canonical = new Set<ProtocolId>([
    'durability',
    'neural_speed',
    'upper_aesthetics',
    'triathlon',
    'triathlon_performance',
    'five_by_five',
    'strength_focus_build',
    'strength_focus_power',
  ]);
  const legacyProtocols: LegacyProtocolId[] = ['upper_priority_hybrid', 'foundation_durability', 'performance_neural'];
  return canonical.has(protocolId as ProtocolId) 
    || legacyProtocols.includes(protocolId as LegacyProtocolId);
}

/**
 * Run / marathon wizard strength protocol IDs. Combined **tri** plans must not use
 * these as literal engines when `strength_intent` is performance (co-equal), or
 * they mis-label: athlete gets foundation-durability sessions instead of
 * `triathlon_performance`.
 *
 * **Contract:** Any new **run-centric** canonical or legacy `strength_protocol` id
 * that should map through `resolveProtocolIdForCombinedTriPlan` (i.e. “this came from
 * the run wizard, not tri tracks”) **must** be added here. Omitting one silently
 * sends combined tri down the wrong branch again. Keep the client copy in
 * `src/lib/tri-combined-strength-nudge.ts` aligned for stale-plan UX.
 */
export const RUN_CENTRIC_STRENGTH_PROTOCOL_IDS = new Set<string>([
  'neural_speed',
  'durability',
  'upper_aesthetics',
  'minimum_dose',
  'upper_priority_hybrid',
  'foundation_durability',
  'performance_neural',
  'five_by_five',          // Q-093 Lock 2 — the §13.1 standalone develop default; was coerced to durability on the run path
  'strength_focus_build',  // Q-088 — run-path freq-4 developer lanes
  'strength_focus_power',
]);

/**
 * Sport context for protocol resolution. Combined-tri and standalone-tri both use `'triathlon'`.
 * Single-sport run plans use `'run'`. Other / unknown sports fall through to a defensive default.
 */
export type StrengthResolverSport = 'triathlon' | 'run' | 'other';

export type ResolveStrengthProtocolInput = {
  /** Stored `training_prefs.strength_protocol` (canonical or legacy id, may be empty). */
  rawProtocol?: string;
  /** Stored `training_prefs.strength_intent` ('support' | 'performance' | unset). */
  strengthIntent?: string;
  /**
   * Three-tier equipment **capability** classification (docs/STRENGTH-PROTOCOL.md §8). When
   * `'bodyweight_bands'`, any performance routing downgrades to the support equivalent and
   * `performanceGateFired` returns `true` so callers can surface the spec §2 trade-off.
   * Optional — when omitted, the gate never fires.
   */
  equipmentTier?: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands';
  /** Goal sport context — drives which protocol family applies. */
  sport: StrengthResolverSport;
};

export type ResolveStrengthProtocolResult = {
  protocolId: ProtocolId;
  /**
   * True when `bodyweight_bands` tier forced a performance→support downgrade. Callers should
   * surface the docs/STRENGTH-PROTOCOL.md §2 trade-off ("loadable resistance not available").
   */
  performanceGateFired: boolean;
};

/**
 * Single sport-agnostic protocol resolver consulted by every plan generator (combined-tri,
 * standalone-tri, run-only). Replaces the bypass paths in `generate-run-plan` and
 * `generate-triathlon-plan/generators/tri-generator.ts` that previously read either
 * `strength_protocol` or `goal/training_intent` independently, causing silent drift when
 * an athlete set `strength_intent: 'performance'` for a single-sport plan but received
 * support-equivalent loading.
 *
 * **Resolution order (per sport):**
 *
 * - **triathlon:** explicit `'triathlon'`/`'triathlon_performance'` wins → intent
 *   `'performance'` routes to `'triathlon_performance'` → otherwise `'triathlon'`.
 *   Run-centric protocols leaked into a tri context coerce to `'triathlon'` (durability).
 *
 * - **run:** explicit run-centric protocol (in {@link RUN_CENTRIC_STRENGTH_PROTOCOL_IDS}) wins →
 *   intent `'performance'` routes to `'neural_speed'` → otherwise `'durability'`.
 *   `'triathlon'`/`'triathlon_performance'` ids leaked into a run context coerce to
 *   `'durability'` (defensive — should not happen via normal flow).
 *
 * - **other:** preserve explicit protocol when canonical-or-legacy; default `'durability'`.
 *
 * Equipment-tier gate (`bodyweight_bands`) downgrades performance protocols to their support
 * equivalent in all sport branches, mirroring the historical
 * {@link resolveProtocolIdForCombinedTriPlan} behavior.
 */
export function resolveStrengthProtocolForGoal(
  input: ResolveStrengthProtocolInput,
): ResolveStrengthProtocolResult {
  const p = String(input.rawProtocol ?? '').trim();
  const intent = String(input.strengthIntent ?? '').trim().toLowerCase();
  const tierBlocksPerformance = input.equipmentTier === 'bodyweight_bands';
  const sport = input.sport;

  if (sport === 'triathlon') {
    if (p === 'triathlon_performance') {
      return tierBlocksPerformance
        ? { protocolId: 'triathlon', performanceGateFired: true }
        : { protocolId: 'triathlon_performance', performanceGateFired: false };
    }
    if (p === 'triathlon') {
      return { protocolId: 'triathlon', performanceGateFired: false };
    }
    if (intent === 'performance') {
      return tierBlocksPerformance
        ? { protocolId: 'triathlon', performanceGateFired: true }
        : { protocolId: 'triathlon_performance', performanceGateFired: false };
    }
    // Run-centric protocol id in a tri context — coerce to durability.
    return { protocolId: 'triathlon', performanceGateFired: false };
  }

  if (sport === 'run') {
    if (p && RUN_CENTRIC_STRENGTH_PROTOCOL_IDS.has(p)) {
      // Explicit run-centric choice wins. Normalize legacy ids to canonical.
      const canonical = normalizeProtocolId(p);
      return { protocolId: canonical, performanceGateFired: false };
    }
    if (p === 'triathlon' || p === 'triathlon_performance') {
      // Tri-only ids leaked into a single-sport run context — defensive fallback.
      return { protocolId: 'durability', performanceGateFired: false };
    }
    if (intent === 'performance') {
      return tierBlocksPerformance
        ? { protocolId: 'durability', performanceGateFired: true }
        : { protocolId: 'neural_speed', performanceGateFired: false };
    }
    return { protocolId: 'durability', performanceGateFired: false };
  }

  // sport === 'other' — preserve explicit choice when it parses, else durability.
  if (p) {
    try {
      return { protocolId: normalizeProtocolId(p), performanceGateFired: false };
    } catch {
      /* unknown id → fall through */
    }
  }
  return { protocolId: 'durability', performanceGateFired: false };
}

/**
 * Resolve stored `training_prefs.strength_protocol` + `strength_intent` to the
 * tri implementation used by combined-plan `triathlonStrength`.
 *
 * Thin wrapper around {@link resolveStrengthProtocolForGoal} (`sport: 'triathlon'`) kept
 * for backward compatibility with existing call sites. New code should call the resolver
 * directly so the gate-fired signal is available for trade-off surfacing.
 */
export function resolveProtocolIdForCombinedTriPlan(
  rawProtocol: string | undefined,
  strengthIntent: string | undefined,
  equipmentTier?: 'full_barbell' | 'dumbbell_based' | 'bodyweight_bands',
): 'triathlon' | 'triathlon_performance' {
  const result = resolveStrengthProtocolForGoal({
    rawProtocol,
    strengthIntent,
    equipmentTier,
    sport: 'triathlon',
  });
  return result.protocolId === 'triathlon_performance' ? 'triathlon_performance' : 'triathlon';
}

/**
 * Get protocol by ID
 * 
 * @throws Error if protocolId is provided but not found (no silent fallback)
 * @param protocolId - Protocol ID (canonical or legacy). If undefined, returns default 'upper_aesthetics'
 */
export function getProtocol(protocolId?: string): StrengthProtocol {
  // If no protocol provided, use default (canonical ID)
  if (!protocolId) {
    return upperPriorityHybridProtocol; // Default protocol (maps to upper_aesthetics)
  }
  
  // Normalize to canonical ID (legacy IDs converted here)
  const canonicalId = normalizeProtocolId(protocolId);
  
  // Validate normalized ID is valid (runtime check - excludes minimum_dose)
  if (!isValidProtocol(canonicalId)) {
    const available = ['durability', 'neural_speed', 'upper_aesthetics', 'triathlon', 'triathlon_performance'].join(', ');
    throw new Error(`Invalid strength_protocol: "${protocolId}" (normalized: "${canonicalId}"). Available: ${available}`);
  }
  
  // Map canonical IDs to protocol implementations
  // Note: Protocol implementations still use legacy IDs internally (temporary)
  // TODO: Update protocol implementations to use canonical IDs after 2025-03-01
  switch (canonicalId) {
    case 'upper_aesthetics':
      return upperPriorityHybridProtocol;
    case 'durability':
      return foundationDurabilityProtocol;
    case 'neural_speed':
      return performanceNeuralProtocol;
    case 'minimum_dose':
      return minimumDoseProtocol;
    case 'triathlon':
      return triathlonProtocol;
    case 'triathlon_performance':
      return triathlonPerformanceProtocol;
    case 'five_by_five':
      return fiveByFiveProtocol;
    case 'strength_focus_build':
      return strengthFocusBuildProtocol;
    case 'strength_focus_power':
      return strengthFocusPowerProtocol;
    default:
      // Should not reach here due to validation, but TypeScript needs this
      throw new Error(`Protocol "${canonicalId}" is not implemented`);
  }
}

/**
 * List all available protocols (returns canonical IDs)
 * Note: minimum_dose is excluded until frontend support is added
 */
export function listProtocols(): ProtocolId[] {
  return ['durability', 'neural_speed', 'upper_aesthetics', 'triathlon', 'triathlon_performance', 'five_by_five', 'strength_focus_build', 'strength_focus_power'];
}
