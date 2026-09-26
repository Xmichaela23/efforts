// Strength workload — Friel's TSS estimate on both sides (2026-09-04). Run: deno test workload-strength-planned.test.ts --no-check
//
// FIELD — Joe Friel, "Estimating Training Stress Score" (trainingpeaks.com): TSS per hour = RPE × 10 on the
// 1–10 scale. A done lift: the session rating only (2026-09-26). The planned estimate: target RIR → RPE (Zourdos 2016).
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculatePlannedStrengthWorkload, calculateStrengthWorkload, strengthSessionRpe } from './workload.ts';

// ── Friel's own worked examples ───────────────────────────────────────────────────────────────────
Deno.test('30 min at RPE 6 = 30 · 90 min at RPE 4 = 60 (Friel, verbatim)', () => {
  assertEquals(calculateStrengthWorkload(30, [], 6), 30);
  assertEquals(calculateStrengthWorkload(90, [], 4), 60);
  assertEquals(calculateStrengthWorkload(60, [], 10), 100); // an hour at RPE 10 = 100, the scale's anchor
});

// ── A DONE lift scores from the athlete's session rating only (2026-09-26) ───────────────────────────
// The sets' reps in reserve are per set and are not read: a session mixes p218's targets, and the book's notes warn
// against converting one into the other. The logger asks for the rating before a lift saves.
Deno.test('strengthSessionRpe: the session rating, else null — the sets\' reps in reserve are not read', () => {
  const sets = [{ rir: 2, completed: true }, { rir: 4, completed: true }, { rir: 0, completed: false }];
  assertEquals(strengthSessionRpe([{ sets }], 8.5), 8.5);
  assertEquals(strengthSessionRpe([{ sets }]), null);
  assertEquals(strengthSessionRpe([{ sets }], 0), null);
  assertEquals(strengthSessionRpe([], 11), null);
});

Deno.test('a done lift with logged reps in reserve and no rating scores 0; with a rating, Friel\'s per-hour scale', () => {
  const sets = Array.from({ length: 5 }, () => ({ reps: 5, weight: 120, rir: 1, completed: true }));
  assertEquals(calculateStrengthWorkload(45, [{ sets }]), 0);
  assertEquals(calculateStrengthWorkload(45, [{ sets }], 7), Math.round((45 / 60) * 70)); // RPE 7 → 70/hr
});

// ── The PLANNED estimate still reads the prescription's target RIR (planned rows only; nothing that feeds
// fitness or fatigue reads a planned row) ──────────────────────────────────────────────────────────────
Deno.test('planned: the prescription\'s target RIR estimates the planned load', () => {
  assertEquals(calculatePlannedStrengthWorkload(45, [{ target_rir: 3 }, { target_rir: 3 }]), Math.round((45 / 60) * 70));
});

// ── Nothing logged → 0 points, never a guessed intensity ─────────────────────────────────────────
Deno.test('no rating → 0 · no minutes → 0', () => {
  assertEquals(calculateStrengthWorkload(60, [{ sets: [{ reps: 5, weight: 100, completed: true }] }]), 0);
  assertEquals(calculateStrengthWorkload(0, [], 7), 0);
  assertEquals(calculatePlannedStrengthWorkload(60, [{ target_rir: null }]), 0);
});
