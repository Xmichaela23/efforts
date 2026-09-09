// ============================================================================
// NO LIFT IS PRICED OFF ANOTHER LIFT — the gate on the ratios, 2026-09-09.
//
// ⛔⛔ THIS FILE IS THE INVERSE OF WHAT IT WAS, AND THE HISTORY MATTERS.
//
// From 2026-08-27 to 2026-09-09 it pinned the opposite claim: that a compound in a top set gets a
// number off the app's ratio table — a front squat at 0.85 of the tested squat, a barbell row at
// 80% of the tested bench. Michael's complaint was real ("two top sets on the same day, one
// prescribed and one by feel"), and the answer to it was ours: **no page in the corpus relates one
// lift's max to another lift's.** p214 requires a tested max ON THE LIFT for a percentage; p218
// prescribes a row without one by its reps and its reserve instead.
//
// ⛔ WORKORDER-de-row-by-feel-2026-09-09. Michael: *"never use ours"*, and *"kill the bb row test —
// go by feel and no pull up test."* Both derivation arms were deleted, cross-pattern and
// same-pattern, along with `load_basis: 'derived_ratio'` and the note that explained it.
//
// ⚠️ WHAT STILL CARRIES A NUMBER, and this file pins it: a row whose movement **is** one of the
// tested lifts, reading that lift's own working number at p218's band.
//
// Run: deno test --no-check --allow-read --allow-env \
//        supabase/functions/_shared/standing-plan/standing-plan-derived-load.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts, workingNumberFromTest } from './index.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
/** ⚠️ HIS OWN SEED — bench 135x8, squat 100x10, deadlift 135x10, press 95x8. */
const WORKING = {
  bench: workingNumberFromTest('bench', { weight: 135, reps: 8 })!,
  squat: workingNumberFromTest('squat', { weight: 100, reps: 10 })!,
  deadlift: workingNumberFromTest('deadlift', { weight: 135, reps: 10 })!,
  overheadPress: workingNumberFromTest('overheadPress', { weight: 95, reps: 8 })!,
};
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  workingNumbers: WORKING,
  seed1RMs: { bench: 135, squat: 100, deadlift: 135, overheadPress: 95 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
  sportMix: { runs: 4, rides: 0, swimDays: 0, slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } },
  targetRunHours: 4,
  demonstratedWeeklyMinutes: { run: 300 },
} as never;

type Row = { name: string; reps: string; weight: unknown; load_prescribed?: boolean; load_basis?: string; notes?: string; slot_intent?: string };
const rowsFor = (week: number): Row[] => (composeWeek({ ...BASE, week, column: 'standard' } as never) as never as {
  sessions: { type: string; strength_exercises?: Row[] }[];
}).sessions.filter((s) => s.type === 'strength').flatMap((s) => s.strength_exercises ?? []);
const isTopSet = (r: Row) => /1-5|2-4/.test(String(r.reps));
/** The four the athlete tested, lower-cased the way the rows carry them. */
const TESTED = new Set(Object.values(defaultCompetitionLifts())
  .filter((v): v is string => typeof v === 'string' && v.length > 0)
  .map((v) => v.toLowerCase()));

Deno.test('⛔⛔ NO ROW IS PRICED OFF A LIFT THAT IS NOT ITSELF', () => {
  /**
   * ⛔ THE WHOLE ORDER, AS ONE ASSERTION. A weight on a strength row may come from exactly one
   * place: that movement's own tested max. Any other number is a ratio between two lifts, and no
   * page gives one.
   * ⚠️ HYP AND SKILL ROWS CARRY NO NUMBER AT ALL (p218 gives HYP no load), so this sweeps every
   * intent rather than only the top sets — a derivation leaking onto an accessory is the same fault.
   */
  for (const week of [2, 3, 5, 8, 11, 12]) {
    for (const r of rowsFor(week)) {
      if (typeof r.weight !== 'number') continue;
      assert(TESTED.has(String(r.name).toLowerCase()),
        `week ${week}: "${r.name}" carries ${r.weight} and is not one of the tested lifts — `
        + 'something is pricing it off another lift');
    }
  }
});

Deno.test('⛔ `derived_ratio` AND ITS NOTE ARE GONE FROM EVERY ROW OF EVERY WEEK', () => {
  // ⚠️ THE MARKER AND THE SENTENCE ARE CHECKED SEPARATELY. They were written by the same block and
  // could be reintroduced apart — a weight with no marker is the worse of the two.
  for (let week = 1; week <= 12; week++) {
    for (const r of rowsFor(week)) {
      assert(r.load_basis !== 'derived_ratio', `week ${week}: ${r.name} still says derived_ratio`);
      assert(!/derived, not tested/i.test(String(r.notes ?? '')),
        `week ${week}: ${r.name} still carries the derivation note: ${r.notes}`);
    }
  }
});

Deno.test('⛔ THE NAMED COMPOUNDS ARE BY FEEL — trap bar deadlift, front squat, close grip bench', () => {
  /**
   * ⛔ THE THREE THE OLD BLOCK PRICED, BY NAME. Each has a `primaryRef` and a `ratio` in the
   * catalogue and each used to read a number off it. The catalogue entries are untouched — display
   * format and swap logic still use them — and nothing prices off them.
   * ⚠️ ASSERTED ONLY WHERE THE MOVEMENT ACTUALLY APPEARS. Which cells a frame fills depends on the
   * kit and the week; a name that never lands is not a failure of this rule.
   */
  let seen = 0;
  for (const week of [2, 3, 5, 8, 11]) {
    for (const r of rowsFor(week)) {
      const n = String(r.name).toLowerCase();
      if (!['trap bar deadlift', 'front squat', 'close grip bench press', 'barbell row'].includes(n)) continue;
      seen += 1;
      assertEquals(String(r.weight), 'By feel', `week ${week}: ${r.name} was handed ${r.weight}`);
      assertEquals(r.load_prescribed, false, `week ${week}: ${r.name} claims a prescribed load`);
      const cfg = resolveExerciseConfig(n).config;
      assert(cfg?.primaryRef != null, `${n} lost its catalogue entry — the ratio table must stay`);
    }
  }
  assert(seen > 0, 'none of the named compounds appeared in the sampled weeks');
});

Deno.test('⛔⛔ A TESTED LIFT STILL CARRIES ITS OWN NUMBER — the change is not "everything by feel"', () => {
  /**
   * ⛔ THE OTHER HALF OF THE ORDER, and the one a careless deletion would have taken with it. p218's
   * bands apply to the lift's OWN max: an ME bench at 90% of the bench working number, a DE bench at
   * 70%. Only the ratio BETWEEN lifts is gone.
   */
  const priced = [2, 3, 5].flatMap((w) => rowsFor(w))
    .filter((r) => typeof r.weight === 'number' && isTopSet(r));
  assert(priced.length >= 3, `only ${priced.length} top sets carry a number — the tested lifts lost theirs`);
  for (const r of priced) {
    // ⚠️ `load_prescribed` IS ABSENT ON A PRICED ROW, NOT `true` — the composer stamps the flag only
    // to say NO. Absent has meant prescribed since the field was added; asserting `true` here would
    // pin a shape the composer has never emitted.
    assert(r.load_prescribed !== false, `${r.name} carries a number and denies it is prescribed`);
    assertEquals(r.load_basis, undefined, `${r.name} carries a number AND a by-feel reason`);
  }
});

Deno.test('⛔⛔ PULL-UPS STAY BY FEEL — the pattern has no tested lift, and no ratio can reach it now', () => {
  /**
   * ⛔ `LIFT_FOR_PATTERN` maps `pull_upper` to `bench`, and that mapping is what produced
   * "pull up @ 205 lb" in the composer's first smoke run. Two gates used to stand between them;
   * one — the cross-pattern derivation added 2026-09-03 — was itself the thing that later put a
   * Barbell Row at 80% of a bench. With no derivation at all the pattern cannot be reached.
   */
  for (const week of [2, 3, 5]) {
    for (const r of rowsFor(week).filter((x) => /pull ?up|chin ?up/i.test(x.name))) {
      assertEquals(String(r.weight), 'By feel', `${r.name} was handed a weight in week ${week}`);
      assertEquals(r.load_basis, 'no_tested_lift', `${r.name} no longer says why it is by feel`);
    }
  }
});

Deno.test('⛔ A BY-FEEL ROW NEVER LIES ABOUT WHY, AND MAY SAY NOTHING', () => {
  /**
   * ⛔⛔ THE FIFTH SHAPE, CREATED BY THIS ORDER AND DELIBERATELY SILENT. A row that is not a tested
   * lift, is not per-side, and sits on a pattern that DOES have a tested lift fits none of the four
   * sentences: `awaiting_test` would promise a number that is never coming, and `no_tested_lift`
   * would be false about the pattern. **Writing a fifth sentence is a new athlete-facing line and
   * needs Michael's yes**, so the row says nothing until it has one.
   * ⚠️ WHAT IS PINNED IS THE LIE, NOT THE SILENCE: `awaiting_test` may appear only on a row that IS
   * a tested lift.
   */
  for (const week of [2, 3, 5, 11]) {
    for (const r of rowsFor(week)) {
      if (r.load_basis !== 'awaiting_test') continue;
      assert(TESTED.has(String(r.name).toLowerCase()),
        `week ${week}: "${r.name}" promises a weight after a test that will never price it`);
    }
  }
});
