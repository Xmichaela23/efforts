// THE THREE-DAY BLOCK — four lifts, three days, every week of the block.
//
// ⛔ WHY THIS EXISTS. Lifting frequency was a HARD CONSTANT of 4 (`SPEC-week-solver.md` §0a #4:
// "a fixed count, lift frequency is not negotiable"). It then became a DEFAULT of 4 with 3 as an
// opt-in.
//
// ⛔⛔ AND AS OF 2026-08-16 (§1f-0, Michael) THERE IS NO CHOICE LEFT: **every Strong Focus block is
// three days — Squat · Bench · Deadlift + Press.** The `liftingDays` argument is deleted from
// `StrengthPrimaryArgs`, not defaulted off, so this file no longer builds two shapes and compares
// them. It pins the one shape.
//
// ⚠️ A TEST WAS DELETED HERE, AND DELETING IT WAS THE POINT. `⛔ ABSENT liftingDays IS FOUR — every
// block built before this option is unchanged` compared `build()` against `build(4)` and went GREEN
// after the argument was removed, because both calls now pass an ignored field and produce the same
// three-day block. It asserted a claim that had become false while reporting success. A vacuous
// green is worse than a red one: it is the only kind of test failure nobody investigates.
//
// ⛔ REWRITTEN 2026-08-05 — THE WEEK-3 "TEST WEEK" IS GONE AND THIS FILE PINNED IT.
//
// The old shape broke week 3 of every cycle onto FOUR days so each 95% set was read on a fresh
// lift, and these tests asserted that. It rested on a fear that a fatigued AMRAP would mis-set the
// next cycle — and the trace kills it: `applyVerdict` steps the working number by a FIXED increment
// (`cappedCycleIncrementLb`, Wendler's +5 / +10), and `verdictFrom95Set` reads only whether the
// prescribed single at 95% was completed. **The next weight is never computed from an estimated max
// off that set.** A fatigued lift can miss the rep target — the book's own reset trigger, true on
// any day — but it cannot bias the weight. So the split bought nothing and cost a "3-day" plan that
// quietly ran four days every third week.
//
// ⛔ AND STACKING MAIN LIFTS IS WENDLER'S, NOT A COMPROMISE. The two-day template (p.77) runs Squat
// 5/3/1 and Bench 5/3/1 in one session; the full-body template stacks three. What this file now pins
// is the DOSE: two main lifts and ONE round of assistance, heaviest first — not the two complete
// eight-exercise sessions the per-lift loop used to emit onto one day.
//
// Sourced: frequency does not drive strength gain when weekly volume is equated (Grgic et al.,
// volume-equated meta). Exercise order does — the first movement adapts most, which is why the
// heavier lift leads and why the order is stated to the athlete.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/lifting-days.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

// ⛔ WEEK 2, NOT WEEK 1 (2026-08-15, work order §1c). Week 1 of a Strong Focus block is now a
// standalone TM-TEST week — light band, no hard endurance session, trimmed easy volume — so it is
// no longer the representative working week these assertions want. Week 2 is cycle 1's first
// leader week and is the shape week 1 used to be.
const build = () => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
  longRunDay: 'sunday', hardDays: [{ day: 'tuesday', discipline: 'run' }],
  easyPaceMinPerMile: 9,
} as never);

const liftDaysIn = (plan: any, week: string): Set<string> =>
  new Set((plan.sessions_by_week[week] as any[]).filter((s) => s.type === 'strength').map((s) => s.day));

const liftNamesIn = (plan: any, week: string): string[] =>
  (plan.sessions_by_week[week] as any[]).filter((s) => s.type === 'strength').map((s) => s.name);

Deno.test('three days: four lifts, three days, EVERY week — no four-day exception', () => {
  const p = build();
  for (let w = 1; w <= 12; w++) {
    const wk = String(w);
    assertEquals(liftDaysIn(p, wk).size, 3, `week ${wk} did not run on three days`);
    // ⛔ ALL FOUR LIFTS ARE STILL THERE. §5.2b — the engine never silently subtracts a session.
    // They arrive as three sessions, one of which names two lifts.
    const named = liftNamesIn(p, wk).join(' ');
    for (const lift of ['Bench Press', 'Overhead Press', 'Back Squat', 'Deadlift']) {
      assertEquals(named.includes(lift), true, `week ${wk} lost ${lift}`);
    }
  }
});

Deno.test('⛔ THE PAIRED DAY IS ONE SESSION, TWO MAIN LIFTS AND ONE ASSISTANCE BLOCK', () => {
  // The dose, and the defect this replaced: the per-lift loop authored a COMPLETE session per lift,
  // so the shared day emitted two sessions and eight exercises — two presses, two pushes, two pulls,
  // two core. Wendler's stacked day is the mains plus one round (p.77, "one or two exercises per
  // lift" for the whole day).
  const p = build();
  const wk = (p.sessions_by_week['2'] as any[]).filter((s) => s.type === 'strength');
  const paired = wk.filter((s) => /\+/.test(s.name));
  assertEquals(paired.length, 1, 'expected exactly one paired session');
  const rows = (paired[0].strength_exercises ?? []) as any[];
  const ex = rows.map((e: any) => e.name);
  // ⛔ DEADLIFT + PRESS, NOT BENCH + PRESS (§1f, 2026-08-15) — Wendler's own 3-day table, Forever
  // p.22. Squat and bench get their own days. The bench+press pairing was ours.
  const mains = rows.filter((e: any) => !e.supplemental && ['Deadlift', 'Overhead Press'].includes(e.name));
  assertEquals(mains.length, 2, `paired day should carry deadlift + press: ${ex.join(', ')}`);
  // ⛔ ONE SUPPLEMENTAL ON A SHARED DAY, NOT TWO (§1e, 2026-08-15). Week 2 is a leader week, so the
  // FSL block is present — and the per-lift loop authors one per lift, which on a stacked day would
  // be ten sets of five on top of two main lifts. Wendler's stacked day is the mains plus ONE round
  // of everything else (p.77), and that governs the supplemental exactly as it governs assistance.
  const supplementals = rows.filter((e: any) => e.supplemental);
  assertEquals(supplementals.length, 1, `paired day should carry ONE supplemental: ${ex.join(', ')}`);
  // One assistance block, not two — three slots, so seven rows on a leader work week.
  // ⚠️ THE JUMP ROW IS ONE OF THEM (§1f). The shared day carries the DEADLIFT now, so it is a lower
  // day and takes the primer; the old bench+press pairing was two upper lifts and carried none.
  assertEquals(ex.length, 7, `paired day should be jumps + 2 mains + 1 FSL + 3 assistance, got: ${ex.join(', ')}`);
  // ⛔ AND THE PRIMER LEADS. Wendler opens every session with jumps or throws; the merge used to
  // sweep them into the assistance bucket, which would have put fifteen landings after the deadlift.
  assertEquals(ex[0], 'Box Jump', `the primer must lead the shared day: ${ex.join(', ')}`);
  // ⛔ HEAVIEST FIRST. The second lift is trained fatigued, so the order decides which lift pays.
  // ⛔ HEAVIEST FIRST. The second lift is trained fatigued, so the order decides which lift pays —
  // and the deadlift is the heavier of the pair for essentially every athlete.
  assertEquals(ex[1], 'Deadlift', `deadlift is the heavier of the pair and must lead the lifting: ${ex.join(', ')}`);
  // ⛔ AND THE SUPPLEMENTAL COMES AFTER BOTH MAINS, never between them — five sets of five in front
  // of a second heavy main lift would double the cost the stacked-day copy discloses.
  assertEquals(rows.indexOf(supplementals[0]) >= 3, true, `the FSL block ran before a main lift: ${ex.join(', ')}`);
});

Deno.test('⛔ THE PAIRED DAY STATES ITS ORDER AND WHY A FATIGUED LIFT STILL PROGRESSES', () => {
  const p = build();
  const paired = (p.sessions_by_week['2'] as any[]).find((s) => s.type === 'strength' && /\+/.test(s.name));
  const d = String(paired.description ?? '');
  assertEquals(/goes first/.test(d), true, 'the shared day never named its order');
  assertEquals(/fatigued/.test(d), true, 'the shared day never named the cost of going second');
  assertEquals(/rep target/.test(d), true, 'the trade-off is unstated: 5/3/1 progresses off the rep target');
});

// ⚠️ WAS "at either shape", looping [3, 4] (2026-08-16). There is one shape now, so the loop ran the
// identical scenario twice and read as twice the coverage.
Deno.test('the heavy lower lifts never share a day', () => {
  const p = build();
  const lower = (p.sessions_by_week['2'] as any[])
    .filter((s) => s.type === 'strength' && /Squat|Deadlift/.test(s.name));
  assertEquals(new Set(lower.map((s) => s.day)).size, lower.length,
    'a squat and a deadlift shared a day');
});



Deno.test('⛔ THE THREE-DAY WEEK ALTERNATES WHEN NOTHING PINS IT', () => {
  // ⛔ ADDED 2026-08-05 BECAUSE DELETING `upperToNearestLiftPenalty` BROKE NOTHING.
  //
  // That term clustered the 3-day week — Mon Deadlift · Thu Squat · Sat presses — and removing it
  // changed 36 of 43 three-day solver scenarios. **Not one test noticed.** The layout was never
  // pinned, which is how it drifted into contradicting the book with nobody seeing it.
  //
  // Wendler's basic week (2nd ed. p.11) alternates upper and lower on back-to-back days on purpose.
  // With two leg lifts and one press day, the alternating arrangement is lower · upper · lower.
  //
  // ⛔ UNPINNED ONLY, AND THAT IS THE POINT OF THE TEST RATHER THAN A WEAKNESS OF IT. A first
  // version asserted this on the file's shared fixture, which pins a Sunday long run — and Monday is
  // 24h from Sunday, so `long_run × lower_body_strength` (48h, a hard prune) FORBIDS a leg lift
  // there and the presses must lead. The law overruling the shape is the system working. What must
  // not happen is the shape being lost when nothing is asking for it.
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
    fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
    easyPaceMinPerMile: 9,
  } as never);
  for (let w = 1; w <= 12; w++) {
    const wk = (p.sessions_by_week[String(w)] as any[])
      .filter((s) => s.type === 'strength')
      .sort((a, b) => DAY_ORDER.indexOf(String(a.day)) - DAY_ORDER.indexOf(String(b.day)));
    // A session naming two lifts is the paired press day; everything else carries one lift.
    const kinds = wk.map((s) => (/Squat|Deadlift/.test(s.name) ? 'L' : 'U')).join('');
    assertEquals(kinds, 'LUL',
      `week ${w} did not alternate: ${wk.map((s) => `${s.day} ${s.name}`).join(', ')}`);
  }
});
