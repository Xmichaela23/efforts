/**
 * ⛔ THE CEILING STALL — a light lifter's squat and press go FLAT across a cycle boundary, silently.
 *
 * Reported from a real generated block, 2026-07-28, hours after the 90% ceiling shipped. Two of four
 * lifts printed byte-identical prescriptions in cycles 2 and 3 while the other two advanced normally.
 *
 * ⚠️ THIS IS A BUG-CASE FIXTURE, NOT A TUNING TARGET. The maxes below are a light-lifter profile
 * chosen because it REPRODUCES the report — no decision is gated on them, and the property under test
 * (the ceiling must not flatline a lift without saying so) is true for every athlete.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { applyVerdict, tmCeilingLb } from './loading/wendler-531.ts';

/** Light enough that the training max reaches the ceiling by cycle 2. */
const LIGHT = { bench: 150, squat: 110, deadlift: 150, overheadPress: 100 };

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12,
  oneRepMaxes: LIGHT,
  enduranceSport: 'run',
  enduranceFrequency: 3,
  targetWeeklyMiles: 13,
  easyPaceMinPerMile: 9,
  // Three anchors — the shape the report was generated under.
  blockShape: { continuity: { weeksSince: 2, logs: 40 }, strengthPosture: 'develop' },
});

const ramp = (week: number, lift: string) =>
  (((PLAN.sessions_by_week[String(week)] ?? [])
    .find((x: any) => x.type === 'strength' && x.name.includes(lift))
    ?.strength_exercises?.find((e: any) => e.name === lift)?.set_plan ?? []) as any[])
    .map((p) => `${p.weight}x${p.reps}${p.amrap ? '+' : ''}`).join(' ');

Deno.test('⛔ REPRODUCED: squat and press are IDENTICAL across the cycle 2 → 3 boundary', () => {
  // Every week of cycle 3 matches its cycle-2 counterpart, on both lifts.
  for (const [c2, c3] of [[5, 9], [6, 10], [7, 11]] as const) {
    assertEquals(ramp(c2, 'Back Squat'), ramp(c3, 'Back Squat'), `squat wk${c2} vs wk${c3}`);
    assertEquals(ramp(c2, 'Overhead Press'), ramp(c3, 'Overhead Press'), `press wk${c2} vs wk${c3}`);
  }
  // ⚠️ AND THE CONTROL: the two heavier lifts advance over the same boundary, so this is the ceiling
  // binding on specific lifts — not the whole block failing to progress.
  assert(ramp(5, 'Bench Press') !== ramp(9, 'Bench Press'), 'bench should advance');
  assert(ramp(5, 'Deadlift') !== ramp(9, 'Deadlift'), 'deadlift should advance');
});

Deno.test('the mechanism: the training max reaches the ceiling in cycle 2, so cycle 3 truncates to nothing', () => {
  // ⚠️ THE CEILING ROUNDS DOWN TO THE PLATE GRID, so a 110 lb squat max gives 95, not 99.
  assertEquals(tmCeilingLb(110), 95, 'squat ceiling');
  assertEquals(tmCeilingLb(100), 90, 'press ceiling');
  assertEquals(tmCeilingLb(150), 135, 'bench and deadlift ceiling');

  // Squat: base 90 → 95 (lands ON the ceiling) → nothing left to truncate to.
  const sq2 = applyVerdict(90, 'advance', true, 110);
  assertEquals(sq2, { workingNumber: 95, ceilingHit: false }, 'cycle 2 reaches the ceiling');
  const sq3 = applyVerdict(95, 'advance', true, 110);
  assertEquals(sq3, { workingNumber: 95, ceilingHit: true }, 'cycle 3 holds — and IS flagged');

  // Bench has headroom for both advances.
  assertEquals(applyVerdict(130, 'advance', false, 150).workingNumber, 135);
});

Deno.test('⛔ THE PLAN MUST SAY SO — a flat lift with no stated reason breaks the AMRAP promise', () => {
  // ⛔ THE REASON THIS IS A DEFECT AND NOT JUST A BOUND. Every anchor session tells the athlete
  // "what you get here is what sets the next cycle's weights." For a lift pinned at its ceiling that
  // sentence is FALSE — twelve reps on the week-7 all-out set produce an identical cycle 3.
  //
  // The engine already writes the explanation: `strength-primary-plan.ts` pushes a `cost` note naming
  // the lift, the ceiling and the cycle. This asserts it EXISTS for the stalled lifts and not for the
  // others, so whatever surface renders compromises has something true to render.
  //
  // ⛔ SCOPED TO CEILING NOTES 2026-08-05, AND THE LOOSENESS WAS A REAL DEFECT IN THE TEST. It used
  // to join EVERY note in the channel and grep the blob for a lift name. That channel carries every
  // stated cost the week has — clearances at their minimum, anchors back to back, and now Q-214's
  // press-spacing note, which names both presses by construction. So "Bench Press appears in the
  // notes" stopped meaning "bench carries a ceiling note" the moment any other note mentioned it.
  // The assertion the comment above describes is about CEILING notes; it now reads only those.
  const notes = ((PLAN as any).placement_compromises ?? []) as Array<string | { text?: string }>;
  const CEILING = /90% of the max on file|stop climbing/;
  const text = notes
    .map((n) => (typeof n === 'string' ? n : n?.text ?? ''))
    .filter((t) => CEILING.test(t))
    .join(' | ');
  assert(/Back Squat/.test(text), `no ceiling note for the stalled squat — got: ${text}`);
  assert(/Overhead Press/.test(text), `no ceiling note for the stalled press — got: ${text}`);
  assert(!/Bench Press/.test(text), `bench advanced and must not carry a ceiling note: ${text}`);
});
