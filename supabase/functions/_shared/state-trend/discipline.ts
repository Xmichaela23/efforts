// Per-discipline hybrid resolver — assembles the STATE row from the two axes.
//
// Contract: "hybrid-fallback BEHAVIOR now, co-equal-ready STRUCTURE." Adherence and
// performance are the SAME axis at two maturity levels, gated by data. Today performance
// leads where it has a verdict and adherence fills the gap; the co-equal flip (both always
// shown) is a ONE-SPOT change — see DISPLAY_MODE below — landing when Layer 1 context tags
// give adherence enough substance to stand co-equal.

import type { TrendVerdict, TrendResult } from './types.ts';
import type { AdherenceState } from './adherence.ts';
import type { Posture, PostureRead } from './posture.ts';

export type AxisMode = 'performance' | 'adherence';

/** Normalized performance summary so every discipline (strength roll-up, bike trend, …)
 *  feeds the resolver the same minimal shape. The rich payload travels alongside for render. */
export interface PerfSummary {
  verdict: TrendVerdict;
  pctChange: number | null;
  /** State v3 DOT: where the metric sits in the athlete's 12wk range (oriented so 1=best). Swim uses it. */
  range?: import('./position-in-range.ts').RangePosition | null;
  /** D-232 glass-box receipt evidence — sample count, newest-point age (days), window length (days).
   *  Optional: strength passes {overall, overallPctChange} with no series, so these are absent there. */
  sampleCount?: number;
  newestAgeDays?: number | null;
  windowDays?: number;
  /** true when needs_data is a STALENESS decay (enough samples, newest too old) — NOT too-few. Distinguishes
   *  the two needs_data causes so the receipt cites recency ("last swim Nd ago") vs count ("need 3"). */
  stale?: boolean;
  /** The cadence-scaled min-session floor (needs_data too-few threshold) — so the receipt cites "need N" honestly. */
  minSessions?: number;
}

export interface DisciplineCard {
  discipline: string;
  /** Which axis is the row's headline today. */
  primaryAxis: AxisMode;
  /** Is the adherence axis rendered at all. Fallback: only when performance absent. */
  showAdherence: boolean;
  performance: PerfSummary | null;
  adherence: AdherenceState | null;
  /** Headline verdict when performance leads; null when adherence leads (no trend verdict). */
  headlineVerdict: TrendVerdict | null;
  /** Q-179 — the athlete's DECLARED intent for this discipline ('develop' | 'maintain' | 'out').
   *  null when they never declared one, in which case every field below is inert and the row
   *  renders exactly as it did before posture existed. */
  posture?: Posture | null;
  /** What the verdict MEANS given that intent. `unknown` = behave as before. See posture.ts. */
  postureRead?: PostureRead;
  /** The server-minted plain-English line. Null when there is no posture claim to make.
   *  Law 4: the surface renders this. It does not compose its own. */
  postureSentence?: string | null;
}

/**
 * THE ONE SPOT. Today = 'fallback' (adherence shown only where performance is absent).
 * When Layer 1 context tags land, change this to 'co-equal' and `showAdherence` becomes
 * always-true — both axes render side by side. Nothing else in the resolver changes.
 */
export const DISPLAY_MODE: 'fallback' | 'co-equal' = 'fallback';

/** Performance "has a verdict" = anything but needs_data. */
export function performanceLeads(perf: PerfSummary | null): boolean {
  return !!perf && perf.verdict !== 'needs_data';
}

export function resolveDisciplineCard(args: {
  discipline: string;
  performance: PerfSummary | null;
  adherence: AdherenceState | null;
}): DisciplineCard {
  const { discipline, performance, adherence } = args;
  const perfLeads = performanceLeads(performance);
  const showAdherence = DISPLAY_MODE === 'co-equal' ? true : !perfLeads;
  return {
    discipline,
    primaryAxis: perfLeads ? 'performance' : 'adherence',
    showAdherence,
    performance,
    adherence,
    headlineVerdict: perfLeads ? performance!.verdict : null,
  };
}

/** Convenience: a TrendResult (bike) → PerfSummary. Strength passes {overall, overallPctChange}. */
export function perfFromTrend(t: TrendResult | null): PerfSummary | null {
  return t ? {
    verdict: t.verdict,
    pctChange: t.pctChange,
    sampleCount: t.sampleCount,
    newestAgeDays: t.newestAgeDays,
    windowDays: t.window?.days,
    stale: t.stale,
    minSessions: t.minSessions,
  } : null;
}
