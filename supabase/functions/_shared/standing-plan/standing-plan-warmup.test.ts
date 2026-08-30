// ============================================================================
// THE RAMP — pp.139–140, and the invariant that it counts as nothing.
//
//   deno test --allow-read --allow-env --no-check supabase/functions/_shared/standing-plan/standing-plan-warmup.test.ts
//
// ⛔ WHAT THIS FILE IS REALLY GUARDING is not that a ramp appears — it is that adding one did not
// quietly add SETS. `sets` on the row, the earned-set ladder, the rep-band readers and the session
// ceiling are all anchored on the work-set count, and a warm-up that leaked into any of them would
// feed the progression the evidence it is not.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';
import { viadaCategoryOf } from '../strength-grid/index.ts';
import {
  DEFAULT_BAR_LB,
  RAMP_BAR_CUE,
  RAMP_NOTE,
  RAMP_RUNGS_ARE_OURS,
  rampFor,
  slotTakesRamp,
} from './warmup.ts';

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'bench press', press_lower: 'back squat', hinge_lower: 'deadlift' },
  equipment: ['barbell', 'rack', 'bench', 'dumbbells', 'pullup_bar'],
  roundTo: 5,
  workingNumbers: {
    bench: { lift: 'bench', workingNumber: 200, predicted1RM: 208, measured: { weight: 180, reps: 3 }, cite: 'x' },
    squat: { lift: 'squat', workingNumber: 260, predicted1RM: 271, measured: { weight: 240, reps: 3 }, cite: 'x' },
    deadlift: { lift: 'deadlift', workingNumber: 300, predicted1RM: 312, measured: { weight: 275, reps: 3 }, cite: 'x' },
  },
};

function week(extra: Record<string, unknown> = {}) {
  return composeWeek({ ...BASE, week: 3, column: 'standard', ...extra } as never);
}

type Row = { name: string; sets?: number; slot_intent?: string; set_plan?: { weight: number; reps?: number; warmup?: boolean }[] };
function rows(w: ReturnType<typeof composeWeek>): Row[] {
  return w.sessions.flatMap((s) => ((s as { strength_exercises?: Row[] }).strength_exercises ?? []));
}

Deno.test('⛔ THE RAMP CONVERGES ON THE WORK WEIGHT AND STOPS SHORT OF IT — p140', () => {
  /**
   * ⛔ *"The first set of your skill work should also be the last set of your warm-up."* So the ramp
   * ends BELOW the work weight; the work set is the final rung. A rung at or above the work weight
   * would have replaced the set it was preparing for.
   */
  for (const w of [315, 225, 185, 135, 95]) {
    const ramp = rampFor(w, 5);
    assert(ramp.length > 0, `${w} produced no ramp`);
    assert(ramp.every((r) => r.weight < w), `a rung reached the work weight at ${w}`);
    // Ascending, always.
    for (let i = 1; i < ramp.length; i++) {
      assert(ramp[i].weight > ramp[i - 1].weight, `the ramp went backwards at ${w}`);
    }
  }
});

Deno.test('⛔ IT BEGINS UNLOADED, AND THE SPEED IS SAID — p140', () => {
  // *"begin with unloaded, rapid concentric back squats"* — the empty bar, moved fast.
  const ramp = rampFor(225, 5);
  assertEquals(ramp[0].weight, DEFAULT_BAR_LB);
  assertEquals(ramp[0].cue, RAMP_BAR_CUE);
  // ⚠️ AND ONLY THE FIRST RUNG CARRIES IT. Repeated on every rung the instruction stops being read.
  assert(ramp.slice(1).every((r) => r.cue === undefined), 'the bar cue was repeated down the ramp');
});

Deno.test('⛔ NOTHING TO CLIMB PRODUCES NO RAMP, rather than a token one', () => {
  assertEquals(rampFor(DEFAULT_BAR_LB, 5), []);        // already at the bar
  assertEquals(rampFor(40, 5), []);                     // under the bar
  assertEquals(rampFor(null, 5), []);                   // by-feel row, no weight to converge on
  assertEquals(rampFor(0, 5), []);
  // ⚠️ A LIGHT WORK WEIGHT THINS THE RAMP INSTEAD OF PADDING IT — Rule 1's "extremely efficient".
  assert(rampFor(95, 5).length < rampFor(315, 5).length, 'a light lift carried as many rungs as a heavy one');
});

Deno.test('⛔ A RUNG IS A REAL STEP — no single-increment rehearsal of the bar', () => {
  /**
   * ⚠️ MUTATION-TESTED: drop the two-increment gap and 95 lb emits a 50 lb rung — five pounds above
   * the bar, which is the bar again with a note on it.
   */
  for (const w of [65, 95, 135, 225]) {
    const ramp = rampFor(w, 5);
    for (let i = 1; i < ramp.length; i++) {
      assert(ramp[i].weight - ramp[i - 1].weight >= 10, `a 5 lb rung survived at work weight ${w}`);
    }
  }
});

Deno.test('⛔⛔ THE RAMP COUNTS AS NOTHING — `sets` still reports work sets only', () => {
  const priced = rows(week()).filter((r) => (r.set_plan ?? []).some((s) => s.warmup === true));
  assert(priced.length > 0, 'no row carried a ramp at all — the fixture is vacuous');
  for (const r of priced) {
    const work = (r.set_plan ?? []).filter((s) => s.warmup !== true);
    assertEquals(r.sets, work.length, `${r.name} reported ${r.sets} sets against ${work.length} work sets`);
    // ⛔ AND THE RAMP SITS IN FRONT. A warm-up after the work is not a warm-up.
    const firstWork = (r.set_plan ?? []).findIndex((s) => s.warmup !== true);
    assert((r.set_plan ?? []).slice(firstWork).every((s) => s.warmup !== true),
      `${r.name} has a warm-up set after its work sets`);
  }
});

Deno.test('⛔ ONLY THE SLOTS HIS RULE NAMES — a hypertrophy row is its own ramp', () => {
  assert(slotTakesRamp('ME'));
  assert(slotTakesRamp('DE'));
  assert(slotTakesRamp('SKILL'));
  // ⚠️ p218 gives HYP 6-12 reps at 0-2 RIR; the first set of a twelve-rep row warms it up.
  assert(!slotTakesRamp('HYP'));
  assert(!slotTakesRamp(null));
  assert(!slotTakesRamp(undefined));

  for (const r of rows(week())) {
    if (String(r.slot_intent ?? '').toUpperCase() !== 'HYP') continue;
    assert(!(r.set_plan ?? []).some((s) => s.warmup === true), `${r.name} is HYP and carried a ramp`);
  }
});

Deno.test('⛔ A BY-FEEL BLOCK CARRIES NO RAMPS — there is nothing to converge on', () => {
  // Before the test week is read every row is "By feel" with no prescribed weight.
  const unpriced = week({ workingNumbers: undefined });
  assert(!rows(unpriced).some((r) => (r.set_plan ?? []).some((s) => s.warmup === true)),
    'a ramp was built onto a row with no prescribed weight');
});

Deno.test('⛔ THE COPY PASSES THE VOICE CHECK, and the ours-label says what is ours', () => {
  assertEquals(voiceViolation(RAMP_BAR_CUE), null);
  assertEquals(voiceViolation(RAMP_NOTE), null);
  // ⛔ HIS SHAPE, OUR NUMBERS — the label has to say both halves or it is not a label.
  assert(/no percentages/i.test(RAMP_RUNGS_ARE_OURS));
  assert(/ours/i.test(RAMP_RUNGS_ARE_OURS));
});

Deno.test('⛔⛔ RULE 4 — core lands AFTER the main work and BEFORE the isolation work (p142)', () => {
  /**
   * ⛔ *"Many athletes are tempted to perform any core/bracing work last in a routine… This tends to
   * do the core a disservice - isolation work is rarely degraded by a tired core, and core work tends
   * to have a higher skill component than most isolation work."*
   *
   * ⚠️ THE DEFECT THIS PINS, seen on a composed week 2026-08-29: every added row was APPENDED, so a
   * core row landed behind the calf raise — `back squat → trap bar deadlift → bulgarian split squat →
   * weighted single leg calf raise → v up`. That is the routine he describes, built by us.
   */
  const wk = composeWeek({
    ...BASE, week: 3, column: 'standard',
    slotPicks: { core: 'v up' }, accessoryPicks: ['v up'],
  } as never);

  const withCore = wk.sessions
    .map((s) => ((s as { strength_exercises?: { name: string }[] }).strength_exercises ?? []).map((e) => e.name))
    .filter((names) => names.some((n) => /v up/i.test(n)));
  assert(withCore.length > 0, 'the core pick never reached the week — the fixture is vacuous');

  for (const names of withCore) {
    const core = names.findIndex((n) => /v up/i.test(n));
    const firstIso = names.findIndex((n) => viadaCategoryOf(n) === 'focused');
    // ⛔ NOT LAST. If there is isolation work in the session, core comes before it.
    if (firstIso >= 0) {
      assert(core < firstIso,
        `core sits at ${core} and the first isolation row at ${firstIso}: ${names.join(' → ')}`);
    }
    // ⛔ AND NOT FIRST EITHER — "but after the main work".
    assert(core > 0, `core opened the session: ${names.join(' → ')}`);
  }
});
