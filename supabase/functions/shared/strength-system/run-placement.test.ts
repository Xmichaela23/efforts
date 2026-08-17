// Q-215 — where the OVERFLOW easy run lands when it has to share a lift day.
//
// Free days are consumed first; the day the week would rather leave clear is held back and yields
// only if the athlete's own asks need it. When run frequency needs more days than that leaves, the
// run stacks onto a lift — and the day it picks is what this file pins.
//
// ⛔ REWRITTEN 2026-08-05. THIS FILE USED TO ASSERT A PROHIBITION THE CODE NEVER HAD.
//
// Its headline test was *"the easy run does not stack on heavy legs while an upper lift day is
// free"* — an absolute. The composer has only ever expressed this as a PREFERENCE
// (`HEAVY_LEG_STACK_PENALTY`, one anchor adjacency, and its own comment says "a tiebreak, not an
// override"). Pinning it as a ban made the test stronger than the thing it guarded, and it went red
// the moment the solver's lift placement changed underneath it — for a reason that had nothing to do
// with run placement.
//
// ⛔ AND THE LAW PERMITS THE STACK OUTRIGHT. Verified 2026-08-05 against the matrix:
//
//     easy_run    x lower_body_strength   ALLOWED same day, 0h adjacent
//     quality_run x lower_body_strength   FORBIDDEN same day, 24h adjacent
//     long_run    x lower_body_strength   FORBIDDEN same day, 48h adjacent
//
// `easy_run × lower_body_strength` was flipped to ✓ in May 2026 for exactly this use —
// STRENGTH-PROTOCOL §6.2, lower lift first, 6h gap, the easy run as a recovery flush. The eccentric
// guard the plan actually needs is the long run's, and it is already a hard prune at 48h.
//
// ✅ SO THE INTENT PINNED HERE IS: **an easy run may share a heavy-leg day, lift first; it just is
// not preferred over a clean upper day when the two are otherwise equal.** Michael, 2026-08-05:
// endurance yields around the lifts, including onto lift days.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/run-placement.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

// ⛔ WEEK 2, NOT WEEK 1 (2026-08-15, work order §1c). Week 1 of a Strong Focus block is now a
// standalone TM-TEST week — light band, no hard endurance session, trimmed easy volume — so it is
// no longer the representative working week these assertions want. Week 2 is cycle 1's first
// leader week and is the shape week 1 used to be.
const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const block = () => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13,
  longRunDay: 'sunday', hardDays: [{ day: 'thursday', discipline: 'run' }],
  easyPaceMinPerMile: 10,
} as never);

const week1 = () => (block().sessions_by_week['2'] as any[]);
const dayOf = (pred: (s: any) => boolean) => week1().filter(pred).map((s) => String(s.day));
const liftDays = (lower: boolean) =>
  week1().filter((s) => s.type === 'strength'
    && (lower ? /Back Squat|Deadlift/ : /Bench Press|Overhead Press/).test(s.name)).map((s) => String(s.day));

Deno.test('⛔ A CLEAN UPPER DAY IS PREFERRED OVER A HEAVY-LEG DAY WHEN THEY OTHERWISE TIE', () => {
  // The real defect Q-215 found, stated as the preference it is. In this week the deadlift day
  // scores 0 anchor-adjacency + 4 heavy-leg, and both upper days score 4 + 0 — a three-way tie that
  // the old `DAYS.indexOf` tie-break resolved to the earliest day, which is the leg day. The
  // direction the penalty exists to express was being decided by the calendar.
  const easyRunDays = dayOf((s) => s.type === 'run' && /Easy Run/.test(s.name));
  const heavy = liftDays(true);
  const upper = liftDays(false);
  for (const d of easyRunDays) {
    if (!heavy.includes(d)) continue;
    // A leg day is allowed — but not while an upper lift day sat free and scored no worse.
    const upperFree = upper.filter((u) => !easyRunDays.includes(u));
    assertEquals(upperFree.length, 0,
      `easy run took ${d} (heavy legs) while upper day(s) ${upperFree.join('/')} were free`);
  }
});

Deno.test('a heavy-leg day is ALLOWED, not banned — the law permits it and the copy states the gap', () => {
  // ⛔ THE OTHER HALF, AND THE ONE THE OLD ABSOLUTE FORECLOSED. If the composer is ever forced onto
  // a leg day it must place the run there rather than drop it, and the session must state lift-first
  // and the 6h gap. Asserted on the SESSION rather than by manufacturing a cramped fixture: whatever
  // day it lands on, a run sharing with heavy legs says so.
  const shared = week1().filter((s) => s.type === 'run' && /Easy Run/.test(s.name)
    && liftDays(true).includes(String(s.day)));
  for (const s of shared) {
    assertEquals(/goes first/.test(String(s.description ?? '')), true,
      'a run sharing a heavy-leg day must state that the lift goes first');
    assertEquals(/6h|six hours/i.test(String(s.description ?? '')), true,
      'a run sharing a heavy-leg day must state the recovery gap the law asks for');
  }
});

Deno.test('⛔ THE LONG RUN NEVER SHARES A HEAVY-LEG DAY — that is the law, not a preference', () => {
  // `long_run × lower_body_strength` is FORBIDDEN same-day and 48h apart. This is the eccentric
  // guard the plan depends on, and unlike everything else in this file it is a hard prune.
  const longRun = week1().find((s) => s.type === 'run' && /Long Run/.test(s.name));
  if (!longRun) throw new Error('fixture should carry a long run');
  assertEquals(liftDays(true).includes(String(longRun.day)), false,
    `the long run landed on ${longRun.day}, a heavy-leg day`);
});

Deno.test('the run still gets placed — the rule reorders, it does not drop a session', () => {
  const runs = week1().filter((s) => s.type === 'run');
  assertEquals(runs.length, 3, 'long run + hard run + one easy run');
});

Deno.test('the rest day is not spent on a week that has room for it', () => {
  // ⛔ SOFTENED FROM "STILL RESERVED" 2026-08-05. The rest day now yields to a session the athlete
  // asked for rather than a session being dropped to protect it (Michael: *"we also dont need a rest
  // day"*), so "always reserved" is no longer the rule. This fixture asks for 3 runs against 4 lifts,
  // which fits — so it must still come out with a day off. A week that genuinely cannot hold the ask
  // is covered in `strength-primary-plan.test.ts`, where the compromise text is asserted too.
  const active = new Set(week1().map((s) => String(s.day)));
  assertEquals(active.size <= 6, true, `no rest day left: ${[...active].join(', ')}`);
});
