/**
 * ⛔ THE FOUR LIFTS THE APP HOLDS A TRACKED MAX ON. ONE LIST, READ BY THE SERVER AND THE CLIENT.
 * SPEC-strength-language, Step 7.
 *
 * ── THIS IS A THIRD QUESTION, NOT A THIRD ANSWER TO THE FIRST ───────────────────────────────────
 * The strength card asks three genuinely different things, and they are SUPPOSED to have different
 * answers. Forcing them equal would be the mistake, not the fix:
 *
 *   1. **"May we coach this?"** → `capabilitiesForExercise(name).coached`, ~16 names (the four lifts
 *      PLUS the variants that fill their slots: Front Squat, Close Grip Bench, Sumo/Trap Bar
 *      Deadlift, Push Press, Military Press). Wide ON PURPOSE — if the block prescribes front squats
 *      this cycle, that IS the squat slot and it earns the previous program language.
 *   2. **"Do we chart a max for it?"** → this list, exactly four. In the previous program you hold a TRAINING MAX on
 *      squat, bench, deadlift and press — four numbers, one per slot. A Front Squat filling the squat
 *      slot does not earn a fifth tracked max; it is the squat slot, expressed differently.
 *   3. **"Does it move the discipline verdict?"** → `PRIMARY_LIFTS` (server,
 *      `_shared/state-trend/strength.ts`). See the warning below — that one is NOT settled.
 *
 * ⚠️ SO "A FRONT SQUAT IS COACHED BUT NOT CHARTED" IS CORRECT, NOT A BUG. It is the same
 * `MovementGroup`-vs-`MovementPattern` lesson `CLAUDE.md` records: same data, different question,
 * and the deliverable is a second accessor beside the first — not one list bullied into serving both.
 *
 * ── WHAT WAS ACTUALLY WRONG, AND IS WHAT THIS FILE FIXES ────────────────────────────────────────
 * The four-name list existed TWICE, byte-identical, in two files that must agree — `BIG_4_LIFTS` in
 * `_shared/state-trend/assemble.ts` (which decides that only these canonicals get a server-emitted
 * chart series) and `BIG_4_CHART_LIFTS` in `StatePerformanceSection.tsx` (which decides which rows
 * render a sparkline). The client's own comment said "Matches BIG_4_LIFTS in assemble.ts" — a comment
 * is not a constraint. If either had gained a name alone, the result is the D-346 fault: the client
 * renders a sparkline slot the server never fills (empty chart), or the server ships a series nothing
 * draws. One list now, imported by both.
 *
 * ⛔ DO NOT ADD A NAME HERE WITHOUT THE SERVER. Membership decides BOTH whether a series is emitted
 * and whether it is drawn. Adding a fifth name gives it a chart only because the same constant feeds
 * the emitter — which is the point of this file, and the reason it may not be forked back apart.
 */

/**
 * Canonical keys (`canonicalize()` form) for the four lifts that carry a tracked training max.
 *
 * ⚠️ Deliberately NOT derived from `MAIN_BARBELL_LIFTS`. That set answers question 1 and includes slot
 * variants; this one answers question 2 and must stay at four. Deriving one from the other is how
 * they would silently merge back into a single list.
 */
export const TRACKED_MAX_LIFTS: ReadonlySet<string> = new Set([
  'squat',
  'bench_press',
  'deadlift',
  'overhead_press',
]);

/** Does this canonical lift carry a tracked training max (and therefore a charted 12-week series)? */
export function isTrackedMaxLift(canonical: string): boolean {
  return TRACKED_MAX_LIFTS.has(String(canonical || '').toLowerCase());
}
