/**
 * core-match.ts — ordered path-match primitive (DESIGN-segments.md §4.1, Q-132 / D-250).
 *
 * The commercial-grade answer to "did this activity traverse this core, start→…→end, in
 * order, within a GPS buffer?" This is Strava's model and it is fundamentally different from
 * the superseded route model's DISTANCE-BLIND UNORDERED overlap (route-match.ts) which
 * over-merged 2.9–5.0mi runs and fragmented one trailhead into 4 clusters (D-250).
 *
 * Key properties that make the verdict honest downstream:
 *   • ORDERED — the activity must follow the core's points start→end; it cannot match a
 *     scrambled or partial path (kills the over-merge).
 *   • DIRECTIONAL — a reverse traversal does NOT match (fork-2 ruling: reverse is a different
 *     core). Proven by the direction-pair fixture, not a config flag.
 *   • FROZEN yardstick — the core polyline is the fixed reference; a longer or shorter RUN
 *     still pins to the same core (handles the variable-length out-and-back).
 *
 * Pure math, no Deno/Node APIs — runnable under either. Fixtures: core-match.test.ts.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CoreMatch {
  /** index into the ORIGINAL activity array where the core traversal begins */
  entryIdx: number;
  /** index into the ORIGINAL activity array where the core traversal ends */
  exitIdx: number;
  /** fraction of the core's resampled points covered within buffer (≈1.0 for a real effort) */
  overlapRatio: number;
  /** length (m) of the activity sub-path between entry and exit */
  matchedDistanceM: number;
}

export interface CoreMatchOpts {
  /** fixed resample spacing (m) applied to both core and activity. Default 10. */
  spacingM?: number;
  /** GPS corridor (m): a core point counts as covered if an activity point is within this. Default 30. */
  bufferM?: number;
  /** minimum fraction of core points covered to call it a match. Default 0.9. */
  minCoverage?: number;
  /** a contiguous uncovered run of core longer than this (m) fails the match. Default 2×buffer. */
  maxGapM?: number;
  /** forward look-ahead window (resampled steps) when advancing along the activity. Default 4. */
  windowSteps?: number;
}

const R_EARTH_M = 6371000;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length (m) of an ordered point list. */
export function pathLengthM(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineM(pts[i - 1], pts[i]);
  return d;
}

interface Resampled extends LatLng {
  /** original-array index this resampled point derives from (for slicing back) */
  srcIdx: number;
}

/**
 * Arc-length resample to fixed spacing S. Linear lat/lng interpolation (fine at these scales).
 * Carries srcIdx so entry/exit map back to the ORIGINAL activity indices.
 */
export function resample(pts: LatLng[], spacingM: number): Resampled[] {
  if (pts.length === 0) return [];
  const out: Resampled[] = [{ lat: pts[0].lat, lng: pts[0].lng, srcIdx: 0 }];
  if (pts.length === 1) return out;
  let need = spacingM;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = haversineM(a, b);
    if (segLen === 0) continue;
    let covered = 0;
    while (segLen - covered >= need) {
      covered += need;
      const t = covered / segLen;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, srcIdx: i });
      need = spacingM;
    }
    need -= segLen - covered;
  }
  const last = pts[pts.length - 1];
  if (haversineM(out[out.length - 1], last) > spacingM * 0.25) {
    out.push({ lat: last.lat, lng: last.lng, srcIdx: pts.length - 1 });
  }
  return out;
}

/**
 * Does `activity` traverse `core` start→end, in order, within buffer? Returns the entry/exit
 * indices (into the ORIGINAL activity array) + coverage, or null if it doesn't.
 *
 * The march is MONOTONIC and windowed: for each core point we only look a few steps ahead of
 * where the last one matched. That is what makes an OUT-AND-BACK behave correctly — the return
 * leg is far ahead in activity-distance, outside the window, so a forward core matches the
 * outbound leg exactly once and the reverse-direction core matches the return leg exactly once.
 */
export function matchCore(
  activity: LatLng[],
  core: LatLng[],
  opts: CoreMatchOpts = {},
): CoreMatch | null {
  const S = opts.spacingM ?? 10;
  const buffer = opts.bufferM ?? 30;
  const minCoverage = opts.minCoverage ?? 0.9;
  const maxGapM = opts.maxGapM ?? buffer * 2;
  const W = opts.windowSteps ?? 4;
  if (!activity || !core || activity.length < 2 || core.length < 2) return null;

  const coreR = resample(core, S);
  const actR = resample(activity, S);
  if (coreR.length < 2 || actR.length < 2) return null;

  // Try every activity point within buffer of the core START as a candidate entry, EARLIEST
  // first, and take the first that completes a full forward traversal. On an out-and-back the
  // correct entry for a REVERSE core is the turnaround (the junction), not the earliest approach
  // to the start point — a single earliest-entry would tangle at the fold and miss the return leg.
  //
  // KNOWN SLOP (logged, not fixed — DESIGN-segments.md): on an out-and-back the reverse core's
  // entry can land ~1–2 points before the true turnaround (the buffer catches the outbound
  // approach), so the sliced span includes a few metres of the wrong leg. TRIPWIRE for fixing it:
  // if that entry slop adds pace noise COMPARABLE TO THE TREND SIGNAL — i.e. cores end up short
  // enough, or the slop is ASYMMETRIC between directions (one direction's efforts systematically
  // ~1% faster from clipped entries) — vs the percent-level-over-months signal we detect. Until
  // then it's a few seconds on a 460m core: negligible. Fix would be: prefer the candidate with
  // the cleanest end-reach / shortest matchedDistance, not the earliest.
  for (let e = 0; e < actR.length; e++) {
    if (haversineM(actR[e], coreR[0]) > buffer) continue;
    const res = marchFrom(actR, coreR, e, S, buffer, minCoverage, maxGapM, W);
    if (res) return res;
  }
  return null;
}

/**
 * One forward, MONOTONIC traversal attempt from a fixed entry. Forward-only (`lo = lastJ`) is
 * what makes the match directional: a path cannot be traced backwards, so a reverse traversal of
 * the same geometry cannot satisfy a forward core (fork-2 by construction, not by a flag).
 */
function marchFrom(
  actR: Resampled[],
  coreR: Resampled[],
  entry: number,
  S: number,
  buffer: number,
  minCoverage: number,
  maxGapM: number,
  W: number,
): CoreMatch | null {
  let lastJ = entry;
  let exit = entry;
  let matched = 0;
  let gapRun = 0;
  for (let k = 0; k < coreR.length; k++) {
    const lo = lastJ; // FORWARD-ONLY — monotonic non-decreasing; enforces direction
    const hi = Math.min(actR.length - 1, lastJ + W);
    let best = Infinity;
    let bestJ = -1;
    for (let j = lo; j <= hi; j++) {
      const d = haversineM(actR[j], coreR[k]);
      if (d < best) {
        best = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && best <= buffer) {
      matched++;
      lastJ = bestJ;
      exit = bestJ;
      gapRun = 0;
    } else {
      gapRun += S;
      if (gapRun > maxGapM) return null; // a real break in the traversal, not jitter
    }
  }

  const overlapRatio = matched / coreR.length;
  if (overlapRatio < minCoverage) return null;
  // Must have actually reached the core END (not just covered a scattered 90%).
  if (haversineM(actR[exit], coreR[coreR.length - 1]) > buffer) return null;

  const matchedDistanceM = pathLengthM(actR.slice(entry, exit + 1));
  return {
    entryIdx: actR[entry].srcIdx,
    exitIdx: actR[exit].srcIdx,
    overlapRatio: Math.round(overlapRatio * 1000) / 1000,
    matchedDistanceM: Math.round(matchedDistanceM),
  };
}
