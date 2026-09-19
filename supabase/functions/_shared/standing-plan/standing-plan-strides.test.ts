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
  const stride = tokens.find((t) => t === 'strides_p210');
  assert(stride, `no strides token on the easy run: ${tokens.join(', ')}`);

  /**
   * ⛔⛔ MICHAEL'S CONSTRAINT, CHECKED AGAINST THE EXPANDER ITSELF: *"make sure however we do the
   * strides they make it onto garmin."* `send-workout-to-garmin` builds its steps from a planned
   * workout's INTERVALS, and those come from `expandRunToken`. A token that branch does not match
   * produces no intervals and the strides would exist only as text on a card.
   *
   * ⛔ p210's STRIDES (2026-09-18, round 3): "2 × 100-meter strides (begin slow and accelerate to near full tilt)" — the
   * run test's own steps (one owner, `P210_STRIDE_LABEL`), untimed lap-button steps, no rest between (the page prints
   * none). "6 × 30 s stride" and "Walk/Jog — as long as you need" were on no page.
   * ⚠️ LINTED AS SOURCE, for the reason in this file's header.
   */
  const src = await Deno.readTextFile(
    new URL('../../materialize-plan/index.ts', import.meta.url).pathname,
  );
  const at = src.indexOf("if (lower === 'strides_p210')");
  assert(at > 0, 'the expander\'s p210 strides branch could not be found — it moved or was rewritten');
  const body = src.slice(at, at + 600);
  assert(body.includes('P210_STRIDE_COUNT') && body.includes('label: P210_STRIDE_LABEL'),
    'the p210 strides stopped reading the run test\'s one owner');
  assert(body.includes('lap_button: true'), 'a p210 stride was given a clock the page does not print');
  assert(!/kind: 'recovery'/.test(body), 'a rest the page does not print came back between the strides');
  assert(!/pace_sec_per_mi/.test(body), 'a stride was handed a pace target nobody prescribed');
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
   * ⚠️ OURS: SIX EFFORTS OF THIRTY SECONDS (Michael, 2026-08-28), narrowed from the four-to-eight /
   * twenty-to-thirty band he set on 2026-08-26. The page prints no dose for a stride; its shortest
   * sprint is a 25-50 m acceleration, which is four to eight SECONDS and a different movement.
   * Twenty to thirty seconds is the field standard; six at thirty is the point he named inside it.
   * ⚠️ A POINT, NOT A BAND — so the session's stride cost is exactly three minutes and the card can
   * state it without hedging.
   */
  const spec = SESSION_ADD_ONS.strides;
  // p210's dose since 2026-09-18 (round 3): two strides, untimed.
  assertEquals(spec.reps, { lo: 2, hi: 2 });
  assertEquals(spec.secondsPerRep, { lo: 0, hi: 0 });
  assertEquals(spec.work.kind, 'all_out');
  assertEquals(spec.cite, 'Viada p109, p210');
  assert(/p210/.test(STRIDES_DOSE_IS_OURS));

  const built = buildEnduranceSession({
    family: 'run_vt1', level: 1, anchors: ANCHORS, size: 0.5, addOn: 'strides',
  } as never) as never as { blocks: { addOn?: string; repeat: number; restBetween: { seconds: number | null } | null }[]; notes: { kind: string; text: string }[] };
  const block = built.blocks.find((b) => b.addOn === 'strides');
  assert(block, 'the strides block is not marked as an add-on');
  assertEquals(block!.repeat, 2, `${block!.repeat} strides is not p210's two`);
  // ⛔ NO REST BETWEEN — p210 prints none.
  assertEquals(block!.restBetween, null, 'a rest the page does not print came back between the strides');
  assert(built.notes.some((n) => n.text === STRIDES_DOSE_IS_OURS), 'the session does not say where the dose is from');
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
  assert(tokens.includes('strides_p210'), `no strides token: ${tokens.join(', ')}`);
  const easyMin = Number(easy!.match(/(\d+)min/)![1]);
  // p210's strides are untimed, so they charge the session nothing.
  const strideSeconds = 0;
  const row = s as unknown as { duration: number };
  assert(easyMin + Math.round(strideSeconds / 60) <= row.duration + 1,
    `the easy token (${easyMin}m) plus the strides overruns the session's own ${row.duration}m`);
});
