// ============================================================================
// THE GATE — stage 4, slice 2: the edge wiring and the test week.
//
// ⚠️ EVERY ASSERTION HERE WAS MUTATION-TESTED — the code it covers was broken and the test confirmed
// to fail on the intended break. The mutations are listed in
// `docs/NOTES-stage4-wiring-slice2-2026-08-23.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ADVANCED_TIER_MIN_WEEKLY_MILES,
  buildStandingPlanRow,
  composeBlock,
  defaultCompetitionLifts,
  DEMONSTRATED_WINDOW_DAYS,
  demonstratedRunVolume,
  PATTERN_FOR_TESTED_LIFT,
  readTestWeek,
  resolveFrame,
  restateFromTest,
  STANDING_PLAN_PROTOCOL_ID,
  TESTED_LIFT_NAME,
  TEST_WEEK_INDEX,
  testWeekLiftNames,
  weekdayOf,
  WORKING_MAX_FRACTION,
  workingNumberFromTest,
  type PlanSession,
  type TestedLift,
} from './index.ts';
import { normalizePhaseKey, PROTOCOL_PROFILES } from '../strength-profiles.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};

const SEED = { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 };

const ROW_ARGS = {
  compose: {
    frame: 'strength_5k' as const,
    competitionLifts: defaultCompetitionLifts(),
    workingNumbers: undefined,
    seed1RMs: SEED,
    baselines: BASELINES,
    equipment: ['Commercial gym'],
    demonstratedWeeklyMiles: null,
    roundTo: 5,
  },
  weeks: 12,
  taperWeeks: [] as number[],
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — THE FORK: WHO GETS THE STANDING PLAN, AND WHO KEEPS GET STRONGER
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a strength-leading runner resolves the frame; a position with no frame keeps Get Stronger', () => {
  const runner = resolveFrame({ enduranceSport: 'run' });
  assertEquals(runner.frame, 'strength_5k');

  /**
   * ⛔⛔ AND SO DOES A CYCLIST NOW (Michael, 2026-08-27): *"if wendler has a future at all its not in
   * this path."* The bike-only refusal — *"strength leading with a cyclist is Cycling: Base
   * (p278/p280) and it is not built"* — sent that athlete to the Get Stronger path, which is the
   * plan being retired. A runner-shaped week filled with rides beats a plan with no future.
   * ⚠️ The argument the refusal carried is kept verbatim in the resolver's own comment: it is
   * overruled by the alternative, not answered.
   */
  assertEquals(resolveFrame({ enduranceSport: 'bike' }).frame, 'strength_5k');

  /**
   * ⛔ EVERY REFUSAL CARRIES A REASON. A silent null is how a routing decision becomes unexplainable
   * — the caller logs this, and Get Stronger builds the block unchanged.
   *
   * ⚠️ ONE POSITION IS LEFT REFUSING: no endurance at all. Every frame is a hybrid week, so it is
   * not a plan this file can serve. ⚠️ It is also unreachable from the wizard, which offers exactly
   * three athlete types — run only, ride only, run + ride — and is kept as a guard for any other
   * caller.
   */
  const r = resolveFrame({ enduranceSport: null });
  assertEquals(r.frame, null, 'an athlete holding no endurance was routed to a hybrid frame');
  assert('reason' in r && r.reason.length > 10, 'a refusal with no reason');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE COMPETITION LIFTS: WITHOUT THEM THE BLOCK PRESCRIBES NOTHING
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('with no competition lifts the block prescribes nothing at all', () => {
  // ⛔ THE REASON THE SEED EXISTS. `movementIsTested` requires the movement to BE the named
  // competition lift, so an empty map yields twelve weeks of "By feel" — a plan that looks built.
  const working = {
    bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })!,
    squat: workingNumberFromTest('squat', { weight: 245, reps: 5 })!,
    deadlift: workingNumberFromTest('deadlift', { weight: 315, reps: 4 })!,
  };
  // ⚠️ WEEK ONE IS EXCLUDED ON BOTH SIDES. The pretest carries real warm-up weights aimed by the
  // stored 1RM whatever the competition lifts are — that is the seed doing its job, not a
  // prescription. What this test is about is weeks TWO onward.
  const prescribedAfterTest = (lifts: Record<string, string>) =>
    composeBlock({ ...ROW_ARGS.compose, competitionLifts: lifts, workingNumbers: working, weeks: 3, taperWeeks: [] })
      .filter((w) => !w.isTestWeek)
      .flatMap((w) => w.sessions)
      .flatMap((s: PlanSession) => s.strength_exercises ?? [])
      .filter((e) => typeof e.weight === 'number');

  assertEquals(prescribedAfterTest({}).length, 0, 'a block with no competition lifts prescribed a weight');
  assert(prescribedAfterTest(defaultCompetitionLifts() as Record<string, string>).length > 0,
    'the seeded block prescribed nothing');
});

Deno.test('the seed names three patterns and never the pull, because the pull shares the bench number', () => {
  const lifts = defaultCompetitionLifts();
  assertEquals(Object.keys(lifts).sort(), ['hinge_lower', 'press_lower', 'push_upper']);
  // ⛔⛔ SETTING `pull_upper` WOULD HAND A ROW THE BENCH PRESS'S WORKING NUMBER — `pull up @ 205 lb`.
  assertEquals((lifts as Record<string, string>).pull_upper, undefined);
  assertEquals(PATTERN_FOR_TESTED_LIFT.overheadPress, null);
  assertEquals(PATTERN_FOR_TESTED_LIFT.bench, 'push_upper');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE ROUND TRIP: WHAT THE TEST IS CALLED IS WHAT THE READER LOOKS FOR
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the test week names its lifts the way the block prescribes them, and the reader agrees', () => {
  const names = testWeekLiftNames(defaultCompetitionLifts());
  assertEquals(names.bench, TESTED_LIFT_NAME.bench);
  assertEquals(names.overheadPress, TESTED_LIFT_NAME.overheadPress);

  const block = composeBlock({ ...ROW_ARGS.compose, weeks: 1, taperWeeks: [] });
  // ⚠️ THE MEASURED ROWS ONLY. A test day also carries whatever the week's muscle floor put on it,
  // and a floor row is not a measurement — the `amrap` step is what identifies the test set.
  const tested = block[0].sessions
    .filter((s) => s.tags.includes('test_week'))
    .flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => (e.set_plan ?? []).some((st) => st.amrap === true))
    .map((e) => e.name);
  assertEquals(tested.length, 4, `the test week measured ${tested.length} lifts, not four`);
  // ⛔ NO RAW KEY EVER REACHES A CARD — this is the defect slice 2 found: `name: lift` wrote
  // `overheadPress` onto an exercise, and the reader's table could not resolve it.
  for (const lift of ['bench', 'squat', 'deadlift', 'overheadPress'] as TestedLift[]) {
    assert(!tested.includes(lift), `the test week showed the raw key "${lift}" on a card`);
    assert(tested.includes(names[lift]), `the test week never measured ${names[lift]}`);
  }
});

Deno.test('an athlete-named competition lift is what week one actually tests', () => {
  // ⛔ IT HAS TO BE. `exerciseForSlot` only prescribes when the movement IS the named lift, so a
  // test of "Back Squat" with a block that prescribes "Safety Bar Squat" produces a number nothing
  // ever spends.
  const named = { push_upper: 'Larsen Press', press_lower: 'Safety Bar Squat', hinge_lower: 'Trap Bar Deadlift' };
  const names = testWeekLiftNames(named);
  assertEquals(names.squat, 'Safety Bar Squat');
  assertEquals(names.bench, 'Larsen Press');
  // Overhead press has no pattern, so it cannot be overridden and keeps its canonical name.
  assertEquals(names.overheadPress, TESTED_LIFT_NAME.overheadPress);

  const wk = composeBlock({ ...ROW_ARGS.compose, competitionLifts: named, weeks: 1, taperWeeks: [] })[0];
  const measured = wk.sessions.filter((s) => s.tags.includes('test_week'))
    .flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => (e.set_plan ?? []).some((st) => st.amrap === true))
    .map((e) => e.name);
  assert(measured.includes('Safety Bar Squat'), 'week one tested a movement the block will not prescribe');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — READING THE TEST BACK
// ════════════════════════════════════════════════════════════════════════════════════════════════

const NAMES = testWeekLiftNames(defaultCompetitionLifts());

const testRow = (week: number | null, name: string, set: Record<string, unknown>) => ({
  week_number: week,
  strength_exercises: [{ name, sets: [{ weight: 100, reps: 6, warmup: true, completed: true }, set] }],
});

Deno.test('the working number comes off the completed max-rep set, and it is 96% of the average', () => {
  const read = readTestWeek(
    [testRow(TEST_WEEK_INDEX, NAMES.bench, { weight: 185, reps: 5, amrap: true, completed: true })],
    NAMES,
  );
  const wn = read.working.bench!;
  assertEquals(wn.measured, { weight: 185, reps: 5 });
  // Epley 185×(1+5/30)=215.833…, Brzycki 185×36/32=208.125 → mean 211.979…, ×0.96
  const expected = ((185 * (1 + 5 / 30)) + (185 * 36 / 32)) / 2 * WORKING_MAX_FRACTION;
  assert(Math.abs(wn.workingNumber - expected) < 1e-9, `working number was ${wn.workingNumber}, not ${expected}`);
  // ⛔ AND IT IS NOT 85% OF ANYTHING. The collision is the whole reason this quantity is separate.
  assert(Math.abs(wn.workingNumber - wn.predicted1RM * 0.85) > 1, 'the working number landed on Wendler\'s fraction');
});

Deno.test('an unproven set is not evidence — and every abstention says why', () => {
  const cases: { label: string; rows: unknown[] }[] = [
    { label: 'nothing logged', rows: [] },
    // ⛔ NOT PROVABLY WEEK ONE. Twelve weeks of prescription off a set nobody can place is the
    // failure this codebase keeps finding.
    { label: 'no week number', rows: [testRow(null, NAMES.bench, { weight: 185, reps: 5, amrap: true, completed: true })] },
    { label: 'a later week', rows: [testRow(4, NAMES.bench, { weight: 185, reps: 5, amrap: true, completed: true })] },
    // ⚠️ An untouched set carries whatever the prefill left in it.
    { label: 'not completed', rows: [testRow(TEST_WEEK_INDEX, NAMES.bench, { weight: 185, reps: 5, amrap: true })] },
    // ⚠️ The amrap flag is the signal; an ordinary top set is not a measurement.
    { label: 'not the amrap set', rows: [testRow(TEST_WEEK_INDEX, NAMES.bench, { weight: 185, reps: 5, completed: true })] },
    { label: 'a name nothing prescribed', rows: [testRow(TEST_WEEK_INDEX, 'Machine Chest Press', { weight: 185, reps: 5, amrap: true, completed: true })] },
  ];
  for (const c of cases) {
    const read = readTestWeek(c.rows as never, NAMES);
    assertEquals(read.working.bench, undefined, `"${c.label}" was read as a measurement`);
    const why = read.missing.find((m) => m.lift === 'bench');
    assert(why && why.reason.length > 5, `"${c.label}" abstained without saying why`);
  }
});

Deno.test('a set too long to be a strength test is refused, not prescribed from', () => {
  // ⚠️ Brzycki inverts at 37 reps. A set that long is not a strength test.
  const read = readTestWeek(
    [testRow(TEST_WEEK_INDEX, NAMES.squat, { weight: 95, reps: 40, amrap: true, completed: true })],
    NAMES,
  );
  assertEquals(read.working.squat, undefined);
  assert(read.missing.some((m) => m.lift === 'squat' && /not a strength test/.test(m.reason)));
});

Deno.test('a retaken test wins over the first attempt', () => {
  const read = readTestWeek([
    testRow(TEST_WEEK_INDEX, NAMES.deadlift, { weight: 275, reps: 3, amrap: true, completed: true }),
    testRow(TEST_WEEK_INDEX, NAMES.deadlift, { weight: 315, reps: 4, amrap: true, completed: true }),
  ], NAMES);
  assertEquals(read.working.deadlift!.measured, { weight: 315, reps: 4 });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE PLAN ROW
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the block is written with no working numbers, because the test has not happened', () => {
  const row = buildStandingPlanRow(ROW_ARGS);
  assertEquals(row.duration_weeks, 12);
  assertEquals(Object.keys(row.sessions_by_week).length, 12);
  // ⛔ THE HOLE THE RESTATER EXISTS TO FILL.
  assertEquals(row.config.working_numbers, null);
  assertEquals(row.config.test_read, false);
  assertEquals(row.config.test_week, TEST_WEEK_INDEX);
  // ⛔ THE SEED IS STORED AS PROVENANCE AND IS NOT THE ANSWER.
  assertEquals(row.config.seed_one_rep_maxes, SEED);
  // ⛔⛔ AND THERE IS NO TRAINING MAX ANYWHERE ON THE ROW. Pivot §3: that key is Wendler's 85% of a
  // TRUE 1RM with three live readers, and a number written there would be spent as that quantity.
  assert(!/training_max|trainingMax/.test(JSON.stringify(row)), 'the plan row carries a training max');
});

Deno.test('the phase names the block emits are ones the app already understands', () => {
  const row = buildStandingPlanRow(ROW_ARGS);
  assertEquals(row.phaseStructure.phases[0].name, 'Test');
  assertEquals(row.phaseStructure.phases[0].start_week, 1);
  assertEquals(row.phaseStructure.phases[0].end_week, 1);
  for (const ph of row.phaseStructure.phases) {
    // ⛔ AN UNRECOGNISED PHASE NAME RESOLVES TO THE DEFAULT SILENTLY — Q-192's failure mode.
    assert(normalizePhaseKey(ph.name) != null, `"${ph.name}" is not a phase this app knows`);
  }
  // Every week is covered exactly once.
  const covered = row.phaseStructure.phases.flatMap((p) =>
    Array.from({ length: p.end_week - p.start_week + 1 }, (_, i) => p.start_week + i));
  assertEquals(covered, Array.from({ length: 12 }, (_, i) => i + 1));
});

Deno.test('there is no scheduled deload, and that is his answer rather than an omission', () => {
  // ⛔ p120: overreach-to-deload breaks down in hybrid training. The standard week is built to run
  // indefinitely and the taper column is a tool you DEPLOY, not a week on a timer.
  const row = buildStandingPlanRow(ROW_ARGS);
  assertEquals(row.phaseStructure.recovery_weeks, []);
  assert(!row.phaseStructure.phases.some((p) => p.name === 'Taper'), 'a taper week was scheduled');
  // And a deployed taper still works, when a race asks for one.
  const raced = buildStandingPlanRow({ ...ROW_ARGS, taperWeeks: [11, 12] });
  const taper = raced.phaseStructure.phases.find((p) => p.name === 'Taper')!;
  assertEquals([taper.start_week, taper.end_week], [11, 12]);
});

Deno.test('the block reports the lifting days it actually used', () => {
  const row = buildStandingPlanRow(ROW_ARGS);
  // Four lifting days plus the frame's plyometric day, in weekday order.
  // ⚠️ FIVE, AND THE 2026-08-24 DRILL WORK DID NOT MOVE IT. A three-day plyo spread was built and
  // reverted the same day; it would have added Saturday, a day holding no lift, to a field
  // `adapt-plan` and the optimizer read as the week's picture.
  assertEquals(row.strength_days, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
});

Deno.test('the protocol this block stamps is one the app has a profile for', () => {
  // ⛔ AN UNREGISTERED ID FALLS THROUGH TO `durability` — a flat RIR 2.5 for twelve weeks — and reads
  // as `protocolKnown: false`, which silences every effort-aware surface without saying so.
  assert(STANDING_PLAN_PROTOCOL_ID in PROTOCOL_PROFILES,
    'the Standing Plan protocol has no PROTOCOL_PROFILES entry');
  assertEquals(PROTOCOL_PROFILES[STANDING_PLAN_PROTOCOL_ID as never].readsEffortAs, 'rir');
});

Deno.test('his reps-in-reserve reaches the row, and the ME slot is left without one', () => {
  const working = { bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })! };
  const wk = composeBlock({ ...ROW_ARGS.compose, workingNumbers: working, weeks: 2, taperWeeks: [] })[1];
  const day1 = wk.sessions.find((s) => s.day === 'Monday' && s.type === 'strength')!;
  // 2026-08-26: the slot notation left `notes` (jargon on the athlete-notes box); the intent is
  // now the `slot_intent` field and the verbatim p246 row lives in `source_row`.
  const me = day1.strength_exercises!.find((e) => e.slot_intent === 'ME')!;
  const de = day1.strength_exercises!.find((e) => e.slot_intent === 'DE')!;
  const hyp = day1.strength_exercises!.find((e) => e.slot_intent === 'HYP')!;
  // ⛔ p218 says "no RIR target" for ME in as many words.
  assertEquals(me.target_rir, undefined);
  assertEquals(de.target_rir, 3.5);   // his 3-4
  assertEquals(hyp.target_rir, 1);    // his 0-2
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// F — RESTATING THE BLOCK FROM THE TEST
// ════════════════════════════════════════════════════════════════════════════════════════════════

const MONDAYS: Record<number, string> = { 1: '2026-09-07', 2: '2026-09-14', 3: '2026-09-21', 4: '2026-09-28' };

function plannedFrom(block: ReturnType<typeof composeBlock>) {
  const rows: { id: string; week_number: number; date: string; strength_exercises: unknown }[] = [];
  const offset: Record<string, number> = {
    Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6,
  };
  for (const wk of block) {
    const monday = MONDAYS[wk.week];
    if (!monday) continue;
    for (const s of wk.sessions) {
      if (s.type !== 'strength') continue;
      const d = new Date(Date.parse(`${monday}T00:00:00Z`) + offset[s.day] * 86400000)
        .toISOString().slice(0, 10);
      rows.push({
        id: `${wk.week}-${s.day}`,
        week_number: wk.week,
        date: d,
        strength_exercises: JSON.parse(JSON.stringify(s.strength_exercises ?? [])),
      });
    }
  }
  return rows;
}

Deno.test('a materialized row resolves back to the weekday the frame put it on', () => {
  assertEquals(weekdayOf('2026-09-07'), 'Monday');
  assertEquals(weekdayOf('2026-09-12'), 'Saturday');
  assertEquals(weekdayOf('not a date'), null);
});

Deno.test('the test week fills in the weeks ahead and leaves history alone', () => {
  const before = composeBlock({ ...ROW_ARGS.compose, weeks: 4, taperWeeks: [] });
  const planned = plannedFrom(before);
  const working = {
    bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })!,
    squat: workingNumberFromTest('squat', { weight: 245, reps: 5 })!,
    deadlift: workingNumberFromTest('deadlift', { weight: 315, reps: 4 })!,
  };
  const after = composeBlock({ ...ROW_ARGS.compose, workingNumbers: working, weeks: 4, taperWeeks: [] });

  const restated = restateFromTest({ composed: after, planned, afterWeek: 2 });
  assert(restated.changes.length > 0, 'the test changed nothing');
  // ⛔ HISTORY AND THE LIVE WEEK STAND.
  assert(restated.changes.every((c) => c.week > 2), 'a finished week was rewritten');
  assert(restated.rows.every((r) => r.week > 2), 'a finished week was queued for a write');
  // ⛔ AND THE ROWS THAT DID MOVE WENT FROM "BY FEEL" TO A NUMBER.
  const first = restated.changes[0];
  assertEquals(first.from, null);
  assert(first.to > 0);
  assertEquals(restated.unmatched.filter((u) => u.week > 2).length, 0);

  /**
   * ⛔⛔ AND EVERY REWRITTEN WEIGHT IS THE ONE THE COMPOSER PRESCRIBED FOR **THAT DAY**.
   *
   * ⚠️ THIS ASSERTION WAS MISSING AND MUTATION TESTING FOUND IT. The earlier version only checked
   * WHICH weeks moved, never what they moved TO — so matching on week and movement name while
   * ignoring the weekday survived untouched. It is not a theoretical break: the bench press is the
   * competition push on day 1 (ME, ~100%) and again on day 4 (DE, ~80%), so a day-blind match hands
   * Thursday's speed row Monday's maximal weight. Every rewritten row is checked against its own
   * composed slot.
   */
  const composedAt = new Map<string, number>();
  for (const wk of after) {
    for (const s of wk.sessions) {
      for (const e of s.strength_exercises ?? []) {
        if (typeof e.weight === 'number') composedAt.set(`${wk.week}|${s.day}|${e.name.toLowerCase()}`, e.weight);
      }
    }
  }
  assert(composedAt.size > 0, 'the composer prescribed nothing to compare against');
  for (const row of restated.rows) {
    for (const ex of row.strength_exercises) {
      if (typeof ex.weight !== 'number') continue;
      assertEquals(
        ex.weight,
        composedAt.get(`${row.week}|${row.day}|${String(ex.name).toLowerCase()}`),
        `week ${row.week} ${row.day} ${ex.name} was rewritten to a weight from another slot`,
      );
    }
  }
});

Deno.test('an auto-regulated row stays by feel forever', () => {
  // ⛔ A HYP ROW CARRIES NO PERCENTAGE BY DESIGN (p218). Overwriting it would reintroduce forced
  // progression on auto-regulated work, which is exactly what the deleted auto-progression did.
  const working = { bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })! };
  const after = composeBlock({ ...ROW_ARGS.compose, workingNumbers: working, weeks: 4, taperWeeks: [] });
  const planned = plannedFrom(composeBlock({ ...ROW_ARGS.compose, weeks: 4, taperWeeks: [] }));
  const restated = restateFromTest({ composed: after, planned, afterWeek: 1 });
  for (const row of restated.rows) {
    for (const ex of row.strength_exercises) {
      if (ex.load_prescribed === false) assertEquals(ex.weight, 'By feel');
    }
  }
  // Only the bench was tested, so only bench rows carry a number.
  assert(restated.changes.every((c) => /bench/i.test(c.movement)),
    `a movement with no test set was given a weight: ${restated.changes.map((c) => c.movement).join(', ')}`);
});

Deno.test('a second pass never blanks a weight the first pass already set', () => {
  /**
   * ⛔ THE CASE THE `to == null` GUARD ACTUALLY HOLDS, and mutation testing is what found that the
   * earlier tests did not reach it. Restating is not a one-shot: an athlete can retake one lift's
   * test, or the reader can abstain on a lift it read last time. On that second pass the composer
   * returns "By feel" for the lift it now has no number for — and without the guard the restater
   * would write that string over a real weight already on the athlete's calendar, and record the
   * blanking as a change.
   */
  const full = {
    bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })!,
    squat: workingNumberFromTest('squat', { weight: 245, reps: 5 })!,
    deadlift: workingNumberFromTest('deadlift', { weight: 315, reps: 4 })!,
  };
  const firstPass = composeBlock({ ...ROW_ARGS.compose, workingNumbers: full, weeks: 4, taperWeeks: [] });
  // The calendar as it stands AFTER a first restate: real weights on it.
  const planned = plannedFrom(firstPass);
  const before = planned.flatMap((r) => r.strength_exercises as { name: string; weight: unknown }[])
    .filter((e) => typeof e.weight === 'number').length;
  assert(before > 0, 'the fixture calendar carries no prescribed weights');

  // A second pass where the bench no longer reads — the composer returns it to "By feel".
  const partial = { squat: full.squat, deadlift: full.deadlift };
  const secondPass = composeBlock({ ...ROW_ARGS.compose, workingNumbers: partial, weeks: 4, taperWeeks: [] });
  const restated = restateFromTest({ composed: secondPass, planned, afterWeek: 1 });

  for (const row of restated.rows) {
    for (const ex of row.strength_exercises) {
      assert(ex.weight !== 'By feel',
        `week ${row.week} ${row.day} ${ex.name} had a real weight blanked back to "By feel"`);
    }
  }
  assert(!restated.changes.some((c) => /bench/i.test(c.movement)),
    'the bench was rewritten on a pass that had no bench number');
});

Deno.test('a day the calendar does not have is reported, not silently skipped', () => {
  const working = { bench: workingNumberFromTest('bench', { weight: 185, reps: 5 })! };
  const after = composeBlock({ ...ROW_ARGS.compose, workingNumbers: working, weeks: 3, taperWeeks: [] });
  const planned = plannedFrom(after).filter((r) => !(r.week_number === 3 && r.date.endsWith('-21')));
  const restated = restateFromTest({ composed: after, planned, afterWeek: 1 });
  assert(restated.unmatched.some((u) => u.week === 3 && u.day === 'Monday'),
    'a missing calendar day passed unreported');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// G — THE ADVANCED TIER IS GATED ON WHAT WAS RUN
// ════════════════════════════════════════════════════════════════════════════════════════════════

const KM = (mi: number) => mi / 0.621371;

Deno.test('demonstrated miles are measured from logged runs, in the units the table stores', () => {
  // ⛔ `workouts.distance` IS KILOMETRES — settled at `daily-ledger.ts:208` and `compute-facts:126`.
  const rows = [
    { type: 'run', date: '2026-09-01', distance: KM(8) },
    { type: 'run', date: '2026-09-08', distance: KM(8) },
    { type: 'run', date: '2026-09-15', distance: KM(8) },
    { type: 'run', date: '2026-09-22', distance: KM(8) },
  ];
  const v = demonstratedRunVolume(rows, '2026-09-25');
  assertEquals(v.runs, 4);
  assert(Math.abs(v.weeklyMiles! - 8) < 0.2, `read ${v.weeklyMiles} mi/wk, not 8`);
});

Deno.test('a ride, a run outside the window, and a run with no distance are all excluded', () => {
  const rows = [
    { type: 'run', date: '2026-09-20', distance: KM(10) },
    { type: 'ride', date: '2026-09-20', distance: KM(40) },          // not a run
    { type: 'run', date: '2026-07-01', distance: KM(30) },           // outside the window
    { type: 'run', date: '2026-09-21', distance: null },             // unmeasurable, not zero miles
  ];
  const v = demonstratedRunVolume(rows, '2026-09-25');
  assertEquals(v.runs, 1);
  assert(Math.abs(v.weeklyMiles! - 10 / 4) < 0.2, `read ${v.weeklyMiles}`);
  assertEquals(DEMONSTRATED_WINDOW_DAYS, 28);
});

Deno.test('no running on file abstains rather than reporting zero miles', () => {
  const v = demonstratedRunVolume([], '2026-09-25');
  // ⛔ NULL, NOT 0. Absent is a different answer from measured-as-nothing, and the tier reads both
  // as the base tier — but only one of them is a measurement.
  assertEquals(v.weeklyMiles, null);
  assertEquals(v.runs, 0);
  assert(v.source.length > 5);
});

Deno.test('the extra easy run appears only for an athlete already running that far', () => {
  const under = composeBlock({
    ...ROW_ARGS.compose, weeks: 2, taperWeeks: [],
    demonstratedWeeklyMiles: ADVANCED_TIER_MIN_WEEKLY_MILES - 1,
  })[1];
  const over = composeBlock({
    ...ROW_ARGS.compose, weeks: 2, taperWeeks: [],
    demonstratedWeeklyMiles: ADVANCED_TIER_MIN_WEEKLY_MILES + 1,
  })[1];
  const runsUnder = under.sessions.filter((s) => s.type === 'run').length;
  const runsOver = over.sessions.filter((s) => s.type === 'run').length;
  assertEquals(runsUnder, 4);
  assertEquals(runsOver, 5);
  // ⛔ THE ADDED SESSION IS EASY ONLY — the tier exists "to test recovery" (p247).
  const extra = over.sessions.find((s) => s.tags.includes('advanced_tier'))!;
  assert(/easy/i.test(extra.steps_preset?.join(' ') ?? ''), `the extra session was not easy: ${extra.name}`);
});

Deno.test('the block records which number gated its tier and where that number came from', () => {
  const row = buildStandingPlanRow({
    ...ROW_ARGS,
    compose: { ...ROW_ARGS.compose, demonstratedWeeklyMiles: 28 },
    demonstratedMilesSource: '9 logged runs over the last 28 days',
  });
  assertEquals(row.config.demonstrated_weekly_miles, 28);
  assert(/logged runs/.test(row.config.demonstrated_miles_source ?? ''));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// H — THE WIRING ITSELF
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a stale ride-hours number on the goal does not put rides in the week', async () => {
  /**
   * ⛔ `create-goal` FORWARDS `target_weekly_ride_hours` WHATEVER THE BIKE'S POSTURE — it reads
   * `gsTp.target_weekly_ride_hours` with no posture gate — so a runner who answered that question in
   * some earlier block still carries the number on a run-only goal.
   *
   * ⚠️ WHAT THE STALE ANSWER COSTS HAS CHANGED, AND THE TEST SURVIVES THE CHANGE. Before slice 4 it
   * would have REFUSED the frame; now it would put riding into a week nobody asked for. Same stale
   * field, same reason not to read it, a different consequence.
   */
  const src = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const line = code.split('\n').find((l) => l.includes('rides:'))!;
  assert(line, 'the fork no longer reads how many rides the athlete asked for');
  assert(!/rideHoursAsked/.test(line),
    'the fork reads ride HOURS as a ride COUNT — a stale hours answer would put rides in the week');
  assert(/rideDaysAsked/.test(line), 'the fork does not read the normalised ride count');

  // ⚠️ AND THE FRAME NO LONGER TURNS A BIKE AWAY (slice 4) — it carries it.
  assertEquals(resolveFrame({ enduranceSport: 'run' }).frame, 'strength_5k');
});

Deno.test('the edge function forks and keeps the Get Stronger path whole', async () => {
  const src = await Deno.readTextFile(
    new URL('../../generate-strength-plan/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // ⛔ THE FALLBACK IS STILL THERE. A fork that replaced the old composer instead of standing beside
  // it would be a rewrite of Get Stronger wearing a routing change's clothes.
  assert(/composeStrengthPrimaryPlan\(/.test(code), 'the Get Stronger composer is no longer called');
  assert(/resolveFrame\(/.test(code), 'the frame resolver is not wired');
  assert(/buildStandingPlanRow\(/.test(code), 'the Standing Plan row builder is not wired');
  // ⛔ AND THE NEW BLOCK NEVER WRITES A TRAINING MAX. `training_max:` appears on the Get Stronger
  // insert only; the Standing Plan insert is the block between the fork and that fallback.
  const fork = code.slice(code.indexOf('resolveFrame('), code.indexOf('composeStrengthPrimaryPlan('));
  assert(fork.length > 500, 'the fork block could not be isolated — this lint is not reading what it thinks');
  assert(!/training_max/.test(fork), 'the Standing Plan insert writes a training max');
  assert(/strength_protocol:\s*STANDING_PLAN_PROTOCOL_ID/.test(fork), 'the block does not stamp its protocol');
});

Deno.test('the restater refuses a block that is not a Standing Plan block', async () => {
  const src = await Deno.readTextFile(
    new URL('../../rematerialize-standing-block/index.ts', import.meta.url).pathname,
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(/not_a_standing_plan_block/.test(code), 'the restater does not check which block it is on');
  // ⛔ IT PROPOSES; IT DOES NOT SILENTLY WRITE.
  assert(/apply\s*===\s*true/.test(code), 'the restater has no apply gate — it writes by default');
  // ⛔ AND IT NEVER TOUCHES WENDLER'S KEY.
  assert(!/training_max|wendler/i.test(code), 'the restater reaches into the training max');
  assert(/requireUser/.test(code), 'the restater does not verify who is asking');
});

Deno.test("⛔⛔ THE TEST WEEK'S COMPETITION LIFTS ARE STAMPED ME — the empty-Monday regression", () => {
  /**
   * ⛔ THE BUG THIS PINS (2026-08-28). `state-trend/assemble.ts` fails CLOSED: only a set stamped
   * `ME` mints an estimated max. The p215 pretest was unstamped, so the block's MOST maximal
   * sessions — the two the working numbers are derived from — reached the strength line as nothing,
   * and an athlete opening a fresh block to "start the line from scratch" would have seen an empty
   * card until week two. Found by printing the intents of a composed block.
   *
   * ⚠️ ME DESCRIBES THIS ROW, IT DOES NOT CHANGE IT. The pretest works up to a set taken for max
   * clean reps; 90-100% is the band it already occupies. That is why it is defensible here and not
   * on a 5/3/1 top set, where ME would assert a band the programme does not prescribe.
   */
  const block = composeBlock({ ...ROW_ARGS.compose, weeks: 2 } as never) as never as Array<{
    week: number;
    isTestWeek: boolean;
    sessions: Array<{ name: string; strength_exercises?: Array<{ name: string; slot_intent?: string; load_prescribed?: boolean }> }>;
  }>;
  const wk1 = block.find((w) => w.week === 1)!;
  assert(wk1.isTestWeek, 'week 1 is not the test week');

  const testDays = wk1.sessions.filter((s) => /^Test: /.test(s.name));
  assertEquals(testDays.length, 2, 'the test week did not carry two test days');

  const competition = testDays.flatMap((s) => (s.strength_exercises ?? []).filter((e) => e.load_prescribed !== false || e.slot_intent));
  assert(competition.length >= 2, 'no competition lifts found on the test days');
  for (const ex of competition) {
    assertEquals(ex.slot_intent, 'ME', `${ex.name} on a test day is not stamped ME — it will mint nothing`);
  }

  /**
   * ⚠️ AND THE ACCESSORIES ON THOSE DAYS STAY UNSTAMPED. Blanket-stamping the session would put a
   * maximal claim on a floor-filling hip thrust, which is the opposite failure.
   */
  const accessories = testDays.flatMap((s) => (s.strength_exercises ?? []))
    .filter((e) => !competition.includes(e));
  for (const ex of accessories) {
    assertEquals(ex.slot_intent, undefined, `${ex.name} is an accessory and must not claim ME`);
  }
});
