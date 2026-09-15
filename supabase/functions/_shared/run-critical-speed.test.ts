/**
 * The run threshold suggestion — critical speed from best efforts (Smyth & Muniz-Pumares 2020).
 *
 * Run: deno test supabase/functions/_shared/run-critical-speed.test.ts --no-check
 *
 * ⛔ ATHLETE-AGNOSTIC. Every fixture is built FROM a chosen critical speed, so a test asserts "the fit recovers the
 * speed the data was built with", not "the fit returns the number I saw once".
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildRunDistanceBests,
  buildRunPaceCurve,
  fitRunThresholdFromBestEfforts,
  RUN_BEST_EFFORT_DISTANCES_M,
  type RunCsRun,
} from '../../../src/lib/run-critical-speed.ts';

const AS_OF = '2026-09-14';
const LTHR = 170;
/** 3.2 m/s ≈ 8:23/mi, D′ 180 m. Nothing depends on the exact values. */
const CS = 3.2;
const DP = 180;

const dayBefore = (n: number) => new Date(Date.parse(`${AS_OF}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const timeFor = (cs: number, dp: number, m: number) => (m - dp) / cs;

/** `count` runs across the window; run i carries the best effort at distance i (on a different day each). */
function history(opts: { cs?: number; dp?: number; count?: number; distances?: readonly number[]; net?: number; hard45?: { distanceM: number; avgHr: number } } = {}): RunCsRun[] {
  const cs = opts.cs ?? CS, dp = opts.dp ?? DP, count = opts.count ?? 30;
  const distances = opts.distances ?? RUN_BEST_EFFORT_DISTANCES_M;
  const runs: RunCsRun[] = [];
  for (let i = 0; i < count; i++) runs.push({ date: dayBefore(i * 3 + 1), distanceBests: null, paceCurve: null });
  distances.forEach((m, i) => {
    runs[i].distanceBests = { [String(m)]: { distanceM: m, timeS: timeFor(cs, dp, m), avgHr: 160, netAscentM: opts.net ?? 0 } };
  });
  if (opts.hard45) runs[count - 1].paceCurve = { '2700': { distanceM: opts.hard45.distanceM, timeS: 2700, avgHr: opts.hard45.avgHr, netAscentM: 0 } };
  return runs;
}

Deno.test('it recovers the critical speed the efforts were built from, across beginner to elite', () => {
  for (const cs of [2.4, 3.2, 4.0, 5.2]) {
    const r = fitRunThresholdFromBestEfforts(history({ cs }), AS_OF, LTHR, null);
    assert(r.csSecPerKm != null, r.reason);
    assert(Math.abs(r.csSecPerKm! - 1000 / cs) <= 1, `${r.csSecPerKm} vs ${1000 / cs}`);
    assertEquals(r.dPrimeM, DP);
    assertEquals(r.nPoints, 6);
  }
});

Deno.test('no heart-rate check on the distance efforts (the paper had none)', () => {
  const runs = history();
  for (const r of runs) for (const p of Object.values(r.distanceBests ?? {})) p.avgHr = 120;
  assert(fitRunThresholdFromBestEfforts(runs, AS_OF, LTHR, null).csSecPerKm != null);
});

Deno.test('fewer than 24 runs in the 16 weeks: no suggestion', () => {
  const r = fitRunThresholdFromBestEfforts(history({ count: 23 }), AS_OF, LTHR, null);
  assertEquals(r.csSecPerKm, null);
  assert(/24/.test(r.reason));
});

Deno.test('runs older than 16 weeks do not count toward the 24 or supply efforts', () => {
  const runs = history({ count: 30 });
  for (let i = 0; i < 10; i++) runs[29 - i].date = dayBefore(200 + i);
  assertEquals(fitRunThresholdFromBestEfforts(runs, AS_OF, LTHR, null).csSecPerKm, null);
});

Deno.test('fewer than three distances: no suggestion', () => {
  assertEquals(fitRunThresholdFromBestEfforts(history({ distances: [400, 5000] }), AS_OF, LTHR, null).csSecPerKm, null);
  assert(fitRunThresholdFromBestEfforts(history({ distances: [400, 800, 5000] }), AS_OF, LTHR, null).csSecPerKm != null);
});

Deno.test('a downhill effort is refused and the next fastest level one is used', () => {
  const runs = history({ distances: [400, 800, 5000] });
  runs[20].distanceBests = { '800': { distanceM: 800, timeS: 150, avgHr: 150, netAscentM: -20 } };   // 2.5% drop
  const r = fitRunThresholdFromBestEfforts(runs, AS_OF, LTHR, null);
  assert(r.csSecPerKm != null && Math.abs(r.csSecPerKm - 1000 / CS) <= 1, r.reason);
});

Deno.test('the best 45 minutes counts only when its heart rate reached 95% of threshold', () => {
  const slow45 = { distanceM: 2.6 * 2700 };   // an easy 45 minutes, far below the line
  const easy = fitRunThresholdFromBestEfforts(history({ hard45: { ...slow45, avgHr: Math.round(LTHR * 0.9) } }), AS_OF, LTHR, null);
  assertEquals(easy.nPoints, 6);
  assert(easy.points.every((p) => p.label !== 'best 45 min'));
  const hard = fitRunThresholdFromBestEfforts(history({ hard45: { distanceM: CS * 2700 + DP, avgHr: Math.round(LTHR * 0.95) } }), AS_OF, LTHR, null);
  assertEquals(hard.nPoints, 7);
  // With no threshold heart rate the 45-minute point is left out, never guessed in.
  assertEquals(fitRunThresholdFromBestEfforts(history({ hard45: { distanceM: CS * 2700 + DP, avgHr: 200 } }), AS_OF, null, null).nPoints, 6);
});

Deno.test('no order check: a 1000 m a touch faster than the 800 m still fits (the paper has no such check)', () => {
  const runs = history();
  runs[2].distanceBests = { '1000': { distanceM: 1000, timeS: timeFor(CS, DP, 1000) - 5, avgHr: 160, netAscentM: 0 } };
  assert(fitRunThresholdFromBestEfforts(runs, AS_OF, LTHR, null).csSecPerKm != null);
});

Deno.test('all efforts from one run: no suggestion', () => {
  const runs = history({ distances: [] });
  runs[0].distanceBests = Object.fromEntries(RUN_BEST_EFFORT_DISTANCES_M.map((m) => [String(m), { distanceM: m, timeS: timeFor(CS, DP, m), avgHr: 160, netAscentM: 0 }]));
  assertEquals(fitRunThresholdFromBestEfforts(runs, AS_OF, LTHR, null).csSecPerKm, null);
});

Deno.test('not at least 4% faster than easy pace: no suggestion', () => {
  const csKm = 1000 / CS;
  assertEquals(fitRunThresholdFromBestEfforts(history(), AS_OF, LTHR, csKm * 1.02).csSecPerKm, null);
  assert(fitRunThresholdFromBestEfforts(history(), AS_OF, LTHR, csKm * 1.2).csSecPerKm != null);
});

Deno.test('a suggestion carries its receipt: the efforts, the newest date, the reason', () => {
  const r = fitRunThresholdFromBestEfforts(history(), AS_OF, LTHR, null);
  assertEquals(r.points.length, 6);
  assertEquals(r.asOf, dayBefore(1));
  assertEquals(r.confidence, 'high');
  assert(/400 m/.test(r.reason) && /5000 m/.test(r.reason));
});

Deno.test('DISTANCE BESTS: the fastest 400 m inside a run, timed on moving seconds', () => {
  // 20 minutes at 3 m/s, a 60-second surge at 5 m/s, and a 90-second stop that moving time leaves out.
  const d: number[] = [], mov: number[] = [], hr: (number | null)[] = [];
  let dist = 0, m = 0;
  for (let t = 0; t <= 1200; t++) {
    const stopped = t > 600 && t <= 690;
    const v = stopped ? 0 : (t > 300 && t <= 380 ? 5 : 3);
    if (t > 0) { dist += v; if (!stopped) m += 1; }
    d.push(dist); mov.push(m); hr.push(150);
  }
  const bests = buildRunDistanceBests(d, mov, hr)!;
  assert(Math.abs(bests['400'].timeS - 80) < 1, `400 m in ${bests['400'].timeS}`);
  assert(bests['5000'] == null, 'a 3.5 km run has no 5 km best');
  // A stop inside a 3 km window does not slow it: 3000 m at 3 m/s with the surge ≈ 947 s of moving time.
  assert(bests['3000'].timeS < 1000, `3000 m in ${bests['3000'].timeS}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// THE EXTRACTOR — what one run contributes
// ═══════════════════════════════════════════════════════════════════════════

/** A synthetic run: `n` seconds at `paceSecPerKm`, with an optional faster surge spliced in. */
function syntheticRun(
  totalS: number,
  paceSecPerKm: number,
  surge?: { atS: number; lenS: number; paceSecPerKm: number },
  hr = 140,
  surgeHr = 170,
) {
  const timeS: number[] = [];
  const distanceM: number[] = [];
  const hrBpm: (number | null)[] = [];
  const elevationM: (number | null)[] = [];
  let d = 0;
  for (let t = 0; t <= totalS; t++) {
    const inSurge = surge != null && t > surge.atS && t <= surge.atS + surge.lenS;
    const p = inSurge ? surge!.paceSecPerKm : paceSecPerKm;
    d += 1000 / p;                       // metres this second
    timeS.push(t);
    distanceM.push(d);
    hrBpm.push(inSurge ? surgeHr : hr);
    elevationM.push(0);
  }
  return { timeS, distanceM, hrBpm, elevationM };
}

Deno.test('EXTRACTOR: finds the surge, not the average', () => {
  // 40 min at 6:00/km with a 12-minute block at 4:30/km buried in the middle. The whole-activity
  // average is ~5:40/km — the number the old learner would have used. The 12-minute window is 4:30.
  const r = syntheticRun(2400, 360, { atS: 900, lenS: 720, paceSecPerKm: 270 });
  const curve = buildRunPaceCurve(r.distanceM, r.timeS, r.hrBpm, r.elevationM)!;
  assert(curve != null, 'no curve built');
  const w720 = curve['720'];
  assert(w720 != null, 'no 12-minute window');
  const paceSecPerKm = w720.timeS / (w720.distanceM / 1000);
  assert(Math.abs(paceSecPerKm - 270) < 5, `12-min window came out ${paceSecPerKm.toFixed(0)} s/km, expected ~270`);
  // And it carried the surge's heart rate, which is what the hard-effort gate will read.
  assertEquals(w720.avgHr, 170);
});

Deno.test('EXTRACTOR: a steady run reports its own pace at every duration', () => {
  const r = syntheticRun(2400, 300);
  const curve = buildRunPaceCurve(r.distanceM, r.timeS, r.hrBpm, r.elevationM)!;
  for (const key of ['180', '360', '720', '1200']) {
    const w = curve[key];
    assert(w != null, `missing ${key}`);
    const pace = w.timeS / (w.distanceM / 1000);
    assert(Math.abs(pace - 300) < 3, `${key}: ${pace.toFixed(0)} s/km`);
  }
});

Deno.test('EXTRACTOR: only durations the run actually contains', () => {
  const r = syntheticRun(600, 300);                 // 10 minutes
  const curve = buildRunPaceCurve(r.distanceM, r.timeS, r.hrBpm, r.elevationM)!;
  assert(curve['180'] != null);
  assert(curve['360'] != null);
  assertEquals(curve['720'], undefined, 'invented a 12-minute window inside a 10-minute run');
  assertEquals(curve['1200'], undefined);
});

Deno.test('EXTRACTOR: too little data returns nothing rather than a guess', () => {
  assertEquals(buildRunPaceCurve([1, 2], [1, 2], [null, null]), null);
  assertEquals(buildRunPaceCurve([], [], []), null);
});

Deno.test('EXTRACTOR: a SPARSE trace is refused even when it spans the duration', () => {
  // ⛔ THE TEST THAT WAS MISSING, found by mutation: the two cases above are refused by the scan
  // itself, so they proved nothing about the resolution floor. Three samples across twelve minutes
  // DO span a 3-minute window — and a "best 3 minutes" interpolated between two points is not a
  // measurement. Removing the floor makes this return a curve.
  const timeS = [0, 300, 720];
  const distanceM = [0, 1000, 2400];
  assertEquals(buildRunPaceCurve(distanceM, timeS, [150, 150, 150], [0, 0, 0]), null);
});

Deno.test('EXTRACTOR: net elevation travels with the window', () => {
  const r = syntheticRun(1500, 300);
  for (let i = 0; i < r.elevationM.length; i++) r.elevationM[i] = -i * 0.05;   // steady descent
  const curve = buildRunPaceCurve(r.distanceM, r.timeS, r.hrBpm, r.elevationM)!;
  assert((curve['720']!.netAscentM ?? 0) < 0, 'a descending run reported no net descent');
});

Deno.test('the margin IS the app\'s divergence band — pinned so the two cannot drift', async () => {
  const science = await Deno.readTextFile(new URL('../generate-combined-plan/science.ts', import.meta.url));
  const m = science.match(/RUN_PACE_DIVERGENCE_THRESHOLD\s*=\s*([0-9.]+)/);
  assert(m, 'the divergence constant moved or was renamed');
  const cs = await Deno.readTextFile(new URL('../../../src/lib/run-critical-speed.ts', import.meta.url));
  const local = cs.match(/CS_MIN_MARGIN_ON_EASY\s*=\s*([0-9.]+)/);
  assert(local, 'the critical-speed margin moved or was renamed');
  assertEquals(local![1], m![1], 'the two copies of the ±4% band have drifted apart');
});
