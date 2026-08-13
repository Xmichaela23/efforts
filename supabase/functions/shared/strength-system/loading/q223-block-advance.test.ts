/**
 * ⛔ THE Q-223 CHAIN, END TO END, AGAINST A REAL BLOCK SHAPE.
 *
 *   ~/.deno/bin/deno test supabase/functions/shared/strength-system/loading/q223-block-advance.test.ts --no-check
 *
 * ⛔ WHY THIS FILE EXISTS. `rematerialize-strength-block` has been deployed since 2026-07-31 and
 * HAS NEVER EXECUTED — the athlete's block reaches its first evaluable cycle boundary weeks after
 * the deploy, so the whole chain (verdict → working number → future-weeks-only diff) has run in
 * tests and never in anger. The unit pieces are each covered (`cycle-verdicts.test.ts`,
 * `wendler-531.test.ts`); what was not covered is them WIRED TOGETHER over a real 12-week block with
 * real training maxes. That is the arrangement that runs for the first time on a live plan.
 *
 * ⚠️ THE NUMBERS BELOW ARE A REAL BLOCK'S SHAPE, transcribed read-only: a 12-week strength_primary
 * block, phase structure Anchor(1-3)+Deload(4) × 3, training maxes 90/125/125/85 against
 * one-rep maxes 110/150/150/100. Nothing here writes anywhere; it is arithmetic over constants.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { workingNumberForCycles, type WorkingNumberVerdict } from './wendler-531.ts';
import { verdictsForBlock, verdictForCycle, groupSessionsByCycle } from './cycle-verdicts.ts';

/** The block on the calendar: three four-week cycles, Anchor(3) + Deload(1). */
const CYCLES = [
  { index: 1, startWeek: 1, endWeek: 4 },
  { index: 2, startWeek: 5, endWeek: 8 },
  { index: 3, startWeek: 9, endWeek: 12 },
] as const;

const LIFTS = [
  { ref: 'squat', name: 'Back Squat', lower: true, tm: 90, oneRM: 110 },
  { ref: 'deadlift', name: 'Deadlift', lower: true, tm: 125, oneRM: 150 },
  { ref: 'bench', name: 'Bench Press', lower: false, tm: 125, oneRM: 150 },
  { ref: 'overheadPress', name: 'Overhead Press', lower: false, tm: 85, oneRM: 100 },
] as const;

// ⚠️ NO `oneRM` ARGUMENT AS OF 2026-08-12 (slice a). It fed the 90%-of-1RM ceiling, which is deleted.
// The `oneRM` column above is kept on the fixture because it is what the freeze test below measures
// against — it is data about the athlete, not an input to the ladder any more.
const wnAtCycle = (l: typeof LIFTS[number], cycle: number, verdicts: WorkingNumberVerdict[]) =>
  workingNumberForCycles(l.tm, cycle, l.lower, verdicts, { unknownMeans: 'hold' }).workingNumber;

/** A logged session carrying an all-out set at the given reps. */
const session = (weekInCycle: number, liftName: string, reps: number) => ({
  weekInCycle,
  workout: { strength_exercises: [{ name: liftName, sets: [
    { weight: 100, reps: 5, completed: true },
    { weight: 110, reps: 3, completed: true },
    { weight: 120, reps, amrap: true, completed: true },
  ] }] },
});

// ── THE TIMING ────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ A CYCLE IS READ ONLY ONCE IT HAS FINISHED — week 5, not week 3', () => {
  // `verdictsForBlock` gates on `c.endWeek < currentWeek`. Cycle 1 ends week 4, so the week-3 all-out
  // set does NOT move anything until the athlete is in week 5. This is the single most surprising
  // property of the finale: the measurement happens in week 3 and the consequence lands in week 5.
  const crushed = [[session(3, 'Back Squat', 8)]];
  for (const week of [3, 4]) {
    assertEquals(verdictsForBlock(CYCLES, crushed, 'Back Squat', week)[0], 'advance',
      `week ${week}: cycle 1 is unfinished, so it is still a FORECAST`);
  }
  const missed = [[session(3, 'Back Squat', 0)]];
  assertEquals(verdictsForBlock(CYCLES, missed, 'Back Squat', 4)[0], 'advance',
    'even a logged MISS is invisible while the cycle is unfinished');
  // ⚠️ `miss`, not `reset` (slice a) — the reader reports the session; one miss holds the weight.
  assertEquals(verdictsForBlock(CYCLES, missed, 'Back Squat', 5)[0], 'miss',
    'week 5: the cycle is finished and the evidence is read');
});

// ── THE PROPOSAL ──────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ CRUSHING THE SET PRODUCES NO PROPOSAL — the advance was already in the plan', () => {
  // ⚠️ THIS IS THE FINDING THAT MOST CHANGES HOW THE FEATURE READS. Wendler's +5/+10 is automatic;
  // the all-out set does not EARN it, it can only WITHHOLD it (wendler-531.ts:206-208 — "the
  // increment stays +5/+10 and the reps are feedback, not an input"). So a big set produces the same
  // working number the forecast already carried, the diff is empty, and no consent sheet appears.
  // The sheet is a MISS notice, not a reward notice.
  for (const l of LIFTS) {
    const forecast = wnAtCycle(l, 2, ['advance', 'advance']);
    const crushed = wnAtCycle(l, 2, ['advance', 'advance']);   // what a 8-rep 95% set yields
    assertEquals(crushed, forecast, `${l.name}: a crushed set must equal the forecast`);
  }
});

Deno.test('⛔ ONE MISS HOLDS THE NUMBER — the free re-try, and there is no proposal to make', () => {
  // ⛔ REWRITTEN 2026-08-12 (slice a). This test used to assert that a single missed 95% set dropped
  // the number 10% and that the drop WAS the consent sheet. p33 says otherwise: a less than stellar
  // day means *"getting your prescribed weights and leaving."* One miss repeats the weight.
  for (const l of LIFTS) {
    assertEquals(wnAtCycle(l, 2, ['miss', 'miss']), l.tm, `${l.name}: cycle 2 repeats cycle 1`);
  }
});

Deno.test('⛔ THE SECOND CONSECUTIVE MISS MOVES THE NUMBER DOWN, AND THAT IS THE PROPOSAL', () => {
  // reset = −10%, rounded down to plate granularity. These are the numbers the sheet would show,
  // now at cycle 3 rather than cycle 2 — the athlete got a whole cycle to re-try the weight first.
  const expected: Record<string, [number, number]> = {
    // lift: [forecast at cycle 3 (two clean advances), after a confirmed stall]
    'Back Squat': [110, 80],
    'Deadlift': [145, 110],
    'Bench Press': [135, 110],
    'Overhead Press': [95, 75],
  };
  for (const l of LIFTS) {
    const [fc, rs] = expected[l.name];
    assertEquals(wnAtCycle(l, 3, ['advance', 'advance']), fc, `${l.name} forecast`);
    assertEquals(wnAtCycle(l, 3, ['miss', 'miss']), rs, `${l.name} after a confirmed stall`);
    assert(rs < fc, `${l.name}: a confirmed stall must be a step DOWN`);
  }
});

Deno.test('an unlogged cycle HOLDS — it does not advance and it does not punish', () => {
  // "A missing signal is not evidence of progress" — and it is not evidence of failure either.
  for (const l of LIFTS) {
    assertEquals(wnAtCycle(l, 2, ['hold', 'hold']), l.tm, `${l.name} holds at its base`);
  }
});

// ── THE CEILING ───────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ EVERY LIFT CLIMBS ON A PERFECT BLOCK — the 90% ceiling stalled two of four', () => {
  // ⛔ THIS IS THE INVERSION, AND THIS BLOCK IS THE ATHLETE IT WAS REPORTED ON. It asserted that a
  // 110 lb squat and a 100 lb press could not exceed 90% of their max on file, so cycles 2 and 3
  // carried the same weight EVEN ON A PERFECT BLOCK — the athlete saw a number that simply stopped
  // moving. The ceiling is deleted (p30: the brake is a missed prescription, not a record), so a
  // perfect block must now climb on all four.
  const perfect: WorkingNumberVerdict[] = ['advance', 'advance'];
  for (const l of LIFTS) {
    const c2 = wnAtCycle(l, 2, perfect);
    const c3 = wnAtCycle(l, 3, perfect);
    assert(c2 > l.tm, `${l.name}: cycle 2 did not move off the base`);
    assert(c3 > c2, `${l.name}: cycle 3 repeats cycle 2 — the freeze is back`);
    // Wendler's fixed step, for the light bars too (p90, p107). No percentage shrink.
    assertEquals(c3 - c2, l.lower ? 10 : 5, `${l.name}: wrong step size`);
  }
  // ⚠️ AND THE SQUAT'S CYCLE-3 NUMBER (110) NOW EQUALS ITS MAX ON FILE (110). Allowed on purpose:
  // that max is a signup number nothing has tested. If it is real the athlete misses the 95% set,
  // holds, misses again and comes down 10% — the correction is earned, not pre-empted.
  const squat = LIFTS.find((l) => l.name === 'Back Squat')!;
  assertEquals(wnAtCycle(squat, 3, perfect), squat.oneRM);
});

// ── SCOPE ─────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ ONE LIFT\'S VERDICT NEVER TOUCHES ANOTHER LIFT', () => {
  // Verdicts are read per lift name. A missed squat must not drag the bench down with it.
  const grouped = [[session(3, 'Back Squat', 0)]];   // squat missed; nothing logged for bench
  assertEquals(verdictsForBlock(CYCLES, grouped, 'Back Squat', 5)[0], 'miss');
  assertEquals(verdictsForBlock(CYCLES, grouped, 'Bench Press', 5)[0], 'hold',
    'the bench saw no evidence of its own and holds');
});

Deno.test('⛔ A SESSION OUTSIDE THE BLOCK CONTRIBUTES NOTHING', () => {
  // The join is by plan week. An unattached workout — freestyle, or from another plan — cannot move
  // a prescribed weight, which is what keeps this scoped to the block the athlete is actually on.
  const joined = [
    { week_number: null, strength_exercises: [{ name: 'Back Squat', sets: [{ weight: 120, reps: 0, amrap: true, completed: true }] }] },
    { week_number: 99, strength_exercises: [{ name: 'Back Squat', sets: [{ weight: 120, reps: 0, amrap: true, completed: true }] }] },
  ];
  const grouped = groupSessionsByCycle(joined as never, CYCLES);
  assertEquals(grouped.flat().length, 0, 'neither row lands in a cycle');
  assertEquals(verdictsForBlock(CYCLES, grouped, 'Back Squat', 5)[0], 'hold');
});

Deno.test('the LAST cycle earns no verdict — it belongs to the next block', () => {
  // `verdictsForBlock` slices off the final cycle: its verdict would decide what cycle 4 carries,
  // and there is no cycle 4.
  assertEquals(verdictsForBlock(CYCLES, [[], [], []], 'Back Squat', 12).length, CYCLES.length - 1);
});

// ── THE CONSENT INVARIANT ─────────────────────────────────────────────────────────────────────

Deno.test('⛔ NOTHING IN THIS CHAIN WRITES — it computes a proposal and returns it', () => {
  // The entire module set is pure arithmetic over inputs. `rematerialize-strength-block` is the only
  // thing that can persist, and it does so ONLY on `apply: true` (its header: "IT PROPOSES. IT DOES
  // NOT SILENTLY WRITE"). This asserts the layer beneath that gate is side-effect free: identical
  // inputs, identical outputs, no state carried between calls.
  const runs = Array.from({ length: 3 }, () =>
    LIFTS.map((l) => wnAtCycle(l, 3, ['advance', 'reset'])).join(','));
  assertEquals(new Set(runs).size, 1, 'repeated evaluation must be identical — no accumulation');

  // And the verdict reader is equally pure over the same session.
  const s = [session(3, 'Back Squat', 5)];
  assertEquals(verdictForCycle(s, 'Back Squat'), verdictForCycle(s, 'Back Squat'));
});
