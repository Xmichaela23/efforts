/**
 * core-detect.test.ts — fixtures for consensus core detection (DESIGN-segments.md §4.2).
 *
 * These pin the five criteria ruled on 2026-07-06:
 *   1. birth: five variable-length out-and-backs on one road → exactly ONE core (K=5).
 *   4. one-dominant-core: the group yields one core, not fragmented sub-cores (the 420 counter-ex).
 *   fork-2: two directions from one trailhead → two distinct cores.
 *   below-K: travel/marathon one-offs never mint a core (no pollution).
 *   determinism: same corpus → identical coreKeys (pre-freeze stability).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/core-detect.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectCores, type DetectRun } from './core-detect.ts';
import { type LatLng } from './core-match.ts';

const D2R = Math.PI / 180, R2D = 180 / Math.PI, R = 6371000;
function destPoint(o: LatLng, brg: number, dist: number): LatLng {
  const d = dist / R, t = brg * D2R, f1 = o.lat * D2R, l1 = o.lng * D2R;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return { lat: f2 * R2D, lng: l2 * R2D };
}
function outAndBack(id: string, date: string, T: LatLng, brg: number, outM: number, step = 15): DetectRun {
  const pts: LatLng[] = [];
  for (let dm = 0; dm <= outM; dm += step) pts.push(destPoint(T, brg, dm));
  for (let dm = outM - step; dm >= 0; dm -= step) pts.push(destPoint(T, brg, dm));
  return { id, date, points: pts };
}

const T = { lat: 34.087, lng: -118.181 }; // his real trailhead
const LENS = [300, 400, 500, 600, 700];
const east = LENS.map((m, i) => outAndBack(`e${i}`, `2026-0${i + 1}-01`, T, 90, m));
const west = LENS.map((m, i) => outAndBack(`w${i}`, `2026-0${i + 1}-02`, T, 270, m));
const austin = [0, 1].map((i) => outAndBack(`a${i}`, `2026-03-1${i}`, { lat: 30.27, lng: -97.74 }, 90, 500));
const marathon = [outAndBack('m0', '2026-04-01', { lat: 34.42, lng: -119.7 }, 45, 21000)];

Deno.test('five variable-length out-and-backs on one road → exactly ONE core (≈ common outbound)', () => {
  const cores = detectCores(east);
  assertEquals(cores.length, 1);
  assertEquals(cores[0].detectedFromN, 5);
  assert(cores[0].distanceM >= 250 && cores[0].distanceM <= 360, `core distance ${cores[0].distanceM}`);
});

Deno.test('two directions from one trailhead → two distinct cores (fork-2)', () => {
  const cores = detectCores([...east, ...west]);
  assertEquals(cores.length, 2);
  assertEquals(new Set(cores.map((c) => c.directionBucket)).size, 2);
});

Deno.test('below-K groups (travel, marathon) never mint a core — full corpus yields exactly the 2 real cores', () => {
  const cores = detectCores([...east, ...west, ...austin, ...marathon]);
  assertEquals(cores.length, 2);
  assert(cores.every((c) => c.trailheadCell.includes('34.087')));
});

Deno.test('deterministic — same corpus produces identical coreKeys (pre-freeze stability)', () => {
  const a = detectCores([...east, ...west, ...austin]).map((c) => c.coreKey).sort();
  const b = detectCores([...east, ...west, ...austin]).map((c) => c.coreKey).sort();
  assertEquals(a, b);
});

Deno.test('one dominant core per (trailhead, direction) — not fragmented sub-cores', () => {
  assertEquals(detectCores(east).length, 1);
});

Deno.test('coverage-fraction + outbound leg — core is the COMMON stem with high support, not the long tail', () => {
  // 15 short (500m) + 5 long (2000m), same direction. The core must be the ~500m stem all 20 share
  // (support ≥15), NOT a 2000m core only the 5 long runs cover. Regression for the real-data bug
  // where a 37-run direction over-extended to support 7.
  const many = [
    ...Array.from({ length: 15 }, (_, i) => outAndBack(`s${i}`, '2026-05-01', T, 90, 500)),
    ...Array.from({ length: 5 }, (_, i) => outAndBack(`L${i}`, '2026-05-02', T, 90, 2000)),
  ];
  const cores = detectCores(many);
  assertEquals(cores.length, 1);
  assert(cores[0].distanceM >= 400 && cores[0].distanceM <= 620, `stem distance ${cores[0].distanceM}`);
  assert(cores[0].detectedFromN >= 15, `support ${cores[0].detectedFromN}`);
});
