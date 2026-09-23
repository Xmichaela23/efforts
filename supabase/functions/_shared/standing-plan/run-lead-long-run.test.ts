/**
 * ⛔⛔ RUN LEAD'S LONG RUN BUILDS THE MINUTE IT IS ASKED FOR (WORKORDER-run-programs-2026-09-23, Stage 0).
 *
 * The level-3 long run (`run_lsd`, `long_with_inserts`, 3 sets) built only 104/111/117/124/131/134 minutes: the ladder
 * spread 104–133.5 over the whole dial while the build stops growing at 0.16 of it (p107's two hours of easy running).
 * Pinned here: every minute from 104 to 134 builds within one minute, the sets are the page's, and every chip builds
 * exactly its own length.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeWeek } from './compose.ts';
import { defaultCompetitionLifts } from './frame-resolver.ts';
import { FRAMES } from './frames.ts';
import { enduranceIntakeReadout } from './intake-readout.ts';
import { frameSlots } from '../../../../src/lib/standing-plan-week-copy.ts';

const BASELINES = {
  units: 'imperial',
  performance_numbers: { easy_pace: '9:30', fiveK_pace: '7:50', ftp: 210 },
} as never;
const EQUIPMENT = ['Barbell + plates', 'Dumbbells', 'Flat bench', 'Squat rack'];
const FRAME = 'strength_half';
const longKey = frameSlots(FRAME).find((s) => s.role === 'long')!.frameKey;

function longRunFor(minutes: number, week = 2) {
  const w = composeWeek({
    competitionLifts: defaultCompetitionLifts(), roundTo: 5, frame: FRAME, week, column: 'standard',
    equipment: EQUIPMENT, baselines: BASELINES,
    sportMix: {
      slots: Object.fromEntries(frameSlots(FRAME).map((s) => [s.frameKey, 'run'])),
      minutes: { [longKey]: minutes },
    },
  } as never) as { sessions: Array<Record<string, unknown>> };
  const runs = w.sessions.filter((s) => s.type === 'run');
  const lengthOf = (s: Record<string, unknown>) => Number(s.duration ?? Number(s.total_duration_seconds ?? 0) / 60);
  return runs.sort((a, b) => lengthOf(b) - lengthOf(a)).map((s) => ({ session: s, minutes: lengthOf(s) }))[0];
}

Deno.test('⛔⛔ EVERY MINUTE FROM 104 TO 134 BUILDS WITHIN ONE MINUTE', () => {
  const misses: string[] = [];
  for (let m = 104; m <= 134; m++) {
    const long = longRunFor(m);
    assert(long, `no run built for a ${m}-minute ask`);
    if (Math.abs(long.minutes - m) > 1) misses.push(`${m} → ${long.minutes}`);
  }
  assertEquals(misses, [], `asked vs built: ${misses.join(', ')}`);
});

/** Minutes the steps the watch gets add up to: `longrun_NNmin_easypace` + `round_Rx_Ws…-rSs…`. */
function stepsMinutes(session: Record<string, unknown>): number {
  let secs = 0;
  for (const t of (session.steps_preset as string[]) ?? []) {
    const easy = /^longrun_(\d+)min_easypace$/.exec(t);
    if (easy) { secs += Number(easy[1]) * 60; continue; }
    const round = /^round_(\d+)x_(\d+)s[^-]*(?:-r(\d+)s.*)?$/.exec(t);
    if (round) { secs += Number(round[1]) * (Number(round[2]) + Number(round[3] ?? 0)); continue; }
    throw new Error(`unread token ${t}`);
  }
  return secs / 60;
}

Deno.test('⛔⛔ AND THE STEPS THE WATCH GETS ADD UP TO THE SAME LENGTH, WITHIN ONE MINUTE', () => {
  const misses: string[] = [];
  for (let m = 104; m <= 134; m++) {
    const got = stepsMinutes(longRunFor(m).session);
    if (Math.abs(got - m) > 1) misses.push(`${m} → ${got}`);
  }
  assertEquals(misses, [], `asked vs steps: ${misses.join(', ')}`);
});

Deno.test('⛔ THE PAGE\'S SETS ARE UNTOUCHED — three sets of three rounds at every length', () => {
  for (const m of [104, 112, 120, 128, 134]) {
    const tokens = longRunFor(m).session.steps_preset as string[];
    const sets = tokens.filter((t) => t.startsWith('round_'));
    assertEquals(sets, Array(3).fill('round_3x_60s115-r30svt1'), `${m} min: the sets are not p235's three`);
  }
});

Deno.test('⛔⛔ EVERY RUN LEAD CHIP IS OFFERED AND BUILDS EXACTLY ITS OWN LENGTH', () => {
  const rsw = FRAMES[FRAME].runStrengthWeek!;
  const r = enduranceIntakeReadout({ frame: FRAME, answers: {}, baselines: BASELINES } as never);
  const options = r.run_strength_week!.long_run_options;
  assertEquals(options, rsw.longRunChips, 'a chip the ladder cannot build was dropped from the screen');
  for (const m of options) assertEquals(Math.round(longRunFor(m).minutes), m, `chip ${m} built ${longRunFor(m).minutes}`);
});
