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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SLICE 4a (2026-08-12) — THE CEILING LEAVES THE BUILDER AS DATA, NOT ONLY AS A SENTENCE.
//
// ⛔ THE HALF OF THE STALL THAT WAS ACTUALLY FIXABLE TODAY. The three tests above pin the defect and
// its prose note, and that note was ALL there was: `placement_compromises` never reaches the database
// (`generate-strength-plan/index.ts` writes `plans.config` and did not carry it), so the ceiling fact
// was computed at build time, spoken once inside `description`, and thrown away. Nothing downstream
// could act on it.
//
// ⚠️ A PINNED LIFT IS A CALIBRATION QUESTION, NOT A TRAINING ONE — "is 100 lb still your press max?"
// The signal below is what the retest/raise offer reads. The prose stays for today's renderer.
//
// ⛔ WHAT THIS DOES *NOT* DO, AND THE REASON IS EQUIPMENT, NOT EFFORT: it does not make the pinned
// lift climb. That needs a finer step than 5 lb, which Wendler blesses (p29: *"a 2.5 pound increase
// for the bench and military press… provided you have access to 1.25 pound plates"*) and which this
// app cannot know — plate inventory is not captured anywhere, and was explicitly abandoned
// (`docs/BUILD-ORDER-strength-spine.md:292`). Squats cannot be helped by granularity at all: p29's
// finer LOWER-body step is 5 lb, which the increment cap already produces.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ SLICE 4a: every pinned lift leaves the builder as a structured calibration signal', () => {
  const cal = (PLAN as any).strength_calibration as Array<{
    lift: string; reason: string; at_cycle: number; total_cycles: number; one_rm: number;
  }> | undefined;

  assert(Array.isArray(cal) && cal.length > 0, 'the ceiling must leave the builder as data');
  const byLift = new Map(cal!.map((c) => [c.lift, c]));

  // Both lifts that go flat are named — including the SQUAT, which no increment change can rescue.
  for (const lift of ['Back Squat', 'Overhead Press']) {
    const c = byLift.get(lift);
    assert(c, `${lift} pinned and must carry a calibration signal`);
    assertEquals(c!.reason, 'ceiling');
    assert(c!.at_cycle >= 2 && c!.at_cycle <= c!.total_cycles, `${lift} cycle ${c!.at_cycle} of ${c!.total_cycles}`);
  }
  // The max on file is carried, because it is the number a retest would replace.
  assertEquals(byLift.get('Overhead Press')!.one_rm, LIGHT.overheadPress);
  assertEquals(byLift.get('Back Squat')!.one_rm, LIGHT.squat);

  // A lift with headroom is NOT a calibration case — the signal must not fire on a healthy lift.
  assertEquals(byLift.has('Bench Press'), false);
  assertEquals(byLift.has('Deadlift'), false);
});

Deno.test('SLICE 4a: the structured signal and the prose note cannot disagree about who pinned', () => {
  // Both are built from the same `ceilingHits`; this pins that they stay in step, because the note is
  // what the athlete reads and the signal is what the offer acts on.
  const cal = ((PLAN as any).strength_calibration ?? []) as Array<{ lift: string }>;
  const notes = ((PLAN as any).placement_compromises ?? []) as Array<{ kind?: string; text?: string }>;
  const ceilingText = notes.filter((n) => n?.kind === 'ceiling').map((n) => n?.text ?? '').join(' | ');
  for (const c of cal) {
    assert(ceilingText.includes(c.lift), `${c.lift} has a signal but is missing from the note: ${ceilingText}`);
  }
});

Deno.test('SLICE 4a: a block where nothing pins carries NO signal (absent, never an empty array)', () => {
  // ⛔ NOTE WHAT IT TAKES TO GET HERE, BECAUSE IT IS THE REAL FINDING. The growth band is 5% of the
  // max (85% → 90%) and the upper-body step is 5 lb, so clearing two steps needs a band of 10 lb —
  // i.e. **an overhead press max of 200 lb or more**. Below that the press pins by cycle 3 for
  // EVERY athlete, not just a light one: a 165 lb press (Wendler's own book lifter presses 165)
  // still goes flat. The press below is 220 purely to produce a no-pin block for this assertion.
  const heavy = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: 250, squat: 350, deadlift: 400, overheadPress: 220 },
    enduranceSport: 'run',
    enduranceFrequency: 3,
    targetWeeklyMiles: 13,
    easyPaceMinPerMile: 9,
    blockShape: { continuity: { weeksSince: 2, logs: 40 }, strengthPosture: 'develop' },
  });
  assertEquals((heavy as any).strength_calibration, undefined);
});
