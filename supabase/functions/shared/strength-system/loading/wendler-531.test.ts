import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  setsForWeek,
  workingNumberFrom1RM,
  workingNumberForCycle,
  weightForSet,
  roundDownToIncrement,
  cyclesForBlock,
  cycleForWeek,
  blockWeeks,
  blockWeekFor,
  buildWeekMap,
  deloadSingleSets,
  tmTestSets,
  WEEKS_PER_CYCLE,
  TM_TEST_PASS_REPS,
  verdictFrom95Set,
  cycleIncrementLb,
  workingNumberForCycles,
  applyVerdict,
  VALIDITY_CHECK_PCT,
  ESTIMATE_TRUSTED_MAX_REPS,
  STALL_CONFIRM_SESSIONS,
} from './wendler-531.ts';

// =============================================================================
// Every number pinned here is Wendler's. If one changes, either the source changed
// or somebody invented one — and inventing them is what this whole rewrite replaced.
// =============================================================================

Deno.test('leader: every set is five reps, and there is NO all-out set', () => {
  // ⛔ 1-3, NOT 1-4 (2026-08-15, §1c). A Forever cycle is three weeks; the light week is standalone.
  for (const wk of [1, 2, 3]) {
    const sets = setsForWeek('leader', wk);
    assertEquals(sets.map((s) => s.reps), [5, 5, 5], `leader week ${wk} reps`);
    assertEquals(sets.some((s) => s.amrap), false, `leader week ${wk} must have no AMRAP`);
  }
});

Deno.test('leader: the percentages are the standard ones — only the reps differ', () => {
  assertEquals(setsForWeek('leader', 1).map((s) => s.pct), [0.65, 0.75, 0.85]);
  assertEquals(setsForWeek('leader', 2).map((s) => s.pct), [0.70, 0.80, 0.90]);
  assertEquals(setsForWeek('leader', 3).map((s) => s.pct), [0.75, 0.85, 0.95]);
  // ⛔ THERE IS NO WEEK 4. The old `4: [0.40, 0.50, 0.60]` deload row left the table — that shape is
  // now `deloadSingleSets()`, a STANDALONE week, and asking for a fourth week in a cycle is an error
  // rather than a silent fallback.
  let threw = false;
  try { setsForWeek('leader', 4); } catch { threw = true; }
  assertEquals(threw, true, 'weekInCycle 4 must be rejected, not answered');
});

Deno.test('anchor: 5/3/1 proper, and only the LAST set of each week is open', () => {
  assertEquals(setsForWeek('anchor', 1).map((s) => s.reps), [5, 5, 5]);
  assertEquals(setsForWeek('anchor', 2).map((s) => s.reps), [3, 3, 3]);
  assertEquals(setsForWeek('anchor', 3).map((s) => s.reps), [5, 3, 1]);

  for (const wk of [1, 2, 3]) {
    assertEquals(setsForWeek('anchor', wk).map((s) => s.amrap), [false, false, true], `anchor wk ${wk}`);
  }
});

// ── THE TWO STANDALONE WEEKS (Forever pp.20-23) ─────────────────────────────────────────────────

Deno.test('⛔ THE TM-TEST WEEK: 70/80/90 × 5, then the training max, open', () => {
  const sets = tmTestSets();
  assertEquals(sets.map((s) => s.pct), [0.70, 0.80, 0.90, 1.00]);
  // ⛔ THE PRESCRIBED MINIMUM IS THE PASS BAR, NOT THE BOOK'S LOWER BOUND. His range is 3-5; writing
  // 3 on the card and grading 3 as a HOLD is the stop-short trap the anchor's AMRAP note names.
  assertEquals(sets.map((s) => s.reps), [5, 5, 5, TM_TEST_PASS_REPS]);
  assertEquals(sets.map((s) => s.amrap), [false, false, false, true]);
  assertEquals(TM_TEST_PASS_REPS, 5, '85% training max ⇒ his 5-rep bar, not his 3-rep one (p.20-21)');
});

Deno.test('⛔ THE 7TH-WEEK DELOAD: 70×5 · 80×3 · 90×1 · TM×1, and NOTHING is open', () => {
  const sets = deloadSingleSets();
  assertEquals(sets.map((s) => s.pct), [0.70, 0.80, 0.90, 1.00]);
  assertEquals(sets.map((s) => s.reps), [5, 3, 1, 1]);
  assertEquals(sets.some((s) => s.amrap), false, 'a deload single is a prescribed single, not a rep-out');
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

// ── THE BLOCK MAP (work order §0's target, pinned week by week) ─────────────────────────────────

/** A compact rendering of a week map: one token per week. */
const mapOf = (weeks: number, inputs?: any) => buildWeekMap(weeks, inputs).map((w) =>
  w.kind === 'cycle' ? `${w.cycleKind![0].toUpperCase()}${w.weekInCycle}` : (w.kind === 'tm_test' ? 'TEST' : 'DL'));

Deno.test('⛔ THE 12-WEEK MAP IS §0 EXACTLY — test · L · L · deload · A · test', () => {
  assertEquals(mapOf(12), [
    'TEST',
    'L1', 'L2', 'L3',
    'L1', 'L2', 'L3',
    'DL',
    'A1', 'A2', 'A3',
    'TEST',
  ]);
  assertEquals(blockWeeks(12), 12);
});

Deno.test('⛔ THE 16-WEEK MAP IS 2 LEADERS AND 2 ANCHORS — his p.17 second model', () => {
  // ⛔ CHANGED 2026-08-15. It used to be `['leader','leader','leader','anchor']` — 3:1, which is NOT
  // one of the three models Forever p.17 publishes (3:2, 2:2, 2:1). The spare week the layout frees
  // becomes the second deload, after the first anchor (p.21's "after any cycle" licence).
  assertEquals(mapOf(16), [
    'TEST',
    'L1', 'L2', 'L3',
    'L1', 'L2', 'L3',
    'DL',
    'A1', 'A2', 'A3',
    'DL',
    'A1', 'A2', 'A3',
    'TEST',
  ]);
  assertEquals(blockWeeks(16), 16);
});

Deno.test('⛔ THE 8-WEEK BLOCK DROPS THE OPENING TEST WEEK — it is the only piece that yields', () => {
  // test + L + deload + A + test costs 9. The entry gate's 1RM stands in for the opening test, which
  // the plan copy states rather than leaving implied.
  assertEquals(mapOf(8), ['L1', 'L2', 'L3', 'DL', 'A1', 'A2', 'A3', 'TEST']);
  assertEquals(blockWeeks(8), 8);
});

Deno.test('cyclesForBlock is a VIEW over the map — three-week ranges, no deload inside', () => {
  const c = cyclesForBlock(12);
  assertEquals(c.map((x) => x.kind), ['leader', 'leader', 'anchor']);
  assertEquals(c.map((x) => [x.startWeek, x.endWeek]), [[2, 4], [5, 7], [9, 11]]);
  assertEquals(WEEKS_PER_CYCLE, 3);
  // ⛔ A STANDALONE WEEK BELONGS TO NO CYCLE, and `cycleForWeek` says so with a null.
  for (const wk of [1, 8, 12]) assertEquals(cycleForWeek(12, wk), null, `week ${wk} is standalone`);
  assertEquals(blockWeekFor(12, 1)!.kind, 'tm_test');
  assertEquals(blockWeekFor(12, 8)!.kind, 'deload_single');
  assertEquals(blockWeekFor(12, 12)!.kind, 'tm_test');
});

Deno.test('⛔ A STANDALONE WEEK RUNS ON THE CYCLE BEFORE IT — and the opening test on cycle 1', () => {
  const m = buildWeekMap(12);
  assertEquals(m[0].workingNumberCycle, 1, 'the opening test validates the number cycle 1 will use');
  assertEquals(m[7].workingNumberCycle, 2, 'the mid-block deload unloads the number just used');
  assertEquals(m[11].workingNumberCycle, 3, 'the closing test measures the number the block reached');
});

Deno.test('blockWeeks snaps DOWN to a length the layout fills exactly', () => {
  // ⚠️ NO LONGER MULTIPLES OF FOUR. A cycle costs three and the standalone weeks are the odd ones.
  assertEquals(blockWeeks(12), 12);
  assertEquals(blockWeeks(16), 16);
  assertEquals(blockWeeks(10), 9);
  assertEquals(blockWeeks(13), 12);
  assertEquals(blockWeeks(3), 4);   // the floor: one anchor cycle plus its test week
});

Deno.test('the measurement weeks of a 12-week block are the anchor, plus the two test weeks', () => {
  const measured: number[] = [];
  for (const w of buildWeekMap(12)) {
    const sets = w.kind === 'cycle'
      ? setsForWeek(w.cycleKind!, w.weekInCycle!)
      : (w.kind === 'tm_test' ? tmTestSets() : deloadSingleSets());
    if (sets.some((s) => s.amrap)) measured.push(w.week);
  }
  // ⛔ WEEK 1 AND WEEK 12 ARE NEW MEASUREMENTS (§1c/§1d): the rested TM-test weeks. Weeks 9-11 are
  // the anchor's open sets, unchanged. Weeks 2-8 carry no open set — the leaders and the deload.
  assertEquals(measured, [1, 9, 10, 11, 12]);
});

Deno.test('worked example — squat 225, week 2 and the week 11 gate', () => {
  const base = workingNumberFrom1RM(225); // 190
  // ⚠️ WEEK 2, NOT WEEK 1 — week 1 is the TM-test week now. Week 2 is cycle 1's opening leader week
  // and its three weights are unchanged from before the restructure.
  const wk2 = cycleForWeek(12, 2)!;
  const wn1 = workingNumberForCycle(base, wk2.slot.index, true);
  assertEquals(
    setsForWeek(wk2.slot.kind, wk2.weekInCycle).map((s) => weightForSet(wn1, s.pct)),
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

Deno.test('the 95% verdict: the prescribed rep ADVANCES, a logged zero is a miss, no data holds', () => {
  // ⛔ THRESHOLD CORRECTED 2026-07-28 (Q-220). The book prescribes 95% x 1+ (p23), so a completed
  // rep is the prescription MET. These fixtures once encoded a five-rep rule not in the 2nd edition.
  //
  // ⛔ ONE ROW MOVED 2026-08-12 (slice a): `0` was `reset`, is now `miss`. One bad day never resets
  // (p33). The 10% drop is p31's STALL, and a stall is a pattern; the walker confirms it.
  //
  // ⛔ AND A SECOND CHANGE WAS MADE THE SAME DAY AND REVERSED THE SAME DAY. `1` was briefly
  // `hold_at_target` — "the number rises only while the athlete BEATS the target", reasoned from
  // field precedent (Juggernaut, StrongLifts) rather than from Wendler. Rejected, Michael's call:
  // do what the book says. p24 — *"Doing the prescribed reps shows you and your body that you're
  // strong enough for the workout. The extra reps are your way of dominating the workout."* The
  // minimum is a pass. p30 makes advancement the default until the prescription can no longer be hit.
  assertEquals(verdictFrom95Set(8), 'advance');
  assertEquals(verdictFrom95Set(5), 'advance');
  assertEquals(verdictFrom95Set(4), 'advance', 'four reps is four times the prescribed minimum');
  assertEquals(verdictFrom95Set(2), 'advance');
  assertEquals(verdictFrom95Set(1), 'advance', 'one rep AT 95% IS the prescription (p23, p24)');
  assertEquals(verdictFrom95Set(0), 'miss', 'logged, and the prescribed single was not completed');
  assertEquals(verdictFrom95Set(null), 'hold');       // skipped — no evidence to advance on
  assertEquals(verdictFrom95Set(undefined), 'hold');
});

Deno.test('applying one verdict: advance steps, reset drops 10%, everything else stands still', () => {
  // ⚠️ Returns a BARE NUMBER as of 2026-08-12. It returned `{ workingNumber, ceilingHit }` while the
  // 90% ceiling had to travel with the number; that ceiling is deleted.
  assertEquals(applyVerdict(210, 'advance', true), 220);
  assertEquals(applyVerdict(150, 'advance', false), 155);
  assertEquals(applyVerdict(210, 'reset', true), 185);   // 189 → 185, rounded down
  assertEquals(applyVerdict(210, 'hold', true), 210);
  // ⛔ `hold` AND `miss` ARE IDENTICAL FOR ONE CYCLE AND DIVERGE ACROSS CYCLES. A single `miss` must
  // NEVER drop the bar here — a stall is a pattern and this function sees one cycle.
  assertEquals(applyVerdict(210, 'miss', true), 210, 'one miss holds; only the walker can reset');
});

Deno.test('⛔ THE STEP IS WENDLER\'S FIXED +5 / +10 FOR EVERY ATHLETE — no percentage shrink', () => {
  // ⛔ SUPERSEDES the 6%-cap test of 2026-07-27 (`cappedCycleIncrementLb`, deleted 2026-08-12). That
  // cap shrank a light lifter's step to 5 lb on a 90 lb training max. Wendler does the opposite:
  // p90 — *"I tell everyone to just do the program as is, regardless of training age"*; p107 — used
  // with *"both beginning and advanced lifters"*, same steady progression.
  assertEquals(cycleIncrementLb(true), 10);
  assertEquals(cycleIncrementLb(false), 5);
  // The light bar the cap used to bind on. +10, like everyone else.
  assertEquals(applyVerdict(90, 'advance', true), 100);
  assertEquals(applyVerdict(85, 'advance', false), 90);
  // And the heavy bar is unchanged from before the cap was removed — it never bound there.
  assertEquals(applyVerdict(340, 'advance', true), 350);
});

Deno.test('⛔ THERE IS NO 1RM CEILING — the training max may pass 90% of the max on file', () => {
  // ⛔ SUPERSEDES 'THE TRAINING MAX MAY NEVER EXCEED 90% OF THE 1RM' (2026-07-28) and the
  // 100%-and-hold version before it (2026-07-27). Both are deleted, not adjusted.
  //
  // Wendler has no ceiling: p30 — *"You keep on increasing the max you're working from every four
  // weeks UNTIL YOU CAN NO LONGER HIT THE PRESCRIBED SETS AND REPS."* The brake is a miss.
  //
  // ⛔ THIS IS THE ARITHMETIC OF THE FREEZE, INVERTED. A 106 lb max used to cap the training number
  // at 95, so an athlete already at 90 got +5 instead of +10 and then nothing at all.
  assertEquals(applyVerdict(90, 'advance', true), 100, 'the old ceiling truncated this to 95');
  assertEquals(applyVerdict(95, 'advance', true), 105, 'and froze this one completely');

  // A 315 squat's third cycle wanted 285 against a 280 ceiling and was truncated onto it.
  // ⚠️ SO "THE CEILING NEVER BOUND FOR A HEAVY LIFTER" IS FALSE — it bound at cycle 3 for a 315 lb
  // squat, which is Wendler's own book weight. This is the one number in a standard block that the
  // removal changes: 280 → 285.
  assertEquals(applyVerdict(275, 'advance', true), 285);
});

Deno.test('a fewer-bonus-reps week is NOT a miss — only failing the prescribed reps is', () => {
  // The anchor's week-3 set prescribes ONE rep; the "+" is bonus. Getting 5 is a pass.
  // This is the trust case: an endurance athlete who ran hard yesterday can hit the
  // prescribed reps and get no bonus, and must not have their weights reset for it.
  assertEquals(verdictFrom95Set(5), 'advance');
  assertEquals(verdictFrom95Set(6), 'advance'); // fewer than last time, still a pass
});

// ── The hold-then-drop brake (slice a, 2026-08-12) ───────────────────────────
//
// ⛔ THE RULE, AND THE MENTAL MODEL IT EXISTS TO KILL. "Grind upward for two months" is WRONG: a
// shortfall never keeps adding weight into a wall. It HOLDS — the same weight, again, no penalty —
// and only a SECOND consecutive shortfall at that held weight drops it 10%.
//   p33: a less than stellar day means *"getting your prescribed weights and leaving."*
//   p31: the stall is *"a point where you can't make any more progress"* — a pattern, then −10%.

Deno.test('⛔ ONE MISSED 95% SET HOLDS THE WEIGHT — it never resets (p33)', () => {
  assertEquals(workingNumberForCycles(200, 2, true, ['miss']).workingNumber, 200);
  // Not a fluke of cycle 2: a lone miss anywhere in the walk costs nothing.
  assertEquals(
    workingNumberForCycles(200, 4, true, ['advance', 'miss', 'advance']).workingNumber,
    220,
    '200 → 210 → held → 220',
  );
});

Deno.test('⛔ TWO CONSECUTIVE MISSES DROP IT 10% — and the count is behind a named constant', () => {
  assertEquals(STALL_CONFIRM_SESSIONS, 2, 'a product decision; changing it changes the programme');
  const misses = Array.from({ length: STALL_CONFIRM_SESSIONS }, () => 'miss' as const);
  // 200 held through the first miss, then −10% on the confirmed second: 180.
  assertEquals(workingNumberForCycles(200, 1 + misses.length, true, misses).workingNumber, 180);
  // ⚠️ ONE FEWER MISS THAN THE CONSTANT MUST STILL COST NOTHING, or the constant is decorative.
  assertEquals(
    workingNumberForCycles(200, misses.length, true, misses.slice(0, -1)).workingNumber,
    200,
  );
});

Deno.test('⛔ MAKING THE WEIGHT CLEARS THE RUN — misses must be CONSECUTIVE', () => {
  // miss, then the athlete makes the prescription, then miss again. Two misses, never in a row, so
  // no reset — and the middle cycle's advance still lands, because meeting the prescription IS the
  // advance (p24: the minimum is a pass).
  assertEquals(
    workingNumberForCycles(200, 4, true, ['miss', 'advance', 'miss']).workingNumber,
    210,
    'no reset: the middle cycle met the prescription',
  );
  // An untrusted advance clears it just as well — the distrust is about the estimate, not the set.
  assertEquals(
    workingNumberForCycles(200, 4, true, ['miss', 'advance_untrusted', 'miss']).workingNumber,
    210,
  );
});

Deno.test('⛔ A SKIPPED CYCLE NEITHER COUNTS AS A MISS NOR LAUNDERS ONE AWAY', () => {
  // ⚠️ THE SUBTLE HALF. `hold` is NO EVIDENCE — it cannot confirm a stall, and it must not clear one
  // either, or an athlete could reset the brake by skipping a cycle. The two misses are still
  // consecutive MEASURED points.
  assertEquals(
    workingNumberForCycles(200, 4, true, ['miss', 'hold', 'miss']).workingNumber,
    180,
    'the skipped cycle is not evidence, so the two misses still confirm the stall',
  );
  // And a run of pure skips does nothing at all.
  assertEquals(workingNumberForCycles(200, 4, true, ['hold', 'hold', 'hold']).workingNumber, 200);
});

Deno.test('after a drop the athlete REBUILDS — the next miss is a first miss, not a third', () => {
  // miss, miss (→180), miss, miss (→160). Two separate confirmed stalls, not one continuous slide.
  assertEquals(
    workingNumberForCycles(200, 5, true, ['miss', 'miss', 'miss', 'miss']).workingNumber,
    160,
  );
  // The third verdict alone must not have dropped it again the moment it arrived.
  assertEquals(
    workingNumberForCycles(200, 4, true, ['miss', 'miss', 'miss']).workingNumber,
    180,
  );
});

Deno.test('the walker reports WHICH cycle the stall dropped — the seam slice b reads', () => {
  // ⚠️ `resetAtCycle` replaces `ceilingHitAtCycle` in the same position. Nothing consumes it today;
  // it is the calibration event that used to be reported as "pinned at the ceiling".
  assertEquals(workingNumberForCycles(200, 4, true, ['miss', 'miss']).resetAtCycle, 3);
  assertEquals(workingNumberForCycles(200, 4, true, ['miss', 'advance']).resetAtCycle, null);
  // An explicitly passed reset is the same event and is reported the same way.
  assertEquals(workingNumberForCycles(200, 3, true, ['advance', 'reset']).resetAtCycle, 3);
});

Deno.test('⛔ THE BARE MINIMUM IS A PASS AND IT CLIMBS — no "beat the target" gate', () => {
  // ⛔ THIS TEST IS THE INVERSE OF THE ONE IT REPLACES, WHICH LIVED FOR PART OF ONE DAY. A
  // `hold_at_target` verdict held the number when the athlete hit the prescribed single without
  // beating it. Rejected on the book (Michael): p23 prescribes `95% x 1 or more`; p24 — *"Doing the
  // prescribed reps shows you and your body that you're strong enough for the workout. The extra
  // reps are your way of dominating the workout."* Bonus reps are dominance, not the price of entry.
  assertEquals(verdictFrom95Set(1), 'advance');
  // Two bare-minimum cycles in a row still walk the bar up by Wendler's fixed step, twice.
  assertEquals(workingNumberForCycles(200, 3, true, ['advance', 'advance']).workingNumber, 220);
  // ⚠️ AND THE ONLY THING THAT STOPS THE CLIMB IS A REAL MISS. That is p30's *"until you can no
  // longer hit the prescribed sets and reps"* — the brake is failure, never a bare pass.
  assertEquals(workingNumberForCycles(200, 3, true, ['miss', 'miss']).workingNumber, 180);
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
  // ⚠️ THE EXPECTATION IS NOW THE PLAIN CALENDAR STEPPER AGAIN (2026-08-12). It was computed off
  // `cappedCycleIncrementLb` while the percentage shrink existed; with the shrink deleted, a
  // forecast advances by Wendler's fixed increment, which is exactly `workingNumberForCycle`.
  for (const isLower of [true, false]) {
    for (let cycle = 1; cycle <= 4; cycle += 1) {
      const expected = 200 + Math.max(0, cycle - 1) * cycleIncrementLb(isLower);
      assertEquals(
        workingNumberForCycles(200, cycle, isLower, undefined, { unknownMeans: 'advance' }).workingNumber,
        expected,
        `cycle ${cycle} ${isLower ? 'lower' : 'upper'}`,
      );
    }
  }
});

Deno.test('a missed 95% set costs the next cycle its +10 — and the SECOND one costs 10%', () => {
  // Squat, working number 200. Cycle 1 earns a miss — the athlete logged the set and could not
  // complete the prescribed single.
  // ⛔ REWRITTEN 2026-08-12. It asserted a reset on the FIRST miss; that is now the second. What did
  // not change is that the calendar no longer hands out a free +10 (D-326 layer 2).
  const earned = verdictFrom95Set(0);
  assertEquals(earned, 'miss');
  assertEquals(workingNumberForCycle(200, 2, true), 210);   // the blind calendar stepper
  assertEquals(workingNumberForCycles(200, 2, true, [earned]).workingNumber, 200, 'held, not dropped');
  assertEquals(workingNumberForCycles(200, 3, true, [earned, earned]).workingNumber, 180);
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
  const plain = applyVerdict(wn, 'advance', true);
  const untrusted = applyVerdict(wn, 'advance_untrusted', true);
  assertEquals(untrusted, plain, 'advance_untrusted moved the bar differently from advance');
  assertEquals(untrusted > wn, true, 'the bar did not climb at all');
});

Deno.test('the verdict bands: 0 misses, 1-8 advances, above 8 advances untrusted', () => {
  assertEquals(verdictFrom95Set(null), 'hold');
  assertEquals(verdictFrom95Set(0), 'miss');
  assertEquals(verdictFrom95Set(1), 'advance');
  assertEquals(verdictFrom95Set(2), 'advance');
  assertEquals(verdictFrom95Set(ESTIMATE_TRUSTED_MAX_REPS), 'advance');
  assertEquals(verdictFrom95Set(ESTIMATE_TRUSTED_MAX_REPS + 1), 'advance_untrusted');
  assertEquals(verdictFrom95Set(20), 'advance_untrusted');
});

Deno.test('⛔ AN UNTRUSTED ADVANCE IS STILL BRAKED BY THE MISS RULE, NOT BY A CEILING', () => {
  // ⛔ SUPERSEDES 'THE CEILING STILL BINDS ON AN UNTRUSTED ADVANCE' (2026-07-28). There is no bound
  // to route around now, so the property worth pinning is the one that replaced it: a big set
  // climbs, and the climb stops the moment the athlete stops meeting the prescription.
  assertEquals(applyVerdict(270, 'advance_untrusted', true), 280, 'a big set climbs');
  assertEquals(
    workingNumberForCycles(270, 4, true, ['advance_untrusted', 'miss', 'miss']).workingNumber,
    250,
    '270 → 280 → held → −10%',
  );
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
