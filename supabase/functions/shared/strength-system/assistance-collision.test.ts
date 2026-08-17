// THE ASSISTANCE INVARIANTS — per-day picker (D-407, Wendler 5/3/1 Forever p.24).
//
// ⛔ THIS FILE HAS BEEN REWRITTEN TWICE AND BOTH REWRITES ARE THE SAME LESSON. Read it before
// adding a test here.
//
// **2026-08-05.** It pinned "nothing in a session repeats the main lift's pattern", over every slot.
// That invariant is what made a press day structurally unable to show a push — a push always shares
// a press's family, so the push slot could never hold a push, and it resolved through a fallback list
// whose four entries were all pulls. **The test passed. The block was wrong.** A green suite proves
// the code does what the test says, not that the test says the right thing.
//
// **2026-08-13 (this one).** The invariants that replaced it were correct, sourced page by page, and
// pinned a MODEL that has now been retired:
//
//   UPPER days (Bench, OHP)      push · pull · arm          p.48, pp.50-51, p.52, p.87
//   LOWER days (Squat, Deadlift) leg · leg · core           p.51, p.53, p.55, p.48
//   pull slot crosses the plane under the concurrent template only    p.86
//
// None of that was wrong. All of it existed because the athlete made THREE picks for TWELVE slots,
// so nine had to be inferred — and every one of those tests was pinning the quality of an inference
// nobody had asked for. Forever p.24 asks for one movement per category per day; asked directly, the
// inference and its test suite both disappear. **The old expectations are recorded above rather than
// deleted, because "we used to assert the opposite" is the single most useful thing a future session
// can read here.**
//
// ⚠️ THE D-406 TESTS BELOW ARE UNCHANGED IN SUBSTANCE and are the ones that must never go: the plan
// prescribes no assistance load, ever. That rule outlived both rewrites and is not part of either
// model.
//
// Deterministic: no LLM anywhere in this path, so one run is definitive.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/assistance-collision.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assistanceTotalReps,
  ASSISTANCE_TOTAL_REPS_FLOOR,
  ASSISTANCE_TOTAL_REPS_CEILING,
  ASSISTANCE_BAND_BY_HARD_DAYS,
  assistanceBasisNote,
  CAPACITY_STANDARD,
} from '../../../../src/lib/assistance-menu.ts';
import {
  ASSISTANCE_CATALOG,
  focusPool,
  rankByEquipmentFit,
  assistancePeersFor,
  BALANCED_WEEK,
  buildDefaultWeek,
  catalogEntry,
  LIFT_DAYS,
  liftDayForMainLift,
  normalizeAssistancePrefs,
  resolveDayAssistance,
  splitRepsForAbs,
} from '../../../../src/lib/assistance-catalog.ts';
import { resolveExerciseConfig } from '../../../../src/lib/exercise-config.ts';
import {
  canPerform as canPerformCat,
  equipmentFitRank,
  hasLoadableFit,
  LAST_RESORT_RANK_FLOOR,
} from '../../../../src/lib/strength-gear.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 150, squat: 200, deadlift: 225, overheadPress: 95 };
const base = { durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: null, enduranceFrequency: 0 };

const assistanceRowsOf = (plan: any) =>
  (Object.values(plan.sessions_by_week).flat() as any[])
    .flatMap((s: any) => (s.strength_exercises ?? []).map((e: any) => ({ ...e, session: s.name })))
    .filter((e: any) => e.load_prescribed === false);

// ── D-322: every name the picker can store must resolve EXACTLY ───────────────────────────────────

Deno.test('D-322 — every catalog name has an EXACT config key, not a fuzzy borrow', () => {
  const bad: string[] = [];
  for (const e of ASSISTANCE_CATALOG) {
    const r = resolveExerciseConfig(e.name);
    if (r.via !== 'exact' && r.via !== 'folded') bad.push(`${e.name} → via=${r.via} (${r.matchedKey})`);
  }
  assertEquals(bad, [], 'a stored name that only fuzzy-matches borrows another movement\'s prescription');
});

Deno.test('D-322 — the balanced default week only names movements that are in the catalog', () => {
  const bad: string[] = [];
  for (const day of LIFT_DAYS) {
    for (const name of Object.values(BALANCED_WEEK[day])) {
      if (!catalogEntry(name)) bad.push(`${day}: ${name}`);
    }
  }
  assertEquals(bad, [], 'the default week names a movement the picker cannot offer');
});

Deno.test('the DISPLAY name is an alias, never a second token', () => {
  // Wendler's word is what the athlete reads; the config's canonical is what is stored. The three
  // that differ are the whole reason the two fields exist.
  assertEquals(catalogEntry('Back Extension')?.display, 'Back Raise');
  assertEquals(catalogEntry('Dumbbell Curl')?.display, 'Curls');
  assertEquals(catalogEntry('Ab Wheel Rollout')?.display, 'Ab Wheel');
  // ⛔ AND THE DISPLAY NAME IS NEVER STORED. Looking one up as a stored name must find nothing.
  for (const alias of ['Back Raise', 'Curls', 'Ab Wheel']) {
    assertEquals(catalogEntry(alias), null, `${alias} is a label — it must not resolve as a stored name`);
  }
});

// ── THE FRAME: three categories, every day, one movement each ─────────────────────────────────────

Deno.test('⛔ EVERY LIFTING DAY CARRIES PUSH · PULL · SINGLE-LEG/CORE — the frame is locked', () => {
  const prefs = normalizeAssistancePrefs(null);
  for (const day of LIFT_DAYS) {
    const rows = resolveDayAssistance(prefs, day, 50);
    assertEquals(rows.map((r) => r.category), ['push', 'pull', 'single_leg_core'], `${day}`);
    for (const r of rows) {
      assertEquals(catalogEntry(r.name)?.category, r.category, `${day}: ${r.name} is in the wrong category`);
    }
  }
});

Deno.test('⛔ THE ATHLETE\'S PICK IS WHAT APPEARS — nothing is re-roled, on any day', () => {
  // This is the whole of D-407 in one assertion. Under the old model a push pick on a squat day
  // became a core movement and the app printed a sentence explaining why.
  const prefs = normalizeAssistancePrefs({
    version: 2,
    by_day: {
      press: { push: 'Push-Up', pull: 'Barbell Row', single_leg_core: 'Front Squat' },
      bench: { push: 'Push-Up', pull: 'Barbell Row', single_leg_core: 'Front Squat' },
      squat: { push: 'Push-Up', pull: 'Barbell Row', single_leg_core: 'Front Squat' },
      deadlift: { push: 'Push-Up', pull: 'Barbell Row', single_leg_core: 'Front Squat' },
    },
    focus: [],
  });
  for (const day of LIFT_DAYS) {
    assertEquals(resolveDayAssistance(prefs, day, 50).map((r) => r.name),
      ['Push-Up', 'Barbell Row', 'Front Squat'], `${day} did not honour the picks`);
  }
});

Deno.test('the balanced default is Wendler\'s own pairings (Triumvirate p.48, Bible p.51)', () => {
  // ⛔ THE PRESS ROW IS GONE WITH ITS DAY (slice 5, 2026-08-17). It pinned Triumvirate p.48's press
  // pairing — Dips + Chin-Up — and there is no press day to carry it: the press is trained on the
  // deadlift's day, which keeps its own block (§1e, one round per stacked day).
  assertEquals(BALANCED_WEEK.bench.push, 'DB Bench Press');
  assertEquals(BALANCED_WEEK.bench.pull, 'Dumbbell Row');
  // p.51: squat day → low back; deadlift day → hamstrings.
  assertEquals(BALANCED_WEEK.squat.single_leg_core, 'Back Extension');
  assertEquals(BALANCED_WEEK.deadlift.single_leg_core, 'Glute-Ham Raise');
  // ⚠️ AND THE DEFAULT WEEK NOW CARRIES NO ABS MOVEMENT. It used to land once, on the press day —
  // the only day with no lower-body main lift. That day is gone, so it is asserted as ABSENT rather
  // than left unsaid: an athlete reaches abs through "+ abs" or the Abs focus chip. This is a
  // content consequence of the merge, and pinning it is what stops it being rediscovered as a bug.
  assertEquals(
    Object.values(BALANCED_WEEK).some((d) => d.single_leg_core === 'Hanging Leg Raise'), false,
    'the balanced week grew an abs default back without a decision',
  );
  assertEquals(Object.keys(BALANCED_WEEK).sort(), ['bench', 'deadlift', 'squat']);
});

Deno.test('the days do not run the same movement in a category', () => {
  const prefs = normalizeAssistancePrefs(null);
  for (const category of ['push', 'pull', 'single_leg_core'] as const) {
    const names = LIFT_DAYS.map((d) => prefs.by_day[d][category]);
    assertEquals(new Set(names).size, LIFT_DAYS.length,
      `${category} repeats across the week: ${names.join(', ')}`);
  }
});

// ── STORAGE: migrate, never strand ────────────────────────────────────────────────────────────────

Deno.test('⛔ THE OLD FLAT 3-PICK SHAPE MIGRATES — an existing goal does not strand (D-322 class)', () => {
  // Every goal created before 2026-08-13 carries this shape. Its three picks become every day's
  // three picks, which is what the old model MEANT before its re-roling moved them around.
  const prefs = normalizeAssistancePrefs({
    push: 'Dumbbell Bench Press', pull: 'Pull Up', single_leg_core: 'Bulgarian Split Squat',
  });
  assertEquals(prefs.version, 2);
  for (const day of LIFT_DAYS) {
    // Legacy aliases: the old menu's names map to their catalog equivalents rather than reverting.
    assertEquals(prefs.by_day[day].push, 'DB Bench Press', `${day} push`);
    assertEquals(prefs.by_day[day].pull, 'Chin-Up', `${day} pull`);
    assertEquals(prefs.by_day[day].single_leg_core, 'Bulgarian Split Squat', `${day} leg`);
  }
});

Deno.test('a legacy pick with NO catalog equivalent falls back per slot, not per week', () => {
  // `Single Leg Hip Thrust` is not in Forever's assistance chapter and has no honest equivalent, so
  // it falls to the day's balanced default — while the athlete's other two picks are kept.
  const prefs = normalizeAssistancePrefs({
    push: 'Dips', pull: 'Dumbbell Row', single_leg_core: 'Single Leg Hip Thrust',
  });
  assertEquals(prefs.by_day.squat.push, 'Dips');
  assertEquals(prefs.by_day.squat.pull, 'Dumbbell Row');
  assertEquals(prefs.by_day.squat.single_leg_core, BALANCED_WEEK.squat.single_leg_core);
});

Deno.test('absent, null, garbage and a wrong-category pick all produce a COMPLETE week', () => {
  for (const raw of [null, undefined, {}, 'nonsense', 42, [], { by_day: { press: { push: 'Barbell Row' } } }]) {
    const prefs = normalizeAssistancePrefs(raw);
    for (const day of LIFT_DAYS) {
      const p = prefs.by_day[day];
      assertEquals(!!p.push && !!p.pull && !!p.single_leg_core, true, `${JSON.stringify(raw)} → ${day} incomplete`);
      // A pull movement offered as a push pick is rejected, not accepted into the wrong slot.
      assertEquals(catalogEntry(p.push)?.category, 'push');
    }
  }
});

Deno.test('the focus cap is three, and unknown chips are dropped rather than stored', () => {
  const prefs = normalizeAssistancePrefs({
    focus: ['chest', 'back', 'abs', 'glutes', 'legs', 42],
  });
  assertEquals(prefs.focus.length, 3);
  assertEquals(prefs.focus, ['chest', 'back', 'abs']);
});

// ── FOCUS ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test('a focus re-points ONLY its own category, and rotates rather than repeating', () => {
  const week = buildDefaultWeek(['chest'], ['Commercial gym']);
  const pushes = LIFT_DAYS.map((d) => week[d].push);
  // Every push is a chest movement…
  for (const name of pushes) {
    assertEquals(catalogEntry(name)?.focus.includes('chest'), true, `${name} is not a chest movement`);
  }
  // …and they are not all the same one. 200 reps a week of one movement is what D-328 fixed.
  assertEquals(new Set(pushes).size > 1, true, 'the focus put one movement on all four days');
  // The other two categories are untouched by a chest focus.
  assertEquals(LIFT_DAYS.map((d) => week[d].pull), LIFT_DAYS.map((d) => BALANCED_WEEK[d].pull));
});

Deno.test('⛔ THE MOVEMENT THAT MATCHES THE ATHLETE\'S OWN KIT LEADS THE POOL', () => {
  // ⛔ THE ROUGH EDGE, PINNED. A bands+dumbbells home gym asking for Arms led with **Triceps
  // Pushdown** — performable, because a band is the pushdown's BACKUP route, but it reads as a cable
  // movement while **Triceps Extension** is a dumbbell movement they own outright. Both passed the
  // gate; only one is what the athlete would reach for.
  const bandsAndDb = ['Resistance bands', 'Dumbbells'];
  assertEquals(focusPool('arms', 'push', bandsAndDb)[0].name, 'Triceps Extension');
  // ⛔ AND THE BAND SORTS LAST OUTRIGHT, not merely second — see the tier test below.
  assertEquals(
    focusPool('arms', 'push', bandsAndDb).filter((e) => canPerformCat(e.name, bandsAndDb)).map((e) => e.name),
    ['Triceps Extension', 'Triceps Pushdown'],
  );
  // Same shape one pool over: bands-only Back led with Lat Pulldown (band = backup) over Inverted
  // Row (needs nothing).
  assertEquals(focusPool('back', 'pull', ['Resistance bands'])[0].name, 'Inverted Row');
  // ⚠️ A CABLE OWNER STILL GETS THE CABLE MOVEMENT — the rule is "best fit", not "avoid cables".
  assertEquals(focusPool('arms', 'push', ['Commercial gym'])[0].name, 'Dips');
  assertEquals(focusPool('back', 'pull', ['Commercial gym'])[0].name, 'Chin-Up');
});

Deno.test('the ranking REORDERS, it never filters — and unknown kit leaves catalog order alone', () => {
  const pool = focusPool('arms', 'push');
  assertEquals(rankByEquipmentFit(pool, ['Resistance bands', 'Dumbbells']).length, pool.length);
  // ⚠️ §0h — no inventory means "we have not asked", so the order is the catalog's, not a guess.
  assertEquals(focusPool('arms', 'push', null).map((e) => e.name), pool.map((e) => e.name));
  assertEquals(focusPool('arms', 'push', []).map((e) => e.name), pool.map((e) => e.name));
  // Un-performable movements sort LAST rather than disappearing — a caller that has not filtered
  // still sees them.
  const ranked = rankByEquipmentFit(focusPool('chest', 'push'), ['Resistance bands']);
  assertEquals(ranked.length, focusPool('chest', 'push').length);
  assertEquals(ranked[0].name, 'Push-Up');
});

Deno.test('the built week takes the best-fit movement, not the first catalog entry', () => {
  const week = buildDefaultWeek(['arms'], ['Resistance bands', 'Dumbbells']);
  const pushes = LIFT_DAYS.map((d) => week[d].push);
  assertEquals(pushes[0], 'Triceps Extension', 'day one did not lead with the dumbbell movement');
  for (const name of pushes) {
    assertEquals(catalogEntry(name)?.focus.includes('arms'), true, `${name} is not an arms movement`);
  }
});

// ── ⛔ A BAND IS A LAST RESORT, NOT AN IMPLEMENT ──────────────────────────────────────────────────

Deno.test('⛔ A BAND-ONLY MOVEMENT RANKS BELOW EVERY LOADABLE ONE', () => {
  const dbBands = ['Dumbbells', 'Resistance bands'];
  // Extension reaches via dumbbells (loadable); the pushdown only via a band.
  assertEquals(hasLoadableFit('Triceps Extension', dbBands), true);
  assertEquals(hasLoadableFit('Triceps Pushdown', dbBands), false);
  assertEquals(equipmentFitRank('Triceps Extension', dbBands)! < LAST_RESORT_RANK_FLOOR, true);
  assertEquals(equipmentFitRank('Triceps Pushdown', dbBands)! >= LAST_RESORT_RANK_FLOOR, true);
  // ⚠️ STILL PERFORMABLE. This is an ORDER, not a gate — nothing was excluded.
  assertEquals(canPerformCat('Triceps Pushdown', dbBands), true);
});

Deno.test('⛔ THE ROTATION NEVER SURFACES A BAND-ONLY MOVEMENT WHEN A LOADABLE ONE EXISTS', () => {
  // Ranking the pool fixes which movement LEADS. It does NOT stop the rotation reaching the band
  // movement on day two — the same wrong answer arriving a day later, which is what this pins.
  const kit = ['Dumbbells', 'Resistance bands', 'Bench (flat/adjustable)'];
  const week = buildDefaultWeek(['arms'], kit);
  const pushes = LIFT_DAYS.map((d) => week[d].push);
  assertEquals(pushes.includes('Triceps Pushdown'), false, 'the banded pushdown surfaced on rotation');
  // Concrete: Triceps Extension / Dips, never the banded pushdown.
  for (const name of pushes) {
    assertEquals(['Triceps Extension', 'Dips'].includes(name), true, `${name} is not a loadable arms movement`);
  }
});

// ── THE GLUTES POOL, AND THE ONE MOVEMENT THAT IS NOT WENDLER'S ─────────────────────────────────

Deno.test('⛔ THE GLUTES FOCUS ANSWERS ITS OWN NAME — a hip thrust, not three posterior-chain moves', () => {
  // Forever's assistance chapter has NO true glute movement, so this focus was served by a hamstring
  // raise, a back raise and a reverse hyper. A chip that cannot answer its own name is worse than no
  // chip. The warrant for adding one is his: p.24, "it is the work that matters".
  const HOME = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
    'Bench (flat/adjustable)', 'Pull-up bar'];
  const pool = focusPool('glutes', 'single_leg_core', HOME)
    .filter((e) => canPerformCat(e.name, HOME)).map((e) => e.name);
  // ⛔ THE BARBELL VERSION LEADS. The loaded lift is the movement; the single-leg one is the answer
  // for an athlete with no barbell.
  assertEquals(pool[0], 'Barbell Hip Thrust');
  assertEquals(pool[1], 'Single-Leg Hip Thrust');
  // ⚠️ THE ROTATION'S FIRST DAY, NOT THE PRESS DAY. `buildDefaultWeek` walks the pool by day INDEX,
  // and the press key is deleted (slice 5) — so the leading movement lands on `LIFT_DAYS[0]`, which
  // is the squat day. Read off the list rather than naming a day, so this cannot silently re-point
  // again if the order changes.
  assertEquals(buildDefaultWeek(['glutes'], HOME)[LIFT_DAYS[0]].single_leg_core, 'Barbell Hip Thrust');
});

Deno.test('the bodyweight hip thrust carries the glutes focus when there is no barbell', () => {
  // ⛔ THE POOL MUST NOT GO EMPTY on a kit that can obviously train glutes. Before the pair was
  // added, a dumbbells+bands athlete asking for Glutes got NOTHING — every option needed a barbell
  // or a bench — and the focus silently fell through to the balanced default.
  const DB = ['Dumbbells', 'Resistance bands'];
  const pool = focusPool('glutes', 'single_leg_core', DB)
    .filter((e) => canPerformCat(e.name, DB)).map((e) => e.name);
  assertEquals(pool, ['Single-Leg Hip Thrust']);
  assertEquals(buildDefaultWeek(['glutes'], DB).squat.single_leg_core, 'Single-Leg Hip Thrust');
  // The barbell version is correctly off the menu, not silently substituted.
  assertEquals(canPerformCat('Barbell Hip Thrust', DB), false);
});

Deno.test('⛔ EXACTLY ONE MOVEMENT IN THE CATALOG IS NOT WENDLER\'S, and it is labelled', () => {
  // The guardrail is "stay strictly Wendler for movements". This pins the size of the exception, so
  // a second one cannot arrive quietly: the count is the test.
  const nonWendler = ASSISTANCE_CATALOG.filter((e) => e.source.includes('not Wendler'));
  assertEquals(nonWendler.map((e) => e.name).sort(), ['Barbell Hip Thrust', 'Single-Leg Hip Thrust']);
  for (const e of nonWendler) assertEquals(e.muscle, 'glutes');
  // Everything else cites a page or a named template.
  for (const e of ASSISTANCE_CATALOG) {
    if (e.source.includes('not Wendler')) continue;
    assertEquals(/p\.\d+|Simplest Strength|2nd ed/.test(e.source), true, `${e.name}: unsourced (${e.source})`);
  }
});

Deno.test('⛔ CLOSE-GRIP BENCH IS THE MEATY TRICEPS OPTION, and it is Wendler\'s own', () => {
  const HOME = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
    'Bench (flat/adjustable)', 'Pull-up bar'];
  const arms = focusPool('arms', 'push', HOME).filter((e) => canPerformCat(e.name, HOME)).map((e) => e.name);
  // Ahead of the isolation movements — a loaded press beats a triceps extension when it can be
  // loaded. `equipmentFitRank` ties them all at 0, so catalog order is what carries this.
  assertEquals(arms.indexOf('Close-Grip Bench Press') < arms.indexOf('Triceps Extension'), true);
  // ⛔ IT NEEDS THE RACK. Setting up a heavy close-grip press without uprights is how people get
  // pinned, so a bench-and-bar-only kit does not get it.
  assertEquals(canPerformCat('Close-Grip Bench Press', HOME), true);
  assertEquals(canPerformCat('Close-Grip Bench Press', ['Barbell + plates', 'Bench (flat/adjustable)']), false);
  // No exception needed — it is in the book.
  assertEquals(catalogEntry('Close-Grip Bench Press')!.source.includes('not Wendler'), false);
});

Deno.test('⛔ A BANDS-ONLY KIT IS NOT STRANDED — the whole pool rotates as before', () => {
  const bandsOnly = ['Resistance bands'];
  const week = buildDefaultWeek(['arms'], bandsOnly);
  const pushes = LIFT_DAYS.map((d) => week[d].push);
  // Nothing here is reachable without a band, so the band movements are the pool and all of it runs.
  assertEquals(pushes.every((n) => !!catalogEntry(n)), true);
  assertEquals(new Set(pushes).size > 1, true, 'a bands-only kit collapsed to one movement');
  // The band-native movement leads for the athlete whose only implement IS a band.
  assertEquals(pushes[0], 'Triceps Pushdown');
});

Deno.test('⛔ THE FOCUS NEVER OFFERS KIT THE ATHLETE DOES NOT HAVE', () => {
  // Bodyweight only: an abs focus must not hand back an Ab Wheel Rollout.
  const week = buildDefaultWeek(['abs'], ['Resistance bands']);
  for (const day of LIFT_DAYS) {
    assertEquals(week[day].single_leg_core === 'Ab Wheel Rollout', false, `${day} needs a wheel`);
    assertEquals(week[day].single_leg_core === 'Hanging Leg Raise', false, `${day} needs a bar`);
  }
});

// ── ADD-ABS: shares the slot, never stacks ────────────────────────────────────────────────────────

Deno.test('⛔ ADD-ABS SHARES THE SINGLE-LEG/CORE BUDGET — it never adds a fresh total', () => {
  const prefs = normalizeAssistancePrefs({
    version: 2,
    by_day: {
      ...normalizeAssistancePrefs(null).by_day,
      squat: { push: 'Push-Up', pull: 'Lat Pulldown', single_leg_core: 'Reverse Lunge', abs: 'Hanging Leg Raise' },
    },
    focus: [],
  });
  const rows = resolveDayAssistance(prefs, 'squat', 50);
  assertEquals(rows.length, 4, 'the abs add-on did not appear');
  // Still three CATEGORIES — the fourth row is a second single-leg/core movement, not a new axis.
  assertEquals(new Set(rows.map((r) => r.category)).size, 3);
  const slc = rows.filter((r) => r.category === 'single_leg_core');
  assertEquals(slc.reduce((n, r) => n + r.totalReps, 0), 50, 'the slot budget grew');
  assertEquals(slc.map((r) => r.totalReps), [25, 25]);
  assertEquals(rows.find((r) => r.isAbsAddOn)?.name, 'Hanging Leg Raise');
});

Deno.test('the rep split rounds to fives and never leaves a slot empty', () => {
  assertEquals(splitRepsForAbs(50), [25, 25]);
  assertEquals(splitRepsForAbs(75), [40, 35]);
  for (const total of [10, 25, 50, 55, 60, 75]) {
    const [a, b] = splitRepsForAbs(total);
    assertEquals(a + b, total, `${total} did not split cleanly`);
    assertEquals(a >= 5 && b >= 5, true, `${total} produced an empty half`);
  }
});

Deno.test('an abs pick that is not an abs movement is refused', () => {
  const prefs = normalizeAssistancePrefs({
    version: 2,
    by_day: { ...normalizeAssistancePrefs(null).by_day, bench: { push: 'Dips', pull: 'Chin-Up', single_leg_core: 'Reverse Lunge', abs: 'Front Squat' } },
    focus: [],
  });
  assertEquals(prefs.by_day.bench.abs, null);
  assertEquals(resolveDayAssistance(prefs, 'bench', 50).length, 3);
});

// ── REP SCALING: kept through D-407 ───────────────────────────────────────────────────────────────

Deno.test('REGRESSION \u2014 the whole block lives inside 25-50, and it is OURS', () => {
  // ⛔ REWRITTEN 2026-08-16 (§1g). The phase-keyed bands are gone. Michael: *"for an athlete carrying
  // an endurance load, pushing 100 reps of accessory volume will fry their CNS. Cap it at 50, even in
  // the easier months."* His base is 50-100 (p.24); 25-50 is p.23's SEVENTH-WEEK number. So the whole
  // range is a deliberate step below him and must be cited as ours.
  assertEquals(ASSISTANCE_TOTAL_REPS_FLOOR, 25);
  assertEquals(ASSISTANCE_TOTAL_REPS_CEILING, 50);
  assertEquals(ASSISTANCE_BAND_BY_HARD_DAYS[0], [40, 50]);
  assertEquals(ASSISTANCE_BAND_BY_HARD_DAYS[1], [30, 40]);
  assertEquals(ASSISTANCE_BAND_BY_HARD_DAYS[2], [25, 30]);
});

Deno.test('⛔ THE BAND IS SET BY COMPETING STRESS, NOT BY THE CYCLE PHASE (§1g)', () => {
  // ⛔ THIS REPLACES "the direction is anchor-heavy" (p.18), which replaced "the anchor holds the
  // floor". Both were arguments about the CYCLE. The axis is now what actually competes for
  // recovery — how much hard endurance the week carries — and the cycle phase no longer touches the
  // assistance total at all. The p.18 direction is GONE, not reversed; D-432 needs back-annotating.
  assertEquals(assistanceTotalReps('push', { hardEnduranceDays: 0 }).totalReps, 40);
  assertEquals(assistanceTotalReps('push', { hardEnduranceDays: 1 }).totalReps, 30);
  assertEquals(assistanceTotalReps('push', { hardEnduranceDays: 2 }).totalReps, 25);
  // Tested capacity still moves the athlete WITHIN their band — two axes, composing.
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 30, hardEnduranceDays: 0 }).totalReps, 50);
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 30, hardEnduranceDays: 2 }).totalReps, 30);
  // An unknown week reads as ONE hard day — the middle band. Unknown is never licence to prescribe
  // the heaviest, and reading it as zero would hand the busiest athlete the ceiling.
  assertEquals(assistanceTotalReps('push').totalReps, 30);
});

Deno.test('⛔ EVERY SLOT SCALES ON ONE RULE, off Wendler\u2019s own standards (§1f)', () => {
  // Forever p.33: push-ups 100, chins 50, hanging leg raise 50. The pull slot's shipped anchor
  // (8 reps → the floor, +3 per rep) is scaled by the ratio between standards, so the three bands
  // line up instead of needing three hand-picked coefficients.
  assertEquals(CAPACITY_STANDARD.push, 100);
  assertEquals(CAPACITY_STANDARD.pull, 50);
  assertEquals(CAPACITY_STANDARD.single_leg_core, 50);

  // ⛔ THE RULE IS UNCHANGED; THE BAND IT WALKS IS NARROWER (§1g, 2026-08-16). Same anchor (8 reps
  // sits at the floor), same slope (three reps of volume per rep of capacity), same rounding — but
  // the widest band is now 40-50, so the curve reaches its ceiling almost immediately.
  // ⚠️ CONSEQUENCE, STATED: capacity buys far less than it used to. On the 40-50 band a 12-rep chin
  // max already tops the slot out. That is the price of the cap, not a bug in the scaling.
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 8, hardEnduranceDays: 0 }).totalReps, 40);
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 12, hardEnduranceDays: 0 }).totalReps, 50);
  assertEquals(assistanceTotalReps('pull', { pullupMaxReps: 30, hardEnduranceDays: 0 }).totalReps, 50);

  // Push reads twice the standard, so it needs twice the reps to buy the same volume.
  assertEquals(assistanceTotalReps('push', { pushupMaxReps: 16, hardEnduranceDays: 0 }).totalReps, 40);
  assertEquals(assistanceTotalReps('push', { pushupMaxReps: 24, hardEnduranceDays: 0 }).totalReps, 50);

  // Core shares the chin's standard, so it shares the chin's curve.
  assertEquals(assistanceTotalReps('single_leg_core', { hangingLegRaiseMaxReps: 12, hardEnduranceDays: 0 }).totalReps, 50);

  // ⛔ ABSENT IS THE FLOOR AND THE COPY SAYS WHICH — nothing writes push or core capacity today, and
  // that must read as "we have not asked", never as a tested zero.
  assertEquals(assistanceTotalReps('push', { hardEnduranceDays: 0 }).basis, 'posture');
  assertEquals(assistanceTotalReps('push', { pushupMaxReps: 0, hardEnduranceDays: 0 }).totalReps, 40);
  assertEquals(assistanceBasisNote('posture'), 'No tested capacity on file for this movement, so this is the default floor.');
});

Deno.test('⛔ THE CAPACITY SCALING SURVIVED THE MODEL CHANGE — the mock\'s flat 50 did not win', () => {
  // The mock showed 50 everywhere. Flattening would have been a silent loss of sourced behaviour.
  const plan = composeStrengthPrimaryPlan({ ...base, pullupMaxReps: 25 } as any);
  const pulls = assistanceRowsOf(plan).filter((r: any) => catalogEntry(r.name)?.category === 'pull');
  assertEquals(pulls.length > 0, true, 'no pull rows in the block');
  // ⚠️ 50, NOT 75 (§1g, 2026-08-16): this plan carries no hard endurance day, so the band is 40-50
  // and a tested 25-rep capacity tops the slot out at 50 rather than climbing to the old 75.
  assertEquals(pulls.some((r: any) => r.reps === '50 total'), true,
    'a tested 25-rep capacity did not move the pull slot to its band ceiling');
  // ⛔ AND EVERY WEEK READS THE SAME NOW. The cycle phase no longer touches the assistance total, so
  // there is no light-week/anchor difference left to assert — competing stress is the only axis.
  assertEquals(new Set(pulls.map((r: any) => r.reps)), new Set(['50 total']));
});

// ── THE COMPOSER ──────────────────────────────────────────────────────────────────────────────────

Deno.test('the composer gives each lifting day ITS OWN picks', () => {
  const plan = composeStrengthPrimaryPlan({
    ...base,
    assistancePicks: {
      version: 2,
      // ⛔ THREE KEYS, AND THERE IS NO FOURTH TO PASS (slice 5, 2026-08-17). This fixture used to
      // carry a `press` block whose only job was to be discarded. The press has no key now: it is
      // trained on the deadlift's day and reads that day's picks.
      by_day: {
        bench: { push: 'Dips', pull: 'Barbell Row', single_leg_core: 'Front Squat' },
        squat: { push: 'Push-Up', pull: 'Lat Pulldown', single_leg_core: 'Reverse Lunge' },
        deadlift: { push: 'DB Shoulder Press', pull: 'Inverted Row', single_leg_core: 'Glute-Ham Raise' },
      },
      focus: [],
    },
  } as any);
  const rows = assistanceRowsOf(plan);
  const namesFor = (session: string) => rows.filter((r: any) => r.session === session).map((r: any) => r.name);
  assertEquals(namesFor('Strength — Bench Press').slice(0, 3), ['Dips', 'Barbell Row', 'Front Squat']);
  assertEquals(namesFor('Strength — Back Squat').slice(0, 3), ['Push-Up', 'Lat Pulldown', 'Reverse Lunge']);
  // ⛔ THE SHARED DAY BUILDS THE ATHLETE'S DEADLIFT+PRESS PICKS, AND THIS IS THE INVERSION SLICE 5
  // EXISTS FOR. The old assertion here was that a fourth block of picks reached NOTHING — twelve
  // movements asked for, nine built, three discarded in silence. There is no fourth block to
  // discard now, and the three that are stored are the three that appear. ONE round, not two
  // (§1e, p.77).
  assertEquals(namesFor('Strength — Deadlift + Overhead Press').slice(0, 3),
    ['DB Shoulder Press', 'Inverted Row', 'Glute-Ham Raise']);
  // ⛔ ONE ROUND PER WEEK, NOT TWO. `assistanceRowsOf` spans the whole block, so this counts the
  // stacked day's rows in ONE week — three, never six. A second round is what deleting the merge's
  // de-duplication would produce, and it is invisible in a `.slice(0, 3)` assertion.
  const stackedWeek2 = ((plan as any).sessions_by_week['2'] as any[])
    .filter((x: any) => x.name === 'Strength — Deadlift + Overhead Press')
    .flatMap((x: any) => (x.strength_exercises ?? []))
    .filter((e: any) => e.load_prescribed === false && e.name !== 'Box Jump');
  assertEquals(stackedWeek2.length, 3,
    `the stacked day emitted ${stackedWeek2.length} assistance rows: ${stackedWeek2.map((e: any) => e.name).join(', ')}`);
  // ⛔ AND THERE IS NO STANDALONE PRESS SESSION TO CARRY A BLOCK OF ITS OWN.
  assertEquals(namesFor('Strength — Overhead Press'), []);
});

Deno.test('⛔ A STORED `press` KEY FROM AN OLDER GOAL IS DROPPED, NOT READ', () => {
  // Pre-launch, one athlete, no migration (slice 5's standing constraint). An older goal's stored
  // shape carries a fourth key; the normalizer returns the CURRENT shape from any input, so the key
  // does not survive the read and its picks cannot surface on a day nobody assigned them to.
  const prefs = normalizeAssistancePrefs({
    version: 2,
    by_day: {
      press: { push: 'Plate Raise', pull: 'Face Pull', single_leg_core: 'Reverse Hyper' },
      bench: { push: 'Dips', pull: 'Barbell Row', single_leg_core: 'Front Squat' },
      squat: { push: 'Push-Up', pull: 'Lat Pulldown', single_leg_core: 'Reverse Lunge' },
      deadlift: { push: 'DB Shoulder Press', pull: 'Inverted Row', single_leg_core: 'Glute-Ham Raise' },
    },
    focus: [],
  });
  assertEquals(Object.keys(prefs.by_day).sort(), ['bench', 'deadlift', 'squat']);
  const everyPick = LIFT_DAYS.flatMap((d) => [
    prefs.by_day[d].push, prefs.by_day[d].pull, prefs.by_day[d].single_leg_core,
  ]);
  for (const orphan of ['Plate Raise', 'Face Pull', 'Reverse Hyper']) {
    assertEquals(everyPick.includes(orphan), false,
      `${orphan} came from the deleted press key and must not resurface on another day`);
  }
});

Deno.test('the main-lift name maps to the athlete\'s day, and an unknown lift degrades to a complete block', () => {
  // ⛔ THE OVERHEAD PRESS RESOLVES TO THE DEADLIFT'S DAY (slice 5, 2026-08-17), because that is the
  // day it is trained on. It used to return its own `'press'` key and the composer authored a full
  // assistance block for a session the merge then threw away — twelve movements asked for, nine
  // built. This assertion IS the fix: an athlete's picks for "Deadlift + Press" now reach the
  // session that exists.
  assertEquals(liftDayForMainLift('Overhead Press'), 'deadlift');
  assertEquals(liftDayForMainLift('Bench Press'), 'bench');
  assertEquals(liftDayForMainLift('Back Squat'), 'squat');
  assertEquals(liftDayForMainLift('Deadlift'), 'deadlift');
  assertEquals(liftDayForMainLift('Trap Bar Deadlift'), 'deadlift');
  assertEquals(liftDayForMainLift('Zercher Something'), null);
  // §0h — an unrecognised day key degrades to a COMPLETE block, never to an empty session. `'press'`
  // is now exactly such a key: it is not a `LiftDay` any more, and asking for it must still answer.
  const prefs = normalizeAssistancePrefs(null);
  assertEquals(resolveDayAssistance(prefs, 'press' as never, 50).length, 3);
});

// ── THE ARMS FOCUS IS SUBSUMED BY THE CHIN PROGRESSION ───────────────────────────────────────────

const descriptionsOf = (plan: any) =>
  (Object.values(plan.sessions_by_week).flat() as any[])
    .filter((s: any) => s.type === 'strength')
    .map((s: any) => String(s.description ?? ''));

const weekWith = (focus: string[], perf?: string) => ({
  version: 2,
  by_day: normalizeAssistancePrefs(null).by_day,
  focus,
  ...(perf ? { performance_focus: perf } : {}),
});

Deno.test('⛔ BOTH ON → the note says the biceps are already covered, and no curls are booked', () => {
  const plan = composeStrengthPrimaryPlan({
    ...base, pullupMaxReps: 12, assistancePicks: weekWith(['arms'], 'pullups'),
  } as any);
  const withNote = descriptionsOf(plan).filter((d) => d.includes('Arms focus:'));
  assertEquals(withNote.length > 0, true, 'the subsumed-arms note never appeared');
  for (const d of withNote) {
    assertEquals(d.includes('the chins are the biceps volume'), true, d);
    assertEquals(d.includes('no curls are booked on top'), true, d);
    // ⚠️ THE WEEKLY DOSE IS STATED ONCE, by `pullupDoseNote` — not repeated by this line.
    assertEquals((d.match(/chins a week/g) ?? []).length, 1, `the dose was stated twice: ${d}`);
    assertEquals(d.includes('the triceps work is unchanged'), true, d);
  }
  // ⛔ IT IS A NOTE, NOT A MOVEMENT CHANGE. The rows are identical to the same block without it.
  const rows = assistanceRowsOf(plan).map((r: any) => r.name);
  const withoutFocus = assistanceRowsOf(composeStrengthPrimaryPlan({
    ...base, pullupMaxReps: 12, assistancePicks: weekWith([], 'pullups'),
  } as any)).map((r: any) => r.name);
  assertEquals(rows.length, withoutFocus.length, 'the note changed how many rows were authored');
});

Deno.test('the note appears ONLY when both are on', () => {
  const cases: Array<[string, any]> = [
    ['arms focus, no progression', weekWith(['arms'])],
    ['progression, no arms focus', weekWith(['chest'], 'pullups')],
    ['neither', weekWith([])],
  ];
  for (const [label, picks] of cases) {
    const plan = composeStrengthPrimaryPlan({ ...base, pullupMaxReps: 12, assistancePicks: picks } as any);
    for (const d of descriptionsOf(plan)) {
      assertEquals(d.includes('Arms focus:'), false, `${label}: the note leaked`);
    }
  }
});

Deno.test('⛔ THE CLAIM IS TRUE — the progression really does replace the booked curls', () => {
  // The note asserts a fact about the block, so the fact is asserted too. With an Arms focus and no
  // progression the resolver books `Dumbbell Curl`; with the progression it books chins, and the
  // triceps half survives either way.
  const HOME = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage',
    'Bench (flat/adjustable)', 'Pull-up bar'];
  const armsWeek = buildDefaultWeek(['arms'], HOME);
  const off = normalizeAssistancePrefs({ version: 2, by_day: armsWeek, focus: ['arms'] });
  const on = normalizeAssistancePrefs({ version: 2, by_day: armsWeek, focus: ['arms'], performance_focus: 'pullups' });

  const pullsOff = LIFT_DAYS.map((d) => resolveDayAssistance(off, d, 50, null)
    .find((r) => r.category === 'pull')!.name);
  assertEquals(pullsOff.includes('Dumbbell Curl'), true, 'the arms focus stopped booking curls');

  const pullsOn = LIFT_DAYS.map((d) => resolveDayAssistance(on, d, 50, { movement: 'Chin-Up', totalReps: 25 })
    .find((r) => r.category === 'pull')!.name);
  assertEquals(pullsOn.includes('Dumbbell Curl'), false, 'a curl survived the progression');
  // The triceps half is untouched — the note says "unchanged" and this is what makes that true.
  const pushesOn = LIFT_DAYS.map((d) => resolveDayAssistance(on, d, 50, { movement: 'Chin-Up', totalReps: 25 })
    .find((r) => r.category === 'push')!.name);
  assertEquals(pushesOn.every((n) => ['Dips', 'Close-Grip Bench Press', 'Triceps Extension',
    'Triceps Pushdown'].includes(n)), true, pushesOn.join(', '));
});

Deno.test('⛔ NO SUBSTITUTION NOTE IS EVER PRINTED — there is nothing left to apologise for', () => {
  const plan = composeStrengthPrimaryPlan({
    ...base,
    assistancePicks: { push: 'Push Up', pull: 'Pull Up', single_leg_core: 'Bulgarian Split Squat' },
  } as any);
  const descriptions = (Object.values(plan.sessions_by_week).flat() as any[])
    .filter((s: any) => s.type === 'strength')
    .map((s: any) => String(s.description ?? ''));
  assertEquals(descriptions.length > 0, true);
  for (const d of descriptions) {
    assertEquals(d.includes('You picked'), false, 'the retired substitution note is still being printed');
  }
});

// ── THE SWAP SHEET ────────────────────────────────────────────────────────────────────────────────

Deno.test('the swap sheet offers the movement\'s own category, and never itself', () => {
  const peers = assistancePeersFor('Dips', ['Commercial gym']);
  assertEquals(peers !== null, true);
  assertEquals(peers!.includes('Dips'), false);
  for (const p of peers!) assertEquals(catalogEntry(p)?.category, 'push', `${p} is not a push`);
});

Deno.test('the swap sheet is EQUIPMENT-GATED — the half-rule is closed', () => {
  // ⛔ THIS IS SLICE 4's WHOLE POINT. The builder declining to offer a movement and the in-session
  // sheet offering it back an hour later is one rule with two answers.
  const bodyweight = assistancePeersFor('Push-Up', ['Resistance bands']);
  assertEquals(bodyweight!.includes('DB Bench Press'), false, 'offered a dumbbell press with no dumbbells');
  assertEquals(bodyweight!.includes('DB Incline Press'), false, 'offered an incline press with no bench');
  const gym = assistancePeersFor('Push-Up', ['Commercial gym']);
  assertEquals(gym!.includes('DB Bench Press'), true, 'a commercial gym lost its dumbbells');
});

Deno.test('a movement outside the assistance framework is not ours — null, not []', () => {
  assertEquals(assistancePeersFor('Back Squat', ['Commercial gym']), null);
  assertEquals(assistancePeersFor('', null), null);
});

Deno.test('⛔ THE PICKER NEVER HANDS BACK AN EMPTY LIST', () => {
  // An athlete whose kit rules out an entire category gets the full list rather than a dead picker —
  // the substitution backstop can still rewrite whatever they choose.
  for (const category of ['push', 'pull', 'single_leg_core'] as const) {
    const opts = assistancePeersFor(
      ASSISTANCE_CATALOG.find((e) => e.category === category)!.name,
      ['nothing at all'],
    );
    assertEquals((opts ?? []).length > 0, true, `${category} produced an empty swap sheet`);
  }
});

// ── D-406: THE LOAD RULE. Outlived both rewrites; it is not part of either model. ──────────────────

Deno.test('D-406 — a suggestion never becomes a prescription', () => {
  const rows = assistanceRowsOf(composeStrengthPrimaryPlan({
    ...base,
    oneRepMaxes: { bench: 150, squat: 200, deadlift: 225, overhead: 95 },
    fiveKPaceSecPerMi: 435, ftpWatts: 240, assistancePicks: { push: 'Dumbbell Bench Press', pull: 'Dumbbell Row', single_leg_core: 'Bulgarian Split Squat' },
  } as any));

  assertEquals(rows.length > 0, true, 'no assistance rows to check');
  for (const r of rows as any[]) {
    // ⛔ THE PRESCRIPTION IS UNCHANGED. Both of these are what every surface renders and reads; if
    // either moves, the suggestion has stopped being a suggestion.
    assertEquals(r.weight, 'By feel', `${r.name} stopped saying "By feel"`);
    assertEquals(r.load_prescribed, false, `${r.name} lost the assistance marker`);
    // ⚠️ AND NO FABRICATED INTENSITY. A percentage on one of these rows is the exact thing
    // materialize-plan strips on sight.
    assertEquals(r.percent_1rm, undefined, `${r.name} carries a fabricated intensity`);
    // Absent means "no suggestion" — never a prescribed zero.
    if ('weight_suggested' in r) {
      assertEquals(typeof r.weight_suggested === 'number' && r.weight_suggested > 0, true,
        `${r.name} carries a non-positive suggestion`);
    }
  }
});

Deno.test('D-406 — bodyweight movements get NO suggested weight, ever', () => {
  // ⛔ `Dips` IS THE CASE THAT MATTERS. It carries a real bench ratio (0.9) and would price happily,
  // which is exactly why it is excluded deliberately rather than by accident: for the athlete this
  // block is written for it is bodyweight work, and the athlete finds their own level.
  const rows = assistanceRowsOf(composeStrengthPrimaryPlan({
    ...base,
    oneRepMaxes: { bench: 150, squat: 200, deadlift: 225, overhead: 95 },
  fiveKPaceSecPerMi: 435, ftpWatts: 240, } as any)).filter((r: any) =>
    ['Dips', 'Chin-Up', 'Push-Up', 'Hanging Leg Raise', 'Inverted Row'].includes(r.name));
  assertEquals(rows.length > 0, true, 'no bodyweight rows in the block');
  for (const r of rows as any[]) {
    assertEquals(r.weight_suggested, undefined, `${r.name} was handed a suggested weight`);
  }
});

Deno.test('D-406 — no maxes on file means no suggestion, not a guess', () => {
  // §0h, one field over: unknown degrades to ABSENT, never to a number.
  const rows = assistanceRowsOf(composeStrengthPrimaryPlan({ ...base, oneRepMaxes: {} } as any));
  assertEquals(rows.length > 0, true, 'no assistance rows to check');
  for (const r of rows as any[]) {
    assertEquals(r.weight_suggested, undefined, `${r.name} invented a number with no maxes on file`);
  }
});

Deno.test('D-406 — every loadable catalog option resolves against the OneRepMaxes vocabulary', () => {
  // ⛔ THE GUARD ON A SILENT MISS. `exercise-config` says `primaryRef: 'overhead'`; `OneRepMaxes` says
  // `overheadPress`. Indexing one with the other returns `undefined`, which this feature reads as
  // "no suggestion" — a legitimate output, so nothing fails and the number is simply absent.
  // Asserts by OUTPUT: every loadable option must actually produce a suggestion for an athlete with
  // all four maxes on file.
  const loadable = ['DB Shoulder Press', 'DB Bench Press', 'DB Incline Press', 'Dumbbell Row',
    'Barbell Row', 'Front Squat', 'Reverse Lunge', 'Bulgarian Split Squat', 'Dumbbell Curl',
    'Triceps Extension', 'Triceps Pushdown', 'Lat Pulldown'];
  for (const name of loadable) {
    const category = catalogEntry(name)!.category;
    const week = normalizeAssistancePrefs(null);
    for (const day of LIFT_DAYS) week.by_day[day][category] = name;
    const rows = assistanceRowsOf(composeStrengthPrimaryPlan({ ...base, assistancePicks: week } as any))
      .filter((r: any) => r.name === name);
    assertEquals(rows.length > 0, true, `${name} never reached a session`);
    assertEquals(rows.some((r: any) => typeof r.weight_suggested === 'number' && r.weight_suggested > 0),
      true, `${name} produced no suggestion for an athlete with all four maxes on file`);
  }
});
