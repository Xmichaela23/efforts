/**
 * THE WEEK SOLVER — docs/SPEC-week-solver.md
 *
 * ⛔ THE REFUSAL IS TESTED FIRST, mirroring the build order. Michael, 2026-07-27: the fourth fate is
 * what gets deferred and never lands, because a solver appears to work without it right up until a
 * week is over-constrained — and then it subtracts, because subtracting is what a solver with no way
 * to say no does.
 *
 * ⛔ TESTS ENUMERATE THROUGH THE SOLVER, NOT THROUGH HAND-PICKED FIXTURES. Earlier today an
 * invariant test hand-picked heavy-day pairs `place-week` never produces and failed on one of them.
 * A test that asserts against states the engine cannot reach is testing an assumption. Where a
 * property must hold for all weeks, the test sweeps every anchor arrangement and asks the solver.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type Anchor,
  gapDays,
  type Lift,
  MAX_ACTIVE_DAYS_DEFAULT,
  solve,
  SOLVER_DAYS,
  type SolverDay,
} from './week-solver.ts';

const FOUR: Lift[] = [
  { name: 'Bench Press', isLower: false },
  { name: 'Back Squat', isLower: true },
  { name: 'Overhead Press', isLower: false },
  { name: 'Deadlift', isLower: true },
];

const anchor = (day: SolverDay, kind: any, label: string): Anchor => ({ day, kind, label });
const idx = (d: SolverDay) => SOLVER_DAYS.indexOf(d);

// ════════════════════════════════════════════════════════════════════════════
// THE FOURTH FATE — built first, tested first
// ════════════════════════════════════════════════════════════════════════════

Deno.test('REFUSAL: two anchors on one day the matrix forbids — named, not resolved', () => {
  const r = solve({
    anchors: [
      anchor('sunday', 'long_run', 'long run'),
      anchor('sunday', 'long_ride', 'long ride'),
    ],
    lifts: FOUR,
  });
  assertEquals(r.status, 'unsolvable');
  if (r.status !== 'unsolvable') return;
  assertEquals(r.code, 'SOLVER_GRIDLOCK_ANCHOR_COLLISION');
  assertEquals(r.bindingAnchors.length, 2, 'both anchors must be named, not one blamed');
  // §2.3 — the solver does not pick a winner and does not move one.
  assertEquals(r.options.length, 2, 'the athlete chooses which of their own two picks moves');
  assert(r.message.includes('long run') && r.message.includes('long ride'));
});

Deno.test('REFUSAL: more sessions than days — states the arithmetic, never drops a lift', () => {
  // ⚠️ SIX anchors. Five plus four lifts is nine sessions and it FITS — two upper lifts stack onto
  // two endurance days for seven active days. The first version of this test asserted a refusal on
  // that shape, and it was the test that was wrong, not the solver: the ceiling is sessions minus
  // stacking capacity, not sessions. Ten sessions with a capacity of two needs eight days.
  const r = solve({
    anchors: [
      anchor('monday', 'quality_run', 'club run'),
      anchor('tuesday', 'quality_bike', 'club ride'),
      anchor('wednesday', 'easy_swim', 'masters swim'),
      anchor('thursday', 'quality_swim', 'squad swim'),
      anchor('saturday', 'long_ride', 'long ride'),
      anchor('sunday', 'long_run', 'long run'),
    ],
    lifts: FOUR,
  });
  assertEquals(r.status, 'unsolvable');
  if (r.status !== 'unsolvable') return;
  assertEquals(r.code, 'SOLVER_GRIDLOCK_NO_ROOM');
  assert(r.message.includes('10 sessions'), `the arithmetic is not stated: ${r.message}`);
  // ⛔ §5.2b — "drop a session" is not on the menu and must never appear on it.
  for (const o of r.options) {
    assert(!/drop|remove|delete/i.test(o), `the refusal offered to subtract: "${o}"`);
  }
});

Deno.test('⛔ NO REFUSAL ANYWHERE EVER OFFERS TO REMOVE A SESSION — swept, not spot-checked', () => {
  // §5.2b is the class three shipped modules each fell into, each outside the menu. This sweeps
  // every refusal the solver can produce across every anchor arrangement and checks the menu holds.
  let refusals = 0;
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      for (const hardD of SOLVER_DAYS) {
        const r = solve({
          anchors: [
            anchor(runD, 'long_run', 'long run'),
            anchor(rideD, 'long_ride', 'long ride'),
            anchor(hardD, 'quality_run', 'hard run'),
          ],
          lifts: FOUR,
        });
        if (r.status !== 'unsolvable') continue;
        refusals++;
        assert(r.options.length > 0, 'a refusal with no options is the silence §5.2 exists to prevent');
        assert(r.bindingAnchors.length > 0, 'a refusal must name what bound it');
        for (const o of r.options) {
          assert(!/drop|remove|delete/i.test(o), `${runD}/${rideD}/${hardD} offered to subtract: "${o}"`);
        }
      }
    }
  }
  assert(refusals > 0, 'the sweep produced no refusals at all — it is not exercising the fourth fate');
});

// ════════════════════════════════════════════════════════════════════════════
// THE HARD CONSTRAINTS — swept across every anchor arrangement
// ════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ THE ANCHOR PIN IS HONOURED, on every week the solver returns', () => {
  // This is §6b-1 X1 — the defect `base-generator` has, asserted as a property rather than a case.
  // The athlete states a day; the engine returns that day or refuses. It never returns another one.
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      if (rideD === runD) continue;
      const anchors = [anchor(runD, 'long_run', 'long run'), anchor(rideD, 'long_ride', 'long ride')];
      const r = solve({ anchors, lifts: FOUR });
      if (r.status === 'unsolvable') continue;
      // No lift may occupy an anchor day illegally, and the anchor days themselves are untouched:
      // the solver has no mechanism to move one, which is the point of the type.
      assertEquals(anchors[0].day, runD);
      assertEquals(anchors[1].day, rideD);
      assert(r.week.activeDays.includes(runD), `long run day ${runD} is not in the active week`);
      assert(r.week.activeDays.includes(rideD), `long ride day ${rideD} is not in the active week`);
    }
  }
});

Deno.test('⛔ THE 48h CELL HOLDS: heavy legs never within 48h of the long run, on any solved week', () => {
  let checked = 0;
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      if (rideD === runD) continue;
      const r = solve({
        anchors: [anchor(runD, 'long_run', 'long run'), anchor(rideD, 'long_ride', 'long ride')],
        lifts: FOUR,
      });
      if (r.status !== 'solved') continue; // compromised weeks are allowed to breach, and they SAY so
      for (const l of r.week.lifts.filter((x) => x.isLower)) {
        assert(
          gapDays(idx(l.day), idx(runD)) * 24 >= 48,
          `${l.lift} on ${l.day} is ${gapDays(idx(l.day), idx(runD)) * 24}h from the long run on ${runD}`,
        );
        checked++;
      }
    }
  }
  assert(checked > 0, 'no solved weeks were produced — the sweep is not exercising anything');
});

Deno.test('⛔ A BREACH IS ALWAYS NAMED — a compromised week never hides what it cost', () => {
  // ⚠️ FIVE anchors, not three. The three-anchor sweep produces only `solved` and `unsolvable` — a
  // stack always buys the rest day back and there is enough room to avoid every breach. Asserting
  // against a shape that cannot reach the state under test is the fixture mistake this file's header
  // is about, so the sweep moved to a shape that genuinely compromises. Verified: 61 solved,
  // 19 compromised, 263 refused.
  let compromised = 0;
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      for (const hardD of SOLVER_DAYS) {
        const r = solve({
          anchors: [
            anchor(runD, 'long_run', 'long run'),
            anchor(rideD, 'long_ride', 'long ride'),
            anchor(hardD, 'quality_run', 'hard run'),
            anchor('wednesday', 'quality_bike', 'club ride'),
            anchor('friday', 'easy_swim', 'masters swim'),
          ],
          lifts: FOUR,
        });
        if (r.status !== 'compromised') continue;
        compromised++;
        assert(r.compromises.length > 0, 'status is compromised with an empty list');
        for (const c of r.compromises) {
          assert(c.length > 25, `a compromise line that says nothing: "${c}"`);
        }
      }
    }
  }
  assert(compromised > 0, 'the sweep produced no compromised weeks');
});

Deno.test('⛔ EVERY LIFT KEEPS A DAY. The solver never returns fewer than it was given (§5.2b)', () => {
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      if (rideD === runD) continue;
      const r = solve({
        anchors: [anchor(runD, 'long_run', 'long run'), anchor(rideD, 'long_ride', 'long ride')],
        lifts: FOUR,
      });
      if (r.status === 'unsolvable') continue;
      assertEquals(r.week.lifts.length, FOUR.length, `${runD}/${rideD} returned fewer lifts than asked`);
      assertEquals(new Set(r.week.lifts.map((l) => l.day)).size, FOUR.length, 'two lifts share a day');
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DETERMINISM (§5.1)
// ════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ INPUT ORDER MUST NOT LEAK: the same lifts listed differently give the same week', () => {
  // ⛔ THE FAILURE THIS CATCHES IS INVISIBLE OTHERWISE. §5.1's tie-break is a lexicographic key over
  // day indices, and the first draft built that vector in INPUT order — so the same athlete with the
  // same anchors, whose lift list arrived in a different order, scored differently and got a
  // different week. Re-materialize and regeneration both rebuild that list, so this is exactly the
  // "plan reshuffles for no reason and nothing can explain it" failure §5.1 exists to prevent.
  const shuffles: Lift[][] = [
    [FOUR[0], FOUR[1], FOUR[2], FOUR[3]],
    [FOUR[3], FOUR[2], FOUR[1], FOUR[0]],
    [FOUR[1], FOUR[3], FOUR[0], FOUR[2]],
    [FOUR[2], FOUR[0], FOUR[3], FOUR[1]],
  ];
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      if (rideD === runD) continue;
      const anchors = [anchor(runD, 'long_run', 'long run'), anchor(rideD, 'long_ride', 'long ride')];
      // Compare lift→day as a SET, since the output list follows input order by design.
      const dayFor = (ls: Lift[]) => {
        const r = solve({ anchors, lifts: ls });
        if (r.status === 'unsolvable') return `unsolvable:${r.code}`;
        return r.week.lifts
          .map((l) => `${l.lift}=${l.day}`)
          .sort()
          .join(',') + `|rest:${r.week.restDays.join('/')}`;
      };
      const first = dayFor(shuffles[0]);
      for (let i = 1; i < shuffles.length; i++) {
        assertEquals(
          dayFor(shuffles[i]), first,
          `${runD}/${rideD}: shuffling the lift list changed the week — input order leaked into the key`,
        );
      }
    }
  }
});

Deno.test('⛔ SAME INPUT, SAME WEEK — every arrangement, ten runs each', () => {
  for (const runD of SOLVER_DAYS) {
    for (const rideD of SOLVER_DAYS) {
      if (rideD === runD) continue;
      const build = () => JSON.stringify(
        solve({
          anchors: [anchor(runD, 'long_run', 'long run'), anchor(rideD, 'long_ride', 'long ride')],
          lifts: FOUR,
        }),
      );
      const first = build();
      for (let i = 0; i < 10; i++) {
        assertEquals(build(), first, `${runD}/${rideD} produced a different week on run ${i + 1}`);
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// §4.1a — a methodology constraint must be OWNED
// ════════════════════════════════════════════════════════════════════════════

Deno.test('a methodology constraint is honoured, and it is stricter than the law on purpose', () => {
  // Daniels' polarisation: no strength on quality days, even though the law permits upper there.
  const r = solve({
    anchors: [
      anchor('sunday', 'long_run', 'long run'),
      anchor('tuesday', 'quality_run', 'intervals'),
    ],
    lifts: FOUR,
    methodology: {
      owner: 'jack_daniels_performance',
      reason: 'polarisation — Tue/Thu are true quality days and stay untouched',
      forbidsKindOnDay: (_kind, day) => day === 'tuesday',
    },
  });
  if (r.status === 'unsolvable') return; // a legitimate outcome; the refusal tests cover it
  for (const l of r.week.lifts) {
    assert(l.day !== 'tuesday', `${l.lift} landed on the quality day the methodology declined`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// The shape of an ordinary week
// ════════════════════════════════════════════════════════════════════════════

Deno.test('the classic hybrid week: Sat ride, Sun run, four lifts, one rest day', () => {
  const r = solve({
    anchors: [anchor('saturday', 'long_ride', 'long ride'), anchor('sunday', 'long_run', 'long run')],
    lifts: FOUR,
  });
  assertEquals(r.status, 'solved');
  if (r.status === 'unsolvable') return;
  assertEquals(r.week.restDays.length, 1, 'six working days, one full rest day');
  assertEquals(r.week.activeDays.length, MAX_ACTIVE_DAYS_DEFAULT);
  const lower = r.week.lifts.filter((l) => l.isLower).map((l) => idx(l.day));
  assert(gapDays(lower[0], lower[1]) * 24 >= 48, 'heavy legs are not held apart');
});
