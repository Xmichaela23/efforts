/**
 * Pure ride-physiology metrics for the cycling analysis layer
 * (docs/CYCLING-ANALYSIS-DESIGN.md Build Order #4 HR-at-power + decoupling, and
 * #5 VAM). No new data capture — these pair the already-stored, index-aligned
 * 1 Hz series (time_s / hr_bpm / power_watts / elevation_m / grade_percent) that
 * compute-workout-analysis builds. The audit's "stored unpaired" note means the
 * series are persisted as separate arrays, NOT that they are misaligned — they
 * share a sample index, so pairing by index is correct.
 *
 * Extracted as a pure module so it is unit-testable without invoking the
 * ~2000-line compute-workout-analysis handler (same pattern as np-trend.ts /
 * analysis-mode.ts).
 *
 * Conservative thresholds (documented; the doc gives intent, sports-science
 * fixes the formulas):
 *  - efficiency: pedaling-only (power>0) so coasting HR doesn't dilute the read;
 *    needs >= 60 paired pedaling samples.
 *  - aerobic decoupling: Friel first-half vs second-half power:HR ratio; only
 *    emitted when the paired pedaling span >= 20 min (1200 s), else interval
 *    structure is conflated with drift. Positive % = HR drifted up relative to
 *    power (aerobic decoupling / fatigue).
 *  - VAM: climbing samples = grade >= 3% with positive elevation delta; needs
 *    >= 30 m climbed and >= 120 s climbing to be meaningful.
 */

export type RideEfficiency = {
  /** NP/HR when NP available (standard EF), else avg pedaling power / avg HR.
   *  Higher = more aerobic output per heartbeat; comparable over time. */
  efficiency_factor: number;
  avg_pedaling_power_w: number;
  avg_pedaling_hr_bpm: number;
  /** Friel aerobic decoupling %. Present only for steady efforts >= 20 min. */
  aerobic_decoupling_pct?: number;
};

export type RideClimbing = {
  /** Vertical ascent metres per hour over the climbing portion. */
  vam_m_per_h: number;
  climb_ascent_m: number;
  climb_time_s: number;
};

/**
 * NP-based Training Stress Score — design Build Order #3. The doc's Open
 * Questions resolves the only TSS decision in-doc: "Minimum viable TSS:
 * simplified NP-based TSS … (NP-based is sufficient for CTL/ATL trend;
 * precision matters less than consistency.)" — so this is the standard Coggan
 * NP-based formula, NOT xPower/BikeScore.
 *
 *   IF  = NP / FTP
 *   TSS = (duration_s · NP · IF) / (FTP · 3600) · 100  ==  (duration_s/3600)·IF²·100
 *
 * Returns rounded integer TSS, or null when NP/FTP/duration aren't usable
 * (caller omits the key — consistent with the rest of the power block).
 */
export function computeRideTss(
  npW: number | null | undefined,
  ftpW: number | null | undefined,
  durationSec: number | null | undefined,
): number | null {
  const np = Number(npW);
  const ftp = Number(ftpW);
  const dur = Number(durationSec);
  if (!Number.isFinite(np) || np <= 0) return null;
  if (!Number.isFinite(ftp) || ftp <= 0) return null;
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const intensityFactor = np / ftp;
  const tss = (dur / 3600) * intensityFactor * intensityFactor * 100;
  return Number.isFinite(tss) ? Math.round(tss) : null;
}

export type RideFitness = {
  /** Chronic Training Load — 42-day exponentially-weighted TSS (fitness). */
  ctl: number;
  /** Acute Training Load — 7-day exponentially-weighted TSS (fatigue). */
  atl: number;
  /** Training Stress Balance = CTL − ATL (form: positive = fresh). */
  tsb: number;
};

/**
 * CTL / ATL / TSB — design Build Order #7. Standard Performance Management
 * Chart impulse-response: exponential moving averages of daily TSS with the
 * conventional 42-day (chronic) and 7-day (acute) time constants. Input is a
 * chronological one-value-per-day TSS array (rest days = 0); seeded from 0,
 * which under-weights early days but converges — acceptable for the trend
 * signal (the doc resolves TSS to "consistency over precision"). TSB uses
 * end-of-series CTL−ATL (current form). Returns rounded values, or null on
 * empty input.
 */
export function computeCtlAtl(dailyTss: ReadonlyArray<number>): RideFitness | null {
  if (!Array.isArray(dailyTss) || dailyTss.length === 0) return null;
  const kCtl = 1 - Math.exp(-1 / 42);
  const kAtl = 1 - Math.exp(-1 / 7);
  let ctl = 0;
  let atl = 0;
  for (const raw of dailyTss) {
    const t = Number(raw);
    const tss = Number.isFinite(t) && t > 0 ? t : 0;
    ctl += (tss - ctl) * kCtl;
    atl += (tss - atl) * kAtl;
  }
  return {
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(ctl - atl),
  };
}

const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;

export function computeRideEfficiency(
  timeS: ReadonlyArray<number>,
  hrBpm: ReadonlyArray<number | null>,
  powerW: ReadonlyArray<number | null>,
  normalizedPower: number | null,
): RideEfficiency | null {
  const n = Math.min(timeS.length, hrBpm.length, powerW.length);
  const ped: Array<{ t: number; hr: number; p: number }> = [];
  for (let i = 0; i < n; i++) {
    const hr = hrBpm[i];
    const p = powerW[i];
    const t = timeS[i];
    if (typeof hr === 'number' && hr > 0 && typeof p === 'number' && p > 0 && Number.isFinite(t)) {
      ped.push({ t, hr, p });
    }
  }
  if (ped.length < 60) return null;
  const avgHr = mean(ped.map((x) => x.hr));
  const avgP = mean(ped.map((x) => x.p));
  if (!(avgHr > 0)) return null;
  const numer = (normalizedPower != null && Number.isFinite(normalizedPower) && normalizedPower > 0)
    ? normalizedPower
    : avgP;
  const out: RideEfficiency = {
    efficiency_factor: Math.round((numer / avgHr) * 1000) / 1000,
    avg_pedaling_power_w: Math.round(avgP),
    avg_pedaling_hr_bpm: Math.round(avgHr),
  };
  const span = ped[ped.length - 1].t - ped[0].t;
  if (span >= 1200) {
    const mid = Math.floor(ped.length / 2);
    const h1 = ped.slice(0, mid);
    const h2 = ped.slice(mid);
    if (h1.length > 0 && h2.length > 0) {
      const r1 = mean(h1.map((x) => x.p)) / mean(h1.map((x) => x.hr));
      const r2 = mean(h2.map((x) => x.p)) / mean(h2.map((x) => x.hr));
      if (Number.isFinite(r1) && r1 > 0 && Number.isFinite(r2)) {
        out.aerobic_decoupling_pct = Math.round(((r1 - r2) / r1) * 1000) / 10;
      }
    }
  }
  return out;
}

export function computeRideVam(
  timeS: ReadonlyArray<number>,
  elevationM: ReadonlyArray<number | null>,
  gradePct: ReadonlyArray<number | null>,
): RideClimbing | null {
  const n = Math.min(timeS.length, elevationM.length, gradePct.length);
  let gain = 0;
  let climbTime = 0;
  for (let i = 1; i < n; i++) {
    const g = gradePct[i];
    const e0 = elevationM[i - 1];
    const e1 = elevationM[i];
    const dt = Math.max(0, (timeS[i] || 0) - (timeS[i - 1] || 0));
    if (typeof g === 'number' && g >= 3 && typeof e0 === 'number' && typeof e1 === 'number') {
      const de = e1 - e0;
      if (de > 0) {
        gain += de;
        climbTime += dt;
      }
    }
  }
  if (gain < 30 || climbTime < 120) return null;
  return {
    vam_m_per_h: Math.round((gain / climbTime) * 3600),
    climb_ascent_m: Math.round(gain),
    climb_time_s: Math.round(climbTime),
  };
}
