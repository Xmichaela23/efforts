// ============================================================================
// THE STRIDES — the frame's only speed work, and it has to reach the watch.
//
// ⛔ THE GAP THIS CLOSES. p119 lists running economy FIRST of the three qualities that may not be
// allowed to lapse, and NOT ONE of the frame's four sessions is speed work: MLSS, near-threshold,
// VT1 and LSD are all threshold-or-below. `run_sprint_power` is fully built and the frame never
// reaches for it.
//
// ⛔ p109 IS WHY THERE IS NO FIFTH SLOT: *"athletes can improve turnover/running economy with as few
// as a handful of strides before, during, or after other running sessions, so there's no need for a
// speed session to be a lengthy stand-alone!"* p246 prints four endurance slots and Michael ruled
// (2026-08-26) that all four are the frame's, so the economy work goes ON one of them.
//
// ⛔⛔ AND MICHAEL'S ONE HARD CONSTRAINT: *"make sure however we do the strides they make it onto
// garmin."* The watch builder reads a planned workout's INTERVALS. Anything that lives only in a
// description or a note never leaves the phone — so this file asserts against expanded intervals,
// never against rendered copy.
//
// ⚠️ THE EXPANDER IS LINTED AS SOURCE HERE, NOT IMPORTED, and that is this directory's own rule:
// `materialize-plan/index.ts` calls `Deno.serve` at top level, so importing it for a pure helper
// starts an HTTP listener and every test in this directory would need `--allow-net`. The two other
// files here that reach into it read it as text for the same reason.
// ⛔ THE LIVE EXPANSION IS COVERED TOO — `shared/strength-system/strides-to-watch.test.ts` actually
// runs `expandRunToken` over the emitted token and inspects the intervals. Both halves exist because
// a lint proves the branch is there and only the expansion proves what it produces.
//
// Run: deno test --no-check --allow-read --allow-env \
//        supabase/functions/_shared/standing-plan/standing-plan-strides.test.ts
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek, defaultCompetitionLifts } from './index.ts';
import { buildEnduranceSession, resolveEnduranceAnchors } from '../endurance-library/index.ts';
import { sessionDurationBandSeconds } from '../endurance-library/index.ts';
import { SESSION_ADD_ONS, STRIDES_DOSE_IS_OURS } from '../endurance-library/source-rules.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: { ftp: 250 },
};
const ANCHORS = resolveEnduranceAnchors(BASELINES as never);
const BASE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
} as never;
const ALL_RUN = { '1:0': 'run', '3:0': 'run', '4:0': 'run', '6:0': 'run' };
/** The easy slot on the bike — the athlete who gets no strides, and should not. */
const EASY_ON_BIKE = { '1:0': 'run', '3:0': 'run', '4:0': 'ride', '6:0': 'run' };

function week(slots: Record<string, string>, runHours = 4) {
  return composeWeek({
    ...BASE, week: 2, column: 'standard',
    sportMix: { runs: 4, rides: 0, swimDays: 0, slots },
    targetRunHours: runHours, targetRideHours: null, demonstratedWeeklyMiles: 22,
  } as never);
}
const easyRun = (wk: { sessions: { name: string; type: string; steps_preset?: string[] }[] }) =>
  wk.sessions.find((s) => s.type === 'run' && /easy/i.test(s.name));

Deno.test('⛔⛔ THE STRIDES REACH THE WATCH — a token the expander turns into intervals', async () => {
  const s = easyRun(week(ALL_RUN) as never);
  assert(s, 'the week has no easy run');
  const tokens = s!.steps_preset ?? [];
  const stride = tokens.find((t) => /^strides_\d+x\d+s$/.test(t));
  assert(stride, `no strides token on the easy run: ${tokens.join(', ')}`);

  /**
   * ⛔⛔ MICHAEL'S CONSTRAINT, CHECKED AGAINST THE EXPANDER ITSELF: *"make sure however we do the
   * strides they make it onto garmin."* `send-workout-to-garmin` builds its steps from a planned
   * workout's INTERVALS, and those come from `expandRunToken`. A token that branch does not match
   * produces no intervals and the strides would exist only as text on a card.
   *
   * ⚠️ LINTED AS SOURCE, for the reason in this file's header. The live expansion is asserted in
   * `shared/strength-system/strides-to-watch.test.ts`.
   */
  const src = await Deno.readTextFile(
    new URL('../../materialize-plan/index.ts', import.meta.url).pathname,
  );
  const at = src.indexOf('if (/strides_\\d+x/.test(lower))');
  assert(at > 0, 'the expander\'s strides branch could not be found — it moved or was rewritten');
  const body = src.slice(at, at + 2000);
  // ⛔ IT STILL PARSES THE SECONDS FORM. The edge emits `strides_6x20s`; a branch that only read
  // metres would match nothing and the watch would get an easy run with no strides on it.
  assert(body.includes("match(/strides_(\\d+)x(\\d+)(m|s)/)"),
    'the expander no longer parses the seconds form of the token');
  // ⛔ NO PACE TARGET ON THE EFFORT, AND IT IS HIS (p229): "all-out" is the best speed available that
  // day, so a number here would be invented — the defect this repo calls the score that lies.
  assert(/kind: 'work',\s*\n\s*duration_s: val,/.test(body),
    'the timed stride step stopped being emitted, or stopped being emitted without a pace');
  assert(!/duration_s: val,\s*\n\s*pace_sec_per_mi/.test(body),
    'a stride was handed a pace target nobody prescribed');
  // ⛔ AND NO TRAILING RECOVERY: the watch ends on the last effort, not on a walk.
  assert(body.includes('if (i < reps - 1)'), 'the expander stopped skipping the final recovery');
});

Deno.test('⛔ THE STRIDES COME OUT OF THE SESSION\'S DOSE, NOT ON TOP OF IT', () => {
  /**
   * ⛔ p109 DESCRIBES A MULTIPURPOSE SESSION, not a longer one. A block added on top would push the
   * easy run past the band p235 prints for its level — which is what p275 forbids from the other
   * direction, and what `LADDER_CEILING_MIN` exists to hold.
   */
  for (const size of [0, 0.5, 1]) {
    for (const level of [1, 2, 3] as const) {
      const band = sessionDurationBandSeconds('run_vt1', level, { anchors: ANCHORS });
      const withStrides = buildEnduranceSession({
        family: 'run_vt1', level, anchors: ANCHORS, size, addOn: 'strides',
      } as never) as never as { totals: { clockedSeconds: number } };
      const plain = buildEnduranceSession({
        family: 'run_vt1', level, anchors: ANCHORS, size,
      } as never) as never as { totals: { clockedSeconds: number } };
      assertEquals(withStrides.totals.clockedSeconds, plain.totals.clockedSeconds,
        `level ${level} size ${size}: the strides lengthened the session`);
      assert(withStrides.totals.clockedSeconds <= band.longest + 1,
        `level ${level} size ${size}: ${withStrides.totals.clockedSeconds}s is past the band`);
    }
  }
});

Deno.test('⛔ THE DOSE IS LABELLED OURS, AND THE PLACEMENT IS HIS', () => {
  /**
   * ⛔ HIS: p109's placement — a handful of strides on the end of another run — and p229's all-out
   * intensity with full recovery and no pace.
   * ⚠️ OURS: four to eight efforts of twenty to thirty seconds. The page prints no dose for a
   * stride; its shortest sprint is a 25-50 m acceleration, which is four to eight SECONDS and a
   * different movement. Michael ruled the field-standard figure, 2026-08-26.
   */
  const spec = SESSION_ADD_ONS.strides;
  assertEquals(spec.reps, { lo: 4, hi: 8 });
  assertEquals(spec.secondsPerRep, { lo: 20, hi: 30 });
  assertEquals(spec.work.kind, 'all_out');
  assertEquals(spec.cite, 'Viada p109');
  assert(/ours/i.test(STRIDES_DOSE_IS_OURS));
  assert(/field standard/i.test(STRIDES_DOSE_IS_OURS));

  const built = buildEnduranceSession({
    family: 'run_vt1', level: 1, anchors: ANCHORS, size: 0.5, addOn: 'strides',
  } as never) as never as { blocks: { addOn?: string; repeat: number; restBetween: { seconds: number | null } | null }[]; notes: { kind: string; text: string }[] };
  const block = built.blocks.find((b) => b.addOn === 'strides');
  assert(block, 'the strides block is not marked as an add-on');
  assert(block!.repeat >= 4 && block!.repeat <= 8, `${block!.repeat} strides is outside the dose`);
  // ⛔ FULL RECOVERY — his `open` recovery, which states no duration and is not given one here.
  assertEquals(block!.restBetween?.seconds, null, 'the full recovery was given an invented duration');
  assert(built.notes.some((n) => n.kind === 'ours' && n.text === STRIDES_DOSE_IS_OURS),
    'the session does not say the dose is ours');
});

Deno.test('⛔ NO RUNNING, NO STRIDES — and the easy token still says how long the easy part is', () => {
  // ⚠️ An athlete who put the easy slot on the bike gets none, which is the honest answer: there is
  // no running economy to train on a session with no running in it.
  const rideWeek = week(EASY_ON_BIKE) as never as { sessions: { type: string; steps_preset?: string[] }[] };
  for (const s of rideWeek.sessions) {
    for (const t of s.steps_preset ?? []) {
      assert(!/^strides_/.test(t), `a strides token reached a week with no easy run: ${t}`);
    }
  }

  /**
   * ⛔ AND THE TWO TOKENS DO NOT DOUBLE-COUNT. The strides travel as their own token, so the easy
   * run's own token must state the EASY minutes — not the easy minutes plus the strides.
   */
  const s = easyRun(week(ALL_RUN) as never as { sessions: { name: string; type: string; steps_preset?: string[] }[] });
  const tokens = s!.steps_preset ?? [];
  const easy = tokens.find((t) => /^run_easy_\d+min$/.test(t));
  assert(easy, `no easy token: ${tokens.join(', ')}`);
  const stride = tokens.find((t) => /^strides_/.test(t))!;
  const easyMin = Number(easy!.match(/(\d+)min/)![1]);
  const strideSeconds = Number(stride.match(/^strides_(\d+)x/)![1]) * Number(stride.match(/x(\d+)s$/)![1]);
  const row = s as unknown as { duration: number };
  assert(easyMin + Math.round(strideSeconds / 60) <= row.duration + 1,
    `the easy token (${easyMin}m) plus the strides overruns the session's own ${row.duration}m`);
});
