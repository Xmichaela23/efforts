/**
 * THE CONTINUOUS ATHLETE — the anchor-weighted block, generated end to end.
 *
 * ⛔ REWRITTEN 2026-08-15 (work order §1b). **This file used to pin an ALL-ANCHOR block (`AAA`) as
 * correct, and it was not one of Wendler's shapes.** Forever p.17 lists three leader:anchor models
 * and only three — 3/2, 2/2, 2/1 — and every one of them carries at least one leader. `leaderCount`
 * returned 0 for the `continuous` tier; it now floors at 1, so the most anchor-weighted block the
 * engine can build is **L-A-A**.
 *
 * ⚠️ WHAT THE FILE IS STILL FOR, and the reason it survived rather than being deleted: `continuous`
 * is the only tier that can put an athlete under MORE THAN ONE anchor cycle. Two 95%-and-rep-out
 * cycles, two advancement gates, and the anchor's heavier assistance band twice. That shape has
 * never run in production, so it is generated deliberately here rather than waiting for a user.
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

Deno.test('⛔ CONTINUOUS RESOLVES TO ONE LEADER AND TWO ANCHORS — never zero leaders', () => {
  // ⛔ SUPERSEDES 'CONTINUOUS RESOLVES TO THREE ANCHORS'. Zero leaders is not a Wendler shape (p.17).
  assertEquals(continuityTier(CONTINUOUS.continuity), 'continuous');
  assertEquals(leaderCount(3, 12, CONTINUOUS), 1);
  assertEquals(cyclesForBlock(12, CONTINUOUS).map((c) => c.kind), ['leader', 'anchor', 'anchor']);
});

// ⛔ THE MAP FOR THIS SHAPE (§1c): L(1-3) · deload(4) · A(5-7) · deload(8) · A(9-11) · TM test(12).
// ⚠️ NO OPENING TEST WEEK — L-A-A plus its two deloads plus the closing test costs exactly 12, and
// the opening test is the one piece the layout drops when the budget is short (the entry gate's 1RM
// stands in for it, which the plan copy states).

Deno.test('two cycles carry a 95% rep-out — two advancement gates, not one and not three', () => {
  // Weeks 7 and 11 are the anchors' third weeks: the 95% set, and the validity check.
  for (const week of [7, 11]) {
    const plan = (liftRow(week, 'Bench Press')?.set_plan ?? []) as any[];
    assert(plan.length > 0, `week ${week} has no bench ramp`);
    assertEquals(plan.at(-1)?.amrap, true, `week ${week} top set must be the rep-out`);
  }
});

Deno.test('the leader cycle survives — weeks 1-3 are 5s PRO, no all-out set', () => {
  // A leader's signature is three fives with no all-out set. The floor at one leader is what keeps
  // a building cycle in front of the measuring ones.
  for (const week of [1, 2, 3]) {
    const plan = (liftRow(week, 'Bench Press')?.set_plan ?? []) as any[];
    assertEquals(plan.at(-1)?.amrap, undefined, `week ${week} should be leader-shaped`);
  }
  for (const week of [5, 6, 7, 9, 10, 11]) {
    const plan = (liftRow(week, 'Bench Press')?.set_plan ?? []) as any[];
    assertEquals(plan.at(-1)?.amrap, true, `week ${week} should be anchor-shaped`);
  }
});

// ── The assistance band, per phase ──────────────────────────────────────────

Deno.test('⛔ THE ANCHOR CARRIES MORE ASSISTANCE THAN THE LEADER — Forever p.18', () => {
  // ⛔⛔ SUPERSEDES 'THE FLOOR HOLDS IN ALL THREE CYCLES'. That test pinned the anchor at the band's
  // floor and let leaders climb — the exact inversion the work order's §1a fixes. Leaders are the
  // easier month; anchors are where the volume goes.
  //
  // A tested 12-rep pull max earns floor + (12-8)×3 = +12 → +10 after rounding, inside its band.
  //   leader week: 50 floor → 60        anchor week: 75 floor → 85
  // ⛔ THE ANCHOR IS NO LONGER FLAT AT 75. The concurrent-athlete clamp was removed 2026-08-15
  // (Michael: "whatever Wendler says"), so the anchor runs his own 75-100 band and scales with
  // tested capacity like every other band.
  const totals = (week: number) => {
    const s = sessionsFor(week).find((x) => x.type === 'strength');
    const rows = (s?.strength_exercises ?? []) as any[];
    return rows.filter((r) => typeof r.reps === 'string' && String(r.reps).endsWith('total'))
      .map((r) => String(r.reps));
  };
  const leader = totals(1);
  const anchor = totals(5);
  assert(leader.length > 0 && anchor.length > 0, 'a week is missing its assistance rows');
  for (const t of leader) assert(t === '50 total' || t === '60 total', `leader week 1 got ${t}`);
  for (const t of anchor) assert(t === '75 total' || t === '85 total', `anchor week 5 got ${t}`);
  // The direction itself, not just the numbers: every anchor slot is ≥ every leader slot.
  assert(Math.min(...anchor.map((t) => parseInt(t, 10))) >= Math.max(...leader.map((t) => parseInt(t, 10))),
    `anchor ${anchor} did not clear leader ${leader}`);
});

Deno.test('⛔ THE JUMPS SCALE THE SAME DIRECTION — 2×5 in a leader, 3×5 in an anchor', () => {
  const jumpOn = (week: number) => {
    const s = sessionsFor(week).find((x) => x.type === 'strength' && x.name.includes('Squat'));
    return (s?.strength_exercises ?? []).find((e: any) => e.name === 'Box Jump') as any;
  };
  assertEquals(jumpOn(1)?.sets, 2, 'leader week should carry the lighter jump dose');
  assertEquals(jumpOn(5)?.sets, 3, 'anchor week should carry the heavier jump dose');
});

// ── The progression across the gates ────────────────────────────────────────

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

Deno.test('⛔ THE DRIFT IS BOUNDED BY THE MISS, NOT BY A RATIO — two anchors, two brakes', () => {
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
  // generated block shows two advances taken on no evidence. That is the forecast's job.

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

Deno.test('L-A-A measures twice where L-L-A measures once — the offsetting half', () => {
  // The reason this drift is not simply a defect. A leader has NO all-out set, so an L-L-A block
  // contains exactly ONE measuring CYCLE in twelve weeks. L-A-A contains two. Fixed steps with two
  // gates self-correct sooner than fixed steps with one, even though each individual step is blind.
  // ⚠️ CYCLE WEEKS ONLY. Both shapes also carry TM-test weeks, and those measure too (§1d) — but
  // they are the same count in both, so counting them here would flatten the difference under test.
  const cycleGates = (plan: any, weeks: number[]) =>
    weeks.filter((w) =>
      ((plan.sessions_by_week[String(w)] ?? [])
        .find((x: any) => x.type === 'strength' && x.name.includes('Bench Press'))
        ?.strength_exercises?.find((e: any) => e.name === 'Bench Press')?.set_plan as any[] | undefined)
        ?.some((p) => p.amrap)
    ).length;
  const lla = composeStrengthPrimaryPlan({ ...base, blockShape: { continuity: { weeksSince: null, logs: 0 } } });
  // L-L-A map: test(1) · L(2-4) · L(5-7) · deload(8) · A(9-11) · test(12).
  assertEquals(cycleGates(lla, [2, 3, 4, 5, 6, 7, 9, 10, 11]), 3, 'L-L-A: one anchor, three AMRAP weeks in it');
  // L-A-A map: L(1-3) · deload(4) · A(5-7) · deload(8) · A(9-11) · test(12).
  assertEquals(cycleGates(PLAN, [1, 2, 3, 5, 6, 7, 9, 10, 11]), 6, 'L-A-A: two anchors');
});

Deno.test('⛔ EVERY CYCLE IS FOLLOWED BY A LIGHT WEEK — no two cycles run back to back', () => {
  // ⛔ SUPERSEDES 'each of the three cycles still ends in its own deload'. The unload is no longer
  // INSIDE the cycle; it is a standalone week between cycles (Forever p.21, "always used between
  // your Leader and Anchor template"). What must stay true is that two measuring cycles never run
  // back to back — which is the property the old per-cycle deload was really protecting.
  for (const week of [4, 8]) {
    const s = sessionsFor(week).find((x) => x.type === 'strength');
    assert(s, `week ${week} has no strength session`);
    const rows = (s!.strength_exercises ?? []) as any[];
    const mainRow = rows.find((r) => Array.isArray(r.set_plan));
    for (const p of (mainRow?.set_plan ?? []) as any[]) assertEquals(p.amrap, undefined, `week ${week} deload`);
    assertEquals(mainRow.set_plan.map((p: any) => p.reps), [5, 3, 1, 1], `week ${week} is the 7th-week shape`);
  }
  // And the block closes on a TM test, whose top set IS open — the transition gate.
  const wk12 = (liftRow(12, 'Bench Press')?.set_plan ?? []) as any[];
  assertEquals(wk12.at(-1)?.amrap, true, 'week 12 is the closing TM test');
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
  // ⛔ 2 LEADERS AND 2 ANCHORS AT 16 WEEKS — his p.17 second model. It was 3:1, which he does not
  // publish; `publishedFallback` caps the leader count at ceil(cycles / 2) (§1c).
  assertEquals(
    cyclesForBlock(16, CONTINUOUS).map((c) => c.kind),
    ['leader', 'leader', 'anchor', 'anchor'],
  );
  assertEquals(
    cyclesForBlock(12, { ...CONTINUOUS, highAerobicLoad: true }).map((c) => c.kind),
    ['leader', 'leader', 'anchor'],
  );
});
