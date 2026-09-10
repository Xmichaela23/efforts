/**
 * REST LENGTHS — moved with the rule from `src/lib/strength-rest-timer.test.ts` (2026-09-10, audit H-S07).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/strength/rest-seconds.test.ts --no-check
 *
 * ⚠️ A FIXTURE IS NOT A SOURCE. Pinning a number proves it has not changed; it does not make it right.
 * The declarations live beside the rule — `LEGACY_LADDER_IS_OURS` and `REST_MINUTES_ARE_OURS`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  HEAVY_MAIN_REST_SEC,
  isPlyometricMovement,
  LEGACY_LADDER_IS_OURS,
  REST_BY_SLOT,
  REST_MINUTES_ARE_OURS,
  restBucketForIntent,
  restCueForBucket,
  restFieldsForRow,
  restSecondsFor,
  WARMUP_REST_SEC,
} from './rest-seconds.ts';
import { isMainBarbellLift } from '../../../../src/lib/exercise-role.ts';
import { REST_BETWEEN_SETS_RULE, REST_BETWEEN_SETS_RULE_HYP } from '../strength-grid/intents.ts';
import { composeWeek } from '../standing-plan/compose.ts';

Deno.test('⛔ PUSH PRESS AND MILITARY PRESS REST AS MAIN LIFTS', () => {
  for (const n of ['Push Press', 'Military Press']) {
    assertEquals(isMainBarbellLift(n), true, `${n} is in MAIN_BARBELL_LIFTS`);
    assertEquals(restSecondsFor(n, 5), 180);
    assertEquals(restSecondsFor(n, 8), 120);
  }
});

Deno.test('⛔ A HEAVY MAIN SET RESTS 3:00', () => {
  assertEquals(HEAVY_MAIN_REST_SEC, 180);
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Front Squat',
                   'Trap Bar Deadlift', 'Close Grip Bench Press', 'Sumo Deadlift', 'ohp']) {
    assertEquals(restSecondsFor(n, 3), 180, `${n} at 3 reps`);
    assertEquals(restSecondsFor(n, 5), 180, `${n} at 5 reps`);
  }
});

Deno.test('the 6-8 main band is 2:00, and main lifts outside the bands take 120', () => {
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift']) {
    assertEquals(restSecondsFor(n, 6), 120);
    assertEquals(restSecondsFor(n, 8), 120);
    assertEquals(restSecondsFor(n, 12), 120);
  }
});

Deno.test('accessory bands', () => {
  for (const n of ['Band Face Pulls', 'Chin Up', 'Goblet Squat', 'Romanian Deadlift',
                   'Bulgarian Split Squat', 'Dumbbell Row', 'Hip Thrust']) {
    assertEquals(restSecondsFor(n, 8), 90, `${n} at 8 reps`);
    assertEquals(restSecondsFor(n, 12), 75, `${n} at 12 reps`);
    assertEquals(restSecondsFor(n, 20), 60, `${n} at 20 reps`);
  }
  for (const n of ['Dumbbell Bench Press', 'Incline Bench Press', 'Decline Bench Press']) {
    assertEquals(isMainBarbellLift(n), false, `${n} is not a main lift`);
    assertEquals(restSecondsFor(n, 5), 90);
    assertEquals(restSecondsFor(n, 8), 90);
  }
});

Deno.test('plyometrics are checked FIRST', () => {
  for (const n of ['Box Jump', 'Broad Jump', 'Squat Jump', 'Bench Jump', 'Skater Hop', 'Bounding']) {
    assertEquals(isPlyometricMovement(n), true, `${n} is plyometric`);
    assertEquals(restSecondsFor(n, 5), 150, `${n} must not take the main-lift branch`);
  }
});

Deno.test('no reps defaults to 90', () => {
  assertEquals(restSecondsFor('Bench Press', 0), 90);
  assertEquals(restSecondsFor('Bench Press', undefined), 90);
});

Deno.test('⛔ THE SLOT INTENT OUTRANKS THE MOVEMENT AND THE REP COUNT', () => {
  assertEquals(restSecondsFor('Pull Up', 3), 90);
  assertEquals(restSecondsFor('Pull Up', 3, 'ME'), 180);
  assertEquals(restSecondsFor('Bench Press', 3, 'DE'), 120);
  for (const reps of [1, 3, 5, 8, 12, 20]) {
    assertEquals(restSecondsFor('Ab Wheel Rollout', reps, 'ME'), 180);
    assertEquals(restSecondsFor('Back Squat', reps, 'HYP'), 90);
  }
  assertEquals(restSecondsFor('Box Jump', 5, 'DE'), 120);
  for (const intent of [undefined, null, '', 'nonsense', 'me '] as (string | null | undefined)[]) {
    assertEquals(restSecondsFor('Bench Press', 5, intent), 180);
    assertEquals(restSecondsFor('Hip Thrust', 12, intent), 75);
    assertEquals(restSecondsFor('Box Jump', 5, intent), 150);
  }
});

Deno.test('four intents, three buckets', () => {
  assertEquals(restBucketForIntent('ME'), 'heavy');
  assertEquals(restBucketForIntent('DE'), 'speed');
  assertEquals(restBucketForIntent('SKILL'), 'speed');
  assertEquals(restBucketForIntent('HYP'), 'muscle');
  assertEquals(REST_BY_SLOT, { heavy: 180, speed: 120, muscle: 90 });
  assertEquals(REST_BY_SLOT.heavy, HEAVY_MAIN_REST_SEC);
});

Deno.test('⛔ THE CUE IS IMPORTED, NOT REWORDED, AND NO NUMBER IS PRESENTED AS HIS', () => {
  assertEquals(restCueForBucket('heavy'), REST_BETWEEN_SETS_RULE.cue);
  assertEquals(restCueForBucket('speed'), REST_BETWEEN_SETS_RULE.cue);
  assertEquals(restCueForBucket('muscle'), REST_BETWEEN_SETS_RULE_HYP.cue);
  assert(/ours/i.test(REST_MINUTES_ARE_OURS));
  assert(/ours/i.test(LEGACY_LADDER_IS_OURS));
  assert(!/\d/.test(REST_BETWEEN_SETS_RULE.cue));
  assert(!/\d/.test(REST_BETWEEN_SETS_RULE_HYP.cue));
});

Deno.test('⛔ THE ROW FIELDS — a stamp wins, warm-up rest only with a warm-up, cue only with an intent', () => {
  assertEquals(restFieldsForRow({ name: 'Bench Press', reps: 5 }), { rest_seconds: 180 });
  assertEquals(restFieldsForRow({ name: 'Hip Thrust', reps: '10-12' }), { rest_seconds: 75 });
  assertEquals(restFieldsForRow({ name: 'Hip Thrust', reps: '50 total' }), { rest_seconds: 60 });
  assertEquals(restFieldsForRow({ name: 'Plank', reps: 'AMRAP' }), { rest_seconds: 90 });
  assertEquals(
    restFieldsForRow({ name: 'Bench Press', reps: '1-5', slot_intent: 'ME', set_plan: [{ weight: 45, reps: 5, warmup: true }, { weight: 135 }] }),
    { rest_seconds: 180, warmup_rest_seconds: WARMUP_REST_SEC, rest_cue: REST_BETWEEN_SETS_RULE.cue },
  );
  // The first WORK set's reps, not the warm-up's.
  assertEquals(restFieldsForRow({ name: 'Back Squat', reps: 5, set_plan: [{ weight: 45, reps: 10, warmup: true }, { weight: 185, reps: 8 }] }).rest_seconds, 120);
  assertEquals(restFieldsForRow({ name: 'Bench Press', reps: 5, rest_seconds: 77, rest_cue: 'x' }), { rest_seconds: 77, rest_cue: 'x' });
});

Deno.test('⛔ EVERY COMPOSED STRENGTH ROW CARRIES ITS REST, AND THE NUMBER IS THE RULE\'S', () => {
  const kit = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  for (const week of [1, 2, 5]) {
    const w = composeWeek({
      competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
      roundTo: 5, frame: 'all_rounder', week, column: 'standard', equipment: kit,
      seed1RMs: { bench: 185, squat: 225, deadlift: 275, overheadPress: 115 },
    } as never) as { sessions: Array<{ strength_exercises?: Array<Record<string, unknown>> }> };
    const rows = w.sessions.flatMap((s) => s.strength_exercises ?? []);
    assert(rows.length > 0, `week ${week} composed no strength rows`);
    for (const r of rows) {
      const { rest_seconds, warmup_rest_seconds, rest_cue, ...rest } = r;
      assert(Number(rest_seconds) > 0, `week ${week}: ${String(r.name)} has no rest_seconds`);
      assertEquals({ rest_seconds, warmup_rest_seconds, rest_cue }, { ...{ warmup_rest_seconds: undefined, rest_cue: undefined }, ...restFieldsForRow(rest) },
        `week ${week}: ${String(r.name)} carries a number the rule does not give`);
    }
  }
});

Deno.test('⛔ THE LOGGER NO LONGER DECIDES REST', async () => {
  const src = await Deno.readTextFile(new URL('../../../../src/components/StrengthLogger.tsx', import.meta.url));
  assertEquals(/calculateRestTime|restSecondsFor|restBucketForIntent|restCueForBucket|WARMUP_REST_SEC/.test(src), false,
    'the logger computes a rest length or picks a cue again');
  assert(/rest_seconds/.test(src) && /rest_cue/.test(src), 'the logger stopped reading the row\'s rest fields');
  const phone = await Deno.readTextFile(new URL('../../../../src/lib/strength-rest-timer.ts', import.meta.url));
  assertEquals(/function\s+calculateRestTime|REST_BY_SLOT\s*[:=]/.test(phone), false, 'the rule was copied back onto the phone');
});
