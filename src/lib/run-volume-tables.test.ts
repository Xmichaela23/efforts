/**
 * ⛔ THE MILEAGE FLOOR AND THE LONG-RUN SHARE — pinned, with the arithmetic written out.
 *
 * These numbers gate whether a marathon block gets built at all, so the failure mode worth guarding
 * is not "the function throws", it is "someone retunes a constant and the floor silently moves".
 * Every assertion below states the sum it is checking so a future edit has to disagree with the
 * working, not just with a number.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --no-check src/lib/run-volume-tables.test.ts
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  WEEKLY_MILEAGE,
  LONG_RUN_PROGRESSION,
  ENGINE_START_CLAMP_FRACTION,
  MARATHON_BASE_FLOOR_MI,
  MAX_LONG_RUN_SHARE,
  longRunWeek1Mi,
  runVolumeFloorMi,
  validateWeeklyMiles,
} from './run-volume-tables.ts';

Deno.test('the floor is the LARGEST of three rules, and each one wins somewhere', () => {
  // beginner  — base floor 25 beats clamp (20 × 0.7 = 14) and share (6 / 0.35 = 17.1)
  assertEquals(runVolumeFloorMi('marathon', 'beginner'), { requiredMi: 25, bound: 'base_floor' });
  // intermediate — share (8 / 0.30 = 26.7 → 27) beats base floor 25 and clamp (30 × 0.7 = 21)
  assertEquals(runVolumeFloorMi('marathon', 'intermediate'), { requiredMi: 27, bound: 'long_run_share' });
  // advanced  — share (10 / 0.30 = 33.3 → 34) beats clamp (40 × 0.7 = 28) and base floor 25
  assertEquals(runVolumeFloorMi('marathon', 'advanced'), { requiredMi: 34, bound: 'long_run_share' });
});

Deno.test('the intermediate floor lands inside the band Michael named (25-30)', () => {
  const f = runVolumeFloorMi('marathon', 'intermediate')!;
  assert(f.requiredMi >= 25 && f.requiredMi <= 30, `intermediate floor ${f.requiredMi} left the 25-30 band`);
});

Deno.test('a week below the floor is refused and NAMES which rule bound it', () => {
  const beginner = validateWeeklyMiles('marathon', 'beginner', 12);
  assertEquals(beginner?.ok, false);
  assertEquals(beginner && !beginner.ok ? beginner.bound : null, 'base_floor');

  const intermediate = validateWeeklyMiles('marathon', 'intermediate', 22);
  assertEquals(intermediate?.ok, false);
  // 22 clears the clamp (21) but not the long run it would have to carry.
  assertEquals(intermediate && !intermediate.ok ? intermediate.bound : null, 'long_run_share');
});

Deno.test('a week at or above the floor passes and reports the real share', () => {
  const v = validateWeeklyMiles('marathon', 'intermediate', 40);
  assertEquals(v?.ok, true);
  // week-1 long run 8 of a 40-mile week = 20%
  assertEquals(v && v.ok ? v.sharePct : null, 20);
  assertEquals(v && v.ok ? v.longRunWeek1Mi : null, 8);
});

Deno.test('⛔ the passing case never exceeds the share ceiling it was built from', () => {
  // The property, not an example: anything the validator ACCEPTS must put the week-1 long run at or
  // under that level's allowance. If a future edit to the floor breaks this, the validator would be
  // waving through weeks it exists to catch.
  for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
    const floor = runVolumeFloorMi('marathon', level)!;
    const lr = longRunWeek1Mi('marathon', level)!;
    const share = lr / floor.requiredMi;
    assert(
      share <= MAX_LONG_RUN_SHARE[level] + 1e-9,
      `${level}: at the floor (${floor.requiredMi} mi) the long run is ${(share * 100).toFixed(0)}% ` +
      `of the week, over the ${(MAX_LONG_RUN_SHARE[level] * 100).toFixed(0)}% allowance`,
    );
  }
});

Deno.test('no answer for a distance or level the tables do not carry — silence, not a guess', () => {
  assertEquals(runVolumeFloorMi('ultra', 'intermediate'), null);
  assertEquals(runVolumeFloorMi('marathon', 'elite'), null);
  // and no verdict at all until a number is actually typed
  assertEquals(validateWeeklyMiles('marathon', 'intermediate', null), null);
  assertEquals(validateWeeklyMiles('marathon', 'intermediate', 0), null);
});

Deno.test('⛔ the tables still match what the engine builds from', () => {
  // These two consts are imported by `generate-run-plan/generators/sustainable.ts`, so drift is
  // structurally impossible — but the SHAPE the validator assumes is not. If the marathon rows lose
  // a level, or the long-run arc stops starting at week 1, the floors above become fiction.
  for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
    assert(WEEKLY_MILEAGE.marathon?.[level], `WEEKLY_MILEAGE lost marathon/${level}`);
    const arc = LONG_RUN_PROGRESSION.marathon?.[level];
    assert(Array.isArray(arc) && arc.length >= 12, `LONG_RUN_PROGRESSION marathon/${level} is too short to build from`);
    assert(arc[0] > 0, `LONG_RUN_PROGRESSION marathon/${level} has no week-1 value`);
  }
  // The clamp fraction is a MIRROR of `resolveEffectiveStartVolume`. If someone changes it here
  // without changing the generator, the intake starts quoting a floor the engine does not apply.
  assertEquals(ENGINE_START_CLAMP_FRACTION, 0.7);
  assertEquals(MARATHON_BASE_FLOOR_MI, 25);
});
