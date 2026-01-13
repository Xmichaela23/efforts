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

// Canonical protocol IDs (new canonical format)
export type ProtocolId = 'durability' | 'neural_speed' | 'upper_aesthetics' | 'minimum_dose';

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
  const canonical = new Set<ProtocolId>(['durability', 'neural_speed', 'upper_aesthetics']);
  
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
  const canonical = new Set<ProtocolId>(['durability', 'neural_speed', 'upper_aesthetics']);
  const legacyProtocols: LegacyProtocolId[] = ['upper_priority_hybrid', 'foundation_durability', 'performance_neural'];
  return canonical.has(protocolId as ProtocolId) 
    || legacyProtocols.includes(protocolId as LegacyProtocolId);
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
    const available = ['durability', 'neural_speed', 'upper_aesthetics'].join(', ');
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
  return ['durability', 'neural_speed', 'upper_aesthetics'];
}
