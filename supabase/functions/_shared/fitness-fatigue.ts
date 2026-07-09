/**
 * Fitness–Fatigue–Form (Banister) — a SIBLING load signal, evaluation-only (2026-07-09).
 *
 * NOT a replacement for ACWR and NOT a verdict. Emitted into the payload so it can be
 * WATCHED over the coming weeks against the composition + body-response reads; it drives
 * nothing. THE LAW holds — the reconciler mints verdicts; this is one more observable input.
 *
 * Model: the standard EWMA form of Banister (TrainingPeaks CTL/ATL/TSB), so Form is readable:
 *   fitness (CTL) = 42-day EWMA of daily load  — the slow "chronic" accumulation
 *   fatigue (ATL) =  7-day EWMA of daily load  — the fast "acute" accumulation
 *   form    (TSB) = fitness − fatigue ENTERING the day (prior-day convention) — freshness
 *
 * SINGLE SOURCE (D-264): consumes the exact same `LoadRow[]` (workouts.workload_actual, D-236)
 * that ACWR consumes — not `session_load`, not a second series. Same column, longer window.
 *
 * SCAFFOLD (not built): single-stream / total load in v1. Per-pathway is just calling this once
 * per slice's rows later; the `LoadRow[]` signature already supports it.
 *
 * PROVISIONAL: generic decay constants (42/7), no per-athlete k1/k2 fit, seeded from ZERO. The
 * zero seed under-states early fitness over an 84-day ramp, biasing Form NEGATIVE — so Form's
 * absolute value is unreliable until the series settles; the week-over-week TREND is the usable
 * read. All of this is declared in `provenance` so a consumer can never mistake it for calibrated.
 */

import { type LoadRow } from './acwr.ts';

export const FITNESS_TAU_DAYS = 42;
export const FATIGUE_TAU_DAYS = 7;

export interface FitnessFatigue {
  /** CTL — 42-day EWMA of daily load, as of asOf. */
  fitness: number | null;
  /** ATL — 7-day EWMA of daily load, as of asOf. */
  fatigue: number | null;
  /** TSB — fitness − fatigue ENTERING asOf (freshness). Positive = fresh, negative = fatigued. */
  form: number | null;
  provenance: {
    method: 'banister_ewma_v1';
    /** ALWAYS false in v1 — generic constants, no per-athlete fit. */
    calibrated: false;
    tau_fitness_days: number;
    tau_fatigue_days: number;
    /** 'total' (single-stream v1) — per-domain scaffolded, not built. */
    stream: 'total';
    /** 'zero' — ramp-up from zero under-states early fitness → Form biased negative early. */
    seed: 'zero';
    days_of_history: number;
    note: string;
  };
}

function toDateOnly(s: string): string | null {
  const m = String(s ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function addDays(ymd: string, delta: number): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) + delta * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

const NOTE = 'provisional/uncalibrated — evaluation only, drives no verdict';

/**
 * Compute Banister fitness/fatigue/form from a daily load series (same LoadRow[] as ACWR).
 * Missing days count as 0 load (rest decays both pools). Returns nulls when there is no load.
 */
export function computeFitnessFatigue(
  rows: LoadRow[],
  opts: { asOfDate: string; tauFitness?: number; tauFatigue?: number },
): FitnessFatigue {
  const tauF = opts.tauFitness ?? FITNESS_TAU_DAYS;
  const tauA = opts.tauFatigue ?? FATIGUE_TAU_DAYS;
  const asOf = toDateOnly(opts.asOfDate);
  const prov = (days: number): FitnessFatigue['provenance'] => ({
    method: 'banister_ewma_v1', calibrated: false, tau_fitness_days: tauF, tau_fatigue_days: tauA,
    stream: 'total', seed: 'zero', days_of_history: days, note: NOTE,
  });

  if (!asOf || !Array.isArray(rows)) return { fitness: null, fatigue: null, form: null, provenance: prov(0) };

  // Sum load per calendar day (up to asOf). Same substrate as ACWR.
  const byDay = new Map<string, number>();
  let earliest: string | null = null;
  for (const r of rows) {
    const d = toDateOnly(r.date);
    if (!d || d > asOf) continue;
    const w = Number(r.workload);
    if (!Number.isFinite(w) || w <= 0) continue;
    byDay.set(d, (byDay.get(d) ?? 0) + w);
    if (earliest == null || d < earliest) earliest = d;
  }
  if (earliest == null) return { fitness: null, fatigue: null, form: null, provenance: prov(0) };

  // Iterate day-by-day from the earliest load day to asOf (empty days = 0 load, EWMA decays).
  let ctl = 0, atl = 0, ctlPrior = 0, atlPrior = 0;
  for (let day = earliest; ; day = addDays(day, 1)) {
    ctlPrior = ctl; atlPrior = atl;           // values ENTERING this day (= end of previous day)
    const load = byDay.get(day) ?? 0;
    ctl = ctl + (load - ctl) / tauF;
    atl = atl + (load - atl) / tauA;
    if (day === asOf) break;
  }

  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    fitness: r1(ctl),
    fatigue: r1(atl),
    form: r1(ctlPrior - atlPrior),             // freshness entering asOf (TSB, prior-day convention)
    provenance: prov(daysBetween(earliest, asOf) + 1),
  };
}
