// THE ATHLETE ALLOCATES THE INTENSITY. LIST ORDER NO LONGER DOES.
//
// ⛔ WHAT WAS WRONG (Michael, 2026-08-18, from the live screen): *"ride just needs two options and
// one effects the other — speed drill or intervals means they get threshold for one or the other,
// none of this is clear."*
//
// The week's budget was already exactly one top-end session and one sustained session. Which SPORT
// held which was decided by the ORDER the wizard happened to list them in, and no surface anywhere
// said so — two athletes making identical picks got different twelve-week blocks depending on which
// chip they tapped first. The bike had no intent question at all.
//
// ⛔ AND ONE THING THE OLD SCREEN PROMISED, THE SOLVER WAS NOT DOING. The Flat Sprints card says the
// session *"requires strict clearance before the barbell"*, but the 48h preferred clearance was
// keyed on `terrain === 'flat'` — §2.0's VO2-intervals-on-the-level, a different session. The sprint
// carries `goal: 'speed'`, matched nothing, and got the ordinary 24h.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/intent-allocation.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };

const build = (hardDays: unknown[]) => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435, ftpWatts: 240,
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9, longRunDay: 'sunday',
  bike: { hours: 4, days: 2 }, targetWeeklyRideHours: 4,
  hardDays,
} as never) as any;

/** Every session in a representative working week (week 2 — week 1 is the standalone TM test). */
const week2 = (p: any): any[] => (p.sessions_by_week['2'] ?? []) as any[];
const named = (p: any, re: RegExp) => week2(p).filter((s) => re.test(String(s.name)));

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE ALLOCATION
// ─────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ THE RUN HOLDS THE SPEED WHEN THE ATHLETE SAYS SO — even listed second', () => {
  // The bike is listed FIRST, which under the old positional rule handed it the intensity slot.
  const p = build([
    { day: 'tuesday', discipline: 'bike', role: 'threshold' },
    { day: 'friday', discipline: 'run', role: 'intensity' },
  ]);
  assert(named(p, /Hill|Sprint/).length > 0, 'the run did not get the intensity session');
  // ⚠️ `session.day` IS TITLE-CASED ("Tuesday"). Comparing it raw to a lowercase weekday is silently
  // always false, which is how the first draft of this file "passed" nothing.
  const ride = week2(p).find((s) => s.type === 'ride' && String(s.day).toLowerCase() === 'tuesday'
    && Array.isArray(s.tags) && s.tags.includes('quality'));
  assert(ride, 'no hard ride on the pinned day');
  assert(!/Intervals/.test(String(ride.name)),
    `the ride took the intensity slot anyway: ${ride.name}`);
});

Deno.test('⛔ AND THE RIDE HOLDS IT WHEN THE ATHLETE SAYS SO — even listed second', () => {
  const p = build([
    { day: 'tuesday', discipline: 'run', role: 'threshold' },
    { day: 'friday', discipline: 'bike', role: 'intensity' },
  ]);
  assertEquals(named(p, /Bike Intervals/).length, 1, 'the ride did not get the intervals');
  // ⚠️ The run must be the THRESHOLD session, not hills — that is the other half of one toggle.
  assertEquals(named(p, /Hill|Sprint/).length, 0, 'the run kept a top-end session as well');
  assert(named(p, /Threshold/).length > 0, 'the run did not become the threshold session');
});

Deno.test('⛔ ONE HARD DAY CAN BE THE SUSTAINED ONE — a choice that did not exist before', () => {
  // A single hard day was ALWAYS the intensity session and the athlete was never asked. For someone
  // whose entire block hangs on one hard session, that is the whole cardiovascular decision.
  const p = build([{ day: 'tuesday', discipline: 'run', role: 'threshold' }]);
  assert(named(p, /Threshold/).length > 0, 'a solo threshold run was not built');
  assertEquals(named(p, /Hill|Sprint/).length, 0, 'it built the intensity session anyway');
});

/**
 * ⛔⛔ NO ALLOCATION → THE RUN, WHATEVER THE ORDER (Michael, 2026-08-18: *"principled; never rely on
 * list order. An array sort change in the future shouldn't biologically alter an athlete's week."*)
 *
 * ⚠️ THIS REPLACED A `BYTE-FOR-BYTE` TEST AND THE GUARANTEE IT NAMED IS DELIBERATELY GONE. The old
 * fallback gave intensity to the first prescribed slot, so a run+ride goal saved with the RIDE
 * listed first now rebuilds with the roles swapped. That is the trade "never rely on list order"
 * asks for, made on purpose rather than discovered later.
 *
 * ⛔ THE ORDER-REVERSED CASE IS THE ONE THAT MATTERS. The run-first case passes under BOTH rules and
 * proves nothing on its own — it is here only so a future edit that breaks it is visible.
 */
Deno.test('⛔ NO ALLOCATION → THE RUN HOLDS THE TOP END, EVEN LISTED SECOND', () => {
  const rideFirst = build([
    { day: 'tuesday', discipline: 'bike' },
    { day: 'friday', discipline: 'run' },
  ]);
  assert(named(rideFirst, /Hill|Sprint/).length > 0,
    'the run did not take the intensity session when the ride was listed first');
  assertEquals(named(rideFirst, /Bike Intervals/).length, 0, 'the ride took intensity off list order');
  assert(named(rideFirst, /Threshold/).length > 0, 'the ride did not become the sustained session');

  // ⚠️ AND THE SAME ANSWER THE OTHER WAY ROUND — the rule is the discipline, not the position.
  const runFirst = build([
    { day: 'tuesday', discipline: 'run' },
    { day: 'friday', discipline: 'bike' },
  ]);
  assert(named(runFirst, /Hill|Sprint/).length > 0, 'the run lost the intensity session');
  assertEquals(named(runFirst, /Bike Intervals/).length, 0, 'the ride took intensity too');
});

Deno.test('⚠️ ORDER STILL DECIDES WHEN THE RULE CANNOT SPEAK — two of one discipline', () => {
  // Two rides: there is no discipline asymmetry to read, so the first slot takes the top end and the
  // labels on the card say "Primary". Exactly one of each either way — that is the invariant.
  const p = build([
    { day: 'tuesday', discipline: 'bike' },
    { day: 'friday', discipline: 'bike' },
  ]);
  assertEquals(named(p, /Bike Intervals/).length, 1, 'two rides did not produce exactly one top-end ride');
  assert(named(p, /Threshold/).length > 0, 'the second ride did not become the sustained one');
});

Deno.test('⛔ AN EXPLICIT ALLOCATION STILL OVERRIDES THE RULE — the athlete outranks the default', () => {
  // The principled default is a DEFAULT. An athlete who wants the speed on the bike says so and
  // gets it, and the run becomes the sustained session.
  const p = build([
    { day: 'tuesday', discipline: 'run', role: 'threshold' },
    { day: 'friday', discipline: 'bike', role: 'intensity' },
  ]);
  assertEquals(named(p, /Bike Intervals/).length, 1, 'the default overrode the athlete');
  assertEquals(named(p, /Hill|Sprint/).length, 0, 'the run kept a top-end session');
});

Deno.test('⛔ A CLUB DAY STILL OVERRIDES THE ALLOCATION — it is the sustained one by nature', () => {
  // A group run settles into exactly that rhythm and the app writes nothing into it, so the athlete
  // does not get to allocate the top-end session to it.
  const p = build([
    { day: 'tuesday', discipline: 'run', ownership: 'club', role: 'intensity' },
    { day: 'friday', discipline: 'bike', role: 'threshold' },
  ]);
  // The club consumed the sustained slot, so the app's own day is the intensity one regardless of
  // what was allocated to it.
  assertEquals(named(p, /Bike Intervals/).length, 1,
    'the prescribed ride did not take the intensity slot beside a club day');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE 48h BACKWARD SHADOW — the clearance the sprint card promises
// ─────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ FLAT SPRINTS BUY THE 48h CLEARANCE — the gap the old filter missed entirely', () => {
  const p = build([{ day: 'wednesday', discipline: 'run', goal: 'speed', role: 'intensity' }]);
  const sprint = named(p, /Sprint/)[0];
  assert(sprint, 'no sprint session built');
  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const si = order.indexOf(String(sprint.day).toLowerCase());
  assert(si >= 0, `unrecognised day ${sprint.day}`);
  /**
   * ⛔ IT IS A FORWARD SHADOW, AND SAME-DAY IS EXEMPT — BOTH HALVES MATTER.
   *
   * The clearance the card promises is *"48 hours of leg clearance BEFORE heavy squats"*: the
   * damage from maximal flat footfall arrives the next morning, so what must not happen is a heavy
   * lower day landing INTO it. A squat EARLIER THE SAME DAY is the opposite arrangement — the
   * coupling law deliberately stacks them (barbell first, six hours' gap), and the lift is done
   * before the damage exists. Measuring an undirected gap reads that correct week as a breach.
   *
   * ⚠️ A PREFERENCE, NOT A LAW — `preferredClearance` sits below `breachPenalty` and can only choose
   * among weeks that are already legal (*"prefer, don't force"*, taken in 8 of 24 legal shapes). So
   * this asserts the outcome on a week that HAS room, not that a breach is impossible.
   */
  const heavyLower = week2(p).filter((s) => s.type === 'strength'
    && /Squat|Deadlift/.test(String(s.name)));
  assert(heavyLower.length > 0, 'no heavy lower day to measure against');
  for (const lift of heavyLower) {
    const li = order.indexOf(String(lift.day).toLowerCase());
    const forward = (li - si + 7) % 7;   // 0 = same day (coupled, barbell first)
    assert(forward === 0 || forward >= 2,
      `${lift.name} (${lift.day}) is ${forward}d AFTER the sprints (${sprint.day}) — inside the 48h`);
  }
});

Deno.test('⚠️ AND THE INCLINE SESSION DOES NOT PAY IT — removing the impact is the whole argument', () => {
  // The hill and treadmill options must not be charged the sprint's clearance. Uphill running has
  // no eccentric impact transient; making it buy 48h would move a lift for a cost it is not paying.
  const p = build([{ day: 'wednesday', discipline: 'run', role: 'intensity' }]);
  assert(named(p, /Hill/).length > 0, 'the default intensity run stopped being the hill session');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE MATERIALIZER EXPLAINS THE SETUP — the contract the card's copy makes
// ─────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ EVERY SESSION NAMES ITS OWN SETUP OPTIONS — the wizard stopped asking', () => {
  // The card tells the athlete *"you will choose your setup on the day."* If the session does not
  // list the setups, that promise is empty and the athlete is left with no guidance at all — which
  // is what the `return ''` branches used to do.
  const cases: Array<[string, unknown[], RegExp, RegExp]> = [
    ['sprint', [{ day: 'wednesday', discipline: 'run', goal: 'speed', role: 'intensity' }],
      /Sprint/, /track/i],
    ['hill', [{ day: 'wednesday', discipline: 'run', role: 'intensity' }],
      /Hill/, /treadmill/i],
    ['threshold run', [{ day: 'wednesday', discipline: 'run', role: 'threshold' }],
      /Threshold/, /track|treadmill/i],
    ['hard ride', [{ day: 'wednesday', discipline: 'bike', role: 'intensity' }],
      /Bike Intervals/, /trainer/i],
    ['threshold ride', [{ day: 'wednesday', discipline: 'bike', role: 'threshold' }],
      /Threshold Ride|Threshold/, /trainer/i],
  ];
  for (const [label, hardDays, nameRe, groundRe] of cases) {
    const p = build(hardDays);
    const s = week2(p).find((x) => nameRe.test(String(x.name))
      && Array.isArray(x.tags) && x.tags.includes('quality'));
    assert(s, `${label}: session not built`);
    assert(groundRe.test(String(s.description)),
      `${label}: the description names no setup — ${s.description}`);
  }
});

Deno.test('⚠️ AN OLD GOAL WITH A STORED TERRAIN READS ITS OWN GROUND, NOT THE MENU', () => {
  // A treadmill pick must not be told to go find a hill. The "no hill outside?" line is for the
  // athlete who was never asked, which as of today is everyone new.
  const p = build([{ day: 'wednesday', discipline: 'run', terrain: 'treadmill', role: 'intensity' }]);
  const s = week2(p).find((x) => Array.isArray(x.tags) && x.tags.includes('quality') && x.type === 'run');
  assert(s, 'no hard run built');
  assert(!/No hill outside/.test(String(s.description)),
    `an explicit treadmill pick was handed the substitute note — ${s.description}`);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE HALF-ALLOCATED PAIR — the bug case, kept
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// ⛔ MEASURED ON DEVICE 2026-08-18. The wizard's one-slot list writes a role to the slot the athlete
// answered; adding a SECOND hard day leaves that one with no role at all. Both entries then resolved
// to `vo2` — two top-end sessions, no sustained work anywhere, which is the arrangement §7 forbids.
// The screen showed it too: both allocation buttons filled and both slots headed "top-end intensity".
Deno.test('⛔ ONE SLOT ALLOCATED, ONE NOT — the week still carries exactly one of each', () => {
  for (const [label, hardDays] of [
    ['run marked, ride bare', [
      { day: 'tuesday', discipline: 'run', role: 'intensity' },
      { day: 'friday', discipline: 'bike' },
    ]],
    ['ride marked, run bare', [
      { day: 'tuesday', discipline: 'bike', role: 'intensity' },
      { day: 'friday', discipline: 'run' },
    ]],
    // ⚠️ AND THE OTHER HALF: only a THRESHOLD mark arrives. The unmarked slot must take the
    // intensity rather than both falling to sustained.
    ['run marked threshold, ride bare', [
      { day: 'tuesday', discipline: 'run', role: 'threshold' },
      { day: 'friday', discipline: 'bike' },
    ]],
  ] as const) {
    const p = build(hardDays as unknown[]);
    const quality = week2(p).filter((s) => Array.isArray(s.tags) && s.tags.includes('quality'));
    const topEnd = quality.filter((s) => /Hill|Sprint|Bike Intervals/.test(String(s.name)));
    const sustained = quality.filter((s) => /Threshold/.test(String(s.name)));
    assertEquals(topEnd.length, 1, `${label}: ${topEnd.length} top-end sessions (${quality.map((s) => s.name).join(', ')})`);
    assertEquals(sustained.length, 1, `${label}: ${sustained.length} sustained sessions (${quality.map((s) => s.name).join(', ')})`);
  }
});

/**
 * ⚠️⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-18, AND IT WAS THE BUG WEARING A GREEN TICK.
 *
 * It read: a lone `intensity` mark on the BIKE plus an unmarked run means the ride keeps the
 * intervals — *"the half they DID answer stands."* Reasonable, and wrong, because of where that
 * mark comes from: the one-slot card asks "what is this session" and recommends "Top-end
 * intensity", so a mark on the first sport added is not an allocation between two sports. Adding a
 * run second therefore produced "Run — sustained threshold" above "Ride — top-end intensity" on the
 * device, which is the impact distribution inverted.
 *
 * ⛔ A BARE `intensity` MARK YIELDS TO THE DISCIPLINE RULE. A `threshold` mark does not — it
 * unambiguously declines the top end — and a FULL allocation never yields at all.
 */
Deno.test('⛔ A BARE INTENSITY MARK YIELDS — but a decline and a full allocation both stand', () => {
  // 1. Inherited from a one-slot answer: the run takes the top end regardless of who was added first.
  const inherited = build([
    { day: 'tuesday', discipline: 'bike', role: 'intensity' },
    { day: 'friday', discipline: 'run' },
  ]);
  assertEquals(named(inherited, /Bike Intervals/).length, 0, 'a bare intensity mark still won');
  assert(named(inherited, /Hill|Sprint/).length > 0, 'the run did not take the top end');

  // 2. A decline stands: the run said "sustained", so the ride takes the top end.
  const declined = build([
    { day: 'tuesday', discipline: 'run', role: 'threshold' },
    { day: 'friday', discipline: 'bike' },
  ]);
  assertEquals(named(declined, /Bike Intervals/).length, 1, 'the declining run was handed the top end');

  // 3. A full allocation stands: both marked means the athlete used the control, which writes both.
  const explicit = build([
    { day: 'tuesday', discipline: 'run', role: 'threshold' },
    { day: 'friday', discipline: 'bike', role: 'intensity' },
  ]);
  assertEquals(named(explicit, /Bike Intervals/).length, 1, 'the manual override was second-guessed');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// A LONE-SLOT ANSWER IS NOT AN ALLOCATION — the device bug, kept
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ MEASURED ON DEVICE 2026-08-18, screenshot: "Run — sustained threshold" above "Ride — top-end
 * intensity". Add a hard RIDE first, answer its one-slot list (whose recommended default IS
 * "Top-end intensity"), then add a hard run. The ride carried `role: 'intensity'`, the run carried
 * nothing, and the ride kept the top end — the exact inversion the principled default exists to
 * prevent. The athlete never allocated anything; they answered "what is this session" about the
 * only session they had.
 */
Deno.test('⛔ ADDING A RUN AFTER ANSWERING A LONE RIDE — the run still takes the top end', () => {
  const p = build([
    { day: 'tuesday', discipline: 'bike', role: 'intensity' },
    { day: 'friday', discipline: 'run' },
  ]);
  assert(named(p, /Hill|Sprint/).length > 0, 'the ride kept the top end off an inherited mark');
  assertEquals(named(p, /Bike Intervals/).length, 0, 'the ride is still holding the intervals');
  assert(named(p, /Threshold Ride|Threshold/).length > 0, 'the ride did not become the sustained one');
});

Deno.test('⚠️ BUT AN EXPLICIT THRESHOLD MARK SURVIVES — it DECLINES the top end, unambiguously', () => {
  // A lone RUN set to "Sustained threshold", then a ride added. The athlete said what they did not
  // want for the run; the ride takes the top end even though the discipline rule prefers the run.
  const p = build([
    { day: 'tuesday', discipline: 'run', role: 'threshold' },
    { day: 'friday', discipline: 'bike' },
  ]);
  assertEquals(named(p, /Bike Intervals/).length, 1, 'the declining run was handed the top end anyway');
  assertEquals(named(p, /Hill|Sprint/).length, 0, 'the run kept a top-end session it declined');
});

Deno.test('⛔ AND A FULL ALLOCATION IS NEVER SECOND-GUESSED — the override outranks the rule', () => {
  // Both slots marked means the athlete used "Set as top-end", which writes both. Even though the
  // discipline rule prefers the run, an explicit ride allocation stands.
  const p = build([
    { day: 'tuesday', discipline: 'run', role: 'threshold' },
    { day: 'friday', discipline: 'bike', role: 'intensity' },
  ]);
  assertEquals(named(p, /Bike Intervals/).length, 1, 'the manual override was overridden');
});

/**
 * ⛔ THE CLUB CASE REVERSES THE RULE — pinned because a UI FORECAST depends on it.
 *
 * The hard-day banner tells an athlete with one session what a SECOND one will be. That sentence is
 * only true while the existing session is one the app writes: `assignHardRoles` gives a club session
 * the SUSTAINED slot by its nature, so whatever is added beside it takes the TOP END instead. The
 * banner suppresses itself beside a club session for exactly this reason.
 *
 * ⚠️ SO THIS TEST IS LOAD-BEARING FOR COPY, not only for the plan. If the club rule ever changes,
 * the banner's suppression condition has to change with it or the screen starts forecasting the
 * opposite of what gets built.
 */
Deno.test('⛔ A SESSION ADDED BESIDE A CLUB ONE TAKES THE TOP END, not the threshold', () => {
  const p = build([
    { day: 'tuesday', discipline: 'run', ownership: 'club' },
    { day: 'friday', discipline: 'bike' },
  ]);
  assertEquals(named(p, /Bike Intervals/).length, 1,
    'the added ride did not take the top end beside a club run');
  assertEquals(named(p, /Threshold/).length, 0,
    'something was handed the sustained slot the club already holds');

  // ⚠️ AND THE CONTRAST THE FORECAST IS ABOUT: the same pair without the club flag goes the other
  // way, which is what makes suppressing the sentence necessary rather than tidy.
  const normal = build([
    { day: 'tuesday', discipline: 'run' },
    { day: 'friday', discipline: 'bike' },
  ]);
  assert(named(normal, /Threshold/).length > 0, 'the non-club pair stopped producing a sustained session');
});
