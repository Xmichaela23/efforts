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
    assert(rest.length > 0, `${label}: the test week carries no accessories at all`);
    for (const n of rest) {
      assert(!/bench press|back squat|deadlift|overhead press/i.test(n),
        `${label}: ${n} is a tested lift and would be logged as a plain accessory`);
    }
  }
});

Deno.test('⛔ THE LOGGER SPLITS ON THAT MARKER, AND ONLY THE LAUNCHER REPLACES THE LIST', async () => {
  /**
   * ⚠️ SOURCE CONTRACTS — the logger is a React component and is not importable here. What is
   * asserted is that both halves of the fix are still present, which is what a refactor would break.
   */
  const src = await Deno.readTextFile(
    new URL('../../../../src/components/StrengthLogger.tsx', import.meta.url));
  assert(/const isTestedLift = \(ex: any\): boolean =>/.test(src),
    'the retest branch stopped splitting tested lifts from accessories — a calf raise gets a ramp again');
  assert(/if \(!name\.includes\('baseline test'\)\) return null;/.test(src),
    '⛔ `getBaselineTestType` matches the plan\'s "Test: Upper" again — that branch REPLACES the '
    + 'loaded exercises with a hardcoded list, adding a pull-up nobody prescribed and dropping the accessories');
});
