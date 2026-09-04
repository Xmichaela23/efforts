/**
 * WORKORDER-bike-state-audit-2026-09-03 §1 — a run and a ride on ONE date must each read their own facts.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test supabase/functions/compute-snapshot/endurance-facts.test.ts --no-check --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { indexEnduranceFactsByWorkout, readEnduranceFact } from './endurance-facts.ts';

// The Sep 3 shape, in the units the table stores (metres): run 62 ft ≈ 19 m, ride 958 ft ≈ 292 m.
const RUN_ID = '11111111-1111-1111-1111-111111111111';
const RIDE_ID = 'b33cd7b4-5953-44f7-955d-288b8c542248';
const sep3Run = {
  workout_id: RUN_ID, date: '2026-09-03', discipline: 'run',
  run_facts: { efficiency_index: 1.41, hr_avg: 151, hr_drift_pct: 3.2, elevation_gain_m: 19 },
  ride_facts: null,
};
const sep3Ride = {
  workout_id: RIDE_ID, date: '2026-09-03', discipline: 'ride',
  run_facts: null,
  ride_facts: { efficiency_factor: 1.11, avg_hr: 134, hr_drift_pct: -7.2, elevation_gain_m: 292 },
};

Deno.test('same date, run then ride: the ride reads the RIDE facts, not the run\'s', () => {
  const idx = indexEnduranceFactsByWorkout([sep3Run, sep3Ride]);
  const ride = idx.get(RIDE_ID)!;
  assertEquals(ride.elevM, 292);
  assertEquals(ride.efficiency, 1.11);
  assertEquals(ride.hr, 134);
  assertEquals(ride.drift, -7.2);
});

Deno.test('same date, ride then run: order of rows cannot change the answer', () => {
  const idx = indexEnduranceFactsByWorkout([sep3Ride, sep3Run]);
  assertEquals(idx.get(RIDE_ID)!.elevM, 292);
  assertEquals(idx.get(RUN_ID)!.elevM, 19);
  assertEquals(idx.get(RUN_ID)!.efficiency, 1.41);
  assertEquals(idx.get(RUN_ID)!.hr, 151);
});

Deno.test('two workouts on one date are two entries, never one', () => {
  const idx = indexEnduranceFactsByWorkout([sep3Run, sep3Ride]);
  assertEquals(idx.size, 2);
});

Deno.test('a row with neither sport\'s facts, or no workout_id, is skipped', () => {
  assertEquals(readEnduranceFact({ workout_id: 'x', run_facts: null, ride_facts: null }), null);
  const idx = indexEnduranceFactsByWorkout([{ workout_id: null, run_facts: { hr_avg: 140 } }, { date: '2026-09-01', run_facts: { hr_avg: 140 } }]);
  assertEquals(idx.size, 0);
});

Deno.test('negative drift is kept; zero or missing heart rate and efficiency read as null', () => {
  const r = readEnduranceFact({ workout_id: 'y', ride_facts: { hr_drift_pct: -4.4, avg_hr: 0, efficiency_factor: null, elevation_gain_m: 0 } })!;
  assertEquals(r.drift, -4.4);
  assertEquals(r.hr, null);
  assertEquals(r.efficiency, null);
  assertEquals(r.elevM, null);
});
