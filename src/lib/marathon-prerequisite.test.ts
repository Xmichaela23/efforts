/**
 * ⛔ THE MARATHON BLOCK IS A PRESCRIPTION WITH A PREREQUISITE (2026-08-06, Michael's call).
 *
 * THE MODEL THIS REVERSES, because it shipped the same morning and the reasoning is worth keeping:
 * the arc used to enter the row wherever the athlete actually was and state the ceiling that
 * produced. A 9-week beginner topped out at a 9-mile long run and the intake said so. Honest — and
 * not a marathon plan. Nobody finishes 26.2 off a 9-mile peak, so "honest about a plan that cannot
 * work" is a worse answer than "here is the plan that works, and here is what it assumes."
 *
 * So: enter at the assumed base, build the real 18-mile peak, and SAY what was assumed. That is how
 * every published marathon plan is written (Higdon's "about a year of running", Pfitzinger's 55-mile
 * weeks), and the stated prerequisite is the thing that makes the peak honest rather than reckless.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --no-check src/lib/marathon-prerequisite.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_LONG_RUN_SHARE,
  WEEKLY_MILEAGE,
  LONG_RUN_PROGRESSION,
  PEAK_LONG_RUN_CEILING_MI,
  buildLongRunArc,
  marathonPrerequisiteFor,
} from './run-volume-tables.ts';

const pre = (fitness: string, durationWeeks: number, peakWeek?: number) =>
  marathonPrerequisiteFor({ distance: 'marathon', fitness, durationWeeks, peakWeek })!;

/** Michael's acceptance case: 9 weeks, race Sunday 2026-10-11, plan opens Monday 2026-08-10. */
const NINE_WEEK = {
  distance: 'marathon', fitness: 'beginner', durationWeeks: 9,
  prerequisiteLongRunMi: pre('beginner', 9, 6).longRunMi,
  peakWeek: 6, raceWeekIsLast: true,
} as const;

Deno.test('⛔ THE SPEC: 9-week beginner peaks at 18, three weeks out, tapering 18 → 14 → 10', () => {
  const arc = buildLongRunArc({ ...NINE_WEEK, entryLongRunMi: null })!;
  assertEquals(arc.weeks, [10, 12, 14, 11, 16, 18, 14, 10, 10]);
  assertEquals(arc.peakMi, 18);
  assertEquals(arc.peakWeek, 6);              // week 6 of 9 → the Sunday 21 days before the race
  assertEquals(arc.reachesTableMax, true);
  // ⚠️ Week 9 carries a value the plan never uses — race day replaces it. The taper is anchored to
  // week 8 so the last REAL long run is the 10, not a 14 one week late.
  assertEquals(arc.weeks[7], 10);
});

Deno.test('the build climbs at the row\'s own biggest step, with the row\'s own cutback', () => {
  const arc = buildLongRunArc({ ...NINE_WEEK, entryLongRunMi: null })!;
  const row = LONG_RUN_PROGRESSION.marathon.beginner;
  // +2 a week is the largest step the row itself ever takes (12 → 14 → 16 → 18).
  // ⚠️ MEASURED BETWEEN CLIMBING WEEKS, NOT ACROSS THE CUTBACK. Week 5 resumes from the pre-cutback
  // level (14 → 16), which reads as +5 against the deloaded 11 — the row does exactly the same
  // thing (12 → 10 → 14). A cutback costs no progress; that is what makes it a cutback.
  const climbSteps = [[1, 2], [2, 3], [4, 5]];   // 0-based pairs, skipping week 4
  for (const [a, b] of climbSteps) {
    const step = arc.weeks[b] - arc.weeks[a];
    assert(step <= 2, `weeks ${a + 1}→${b + 1} climbed ${step} miles — over the row's own biggest step`);
  }
  assertEquals(arc.weeks[4] - arc.weeks[2], 2, 'week 5 did not resume two miles above the pre-cutback level');
  // and week 4 is a cutback, at roughly the row's own depth (6/8 = 0.75)
  assert(arc.weeks[3] < arc.weeks[2], 'week 4 is not a cutback');
  assert(arc.weeks[3] / arc.weeks[2] > 0.7 && arc.weeks[3] / arc.weeks[2] < 0.85, 'the cutback depth left the row\'s own range');
  assertEquals(arc.peakMi, Math.max(...row), 'the peak is not the row\'s own maximum');
});

Deno.test('⛔ THE PREREQUISITE IS THE FLOOR, NOT A REPLACEMENT — a stronger athlete enters higher', () => {
  const assumed = buildLongRunArc({ ...NINE_WEEK, entryLongRunMi: null })!;
  const stronger = buildLongRunArc({ ...NINE_WEEK, entryLongRunMi: 14 })!;
  const weaker = buildLongRunArc({ ...NINE_WEEK, entryLongRunMi: 6 })!;
  assert(stronger.weeks[0] >= assumed.weeks[0], 'a 14-mile long run opened BELOW the assumed base');
  assertEquals(stronger.maxMi, 18, 'a stronger athlete no longer reaches the row\'s peak');
  assertEquals(weaker.weeks[0], assumed.weeks[0], 'a 6-mile long run opened below the assumed base');
  // ⚠️ A 14-MILE ENTRY WALKS THE ROW INSTEAD OF BEING PRESCRIBED — its walk already reaches 18, so
  // the ramp never generates. It opens at the same 10 and gets the ROW's shape (its 18 lands at
  // week 4 rather than the peak week), which is the row's own design: the beginner row puts its
  // maximum three rungs before its last build rung. Noted, not fixed — it is the row talking.
  // ⚠️ THAT LAST ONE IS THE TRADE, STATED. An athlete whose real long run is 6 is prescribed a 10 in
  // week 1 — a 67% jump — and the only thing protecting them is the sentence on the plan. That is
  // what a prerequisite IS, and it is why `generatePlanDescription` must never lose it.
});

Deno.test('⛔ THE NUMBERS MICHAEL SPECIFIED FALL OUT OF THE FORMULA, not the other way round', () => {
  // 9-week beginner: peak week 6, one cutback → 4 climbing weeks.
  //   long run  18 − 2×4        = 10
  //   weekly    40 / 1.1⁴ = 27.3 → 27
  // Both are what he named by hand, which is the check that this is the RULE he was describing.
  const p = pre('beginner', 9, 6);
  assertEquals(p.longRunMi, 10);
  assert(p.weeklyMi >= 27 && p.weeklyMi <= 28, `weekly base came out ${p.weeklyMi}, wanted 27-28`);
  assertEquals(p.peakLongRunMi, 18);
  assertEquals(p.peakWeeklyMi, 40);
  assertEquals(p.meetable, true);
});

Deno.test('⛔ THE PEAK IS UNIVERSAL AND THE BASE IS WHAT MOVES — 45 / 40 / 33% by level', () => {
  // Michael: same peak at every level, higher assumed base, share 45/40/33. Those shares are the
  // ratios `MAX_LONG_RUN_SHARE` already documents the tables as embodying — 18/40, 20/50, 20/60.
  const expected: Record<string, number> = { beginner: 0.45, intermediate: 0.40, advanced: 0.33 };
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    const p = pre(level, 9, 6);
    assert(p.peakLongRunMi >= 18 && p.peakLongRunMi <= 20, `${level} peaks at ${p.peakLongRunMi}`);
    assertEquals(p.peakLongRunMi, Math.min(PEAK_LONG_RUN_CEILING_MI, Math.max(...LONG_RUN_PROGRESSION.marathon[level])));
    assertEquals(p.peakWeeklyMi, WEEKLY_MILEAGE.marathon[level].peak);
    const share = p.peakLongRunMi / p.peakWeeklyMi;
    assert(Math.abs(share - expected[level]) < 0.02, `${level} share ${(share * 100).toFixed(0)}%, wanted ${expected[level] * 100}%`);
    // and the base climbs with the level, because the peak it must reach does
    if (level !== 'beginner') assert(p.weeklyMi > pre('beginner', 9, 6).weeklyMi);
  }
  // the shares are the file's own documented ratios, not a second set
  assert(MAX_LONG_RUN_SHARE.beginner < 0.45 + 0.01);
});

Deno.test('⛔ THE BASE SCALES DOWN AS THE WINDOW GROWS, and stops binding on a long one', () => {
  // Michael: short windows quote a higher base, long windows near-zero.
  const windows = [6, 8, 9, 11, 12, 14, 16, 18];
  let previous = Infinity;
  for (const weeks of windows) {
    const p = pre('beginner', weeks, weeks - 3);
    assert(p.weeklyMi <= previous, `${weeks} weeks asked MORE base (${p.weeklyMi}) than a shorter window`);
    assert(p.peakLongRunMi === 18, `${weeks} weeks no longer peaks at 18`);
    previous = p.weeklyMi;
  }
  // A long window bottoms out at the row's own opening — it requires nothing the plan would not
  // have started at anyway.
  const long = pre('beginner', 18, 15);
  assertEquals(long.weeklyMi, WEEKLY_MILEAGE.marathon.beginner.start);
  assertEquals(long.longRunMi, LONG_RUN_PROGRESSION.marathon.beginner[0]);
});

Deno.test('⛔ THE PEAK NEVER EXCEEDS 20, however long the window', () => {
  // Extra weeks add volume and weeks near the peak — not a longer single run.
  for (const weeks of [12, 18, 24, 30]) {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      assert(pre(level, weeks, weeks - 3).peakLongRunMi <= PEAK_LONG_RUN_CEILING_MI);
    }
  }
});

Deno.test('⛔ BELOW THE BUILD WEEKS IT NEEDS, THE PREREQUISITE GOES UNMEETABLE → the half', () => {
  // Past 80% of the peak the block is asking the athlete to arrive with a 16-mile long run so it can
  // "build" them to 18. That is not a marathon build; the plan names the half instead.
  assertEquals(pre('beginner', 9, 6).meetable, true);
  assertEquals(pre('beginner', 6, 3).meetable, true);
  assertEquals(pre('beginner', 4, 2).meetable, false);
  assertEquals(pre('beginner', 3, 1).meetable, false);
});

Deno.test('⛔ A FULL-LENGTH BLOCK IS UNTOUCHED — it walks the row, it does not need the prescription', () => {
  // 20 weeks reaches the row's peak by walking, so the prescriptive ramp never engages and the arc
  // is byte-identical to the row. The prescription exists for blocks too short to walk there.
  const arc = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 20,
    prerequisiteLongRunMi: pre('beginner', 20, 18).longRunMi,
  })!;
  assertEquals(arc.weeks, LONG_RUN_PROGRESSION.marathon.beginner);
});

Deno.test('no prerequisite passed → the old behaviour, unchanged', () => {
  // The shorter distances (and any caller that does not ask for one) still build from where the
  // athlete is and top out where the ramp lands.
  const arc = buildLongRunArc({
    distance: 'marathon', fitness: 'intermediate', durationWeeks: 9,
    entryLongRunMi: 10, peakWeek: 6, raceWeekIsLast: true,
  })!;
  assertEquals(arc.reachesTableMax, false, 'an unprescribed short block should still top out where it lands');
});

Deno.test('a block too short to reach the peak lands short and SAYS so', () => {
  // 5 weeks: 3 build weeks from 10 at +2 cannot reach 18. It must not skip rungs to get there.
  const arc = buildLongRunArc({
    distance: 'marathon', fitness: 'beginner', durationWeeks: 5,
    prerequisiteLongRunMi: 10, peakWeek: 3, raceWeekIsLast: true,
  })!;
  assert(arc.peakMi < 18, `a 5-week block reached ${arc.peakMi} — the step cap is not holding`);
  assertEquals(arc.reachesTableMax, false);
});
