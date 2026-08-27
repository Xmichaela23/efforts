// ============================================================================
// THE STRIDES, EXPANDED — what the watch actually receives.
//
// ⛔⛔ MICHAEL'S ONE HARD CONSTRAINT ON THE STRIDES (2026-08-26): *"make sure however we do the
// strides they make it onto garmin."* `send-workout-to-garmin` builds its steps from a planned
// workout's INTERVALS; anything living only in a description or a note never leaves the phone. So
// this file runs the emitted token through the materializer's own expander and inspects the
// intervals, never the rendered copy.
//
// ⚠️ IT LIVES HERE RATHER THAN BESIDE THE REST OF THE STANDING PLAN, and that is not a filing
// choice. `expandRunToken` comes from `materialize-plan/index.ts`, which calls `Deno.serve` at top
// level — importing it starts an HTTP listener, so the file needs `--allow-net` and would break the
// permission-free sweep of `_shared/`. `hard-run-terrain.test.ts` sits here for exactly this reason.
// ⛔ ITS SIBLING IS `_shared/standing-plan/standing-plan-strides.test.ts`, which lints the same
// branch as source and covers everything else about the strides. A lint proves the branch is there;
// this proves what it produces.
//
// Run: deno test --no-check --allow-read --allow-env --allow-net \
//        supabase/functions/shared/strength-system/strides-to-watch.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts } from '../../_shared/standing-plan/index.ts';
import { expandRunToken } from '../../materialize-plan/index.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};

/**
 * ⚠️ TWO FIXTURES, DELIBERATELY. The composer reads `learned_fitness` paces; `expandRunToken` reads
 * the materializer's own baseline shape (`easyPace`, `fiveK_pace`) — the same split
 * `hard-run-terrain.test.ts` works around. Handing the expander the wrong shape only costs it the
 * easy pace on recoveries, which is why the strides themselves are unaffected either way.
 */
const EXPANDER_BASELINES = { easyPace: '9:00/mi', fiveK_pace: '7:00/mi' };

function easyRunTokens(): string[] {
  const wk = composeWeek({
    frame: 'strength_5k',
    competitionLifts: defaultCompetitionLifts(),
    seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
    baselines: BASELINES,
    equipment: ['Commercial gym'],
    roundTo: 5,
    week: 2,
    column: 'standard',
    sportMix: { runs: 4, rides: 0, swimDays: 0, slots: { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' } },
    targetRunHours: 4,
    targetRideHours: null,
    demonstratedWeeklyMiles: 22,
  } as never) as never as { sessions: { name: string; type: string; steps_preset?: string[] }[] };
  const easy = wk.sessions.find((s) => s.type === 'run' && /easy/i.test(s.name));
  assert(easy, 'the week has no easy run');
  return easy!.steps_preset ?? [];
}

Deno.test('⛔⛔ THE STRIDES BECOME REAL INTERVAL STEPS — one per effort, no pace, no trailing rest', () => {
  const tokens = easyRunTokens();
  const stride = tokens.find((t) => /^strides_\d+x\d+s$/.test(t));
  assert(stride, `no strides token on the easy run: ${tokens.join(', ')}`);

  const steps = expandRunToken(stride!, EXPANDER_BASELINES as never) as Array<Record<string, unknown>>;
  assert(steps.length > 0, 'the expander produced no intervals — the strides would never reach the watch');

  const reps = Number(stride!.match(/^strides_(\d+)x/)![1]);
  const seconds = Number(stride!.match(/x(\d+)s$/)![1]);
  const work = steps.filter((x) => x.kind === 'work');
  assertEquals(work.length, reps, 'the expander did not produce one step per stride');
  for (const w of work) {
    assertEquals(w.duration_s, seconds, 'a stride lost its duration');
    /**
     * ⛔ NO PACE TARGET, AND THAT IS HIS (p229): *"Paces come from performance and RPE rather than a
     * prescribed pace"* — "all-out" is the best speed available that day. A number here would be
     * invented, which is the class of defect this repo calls the score that lies.
     */
    assertEquals(w.pace_sec_per_mi, undefined, 'a stride was handed a pace target nobody prescribed');
  }
  // ⛔ FULL RECOVERY BETWEEN, AND NONE AFTER THE LAST. The watch ends on an effort, not on a walk.
  assertEquals(steps.filter((x) => x.kind === 'recovery').length, reps - 1);
  assertEquals(steps[steps.length - 1].kind, 'work', 'the session ends on a recovery step');
});

Deno.test('⛔ THE EASY RUN ITSELF STILL EXPANDS — the strides did not replace it', () => {
  // ⚠️ TWO TOKENS, TWO BLOCKS OF INTERVALS, IN ORDER. The easy bout is still a work step at easy
  // pace; the strides follow it.
  const tokens = easyRunTokens();
  const easy = tokens.find((t) => /^run_easy_\d+min$/.test(t));
  assert(easy, `no easy token: ${tokens.join(', ')}`);
  const steps = expandRunToken(easy!, EXPANDER_BASELINES as never) as Array<Record<string, unknown>>;
  assertEquals(steps.length, 1);
  assertEquals(steps[0].kind, 'work');
  assert(typeof steps[0].pace_sec_per_mi === 'number', 'the easy bout lost its easy pace');
  assertEquals(tokens.indexOf(easy!) < tokens.findIndex((t) => /^strides_/.test(t)), true,
    'the strides come before the run they are meant to follow');
});
