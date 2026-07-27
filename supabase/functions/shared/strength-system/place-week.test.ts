/**
 * PLACING THE LIFTING WEEK AROUND THE ENDURANCE ABSOLUTES.
 *
 * The two rules these pin, because both were arrived at by correcting an earlier wrong answer:
 *   1. The stacked lift is always UPPER. Not a courtesy — pressing does not share prime movers with
 *      running legs, so it is the only lift that costs nothing beside a hard endurance session.
 *   2. Because of (1), the stack needs NO GAP and NO PERMISSION. Robineau 2016's six-hour floor came
 *      from loading the same legs twice, and it governs that pair only. ⛔ Applying it to a bench
 *      press beside a bike ride made the engine declare solvable weeks unsolvable — corrected
 *      2026-07-27. The floor survives, scoped, for stacks that genuinely compete.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type EndurancePin,
  MAX_ACTIVE_DAYS,
  MIN_STACK_GAP_H,
  placeLiftingWeek,
  requiredClearanceHours,
  resolveStacking,
  stackGapHours,
} from './place-week.ts';
import { stackNeedsRecoveryGap } from '../../_shared/schedule-session-constraints.ts';

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

Deno.test('a free stack is NOT gated on the split question — it lands at 0h, one block, lift first', () => {
  // ⛔ REVERSED 2026-07-27. This test used to assert the opposite: no canSplitDay, no stack, week
  // unresolvable. That was Robineau's six-hour floor applied to a pair Robineau never tested. He
  // loaded THE SAME LEGS twice; a bench press beside a bike ride shares no prime movers, which is the
  // identical argument this module already makes for why the stacked lift is always upper. The gate
  // was refusing weeks that fit.
  const pins = [...LONG_DAYS, pin('Tuesday', 'quality_run', 'club run')]; // no canSplitDay
  const week = placeLiftingWeek(LIFTS, pins);
  assertEquals(week.resolution.unresolvable, false);
  const stacked = week.slots.filter((s) => s.stackedWith);
  assertEquals(stacked.length, 1, 'the stack that buys the rest day back must still be offered');
  assertEquals(stacked[0].isLower, false, 'only an upper lift may ever stack');
  assertEquals(stacked[0].stackedWith!.gapHours, 0, 'no gap is needed when nothing competes');
  assertEquals(week.restDays.length, 1);
});

Deno.test('the arithmetic choice still fires when there are not enough UPPER lifts to absorb the stacks', () => {
  // The ceiling moved. It used to be "how many days can you split"; it is now "how many upper lifts
  // are there", because only an upper lift may stack. Five pins and four lifts is nine sessions —
  // three stacks needed, two uppers available. That is a real refusal and the athlete owns it.
  const week = placeLiftingWeek(LIFTS, [
    ...LONG_DAYS,
    pin('Tuesday', 'quality_run', 'club run'),
    pin('Wednesday', 'quality_bike', 'club ride'),
    pin('Thursday', 'easy_swim', 'masters swim'),
  ]);
  assertEquals(week.resolution.unresolvable, true);
  const said = week.compromises.join(' ');
  assert(said.includes('9 active days'), `the arithmetic is not stated: ${said}`);
  assert(said.includes('one lifting day comes out'), 'the choice is not named');
});

Deno.test('a COMPETING stack still demands the six hours — the safeguard is scoped, not deleted', () => {
  // Lower body beside a leg-loaded endurance session is exactly what Robineau tested, and it keeps
  // the floor. This asserts the law directly, because place-week only ever stacks upper lifts.
  assertEquals(stackNeedsRecoveryGap('long_ride', 'lower_body_strength'), true);
  assertEquals(stackNeedsRecoveryGap('quality_run', 'lower_body_strength'), true);
  assertEquals(stackNeedsRecoveryGap('long_ride', 'upper_body_strength'), false);
  assertEquals(stackNeedsRecoveryGap('easy_swim', 'lower_body_strength'), false);
  // And the gap the engine would report for each.
  assertEquals(stackGapHours(pin('Saturday', 'long_ride', 'long ride'), true), MIN_STACK_GAP_H);
  assertEquals(stackGapHours(pin('Saturday', 'long_ride', 'long ride'), false), 0);
});

Deno.test('can split → the stack is UPGRADED to a real six-hour gap', () => {
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

Deno.test('clearances match SCHEDULING-RULES: 48h long run, 24h quality, 0h long ride, easy and upper', () => {
  assertEquals(requiredClearanceHours('long_run'), 48);
  // 2026-07-27: long_ride dropped from 48h to 0h. The matrix has said `lower_body_strength ×
  // long_ride = ✓` since 2026-05-12 (STRENGTH-PROTOCOL §6.1.2 — bike first, 6h gap, no shared
  // eccentric load), and a 48h clearance on a session the law lets you do SAME DAY was a
  // contradiction, not a stricter rule. Long run keeps 48h; that one is eccentric.
  assertEquals(requiredClearanceHours('long_ride'), 0);
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
  // Four pins leave Monday, Friday and Saturday open, and only Friday clears the Sunday long run by
  // 48h. The second heavy day has to breach. The engine places it and says what it cost — silently
  // producing a worse week is how a scheduler loses trust.
  //
  // This used to be a Saturday-long-ride week. It stopped forcing anything on 2026-07-27 when
  // long_ride's clearance went to 0h, which is the correct answer — a long ride no longer costs the
  // lifting week a day. The breach mechanism still needs a case, so the long RUN provides it.
  const week = placeLiftingWeek(
    [{ lift: 'Back Squat', isLower: true }, { lift: 'Deadlift', isLower: true }],
    [
      pin('Sunday', 'long_run', 'long run', false),
      pin('Tuesday', 'quality_run', 'club run', false),
      pin('Wednesday', 'quality_bike', 'club ride', false),
      pin('Thursday', 'easy_run', 'shakeout', false),
    ],
  );
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
