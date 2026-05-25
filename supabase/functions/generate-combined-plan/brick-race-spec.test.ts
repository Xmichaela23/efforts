/**
 * D-049 (Cycling Phase 2) — Race-specific brick bike pin tests.
 *
 * CYCLING-PROTOCOL.md §4.3 spec: the brick bike's long aerobic block in the
 * race-specific phase incorporates race-pace efforts in the closing 30-45 min
 * at expected race power (~0.78-0.82 IF for 70.3 / 0.62-0.68 IF for full IM).
 * Previously, race-specific bricks tagged the entire bike leg as Z3, which is
 * hotter than spec (Z2 base + Z3 closing). This file pins:
 *
 *   1. RS brick ≥ 60 min emits structured Z2 base + Z3 closing block in
 *      steps_preset and description.
 *   2. RS brick < 60 min keeps the single-zone Z3 tag (no meaningful
 *      closing block at that duration).
 *   3. Non-RS brick (base/build) stays Z2 throughout — unchanged behavior.
 *   4. The closing block lands inside the 20-45 min spec window.
 *
 * Run from repo root:
 *   deno test supabase/functions/generate-combined-plan/brick-race-spec.test.ts --no-check --allow-read
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { brick } from './session-factory.ts';

Deno.test('D-049: race-specific brick ≥ 60 min emits structured Z2 + Z3 closing block', () => {
  const [bike] = brick('Saturday', 2.5, 4.5, 'race_specific', 'g1');
  assertEquals(bike.intensity_class, 'MODERATE');
  // Two-block structure: Z2 base + race-pace Z3 closing
  assertEquals(bike.steps_preset?.length, 2);
  assert(bike.steps_preset![0].startsWith('bike_endurance_'));
  assert(bike.steps_preset![0].endsWith('_Z2'));
  assert(bike.steps_preset![1].startsWith('bike_race_pace_'));
  assert(bike.steps_preset![1].endsWith('_Z3'));
  // Description names race power IF — locks the §4.3 prescriptive shape.
  assert(/0\.78-0\.82 IF for 70\.3/i.test(bike.description));
  assert(/race power/i.test(bike.description));
});

Deno.test('D-049: race-specific brick < 60 min keeps the single-zone Z3 tag', () => {
  const [bike] = brick('Saturday', 0.75, 2.5, 'race_specific', 'g1');
  // Single block — too short to slice a meaningful Z3 close
  assertEquals(bike.steps_preset?.length, 1);
  assert(bike.steps_preset![0].endsWith('_Z3'));
  assertEquals(bike.zone_targets, 'Z3');
});

Deno.test('D-049: base / build brick remains Z2 throughout (unchanged)', () => {
  for (const phase of ['base', 'build'] as const) {
    const [bike] = brick('Saturday', 2.5, 3.5, phase, 'g1');
    assertEquals(bike.intensity_class, 'EASY');
    assertEquals(bike.steps_preset?.length, 1);
    assert(bike.steps_preset![0].endsWith('_Z2'));
    assertEquals(bike.zone_targets, 'Z2');
  }
});

Deno.test('D-049: RS brick closing block lands inside the 20-45 min spec window', () => {
  // Test a range of bike durations from 60 min up to ~3.5 hr; closing block
  // computed as min(45, max(20, round(bikeMin * 0.25))).
  for (const hours of [1.0, 1.5, 2.0, 2.5, 3.0, 3.5]) {
    const [bike] = brick('Saturday', hours, 4, 'race_specific', 'g1');
    if (bike.steps_preset!.length !== 2) continue; // <60min single-tag branch
    const closingStep = bike.steps_preset![1];
    const m = closingStep.match(/^bike_race_pace_(\d+)min_Z3$/);
    assert(m, `closing step has expected shape: ${closingStep}`);
    const closeMin = parseInt(m![1], 10);
    assert(closeMin >= 20 && closeMin <= 45, `closing block ${closeMin} min outside 20-45 spec window`);
    const baseStep = bike.steps_preset![0];
    const baseM = baseStep.match(/^bike_endurance_(\d+)min_Z2$/);
    assert(baseM, `base step has expected shape: ${baseStep}`);
    const baseMin = parseInt(baseM![1], 10);
    assertEquals(baseMin + closeMin, Math.round(hours * 60), 'base + close must equal total');
  }
});

Deno.test('D-049: RS brick description references race-IF target band', () => {
  const [bike] = brick('Saturday', 2.5, 4.5, 'race_specific', 'g1');
  // 70.3 IF target documented in copy so athlete knows what race-pace means.
  assert(/0\.78-0\.82 IF for 70\.3/.test(bike.description));
  // Full IM IF target also documented (athlete-facing pattern for ironman bricks).
  assert(/0\.62-0\.68 IF for full IM/.test(bike.description));
});
