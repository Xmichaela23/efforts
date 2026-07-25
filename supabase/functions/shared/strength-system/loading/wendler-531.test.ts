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
  applyVerdict,
  VALIDITY_CHECK_PCT,
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

Deno.test('the 95% verdict: 5+ advances, fewer resets, no data holds', () => {
  assertEquals(verdictFrom95Set(8), 'advance');
  assertEquals(verdictFrom95Set(5), 'advance');
  assertEquals(verdictFrom95Set(4), 'reset');
  assertEquals(verdictFrom95Set(0), 'reset');
  assertEquals(verdictFrom95Set(null), 'hold');       // skipped — no evidence to advance on
  assertEquals(verdictFrom95Set(undefined), 'hold');
});

Deno.test('applying the verdict: advance steps, reset drops 10%, hold does nothing', () => {
  assertEquals(applyVerdict(210, 'advance', true), 220);
  assertEquals(applyVerdict(150, 'advance', false), 155);
  assertEquals(applyVerdict(210, 'reset', true), 185);   // 189 → 185, rounded down
  assertEquals(applyVerdict(210, 'hold', true), 210);
});

Deno.test('a fewer-bonus-reps week is NOT a reset — only missing the prescribed reps is', () => {
  // The anchor's week-3 set prescribes ONE rep; the "+" is bonus. Getting 5 is a pass.
  // This is the trust case: an endurance athlete who ran hard yesterday can hit the
  // prescribed reps and get no bonus, and must not have their weights reset for it.
  assertEquals(verdictFrom95Set(5), 'advance');
  assertEquals(verdictFrom95Set(6), 'advance'); // fewer than last time, still a pass
});
