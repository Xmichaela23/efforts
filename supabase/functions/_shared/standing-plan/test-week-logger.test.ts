/**
 * ⛔⛔ THE PLAN'S TEST WEEK IS A TEST TO THE LOGGER — the regression test for two defects the athlete
 * found on his own plan (2026-08-31).
 *
 * The logger only builds a warm-up ramp, and only offers to write the result into the athlete's
 * baselines, when it RECOGNISES a session as a test — the name *"baseline test"* or the `1rm_test`
 * tag. The plan's session is named `Test: Upper` and carried neither, so it fell through to the
 * ordinary pre-fill: **the three scored steps handed over cold, and no offer to save the result.**
 * A test whose number never leaves the block is most of a test wasted.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';

const KIT = [
  'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)',
  'Incline bench', 'Pull-up bar', 'Resistance bands', 'Ab wheel',
];

function testSessions(seed1RMs?: Record<string, number>) {
  const w = composeWeek({
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    roundTo: 5, frame: 'all_rounder', week: 1, column: 'standard', equipment: KIT,
    ...(seed1RMs ? { seed1RMs } : {}),
  } as never) as { sessions: Array<{ name: string; tags?: string[]; strength_exercises?: Array<Record<string, unknown>> }> };
  return w.sessions.filter((s) => /^Test:/.test(String(s.name)));
}

Deno.test('⛔ THE TEST SESSION CARRIES THE TAG THE LOGGER MATCHES ON', () => {
  const sessions = testSessions();
  assertEquals(sessions.length, 2, 'the test week no longer builds two test sessions');
  for (const s of sessions) {
    assert((s.tags ?? []).includes('1rm_test'),
      `${s.name} lost the tag — the logger would give it no warm-up ramp and no offer to save the result`);
    // ⚠️ THE NAME IS ATHLETE-FACING AND STAYS. The tag is what surfaces read.
    assert(/^Test: (Upper|Lower)$/.test(s.name), `${s.name} was renamed; the tag exists so it need not be`);
  }
});

/**
 * ⛔⛔ AND WHICH ROWS GET THE RAMP. The logger's retest branch rebuilt EVERY planned exercise as a
 * warm-up ramp into an all-out single — correct for the week-12 retest, which is nothing but tested
 * lifts, and wrong here: **a calf raise would have arrived as an empty-bar ramp into an AMRAP.**
 */
const isTested = (ex: Record<string, unknown>): boolean => {
  const plan = Array.isArray(ex.set_plan) ? ex.set_plan as Array<Record<string, unknown>> : [];
  if (plan.some((st) => st?.amrap === true)) return true;
  return String(ex.slot_intent ?? '').toUpperCase() === 'ME';
};

Deno.test('⛔⛔ ONLY THE TESTED LIFTS ARE MARKED — with a max on file and without one', () => {
  /**
   * ⚠️ BOTH FIXTURES MATTER. With no max on file the row says "By feel" and carries **no `set_plan`
   * at all**, so an amrap-only marker finds nothing — and that athlete is exactly the one who most
   * needs the ramp. `slot_intent` is what holds in both cases.
   */
  for (const seeds of [undefined, { bench: 150, squat: 110, deadlift: 150, overheadPress: 100 }]) {
    const label = seeds ? 'with a max on file' : 'with no max on file';
    const all = testSessions(seeds as never).flatMap((s) => s.strength_exercises ?? []);
    const marked = all.filter(isTested).map((e) => String(e.name));
    const rest = all.filter((e) => !isTested(e)).map((e) => String(e.name));
    assertEquals(marked.sort(), ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press'],
      `${label}: the wrong rows are marked as tested lifts`);
    /**
     * ⛔⛔ THE COMPOSED TEST WEEK NO LONGER CARRIES ACCESSORIES, AND THAT IS THE POINT NOW (Michael,
     * 2026-08-31: *"test days should be test days"* — `PlannedSession.isTest`). This used to assert
     * `rest.length > 0`, which only held while the muscle floor was parking work on the test day.
     * ⚠️ SO THE SPLIT IS EXERCISED AGAINST AN EXPLICIT ACCESSORY BELOW instead of against whatever
     * the floor happened to drop in. A vacuous pass here is how the logger's accessory branch would
     * go quietly untested.
     */
    for (const n of rest) {
      assert(!/bench press|back squat|deadlift|overhead press/i.test(n),
        `${label}: ${n} is a tested lift and would be logged as a plain accessory`);
    }
  }
});

// ⛔ THE TWO LOGGER SOURCE CHECKS THAT STOOD HERE MOVED WITH THE CODE (2026-09-10, audit H-S01/H-S02).
// The split of tested lifts from accessories and the scored-set seed now live in
// `_shared/strength/test-session.ts`, built by `strength-test-session`, and are pinned in
// `_shared/strength/test-session.test.ts`. The logger no longer builds a test session.

Deno.test('⛔ AND THE COMPOSER STILL MARKS EXACTLY ONE SCORED SET PER TESTED LIFT', () => {
  /**
   * ⚠️ THE OTHER HALF OF THE SAME CONTRACT. The logger seeds from the amrap set and `readTestWeek`
   * SCORES the amrap set; if the composer ever stamped two, or none, the two would silently pick
   * different sets. This is the marker's own integrity check.
   */
  const all = testSessions({ bench: 150, squat: 110, deadlift: 150, overheadPress: 100 } as never)
    .flatMap((s) => s.strength_exercises ?? []);
  for (const ex of all.filter(isTested)) {
    const plan = Array.isArray(ex.set_plan) ? ex.set_plan as Array<Record<string, unknown>> : [];
    assertEquals(plan.filter((st) => st?.amrap === true).length, 1,
      `${String(ex.name)} does not carry exactly one scored set`);
    // ⛔ AND IT IS THE LAST, which is what makes the fallback safe for a row with no flag at all.
    assertEquals(plan[plan.length - 1]?.amrap, true, `${String(ex.name)}: the scored set is not the last`);
  }
});

Deno.test('⛔ the split still classifies an accessory — the test week no longer supplies one', () => {
  /**
   * ⛔ WHY THIS FIXTURE IS HAND-BUILT. With test days excluded from the muscle floor, a composed
   * test week is two tested lifts and nothing else, so the predicate's ACCESSORY branch has no
   * input. The logger still has to get it right — `StrengthLogger.tsx` uses this exact rule to
   * decide which rows are rebuilt as a warm-up ramp into an AMRAP and which come through as
   * prescribed — and a plan whose test day carries an accessory for any other reason (an athlete's
   * own added row, a future core slot) must not have it turned into a max attempt.
   */
  assertEquals(isTested({ name: 'Hanging Leg Raise', sets: 3, reps: '8-10' }), false);
  assertEquals(isTested({ name: 'Bench Press', slot_intent: 'ME' }), true);
  assertEquals(
    isTested({ name: 'Bench Press', set_plan: [{ weight: 115 }, { weight: 130, amrap: true }] }),
    true,
  );
  // ⚠️ A HYP ROW WITH A `set_plan` BUT NO AMRAP IS AN ACCESSORY, which is the case that would
  // otherwise fall through a naive "has set_plan" test.
  assertEquals(
    isTested({ name: 'Calf Raise', slot_intent: 'HYP', set_plan: [{ weight: 45 }, { weight: 45 }] }),
    false,
  );
});
