// Shared narrative-reasoning core — barrel. Single-sources the LOGIC (the 7 universal rules as a prompt
// scaffold + the validator suite), parameterized by per-discipline adapters. Each analyzer injects
// buildReasoningScaffold(adapter, packet) into its EXISTING prompt and runs validateNarrative in its
// existing retry loop — assembly is NOT unified (work-order guardrail #1).
// Standard: docs/SPEC-universal-narrative-inference.md · Work order: docs/WORK-ORDER-narrative-core.md.

export type { Discipline, DisciplineAdapter, NarrativeContext, AnchorSet, SignalFlag, NotableLeadSignal, ValidationResult, ValidationFailure, DisciplineVerdict } from './types.ts';
export { buildReasoningScaffold } from './scaffold.ts';
export { validateNarrative } from './validate.ts';
export { runGuardedNarrative, resolveGuardedNarrative, type RejectionLogEntry } from './orchestrate.ts';
export { runAdapter } from './adapters/run.ts';
export { rideAdapter } from './adapters/ride.ts';
export { strengthAdapter } from './adapters/strength.ts';
export { swimAdapter } from './adapters/swim.ts';
export { coachAdapter } from './adapters/coach.ts';
