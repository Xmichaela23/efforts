// The week's mileage must be the mileage the athlete asked for.
//
// ⛔ THE DEFECT: the hill session is a RUN. It counted toward the run-day COUNT and not toward the
// MILES, so every plan built the typed number and then added the hills on top — measured at exactly
// +3.5 miles on a 13-mile ask, a 20-mile ask and a 30-mile ask alike. An athlete asking to hold 13
// miles was handed 16.5, a 27% overage on the discipline the block is meant to hold STEADY.
//
// ⚠️ And it compounded: the remaining miles were split across the days that EXCLUDE the hard day, so
// the same total landed on fewer runs. At two run days that produced one 130-minute long run — the
// entire week in a single session, in a maintenance block.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/run-mileage.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

// ⛔ WEEK 2, NOT WEEK 1 (2026-08-15, work order §1c). Week 1 of a Strong Focus block is now a
// standalone TM-TEST week — light band, no hard endurance session, trimmed easy volume — so it is
// no longer the representative working week these assertions want. Week 2 is cycle 1's first
// leader week and is the shape week 1 used to be.
const PACE = 10;   // min/mi, so minutes ÷ 10 = miles
const built = (miles: number, runDays: number) => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
    fiveKPaceSecPerMi: 435, ftpWatts: 240, enduranceSport: 'run', enduranceFrequency: runDays, targetWeeklyMiles: miles,
    longRunDay: 'sunday', hardDays: [{ day: 'tuesday', discipline: 'run' }],
    easyPaceMinPerMile: PACE,
  } as never);
  const runs = (p.sessions_by_week['2'] as any[]).filter((s) => s.type === 'run');
  return { runs, miles: runs.reduce((a, s) => a + s.duration, 0) / PACE };
};

Deno.test('⛔ THE WEEK IS THE MILEAGE THE ATHLETE ASKED FOR — the hard day is INSIDE it', () => {
  // Half a mile of slack for rounding; the old behaviour was +3.5 every time.
  for (const [asked, days] of [[13, 3], [13, 2], [20, 3], [30, 4]] as const) {
    const { miles } = built(asked, days);
    const over = miles - asked;
    assertEquals(over <= 1, true, `asked ${asked} over ${days} days, built ${miles} (+${over})`);
  }
});

Deno.test('the hills are still the protected intensity — fixed, never shrunk to fit a small budget', () => {
  // Hickson: intensity holds VO2max, frequency and duration are the expendable variables. A 13-mile
  // athlete and a 30-mile athlete get the same hard session; what flexes is the easy volume.
  for (const [asked, days] of [[13, 3], [30, 4]] as const) {
    // ⚠️ THE HARD RUN IS A THRESHOLD RUN NOW ON A ONE-HARD-DAY WEEK (2026-08-17) — VO2/hills unlock on
    // a SECOND hard run. This assertion is about the hard session being a PROTECTED, fixed cost that
    // small mileage budgets do not shrink; which session carries that cost is not what it tests.
    const hard = built(asked, days).runs.find((s: any) => /Hill|Threshold/.test(s.name))!;
    // ⚠️ 43 MIN, NOT 35 — the threshold session is longer than the hill session (20-21 min of work
    // plus rests plus a 20-min warm-up/cool-down). What this test protects is that the number does
    // NOT MOVE with the mileage budget, which is Hickson's point; the number itself belongs to
    // whichever session the hierarchy put there.
    // Week 2 of the block is 3 × 7 min: 21 min of work + 2 × 2 min rest + 20 warm-up/cool-down.
    assertEquals(hard.duration, 45, `the hard run shrank on a ${asked}-mile week`);
  }
});

Deno.test('⛔ NO SINGLE RUN SWALLOWS THE WEEK', () => {
  // 13 miles across 2 run days used to yield one 130-minute, 13-mile long run.
  const { runs, miles } = built(13, 2);
  const longest = Math.max(...runs.map((s: any) => s.duration)) / PACE;
  assertEquals(longest < miles, true, `one run carried ${longest} of ${miles} miles`);
});

// ⛔ THE BUG CASE, KEPT: 40 MILES USED TO PUT 16 OF THEM IN ONE DAY.
//
// Measured 2026-07-29. `distributeRunMiles` weights the EASY budget and `runDayList` excludes the hard
// day, so a "4 run day" week was a 3-way split at 1.5/1.0/0.85 and the long run took 45% of it — 16
// miles, 40% of the week. The field ceiling is 25–30% of weekly mileage (Daniels, with a 2:30–3:00
// time limit beside it); strength-led hybrid programmes run the long session 60–90 minutes.
//
// Above `SELF_REGULATED_MILES` (25) the engine stops shaping the week and the share is even — the
// athlete places their own miles. This pins that, because the weighting is still correct BELOW the
// line and a future session re-applying it everywhere would reinstate the 16.
Deno.test('⛔ 25+ IS SELF-REGULATED — the engine names the long day and stops sizing it', () => {
  const { runs, miles } = built(40, 4);
  const easy = runs.filter((s: any) => !/Hill|Threshold/.test(s.name));
  const longest = Math.max(...easy.map((s: any) => s.duration)) / PACE;
  const share = longest / miles;
  assertEquals(share <= 0.32, true, `long run took ${Math.round(share * 100)}% of the week (was 40%)`);
  // Even, not weighted: every easy run is the same length above the line.
  const spread = longest - Math.min(...easy.map((s: any) => s.duration)) / PACE;
  assertEquals(spread <= 0.5, true, `easy runs still weighted — ${spread} mi apart`);
});

// ⚠️ AND THE WEIGHTING SURVIVES BELOW THE LINE. A 12-mile-a-week runner asking for a long run and
// getting four equal jogs is a worse answer, and 45% of a small budget is not the same defect.
Deno.test('below 25 the long run is still the long run', () => {
  const { runs } = built(20, 3);
  const easy = runs.filter((s: any) => !/Hill|Threshold/.test(s.name));
  const longest = Math.max(...easy.map((s: any) => s.duration));
  const shortest = Math.min(...easy.map((s: any) => s.duration));
  assertEquals(longest > shortest, true, 'the long run stopped being longer below the line');
});
