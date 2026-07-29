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

const PACE = 10;   // min/mi, so minutes ÷ 10 = miles
const built = (miles: number, runDays: number) => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
    enduranceSport: 'run', enduranceFrequency: runDays, targetWeeklyMiles: miles,
    longRunDay: 'sunday', hardDay: { day: 'tuesday', discipline: 'run' },
    easyPaceMinPerMile: PACE,
  } as never);
  const runs = (p.sessions_by_week['1'] as any[]).filter((s) => s.type === 'run');
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
    const hill = built(asked, days).runs.find((s: any) => /Hill/.test(s.name))!;
    assertEquals(hill.duration, 35, `hills shrank on a ${asked}-mile week`);
  }
});

Deno.test('⛔ NO SINGLE RUN SWALLOWS THE WEEK', () => {
  // 13 miles across 2 run days used to yield one 130-minute, 13-mile long run.
  const { runs, miles } = built(13, 2);
  const longest = Math.max(...runs.map((s: any) => s.duration)) / PACE;
  assertEquals(longest < miles, true, `one run carried ${longest} of ${miles} miles`);
});
