// DOES THE APP STILL SAY WHEN IT HAD TO COMPROMISE (stage 6, 2026-08-22 — the last stage).
//
// ⛔ THE WORK ORDER'S PREMISE WAS WRONG AND STAGE 5 MEASURED IT. It said the compromise channel is
// silent, 61 of 61. That is true of the SWEEP and false of the SPACE: 10,080 of 10,976 hand-built
// shapes carried a compromise. The breach half is loud and correct. Only two notes had never been
// seen fire, and they turned out to be different problems:
//
//   • THE NO-REST-DAY NOTE WAS BROKEN. Across 37,632 shapes, 25,088 built a week with no rest day at
//     all and the note stayed silent on every single one. Fixed here; the tests below are the pin.
//   • THE RIDE-SHORTFALL NOTE IS QUIET BECAUSE THERE IS NOTHING TO SAY. Measured across 10,584
//     crowded shapes: the athlete gets every ride day they asked for, every time. The note is kept
//     as the alarm, and what is tested is the INVARIANT it guards.
//
// ⚠️ THE SWEEP CANNOT SEE ANY OF THIS. All 61 of its shapes keep a rest day and build every ride
// asked for, which is why 61 green shapes said nothing for months. Build from the space, not the
// sweep.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/compromise-channel.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { voiceViolation } from '../../_shared/state-trend/week-accent.ts';

const BASE = {
  durationWeeks: 12,
  oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  fiveKPaceSecPerMi: 435,
  thresholdPaceSecPerMi: 455,
  ftpWatts: 240,
  easyPaceMinPerMile: 9,
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LOWER = DAYS.map((d) => d.toLowerCase());

// deno-lint-ignore no-explicit-any
const build = (extra: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ ...BASE, ...extra } as never);
// deno-lint-ignore no-explicit-any
const week1 = (plan: any): any[] => (plan.sessions_by_week?.['1'] ?? []) as any[];
// deno-lint-ignore no-explicit-any
const restDays = (plan: any): string[] => {
  const worked = new Set(week1(plan).map((s) => String(s.day)));
  return DAYS.filter((d) => !worked.has(d));
};
// deno-lint-ignore no-explicit-any
const notes = (plan: any): string[] =>
  ((plan.placement_compromises ?? []) as Array<{ text: string }>).map((c) => c.text);
const REST_NOTE = /there is no full rest day/;
const SHORTFALL = /the week had room for/;

// ── THE NO-REST-DAY NOTE ────────────────────────────────────────────────────────────────────────

Deno.test('⛔ A WEEK WITH NO REST DAY SAYS SO — and it is asked of the WEEK, not of a list', () => {
  // ⛔ THE DEFECT: the check read `new Set([...strengthDays, pickedLong, ...easyRunDays, ...rideDays])`
  // — a hand-listed subset of where sessions come from. It could not see a swim day or a hard day, so
  // a week whose seventh square carried either counted that square as empty.
  let zeroRest = 0;
  let said = 0;
  let checked = 0;
  for (const longRun of LOWER) {
    for (const swim of [0, 2, 4]) {
      for (const runs of [3, 4]) {
        checked++;
        const plan = build({
          enduranceSport: 'run', enduranceFrequency: runs, targetWeeklyMiles: 30,
          longRunDay: longRun, swimDays: swim,
        });
        if (restDays(plan).length > 0) continue;
        zeroRest++;
        if (notes(plan).some((t) => REST_NOTE.test(t))) said++;
      }
    }
  }
  assert(zeroRest > 0, `the fixture space no longer produces a full week — ${checked} shapes, none full`);
  assertEquals(said, zeroRest, `${zeroRest - said} of ${zeroRest} full weeks said nothing about the rest day`);
});

Deno.test('⛔ A RUNNER WITH NO BIKE IS TOLD TOO — the check used to live inside the ride pass', () => {
  // ⛔ THE SECOND HALF OF THE SAME DEFECT. The whole block sat inside `if (rideIntent.declared)`, so
  // an athlete who kept no bike could fill all seven days and never hear about it. Nothing about a
  // rest day is a cycling question.
  const plan = build({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 30,
    longRunDay: 'monday', swimDays: 2,
  });
  assertEquals(restDays(plan).length, 0, 'the fixture stopped filling the week');
  assert(!week1(plan).some((s) => s.type === 'ride'), 'the fixture grew a bike');
  assert(
    notes(plan).some((t) => REST_NOTE.test(t)),
    `a bike-less full week said nothing: ${notes(plan).join(' | ') || '(nothing at all)'}`,
  );
});

Deno.test('⛔ A SWIM ON THE LAST DAY IS A SESSION — the exact square the old check called empty', () => {
  // ⚠️ THE MEASURED MISS was mostly a Sunday swim: six days of work, a swim on the seventh, and a
  // note that counted the seventh as free because swim was not on its list.
  const plan = build({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 30,
    longRunDay: 'monday', swimDays: 2,
  });
  const swimDays = week1(plan).filter((s) => s.type === 'swim').map((s) => String(s.day));
  assert(swimDays.length > 0, 'the fixture stopped carrying a swim');
  // Every swim day carries nothing else — so it is the swim alone holding that square open or shut.
  const soleSwimDay = swimDays.find((d) => week1(plan).filter((s) => String(s.day) === d).length === 1);
  assert(soleSwimDay, 'no day is held by the swim alone any more — the case this pins is gone');
  assert(notes(plan).some((t) => REST_NOTE.test(t)), 'the swim-held day was counted as a rest day');
});

Deno.test('a week WITH a rest day says nothing — silence is correct when nothing was traded', () => {
  const plan = build({
    enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 12,
    longRunDay: 'sunday', swimDays: 0,
  });
  assert(restDays(plan).length > 0, 'the fixture stopped leaving a rest day');
  assert(
    !notes(plan).some((t) => REST_NOTE.test(t)),
    `a week with a rest day claimed it had none: ${notes(plan).join(' | ')}`,
  );
});

Deno.test('⛔ THE COUNTS COME OFF THE WEEK, NOT OFF THE ASK — and the voice holds', () => {
  // ⚠️ The sentence this replaced read "Your N ride days and M run days fill all seven" using the
  // REQUESTED numbers, so on the day it did fire it could have named a count the calendar did not
  // show. And it named two disciplines out of four, which is the same blindness one layer up.
  const plan = build({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 30,
    longRunDay: 'monday', swimDays: 2,
  });
  const note = notes(plan).find((t) => REST_NOTE.test(t))!;
  const built = (t: string) => new Set(week1(plan).filter((s) => s.type === t).map((s) => s.day)).size;
  for (const [type, word] of [['run', 'running'], ['swim', 'swimming'], ['strength', 'lifting']] as const) {
    const n = built(type);
    if (n === 0) continue;
    assert(note.includes(`${n} ${word}`), `the note does not name ${n} ${word}: ${note}`);
  }
  // ⛔ A quant who trains, not a coach who encourages — the same hard check every emitted line takes.
  assertEquals(voiceViolation(note), null, `voice violation: ${note}`);
});

// ── THE RIDE-SHORTFALL NOTE ─────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE INVARIANT THE SHORTFALL NOTE GUARDS — every ride day asked for is built', () => {
  /**
   * ⛔ THIS IS WHY THE NOTE IS QUIET, AND IT IS THE RIGHT KIND OF QUIET. Measured across 10,584
   * crowded shapes: the athlete gets every ride day they asked for, every time, so there is no
   * shortfall to report. On 2026-08-19 this note fired on 27 of 61 sweep shapes and **every one was
   * false** — it compared a list that excluded the hard ride against an ask that included it
   * (`76e66f4a`). Silence is that fix working.
   *
   * ⛔ THE NOTE IS KEPT, NOT DELETED, AND THIS TEST IS THE REASON. The collapse it guards — two easy
   * rides placed on ONE day, so `rideDays` dedupes and the athlete silently gets fewer — IS
   * reachable in the resolver: 1,050 of 38,416 over-subscribed adapter shapes produce it. It is
   * unreachable from HERE only because `easyWanted` caps the flexible ride count low enough that the
   * solver always finds distinct days. ⚠️ Raise the ride ceiling past 4, or stop subtracting the hard
   * ride, and the collapse comes back. This test is what would notice, and the note is what would
   * tell the athlete.
   *
   * ⛔ AND THE NOTE IS PROVEN LIVE, NOT ASSUMED. Mutation, 2026-08-22: capping the ride fill loop at
   * two days made a 4-ride week build 2 — and the plan came back carrying *"You asked for 4 ride
   * days; the week had room for 2 once the lifting and your fixed days were placed."* The guard is
   * wired; it simply has nothing to report. That is the distinction stage 6 existed to draw, and it
   * is the opposite of the no-rest-day note, which was silent because it was broken.
   */
  let checked = 0;
  for (const longRide of LOWER) {
    for (const rides of [2, 3, 4]) {
      for (const swim of [0, 4]) {
        const plan = build({
          enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 25,
          longRunDay: 'sunday', bike: { hours: 8, days: rides, longRideDay: longRide },
          swimDays: swim,
        });
        const built = new Set(week1(plan).filter((s) => s.type === 'ride').map((s) => String(s.day))).size;
        assertEquals(
          built, rides,
          `asked ${rides} ride days, built ${built} (longRide=${longRide} swim=${swim})`,
        );
        // And with nothing lost, nothing is claimed.
        assert(
          !notes(plan).some((t) => SHORTFALL.test(t)),
          `a complete week reported a shortfall: ${notes(plan).find((t) => SHORTFALL.test(t))}`,
        );
        checked++;
      }
    }
  }
  assertEquals(checked, LOWER.length * 3 * 2);
  assertEquals(checked, 42);
});
