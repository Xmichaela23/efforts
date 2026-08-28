/**
 * REST LENGTHS — fixtured for the first time (2026-08-03).
 *
 *   ~/.deno/bin/deno test src/lib/strength-rest-timer.test.ts --no-check
 *
 * This function lived inside `StrengthLogger.tsx` and therefore had no test at all, which is how a
 * private classifier could disagree with the app's own main-lift set for months without anything
 * failing. Extracting it is half the fix; this file is the other half.
 *
 * ⚠️ AND A FIXTURE IS NOT A SOURCE — the 2026-08-27 audit's finding, and it is about the file above
 * these lines as much as the one beside it. Every assertion in the first half of this file states a
 * number and none of them says where it came from, which is exactly how the
 * 150 / 120 / 90 / 75 / 60 ladder came to look settled without ever having been argued. Pinning a
 * number proves it has not changed; it does not make it right. The declarations live in
 * `strength-rest-timer.ts` now — `LEGACY_LADDER_IS_OURS` and `REST_MINUTES_ARE_OURS`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  calculateRestTime,
  HEAVY_MAIN_REST_SEC,
  isPlyometricMovement,
  LEGACY_LADDER_IS_OURS,
  REST_BY_SLOT,
  REST_MINUTES_ARE_OURS,
  restBucketForIntent,
  restCueForBucket,
} from './strength-rest-timer.ts';
import { isMain531Lift } from './exercise-role.ts';
import { REST_BETWEEN_SETS_RULE, REST_BETWEEN_SETS_RULE_HYP } from '@shared/strength-grid/intents.ts';

Deno.test('⛔ PUSH PRESS AND MILITARY PRESS REST AS MAIN LIFTS', () => {
  // The named bug. The old regex tested /squat|deadlift|bench|overhead|ohp/ — neither of these
  // matches a single one of those words, so two of the app's own main lifts took ACCESSORY rest:
  // 90s on a heavy triple, 60s at 15 reps.
  for (const n of ['Push Press', 'Military Press']) {
    assertEquals(isMain531Lift(n), true, `${n} is in MAIN_531_LIFTS`);
    assertEquals(calculateRestTime(n, 5), 180, `${n} at 5 reps was 90s`);
    assertEquals(calculateRestTime(n, 8), 120, `${n} at 8 reps was 90s`);
  }
});

Deno.test('⛔ A HEAVY MAIN SET RESTS 3:00', () => {
  assertEquals(HEAVY_MAIN_REST_SEC, 180);
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Front Squat',
                   'Trap Bar Deadlift', 'Close Grip Bench Press', 'Sumo Deadlift', 'ohp']) {
    assertEquals(calculateRestTime(n, 3), 180, `${n} at 3 reps`);
    assertEquals(calculateRestTime(n, 5), 180, `${n} at 5 reps`);
  }
});

Deno.test('only the 3-5 band moved — the 6-8 main band is unchanged at 2:00', () => {
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift']) {
    assertEquals(calculateRestTime(n, 6), 120);
    assertEquals(calculateRestTime(n, 8), 120);
    assertEquals(calculateRestTime(n, 12), 120, 'main lifts outside the bands still take 120');
  }
});

Deno.test('⛔ ACCESSORIES ARE UNTOUCHED', () => {
  // Every accessory band is byte-identical to what shipped. If one of these moves, the change has
  // overreached — the brief was main lifts only.
  for (const n of ['Band Face Pulls', 'Chin Up', 'Goblet Squat', 'Romanian Deadlift',
                   'Bulgarian Split Squat', 'Dumbbell Row', 'Hip Thrust']) {
    assertEquals(calculateRestTime(n, 8), 90, `${n} at 8 reps`);
    assertEquals(calculateRestTime(n, 12), 75, `${n} at 12 reps`);
    assertEquals(calculateRestTime(n, 20), 60, `${n} at 20 reps`);
  }
});

Deno.test('⚠️ THE OTHER DIRECTION — DB / incline / decline bench now rest as assistance', () => {
  // The old `/bench/` test called these main lifts. They are assistance in 5/3/1 and are NOT in
  // MAIN_531_LIFTS, so they now take assistance rest. This is the classifier being right, and it is
  // a VISIBLE change — pinned here so it is a decision on the record rather than a surprise.
  for (const n of ['Dumbbell Bench Press', 'Incline Bench Press', 'Decline Bench Press']) {
    assertEquals(isMain531Lift(n), false, `${n} is not a main lift`);
    assertEquals(calculateRestTime(n, 5), 90, `${n} at 5 reps (was 150)`);
    assertEquals(calculateRestTime(n, 8), 90, `${n} at 8 reps (was 120)`);
  }
});

Deno.test('plyometrics still get full neural recovery, and are checked FIRST', () => {
  // Rule order is load-bearing: "Squat Jump" contains "squat" and "Bench Jump" contains "bench".
  for (const n of ['Box Jump', 'Broad Jump', 'Squat Jump', 'Bench Jump', 'Skater Hop', 'Bounding']) {
    assertEquals(isPlyometricMovement(n), true, `${n} is plyometric`);
    assertEquals(calculateRestTime(n, 5), 150, `${n} must not take the main-lift branch`);
  }
});

Deno.test('no reps logged still defaults to 90', () => {
  assertEquals(calculateRestTime('Bench Press', 0), 90);
  assertEquals(calculateRestTime('Bench Press', undefined), 90);
});

Deno.test('⛔ THE PRIVATE CLASSIFIER IS GONE FROM THE COMPONENT', async () => {
  // The seventh private exercise list. If it comes back, this fails.
  const src = await Deno.readTextFile(new URL('../components/StrengthLogger.tsx', import.meta.url));
  assertEquals(/const isMainCompound\s*=/.test(src), false, 'isMainCompound was re-added');
  assertEquals(/const isPlyometric\s*=\s*\(/.test(src), false, 'isPlyometric was re-added — import it instead');
  assertEquals(/const calculateRestTime\s*=/.test(src), false, 'calculateRestTime was re-inlined');
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE SLOT INTENT (2026-08-27) — Michael's call, Option A: standing-plan rows only.
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE TWO DEFECTS ON HIS SCREEN — a heavy pull-up and a speed bench', () => {
  // ⛔ A MAX-EFFORT PULL-UP RESTED 90 SECONDS. It is not on MAIN_531_LIFTS, so at 1-5 reps it fell
  // past every accessory band to the catch-all, while a max-effort bench on the same day rested
  // three minutes. Same intent, same day, two answers.
  assertEquals(isMain531Lift('Pull Up'), false, 'the premise changed — a pull-up is now a main lift');
  assertEquals(calculateRestTime('Pull Up', 3), 90, 'the old answer changed — this fixture is stale');
  assertEquals(calculateRestTime('Pull Up', 3, 'ME'), 180);
  assertEquals(calculateRestTime('Bench Press', 3, 'ME'), 180, 'the two ME rows must agree');

  // ⛔ AND A SPEED BENCH TOOK THE HEAVY ANSWER. 2-4 reps on a main lift landed in the 3-5 band.
  assertEquals(calculateRestTime('Bench Press', 3), 180, 'the old answer changed — this fixture is stale');
  assertEquals(calculateRestTime('Bench Press', 3, 'DE'), 120);
});

Deno.test('four intents, three buckets, and SKILL rides with DE', () => {
  assertEquals(restBucketForIntent('ME'), 'heavy');
  assertEquals(restBucketForIntent('DE'), 'speed');
  // p218 gives DE and SKILL the same fatigue instruction at loads well under maximal.
  assertEquals(restBucketForIntent('SKILL'), 'speed');
  assertEquals(restBucketForIntent('HYP'), 'muscle');
  assertEquals(REST_BY_SLOT.heavy, 180);
  assertEquals(REST_BY_SLOT.speed, 120);
  assertEquals(REST_BY_SLOT.muscle, 90);
  // ⛔ THE HEAVY BUCKET IS THE SAME NUMBER AS THE ONE ARGUED CASE, not a second opinion about it.
  assertEquals(REST_BY_SLOT.heavy, HEAVY_MAIN_REST_SEC);
});

Deno.test('⛔ THE INTENT OUTRANKS THE MOVEMENT AND THE REP COUNT', () => {
  // Re-deriving the kind of set from a name is what broke; once the row says, nothing else votes.
  for (const reps of [1, 3, 5, 8, 12, 20]) {
    assertEquals(calculateRestTime('Ab Wheel Rollout', reps, 'ME'), 180, `ME at ${reps} reps`);
    assertEquals(calculateRestTime('Back Squat', reps, 'HYP'), 90, `HYP at ${reps} reps`);
  }
  // ⚠️ EVEN A PLYOMETRIC NAME, which is checked first in the no-intent ladder.
  assertEquals(calculateRestTime('Box Jump', 5), 150);
  assertEquals(calculateRestTime('Box Jump', 5, 'DE'), 120);
});

Deno.test('⛔ NO INTENT CHANGES NOTHING — the scope Michael set', () => {
  /**
   * ⛔ OPTION A, PINNED. 5/3/1 and freestyle rows keep today's numbers exactly. Re-basing them was
   * the option NOT taken: nobody has reported a problem with rest there, and changing a number on no
   * evidence is worse than leaving one that works.
   */
  for (const intent of [undefined, null, '', 'nonsense', 'me '] as (string | null | undefined)[]) {
    assertEquals(calculateRestTime('Bench Press', 5, intent), 180);
    assertEquals(calculateRestTime('Hip Thrust', 12, intent), 75);
    assertEquals(calculateRestTime('Box Jump', 5, intent), 150);
  }
});

Deno.test('⛔ THE COPY IS IMPORTED, NOT REWORDED — one owner for the rule', () => {
  // ⛔ p78 FOR STRENGTH, p84 FOR HYPERTROPHY, AND THEY SAY OPPOSITE THINGS ON PURPOSE. The timer
  // must not carry its own wording: the plan's notes and the clock have to be the same sentence.
  assertEquals(restCueForBucket('heavy'), REST_BETWEEN_SETS_RULE.cue);
  assertEquals(restCueForBucket('speed'), REST_BETWEEN_SETS_RULE.cue);
  assertEquals(restCueForBucket('muscle'), REST_BETWEEN_SETS_RULE_HYP.cue);
  assert(restCueForBucket('heavy') !== restCueForBucket('muscle'),
    'the hypertrophy exception collapsed into the strength rule');
});

Deno.test('⛔ NOT ONE OF OUR NUMBERS IS PRESENTED AS HIS', async () => {
  /**
   * ⛔ HE GIVES NO MINUTES, ANYWHERE IN THE BOOK. p78 is a readiness condition — rest to nearly full
   * recovery, do not cool down, go when you know you can finish the set. Every duration in this file
   * is ours, and the screen that shows the countdown says so.
   */
  assert(/ours/i.test(REST_MINUTES_ARE_OURS));
  assert(!/\d/.test(REST_BETWEEN_SETS_RULE.cue), 'a minute count got into the sourced rule');
  assert(!/\d/.test(REST_BETWEEN_SETS_RULE_HYP.cue), 'a minute count got into the sourced rule');

  /**
   * ⛔ AND THE UNSOURCED LADDER IS DECLARED RATHER THAN ANONYMOUS (Michael, 2026-08-27). The audit
   * finding: only the 180s heavy case (NSCA + phosphagen) and the main-versus-accessory split
   * (D-380) ever had a basis. The 150 / 120 / 90 / 75 / 60 ladder had no citation in the code, none
   * in its fixtures — the assertions above state the numbers and never say where they came from —
   * and none in the decisions log. It still runs; it is no longer unattributed.
   */
  assert(/ours/i.test(LEGACY_LADDER_IS_OURS));
  const src = await Deno.readTextFile(new URL('./strength-rest-timer.ts', import.meta.url));
  assert(src.includes('LEGACY_LADDER_IS_OURS'), 'the ladder lost its declaration');
});

Deno.test('⛔ THE LOGGER PASSES THE INTENT AT EVERY CALL SITE', async () => {
  // ⚠️ ELEVEN CALL SITES, AND ONE LEFT UNPATCHED IS A SET THAT RESTS BY THE OLD RULE FOR NO REASON
  // ANYONE COULD SEE. Cheaper to assert than to re-audit by eye.
  const src = await Deno.readTextFile(new URL('../components/StrengthLogger.tsx', import.meta.url));
  const calls = [...src.matchAll(/calculateRestTime\(([^)]*)\)/g)].map((m) => m[1]);
  assert(calls.length >= 11, `expected the logger's rest-timer call sites, found ${calls.length}`);
  for (const args of calls) {
    assert(/slotIntentOf\(/.test(args), `a rest-timer call site passes no intent: calculateRestTime(${args})`);
  }
  // ⛔ AND IT READS THE ROW'S OWN FIELD, NEVER THE FREE-TEXT NOTES. A stray "ME" in a note on any
  // other workout must not re-time it.
  assert(/const slotIntentOf[\s\S]{0,400}?slot_intent/.test(src), 'slotIntentOf stopped reading slot_intent');
});
