// ============================================================================
// THE CUES — where a set ends, and why. pp.82, 83, 125.
//
// ⛔ THE PLACEMENT RULING IS MICHAEL'S (2026-08-27): *"you have to pan out to where the user will
// live."* The wizard is seen once before a block starts; the athlete lives on a session. So the
// per-set rule is on every lifting session, and the REASON is on the block, once.
//
// ⛔ SAY IT ONCE, NOT WEEKLY. A reason repeated on every session for twelve weeks is wallpaper —
// which is why these two are separate constants on separate surfaces and this file asserts that
// neither has leaked onto the other's.
//
// Run: deno test --no-check --allow-read --allow-env \
//        supabase/functions/_shared/standing-plan/standing-plan-cues.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts, SET_END_CUE } from './index.ts';
import { buildStandingPlanRow, PAIN_TOLERANCE_NOTE } from './plan-row.ts';
import { PLYO_DOSE } from './frames.ts';
import { FAMILIES } from '../endurance-library/source-rules.ts';
import { FAMILY_LABEL } from './session-vocabulary.ts';
import { voiceViolation } from '../state-trend/week-accent.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
  sportMix: { runs: 4, rides: 0, swimDays: 0, slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } },
  targetRunHours: 4,
  demonstratedWeeklyMinutes: { run: 300 },
} as never;
const week = (n: number, column: 'standard' | 'taper' = 'standard') =>
  composeWeek({ ...BASE, week: n, column } as never) as never as {
    sessions: { name: string; type: string; description: string; tags: string[] }[];
  };

Deno.test('⛔⛔ EVERY LIFTING SESSION SAYS WHERE THE SET ENDS — his words, verbatim', () => {
  /**
   * ⛔ MICHAEL'S OWN SENTENCE, ITERATED THREE TIMES AND FINAL: *"End the set when your form goes or
   * you still have 1 or 2 reps left. Beyond that could mean longer recovery and fewer gains."*
   *
   * ⛔ TWO PAGES IN ONE LINE. p82 separates MUSCULAR failure from TASK failure — *"the inability to
   * complete future reps without form breakdown — think excessive back rounding in a squat, ending
   * the set before your quads fail"* — and both *"are more likely to occur in compound movements"*,
   * which every prescribed row here is. p83 prices going past it: *"muscular damage… is neither
   * necessary for nor conducive to muscular growth. In fact, it can cause recovery to take longer
   * and diminish your capacity to train hard in the near term."*
   *
   * ⛔⛔ AND THE REWRITE THAT MUST NOT COME BACK. An earlier draft read *"stop when you start to feel
   * it"* — a heavy set feels hard from about rep two, so that version ends every set before it does
   * anything. It is asserted absent, not just corrected.
   */
  for (const [wk, column] of [[2, 'standard'], [5, 'standard'], [11, 'taper']] as const) {
    const lifting = week(wk, column).sessions.filter((s) =>
      s.type === 'strength' && !(s.tags ?? []).includes('plyo') && !(s.tags ?? []).includes('test_week'));
    assert(lifting.length > 0, `week ${wk} ${column}: no lifting sessions at all`);
    for (const s of lifting) {
      assertEquals(s.description, SET_END_CUE, `${s.name} does not carry the cue`);
    }
  }
  assertEquals(SET_END_CUE,
    'End the set when your form goes or you still have 1 or 2 reps left. Beyond that could mean '
    + 'longer recovery and fewer gains.');
  assertEquals(/start to feel it/i.test(SET_END_CUE), false, 'the corrected draft is back');
  assertEquals(voiceViolation(SET_END_CUE), null);
});

Deno.test('⛔ THE PLYO DAY AND THE TEST DAY KEEP THEIR OWN INSTRUCTIONS', () => {
  // ⚠️ THE CUE IS FOR PRESCRIBED BARBELL WORK. A plyometric drill's stop rule is p227's — quality,
  // not reps in reserve — and the test day's whole job is a set taken to a clean maximum.
  const plyo = week(2).sessions.find((s) => (s.tags ?? []).includes('plyo'));
  assert(plyo, 'the plyo day vanished');
  assertEquals(plyo!.description, PLYO_DOSE.stopRule);
  const test = week(1).sessions.filter((s) => (s.tags ?? []).includes('test_week'));
  assert(test.length > 0, 'week one has no test sessions');
  for (const s of test) {
    assertEquals(/reps left/.test(s.description), false, `${s.name} took the reps-in-reserve cue`);
  }
});

Deno.test('⛔⛔ THE REASON IS ON THE BLOCK, ONCE — and never on a session', () => {
  /**
   * ⛔ p125, AND IT IS THIS CUSTOMER EXACTLY: *"A higher pain tolerance may be an excellent
   * adaptation for endurance athletes… For strength athletes, however, it may be less clear; a
   * higher tolerance may be of negligible benefit or even counterproductive to longer-term health."*
   * A runner or rider who has trained themselves for years to push through discomfort now has the
   * wrong instinct under a bar.
   *
   * ⚠️ ONCE. Said on every session for twelve weeks it stops being read, which is the whole reason
   * the rule and the reason live on different surfaces.
   */
  const row = buildStandingPlanRow({
    compose: { ...BASE, week: 2, column: 'standard' } as never,
    weeks: 12,
    taperWeeks: [],
  } as never) as { description: string };
  const hits = row.description.split(PAIN_TOLERANCE_NOTE).length - 1;
  assertEquals(hits, 1, `the block reason appears ${hits} times in its own description`);

  for (const s of week(2).sessions) {
    assertEquals(s.description.includes(PAIN_TOLERANCE_NOTE), false,
      `${s.name} repeats the block's reason`);
  }

  /**
   * ⚠️ NO SECOND PERSON, and the block description's gate is stricter than the app-wide one
   * (`standing-plan-live.test.ts`: "The", not "Your"). A first draft read "teaches you to push
   * through discomfort" and was caught there.
   */
  assertEquals(voiceViolation(PAIN_TOLERANCE_NOTE), null);
  assertEquals(/\byou\b|\byour\b/i.test(PAIN_TOLERANCE_NOTE), false);
  // ⛔ AND IT STATES THE PAGE'S OWN CLAIM, not a softened one.
  assert(/negligible benefit/.test(PAIN_TOLERANCE_NOTE));
});

Deno.test('⛔⛔ NO WORD NAMES TWO DIFFERENT SESSIONS — the wizard and the plan agree', () => {
  /**
   * ⛔ THE COLLISION, OFF MICHAEL'S SCREEN (2026-08-27). `source-rules.ts` labelled `run_mlss`
   * "Threshold", so the wizard row read *"Hard session 1 · Run · Threshold"* — while
   * `session-vocabulary.ts` names that family's session **"Hard Run"** and names
   * `run_near_threshold` **"Threshold Run"**. The wizard's word for one session was the plan's word
   * for the other.
   *
   * ⛔ AND IT WAS WRONG ON THE PAGE. p231: MLSS is *"Workouts that emphasize time spent in zone 4"*
   * — the band ABOVE threshold, which is why its own work is prescribed at 100-130%. p233 gives
   * "Near-Threshold" to the family that works at 88-95%.
   *
   * ⚠️ THE PLAN'S TWO SESSION NAMES ARE FINE AND ARE NOT TOUCHED. What moved is the library label.
   */
  assertEquals(FAMILIES.run_mlss.label, 'Above threshold');
  assertEquals(FAMILY_LABEL.run_mlss, 'Hard Run');
  assertEquals(FAMILY_LABEL.run_near_threshold, 'Threshold Run');

  /**
   * ⛔ NO LIBRARY LABEL MAY BE A PLAN SESSION NAME FOR A DIFFERENT FAMILY. That is the shape of the
   * defect, stated once so any future rename trips it rather than repeating it.
   */
  for (const [family, rules] of Object.entries(FAMILIES)) {
    const label = String((rules as { label: string }).label).toLowerCase();
    for (const [other, name] of Object.entries(FAMILY_LABEL)) {
      if (other === family) continue;
      assertEquals(label === String(name).toLowerCase(), false,
        `${family}'s library label "${label}" is ${other}'s session name`);
    }
  }
});
