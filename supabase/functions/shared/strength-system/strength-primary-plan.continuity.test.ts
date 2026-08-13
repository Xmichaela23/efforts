/**
 * THE CONTINUOUS ATHLETE — the AAA block, generated end to end.
 *
 * ⛔ WHY THIS FILE EXISTS. `continuous` → three anchor cycles is the only configuration the composer
 * could not previously produce. Every block before 2026-07-28 ended in exactly one anchor, so three
 * anchors is a shape that has never run: three 95%-and-rep-out weeks, three advancement gates, and
 * the accessory floor holding in every cycle rather than only the last.
 *
 * Michael, 2026-07-28: *"the only config that didn't exist before and the only one that can put
 * someone under three anchor cycles. Worth generating one deliberately rather than waiting for a
 * user to find it."* So this generates one, and reads the rows.
 *
 * ⚠️ FIXTURE, NOT PRODUCTION. Nothing here touches a database or an athlete's numbers — the maxes
 * below are round and invented, per the standing rule that no decision is gated on Michael's own.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { continuityTier, cyclesForBlock, leaderCount } from './loading/wendler-531.ts';

const MAXES = { bench: 225, squat: 315, deadlift: 405, overheadPress: 135 };

const base = {
  durationWeeks: 12,
  oneRepMaxes: MAXES,
  enduranceSport: 'run' as const,
  enduranceFrequency: 3,
  targetWeeklyMiles: 20,
  easyPaceMinPerMile: 9,
};

/** Two weeks since the last lift, 40 logged sets across the four mains. */
const CONTINUOUS = { continuity: { weeksSince: 2, logs: 40 }, strengthPosture: 'develop' };

const PLAN = composeStrengthPrimaryPlan({ ...base, blockShape: CONTINUOUS, pullupMaxReps: 12 });

const sessionsFor = (week: number) => PLAN.sessions_by_week[String(week)] ?? [];
const liftRow = (week: number, lift: string) => {
  const s = sessionsFor(week).find((x) => x.type === 'strength' && x.name.includes(lift));
  return s?.strength_exercises?.find((e: any) => e.name === lift);
};

// ── The shape ───────────────────────────────────────────────────────────────

Deno.test('⛔ CONTINUOUS RESOLVES TO THREE ANCHORS — the config that did not exist before', () => {
  assertEquals(continuityTier(CONTINUOUS.continuity), 'continuous');
  assertEquals(leaderCount(3, 12, CONTINUOUS), 0);
  assertEquals(cyclesForBlock(12, CONTINUOUS).map((c) => c.kind), ['anchor', 'anchor', 'anchor']);
});

Deno.test('every cycle carries a 95% rep-out — three advancement gates, not one', () => {
  // Weeks 3, 7 and 11 are each a cycle's third week: the 95% set, and the validity check.
  for (const week of [3, 7, 11]) {
    const plan = (liftRow(week, 'Bench Press')?.set_plan ?? []) as any[];
    assert(plan.length > 0, `week ${week} has no bench ramp`);
    assertEquals(plan.at(-1)?.amrap, true, `week ${week} top set must be the rep-out`);
  }
});

Deno.test('the leader weeks are gone — no 5s-PRO week survives an AAA block', () => {
  // A leader's signature is three fives with no all-out set. In this block every non-deload week's
  // top set is an AMRAP, so nothing here is a leader.
  for (const week of [1, 2, 3, 5, 6, 7, 9, 10, 11]) {
    const plan = (liftRow(week, 'Bench Press')?.set_plan ?? []) as any[];
    assertEquals(plan.at(-1)?.amrap, true, `week ${week} should be anchor-shaped`);
  }
});

// ── The accessory floor, under the shape that stresses it most ──────────────

Deno.test('⛔ THE FLOOR HOLDS IN ALL THREE CYCLES, INCLUDING FOR A TESTED 12-REP PULL', () => {
  // A 12-rep pull max would earn 50 + (12-8)*3 = 62 → 60 in a LEADER cycle. There are no leaders
  // here, so the tested capacity is deliberately NOT spent: the main lifts are at 95% with a rep-out
  // in every cycle, and that is the week accessory volume must not compete with.
  //
  // ⚠️ THE NUMBER MOVED 25 → 50 ON 2026-08-05 AND THE PROPERTY DID NOT. The floor is now Wendler's
  // real one — his lowest figure anywhere is 50 (Triumvirate p.48 runs 50-75; Bodyweight p.52 says
  // "no less than 75 per exercise"), and the old 25 rested on a "25-50 range" that is not in the
  // book. What this test pins is that an ANCHOR cycle holds whatever the floor is, against a tested
  // capacity that would otherwise buy more.
  for (const week of [1, 5, 9]) {
    const s = sessionsFor(week).find((x) => x.type === 'strength');
    const rows = (s?.strength_exercises ?? []) as any[];
    const acc = rows.filter((r) => typeof r.reps === 'string' && String(r.reps).endsWith('total'));
    assert(acc.length > 0, `week ${week} has no assistance rows`);
    for (const r of acc) assertEquals(r.reps, '50 total', `week ${week}: ${r.name}`);
  }
});

// ── The progression across three gates ──────────────────────────────────────

Deno.test('⛔ THE WORKING NUMBER STILL CLIMBS ONCE PER CYCLE, NOT ONCE PER WEEK', () => {
  // The diagnosis three sessions have now got wrong, pinned under the new shape. Within a cycle the
  // working number HOLDS and the top set climbs because the PERCENTAGE climbs 85→90→95. Across
  // cycles the working number itself advances.
  // WORK sets only — a warm-up ramp (40/50/60) sits in front on working weeks, and its opener is a
  // flat 40% every cycle, which is not what "the opener climbs" is about (Wendler p.31).
  const work = (week: number) => ((liftRow(week, 'Bench Press')?.set_plan ?? []) as any[]).filter((s) => !s.warmup);
  const w1 = work(1);
  const w3 = work(3);
  assert(w3.at(-1).weight > w1.at(-1).weight, 'the top set climbs within the cycle');

  // And cycle 2's opening WORK set is heavier than cycle 1's, at the same 65% — that is the advance.
  const c1 = work(1)[0].weight;
  const c2 = work(5)[0].weight;
  const c3 = work(9)[0].weight;
  assert(c2 > c1 && c3 > c2, `opening sets should climb per cycle: ${c1} → ${c2} → ${c3}`);
});

/**
 * ⛔ THE RIGHT CEILING IS THE TM-TO-TRUE-MAX RATIO, NOT PRESCRIBED WEIGHT VS 1RM.
 *
 * A first version of this test asserted that nothing is ever prescribed above the athlete's 1RM.
 * Michael, 2026-07-28: *"that's a floor, not the property that matters."* He is right. 5/3/1's whole
 * premise is that the training max sits at ~85-90% of the true max — that is what makes the AMRAP a
 * MEASUREMENT rather than a max attempt. A week-11 set can be comfortably under the 1RM in absolute
 * terms and still be a near-max single, which is the thing the protocol exists to avoid.
 *
 * So this measures the ratio, per cycle, and it is written to REPORT rather than to pass quietly.
 */
const tmRatio = (plan: any, week: number, lift: string, oneRM: number) => {
  const sets = (plan.sessions_by_week[String(week)] ?? [])
    .find((x: any) => x.type === 'strength' && x.name.includes(lift))
    ?.strength_exercises?.find((e: any) => e.name === lift)?.set_plan as any[] | undefined;
  if (!sets?.length) return null;
  // The anchor's third week is the 95% set, so the working number is that weight / 0.95.
  return (sets.at(-1)!.weight / 0.95) / oneRM;
};

Deno.test('⛔ THE AAA DRIFT IS BOUNDED BY THE MISS, NOT BY A RATIO — three anchors, three brakes', () => {
  // ⛔⛔ SUPERSEDES 'THE 90% CEILING BOUNDS THE AAA DRIFT' (2026-07-28). That test asserted the
  // training max could never pass 90% of the max ON FILE, on either a heavy or a light block. Both
  // assertions are deliberately gone: the ceiling was an app invention that FROZE light blocks into
  // byte-identical cycles, and Wendler's brake is a missed prescription (p30), not a record.
  //
  // ⚠️ THE ADVANCE IS FIXED IN SIZE AND GATED IN OCCURRENCE. `workingNumberForCycle`: *"Do NOT
  // recompute this from an AMRAP result … the reps are FEEDBACK, not an input."* The step is +5/+10
  // for every athlete now — the 6% percentage shrink went with the ceiling (p90, p107). What the
  // all-out set decides is WHETHER the step happens, not how big it is.
  //
  // In a forecast — which is what a freshly generated block is — every verdict is `advance`, so a
  // generated AAA block shows two advances taken on no evidence. That is the forecast's job.

  // The heavy athlete: TM 265 → 275 → 285 against a 315 max. 90.5%, which the ceiling used to
  // truncate to 88.9%. Both are inside the range where the 95% set is still a rep-out.
  const heavy = tmRatio(PLAN, 11, 'Back Squat', MAXES.squat)!;
  assert(heavy > 0.90 && heavy < 0.92, `heavy squat TM reached ${(heavy * 100).toFixed(1)}% of 1RM`);

  // ⛔ THE LIGHT LIFTER IS THE CASE THAT USED TO FREEZE, AND THE ONLY THING THAT MATTERS ABOUT THE
  // RATIO NOW IS THAT THE NUMBER MOVED. A 200 lb squat: TM 170 → 180 → 190.
  const light = composeStrengthPrimaryPlan({
    ...base,
    oneRepMaxes: { bench: 155, squat: 200, deadlift: 245, overheadPress: 95 },
    blockShape: CONTINUOUS,
  });
  const c2 = tmRatio(light, 7, 'Back Squat', 200)!;
  const c3 = tmRatio(light, 11, 'Back Squat', 200)!;
  assert(c3 > c2, `light squat froze: cycle 2 and cycle 3 are both ${(c3 * 100).toFixed(1)}% of 1RM`);

  // ⛔ AND WHAT REPLACED THE BOUND, SAID PLAINLY BECAUSE IT IS THE WHOLE ARGUMENT. Nothing stops the
  // ratio climbing except the athlete failing to beat the prescription: at that point the number
  // holds, and a second consecutive failure drops it 10%. A drifting-too-high training max is
  // self-correcting on the way down, which is Wendler's own mechanism (p31).

  // ⛔ THE ONE THIS DOES NOT CLOSE, AND IT IS WHY THE CEILING WAS NEVER A REAL GUARD ANYWAY. Every
  // ratio above is computed against `oneRM` — a signup number the athlete typed once and that never
  // updates. If it was aspirational the true ratio is worse than any assertion here believes, AND
  // THIS TEST STILL PASSES, because it measures against the same stale number. Michael, 2026-07-28.
  // `exercise_log`'s e1RM trend is the candidate for a tested max and is not wired to this.
});

Deno.test('AAA measures three times where LLA measures once — the offsetting half', () => {
  // The reason this drift is not simply a defect. A leader has NO all-out set, so an LLA block
  // contains exactly ONE measurement in twelve weeks. AAA contains three. Fixed steps with three
  // gates self-correct sooner than fixed steps with one, even though each individual step is blind.
  const countGates = (plan: any) =>
    [1, 2, 3, 5, 6, 7, 9, 10, 11].filter((w) =>
      ((plan.sessions_by_week[String(w)] ?? [])
        .find((x: any) => x.type === 'strength' && x.name.includes('Bench Press'))
        ?.strength_exercises?.find((e: any) => e.name === 'Bench Press')?.set_plan as any[] | undefined)
        ?.some((p) => p.amrap)
    ).length;
  const lla = composeStrengthPrimaryPlan({ ...base, blockShape: { continuity: { weeksSince: null, logs: 0 } } });
  assertEquals(countGates(lla), 3, 'LLA: one anchor, three AMRAP weeks in it');
  assertEquals(countGates(PLAN), 9, 'AAA: three anchors');
});

Deno.test('each of the three cycles still ends in its own deload', () => {
  // The deload is per cycle, not per block — losing it in an AAA shape would be three anchors back
  // to back with no unload between them.
  for (const week of [4, 8, 12]) {
    const s = sessionsFor(week).find((x) => x.type === 'strength');
    assert(s, `week ${week} has no strength session`);
    const rows = (s!.strength_exercises ?? []) as any[];
    assertEquals(rows.length, 1, `week ${week} deload should be the main lift alone, got ${rows.length} rows`);
    for (const p of (rows[0].set_plan ?? []) as any[]) assertEquals(p.amrap, undefined, `week ${week} deload`);
  }
});

// ── The regression that matters most: everyone else is unchanged ────────────

Deno.test('⛔ AN ATHLETE WITH NO LIFTING HISTORY GETS EXACTLY TODAY’S BLOCK', () => {
  // The whole reason this ships as a pure addition. `unknown` is NOT `detrained` — a cold start has
  // no `last_logged` at all, and `sample_count: 0` reads identically to "has not lifted in a year"
  // while being a different person entirely.
  assertEquals(continuityTier({ weeksSince: null, logs: 0 }), 'unknown');
  const cold = composeStrengthPrimaryPlan({ ...base, blockShape: { continuity: { weeksSince: null, logs: 0 } } });
  const today = composeStrengthPrimaryPlan(base);
  assertEquals(
    cyclesForBlock(12, { continuity: { weeksSince: null, logs: 0 } }).map((c) => c.kind),
    ['leader', 'leader', 'anchor'],
  );
  assertEquals(JSON.stringify(cold.sessions_by_week), JSON.stringify(today.sessions_by_week));
});

Deno.test('⛔ A DETRAINED ATHLETE GETS THE FEWEST ANCHORS, NOT THE MOST', () => {
  // The inversion Michael caught in the first draft: leaders exist to build a base, and detrained is
  // the state where that base is missing. Two 95%-and-AMRAP cycles on connective tissue that is nine
  // weeks behind is the one configuration that can hurt somebody.
  const det = { continuity: { weeksSince: 9, logs: 30 }, strengthPosture: 'develop' };
  assertEquals(continuityTier(det.continuity), 'detrained');
  assertEquals(cyclesForBlock(12, det).map((c) => c.kind), ['leader', 'leader', 'anchor']);
});

Deno.test('maintain posture and a long block both refuse the anchor-weighted shape', () => {
  assertEquals(
    cyclesForBlock(12, { ...CONTINUOUS, strengthPosture: 'maintain' }).map((c) => c.kind),
    ['leader', 'leader', 'anchor'],
  );
  assertEquals(
    cyclesForBlock(16, CONTINUOUS).map((c) => c.kind),
    ['leader', 'leader', 'leader', 'anchor'],
  );
  assertEquals(
    cyclesForBlock(12, { ...CONTINUOUS, highAerobicLoad: true }).map((c) => c.kind),
    ['leader', 'leader', 'anchor'],
  );
});
