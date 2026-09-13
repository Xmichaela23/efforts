/**
 * ═══ THE PLAN LINE — COMPOSED ONCE, PRINTED EVERYWHERE ═════════════════════════════════════════
 *
 * "Standard Focus · week 2 of 12". The line that says which plan is running and where in it this
 * week sits. Performance prints it on the lift header and the run, ride and swim cards; State prints
 * it above the strength numbers; Today prints its position half after the date.
 *
 * ⛔ IT HAD FOUR COMPOSERS AND THREE GRAMMARS (audit 2026-09-12). `workout-detail` stamped
 * "Standard Focus · week 2 of 12"; `session-detail/build.ts buildWeekLabel` built "Standard Focus ·
 * week 2 · Build" off the fact packet, where 'Build' was an intent word defaulted before any
 * evidence and printed as if the plan had said it; `StatePerformanceSection blockContextLine`
 * composed "week 2 of 12" on the phone with no plan name at all; and `get-week/week-label.ts` plus
 * a `· Week {n}` concatenated on the phone made "Fri, Sep 12 · Week 3". Same fact, four answers.
 *
 * ⛔ SO THE WORDS LIVE HERE AND NOWHERE ELSE. Every server that can answer the question stamps the
 * string this file returns, and every screen prints what it was handed. A screen that wants a
 * different shape does not get to build one — this function changes, and all of them move together.
 * ⚠️ THE WORDS ARE APPROVED (2026-09-12, `docs/COPY-APPROVAL-2026-09-12.md`). Lower-case "week", a
 * middle dot with spaces around it, and the plan's length when the plan states one. No phase word:
 * the plan's own phase names are half internal and the athlete never chose that vocabulary.
 */

/** Just the position — "week 3 of 12", or "week 3" when the plan does not state a length. */
export function weekPosition(weekIndex: number | null | undefined, blockWeeks: number | null | undefined): string | null {
  const week = Number(weekIndex);
  // ⚠️ NO WEEK = NO LINE. The server nulls the week before a plan starts and after it ends, and
  // there is nothing honest to say about position then — the row says nothing rather than "week 1".
  if (!Number.isFinite(week) || week < 1) return null;
  const weeks = Number(blockWeeks);
  return Number.isFinite(weeks) && weeks > 0 ? `week ${week} of ${weeks}` : `week ${week}`;
}

/** The whole line — "Standard Focus · week 2 of 12", or the position alone when the plan is unnamed. */
export function planLine(input: {
  planName: string | null | undefined;
  weekIndex: number | null | undefined;
  blockWeeks: number | null | undefined;
}): string | null {
  const pos = weekPosition(input.weekIndex, input.blockWeeks);
  if (pos == null) return null;
  const name = typeof input.planName === 'string' ? input.planName.trim() : '';
  return name ? `${name} · ${pos}` : pos;
}
