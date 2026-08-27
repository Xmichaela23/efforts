// ============================================================================
// A COMPOUND IN A TOP SET GETS A NUMBER — off the app's own ratio table.
//
// ⛔ THE DEFECT, IN MICHAEL'S OWN SEEDED WEEK (2026-08-27): "W2 Tue: Back Squat 1x1-5 @ 110 | trap
// bar deadlift 1x1-5 @ By feel". **Two top sets on the same day, one prescribed and one by feel**,
// and nobody takes a heavy top set by feel. His words: "they should all get numbers… so lets supply
// the numbers."
//
// ⛔ THE RATIOS ARE THE APP'S, NOT A NEW TABLE. `exercise-config.ts` already carries `primaryRef`
// and `ratio` on every movement; the composer was not reading it.
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
/** ⚠️ HIS OWN SEED — bench 135x8, squat 100x10, deadlift 135x10. */
const WORKING = {
  bench: workingNumberFromTest('bench', { weight: 135, reps: 8 })!,
  squat: workingNumberFromTest('squat', { weight: 100, reps: 10 })!,
  deadlift: workingNumberFromTest('deadlift', { weight: 135, reps: 10 })!,
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
const find = (rows: Row[], name: string) => rows.find((r) => r.name.toLowerCase() === name);
const isTopSet = (r: Row) => /1-5|2-4/.test(String(r.reps));

Deno.test('⛔⛔ NO TOP SET SAYS "By feel" BESIDE ONE THAT CARRIES A NUMBER', () => {
  /**
   * ⛔ THE WHOLE POINT, and the shape of his complaint: on any given lifting day, every ME/DE row
   * that CAN be derived carries a weight. What is left by feel is only what has no same-pattern
   * tested lift (the pulls) or no single-bar number to give (the per-hand work).
   */
  for (const week of [2, 3, 5, 11]) {
    for (const r of rowsFor(week).filter(isTopSet)) {
      if (String(r.weight) !== 'By feel') continue;
      const cfg = resolveExerciseConfig(r.name).config;
      const excusable = !cfg
        || cfg.primaryRef == null
        || cfg.displayFormat === 'perHand'
        || cfg.isUnilateral === true
        || (cfg as { ratioIsTotal?: boolean }).ratioIsTotal === true;
      assert(excusable, `week ${week}: "${r.name}" is a top set at "By feel" with a usable ratio`);
    }
  }
});

Deno.test('⛔ THE NAMED COMPOUNDS CARRY THE CATALOGUE\'S OWN RATIO', () => {
  // ⚠️ ASSERTED AGAINST THE TABLE, not against remembered numbers — a ratio that moves in the
  // catalogue moves the prescription, and this test with it.
  const rows = [...rowsFor(2), ...rowsFor(3)];
  for (const [name, ref] of [['trap bar deadlift', 'deadlift'], ['front squat', 'squat']] as const) {
    const row = find(rows, name);
    assert(row, `${name} never appeared in weeks 2-3`);
    assertEquals(row!.load_basis, 'derived_ratio', `${name} is still by feel`);
    assert(typeof row!.weight === 'number' && (row!.weight as number) > 0, String(row!.weight));
    const cfg = resolveExerciseConfig(name).config!;
    assertEquals(cfg.primaryRef, ref);
    // ⛔ AND IT SAYS SO ON THE ROW. Two steps from anything measured, and p125 warns those estimates
    // carry wider error bars for a hybrid athlete than for a specialist.
    assert(/derived, not tested/.test(String(row!.notes)), String(row!.notes));
    assert(new RegExp(`${Math.round(cfg.ratio * 100)}%`).test(String(row!.notes)), String(row!.notes));
  }
});

Deno.test('⛔⛔ PULL-UPS STAY BY FEEL — the pattern has no tested lift, and this is how it stays out', () => {
  /**
   * ⛔ `LIFT_FOR_PATTERN` maps `pull_upper` to `bench`, and that mapping is what produced
   * "pull up @ 205 lb" in the composer's first smoke run. The gate is that `defaultCompetitionLifts`
   * names no lift for `pull_upper` at all — so the whole PATTERN is excluded by construction rather
   * than by a blocklist of names.
   * ⚠️ Its own tested field is `pullupMaxReps`, a REPS capacity and not a load. It does not solve it.
   */
  for (const week of [2, 3, 5]) {
    for (const r of rowsFor(week).filter((x) => /pull ?up|chin ?up/i.test(x.name))) {
      assertEquals(String(r.weight), 'By feel', `${r.name} was handed a weight in week ${week}`);
      assertEquals(r.load_basis, undefined);
    }
  }
});

Deno.test('⛔ THE GROWTH WORK AND THE PER-HAND WORK STAY BY FEEL', () => {
  /**
   * ⛔ p83 MAKES REPS-IN-RESERVE THE TARGET, so on 3x6-12 the weight is an OUTPUT of the rule rather
   * than an input — the athlete picks the dumbbell that leaves them one or two. It is also how
   * Strong and Hevy behave. A computed number on a 3x10 curl is false precision on work where their
   * judgement is the better input.
   * ⛔⛔ AND A PER-HAND ROW IS EXCLUDED EVEN IN A TOP SET. A dumbbell bench's catalogue ratio is the
   * TOTAL across both hands; printing it on a row that says "90 lb" invites loading 90s — a doubled
   * prescription, worse than no number.
   */
  for (const week of [2, 5]) {
    for (const r of rowsFor(week)) {
      if (r.slot_intent === 'HYP' || r.slot_intent === 'SKILL') {
        assertEquals(r.load_basis, undefined, `${r.name} (${r.slot_intent}) was handed a derived weight`);
      }
      const cfg = resolveExerciseConfig(r.name).config;
      if (cfg?.displayFormat === 'perHand' || cfg?.isUnilateral === true) {
        assertEquals(r.load_basis, undefined, `${r.name} is per-hand and was handed a total`);
        // ⚠️ NOT ASSERTED AS THE STRING "By feel" — a plyometric drill reads "Bodyweight" and is
        // per-hand in the catalogue. What matters is that no NUMBER was prescribed.
        assertEquals(typeof r.weight === 'number', false, `${r.name} is per-hand and carries a number`);
      }
    }
  }
});

Deno.test('⛔ ONE CHAIN — the derived weight tracks the tested lift it came from', () => {
  /**
   * ⚠️ tested set → predicted 1RM → working number (96%) → x the movement's ratio. ⛔ No second path
   * off a stored 1RM; `working-number.ts`'s header exists to keep those apart. Proved by moving the
   * SOURCE lift's test and watching the derived row move with it.
   */
  const heavier = {
    ...WORKING,
    squat: workingNumberFromTest('squat', { weight: 200, reps: 10 })!,
  };
  const rows = (composeWeek({ ...BASE, workingNumbers: heavier, week: 3, column: 'standard' } as never) as never as {
    sessions: { type: string; strength_exercises?: Row[] }[];
  }).sessions.filter((s) => s.type === 'strength').flatMap((s) => s.strength_exercises ?? []);
  const before = find([...rowsFor(3)], 'front squat')!;
  const after = find(rows, 'front squat')!;
  assert((after.weight as number) > (before.weight as number),
    `the front squat did not follow the squat: ${before.weight} → ${after.weight}`);
});
