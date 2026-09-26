/**
 * ⛔ THE BIKE'S THRESHOLD HEART RATE IS READ BY THE RUN'S RULE (2026-09-26, Michael: "yeah lets do that").
 *
 * TrainingPeaks: "your best 60-minute average heart rate, or 95% of your best 20-minute average heart rate, whichever
 * is higher" (trainingpeaks.com/blog/are-you-using-threshold-improvement-notifications) — the rule the run has used
 * since 2026-09-13, off each session's stored `computed.hr_curve`. The ride used "the heart rate during the best
 * 20-minute POWER effort" (2026-08-20), which had no outside source; it is gone. Rides now store the same curve, built
 * by the same builder (`compute-workout-analysis`, `buildRunHrCurve`), and the learner reads it with the same step
 * (`thresholdHrFromCurvesStep`). The older whole-ride tiers answer for rides with no curve on file.
 *
 * Run: deno test supabase/functions/learn-fitness-profile/bike-threshold-hr.test.ts --no-check -A
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeRides, analyzeRuns, thresholdHrFromCurvesStep } from './index.ts';
import { buildRunHrCurve } from '../../../src/lib/run-critical-speed.ts';

let seq = 0;
const ride = (partial: Record<string, unknown>): any => ({
  id: `r${++seq}`, type: 'ride', date: '2026-08-01',
  duration: 90, moving_time: 90, distance: 40,
  avg_heart_rate: 128, max_heart_rate: 175,
  avg_pace: 0, avg_power: 150, normalized_power: 160, avg_speed: 28,
  workout_status: 'completed', computed: null,
  ...partial,
});
const run = (partial: Record<string, unknown>): any => ({
  id: `w${++seq}`, type: 'run', date: '2026-08-01',
  duration: 45, moving_time: 45, distance: 6,
  avg_heart_rate: 137, max_heart_rate: 180, avg_pace: 470,
  avg_power: 0, normalized_power: 0, avg_speed: 0,
  workout_status: 'completed', computed: null,
  ...partial,
});
/** A session on file with only its heart-rate curve — the shape the learner's curve fetch rebuilds. */
const curve = (date: string, w20: number | null, w60: number | null): any => ({
  id: `c${++seq}`, type: 'ride', date,
  computed: {
    hr_curve: {
      ...(w20 != null ? { '1200': { avgHr: w20, timeS: 1200 } } : {}),
      ...(w60 != null ? { '3600': { avgHr: w60, timeS: 3600 } } : {}),
    },
  },
});

/** Enough ordinary riding for the learner to run at all. */
const baseRides = () => [
  ride({ max_heart_rate: 175, avg_heart_rate: 120 }),
  ride({ max_heart_rate: 172, avg_heart_rate: 124 }),
  ride({ max_heart_rate: 168, avg_heart_rate: 118 }),
];
const baseRuns = () => [run({}), run({}), run({})];

Deno.test('⛔ RIDE RULE = RUN RULE on the same curve: same number, same words, same confidence', () => {
  const curves = [curve('2026-08-10', 166, 157), curve('2026-09-02', 170, 158)];
  const rideThr = analyzeRides(baseRides(), curves).threshold_hr;
  const runThr = analyzeRuns(baseRuns(), curves.map((c) => ({ ...c, type: 'run' }))).threshold_hr;
  assert(rideThr != null && runThr != null);
  assertEquals(rideThr, runThr);
  // 95% of 170 = 161.5 → 162 beats the best 60-minute 158.
  assertEquals(rideThr!.value, 162);
  assertEquals(rideThr!.source, '95% of the best 20-minute heart-rate window on 2026-09-02 (170 bpm)');
  assertEquals([rideThr!.confidence, rideThr!.sample_count, (rideThr as any).as_of], ['high', 1, '2026-09-02']);
});

Deno.test('the higher of the two windows wins: a best 60 minutes above 95% of the best 20 is the threshold', () => {
  const thr = analyzeRides(baseRides(), [curve('2026-09-01', 160, 155)]).threshold_hr;
  // 95% of 160 = 152; the best 60 minutes is 155.
  assertEquals([thr?.value, thr?.source], [155, 'best 60-minute heart-rate window on 2026-09-01 (155 bpm)']);
});

Deno.test('the 20-minute POWER effort no longer sets the ride threshold', () => {
  // The old tier's shape: a best 20-minute power window with the heart rate during it. It is not read any more.
  const withPowerHr = ride({ computed: { power_curve: { '20min': 240, _hr: { '20min': 158 } } } });
  const thr = analyzeRides([...baseRides(), withPowerHr, ride({ computed: { power_curve: { '20min': 230, _hr: { '20min': 157 } } } })]).threshold_hr;
  assert(!/20-min power/i.test(String(thr?.source ?? '')), `the power-window tier still answers: ${thr?.source}`);
});

Deno.test('no heart-rate curve on file: the older tiers still answer, exactly as the run keeps its own', () => {
  const hard = (hr: number) => ride({ avg_heart_rate: hr, avg_power: 230, duration: 60, moving_time: 60 });
  const thr = analyzeRides([...baseRides(), hard(152), hard(154)], []).threshold_hr;
  assert(/hard rides/.test(String(thr?.source)), String(thr?.source));
});

Deno.test('only up: a prior value written by this rule stays while it is higher; a time trial stands', () => {
  const prior = { value: 165, confidence: 'high', source: 'best 60-minute heart-rate window on 2026-05-01 (165 bpm)', sample_count: 1 };
  assertEquals(thresholdHrFromCurvesStep(prior, [curve('2026-09-01', 168, 150)])?.value, 165);
  assertEquals(thresholdHrFromCurvesStep(prior, [curve('2026-09-01', 176, 150)])?.value, 167); // 95% of 176 = 167.2
  const trial = { value: 171, confidence: 'high', source: 'Run time trial', sample_count: 1 };
  assertEquals(thresholdHrFromCurvesStep(trial, [curve('2026-09-01', 190, 185)])?.value, 171);
  assertEquals(thresholdHrFromCurvesStep(null, []), null);
});

Deno.test('the ride builds its curve with the run\'s builder — same windows off the same samples', () => {
  // 70 minutes at 1 Hz: 20 minutes at 170 inside an hour at 150.
  const t = Array.from({ length: 4200 }, (_, i) => i);
  const hr = t.map((i) => (i >= 1200 && i < 2400 ? 170 : 150));
  const c = buildRunHrCurve(t, hr)!;
  assertEquals(c['1200'].avgHr, 170);
  assertEquals(c['3600'].avgHr, 157); // (20 × 170 + 40 × 150) / 60 = 156.7
});

Deno.test('the SOURCE: rides write hr_curve with the run\'s builder; the learner fetches the path, never `computed` whole', async () => {
  const REPO = new URL('../../../', import.meta.url);
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const analysis = strip(await Deno.readTextFile(new URL('supabase/functions/compute-workout-analysis/index.ts', REPO)));
  const rideBranch = analysis.slice(analysis.indexOf("if (w.type === 'ride' || w.type === 'cycling' || w.type === 'bike')"), analysis.indexOf("if (w.type === 'run' || w.type === 'running')"));
  assert(/hrCurve = buildRunHrCurve\(time_s, hr_bpm\)/.test(rideBranch), 'the ride branch no longer builds the heart-rate curve');
  const learner = strip(await Deno.readTextFile(new URL('supabase/functions/learn-fitness-profile/index.ts', REPO)));
  const rideFetch = learner.slice(learner.indexOf('const allRideCurves'), learner.indexOf('const rideProfile'));
  assert(/hr_curve:computed->hr_curve/.test(rideFetch), 'the ride-curve fetch no longer selects the heart-rate curve path');
  assert(!/select\('[^']*\bcomputed\b(?!->)/.test(rideFetch), 'the ride-curve fetch selects `computed` whole');
});
