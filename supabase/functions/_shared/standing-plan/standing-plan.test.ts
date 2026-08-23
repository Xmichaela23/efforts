// ============================================================================
// THE GATE — stage 4, slice 1: the strength-leading runner frame.
//
// ⚠️ EVERY ASSERTION WAS MUTATION-TESTED — the code it covers was broken and the test confirmed to
// fail. The mutations are listed in `docs/NOTES-stage4-composer-strength5k-2026-08-23.md`.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ADVANCED_TIER_MIN_WEEKLY_MILES,
  advancedTierSessions,
  brzycki1RM,
  composeBlock,
  composeWeek,
  DOUBLE_PROGRESSION_IS_OURS,
  EMITTED_TOKEN_SHAPES,
  epley1RM,
  FRAMES,
  isTestWeek,
  LOWER_HAIRCUT_INITIAL,
  LOWER_HAIRCUT_PHASE_OUT_WEEKS,
  lowerBodyHaircut,
  MATERIALIZER_RUN_PATTERNS,
  PLYO_DOSE,
  predictedTrue1RM,
  prescribedLoad,
  pretestSession,
  progressionVerdict,
  RATE_ANCHOR,
  scheduledRise,
  STALL_CONFIRMATIONS,
  TEST_DAY_LIFTS,
  WORKING_MAX_FRACTION,
  workingNumberFromTest,
  type ComposeArgs,
  type TestedLift,
} from './index.ts';

// ── a real athlete, and a second one that shares nothing with the first ────────────────────────

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};

const WN = (lift: TestedLift, weight: number, reps: number) => workingNumberFromTest(lift, { weight, reps })!;
const WORKING = {
  bench: WN('bench', 185, 5),
  squat: WN('squat', 245, 5),
  deadlift: WN('deadlift', 315, 4),
  overheadPress: WN('overheadPress', 115, 6),
};

const BASE_ARGS: Omit<ComposeArgs, 'week' | 'column'> = {
  frame: 'strength_5k',
  competitionLifts: { push_upper: 'bench press', press_lower: 'back squat', hinge_lower: 'deadlift' },
  workingNumbers: WORKING,
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

const KITS: { label: string; equipment: string[] | null }[] = [
  { label: 'never asked', equipment: null },
  { label: 'commercial gym', equipment: ['Commercial gym'] },
  { label: 'barbell + rack + bench', equipment: ['Barbell + plates', 'Rack', 'Bench'] },
  { label: 'dumbbells + bench', equipment: ['Dumbbells', 'Bench'] },
  { label: 'bodyweight + bar', equipment: ['Pull-up bar'] },
];

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A — ⛔ GET STRONGER MUST STILL BUILD BYTE-IDENTICAL PLANS
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test("Get Stronger's composer is untouched by this stage", async () => {
  // ⛔ PROVEN, NOT ASSUMED. The Standing Plan is a NEW directory that reads the three stage
  // libraries; it must not have reached sideways into the live path. Two checks, because either
  // alone is weak: the plan output is hashed, and the source is linted for any reference at all.
  const { composeStrengthPrimaryPlan } = await import(
    '../../shared/strength-system/strength-primary-plan.ts'
  );
  const plan = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: 225, squat: 315, deadlift: 405, overheadPress: 135 },
    enduranceSport: 'run',
    enduranceFrequency: 3,
    goalName: 'Get Stronger',
    targetWeeklyMiles: 15,
    easyPaceMinPerMile: 9.5,
    longRunDay: 'Saturday',
    blockShape: { strengthPosture: 'develop' },
    pullupMaxReps: 12,
  });

  // ⛔ THE BYTE-IDENTICAL PROOF IS A STASH COMPARISON AND IT WAS RUN, NOT ASSERTED HERE.
  // `git stash` the Standing Plan directory away, compose, hash; restore it, compose, hash. Both
  // were `eb1d6796bcef1bbda67b8db2d70265dd650383f703f63ee26d47dc66ee7808b2` on 2026-08-23. That is
  // recorded in the stage notes as a thing that was RUN.
  //
  // ⚠️ A HASH PINNED IN THIS FILE WOULD BE THE WRONG INSTRUMENT. It answers "has Get Stronger
  // changed at all", which is not this stage's business and which any legitimate future change to
  // that plan would break. What IS this stage's business is that the Standing Plan cannot reach it —
  // held by the source lint below — and that the composer is deterministic, held here.
  const again = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: 225, squat: 315, deadlift: 405, overheadPress: 135 },
    enduranceSport: 'run',
    enduranceFrequency: 3,
    goalName: 'Get Stronger',
    targetWeeklyMiles: 15,
    easyPaceMinPerMile: 9.5,
    longRunDay: 'Saturday',
    blockShape: { strengthPosture: 'develop' },
    pullupMaxReps: 12,
  });
  assertEquals(JSON.stringify(again), JSON.stringify(plan),
    'Get Stronger is not deterministic — a byte-identical claim cannot be made about it');
  assert(JSON.stringify(plan).length > 1000, 'Get Stronger built almost nothing');
});

Deno.test('the Standing Plan never reaches into the live strength path', async () => {
  const dir = new URL('.', import.meta.url).pathname;
  // ⛔⛔ THE DIRECTORY, NOT A HAND-WRITTEN LIST (widened 2026-08-23, slice 2). This enumerated six
  // filenames, so slice 2's five new files — the frame resolver, the row builder, the restater and
  // the history reader among them — would have been added to the module and never linted. A lint
  // with a list has to be maintained to keep working, which is the same disease as the three
  // hand-maintained routing tables in `CLAUDE.md`.
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) names.push(entry.name);
  }
  assert(names.length >= 6, 'the module lint found almost no files — it is not reading the directory');
  for (const name of names) {
    const src = await Deno.readTextFile(dir + name);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // ⛔ Wendler's module, the live composer, and the rep-per-category model are all off limits.
    assert(!/strength-primary-plan/.test(code), `${name} imports the live Get Stronger composer`);
    assert(!/wendler-531/.test(code), `${name} imports Wendler's loading module`);
    assert(!/assistance-menu|assistance-catalog/.test(code), `${name} reaches into Wendler's assistance model`);
    // ⛔ AND THE SAME-WORD COLLISION. `training_max` is Wendler's 85% number with three live readers.
    assert(!/training_max|trainingMax/.test(code), `${name} touches the training max`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// B — THE WORKING NUMBER (p215)
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the working number is 96% of a two-formula average', () => {
  // ⛔ LITERALS. His numbers, written out — the lesson from three prior stages.
  assertEquals(WORKING_MAX_FRACTION, 0.96);
  // Epley and Brzycki at 5 reps on 185 lb.
  assertEquals(Math.round(epley1RM(185, 5) * 100) / 100, 215.83);
  assertEquals(Math.round(brzycki1RM(185, 5) * 100) / 100, 208.13);
  const predicted = predictedTrue1RM(185, 5)!;
  assertEquals(Math.round(predicted * 100) / 100, 211.98);
  // ⛔ THE AVERAGE, NOT EITHER ONE. He averages because they diverge as reps change, and the last
  // pretest step is taken for MAX reps — the case where picking one picks an unknown error.
  assert(predicted > brzycki1RM(185, 5) && predicted < epley1RM(185, 5));
  const wn = workingNumberFromTest('bench', { weight: 185, reps: 5 })!;
  assertEquals(Math.round(wn.workingNumber * 100) / 100, Math.round(predicted * 0.96 * 100) / 100);
  assert(wn.cite.includes('p215'));
});

Deno.test('the two formulas cross at ten reps and disagree either side of it', () => {
  // ⛔ THIS IS WHY HE AVERAGES, AND IT IS SHARPER THAN "THEY DIVERGE WITH REPS" — which is what this
  // test first asserted, and it was wrong. Epley and Brzycki AGREE exactly at ten reps and pull
  // apart in OPPOSITE directions either side: below ten Epley reads higher, above ten Brzycki does.
  // The last pretest step is taken for MAX reps, so which side of the crossover it lands on is not
  // known in advance — picking one formula picks an error whose SIGN is unpredictable.
  assert(Math.abs(epley1RM(200, 10) - brzycki1RM(200, 10)) < 0.001, 'the formulas no longer meet at ten');
  assert(epley1RM(200, 3) > brzycki1RM(200, 3) + 5, 'Epley no longer reads higher below ten reps');
  assert(brzycki1RM(200, 20) > epley1RM(200, 20) + 5, 'Brzycki no longer reads higher above ten reps');
  // And the average sits between them wherever they disagree.
  for (const reps of [3, 5, 8, 15, 20]) {
    const avg = predictedTrue1RM(200, reps)!;
    const lo = Math.min(epley1RM(200, reps), brzycki1RM(200, reps));
    const hi = Math.max(epley1RM(200, reps), brzycki1RM(200, reps));
    assert(avg >= lo && avg <= hi, `the average left the pair at ${reps} reps`);
  }
});

Deno.test('a rep count the formulas cannot carry returns nothing, not a number', () => {
  // ⛔ Brzycki's denominator hits zero at 37 reps and inverts past it. A set that long is not a
  // strength test, and the honest answer is null rather than a plausible negative.
  assertEquals(predictedTrue1RM(100, 37), null);
  assertEquals(predictedTrue1RM(100, 40), null);
  assertEquals(predictedTrue1RM(0, 5), null);
  assertEquals(predictedTrue1RM(-100, 5), null);
  assertEquals(predictedTrue1RM(100, 0), null);
  assertEquals(workingNumberFromTest('squat', { weight: 100, reps: 40 }), null);
});

Deno.test('the pretest walks his three steps, aimed by the stored max', () => {
  // ⛔ THE SEED IS NOT THE ANSWER. A stored 1RM sets where the bar starts and nothing else.
  const steps = pretestSession('squat', 300, 5)!;
  assertEquals(steps.length, 3);
  assertEquals(steps[0], { fractionOfPredicted: 0.75, weight: 225, reps: 6 });
  assertEquals(steps[1], { fractionOfPredicted: 0.85, weight: 255, reps: 5 });
  assertEquals(steps[2], { fractionOfPredicted: 0.90, weight: 270, reps: 'max' });
  assertEquals(pretestSession('squat', 0, 5), null);
});

Deno.test('no function accepts both numbers', async () => {
  // ⛔ THE COLLISION GUARD. Wendler's training max (85% of a true 1RM, three live readers) and
  // Viada's working number (96% of a fresh prediction) are different quantities wearing one English
  // word. A helper taking both would be the door through which one becomes the other.
  const dir = new URL('.', import.meta.url).pathname;
  const src = await Deno.readTextFile(dir + 'working-number.ts');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert(!/trainingMax|training_max/.test(code), 'the working-number module names the training max');
  // ⚠️ NOT A BARE `0.85` CHECK — that is also the second step of HIS OWN pretest (85% of predicted),
  // and the first version of this lint flagged it. What must never appear is the two numbers meeting:
  // a function signature, a field or a conversion that carries both.
  assert(!/wendler/i.test(code), 'the working-number module names Wendler');
  assert(!/\bTRAINING_MAX|toTrainingMax|fromTrainingMax\b/.test(code),
    'the working-number module converts to or from a training max');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// C — THE TEST WEEK
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('week one is the test week, upper on day 1 and lower on day 2', () => {
  assert(isTestWeek(1));
  assert(!isTestWeek(2));
  assertEquals(TEST_DAY_LIFTS[1], ['bench', 'overheadPress']);
  assertEquals(TEST_DAY_LIFTS[2], ['squat', 'deadlift']);

  const wk = composeWeek({ ...BASE_ARGS, week: 1, column: 'standard', workingNumbers: undefined });
  assert(wk.isTestWeek);
  const mon = wk.sessions.find((s) => s.day === 'Monday' && s.type === 'strength')!;
  const tue = wk.sessions.find((s) => s.day === 'Tuesday' && s.type === 'strength')!;
  assertEquals(mon.name, 'Test: Upper');
  assertEquals(tue.name, 'Test: Lower');
  // The last step is taken for max reps — that is the set the block reads.
  // ⛔ AND IT IS NAMED FOR THE MOVEMENT THE BLOCK WILL PRESCRIBE, not for the internal key. The
  // fixture's competition push is 'bench press', so that is what week one tests.
  const bench = mon.strength_exercises!.find((e) => e.name === 'bench press')!;
  assert(bench.set_plan!.some((s) => s.amrap === true), 'the test has no max-rep set');
  // ⛔ AIMED BY THE SEED: 75% of the stored 200 is 150.
  assertEquals(bench.set_plan![0].weight, 150);
});

Deno.test('the test week is still a whole week', () => {
  // ⛔ DAYS 4 AND 5 DO NOT VANISH. They run their own slots by feel, because there is no working
  // number until the test is done. A week that drops half its lifting days is not what "the first
  // week is the test" means, and the athlete would find two empty days with no explanation.
  const wk = composeWeek({ ...BASE_ARGS, week: 1, column: 'standard', workingNumbers: undefined });
  const liftDays = wk.sessions.filter((s) => s.type === 'strength' && !s.tags.includes('plyo'));
  assertEquals(liftDays.length, 4, 'the test week lost lifting days');
  const thu = wk.sessions.find((s) => s.day === 'Thursday' && s.type === 'strength')!;
  assertEquals(thu.name, 'DE: Upper');
  for (const e of thu.strength_exercises!) {
    assertEquals(e.load_prescribed, false, `${e.name} was given a weight before the test ran`);
  }
  assert(wk.notes.some((n) => n.text.includes('by feel this week')));
  // And the endurance week is intact.
  assertEquals(wk.sessions.filter((s) => s.type === 'run').length, 4);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// D — THE FRAME IS THE LAW
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the frame table is p246, and the composer does not add to it', () => {
  // ⛔ CONVERT, NEVER ADD. Four lifting days, a plyo day, four endurance sessions, one rest day.
  const frame = FRAMES.strength_5k;
  assertEquals(frame.liftingDays, 4);
  assertEquals(frame.columns.standard.length, 7);
  assertEquals(frame.columns.taper.length, 7);
  assertEquals(frame.columns.standard.filter((d) => d.strength.length > 0).length, 4);
  assertEquals(frame.columns.standard.filter((d) => d.plyo).length, 1);
  assertEquals(frame.columns.standard.flatMap((d) => d.endurance).length, 4);
  assertEquals(frame.columns.standard.filter((d) => d.rest).length, 1);
  // ⚠️ THE TAPER DROPS THE LONG RUN AND KEEPS THREE. That is a substitution, not only a cut.
  assertEquals(frame.columns.taper.flatMap((d) => d.endurance).length, 3);
  assert(!frame.columns.taper.flatMap((d) => d.endurance).some((e) => e.family === 'run_lsd'));

  for (const kit of KITS) {
    for (const week of [2, 3, 6, 9]) {
      const wk = composeWeek({ ...BASE_ARGS, equipment: kit.equipment, week, column: 'standard' });
      assertEquals(wk.sessions.filter((s) => s.type === 'run').length, 4,
        `[${kit.label} wk${week}] endurance count moved`);
      assertEquals(wk.sessions.filter((s) => s.type === 'strength' && !s.tags.includes('plyo')).length, 4,
        `[${kit.label} wk${week}] lifting-day count moved`);
    }
  }
});

Deno.test('every day opens on a competition movement', () => {
  // ⛔ p247: *"All first lifts of the day should be a competition movement."*
  for (const week of [2, 3, 4, 5]) {
    const wk = composeWeek({ ...BASE_ARGS, week, column: 'standard' });
    for (const s of wk.sessions) {
      if (s.type !== 'strength' || s.tags.includes('plyo')) continue;
      const first = s.strength_exercises![0].name.toLowerCase();
      const comps = Object.values(BASE_ARGS.competitionLifts).map((c) => String(c).toLowerCase());
      assert(comps.includes(first), `wk${week} ${s.name} opens on "${first}", not a competition lift`);
    }
  }
});

Deno.test('the ME lift rotates weekly — his cadence, not ours', () => {
  // ⛔ p247: *"the ME lift will rotate week to week, with one week consisting of ME squat and DE
  // deadlift, and the next week the reverse."* pivot §8 called this a gap to fill from field
  // practice; it is not one, and nothing here is ours.
  const lower = (week: number) => {
    const wk = composeWeek({ ...BASE_ARGS, week, column: 'standard' });
    const me = wk.sessions.find((s) => s.name === 'ME: Lower')!;
    const de = wk.sessions.find((s) => s.name === 'DE: Lower')!;
    return { me: me.strength_exercises![0].name, de: de.strength_exercises![0].name };
  };
  const odd = lower(3);
  const even = lower(4);
  assertEquals(odd.me, 'deadlift');
  assertEquals(odd.de, 'back squat');
  // ⛔ THE NEXT WEEK IS THE REVERSE.
  assertEquals(even.me, 'back squat');
  assertEquals(even.de, 'deadlift');
  assertEquals(lower(5).me, odd.me, 'the rotation is not weekly');
});

Deno.test('an accessory slot never takes the competition lift', () => {
  // ⛔ THE ROLE FILTER (p247). `Accessory:` means a noncompetition movement in the same gross
  // pattern. A composer reading it as a category puts the competition lift into the slot that
  // exists to avoid it.
  for (const kit of KITS) {
    for (const week of [2, 3]) {
      const wk = composeWeek({ ...BASE_ARGS, equipment: kit.equipment, week, column: 'standard' });
      for (const s of wk.sessions) {
        if (s.type !== 'strength' || s.tags.includes('plyo')) continue;
        // Everything after the first row is an accessory in this frame.
        for (const e of s.strength_exercises!.slice(1)) {
          const comps = Object.values(BASE_ARGS.competitionLifts).map((c) => String(c).toLowerCase());
          // ⚠️ A competition lift may legitimately appear in ANOTHER pattern's accessory slot only if
          // nothing else exists; the frame's own slots never ask for it in its own pattern.
          if (comps.includes(e.name.toLowerCase())) {
            assert(false, `[${kit.label} wk${week}] ${s.name}: accessory row is the competition lift "${e.name}"`);
          }
        }
      }
    }
  }
});

Deno.test('only a tested lift ever carries a prescribed weight', () => {
  // ⛔ D-322 WITH A NEW FACE, AND NOTHING CAUGHT IT UNTIL MUTATION-TESTING ASKED. The pretest
  // measures four lifts. A pull-up shares the `pull_upper` pattern with nothing that was tested and
  // a hip thrust shares `hinge_lower` with the deadlift — prescribing either off the neighbouring
  // lift's number produces "Pull Up @ 205 lb", a real weight for a movement that has none.
  const comps = Object.values(BASE_ARGS.competitionLifts).map((c) => String(c).toLowerCase());
  for (const kit of KITS) {
    for (const [week, column] of [[2, 'standard'], [3, 'standard'], [11, 'taper']] as const) {
      const wk = composeWeek({ ...BASE_ARGS, equipment: kit.equipment, week, column });
      for (const s of wk.sessions) {
        if (s.type !== 'strength') continue;
        for (const e of s.strength_exercises ?? []) {
          if (typeof e.weight !== 'number') continue;
          assert(comps.includes(e.name.toLowerCase()),
            `[${kit.label} wk${week}] "${e.name}" carries a prescribed weight of ${e.weight} and was never tested`);
        }
      }
    }
  }
  // ⚠️ AND THE TESTED LIFTS DO GET ONE — otherwise this passes by prescribing nothing at all.
  const wk = composeWeek({ ...BASE_ARGS, week: 2, column: 'standard' });
  const numbered = wk.sessions.flatMap((s) => s.strength_exercises ?? []).filter((e) => typeof e.weight === 'number');
  assert(numbered.length >= 3, `only ${numbered.length} rows carry a weight`);
});

Deno.test('a movement is never prescribed twice in one day', () => {
  for (const kit of KITS) {
    for (const week of [2, 3, 4]) {
      const wk = composeWeek({ ...BASE_ARGS, equipment: kit.equipment, week, column: 'standard' });
      for (const s of wk.sessions) {
        if (s.type !== 'strength') continue;
        const names = s.strength_exercises!.map((e) => e.name.toLowerCase());
        assertEquals(names.length, new Set(names).size,
          `[${kit.label} wk${week}] ${s.name} repeats a movement: ${names.join(', ')}`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// E — THE LOAD: his rate anchor, his haircut, our double progression
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test("the rate anchor is his, and it is this frame's", () => {
  // ⛔ p247: 1% every 3 weeks for Strength + 5K. ⚠️ NOT the pivot doc's "1%/4wk when running is
  // real" — that is p251's figure, for Strength + Half-Marathon. Per frame, not a running switch.
  assertEquals(RATE_ANCHOR.strength_5k.perWeek, 0.01 / 3);
  assert(RATE_ANCHOR.strength_5k.cite.includes('p247'));
  assertEquals(Math.round(scheduledRise('strength_5k', 3) * 10000) / 10000, 0.01);
  assertEquals(Math.round(scheduledRise('strength_5k', 9) * 10000) / 10000, 0.03);
  assertEquals(scheduledRise('strength_5k', 0), 0);
});

Deno.test("the lower-body haircut is his, and it phases out on his schedule", () => {
  // ⛔ p247: a 3-4% reduction, phased out over 8-10 weeks, at about 2% every three weeks for nine.
  assertEquals(LOWER_HAIRCUT_INITIAL, 0.035);
  assertEquals(LOWER_HAIRCUT_PHASE_OUT_WEEKS, 9);
  assertEquals(Math.round(lowerBodyHaircut(1) * 1000) / 1000, 0.965);
  assertEquals(Math.round(lowerBodyHaircut(3) * 1000) / 1000, 0.965);
  assertEquals(Math.round(lowerBodyHaircut(4) * 1000) / 1000, 0.985);
  assertEquals(Math.round(lowerBodyHaircut(7) * 1000) / 1000, 1);
  assertEquals(lowerBodyHaircut(10), 1, 'the haircut did not phase out');
  assertEquals(lowerBodyHaircut(52), 1, 'the phase-out became a bonus');
});

Deno.test('the haircut composes with the working number and never multiplies into it', () => {
  // ⛔ TWO LAYERS (Michael, 2026-08-23). The working number is how a number is DERIVED from a test;
  // the haircut is a temporary lower-body allowance for the run the day before. Folding one into the
  // other would make the haircut permanent and the phase-out unexpressible.
  const w = WORKING.squat;
  const wk1 = prescribedLoad({ working: w, frame: 'strength_5k', week: 1, isLower: true, pctOfWorkingNumber: 1, roundTo: 5 });
  const wk10 = prescribedLoad({ working: w, frame: 'strength_5k', week: 10, isLower: true, pctOfWorkingNumber: 1, roundTo: 5 });
  assertEquals(wk1.haircut, lowerBodyHaircut(1));
  assertEquals(wk10.haircut, 1);
  // ⛔ THE WORKING NUMBER ITSELF NEVER MOVED. Only what is prescribed FROM it did.
  assertEquals(w.workingNumber, WORKING.squat.workingNumber);
  // ⛔ AND UPPER BODY NEVER SEES IT — it is an allowance for Monday's run landing before Tuesday.
  const upper = prescribedLoad({ working: WORKING.bench, frame: 'strength_5k', week: 1, isLower: false, pctOfWorkingNumber: 1, roundTo: 5 });
  assertEquals(upper.haircut, 1);
});

Deno.test('prescribed weights land on real plates and rise over the block', () => {
  const w = WORKING.bench;
  const a = prescribedLoad({ working: w, frame: 'strength_5k', week: 2, isLower: false, pctOfWorkingNumber: 1, roundTo: 5 });
  const b = prescribedLoad({ working: w, frame: 'strength_5k', week: 11, isLower: false, pctOfWorkingNumber: 1, roundTo: 5 });
  assertEquals(a.weight % 5, 0);
  assertEquals(b.weight % 5, 0);
  assert(b.weight > a.weight, 'the working number did not rise across the block');
  // 2.5 lb plates make a 2.5 lb step reachable.
  const fine = prescribedLoad({ working: w, frame: 'strength_5k', week: 2, isLower: false, pctOfWorkingNumber: 1, roundTo: 2.5 });
  assertEquals(fine.weight % 2.5, 0);
});

Deno.test('double progression is labelled OURS, because the circle of reps is undefined', () => {
  // ⛔ p247 says *"progress here should be through the circle of reps"* and never defines the phrase;
  // it appears nowhere else in the capture (corpus gap G-8). Double progression is the field-standard
  // reading and may well be what he means — it ships labelled ours until his definition is shot.
  assert(/ours/i.test(DOUBLE_PROGRESSION_IS_OURS));
  assert(/circle of reps/i.test(DOUBLE_PROGRESSION_IS_OURS));

  const range = { lo: 6, hi: 12 };
  const rir = { lo: 1, hi: 2 };
  assertEquals(progressionVerdict([{ reps: 12, rir: 2 }, { reps: 12, rir: 1 }], range, rir), 'advance');
  assertEquals(progressionVerdict([{ reps: 12, rir: 0 }, { reps: 12, rir: 0 }], range, rir), 'hold_add_reps');
  assertEquals(progressionVerdict([{ reps: 9, rir: 2 }], range, rir), 'hold_add_reps');
  assertEquals(progressionVerdict([{ reps: 4, rir: 0 }], range, rir), 'back_off');
  // ⛔ NOTHING LOGGED IS NOT A FAILURE. Silence holds; it never resets and it never zeroes.
  assertEquals(progressionVerdict([], range, rir), 'no_evidence');
  assertEquals(progressionVerdict(null, range, rir), 'no_evidence');
  assertEquals(progressionVerdict(undefined, range, rir), 'no_evidence');
  // ⚠️ ME CARRIES NO RIR TARGET (p218 says so outright), so it advances on reps alone rather than
  // waiting for a number nobody asked the athlete for.
  assertEquals(progressionVerdict([{ reps: 5 }], { lo: 1, hi: 5 }, null), 'advance');
  assertEquals(STALL_CONFIRMATIONS, 2);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// F — THE VOCABULARY EDGE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('no screen learns a new word', () => {
  // ⛔ EVERY EMITTED TOKEN IS ONE `materialize-plan` ALREADY PARSES. If the expander stops
  // understanding one, this fails here rather than a watch failing in a car park.
  for (const kit of KITS) {
    for (const [week, column] of [[1, 'standard'], [2, 'standard'], [5, 'standard'], [11, 'taper']] as const) {
      const wk = composeWeek({ ...BASE_ARGS, equipment: kit.equipment, week, column });
      for (const s of wk.sessions) {
        for (const token of s.steps_preset ?? []) {
          const known = MATERIALIZER_RUN_PATTERNS.some((re) => re.test(token.toLowerCase()));
          assert(known, `[${kit.label} wk${week}] "${token}" is not a token the materializer parses`);
          const shaped = EMITTED_TOKEN_SHAPES.some((t) => t.shape.test(token));
          assert(shaped, `[${kit.label} wk${week}] "${token}" is not a shape this edge declares`);
        }
        // ⛔ AND THE `type` FIELD STAYS IN THE EXISTING VOCABULARY.
        assert(['run', 'ride', 'swim', 'strength'].includes(s.type), `unknown session type "${s.type}"`);
      }
    }
  }
  // The declared shapes are self-consistent — each example matches its own regex and a materializer one.
  for (const t of EMITTED_TOKEN_SHAPES) {
    assert(t.shape.test(t.example), `${t.example} does not match its own shape`);
    assert(MATERIALIZER_RUN_PATTERNS.some((re) => re.test(t.example)), `${t.example} is not parsed downstream`);
  }
});

Deno.test('a quality session never reaches the watch cold', () => {
  // ⛔ THE PREVIOUS WORK ORDER'S STAGE 1 EXISTED TO KILL THIS. Stage 1 builds the warm-up as part of
  // the session; the edge must carry it through, and the wrapper must lead.
  const wk = composeWeek({ ...BASE_ARGS, week: 2, column: 'standard' });
  for (const s of wk.sessions) {
    if (s.type !== 'run') continue;
    const steps = s.steps_preset ?? [];
    const isQuality = steps.some((t) => /^(interval|cruise)_/.test(t));
    if (!isQuality) continue;
    assert(/^warmup_/.test(steps[0]), `${s.name} starts on "${steps[0]}", not a warm-up`);
    assert(steps.some((t) => /^cooldown_/.test(t)), `${s.name} has no cooldown`);
  }
});

Deno.test('an untranslatable family fails loudly rather than emitting a dropped token', async () => {
  const { translateEnduranceSession } = await import('./session-vocabulary.ts');
  const { buildEnduranceSession } = await import('../endurance-library/index.ts');
  const ride = buildEnduranceSession({ family: 'ride_vo2', level: 2, baselines: BASELINES });
  assertThrows(() => translateEnduranceSession(ride), Error, 'no session-vocabulary translation');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// G — THE ADVANCED TIER: a program tier, never an athlete dial
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the advanced tier gates on running the athlete already does', () => {
  // ⛔ RULED 2026-08-23. p247 recommends one or two extra VT1 sessions for more advanced runners;
  // pivot §2 says convert, never add. Both stand, because the athlete never self-selects into volume
  // they do not already hold — the engine gates it on DEMONSTRATED history.
  assertEquals(advancedTierSessions(null), 0);
  assertEquals(advancedTierSessions(undefined), 0);
  assertEquals(advancedTierSessions(0), 0);
  assertEquals(advancedTierSessions(ADVANCED_TIER_MIN_WEEKLY_MILES - 1), 0);
  assertEquals(advancedTierSessions(ADVANCED_TIER_MIN_WEEKLY_MILES), 1);
  assertEquals(advancedTierSessions(ADVANCED_TIER_MIN_WEEKLY_MILES * 2), 2);

  const base = composeWeek({ ...BASE_ARGS, week: 2, column: 'standard' });
  const tiered = composeWeek({ ...BASE_ARGS, week: 2, column: 'standard', demonstratedWeeklyMiles: 60 });
  const baseRuns = base.sessions.filter((s) => s.type === 'run').length;
  const tieredRuns = tiered.sessions.filter((s) => s.type === 'run').length;
  assertEquals(baseRuns, 4);
  assertEquals(tieredRuns, 6, 'the tier did not add its sessions');

  // ⛔ EASY ONLY. The tier exists to test recovery; a hard session would test something else.
  for (const s of tiered.sessions.filter((x) => x.tags.includes('advanced_tier'))) {
    assertEquals(s.name, 'Easy Run');
    assert((s.steps_preset ?? []).every((t) => /^run_easy_/.test(t)), `${s.name} is not easy`);
  }
  // ⛔ AND NEVER IN THE TAPER. A taper that grows is not a taper.
  const taper = composeWeek({ ...BASE_ARGS, week: 11, column: 'taper', demonstratedWeeklyMiles: 60 });
  assertEquals(taper.sessions.filter((s) => s.tags.includes('advanced_tier')).length, 0);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// H — DOSING: the whole week, strength sets included
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the ledger sees the strength sets, and no week breaks the ceiling or the floor', () => {
  // ⛔ p147 PUTS HIGH-INTENSITY WORK SETS FROM STRENGTH WORK IN THE SAME BUCKET. A ledger fed only
  // accessories under-reports every session and the fourteen-set line never fires.
  for (const kit of KITS) {
    for (const [week, column] of [[1, 'standard'], [2, 'standard'], [5, 'standard'], [9, 'standard'], [11, 'taper']] as const) {
      const wk = composeWeek({ ...BASE_ARGS, equipment: kit.equipment, week, column });
      const where = `[${kit.label} wk${week} ${column}]`;
      assert(wk.ledger.perSession.length >= 2, `${where}: the ledger saw almost nothing`);

      // ⛔ THE LEDGER'S COUNT MUST MATCH WHAT THE COMPOSER ACTUALLY EMITTED, ROW FOR ROW. A weaker
      // check — "some session counts more than three" — passed while the ledger was fed empty
      // sessions, because the accessory floor then filled them and the total came back plausible.
      // Mutation-testing found that. The ME and HYP rows on a lifting day are p147's bucket, and the
      // ledger has to see exactly those.
      for (const s of wk.sessions) {
        if (s.type !== 'strength' || s.tags.includes('plyo')) continue;
        const line = wk.ledger.perSession.find((l) => l.label === s.name);
        if (!line) continue;
        const emitted = (s.strength_exercises ?? []).reduce((a, e) => a + (e.sets ?? 0), 0);
        // ⚠️ AGAINST `totalIfAllCounted`, NOT `countedSets` — stage 3 deliberately leaves DE and
        // SKILL out of p147's bucket (both sit at 3-4 RIR, both explicitly non-fatiguing) and
        // reports the count both ways. The composer's rows are the sum of all of them.
        assertEquals(line.totalIfAllCounted, emitted,
          `${where}: "${s.name}" — the ledger saw ${line.totalIfAllCounted} sets, the plan emitted ${emitted}`);
        assert(line.countedSets > 0, `${where}: "${s.name}" counted no work sets at all`);
      }
      for (const s of wk.ledger.perSession) {
        assert(s.countedSets < 14, `${where}: "${s.label}" carries ${s.countedSets} work sets`);
      }
      assertEquals(wk.ledger.belowFloor, [], `${where}: muscles left below the floor`);
    }
  }
});

Deno.test('the plyo day is his drill count and stop rule, and our effort count', () => {
  // ⛔ p227 gives the count ("more than three or four … is likely a waste of time") and the stop rule
  // (quality, not reps). ⚠️ THE EFFORTS PER DRILL ARE OURS — he says "multiple times" and no number.
  assertEquals(PLYO_DOSE.drillsPerDay, 3);
  assert(PLYO_DOSE.drillCountIsHis.includes('p227'));
  assert(/ours/i.test(PLYO_DOSE.effortCountIsOurs));
  const wk = composeWeek({ ...BASE_ARGS, week: 2, column: 'standard' });
  const plyo = wk.sessions.find((s) => s.tags.includes('plyo'))!;
  assertEquals(plyo.day, 'Wednesday');
  assertEquals(plyo.strength_exercises![0].sets, 3);
  assertEquals(plyo.strength_exercises![0].load_prescribed, false);
  assert(wk.notes.some((n) => n.kind === 'ours' && /multiple times/.test(n.text)));
});

Deno.test('the ambiguous notation is carried as a gap, not resolved silently', () => {
  // ⚠️ `1 x HYP: Accessory: accessory lower` names a category that is not in pp.218-223. Resolved
  // conservatively and SAID — the reading is recorded rather than presented as his.
  const wk = composeWeek({ ...BASE_ARGS, week: 2, column: 'standard' });
  assert(wk.notes.some((n) => n.kind === 'gap' && /accessory lower/.test(n.text)),
    'the ambiguous slot notation was resolved without saying so');
});

Deno.test('a block runs test week first and holds its shape throughout', () => {
  const block = composeBlock({ ...BASE_ARGS, weeks: 12, taperWeeks: [11, 12] });
  assertEquals(block.length, 12);
  assert(block[0].isTestWeek);
  assert(!block[1].isTestWeek);
  assertEquals(block.filter((w) => w.column === 'taper').length, 2);
  for (const wk of block) {
    assertEquals(wk.sessions.filter((s) => s.type === 'strength' && !s.tags.includes('plyo')).length, 4,
      `wk${wk.week} lost a lifting day`);
    assertEquals(wk.ledger.belowFloor, [], `wk${wk.week} left a muscle below the floor`);
  }
});

Deno.test('an unknown frame or column is refused, not guessed', () => {
  assertThrows(() => composeWeek({ ...BASE_ARGS, frame: 'nope' as never, week: 2, column: 'standard' }));
  assertThrows(() => composeWeek({ ...BASE_ARGS, week: 2, column: 'nope' as never }));
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// I — CLIENT-REACHABLE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('the module carries nothing that would break in a browser', async () => {
  const dir = new URL('.', import.meta.url).pathname;
  // ⛔⛔ THE DIRECTORY, NOT A LIST (widened 2026-08-23, slice 2) — same reason as the lint above:
  // five files were added to this module and a hand-written list would have let all five past.
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) names.push(entry.name);
  }
  assert(names.length >= 6, 'the browser lint found almost no files — it is not reading the directory');
  for (const name of names) {
    const src = await Deno.readTextFile(dir + name);
    assert(!/\bDeno\./.test(src), `${name} touches Deno`);
    assert(!/from ['"]https:/.test(src), `${name} imports over https`);
    assert(!/createClient|@supabase\/supabase-js/.test(src), `${name} reaches for a supabase client`);
    assert(!/\bprocess\.env\b/.test(src), `${name} reads process.env`);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const m of code.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)) {
      assert(m[1].startsWith('.'), `${name} imports "${m[1]}", which the client cannot resolve`);
    }
  }
});
