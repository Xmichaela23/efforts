/**
 * ⛔ THE WEEK'S COUNTS ARE WHAT WAS DONE (work order 2026-09-09 §3b.3).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/week-totals.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekTotals, weekTotalRows, setsVolume } from './week-totals.ts';

const run = (km: number, status = 'completed') => ({ type: 'run', workout_status: status, distance_km: km });
const ride = (km: number, status = 'completed') => ({ type: 'ride', workout_status: status, distance_km: km });
const lift = (sets: Array<{ reps: number; weight: number }>, status = 'completed') => ({
  type: 'strength', workout_status: status, executed: { strength_exercises: [{ sets }] },
});

Deno.test('⛔ PLANNED WORK COUNTS FOR NOTHING — this is what the athlete DID', () => {
  const t = weekTotals([run(10), run(8, 'planned'), ride(40, 'planned'), lift([{ reps: 5, weight: 100 }], 'planned')]);
  assertEquals(t.runKm, 10);
  assertEquals(t.rideKm, 0);
  assertEquals(t.liftedLb, 0);
});

Deno.test('runs and rides land in their own totals, and a swim in neither', () => {
  const t = weekTotals([
    run(10), run(5), ride(40), ride(20),
    { type: 'swim', workout_status: 'completed', distance_km: 2 },
  ]);
  assertEquals(t.runKm, 15);
  assertEquals(t.rideKm, 60);
});

Deno.test('a bike spelt any of its ways is still a ride', () => {
  const t = weekTotals([
    { type: 'bike', workout_status: 'completed', distance_km: 10 },
    { type: 'cycling', workout_status: 'completed', distance_km: 5 },
  ]);
  assertEquals(t.rideKm, 15);
});

Deno.test('⛔ A 0 lb SET ADDS NOTHING — the same gate `StrengthCompletedView` applies', () => {
  assertEquals(setsVolume([{ reps: 5, weight: 100 }, { reps: 5, weight: 0 }, { reps: 0, weight: 100 }]), 500);
  assertEquals(setsVolume(null), 0);
});

Deno.test('lifted sums every set of every exercise in the week', () => {
  const t = weekTotals([
    lift([{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }]),
    lift([{ reps: 10, weight: 45 }]),
  ]);
  assertEquals(t.liftedLb, 1000 + 450);
});

Deno.test('⛔ A `get-week` UNIFIED ITEM COUNTS TOO — `status`, and the executed block', () => {
  const t = weekTotals([
    { type: 'run', status: 'completed', executed: { overall: { distance_m: 8050 } } },
    { type: 'ride', status: 'completed', executed: { overall: { distance_m: 32200 } } },
    {
      type: 'strength', status: 'completed',
      executed: { strength_exercises: [{ sets: [{ reps: 5, weight: 225 }, { reps: 5, weight: 225 }] }] },
    },
    { type: 'run', status: 'planned', executed: { overall: { distance_m: 20000 } } },
  ]);
  assertEquals(Math.round(t.runKm * 100) / 100, 8.05);
  assertEquals(Math.round(t.rideKm * 100) / 100, 32.2);
  assertEquals(t.liftedLb, 2250);
});

Deno.test('distance is read off the shared reader, including the computed block', () => {
  const t = weekTotals([
    { type: 'run', workout_status: 'completed', computed: { overall: { distance_m: 5000 } } },
  ]);
  assertEquals(t.runKm, 5);
});

Deno.test('⛔ ZERO IS STILL A ROW — three rows always, in the work order\'s labels and units', () => {
  const imperial = weekTotalRows({ runKm: 0, rideKm: 0, liftedLb: 0 }, true);
  assertEquals(imperial.map((r) => r.label), ['Run', 'Ride', 'Lifted']);
  assertEquals(imperial.map((r) => r.value), ['0.0 mi', '0.0 mi', '0 lb']);
});

Deno.test('the athlete\'s units decide mi/lb or km/kg', () => {
  const totals = { runKm: 16.0934, rideKm: 32.1868, liftedLb: 1000 };
  assertEquals(weekTotalRows(totals, true).map((r) => r.value), ['10.0 mi', '20.0 mi', '1,000 lb']);
  assertEquals(weekTotalRows(totals, false).map((r) => r.value), ['16.1 km', '32.2 km', '454 kg']);
});
