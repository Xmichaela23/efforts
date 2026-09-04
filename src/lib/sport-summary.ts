/**
 * THE COLLAPSED SPORT ROW — leads with the CHANGE, gated on confidence (2026-09-01, Round 3).
 *
 * ⚠️ The row shape (name · value · note) arrived 2026-09-03; the two sentence builders this file
 * used to export are gone with their only call site. Everything below still governs the WORDING.
 *
 * ⛔ ONE RULE FOR ALL FOUR SPORTS (2026-09-04, Michael: one absolute reference per metric): the endurance
 * rows print the LAST workout's number and the day it came from — TrainingPeaks' per-workout Efficiency
 * Factor — and no direction. The ↑→↓ arrow, the 28-day average and the percent-since were Garmin's rule
 * laid over a TrainingPeaks number; they are gone (the `efficiencyRow` / `dirWord` helpers with them).
 *
 * ⛔ THE RIGHT POPULATION still holds: the run number comes off the aerobic (easy-day) series, the bike off
 * steady rides only, so a hot/hilly quality run never becomes the headline.
 *   · STRENGTH is block-phase aware and NOT PR-based (Michael 2026-09-01: the program is form / bar
 *     speed / slow incremental gain under cross-training stress). One line per lift so every number
 *     shows; opening lists the working numbers, mid-block adds the creep since the block opened
 *     ("+5"). No PR flag; flat is fine. See `strengthGlance`.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2" — the day a per-workout number belongs to (TrainingPeaks names the workout its EF / Pa:Hr came from). */
export function fmtDayShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${MON[d.getUTCMonth()] ?? ''} ${d.getUTCDate()}`;
}

/**
 * ⛔ THE ROW SHAPE — ONE GRAMMAR FOR EVERY SPORT (2026-09-03, DESIGN_GUIDELINES "Layout Rules" §1).
 *
 * WHAT THIS REPLACED: `strengthGlance` and `efficiencySummary` returned SENTENCES, and each sport
 * composed its own — strength a list of "Name 160", run a pace with a heart rate, bike a heart rate
 * with a ride count, swim a count with a window. Four adjacent rows, four grammars, so the reader
 * re-learned the format on every row. That was the single largest readability cost on STATE.
 *
 * These return the SAME THREE SLOTS for every sport, so the renderer can put names in one column and
 * numbers in another and get two straight edges (rule 2):
 *
 *   name   — what this is. Left column, dim, lowercase.
 *   value  — the number the athlete came for. Right column, bright, one size up (rule 3).
 *   note   — the comparison, count or window. After the value, dim. Optional.
 *
 * ⚠️ THE STRING FORMS ARE NOT KEPT ALONGSIDE. `strengthGlance` / `efficiencySummary` had exactly one
 * caller each (StatePerformanceSection); the row forms replace that call site outright rather than
 * becoming a second vocabulary beside the first. Their tests move with them.
 *
 * ⛔ NO ARROW SLOT (2026-09-04). The ↑→↓ glyph was Garmin's three trend states on a TrainingPeaks number.
 * One reference per metric: the endurance rows print the last workout's number and its date; the open
 * card's line is the trend.
 */
export type SportRow = {
  name: string;
  value: string;
  note?: string;
};

/**
 * THE HEADLINE — the LAST workout's number (2026-09-04, Michael: one absolute reference per metric).
 * FIELD — TrainingPeaks: Efficiency Factor and Pa:Hr / Pw:Hr are per-workout numbers printed in the workout
 * summary; the dashboard trends them one dot per workout. Replaces the average of the last 28 days (Garmin's
 * window under a TrainingPeaks formula) which replaced the median of the last five (ours).
 * Shared by the open card and the closed row so both print ONE number. Null when there are no points.
 */
export function latestPoint<T extends { date: string; value: number }>(points: ReadonlyArray<T>): T | null {
  let best: T | null = null;
  for (const p of points) {
    if (!p || !Number.isFinite(p.value) || !p.date) continue;
    if (best == null || String(p.date).slice(0, 10) >= String(best.date).slice(0, 10)) best = p;
  }
  return best;
}

/**
 * `strengthGlance`, split into columns. Same rules — block-phase aware, NOT PR-based, one row per
 * lift, flat is fine — only the packaging changes: the lift name is the `name`, its working number
 * the `value`, and the creep since the block opened the `note`.
 */
export function strengthGlanceRows(
  lifts: ReadonlyArray<{ displayName: string; latestE1rm: number | null; series?: ReadonlyArray<{ value: number; week?: number }> }>,
  planWeek: number | null | undefined,
): SportRow[] {
  const primary = lifts.filter((l) => l.latestE1rm != null).slice(0, 6);
  if (!primary.length) return [];

  const blockStartValue = (l: { series?: ReadonlyArray<{ value: number; week?: number }> }): number | null => {
    const pts = (l.series ?? []).filter((p) => typeof p.week === 'number');
    if (!pts.length) return null;
    return pts.reduce((a, b) => ((a.week as number) <= (b.week as number) ? a : b)).value;
  };

  const opening = !(Number(planWeek) > 1);
  return primary.map((l) => {
    const n = Math.round(l.latestE1rm as number);
    if (opening) return { name: l.displayName, value: String(n) };
    const bs = blockStartValue(l);
    const d = bs != null ? n - Math.round(bs) : 0;
    // Flat shows the number alone — no "+0", and no marker for a week that did not move.
    return d !== 0
      ? { name: l.displayName, value: String(n), note: `${d > 0 ? '+' : '-'}${Math.abs(d)}` }
      : { name: l.displayName, value: String(n) };
  });
}
