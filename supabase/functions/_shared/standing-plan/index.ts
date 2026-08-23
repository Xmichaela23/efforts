// ============================================================================
// THE STANDING PLAN — stage 4, slice 1: the strength-leading runner frame.
//
// ⛔ CLIENT-REACHABLE. `@shared/standing-plan` from React, `../_shared/standing-plan/index.ts` from
// an edge function. One implementation, read by both.
//
// ⛔ IT IS NOT A FIFTH `generate-*` SIBLING. It composes a week from resolved inputs; fetching,
// persistence and routing stay in the edge function.
// ============================================================================

export * from './working-number.ts';
export * from './frames.ts';
export * from './session-vocabulary.ts';
export * from './progression.ts';
export * from './compose.ts';
export * from './frame-resolver.ts';
export * from './demonstrated-history.ts';
export * from './plan-row.ts';
export * from './restate.ts';
