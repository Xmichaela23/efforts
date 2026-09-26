/**
 * THE COMPARABLE-EASY-RUN GATE for `compute-adaptation-metrics` — moved out of `index.ts` unchanged except for its
 * band (2026-09-26) so a test can drive it: `Deno.serve` runs at import there, the precedent `compute-facts/
 * strength-facts-lib.ts` set. `index.ts` imports it.
 */
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
import { resolveMeasuredEasyPaceSecPerMi } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveRunEasyHrBand, type EasyHrBaselines } from '../_shared/easy-hr.ts';

type LearnedMetric = {
  value: number;
  confidence?: 'low' | 'medium' | 'high' | number;
  source?: string;
  sample_count?: number;
};

export function parseJson<T = any>(val: any): T | null {
  if (val == null) return null;
  try {
    return typeof val === 'string' ? JSON.parse(val) : (val as T);
  } catch {
    return val as T;
  }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function confidenceToNumber(conf: LearnedMetric['confidence']): number {
  if (conf == null) return 0;
  if (typeof conf === 'number') return clamp(conf, 0, 1);
  if (conf === 'high') return 0.9;
  if (conf === 'medium') return 0.65;
  if (conf === 'low') return 0.4;
  return 0;
}

export function minutesFromWorkout(durationMin: any, movingMin: any): number | null {
  const d = Number(durationMin);
  const m = Number(movingMin);
  const v = Number.isFinite(m) && m > 0 ? m : Number.isFinite(d) && d > 0 ? d : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

function getWorkoutTextHints(workout: any): string {
  const name = String(workout?.name || '');
  const meta = parseJson<any>(workout?.workout_metadata) || {};
  const tags = Array.isArray(meta?.tags) ? meta.tags.join(' ') : '';
  const desc = String(meta?.description || meta?.notes || '');
  const detected = String(
    workout?.computed?.analysis?.workout_type_detected ||
      workout?.computed?.workout_type_detected ||
      ''
  );
  return `${name} ${tags} ${desc} ${detected}`.toLowerCase();
}

function parseEasyPaceMmSsPerMiToSecPerKm(val: any): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const ss = Number(m[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss < 0 || ss >= 60) return null;
  const secPerMi = mm * 60 + ss;
  return secPerMi / 1.60934;
}

/**
 * Is this run a comparable easy (Z2) run, for the aerobic-efficiency read?
 *
 * @param baselines the athlete's `user_baselines` row, WHOLE — `learned_fitness`, `performance_numbers`,
 *   `configured_hr_zones` (2026-09-26). The easy band and the threshold come from their owners, fed this row.
 */
export function isComparableZ2Run(
  workout: any,
  baselines: EasyHrBaselines,
): {
  ok: boolean;
  reason: string;
  z2: { lower: number; upper: number; source: string } | null;
  confidence: number;
  debug: Record<string, any>;
} {
  const hints = getWorkoutTextHints(workout);
  if (hints.includes('interval')) return { ok: false, reason: 'tagged_interval', z2: null, confidence: 0, debug: { hints } };
  if (hints.includes('tempo')) return { ok: false, reason: 'tagged_tempo', z2: null, confidence: 0, debug: { hints } };
  if (hints.includes('race')) return { ok: false, reason: 'tagged_race', z2: null, confidence: 0, debug: { hints } };

  const minutes = minutesFromWorkout(workout?.duration, workout?.moving_time);
  // Slightly looser by default, then we rely on pace/HR gates.
  if (minutes == null) return { ok: false, reason: 'missing_duration', z2: null, confidence: 0, debug: { hints } };
  if (minutes < 30) return { ok: false, reason: 'too_short', z2: null, confidence: 0, debug: { hints, minutes } };
  // >90 minutes is handled as a "long run" lane elsewhere

  const avgHr = Number(workout?.avg_heart_rate);
  if (!Number.isFinite(avgHr)) return { ok: false, reason: 'missing_hr', z2: null, confidence: 0, debug: { hints, minutes } };
  if (avgHr < 80 || avgHr > 220) return { ok: false, reason: 'hr_out_of_range', z2: null, confidence: 0, debug: { hints, minutes, avgHr } };

  // Intensity factor gate (if present in computed or calculated metrics)
  const computed = parseJson<any>(workout?.computed) || {};
  const if1 = Number(computed?.intensity_factor ?? computed?.overall?.intensity_factor ?? computed?.metrics?.intensity_factor);
  // Note: IF can be noisy for runs; we keep the gate but emit a debug reason.
  if (Number.isFinite(if1) && if1 > 0.85) return { ok: false, reason: 'high_intensity_factor', z2: null, confidence: 0, debug: { hints, minutes, avgHr, if1 } };

  /**
   * ⛔ THE EASY BAND IS THE ONE EASY RULE (2026-09-26, Michael: "go"). This was the app's sixth definition of easy:
   * the learned easy heart rate ± 6% (± 10% at low confidence), else 83% of threshold × 0.92–1.10, else 65–75% of an
   * age-formula max (age 35 when missing). Now `resolveRunEasyHrBand` — the band the learner, the facts, the run
   * screen and Baselines use: 70–89% of the threshold on Baselines (Friel Zone 2's top), else 65–80% of the max. No
   * anchor at all → not judged (the band answers null before it invents).
   */
  const lf = parseJson<any>((baselines as any)?.learned_fitness);
  const perfNumbers = parseJson<any>((baselines as any)?.performance_numbers);
  const easyBand = resolveRunEasyHrBand(baselines);
  if (easyBand.ceiling == null || easyBand.floor == null) {
    return { ok: false, reason: 'no_easy_band', z2: null, confidence: 0, debug: { hints, minutes, avgHr, if1: Number.isFinite(if1) ? if1 : null } };
  }
  const z2Lower = easyBand.floor;
  const z2Upper = easyBand.ceiling;
  const conf = Math.max(0.35, confidenceToNumber(easyBand.confidence ?? undefined));
  const source = `easy_hr_band:${easyBand.anchor}`;
  /**
   * ⛔ THROUGH THE ONE LTHR RESOLVER, WITH THE WHOLE ROW (2026-08-19; 2026-09-26). The threshold only sets the
   * "clearly hard" cap for the pace path below; it no longer derives a band of its own.
   */
  const thresholdResolved = resolveCurrentLthr({
    learned_fitness: lf, performance_numbers: perfNumbers, configured_hr_zones: parseJson<any>((baselines as any)?.configured_hr_zones),
  } as never, { sport: 'run' });
  const thresholdHrMetric: LearnedMetric | null =
    thresholdResolved.bpm != null
      ? ({ value: thresholdResolved.bpm, confidence: thresholdResolved.confidence ?? undefined } as LearnedMetric)
      : null;

  // Optional pace gate using manual easy pace baseline (reduces false negatives when HR is noisy)
  const avgPace = Number(workout?.avg_pace); // sec/km
  const lf2 = lf;
  /**
   * ⛔ THROUGH THE ONE EASY-PACE RESOLVER (2026-08-19). This was a private two-tier chain — learned
   * above a 0.35 confidence bar, else the typed value — which is the resolver's chain with a
   * different bar and without the athlete's Q-174 choice. An athlete who said "use my number" had it
   * overridden here by a low-confidence learned pace.
   *
   * ⚠️ The resolver is sec/MILE; this gate works in sec/KM (it compares against `workout.avg_pace`).
   * Converted once, here.
   */
  // ⛔ D-478 (2026-09-15): "does this run's pace look easy for THIS athlete" asks for a MEASUREMENT — the learner's
  // easy pace (`resolveMeasuredEasyPaceSecPerMi`, medium/high confidence) — not the prescribed range off threshold.
  const measuredEasyMi = resolveMeasuredEasyPaceSecPerMi({
    learned_fitness: lf2, performance_numbers: perfNumbers,
  } as never);
  const baselineEasySecPerKm = measuredEasyMi != null
    ? measuredEasyMi / 1.60934
    : parseEasyPaceMmSsPerMiToSecPerKm(perfNumbers?.easyPace);
  if (!Number.isFinite(avgPace) || !(avgPace > 0)) {
    // If HR matches our easy range, we can still accept and store pace as missing (but aerobic efficiency can't be computed).
    // For comparability gating, treat missing pace as non-comparable to keep the metric clean.
    return { ok: false, reason: 'missing_pace', z2: { lower: z2Lower, upper: z2Upper, source }, confidence: conf, debug: { hints, minutes, avgHr, if1, z2Lower, z2Upper, source } };
  }

  const paceLooksEasy =
    Number.isFinite(avgPace) &&
    avgPace > 120 &&
    avgPace < 900 &&
    baselineEasySecPerKm != null &&
    // within +25% slower to -10% faster than baseline easy pace
    avgPace >= baselineEasySecPerKm * 0.90 &&
    avgPace <= baselineEasySecPerKm * 1.25;

  const hrLooksEasy = avgHr >= z2Lower && avgHr <= z2Upper;

  // Accept if HR fits OR pace fits and HR isn't clearly hard (cap at ~92% threshold if known)
  let hrHardCap: number | null = null;
  if (thresholdHrMetric?.value) hrHardCap = Number(thresholdHrMetric.value) * 0.92;

  const notClearlyHard = hrHardCap == null ? avgHr <= z2Upper * 1.08 : avgHr <= hrHardCap;

  const ok = hrLooksEasy || (paceLooksEasy && notClearlyHard);
  if (!ok) {
    const reason =
      !notClearlyHard ? 'too_hard' :
      !hrLooksEasy && paceLooksEasy ? 'hr_outside_easy_band' :
      'pace_or_hr_not_easy';
    return {
      ok: false,
      reason,
      z2: { lower: z2Lower, upper: z2Upper, source },
      confidence: conf,
      debug: {
        hints,
        minutes,
        avgHr,
        avgPace,
        if1: Number.isFinite(if1) ? if1 : null,
        z2Lower,
        z2Upper,
        source,
        baselineEasySecPerKm,
        paceLooksEasy,
        hrLooksEasy,
        hrHardCap,
        notClearlyHard,
        // The debug receipt reports what was actually USED, and now says where it came from —
        // `source` is the resolver's tier, so a typed pace can no longer be logged as a learned one.
        learned_easy_pace_sec_per_km: measuredEasyMi != null ? measuredEasyMi / 1.60934 : null,
        learned_easy_pace_conf: null, // D-478: the measured value is medium/high only; no raw read past the resolver
        easy_pace_source: measuredEasyMi != null ? 'learned' : null,
      },
    };
  }
  return {
    ok: true,
    reason: 'ok',
    z2: { lower: z2Lower, upper: z2Upper, source },
    confidence: conf,
    debug: {
      hints,
      minutes,
      avgHr,
      avgPace,
      if1: Number.isFinite(if1) ? if1 : null,
      z2Lower,
      z2Upper,
      source,
      baselineEasySecPerKm,
      paceLooksEasy,
      hrLooksEasy,
      hrHardCap,
      notClearlyHard,
      learned_easy_pace_sec_per_km: measuredEasyMi != null ? measuredEasyMi / 1.60934 : null,
      learned_easy_pace_conf: null, // D-478: the measured value is medium/high only; no raw read past the resolver
      easy_pace_source: measuredEasyMi != null ? 'learned' : null,
    },
  };
}
