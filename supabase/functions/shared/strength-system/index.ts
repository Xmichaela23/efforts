// ============================================================================
// SHARED STRENGTH SYSTEM
// 
// Discipline-agnostic strength training protocol system.
// Used by: generate-run-plan, generate-cycling-plan, generate-triathlon-plan
// 
// Architecture:
// - Protocols generate intent sessions (no day assignment)
// - Placement policies assign intents to days
// - Guardrails validate and modify placement
// ============================================================================

// Re-export everything from protocols
export * from './protocols/intent-taxonomy.ts';
export * from './protocols/types.ts';

// Re-export will be added for placement and guardrails when implemented
// export * from './placement/policies.ts';
// export * from './guardrails/engine.ts';
