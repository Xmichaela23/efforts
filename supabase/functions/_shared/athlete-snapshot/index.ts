// =============================================================================
// ATHLETE SNAPSHOT — Public API
// =============================================================================
// Single entry point. Computes all 5 sections and returns the snapshot.
// Every screen in the app reads from this. Nothing else computes athlete state.
// =============================================================================

export type { AthleteSnapshot, LedgerDay, PlannedSession, ActualSession, SessionMatch } from './types.ts';
export type { EnduranceMatchQuality, StrengthMatchQuality } from './types.ts';
export type { AthleteIdentity, PlanPosition, BodyResponse, Coaching } from './types.ts';

export { buildDailyLedger } from './daily-ledger.ts';
export { buildIdentity, buildPlanPosition } from './identity.ts';
export { buildBodyResponse, buildSessionObservations } from './body-response.ts';
export type { BaselineNorms } from './body-response.ts';
export { snapshotToPrompt, generateCoaching, COACHING_SYSTEM_PROMPT } from './coaching.ts';
