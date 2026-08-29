/**
 * THE PERFORMED LEDGER — Viada's two lifting doses, counted off what was logged.
 *
 * Run: deno test --no-check supabase/functions/_shared/accessory-dosing/performed-ledger.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  performedLedgerFor,
  performedStrengthDose,
  performedWeekAsSessions,
  type PerformedSession,
} from './performed-ledger.ts';

const set = (weightLb: number | null, reps: number | null, isWarmup = false) => ({ weightLb, reps, isWarmup });

Deno.test('a logged week counts sets to the muscle the movement trains', () => {
  const week: PerformedSession[] = [{
    label: 'ME: Upper',
    date: '2026-08-24',
    exercises: [
      { name: 'Bench Press', intent: 'ME', sets: [set(115, 6), set(130, 5), set(135, 5)] },
      { name: 'Barbell Curl', intent: 'HYP', sets: [set(55, 12), set(55, 8), set(55, 8)] },
    ],
  }];
  const l = performedLedgerFor(week);
  assertEquals(l.perMuscle.find((m) => m.muscle === 'chest')?.sets, 3);
  assertEquals(l.perMuscle.find((m) => m.muscle === 'biceps')?.sets, 3);
  // His formula, not ours: sets x 4.
  assertEquals(l.perMuscle.find((m) => m.muscle === 'chest')?.effectiveReps, 12);
});

Deno.test('⛔ WARM-UPS AND UNTOUCHED SETS ARE NOT WORK (p147, D-204)', () => {
  const week: PerformedSession[] = [{
    label: 'ME: Upper',
    date: '2026-08-24',
    exercises: [{
      name: 'Bench Press',
      intent: 'ME',
      sets: [set(60, 5, true), set(75, 5, true), set(115, 6), set(130, 5), set(0, null)],
    }],
  }];
  assertEquals(performedLedgerFor(week).perMuscle.find((m) => m.muscle === 'chest')?.sets, 2);
});

Deno.test('⚠️ AN UNSTAMPED ROW STILL COUNTS TO THE MUSCLE — this bucket fails OPEN', () => {
  const week: PerformedSession[] = [{
    label: 'Freeball',
    date: '2026-08-24',
    exercises: [{ name: 'Barbell Curl', intent: null, sets: [set(55, 10), set(55, 10)] }],
  }];
  const l = performedLedgerFor(week);
  assertEquals(l.perMuscle.find((m) => m.muscle === 'biceps')?.sets, 2);
  // And it is REPORTED as unclassified rather than filed as a high-intensity work set.
  assertEquals(performedWeekAsSessions(week)[0].sets[0].intent, 'HYP');
});

Deno.test('⛔ p084: reps above 90% and velocity reps at 70-85%, per pattern', () => {
  const week: PerformedSession[] = [{
    label: 'ME: Upper',
    date: '2026-08-24',
    exercises: [
      // Max 150: 135 = 90% (heavy, 5 reps), 115 = 77% (velocity, 6 reps), 130 = 87% counts to NEITHER.
      { name: 'Bench Press', intent: 'ME', sets: [set(115, 6), set(130, 5), set(135, 5)] },
    ],
  }];
  const d = performedStrengthDose(week, () => 150, () => 'horizontal_push');
  assertEquals(d.perPattern, [{
    pattern: 'horizontal_push',
    heavyReps: 5,
    velocityReps: 6,
    heavy: 'in_band',      // 4-6
    velocity: 'below',     // 15-20
  }]);
});

Deno.test('⛔ A LIFT WITH NO KNOWN MAX IS NAMED, NEVER COUNTED AS ZERO', () => {
  const week: PerformedSession[] = [{
    label: 'ME: Upper',
    date: '2026-08-24',
    exercises: [{ name: 'Bench Press', intent: 'ME', sets: [set(135, 5)] }],
  }];
  const d = performedStrengthDose(week, () => null, () => 'horizontal_push');
  assertEquals(d.perPattern, []);
  assertEquals(d.unpriced, ['Bench Press']);
});

Deno.test('⚠️ AN UNWEIGHTED SET HAS NO PERCENTAGE, so it counts to neither band', () => {
  const week: PerformedSession[] = [{
    label: 'ME: Upper',
    date: '2026-08-24',
    exercises: [{ name: 'Bench Press', intent: 'ME', sets: [set(null, 10), set(135, 5)] }],
  }];
  const d = performedStrengthDose(week, () => 150, () => 'horizontal_push');
  assertEquals(d.perPattern[0].heavyReps, 5);
  assertEquals(d.perPattern[0].velocityReps, 0);
});
