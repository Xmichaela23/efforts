// Planned strength workload — same tonnage basis as actual. Run: deno test workload-strength-planned.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculatePlannedStrengthWorkload, calculateStrengthWorkload } from './workload.ts';

// ── THE INVARIANT: do exactly what's prescribed → planned load == done load ─────────────────────────
Deno.test('prescribed == performed → planned workload equals actual workload', () => {
  // Materialized prescription (weights already resolved to lb by materialize-plan).
  const prescription = [
    { name: 'Bench Press', sets: 5, reps: 5, weight: 113, target_rir: 3 },
    { name: 'Barbell Row', sets: 3, reps: 5, weight: 95, target_rir: 3 },
  ];
  // The athlete does it EXACTLY (same weights, reps, RIR).
  const mkSets = (n: number, reps: number, weight: number, rir: number) =>
    Array.from({ length: n }, () => ({ reps, weight, rir, completed: true }));
  const performed = [
    { name: 'Bench Press', sets: mkSets(5, 5, 113, 3) },
    { name: 'Barbell Row', sets: mkSets(3, 5, 95, 3) },
  ];
  const planned = calculatePlannedStrengthWorkload(prescription);
  const actual = calculateStrengthWorkload(performed);
  assertEquals(planned, actual); // the whole point: identical work → identical load
});

// ── It is TONNAGE-based, not the old duration 56 ────────────────────────────────────────────────────
Deno.test('planned load reflects real tonnage (not a duration constant)', () => {
  // Michael's real Upper A prescription: bench 5x5, row 3x5. Lands in the ~30 range, nowhere near 56.
  const w = calculatePlannedStrengthWorkload([
    { name: 'Bench Press', sets: 5, reps: 5, weight: 113, target_rir: 3 },
    { name: 'Barbell Row', sets: 3, reps: 5, weight: 95, target_rir: 3 },
    { name: 'Farmers Carry', sets: 3, reps: '40 m', weight: 0, target_rir: 3 }, // carry → 0 tonnage
  ]);
  assertEquals(w >= 25 && w <= 40, true); // tonnage-based; the stale duration read was 56
});

// ── Carries contribute 0 on BOTH sides (consistent — capturing carry load is a separate fix) ─────────
Deno.test('a carry adds 0 tonnage on planned exactly as on actual', () => {
  const plannedNoCarry = calculatePlannedStrengthWorkload([{ sets: 5, reps: 5, weight: 113, target_rir: 3 }]);
  const plannedWithCarry = calculatePlannedStrengthWorkload([
    { sets: 5, reps: 5, weight: 113, target_rir: 3 },
    { name: 'Farmers Carry', sets: 3, reps: '40 m', weight: 0, target_rir: 3 },
  ]);
  // Carry adds no tonnage; the only delta is the averaged intensity (both target_rir 3 here → none).
  assertEquals(plannedNoCarry, plannedWithCarry);
});

// ── Heavier-than-prescribed → actual exceeds planned (the honest direction) ──────────────────────────
Deno.test('lifting heavier than prescribed makes actual EXCEED planned (not the reverse)', () => {
  const prescription = [{ name: 'Bench Press', sets: 5, reps: 5, weight: 113, target_rir: 3 }];
  const performedHeavier = [{
    name: 'Bench Press',
    sets: Array.from({ length: 5 }, () => ({ reps: 5, weight: 120, rir: 3, completed: true })),
  }];
  const planned = calculatePlannedStrengthWorkload(prescription);
  const actual = calculateStrengthWorkload(performedHeavier);
  assertEquals(actual > planned, true);
});
