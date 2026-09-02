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
 *   · STRENGTH leads off a lift with a CONFIDENT change; "up from" is the prior weekly reading, and it
 *     is two measured numbers, never a revived trend word (D-420).
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
 * An efficiency-style line: "{label} up 4% since Jul" when the verdict calls a direction; otherwise
 * "{label} · N {noun}s" (number/count, no claim). `sinceMonth` is already resolved by the caller
 * (from windowDays for bike, from the series for run) — '' omits the "since …" tail.
 */
export function efficiencySummary(args: {
  label: string;
  verdict: string | null | undefined;
  pctChange: number | null | undefined;
  sampleCount: number | null | undefined;
  sinceMonth: string;
  noun: string;
}): string {
  const dir = dirWord(args.verdict);
  const n = Number(args.sampleCount) || 0;
  if (dir && args.pctChange != null && Number.isFinite(args.pctChange)) {
    const pct = Math.abs(Math.round(args.pctChange));
    return `${args.label} ${dir} ${pct}%${args.sinceMonth ? ` since ${args.sinceMonth}` : ''}`;
  }
  return `${args.label} · ${n} ${args.noun}${n === 1 ? '' : 's'}`;
}

/**
 * The strength lead: "{lift} {latest}, up from {prior}" — two measured numbers, no verdict word
 * (D-420). `prior` is the previous weekly reading. Equal or absent → just the number.
 */
export function strengthSummary(name: string, latest: number | null | undefined, prior: number | null | undefined): string {
  const L = latest != null ? Math.round(latest) : null;
  if (L == null) return name;
  const P = prior != null ? Math.round(prior) : null;
  if (P == null || P === L) return `${name} ${L}`;
  return `${name} ${L}, ${L > P ? 'up' : 'down'} from ${P}`;
}

/**
 * Pick the strength lift that leads the collapsed line: the one with the largest CONFIDENT change
 * (a prior weekly reading exists and the two differ). No confident change anywhere → the strongest
 * current number, shown with NO delta (never a manufactured one). Returns null if there are no lifts.
 */
export function pickStrengthLead<T extends { displayName: string; latestE1rm: number | null; series?: ReadonlyArray<{ value: number }> }>(
  lifts: readonly T[],
): { name: string; latest: number | null; prior: number | null } | null {
  if (!lifts.length) return null;
  const withPrior = lifts.map((l) => {
    const s = l.series;
    const prior = s && s.length >= 2 ? s[s.length - 2].value : null;
    const delta = prior != null && l.latestE1rm != null ? Math.abs(l.latestE1rm - prior) : -1;
    return { l, prior, delta };
  });
  const moved = withPrior.filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  if (moved) return { name: moved.l.displayName, latest: moved.l.latestE1rm, prior: moved.prior };
  const strongest = lifts.reduce((a, b) => ((a.latestE1rm ?? 0) >= (b.latestE1rm ?? 0) ? a : b));
  return { name: strongest.displayName, latest: strongest.latestE1rm, prior: null };
}
