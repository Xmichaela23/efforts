// The foundation fix: "same route" = same ROADS (path overlap), not same distance. These lock the
// behavior that was broken — a 4.0mi and a 4.9mi run on the same roads must be ONE route.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { encodeGeohash, trackToGeohashSet } from './geohash.ts';
import { pathOverlap, bestRouteMatch, mergeGeohashes, lengthCompatible, ROUTE_MATCH_MIN_OVERLAP } from './route-match.ts';

Deno.test('encodeGeohash matches the canonical reference value', () => {
  assertEquals(encodeGeohash(57.64911, 10.40744, 7), 'u4pruyd'); // classic geohash test point
});

Deno.test('trackToGeohashSet dedups cells and skips bad points', () => {
  const track = [
    { lat: 40.0000, lng: -105.0000 },
    { lat: 40.0001, lng: -105.0001 }, // same ~150m cell → deduped
    { latitude: 40.05, longitude: -105.05 }, // alt field names
    { lat: NaN, lng: 5 }, // dropped
  ];
  const set = trackToGeohashSet(track, 7);
  assertEquals(set.length >= 1 && set.length <= 3, true);
  assertEquals(set.every((g) => g.length === 7), true);
});

// The exact failure: same roads, run at two lengths. The 4.9mi path is the 4.0mi path + more of the
// same roads (superset). Overlap on the SMALLER path stays 1.0 → ONE route.
const fourMi = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
const fourNineMi = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8']; // same roads + extra out-and-back

Deno.test('same roads at different lengths → overlap 1.0 → same route (the 120x/19x bug)', () => {
  assertEquals(pathOverlap(fourMi, fourNineMi), 1);
  assertEquals(bestRouteMatch(fourNineMi, [{ id: 'A', geohashes: fourMi }])?.cluster.id, 'A');
});

Deno.test('GPS jitter (a cell or two different) still matches', () => {
  const jittered = ['a1', 'a2', 'a3', 'a4', 'a5', 'zz']; // 5 of 6 shared
  assertEquals(pathOverlap(fourMi, jittered), 5 / 6);
  assertEquals(5 / 6 >= ROUTE_MATCH_MIN_OVERLAP, true);
});

Deno.test('genuinely different roads → no match → a new cluster is created', () => {
  const otherRoute = ['b1', 'b2', 'b3', 'b4'];
  assertEquals(pathOverlap(fourMi, otherRoute), 0);
  assertEquals(bestRouteMatch(otherRoute, [{ id: 'A', geohashes: fourMi }]), null);
});

Deno.test('bestRouteMatch picks the highest-overlap cluster', () => {
  const run = ['a1', 'a2', 'a3', 'a4'];
  const clusters = [
    { id: 'far', geohashes: ['z1', 'z2'] },
    { id: 'partial', geohashes: ['a1', 'a2', 'q9', 'q8'] }, // overlap 2/4 = 0.5 (< bar)
    { id: 'same', geohashes: ['a1', 'a2', 'a3', 'a4', 'a5'] }, // overlap 4/4 = 1.0
  ];
  assertEquals(bestRouteMatch(run, clusters)?.cluster.id, 'same');
});

Deno.test('mergeGeohashes unions the paths and caps growth', () => {
  assertEquals(mergeGeohashes(['a1', 'a2'], ['a2', 'a3']).sort(), ['a1', 'a2', 'a3']);
  const big = Array.from({ length: 500 }, (_, i) => `g${i}`);
  assertEquals(mergeGeohashes(big, ['x'], 400).length, 400);
});

Deno.test('lengthCompatible: same-ish length ok, wildly different not (nulls never veto)', () => {
  assertEquals(lengthCompatible(6437, 7886), true);  // 4.0mi vs 4.9mi = 1.2x
  assertEquals(lengthCompatible(3200, 9600), false); // 2mi vs 6mi = 3x
  assertEquals(lengthCompatible(null, 7886), true);
  assertEquals(lengthCompatible(6437, 0), true);
});

Deno.test('out-and-back build: a fully-contained run merges at ANY length (same roads = same route)', () => {
  // The short core is entirely inside the long build (overlap 1.0). Even at ~3x distance it's ONE route —
  // this is Michael's "further and further out on builds" case; length must NOT split it.
  const shortCore = ['a1', 'a2', 'a3'];
  const longBuild = { id: 'build', geohashes: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'], distance_m: 19000 };
  assertEquals(pathOverlap(shortCore, longBuild.geohashes), 1);
  assertEquals(bestRouteMatch(shortCore, [longBuild], ROUTE_MATCH_MIN_OVERLAP, 6000)?.cluster.id, 'build');
});

Deno.test('partial overlap + very different length → blocked (a different route clipping shared roads)', () => {
  const run = ['a1', 'a2', 'a3', 'a4', 'x5']; // 5 cells; 4 shared, 1 its own
  const other = { id: 'other', geohashes: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3'], distance_m: 16000 };
  assertEquals(pathOverlap(run, other.geohashes), 0.8); // partial (< CONTAINMENT_FULL) → length guard applies
  assertEquals(bestRouteMatch(run, [other], ROUTE_MATCH_MIN_OVERLAP, 6000), null); // ~2.7x length → blocked
  // same roads at comparable length still merges:
  assertEquals(bestRouteMatch(fourNineMi, [{ id: 'A', geohashes: fourMi, distance_m: 6437 }], ROUTE_MATCH_MIN_OVERLAP, 7886)?.cluster.id, 'A');
});

Deno.test('empty / missing paths never match (no path → no route claim)', () => {
  assertEquals(pathOverlap([], fourMi), 0);
  assertEquals(pathOverlap(fourMi, null), 0);
  assertEquals(bestRouteMatch([], [{ id: 'A', geohashes: fourMi }]), null);
});
