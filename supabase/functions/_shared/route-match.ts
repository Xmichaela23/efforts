// Route identity by PATH, not distance. Two runs are the "same route" when their GPS paths cover
// mostly the same cells — even at different lengths (an out-and-back run further shares the shorter
// run's roads). Replaces the old distance-bucket fingerprint that split 4.0mi and 4.9mi on the same
// roads into two "routes".

export interface RouteClusterLite {
  id: string;
  geohashes?: string[] | null;
  distance_m?: number | null;
}

// When one run's roads are almost fully inside the other's (this overlap or higher), it's the SAME
// route at ANY length — an out-and-back run further/shorter on the same roads, the core Michael builds
// on. Length is NOT checked in that case. The length guard below only kicks in for PARTIAL overlaps.
export const CONTAINMENT_FULL = 0.9;

// For PARTIAL overlaps only: a run sharing some-but-not-most roads with a route must also be a
// comparable length to merge — otherwise it's a different route that just clips a few shared roads.
export const ROUTE_LENGTH_MAX_RATIO = 2.5;

/** Are two runs close enough in distance to be the same route? (null distances → not a blocker.) */
export function lengthCompatible(a: number | null | undefined, b: number | null | undefined, maxRatio = ROUTE_LENGTH_MAX_RATIO): boolean {
  const x = Number(a), y = Number(b);
  if (!(x > 0) || !(y > 0)) return true; // unknown distance can't veto a strong path match
  return Math.max(x, y) / Math.min(x, y) <= maxRatio;
}

/**
 * OVERLAP COEFFICIENT: fraction of the SMALLER path's cells shared with the other. Chosen over Jaccard
 * because it stays high when one run is a longer version of the same roads (the shorter path is nearly
 * contained in the longer). 1.0 = one path fully contains the other; 0 = no shared roads.
 */
export function pathOverlap(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const setA = new Set(Array.isArray(a) ? a : []);
  const setB = new Set(Array.isArray(b) ? b : []);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const g of setA) if (setB.has(g)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

// Two runs sharing ≥ this fraction of the smaller one's roads are the same route. 0.6 tolerates GPS
// jitter and partial-overlap (a slightly different finish) without merging genuinely different routes.
export const ROUTE_MATCH_MIN_OVERLAP = 0.6;

/**
 * Best existing cluster by path overlap (subject to the length guard), or null if nothing clears the
 * bar → caller creates a new cluster. `runDistanceM` enables the length guard: a candidate whose typical
 * distance is >2.5x off is rejected even at high path overlap (prevents a short subset absorbing into a
 * long route).
 */
export function bestRouteMatch(
  runGeohashes: string[] | null | undefined,
  clusters: RouteClusterLite[] | null | undefined,
  minOverlap = ROUTE_MATCH_MIN_OVERLAP,
  runDistanceM?: number | null,
): { cluster: RouteClusterLite; overlap: number } | null {
  let best: RouteClusterLite | null = null;
  let bestScore = 0;
  for (const c of (Array.isArray(clusters) ? clusters : [])) {
    const score = pathOverlap(runGeohashes, c?.geohashes);
    if (score < minOverlap) continue;
    // Full containment (an out-and-back further/shorter on the same roads) = same route at ANY length.
    // Only PARTIAL overlaps get the length guard, so a genuinely different route that merely clips some
    // shared roads isn't merged just because the lengths line up.
    if (score < CONTAINMENT_FULL && !lengthCompatible(runDistanceM, c?.distance_m)) continue;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best && bestScore >= minOverlap ? { cluster: best, overlap: bestScore } : null;
}

/**
 * Merge a run's path into a cluster's stored signature (union), capped so a heavily-used route's
 * signature can't grow unbounded. Keeps the cluster's cells representative of the shared roads.
 */
export function mergeGeohashes(existing: string[] | null | undefined, incoming: string[] | null | undefined, cap = 400): string[] {
  const set = new Set(Array.isArray(existing) ? existing : []);
  for (const g of (Array.isArray(incoming) ? incoming : [])) set.add(g);
  const out = [...set];
  return out.length > cap ? out.slice(0, cap) : out;
}
