/**
 * core-effort.ts — slice a run over a frozen core and compute the per-effort FACTS (DESIGN-segments §4.3).
 *
 * Facts, not verdicts (Law 2): duration / distance / pace / HR / decoupling / temp over JUST the core
 * span — the opposite of the terrain trio's apportioned whole-run averages, which is what made this
 * feature possible. The VERDICT (improving/holding/…) is NOT computed here; it is born on the spine
 * (Law 5, step 4). This module only measures.
 *
 * metric_source is decided by HR coverage INSIDE THE SLICE, never a row-level boolean: a run can carry
 * HR that drops out across the core stretch. If the aligned HR points within [entry..exit] are too
 * thin, that effort is raw_pace_only even if the run has HR elsewhere. Raw pace is still honest — the
 * fixed geometry already removes the hills — it just can't carry same-effort pace.
 *
 * Pure math, no Deno/Node APIs. Fixtures: core-effort.test.ts. Reuses core-match.
 */
import { haversineM, type LatLng, matchCore, type CoreMatchOpts, pathLengthM } from './core-match.ts';

export interface EffortPoint {
  lat: number;
  lng: number;
  t?: number; // epoch ms (per-point clock; shared with sensor_data.samples)
}

export interface CoreEffortInput {
  /** the run's ordered GPS points, each with per-point time (ms) */
  gps: EffortPoint[];
  /** timestamp(ms) → HR bpm, built from sensor_data.samples (same clock as gps) */
  hrByT?: Map<number, number> | null;
  /** the frozen core's geometry */
  corePolyline: LatLng[];
  /** temp °F from weather_data (heat parked D-251; captured for the later refinement) */
  tempF?: number | null;
}

export type MetricSource = 'hr_aligned' | 'raw_pace_only';

export interface CoreEffort {
  entryIdx: number;
  exitIdx: number;
  overlapRatio: number;
  matchedDistanceM: number;
  durationS: number;
  distanceM: number;
  avgPaceSPerKm: number;
  avgHrBpm: number | null;
  decouplingPct: number | null;
  tempF: number | null;
  metricSource: MetricSource;
  /** fraction of sliced points that had an aligned HR reading (diagnostic; drives metric_source) */
  hrCoverage: number;
}

export interface CoreEffortOpts extends CoreMatchOpts {
  /** min fraction of sliced points that must carry HR to call the effort hr_aligned. Default 0.5. */
  hrCoverageThreshold?: number;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Mean HR over a set of points, using the timestamp→HR map. Returns {mean, coverage, n}. */
function hrOver(points: EffortPoint[], hrByT: Map<number, number> | null | undefined) {
  if (!hrByT || hrByT.size === 0) return { mean: null as number | null, coverage: 0, n: 0 };
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.t == null) continue;
    const hr = hrByT.get(p.t);
    if (hr != null && hr > 0) {
      sum += hr;
      n++;
    }
  }
  return { mean: n > 0 ? sum / n : null, coverage: points.length > 0 ? n / points.length : 0, n };
}

/**
 * Match the run against the core and, if it traverses, compute the sliced effort facts. Returns null
 * if the run does not traverse the core, or if the slice lacks the time needed to compute a duration.
 */
export function computeCoreEffort(input: CoreEffortInput, opts: CoreEffortOpts = {}): CoreEffort | null {
  const { gps, hrByT, corePolyline, tempF } = input;
  const hrCoverageThreshold = opts.hrCoverageThreshold ?? 0.5;
  if (!gps || gps.length < 2 || !corePolyline || corePolyline.length < 2) return null;

  const match = matchCore(gps as LatLng[], corePolyline, opts);
  if (!match || match.exitIdx <= match.entryIdx) return null;

  const slice = gps.slice(match.entryIdx, match.exitIdx + 1);
  const tEntry = gps[match.entryIdx].t;
  const tExit = gps[match.exitIdx].t;
  if (tEntry == null || tExit == null || tExit <= tEntry) return null; // no duration → no effort

  const durationS = (tExit - tEntry) / 1000;
  const distanceM = pathLengthM(slice as LatLng[]);
  if (distanceM <= 0) return null;
  const avgPaceSPerKm = durationS / (distanceM / 1000);

  // HR + provenance, decided over THE SLICE (not the run).
  const whole = hrOver(slice, hrByT);
  const hrAligned = whole.coverage >= hrCoverageThreshold && whole.mean != null;

  // Aerobic decoupling: speed:HR efficiency, first half vs second half of the slice. Only when both
  // halves carry HR (else it would be a fabricated number — Law 2).
  let decouplingPct: number | null = null;
  if (hrAligned) {
    const mid = Math.floor(slice.length / 2);
    const h1 = slice.slice(0, mid + 1);
    const h2 = slice.slice(mid);
    const eff = (pts: EffortPoint[]) => {
      const t0 = pts[0]?.t;
      const t1 = pts[pts.length - 1]?.t;
      if (t0 == null || t1 == null || t1 <= t0) return null;
      const dist = pathLengthM(pts as LatLng[]);
      const dur = (t1 - t0) / 1000;
      const hr = hrOver(pts, hrByT);
      if (dist <= 0 || dur <= 0 || hr.mean == null || hr.n < 2) return null;
      return (dist / dur) / hr.mean; // speed per bpm
    };
    const e1 = eff(h1);
    const e2 = eff(h2);
    if (e1 != null && e2 != null && e1 > 0) {
      decouplingPct = round(((e1 - e2) / e1) * 100, 1); // + = decoupled (2nd half less efficient)
    }
  }

  return {
    entryIdx: match.entryIdx,
    exitIdx: match.exitIdx,
    overlapRatio: match.overlapRatio,
    matchedDistanceM: match.matchedDistanceM,
    durationS: round(durationS, 1),
    distanceM: Math.round(distanceM),
    avgPaceSPerKm: round(avgPaceSPerKm, 1),
    avgHrBpm: hrAligned ? Math.round(whole.mean as number) : null,
    decouplingPct,
    tempF: tempF ?? null,
    metricSource: hrAligned ? 'hr_aligned' : 'raw_pace_only',
    hrCoverage: round(whole.coverage, 3),
  };
}
