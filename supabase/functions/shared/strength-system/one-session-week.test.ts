// ONE SESSION A WEEK IS A LEGAL ANSWER — and the count built is the count asked for.
//
// ⛔ IT WAS UNREACHABLE IN FOUR PLACES AT ONCE (Michael, 2026-08-19): the picker offered 2/3/4,
// `assemblePayload` sent `run_days` only at `>= 2`, the Continue gate demanded 2, and this composer
// floored at `Math.max(DEFAULT_ENDURANCE_SESSIONS, …)`. An athlete who can run once a week had no
// way to say it, and the engine would have built two if they had.
//
// ⛔ AND FIXING THE FLOOR EXPOSED AN OVERAGE THAT WAS ALREADY LIVE AT TWO SESSIONS. `runFreq` read
// `Math.max(1, asked - hardRunCount)` so that "a 2-run week with two hard runs still leaves a run to
// be long" — which is the +1 the line above it exists to prevent. Two asked, two hard, three built.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/one-session-week.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const build = (o: Record<string, unknown>) => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240,
  enduranceSport: 'run', enduranceFrequency: 2, targetWeeklyMiles: 12, easyPaceMinPerMile: 10,
  longRunDay: 'sunday', bike: { hours: 4, days: 2, longRideDay: 'saturday' },
  targetWeeklyRideHours: 4, hardDays: [], ...o,
} as never) as any;
const week = (p: any) => (p.sessions_by_week['2'] ?? []) as any[];
const runs = (p: any) => week(p).filter((s) => s.type === 'run');
const rides = (p: any) => week(p).filter((s) => s.type === 'ride');

Deno.test('⛔ ONE RUN A WEEK BUILDS EXACTLY ONE RUN', () => {
  const p = build({ enduranceFrequency: 1 });
  assertEquals(runs(p).length, 1, runs(p).map((s: any) => s.name).join(', '));
  // ⚠️ AND IT IS THE LONG ONE, which is the no-conflict rule: with a long day pinned and a single
  // session, that session simply IS the long run rather than a second one beside it.
  assertEquals(runs(p)[0].name, 'Long Run');
});

Deno.test('⛔ ONE RUN + A HARD RUN IS THE HARD RUN — the single session carries the role', () => {
  const p = build({ enduranceFrequency: 1, hardDays: [{ day: 'tuesday', discipline: 'run' }] });
  assertEquals(runs(p).length, 1, runs(p).map((s: any) => s.name).join(', '));
  assert(/Hill|Sprint|Threshold/.test(runs(p)[0].name), `got ${runs(p)[0].name}`);
});

Deno.test('⛔ ONE RIDE, AND ONE RIDE + A HARD RIDE, BOTH BUILD EXACTLY ONE', () => {
  const solo = build({ bike: { hours: 4, days: 1, longRideDay: 'saturday' } });
  assertEquals(rides(solo).length, 1, rides(solo).map((s: any) => s.name).join(', '));
  const hard = build({
    bike: { hours: 4, days: 1, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'bike' }],
  });
  assertEquals(rides(hard).length, 1, rides(hard).map((s: any) => s.name).join(', '));
  assert(/Intervals|Threshold/.test(rides(hard)[0].name), `got ${rides(hard)[0].name}`);
});

/**
 * ⛔ THE COUNT BUILT IS THE COUNT ASKED FOR, ACROSS THE WHOLE MATRIX. This is the assertion the old
 * floors were quietly breaking at both ends: 1 became 2, and 2-asked-with-2-hard became 3.
 * ⚠️ 4 RIDES IS PART OF IT — the ceiling was 3 in TWO places in this file, and raising only the
 * picker would have discarded the answer silently with a note blaming the solver.
 */
Deno.test('⛔ EVERY RUN COUNT 1-4 BUILDS EXACTLY THAT MANY, AT EVERY HARD-DAY COUNT', () => {
  const H = (d: string) => ({ day: d, discipline: 'run' });
  const hardSets = [[], [H('tuesday')], [H('tuesday'), H('friday')]];
  for (let asked = 1; asked <= 4; asked++) {
    for (const hd of hardSets) {
      if (hd.length > asked) continue;   // more hard runs than runs is not a shape
      const p = build({ enduranceFrequency: asked, hardDays: hd });
      assertEquals(runs(p).length, asked,
        `asked ${asked} runs with ${hd.length} hard: got ${runs(p).map((s: any) => s.name).join(', ')}`);
    }
  }
});

Deno.test('⛔ EVERY RIDE COUNT 1-4 BUILDS EXACTLY THAT MANY', () => {
  for (let days = 1; days <= 4; days++) {
    const p = build({ bike: { hours: 4, days, longRideDay: 'saturday' } });
    assertEquals(rides(p).length, days,
      `asked ${days} rides: got ${rides(p).map((s: any) => s.name).join(', ')}`);
  }
});

Deno.test('⛔ THE 2-ASKED-2-HARD OVERAGE, KEPT — it built THREE runs', () => {
  const p = build({
    enduranceFrequency: 2,
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'friday', discipline: 'run' }],
  });
  assertEquals(runs(p).length, 2, `got ${runs(p).map((s: any) => s.name).join(', ')}`);
  // ⚠️ AND NO LONG RUN, because there is no session left over to be one. A long run here was the
  // extra session — the pin says they want one, it cannot say there is room.
  assertEquals(runs(p).some((s: any) => s.name === 'Long Run'), false);
});

Deno.test('⚠️ A ONE-SESSION WEEK IS STILL A VALID, PLACEABLE WEEK', () => {
  const p = build({ enduranceFrequency: 1, bike: { hours: 4, days: 1, longRideDay: 'saturday' } });
  assert(Object.keys(p.sessions_by_week).length >= 12, 'the block lost weeks');
  // Every session has a day and a duration — no half-built rows from the empty easy list.
  for (const s of week(p)) {
    assert(!!s.day, `session with no day: ${s.name}`);
    if (s.type !== 'strength') assert(Number(s.duration) > 0, `zero-duration ${s.name}`);
  }
});
