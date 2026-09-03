/**
 * THE COLLAPSED SPORT ROW — leads with the CHANGE, gated on confidence (2026-09-01, Round 3).
 *
 * ⚠️ The row shape (name · value · note) arrived 2026-09-03; the two sentence builders this file
 * used to export are gone with their only call site. Everything below still governs the WORDING.
 *
 * ⛔ ONE RULE FOR ALL FOUR SPORTS: lead with the subject; show a DIRECTION only where the server's
 * verdict already calls one (improving / sliding); otherwise show the number and the count and stop.
 * No invented threshold, no direction from a bare percentage. This is the same confidence gate the
 * cards use — `dirWord` maps only the two directional verdicts; needs_data / withheld / holding / null
 * all fall through to the count.
 *
 * ⛔ AND THE RIGHT POPULATION (the fault that told an athlete his running collapsed 22%):
 *   · RUN leads off the EASY-RUN group, not the pooled series — a hot/hilly quality run must not swing
 *     the easy-efficiency read. The caller passes the easy group's own direction / pct / count.
 *   · BIKE leads off EFFICIENCY (watts per heartbeat), the metric on the object, not power+FTP
 *     (resolved elsewhere — a second source this audit exists to remove).
 *   · STRENGTH is block-phase aware and NOT PR-based (Michael 2026-09-01: the program is form / bar
 *     speed / slow incremental gain under cross-training stress). One line per lift so every number
 *     shows; opening lists the working numbers, mid-block adds the creep since the block opened
 *     ("+5"). No PR flag; flat is fine. See `strengthGlance`.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthOfIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? '' : (MON[new Date(t).getUTCMonth()] ?? '');
}

/** Month at the start of the verdict window — asOf minus windowDays (bike efficiency carries windowDays). */
export function changeMonth(asOf: string | null | undefined, windowDays: number | null | undefined): string {
  if (!asOf || !(Number(windowDays) > 0)) return '';
  const t = Date.parse(`${String(asOf).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t) ? '' : monthOfIso(new Date(t - Number(windowDays) * 86_400_000).toISOString());
}

/** The month the coloured recent window opens — the first `recent` point's month (run groups carry no windowDays). */
export function sinceMonthFromSeries(series: ReadonlyArray<{ date: string; recent?: boolean }> | null | undefined): string {
  if (!Array.isArray(series) || series.length === 0) return '';
  const firstRecent = series.find((p) => p.recent) ?? series[0];
  return monthOfIso(firstRecent?.date);
}

/** The direction word the verdict supports, or '' when it supports none (confidence gate). */
export function dirWord(verdict: string | null | undefined): 'up' | 'down' | '' {
  if (verdict === 'improving') return 'up';
  if (verdict === 'sliding') return 'down';
  return '';
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
 */
export type SportRow = {
  name: string;
  value: string;
  note?: string;
  /** Direction glyph beside the value (↑ / ↓) — only when the verdict can call one; never for holding / withheld. */
  arrow?: string;
  arrowCls?: string;
};

/**
 * Median of the last `n` values — the headline rule for a spine series (2026-09-03, Michael: "based on
 * whatever it's based on, for the most recent runs"): never whichever point came last (one warm-up was
 * the headline over 22 runs). Shared by the open run card and the closed run row so both print ONE number.
 */
export function recentMedian(values: number[], n = 5): number | null {
  const s = values.slice(-n).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
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

/**
 * `efficiencySummary`, split into columns. The confidence gate is unchanged: a DIRECTION only where
 * the server's verdict already calls one, otherwise the count. What moves is where each part sits.
 *
 * ⚠️ With no real value the COUNT becomes the value — better a count in the number column than an
 * empty one. That is the same fallback the sentence form had, kept.
 */
export function efficiencyRow(args: {
  label: string;
  value?: string | null;
  verdict: string | null | undefined;
  pctChange: number | null | undefined;
  sampleCount: number | null | undefined;
  sinceMonth: string;
  noun: string;
}): SportRow {
  const dir = dirWord(args.verdict);
  const n = Number(args.sampleCount) || 0;
  const directional = !!dir && args.pctChange != null && Number.isFinite(args.pctChange);
  const change = directional
    ? `${dir} ${Math.abs(Math.round(args.pctChange as number))}%${args.sinceMonth ? ` since ${args.sinceMonth}` : ''}`
    : `${n} ${args.noun}${n === 1 ? '' : 's'}`;
  const value = (args.value ?? '').trim();
  if (value) return { name: args.label, value, note: change };
  return { name: args.label, value: change };
}
