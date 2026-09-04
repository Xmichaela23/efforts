// ⛔ NOTHING HERE IS OURS (2026-09-04, docs/SPEC-state-nothing-invented-2026-09-04.md; CLAUDE.md rule 5).
// Every trend on the State screen is Garmin's rule: the average of the last 28 days against the average
// of the 28 days before. Higher → improving (↑), lower → sliding (↓), the same → holding (→, Garmin's
// "maintaining"). Blank only when one half has no session. There is no percent band, no signal-vs-noise
// gate, no freshness decay, no cadence-scaled floor — all of those were ours (Q-052) and are deleted.
// Ledger: docs/STATE-SOURCES.md.
//
// FIELD — Garmin VO2 max / Training Status trend: "the last 4 weeks compared with the 4 weeks before",
// recomputed on every activity; the three arrows are Garmin's three states.

import type { TrendThresholds } from './types.ts';

export type Discipline = 'strength' | 'bike' | 'run' | 'swim';

/** One half of the comparison. FIELD — Garmin, 4 weeks. */
export const TREND_HALF_DAYS = 28;
/** The whole window: the recent half and the half before it. */
export const TREND_WINDOW_DAYS = TREND_HALF_DAYS * 2;

// Which direction is "better" is the METRIC's meaning, not a threshold: pace and swim pace fall as
// fitness rises; power and e1RM rise.
const LOWER_IS_BETTER: Record<Discipline, boolean> = { strength: false, bike: false, run: true, swim: true };

/** The one window every discipline uses. */
export function windowDaysFor(_discipline: Discipline): number {
  return TREND_WINDOW_DAYS;
}

/**
 * The thresholds for a discipline. `precision` = the decimals the METRIC is displayed at (the caller
 * knows its metric): two 28-day averages that print the same digits are "the same" → holding.
 * FIELD — Garmin: VO2 max is shown as a whole number and the trend reads → when the shown number has
 * not moved. Nothing scales to cadence; at least one session in each 28-day half is the only floor.
 */
export function resolveThresholds(discipline: Discipline, precision: number): TrendThresholds {
  return { windowDays: TREND_WINDOW_DAYS, minSessions: 1, lowerIsBetter: LOWER_IS_BETTER[discipline], precision };
}

// Adherence (fallback axis) = weekly plan-compliance: "am I on plan THIS week". 7-day, universal
// (a week is a week) — not a cadence-scaled knob.
export const ADHERENCE_WINDOW_DAYS = 7;
