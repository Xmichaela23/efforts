/**
 * THE CHANGE-RULE LINE — §B5's ">10% week to week" flags, worded for the screen. [2026-09-01]
 *
 * ⛔ IT WORDS, IT DOES NOT DECIDE. Which buckets crossed the line, and WHICH TWO WEEKS were compared,
 * is resolved on the spine (`_shared/state-trend/assemble.ts`, `ViadaWeekChange`, against
 * `WEEK_CHANGE_FLAG_PCT` in `accessory-dosing/dose.ts`). This turns that list into the parts of one
 * sentence and returns null when there is no sentence. No percentage is computed or compared here.
 *
 * ⛔ CLOSED PLAN WEEKS ONLY (2026-09-01). The server compares last week against the week before
 * while the current plan week is open (`basis: 'last_week'`), and this week against last only on
 * the week's final day (`basis: 'this_week'`). The lead phrase follows the basis so the sentence
 * never says "this week" over a week that is not finished. ⚠️ WHEN THE LINE IS ABSENT MID-WEEK
 * BECAUSE THERE ARE NOT TWO CLOSED WEEKS BEHIND IT, THAT IS CORRECT, NOT MISSING.
 *
 * ⛔ TWO SILENCES, ONE OUTPUT. `comparable: false` (one of the two weeks holds no logged work —
 * nothing to measure against) and `moved: []` (a base existed and nothing crossed the line) both
 * return null. Neither is a sentence for the athlete; the server keeps them distinct so a surface
 * that wants to can tell them apart, and this one does not need to.
 *
 * ⚠️ Pulled out of `ViadaWeekCard.tsx` so the silence is pinned by a fixture without rendering React.
 */

export type ViadaWeekChange = {
  /** Which two closed weeks: `'this_week'` (this vs last, final day only) or `'last_week'` (last vs the week before). */
  basis?: 'this_week' | 'last_week';
  from?: { since: string; until: string };
  to?: { since: string; until: string };
  priorSince: string;
  priorUntil: string;
  comparable: boolean;
  moved: Array<{
    kind: 'work_sets' | 'muscle_sets' | 'pattern_heavy' | 'pattern_speed';
    key: string;
    from: number;
    to: number;
    pctChange: number;
  }>;
};

/** A real minus sign, as the rest of the State screen prints one ("form −13"). */
const signed = (pct: number) => (pct < 0 ? `−${Math.abs(pct)}%` : `+${pct}%`);

/**
 * The lead phrase for the basis the server chose. ⛔ A payload with no `basis` is a pre-plan-week
 * one (rolling windows) and gets the rolling wording it was built with — never "last week" over a
 * rolling window.
 */
export function weekChangeLead(change: ViadaWeekChange | null | undefined): string {
  switch (change?.basis) {
    case 'this_week': return 'against last week';
    case 'last_week': return 'last week against the week before';
    default: return 'against the seven days before that';
  }
}

/**
 * The comma-joinable parts — `["chest sets +18%", "hinge speed reps −12%"]` — or null when nothing
 * should print. `label` is the caller's wording for a bucket; this file knows no muscle or pattern
 * names.
 */
export function weekChangeParts(
  change: ViadaWeekChange | null | undefined,
  label: (kind: ViadaWeekChange['moved'][number]['kind'], key: string) => string,
): string[] | null {
  if (!change || !change.comparable) return null;
  if (!Array.isArray(change.moved) || change.moved.length === 0) return null;
  return change.moved.map((m) => `${label(m.kind, m.key)} ${signed(m.pctChange)}`);
}
