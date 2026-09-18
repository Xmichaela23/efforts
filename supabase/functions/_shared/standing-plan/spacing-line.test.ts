/**
 * Today's scheduling sentences — every sentence the day's sessions can produce, and the silences.
 *
 *   ~/.deno/bin/deno test --no-check --no-lock supabase/functions/_shared/standing-plan/spacing-line.test.ts
 *
 * Moved from `src/lib/today-lines.test.ts` with the rule (2026-09-18). One case changed: the frame's upper day
 * beside an easy session no longer says "lift first and keep it easy" (p143 rule 5 is about muscles already worked).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spacingLineFor } from './spacing-line.ts';

const PLAN = 'plan-1';
const lift = (rows: unknown[], tags: string[] = ['standing_plan']) => ({
  type: 'strength', training_plan_id: PLAN, tags, strength_exercises: rows,
});
const upperLift = (rows: unknown[]) => lift(rows, ['standing_plan', 'frame:all_rounder', 'column:standard']);
const lowerLift = (rows: unknown[], which = 'de') => lift(rows, ['standing_plan', 'frame:all_rounder', `lower:${which}`]);
const ride = (band: string) => ({ type: 'ride', training_plan_id: PLAN, tags: ['standing_plan', 'sport:ride', `band:${band}`] });
const run = (band: string) => ({ type: 'run', training_plan_id: PLAN, tags: ['standing_plan', 'sport:run', `band:${band}`] });
const swim = () => ({ type: 'swim', training_plan_id: PLAN, tags: ['sport:swim'] });

const LEAD = 'Two sessions today. Keep them six to eight hours apart.';

Deno.test('one session, two endurance sessions, or a session not from the plan: nothing', () => {
  assertEquals(spacingLineFor([lift([{ slot_intent: 'ME' }])]), null);
  assertEquals(spacingLineFor([ride('vt1_or_easier'), run('vt1_or_easier')]), null);
  assertEquals(spacingLineFor([lift([{ slot_intent: 'SKILL' }]), { type: 'ride', workout_status: 'completed' } as never]), null);
});

Deno.test('lower day with skill or speed sets, easy session: both halves', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('vt1_or_easier')]),
    { lead: LEAD, closer: 'Lift first and keep the ride easy. Riding first costs the lift its skill and speed sets.' });
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), run('vt1_or_easier')])?.closer,
    'Lift first and keep the run easy. Running first costs the lift its skill and speed sets.');
});

Deno.test('lower day with skill or speed sets, hard session: the order and its cost', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('above')])?.closer,
    'Lift first. Riding first costs the lift its skill and speed sets.');
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), run('near')])?.closer,
    'Lift first. Running first costs the lift its skill and speed sets.');
  // no band counts as not easy
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), { type: 'ride', training_plan_id: PLAN, tags: ['sport:ride'] }])?.closer,
    'Lift first. Riding first costs the lift its skill and speed sets.');
});

Deno.test('lower day with heavy or hypertrophy sets only: the easy half, or nothing', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'ME' }], 'me'), ride('vt1_or_easier')])?.closer, 'Lift first and keep the ride easy.');
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'ME' }], 'me'), run('above')]), { lead: LEAD });
  assertEquals(spacingLineFor([lift([{ slot_intent: 'HYP' }]), ride('vt1_or_easier')])?.closer, 'Lift first and keep the ride easy.');
  assertEquals(spacingLineFor([lift([{ slot_intent: 'HYP' }]), ride('above')]), { lead: LEAD });
});

Deno.test('⛔ THE FRAME\'S UPPER DAY: the lead only, whatever the session', () => {
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'ME' }, { slot_intent: 'SKILL' }]), run('above')]), { lead: LEAD });
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'SKILL' }]), ride('vt1_or_easier')]), { lead: LEAD });
});

Deno.test('a day with no frame tag (test week, plyometrics) counts as working the legs', () => {
  assertEquals(spacingLineFor([lift([{ slot_intent: 'SKILL' }]), ride('vt1_or_easier')])?.closer,
    'Lift first and keep the ride easy. Riding first costs the lift its skill and speed sets.');
});

Deno.test('a swim day: the lead only', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), swim()]), { lead: LEAD });
});

Deno.test('⛔ UPPER OR LOWER IS NEVER READ OFF THE NAME', () => {
  const namedUpper = { ...lowerLift([{ slot_intent: 'SKILL' }], 'me'), name: 'Upper body: Push' };
  assertEquals(spacingLineFor([namedUpper, ride('vt1_or_easier')])?.closer,
    'Lift first and keep the ride easy. Riding first costs the lift its skill and speed sets.');
});

Deno.test('⛔ NO HEADING WITHOUT A PAGE: "If they have to be closer" is gone', () => {
  const out = spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('above')]);
  assertEquals(Object.keys(out ?? {}).sort(), ['closer', 'lead']);
});
