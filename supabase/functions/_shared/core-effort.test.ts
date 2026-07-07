/**
 * core-effort.test.ts — fixtures for sliced per-effort facts (DESIGN-segments §4.3).
 *
 * The load-bearing one: `metric_source` is decided by HR coverage INSIDE THE SLICE, not a row-level
 * boolean. A run can carry HR that drops out across the core stretch — that effort must degrade to
 * raw_pace_only. Also: no fabricated numbers (Law 2) — avg HR / decoupling are null when degraded.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/core-effort.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCoreEffort, type EffortPoint } from './core-effort.ts';
import { type LatLng } from './core-match.ts';

const A = { lat: 34.1, lng: -118.2 };
function line(n: number): LatLng[] {
  const p: LatLng[] = [];
  for (let i = 0; i < n; i++) p.push({ lat: A.lat, lng: A.lng + 0.0001 * i });
  return p;
}
const CORE = line(51);
const run = (times: number[]): EffortPoint[] => CORE.map((p, i) => ({ lat: p.lat, lng: p.lng, t: times[i] }));
const steady = Array.from({ length: 51 }, (_, i) => i * 2000);
const gpsSteady = run(steady);
const hrFull = new Map(steady.map((t) => [t, 150]));

Deno.test('full HR over the slice → hr_aligned, correct HR + pace, ~0 decoupling on a steady run', () => {
  const e = computeCoreEffort({ gps: gpsSteady, hrByT: hrFull, corePolyline: CORE, tempF: 62 })!;
  assert(e !== null);
  assertEquals(e.metricSource, 'hr_aligned');
  assertEquals(e.avgHrBpm, 150);
  assert(Math.abs(e.durationS - 100) < 1, `duration ${e.durationS}`);
  assert(e.distanceM >= 430 && e.distanceM <= 490, `distance ${e.distanceM}`);
  assert(Math.abs((e.decouplingPct ?? 99)) < 5, `decoupling ${e.decouplingPct}`);
  assertEquals(e.tempF, 62);
});

Deno.test('HR drops out across the core stretch → raw_pace_only (per-slice, NOT row-level)', () => {
  const hrPartial = new Map(steady.slice(0, 18).map((t) => [t, 150])); // ~35% of the slice
  const e = computeCoreEffort({ gps: gpsSteady, hrByT: hrPartial, corePolyline: CORE })!;
  assertEquals(e.metricSource, 'raw_pace_only');
  assertEquals(e.avgHrBpm, null);
  assertEquals(e.decouplingPct, null);
  assert(e.avgPaceSPerKm > 0 && isFinite(e.avgPaceSPerKm), 'raw pace still computed');
});

Deno.test('run that does not traverse the core → null', () => {
  const off = CORE.map((p, i) => ({ lat: p.lat + 0.002, lng: p.lng, t: steady[i] }));
  assertEquals(computeCoreEffort({ gps: off, hrByT: hrFull, corePolyline: CORE }), null);
});

Deno.test('no HR map at all → raw_pace_only with pace, no fabricated HR', () => {
  const e = computeCoreEffort({ gps: gpsSteady, hrByT: null, corePolyline: CORE })!;
  assertEquals(e.metricSource, 'raw_pace_only');
  assertEquals(e.avgHrBpm, null);
  assert(e.avgPaceSPerKm > 0);
});

Deno.test('decoupling: 2nd half slower at same HR → efficiency drops → positive decoupling', () => {
  const t: number[] = [];
  let acc = 0;
  for (let i = 0; i < 51; i++) {
    t.push(acc);
    acc += i < 25 ? 2000 : 4000;
  }
  const e = computeCoreEffort({ gps: run(t), hrByT: new Map(t.map((x) => [x, 150])), corePolyline: CORE })!;
  assertEquals(e.metricSource, 'hr_aligned');
  assert((e.decouplingPct ?? -99) > 20, `decoupling ${e.decouplingPct}`);
});

Deno.test('no per-point time → null (cannot compute a duration)', () => {
  const noTime = CORE.map((p) => ({ lat: p.lat, lng: p.lng }));
  assertEquals(computeCoreEffort({ gps: noTime, hrByT: hrFull, corePolyline: CORE }), null);
});

Deno.test('mid-core PAUSE → moving time excludes the stop; pace not inflated (real-data 14:26/mi bug)', () => {
  const pts: EffortPoint[] = [];
  let t = 0;
  for (let i = 0; i < 51; i++) {
    pts.push({ lat: CORE[i].lat, lng: CORE[i].lng, t });
    t += 2000;
    // 60s stop mid-core, watch logging ~2s while stationary
    if (i === 25) for (let k = 0; k < 30; k++) { pts.push({ lat: CORE[25].lat, lng: CORE[25].lng, t }); t += 2000; }
  }
  const hr = new Map(pts.map((p) => [p.t!, 150]));
  const e = computeCoreEffort({ gps: pts, hrByT: hr, corePolyline: CORE })!;
  assert(e !== null);
  assert(Math.abs(e.durationS - 100) < 8, `moving duration ${e.durationS} (elapsed would be ~160)`);
  assertEquals(e.avgHrBpm, 150);
});
