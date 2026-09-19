/**
 * Today's (i) note — every note the day's sessions can produce, and the silences.
 *
 *   ~/.deno/bin/deno test --no-check --no-lock supabase/functions/_shared/standing-plan/spacing-line.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { liftGoesFirst, spacingLineFor } from './spacing-line.ts';

const PLAN = 'plan-1';
const lift = (rows: unknown[], tags: string[] = ['standing_plan']) => ({
  type: 'strength', training_plan_id: PLAN, tags, strength_exercises: rows,
});
const upperLift = (rows: unknown[]) => lift(rows, ['standing_plan', 'frame:all_rounder', 'column:standard']);
const lowerLift = (rows: unknown[], which = 'de') => lift(rows, ['standing_plan', 'frame:all_rounder', `lower:${which}`]);
const ride = (band: string) => ({ type: 'ride', training_plan_id: PLAN, tags: ['standing_plan', 'sport:ride', `band:${band}`] });
const run = (band: string) => ({ type: 'run', training_plan_id: PLAN, tags: ['standing_plan', 'sport:run', `band:${band}`] });
const swim = () => ({ type: 'swim', training_plan_id: PLAN, tags: ['sport:swim'] });

// ⛔ Michael's approved words (2026-09-19).
const HARD_RUN = "If the run goes first, leave 6 to 8 hours before the lift. If you can't leave that long, shorten the run.";
const HARD_RIDE = "If the ride goes first, leave 6 to 8 hours before the lift. If you can't leave that long, shorten the ride.";
const EASY_RUN = 'If the run goes first, leave 6 to 8 hours before the lift. 4 to 6 hours is enough if the run is under an hour.';
const EASY_RIDE = 'If the ride goes first, leave 6 to 8 hours before the lift. 4 to 6 hours is enough if the ride is under an hour.';
const UPPER = 'Either order works.';

Deno.test('one session, two endurance sessions, or a session not from the plan: nothing', () => {
  assertEquals(spacingLineFor([lift([{ slot_intent: 'ME' }])]), null);
  assertEquals(spacingLineFor([ride('vt1_or_easier'), run('vt1_or_easier')]), null);
  assertEquals(spacingLineFor([lift([{ slot_intent: 'SKILL' }]), { type: 'ride', workout_status: 'completed' } as never]), null);
});

Deno.test('leg day, hard run or ride: the hard note, lift listed first', () => {
  for (const l of [lowerLift([{ slot_intent: 'DE' }]), lowerLift([{ slot_intent: 'ME' }], 'me'), lift([{ slot_intent: 'HYP' }])]) {
    assertEquals(spacingLineFor([l, run('above')]), { note: HARD_RUN });
    assertEquals(spacingLineFor([l, ride('above')]), { note: HARD_RIDE });
    assertEquals(liftGoesFirst([run('above'), l]) != null, true);
  }
  // no band counts as hard
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), { type: 'ride', training_plan_id: PLAN, tags: ['sport:ride'] }]),
    { note: HARD_RIDE });
});

Deno.test('leg day, easy run or ride: the easy note, lift listed first', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'ME' }], 'me'), run('vt1_or_easier')]), { note: EASY_RUN });
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('vt1_or_easier')]), { note: EASY_RIDE });
  assertEquals(liftGoesFirst([ride('vt1_or_easier'), lowerLift([{ slot_intent: 'DE' }])]) != null, true);
});

Deno.test('the frame\'s upper day: "Either order works.", and the order is left to the tie-break', () => {
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'ME' }]), run('above')]), { note: UPPER });
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'SKILL' }]), ride('vt1_or_easier')]), { note: UPPER });
  assertEquals(liftGoesFirst([upperLift([{ slot_intent: 'ME' }]), run('above')]), null);
});

Deno.test('the plyo warm-up day: listed first, no note', () => {
  const plyo = lift([], ['standing_plan', 'plyo']);
  assertEquals(spacingLineFor([plyo, run('near')]), null);
  assertEquals(spacingLineFor([plyo, run('vt1_or_easier')]), null);
  assertEquals(liftGoesFirst([plyo, run('near')]) != null, true);
});

Deno.test('a swim day: no note, no order', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), swim()]), null);
  assertEquals(liftGoesFirst([lowerLift([{ slot_intent: 'DE' }]), swim()]), null);
});

Deno.test('⛔ UPPER OR LOWER IS NEVER READ OFF THE NAME', () => {
  const namedUpper = { ...lowerLift([{ slot_intent: 'SKILL' }], 'me'), name: 'Upper body: Push' };
  assertEquals(spacingLineFor([namedUpper, ride('vt1_or_easier')]), { note: EASY_RIDE });
});

Deno.test('⛔ no food in any note', () => {
  const days = [
    [upperLift([{ slot_intent: 'ME' }]), run('vt1_or_easier')],
    [lowerLift([{ slot_intent: 'DE' }]), ride('above')],
    [lowerLift([{ slot_intent: 'ME' }], 'me'), run('vt1_or_easier')],
  ];
  for (const d of days) assertEquals(/meal|eat|hydrat|calor/i.test(spacingLineFor(d)?.note ?? ''), false);
});
