/**
 * ⛔ THE BASELINE TEST AND RETEST SESSIONS, BUILT ON THE SERVER (2026-09-10, audit H-S01 / H-S02).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/strength/test-session.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isTestedLift, launcherTestSession, plannedTestSession, typedMaxFor } from './test-session.ts';
import { PRETEST_STEPS, PRETEST_WARMUP_FRACTION, pretestSession, pretestStepWeights } from '../standing-plan/working-number.ts';
import { composeWeek } from '../standing-plan/compose.ts';

const weights = (row: { sets: Array<{ weight: number }> }) => row.sets.map((s) => s.weight);

Deno.test('⛔ THE LAUNCHER WITH A MAX ON FILE — the empty bar, then p215\'s three steps (no 88% top set)', () => {
  const rows = launcherTestSession('upper', { bench: 185, overheadPress1RM: 115 });
  assertEquals(rows.map((r) => r.name), ['Bench Press', 'Overhead Press', 'Pull ups']);
  const [bench, ohp, pull] = rows;
  // 185 × 0.75 = 138.75 → A = 140; 1.10A = 154 → 155; 1.15A = 161 → 160.
  assertEquals(weights(bench), [45, 140, 155, 160]);
  assertEquals(bench.sets.map((s) => s.reps ?? null), [null, 6, 5, null]);
  assertEquals(bench.sets.map((s) => s.set_type), ['warmup', 'working', 'working', 'working']);
  assertEquals(bench.sets[3].amrap, true);
  assertEquals(bench.sets[1].set_hint, 'Step 1 — the first ramp set, as prescribed.');
  assertEquals(bench.sets[2].set_hint, 'Step 2 — heavier, as prescribed.');
  assertEquals(bench.notes, 'Bench Press on file: 185 lb (typed in your baselines). The steps below are a share of that number; the last one is what you are trying to beat.');
  // The press's empty bar is the bar, not 0.
  assertEquals(ohp.sets[0].weight, 45);
  assertEquals(weights(ohp), [45, 85, 95, 100]);
  assertEquals(pull.sets.map((s) => [s.set_type, s.reps ?? null, !!s.rep_max_test]), [['warmup', 5, false], ['warmup', 3, false], ['working', null, true]]);
});

Deno.test('⛔ THE LAUNCHER WITH NO MAX ON FILE — the anchor rows, not a 45/95 bar start', () => {
  const [squat, dead] = launcherTestSession('lower', {});
  for (const r of [squat, dead]) {
    assertEquals(weights(r), [45, 0, 0, 0], `${r.name} was given a starting weight`);
    assertEquals(r.sets[1].pretest_anchor, true);
    assertEquals(r.sets[1].set_hint, 'A weight for 8 to 10 reps near failure. Enter it here.');
    assertEquals(r.sets.map((s) => s.reps ?? null), [null, 6, 5, null]);
    assertEquals(r.anchor_round_to, 5);
    assertEquals(r.notes, undefined);
  }
});

Deno.test('⛔⛔ A PLAN\'S TEST ROW IS BUILT AS THE PLAN WROTE IT — its own weights, its own note', () => {
  const kit = ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)', 'Pull-up bar'];
  const w = composeWeek({
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    roundTo: 5, frame: 'all_rounder', week: 1, column: 'standard', equipment: kit,
    seed1RMs: { bench: 150, squat: 110, deadlift: 150, overheadPress: 85 },
  } as never) as { sessions: Array<{ name: string; tags: string[]; strength_exercises: Array<Record<string, unknown>> }> };
  const upper = w.sessions.find((s) => s.name === 'Test: Upper')!;
  const rows = plannedTestSession(upper.strength_exercises, upper.tags, { bench: 160 });
  const bench = rows.find((r) => r.name === 'Bench Press')!;
  const planned = upper.strength_exercises.find((e) => e.name === 'Bench Press')!.set_plan as Array<{ weight: number }>;
  assertEquals(weights(bench), [45, ...planned.map((p) => p.weight)], 'the plan\'s step weights changed on the way to the logger');
  assertEquals(bench.sets[bench.sets.length - 1].set_hint,
    'Last set — as many CLEAN reps as you can at this weight. This set sets the block\'s numbers. Stop when form breaks.');
  assertEquals(bench.notes, 'Bench Press on file: 160 lb (typed in your baselines). The steps below are a share of that number; the last one is what you are trying to beat. Last set as many reps as possible. It sets your numbers.');
  const ohp = rows.find((r) => r.name === 'Overhead Press')!;
  assertEquals(ohp.notes, 'The steps below are a share of the number that was on file when this block was built; the last one is what you are trying to beat. Last set as many reps as possible. It sets your numbers.');

  // By feel (no seed) → the anchor rows.
  const noSeed = composeWeek({
    competitionLifts: { push_upper: 'Bench Press', press_lower: 'Back Squat', hinge_lower: 'Deadlift' },
    roundTo: 5, frame: 'all_rounder', week: 1, column: 'standard', equipment: kit,
  } as never) as typeof w;
  const up2 = noSeed.sessions.find((s) => s.name === 'Test: Upper')!;
  const r2 = plannedTestSession(up2.strength_exercises, up2.tags, {});
  for (const r of r2) {
    assertEquals(r.sets[1].pretest_anchor, true, `${r.name} lost its anchor set`);
    assertEquals(r.anchor_round_to, 5);
  }
});

Deno.test('⛔ A NON-PLAN RETEST TAKES THE SAME PRETEST OFF THE TYPED MAX, AND ACCESSORIES COME THROUGH', () => {
  const rows = plannedTestSession([
    { name: 'Back Squat — AMRAP test set', sets: 1, reps: 'AMRAP', weight: '88% 1RM', slot_intent: 'ME' },
    { name: 'Hanging Leg Raise', sets: 3, reps: '8-10', target_rir: 2, notes: 'Slow.' },
  ], ['1rm_test'], { squat: 225 });
  // 225 × 0.75 = 168.75 → A = 170; 187 → 185; 195.5 → 195.
  assertEquals(rows[0].name, 'Back Squat');
  assertEquals(weights(rows[0]), [45, 170, 185, 195]);
  assertEquals(rows[1], {
    name: 'Hanging Leg Raise', planned_name: 'Hanging Leg Raise', target_reps: '8-10', target_rir: 2, notes: 'Slow.',
    sets: [{ weight: 0, set_type: 'working' }, { weight: 0, set_type: 'working' }, { weight: 0, set_type: 'working' }],
  });
  assertEquals(isTestedLift({ name: 'Hanging Leg Raise', sets: 3, reps: '8-10' }), false);
  assertEquals(isTestedLift({ name: 'Bench Press', slot_intent: 'ME' }), true);
  assertEquals(isTestedLift({ name: 'Bench Press', set_plan: [{ weight: 100 }, { weight: 120, amrap: true }] }), true);
  assertEquals(typedMaxFor('Overhead Press', { overhead: 95 }), 95);
});

Deno.test('⛔ THE ANCHOR FILL IS THE SERVER\'S ARITHMETIC — A rounded first', () => {
  // The finding's own case: A = 137 gave 150 and 160 on the phone; the server rounds A to 135 first.
  assertEquals(pretestStepWeights(137, 5), [135, 150, 155]);
  // A collided warm-up is left blank, never prescribed.
  assertEquals(pretestStepWeights(45, 5), [45, null, 50]);
  assertEquals(pretestStepWeights(0, 5), null);
  // pretestSession is unchanged by the extraction.
  for (let predicted = 40; predicted <= 400; predicted += 2.5) {
    const step = 5;
    const warmup = Math.round((predicted * PRETEST_WARMUP_FRACTION) / step) * step;
    const stepped = PRETEST_STEPS.map((s) => ({ fractionOfPredicted: s.fractionOfPredicted, weight: Math.round((warmup * s.multipleOfWarmup) / step) * step, reps: s.reps }));
    const kept = stepped.filter((s, i) => i === stepped.length - 1 || stepped.slice(i + 1).every((l) => l.weight !== s.weight));
    assertEquals(pretestSession('bench', predicted, step), kept, `predicted ${predicted}`);
  }
});

Deno.test('⛔ THE PHONE NO LONGER BUILDS A TEST, AND NO DELETED NUMBER OR CUE SURVIVES ON THE SERVER', async () => {
  const logger = await Deno.readTextFile(new URL('../../../../src/components/StrengthLogger.tsx', import.meta.url));
  assertEquals(/createBaselineTestExercise|createStandingTestExercise|baselineSeedFor|\* 0\.88|addWarmupSet/.test(logger), false,
    'a test builder or the 88% seed is back on the phone');
  assert(/'strength-test-session'/.test(logger), 'the logger stopped asking the server for a test session');
  assert(/pretestStepWeights\(/.test(logger), 'the anchor fill stopped using the server\'s step function');
  const server = await Deno.readTextFile(new URL('./test-session.ts', import.meta.url));
  for (const gone of ['RPE 9', 'aim ~3', 'Add 25', '0.88', '0.57', '0.80', 'barStart']) {
    assert(!server.includes(gone), `${gone} was moved instead of deleted`);
  }
});
