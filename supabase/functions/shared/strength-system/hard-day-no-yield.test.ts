// ⛔ NOTHING YIELDS. THE WEEK THE ATHLETE ASKED FOR IS BUILT, AND THE COST IS STATED.
//
// Michael's stage 5 ruling, 2026-08-21: *"No dropping sessions. Always build the week the athlete
// asked for and tell them what it costs."* This is that ruling as a test, and it pins BOTH halves —
// a version that only checked the sentence would pass on a week that had quietly lost a session.
//
// ── WHAT WAS DELETED, AND WHY IT NEEDED A TEST TO REPLACE IT ────────────────────────────────────
//
// A loop dropped hard days from the end, one at a time, until the solver stopped refusing (audit
// 2026-08-17: *"a hard day yields — the bar does not"*). It was written against the SLOT solver,
// where `unsolvable` meant NO LEGAL WEEK EXISTS. The week-model adapter has exactly two returns and
// cannot produce that status, so the loop had not run once since the swap.
//
// ⛔ IT WAS NOT SIMPLY RE-POINTED AT `compromised`, AND THE MEASUREMENT IS WHY. Under the debt model
// a breach is the NORMAL outcome of a crowded week, not an impossibility: across every distinct-day
// anchor shape on the three-day lift week, a revived loop would have deleted a hard session the
// athlete chose in 57% of two-hard-day weeks, and dropped BOTH of them in 280 of 840. Every breach
// in that space is an 18h or 24h residual. Michael ruled build-and-warn for engine-chosen days as
// well as athlete-pinned ones.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/hard-day-no-yield.test.ts
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
// deno-lint-ignore no-explicit-any
const build = (extra: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ ...BASE, ...extra } as never);

/**
 * A week the resolver cannot place cleanly: long run Monday, long ride Tuesday, hard run Wednesday,
 * hard ride Thursday, against two heavy lower days that need 48h from a long effort and from each
 * other. It comes back `compromised` with three outstanding clearances.
 */
const CROWDED = {
  enduranceSport: 'run',
  enduranceFrequency: 3,
  targetWeeklyMiles: 20,
  longRunDay: 'monday',
  bike: { hours: 4, days: 2, longRideDay: 'tuesday' },
  hardDays: [
    { day: 'wednesday', discipline: 'run' },
    { day: 'thursday', discipline: 'bike' },
  ],
};

/** A week with room: the long days on the weekend and one hard day mid-week. */
const ROOMY = {
  enduranceSport: 'run',
  enduranceFrequency: 3,
  targetWeeklyMiles: 20,
  longRunDay: 'sunday',
  bike: { hours: 4, days: 2, longRideDay: 'saturday' },
  hardDays: [{ day: 'wednesday', discipline: 'run' }],
};

// deno-lint-ignore no-explicit-any
const week1 = (plan: any): any[] => (plan.sessions_by_week?.['1'] ?? []) as any[];
// deno-lint-ignore no-explicit-any
const notes = (plan: any): Array<{ kind: string; text: string }> =>
  (plan.placement_compromises ?? []) as Array<{ kind: string; text: string }>;
const TIGHT = /Everything you asked for is built this week/;

Deno.test('⛔ THE RULING: a week that cannot be placed cleanly still builds BOTH hard days', () => {
  const rows = week1(build(CROWDED));
  // The hard run the athlete pinned to Wednesday.
  const hardRun = rows.find((s) => String(s.day).toLowerCase() === 'wednesday' && s.type === 'run');
  assert(hardRun, `the Wednesday hard run is missing: ${rows.map((s) => `${s.day}:${s.name}`).join(' | ')}`);
  assertEquals(hardRun.name, 'Hill Repeats');
  // The hard ride the athlete pinned to Thursday. ⛔ THIS IS THE ONE THE OLD LOOP TOOK FIRST — it
  // yielded from the END of the anchor list, so the second hard day was always the first to go.
  const hardRide = rows.find((s) => String(s.day).toLowerCase() === 'thursday' && s.type === 'ride');
  assert(hardRide, `the Thursday hard ride is missing: ${rows.map((s) => `${s.day}:${s.name}`).join(' | ')}`);
  assertEquals(hardRide.name, 'Threshold Ride');
  // And the lifting is all there — the bar was never the thing at risk, but a week that lost one
  // would make the sentence below a lie in the other direction.
  assertEquals(rows.filter((s) => s.type === 'strength').length, 3);
});

Deno.test('⛔ AND IT SAYS WHAT IS TIGHT — the line fires, first, as a cost', () => {
  const list = notes(build(CROWDED));
  assert(list.length > 0, 'a compromised week said nothing at all');
  assertEquals(list[0].kind, 'cost');
  assert(TIGHT.test(list[0].text), `the tight-week line is not first: ${list[0].text}`);
  // ⚠️ THE FRAME COMES BEFORE THE DETAIL. The renderer joins these in order into one "What this
  // week costs" paragraph, so the athlete reads what happened before they read the hours.
  assert(
    list.slice(1).some((c) => c.kind === 'breach' && /more clearance from/.test(c.text)),
    'the frame shipped with no shortfall behind it',
  );
});

Deno.test('⛔ THE COPY NO LONGER CLAIMS A SESSION WAS LEFT OUT', () => {
  const text = notes(build(CROWDED)).find((c) => TIGHT.test(c.text))!.text;
  // The sentences this replaced: "Your hard run was left out this block" / "the hard session is the
  // one that gives way." Both are false by construction now, and a copy edit that reintroduces
  // either would be describing behaviour the engine does not have.
  for (const dead of ['left out', 'gives way', 'yield', 'could not fit', 'no day left']) {
    assert(!text.toLowerCase().includes(dead), `the tight-week line still says "${dead}"`);
  }
  assert(/Nothing was dropped/.test(text), 'the line must state plainly that nothing was dropped');
  // ⚠️ THE VOICE IS A HARD CHECK, NOT A SUGGESTION — a quant who trains, not a coach who encourages.
  assertEquals(voiceViolation(text), null, `voice violation in the tight-week line: ${text}`);
});

Deno.test('a week with room says nothing — silence is the correct output when nothing is tight', () => {
  const list = notes(build(ROOMY));
  assert(
    !list.some((c) => TIGHT.test(c.text)),
    `a clean week claimed it was tight: ${list.map((c) => c.text).join(' | ')}`,
  );
});
