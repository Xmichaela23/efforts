// Strength workload — Friel's TSS estimate on both sides (2026-09-04). Run: deno test workload-strength-planned.test.ts --no-check
//
// FIELD — Joe Friel, "Estimating Training Stress Score" (trainingpeaks.com): TSS per hour = RPE × 10 on the
// 1–10 scale. RIR → RPE is Zourdos 2016 (RPE = 10 − RIR). Nothing logged → 0, never a guess.
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculatePlannedStrengthWorkload, calculateStrengthWorkload, strengthSessionRpe } from './workload.ts';

// ── Friel's own worked examples ───────────────────────────────────────────────────────────────────
Deno.test('30 min at RPE 6 = 30 · 90 min at RPE 4 = 60 (Friel, verbatim)', () => {
  assertEquals(calculateStrengthWorkload(30, [], 6), 30);
  assertEquals(calculateStrengthWorkload(90, [], 4), 60);
  assertEquals(calculateStrengthWorkload(60, [], 10), 100); // an hour at RPE 10 = 100, the scale's anchor
});

// ── THE INVARIANT: do exactly what's prescribed, for the planned minutes → planned load == done load ──
Deno.test('prescribed == performed → planned workload equals actual workload', () => {
  const prescription = [
    { name: 'Bench Press', sets: 5, reps: 5, weight: 113, target_rir: 3 },
    { name: 'Barbell Row', sets: 3, reps: 5, weight: 95, target_rir: 3 },
  ];
  const mkSets = (n: number, reps: number, weight: number, rir: number) =>
    Array.from({ length: n }, () => ({ reps, weight, rir, completed: true }));
  const performed = [
    { name: 'Bench Press', sets: mkSets(5, 5, 113, 3) },
    { name: 'Barbell Row', sets: mkSets(3, 5, 95, 3) },
  ];
  const planned = calculatePlannedStrengthWorkload(45, prescription);
  const actual = calculateStrengthWorkload(45, performed);
  assertEquals(planned, actual);
  assertEquals(planned, Math.round((45 / 60) * 70)); // 3 RIR → RPE 7 → 70/hr
});

// ── RIR → RPE (Zourdos): the rating wins when the athlete gave one ────────────────────────────────
Deno.test('strengthSessionRpe: the session rating first, else 10 − average logged RIR, else null', () => {
  const sets = [{ rir: 2, completed: true }, { rir: 4, completed: true }, { rir: 0, completed: false }];
  assertEquals(strengthSessionRpe([{ sets }], 8.5), 8.5);
  assertEquals(strengthSessionRpe([{ sets }]), 7); // (2 + 4) / 2 = 3 RIR → RPE 7; the skipped set does not count
  assertEquals(strengthSessionRpe([{ sets: [{ reps: 5, weight: 100, completed: true }] }]), null);
  assertEquals(strengthSessionRpe([]), null);
});

// ── Nothing logged → 0 points, never a guessed intensity ─────────────────────────────────────────
Deno.test('no rating and no RIR → 0 · no minutes → 0', () => {
  assertEquals(calculateStrengthWorkload(60, [{ sets: [{ reps: 5, weight: 100, completed: true }] }]), 0);
  assertEquals(calculateStrengthWorkload(0, [], 7), 0);
  assertEquals(calculatePlannedStrengthWorkload(60, [{ target_rir: null }]), 0);
});

// ── Harder than prescribed (lower RIR) → actual exceeds planned (the honest direction) ────────────
Deno.test('lifting closer to failure than prescribed makes actual EXCEED planned', () => {
  const planned = calculatePlannedStrengthWorkload(45, [{ target_rir: 3 }]);
  const actual = calculateStrengthWorkload(45, [{ sets: Array.from({ length: 5 }, () => ({ reps: 5, weight: 120, rir: 1, completed: true })) }]);
  assertEquals(actual > planned, true);
});
