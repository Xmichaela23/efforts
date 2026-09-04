/**
 * Run: ~/.deno/bin/deno test src/lib/bike-ftp-estimator.test.ts --no-check
 *
 * Synthetic streams with a KNOWN answer, plus every abstain path the spec names: too-narrow heart-rate
 * range, too few minutes, too few durations, absurd W'. Aerobic decoupling is never read. docs/SPEC-ftp-estimator-2026-09-04.md.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildHrPowerBlocks,
  fitRidePowerAtThresholdHr,
  estimateFtpFromHrPower,
  bestPerDuration,
  fitCriticalPower,
  compoundFtp,
  rateLimitFtp,
  POWER_CURVE_DURATIONS,
  type SignalAResult,
  type SignalBResult,
} from './bike-ftp-estimator.ts';

// ─── synthetic ride: 1 Hz, power ramps, heart rate = a + b·power (+ optional noise) ──────────────

function syntheticRide(opts: {
  minutes: number;
  powerAt: (minute: number) => number;
  hrOfPower: (p: number) => number;
  coastEvery?: number; // every Nth minute is coasting (power 0)
  noHr?: boolean;
}) {
  const time_s: number[] = [], hr: (number | null)[] = [], w: (number | null)[] = [];
  for (let t = 0; t < opts.minutes * 60; t++) {
    const minute = Math.floor(t / 60);
    const coasting = opts.coastEvery ? (minute % opts.coastEvery === 0) : false;
    const p = coasting ? 0 : opts.powerAt(minute);
    time_s.push(t);
    w.push(p);
    hr.push(opts.noHr ? null : Math.round(opts.hrOfPower(p)));
  }
  return { time_s, hr, w };
}

const HR_OF_P = (p: number) => 60 + 0.5 * p; // threshold 165 bpm ⇒ 210 W

Deno.test('buildHrPowerBlocks — skips the first 10 minutes and coasting minutes, one pair per steady minute', () => {
  const r = syntheticRide({ minutes: 40, powerAt: () => 150, hrOfPower: HR_OF_P, coastEvery: 5 });
  const b = buildHrPowerBlocks(r.time_s, r.hr, r.w)!;
  assert(b);
  assertEquals(b.skipped_s, 600);
  assertEquals(b.block_s, 60);
  // minutes 10..39 = 30 minutes, minus coasting minutes 10,15,20,25,30,35 = 24
  assertEquals(b.hr.length, 24);
  assertEquals(b.w.length, 24);
  assertEquals(b.w[0], 150);
  assertEquals(b.hr[0], 135);
});

Deno.test('buildHrPowerBlocks — null when the ride carries no heart rate', () => {
  const r = syntheticRide({ minutes: 40, powerAt: () => 150, hrOfPower: HR_OF_P, noHr: true });
  assertEquals(buildHrPowerBlocks(r.time_s, r.hr, r.w), null);
});

Deno.test('Signal A — a ramped easy ride projects the known answer at threshold heart rate', () => {
  // power 100→190 W across the ride ⇒ heart rate 110→155; threshold 165 is 10 bpm above the top,
  // inside the extrapolation cap (span 45). Known answer: 60 + 0.5·210 = 165 ⇒ 210 W.
  const r = syntheticRide({ minutes: 70, powerAt: (m) => 100 + (m / 69) * 90, hrOfPower: HR_OF_P });
  const fit = fitRidePowerAtThresholdHr(buildHrPowerBlocks(r.time_s, r.hr, r.w), 165);
  assertEquals(fit.reason, 'fit');
  assert(Math.abs((fit.wattsAtThreshold ?? 0) - 210) <= 2, `got ${fit.wattsAtThreshold}`);
  assert((fit.r2 ?? 0) > 0.99);
});

Deno.test('Signal A — abstains when the heart rate range is too narrow to fit a slope', () => {
  const r = syntheticRide({ minutes: 60, powerAt: () => 150, hrOfPower: HR_OF_P });
  const fit = fitRidePowerAtThresholdHr(buildHrPowerBlocks(r.time_s, r.hr, r.w), 165);
  assertEquals(fit.wattsAtThreshold, null);
  assert(/spanned/.test(fit.reason), fit.reason);
});

Deno.test('Signal A — abstains when threshold sits further above the data than the fitted span', () => {
  // power 100→150 ⇒ heart rate 110→135, span ~20 after the warm-up skip; threshold 165 is 30 above. Refuse.
  const r = syntheticRide({ minutes: 60, powerAt: (m) => 100 + (m / 59) * 50, hrOfPower: HR_OF_P });
  const fit = fitRidePowerAtThresholdHr(buildHrPowerBlocks(r.time_s, r.hr, r.w), 165);
  assertEquals(fit.wattsAtThreshold, null);
  assert(/above the highest fitted/.test(fit.reason), fit.reason);
});

Deno.test('Signal A — abstains under 15 usable minutes', () => {
  const r = syntheticRide({ minutes: 20, powerAt: (m) => 100 + m * 5, hrOfPower: HR_OF_P });
  const fit = fitRidePowerAtThresholdHr(buildHrPowerBlocks(r.time_s, r.hr, r.w), 165);
  assertEquals(fit.wattsAtThreshold, null);
  assert(/need 15/.test(fit.reason), fit.reason);
});

Deno.test('Signal A — blocks above threshold are cut before the fit', () => {
  // power 100→260 ⇒ heart rate up to 190; only blocks ≤165 are fitted, and the line still reads 210.
  const r = syntheticRide({ minutes: 90, powerAt: (m) => 100 + (m / 89) * 160, hrOfPower: HR_OF_P });
  const fit = fitRidePowerAtThresholdHr(buildHrPowerBlocks(r.time_s, r.hr, r.w), 165);
  assertEquals(fit.reason, 'fit');
  assertEquals(fit.extrapolationBpm, 0);
  assert(Math.abs((fit.wattsAtThreshold ?? 0) - 210) <= 2, `got ${fit.wattsAtThreshold}`);
});

Deno.test('Signal A aggregate — median across rides, every ride contributes', () => {
  const mk = (slopeNoise: number) => {
    const r = syntheticRide({ minutes: 70, powerAt: (m) => 100 + (m / 69) * 160, hrOfPower: (p) => 60 + (0.5 + slopeNoise) * p });
    return buildHrPowerBlocks(r.time_s, r.hr, r.w);
  };
  const rides = [
    { date: '2026-08-01', blocks: mk(0) },
    { date: '2026-08-03', blocks: mk(0.005) },
    { date: '2026-08-05', blocks: mk(-0.005) },
    { date: '2026-08-07', blocks: mk(0.002) },
    { date: '2026-08-09', blocks: mk(-0.002) },
  ];
  const a = estimateFtpFromHrPower(rides, 165);
  assertEquals(a.n, 5);
  assertEquals(a.confidence, 'high');
  assert(Math.abs((a.value ?? 0) - 210) <= 3, `got ${a.value}`);
  assert(a.rides.every((r) => r.reason === 'fit'), a.rides.map((r) => r.reason).join('|'));
});

Deno.test('buildHrPowerBlocks — heart rate is read one lag (30 s) after the power it answers', () => {
  // power steps 100 → 200 W at minute 20; heart rate follows the step 30 s later.
  const time_s: number[] = [], hr: number[] = [], w: number[] = [];
  for (let t = 0; t < 40 * 60; t++) {
    time_s.push(t);
    w.push(t < 1200 ? 100 : 200);
    hr.push(t < 1230 ? 110 : 160);
  }
  const b = buildHrPowerBlocks(time_s, hr, w)!;
  // block for minute 19 (power 100) reads HR over 19:30–20:30 → still 110 (lagged); minute 20 reads 20:30–21:30 → 160.
  const i19 = 9, i20 = 10; // blocks start at minute 10
  assertEquals(b.w[i19], 100); assertEquals(b.hr[i19], 110);
  assertEquals(b.w[i20], 200); assertEquals(b.hr[i20], 160);
});

Deno.test('Signal A aggregate — abstains with no threshold heart rate, and when no ride has blocks', () => {
  assertEquals(estimateFtpFromHrPower([{ date: 'x', blocks: null }], null).value, null);
  const a = estimateFtpFromHrPower([{ date: 'x', blocks: null }, { date: 'y', blocks: undefined }], 165);
  assertEquals(a.value, null);
  assertEquals(a.n, 0);
});

// ─── Signal B ────────────────────────────────────────────────────────────────────────────────────

const CP = 250, WP = 20_000;
const pAt = (s: number) => Math.round(CP + WP / s);

Deno.test('POWER_CURVE_DURATIONS — the twelve stored labels, 20min and 60min unchanged', () => {
  assertEquals(POWER_CURVE_DURATIONS.map((d) => d.label), ['5s', '1min', '2min', '3min', '5min', '8min', '10min', '12min', '20min', '30min', '45min', '60min']);
  assertEquals(POWER_CURVE_DURATIONS.find((d) => d.label === '20min')!.seconds, 1200);
});

Deno.test('bestPerDuration — takes the best at each duration across rides, ignores _hr', () => {
  const pts = bestPerDuration([
    { '5min': 280, '20min': 240, _hr: { '20min': 160 } },
    { '5min': 300, '2min': 350 },
    null,
  ]);
  assertEquals(pts, [{ seconds: 120, watts: 350 }, { seconds: 300, watts: 300 }, { seconds: 1200, watts: 240 }]);
});

Deno.test('Signal B — recovers CP and W\' from a curve generated by the model, FTP = 0.97 × CP', () => {
  const pts = [120, 180, 300, 600, 1200, 1800].map((s) => ({ seconds: s, watts: pAt(s) }));
  const b = fitCriticalPower(pts);
  assert(b.value != null, b.reason);
  assertEquals(b.n, 5); // 30 min sits outside the model's domain
  assert(Math.abs((b.cp ?? 0) - CP) <= 1, `cp ${b.cp}`);
  assert(Math.abs((b.wPrime ?? 0) - WP) <= 400, `W' ${b.wPrime}`);
  assert(Math.abs((b.value ?? 0) - CP * 0.97) <= 1, `ftp ${b.value}`);
  assertEquals(b.confidence, 'high');
});

Deno.test('Signal B — a curve that bends below the model past 20 min still fits on 2-20 (the first back-run\'s athlete)', () => {
  const pts = [[2, 256], [3, 229], [5, 210], [8, 193], [10, 191], [12, 186], [20, 177], [30, 158], [45, 150], [60, 132]]
    .map(([m, w]) => ({ seconds: m * 60, watts: w }));
  const b = fitCriticalPower(pts);
  assert(b.value != null, b.reason);
  assertEquals(b.n, 7);
  assert((b.r2 ?? 0) >= 0.99, `r² ${b.r2}`);
  assert(Math.abs((b.cp ?? 0) - 172) <= 1, `cp ${b.cp}`);
  assertEquals(b.value, 167);
});

Deno.test('Signal B — sprint durations are excluded from the fit', () => {
  const pts = [5, 60, 120, 300, 1200].map((s) => ({ seconds: s, watts: s <= 60 ? 900 : pAt(s) }));
  const b = fitCriticalPower(pts);
  assertEquals(b.n, 3);
  assert(Math.abs((b.cp ?? 0) - CP) <= 1, `cp ${b.cp}`);
  assertEquals(b.confidence, 'medium');
});

Deno.test('Signal B — abstains on fewer than 3 aerobic-band durations', () => {
  const b = fitCriticalPower([{ seconds: 300, watts: 300 }, { seconds: 1200, watts: 260 }]);
  assertEquals(b.value, null);
  assert(/need 3/.test(b.reason), b.reason);
});

Deno.test('Signal B — abstains on a physiologically absurd W\'', () => {
  const pts = [120, 300, 600, 1200].map((s) => ({ seconds: s, watts: Math.round(200 + 90_000 / s) }));
  const b = fitCriticalPower(pts);
  assertEquals(b.value, null);
  assert(/implausible W'/.test(b.reason), b.reason);
});

Deno.test('Signal B — abstains when the points do not describe one curve', () => {
  const b = fitCriticalPower([
    { seconds: 120, watts: 320 }, { seconds: 300, watts: 240 }, { seconds: 600, watts: 300 }, { seconds: 1200, watts: 230 },
  ]);
  assertEquals(b.value, null);
  assert(/r²|does not fall/.test(b.reason), b.reason);
});

// ─── combining ───────────────────────────────────────────────────────────────────────────────────

const sigA = (value: number | null, confidence: SignalAResult['confidence'], n = 5): SignalAResult => ({ value, confidence, n, reason: 'a', rides: [] });
const sigB = (value: number | null, confidence: SignalBResult['confidence'], n = 4): SignalBResult => ({ value, confidence, n, reason: 'b', cp: value, wPrime: 20000, r2: 0.97, points: [] });

Deno.test('compound — both confident and disagreeing ⇒ the LOWER, at medium', () => {
  const c = compoundFtp(sigA(230, 'high'), sigB(200, 'medium'), null)!;
  assertEquals(c.value, 200);
  assertEquals(c.confidence, 'medium');
  assert(/lower of two confident signals/.test(c.source));
});

Deno.test('compound — both confident and agreeing within noise ⇒ the higher-confidence one keeps its confidence', () => {
  const c = compoundFtp(sigA(205, 'high'), sigB(200, 'medium'), null)!;
  assertEquals(c.value, 205);
  assertEquals(c.confidence, 'high');
});

Deno.test('compound — no HR read falls through to the curve (the no-HR athlete)', () => {
  const c = compoundFtp(sigA(null, null, 0), sigB(210, 'medium'), null)!;
  assertEquals(c.value, 210);
  assertEquals(c.confidence, 'medium');
  assert(/no HR-power read/.test(c.source));
});

Deno.test('compound — both abstain ⇒ null, never a fabricated number', () => {
  assertEquals(compoundFtp(sigA(null, null, 0), sigB(null, null, 1), 220), null);
});

Deno.test('compound — hard ceiling: never above the best 20-min actually recorded', () => {
  const c = compoundFtp(sigA(215, 'high'), sigB(218, 'high'), 190)!;
  assertEquals(c.value, 190);
  assertEquals(c.ceiling_20min, 190);
  assert(/hard ceiling/.test(c.source));
});

Deno.test('rateLimit — at most 5% per learn in either direction, untouched with no prior', () => {
  const next = compoundFtp(sigA(200, 'high'), sigB(202, 'high'), null)!;
  assertEquals(rateLimitFtp(168, next).value, 176);
  assertEquals(rateLimitFtp(240, next).value, 228);
  assertEquals(rateLimitFtp(198, next).value, 200);
  assertEquals(rateLimitFtp(null, next).value, 200);
});
