/**
 * ⛔ STRONG FOCUS CLUSTERED ITS EASY RUNS AND RIDES (2026-08-08). Michael, on the block.
 *
 * The cause was pass order, and the file had already written it down without acting on it: the
 * lifts were solved first, a run pass then took whatever days were left IN CALENDAR ORDER, and a
 * ride pass ran a thousand lines later — inside the week loop — filling around what the runs had
 * taken. Nothing ever compared a run day with a ride day, so the week came out in blocks. The
 * run/ride "alternator" added on top was a patch on the symptom, and it only ran when the athlete
 * kept both disciplines.
 *
 * The easy sessions are now `flexible` input to the SAME `solve()` call that places the bar, so one
 * scorer sees the whole week: anchors, lifts and loose endurance together.
 *
 * ⚠️ WHAT IS ASSERTED, AND WHAT DELIBERATELY IS NOT. "Never adjacent" is not a law — the clearance
 * table rates `easy_run × easy_run` at 0h on purpose (*"Easy rows are free by definition"*). It is a
 * SHAPE preference. Every case below is one the week CAN honour, and each is asserted absolutely;
 * see the note on `activeDays` for why the "the week was full" escape hatch was removed rather than
 * kept, and which shape genuinely cannot honour it.
 *
 * Run:
 *   deno test --no-check --allow-all \
 *     supabase/functions/shared/strength-system/easy-session-spread.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

// ⛔ WEEK 2, NOT WEEK 1 (2026-08-15, work order §1c). Week 1 of a Strong Focus block is now a
// standalone TM-TEST week — light band, no hard endurance session, trimmed easy volume — so it is
// no longer the representative working week these assertions want. Week 2 is cycle 1's first
// leader week and is the shape week 1 used to be.
const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };

type S = { day: string; name: string; type: string };

const week1 = (cfg: Record<string, unknown>): S[] =>
  ((composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240, easyPaceMinPerMile: 10, ...cfg,
  } as never) as unknown as { sessions_by_week: Record<string, S[]> }).sessions_by_week['2'] ?? []);

const isLower = (s: S) => s.type === 'strength' && /Back Squat|Deadlift/.test(s.name);
const isLongRun = (s: S) => s.type === 'run' && /Long/.test(s.name);
// ⚠️ `Threshold` ADDED 2026-08-17. The first prescribed hard run is a THRESHOLD run now — VO2/hills
// unlock only on a second — so a matcher that named only the VO2 session stopped seeing the hard day
// at all and reported the athlete's pin as moved. A stale matcher, not a moved pin.
const isHardRun = (s: S) => s.type === 'run' && /Hill|Interval|Hard|Tempo|Threshold/.test(s.name);
const isEasyRun = (s: S) => s.type === 'run' && !isLongRun(s) && !isHardRun(s);
const isLongRide = (s: S) => s.type === 'ride' && /Long/.test(s.name);
const isEasyRide = (s: S) => s.type === 'ride' && !isLongRide(s);

/** Circular day gap — a training week repeats, so Sunday and Monday are one day apart. */
const gap = (a: string, b: string) => {
  const r = Math.abs(ORDER.indexOf(a) - ORDER.indexOf(b));
  return Math.min(r, 7 - r);
};
/** Pairs of same-kind easy sessions on the same or adjacent days. */
const clusteredPairs = (w: S[], pick: (s: S) => boolean): string[] => {
  const days = [...new Set(w.filter(pick).map((s) => s.day))];
  const out: string[] = [];
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      if (gap(days[i], days[j]) <= 1) out.push(`${days[i]}+${days[j]}`);
    }
  }
  return out;
};
const activeDays = (w: S[]) => new Set(w.map((s) => s.day)).size;
/**
 * ⛔ THERE IS NO "THE WEEK WAS FULL" ESCAPE HATCH IN THESE CASES, AND THE FIRST DRAFT HAD ONE.
 *
 * It skipped any week at six active days on the theory that a full week must be allowed to cluster.
 * That theory is false and the fixture itself disproves it: every case below runs at six active days
 * AND comes out with zero adjacent pairs, because stacking an easy session onto a lift day is legal
 * and is what buys the spread. The gate would have passed the OLD composer too — it did, on the
 * first red check — which makes it a test that cannot see the bug it was written for.
 *
 * ⚠️ A genuinely over-subscribed week (four lifts + long run + two easy runs + THREE rides = ten
 * sessions in six days) does force one adjacency. That shape is deliberately not in `CASES`: it
 * would need the assertion relaxed, and a relaxed assertion here is what hid the defect.
 */

const CASES: Array<[string, Record<string, unknown>]> = [
  ['run 3d · long Sun · hard Thu', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13, longRunDay: 'sunday', hardDays: [{ day: 'thursday', discipline: 'run' }] }],
  ['run 4d · long Sun', { enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 20, longRunDay: 'sunday' }],
  ['run 3d · long Sat', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 15, longRunDay: 'saturday' }],
  ['run 3d · long Wed', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 15, longRunDay: 'wednesday' }],
  ['run 3d · unpinned', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 15 }],
  ['run 3d + bike 2d', { enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13, longRunDay: 'sunday', bike: { hours: 3, days: 2 } }],
  ['bike only 3d', { enduranceSport: 'bike', bike: { hours: 4, days: 3 } }],
  ['bike only 2d · long ride Sat', { enduranceSport: 'bike', bike: { hours: 3, days: 2, longRideDay: 'saturday' } }],
];

// ── The bug ──────────────────────────────────────────────────────────────────────────────────

for (const [label, cfg] of CASES) {
  Deno.test(`⛔ ${label} — easy runs are not clustered`, () => {
    const w = week1(cfg);
    assertEquals(clusteredPairs(w, isEasyRun), [], `${label}: easy runs on the same/adjacent days`);
  });

  Deno.test(`⛔ ${label} — easy rides are not clustered`, () => {
    const w = week1(cfg);
    assertEquals(clusteredPairs(w, isEasyRide), [], `${label}: easy rides on the same/adjacent days`);
  });
}

// ── The rules that must survive the reroute ──────────────────────────────────────────────────

Deno.test('⛔ NO LOWER LIFT ON A LONG DAY — AND ON A HARD DAY IT IS NOW THE POINT (inverted 2026-08-17)', () => {
  // ⛔ THIS TEST USED TO FORBID BOTH, AND HALF OF IT ENCODED THE SEPARATION LAW THAT CONSOLIDATION
  // REPLACED. Michael's law: heavy lower work and hard cardio SHARE a day deliberately — squat with
  // the hard run, deadlift with the hard ride, barbell first, six hours apart — so a squat on the
  // hard day is the arrangement working, not a breach. What survives unchanged is the LONG day:
  // zero heavy lower lifting on a long run or a long ride, and 48h clear of one either side.
  for (const [label, cfg] of CASES) {
    const w = week1(cfg);
    const longDays = new Set(w.filter((s) => isLongRun(s) || isLongRide(s)).map((s) => s.day));
    for (const s of w.filter(isLower)) {
      assert(!longDays.has(s.day), `${label}: ${s.name} on ${s.day}, a LONG day`);
    }
  }
});

Deno.test('⛔ a LOWER lift keeps its 48h from the long run', () => {
  for (const [label, cfg] of CASES) {
    const w = week1(cfg);
    const long = w.find(isLongRun)?.day;
    if (!long) continue;
    for (const s of w.filter(isLower)) {
      assert(gap(s.day, long) >= 2, `${label}: ${s.name} on ${s.day} is ${gap(s.day, long)}d from the long run`);
    }
  }
});

/**
 * ⛔⛔ DELETED 2026-08-17, MICHAEL'S RULING — AND THE DELETION IS RECORDED SO IT IS NOT REDISCOVERED
 * AS A GAP. The test here asserted that no easy run lands the morning after the long run when the
 * week has room, and the old engine scored against that day.
 *
 * **His answer: an easy Zone 1/2 run the morning after a long run is a standard shakeout.** There is
 * nothing to protect, so there is nothing to assert. ⛔ Do not reintroduce it — it survived the
 * engine swap as a deliberately-carried preference precisely so it could be ruled on, and it was.
 */

Deno.test('⛔ the athlete\'s anchors are never moved', () => {
  const w = week1({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13,
    longRunDay: 'wednesday', hardDays: [{ day: 'saturday', discipline: 'run' }],
    bike: { hours: 3, days: 2, longRideDay: 'monday' },
  });
  assertEquals(w.find(isLongRun)?.day, 'Wednesday', 'the long-run pin moved');
  assertEquals(w.find(isHardRun)?.day, 'Saturday', 'the hard-day pin moved');
  assertEquals(w.find(isLongRide)?.day, 'Monday', 'the long-ride pin moved');
});

Deno.test('⛔ one rest day survives every shape', () => {
  for (const [label, cfg] of CASES) {
    const w = week1(cfg);
    assert(activeDays(w) <= 6, `${label}: ${activeDays(w)} active days — no rest day left`);
  }
});

Deno.test('the session COUNTS are unchanged — the solver was given placement, not dosing', () => {
  // 3 run days = 1 long + 2 easy; the hard day consumes one of them when it is a run.
  const a = week1({ enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 15, longRunDay: 'sunday' });
  assertEquals(a.filter((s) => s.type === 'run').length, 3);
  const b = week1({ enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13, longRunDay: 'sunday', hardDays: [{ day: 'thursday', discipline: 'run' }] });
  assertEquals(b.filter((s) => s.type === 'run').length, 3);
  const c = week1({ enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13, longRunDay: 'sunday', bike: { hours: 3, days: 2 } });
  assertEquals(c.filter((s) => s.type === 'ride').length, 2);
});

Deno.test('⛔ a bike-primary block asks for NO easy runs', () => {
  // The phantom that skewed the ride spread: `runFreq` defaults for every sport, so a bike block was
  // asking the solver to seat an easy run nothing downstream authors. It occupied a day anyway.
  const w = week1({ enduranceSport: 'bike', bike: { hours: 4, days: 3 } });
  assertEquals(w.filter((s) => s.type === 'run').length, 0, 'a bike-primary week authored a run');
});

Deno.test('⛔ Q-215 SURVIVES — a clean upper day is preferred over a heavy-leg day on a tie', () => {
  const w = week1({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13,
    longRunDay: 'sunday', hardDays: [{ day: 'thursday', discipline: 'run' }],
  });
  const easy = w.filter(isEasyRun).map((s) => s.day);
  const heavy = w.filter(isLower).map((s) => s.day);
  const upper = w.filter((s) => s.type === 'strength' && !isLower(s)).map((s) => s.day);
  for (const d of easy) {
    if (!heavy.includes(d)) continue;
    const upperFree = upper.filter((u) => !easy.includes(u));
    assertEquals(upperFree.length, 0, `easy run took ${d} (heavy legs) while ${upperFree.join('/')} were free`);
  }
});


// ═══ THE FLOW SETS THE WEEK — every pick is built exactly (2026-08-08) ══════════════════════
//
// ⛔ TWO MODELS DIED TO GET HERE AND BOTH ARE WORTH REMEMBERING.
//   1. `enduranceSport` was a single value doing two jobs — naming the leader AND deciding which
//      sports existed — so a bike-led block authored ZERO runs and the athlete's miles vanished.
//   2. The fix for (1) inferred priority from volume and CAPPED the other sport at ~2 sessions.
//      That fixed the drop and then kept going: it re-decided questions the wizard had already
//      asked. Michael: *"the flow sets everything, not inference."*
//
// What is asserted now is the contract, not a policy: the picked counts, the typed volumes, one
// hard session on the picked day, and nothing capped, inferred or dropped.

const runsIn = (w: S[]) => w.filter((x) => x.type === 'run');
const ridesIn = (w: S[]) => w.filter((x) => x.type === 'ride');
const minutesOf = (w: S[], type: string) =>
  w.filter((x) => x.type === type).reduce((n, x) => n + x.duration, 0);
// ⚠️ `Threshold` ADDED 2026-08-17 — a single hard ride is a THRESHOLD ride now, not the Helgerud
// 4 × 4. A matcher naming only the VO2 session stopped seeing the hard day at all.
const isHardRide = (s: S) => s.type === 'ride' && /Interval|Threshold/i.test(s.name);

/** The athlete's verification case: 3 runs + 2 rides, hard day = run. */
const FLOW = {
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 21, easyPaceMinPerMile: 9,
  longRunDay: 'sunday', hardDays: [{ day: 'thursday', discipline: 'run' }],
  bike: { hours: 3, days: 2, longRideDay: 'saturday' },
};

Deno.test('⛔ EXACTLY ONE hard endurance session, on the day they picked', () => {
  const w = week1(FLOW);
  const hard = [...w.filter(isHardRun), ...w.filter(isHardRide)];
  assertEquals(hard.length, 1, `${hard.length} hard endurance sessions: ${hard.map((x) => x.name).join(', ')}`);
  assertEquals(hard[0].day, 'Thursday', 'the hard session left the day they picked');
  assertEquals(hard[0].type, 'run', 'they picked a hard RUN and got something else');
});

Deno.test('⛔ every other run and ride is EASY', () => {
  const w = week1(FLOW);
  const notEasy = [...runsIn(w), ...ridesIn(w)]
    .filter((s) => s.day !== 'Thursday' && !isLongRun(s) && !isLongRide(s))
    .filter((s) => isHardRun(s) || isHardRide(s));
  assertEquals(notEasy, [], `a second hard session slipped in: ${notEasy.map((x) => `${x.day}:${x.name}`).join(', ')}`);
});

Deno.test('⛔ the picked COUNTS are built exactly — never capped', () => {
  const w = week1(FLOW);
  assertEquals(runsIn(w).length, 3, 'the picked run count was not built');
  assertEquals(ridesIn(w).length, 2, 'the picked ride count was not built');
});

Deno.test('⛔ the typed VOLUMES are built exactly — never reduced', () => {
  const w = week1(FLOW);
  const runMin = minutesOf(w, 'run');
  assert(Math.abs(runMin - 21 * 9) <= 6, `asked ${21 * 9} min of running, built ${runMin}`);
  const rideMin = minutesOf(w, 'ride');
  assert(Math.abs(rideMin - 180) <= 6, `asked 180 min of riding, built ${rideMin}`);
});

Deno.test('⛔ CASE 2 — a bike-shaped block still carries the runs the athlete selected', () => {
  // The original defect: `enduranceSport: 'bike'` authored no runs at all.
  const w = week1({
    enduranceSport: 'bike', enduranceFrequency: 2, targetWeeklyMiles: 12, easyPaceMinPerMile: 10.5,
    bike: { hours: 5.5, days: 3, longRideDay: 'saturday' },
  });
  assertEquals(runsIn(w).length, 2, 'the selected runs were dropped or re-counted');
  assertEquals(ridesIn(w).length, 3, 'the picked ride count was not built');
});

Deno.test('⛔ NOTHING IS CAPPED when both sports are asked for in full', () => {
  // 4 runs and 3 rides is the top of both pickers. Under the retired inference model one of them
  // would have been cut to two; under the flow both are built.
  const w = week1({
    enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 30, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', bike: { hours: 5, days: 3, longRideDay: 'wednesday' },
  });
  assertEquals(runsIn(w).length, 4, 'a picked run was cut');
  assertEquals(ridesIn(w).length, 3, 'a picked ride was cut');
});

Deno.test('⛔ which sport is NAMED does not change what is built', () => {
  // Identical picks, opposite `enduranceSport`. Under the inference model these diverged.
  const asRun = week1({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 15, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', bike: { hours: 4, days: 2 },
  });
  const asBike = week1({
    enduranceSport: 'bike', enduranceFrequency: 3, targetWeeklyMiles: 15, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', bike: { hours: 4, days: 2 },
  });
  assertEquals(runsIn(asRun).length, runsIn(asBike).length, 'the run count moved with the sport field');
  assertEquals(ridesIn(asRun).length, ridesIn(asBike).length, 'the ride count moved with the sport field');
});

Deno.test('a sport nobody selected is never invented', () => {
  // `enduranceFrequency` arrives with a DEFAULT of 2 from create-goal, so it cannot imply selection.
  const w = week1({ enduranceSport: 'bike', enduranceFrequency: 3, bike: { hours: 6, days: 3 } });
  assertEquals(runsIn(w).length, 0, 'a bike-only block invented a run');
});

Deno.test('⛔ a hard RIDE pick is honoured too — one hard session, on the bike', () => {
  const w = week1({
    enduranceSport: 'bike', bike: { hours: 5, days: 3, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'bike' }],
  });
  const hard = [...w.filter(isHardRun), ...w.filter(isHardRide)];
  assertEquals(hard.length, 1, `${hard.length} hard sessions on a hard-ride week`);
  assertEquals(hard[0].type, 'ride');
  assertEquals(hard[0].day, 'Tuesday');
});


// ═══ THE HARD SESSION IS PAID OUT OF THE VOLUME, NOT ADDED TO IT ════════════════════════════
//
// ⛔ THE DEFECT CLASS, WHICH THIS FILE HAS SEEN TWICE. The run side had it first: the hill session
// counted toward the run-day COUNT and not toward the MILES, so every plan built the typed number
// and added the hills after — +27% on a 13-mile ask, and Michael rejected it at that. The bike side
// had the identical bug (`6h asked → 6.8h built`) and both are fixed: `hardRideMins` /
// `hardRunMiles` are subtracted before the easy volume is distributed.
//
// ⚠️ NO TEST HELD EITHER OF THEM. Both fixes live as a subtraction and a comment, and a subtraction
// is one careless edit from being gone — this is a defect that returns silently and reads as
// generosity. Guarded here for both sports, on the volume the athlete typed.
//
// ⚠️ AND THE INTERVALS DO NOT SHRINK TO FIT. Hickson: intensity holds top-end fitness, duration is
// the expendable variable — so the hard session keeps its full length and the easy work flexes.

const RIDE_TOLERANCE_MIN = 3;   // per-session rounding only

Deno.test('⛔ a hard RIDE is inside the typed hours, not on top of them', () => {
  const withHard = week1({
    enduranceSport: 'bike', bike: { hours: 5, days: 3, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'bike' }],
  });
  const built = minutesOf(withHard, 'ride');
  assert(
    Math.abs(built - 300) <= RIDE_TOLERANCE_MIN,
    `asked 5.0 h of riding, built ${built} min — the hard ride was added on top`,
  );
  // and it is genuinely there, at full length
  const hard = withHard.filter(isHardRide);
  assertEquals(hard.length, 1, 'the hard ride went missing');
  assertEquals(hard[0].duration, 45, 'the intervals were shrunk to fit — duration yields, intensity does not');
});

Deno.test('⛔ a hard RUN is inside the typed miles, not on top of them', () => {
  const withHard = week1({
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 21, easyPaceMinPerMile: 9,
    longRunDay: 'sunday', hardDays: [{ day: 'thursday', discipline: 'run' }],
  });
  const built = minutesOf(withHard, 'run');
  /**
   * ⚠️ THE LAP-BUTTON DESCENTS ARE THE SLACK, AND THEY ARE ON THE UNDER SIDE (2026-08-20).
   *
   * This week's hard run is the 3-minute hill. Its budget reserves 35 minutes; its STATED duration
   * is 32, because the descents end on the lap button and carry no clock — so summing the stated
   * durations comes in about three minutes under the ask, every time, by construction.
   *
   * ⛔ THE DIRECTION IS WHAT THIS TEST IS FOR AND IT STILL HOLDS: the hard run must not be ADDED ON
   * TOP of the typed miles. Under-running by the un-clockable descent is the opposite failure, and
   * the safe one. Stated as a one-sided bound so it cannot quietly become a licence to overshoot.
   */
  const OPEN_DESCENT_MIN = 3;
  assert(
    built - 21 * 9 <= RIDE_TOLERANCE_MIN,
    `asked ${21 * 9} min of running, built ${built} min — the hard run was added on top`,
  );
  assert(
    21 * 9 - built <= RIDE_TOLERANCE_MIN + OPEN_DESCENT_MIN,
    `asked ${21 * 9} min of running, built only ${built} min — more than the open descents explain`,
  );
});

Deno.test('⛔ adding a hard day does not grow the week\'s endurance volume', () => {
  // The cleanest statement of the rule: same ask, with and without a hard day, same total.
  const base = { enduranceSport: 'bike', bike: { hours: 5, days: 3, longRideDay: 'saturday' } };
  const without = minutesOf(week1(base), 'ride');
  const withHard = minutesOf(week1({ ...base, hardDays: [{ day: 'tuesday', discipline: 'bike' }] }), 'ride');
  assert(
    Math.abs(withHard - without) <= RIDE_TOLERANCE_MIN,
    `${without} min without a hard day, ${withHard} min with one — picking a hard day grew the week`,
  );
});
