// THE THREE-DAY BLOCK — four lifts, three days, every week of the block.
//
// ⛔ WHY THIS EXISTS. Lifting frequency was a HARD CONSTANT of 4 (`SPEC-week-solver.md` §0a #4:
// "a fixed count, lift frequency is not negotiable"). It is now a default: four days is the plan,
// three is the fallback, and the trade-off is the athlete's.
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

const build = (liftingDays?: 3 | 4) => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
  longRunDay: 'sunday', hardDay: { day: 'tuesday', discipline: 'run' },
  easyPaceMinPerMile: 9, ...(liftingDays ? { liftingDays } : {}),
} as never);

const liftDaysIn = (plan: any, week: string): Set<string> =>
  new Set((plan.sessions_by_week[week] as any[]).filter((s) => s.type === 'strength').map((s) => s.day));

const liftNamesIn = (plan: any, week: string): string[] =>
  (plan.sessions_by_week[week] as any[]).filter((s) => s.type === 'strength').map((s) => s.name);

Deno.test('⛔ ABSENT liftingDays IS FOUR — every block built before this option is unchanged', () => {
  const a = JSON.stringify(build().sessions_by_week);
  const b = JSON.stringify(build(4).sessions_by_week);
  assertEquals(a, b, 'the default drifted from an explicit 4');
});

Deno.test('three days: four lifts, three days, EVERY week — no four-day exception', () => {
  const p = build(3);
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
  const p = build(3);
  const wk = (p.sessions_by_week['1'] as any[]).filter((s) => s.type === 'strength');
  const paired = wk.filter((s) => /\+/.test(s.name));
  assertEquals(paired.length, 1, 'expected exactly one paired session');
  const ex = (paired[0].strength_exercises ?? []).map((e: any) => e.name);
  const mains = ex.filter((n: string) => ['Bench Press', 'Overhead Press'].includes(n));
  assertEquals(mains.length, 2, `paired day should carry both presses: ${ex.join(', ')}`);
  // One assistance block, not two — three slots, so five rows total on a work week.
  assertEquals(ex.length, 5, `paired day should be 2 mains + 3 assistance, got: ${ex.join(', ')}`);
  // ⛔ HEAVIEST FIRST. The second lift is trained fatigued, so the order decides which lift pays.
  assertEquals(ex[0], 'Bench Press', `bench is the heavier press and must lead: ${ex.join(', ')}`);
});

Deno.test('⛔ THE PAIRED DAY STATES ITS ORDER AND WHY A FATIGUED LIFT STILL PROGRESSES', () => {
  const p = build(3);
  const paired = (p.sessions_by_week['1'] as any[]).find((s) => s.type === 'strength' && /\+/.test(s.name));
  const d = String(paired.description ?? '');
  assertEquals(/goes first/.test(d), true, 'the shared day never named its order');
  assertEquals(/fatigued/.test(d), true, 'the shared day never named the cost of going second');
  assertEquals(/rep target/.test(d), true, 'the trade-off is unstated: 5/3/1 progresses off the rep target');
});

Deno.test('the heavy lower lifts never share a day, at either shape', () => {
  for (const shape of [3, 4] as const) {
    const p = build(shape);
    const lower = (p.sessions_by_week['1'] as any[])
      .filter((s) => s.type === 'strength' && /Squat|Deadlift/.test(s.name));
    assertEquals(new Set(lower.map((s) => s.day)).size, lower.length,
      `${shape}-day: a squat and a deadlift shared a day`);
  }
});


