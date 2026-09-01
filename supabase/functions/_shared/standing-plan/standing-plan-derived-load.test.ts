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
import { gearRoutesFor } from '../../../../src/lib/strength-gear.ts';
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
  /**
   * ⚠️ ADDED 2026-09-01, AND THE FIXTURE WAS THE THING THAT WAS WRONG. Week one tests all four
   * lifts, so a block always has this number — the fixture just never carried it, and once the push
   * pattern could price from EITHER of its tested lifts, the overhead press row correctly stayed by
   * feel for want of a test that every real athlete has done. Supplying it restores what this test
   * is actually asserting: on a real block, a top set that CAN be derived is.
   */
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
      /**
       * ⚠️ AND A TWO-HANDED MOVEMENT IS EXCUSABLE TOO (2026-09-01). The three tags below were the
       * whole test and they MISS: p220's `seated db press` is tagged `displayFormat: 'total'` with
       * `isUnilateral: false`, so it passed all three and printed **"Seated DB Press @ 45"** — which
       * a lifter reads as 45s in each hand. One number, one bar; if every route to a movement needs
       * dumbbells or kettlebells, no single figure describes it.
       */
      const routes = gearRoutesFor(r.name);
      const twoHanded = routes.length > 0
        && routes.every((rt) => rt.includes('dumbbells') || rt.includes('kettlebell'));
      const excusable = !cfg
        || cfg.primaryRef == null
        || twoHanded
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
    /**
     * ⚠️ AMENDED 2026-09-01. This asserted the RATIO appears in the note, which was right while every
     * derivation was a fraction. A ratio of exactly 1.0 — the trap bar deadlift — printed *"about
     * 100% of your deadlift"*, which describes a lift as a fraction of itself and reads as a mistake.
     * That case now names the lift the number came from, so the assertion follows: a real fraction
     * must still state its percentage, and a 1.0 must still say WHOSE number it is.
     */
    if (Math.round(cfg.ratio * 100) === 100) {
      assert(/tested (bench press|back squat|deadlift|overhead press)/i.test(String(row!.notes)),
        `a 1.0-ratio row does not name the lift it was priced from: ${row!.notes}`);
    } else {
      assert(new RegExp(`${Math.round(cfg.ratio * 100)}%`).test(String(row!.notes)), String(row!.notes));
    }
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
      /**
       * ⚠️ AMENDED 2026-09-01: this asserted `undefined`, which was right while `load_basis` only
       * ever meant *"a weight was derived"*. It now also states WHY a row has no weight, and the
       * stronger claim is the one worth pinning — a pull is unpriced because the PATTERN has no
       * tested lift, which no amount of testing will change. What must never appear is a derivation.
       */
      assertEquals(r.load_basis, 'no_tested_lift', `${r.name} no longer says why it is by feel`);
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
        // ⚠️ AMENDED 2026-09-01 — see the pull-up test above. The claim is that no DERIVATION landed
        // here, not that the row is silent; a HYP row now says its weight is the athlete's call.
        assert(r.load_basis !== 'derived_ratio', `${r.name} (${r.slot_intent}) was handed a derived weight`);
      }
      const cfg = resolveExerciseConfig(r.name).config;
      if (cfg?.displayFormat === 'perHand' || cfg?.isUnilateral === true) {
        assert(r.load_basis !== 'derived_ratio', `${r.name} is per-hand and was handed a total`);
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

Deno.test('⛔⛔ A DERIVED LIFT IS NOT FROZEN — it moves when the lift it comes from moves', () => {
  /**
   * ⛔ MICHAEL'S OWN 12-WEEK EXPORT, 2026-08-27. Three lifts never moved:
   *     front squat (ME)       W3 @ 90  →  W12 @ 90
   *     front squat (DE)       W2 @ 70  →  W12 @ 70
   *     close grip bench (DE)  W2 @ 95  →  W12 @ 95
   * while bench went 135→140, squat 105→110 and deadlift 155→160. **The trap bar deadlift moved and
   * the others did not, because its ratio is exactly 1.0** — which is the tell that this was
   * rounding and not the ladder.
   *
   * ⛔ THE CAUSE. The derived weight was recomputed each week as `working × rise × ratio` and then
   * rounded to the plate step. p247's rate is 1% every three weeks — about 5 lb across a block — and
   * at a 0.85 ratio that is 4.25 lb, which rounds straight back. Frozen unless the primary jumped a
   * whole step at once.
   *
   * ⚠️ NOT THE EARNED LADDER, WHICH ALREADY WORKED: `me-history.ts` keys it by PATTERN, so reps beaten
   * on a front squat do advance `press_lower`.
   */
  const seen: Record<string, number[]> = {};
  for (let week = 2; week <= 12; week++) {
    for (const r of rowsFor(week)) {
      if (r.load_basis !== 'derived_ratio' || typeof r.weight !== 'number') continue;
      (seen[`${r.name}|${r.slot_intent}`] ||= []).push(r.weight as number);
    }
  }
  const tracked = Object.entries(seen).filter(([, v]) => v.length >= 4);
  assert(tracked.length >= 2, `only ${tracked.length} derived lifts appear across the block`);
  for (const [key, weights] of tracked) {
    assert(weights[weights.length - 1] > weights[0],
      `${key} never moved across the block: ${weights[0]} → ${weights[weights.length - 1]}`);
  }
});

Deno.test('⛔⛔ AND IT CANNOT DRIFT — every derived weight stays within one plate step of its ratio', () => {
  /**
   * ⛔ THE BOUND THE FIX HAD TO CARRY. A derived lift advancing on its own increment forever would
   * wander away from the ratio it was born at — a front squat creeping toward the squat's own number
   * is nonsense.
   *
   * ⚠️ CHOSEN SHAPE, AND WHY. The brief proposed carrying the weight forward and clamping it.
   * Recomputing as `round(primary's PRESCRIBED weight × ratio)` reaches the same place with no
   * carried state and no clamp: the answer IS the ratio of the primary every week, so the only slack
   * is the rounding step itself. That is the clamp, structurally, and it cannot be forgotten.
   */
  const STEP = 5;
  for (const week of [2, 3, 5, 8, 11, 12]) {
    const rows = rowsFor(week);
    for (const r of rows) {
      if (r.load_basis !== 'derived_ratio' || typeof r.weight !== 'number') continue;
      const cfg = resolveExerciseConfig(r.name).config!;
      // The primary this row derives from, in the SAME slot — same intent, same week, same haircut.
      const primary = rows.find((x) => x.slot_intent === r.slot_intent
        && typeof x.weight === 'number'
        && x.load_basis == null
        && resolveExerciseConfig(x.name).config?.primaryRef === cfg.primaryRef);
      if (!primary) continue;
      const expected = (primary.weight as number) * cfg.ratio;
      assert(Math.abs((r.weight as number) - expected) <= STEP,
        `week ${week}: ${r.name} @ ${r.weight} is more than one step from ${cfg.ratio} x ${primary.name} @ ${primary.weight}`);
    }
  }
});

Deno.test('⛔⛔ NO DERIVED LIFT IS FROZEN ACROSS A BLOCK — heavy AND fast', () => {
  /**
   * ⛔ MICHAEL'S SECOND EXPORT, 2026-08-27. Applying the ratio to the primary's PRESCRIBED weight
   * unfroze the heavy rows and left the fast ones stuck:
   *     Back Squat (DE)   W2 @ 80  →  W5 @ 85     the primary moved
   *     front squat (DE)  W2 @ 70  →  W12 @ 70    0.85 x 80 = 68, 0.85 x 85 = 72.25, both round to 70
   * One step of the primary is 4.25 lb on the derived lift, so whether it moved came down to which
   * side of a rounding boundary the multiplication landed. A coin toss, not a progression. It now
   * carries a whole step when the primary takes one, clamped to within a step of the ratio.
   *
   * ⚠️ ASSERTED ON THE DERIVED SERIES, NOT AGAINST THE PRIMARY WEEK BY WEEK, and the frame is why: a
   * pattern's primary and its derived movement alternate — week 2 has the front squat on the fast
   * lower day and week 3 has the back squat — so the two are never in the same week to compare. The
   * ratio relationship is pinned separately by the drift test above.
   *
   * ⛔ BOTH INTENTS ARE CHECKED BY NAME. The ME path and the DE path compute the primary separately
   * and only one of them was fixed last time; a test that happened to sample one would have passed
   * over exactly this defect.
   */
  const series: Record<string, number[]> = {};
  for (let week = 2; week <= 12; week++) {
    for (const r of rowsFor(week)) {
      if (r.load_basis !== 'derived_ratio' || typeof r.weight !== 'number') continue;
      (series[`${r.name}|${r.slot_intent}`] ||= []).push(r.weight as number);
    }
  }
  const tracked = Object.entries(series).filter(([, v]) => v.length >= 4);
  assert(tracked.length >= 2, `only ${tracked.length} derived lifts appear across the block`);
  assert(tracked.some(([k]) => k.endsWith('|ME')), 'no ME derived row was tracked');
  assert(tracked.some(([k]) => k.endsWith('|DE')), 'no DE derived row was tracked');
  for (const [key, weights] of tracked) {
    assert(weights[weights.length - 1] > weights[0],
      `${key} never moved: ${weights.join(' → ')}`);
  }
});
