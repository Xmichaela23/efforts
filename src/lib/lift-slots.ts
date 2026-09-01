/**
 * ⛔⛔ THE FOUR SLOTS AND THE MOVEMENTS THAT FILL THEM. ONE MAP, READ BY THE SERVER AND THE CLIENT.
 *
 * Ruled by Michael 2026-09-01 (FIXLIST 2b): a trap bar deadlift and a conventional deadlift fill ONE
 * slot. `SOURCE-viada-hybrid-athlete.md:130` lists deadlift, paused deadlift, sumo deadlift and trap
 * bar deadlift as four movements filling the PRIMARY HINGE — the programme does not distinguish them.
 *
 * ⛔ THIS FILE HAS NO IMPORTS, DELIBERATELY, and lives in `src/lib/` for the reason
 * `tracked-max-lifts.ts` records: the server already imports client libs
 * (`_shared/state-trend/assemble.ts:22`), and a constant that must agree across the two sides has to
 * exist exactly once. The last time a four-name list existed twice — `BIG_4_LIFTS` in `assemble.ts`
 * and `BIG_4_CHART_LIFTS` on the client — the client's own comment said "matches the server", and a
 * comment is not a constraint.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────────
 * ⚠️ It is NOT `TRACKED_MAX_LIFTS` (which four lifts carry a training max — exactly four, and a trap
 * bar does not earn a fifth). It is NOT `capabilitiesForExercise().coached` (may we use programme
 * language for this movement — ~16 names). It is NOT `PRIMARY_LIFTS` (does this lift move the
 * discipline read). Those are three different questions with three different right answers, and this
 * is a FOURTH: **when two logged movements are the same slot, which slot is it.**
 *
 * ⛔ FRONT SQUAT IS DELIBERATELY ABSENT, AND ITS ABSENCE IS CORRECT — READ THIS BEFORE ADDING IT.
 * `front_squat` is not in `PRIMARY_LIFTS`, so it never reaches `computeE1rmBand` and cannot
 * double-count the squat slot the way the trap bar double-counts the hinge. It also carries no
 * tracked max (`TRACKED_MAX_LIFTS`), so it draws no card of its own to fold. Adding it here today
 * would change NOTHING and would only suggest a fault that does not exist. If `PRIMARY_LIFTS` ever
 * gains it, add it here in the same change.
 */

/** Variant canonical → the slot canonical it fills. */
export const VARIANT_SLOT_BY_CANONICAL: Readonly<Record<string, string>> = {
  trap_bar_deadlift: 'deadlift',
};

/** The slot a canonical fills — itself, unless it is a known variant. */
export function slotForCanonical(canonical: string): string {
  const k = String(canonical || '').toLowerCase();
  return VARIANT_SLOT_BY_CANONICAL[k] ?? k;
}
