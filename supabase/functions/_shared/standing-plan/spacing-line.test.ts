/**
 * Today's scheduling sentences — every sentence the day's sessions can produce, and the silences.
 *
 *   ~/.deno/bin/deno test --no-check --no-lock supabase/functions/_shared/standing-plan/spacing-line.test.ts
 *
 * Moved from `src/lib/today-lines.test.ts` with the rule (2026-09-18). One case changed: the frame's upper day
 * beside an easy session no longer says "lift first and keep it easy" (p143 rule 5 is about muscles already worked).
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

// ⛔ p143's own words (2026-09-18, book-language pass 2).
const LEAD = 'Leave at least 6 to 8 hours and one full meal before the resistance training session.';
const SHORT = 'If the morning session is a VT1 session under an hour, 4 to 6 hours may be enough, provided you eat and track hydration after it.';
const EASY = 'Doing low-intensity conditioning after these muscles have been worked may give greater benefits at a given volume.';
const SKILL = 'The skill movements go in the first session because you may be fresher then, but this is not a strict rule.';

Deno.test('one session, two endurance sessions, or a session not from the plan: nothing', () => {
  assertEquals(spacingLineFor([lift([{ slot_intent: 'ME' }])]), null);
  assertEquals(spacingLineFor([ride('vt1_or_easier'), run('vt1_or_easier')]), null);
  assertEquals(spacingLineFor([lift([{ slot_intent: 'SKILL' }]), { type: 'ride', workout_status: 'completed' } as never]), null);
});

Deno.test('lower day with skill or speed sets, easy session: lift first, both sentences, no hours', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('vt1_or_easier')]),
    { lead: `${EASY} ${SKILL}` });
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), { ...run('vt1_or_easier'), duration: 30 }]),
    { lead: `${EASY} ${SKILL}` });
});

Deno.test('lower day with skill or speed sets, hard session: lift first, the skill sentence only', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('above')]), { lead: SKILL });
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), run('near')]), { lead: SKILL });
  // no band counts as not easy
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'SKILL' }]), { type: 'ride', training_plan_id: PLAN, tags: ['sport:ride'] }]),
    { lead: SKILL });
});

Deno.test('lower day with heavy or hypertrophy sets only: easy session lift first, hard session the hours', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'ME' }], 'me'), ride('vt1_or_easier')]), { lead: EASY });
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'ME' }], 'me'), run('above')]), { lead: LEAD });
  assertEquals(spacingLineFor([lift([{ slot_intent: 'HYP' }]), ride('vt1_or_easier')]), { lead: EASY });
  assertEquals(spacingLineFor([lift([{ slot_intent: 'HYP' }]), ride('above')]), { lead: LEAD });
});

Deno.test('⛔ THE FRAME\'S UPPER DAY: the lead only, whatever the session', () => {
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'ME' }, { slot_intent: 'SKILL' }]), run('above')]), { lead: LEAD });
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'SKILL' }]), ride('vt1_or_easier')]), { lead: LEAD });
});

Deno.test('a day with no frame tag (test week, plyometrics) counts as working the legs', () => {
  assertEquals(spacingLineFor([lift([{ slot_intent: 'SKILL' }]), ride('vt1_or_easier')]), { lead: `${EASY} ${SKILL}` });
});

Deno.test('the plyo warm-up day: listed first, so no hours; an easy session keeps its sentence', () => {
  const plyo = lift([], ['standing_plan', 'plyo']);
  assertEquals(spacingLineFor([plyo, run('near')]), null);
  assertEquals(liftGoesFirst([plyo, run('near')]) != null, true);
  assertEquals(spacingLineFor([plyo, ride('vt1_or_easier')]), { lead: EASY });
});

Deno.test('a swim day: the lead only', () => {
  assertEquals(spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), swim()]), { lead: LEAD });
});

Deno.test('⛔ UPPER OR LOWER IS NEVER READ OFF THE NAME', () => {
  const namedUpper = { ...lowerLift([{ slot_intent: 'SKILL' }], 'me'), name: 'Upper body: Push' };
  assertEquals(spacingLineFor([namedUpper, ride('vt1_or_easier')]), { lead: `${EASY} ${SKILL}` });
});

Deno.test('⛔ NO HEADING WITHOUT A PAGE: "If they have to be closer" is gone', () => {
  const out = spacingLineFor([lowerLift([{ slot_intent: 'DE' }]), ride('above')]);
  assertEquals(Object.keys(out ?? {}).sort(), ['lead']);
});

Deno.test('⛔ p143 rule 6: the hours sentence prints exactly when the ride or run is listed first', () => {
  const days = [
    [upperLift([{ slot_intent: 'ME' }]), { ...run('vt1_or_easier'), duration: 30 }],
    [upperLift([{ slot_intent: 'SKILL' }]), ride('above')],
    [lowerLift([{ slot_intent: 'DE' }]), ride('above')],
    [lowerLift([{ slot_intent: 'ME' }], 'me'), run('vt1_or_easier')],
    [lowerLift([{ slot_intent: 'ME' }], 'me'), run('above')],
    [lift([{ slot_intent: 'HYP' }]), ride('above')],
  ];
  for (const d of days) {
    const hours = (spacingLineFor(d)?.lead ?? '').includes('6 to 8 hours');
    assertEquals(hours, liftGoesFirst(d) == null);
  }
});

Deno.test('⛔ p143: a VT1 session under an hour adds the page\'s 4-to-6-hour sentence; an hour or more does not', () => {
  const shortRun = { ...run('vt1_or_easier'), duration: 30 };
  const longRun = { ...run('vt1_or_easier'), duration: 60 };
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'ME' }]), shortRun]), { lead: `${LEAD} ${SHORT}` });
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'ME' }]), longRun]), { lead: LEAD });
  // a hard session under an hour is not a VT1 session
  assertEquals(spacingLineFor([upperLift([{ slot_intent: 'ME' }]), { ...run('above'), duration: 40 }]), { lead: LEAD });
});
