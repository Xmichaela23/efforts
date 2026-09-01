/**
 * THE CHANGE-RULE LINE — §B5's ">10% week to week" flags, worded for the screen. [2026-09-01]
 *
 * ⛔ IT WORDS, IT DOES NOT DECIDE. Which buckets crossed the line is resolved on the spine
 * (`_shared/state-trend/assemble.ts`, `ViadaWeekChange`, against `WEEK_CHANGE_FLAG_PCT` in
 * `accessory-dosing/dose.ts`). This turns that list into the parts of one sentence and returns
 * null when there is no sentence. No percentage is computed or compared here.
 *
 * ⛔ TWO SILENCES, ONE OUTPUT. `comparable: false` (no logged work in the prior seven days — nothing
 * to measure against) and `moved: []` (a base existed and nothing crossed the line) both return
 * null. Neither is a sentence for the athlete; the server keeps them distinct so a surface that
 * wants to can tell them apart, and this one does not need to.
 *
 * ⚠️ Pulled out of `ViadaWeekCard.tsx` so the silence is pinned by a fixture without rendering React.
 */

export type ViadaWeekChange = {
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
