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

/** singular noun: "run" / "ride" / "swim" / "session". */
export function unitNoun(discipline: Discipline): string {
  return discipline === 'run' ? 'run' : discipline === 'bike' ? 'ride' : discipline === 'swim' ? 'swim' : 'session';
}

/** "5 runs" / "1 ride" / "3 swims". */
export function unitLabel(discipline: Discipline, n: number): string {
  const u = unitNoun(discipline);
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
  stale?: boolean; // needs_data is a staleness decay (enough samples, too old) — cite recency, not count
  floor?: number; // minSessions floor for the needs_data message
}): string {
  const { verdict, pctChange, windowDays, sampleCount, newestAgeDays, discipline, stale, floor = 3 } = args;
  const win = windowLabel(windowDays);
  if (verdict === 'needs_data') {
    // Two distinct causes, honestly distinguished: STALE (enough samples, newest too old) cites recency
    // and NEVER the count floor (the bug: a stale 6-swim window read "need 3"); TOO-FEW cites count vs floor.
    if (stale) {
      return newestAgeDays != null
        ? `Last ${unitNoun(discipline)} ${newestAgeDays}d ago — too old to trend (${sampleCount} in ${win})`
        : `No recent ${unitNoun(discipline)}s to trend (${sampleCount} in ${win})`;
    }
    // D-237: run's trend counts only comparable-EASY runs — declare that, so "N runs" doesn't read as
    // total-run scarcity (the athlete may run often but rarely easy). The floor is now scaled off
    // easy-run cadence too (assemble.ts), so this fires only when easy runs are genuinely too few.
    const tooFewLabel = discipline === 'run'
      ? `${sampleCount} easy-pace run${sampleCount === 1 ? '' : 's'}`
      : unitLabel(discipline, sampleCount);
    return `Not enough data yet — ${tooFewLabel} in ${win} (need ${floor})`;
  }
  const evidence = trendEvidence(args);
  const pct = pctChange == null ? null : Math.abs(pctChange);
  if (verdict === 'improving') return `↑${pct}% ${evidence}`;
  if (verdict === 'sliding' || verdict === 'declining') return `↓${pct}% ${evidence}`;
  return `Holding ${evidence}`; // holding / steady
}

/** The verdict-colored headline of a single-metric row, split from the (dimmed) evidence tail:
 *  "↑6.5%" / "↓4.2%" / "Holding". Pair with trendEvidence() for the dimmed remainder. */
export function trendHeadline(verdict: string, pctChange: number | null): string {
  const pct = pctChange == null ? null : Math.abs(pctChange);
  if (verdict === 'improving') return `↑${pct}%`;
  if (verdict === 'sliding' || verdict === 'declining') return `↓${pct}%`;
  return 'Holding';
}

/** One sub-trend headline for a MULTI-metric row (bike power/efficiency): "Power ↑3.6%". */
export function subTrendVerdict(label: string, verdict: string, pctChange: number | null): string {
  const pct = pctChange == null ? null : Math.abs(pctChange);
  if (verdict === 'improving') return `${label} ↑${pct}%`;
  if (verdict === 'sliding' || verdict === 'declining') return `${label} ↓${pct}%`;
  if (verdict === 'needs_data') return `${label} needs data`;
  return `${label} holding`;
}
