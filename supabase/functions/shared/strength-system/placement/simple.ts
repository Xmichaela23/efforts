// ============================================================================
// METHODOLOGY-AWARE PLACEMENT POLICY
// 
// Uses strategy pattern to place strength sessions based on run methodology:
// - Hal Higdon (Completion): Mon=Upper, Wed=Lower, Fri=Optional
// - Jack Daniels (Performance): Mon=Upper, Tue=Lower (stacked), Wed=None, Fri=Optional
//   Fallback (no doubles): Protocol-dependent (Wed for neural, Sat for durability)
// ============================================================================

import {
  PlacementPolicy,
  IntentSession,
  PlacedSession,
  GuardrailResult,
} from '../protocols/types.ts';
import { isLowerIntent, isUpperIntent, isFullBodyIntent } from '../protocols/intent-taxonomy.ts';
import {
  getPlacementStrategy,
  mapApproachToMethodology,
  normalizeWeekday,
  type PlacementContext,
} from './strategy.ts';
import type { Weekday, Slot } from './types.ts';

export const simplePlacementPolicy: PlacementPolicy = {
  id: 'methodology_aware',
  name: 'Methodology-Aware',
  description: 'Places strength sessions based on run methodology (Hal Higdon vs Jack Daniels).',
  assignSessions: assignSessions,
};

// Map weekday to full day name
const WEEKDAY_TO_DAY: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function assignSessions(
  intentSessions: IntentSession[],
  primarySchedule: { longSessionDays: string[]; qualitySessionDays: string[]; easySessionDays: string[] },
  guardrails: GuardrailResult[],
  placementContext?: {
    methodology?: 'hal_higdon_complete' | 'jack_daniels_performance';
    protocol?: string;
    strengthFrequency?: number;
    noDoubles?: boolean;
  }
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  
  // If placement context is provided, use methodology-aware strategy
  if (placementContext?.methodology) {
    return assignSessionsWithStrategy(
      intentSessions,
      primarySchedule,
      guardrails,
      placementContext
    );
  }
  
  // Fallback to legacy run-centric placement (for backward compatibility)
  return assignSessionsLegacy(intentSessions, primarySchedule, guardrails);
}

/**
 * Methodology-aware placement using strategy pattern
 */
function assignSessionsWithStrategy(
  intentSessions: IntentSession[],
  primarySchedule: { longSessionDays: string[]; qualitySessionDays: string[]; easySessionDays: string[] },
  guardrails: GuardrailResult[],
  placementContext: {
    methodology: 'hal_higdon_complete' | 'jack_daniels_performance';
    protocol?: string;
    strengthFrequency?: number;
    noDoubles?: boolean;
  }
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  
  // Build placement context
  const qualityDays: Weekday[] = primarySchedule.qualitySessionDays.map(normalizeWeekday);
  const longRunDay: Weekday = primarySchedule.longSessionDays.length > 0
    ? normalizeWeekday(primarySchedule.longSessionDays[0])
    : 'sun';
  
  const ctx: PlacementContext = {
    methodology: placementContext.methodology,
    protocol: (placementContext.protocol || 'durability') as 'durability' | 'neural_speed' | 'upper_aesthetics',
    strengthFrequency: (placementContext.strengthFrequency || 2) as 0 | 1 | 2 | 3,
    noDoubles: placementContext.noDoubles || false,
    qualityDays,
    longRunDay,
  };
  
  // Get strategy
  const strategy = getPlacementStrategy(ctx);
  
  // Categorize sessions
  const upperSessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  const lowerSessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  const fullBodySessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  const otherSessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  
  const processedIndices = new Set<number>();
  
  for (let i = 0; i < intentSessions.length; i++) {
    const session = intentSessions[i];
    const guardrailResult = guardrails.find(g => g.sessionIndex === i);
    
    if (guardrailResult?.finalAction === 'skip') {
      processedIndices.add(i);
      continue;
    }
    
    if (isFullBodyIntent(session.intent)) {
      fullBodySessions.push({ session, index: i, guardrailResult });
    } else if (isUpperIntent(session.intent)) {
      upperSessions.push({ session, index: i, guardrailResult });
    } else if (isLowerIntent(session.intent)) {
      lowerSessions.push({ session, index: i, guardrailResult });
    } else {
      otherSessions.push({ session, index: i, guardrailResult });
    }
  }
  
  // Split lower sessions into heavy vs light
  const heavyLowerIntents = ['LOWER_NEURAL', 'LOWER_POWER'];
  const heavyLowerSessions = lowerSessions.filter(({ session }) =>
    heavyLowerIntents.includes(session.intent)
  );
  const lightLowerSessions = lowerSessions.filter(({ session }) =>
    !heavyLowerIntents.includes(session.intent)
  );
  
  // Assign sessions to slots based on strategy
  // Process in order: primary slots first, then optional slots
  
  // First pass: Assign primary slots
  for (const [weekday, slot] of Object.entries(strategy.slotsByDay)) {
    if (slot === 'none' || slot.includes('optional')) continue; // Skip optional for now
    
    const day = weekday as Weekday;
    const dayName = WEEKDAY_TO_DAY[day];
    
    // Find session for this slot
    let sessionToPlace: { session: IntentSession; index: number; guardrailResult?: GuardrailResult } | null = null;
    
    if (slot === 'upper_primary') {
      // Prefer upper sessions, but can use full body if no upper available
      sessionToPlace = upperSessions.find(s => !processedIndices.has(s.index)) ||
        fullBodySessions.find(s => !processedIndices.has(s.index)) || null;
    } else if (slot === 'lower_primary') {
      // For lower_primary, prefer light lower unless protocol is neural_speed
      if (ctx.protocol === 'neural_speed' && heavyLowerSessions.length > 0) {
        sessionToPlace = heavyLowerSessions.find(s => !processedIndices.has(s.index)) || null;
      } else if (lightLowerSessions.length > 0) {
        sessionToPlace = lightLowerSessions.find(s => !processedIndices.has(s.index)) || null;
      } else if (lowerSessions.length > 0) {
        sessionToPlace = lowerSessions.find(s => !processedIndices.has(s.index)) || null;
      }
      
      // Special handling for durability on Saturday (must be light)
      if (day === 'sat' && ctx.protocol === 'durability' && sessionToPlace) {
        // Ensure it's a light lower session
        if (heavyLowerIntents.includes(sessionToPlace.session.intent)) {
          // Skip heavy lower on Saturday
          sessionToPlace = lightLowerSessions.find(s => !processedIndices.has(s.index)) || null;
        }
      }
    }
    
    if (sessionToPlace) {
      const { session, index, guardrailResult } = sessionToPlace;
      const finalSession = guardrailResult?.modifiedSession || session;
      
      const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
      const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
      
      placed.push({
        ...finalSession,
        day: dayName,
        isOptional: session.priority === 'optional',
        guardrailWarnings: warnings.length > 0 ? warnings : undefined,
        guardrailModifications: modifications.length > 0 ? modifications : undefined,
      });
      
      processedIndices.add(index);
    }
  }
  
  // Second pass: Assign optional slots
  for (const [weekday, slot] of Object.entries(strategy.slotsByDay)) {
    if (slot === 'none' || !slot.includes('optional')) continue; // Only process optional slots
    
    const day = weekday as Weekday;
    const dayName = WEEKDAY_TO_DAY[day];
    
    // Find session for this slot
    let sessionToPlace: { session: IntentSession; index: number; guardrailResult?: GuardrailResult } | null = null;
    
    if (slot === 'upper_optional') {
      sessionToPlace = upperSessions.find(s => !processedIndices.has(s.index)) ||
        fullBodySessions.find(s => !processedIndices.has(s.index)) || null;
    } else if (slot === 'lower_optional') {
      // Only light lower for optional slots, or full body
      sessionToPlace = lightLowerSessions.find(s => !processedIndices.has(s.index)) ||
        fullBodySessions.find(s => !processedIndices.has(s.index)) || null;
    } else if (slot === 'mobility_optional') {
      // Can use upper maintenance or light lower or full body
      sessionToPlace = upperSessions.find(s => !processedIndices.has(s.index)) ||
        lightLowerSessions.find(s => !processedIndices.has(s.index)) ||
        fullBodySessions.find(s => !processedIndices.has(s.index)) || null;
    }
    
    if (sessionToPlace) {
      const { session, index, guardrailResult } = sessionToPlace;
      const finalSession = guardrailResult?.modifiedSession || session;
      
      const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
      const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
      
      placed.push({
        ...finalSession,
        day: dayName,
        isOptional: true, // Optional slots are always optional
        guardrailWarnings: warnings.length > 0 ? warnings : undefined,
        guardrailModifications: modifications.length > 0 ? modifications : undefined,
      });
      
      processedIndices.add(index);
    }
  }
  
  // Handle any remaining sessions (shouldn't happen, but graceful fallback)
  for (let i = 0; i < intentSessions.length; i++) {
    if (processedIndices.has(i)) continue;
    
    const session = intentSessions[i];
    const guardrailResult = guardrails.find(g => g.sessionIndex === i);
    
    if (guardrailResult?.finalAction === 'skip') continue;
    
    const finalSession = guardrailResult?.modifiedSession || session;
    
    // Find first available slot in strategy
    const availableDay = Object.entries(strategy.slotsByDay).find(([_, slot]) => slot !== 'none')?.[0];
    const dayName = availableDay ? WEEKDAY_TO_DAY[availableDay as Weekday] : 'Wednesday';
    
    const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
    const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
    
    placed.push({
      ...finalSession,
      day: dayName,
      isOptional: session.priority === 'optional',
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
      guardrailModifications: modifications.length > 0 ? modifications : undefined,
    });
  }
  
  return placed;
}

/**
 * Legacy run-centric placement (backward compatibility)
 */
function assignSessionsLegacy(
  intentSessions: IntentSession[],
  primarySchedule: { longSessionDays: string[]; qualitySessionDays: string[]; easySessionDays: string[] },
  guardrails: GuardrailResult[]
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  
  // Run-centric template: Mon=Upper, Wed=Lower, Fri=Optional
  const UPPER_DAY = 'Monday';
  const LOWER_DAY = 'Wednesday';
  const OPTIONAL_DAY = 'Friday';
  
  // Guardrail: Never schedule heavy lower (neural/power) on Monday or Friday
  const heavyLowerIntents = ['LOWER_NEURAL', 'LOWER_POWER'];
  
  // Separate sessions by intent and priority
  const upperSessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  const lowerSessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  const fullBodySessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  const otherSessions: Array<{ session: IntentSession; index: number; guardrailResult?: GuardrailResult }> = [];
  
  const processedIndices = new Set<number>();
  
  for (let i = 0; i < intentSessions.length; i++) {
    const session = intentSessions[i];
    const guardrailResult = guardrails.find(g => g.sessionIndex === i);
    
    if (guardrailResult?.finalAction === 'skip') {
      processedIndices.add(i);
      continue;
    }
    
    if (isFullBodyIntent(session.intent)) {
      fullBodySessions.push({ session, index: i, guardrailResult });
    } else if (isUpperIntent(session.intent)) {
      upperSessions.push({ session, index: i, guardrailResult });
    } else if (isLowerIntent(session.intent)) {
      lowerSessions.push({ session, index: i, guardrailResult });
    } else {
      otherSessions.push({ session, index: i, guardrailResult });
    }
  }
  
  const heavyLowerSessions = lowerSessions.filter(({ session }) =>
    heavyLowerIntents.includes(session.intent)
  );
  const lightLowerSessions = lowerSessions.filter(({ session }) =>
    !heavyLowerIntents.includes(session.intent)
  );
  
  // 1. Assign first upper session to Monday
  if (upperSessions.length > 0) {
    const { session, index, guardrailResult } = upperSessions[0];
    const finalSession = guardrailResult?.modifiedSession || session;
    
    const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
    const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
    
    placed.push({
      ...finalSession,
      day: UPPER_DAY,
      isOptional: session.priority === 'optional',
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
      guardrailModifications: modifications.length > 0 ? modifications : undefined,
    });
    processedIndices.add(index);
  }
  
  // 2. Assign first lower session to Wednesday
  if (lowerSessions.length > 0) {
    const lowerToUse = lightLowerSessions.length > 0
      ? lightLowerSessions[0]
      : lowerSessions[0];
    
    const { session, index, guardrailResult } = lowerToUse;
    const finalSession = guardrailResult?.modifiedSession || session;
    
    const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
    const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
    
    placed.push({
      ...finalSession,
      day: LOWER_DAY,
      isOptional: session.priority === 'optional',
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
      guardrailModifications: modifications.length > 0 ? modifications : undefined,
    });
    processedIndices.add(index);
  }
  
  // 3. Assign third session to Friday
  const fridayEligibleSessions = [
    ...upperSessions.slice(1).map(({ session, index, guardrailResult }) => ({ session, index, guardrailResult, type: 'upper' })),
    ...lightLowerSessions.slice(1).map(({ session, index, guardrailResult }) => ({ session, index, guardrailResult, type: 'lower' })),
    ...fullBodySessions.map(({ session, index, guardrailResult }) => ({ session, index, guardrailResult, type: 'fullbody' })),
    ...otherSessions.map(({ session, index, guardrailResult }) => ({ session, index, guardrailResult, type: 'other' })),
  ].filter(({ index }) => !processedIndices.has(index))
    .filter(({ session }) => {
      if (isLowerIntent(session.intent) && heavyLowerIntents.includes(session.intent)) {
        return false;
      }
      return true;
    });
  
  if (fridayEligibleSessions.length > 0) {
    const { session, index, guardrailResult } = fridayEligibleSessions[0];
    const finalSession = guardrailResult?.modifiedSession || session;
    
    const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
    const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
    
    placed.push({
      ...finalSession,
      day: OPTIONAL_DAY,
      isOptional: session.priority === 'optional' || true,
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
      guardrailModifications: modifications.length > 0 ? modifications : undefined,
    });
    processedIndices.add(index);
  }
  
  // Process remaining sessions
  for (let i = 0; i < intentSessions.length; i++) {
    if (processedIndices.has(i)) continue;
    
    const session = intentSessions[i];
    const guardrailResult = guardrails.find(g => g.sessionIndex === i);
    
    if (guardrailResult?.finalAction === 'skip') continue;
    
    const finalSession = guardrailResult?.modifiedSession || session;
    
    let day: string;
    if (placed.filter(p => p.day === UPPER_DAY).length === 0) {
      day = UPPER_DAY;
    } else if (placed.filter(p => p.day === LOWER_DAY).length === 0) {
      day = LOWER_DAY;
    } else if (placed.filter(p => p.day === OPTIONAL_DAY).length === 0) {
      day = OPTIONAL_DAY;
    } else {
      day = LOWER_DAY;
    }
    
    const warnings = guardrailResult?.guardrails?.filter(g => g.severity === 'warn').map(g => g.message) || [];
    const modifications = guardrailResult?.guardrails?.filter(g => g.severity === 'modify').map(g => g.message) || [];
    
    placed.push({
      ...finalSession,
      day,
      isOptional: session.priority === 'optional',
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
      guardrailModifications: modifications.length > 0 ? modifications : undefined,
    });
  }
  
  return placed;
}
