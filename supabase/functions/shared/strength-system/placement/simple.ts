/**
 * NOT USED BY TRIATHLON PLAN GENERATION.
 *
 * Triathlon plans route through generate-combined-plan/week-builder.ts, which uses the
 * optimizer-derived strength_optimizer_slots and athlete-pinned strength_preferred_days
 * (STRENGTH-PROTOCOL.md §6, day-agnostic). This file's `simplePlacementPolicy` is consumed
 * only by `generate-run-plan/strength-overlay.ts:631` for run-only plans (Hal Higdon /
 * Jack Daniels methodologies, which anchor on specific weekdays per the methodology
 * convention).
 *
 * Day-agnostic conventions in the triathlon protocol do not apply here — the run methodologies
 * legitimately prescribe specific weekday patterns. The dead import in
 * generate-combined-plan/session-factory.ts has been removed; no tri-plan code path reaches
 * `simplePlacementPolicy.assignSessions`.
 */

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
} from './strategy.ts';
import type { Weekday, Slot, PlacementContext } from './types.ts';

const SUN_RING: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function computeRunDaysFromPrimary(primarySchedule: {
  longSessionDays: string[];
  qualitySessionDays: string[];
  easySessionDays: string[];
}): Weekday[] {
  const set = new Set<Weekday>();
  for (const d of primarySchedule.longSessionDays) set.add(normalizeWeekday(d));
  for (const d of primarySchedule.qualitySessionDays) set.add(normalizeWeekday(d));
  for (const d of primarySchedule.easySessionDays) set.add(normalizeWeekday(d));
  return SUN_RING.filter(d => set.has(d));
}

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
    injuryHotspots?: string[];
    brickDays?: string[];
    hardEnduranceDays?: string[];
  }
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  
  // If placement context is provided, use methodology-aware strategy
  if (placementContext?.methodology) {
    return assignSessionsWithStrategy(
      intentSessions,
      primarySchedule,
      guardrails,
      placementContext as {
        methodology: 'hal_higdon_complete' | 'jack_daniels_performance';
        protocol?: string;
        strengthFrequency?: number;
        noDoubles?: boolean;
        injuryHotspots?: string[];
      }
    );
  }
  
  // ⛔ NO FALLBACK. A missing methodology is a caller bug, not a week to guess at — see the deleted
  // `assignSessionsLegacy` note below. Both live callers always supply one, so reaching here means an
  // invariant broke upstream, and the honest move is to say so rather than quietly emit a hardcoded
  // Mon/Wed/Fri week that nobody asked for. (Same shape as the SCHEDULE_GRIDLOCK_* throws the
  // collision resolver used to carry — SPEC-week-solver §5.2a.)
  throw new Error(
    'PLACEMENT_NO_METHODOLOGY: strength placement was called without a methodology. ' +
    'generate-run-plan derives one from `approach` (400s on anything unrecognised) and adapt-plan ' +
    'sets one unconditionally — so this is an upstream invariant break, not a case to default.',
  );
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
    injuryHotspots?: string[];
    brickDays?: string[];
    hardEnduranceDays?: string[];
  }
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  
  // Build placement context
  const qualityDays: Weekday[] = primarySchedule.qualitySessionDays.map(normalizeWeekday);
  const longRunDay: Weekday = primarySchedule.longSessionDays.length > 0
    ? normalizeWeekday(primarySchedule.longSessionDays[0])
    : 'sun';
  const runDays = computeRunDaysFromPrimary(primarySchedule);

  const ctx: PlacementContext = {
    methodology: placementContext.methodology,
    protocol: (placementContext.protocol || 'durability') as PlacementContext['protocol'],
    strengthFrequency: (placementContext.strengthFrequency || 2) as 0 | 1 | 2 | 3 | 4,
    noDoubles: placementContext.noDoubles || false,
    qualityDays,
    longRunDay,
    runDays: runDays.length > 0 ? runDays : undefined,
    injuryHotspots: placementContext.injuryHotspots ?? [],
    brickDays: (placementContext.brickDays ?? []).map(normalizeWeekday),
    hardEnduranceDays: (placementContext.hardEnduranceDays ?? []).map(normalizeWeekday),
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

// ⛔ `assignSessionsLegacy` DELETED 2026-07-27 — a hardcoded Mon-upper / Wed-lower / Fri-optional
// grid, labelled "legacy run-centric placement (backward compatibility)".
//
// It was UNREACHABLE, and the guard that makes it so is three files away: `generate-run-plan`
// rejects any unrecognised `approach` with a 400 (`index.ts:236` switch, default branch) BEFORE
// methodology is computed, so `mapApproachToMethodology` always returns one of the two real
// methodologies; `adapt-plan` sets methodology unconditionally from a ternary with a default. The
// falsy-methodology case this fallback existed for cannot occur.
//
// ⛔ DELETED RATHER THAN LEFT, and the reason is not maintenance cost. A hardcoded weekday grid
// sitting inside a module scheduled for replacement is a PORTING TRAP: the next person wiring the
// solver finds a function labelled "fallback" and carries it across as one. The backward-compatibility
// label was doing the damage — it was BC for a caller shape the 400 guard makes impossible.
