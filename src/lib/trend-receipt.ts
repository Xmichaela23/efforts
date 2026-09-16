// D-232 glass-box receipts for the STATE discipline-trend rows (RUN / BIKE / SWIM). A verdict + bare
// delta ("↑ improving +6.5%") is a black-box assertion: the athlete can't see it's a 6-week trend from
// 5 runs whose newest is 4 days old, so a real economy trend reads as a "now" claim (the 2026-07-02 RUN
// incident). The receipt cites window + sample count + recency so the number is falsifiable at a glance.
//
// ⛔ THESE RUN ON THE SERVER NOW (2026-09-15, Stage 4 session 2). Every line below is athlete-facing text
// built from a window in DAYS and a signed percentage — the State screen was its only caller and composed
// each row as it drew it. `_shared/state-trend/discipline.ts` and `bike-fitness.ts` import this file and
// put the finished strings on the payload; the screen prints them. The file stays here because the edge
// functions bundle `src/lib/` at deploy time and already import several of its neighbours
// (`estimate-1rm.ts`, `exercise-role.ts`, `tracked-max-lifts.ts`) — moving it would rewrite those imports
// for no behaviour change, which is the same call made for the five resolvers on 2026-09-15.
//
// Pure/presentational: fields (verdict, pctChange, sampleCount, newestAgeDays) come from the spine
// (classifyTrend → state_trends_v1). windowDays is the discipline constant (run 42, bike 56, swim 56).

export type Discipline = 'run' | 'bike' | 'swim' | 'strength';

/** "6wk" from 42, "8wk" from 56. */
export function windowLabel(days: number): string {
  const w = Math.max(1, Math.round(days / 7));
  return `${w} ${w === 1 ? 'week' : 'weeks'}`; // 2026-09-04 (Michael: unclear) — words, not "8wk"
}

/** "4d ago" / "today". Bare (the noun is already in the "5 runs" count) for row-width. Empty when unknown. */
export function recencyLabel(ageDays: number | null | undefined): string {
  if (ageDays == null) return '';
  if (ageDays <= 0) return 'newest today';
  return `newest ${ageDays} ${ageDays === 1 ? 'day' : 'days'} ago`;
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
  /** Drop the count when the line ABOVE already states it (the bike aerobic read says "from 6 easy
   *  rides", so the receipt repeating "6 rides" is the same fact twice on consecutive lines). Window
   *  and recency still belong here — they are not stated anywhere else. */
  omitCount?: boolean;
}): string {
  const parts = [`last ${windowLabel(args.windowDays)}`]; // 2026-09-04 (Michael: unclear) — "last 8 weeks", not "over 8wk"
  if (!args.omitCount) parts.push(unitLabel(args.discipline, args.sampleCount));
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
  stale?: boolean; // kept for old cached rows; the server no longer decays a trend for age
  floor?: number; // kept for old cached rows; the only floor is now one session in each 4-week half
}): string {
  // estimate-ok: `floor` is the real minSessions from the trend cache; the `= 3` covers only
  // old cache / strength no-series rows (documented default, cf. the run-cadence fix).
  const { verdict, pctChange, windowDays, sampleCount, newestAgeDays, discipline, stale } = args;
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
    // total-run scarcity. Garmin's rule (2026-09-04): the last 4 weeks against the 4 before, so the
    // only way to have nothing is a 4-week half with no session in it.
    const tooFewLabel = discipline === 'run'
      ? `${sampleCount} easy-pace run${sampleCount === 1 ? '' : 's'}`
      : unitLabel(discipline, sampleCount);
    return `Nothing to compare yet — ${tooFewLabel} in ${win}; needs one in each 4-week half`;
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

/**
 * ⛔ A THIN AND STALE TREND IS NOT SHOWN AT FULL CONFIDENCE. Under this many readings AND a newest
 * reading older than the staleness cut, the row dims and prints "limited data" — the counts are
 * already at the render, so this adds a caution, never a second number.
 * OURS — no outside source publishes this pair; it lived on the State screen with no marker until
 * 2026-09-15. docs/STATE-SOURCES.md.
 */
export const LIMITED_DATA_UNDER_SAMPLES = 5;
export const LIMITED_DATA_STALE_OVER_DAYS = 21;

export function isLimitedData(sampleCount: number | null | undefined, newestAgeDays: number | null | undefined): boolean {
  return (sampleCount ?? 99) < LIMITED_DATA_UNDER_SAMPLES && (newestAgeDays ?? 0) > LIMITED_DATA_STALE_OVER_DAYS;
}

/**
 * The magnitude of a change, signed by what the VERDICT means rather than by the raw delta.
 *
 * D-160: `pctChange` is the raw metric delta (classify.ts keeps it raw so a reader knows real
 * direction). For a lower-is-better discipline (run and swim pace) an improvement is a NEGATIVE delta,
 * so printing it verbatim gives "↑ improving −34%". The verdict already encodes good or bad; sign the
 * magnitude by the verdict and the number and the arrow always agree.
 *
 * ⚠️ ONE MINUS GLYPH, ALL THREE BRANCHES. The `holding` fallback used to print JS's own negative
 * ("-0.4%", ASCII hyphen) while the sliding branch printed a true minus ("−15.2%") — adjacent rows on
 * one screen, two characters at two widths (2026-08-01).
 * ⚠️ `dp` IS DISPLAY ONLY; the raw change stays on the payload. A tenth of a percent on a regression
 * slope over three months is false precision.
 */
export function verdictSignedPct(verdict: string, pct: number | null | undefined, dp = 1): string | null {
  if (pct == null) return null;
  const mag = (n: number) => Math.abs(n).toFixed(dp).replace(/\.0+$/, '');
  if (verdict === 'improving') return `+${mag(pct)}%`;
  if (verdict === 'sliding') return `−${mag(pct)}%`;
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${mag(pct)}%`;
}

/**
 * "newest today" / "newest 4d ago" — how fresh the pool behind a read is, so an athlete can tell
 * whether the ride they just finished is in it yet. Distinct from a calendar "as of" stamp.
 */
export function recencyOf(ageDays: number | null | undefined): string | null {
  if (ageDays == null || ageDays < 0) return null;
  return ageDays <= 0 ? 'newest today' : `newest ${Math.round(ageDays)}d ago`;
}
