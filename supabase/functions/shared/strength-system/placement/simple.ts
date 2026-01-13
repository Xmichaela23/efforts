// ============================================================================
// SIMPLE PLACEMENT POLICY
// 
// Assigns intents to fixed days: Lower → Monday, Upper → Wednesday, Lower → Friday
// This matches the current behavior of the strength overlay.
// 
// TODO: Replace with smarter policies (long-session-dominant, quality-dominant, etc.)
// Placement behavior is keyed off normalized primarySchedule, not discipline-specific
// ============================================================================

import {
  PlacementPolicy,
  IntentSession,
  PlacedSession,
  GuardrailResult,
} from '../protocols/types.ts';
import { isLowerIntent, isUpperIntent, isFullBodyIntent } from '../protocols/intent-taxonomy.ts';

export const simplePlacementPolicy: PlacementPolicy = {
  id: 'balanced',
  name: 'Balanced',
  description: 'Lower body on Monday and Friday, upper body on Wednesday.',
  assignSessions: assignSessions,
};

function assignSessions(
  intentSessions: IntentSession[],
  primarySchedule: { longSessionDays: string[]; qualitySessionDays: string[]; easySessionDays: string[] },
  guardrails: GuardrailResult[]
): PlacedSession[] {
  const placed: PlacedSession[] = [];
  
  // Simple assignment: first lower → Monday, first upper → Wednesday, second lower → Friday
  let mondayAssigned = false;
  let wednesdayAssigned = false;
  let fridayAssigned = false;
  
  for (let i = 0; i < intentSessions.length; i++) {
    const session = intentSessions[i];
    const guardrailResult = guardrails.find(g => g.sessionIndex === i);
    
    // Skip if guardrails say to skip
    if (guardrailResult?.finalAction === 'skip') {
      continue;
    }
    
    // Use modified session if guardrails modified it
    const finalSession = guardrailResult?.modifiedSession || session;
    
    let day: string;
    let isOptional = session.priority === 'optional';
    
    // Assign based on intent
    if (isFullBodyIntent(session.intent)) {
      // Full body goes to Monday
      day = 'Monday';
      mondayAssigned = true;
    } else if (isLowerIntent(session.intent)) {
      // Lower body: first goes to Monday, second to Friday
      if (!mondayAssigned) {
        day = 'Monday';
        mondayAssigned = true;
      } else {
        day = 'Friday';
        fridayAssigned = true;
      }
    } else if (isUpperIntent(session.intent)) {
      // Upper body goes to Wednesday
      day = 'Wednesday';
      wednesdayAssigned = true;
    } else {
      // Fallback: assign in order
      if (!mondayAssigned) {
        day = 'Monday';
        mondayAssigned = true;
      } else if (!wednesdayAssigned) {
        day = 'Wednesday';
        wednesdayAssigned = true;
      } else {
        day = 'Friday';
        fridayAssigned = true;
      }
    }
    
    // Collect warnings and modifications from guardrails
    const warnings: string[] = [];
    const modifications: string[] = [];
    
    if (guardrailResult) {
      guardrailResult.guardrails.forEach(g => {
        if (g.severity === 'warn') {
          warnings.push(g.message);
        } else if (g.severity === 'modify') {
          modifications.push(g.message);
        }
      });
    }
    
    placed.push({
      ...finalSession,
      day,
      isOptional,
      guardrailWarnings: warnings.length > 0 ? warnings : undefined,
      guardrailModifications: modifications.length > 0 ? modifications : undefined,
    });
  }
  
  return placed;
}
