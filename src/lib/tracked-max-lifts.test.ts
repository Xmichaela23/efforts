/**
 * Step 7 — the three fitness-section name sets: which are one, and which are deliberately not.
 *
 *   deno test --allow-read src/lib/tracked-max-lifts.test.ts --no-check
 *
 * ⛔ THE POINT IS NOT THAT THE SETS MATCH. Two of the three answer different questions and are
 * SUPPOSED to differ; forcing 16 = 4 would be the bug. These fixtures pin (a) that the one genuine
 * duplicate is now genuinely one, (b) that the intentional differences are the ones we think they
 * are, and (c) the unsettled fifth member, so the product call cannot be lost.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { TRACKED_MAX_LIFTS, isTrackedMaxLift } from './tracked-max-lifts.ts';
import { capabilitiesForExercise } from './exercise-role.ts';
import { computeE1rmBand, PRIMARY_LIFTS, type LiftSeries } from '../../supabase/functions/_shared/state-trend/strength.ts';

Deno.test('⛔ EXACTLY FOUR TRACKED MAXES — one per the previous program slot', () => {
  assertEquals([...TRACKED_MAX_LIFTS].sort(), ['bench_press', 'deadlift', 'overhead_press', 'squat']);
});

Deno.test('⛔ ONE LIST, BOTH ENDS — the server emitter and the client renderer share a membership test', async () => {
  // The failure this prevents: two byte-identical copies, one gains a name, and the client draws a
  // sparkline slot the server never fills (or vice versa) — the D-346 fault. Neither file may hold
  // its own copy of the four names any more.
  const server = await Deno.readTextFile(new URL('../../supabase/functions/_shared/state-trend/assemble.ts', import.meta.url));
  const client = await Deno.readTextFile(new URL('../components/context/StatePerformanceSection.tsx', import.meta.url));
  for (const [label, src] of [['assemble.ts', server], ['StatePerformanceSection.tsx', client]] as const) {
    assert(src.includes('isTrackedMaxLift'), `${label} must read the shared membership test`);
    // A re-declared literal set of the four canonicals is the regression: the copy coming back.
    const relit = /new Set\(\[\s*'squat',\s*'bench_press',\s*'deadlift',\s*'overhead_press'/.test(src);
    assertEquals(relit, false, `${label} has re-declared its own copy of the four lifts`);
  }
});

Deno.test('⛔ THE COACHING GATE IS WIDER THAN THE CHART SET, AND THAT IS CORRECT', () => {
  // In the previous program a variant FILLS a slot — it does not earn a fifth training max. So each of these is
  // coached (it is that slot this cycle) and charts no max of its own. If a future change makes
  // these equal, it has collapsed two different questions into one.
  for (const variant of ['Front Squat', 'Close Grip Bench Press', 'Sumo Deadlift', 'Push Press', 'Military Press']) {
    assertEquals(capabilitiesForExercise(variant).coached, true, `${variant} should be coached`);
  }
  assertEquals(isTrackedMaxLift('front_squat'), false, 'a front squat carries no tracked max of its own');
  assertEquals(isTrackedMaxLift('sumo_deadlift'), false);
  assertEquals(isTrackedMaxLift('push_press'), false);

  // …and the four themselves are both coached and charted.
  for (const [name, canon] of [['Back Squat', 'squat'], ['Bench Press', 'bench_press'], ['Deadlift', 'deadlift'], ['Overhead Press', 'overhead_press']]) {
    assertEquals(capabilitiesForExercise(name).coached, true, `${name} should be coached`);
    assertEquals(isTrackedMaxLift(canon), true, `${canon} should carry a tracked max`);
  }
});

Deno.test('⚠️ THE UNSETTLED ONE — PRIMARY_LIFTS still holds a fifth member (product call, not drift)', () => {
  // Pinned so the open question cannot quietly disappear. If someone "reconciles" the sets by
  // dropping trap_bar_deadlift or by adding it to the tracked four, they have made the product call
  // by accident — this test names it instead.
  const extra = [...PRIMARY_LIFTS].filter((l) => !TRACKED_MAX_LIFTS.has(l));
  assertEquals(extra, ['trap_bar_deadlift'], 'PRIMARY_LIFTS differs from the tracked four by exactly this');
});

Deno.test('⚠️ AND HERE IS WHAT IT COSTS — a logged variant moves the dot on unchanged strength', () => {
  // The measurement behind the product call. `computeE1rmBand` averages one ratio per canonical, and
  // `buildStrengthBaselines` gives trap_bar_deadlift the SAME baseline as deadlift — so the deadlift
  // slot is counted twice for an athlete who rotates variants.
  const pts = (v: number) => [{ date: '2026-08-01', value: v }];
  const baselines = { squat: 300, bench_press: 200, deadlift: 400, trap_bar_deadlift: 400, overhead_press: 120 };
  const squatAndDeadlift = [
    { canonical: 'squat', displayName: 'Squat', points: pts(150) },
    { canonical: 'deadlift', displayName: 'Deadlift', points: pts(400) },
  ];
  const plusTrapBar = [...squatAndDeadlift, { canonical: 'trap_bar_deadlift', displayName: 'Trap Bar Deadlift', points: pts(400) }];

  const dot = (s: LiftSeries[]) => computeE1rmBand(s, baselines)!.positionPct;
  assertEquals(Number(dot(squatAndDeadlift).toFixed(3)), 0.75);
  assertEquals(Number(dot(plusTrapBar).toFixed(3)), 0.833);
  assert(dot(plusTrapBar) > dot(squatAndDeadlift), 'logging a variant should not, by itself, raise the dot');
});
