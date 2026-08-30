/**
 * ⛔⛔ THE PERMANENT REGRESSION: A LIGHT LIFTER'S BLOCK MUST CLIMB, NOT REPEAT ITSELF.
 *
 *   ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/strength-primary-plan.cycle-climb.test.ts
 *
 * ⛔ WHAT THIS FILE REPLACES, AND WHY IT IS AN INVERSION RATHER THAN AN EDIT. It stands where
 * `strength-primary-plan.ceiling-stall.test.ts` stood (deleted 2026-08-12, slice a). That file PINNED
 * the freeze as correct behaviour: it asserted that a 110 lb squat and a 100 lb press print
 * byte-identical prescriptions in cycles 2 and 3, and that the plan says so in prose. The freeze was
 * real and the assertions were accurate; the reading was wrong. The cause was the 90%-of-1RM training
 * max ceiling, which is an app invention with no basis in the book — so the ceiling was deleted and
 * these same athletes must now climb.
 *
 * ⛔ THE MECHANISM OF THE FREEZE, BECAUSE IT IS STRUCTURAL AND WILL COME BACK IF ANYONE RE-ADDS A
 * RATIO GUARD. A block collapses into identical cycles whenever ONE plate step covers the five
 * percentage points between the 85% start (`WORKING_NUMBER_PCT_OF_1RM`) and a 90% bound. Upper body:
 * any max at or under ~100. Lower body: ~110. It hits those athletes before they lift anything.
 *
 * ⚠️ THESE ARE BUG-CASE FIXTURES, NOT TUNING TARGETS. The maxes reproduce the report; no decision is
 * gated on them, and the property under test — the prescribed weight moves between cycles, or a
 * confirmed stall moved it down — is true for every athlete.
 *
 * Book: p30 (increase until you can no longer hit the prescribed sets and reps), p31 (the stall,
 * −10%, per lift), p33 (one bad day is not a reset), p90 / p107 (same fixed progression for every
 * training age).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { applyVerdict, workingNumberFrom1RM, workingNumberForCycles } from './loading/wendler-531.ts';

/** The light-lifter profile that used to freeze: press 100, squat 110. */
const LIGHT = { bench: 150, squat: 110, deadlift: 150, overheadPress: 100 };

const blockFor = (oneRepMaxes: Record<string, number>) => composeStrengthPrimaryPlan({
  durationWeeks: 12,
  oneRepMaxes,
  enduranceSport: 'run',
  enduranceFrequency: 3,
  targetWeeklyMiles: 13,
  easyPaceMinPerMile: 9,
  // Three anchors — the shape the original report was generated under.
  blockShape: { continuity: { weeksSince: 2, logs: 40 }, strengthPosture: 'develop' },
} as never) as any;

const PLAN = blockFor(LIGHT);

const setPlan = (plan: any, week: number, lift: string) =>
  (((plan.sessions_by_week[String(week)] ?? [])
    .find((x: any) => x.type === 'strength' && x.name.includes(lift))
    ?.strength_exercises?.find((e: any) => e.name === lift)?.set_plan ?? []) as any[]);

/** One lift's whole prescription for a week, as a comparable string. */
const ramp = (plan: any, week: number, lift: string) =>
  setPlan(plan, week, lift).map((p) => `${p.weight}x${p.reps}${p.amrap ? '+' : ''}`).join(' ');

/**
 * The WORK sets only. ⚠️ `set_plan` carries the previous program warm-up ramp in front (40/50/60%,
 * tagged `warmup`), so index 0 of the raw list is a warm-up, not the opening work set.
 */
const work = (plan: any, week: number, lift: string) =>
  setPlan(plan, week, lift).filter((p) => !p.warmup)
    .map((p) => `${p.weight}x${p.reps}${p.amrap ? '+' : ''}`).join(' ');

// ── THE REGRESSION ───────────────────────────────────────────────────────────

Deno.test('⛔ THE FREEZE IS DEAD: week 7 and week 11 are DIFFERENT for a 100 lb press', () => {
  // ⛔ THIS IS THE ONE. Week 7 and week 11 are the same slot — the 95% set of cycles 2 and 3 — and
  // they printed the identical top set for every athlete with a press max at or under 100 lb.
  const wk7 = ramp(PLAN, 7, 'Overhead Press');
  const wk11 = ramp(PLAN, 11, 'Overhead Press');
  assert(wk7 !== wk11, `the press still repeats itself: week 7 and week 11 are both "${wk7}"`);

  // And it is climbing, not merely differing. Training max 85 → 90 → 95, so the 95% top set rises.
  const topOf = (s: string) => Number(s.split(' ').at(-1)!.split('x')[0]);
  assert(topOf(wk11) > topOf(wk7), `week 11 (${topOf(wk11)}) must be heavier than week 7 (${topOf(wk7)})`);
});

Deno.test('⛔ NO TWO CYCLES OF A LIGHT BLOCK ARE IDENTICAL — on any of the four lifts', () => {
  // The general form of the same defect. Cycle 2 week N vs cycle 3 week N, every lift, every week.
  for (const lift of ['Back Squat', 'Overhead Press', 'Bench Press', 'Deadlift']) {
    for (const [c2, c3] of [[5, 9], [6, 10], [7, 11]] as const) {
      assert(
        ramp(PLAN, c2, lift) !== ramp(PLAN, c3, lift),
        `${lift}: week ${c2} and week ${c3} are identical — "${ramp(PLAN, c2, lift)}"`,
      );
    }
  }
});

Deno.test('the ladder underneath: press 85 → 90 → 95, squat 90 → 100 → 110', () => {
  // ⚠️ THE SQUAT'S +10 IS THE OTHER HALF OF THE SLICE. The deleted percentage cap shrank a light
  // lifter's lower-body step to +5 (6% of a 90 lb training max is 5.4); the previous program gives every lifter
  // the same jump (p90, p107), so it is +10 again.
  assertEquals(workingNumberFrom1RM(LIGHT.overheadPress), 85);
  assertEquals(workingNumberFrom1RM(LIGHT.squat), 90);

  const ladder = (base: number, isLower: boolean) =>
    [1, 2, 3].map((c) =>
      workingNumberForCycles(base, c, isLower, undefined, { unknownMeans: 'advance' }).workingNumber);

  assertEquals(ladder(85, false), [85, 90, 95], 'press');
  assertEquals(ladder(90, true), [90, 100, 110], 'squat');

  // ⚠️ THE SQUAT'S CYCLE-3 TRAINING MAX (110) IS THE ATHLETE'S 1RM ON FILE (110), AND THAT IS
  // ALLOWED NOW — the number on file is a signup value nobody tested, and the book's brake is the
  // missed prescription, not the record. If it really is their max, they will miss the 95% set,
  // hold, miss again and come down 10%. That correction is the design, not a leak.
  assertEquals(ladder(90, true)[2], LIGHT.squat);
});

// ── THE BRAKE THAT REPLACED THE CEILING ──────────────────────────────────────

Deno.test('⛔ THE CLIMB IS EARNED, NOT FREE — a confirmed stall takes it back down', () => {
  // The answer to "so what stops a light lifter climbing forever?". Not a ratio: a miss.
  // Press base 85, both measured cycles missed → held, then −10%.
  assertEquals(workingNumberForCycles(85, 3, false, ['miss', 'miss']).workingNumber, 75);
  // ⚠️ AND ONE MISS COSTS NOTHING (p33). The athlete repeats 85 and gets another go at it.
  assertEquals(workingNumberForCycles(85, 3, false, ['miss', 'advance']).workingNumber, 90);
});

Deno.test('⛔ THE STALL IS PER LIFT — a missed press must not move the squat (p31)', () => {
  // p31: *"You may stall out with one lift before you do with the others. When this happens, you only
  // need to decrease the one stalled lift."* The engine keeps verdicts in per-lift arrays, so this
  // asserts the arithmetic honours the separation it is handed.
  const pressed = workingNumberForCycles(85, 3, false, ['miss', 'miss']).workingNumber;
  const squatted = workingNumberForCycles(90, 3, true, ['advance', 'advance']).workingNumber;
  assertEquals(pressed, 75, 'the stalled press comes down');
  assertEquals(squatted, 110, 'the healthy squat is untouched by it');
});

// ── THE HEAVY LIFTER ─────────────────────────────────────────────────────────

Deno.test('⛔ A LIFTER THE CEILING NEVER BOUND IS BYTE-IDENTICAL TO BEFORE THE REMOVAL', () => {
  // A 400 lb squat: training max 340 → 350 → 360, and the old ceiling was 90% of 400 = 360. The step
  // never breached it and the 6% cap never bound (6% of 340 is 20), so every prescribed weight in
  // this block is the same number it was before slice a. The removal is not a global reweighting.
  const heavy = blockFor({ bench: 300, squat: 400, deadlift: 500, overheadPress: 200 });
  // ⚠️ THE SHAPE IS L-L-A AS OF 2026-08-16 (the continuity tiers are deleted; every block is two
  // building cycles and one measuring cycle). Cycles 1 and 2 are LEADERS, so their top sets are
  // programmed fives with no open set; cycle 3 is the anchor and carries the rep-out. **The WEIGHTS
  // are untouched by that change** — which is the property this test is here for.
  assertEquals(work(heavy, 1, 'Back Squat'), '220x5 255x5 285x5');   // TM 340
  assertEquals(work(heavy, 5, 'Back Squat'), '225x5 260x5 295x5');   // TM 350
  assertEquals(work(heavy, 9, 'Back Squat'), '230x5 270x5 305x5+');  // TM 360 — exactly the old ceiling
});

Deno.test('⚠️ THE 315 SQUAT IS THE ONE STANDARD BLOCK THE REMOVAL DOES CHANGE — and it is the point', () => {
  // ⛔ "THE CEILING NEVER BOUND FOR A HEAVY LIFTER" IS FALSE, AND THE SLICE DOC SAID IT WOULD BE
  // BYTE-IDENTICAL. Corrected here against the arithmetic: a 315 lb squat is training max 265 → 275
  // → wants 285, and 90% of 315 rounds to 280 — so cycle 3 was TRUNCATED from 285 onto 280. the previous program's
  // own book lifter squats in this range, so the ceiling was reshaping a standard block, not just a
  // light one.
  assertEquals(workingNumberFrom1RM(315), 265);
  assertEquals(applyVerdict(275, 'advance', true), 285, 'the ceiling used to truncate this to 280');

  // Cycles 1 and 2 are unchanged; only the third moves, and it moves UP by one plate pair.
  const std = blockFor({ bench: 225, squat: 315, deadlift: 405, overheadPress: 135 });
  assertEquals(work(std, 1, 'Back Squat').split(' ')[0], '170x5');   // TM 265
  assertEquals(work(std, 5, 'Back Squat').split(' ')[0], '175x5');   // TM 275
  assertEquals(work(std, 9, 'Back Squat').split(' ')[0], '185x5', 'TM 285 — was 280 under the ceiling');
});

// ── THE SIGNAL D-421 USED TO EMIT ────────────────────────────────────────────

Deno.test('⛔ NO BLOCK EMITS A `ceiling` CALIBRATION SIGNAL OR NOTE ANY MORE', () => {
  // D-421 shipped `strength_calibration` with `reason: 'ceiling'`, plus a prose compromise tagged
  // `kind: 'ceiling'`. Its only producer was the ceiling. The FIELD and its `plans.config` plumbing
  // survive — slice b repopulates them from the reset/bump events — but nothing writes them today,
  // and a block that claimed a lift was pinned would now be lying.
  for (const plan of [PLAN, blockFor({ bench: 300, squat: 400, deadlift: 500, overheadPress: 200 })]) {
    assertEquals(plan.strength_calibration, undefined);
    const notes = (plan.placement_compromises ?? []) as Array<{ kind?: string; text?: string }>;
    assertEquals(notes.filter((n) => n?.kind === 'ceiling').length, 0);
    for (const n of notes) {
      assert(!/max on file|stop climbing/.test(n?.text ?? ''), `a ceiling sentence survived: ${n?.text}`);
    }
  }
});
