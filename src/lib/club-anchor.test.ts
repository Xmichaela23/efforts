/**
 * The standing club session — which slot it lands in, and that declining still means nothing is written.
 *
 * ⛔ WHY THIS IS PINNED. The marathon intake filed every club night as `quality_run`, so an athlete
 * whose club run is a social jog would have had the week's intervals pinned to it. Michael,
 * 2026-08-05: *"we need to juggle whether run club is quality day."* The routing now depends on the
 * athlete's answer, and a routing decision with no test is one refactor away from collapsing back
 * into "always quality" — which looks identical on screen and is wrong in the plan.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check src/lib/club-anchor.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPreferredDays } from './non-race-goal-seeds.ts';

const RACE = { run: 'develop', bike: 'out', swim: 'out', strength: 'maintain' } as const;
const posture = () => ({ ...RACE }) as Parameters<typeof buildPreferredDays>[0];

Deno.test('a hard club night becomes quality_run', () => {
  const pd = buildPreferredDays(posture(), {
    longRunDay: 'sunday', qualityDays: { run: 'wednesday' }, easyDays: {},
  });
  assertEquals(pd.quality_run, 'wednesday');
  assertEquals(pd.easy_run, undefined, 'a hard club night must not also claim the easy slot');
  assertEquals(pd.long_run, 'sunday');
});

Deno.test('a social club run becomes easy_run — and does NOT drag the hard session onto it', () => {
  const pd = buildPreferredDays(posture(), {
    longRunDay: 'sunday', qualityDays: {}, easyDays: { run: 'wednesday' },
  });
  assertEquals(pd.easy_run, 'wednesday');
  assertEquals(
    pd.quality_run, undefined,
    'the social club run was filed as the quality day — the engine will put intervals on it',
  );
});

Deno.test('declining writes neither key — an unpinned day is the planner\'s to choose', () => {
  const pd = buildPreferredDays(posture(), { longRunDay: 'sunday', qualityDays: {}, easyDays: {} });
  assert(!('quality_run' in pd), 'an unpicked club night should not appear in preferred_days at all');
  assert(!('easy_run' in pd), 'an unpicked club night should not appear in preferred_days at all');
  assertEquals(pd.long_run, 'sunday');
});

Deno.test('quality wins a collision — the constraining reading is the safe one', () => {
  // The intake only ever sets one, but `preferred_days` is written by more than one caller and two
  // keys naming one day is a contradiction the engine cannot resolve on its own.
  const pd = buildPreferredDays(posture(), {
    longRunDay: 'sunday', qualityDays: { run: 'wednesday' }, easyDays: { run: 'wednesday' },
  });
  assertEquals(pd.quality_run, 'wednesday');
  assertEquals(pd.easy_run, undefined);
});

Deno.test('a dropped discipline contributes no day — posture gates both slots', () => {
  const runOut = { run: 'out', bike: 'out', swim: 'out', strength: 'maintain' } as unknown as
    Parameters<typeof buildPreferredDays>[0];
  const pd = buildPreferredDays(runOut, { qualityDays: { run: 'wednesday' }, easyDays: { run: 'friday' } });
  assertEquals(pd.quality_run, undefined);
  assertEquals(pd.easy_run, undefined, 'an easy day for a sport the athlete dropped is a leftover, not a day');
});

// ── the intake wires it, and the screen says the right thing ─────────────────────────────────────

const SRC = await Deno.readTextFile(new URL('../components/NonRaceBuilder.tsx', import.meta.url));

// ⛔ The source-text pins on the old marathon flow's club-intensity, strength and intent cards left with that flow
// (generate-run-plan deleted 2026-10-01). `buildPreferredDays` above still routes a club night by its intensity.

Deno.test('⛔ the screen no longer promises hard running on a day it may not place there', () => {
  // The copy under the picker used to read "The plan puts its hard running there" unconditionally,
  // while the engine ignored the pin entirely. Both halves are fixed; this pins the copy half.
  assert(
    !/The plan puts its hard running\s*\n?\s*there/.test(SRC),
    'the unconditional "puts its hard running there" promise is back — it is only true when the '
    + 'athlete says the session is hard',
  );
});

Deno.test('strength frequency goes through the one helper, and out asks for no lifting days', () => {
  assert(
    /strength_frequency: strengthFrequencyForPosture\(state\.posture\?\.strength\)/.test(SRC),
    'the payload no longer routes strength frequency through the one helper',
  );
  assert(/if \(p === 'maintain'\) return 2;/.test(SRC), 'strength_frequency changed shape for maintain');
  assert(
    /if \(p === 'develop'\) return 4;/.test(SRC) && /return 0;/.test(SRC),
    'the develop→4 / out→0 rungs changed — an out posture must never ask for lifting days',
  );
});
