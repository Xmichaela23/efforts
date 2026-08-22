// ============================================================================
// THE STRENGTH GRID — pattern × category × intent, as an accessor over vocabulary that exists.
//
// ⛔ NOT A NEW STRENGTH SYSTEM. `MovementPattern` is Q-181's; the equipment gate is
// `src/lib/strength-gear.ts`; `StrengthIntent` in `shared/strength-system/protocols/intent-taxonomy.ts`
// is a different axis and is untouched. See `taxonomy.ts`'s header for the four-accessor picture.
//
// ⛔ CLIENT-REACHABLE. Import as `@shared/strength-grid` from React and as
// `../_shared/strength-grid/index.ts` from an edge function. One implementation, read by both.
// ============================================================================

export * from './intents.ts';
export * from './taxonomy.ts';
export * from './grid.ts';
