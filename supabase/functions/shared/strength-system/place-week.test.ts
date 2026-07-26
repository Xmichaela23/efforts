/**
 * PLACING THE LIFTING WEEK AROUND THE ENDURANCE ABSOLUTES.
 *
 * The two rules these pin, because both were arrived at by correcting an earlier wrong answer:
 *   1. A stack is only offered on a day the athlete SAID they can split. Robineau 2016 found zero
 *      hours between lifting and endurance produced lower strength gains, while six and twenty-four
 *      performed the same. A stack without the gap is the worst arm of the only study on it.
 *   2. The stacked lift is always UPPER. Not a courtesy — pressing does not share prime movers with
 *      running legs, so it is the only lift that costs nothing beside a hard endurance session.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type EndurancePin,
  MAX_ACTIVE_DAYS,
  MIN_STACK_GAP_H,
  placeLiftingWeek,
  requiredClearanceHours,
  resolveStacking,
} from './place-week.ts';

const LIFTS = [
  { lift: 'Bench Press', isLower: false },
  { lift: 'Back Squat', isLower: true },
  { lift: 'Overhead Press', isLower: false },
  { lift: 'Deadlift', isLower: true },
];

const pin = (day: any, kind: any, label: string, canSplitDay?: boolean): EndurancePin =>
  ({ day, kind, label, ...(canSplitDay === undefined ? {} : { canSplitDay }) });

const LONG_DAYS = [pin('Saturday', 'long_ride', 'long ride'), pin('Sunday', 'long_run', 'long run')];

// ── The arithmetic ──────────────────────────────────────────────────────────

Deno.test('the resolution screen fires on arithmetic alone: pins + lifts − 6', () => {
  assertEquals(resolveStacking(LONG_DAYS, 4).stacksRequired, 0);                       // 6 active → skip
  assertEquals(resolveStacking([...LONG_DAYS, pin('Tuesday', 'quality_run', 'club run')], 4).stacksRequired, 1);
  assertEquals(resolveStacking(
    [...LONG_DAYS, pin('Monday', 'quality_run', 'club run'), pin('Wednesday', 'quality_bike', 'club ride')], 4,
  ).stacksRequired, 2);
  assertEquals(MAX_ACTIVE_DAYS, 6); // six days of work, one full rest day
});

Deno.test('two pins: a rest day already exists, so nothing is asked and nothing is stacked', () => {
  const week = placeLiftingWeek(LIFTS, LONG_DAYS);
  assertEquals(week.resolution.stacksRequired, 0);
  assertEquals(week.slots.some((s) => s.stackedWith), false);
  assertEquals(week.restDays.length >= 1, true);
  assertEquals(week.compromises, []);
});

// ── The AM/PM safeguard ─────────────────────────────────────────────────────

Deno.test('⛔ an unanswered split question is NOT consent — no stack is offered', () => {
  // `canSplitDay` undefined must behave exactly like false. Inferring "yes" from the athlete having
  // accepted a stack is how the app would end up prescribing back-to-back lifting and cardio.
  const pins = [...LONG_DAYS, pin('Tuesday', 'quality_run', 'club run')]; // no canSplitDay
  const week = placeLiftingWeek(LIFTS, pins);
  assertEquals(week.resolution.eligiblePins.length, 0);
  assertEquals(week.resolution.unresolvable, true);
  assertEquals(week.slots.some((s) => s.stackedWith), false);
});

Deno.test('cannot split → the honest arithmetic choice, not an override button', () => {
  const week = placeLiftingWeek(LIFTS, [...LONG_DAYS, pin('Tuesday', 'quality_run', 'club run', false)]);
  const said = week.compromises.join(' ');
  assert(said.includes('7 active days'), 'the arithmetic is not stated');
  assert(said.includes('one lifting day comes out'), 'the choice is not named');
  assert(said.includes(`${MIN_STACK_GAP_H}h apart`), 'the gap requirement is not stated');
});

Deno.test('can split → the stack lands, and it records the six-hour gap', () => {
  const week = placeLiftingWeek(LIFTS, [...LONG_DAYS, pin('Tuesday', 'quality_run', 'club run', true)]);
  assertEquals(week.resolution.unresolvable, false);
  const stacked = week.slots.filter((s) => s.stackedWith);
  assertEquals(stacked.length, 1);
  assertEquals(stacked[0].day, 'Tuesday');
  assertEquals(stacked[0].stackedWith!.gapHours, MIN_STACK_GAP_H);
  assertEquals(week.restDays.length, 1, 'the stack is what buys the rest day back');
});

Deno.test('⛔ the stacked lift is always UPPER — it is the only one that shares no prime movers', () => {
  for (const kind of ['quality_run', 'quality_bike', 'long_run', 'long_ride'] as const) {
    const week = placeLiftingWeek(LIFTS, [...LONG_DAYS, pin('Tuesday', kind, 'fixed session', true)]);
    for (const slot of week.slots.filter((s) => s.stackedWith)) {
      assertEquals(slot.isLower, false, `${kind} stacked a LOWER lift onto a leg-loaded day`);
    }
  }
});

Deno.test('two stacks are assigned when two are required', () => {
  const week = placeLiftingWeek(LIFTS, [
    ...LONG_DAYS,
    pin('Monday', 'quality_run', 'club run', true),
    pin('Wednesday', 'quality_bike', 'club ride', true),
  ]);
  assertEquals(week.resolution.stacksRequired, 2);
  assertEquals(week.slots.filter((s) => s.stackedWith).length, 2);
  assertEquals(week.restDays.length, 1, 'asking once and calling it done would leave no rest day');
});

// ── The clearances, and that they come from the shared law ──────────────────

Deno.test('clearances match SCHEDULING-RULES: 48h long, 24h quality, 0h easy and upper', () => {
  assertEquals(requiredClearanceHours('long_run'), 48);
  assertEquals(requiredClearanceHours('long_ride'), 48);
  assertEquals(requiredClearanceHours('quality_run'), 24);
  assertEquals(requiredClearanceHours('quality_bike'), 24);
  assertEquals(requiredClearanceHours('easy_run'), 0);
  assertEquals(requiredClearanceHours('easy_swim'), 0);
  assertEquals(requiredClearanceHours('upper_body_strength'), 0);
});

Deno.test('heavy legs are held clear of the long days, and apart from each other', () => {
  const week = placeLiftingWeek(LIFTS, LONG_DAYS);
  const lower = week.slots.filter((s) => s.isLower).map((s) => s.day);
  assertEquals(lower.length, 2);
  const idx = (d: string) => ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(d);
  assert(Math.abs(idx(lower[0]) - idx(lower[1])) >= 2, `heavy legs too close: ${lower.join(' + ')}`);
  assertEquals(week.compromises, [], 'a two-pin week should need no compromise at all');
});

Deno.test('a forced clearance breach is NAMED, with both numbers', () => {
  // Tuesday + weekend pins leave nowhere clean for a second lower day. The engine places it and says
  // what it cost — silently producing a worse week is how a scheduler loses trust.
  const week = placeLiftingWeek(LIFTS, [...LONG_DAYS, pin('Tuesday', 'quality_run', 'club run', false)]);
  const breach = week.compromises.find((c) => c.includes('heavy lower-body work'));
  assert(breach, 'a forced breach was swallowed');
  assert(/\d+h from/.test(breach!) && /clearance for that is \d+h/.test(breach!),
    `the breach does not state both numbers: ${breach}`);
});

Deno.test('a pinned day is never overwritten by a lift that was not stacked onto it', () => {
  const pins = [...LONG_DAYS, pin('Wednesday', 'quality_bike', 'club ride', false)];
  const week = placeLiftingWeek(LIFTS, pins);
  for (const slot of week.slots) {
    if (slot.stackedWith) continue;
    assertEquals(pins.some((p) => p.day === slot.day), false,
      `${slot.lift} landed on ${slot.day}, which is pinned, without being a declared stack`);
  }
});

Deno.test('every lift keeps a day — the block never authors a session with nowhere to go', () => {
  const week = placeLiftingWeek(LIFTS, [
    ...LONG_DAYS,
    pin('Monday', 'quality_run', 'club run'),
    pin('Wednesday', 'quality_bike', 'club ride'),
    pin('Friday', 'easy_run', 'standing easy run'),
  ]);
  assertEquals(week.slots.length, 4);
  for (const s of week.slots) assert(s.day, `${s.lift} has no day`);
  assert(week.compromises.length > 0, 'five pins and four lifts must report something');
});
