// THE RIDE ASK IS ONE OBJECT NOW — THIS PINS THE TWO EDGES THAT NOTHING ELSE COVERED.
//
// Stage 4 of `docs/WORKORDER-finish-the-swaps-2026-08-20.md`, 2026-08-21. The composer's eight ride
// variables became `rideIntent` (`_shared/athlete-weekly-intent.ts`), and that module's own suite
// proves the ARITHMETIC is byte-identical. This file covers the two places where the composer
// READS it and the existing suite did not notice a wrong read — both found by mutation, not by
// reasoning about the diff.
//
//   1. **`declared` is not `selected`, and swapping them re-opens a shipped bug.** A bike-PRIMARY
//      athlete who never gave hours has no bike object at all: `declared` is false, `selected` is
//      true. Exactly one emitter is supposed to fire for them — the `enduranceSport === 'bike' &&
//      !declared` fallback. Gate the main ride pass on `selected` and BOTH fire, which is the
//      2026-07-29 double-emitter defect that measured 6h asked → 7.5h built. The suite passed 581
//      of 581 with that mutation in place.
//
//   2. **Four rides has to reach the calendar.** The 1-4 range was written out five times and three
//      copies were still at 3 on 2026-08-20 — the composer's clamp was right and
//      `generate-strength-plan` rewrote a 4 to a 3 one hop later. Nothing asserted the end of that
//      chain. This is the composer half; `athlete-weekly-intent.test.ts` holds the rule itself.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/ride-intent-wiring.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const BASE = {
  durationWeeks: 12,
  oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  fiveKPaceSecPerMi: 435,
  thresholdPaceSecPerMi: 455,
  ftpWatts: 240,
  easyPaceMinPerMile: 9,
};

// deno-lint-ignore no-explicit-any
const build = (extra: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ ...BASE, ...extra } as never);

// deno-lint-ignore no-explicit-any
const rides = (plan: any, week = 1): any[] =>
  // deno-lint-ignore no-explicit-any
  ((plan.sessions_by_week?.[String(week)] ?? []) as any[]).filter((s) => s.type === 'ride');

Deno.test('⛔ ONE EMITTER FOR A BIKE-PRIMARY ATHLETE WHO GAVE NO HOURS — never two', () => {
  // No `bike` object and no `targetWeeklyRideHours`: the bike is the primary sport and nothing else
  // is known about it. `declared` false, `selected` true — the only shape where they disagree.
  const week = rides(build({ enduranceSport: 'bike', enduranceFrequency: 2 }));
  const days = [...new Set(week.map((s) => String(s.day).toLowerCase()))];
  // ⛔ BOTH HALVES, AND THE SECOND ONE IS NOT OPTIONAL. Asserting only "no day is doubled" passes
  // when the athlete gets NO rides at all — mutation-tested 2026-08-21: flipping the FALLBACK
  // emitter's gate to `selected` silences it entirely, and a sessions-equals-days check called that
  // correct. A bike-primary athlete has to end up with rides before it is worth asking how many.
  assertEquals(days.length, 2, `a bike-primary athlete got ${days.length} ride days`);
  // ⚠️ SESSIONS-PER-DAY, not a day count, for the doubling half. Both emitters place on the SAME
  // solved days, so a second one shows up as two rides stacked on one date rather than as extra
  // days — which is why the volume overshoot went unnoticed for a month.
  assertEquals(
    week.length,
    days.length,
    `two emitters authored the same day: ${week.map((s) => `${s.day}:${s.name}`).join(' | ')}`,
  );
});

Deno.test('⛔ FOUR RIDES REACHES THE CALENDAR, and the hours are still the athlete\'s', () => {
  const plan = build({
    enduranceSport: 'run',
    enduranceFrequency: 2,
    targetWeeklyMiles: 10,
    longRunDay: 'sunday',
    bike: { hours: 6, days: 4, longRideDay: 'saturday' },
  });
  const week = rides(plan);
  const days = [...new Set(week.map((s) => String(s.day).toLowerCase()))];
  assertEquals(days.length, 4, `asked for four ride days, built ${days.length}: ${days.join(', ')}`);
  // ⚠️ AND THE VOLUME IS NOT RE-SPLIT BY THE EXTRA DAY. Six hours asked, six hours built — the count
  // decides how the hours divide, never how many there are.
  assertEquals(week.reduce((m, s) => m + Number(s.duration ?? 0), 0), 360);
  // The pinned long ride is still the long one.
  assertEquals(
    week.find((s) => String(s.day).toLowerCase() === 'saturday')?.name,
    'Long Ride',
  );
});
