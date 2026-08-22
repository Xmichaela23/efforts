// ============================================================================
// THE ENDURANCE SESSION LIBRARY — the public face.
//
// The mirror of `shared/strength-system/loading/wendler-531.ts`: pure, no weeks, no days, no plan
// shape. It feeds the Standing Plan AND every pivot, which is why it is the first thing built.
//
// ⛔ CLIENT-REACHABLE. Import it as `@shared/endurance-library` from the React client and as
// `../_shared/endurance-library/index.ts` from an edge function. Same module, one implementation.
// `endurance-library.client.test.ts` proves the client entry point actually resolves and runs it.
// ============================================================================

export * from './types.ts';
export * from './source-rules.ts';
export * from './anchors.ts';
export * from './generate.ts';
