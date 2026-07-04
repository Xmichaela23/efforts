// Q-052 per-athlete scaling (Michael-approved 2026-06-14). The trend LOGIC is universal; the
// cadence-dependent knobs (freshnessDays, minSessions) SCALE to the athlete's OWN per-discipline
// session frequency so no me-specific magic number ships in the core. The % thresholds
// (improvePct/slidePct) and windowDays are universal constants. Refs:
// docs/AUDIT-truth-reconciliation-2026-06-14.md (Q-052), docs/BUILD-PLAN-top-down-spine-wiring.md.

import type { TrendThresholds } from './types.ts';

export type Discipline = 'strength' | 'bike' | 'run' | 'swim';

// Universal, scale-free per-discipline config. windowDays = training-block length (NOT cadence);
// improvePct/slidePct = percent thresholds (a % is scale-free). Do NOT scale these per athlete.
const UNIVERSAL: Record<Discipline, { windowDays: number; improvePct: number; slidePct: number; lowerIsBetter: boolean }> = {
  strength: { windowDays: 42, improvePct: 2.5, slidePct: -2.0, lowerIsBetter: false }, // 6wk, asymmetric
  bike: { windowDays: 56, improvePct: 2.0, slidePct: -2.0, lowerIsBetter: false }, // 8wk, pwr20 substrate
  run: { windowDays: 42, improvePct: 2.0, slidePct: -2.0, lowerIsBetter: true }, // 6wk, GAP pace (lower=better)
  swim: { windowDays: 56, improvePct: 1.5, slidePct: -1.5, lowerIsBetter: true }, // 8wk, pace/100 (lower=better)
};

// Calibration anchors for: freshnessDays = clamp(round(BASE_FRESH × REF_SPW / spw), 7, 35).
// Freshness scales INVERSELY with the athlete's own per-discipline rate (train less often → a
// trend stays "current" longer). REF_SPW is the cadence each BASE was tuned at. STRENGTH uses a
// TYPICAL per-lift cadence (1.2/wk), NOT a sparse-logging athlete's rate — don't bake the
// canonical-split data bug into universal scaling (Q-052).
const BASE_FRESH: Record<Discipline, number> = { strength: 14, bike: 21, run: 14, swim: 10 };
// REF_SPW = the reference cadence each BASE_FRESH was tuned at = the development cohort's
// MEASURED 90d per-discipline rate (bike/run/swim), so at that cadence freshness reproduces
// BASE (verdict-preserving). STRENGTH uses a TYPICAL per-lift cadence (1.2/wk), NOT the cohort's
// sparse-logging rate — don't bake the canonical-split data bug into universal scaling (Q-052).
const REF_SPW: Record<Discipline, number> = { strength: 1.2, bike: 1.6, run: 2.6, swim: 0.7 };

const FRESH_FLOOR = 7, FRESH_CEIL = 35;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Universal window length for a discipline (block-length, not cadence). */
export function windowDaysFor(discipline: Discipline): number {
  return UNIVERSAL[discipline].windowDays;
}

/**
 * Resolve a discipline's trend thresholds for the athlete's OWN per-discipline cadence
 * (`sessionsPerWeek`, from their 90d history). % thresholds + windowDays are universal;
 * freshnessDays + minSessions scale to cadence (Q-052) so a 3x/wk and a 12x/wk athlete each get
 * sane gates. When `sessionsPerWeek` is unknown/≤0, falls back to the discipline's REF cadence.
 */
export function resolveThresholds(discipline: Discipline, sessionsPerWeek: number): TrendThresholds {
  const u = UNIVERSAL[discipline];
  // estimate-ok: unknown per-discipline cadence (no history) → cohort REF only sets the trend
  // floor, and with no history the trend is ALREADY in the "not enough data" state, so REF never
  // reaches a rendered verdict as if it were the athlete's own cadence.
  const spw = Number.isFinite(sessionsPerWeek) && sessionsPerWeek > 0 ? sessionsPerWeek : REF_SPW[discipline];
  const freshnessDays = clamp(Math.round((BASE_FRESH[discipline] * REF_SPW[discipline]) / spw), FRESH_FLOOR, FRESH_CEIL);
  const avail = spw * (u.windowDays / 7); // sessions that fit in the window at this cadence
  const minSessions = clamp(3 + (avail >= 8 ? 1 : 0) + (avail >= 16 ? 1 : 0), 3, 5);
  return {
    windowDays: u.windowDays,
    improvePct: u.improvePct,
    slidePct: u.slidePct,
    minSessions,
    lowerIsBetter: u.lowerIsBetter,
    freshnessDays,
  };
}

// Adherence (fallback axis) = weekly plan-compliance: "am I on plan THIS week". 7-day, universal
// (a week is a week) — not a cadence-scaled knob.
export const ADHERENCE_WINDOW_DAYS = 7;
