/**
 * Fitness · Fatigue · Form — TrainingPeaks' Performance Management Chart, exactly (2026-09-04).
 *
 * ⛔ ONE REFERENCE, WHOLE (Michael 2026-09-04: every State number copies one product's rule, never a
 * hodgepodge). This is the number the LOAD section of State prints. FIELD — TrainingPeaks help centre,
 * "Performance Management Chart" / "Fitness (CTL)" / "The Science of the Performance Manager":
 *   fitness (CTL) = exponentially weighted average of daily TSS, 42-day constant
 *   fatigue (ATL) = exponentially weighted average of daily TSS,  7-day constant
 *   form    (TSB) = YESTERDAY's fitness − YESTERDAY's fatigue
 *   zones (Friel, "Managing Training Using TSB", reproduced by TrainingPeaks): above +25 transitional,
 *   +5 to +25 fresh, −10 to +5 grey zone, −30 to −10 optimal, below −30 high risk.
 * The EWMA step is TrainingPeaks' own: CTL_today = CTL_yesterday + (TSS_today − CTL_yesterday) / 42.
 * The series starts at zero from the athlete's FIRST logged session (TrainingPeaks seeds from the start of
 * the athlete's history, or a typed start value; no start value is typed here) — so the caller must hand
 * this function the WHOLE history, not a window (the coach fetched 84 days until 2026-09-04, which
 * under-stated fitness for every athlete with more history than that).
 *
 * HISTORY: born 2026-07-09 as a "sibling signal, evaluation-only" beside ACWR; ACWR (Gabbett — neither
 * Garmin nor TrainingPeaks) is off the State screen since 2026-09-04 and this is the load read.
 *
 * SINGLE SOURCE (D-264): consumes the exact same `LoadRow[]` (workouts.workload_actual, D-236)
 * that ACWR consumes — not `session_load`, not a second series. Same column, whole history.
 */

import { type LoadRow } from './acwr.ts';

export const FITNESS_TAU_DAYS = 42;
export const FATIGUE_TAU_DAYS = 7;

export interface FitnessFatigue {
  /** CTL — 42-day EWMA of daily load, as of asOf. */
  fitness: number | null;
  /** ATL — 7-day EWMA of daily load, as of asOf. */
  fatigue: number | null;
  /** The values form was subtracted from: fitness and fatigue entering asOf (end of the previous day). */
  fitness_prior?: number | null;
  fatigue_prior?: number | null;
  /** TSB — fitness − fatigue ENTERING asOf (freshness). Positive = fresh, negative = fatigued. */
  form: number | null;
  provenance: {
    method: 'banister_ewma_v1';
    /** ALWAYS false — TrainingPeaks' constants (42 / 7), no per-athlete fit; TrainingPeaks does not fit one either. */
    calibrated: false;
    tau_fitness_days: number;
    tau_fatigue_days: number;
    /** 'total' (single-stream v1) — per-domain scaffolded, not built. */
    stream: 'total';
    /** 'zero' — the series starts at zero on the first logged session, as TrainingPeaks does without a typed start value. */
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

const NOTE = 'TrainingPeaks PMC: 42/7-day EWMA of daily workload, seeded at zero from the first logged session';

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
    fitness_prior: r1(ctlPrior),
    fatigue_prior: r1(atlPrior),
    provenance: prov(daysBetween(earliest, asOf) + 1),
  };
}

/**
 * TrainingPeaks' Form (TSB) zones — Friel, "Managing Training Using TSB", as TrainingPeaks reproduces them
 * in the Performance Management Chart legend. The published ranges are "+5 to +25" fresh, "−10 to −30"
 * optimal, "−10 to +5" grey zone, above +25 transitional, below −30 high risk; the boundary value itself
 * is not assigned in print, so a value exactly on a line takes the zone BELOW it (the more cautious read).
 */
export type FormZone = 'transitional' | 'fresh' | 'grey zone' | 'optimal' | 'high risk';

export function formZone(form: number | null | undefined): FormZone | null {
  if (form == null || !Number.isFinite(form)) return null;
  if (form > 25) return 'transitional';
  if (form > 5) return 'fresh';
  if (form > -10) return 'grey zone';
  if (form >= -30) return 'optimal';
  return 'high risk';
}
