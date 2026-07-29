import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  setsForWeek,
  workingNumberFrom1RM,
  workingNumberForCycle,
  weightForSet,
  roundDownToIncrement,
  cyclesForBlock,
  cycleForWeek,
  verdictFrom95Set,
  cappedCycleIncrementLb,
  tmCeilingLb,
  workingNumberForCycles,
  applyVerdict,
  VALIDITY_CHECK_PCT,
  ESTIMATE_TRUSTED_MAX_REPS,
} from './wendler-531.ts';

// =============================================================================
// Every number pinned here is Wendler's. If one changes, either the source changed
// or somebody invented one — and inventing them is what this whole rewrite replaced.
// =============================================================================

Deno.test('leader: every set is five reps, and there is NO all-out set', () => {
  for (const wk of [1, 2, 3, 4]) {
    const sets = setsForWeek('leader', wk);
    assertEquals(sets.map((s) => s.reps), [5, 5, 5], `leader week ${wk} reps`);
    assertEquals(sets.some((s) => s.amrap), false, `leader week ${wk} must have no AMRAP`);
  }
});

Deno.test('leader: the percentages are the standard ones — only the reps differ', () => {
  assertEquals(setsForWeek('leader', 1).map((s) => s.pct), [0.65, 0.75, 0.85]);
  assertEquals(setsForWeek('leader', 2).map((s) => s.pct), [0.70, 0.80, 0.90]);
  assertEquals(setsForWeek('leader', 3).map((s) => s.pct), [0.75, 0.85, 0.95]);
  assertEquals(setsForWeek('leader', 4).map((s) => s.pct), [0.40, 0.50, 0.60]);
});

Deno.test('anchor: 5/3/1 proper, and only the LAST set of a non-deload week is open', () => {
  assertEquals(setsForWeek('anchor', 1).map((s) => s.reps), [5, 5, 5]);
  assertEquals(setsForWeek('anchor', 2).map((s) => s.reps), [3, 3, 3]);
  assertEquals(setsForWeek('anchor', 3).map((s) => s.reps), [5, 3, 1]);

  for (const wk of [1, 2, 3]) {
    assertEquals(setsForWeek('anchor', wk).map((s) => s.amrap), [false, false, true], `anchor wk ${wk}`);
  }
  // A deload is never an all-out week — that would defeat the point of it.
  assertEquals(setsForWeek('anchor', 4).some((s) => s.amrap), false);
});

Deno.test('the 95% validity set sits at week 3 of EVERY cycle', () => {
  for (const kind of ['leader', 'anchor'] as const) {
    const top = setsForWeek(kind, 3)[2];
    assertEquals(top.pct, VALIDITY_CHECK_PCT);
  }
  // Leader wk3 asks for a fixed five at 95% — pass/fail.
  assertEquals(setsForWeek('leader', 3)[2].reps, 5);
  assertEquals(setsForWeek('leader', 3)[2].amrap, false);
  // Anchor wk3 opens it — pass/fail WITH a number, which is the transition gate.
  assertEquals(setsForWeek('anchor', 3)[2].amrap, true);
});

Deno.test('working number is 85% of the 1RM, rounded DOWN', () => {
  assertEquals(workingNumberFrom1RM(225), 190); // 191.25 → 190, not 195
  assertEquals(workingNumberFrom1RM(165), 140); // 140.25 → 140
  assertEquals(workingNumberFrom1RM(275), 230); // 233.75 → 230
  assertEquals(workingNumberFrom1RM(105), 85);  //  89.25 → 85
  assertEquals(workingNumberFrom1RM(0), 0);
});

Deno.test('round DOWN, never to nearest — overshoot writes an unfinishable set', () => {
  assertEquals(roundDownToIncrement(139), 135); // nearest would be 140
  assertEquals(roundDownToIncrement(144), 140); // nearest would be 145
  assertEquals(roundDownToIncrement(140), 140);
  assertEquals(roundDownToIncrement(3), 5);     // floors at one increment, never 0
});

Deno.test('increments: +5 upper, +10 lower, per cycle', () => {
  // Bench, working number 140, across a 12-week block's three cycles.
  assertEquals([1, 2, 3].map((c) => workingNumberForCycle(140, c, false)), [140, 145, 150]);
  // Squat, working number 190.
  assertEquals([1, 2, 3].map((c) => workingNumberForCycle(190, c, true)), [190, 200, 210]);
});

Deno.test('12 weeks is leader, leader, anchor — Wendler\'s 2:1, and the anchor is LAST', () => {
  const c = cyclesForBlock(12);
  assertEquals(c.map((x) => x.kind), ['leader', 'leader', 'anchor']);
  assertEquals(c.map((x) => [x.startWeek, x.endWeek]), [[1, 4], [5, 8], [9, 12]]);
});

Deno.test('8 weeks is 1:1 (off-ratio, the short option); 16 weeks is 2:2', () => {
  assertEquals(cyclesForBlock(8).map((x) => x.kind), ['leader', 'anchor']);
  assertEquals(cyclesForBlock(16).map((x) => x.kind), ['leader', 'leader', 'leader', 'anchor']);
});

Deno.test('the measurement weeks of a 12-week block are 9, 10 and 11 — never 1-8', () => {
  const measured: number[] = [];
  for (let wk = 1; wk <= 12; wk++) {
    const c = cycleForWeek(12, wk)!;
    if (setsForWeek(c.slot.kind, c.weekInCycle).some((s) => s.amrap)) measured.push(wk);
  }
  assertEquals(measured, [9, 10, 11]);
});

Deno.test('worked example — squat 225, week 1 and the week 11 gate', () => {
  const base = workingNumberFrom1RM(225); // 190
  // Week 1 = cycle 1 (leader), week 1 of that cycle.
  const wk1 = cycleForWeek(12, 1)!;
  const wn1 = workingNumberForCycle(base, wk1.slot.index, true);
  assertEquals(
    setsForWeek(wk1.slot.kind, wk1.weekInCycle).map((s) => weightForSet(wn1, s.pct)),
    [120, 140, 160],
  );

  // Week 11 = cycle 3 (anchor), week 3 → the 95% open set, at TWO increments up.
  const wk11 = cycleForWeek(12, 11)!;
  assertEquals([wk11.slot.kind, wk11.weekInCycle], ['anchor', 3]);
  const wn3 = workingNumberForCycle(base, wk11.slot.index, true); // 210
  assertEquals(wn3, 210);
  const top = setsForWeek('anchor', 3)[2];
  assertEquals(weightForSet(wn3, top.pct), 195); // 199.5 → 195
  assertEquals(top.amrap, true);
});

Deno.test('the 95% verdict: the prescribed rep advances, a logged zero resets, no data holds', () => {
  // ⛔ THRESHOLD CORRECTED 2026-07-28 (Q-220). The book prescribes 95% x 1+ (p23), so any
  // completed rep is the prescription MET. A logged ZERO is the miss. These fixtures used to
  // encode a five-rep rule that is not in the 2nd edition.
  assertEquals(verdictFrom95Set(8), 'advance');
  assertEquals(verdictFrom95Set(5), 'advance');
  assertEquals(verdictFrom95Set(4), 'advance', 'four reps is four times the prescribed minimum');
  assertEquals(verdictFrom95Set(1), 'advance', 'one rep AT 95% IS the prescription (p23)');
  assertEquals(verdictFrom95Set(0), 'reset', 'logged, and the prescribed single was not completed');
  assertEquals(verdictFrom95Set(null), 'hold');       // skipped — no evidence to advance on
  assertEquals(verdictFrom95Set(undefined), 'hold');
});

Deno.test('applying the verdict: advance steps, reset drops 10%, hold does nothing', () => {
  // ⚠️ Returns `{ workingNumber, ceilingHit }` now — the ceiling has to travel with the number so a
  // hold at the ceiling can be REPORTED rather than looking like an arbitrary stall.
  assertEquals(applyVerdict(210, 'advance', true).workingNumber, 220);
  assertEquals(applyVerdict(150, 'advance', false).workingNumber, 155);
  assertEquals(applyVerdict(210, 'reset', true).workingNumber, 185);   // 189 → 185, rounded down
  assertEquals(applyVerdict(210, 'hold', true).workingNumber, 210);
});

Deno.test('⛔ THE INCREMENT IS CAPPED AT 4% — Wendler\'s +10 is out of range on a small bar', () => {
  // +10 on a 90 lb training max is 11.1% per cycle. It is not that Wendler is wrong; the absolute
  // number is calibrated to a squat where 10 lb is ~3%, and below that it stops being proportionate.
  assertEquals(cappedCycleIncrementLb(90, true), 5);     // 6% of 90 = 5.4 → one plate step
  // ⛔ THE NO-OP BAND IS THE POINT. 6% is the largest relative step Wendler's own absolute numbers
  // produce inside his range (+10 at TM 170 = 5.9%), so every load he wrote for is untouched.
  assertEquals(cappedCycleIncrementLb(170, true), 10);   // his lightest realistic case
  assertEquals(cappedCycleIncrementLb(265, true), 10);
  assertEquals(cappedCycleIncrementLb(340, true), 10);
  assertEquals(cappedCycleIncrementLb(120, false), 5);   // upper is already +5
});

Deno.test('⛔ THE TRAINING MAX MAY NEVER EXCEED 90% OF THE 1RM — and the step TRUNCATES', () => {
  // ⛔ SUPERSEDES the 100%-and-HOLD version of this test (2026-07-27), which asserted
  // `tmCeilingLb(106) === 105` and a hold at the ceiling. Both are now wrong on purpose.
  //
  // The 100% ceiling was chosen because 90% "bound in cycle 3 for every athlete" — a 315 squat HELD
  // at 275 instead of reaching 285. That objection was right about HOLDING and wrong about the
  // ceiling, and truncation dissolves it (see the standard-block case at the bottom).
  //
  // ⚠️ 95, not 95.4: the ceiling is the largest LOADABLE weight at or under the bound, so it rounds
  // down to the plate grid like every other prescribed number here.
  assertEquals(tmCeilingLb(106), 95);

  // ⛔ A BREACHING STEP LANDS ON THE CEILING. 90 + 10 = 100 would cross 95, so it becomes 95 — the
  // athlete still advances, by less. This is the whole change: the old code returned 90 here.
  const truncated = applyVerdict(90, 'advance', true, 106);
  assertEquals(truncated.workingNumber, 95, 'the step must truncate to the ceiling, not be skipped');
  assertEquals(truncated.ceilingHit, false, 'a truncated advance is still an advance, not a fate');

  // ⚠️ ONLY NO-MOVEMENT IS A REPORTABLE FATE. Already at the ceiling, there is nothing to truncate to.
  const stuck = applyVerdict(95, 'advance', true, 106);
  assertEquals(stuck.workingNumber, 95, 'the number holds');
  assertEquals(stuck.ceilingHit, true, 'and that must be reportable, not silent');

  // ⛔ AND THE OBJECTION THAT KILLED 90% A DAY EARLIER, ANSWERED. A 315 squat's third cycle wanted
  // 285 against a 280 ceiling. Under hold-at-the-ceiling it froze at 275 — the block stopped
  // advancing in its measuring cycle, which is why 90% was rejected. It now reaches 280.
  const standard = applyVerdict(275, 'advance', true, 315);
  assertEquals(standard.workingNumber, 280, 'the standard block still advances into cycle 3');
  assertEquals(standard.ceilingHit, false);

  // A step clear of the ceiling is untouched by any of this. ⚠️ +5, not +10: at a training max of 85
  // the 6% relative cap binds (85 × 0.06 = 5.1 → 5), which is the cap doing its own job independently
  // of the ceiling. 90 is well clear of this athlete's 180.
  assertEquals(applyVerdict(85, 'advance', true, 200).workingNumber, 90);
});

Deno.test('a fewer-bonus-reps week is NOT a reset — only missing the prescribed reps is', () => {
  // The anchor's week-3 set prescribes ONE rep; the "+" is bonus. Getting 5 is a pass.
  // This is the trust case: an endurance athlete who ran hard yesterday can hit the
  // prescribed reps and get no bonus, and must not have their weights reset for it.
  assertEquals(verdictFrom95Set(5), 'advance');
  assertEquals(verdictFrom95Set(6), 'advance'); // fewer than last time, still a pass
});

// ── The earnable advance (D-326 layer 2) ─────────────────────────────────────
//
// `workingNumberForCycle` stepped by CALENDAR and read nothing: miss every rep and the bar still
// climbed, then the AMRAP measured that bar and wrote it back as the athlete's 1RM. Wendler's own
// gate — five at 95% or drop 10% — was written, correct, and called by nothing.

Deno.test('⛔ NO VERDICTS NOW MEANS HOLD — a missing signal is not evidence of progress', () => {
  // ⛔ THIS TEST ASSERTED THE OPPOSITE and was the behaviour-unchanged proof for the seam. It was
  // right at the time: the seam had to ship inert. But `cycleVerdicts` then went months with ZERO
  // SUPPLIERS, so "absent = advance" meant a complete, tested, correct advancement mechanism
  // advanced unconditionally while appearing to have earned it. The failure looked like normal
  // operation — silent subtraction's cousin.
  for (const isLower of [true, false]) {
    for (let cycle = 2; cycle <= 4; cycle += 1) {
      assertEquals(
        workingNumberForCycles(200, cycle, isLower).workingNumber, 200,
        `cycle ${cycle} ${isLower ? 'lower' : 'upper'} advanced with no evidence`,
      );
    }
  }
});

Deno.test('the FORECAST is the one caller allowed to advance without evidence, and it must say so', () => {
  // A fresh block projects three cycles into weeks that have not happened. No verdict CAN exist, and
  // holding would show identical weights in cycles 1, 2 and 3. The caller declares it explicitly.
  // ⚠️ Compared against a CAPPED expectation, not `workingNumberForCycle`. That function is the
  // uncapped calendar stepper and now has no production callers — the forecast advances, but it
  // advances by the capped step like everything else.
  for (const isLower of [true, false]) {
    for (let cycle = 1; cycle <= 4; cycle += 1) {
      const expected = 200 + Math.max(0, cycle - 1) * cappedCycleIncrementLb(200, isLower);
      assertEquals(
        workingNumberForCycles(200, cycle, isLower, undefined, { unknownMeans: 'advance' }).workingNumber,
        expected,
        `cycle ${cycle} ${isLower ? 'lower' : 'upper'}`,
      );
    }
  }
});

Deno.test('a missed 95% set costs the next cycle 10% instead of gaining +10', () => {
  // Squat, working number 200. Cycle 1 earns a reset — the athlete logged the set and could not
  // complete the prescribed single. ⛔ Was `verdictFrom95Set(4)`, which the book calls a pass.
  const earned = verdictFrom95Set(0);
  assertEquals(earned, 'reset');
  // Calendar-only would hand cycle 2 a 210. The gate hands it 180.
  assertEquals(workingNumberForCycle(200, 2, true), 210);   // the uncapped legacy stepper
  assertEquals(workingNumberForCycles(200, 2, true, [earned]).workingNumber, 180);
});

Deno.test('a skipped session HOLDS — no evidence is not the same as failure', () => {
  assertEquals(verdictFrom95Set(null), 'hold');
  assertEquals(workingNumberForCycles(200, 2, true, ['hold']).workingNumber, 200);
  // And it does not compound: cycle 3 advances off the held number once a set is done.
  assertEquals(workingNumberForCycles(200, 3, true, ['hold', 'advance']).workingNumber, 210);
});

Deno.test('verdicts apply in order, and only the cycles before this one count', () => {
  // advance then reset: 200 → 210 → 185 (10% of 210 = 21, rounded down to the 5lb grid).
  assertEquals(workingNumberForCycles(200, 3, true, ['advance', 'reset']).workingNumber, 185);
  // Cycle 1 never reads a verdict — nothing has been earned yet.
  assertEquals(workingNumberForCycles(200, 1, true, ['reset']).workingNumber, 200);
});

// ── `advance_untrusted` — the bar climbs, the estimate is marked ─────────────────────────────────
//
// ⛔ THE MISTAKE THIS PINS AGAINST. A first draft of this rule was going to FLAG a big set instead of
// advancing it. Michael: "A 12-rep set at 95% means the athlete is genuinely much stronger than the
// TM says. Withholding the advance punishes them for it." Two questions, opposite answers, and only
// the measurement one is in doubt:
//   physiologically  big set → stronger than the TM → advance, which is Wendler's own read
//   measurement-wise big set → the e1RM off it is above the range where Brzycki holds → don't trust
//                              THIS number (LeSuer 1997 2-10 reps; Reynolds 2006 best at 5RM;
//                              Mayhew 2008 under 10)
//
// ⚠️ 8 reps is OURS — the literature gives a degradation zone, not a line.

Deno.test('⛔ A BIG 95% SET STILL ADVANCES THE BAR — the distrust is about the estimate', () => {
  const wn = 200;
  const plain = applyVerdict(wn, 'advance', true, 400);
  const untrusted = applyVerdict(wn, 'advance_untrusted', true, 400);
  assertEquals(untrusted.workingNumber, plain.workingNumber,
    'advance_untrusted moved the bar differently from advance');
  assertEquals(untrusted.workingNumber > wn, true, 'the bar did not climb at all');
});

Deno.test('the verdict bands: 0 resets, 1-8 advances, above 8 advances untrusted', () => {
  assertEquals(verdictFrom95Set(null), 'hold');
  assertEquals(verdictFrom95Set(0), 'reset');
  assertEquals(verdictFrom95Set(1), 'advance');
  assertEquals(verdictFrom95Set(ESTIMATE_TRUSTED_MAX_REPS), 'advance');
  assertEquals(verdictFrom95Set(ESTIMATE_TRUSTED_MAX_REPS + 1), 'advance_untrusted');
  assertEquals(verdictFrom95Set(20), 'advance_untrusted');
});

Deno.test('⛔ THE CEILING STILL BINDS ON AN UNTRUSTED ADVANCE', () => {
  // A set outside the reliable range must not become a route around the 1RM ceiling — the estimate is
  // exactly what is least trustworthy there, so the bound matters more, not less.
  const atCeiling = tmCeilingLb(300);
  const r = applyVerdict(atCeiling, 'advance_untrusted', true, 300);
  assertEquals(r.workingNumber <= atCeiling, true,
    `an untrusted advance passed the ceiling: ${r.workingNumber} > ${atCeiling}`);
});

Deno.test('⛔ DEADLIFT GETS A TIGHTER TRUST CEILING — the error there is biased, not random', () => {
  // LeSuer 1997: every equation tested significantly UNDERESTIMATED deadlift. Brzycki already biases
  // low, so the two compound. 6 reps is trusted on a bench and not on a deadlift.
  assertEquals(verdictFrom95Set(6, 'Bench Press'), 'advance');
  assertEquals(verdictFrom95Set(6, 'Deadlift'), 'advance_untrusted');
  assertEquals(verdictFrom95Set(5, 'Deadlift'), 'advance');
  // Name variants must all match, or a renamed lift silently gets the loose ceiling.
  assertEquals(verdictFrom95Set(6, 'Trap Bar Deadlift'), 'advance_untrusted');
  assertEquals(verdictFrom95Set(6, 'conventional deadlift'), 'advance_untrusted');
  // ⚠️ An unknown lift gets the GENERAL ceiling, never a looser one.
  assertEquals(verdictFrom95Set(6, 'Some New Lift'), 'advance');
  assertEquals(verdictFrom95Set(9, 'Some New Lift'), 'advance_untrusted');
  // Omitting the name is still legal and unchanged.
  assertEquals(verdictFrom95Set(6), 'advance');
});
