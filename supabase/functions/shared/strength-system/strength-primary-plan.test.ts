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
  jumpsFor,
} from './strength-primary-plan.ts';
import { placeLiftingWeek } from './place-week.ts';
import { ASSISTANCE_CATALOG } from '../../../../src/lib/assistance-catalog.ts';
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
// The WORK sets only — the warm-up ramp is a separate list in front (see the warm-up test below).
const ramp = (week: number, lift: string) =>
  ((liftRow(week, lift)?.set_plan ?? []) as any[]).filter((p) => !p.warmup).map((p) => `${p.weight}x${p.reps}${p.amrap ? '+' : ''}`).join(' ');
const warmupRamp = (week: number, lift: string) =>
  ((liftRow(week, lift)?.set_plan ?? []) as any[]).filter((p) => p.warmup).map((p) => `${p.weight}x${p.reps}`).join(' ');

// ── The working number ──────────────────────────────────────────────────────

Deno.test('working number is 85% of the real max, rounded DOWN to 5 lb', () => {
  // 225×.85 = 191.25 → 190. 315×.85 = 267.75 → 265. 405×.85 = 344.25 → 340. 135×.85 = 114.75 → 110.
  assertEquals(PLAN.training_max, { bench: 190, squat: 265, deadlift: 340, overheadPress: 110 });
});

// ── The week tables (SPEC §1) ───────────────────────────────────────────────

Deno.test('LEADER cycle: every set is five, top set climbs 85→90→95%, no all-out set', () => {
  // ⛔ WEEKS 1-3 AGAIN (2026-08-16). The opening TM-test week is gone, so cycle 1 starts at week 1.
  // **The three prescriptions themselves are byte-identical through both restructures.**
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

Deno.test('⛔ THE TM-TEST WEEK CLOSES THE BLOCK — 70/80/90 × 5 then the training max, open', () => {
  // ⛔ THERE IS NO OPENING TEST WEEK (2026-08-16). Michael's call: a test week is a data-collection
  // event, not a stimulus, and spending recovery capital to confirm a number the intake derives is
  // inefficient for an athlete carrying endurance load. Knowingly overrides p.21's bolded advice.
  assertEquals(ramp(12, 'Bench Press'), '140x5 160x5 180x5 200x5+');   // TM 200 by the last cycle
  // ⛔ ONLY THE DELOADS ARE `recovery_week`s. A test week is light for a different reason — it
  // arrives rested in order to MEASURE — and `normalizePhaseKey('TM Test')` resolves it to `taper`.
  assertEquals(PLAN.phaseStructure.recovery_weeks, [4, 8]);
});

Deno.test('⛔ THE 7TH-WEEK DELOADS: 70×5 · 80×3 · 90×1 · TM×1, weeks 4 and 8, nothing open', () => {
  // ⛔ TWO OF THEM NOW (2026-08-16) — a light week after EVERY cycle, p.21's "after any cycle"
  // licence, taken because a concurrent athlete is the taxing case it names.
  assertEquals(ramp(4, 'Bench Press'), '130x5 150x3 170x1 190x1');   // cycle 1's TM, 190
  assertEquals((liftRow(4, 'Bench Press')!.set_plan as any[]).some((p) => p.amrap), false);
  // Bench TM 195 in cycle 2 → 136/156/175/195 → 135/155/175/195.
  assertEquals(ramp(8, 'Bench Press'), '135x5 155x3 175x1 195x1');
  assertEquals((liftRow(8, 'Bench Press')!.set_plan as any[]).some((p) => p.amrap), false);
});

Deno.test('⛔ FIRST SET LAST — 5×5 AT THE WEEK\u2019S OPENING WEIGHT, LEADER WEEKS ONLY (§1e)', () => {
  // Forever p.40 / p.45. The supplemental uses the lift's OWN training max at the week's first-set
  // percentage — no new maxes, no new equipment, no second movement to pick.
  const fslOn = (week: number) => {
    const s = sessionsFor(week).find((x) => x.name === 'Strength — Bench Press');
    return ((s?.strength_exercises ?? []) as any[]).find((e) => e.supplemental);
  };
  // Bench TM 190 in cycle 1. Week 1 opens at 65% = 123.5 → 120; week 2 at 70% = 133 → 130.
  assertEquals([fslOn(1).name, fslOn(1).sets, fslOn(1).reps, fslOn(1).weight], ['Bench Press', 5, 5, 120]);
  assertEquals(fslOn(2).weight, 130);
  assertEquals(fslOn(3).weight, 140);          // 75% of 190 = 142.5 → 140
  assertEquals(fslOn(5).weight, 125);          // cycle 2, TM 195 → 65% = 126.75 → 125
  assertEquals((fslOn(1).set_plan as any[]).length, 5);
  assertEquals((fslOn(1).set_plan as any[]).every((p: any) => p.weight === 120 && p.reps === 5), true);

  // ⛔ NEVER ON AN ANCHOR OR A STANDALONE WEEK. An anchor's top set is already a rep-out at 95%, and
  // a standalone week is the block's recovery — adding 25 reps to either is the accidental hybrid
  // the leader/anchor split exists to avoid.
  for (const week of [4, 8, 9, 10, 11, 12]) {
    assertEquals(fslOn(week), undefined, `week ${week} must carry no supplemental`);
  }

  // ⛔ IT IS PRESCRIBED BARBELL WORK, NOT AN ACCESSORY. `load_prescribed: false` would make the
  // server matcher, the logger and the compare table read it as assistance (D-370) and the logged
  // sets would come back as an unplanned extra.
  assertEquals(fslOn(2).load_prescribed, undefined);
  assertEquals(typeof fslOn(1).weight, 'number');

  // The session names it, and the row order is main lift → supplemental → assistance.
  const rows = sessionsFor(1).find((s) => s.name === 'Strength — Bench Press')!.strength_exercises!;
  assertEquals(rows.map((r: any) => r.name)[0], 'Bench Press');
  assertEquals((rows[1] as any).supplemental, true);
  const desc = sessionsFor(1).find((s) => s.name === 'Strength — Bench Press')!.description;
  assertEquals(/First Set Last — 5×5 @ 120/.test(desc), true, desc);
  assertEquals(/same lift at its opening weight/.test(desc), true, desc);
});

Deno.test('⛔ A STANDALONE WEEK KEEPS ITS JUMPS AND ITS ASSISTANCE, at the light band', () => {
  // ⛔ SUPERSEDES 'a deload is a volume cut — the main lift only'. Forever p.22 puts 10 jumps on the
  // 7th week and p.23 puts 25-50 reps per assistance slot on it. The cut is in the main lift and in
  // the band, not in the session's structure.
  for (const week of [4, 8, 12]) {
    const squat = sessionsFor(week).find((s) => s.name === 'Strength — Back Squat')!.strength_exercises!;
    assertEquals(squat[0].name, 'Box Jump', `week ${week} lost its primer`);
    assertEquals(squat[0].sets, 2, `week ${week} should carry the light jump dose`);
    const acc = (squat as any[]).filter((r) => typeof r.reps === 'string' && String(r.reps).endsWith('total'));
    assertEquals(acc.length, 3, `week ${week} should carry three assistance slots`);
    for (const r of acc) assertEquals(r.reps, '25 total', `week ${week}: ${r.name}`);
  }
});

Deno.test('the working number steps BETWEEN cycles, never inside one — Wendler\'s fixed increment', () => {
  // Bench (1RM 225): TM 190 → 195 → 200. Cycles now open on weeks 2, 5 and 9.
  assertEquals(ramp(5, 'Bench Press'), '125x5 145x5 165x5');
  assertEquals(ramp(9, 'Bench Press'), '130x5 150x5 170x5+');
  // ⛔ THE SQUAT'S THIRD CYCLE IS THE ONE NUMBER SLICE a MOVED IN A STANDARD BLOCK (2026-08-12).
  // Squat 1RM 315: TM 265 → 275 → 285. The deleted 90% ceiling (90% of 315 = 283.5 → 280) used to
  // TRUNCATE that third step onto 280, so the opening set read 180 (65% of 280) instead of 185.
  //
  // ⚠️ 285 IS 90.5% OF THE MAX ON FILE AND THAT IS NOW ALLOWED. The old note argued it sat outside
  // 5/3/1's 85-90% training-max band; the band is a starting-point recommendation, not a running
  // bound — p30 says keep increasing until you can no longer hit the prescribed reps. If 315 is real,
  // the athlete misses the 95% set, holds, misses again and comes down 10%.
  assertEquals(ramp(9, 'Back Squat').split(' ')[0], '185x5');
});

Deno.test('ANCHOR cycle: 5/3/1 proper, and the all-out set is the LAST set only', () => {
  assertEquals(ramp(9, 'Bench Press'), '130x5 150x5 170x5+');
  assertEquals(ramp(10, 'Bench Press'), '140x3 160x3 180x3+');
  assertEquals(ramp(11, 'Bench Press'), '150x5 170x3 190x1+');
  const wk11 = liftRow(11, 'Bench Press')!.set_plan as any[];
  assertEquals(wk11.filter((p) => p.amrap).length, 1);
  assertEquals(wk11[wk11.length - 1].amrap, true);
});

Deno.test('⛔ THE BLOCK ENDS ON A TM-TEST WEEK, AND ITS TOP SET IS THE TRANSITION GATE', () => {
  // ⛔ SUPERSEDES 'the block ends on a deload, and week 12 has no all-out set' (§1c/§1d). Week 12 is
  // now the closing test week: it DOES carry an open set, at the training max, and the reps on it
  // are what decide the next block's number. That is SPEC §1b's outstanding debt being paid.
  const wk12 = liftRow(12, 'Bench Press')!.set_plan as any[];
  assertEquals(wk12.filter((p) => p.amrap).length, 1);
  assertEquals(wk12[wk12.length - 1].amrap, true);
  assertEquals(wk12[wk12.length - 1].weight, 200, 'the test is at the training max the block reached');
});

// ── The per-set prescription ────────────────────────────────────────────────

Deno.test('every main lift carries an ASCENDING per-set prescription on the 5 lb grid', () => {
  // ⚠️ THREE WORK SETS ON A CYCLE WEEK, FOUR ON A STANDALONE ONE (§1c) — the standalone shapes add
  // the set at the training max itself. The invariant under test is the ascent and the grid.
  const STANDALONE = new Set([4, 8, 12]);
  for (let week = 1; week <= 12; week++) {
    for (const lift of ['Bench Press', 'Back Squat', 'Overhead Press', 'Deadlift']) {
      const plan = (liftRow(week, lift)?.set_plan as any[] | undefined)?.filter((p) => !p.warmup);
      const want = STANDALONE.has(week) ? 4 : 3;
      assert(plan != null && plan.length === want, `wk${week} ${lift} has ${plan?.length} work sets, want ${want}`);
      for (let i = 1; i < plan.length; i++) {
        assert(plan[i].weight > plan[i - 1].weight,
          `wk${week} ${lift} ramp does not ascend: ${JSON.stringify(plan)}`);
      }
      for (const p of plan) assertEquals(p.weight % 5, 0, `wk${week} ${lift} weight off the 5 lb grid`);
    }
  }
});

Deno.test('warm-up weights floor at the lift\'s own bar — 45 normally, 35 on a women\'s-bar lift', () => {
  // ⛔ UPDATED 2026-08-13 (the flag model). This pinned "warm-ups clamp to 45" when 45 was the only
  // bar. A lift in the 65-84 band now runs on the 35 lb women's bar (`barFloorForWorkingNumber`),
  // so ITS warm-ups floor at 35 — clamping them to a bar the athlete isn't using would be wrong.
  // OHP 1RM 65 → working number ~55; 40/50/60% is 22/27/33, un-loadable on any bar → clamp to 35.
  // Bench 95 / squat 135 / deadlift 155 all clear 85, so their warm-ups still floor at 45.
  const light = composeStrengthPrimaryPlan({
    durationWeeks: 12,
    oneRepMaxes: { bench: 95, squat: 135, deadlift: 155, overheadPress: 65 },
    enduranceSport: 'run',
    enduranceFrequency: 3,
  });
  // ⚠️ WEEK 1 — a cycle week, so it carries the warm-up ramp the light weeks do not.
  for (const s of ((light as any).sessions_by_week['1'] as any[])) {
    if (s.type !== 'strength') continue;
    const m = (s.strength_exercises ?? []).find((e: any) => Array.isArray(e.set_plan));
    if (!m) continue;
    const floor = m.name === 'Overhead Press' ? 35 : 45;
    for (const p of m.set_plan.filter((x: any) => x.warmup)) {
      assert(p.weight >= floor, `${m.name} warm-up ${p.weight} lb is below its ${floor} lb bar`);
    }
  }
});

Deno.test('warm-up ramp: 40/50/60 (reps 5/5/3) on CYCLE weeks, NONE on a standalone week', () => {
  // Bench working number in cycle 1 = 190. 40/50/60% → 76/95/114 → 75/95/110 (round down to 5).
  assertEquals(warmupRamp(1, 'Bench Press'), '75x5 95x5 110x3');
  for (const lift of ['Bench Press', 'Back Squat', 'Overhead Press', 'Deadlift']) {
    for (const week of [1, 2, 3, 5, 6, 7, 9, 10, 11]) {
      const warm = (liftRow(week, lift)!.set_plan as any[]).filter((p) => p.warmup);
      assertEquals(warm.length, 3, `wk${week} ${lift} should ramp before the work sets`);
      assertEquals(warm.map((p) => p.reps), [5, 5, 3], `wk${week} ${lift} warm-up reps`);
      assertEquals(warm.some((p) => p.amrap), false, `wk${week} ${lift} a warm-up is never all-out`);
    }
    // Standalone weeks carry no ramp — their own sets open at 70% and climb.
    for (const week of [4, 8, 12]) {
      assertEquals((liftRow(week, lift)!.set_plan as any[]).some((p) => p.warmup), false, `wk${week} ${lift} standalone has no ramp`);
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
  // The first LIFTING week sits well inside the athlete — 160/225 = 0.711. Conservative loading,
  // not an on-ramp. ⚠️ Week 1 again (2026-08-16): the block opens on a leader week, not a test.
  assertEquals(liftRow(1, 'Bench Press')!.percent_1rm, 0.711);
  // ⛔ AND THE CLOSING TEST WEEK'S TOP SET IS THE TRAINING MAX — 200/225 = 0.889 at cycle 3's number.
  // That is what makes it testable rather than a max attempt: the 85% buffer means "your training
  // max, for reps" stays inside the athlete.
  assertEquals(liftRow(12, 'Bench Press')!.percent_1rm, 0.889);
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

Deno.test('a work session is jumps → main lift → the phase\u2019s rep total per slot', () => {
  // Was `.find(s => s.type === 'strength')` — the FIRST strength session, which assumed the grid
  // put Bench on Monday. Days are the solver's now, so name the lift instead of trusting the order.
  // ⚠️ Named off the SQUAT session now: jumps are lower-day only (see the test above), so the
  // full jumps → main → assistance shape only exists on a lower day.
  const rows = sessionsFor(1).find((s) => s.name === 'Strength — Back Squat')!.strength_exercises!;
  // ⚠️ FOUR ROWS BEFORE THE ASSISTANCE (2026-08-16): jumps, the main lift, and the FSL supplemental —
  // week 1 is a leader week now that the opening TM-test week is gone.
  // Defaults, because this plan was built with no picks — skipping the card still yields a block.
  //
  // ⛔ THIS ASSERTION HAS BEEN REWRITTEN FOUR TIMES AND THE FIRST THREE WERE ALL THE SAME KIND OF
  // CHANGE: the engine's INFERENCE about what belongs on a squat day moved, and the expectation
  // followed it. Q-212 (the single-leg slot collided with the main lift), 2026-08-05 (no pressing on
  // a lower day), D-405 (leg · leg · core, no pull). Each was sourced; each was the app deciding.
  //
  // ⛔ THE FOURTH IS DIFFERENT IN KIND — D-407. This is no longer an inference at all. A squat day
  // carries push · pull · single-leg/core like every other day, and what fills them is the BALANCED
  // DEFAULT WEEK, which is Wendler's own pairing for that day (Periodization Bible p.51: squat day →
  // low back). If this line needs updating again it should be because the DEFAULT changed, not
  // because a rule about squat days did.
  // ⚠️ `Inverted Row`, not `Lat Pulldown` (Slice 7). The default block has to be performable by a
  // normal home gym with nothing swapped, and a pulldown needs a cable stack. The pulldown is still
  // on the pull menu for anyone who has one; it is no longer what the app hands you by default.
  // ⚠️ THE SECOND 'Back Squat' IS THE FSL SUPPLEMENTAL — leader week, First Set Last after the main
  // work (2026-08-16: week 1 is a leader now that the opening TM-test week is gone).
  assertEquals(rows.map((r: any) => r.name),
    ['Box Jump', 'Back Squat', 'Back Squat', 'Push-Up', 'Inverted Row', 'Back Extension']);
  // `sets` is optional on the type now (assistance rows carry a rep TOTAL and no set count), but the
  // jump row always has one. ⛔ THE DOSE IS PER PHASE AS OF 2026-08-15 (Forever p.18): 2×5 = 10 in a
  // leader and on a light standalone week, 3×5 = 15 in an anchor. Week 1 of a default block is a
  // leader, so the row above is the LEADER dose.
  assertEquals(jumpsFor('leader').sets! * (jumpsFor('leader').reps as number), 10);
  assertEquals(jumpsFor('seventh').sets! * (jumpsFor('seventh').reps as number), 10);
  assertEquals(jumpsFor('anchor').sets! * (jumpsFor('anchor').reps as number), 15);
  // ⛔ A REP TOTAL, NOT A SET. Was `assertEquals(r.reps, 25)` alongside `sets: 1`, which rendered as
  // "1×25" and asserted a single set of twenty-five the prescription never asked for. The number is
  // unchanged; what is asserted now is that the row makes no claim about how it is performed.
  // ⛔ 50 — WEEK 1 IS A LEADER WEEK AGAIN (2026-08-16: the opening TM-test week was dropped, so the
  // block opens on cycle 1). The leader band is 50-75 and the anchor band is 75-100; this athlete
  // has no tested capacity, so each slot sits at its band's floor.
  // ⚠️ §1g of the 2026-08-16 work order narrows every band to 25-50 keyed on COMPETING STRESS
  // rather than on the cycle phase. Not built yet — when it lands, this number moves again.
  for (const r of rows.slice(3) as any[]) {
    assertEquals(r.reps, '50 total');
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
  //
  // ⛔ THE PICKS ARRIVE IN THE OLD FLAT SHAPE ON PURPOSE — this is the MIGRATION under test, not just
  // the wiring. Every goal created before 2026-08-13 carries `{push, pull, single_leg_core}`, and
  // `normalizeAssistancePrefs` turns it into the same three movements on all four days. That is what
  // the old model MEANT before its re-roling machinery moved them around.
  //
  // ⛔ AND NOTHING IS RE-ROLED NOW (D-407). The three lines this replaces each recorded a slot being
  // overridden on a bench day — the push slot balanced to a Face Pull (2026-08-05, a defect), the
  // pull slot crossed the plane to a Pull Up (2026-08-09, the wrong template), the core pick became
  // `Diamond Push Up` because p.50-51 closes a press day on triceps (D-404). All three were the
  // engine answering for the athlete. The athlete now answers per day, so their `Hanging Leg Raise`
  // appears on the bench day because that is where they put it.
  // ⚠️ THE SECOND 'Bench Press' IS THE FSL SUPPLEMENTAL (2026-08-16) — week 1 is a leader week now
  // that the opening TM-test week is gone, and a leader carries First Set Last after the main work.
  assertEquals(benchOf(picked), ['Bench Press', 'Bench Press', 'Dips', 'Dumbbell Row', 'Hanging Leg Raise']);

  // A name that is no longer offered must not strand an existing goal.
  const stale = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0,
    assistancePicks: { push: 'Bench Press Machine', pull: '', single_leg_core: undefined },
  });
  // ⛔ FALLBACK IS PER SLOT AND PER DAY, so an unrecognised name costs that one slot rather than the
  // week. All three are unusable here, so the bench day is its balanced default verbatim — which is
  // Wendler's Triumvirate pairing for a bench day (p.48: DB Bench + DB Row).
  assertEquals(benchOf(stale),
    ['Bench Press', 'Bench Press', 'DB Bench Press', 'Dumbbell Row', 'Reverse Lunge']);
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

Deno.test('every catalog option resolves in the exercise table — an unresolved name gets priced wrongly', () => {
  // D-322: a name with no entry falls through to a legacy path and is priced off whichever 1RM the
  // fallback picks. That is how a pull-up came to be prescribed at 110 lb off the athlete's bench.
  // ⚠️ `ASSISTANCE_MENU` → `ASSISTANCE_CATALOG` (D-407): the three-slot menu was retired with the
  // block-wide picks. `targets` became `muscle`, which is Wendler's own word for what it trains.
  for (const option of ASSISTANCE_CATALOG) {
    assertEquals(getExerciseConfig(option.name) != null, true, `${option.name} is offered but not defined`);
    assertEquals(option.muscle.trim().length > 0, true, `${option.name} has no muscle label`);
    assertEquals(option.display.trim().length > 0, true, `${option.name} has no display name`);
  }
});

Deno.test('jumps stay bodyweight and carry no percentage (D-322)', () => {
  for (const phase of ['leader', 'anchor', 'seventh'] as const) {
    const j = jumpsFor(phase);
    assertEquals(isBodyweightName(j.name), true);
    assertEquals(j.weight, 'Bodyweight');
    assertEquals((j as any).percent_1rm, undefined);
  }
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

Deno.test('⛔ THE 12-WEEK PHASE STRUCTURE IS THE WORK ORDER\u2019S §0 MAP', () => {
  assertEquals(
    PLAN.phaseStructure.phases.map((p) => `${p.name} ${p.start_week}-${p.end_week}`),
    // ⛔ 2026-08-16: a light week after EVERY cycle, and no opening test week.
    ['Leader 1-3', 'Deload 4-4', 'Leader 5-7', 'Deload 8-8', 'Anchor 9-11', 'TM Test 12-12'],
  );
  // Exactly one anchor, and it is last: leaders build, the anchor expresses.
  assertEquals(PLAN.phaseStructure.phases.filter((p) => p.name === 'Anchor').length, 1);
  // ⛔ TWO SEPARATE LEADER ENTRIES, not one six-week phase. They are different cycles running on
  // different working numbers, and collapsing them would hide the increment between them.
  assertEquals(PLAN.phaseStructure.phases.filter((p) => p.name === 'Leader').length, 2);
});

Deno.test('a block is 8 or 12 weeks — anything else snaps DOWN to one of them', () => {
  assertEquals(blockWeeks(12), 12);
  assertEquals(blockWeeks(8), 8);
  assertEquals(blockWeeks(16), 12);   // ⛔ 16 is not offered (2026-08-16)
  assertEquals(blockWeeks(10), 8);
  assertEquals(blockWeeks(3), 8);     // under the floor resolves UP to the shortest real block
  const ten = composeStrengthPrimaryPlan({ durationWeeks: 10, oneRepMaxes: MAXES, enduranceSport: null, enduranceFrequency: 0 });
  assertEquals(ten.duration_weeks, 8);
  assertEquals(Object.keys(ten.sessions_by_week).length, 8);
});

Deno.test('8 weeks is one leader and one anchor, same 3:1 rhythm', () => {
  assertEquals(buildBlockPhases(8).phases.map((p) => p.name), ['Leader', 'Deload', 'Anchor', 'TM Test']);
  // ⛔ 16 BUILDS A 12 (2026-08-16) — four cycles cannot be 2:1, so the length is refused rather than
  // built into a shape neither Wendler nor Viada supports.
  assertEquals(buildBlockPhases(16).phases.map((p) => p.name),
    ['Leader', 'Deload', 'Leader', 'Deload', 'Anchor', 'TM Test']);
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

// ════════════════════════════════════════════════════════════════════════════
// ENDURANCE DAY ALLOCATION — the rest day, and run/ride alternation (2026-08-05)
// ════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ THESE PIN THE TWO THINGS THAT BROKE THREE TIMES IN ONE SESSION, both invisible to every
 * existing test because every existing fixture was run-only.
 *
 * The rest day was lost twice, by two different collisions, and each time the week silently came out
 * with seven active days: once when Q-214's press-spacing term moved the upper lift off the day the
 * long run was hardcoded to (so the long run took a free day instead of sharing), and once when
 * `restReserved` and `pickedLong` independently resolved to the SAME last free day.
 *
 * ⚠️ THE COMMON SHAPE: two rules each picking a day from `freeDays` without consulting the other. Any
 * future rule that consumes a free day belongs in this test.
 */
const MIX = (over: Record<string, unknown>) => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES, easyPaceMinPerMile: 9, ...over,
} as never);

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const restDaysOf = (plan: any, week: number) => {
  const busy = new Set((plan.sessions_by_week[String(week)] ?? []).map((s: any) => s.day));
  return DAY_NAMES.filter((d) => !busy.has(d));
};

Deno.test('⛔ THE REST DAY SURVIVES UNLESS THE ATHLETE\'S OWN ASKS FILL THE WEEK — and then it SAYS SO', () => {
  const mixes: Array<[string, Record<string, unknown>]> = [
    ['run only ×3', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20 }],
    ['3 runs + 2 rides', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, bike: { hours: 3, days: 2 } }],
    ['4 runs + 3 rides', { enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 25, bike: { hours: 4, days: 3 } }],
    ['2 runs + 2 rides', { enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 12, bike: { hours: 3, days: 2 } }],
  ];
  // ⛔ THE RULE CHANGED 2026-08-05 AND ITS REASONING IS KEPT. The rest day used to be reserved
  // BEFORE anything was placed and outranked the athlete's stated sessions — so someone who asked
  // for 4 runs and 3 rides silently got 2 rides. Michael: *"we also dont need a rest day."* It is
  // now the LAST thing yielded, after every lift day has been tried, and yielding it is REPORTED.
  //
  // ⚠️ SO THE PROPERTY IS NOT "there is always a rest day" — it is **"there is a rest day, or the
  // plan told the athlete it spent theirs."** Silence is the only failure.
  for (const [label, args] of mixes) {
    const plan: any = MIX(args);
    const said = ((plan.placement_compromises ?? []) as any[])
      .map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' | ');
    for (let week = 1; week <= 12; week++) {
      const rest = restDaysOf(plan, week);
      if (rest.length >= 1) continue;
      assert(/no full rest day/i.test(said),
        `${label}, week ${week}: the week has no rest day and nothing said so — compromises: ${said}`);
    }
  }
});

Deno.test('a week with room KEEPS its rest day — releasing it is a last resort, not the default', () => {
  // The guard on the change above: an athlete who did not ask for a seven-day week must not get one.
  // 2 runs + 2 rides fits comfortably, so the rest day is untouched.
  const plan: any = MIX({ enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 12, bike: { hours: 3, days: 2 } });
  for (let week = 1; week <= 12; week++) {
    assert(restDaysOf(plan, week).length >= 1, `week ${week} gave up a rest day it did not need to`);
  }
});

Deno.test('⛔ THE LONG RUN NEVER LANDS ON THE RESERVED REST DAY', () => {
  // The exact collision: `pickedLong` and `restReserved` both resolving to the last free day. It
  // produced a week whose rest day carried the longest session in it.
  for (const freq of [2, 3, 4]) {
    const plan = MIX({ enduranceSport: 'run', enduranceFrequency: freq, targetWeeklyMiles: 20, bike: { hours: 3, days: 2 } });
    const wk = plan.sessions_by_week['1'] ?? [];
    const long = wk.find((s: any) => s.type === 'run' && /long/i.test(String(s.name ?? '')));
    if (!long) continue;
    const rest = restDaysOf(plan, 1);
    assertEquals(rest.includes(long.day), false, `runFreq ${freq}: the long run is on the rest day`);
  }
});

Deno.test('run and ride ALTERNATE across the free days rather than the runs taking them all', () => {
  // ⚠️ A COMPOSER PREFERENCE, NOT A CLEARANCE — `easy_run × easy_run` is rated 0h with no penalty
  // and this claims nothing about physiology. See the block comment on `easyRunDays`. What it pins
  // is that the ALLOCATION consults both disciplines instead of the run pass running first and
  // taking every open day, which is what produced Tue-run/Wed-run with the rides stacked elsewhere.
  const plan = MIX({ enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20, bike: { hours: 3, days: 2 } });
  const wk = plan.sessions_by_week['1'] ?? [];
  const dayOf = (t: string) => wk.filter((s: any) => s.type === t).map((s: any) => DAY_NAMES.indexOf(s.day)).sort((a: number, b: number) => a - b);
  const runs = dayOf('run');
  const rides = dayOf('ride');
  assert(runs.length >= 2 && rides.length >= 2, `fixture should carry both: ${runs.length} runs, ${rides.length} rides`);
  // At least one ride sits BETWEEN two run days — the property "the runs were not handed every
  // open day first" expressed as something observable on the calendar.
  const between = rides.some((r: number) => r > runs[0] && r < runs[runs.length - 1]);
  assert(between, `no ride falls between the first and last run: runs ${runs}, rides ${rides}`);
});

/**
 * ⛔ THE ANTI-"TUNED TO ONE ATHLETE" SWEEP. Michael, 2026-08-05: *"lets not tune to me, we should
 * just be smart with programing for multi users with different schedules."*
 *
 * Every other placement test in this file pins ONE fixture, and a single fixture is precisely how a
 * layout that only works for one athlete's week survives a green suite. Three separate defects this
 * session were invisible for exactly that reason — every existing fixture was run-only with a
 * Saturday long run, so the rest-day collisions and the run/ride allocation were never exercised.
 *
 * This sweeps 63 real schedules — the long run on each of the seven days × 2/3/4 run days × 0/2/3
 * ride days — and asserts the properties that must hold for ALL of them rather than the exact days
 * any one of them produces. ⛔ Assert PROPERTIES here, never a specific day: a day assertion in this
 * test would re-create the thing it exists to prevent.
 *
 * ⚠️ AN OVER-SUBSCRIBED WEEK IS NOT A FAILURE. Four runs plus three rides plus four lifts is eleven
 * sessions against six usable days, and the composer refuses a third session on any day. What is
 * required is that it says so — `placement_compromises` names the shortfall — not that it fits.
 */
Deno.test('⛔ 63 ATHLETE SCHEDULES — the week holds its shape for all of them, or says why not', () => {
  const failures: string[] = [];
  for (const longRunDay of DAY_NAMES) {
    for (const runFreq of [2, 3, 4]) {
      for (const rideDays of [0, 2, 3]) {
        const label = `long=${longRunDay} runs=${runFreq} rides=${rideDays}`;
        const plan: any = MIX({
          enduranceSport: 'run', enduranceFrequency: runFreq, targetWeeklyMiles: 20, longRunDay,
          ...(rideDays ? { bike: { hours: 3, days: rideDays } } : {}),
        });
        for (let week = 1; week <= 12; week++) {
          const wk = plan.sessions_by_week[String(week)] ?? [];
          const perDay = new Map<string, number>();
          for (const s of wk) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);

          // 1. A full rest day survives — OR the plan says it was spent. Never silently gone.
          if (DAY_NAMES.every((d) => perDay.has(d)) && !/no full rest day/i.test(
            ((plan.placement_compromises ?? []) as any[])
              .map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' | ')
          )) { failures.push(`${label} wk${week}: no rest day, and nothing said so`); break; }
          // 2. Never a third session on one day — two is a stacked day, three is a training camp.
          const over = [...perDay.entries()].find(([, n]) => n > 2);
          if (over) { failures.push(`${label} wk${week}: ${over[0]} carries ${over[1]} sessions`); break; }
          // 3. The athlete's stated long-run day is HONOURED, not defaulted over.
          const long = wk.find((s: any) => s.type === 'run' && /long/i.test(String(s.name ?? '')));
          if (long && long.day !== longRunDay) {
            failures.push(`${label} wk${week}: long run on ${long.day}`); break;
          }
        }

        // 4. Sessions the athlete asked for either EXIST or are named in the compromises. Silence is
        //    the failure — a collected answer that reaches neither a session nor an explanation.
        const wk1 = plan.sessions_by_week['1'] ?? [];
        const said = ((plan.placement_compromises ?? []) as any[])
          .map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' | ');
        const rides = wk1.filter((s: any) => s.type === 'ride').length;
        if (rideDays && rides < rideDays && !/ride day/i.test(said)) {
          failures.push(`${label}: ${rides}/${rideDays} rides and nothing said so`);
        }
        const runs = wk1.filter((s: any) => s.type === 'run').length;
        if (runs < runFreq && !/run/i.test(said)) {
          failures.push(`${label}: ${runs}/${runFreq} runs and nothing said so`);
        }
      }
    }
  }
  assertEquals(failures, [], `schedules that broke:\n  ${failures.join('\n  ')}`);
});
