/**
 * ⛔⛔ WHERE A TAP LANDS, ASSERTED BY RUNNING THE ROUTER (2026-08-30).
 *
 * ⛔ THIS FILE EXISTS BECAUSE A GREEN SUITE MISSED A SHIPPED DEFECT. Standard Focus went live and its
 * card landed on the old Strong / Heavy tier screen — so the athlete could not
 * reach the new programme at all. Four tests on that path were passing at the time. They asserted
 * that the focus reached the PAYLOAD, and the payload was correct; nothing asserted the ROUTE.
 *
 * ⚠️ AND THE OTHER WIZARD TESTS READ SOURCE TEXT, which is why the flow had never been executed:
 * `getSteps` lived inside a React component and could not be imported. Moving it out is what makes
 * this file possible — see `wizard-steps.ts`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fixedSportScope, getSteps, RUN_STRENGTH_POSTURE, skipsSportScope, STANDARD_FOCUS_POSTURE,
  type StepRouterState,
} from './wizard-steps.ts';

const strengthPath = (focus?: 'standard' | 'run'): StepRouterState => ({
  goal: 'get_stronger',
  entry: 'train',
  ...(focus ? { focus } : {}),
  posture: { strength: 'develop', run: 'maintain', bike: 'maintain', swim: 'out' },
});

/** The screen a Train card's tap actually opens. */
const landsOn = (state: StepRouterState) => {
  const steps = getSteps(state);
  return steps[steps.indexOf('train') + 1];
};

Deno.test('⛔⛔ STANDARD FOCUS DOES NOT LAND ON THE 5K PATH\'S TIER SCREEN', () => {
  /**
   * ⛔ THE TIER IS A 5K QUESTION. Strong maps to Strength + 5K (p246) and Heavy to Hypertrophy + 5K
   * (p244) — both are 5K programmes, and the book has no Strong/Heavy split of the All Rounder. A
   * Standard Focus athlete sent there is being asked something with no answer for their programme.
   */
  /**
   * ⚠️ IT LANDS ON THE ENDURANCE SCREEN NOW, NOT THE POSTURE CARD — rebased 2026-08-30, and the RULE
   * is unchanged. This assertion pinned "not the tier screen"; the sport-scope card has since been
   * ruled off this frame too (see `skipsSportScope`), so the first screen after the card moved one
   * further along. What it still asserts is that a Standard Focus tap opens a screen that HAS an
   * answer for this programme.
   */
  assertEquals(landsOn(strengthPath('standard')), 'endurance',
    'Standard Focus lands somewhere other than the endurance week');
  // ⛔ THE TIER SCREEN NO LONGER EXISTS ON ANY PATH (2026-09-07) — see the Run Focus test below.
  assert(!(getSteps(strengthPath('standard')) as string[]).includes('tier'),
    'the tier screen is back in the Standard Focus flow');
});

Deno.test('⛔⛔⛔ STANDARD FOCUS NEVER ASKS WHICH SPORTS — two of the three answers cannot be built', () => {
  /**
   * ⛔ p274 PRESCRIBES `Cyc AnA` ON DAY 2 AND `Cyc endurance` ON DAY 4 AS RIDES that cannot be
   * anything else, and p275's impact floor keeps at least one run — so "Run only" and "Ride only"
   * are both weeks this frame refuses to build. A card offering them asks a question with no answer,
   * which is the same reason the tier card was already skipped here.
   * ⛔ AND THE ROWS ASK IT BETTER. The endurance screen takes a sport PER ROW, so the scope card was
   * asking one screen earlier and less precisely what the rows already ask.
   */
  assert(skipsSportScope(strengthPath('standard')));
  assert(!getSteps(strengthPath('standard')).includes('posture'),
    'the sport-scope card is back in the Standard Focus flow');

  // ⛔ AND EVERY OTHER FLOW KEEPS IT — the 5K path, a focus-less build, and a non-strength goal.
  for (const st of [strengthPath('run'), strengthPath(undefined)]) {
    assert(!skipsSportScope(st));
    assert(getSteps(st).includes('posture'), 'the 5K path lost its sport-scope card');
  }
  const endurance = { ...strengthPath('standard'), goal: 'build_endurance' };
  assert(!skipsSportScope(endurance), 'a non-strength goal was caught by the Standard Focus skip');
  assert(getSteps(endurance).includes('posture'));
});

Deno.test('⛔⛔ AND THE SKIPPED PATH STILL HOLDS BOTH SPORTS — the Continue that cannot be satisfied', () => {
  /**
   * ⛔ THE BLOCKER THIS EXISTS FOR. `seedFromGoal` intersects the goal's posture with the athlete's
   * DECLARED disciplines, so a runner whose baselines list only running is seeded `bike: 'out'`. The
   * scope card is where they fixed that. Skip it without writing the posture and `allowedSlotSports`
   * is `['run']`, the two ride-only rows can never be answered, `allSlotsChosen` never becomes true,
   * and **Continue is disabled with no way to satisfy it** — 2026-08-30's morning, shipped to a
   * runner instead of to a test.
   * ⚠️ THE VALUES ARE THE FRAME'S: p274 prescribes running AND riding every week, so both are held.
   * ⚠️ SWIM IS DELIBERATELY ABSENT — parked on this frame, and off by default.
   */
  assertEquals(STANDARD_FOCUS_POSTURE.run, 'maintain');
  assertEquals(STANDARD_FOCUS_POSTURE.bike, 'maintain');
  assert(!('swim' in STANDARD_FOCUS_POSTURE),
    'swim is claimed by the skipped path — it is parked, and off by default');
});

Deno.test('⛔⛔ RUN FOCUS OPENS ON THE POSTURE CARD — the Strong / Heavy tier screen is gone', () => {
  /**
   * ⛔ WORKORDER-train-menu-reshape-2026-09-07. Strong was a no-op routing into `get_stronger` and
   * Heavy was dark, so the screen asked nothing the engine could hear. The Run Focus card opens the
   * same wizard on `strength_5k`, one screen shorter.
   * ⚠️ BOTH SHAPES. An athlete who picks Run Focus carries `focus: 'run'`; every build that predates
   * the Standard card carries no focus at all. Both take the same route.
   */
  for (const st of [strengthPath('run'), strengthPath(undefined)]) {
    assertEquals(landsOn(st), 'posture', 'the Run Focus path does not open on the posture card');
    assertEquals(getSteps(st), [
      'goal', 'train', 'posture', 'endurance', 'accessory', 'schedule', 'numbers', 'confirm',
    ]);
    assert(!(getSteps(st) as string[]).includes('tier'), 'the tier screen is back');
  }
});

Deno.test('⛔⛔ RUN + STRENGTH HOLDS RUNNING ONLY — the scope cards are answered by the frame', () => {
  /**
   * ⛔ §3 of the same order: p246 is a run week, every endurance slot is a run family, and a rider's
   * home under the Train menu is Ride + Strength. So the posture card on this frame keeps its
   * lifting line and swim toggle but stops asking which sports; the answer is written for the
   * athlete, the same mechanism Standard Focus uses.
   * ⚠️ BIKE IS `out` — that is what keeps the ride chips, the ride-hours box and the FTP question
   * off the later screens, and sends `endurance_sport: 'run'` to the builder.
   */
  assertEquals(RUN_STRENGTH_POSTURE.run, 'maintain');
  assertEquals(RUN_STRENGTH_POSTURE.bike, 'out');
  assert(!('swim' in RUN_STRENGTH_POSTURE), 'swim is claimed — its own toggle owns it');
  for (const st of [strengthPath('run'), strengthPath(undefined)]) {
    assertEquals(fixedSportScope(st), RUN_STRENGTH_POSTURE);
    // ⚠️ THE STEP STAYS — it is the cards that go, not the screen.
    assert(getSteps(st).includes('posture'), 'the posture card left the Run Focus flow');
  }
  assertEquals(fixedSportScope(strengthPath('standard')), STANDARD_FOCUS_POSTURE);
  // ⛔ AND A NON-STRENGTH GOAL IS STILL ASKED.
  assertEquals(fixedSportScope({ ...strengthPath('run'), goal: 'build_endurance' }), null);
  assertEquals(fixedSportScope({ ...strengthPath('run'), goal: 'marathon' }), null);
});

Deno.test('⛔ THE FLOW IS COMPLETE WITHOUT A STANDARD-ONLY SCREEN', () => {
  /**
   * ⚠️ NOTHING IS MISSING, ONLY THE TIER IS SKIPPED. Every remaining step is shared, and the
   * endurance screen is already frame-driven — it draws the five rows off the frame. If a Standard
   * Focus build ever needs a question the 5K build does not, THIS is where it goes.
   */
  const standard = getSteps(strengthPath('standard'));
  const run = getSteps(strengthPath('run'));
  /**
   * ⚠️ REBASED 2026-08-30 with the sport-scope ruling and again 2026-09-07 with the tier gone. The
   * rule is the same and is what matters: **Standard Focus is the 5K flow MINUS screens, never PLUS one.**
   * Both omissions are questions p274 has no answer for. If a Standard build ever needs a question
   * the 5K build does not, this assertion is what fails and this is where it goes.
   */
  // ⚠️ ONE SCREEN APART SINCE 2026-09-07 — the tier screen is gone from both.
  assertEquals(standard, run.filter((k) => k !== 'posture'),
    'the two flows differ by more than the sport-scope screen');
  for (const required of ['endurance', 'schedule', 'numbers', 'confirm'] as const) {
    assert(standard.includes(required), `Standard Focus never asks for ${required}`);
  }
});

Deno.test('⚠️ A GOAL REACHED OUTSIDE THE TRAIN DRILL-DOWN TAKES THE SAME ROUTE, MINUS THE DOOR', () => {
  // ⛔ A stored goal or a standalone route has no `train` screen and nothing else differs.
  assertEquals(getSteps({ ...strengthPath('run'), entry: 'build' }),
    getSteps(strengthPath('run')).filter((k) => k !== 'train'));
  assertEquals(getSteps({ ...strengthPath('standard'), entry: 'build' }),
    getSteps(strengthPath('standard')).filter((k) => k !== 'train'));
});
