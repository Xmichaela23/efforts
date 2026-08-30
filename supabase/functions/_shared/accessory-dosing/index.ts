// ============================================================================
// ACCESSORY DOSING — sets per muscle per week, work sets per session.
//
// ⛔ THE UNIT CHANGE. `src/lib/assistance-menu.ts` counts REPS PER CATEGORY, which can express
// neither the growth driver (effective reps per muscle per week) nor the recovery cost (work sets
// per session). That file is the previous program's, it serves Strong Focus, its band and axis are correct, and
// ⛔ **it is not modified by this stage** — rule 0 keeps Strong Focus live until stage 6.
//
// ⛔ CLIENT-REACHABLE. `@shared/accessory-dosing` from React, `../_shared/accessory-dosing/index.ts`
// from an edge function. One implementation, read by both.
// ============================================================================

export * from './muscles.ts';
export * from './dose.ts';
export * from './ledger.ts';
