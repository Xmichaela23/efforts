// PARITY PROOF — the shared endurance model reproduces today's outputs exactly.
// Run: ~/.deno/bin/deno test --allow-read --no-check supabase/functions/_shared/endurance/endurance-parity.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { frielZones, karvonenZones } from './hr-zones.ts';
import { paceZonesFromVdot } from './pace-zones.ts';
import { longRunMilesForWeek as sharedLongRun, longRunFloorMiles as sharedFloor, longRunPeakTarget } from './volume.ts';
import { PHASE_ZONE_DIST as SHARED_DIST } from './distribution.ts';

// originals
import { getPacesFromScore } from '../../generate-run-plan/effort-score.ts';
import {
  longRunMilesForWeek as combinedLongRun,
  longRunFloorMiles as combinedFloor,
  PHASE_ZONE_DIST as COMBINED_DIST,
} from '../../generate-combined-plan/science.ts';

// ── PARITY 1 — HR zones (vs the client getFrielZones/getKarvonenZones formula + your confirmed golden) ──
Deno.test('PARITY: HR zones — Friel %LTHR golden (LTHR 158 → Z2 142 / Z3 150 / Z4 166) + formula sweep', () => {
  const z = frielZones(158);
  assertEquals(z[1].max, 142); // Z2
  assertEquals(z[2].max, 150); // Z3
  assertEquals(z[3].max, 166); // Z4
  for (const lthr of [140, 150, 158, 165, 172, 185]) {
    const zz = frielZones(lthr);
    assertEquals(zz[0].max, Math.round(lthr * 0.85));
    assertEquals(zz[1].max, Math.round(lthr * 0.90));
    assertEquals(zz[2].max, Math.round(lthr * 0.95));
    assertEquals(zz[3].max, Math.round(lthr * 1.05));
    assertEquals(zz[4].max, null);
  }
  const k = karvonenZones(180, 50); // hrr 130
  assertEquals(k[3].max, Math.round(50 + 130 * 0.90)); // Z4
  assertEquals(k[4].max, 180);
});

// ── PARITY 2 — pace zones vs effort-score getPacesFromScore (base/steady/power/speed) ──
Deno.test('PARITY: pace zones reproduce effort-score across the VDOT range', () => {
  for (let v = 28; v <= 84; v += 0.5) {
    const shared = paceZonesFromVdot(v);
    const orig = getPacesFromScore(v);
    assertEquals(shared.base, orig.base, `base @ vdot ${v}`);
    assertEquals(shared.steady, orig.steady, `steady @ vdot ${v}`);
    assertEquals(shared.power, orig.power, `power @ vdot ${v}`);
    assertEquals(shared.speed, orig.speed, `speed @ vdot ${v}`);
  }
});

// ── PARITY 3 — volume model vs combined science.ts (every distance × phase × week × throttle) ──
const DISTANCES = ['sprint', 'olympic', '70.3', 'half', 'half_marathon', 'ironman', 'full', 'marathon'];
const RAMP_PHASES = ['base', 'build', 'race_specific'];
const FLOOR_PHASES = ['base', 'build', 'race_specific', 'taper', 'recovery', 'rebuild']; // retest asserted separately

Deno.test('PARITY: longRunMilesForWeek reproduces combined exactly (ramp + delegated phases)', () => {
  for (const d of DISTANCES) {
    for (const phase of [...RAMP_PHASES, 'taper', 'recovery', 'rebuild']) {
      for (let wk = 1; wk <= 7; wk++) {
        for (const ramp of [4, 6]) {
          for (const throttle of [1.0, 0.8]) {
            assertEquals(
              sharedLongRun(d, phase, wk, ramp, throttle),
              (combinedLongRun as (a: string, b: string, c: number, e: number, f: number) => number)(d, phase, wk, ramp, throttle),
              `longRun ${d}/${phase}/wk${wk}/ramp${ramp}/thr${throttle}`,
            );
          }
        }
      }
    }
  }
});

Deno.test('PARITY: longRunFloorMiles reproduces combined for all phases EXCEPT the retest fix', () => {
  for (const d of DISTANCES) {
    for (const phase of FLOOR_PHASES) {
      assertEquals(
        sharedFloor(d, phase),
        (combinedFloor as (a: string, b: string) => number)(d, phase),
        `floor ${d}/${phase}`,
      );
    }
  }
});

// ── The ONE intentional change — retest floor fix (scout D2), asserted separately, NOT a parity match ──
Deno.test('INTENTIONAL FIX: shared retest floor = taper-level (0.45×peak); combined falls to 0.75 default', () => {
  for (const d of DISTANCES) {
    const peak = longRunPeakTarget(d);
    const sharedRetest = sharedFloor(d, 'retest');
    const combinedRetest = (combinedFloor as (a: string, b: string) => number)(d, 'retest');
    assertEquals(sharedRetest, Math.round(peak * 0.45 * 2) / 2, `shared retest floor ${d} = rested-terminal`);
    assertEquals(combinedRetest, Math.round(peak * 0.75 * 2) / 2, `combined retest ${d} = buggy 0.75 default`);
    assert(sharedRetest < combinedRetest, `the fix lowers the retest floor for ${d}`);
  }
});

// ── PARITY 4 — intensity distribution (the dial, neutral) vs combined PHASE_ZONE_DIST ──
Deno.test('PARITY: PHASE_ZONE_DIST reproduces combined exactly', () => {
  for (const phase of Object.keys(COMBINED_DIST) as Array<keyof typeof COMBINED_DIST>) {
    assertEquals(SHARED_DIST[phase as keyof typeof SHARED_DIST], COMBINED_DIST[phase], `dist ${String(phase)}`);
  }
});
