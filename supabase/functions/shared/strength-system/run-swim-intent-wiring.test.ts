// THE RUN AND SWIM ASKS ARE ONE OBJECT NOW — THIS PINS WHAT THE MODULE'S OWN SUITE CANNOT SEE.
//
// Stage 4's outstanding half, 2026-08-22. `_shared/athlete-weekly-intent.test.ts` proves the
// ARITHMETIC is byte-identical to the four loose scalars it replaced. This file covers the places
// where the COMPOSER reads it and the suite did not notice a wrong read — both found by mutation,
// not by reasoning about the diff.
//
//   1. **The estimated-pace note.** `runIntent.paceSource` decides whether the plan admits it is
//      guessing at the athlete's easy pace. Reading `paceOrFallback` as though it were stated makes
//      the note vanish and the plan claim a number it invented. 580 tests passed with that mutation.
//   2. **The swim count.** `swimIntent.askedDays` is how many swims get booked. 580 tests passed with
//      it hardcoded to 1.
//
// ⚠️ A THIRD MUTATION SURVIVED AND IS RECORDED RATHER THAN PAPERED OVER — see the last comment block.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/run-swim-intent-wiring.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { FALLBACK_EASY_MIN_PER_MILE } from '../../_shared/athlete-weekly-intent.ts';

const BASE = {
  durationWeeks: 12,
  oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  fiveKPaceSecPerMi: 435,
  thresholdPaceSecPerMi: 455,
  ftpWatts: 240,
};
// deno-lint-ignore no-explicit-any
const build = (extra: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ ...BASE, ...extra } as never);
// deno-lint-ignore no-explicit-any
const week = (plan: any, w = 2): any[] => (plan.sessions_by_week?.[String(w)] ?? []) as any[];

const RUNNER = {
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 18, longRunDay: 'sunday',
};

Deno.test('⛔ THE PLAN ADMITS WHEN IT IS GUESSING THE EASY PACE — and stops once it is not', () => {
  // ⛔ `paceSource`, NOT `paceOrFallback`. The fallback is a real number and the arithmetic uses it;
  // whether it was OURS is a different fact, and collapsing the two makes the plan state an invented
  // pace as though the athlete had given it. That is the "score that lies" in copy form.
  const guessing = build(RUNNER);
  assert(
    /estimated at .*until we learn your easy pace/.test(String(guessing.volume_notes ?? '')),
    `an unlearned pace shipped with no admission: ${guessing.volume_notes ?? '(none)'}`,
  );
  assert(
    String(guessing.volume_notes).includes(`${FALLBACK_EASY_MIN_PER_MILE}:00/mi`),
    `the note names a pace the engine did not use: ${guessing.volume_notes}`,
  );
  const known = build({ ...RUNNER, easyPaceMinPerMile: 9 });
  assert(
    !/until we learn your easy pace/.test(String(known.volume_notes ?? '')),
    `an athlete with a known pace was told we were guessing: ${known.volume_notes}`,
  );
});

Deno.test('⛔ THE RUN DURATIONS USE THE STATED PACE, and the fallback only when there is none', () => {
  // The same miles at two paces must not build the same minutes — if they do, one of the two is
  // being ignored, which is how a typed number becomes decorative.
  const minutes = (plan: unknown) =>
    // deno-lint-ignore no-explicit-any
    week(plan as any).filter((s) => s.type === 'run').reduce((m, s) => m + Number(s.duration ?? 0), 0);
  const fast = minutes(build({ ...RUNNER, easyPaceMinPerMile: 7 }));
  const slow = minutes(build({ ...RUNNER, easyPaceMinPerMile: 12 }));
  assert(fast > 0 && slow > 0, 'the fixture stopped building runs');
  assert(slow > fast, `12:00/mi built no more minutes than 7:00/mi: ${slow} vs ${fast}`);
  // With no pace stated the week is built at the fallback, so it lands on the fallback's minutes.
  const guessed = minutes(build(RUNNER));
  const atFallback = minutes(build({ ...RUNNER, easyPaceMinPerMile: FALLBACK_EASY_MIN_PER_MILE }));
  assertEquals(guessed, atFallback, 'an unlearned pace did not build at the fallback');
});

Deno.test('⛔ THE SWIM BOOKS THE COUNT THE ATHLETE ASKED FOR (D-323 §5 — booked, not coached)', () => {
  const swims = (n: number) => {
    const light = { enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 8,
      longRunDay: 'sunday', easyPaceMinPerMile: 9, swimDays: n };
    return new Set(week(build(light)).filter((s) => s.type === 'swim').map((s) => String(s.day))).size;
  };
  assertEquals(swims(1), 1);
  // ⚠️ ASKED 3, BUILT 2 — and that is correct, not a shortfall. The swim takes days nothing else
  // wanted (it is emitted last, into the free days), so a full week caps it. What must never happen
  // is the count being ignored: 1, 2 and 3 must not all build the same number.
  assert(swims(3) > swims(1), `the swim count is not being read: 1 -> ${swims(1)}, 3 -> ${swims(3)}`);
  assertEquals(swims(0), 0, 'a block with no swim booked one anyway');
});

Deno.test('⛔ NO SWIM ASKED, NO SWIM BOOKED — there is no default and that is the standing decision', () => {
  const plan = build(RUNNER);
  assertEquals(week(plan).filter((s) => s.type === 'swim').length, 0);
  // ⚠️ THIS CANNOT CATCH A BROKEN `selected` GATE, and that is worth knowing rather than assuming.
  // Mutation 2026-08-22: replacing `if (swimIntent.selected)` with `if (true)` leaves this green,
  // because `askedDays` is 0 and `swimSessions(free, 0)` builds nothing. The gate is REDUNDANT with
  // the count — kept because it reads as the question being asked, not because it is load-bearing.
});

/**
 * ⚠️ A SURVIVING MUTATION, RECORDED RATHER THAN PAPERED OVER (2026-08-22).
 *
 * Making `weeklyRunHours` read `paceOrFallback` instead of the STATED pace leaves all 580 tests
 * green, and no test here closes it. That is not a weak suite — it is an equivalent mutant at the
 * plan level, and the measurement is the point:
 *
 * `weeklyRunHours` feeds `resolveEnduranceTier`, whose only consumer is the assistance rep band.
 * The mutation genuinely moves the TIER — 20 miles with no stated pace resolves `base` correctly
 * and `strength` under the mutant, because `hours == null` fails the `hours < 4` AND-gate — and the
 * composed plan is IDENTICAL either way: same movements, same sets, 20 assistance reps in week 2 in
 * both. The tier never reaches the plan output; it is an argument to `assistanceTotalReps`.
 *
 * ⛔ THE CODE IS STILL RIGHT AND MUST NOT BE "SIMPLIFIED" TO THE FALLBACK. §0h: unknown is *"we have
 * not asked"*, never *"they do nothing"* — and `resolveEnduranceTier`'s own comment says an unknown
 * cannot satisfy the strength AND-gate, because the full band is a claim that the week carries
 * almost no competing stress. Feeding it an invented number makes that claim on the athlete's behalf.
 *
 * ⚠️ WHAT WOULD CATCH IT is a test on the tier itself, and the tier is not exposed. Left as a
 * finding: `endurance-tier.test.ts` covers the resolver, and nothing covers what the composer feeds
 * it.
 */
