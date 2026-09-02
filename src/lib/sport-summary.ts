/**
 * THE COLLAPSED SPORT LINE — leads with the CHANGE, gated on confidence (2026-09-01, Round 3).
 *
 * ⛔ ONE RULE FOR ALL FOUR LINES: lead with the subject; show a DIRECTION only where the server's
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
 *     speed / slow incremental gain under cross-training stress). Opening week lists the working
 *     numbers; mid-block leads the lift that moved most "since week N". No PR flag; flat is fine.
 *     See `strengthGlance`.
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
 * An endurance line that ALWAYS LEADS WITH THE REAL NUMBER (2026-09-01, Michael: the count-only line
 * "told the user nothing"). `value` is the meaningful current read in units the athlete feels — run
 * "8:30/mi at 145 bpm", bike "210 W at 150 bpm". Then: the change when the verdict calls a direction
 * ("· up 4% since Jul"), otherwise the count ("· 18 runs"). Never a bare count with no number, never
 * an invented direction.
 * ⚠️ Falls back to the old count-led form only when `value` is empty (not enough recent data to state
 * a number) — better a count than nothing.
 */
export function efficiencySummary(args: {
  label: string;
  value?: string | null;
  verdict: string | null | undefined;
  pctChange: number | null | undefined;
  sampleCount: number | null | undefined;
  sinceMonth: string;
  noun: string;
}): string {
  const dir = dirWord(args.verdict);
  const n = Number(args.sampleCount) || 0;
  const change = dir && args.pctChange != null && Number.isFinite(args.pctChange)
    ? `${dir} ${Math.abs(Math.round(args.pctChange))}%${args.sinceMonth ? ` since ${args.sinceMonth}` : ''}`
    : `${n} ${args.noun}${n === 1 ? '' : 's'}`;
  const value = (args.value ?? '').trim();
  if (value) return `${value} · ${change}`;
  return `${args.label} · ${change}`;
}

/**
 * THE STRENGTH GLANCE — block-phase aware, and NOT built on PRs (2026-09-01, Michael: the program
 * from the book is "about form and speed and slow incremental gain… you've got so many cross
 * stressors", not personal records). No ↑ marker, no all-time-high flag — a flat week is the design,
 * not a miss.
 *
 * · OPENING (no active plan, or plan week ≤ 1): just the working numbers — "Deadlift 185 · Squat 125
 *   · Bench 160". These are whatever the athlete is starting from: a fresh pretest if they tested, or
 *   their carried baselines if they skipped it (Michael 2026-09-01: some jump in without testing). We
 *   never LABEL it "tested", because we don't know that it was.
 * · MID-BLOCK (plan week > 1): the lift that moved MOST since the block opened — "Deadlift 185 · +5
 *   since week 1". A drop is shown honestly ("-5"); no movement reads "even since week 1", never a
 *   manufactured gain. The block-start reading is the earliest current-block point (smallest week
 *   index the series carries); "since week N" states that week, so it is true whether the block
 *   opened on a test or on a baseline.
 *
 * Empty → null (caller falls back to the session count).
 */
export function strengthGlance(
  lifts: ReadonlyArray<{ displayName: string; latestE1rm: number | null; series?: ReadonlyArray<{ value: number; week?: number }> }>,
  planWeek: number | null | undefined,
): string | null {
  const primary = lifts.filter((l) => l.latestE1rm != null);
  if (!primary.length) return null;
  const numberOf = (l: { latestE1rm: number | null }) => Math.round(l.latestE1rm as number);

  // The block-start reading = the earliest CURRENT-BLOCK point (smallest week index the series holds).
  // Points from an older block carry no week and are skipped, so this never compares across blocks.
  const blockStart = (l: { series?: ReadonlyArray<{ value: number; week?: number }> }): { week: number; value: number } | null => {
    const pts = (l.series ?? []).filter((p) => typeof p.week === 'number');
    if (!pts.length) return null;
    const first = pts.reduce((a, b) => ((a.week as number) <= (b.week as number) ? a : b));
    return { week: first.week as number, value: first.value };
  };

  const week = Number(planWeek);
  // Opening: no plan, or the first week — list the numbers the athlete is starting from.
  if (!(week > 1)) {
    return primary.slice(0, 3).map((l) => `${l.displayName} ${numberOf(l)}`).join(' · ');
  }

  // Mid-block: lead the lift that moved most vs its own block start.
  const moved = primary
    .map((l) => {
      const bs = blockStart(l);
      return { l, week: bs?.week ?? null, delta: bs ? numberOf(l) - Math.round(bs.value) : null };
    })
    .filter((x) => x.delta != null)
    .sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number))[0];

  if (!moved) {
    // In-block but nothing to compare against yet — the strongest number, no invented delta.
    const top = primary.reduce((a, b) => (numberOf(a) >= numberOf(b) ? a : b));
    return `${top.displayName} ${numberOf(top)}`;
  }
  const d = moved.delta as number;
  const w = moved.week ?? 1;
  const since = d === 0 ? `even since week ${w}` : `${d > 0 ? '+' : '-'}${Math.abs(d)} since week ${w}`;
  return `${moved.l.displayName} ${numberOf(moved.l)} · ${since}`;
}
