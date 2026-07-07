/**
 * core-match.test.ts — fixtures for the ordered path-match primitive (DESIGN-segments.md §4.1).
 *
 * The acceptance shape (Q-132 / D-250): ORDERED + DIRECTIONAL match. The direction-pair fixture
 * is the strongest one — it pins the fork-2 ruling ("reverse is a separate core") as a PROVEN
 * behaviour, not a config flag someone could flip: the same geometry forward matches the forward
 * core and NOT the reverse core, and vice-versa.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/core-match.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { matchCore, type LatLng } from './core-match.ts';

// A straight ~460m road heading east at lat 34.10 (dLng 0.0001 ≈ 9.2m/step).
const A = { lat: 34.1, lng: -118.2 };
function line(from: LatLng, dLat: number, dLng: number, n: number): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i < n; i++) pts.push({ lat: from.lat + dLat * i, lng: from.lng + dLng * i });
  return pts;
}
const CORE = line(A, 0, 0.0001, 51); // A → B, 50 steps
const B = CORE[CORE.length - 1];
const CORE_REV = [...CORE].reverse(); // B → A, same geometry, opposite direction

Deno.test('exact traverse matches, near-full coverage, entry at start', () => {
  const m = matchCore(CORE, CORE);
  assert(m !== null, 'exact traverse should match');
  assert(m!.overlapRatio >= 0.95, `overlap ${m!.overlapRatio}`);
  assertEquals(m!.entryIdx, 0);
});

Deno.test('longer run CONTAINING the core matches (variable-length out-and-back core)', () => {
  const before = line({ lat: 34.1, lng: -118.2 - 0.002 }, 0, 0.0001, 20); // 20 pts approaching A
  const after = line(B, 0, 0.0001, 20); // 20 pts continuing past B
  const activity = [...before, ...CORE, ...after];
  const m = matchCore(activity, CORE);
  assert(m !== null, 'a run containing the core should match');
  // entry lands at A (the buffer legitimately catches the last ~2 approach points), NOT at index 0
  assert(m!.entryIdx >= 12 && m!.entryIdx <= 26, `entry should be at A within the longer run, got ${m!.entryIdx}`);
});

Deno.test('partial run that never reaches the core end FAILS (no fake effort)', () => {
  const activity = CORE.slice(0, 26); // A → midpoint only
  assertEquals(matchCore(activity, CORE), null);
});

Deno.test('reverse traversal FAILS the forward core', () => {
  assertEquals(matchCore(CORE_REV, CORE), null);
});

Deno.test('GPS jitter within buffer still matches', () => {
  // deterministic ±~11m perpendicular wobble (< 30m buffer)
  const jittered = CORE.map((p, i) => ({ lat: p.lat + (i % 2 === 0 ? 0.0001 : -0.0001), lng: p.lng }));
  const m = matchCore(jittered, CORE);
  assert(m !== null, 'sub-buffer jitter should still match');
  assert(m!.overlapRatio >= 0.9, `overlap ${m!.overlapRatio}`);
});

Deno.test('off-route activity (200m north) does NOT match', () => {
  const off = CORE.map((p) => ({ lat: p.lat + 0.002, lng: p.lng })); // ~222m north
  assertEquals(matchCore(off, CORE), null);
});

Deno.test('DIRECTION PAIR — same geometry, opposite directions are distinct cores', () => {
  // forward activity: matches forward core, NOT reverse core
  assert(matchCore(CORE, CORE) !== null, 'fwd activity vs fwd core');
  assertEquals(matchCore(CORE, CORE_REV), null); // fwd activity vs reverse core → no match
  // reverse activity: matches reverse core, NOT forward core
  assert(matchCore(CORE_REV, CORE_REV) !== null, 'rev activity vs rev core');
  assertEquals(matchCore(CORE_REV, CORE), null); // rev activity vs fwd core → no match
});

Deno.test('OUT-AND-BACK run yields exactly one effort per direction core', () => {
  const outAndBack = [...CORE, ...CORE_REV.slice(1)]; // A → B → A in one activity
  const fwd = matchCore(outAndBack, CORE);
  const rev = matchCore(outAndBack, CORE_REV);
  assert(fwd !== null, 'out-and-back should match the forward core (outbound leg)');
  assert(rev !== null, 'out-and-back should match the reverse core (return leg)');
  // the forward match ends around B (mid-activity), not at the very end
  assert(fwd!.exitIdx < outAndBack.length - 1, 'forward effort should end at B, mid-run');
});
