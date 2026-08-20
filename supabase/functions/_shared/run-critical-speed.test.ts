/**
 * Fixtures for `fitRunCriticalSpeed` — the MEASURED run threshold, fitted from best efforts.
 *
 * Run: deno test supabase/functions/_shared/run-critical-speed.test.ts --no-check
 *
 * ⛔ ATHLETE-AGNOSTIC. Every fixture is generated FROM a chosen critical speed rather than typed as a
 * literal, so a test asserts "the fit recovers the speed the data was built with" instead of "the fit
 * returns the number I saw once". Sweeps span beginner to elite.
 *
 * ⛔ MUTATION-CHECKED. Results at the bottom.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildRunPaceCurve,
  fitRunCriticalSpeed,
  paceCurveToEfforts,
  type RunEffort,
} from '../../../src/lib/run-critical-speed.ts';

const THR_HR = 165;

/**
 * Build a best effort that lies EXACTLY on a chosen speed-duration curve:
 *   distance = CS · time + D'
 * so a correct fit must recover `csMps` and `dPrimeM` from any two or more of them.
 */
const effortOn = (csMps: number, dPrimeM: number, timeS: number, over: Partial<RunEffort> = {}): RunEffort => ({
  distanceM: csMps * timeS + dPrimeM,
  timeS,
  avgHr: THR_HR,          // hard by default; individual tests override
  netAscentM: 0,
  date: '2026-08-01',
  ...over,
});

/** 3.2 m/s ≈ 5:12/km ≈ 8:22/mi — a mid-pack runner. Nothing depends on the exact value. */
const CS = 3.2;
const DP = 180;
const clean = (): RunEffort[] => [
  effortOn(CS, DP, 240),   // 4 min
  effortOn(CS, DP, 600),   // 10 min
  effortOn(CS, DP, 1080),  // 18 min
  effortOn(CS, DP, 1500),  // 25 min
];

// ═══════════════════════════════════════════════════════════════════════════
// IT RECOVERS THE CURVE IT WAS GIVEN
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('recovers the critical speed the data was generated from', () => {
  const r = fitRunCriticalSpeed(clean(), THR_HR, null);
  assert(r.csSecPerKm != null, `abstained: ${r.reason}`);
  assertEquals(r.csSecPerKm, Math.round(1000 / CS));
  assertEquals(r.dPrimeM, DP);
  assertEquals(r.r2, 1);
  assertEquals(r.nPoints, 4);
});

Deno.test('SWEEP: recovers the curve across the whole range of runners', () => {
  // 2.4 m/s (a ~35 min 5K) to 5.4 m/s (elite). If it only works at one speed it is the wrong fit.
  for (const cs of [2.4, 2.8, 3.2, 3.6, 4.0, 4.5, 5.0, 5.4]) {
    for (const dp of [80, 150, 250, 400]) {
      const r = fitRunCriticalSpeed(
        [240, 600, 1080, 1500].map((t) => effortOn(cs, dp, t)),
        THR_HR,
        null,
      );
      assert(r.csSecPerKm != null, `cs=${cs} dp=${dp} abstained: ${r.reason}`);
      assertEquals(r.csSecPerKm, Math.round(1000 / cs), `cs=${cs} dp=${dp}`);
      // Both units describe the same speed.
      assertEquals(r.csSecPerMi, Math.round((1000 / cs) * 1.609344), `cs=${cs} dp=${dp}`);
    }
  }
});

Deno.test('two points is the minimum, and can never be better than low confidence', () => {
  // A line through two points has R² = 1 by construction — it is arithmetic, not evidence.
  const r = fitRunCriticalSpeed([effortOn(CS, DP, 300), effortOn(CS, DP, 1200)], THR_HR, null);
  assert(r.csSecPerKm != null, r.reason);
  assertEquals(r.nPoints, 2);
  assertEquals(r.confidence, 'low');
});

Deno.test('more points on a tight line earn more confidence', () => {
  assertEquals(fitRunCriticalSpeed(clean(), THR_HR, null).confidence, 'high');
  assertEquals(
    fitRunCriticalSpeed([effortOn(CS, DP, 240), effortOn(CS, DP, 600), effortOn(CS, DP, 1500)], THR_HR, null).confidence,
    'moderate',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// THE GATES — each abstains, none guesses
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('GATE: no threshold heart rate → abstain, never an ungated fit', () => {
  const r = fitRunCriticalSpeed(clean(), null, null);
  assertEquals(r.csSecPerKm, null);
  assert(/hard-effort gate/i.test(r.reason), r.reason);
});

Deno.test('GATE: efforts below the hard-effort floor are not threshold efforts', () => {
  // Every window at easy heart rate — the "best 6 minutes of a jog" case the whole fit exists to refuse.
  const easy = clean().map((e) => ({ ...e, avgHr: Math.round(THR_HR * 0.8) }));
  const r = fitRunCriticalSpeed(easy, THR_HR, null);
  assertEquals(r.csSecPerKm, null);
  assert(/threshold effort/i.test(r.reason), r.reason);
});

Deno.test('GATE: a window with NO heart rate is dropped, not assumed hard', () => {
  const noHr = clean().map((e) => ({ ...e, avgHr: null }));
  assertEquals(fitRunCriticalSpeed(noHr, THR_HR, null).csSecPerKm, null);
});

Deno.test('GATE: net downhill is gravity, not fitness', () => {
  // 2% net descent across every window — past the 1% the sport itself refuses for records.
  const downhill = clean().map((e) => ({ ...e, netAscentM: -0.02 * e.distanceM }));
  const r = fitRunCriticalSpeed(downhill, THR_HR, null);
  assertEquals(r.csSecPerKm, null);
  assert(/downhill/i.test(r.reason), r.reason);
});

Deno.test('GATE: rolling terrain that nets out flat is KEPT', () => {
  const rolling = clean().map((e) => ({ ...e, netAscentM: 2 }));
  assert(fitRunCriticalSpeed(rolling, THR_HR, null).csSecPerKm != null);
});

Deno.test('GATE: absent elevation is not evidence of a hill', () => {
  const noEle = clean().map((e) => ({ ...e, netAscentM: null }));
  assert(fitRunCriticalSpeed(noEle, THR_HR, null).csSecPerKm != null);
});

Deno.test('GATE: one session cannot supply the whole curve', () => {
  // Four windows all ~10 minutes land in ONE duration band; only the fastest survives.
  const oneSession = [600, 620, 640, 660].map((t) => effortOn(CS, DP, t));
  const r = fitRunCriticalSpeed(oneSession, THR_HR, null);
  assertEquals(r.csSecPerKm, null);
  assert(/duration band/i.test(r.reason), r.reason);
});

Deno.test('GATE: efforts outside 3-60 min are not on the curve', () => {
  // 90 s is anaerobic; 75 min drifts below CS for reasons that are not fitness.
  const r = fitRunCriticalSpeed([effortOn(CS, DP, 90), effortOn(CS, DP, 4500)], THR_HR, null);
  assertEquals(r.csSecPerKm, null);
});

Deno.test('GATE: a longer effort that is FASTER is not a real curve', () => {
  // The 20-minute window has to come out FASTER PER METRE than the 5-minute one, which takes a big
  // overshoot: 5 min sits at 0.263 s/m, so 20 min must beat that — 5000 m in 1200 s is 0.240 s/m.
  const bent = [
    effortOn(CS, DP, 300),
    { ...effortOn(CS, DP, 1200), distanceM: 5000 },
  ];
  const r = fitRunCriticalSpeed(bent, THR_HR, null);
  assertEquals(r.csSecPerKm, null);
  assert(/faster than a shorter one/i.test(r.reason), r.reason);
});

Deno.test('GATE: THE INVARIANT — a threshold slower than easy is REFUSED, never clamped', () => {
  // ⛔ The bug that started all of this, arriving at the measurement site. A fit is a MEASUREMENT, so
  // an impossible result means the windows were not what they looked like — the answer is to refuse,
  // not to correct it into range the way an inference is bounded.
  const slowCs = 2.0;                       // 8:20/km
  const easyPaceSecPerKm = 400;             // 6:40/km — faster than the "threshold" just fitted
  const r = fitRunCriticalSpeed(
    [240, 600, 1080, 1500].map((t) => effortOn(slowCs, DP, t)),
    THR_HR,
    easyPaceSecPerKm,
  );
  assertEquals(r.csSecPerKm, null);
  assert(/not faster than measured easy/i.test(r.reason), r.reason);
});

Deno.test('the invariant passes silently when the fit is coherent', () => {
  const r = fitRunCriticalSpeed(clean(), THR_HR, 380);   // easy 6:20/km, fitted CS ~5:12/km
  assert(r.csSecPerKm != null, r.reason);
  assert(r.csSecPerKm! < 380);
});

Deno.test('GATE: scattered points are refused even when every other gate passes', () => {
  // Hard, level, spread across bands, monotonic — but not on one line.
  const noisy: RunEffort[] = [
    effortOn(CS, DP, 240),
    { ...effortOn(CS, DP, 600), distanceM: CS * 600 * 0.90 },
    { ...effortOn(CS, DP, 1080), distanceM: CS * 1080 * 0.88 },
    { ...effortOn(CS, DP, 1500), distanceM: CS * 1500 * 0.60 },
  ];
  const r = fitRunCriticalSpeed(noisy, THR_HR, null);
  assertEquals(r.csSecPerKm, null);
  assert(/R²|faster than a shorter/i.test(r.reason), r.reason);
});

Deno.test('nothing in, nothing out — and it says which', () => {
  assertEquals(fitRunCriticalSpeed([], THR_HR, null).csSecPerKm, null);
  assertEquals(fitRunCriticalSpeed([], THR_HR, null).confidence, 'insufficient');
  // Malformed rows are dropped rather than crashing the fit.
  const junk = [{ distanceM: 0, timeS: 0, avgHr: null, date: '' }] as RunEffort[];
  assertEquals(fitRunCriticalSpeed(junk, THR_HR, null).csSecPerKm, null);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUTATIONS RUN 2026-08-20 — all killed. Baseline 17/17.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1  hard-effort gate removed                         -> easy-HR + no-HR tests fail
 *   2  hard-effort fraction dropped to 0.5              -> easy-HR test fails
 *   3  downhill gate removed                            -> downhill test fails
 *   4  absent elevation treated as downhill             -> absent-elevation test fails
 *   5  monotonic gate removed                           -> bent-curve test fails
 *   6  invariant gate CLAMPS instead of refusing        -> invariant test fails
 *   7  invariant gate removed                           -> invariant test fails
 *   8  R² floor removed                                 -> scattered-points test fails
 *   9  duration bucketing removed (all efforts kept)    -> one-session test fails
 *  10  two-point fit allowed to reach `high`            -> two-point confidence test fails
 *  11  null threshold HR runs the fit ungated           -> no-threshold-HR test fails
 *  12  CS read as sec/mi where sec/km is meant          -> recovery + sweep fail
 */

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

Deno.test('END TO END: a surge session feeds the fit and is REFUSED alone', () => {
  // One session, one duration band survives → the fit correctly refuses. This is the guard against
  // "he did one hard workout, now the app thinks it knows his threshold".
  const r = syntheticRun(2400, 360, { atS: 900, lenS: 720, paceSecPerKm: 270 });
  const curve = buildRunPaceCurve(r.distanceM, r.timeS, r.hrBpm, r.elevationM);
  const efforts = paceCurveToEfforts(curve, '2026-08-01');
  const fit = fitRunCriticalSpeed(efforts, 175, null);
  assertEquals(fit.csSecPerKm, null, `one session should not publish: ${fit.reason}`);
});

Deno.test('END TO END: two sessions at different durations DO publish', () => {
  const short = syntheticRun(1200, 360, { atS: 300, lenS: 300, paceSecPerKm: 250 });
  const long = syntheticRun(2400, 360, { atS: 600, lenS: 1200, paceSecPerKm: 285 });
  const efforts = [
    ...paceCurveToEfforts(buildRunPaceCurve(short.distanceM, short.timeS, short.hrBpm, short.elevationM), '2026-08-01'),
    ...paceCurveToEfforts(buildRunPaceCurve(long.distanceM, long.timeS, long.hrBpm, long.elevationM), '2026-08-08'),
  ];
  const fit = fitRunCriticalSpeed(efforts, 175, null);
  assert(fit.csSecPerKm != null, `abstained: ${fit.reason}`);
  // The fitted threshold sits between the two efforts' paces, which is what an asymptote should do.
  assert(fit.csSecPerKm! > 250 && fit.csSecPerKm! < 400, `${fit.csSecPerKm} s/km is not between the efforts`);
});
