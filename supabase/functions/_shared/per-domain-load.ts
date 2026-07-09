/**
 * Per-domain load slicing (D-263, build-step 2). Runs the shared ACWR machinery
 * (_shared/acwr.ts) on THREE filtered slices — strength / hard_cardio / easy_cardio
 * — so the reconciler gets composition as INPUTS (never a new gauge; THE LAW).
 *
 * Binning uses the discipline's PRIMARY signal (generalizes the D-238 ladder):
 *   run → HR/LTHR · ride → power/FTP · swim → pace · strength → sRPE.
 * HR is gated by MEASURED quality (hr-quality.ts) ANY time HR is used — run's
 * primary path AND ride's no-power fallback — never just runs. Swim is UNANCHORED
 * (no CSS threshold on file) so it never classifies hard on a guess → easy_cardio.
 *
 * Slices are ALWAYS all three present; `status: 'insufficient_base'` (chronic <
 * floor 500) is the honest empty, distinct from a missing slice (no silent nulls).
 */

import { computeAcwr, type LoadRow } from './acwr.ts';
import { inferIntensityFromPerformance } from './workload.ts';
import { assessHrQuality, type HrQuality, type HrSample } from './hr-quality.ts';

export type SliceKey = 'strength' | 'hard_cardio' | 'easy_cardio';
export type BinSignal = 'hr' | 'power' | 'pace_unanchored' | 'srpe' | 'mixed';

/** D-263: a slice's ACWR at or above this means it's being loaded at
 *  maintenance-or-above (acute avg ≥ chronic avg) — i.e. genuinely carried, not
 *  detraining. The "loaded overall" gate reads TOTAL ACWR against this. Per-slice
 *  ACWR is a BONUS that only exists when a slice's chronic base earns the 500
 *  floor (usually it doesn't — see PERMISE reframe: composition is primary, ratios
 *  mature in). Canonical home (D-264: one place). */
export const SLICE_LOADED_ACWR_MIN = 1.0;

/** D-263 bs3: a slice carries the acute load when its share of the total acute
 *  load is at or above this (0.5 = a majority). Attribution keys on COMPOSITION,
 *  not per-slice ACWR (which is null-by-floor in prod). Below it there is no
 *  dominant carrier and the generic "across your training" line is CORRECT — not
 *  a fallback failure. */
export const ATTRIBUTION_DOMINANT_SHARE = 0.5;

/** Which slice (if any) carries a majority of the acute load. Returns null when
 *  no slice reaches ATTRIBUTION_DOMINANT_SHARE (genuinely spread → generic copy). */
export function dominantAcuteSlice(pd: PerDomainLoad | null | undefined): SliceKey | null {
  if (!pd) return null;
  const loads: Array<[SliceKey, number]> = [
    ['easy_cardio', pd.easy_cardio?.acute_load || 0],
    ['hard_cardio', pd.hard_cardio?.acute_load || 0],
    ['strength', pd.strength?.acute_load || 0],
  ];
  const total = loads.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return null;
  for (const [key, v] of loads) {
    if (v / total >= ATTRIBUTION_DOMINANT_SHARE) return key;
  }
  return null;
}

/** D-263: easy/hard IF boundary per discipline, anchored to D-238's 'tempo' band
 *  (IF 0.80 = the aerobic|threshold seam). Per-discipline so each can diverge; today
 *  all anchor to the same D-238 line. `hard` iff IF ≥ value. Swim never consults this
 *  (unanchored → easy). */
export const CARDIO_HARD_EASY_IF: Record<string, number> = { run: 0.80, ride: 0.80 };

export interface SliceSession {
  date: string;
  type: string;
  workload: number | null | undefined; // sRPE load (workouts.workload_actual)
  avgHr?: number | null;
  avgPower?: number | null;
  avgPace?: number | null;   // swim: sec/100m
  ftp?: number | null;
  thresholdHr?: number | null; // LTHR
  samples?: HrSample[] | null; // for measured hr_quality
}

function normType(t: string): string {
  const s = String(t || '').toLowerCase().trim();
  if (s.startsWith('run')) return 'run';
  if (s.startsWith('ride') || s.startsWith('bike') || s.startsWith('cycl') || s.startsWith('virtualride')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  return s;
}

export interface SessionClassification {
  slice: SliceKey;
  bin_signal: BinSignal;
  hr_quality: HrQuality | 'n/a';
  intensity: number | null; // IF, null when unclassifiable
}

export function classifySession(s: SliceSession): SessionClassification {
  const t = normType(s.type);
  if (t === 'strength') return { slice: 'strength', bin_signal: 'srpe', hr_quality: 'n/a', intensity: null };

  // Swim: pace-binned but UNANCHORED (no CSS threshold) → always easy, never hard on a guess.
  if (t === 'swim') return { slice: 'easy_cardio', bin_signal: 'pace_unanchored', hr_quality: 'n/a', intensity: null };

  // Run / ride: primary signal. HR gated by measured quality ANY time HR is used (fix 1).
  let bin: BinSignal = 'srpe';
  let intensity = 0;
  let hrq: HrQuality | 'n/a' = 'n/a';

  if (t === 'ride' && s.avgPower && s.ftp) {
    intensity = inferIntensityFromPerformance({ type: 'ride', avgPower: s.avgPower, ftp: s.ftp });
    bin = 'power';
  } else {
    // HR path — run's primary, and ride's fallback when power is absent. Gate on hr_quality.
    hrq = assessHrQuality(s.samples ?? null, s.avgHr ?? null).hr_quality;
    if (s.avgHr && s.thresholdHr && hrq === 'ok') {
      intensity = inferIntensityFromPerformance({ type: t, avgHr: s.avgHr, thresholdHr: s.thresholdHr });
      bin = 'hr';
    }
  }

  if (!(intensity > 0)) {
    // No trusted intensity signal → sRPE fallback; never inflate hard on a guess → easy.
    return { slice: 'easy_cardio', bin_signal: 'srpe', hr_quality: hrq, intensity: null };
  }
  const threshold = CARDIO_HARD_EASY_IF[t] ?? 0.80;
  const slice: SliceKey = intensity >= threshold ? 'hard_cardio' : 'easy_cardio';
  return { slice, bin_signal: bin as BinSignal, hr_quality: hrq, intensity };
}

export interface PerDomainSlice {
  key: SliceKey;
  acwr: number | null;
  acute_load: number;
  chronic_load: number;
  status: 'ok' | 'insufficient_base';
  bin_signal: BinSignal;
  hr_quality: HrQuality | 'n/a';
}
export interface PerDomainLoad {
  strength: PerDomainSlice;
  hard_cardio: PerDomainSlice;
  easy_cardio: PerDomainSlice;
}

export function computePerDomainLoad(sessions: SliceSession[], opts: { asOfDate: string }): PerDomainLoad {
  const bins: Record<SliceKey, { rows: LoadRow[]; signals: Set<BinSignal>; hrqs: (HrQuality)[] }> = {
    strength: { rows: [], signals: new Set(), hrqs: [] },
    hard_cardio: { rows: [], signals: new Set(), hrqs: [] },
    easy_cardio: { rows: [], signals: new Set(), hrqs: [] },
  };
  for (const s of sessions) {
    const c = classifySession(s);
    bins[c.slice].rows.push({ date: s.date, workload: s.workload, type: s.type });
    bins[c.slice].signals.add(c.bin_signal);
    if (c.hr_quality !== 'n/a') bins[c.slice].hrqs.push(c.hr_quality);
  }
  const build = (key: SliceKey): PerDomainSlice => {
    const b = bins[key];
    const r = computeAcwr(b.rows, { asOfDate: opts.asOfDate });
    const bin_signal: BinSignal = b.signals.size === 0 ? 'srpe' : b.signals.size === 1 ? [...b.signals][0] : 'mixed';
    const hr_quality: HrQuality | 'n/a' = b.hrqs.length === 0 ? 'n/a'
      : b.hrqs.includes('none') ? 'none' : b.hrqs.includes('low') ? 'low' : 'ok';
    return {
      key,
      acwr: r.ratio,
      acute_load: Math.round(r.acuteLoad),
      chronic_load: Math.round(r.chronicLoad),
      status: r.thinBase ? 'insufficient_base' : 'ok',
      bin_signal,
      hr_quality,
    };
  };
  return { strength: build('strength'), hard_cardio: build('hard_cardio'), easy_cardio: build('easy_cardio') };
}
