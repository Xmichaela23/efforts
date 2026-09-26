/**
 * HEART-RATE DRIFT, THE BOOK'S OWN MEASURE (p107): heart rate in the second half of a session against the
 * first half, as a percentage, at whatever effort the session held. One definition for runs and rides, so
 * the Drift chip on a run and on a ride mean the same thing (Michael 2026-09-03: "drift is going to be
 * important... on the performance screens for running and riding").
 *
 *   - The first `skipStartS` (180 s) are dropped: heart rate lags effort by 2–3 min, so the opening minutes
 *     read low and would inflate every session's drift.
 *   - Samples with no heart rate, or a heart rate outside 40–230, are ignored.
 *   - Halves are split by TIME, not by sample count, so a recording with gaps still splits at the midpoint.
 *   - At least 6 minutes of usable samples, or null.
 *
 * On an interval session the number is computed but NOT shown on the session screen (2026-09-12, p107:
 * drift is a steady-session read); `session-detail/build.ts decouplingV1` gates it. State's trend
 * excludes interval sessions on its own rule.
 */
import { sampleOffsetSeconds } from './run-warmup-easy.ts';

export interface HrDriftHalves {
  pct: number;          // (second − first) / first × 100, one decimal
  first_avg_hr: number;
  second_avg_hr: number;
  seconds: number;      // usable seconds after the skip
  basis: 'hr';
  method: 'halves_by_time';
}

/** The planned warm-up's length when the session was laid out against a plan (its first step is a
 *  warm-up), else the 3-minute heart-rate lag. Drift is read over the MAIN part of the session. */
export function warmupSkipSeconds(computed: any, fallbackS = 180): number {
  try {
    const iv = Array.isArray(computed?.intervals) ? computed.intervals[0] : null;
    const role = String(iv?.role || iv?.kind || '').toLowerCase();
    const s = Number(iv?.executed?.duration_s ?? iv?.planned?.duration_s);
    // OURS — `warmupSkipSeconds` a warm-up step counts at ≥ 60 s, never under the 180 s lag fallback
    if (/warm/.test(role) && Number.isFinite(s) && s >= 60) return Math.max(fallbackS, Math.round(s));
  } catch { /* fall through */ }
  return fallbackS;
}

export function hrDriftHalvesPct(
  samples: any[],
  totalSeconds: number,
  opts: { skipStartS?: number; minSeconds?: number } = {},
): HrDriftHalves | null {
  // OURS — `hrDriftHalvesPct` skip 180 s, ≥ 360 s usable, ≥ 20 samples, HR 40–230, ≥ 10 points and ≥ 5 per half; ms detection at 10× the session length (the halves measure itself is Viada p107)
  const skip = opts.skipStartS ?? 180;
  const minS = opts.minSeconds ?? 360;
  if (!Array.isArray(samples) || samples.length < 20) return null;
  const interval = totalSeconds > 0 ? totalSeconds / samples.length : 1;
  const first = samples[0];
  // Some recordings carry absolute timestamps in MILLISECONDS; a span more than 10× the session length is ms.
  const rawSpan = sampleOffsetSeconds(samples[samples.length - 1] || {}, samples.length - 1, first, interval);
  const scale = (totalSeconds > 0 && rawSpan > totalSeconds * 10) ? 1 / 1000 : 1;
  const pts: Array<{ t: number; hr: number }> = [];
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i] || {};
    const t = sampleOffsetSeconds(s, i, first, interval) * scale;
    if (t < skip) continue;
    const hr = Number(s.heartRate ?? s.heart_rate ?? s.hr);
    if (!Number.isFinite(hr) || hr < 40 || hr > 230) continue;
    pts.push({ t, hr });
  }
  if (pts.length < 10) return null;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const span = t1 - t0;
  if (!(span >= minS)) return null;
  const mid = t0 + span / 2;
  let a = 0, na = 0, b = 0, nb = 0;
  for (const p of pts) { if (p.t < mid) { a += p.hr; na += 1; } else { b += p.hr; nb += 1; } }
  if (na < 5 || nb < 5) return null;
  const firstAvg = a / na, secondAvg = b / nb;
  if (!(firstAvg > 0)) return null;
  return {
    pct: Math.round(((secondAvg - firstAvg) / firstAvg) * 1000) / 10,
    first_avg_hr: Math.round(firstAvg),
    second_avg_hr: Math.round(secondAvg),
    seconds: Math.round(span),
    basis: 'hr',
    method: 'halves_by_time',
  };
}

const parseJson = (v: unknown): any => {
  if (typeof v !== 'string') return v ?? null;
  try { return JSON.parse(v); } catch { return null; }
};

/** A stored `hr_drift_v1` as read back: the object when its `pct` is a number, else null. */
function storedDrift(v: unknown): HrDriftHalves | null {
  const d = v as HrDriftHalves | null | undefined;
  return d && typeof d.pct === 'number' && Number.isFinite(d.pct) ? d : null;
}

/**
 * ⛔ THE ONE DRIFT, FOR A READER THAT IS NOT THE ANALYSER (2026-09-26, Michael: "go"). `compute-facts` halved the
 * samples by COUNT with no warm-up skip — a second drift beside this one, and the one the "Bike HR drift trending
 * higher" signal read. This returns the analyser's stored `hr_drift_v1` whenever the analysis carries the key (the
 * number the Performance screen prints, null included), else the same measure worked out here from the inputs the
 * analysers hand it — the samples, the moving time, the planned warm-up. `compute-facts` runs before the analyser
 * on a first ingest, which is the only time the key is missing on a session analysed since 2026-09-03.
 */
export function sessionHrDriftV1(w: {
  workout_analysis?: unknown;
  sensor_data?: unknown;
  computed?: unknown;
  moving_time?: unknown;
  duration?: unknown;
}): HrDriftHalves | null {
  const wa = parseJson(w?.workout_analysis);
  if (wa && typeof wa === 'object' && 'hr_drift_v1' in wa) return storedDrift(wa.hr_drift_v1);
  const sd = parseJson(w?.sensor_data);
  const samples = Array.isArray(sd?.samples) ? sd.samples : Array.isArray(sd) ? sd : [];
  const totalS = Number(w?.moving_time ?? w?.duration ?? 0);
  try {
    return hrDriftHalvesPct(samples, totalS > 0 && totalS < 1000 ? totalS * 60 : totalS, {
      skipStartS: warmupSkipSeconds(parseJson(w?.computed)),
    });
  } catch { return null; }
}

/**
 * The same drift in BEATS — the second half's average heart rate minus the first half's, from `hr_drift_v1` — for the
 * readers that speak bpm: the coach's weekly drift reads and the daily ledger (2026-09-26). They read the analysers'
 * early-window-vs-late-window `heart_rate_analysis.hr_drift_bpm`, a second drift. null when the analysis carries no
 * `hr_drift_v1` (a session analysed before 2026-09-03, or one too short to split).
 */
export function hrDriftV1Bpm(workoutAnalysis: unknown): number | null {
  const d = storedDrift(parseJson(workoutAnalysis)?.hr_drift_v1);
  if (!d || !Number.isFinite(d.first_avg_hr) || !Number.isFinite(d.second_avg_hr)) return null;
  return d.second_avg_hr - d.first_avg_hr;
}
