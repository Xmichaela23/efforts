/**
 * STRENGTH FOCUS (BARBELL, 4-DAY) — the composer's contract with docs/SPEC-get-stronger.md.
 *
 * These assert the ROWS, not the formula. Every error in the 2026-07-24 strength audit was the same
 * shape — asserting from the arithmetic instead of reading what the composer actually authored — so
 * the week tables below are written out longhand from the spec and compared against real output.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  blockWeeks,
  buildBlockPhases,
  composeStrengthPrimaryPlan,
  descentIsJogged,
  isBodyweightName,
  JUMPS,
} from './strength-primary-plan.ts';
import { placeLiftingWeek } from './place-week.ts';
import { ASSISTANCE_MENU } from '../../../../src/lib/assistance-menu.ts';
import { getExerciseConfig } from '../../../../src/lib/exercise-config.ts';

const MAXES = { bench: 225, squat: 315, deadlift: 405, overheadPress: 135 };

const PLAN = composeStrengthPrimaryPlan({
  durationWeeks: 12,
  oneRepMaxes: MAXES,
  enduranceSport: 'run',
  enduranceFrequency: 3,
  targetWeeklyMiles: 20,
  easyPaceMinPerMile: 9,
});

const sessionsFor = (week: number) => PLAN.sessions_by_week[String(week)] ?? [];
const liftRow = (week: number, lift: string) => {
  const s = sessionsFor(week).find((x) => x.type === 'strength' && x.name.includes(lift));
  return s?.strength_exercises?.find((e: any) => e.name === lift);
};
const ramp = (week: number, lift: string) =>
  ((liftRow(week, lift)?.set_plan ?? []) as any[]).map((p) => `${p.weight}x${p.reps}${p.amrap ? '+' : ''}`).join(' ');

// ── The working number ──────────────────────────────────────────────────────

Deno.test('working number is 85% of the real max, rounded DOWN to 5 lb', () => {
  // 225×.85 = 191.25 → 190. 315×.85 = 267.75 → 265. 405×.85 = 344.25 → 340. 135×.85 = 114.75 → 110.
  assertEquals(PLAN.training_max, { bench: 190, squat: 265, deadlift: 340, overheadPress: 110 });
});

// ── The week tables (SPEC §1) ───────────────────────────────────────────────

Deno.test('LEADER cycle: every set is five, top set climbs 85→90→95%, no all-out set', () => {
  // Bench working number 190. 65/75/85 → 123.5/142.5/161.5 → 120/140/160 (round down).
  assertEquals(ramp(1, 'Bench Press'), '120x5 140x5 160x5');
  assertEquals(ramp(2, 'Bench Press'), '130x5 150x5 170x5');
  assertEquals(ramp(3, 'Bench Press'), '140x5 160x5 180x5');
  // ⛔ A leader has NO all-out set. Dropping it is half of what makes the lowered working number
  // lower-fatigue; keeping it is the accidental hybrid SPEC §1 exists to correct.
  for (const week of [1, 2, 3]) {
    for (const p of liftRow(week, 'Bench Press')!.set_plan as any[]) assertEquals(p.amrap, undefined);
  }
});

Deno.test('deload is week 4 of every cycle: 40/50/60%, no jumps, no assistance', () => {
  assertEquals(ramp(4, 'Bench Press'), '75x5 95x5 110x5');
  const rows = sessionsFor(4).find((s) => s.type === 'strength')!.strength_exercises!;
  assertEquals(rows.length, 1, 'a deload is a volume cut — the main lift only');
  assertEquals(PLAN.phaseStructure.recovery_weeks, [4, 8, 12]);
});

Deno.test('the working number steps BETWEEN cycles, never inside one — capped, and under the ceiling', () => {
  // Bench (1RM 225): TM 190 → 195 → 200. Ceiling is 90% of 225 = 200, so cycle 3 lands exactly on it.
  assertEquals(ramp(5, 'Bench Press'), '125x5 145x5 165x5');
  assertEquals(ramp(9, 'Bench Press'), '130x5 150x5 170x5+');
  // ⛔ THE SQUAT IS WHERE THE 90% CEILING BINDS, AND TRUNCATION IS WHY THAT IS FINE (2026-07-28).
  // Squat 1RM 315: TM 265 → 275 → wants 285, ceiling is 90% of 315 = 283.5 → 280, so cycle 3 lands
  // ON 280 rather than being frozen at 275. 65% of 280 = 182 → 180.
  //
  // ⚠️ THIS NUMBER MOVED FROM 185, and the move is the point. Under the superseded 100% ceiling the
  // third cycle reached 285 — 90.5% of the athlete's true max, outside 5/3/1's own 85-90% training-max
  // band, which is what makes the anchor AMRAP a measurement rather than a max attempt.
  assertEquals(ramp(9, 'Back Squat').split(' ')[0], '180x5');
});

Deno.test('ANCHOR cycle: 5/3/1 proper, and the all-out set is the LAST set only', () => {
  assertEquals(ramp(9, 'Bench Press'), '130x5 150x5 170x5+');
  assertEquals(ramp(10, 'Bench Press'), '140x3 160x3 180x3+');
  assertEquals(ramp(11, 'Bench Press'), '150x5 170x3 190x1+');
  const wk11 = liftRow(11, 'Bench Press')!.set_plan as any[];
  assertEquals(wk11.filter((p) => p.amrap).length, 1);
  assertEquals(wk11[wk11.length - 1].amrap, true);
});

Deno.test('the block ends on a deload, and week 12 has no all-out set', () => {
  assertEquals((liftRow(12, 'Bench Press')!.set_plan as any[]).some((p) => p.amrap), false);
});

// ── The per-set prescription ────────────────────────────────────────────────

Deno.test('every main lift carries THREE sets at THREE weights, and they ascend', () => {
  for (let week = 1; week <= 12; week++) {
    for (const lift of ['Bench Press', 'Back Squat', 'Overhead Press', 'Deadlift']) {
      const plan = liftRow(week, lift)?.set_plan as any[] | undefined;
      assert(plan != null && plan.length === 3, `wk${week} ${lift} has no per-set prescription`);
      assert(plan[0].weight < plan[1].weight && plan[1].weight < plan[2].weight,
        `wk${week} ${lift} ramp does not ascend: ${JSON.stringify(plan)}`);
      for (const p of plan) assertEquals(p.weight % 5, 0, `wk${week} ${lift} weight off the 5 lb grid`);
    }
  }
});

Deno.test('the row-level weight/reps carry the TOP set, so pre-existing consumers see the work set', () => {
  const row = liftRow(11, 'Bench Press')!;
  assertEquals(row.weight, 190);
  assertEquals(row.reps, '1+');
  assertEquals(row.sets, 3);
});

Deno.test('percent_1rm is the fraction of the REAL max, and stays buffered by the working number', () => {
  // The hardest set in the block is week 11's 95%-of-working top set: 190 / 225 = 0.844.
  assertEquals(liftRow(11, 'Bench Press')!.percent_1rm, 0.844);
  // Week one sits well inside the athlete — 160/225 = 0.711. Conservative loading, not an on-ramp.
  assertEquals(liftRow(1, 'Bench Press')!.percent_1rm, 0.711);
});

// ── The session (SPEC §1) ───────────────────────────────────────────────────

// ⛔ REWRITTEN 2026-07-26 — this used to assert the exact days ['Monday','Tuesday','Thursday','Friday'].
// That was the hardcoded grid, and the grid is gone: `place-week.ts` now places the bar around the
// athlete's pins, so the days are an OUTPUT and pinning them would pin the bug we just removed.
// What survives is the contract, and it is asserted harder than the day list ever did.
Deno.test('four lifting days, one main lift each, the same days every week', () => {
  const week1 = sessionsFor(1).filter((s) => s.type === 'strength').map((s) => s.day);
  assertEquals(week1.length, 4);
  assertEquals(new Set(week1).size, 4, 'two main lifts landed on the same day');
  for (let week = 1; week <= 12; week++) {
    const strength = sessionsFor(week).filter((s) => s.type === 'strength');
    assertEquals(strength.length, 4, `week ${week}`);
    // Same days every week — 5/3/1 is a fixed weekly shape, only the loading moves.
    assertEquals(strength.map((s) => s.day), week1, `week ${week} moved a lifting day`);
  }
  // All four lifts present exactly once.
  assertEquals(
    sessionsFor(1).filter((s) => s.type === 'strength').map((s) => s.name).sort(),
    ['Strength — Back Squat', 'Strength — Bench Press', 'Strength — Deadlift', 'Strength — Overhead Press'],
  );
});

// ⛔ THE PROPERTY THE OLD DAY-LIST WAS REALLY PROTECTING, now stated directly.
// The grid gave Tue/Fri — 72h between heavy leg days. When placement moved to the solver this
// silently became 48h (legal, minimum, worse), because the proximity penalty flattens at 48 and the
// tiebreak took the earliest day. `place-week` now breaks that tie on maximum spread. This test is
// what stops it regressing again.
Deno.test('heavy leg days are held apart — 48h is the floor, and the solver must beat it', () => {
  const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const lowerDays = sessionsFor(1)
    .filter((s) => s.type === 'strength' && /Back Squat|Deadlift/.test(s.name))
    .map((s) => ORDER.indexOf(s.day))
    .sort((a, b) => a - b);
  assertEquals(lowerDays.length, 2);
  const gapDays = Math.min(lowerDays[1] - lowerDays[0], 7 - (lowerDays[1] - lowerDays[0]));
  assert(gapDays >= 2, `heavy leg days only ${gapDays * 24}h apart — the clearance is 48h`);
  assert(gapDays >= 3, `heavy leg days ${gapDays * 24}h apart; with no pins the week has room for 72h`);
});

Deno.test('⛔ JUMPS ARE ON LOWER DAYS ONLY — an upper day means legs are free', () => {
  // ⛔ THIS TEST ASSERTED `Box Jump` ON THE BENCH SESSION and was green from the day it was written.
  // A box jump is the highest loading-rate item in the block, and `upper` is not a label — it is a
  // LOAD CLAIM read by the solver's 48h clocks, the descent rule, easy-run stacking, the
  // "share no prime movers" stack copy, and the session tag. With jumps on every day the claim was
  // false on all five.
  const upper = sessionsFor(1).find((s) => s.name === 'Strength — Overhead Press')!.strength_exercises!;
  assertEquals(upper.some((r: any) => r.name === 'Box Jump'), false, 'a jump landed on an upper day');
  const lower = sessionsFor(1).find((s) => s.name === 'Strength — Back Squat')!.strength_exercises!;
  assertEquals(lower[0].name, 'Box Jump', 'the lower day lost its primer');
});

Deno.test('a work session is jumps → main lift → 25 reps each of push / pull / single-leg-core', () => {
  // Was `.find(s => s.type === 'strength')` — the FIRST strength session, which assumed the grid
  // put Bench on Monday. Days are the solver's now, so name the lift instead of trusting the order.
  // ⚠️ Named off the SQUAT session now: jumps are lower-day only (see the test above), so the
  // full jumps → main → assistance shape only exists on a lower day.
  const rows = sessionsFor(1).find((s) => s.name === 'Strength — Back Squat')!.strength_exercises!;
  // Defaults, because this plan was built with no picks — skipping the card still yields a block.
  // ⛔ UPDATED FOR Q-212, AND THE TEST WAS PINNING THE DEFECT. It asserted `Reverse Lunge` in the
  // single-leg slot on a BACK SQUAT day — both `knee_dominant`, so the slot repeated the pattern the
  // main lift had just loaded. The default pick collided with the default day, which is why nobody
  // had to choose anything unusual to hit it. It now takes balancing work and the description says so.
  assertEquals(rows.map((r: any) => r.name), ['Box Jump', 'Back Squat', 'Push Up', 'Pull Up', 'Single Leg Hip Thrust']);
  // `sets` is optional on the type now (assistance rows carry a rep TOTAL and no set count), but the
  // jump row always has one — 3×5 = 15, the top of Wendler's 10–15 jumps or throws.
  assertEquals(JUMPS.sets! * (JUMPS.reps as number), 15);
  // ⛔ A REP TOTAL, NOT A SET. Was `assertEquals(r.reps, 25)` alongside `sets: 1`, which rendered as
  // "1×25" and asserted a single set of twenty-five the prescription never asked for. The number is
  // unchanged; what is asserted now is that the row makes no claim about how it is performed.
  for (const r of rows.slice(2) as any[]) {
    assertEquals(r.reps, '25 total');
    assertEquals(r.sets, undefined, `${r.name} carries a set count it was never prescribed`);
    assertEquals(r.load_prescribed, false, `${r.name} must carry no prescribed load`);
  }
});

Deno.test('the athlete’s picks reach the block, and an unknown name falls back rather than failing', () => {
  const picked = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Dips', pull: 'Dumbbell Row', single_leg_core: 'Hanging Leg Raise' },
  });
  // Named, not indexed — `[0]` assumed Bench was the first session, which was the grid's doing.
  const benchOf = (p: any) => p.sessions_by_week['1']
    .find((s: any) => s.name === 'Strength — Bench Press')!.strength_exercises!.map((r: any) => r.name);
  // ⚠️ No Box Jump — bench is an upper day, and the picks still reach it.
  // ⛔ EXCEPT THE ONE THAT COLLIDES (Q-212). `Dips` and `Bench Press` are both `horizontal_push`, so
  // the push slot balances instead — this is the exact case Michael raised, where dips on bench day
  // and dips again on press day made four pushing exposures inside 24 hours. The pull and single-leg
  // picks are untouched, because they do not clash: the rule replaces a slot, never the card.
  assertEquals(benchOf(picked), ['Bench Press', 'Face Pull', 'Dumbbell Row', 'Hanging Leg Raise']);

  // A name that is no longer on the menu must not strand an existing goal.
  const stale = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Bench Press Machine', pull: '', single_leg_core: undefined },
  });
  // `Push Up` is the push default and also collides with Bench Press, so the fallback path lands in
  // the balance pool too — the substitution is a property of the DAY, not of how the pick arrived.
  assertEquals(benchOf(stale), ['Bench Press', 'Face Pull', 'Pull Up', 'Reverse Lunge']);
});

Deno.test('⛔ ASSISTANCE CARRIES NO PRESCRIBED LOAD — including the loaded options', () => {
  // Only the four main lifts are dictated by percentages of the training max. Pricing a dumbbell row
  // off a ratio forces progression on a secondary movement and spends the fatigue budget the
  // athlete's endurance training needs. Every option on the menu, loaded or not, is by feel.
  const picked = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Dumbbell Bench Press', pull: 'Dumbbell Row', single_leg_core: 'Bulgarian Split Squat' },
  });
  for (const row of picked.sessions_by_week['1'][0].strength_exercises!.slice(2) as any[]) {
    assertEquals(row.load_prescribed, false, `${row.name} carries a prescribed load`);
    assertEquals(row.percent_1rm, undefined, `${row.name} carries a percentage`);
    assertEquals(row.set_plan, undefined, `${row.name} carries a per-set prescription`);
  }
});

Deno.test('every menu option resolves in the exercise table — an unresolved name gets priced wrongly', () => {
  // D-322: a name with no entry falls through to a legacy path and is priced off whichever 1RM the
  // fallback picks. That is how a pull-up came to be prescribed at 110 lb off the athlete's bench.
  for (const menu of ASSISTANCE_MENU) {
    for (const option of menu.options) {
      assertEquals(getExerciseConfig(option.name) != null, true, `${option.name} is offered but not defined`);
      assertEquals(option.targets.trim().length > 0, true, `${option.name} has no targeted areas`);
    }
  }
});

Deno.test('jumps stay bodyweight and carry no percentage (D-322)', () => {
  assertEquals(isBodyweightName(JUMPS.name), true);
  assertEquals(JUMPS.weight, 'Bodyweight');
  assertEquals((JUMPS as any).percent_1rm, undefined);
});

Deno.test('no session carries a 1rm_test tag', () => {
  // The tag makes the logger DISCARD the planned rows and rebuild the session as a warm-up ramp
  // plus one all-out set — the old separate-retest shape. Under 5/3/1 the measurement is the third
  // set of an ordinary session, so a rebuild would delete the prescription. See the composer.
  for (let week = 1; week <= 12; week++) {
    for (const s of sessionsFor(week)) assertEquals(s.tags.includes('1rm_test'), false, `week ${week}`);
  }
});

// ── Block shape ─────────────────────────────────────────────────────────────

Deno.test('12 weeks is leader, leader, anchor — Wendler 2:1', () => {
  assertEquals(
    PLAN.phaseStructure.phases.map((p) => `${p.name} ${p.start_week}-${p.end_week}`),
    ['Leader 1-3', 'Deload 4-4', 'Leader 5-7', 'Deload 8-8', 'Anchor 9-11', 'Deload 12-12'],
  );
  // Exactly one anchor, and it is last: leaders build, the anchor expresses.
  assertEquals(PLAN.phaseStructure.phases.filter((p) => p.name === 'Anchor').length, 1);
});

Deno.test('a block is a whole number of four-week cycles', () => {
  assertEquals(blockWeeks(12), 12);
  assertEquals(blockWeeks(8), 8);
  assertEquals(blockWeeks(10), 8);   // a partial cycle would strand a leader with no deload
  assertEquals(blockWeeks(3), 4);
  const ten = composeStrengthPrimaryPlan({ durationWeeks: 10, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0 });
  assertEquals(ten.duration_weeks, 8);
  assertEquals(Object.keys(ten.sessions_by_week).length, 8);
});

Deno.test('8 weeks is one leader and one anchor', () => {
  assertEquals(buildBlockPhases(8).phases.map((p) => p.name), ['Leader', 'Deload', 'Anchor', 'Deload']);
});

// ── Endurance underneath ────────────────────────────────────────────────────

Deno.test('endurance is easy-only, and the long run takes the biggest share', () => {
  const runs = sessionsFor(1).filter((s) => s.type === 'run');
  assertEquals(runs.length, 3); // Wed + Sat, plus one stacked onto an upper-body lift day
  // ⚠️ ASSERTS THE SHARE, NOT THE WEEKDAY. This used to pin `longest.day === 'Saturday'`, and no
  // fixture ever asked for Saturday — it is the composer's DERIVED default. A test that pins a
  // derived day is defending current behaviour, and it goes red the moment placement legitimately
  // improves. The contract is that one run is the long one.
  const longest = runs.reduce((m, r) => (r.duration > m.duration ? r : m));
  const others = runs.filter((r) => r !== longest);
  for (const r of others) {
    assert(longest.duration > r.duration, `the long run is not the longest: ${longest.day} vs ${r.day}`);
  }
  for (const r of runs) assertEquals(r.tags.includes('easy'), true);
});

Deno.test('a stacked lift + run day puts the lift first', () => {
  // Was hardcoded to Monday. Which day carries both is the solver's call now, so find it — the
  // ORDER is the contract (Eddens 2018: resistance-first when sessions cannot be separated),
  // not the weekday.
  const byDay = new Map<string, string[]>();
  for (const s of sessionsFor(1)) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.type]);
  const stacked = [...byDay.entries()].filter(([, t]) => t.includes('strength') && t.includes('run'));
  assert(stacked.length > 0, 'expected at least one lift + run day in this fixture');
  for (const [day, types] of stacked) {
    assertEquals(types.indexOf('strength') < types.indexOf('run'), true, `${day} put the run first`);
  }
});

Deno.test('there is exactly ONE full rest day, every week of the block', () => {
  // ⚠️ WAS 'Sunday is the one full rest day'. Sunday is a derived convention, not a contract — the
  // composer reserves it when free and takes the last free day otherwise, and the placement audit
  // flagged that convention as unexplained. Pinning the weekday made the test agree with the code
  // instead of with the rule. MAX_ACTIVE_DAYS = 6 is the rule.
  const ALL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (let week = 1; week <= 12; week++) {
    const worked = new Set(sessionsFor(week).map((s) => s.day));
    const rest = ALL.filter((d) => !worked.has(d));
    assertEquals(rest.length, 1, `week ${week} has ${rest.length} rest days (${rest.join(', ') || 'none'})`);
  }
});

Deno.test('strength-only: no endurance sessions, block otherwise unchanged', () => {
  const solo = composeStrengthPrimaryPlan({ durationWeeks: 12, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0 });
  for (let week = 1; week <= 12; week++) {
    assertEquals(solo.sessions_by_week[String(week)].every((s) => s.type === 'strength'), true);
  }
  assertEquals(solo.training_max, PLAN.training_max);
});

// ── Copy ────────────────────────────────────────────────────────────────────

Deno.test('the description states the 85% buffer ONCE and never apologises for week one', () => {
  const d = PLAN.description;
  assertEquals((d.match(/85%/g) ?? []).length, 1);
  // ⛔ THE DEBT. The description promises the app will unlock speed and distance blocks when this
  // cycle closes. Neither exists, and there is no week-12 hand-off. Michael reinstated the line
  // knowingly, so it is a commitment rather than a claim to hedge — this assertion exists to keep
  // it visible until the hand-off ships, not to police the copy.
  assertEquals(/speed and distance blocks unlock/i.test(d), true, 'the unlock promise moved — the hand-off still owes it');
  for (const banned of ["don't worry", 'ease you in', 'easing you in', 'gets harder', 'trust the']) {
    assertEquals(d.toLowerCase().includes(banned), false, `description carries "${banned}"`);
  }
});

// ── The hill descent: derived from placement, and an INVARIANT at four lifts ────────────────────

Deno.test('the descent asks the 48h eccentric cell, not quality_run 24h', () => {
  // Jogging the descent converts the hill session into eccentric work, so it does not get to claim
  // the cheaper clearance for a load it is CHOOSING to add. At 24h these would all jog, including a
  // hill day sitting adjacent to heavy legs at the exact floor with no buffer.
  assertEquals(descentIsJogged('Wednesday', ['Tuesday']), false, 'adjacent to heavy legs must walk');
  assertEquals(descentIsJogged('Thursday', ['Tuesday']), true, '48h clear may jog');
  // The week wraps: Saturday to Monday is 48h, so it clears. Sunday to Monday would not.
  assertEquals(descentIsJogged('Monday', ['Saturday']), true, 'the week must wrap');
  assertEquals(descentIsJogged('Monday', ['Sunday']), false, 'Sunday to Monday is 24h');
});

Deno.test('⛔ at four lifts the descent is ALWAYS walked — an invariant, not an evaluation', () => {
  // ⚠️ THIS ENUMERATES THROUGH THE PLACER, NOT THROUGH HAND-PICKED HEAVY PAIRS. The first version of
  // this test listed heavy-day pairs by hand and failed on `Monday+Wednesday`, which `place-week`
  // never produces for a Friday hill day. A test that asserts against combinations the engine cannot
  // reach is testing an assumption, not the engine.
  //
  // Two heavy days sit >=48h apart, which leaves exactly one day clearing BOTH by 48h, and a long-day
  // anchor always occupies it. If this ever fails, the copy that states "walk the descents" as a fact
  // has become a claim the engine no longer guarantees — fix the copy, not the test.
  const LIFTS4 = [
    { lift: 'Bench Press', isLower: false }, { lift: 'Back Squat', isLower: true },
    { lift: 'Overhead Press', isLower: false }, { lift: 'Deadlift', isLower: true },
  ];
  let checked = 0;
  for (const longRide of ['Saturday', 'Sunday'] as const) {
    const longRun = longRide === 'Saturday' ? 'Sunday' : 'Saturday';
    for (const hill of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const) {
      const week = placeLiftingWeek(LIFTS4, [
        { day: longRide, kind: 'long_ride', label: 'long ride' },
        { day: longRun, kind: 'long_run', label: 'long run' },
        { day: hill, kind: 'quality_run', label: 'hard run' },
      ] as any);
      const heavy = week.slots.filter((s) => s.isLower).map((s) => s.day as string);
      assertEquals(
        descentIsJogged(hill, heavy), false,
        `ride ${longRide} / run ${longRun} / hill ${hill} placed heavy on ${heavy.join('+')} and jogged`,
      );
      checked++;
    }
  }
  assertEquals(checked, 10, 'the enumeration itself must not silently shrink');
});

Deno.test('at a maintenance dose the branch is live — one heavy day can clear', () => {
  assertEquals(descentIsJogged('Thursday', ['Tuesday']), true);
  assertEquals(descentIsJogged('Friday', ['Tuesday']), true);
  assertEquals(descentIsJogged('Wednesday', ['Tuesday']), false);
});
