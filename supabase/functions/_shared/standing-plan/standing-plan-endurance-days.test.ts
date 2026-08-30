// ============================================================================
// THE ATHLETE'S DAYS — how many sessions their hours are divided across.
//
// ⛔ MICHAEL, 2026-08-27: *"I run for three hours a week over the course of three days. I ride for
// four hours a week over the course of two days and then we chop it up according to the plans
// numbers. Lifts are fixed."*
//
// ⛔ NO CONFLICT WITH THE LIFTS, and that is why this is a wire-up and not a redesign: the frame
// already stacks endurance onto lifting days and leaves two clear days plus the rest day, so five
// endurance days sit inside a four-lift week without touching it.
//
// Run: deno test --no-check --allow-read --allow-env \
//        supabase/functions/_shared/standing-plan/standing-plan-endurance-days.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts, workingNumberFromTest } from './index.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  workingNumbers: {
    bench: workingNumberFromTest('bench', { weight: 135, reps: 8 })!,
    squat: workingNumberFromTest('squat', { weight: 100, reps: 10 })!,
    deadlift: workingNumberFromTest('deadlift', { weight: 135, reps: 10 })!,
  },
  seed1RMs: { bench: 135, squat: 100, deadlift: 135, overheadPress: 95 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
  demonstratedWeeklyMinutes: { run: 300, ride: 400 },
} as never;

type S = { type: string; duration: number; tags: string[] };
const week = (slots: Record<string, string>, runH: number, rideH: number, days: unknown) =>
  composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 2, rides: 2, swimDays: 0, slots },
    targetRunHours: runH, targetRideHours: rideH, enduranceDaysBySport: days,
  } as never) as never as { sessions: S[] };
const count = (wk: { sessions: S[] }, sport: string) => wk.sessions.filter((s) => s.type === sport).length;
const minutes = (wk: { sessions: S[] }, sport: string) =>
  wk.sessions.filter((s) => s.type === sport).reduce((t, s) => t + (Number(s.duration) || 0), 0);

/** His own shape: the two hard slots on the bike, easy and long on foot. */
const HIS = { '1:0': 'ride', '3:0': 'ride', '4:0': 'run', '6:0': 'run' };

Deno.test('⛔⛔ THREE RUN DAYS BUILDS THREE RUNS — the day count is a floor on the sessions', () => {
  const asked = week(HIS, 3, 4, { run: 3, ride: 2 });
  assertEquals(count(asked, 'run'), 3, 'the third run day was never built');
  // ⚠️ AND THE FRAME'S OWN SLOTS ARE STILL THERE. The extra is added, never a replacement.
  assert(count(asked, 'ride') >= 2, 'a ride slot went missing');
});

Deno.test('⛔⛔ AND THE HOURS ARE DIVIDED ACROSS THOSE DAYS, NOT TOPPED UP AFTER', () => {
  /**
   * ⛔ THE EXTRA DAY JOINS `enduranceSpecs` BEFORE THE SOLVE, so `sizeFor` sizes every session
   * including it. Bolting it on afterwards at its own cap is what made a three-hour ask build 2h39.
   */
  const asked = week(HIS, 3, 4, { run: 3, ride: 2 });
  const built = minutes(asked, 'run');
  assert(Math.abs(built - 180) <= 15, `three hours asked over three days built ${built} minutes`);
});

Deno.test('⛔⛔ A STATED DAY COUNT IS EXACT — the hours do not buy a day they did not ask for', () => {
  /**
   * ⛔ Their days are a fact about their week, not a starting point for the hours to argue with. Two
   * ride days and four hours is four hours across two rides — or, where the slots cannot hold it,
   * the honest miss through `sizeFor`'s verdict. It is never a third ride.
   */
  const asked = week(HIS, 3, 4, { run: 3, ride: 2 });
  assertEquals(count(asked, 'ride'), 2, 'the hours added a ride day the athlete did not ask for');
});

Deno.test('⛔ NO DAY COUNT LEAVES THE WEEK EXACTLY AS IT WAS', () => {
  /**
   * ⚠️ ABSENT IS NO OPINION. The hours-driven fill still works on its own terms — and it is sized at
   * the level-1 dose `easyFillHours` divides by, NOT at the dial, which would climb it to the
   * family's ceiling and build five hours of riding against a four-hour ask.
   */
  const none = week(HIS, 3, 4, null);
  assertEquals(count(none, 'run'), 2);
  const rideMin = minutes(none, 'ride');
  assert(rideMin <= 4 * 60 + 30, `an unasked week built ${rideMin} minutes of riding against a 4h ask`);
});

Deno.test('⛔ FEWER DAYS THAN THE FRAME HAS DROPS A SLOT — the count is exact in both directions', () => {
  /**
   * ⛔⛔ REVERSED 2026-08-30 BY MICHAEL'S RULING: *"user says hours and days and we make it work."*
   * Everything below the line is history.
   *
   * ⚠️ THIS TEST AND `compose.ts` CONTRADICTED EACH OTHER FOR FOUR DAYS. This one (2026-08-26) said
   * *"the day count is a FLOOR, not a cap"*; `easyFillFor`'s own comment (2026-08-27, one day later)
   * said *"A STATED DAY COUNT IS EXACT — IT IS A CAP AS WELL AS A FLOOR."* Only the growing half was
   * ever built, so asking for two runs against four run slots built four and said nothing.
   *
   * ⚠️⚠️ AND IT IS A SOURCE CONFLICT, NOT ONLY A PRODUCT ONE — flagged, not hidden. The old rule
   * cited p246 owning the four endurance slots, *"none can be declined"*. Honouring a smaller day
   * count declines one. That is Michael's call to make and he has made it; the citation is recorded
   * here so the next session knows the book was overruled deliberately rather than overlooked.
   *
   * ─────────────── history ───────────────
   * ⛔ p246 owns the four endurance slots and none can be declined (2026-08-26). Asking for one run
   * day when two slots are runs does not delete one — the day count is a FLOOR, not a cap.
   */
  const asked = week(HIS, 3, 4, { run: 1, ride: 2 });
  assertEquals(count(asked, 'run'), 1, 'the smaller day count was ignored and a frame slot survived');
  // ⛔ AND THE ONE THAT SURVIVES IS THE HARDEST/LONGEST — the easiest is what gets trimmed.
  assertEquals(count(asked, 'ride'), 2, 'the ride count moved when only the run ask should have');
});

Deno.test('⛔ ZERO IS AN ANSWER — a sport declined outright disappears', () => {
  // ⛔ 0 and absent are DIFFERENT STATES (2026-08-30). Absent leaves the frame's own runs alone;
  // a stated zero removes every one of them, long session included.
  const none = week(HIS, 3, 4, { run: 0, ride: 3 });
  assertEquals(count(none, 'run'), 0, 'a stated zero still built runs — zero read as "did not answer"');
  assertEquals(count(none, 'ride'), 3, 'the ride ask was not honoured exactly');
});
