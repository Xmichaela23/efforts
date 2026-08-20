/**
 * ⛔ THE BIKE'S THRESHOLD HEART RATE COMES FROM AN EFFORT, NOT A FORMULA (2026-08-20).
 *
 * The old filter required a WHOLE RIDE to average 85-95% of max heart rate. Real rides do not — you
 * coast, you descend, you stop. Verified on a real account: 20 rides, high-confidence max HR, ZERO
 * candidates, and the learner published `90% of observed max (estimated)` with sample_count 0. Every
 * consumer then treated that formula as the athlete's cycling threshold.
 *
 * The effort was already identified: `power_curve['20min']` is the best 20 minutes of pedalling, and
 * the FTP tier already derives FTP from it. This asserts the heart rate during that window is what
 * anchors the bike.
 *
 * Run: deno test supabase/functions/learn-fitness-profile/bike-threshold-hr.test.ts --no-check --allow-net
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeRides } from './index.ts';

let seq = 0;
const ride = (partial: Record<string, unknown>): any => ({
  id: `r${++seq}`, type: 'ride', date: '2026-08-01',
  duration: 90, moving_time: 90, distance: 40,
  avg_heart_rate: 128, max_heart_rate: 175,
  avg_pace: 0, avg_power: 150, normalized_power: 160, avg_speed: 28,
  workout_status: 'completed', computed: null,
  ...partial,
});

/** A ride whose best 20-minute window is `watts` at `hr` — the shape the analyser now writes. */
const rideWith20 = (watts: number, hr: number, over: Record<string, unknown> = {}) =>
  ride({ computed: { power_curve: { '20min': watts, _hr: { '20min': hr } } }, ...over });

/** Enough ordinary riding for the learner to observe a max HR at all. */
const base = () => [
  ride({ max_heart_rate: 175, avg_heart_rate: 120 }),
  ride({ max_heart_rate: 172, avg_heart_rate: 124 }),
  ride({ max_heart_rate: 168, avg_heart_rate: 118 }),
];

Deno.test('⛔ THE REGRESSION: no hard whole-ride averages, but a real 20-min effort → measured, not a formula', () => {
  const out = analyzeRides([...base(), rideWith20(210, 158), rideWith20(198, 155)] as never);
  const thr = out.threshold_hr;
  assert(thr != null, 'no bike threshold published');
  assert(!/estimated/i.test(String(thr!.source)), `still a formula: ${thr!.source}`);
  assert(/20-min power/i.test(String(thr!.source)), thr!.source);
  // The HR comes from the ride that set the BEST power, so FTP and threshold describe one effort.
  assertEquals(thr!.value, 158);
  assert(thr!.sample_count! > 0, 'a measured anchor must carry a sample count');
});

Deno.test('the strongest effort wins, not the newest or the highest heart rate', () => {
  const out = analyzeRides([...base(), rideWith20(180, 170), rideWith20(240, 152)] as never);
  assertEquals(out.threshold_hr!.value, 152, 'took the higher HR rather than the stronger effort');
});

Deno.test('one effort publishes at LOW confidence; more earns more', () => {
  const one = analyzeRides([...base(), rideWith20(210, 158)] as never);
  assertEquals(one.threshold_hr!.confidence, 'low');
  const three = analyzeRides([
    ...base(), rideWith20(210, 158), rideWith20(205, 157), rideWith20(200, 156),
  ] as never);
  assertEquals(three.threshold_hr!.confidence, 'high');
});

Deno.test('an implausible heart rate on the window is refused, not published', () => {
  // At or above observed max is not a threshold; so is a resting-level reading.
  const tooHigh = analyzeRides([...base(), rideWith20(210, 200)] as never);
  assert(!/20-min power/i.test(String(tooHigh.threshold_hr?.source ?? '')), 'published an above-max HR');
  const tooLow = analyzeRides([...base(), rideWith20(210, 80)] as never);
  assert(!/20-min power/i.test(String(tooLow.threshold_hr?.source ?? '')), 'published a resting-level HR');
});

Deno.test('rides with no heart rate on the window fall through to the older tiers', () => {
  // No backfill — older rides carry a power curve with no `_hr`, and must change nothing.
  const out = analyzeRides([...base(), ride({ computed: { power_curve: { '20min': 210 } } })] as never);
  assert(!/20-min power/i.test(String(out.threshold_hr?.source ?? '')), out.threshold_hr?.source ?? '');
});

/**
 * MUTATIONS RUN 2026-08-20 — all killed.
 *   1  the 20-min tier deleted                        -> regression + strongest-effort + confidence fail
 *   2  sorted ascending (weakest effort wins)         -> strongest-effort fails
 *   3  plausibility band removed                      -> implausible-HR fails
 *   4  one effort allowed to reach `high`             -> confidence fails
 *   5  `_hr` ignored, HR taken from ride average      -> regression fails (wrong value)
 */
