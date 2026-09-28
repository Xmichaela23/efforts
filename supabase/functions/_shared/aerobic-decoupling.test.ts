/**
 * The one drift rule (2026-09-27, `./aerobic-decoupling.ts`): the steady middle (20 minutes in, 10 from the end, at
 * least 20 left), halves by time,
 * each half's output over its average heart rate — normalized power on a ride, plain average speed on a run.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/aerobic-decoupling.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { steadyDecouplingPct } from './aerobic-decoupling.ts';
import { computeRideEfficiency } from './cycling-v1/ride-physiology.ts';
import { runDecouplingPct } from './run-pace.ts';
import { calculateEfficiency } from '../analyze-running-workout/lib/heart-rate/efficiency.ts';

const seconds = (n: number) => Array.from({ length: n }, (_, i) => i);

Deno.test('the warm-up and the cool-down are left out: the first 20 minutes and the last 10', () => {
  // 60 minutes. Heart rate climbs through the first 20 and output falls in the last 10; the middle holds.
  const t = seconds(3600);
  const hr = t.map((i) => (i < 1200 ? 110 + (i / 1200) * 35 : 145));
  const out = t.map((i) => (i > 3000 ? 120 : 200));
  assertEquals(steadyDecouplingPct(t, hr, out, 'normalized'), 0);
  assertEquals(steadyDecouplingPct(t, hr, out, 'average'), 0);
});

Deno.test('exactly 50 minutes reads; a second less does not (20 in, 10 out, 20 left)', () => {
  const t = seconds(3001); // 0..3000 s → middle 1200..2400
  assertEquals(steadyDecouplingPct(t, t.map(() => 150), t.map(() => 200), 'normalized'), 0);
  const short = seconds(3000); // 0..2999 s
  assertEquals(steadyDecouplingPct(short, short.map(() => 150), short.map(() => 200), 'normalized'), null);
});

Deno.test('a 30-minute session has no drift', () => {
  const t = seconds(1800);
  assertEquals(steadyDecouplingPct(t, t.map(() => 150), t.map(() => 200), 'normalized'), null);
  assertEquals(steadyDecouplingPct(t, t.map(() => 150), t.map(() => 200), 'average'), null);
});

Deno.test('positive when heart rate rises against held output, to one decimal', () => {
  const t = seconds(3601); // 0..3600 s → steady middle 1200..3000, split at 2100
  const hr = t.map((i) => (i < 2100 ? 140 : 150));
  // (200/140 − 200/150) ÷ (200/140) = 6.67%
  assertEquals(steadyDecouplingPct(t, hr, t.map(() => 200), 'normalized'), 6.7);
});

Deno.test('⛔ halves are split by TIME: a gap in the recording does not move the split', () => {
  // 60 minutes with nothing recorded from 1300 s to 2000 s. The middle is 1200..3000, split at 2100 s: the first half
  // holds 200 samples, the second 901. Split by count, the first half would reach 2450 s and take in seconds from the
  // second half's heart rate.
  const t = seconds(3601).filter((i) => i < 1300 || i >= 2000);
  const hr = t.map((i) => (i < 2100 ? 140 : 150));
  assertEquals(steadyDecouplingPct(t, hr, t.map(() => 200), 'normalized'), 6.7);
});

Deno.test('a ride\'s half is its NORMALIZED power (TrainingPeaks EF); a run\'s half is its plain AVERAGE speed', () => {
  // Both halves average 200. The second surges 0 / 400 in 30-second blocks. On a ride its normalized power is higher
  // and the same heart rate buys more: drift reads negative. On a run the average is taken as it is: 0.
  const t = seconds(3600); // middle 1200..2999, halves 1200..2099 and 2100..2999: thirty 30-second blocks in the second
  const out = t.map((i) => (i < 2100 ? 200 : Math.floor(i / 30) % 2 === 0 ? 400 : 0));
  const ride = steadyDecouplingPct(t, t.map(() => 150), out, 'normalized')!;
  assert(ride < -10, `expected a clearly negative drift, got ${ride}`);
  assertEquals(steadyDecouplingPct(t, t.map(() => 150), out, 'average'), 0);
});

Deno.test('heart rate is every heart-rate second in the half; a missing reading is skipped, not zero', () => {
  const t = seconds(3601);
  const hr = t.map((i) => (i % 10 === 0 ? null : 150));
  assertEquals(steadyDecouplingPct(t, hr, t.map(() => 200), 'normalized'), 0);
});

/**
 * The same session as a ride and as a run. Watts on the ride; on the run a speed of watts ÷ 100 m/s (a scale cancels in
 * the ratio), no elevation, so the run's output is its speed. `stopAt` seconds for `stopS` seconds: 0 output, heart
 * rate 105 — the watch kept recording through the stop.
 */
function session(seconds: number, opts: { stopAt?: number; stopS?: number } = {}) {
  const t = Array.from({ length: seconds }, (_, i) => i);
  const stopped = (i: number) => opts.stopAt != null && i >= opts.stopAt && i < opts.stopAt + (opts.stopS ?? 0);
  const watts = t.map((i) => (stopped(i) ? 0 : 200 + 20 * Math.sin(i / 240)));
  const hr = t.map((i) => (stopped(i) ? 105 : 138 + i / 350));
  let d = 0;
  const rows = t.map((i) => {
    const v = watts[i] / 100;
    if (i > 0) d += v;
    return { t: i, d, v, hr: hr[i] };
  });
  return { t, watts, hr, rows };
}

/** The run's stream as the rule reads it: each second's speed, a stopped second (speed 0 here) at 0. */
const speeds = (rows: Array<{ v: number }>) => rows.map((r, i) => (i === 0 ? 0 : r.v));

Deno.test('⛔ one rule: the ride reads normalized power per half, the run the average speed per half', () => {
  // 70 minutes: output wanders ±10% and heart rate creeps up 12 bpm.
  const { t, watts, hr, rows } = session(4200);
  const ride = computeRideEfficiency(t, hr, watts, 200, 145)!.aerobic_decoupling_pct;
  assert(typeof ride === 'number' && ride > 0, `ride ${ride}`);
  assertEquals(ride, steadyDecouplingPct(t, hr, watts, 'normalized'));
  const run = runDecouplingPct(rows);
  assertEquals(run, { pct: steadyDecouplingPct(t, hr, speeds(rows), 'average')!, basis: 'raw' });
  assert(run!.pct > 0, `run ${run!.pct}`);
});

Deno.test('⛔ A STOP COUNTS ON A RUN AS ON A RIDE: 0 output, its heart rate in its half (2026-09-27)', () => {
  // 60 minutes with a 4-minute stop at minute 42. The run analyser's samples dropped the stopped seconds, so the run
  // read 0.0% where the ride read 1.9%. The run now reads the recording's rows, stops included.
  const { t, hr, rows } = session(3600, { stopAt: 42 * 60, stopS: 240 });
  const every = steadyDecouplingPct(t, hr, speeds(rows), 'average');
  assert(typeof every === 'number' && every !== 0, `every second ${every}`);
  assertEquals(runDecouplingPct(rows)?.pct, every);
  // Dropping the stopped seconds, as the analyser's samples did, reads a different number.
  const moving = t.filter((i) => i < 42 * 60 || i >= 42 * 60 + 240);
  assert(steadyDecouplingPct(moving, moving.map((i) => hr[i]), moving.map((i) => speeds(rows)[i]), 'average') !== every);
  // Through the analyser's own entry point, on the rows `normalizeSamples` writes (`v_mps`).
  const analyser = calculateEfficiency(rows.map((r) => ({ t: r.t, d: r.d, v_mps: r.v, hr: r.hr })));
  assertEquals(analyser?.decoupling.percent, every);
});

Deno.test('⛔ the 20 minutes left out count from the recording\'s first second, not the first moving one', () => {
  // 52 minutes, the first 3 standing for GPS. From the recording's start the middle is 1200..2520 s (22 minutes) and
  // reads; from the first moving second it would be 19 minutes and would not.
  const { t, watts, hr, rows } = session(52 * 60, { stopAt: 0, stopS: 180 });
  const ride = computeRideEfficiency(t, hr, watts, 200, 145)!.aerobic_decoupling_pct;
  assert(typeof ride === 'number', `ride ${ride}`);
  assertEquals(runDecouplingPct(rows)?.pct, steadyDecouplingPct(t, hr, speeds(rows), 'average'));
  assert(typeof runDecouplingPct(rows)?.pct === 'number');
});
