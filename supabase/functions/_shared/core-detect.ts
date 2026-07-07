/**
 * core-detect.ts — auto-core detection by CONSENSUS (DESIGN-segments.md §4.2, Q-132 / D-250).
 *
 * Given a user's run polylines, find the fixed "cores" — the common ordered sub-path shared by
 * ≥K runs from each (trailhead, direction) — and return them as candidate geometry to FREEZE.
 *
 * Deliberate design (ruled 2026-07-06, all five criteria approved):
 *  • CONSENSUS, not LCS-over-cells. At each arc-length step we take the robust centre of the runs
 *    still in a corridor and extend while ≥K agree. Smooth + corridor-tolerant + yields exactly
 *    ONE core per group — the structural answer to the 420-fragment disease (criterion 4).
 *  • Grouped by (trailhead, direction bucket) BEFORE any geometry exists — fork-2 (separate
 *    direction) enforced at the grouping layer.
 *  • Birth at K=5 comparable runs; groups below K (travel/marathon one-offs) never mint a core.
 *  • This module is PURE: it proposes cores. FREEZING (insert, version, the write-once guard) is
 *    the caller's job (detect-cores edge fn) — and the caller must NOT re-detect geometry for a
 *    (trailhead, direction) that already has an active core. Geometry is born once (criteria 2/5).
 *
 * Pure math, no Deno/Node APIs. Fixtures: core-detect.test.ts. Reuses core-match geo primitives.
 */
import { type LatLng, haversineM, pathLengthM, resample } from './core-match.ts';

export interface DetectRun {
  id: string;
  date: string; // YYYY-MM-DD
  points: LatLng[];
}

export interface DetectedCore {
  coreKey: string;
  trailheadCell: string;
  pointPolyline: LatLng[];
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  directionBearing: number;
  directionBucket: number;
  distanceM: number;
  detectedFromN: number; // runs supporting the full consensus at birth (≥K)
  memberRunIds: string[];
}

export interface DetectOpts {
  minRuns?: number; // K — birth threshold. Default 5.
  trailheadRadiusM?: number; // start-cluster radius. Default 75.
  corridorM?: number; // consensus agreement corridor. Default 25.
  spacingM?: number; // arc-length step. Default 20.
  bearingBucketDeg?: number; // direction bucket width. Default 45.
  headingSampleM?: number; // distance over which initial bearing is measured. Default 200.
  minCoreDistanceM?: number; // reject trivial cores. Default 100.
  coverageFrac?: number; // extend the core while ≥ this fraction of the group still covers it. Default 0.75.
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Initial bearing a→b, degrees 0..360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = a.lat * D2R;
  const φ2 = b.lat * D2R;
  const dλ = (b.lng - a.lng) * D2R;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Bearing over the first `sampleM` metres of a run (its outbound heading). */
function initialBearing(points: LatLng[], sampleM: number): number {
  const start = points[0];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversineM(points[i - 1], points[i]);
    if (acc >= sampleM) return bearingDeg(start, points[i]);
  }
  return bearingDeg(start, points[points.length - 1]);
}

/** Component-wise median (robust centre, resists a branched run pulling the mean). */
function medianPoint(pts: LatLng[]): LatLng {
  const lats = pts.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = pts.map((p) => p.lng).sort((a, b) => a - b);
  const m = Math.floor(pts.length / 2);
  return { lat: lats[m], lng: lngs[m] };
}

/**
 * The OUTBOUND leg of a run: start → the point farthest from start. For an out-and-back that is the
 * trailhead→turnaround half; detecting on outbound legs only keeps the return leg (which retraces the
 * same geography) from forming a false backward consensus when a majority turn around together.
 */
function outboundLeg(points: LatLng[]): LatLng[] {
  let far = 0;
  let farD = -1;
  for (let i = 1; i < points.length; i++) {
    const d = haversineM(points[0], points[i]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  return points.slice(0, far + 1);
}

function meanPoint(pts: LatLng[]): LatLng {
  let la = 0;
  let ln = 0;
  for (const p of pts) {
    la += p.lat;
    ln += p.lng;
  }
  return { lat: la / pts.length, lng: ln / pts.length };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Greedy start-point clustering → trailheads. */
function clusterTrailheads(runs: DetectRun[], radiusM: number): Map<string, DetectRun[]> {
  const heads: { centroid: LatLng; runs: DetectRun[] }[] = [];
  for (const run of runs) {
    if (!run.points || run.points.length < 2) continue;
    const s = run.points[0];
    let placed = false;
    for (const h of heads) {
      if (haversineM(h.centroid, s) <= radiusM) {
        h.runs.push(run);
        // running centroid (keeps the cluster anchor stable-ish)
        h.centroid = meanPoint(h.runs.map((r) => r.points[0]));
        placed = true;
        break;
      }
    }
    if (!placed) heads.push({ centroid: { ...s }, runs: [run] });
  }
  const out = new Map<string, DetectRun[]>();
  for (const h of heads) {
    const key = `th_${round(h.centroid.lat, 4)}_${round(h.centroid.lng, 4)}`;
    out.set(key, h.runs);
  }
  return out;
}

/**
 * Build the consensus polyline for one (trailhead, direction) group: extend arc-length by
 * arc-length while ≥K runs agree within corridor; stop where support drops (a shorter run turned
 * around, or a branch diverged). Returns the consensus points + how many runs traversed all of it.
 */
function buildConsensus(
  runs: DetectRun[],
  K: number,
  corridorM: number,
  spacingM: number,
  coverageFrac: number,
): { polyline: LatLng[]; support: number } {
  const R = runs.map((r) => resample(outboundLeg(r.points), spacingM));
  // Extend the core only while a STRONG MAJORITY of the group still covers it — not merely ≥K.
  // "≥K present" would stretch the core out to the few longest runs (support→tiny); a coverage
  // floor keeps the core at the COMMON stem that most same-direction runs share (support→large),
  // which is what maximizes efforts and clears the N≥8 verdict floor. (Ruled 2026-07-06 after the
  // real-data group view showed a 37-run direction over-extending to a 3013m core with support 7.)
  const need = Math.max(K, Math.ceil(coverageFrac * runs.length));
  const consensus: LatLng[] = [];
  for (let i = 0; ; i++) {
    const present = R.filter((rr) => rr.length > i).map((rr) => rr[i] as LatLng);
    if (present.length < need) break;
    const centre = medianPoint(present);
    const inCorridor = present.filter((p) => haversineM(p, centre) <= corridorM);
    if (inCorridor.length < need) break;
    consensus.push(meanPoint(inCorridor));
  }
  if (consensus.length < 2) return { polyline: consensus, support: 0 };
  // support = runs that stayed within corridor of the consensus for its FULL length
  let support = 0;
  for (const rr of R) {
    if (rr.length < consensus.length) continue;
    let ok = true;
    for (let i = 0; i < consensus.length; i++) {
      if (haversineM(rr[i] as LatLng, consensus[i]) > corridorM) {
        ok = false;
        break;
      }
    }
    if (ok) support++;
  }
  return { polyline: consensus, support };
}

/** Detect all cores across a user's runs. Pure — proposes geometry; the caller freezes it. */
export function detectCores(runs: DetectRun[], opts: DetectOpts = {}): DetectedCore[] {
  const K = opts.minRuns ?? 5;
  const trailheadRadiusM = opts.trailheadRadiusM ?? 75;
  const corridorM = opts.corridorM ?? 25;
  const spacingM = opts.spacingM ?? 20;
  const bucketDeg = opts.bearingBucketDeg ?? 45;
  const headingSampleM = opts.headingSampleM ?? 200;
  const minCoreDistanceM = opts.minCoreDistanceM ?? 100;
  const coverageFrac = opts.coverageFrac ?? 0.75;

  const usable = runs.filter((r) => r?.points && r.points.length >= 2);
  const cores: DetectedCore[] = [];

  for (const [trailheadCell, thRuns] of clusterTrailheads(usable, trailheadRadiusM)) {
    // subgroup by direction bucket
    const byDir = new Map<number, DetectRun[]>();
    for (const run of thRuns) {
      const bucket = Math.floor(initialBearing(run.points, headingSampleM) / bucketDeg) %
        Math.round(360 / bucketDeg);
      (byDir.get(bucket) ?? byDir.set(bucket, []).get(bucket)!).push(run);
    }

    for (const [bucket, dirRuns] of byDir) {
      if (dirRuns.length < K) continue; // below birth threshold — no core (travel/marathon one-offs)
      const { polyline, support } = buildConsensus(dirRuns, K, corridorM, spacingM, coverageFrac);
      if (polyline.length < 2 || support < K) continue;
      const distanceM = pathLengthM(polyline);
      if (distanceM < minCoreDistanceM) continue;

      const start = polyline[0];
      const end = polyline[polyline.length - 1];
      const directionBearing = bearingDeg(start, end);
      const coreKey = [
        trailheadCell,
        `d${bucket}`,
        `s${round(start.lat, 4)},${round(start.lng, 4)}`,
        `e${round(end.lat, 4)},${round(end.lng, 4)}`,
        `l${Math.round(distanceM / 50)}`, // 50m distance bucket — jitter-tolerant identity
      ].join('|');

      cores.push({
        coreKey,
        trailheadCell,
        pointPolyline: polyline,
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        directionBearing: round(directionBearing, 1),
        directionBucket: bucket,
        distanceM: Math.round(distanceM),
        detectedFromN: support,
        memberRunIds: dirRuns.map((r) => r.id),
      });
    }
  }
  return cores;
}

export interface GroupStat {
  trailheadCell: string;
  trailheadRuns: number; // total runs at this trailhead (before direction split)
  directionBucket: number;
  runCount: number; // runs in this (trailhead, direction) group
  formedCore: boolean;
  consensusPoints: number;
  consensusDistanceM: number;
  support: number; // runs fully traversing the consensus
  reason: string; // core | below_K_runs | consensus_too_short | support_below_K | distance_below_min
}

/**
 * Diagnostic twin of detectCores: reports EVERY (trailhead, direction) group and why it did or
 * did not form a core. This is the knob-visibility tool — it answers "is detection silently
 * under-detecting, and which threshold dropped a real stretch?" Same grouping + consensus as
 * detectCores; it just records outcomes for the sub-K and failed-consensus groups too.
 */
export function groupStats(runs: DetectRun[], opts: DetectOpts = {}): GroupStat[] {
  const K = opts.minRuns ?? 5;
  const trailheadRadiusM = opts.trailheadRadiusM ?? 75;
  const corridorM = opts.corridorM ?? 25;
  const spacingM = opts.spacingM ?? 20;
  const bucketDeg = opts.bearingBucketDeg ?? 45;
  const headingSampleM = opts.headingSampleM ?? 200;
  const minCoreDistanceM = opts.minCoreDistanceM ?? 100;
  const coverageFrac = opts.coverageFrac ?? 0.75;

  const usable = runs.filter((r) => r?.points && r.points.length >= 2);
  const stats: GroupStat[] = [];

  for (const [trailheadCell, thRuns] of clusterTrailheads(usable, trailheadRadiusM)) {
    const byDir = new Map<number, DetectRun[]>();
    for (const run of thRuns) {
      const bucket = Math.floor(initialBearing(run.points, headingSampleM) / bucketDeg) %
        Math.round(360 / bucketDeg);
      (byDir.get(bucket) ?? byDir.set(bucket, []).get(bucket)!).push(run);
    }
    for (const [bucket, dirRuns] of byDir) {
      let reason = 'core';
      let formed = true;
      let cLen = 0;
      let cDist = 0;
      let support = 0;
      if (dirRuns.length < K) {
        reason = 'below_K_runs';
        formed = false;
      } else {
        const cons = buildConsensus(dirRuns, K, corridorM, spacingM, coverageFrac);
        cLen = cons.polyline.length;
        support = cons.support;
        cDist = cLen >= 2 ? pathLengthM(cons.polyline) : 0;
        if (cLen < 2) {
          reason = 'consensus_too_short';
          formed = false;
        } else if (support < K) {
          reason = 'support_below_K';
          formed = false;
        } else if (cDist < minCoreDistanceM) {
          reason = 'distance_below_min';
          formed = false;
        }
      }
      stats.push({
        trailheadCell,
        trailheadRuns: thRuns.length,
        directionBucket: bucket,
        runCount: dirRuns.length,
        formedCore: formed,
        consensusPoints: cLen,
        consensusDistanceM: Math.round(cDist),
        support,
        reason,
      });
    }
  }
  return stats.sort((a, b) => b.trailheadRuns - a.trailheadRuns || b.runCount - a.runCount);
}
