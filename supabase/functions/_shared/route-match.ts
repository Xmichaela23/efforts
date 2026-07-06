// Route identity by PATH, not distance. Two runs are the "same route" when their GPS paths cover
// mostly the same cells — even at different lengths (an out-and-back run further shares the shorter
// run's roads). Replaces the old distance-bucket fingerprint that split 4.0mi and 4.9mi on the same
// roads into two "routes".

export interface RouteClusterLite {
  id: string;
  geohashes?: string[] | null;
  distance_m?: number | null;
}

// Same roads but wildly different length isn't the same route. Two runs must be within this distance
// ratio to merge — 4.0mi vs 4.9mi (1.2x) is fine; a 2mi piece of a 6mi route (3x) is NOT, even though
// the short one's roads are fully contained. Loose enough to allow "same roads, a bit longer/shorter".
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
    if (!lengthCompatible(runDistanceM, c?.distance_m)) continue;
    const score = pathOverlap(runGeohashes, c?.geohashes);
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
