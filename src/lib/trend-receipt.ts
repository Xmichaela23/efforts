// D-232 glass-box receipts for the STATE discipline-trend rows (RUN / BIKE / SWIM). A verdict + bare
// delta ("↑ improving +6.5%") is a black-box assertion: the athlete can't see it's a 6-week trend from
// 5 runs whose newest is 4 days old, so a real economy trend reads as a "now" claim (the 2026-07-02 RUN
// incident). The receipt cites window + sample count + recency so the number is falsifiable at a glance.
//
// Pure/presentational: fields (verdict, pctChange, sampleCount, newestAgeDays) come from the spine
// (classifyTrend → state_trends_v1). windowDays is the discipline constant (run 42, bike 56, swim 56).

export type Discipline = 'run' | 'bike' | 'swim' | 'strength';

/** "6wk" from 42, "8wk" from 56. */
export function windowLabel(days: number): string {
  return `${Math.max(1, Math.round(days / 7))}wk`;
}

/** "4d ago" / "today". Bare (the noun is already in the "5 runs" count) for row-width. Empty when unknown. */
export function recencyLabel(ageDays: number | null | undefined): string {
  if (ageDays == null) return '';
  if (ageDays <= 0) return 'today';
  return `${ageDays}d ago`;
}

/** "5 runs" / "1 ride" / "3 swims". */
export function unitLabel(discipline: Discipline, n: number): string {
  const u = discipline === 'run' ? 'run' : discipline === 'bike' ? 'ride' : discipline === 'swim' ? 'swim' : 'session';
  return `${n} ${u}${n === 1 ? '' : 's'}`;
}

/** Shared evidence tail: "over 6wk · 5 runs · last 4d ago". */
export function trendEvidence(args: {
  windowDays: number;
  sampleCount: number;
  newestAgeDays: number | null | undefined;
  discipline: Discipline;
}): string {
  const parts = [`over ${windowLabel(args.windowDays)}`, unitLabel(args.discipline, args.sampleCount)];
  const rec = recencyLabel(args.newestAgeDays);
  if (rec) parts.push(rec);
  return parts.join(' · ');
}

/**
 * Full receipt for a SINGLE-metric row (run / swim). e.g. "↑6.5% over 6wk · 5 runs · last 4d ago".
 * pctChange is the raw signed change; the verdict encodes direction, so we show |pct| with an arrow.
 */
export function trendReceipt(args: {
  verdict: string;
  pctChange: number | null;
  windowDays: number;
  sampleCount: number;
  newestAgeDays: number | null | undefined;
  discipline: Discipline;
  floor?: number; // minSessions floor for the needs_data message
}): string {
  const { verdict, pctChange, windowDays, sampleCount, discipline, floor = 3 } = args;
  const win = windowLabel(windowDays);
  if (verdict === 'needs_data') {
    return `Not enough data yet — ${unitLabel(discipline, sampleCount)} in ${win} (need ${floor})`;
  }
  const evidence = trendEvidence(args);
  const pct = pctChange == null ? null : Math.abs(pctChange);
  if (verdict === 'improving') return `↑${pct}% ${evidence}`;
  if (verdict === 'sliding' || verdict === 'declining') return `↓${pct}% ${evidence}`;
  return `Holding ${evidence}`; // holding / steady
}

/** One sub-trend headline for a MULTI-metric row (bike power/efficiency): "Power ↑3.6%". */
export function subTrendVerdict(label: string, verdict: string, pctChange: number | null): string {
  const pct = pctChange == null ? null : Math.abs(pctChange);
  if (verdict === 'improving') return `${label} ↑${pct}%`;
  if (verdict === 'sliding' || verdict === 'declining') return `${label} ↓${pct}%`;
  if (verdict === 'needs_data') return `${label} needs data`;
  return `${label} holding`;
}
