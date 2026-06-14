// Per-discipline hybrid resolver — assembles the STATE row from the two axes.
//
// Contract: "hybrid-fallback BEHAVIOR now, co-equal-ready STRUCTURE." Adherence and
// performance are the SAME axis at two maturity levels, gated by data. Today performance
// leads where it has a verdict and adherence fills the gap; the co-equal flip (both always
// shown) is a ONE-SPOT change — see DISPLAY_MODE below — landing when Layer 1 context tags
// give adherence enough substance to stand co-equal.

import type { TrendVerdict, TrendResult } from './types';
import type { AdherenceState } from './adherence';

export type AxisMode = 'performance' | 'adherence';

/** Normalized performance summary so every discipline (strength roll-up, bike trend, …)
 *  feeds the resolver the same minimal shape. The rich payload travels alongside for render. */
export interface PerfSummary {
  verdict: TrendVerdict;
  pctChange: number | null;
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
  return t ? { verdict: t.verdict, pctChange: t.pctChange } : null;
}
