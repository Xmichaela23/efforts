/**
 * ⛔⛔ WHERE A TAP LANDS, ASSERTED BY RUNNING THE ROUTER (2026-08-30).
 *
 * ⛔ THIS FILE EXISTS BECAUSE A GREEN SUITE MISSED A SHIPPED DEFECT. Standard Focus went live and its
 * card landed on the Strength Focus tier screen — the Strong / Heavy card — so the athlete could not
 * reach the new programme at all. Four tests on that path were passing at the time. They asserted
 * that the focus reached the PAYLOAD, and the payload was correct; nothing asserted the ROUTE.
 *
 * ⚠️ AND THE OTHER WIZARD TESTS READ SOURCE TEXT, which is why the flow had never been executed:
 * `getSteps` lived inside a React component and could not be imported. Moving it out is what makes
 * this file possible — see `wizard-steps.ts`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getSteps, type StepRouterState } from './wizard-steps.ts';

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
  assertEquals(landsOn(strengthPath('standard')), 'posture',
    'Standard Focus lands somewhere other than the posture card');
  assert(!getSteps(strengthPath('standard')).includes('tier'),
    'the tier screen is back in the Standard Focus flow');
});

Deno.test('⛔ AND THE 5K PATH IS UNCHANGED — tier first, exactly as it ships', () => {
  /**
   * ⚠️ BOTH SHAPES. An athlete who picks Strength Focus carries `focus: 'run'`; every build that
   * predates the Standard card carries no focus at all. Neither may move.
   */
  for (const st of [strengthPath('run'), strengthPath(undefined)]) {
    assertEquals(landsOn(st), 'tier', 'the Strength Focus path no longer opens the tier screen');
    assertEquals(getSteps(st), [
      'goal', 'train', 'tier', 'posture', 'endurance', 'accessory', 'schedule', 'confirm',
    ]);
  }
});

Deno.test('⛔ THE FLOW IS COMPLETE WITHOUT A STANDARD-ONLY SCREEN', () => {
  /**
   * ⚠️ NOTHING IS MISSING, ONLY THE TIER IS SKIPPED. Every remaining step is shared, and the
   * endurance screen is already frame-driven — it draws the five rows off the frame. If a Standard
   * Focus build ever needs a question the 5K build does not, THIS is where it goes.
   */
  const standard = getSteps(strengthPath('standard'));
  const run = getSteps(strengthPath('run'));
  assertEquals(standard, run.filter((k) => k !== 'tier'),
    'the two flows differ by more than the tier screen');
  for (const required of ['posture', 'endurance', 'schedule', 'confirm'] as const) {
    assert(standard.includes(required), `Standard Focus never asks for ${required}`);
  }
});

Deno.test('⚠️ A GOAL REACHED OUTSIDE THE TRAIN DRILL-DOWN NEVER SEES THE TIER', () => {
  // ⛔ PRE-EXISTING RULE, PINNED HERE BECAUSE THE FIX SITS ON THE SAME LINE. The tier is gated on
  // `entry === 'train'`, and a stored goal or a standalone route keeps the older flow.
  assert(!getSteps({ ...strengthPath('run'), entry: 'build' }).includes('tier'));
  assert(!getSteps({ ...strengthPath('standard'), entry: 'build' }).includes('tier'));
});
