// ============================================================================
// THE GATE — THE REPS CARRY THE PROGRESSION (work order 2026-08-26).
//
//   ~/.deno/bin/deno test -A --no-check --sloppy-imports \
//     supabase/functions/_shared/standing-plan/standing-plan-bar-ladder.test.ts
//
// ⛔ THE BUG THIS EXISTS FOR, AND IT IS ARITHMETIC RATHER THAN TASTE. p247's rate anchor is one per
// cent every three weeks on the calculated 1RM. Rounded to real plates that cannot be expressed at
// all on a light bar: a 170 lb bench prescribes 145 and moves ONCE in twelve weeks, and a 100 lb
// press moves once, in a week decided by where the unrounded number happens to fall against the
// rounding line. `THE SCHEDULED RISE ALONE` below is that bug, pinned as a permanent fixture.
//
// ⛔ AND THE BACK-OFF RULING (Michael, 2026-08-26). `STALL_BACKOFF = 0.10` does not ship. A rep drop
// INSIDE the band is not a stall — four reps then three then three at the same weight is normal
// variance in a programme with five endurance sessions a week, and a signal that fires inside the
// acceptable range contradicts the range. What ships is the UNDO: an athlete who earned an increment
// and cannot hold it returns to the weight they were holding before it.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as progression from './progression.ts';
import {
  advanceStep,
  BAR_LADDER_START,
  barLadderStep,
  barSessionSignal,
  DECLINE_SESSIONS_TO_UNDO,
  repsToExpect,
  scheduledRise,
  STALL_CONFIRMATIONS,
  STEP_LOWER_LB,
  STEP_UPPER_LB,
  type BarLadderState,
} from './progression.ts';
import { composeBlock, composeWeek } from './compose.ts';
import { earnedMeSets } from './me-history.ts';
import { restateFromTest } from './restate.ts';
import { prescribe } from '../strength-grid/index.ts';

/**
 * ⚠️ A LIGHT BAR ON PURPOSE. 170 lb predicted max → a working number of 96% of it (p215) → the ME
 * slot prescribes 90% of that, which is 145. This is the exact bar in the work order, and a heavier
 * fixture would hide the whole problem: at 250 lb and up his one per cent clears a 5 lb round.
 */
const LIGHT_BENCH = {
  lift: 'bench' as const, workingNumber: 163, predicted1RM: 170,
  epley: 171, brzycki: 169, from: { weight: 145, reps: 3 },
};

const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
  workingNumbers: { bench: LIGHT_BENCH },
  roundTo: 5,
};

const REP_BAND = (() => {
  const p = prescribe('ME', 'barbell');
  return p.kind === 'barbell' ? p.reps : { lo: 1, hi: 1 };
})();

/** One logged heavy session: N sets at `weight`, each completed at `reps`. */
const session = (reps: number, weight: number, sets = 1) =>
  Array.from({ length: sets }, () => ({ reps, weight, completed: true }));

const walk = (sessions: { reps: number; weight: number }[], stepLb = STEP_UPPER_LB): BarLadderState => {
  let state = BAR_LADDER_START;
  for (const s of sessions) {
    state = barLadderStep(state, { sets: session(s.reps, s.weight), repBand: REP_BAND, stepLb });
  }
  return state;
};

/** A real ISO date falling on the given weekday, so `weekdayOf` reproduces it. ⚠️ Parsed as UTC. */
function dateOn(day: string): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // 2026-01-04 is a Sunday.
  return new Date(Date.parse('2026-01-04T00:00:00Z') + names.indexOf(day) * 86400000)
    .toISOString().slice(0, 10);
}

// ── THE BUG, PINNED ─────────────────────────────────────────────────────────────────────────────

Deno.test('⛔⛔ THE SCHEDULED RISE ALONE MOVES A LIGHT BAR ONCE IN TWELVE WEEKS — the bug, kept', () => {
  const block = composeBlock({ ...BASE, weeks: 12, taperWeeks: [] } as never);
  const weights = block.flatMap((wk) => wk.meRows)
    .filter((r) => r.movement === 'Bench Press' && r.weight != null)
    .map((r) => r.weight as number);
  assert(weights.length >= 10, 'the fixture stopped producing bench ME rows');

  const distinct = [...new Set(weights)];
  // ⛔ ONE MOVE IN TWELVE WEEKS, AND IT IS NOT A COMPOSER BUG — it is his own rate anchor meeting a
  // 5 lb plate. The block that a working athlete trains looks FROZEN, which is why the reps have to
  // carry the progression. ⚠️ If this ever fails high, the rate anchor or the rounding moved and the
  // whole mechanism's justification needs re-reading before anything is "fixed".
  assert(distinct.length <= 2,
    `the scheduled rise moved this bar ${distinct.length} times: ${distinct.join(', ')}`);
  assertEquals(Math.min(...weights), 145, 'the fixture is no longer the work order\'s 145 lb bench');

  // ⚠️ AND THE FLOOR IS STILL THERE — item 4. `scheduledRise` is not deleted; it is what moves the
  // bar when nobody earns anything.
  assert(scheduledRise('strength_5k', 3) > 0, 'the 1% floor is gone');
});

// ── THE EARN ────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ TWO SESSIONS FINISHING THE REP RANGE EARN ONE INCREMENT; ONE DOES NOT', () => {
  assertEquals(walk([{ reps: 5, weight: 145 }]).offsetLb, 0, 'one good session moved the bar');
  assertEquals(walk([{ reps: 5, weight: 145 }, { reps: 5, weight: 145 }]).offsetLb, STEP_UPPER_LB);
  // ⚠️ AND THE DEADBAND IS THE ONE THE FILE ALREADY OWNED, not a second number beside it.
  assertEquals(STALL_CONFIRMATIONS, 2);
});

Deno.test('⛔ BEATING THE RANGE COUNTS AS FINISHING IT — six reps of a 1-5 band is not a miss', () => {
  assertEquals(barSessionSignal(session(6, 145), REP_BAND).signal, 'earned');
  assertEquals(walk([{ reps: 6, weight: 145 }, { reps: 6, weight: 145 }]).offsetLb, STEP_UPPER_LB);
});

Deno.test('the increment is the lift\'s, and it lands on real plates', () => {
  assertEquals(advanceStep(false, null), STEP_UPPER_LB);
  assertEquals(advanceStep(true, null), STEP_LOWER_LB);
  // ⚠️ An athlete with nothing smaller than a pair of 10s cannot make a 5 lb step.
  assertEquals(advanceStep(false, 20), 20);
  assertEquals(walk([{ reps: 5, weight: 315 }, { reps: 5, weight: 315 }], STEP_LOWER_LB).offsetLb, 10);
});

Deno.test('⛔ MID-BAND HOLDS THE WEIGHT AND BREAKS THE RUN — a good session, then a fair one, earns nothing', () => {
  const state = walk([{ reps: 5, weight: 145 }, { reps: 3, weight: 145 }, { reps: 5, weight: 145 }]);
  assertEquals(state.offsetLb, 0, 'a broken run still earned an increment');
  assertEquals(state.earnedRun, 1);
});

Deno.test('⛔ SILENCE HOLDS — nothing logged is not a failure, and it is not a lost jump', () => {
  const earned = walk([{ reps: 5, weight: 145 }, { reps: 5, weight: 145 }]);
  const after = barLadderStep(earned, { sets: [], repBand: REP_BAND, stepLb: STEP_UPPER_LB });
  assertEquals(after, earned, 'a skipped session changed the bar');

  /**
   * ⛔ AND IT HOLDS MID-RUN, WHICH IS THE HALF THAT ACTUALLY BITES. A skipped week between two good
   * sessions is the plan having nothing to read, not a broken run — resetting the count on absence is
   * acting on silence, the failure mode this codebase names in three other files.
   * ⚠️ MUTATION-TESTED: returning `{ ...state, earnedRun: 0 }` for `no_evidence` fails here and
   * NOWHERE ELSE in this file.
   */
  const midRun = walk([{ reps: 5, weight: 145 }]);
  assertEquals(midRun.earnedRun, 1);
  const quiet = barLadderStep(midRun, { sets: [], repBand: REP_BAND, stepLb: STEP_UPPER_LB });
  assertEquals(quiet.earnedRun, 1, 'a skipped week broke the run');
  const resumed = barLadderStep(quiet, { sets: session(5, 145), repBand: REP_BAND, stepLb: STEP_UPPER_LB });
  assertEquals(resumed.offsetLb, STEP_UPPER_LB, 'the run did not survive the gap');
  // ⚠️ AND AN UNCOMPLETED SET IS SILENCE TOO. A row the athlete opened and never finished is not a
  // failed attempt — only a set they marked done at zero reps is.
  assertEquals(barSessionSignal([{ reps: 0, weight: 145, completed: false }], REP_BAND).signal, 'no_evidence');
});

Deno.test('⛔ THE RUN BELONGS TO A WEIGHT — two good sessions at two weights are not two in a row', () => {
  // ⚠️ 5 reps at 145 then 5 at 150 is not the same lift twice; the bar moved underneath them. Reading
  // it as a run would compound the scheduled rise with an earned jump in the same week.
  assertEquals(walk([{ reps: 5, weight: 145 }, { reps: 5, weight: 150 }]).offsetLb, 0);
  assertEquals(walk([{ reps: 5, weight: 150 }, { reps: 5, weight: 150 }]).offsetLb, STEP_UPPER_LB);
});

Deno.test('⛔⛔ NO EARNED JUMP ON TOP OF A SCHEDULED ONE — Michael\'s ruling, 2026-08-26', () => {
  /**
   * ⛔ HIS WORDING, VERBATIM: *"correct no auto jumping if a streak has been raising your load."*
   *
   * ⚠️ THIS IS PINNED SEPARATELY FROM THE TEST ABOVE **BECAUSE IT WILL LOOK LIKE A BUG.** A future
   * session will find an athlete who finished the rep range in week two and again in week three,
   * earned nothing, and file it as a broken streak counter. It is not broken: `scheduledRise` moved
   * this bar from 145 to 150 between those two weeks, so the second five reps were a HARDER session
   * at a HIGHER weight — the load already went up. Adding an earned increment on top would be two
   * raises for one streak.
   *
   * ⚠️ THE COST IS NAMED AND ACCEPTED: the athlete loses one run each time the floor moves, which on
   * a light bar is once or twice in twelve weeks. ⛔ DO NOT "FIX" THIS by making the run survive a
   * weight change.
   */
  const rows = composeBlock({ ...BASE, weeks: 12, taperWeeks: [] } as never)
    .flatMap((b) => b.meRows).filter((r) => r.movement === 'Bench Press' && r.weight != null);

  // ⛔ THE FIXTURE IS THE COMPOSER'S OWN WEIGHTS, not hand-written numbers — so if the rate anchor or
  // the rounding ever changes, this test re-derives the crossing rather than asserting a stale pair.
  const crossing = rows.findIndex((r, i) => i > 0 && r.weight !== rows[i - 1].weight);
  assert(crossing > 0, 'the scheduled rise never moves this bar — the assertion below is vacuous');
  const before = rows[crossing - 1];
  const after = rows[crossing];
  assert((after.weight as number) > (before.weight as number));

  // Two sessions, both finishing the top of his band, straddling the scheduled move.
  const straddled = walk([
    { reps: 5, weight: before.weight as number },
    { reps: 5, weight: after.weight as number },
  ]);
  assertEquals(straddled.offsetLb, 0,
    'a streak that the scheduled rise already rewarded earned a second raise on top of it');

  // ⚠️ AND THE VERY NEXT GOOD SESSION AT THE NEW WEIGHT STILL EARNS. The run restarts; it is not lost.
  const resumed = barLadderStep(straddled, {
    sets: session(5, after.weight as number), repBand: REP_BAND, stepLb: STEP_UPPER_LB,
  });
  assertEquals(resumed.offsetLb, STEP_UPPER_LB, 'the run never restarted after the scheduled move');
});

// ── THE RESET (item 3) ──────────────────────────────────────────────────────────────────────────

Deno.test('⛔ A BAR JUMP RESETS THE REPS TO THE BOTTOM OF THE RANGE', () => {
  const earned = walk([{ reps: 5, weight: 145 }, { reps: 5, weight: 145 }]);
  assertEquals(earned.offsetLb, STEP_UPPER_LB);
  // ⛔ 5 reps at 145 and 3 at 150 are the SAME EFFORT. The reset is what absorbs a plate jump worth
  // six per cent on a light bar; carrying the old rep count across it would read the athlete's next
  // honest session as a collapse.
  assertEquals(earned.recentReps, [], 'the old rep count survived the jump');
  assertEquals(repsToExpect(earned, REP_BAND), REP_BAND.lo);
  // ⚠️ AND BEFORE A JUMP IT IS WHAT THEY ACTUALLY DID — the honest prefill, never the range top.
  assertEquals(repsToExpect(walk([{ reps: 3, weight: 145 }]), REP_BAND), 3);
});

// ── THE BACK-OFF RULING ─────────────────────────────────────────────────────────────────────────

Deno.test('⛔⛔ THERE IS NO PERCENTAGE BACK-OFF — `STALL_BACKOFF` may not come back', () => {
  // ⛔ MICHAEL'S RULING, 2026-08-26. A percentage cut is a Wendler necessity: his training max climbs
  // whether or not the athlete keeps up, so they can outrun it. Here the bar only moves when it is
  // earned, so there is nothing to back off FROM. ⚠️ This asserts the ABSENCE deliberately — the
  // constant was exported and read by nothing, which is exactly how it would get quietly restored.
  assertEquals((progression as Record<string, unknown>).STALL_BACKOFF, undefined);
  assert(!progression.THRESHOLDS_ARE_OURS.includes('ten per cent'));
});

Deno.test('⛔⛔ A REP DROP INSIDE THE BAND IS NOT A STALL — 4 then 3 then 3 costs nothing', () => {
  /**
   * ⛔ HIS WORDING, AND IT IS THE WHOLE RULING: *"4 reps then 3 then 3, at the same weight, inside a
   * 1-5 range, is normal variance."* Tuesday's heavy lower work sits behind Monday's run, which is
   * the entire reason the lower-body haircut exists. A signal that fires inside the acceptable range
   * contradicts the range.
   */
  const earned = walk([
    { reps: 5, weight: 145 }, { reps: 5, weight: 145 },   // earns +5
    { reps: 4, weight: 150 }, { reps: 3, weight: 150 }, { reps: 3, weight: 150 },
  ]);
  assertEquals(earned.offsetLb, STEP_UPPER_LB, 'normal variance took the earned jump away');
  // ⚠️ AND THE THIRD SESSION DID NOT EVEN BREAK THE FLOOR — it is inside his band, so nothing is owed.
  assertEquals(earned.steps, [STEP_UPPER_LB]);
});

Deno.test('⛔ A FAILED SET UNDOES THE JUMP AT ONCE — back to the weight they were holding', () => {
  // ⚠️ ZERO REPS IS THE ONE READING THE BAND CANNOT CONTAIN: his floor is one rep, so a completed set
  // logged at zero is the athlete not making the lift. No confirmation, no percentage.
  const state = walk([
    { reps: 5, weight: 145 }, { reps: 5, weight: 145 },   // earns +5 → 150
    { reps: 0, weight: 150 },
  ]);
  assertEquals(state.offsetLb, 0, 'the failed attempt did not return the athlete to 145');
  assertEquals(state.steps, []);
  assertEquals(barSessionSignal(session(0, 150), REP_BAND).signal, 'failed');
});

Deno.test('⛔ THREE STRICTLY FALLING SESSIONS UNDO THE JUMP; two do not', () => {
  assertEquals(DECLINE_SESSIONS_TO_UNDO, 3);
  const twoDown = walk([
    { reps: 5, weight: 145 }, { reps: 5, weight: 145 },
    { reps: 4, weight: 150 }, { reps: 3, weight: 150 },
  ]);
  assertEquals(twoDown.offsetLb, STEP_UPPER_LB, 'two falling sessions is a wobble, not a decline');

  const threeDown = walk([
    { reps: 5, weight: 145 }, { reps: 5, weight: 145 },
    { reps: 4, weight: 150 }, { reps: 3, weight: 150 }, { reps: 2, weight: 150 },
  ]);
  assertEquals(threeDown.offsetLb, 0, 'a lift going genuinely backwards kept the weight it cannot hold');
});

Deno.test('⛔ AN ATHLETE WHO NEVER EARNED A JUMP LOSES NOTHING — the floor is not theirs to lose', () => {
  // ⚠️ THE UNDO IS PROPORTIONAL BY CONSTRUCTION: the only weight a lift can lose is one it added
  // itself. Below zero there is only `scheduledRise`, which is his and stands.
  const failed = walk([{ reps: 0, weight: 145 }]);
  assertEquals(failed.offsetLb, 0);
  const declining = walk([{ reps: 4, weight: 145 }, { reps: 3, weight: 145 }, { reps: 2, weight: 145 }]);
  assertEquals(declining.offsetLb, 0);
});

Deno.test('⛔ THE UNDO POPS THE STEP THAT WAS TAKEN, so two jumps come off one at a time', () => {
  const twice = walk([
    { reps: 5, weight: 145 }, { reps: 5, weight: 145 },   // → 150
    { reps: 5, weight: 150 }, { reps: 5, weight: 150 },   // → 155
  ]);
  assertEquals(twice.offsetLb, 10);
  const once = barLadderStep(twice, { sets: session(0, 155), repBand: REP_BAND, stepLb: STEP_UPPER_LB });
  assertEquals(once.offsetLb, 5, 'a failed attempt gave back both jumps instead of the last one');
});

// ── THE OFFSET REACHES THE ROW ──────────────────────────────────────────────────────────────────

Deno.test('⛔ THE EARNED INCREMENT LANDS ON TOP OF THE SCHEDULED RISE, NOT INSTEAD OF IT', () => {
  const floor = composeWeek({ ...BASE, week: 6, column: 'standard' } as never)
    .meRows.find((r) => r.movement === 'Bench Press')!;
  const earned = composeWeek({
    ...BASE, week: 6, column: 'standard', barOffsetsByPattern: { push_upper: 10 },
  } as never).meRows.find((r) => r.movement === 'Bench Press')!;
  assertEquals(earned.weight, (floor.weight as number) + 10);

  // ⛔ AND IT IS PLATE-LEGAL. The increment is added to the ROUNDED figure, so what reaches the row is
  // a weight the athlete can actually load rather than one the percentage arithmetic produced.
  assertEquals((earned.weight as number) % 5, 0);

  // ⚠️ AND ONLY THAT PATTERN. An earned bench must not move the squat.
  const wk = composeWeek({
    ...BASE, week: 6, column: 'standard',
    workingNumbers: { bench: LIGHT_BENCH, squat: { ...LIGHT_BENCH, lift: 'squat' as const } },
    barOffsetsByPattern: { push_upper: 10 },
  } as never);
  const squat = wk.meRows.find((r) => r.pattern === 'press_lower');
  const squatFloor = composeWeek({
    ...BASE, week: 6, column: 'standard',
    workingNumbers: { bench: LIGHT_BENCH, squat: { ...LIGHT_BENCH, lift: 'squat' as const } },
  } as never).meRows.find((r) => r.pattern === 'press_lower');
  assertEquals(squat?.weight, squatFloor?.weight, 'an earned bench moved the squat');
});

Deno.test('⛔ THE ME SLOT ONLY — a DE row is a different intent and nobody logged against it', () => {
  const wk = composeWeek({
    ...BASE, week: 6, column: 'standard', barOffsetsByPattern: { push_upper: 10 },
  } as never);
  const de = wk.sessions.flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => (e as Record<string, unknown>).slot_intent === 'DE'
      && typeof (e as Record<string, unknown>).weight === 'number');
  const deFloor = composeWeek({ ...BASE, week: 6, column: 'standard' } as never)
    .sessions.flatMap((s) => s.strength_exercises ?? [])
    .filter((e) => (e as Record<string, unknown>).slot_intent === 'DE'
      && typeof (e as Record<string, unknown>).weight === 'number');
  assertEquals(de.map((e) => e.weight), deFloor.map((e) => e.weight));
});

// ── END TO END: READ THE HISTORY, REBUILD THE REST OF THE BLOCK (item 7) ────────────────────────

Deno.test('⛔⛔ A JUMP EARNED EARLY REBUILDS EVERY WEEK AFTER IT', () => {
  const authored = composeBlock({ ...BASE, weeks: 12, taperWeeks: [] } as never);
  const benchRows = authored.flatMap((b) => b.meRows).filter((r) => r.movement === 'Bench Press');
  /**
   * ⚠️ FIVE WEEKS AND NOT THREE, AND THE REASON IS THE MECHANISM ITSELF. This fixture ran to week 3
   * first and earned nothing: the scheduled rise moves this bar from 145 to 150 between weeks two
   * and three, and a run belongs to a WEIGHT — two good sessions at two different weights are not
   * two in a row. That is the conservative arm on purpose (it refuses to compound his rise with an
   * earned jump in the same week) and it costs the athlete one run each time the floor moves, which
   * on a light bar is once or twice in twelve weeks.
   */
  const early = benchRows.filter((r) => r.week <= 5);
  assert(early.length >= 3, 'the fixture has no early bench sessions to earn from');

  // ⚠️ EVERY EARLY SESSION FINISHED AT THE TOP OF HIS BAND, at the weight the row prescribed.
  const logged = early.map((r) => ({
    week_number: r.week,
    date: dateOn(r.day),
    strength_exercises: [{ name: r.movement, sets: session(5, r.weight ?? 145, r.sets) }],
  }));

  const reading = earnedMeSets({ composed: authored, logged, throughWeek: 5 });
  assert((reading.bar.push_upper ?? 0) > 0, 'finishing the range for three weeks earned nothing');
  assertEquals((reading.bar.push_upper as number) % STEP_UPPER_LB, 0);

  // ⛔ AND THE PROVENANCE IS THERE. A surface offering this diff has to be able to say why a weight
  // moved early, or it is a number the athlete never agreed to.
  const walked = reading.history.push_upper!;
  assert(walked.some((h) => h.bar === 'earned'), 'the walk records no earned session');
  assert(walked.some((h) => h.barOffsetLb > 0), 'the walk never shows the offset appearing');

  const composed = composeBlock({
    ...BASE, weeks: 12, taperWeeks: [], barOffsetsByPattern: reading.bar,
  } as never);
  const planned = authored.flatMap((wk) => wk.sessions
    .filter((s) => s.type === 'strength')
    .map((s, i) => ({
      id: `${wk.week}-${i}`, week_number: wk.week, date: dateOn(s.day),
      strength_exercises: s.strength_exercises,
    })));
  const restated = restateFromTest({ composed, planned, afterWeek: 5 });
  const moved = restated.changes.filter((c) => c.movement === 'Bench Press' && c.to != null);
  assert(moved.length >= 4,
    `the early jump reached only ${moved.length} later weeks — the rest of the block stayed frozen`);
  // ⛔ AND HISTORY DID NOT MOVE. The live week keeps the prescription it is being judged against.
  assert(!restated.changes.some((c) => c.week <= 5), 'a trained week was rewritten');
});

Deno.test('⛔ A BLOCK NOBODY HAS LOGGED AGAINST EARNS NOTHING, and says so rather than guessing', () => {
  const authored = composeBlock({ ...BASE, weeks: 6, taperWeeks: [] } as never);
  const none = earnedMeSets({ composed: authored, logged: [], throughWeek: 6 });
  assertEquals(none.bar, {});
  assert(none.unread > 0, 'the reader claims it read rows it never saw');
});

Deno.test('the frame still prescribes a weighted bench ME row — the fixtures above are not vacuous', () => {
  const rows = composeBlock({ ...BASE, weeks: 4, taperWeeks: [] } as never)
    .flatMap((b) => b.meRows).filter((r) => r.movement === 'Bench Press' && r.weight != null);
  assert(rows.length >= 2, 'no weighted bench ME row — every assertion here would pass vacuously');
});
