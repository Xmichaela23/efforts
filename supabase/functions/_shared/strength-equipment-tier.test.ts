// F-8 phase 1 — the gear-need map (exerciseRequiredGearKeys) is the single source of truth for
// "what equipment does this exercise need". F-6 fixes: barbell compounds detected from the unprefixed
// names protocols actually emit, and rings/step-ups no longer over-required. Plus no DB/band regression.
// Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/strength-equipment-tier.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { exerciseRequiredGearKeys, buildStrengthEquipmentLine } from './strength-equipment-tier.ts';

Deno.test('exerciseRequiredGearKeys — F-6: unprefixed barbell compounds detected', () => {
  // 5×5 names the lifts WITHOUT a "Barbell" prefix — these were silently undetected before.
  assertEquals(exerciseRequiredGearKeys('Back Squat'), ['barbell', 'rack']);
  assertEquals(exerciseRequiredGearKeys('Overhead Press'), ['barbell', 'rack']);
  assertEquals(exerciseRequiredGearKeys('Deadlift'), ['barbell']);
  // already worked — guard against regression
  assertEquals(exerciseRequiredGearKeys('Bench Press'), ['barbell', 'rack', 'bench']);
  assertEquals(exerciseRequiredGearKeys('Barbell Row'), ['barbell']);
  assertEquals(exerciseRequiredGearKeys('Conventional Deadlift'), ['barbell']);
  assertEquals(exerciseRequiredGearKeys('Standing Barbell Overhead Press'), ['barbell', 'rack']);
  assertEquals(exerciseRequiredGearKeys('Push Press'), ['barbell', 'rack']);
});

Deno.test('exerciseRequiredGearKeys — F-6: rings / step-ups no longer over-required', () => {
  assertEquals(exerciseRequiredGearKeys('Inverted Rows'), []);                       // was ['rings']
  assertEquals(exerciseRequiredGearKeys('Step-ups'), []);                            // was ['bench']
  assertEquals(exerciseRequiredGearKeys('Ring Rows'), ['rings']);                    // explicit rings still required
});

Deno.test('exerciseRequiredGearKeys — F-6: "X or Y" choice names require nothing (athlete picks)', () => {
  assertEquals(exerciseRequiredGearKeys('Inverted Ring Row or Band Row'), []);
  assertEquals(exerciseRequiredGearKeys('Box Jumps or Broad Jumps'), []);
  assertEquals(exerciseRequiredGearKeys('Goblet Squat or Bodyweight Squat'), []);
  // single-variant names still resolve normally
  assertEquals(exerciseRequiredGearKeys('Box Jumps'), ['box']);
  assertEquals(exerciseRequiredGearKeys('Goblet Squat'), ['dumbbells']);
});

Deno.test('exerciseRequiredGearKeys — no DB/band/bodyweight regression (guards hold)', () => {
  assertEquals(exerciseRequiredGearKeys('DB Bench Press'), ['dumbbells', 'bench']);
  assertEquals(exerciseRequiredGearKeys('DB Shoulder Press'), ['dumbbells']);
  assertEquals(exerciseRequiredGearKeys('DB Romanian Deadlift'), ['dumbbells']);
  assertEquals(exerciseRequiredGearKeys('Band Overhead Press'), ['bands']);
  assertEquals(exerciseRequiredGearKeys('Goblet Squat'), ['dumbbells']);
  assertEquals(exerciseRequiredGearKeys('Pull-ups'), ['pull_up_bar']);
  assertEquals(exerciseRequiredGearKeys('Box Jumps'), ['box']);
  assertEquals(exerciseRequiredGearKeys('Glute Bridges'), []);                       // bodyweight
});

Deno.test('buildStrengthEquipmentLine — a 5×5 barbell session now reports its real gear (F-6 under-report fixed)', () => {
  const line = buildStrengthEquipmentLine({
    exerciseNames: ['Back Squat', 'Bench Press', 'Barbell Row'],
    athleteEquipment: ['Commercial gym'],
  });
  assertEquals(line, 'Equipment — Required: Barbell, Rack, Bench.');
});
