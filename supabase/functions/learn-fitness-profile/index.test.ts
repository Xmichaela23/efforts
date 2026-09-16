/**
 * Run: deno test supabase/functions/learn-fitness-profile/index.test.ts --allow-read
 *
 * Tier 1 of FTP estimation reads `computed.power_curve['20min']` (rewired from three
 * dead fallback paths). This test asserts Tier 1 actually fires now — prior to the
 * rewire it silently fell through to Tier 2 on every ride because none of the three
 * legacy paths were ever populated.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeRides, assessmentFromLaps, carryThroughFresh } from './index.ts';

function stubRide(partial: Record<string, unknown>): any {
  return {
    id: 'r' + Math.random().toString(36).slice(2, 8),
    type: 'ride',
    date: '2026-05-01',
    duration: 60,
    moving_time: 60,
    distance: 30,
    avg_heart_rate: 150,
    max_heart_rate: 180,
    avg_pace: 0,
    avg_power: 220,
    normalized_power: 230,
    avg_speed: 30,
    workout_status: 'completed',
    computed: null,
    ...partial,
  };
}

Deno.test('analyzeRides — Tier 1 fires when computed.power_curve[\'20min\'] is populated', () => {
  const rides = [
    stubRide({ computed: { power_curve: { '20min': 280 } } }),
    stubRide({ computed: { power_curve: { '20min': 290 } } }),
    stubRide({ computed: { power_curve: { '20min': 300 } } }),
  ];

  const r = analyzeRides(rides);

  // Tier 1 takes max(280, 290, 300) = 300, then * 0.95 = 285.
  assertEquals(r.ftp_estimated?.value, 285);
  // 3 rides ≥ 3 → high confidence.
  assertEquals(r.ftp_estimated?.confidence, 'high');
  // Source string identifies the tier so future debugging can confirm Tier 1 fired
  // (rather than silently falling through to Tier 2 NP-from-hard-efforts).
  assertEquals(r.ftp_estimated?.source, '95% of 20-min best power (3 efforts)');
  assertEquals(r.ftp_estimated?.sample_count, 3);
});

Deno.test('analyzeRides — Tier 1 medium confidence with exactly 2 power_curve readings', () => {
  // Boundary: bestsPower20.length === 2 still fires Tier 1 but with medium confidence.
  // Third ride has no power_curve so it doesn't contribute to bestsPower20.
  const rides = [
    stubRide({ computed: { power_curve: { '20min': 250 } } }),
    stubRide({ computed: { power_curve: { '20min': 260 } } }),
    stubRide({ computed: null }),
  ];

  const r = analyzeRides(rides);

  // max(250, 260) * 0.95 = 247.
  assertEquals(r.ftp_estimated?.value, 247);
  assertEquals(r.ftp_estimated?.confidence, 'medium');
  assertEquals(r.ftp_estimated?.sample_count, 2);
});

Deno.test('analyzeRides — falls through to Tier 2 when no power_curve data', () => {
  // Regression-pin: prior to the rewire this was the ONLY path that fired (because
  // Tier 1 read from three never-populated fields). After the rewire, this remains
  // the correct fallback when power_curve isn't present.
  const rides = [
    stubRide({ computed: null, normalized_power: 240, avg_heart_rate: 165 }),
    stubRide({ computed: null, normalized_power: 250, avg_heart_rate: 170 }),
    stubRide({ computed: null, normalized_power: 245, avg_heart_rate: 168 }),
  ];

  const r = analyzeRides(rides);

  // Tier 1 source string mentions "20-min best power"; Tier 2+ mentions "Normalized
  // Power" / "hard efforts" — assert we're NOT in Tier 1 here.
  if (r.ftp_estimated) {
    const inTier1 = r.ftp_estimated.source.includes('20-min best power');
    assertEquals(inTier1, false);
  }
});

// ── 2026-09-16, Stage 7 session 1: the field tests moved in, and the write window closed ───────────

Deno.test('the run time trial: 3000 m in 12 min → vVO2 240 s/km, threshold 273 s/km (÷ 0.88, p210)', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  const out = assessmentFromLaps(['assessment', 'run_test'], [{ distance: 1500, elapsed_time: 300 }, { distance: 3000, elapsed_time: 720 }], null, now) as any;
  assertEquals(out.run_vvo2_pace_sec_per_km.value, 240);
  assertEquals(out.run_threshold_pace_sec_per_km.value, 273);
  assertEquals(out.run_threshold_pace_sec_per_km.source, 'Run time trial — 88% of vVO2 speed (Viada p210)');
  assertEquals(out.run_threshold_pace_sec_per_km.as_of, '2026-09-16');
  // slower than the athlete's measured easy pace → not a threshold reading
  const easy = { run_easy_pace_sec_per_km: { value: 260, confidence: 'high', sample_count: 10 } };
  assertEquals(assessmentFromLaps(['assessment', 'run_test'], [{ distance: 3000, elapsed_time: 720 }], easy, now), null);
  assertEquals(assessmentFromLaps(['run_test'], [{ distance: 3000, elapsed_time: 720 }], null, now), null);
});

Deno.test('the CSS test: 400 yd in 380 s, 200 yd in 180 s → 109 s/100 m, stamped as the test', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  const out = assessmentFromLaps(['assessment', 'css_test'], [{ distance: 366, elapsed_time: 400 }, { distance: 366, elapsed_time: 380 }, { distance: 183, elapsed_time: 180 }], null, now) as any;
  assertEquals(out.swim_css_sec_per_100m, { value: 109, confidence: 'moderate', source: 'CSS test (400/200 yd time trial)', n_efforts: 2, tested_at: now.toISOString() });
});

Deno.test('the fresh row wins for keys this run does not own', () => {
  const merged = {
    ride_ftp_estimated: { value: 250 },
    strength_1rms: { squat: { value: 200 } },
    run_threshold_pace_sec_per_km: { value: 280, source: 'critical speed' },
    swim_css_sec_per_100m: { value: 100, source: 'learner (best-effort CS fit)' },
  };
  const fresh = {
    strength_1rms: { squat: { value: 225 } },
    ride_ftp_accepted: { value: 245 },
    run_threshold_pace_sec_per_km: { value: 273, source: 'Run time trial — 88% of vVO2 speed (Viada p210)', tested_at: '2026-09-16T12:00:00.000Z' },
    run_vvo2_pace_sec_per_km: { value: 240, source: 'Run time trial (p210)' },
    swim_css_sec_per_100m: { value: 109, source: 'CSS test (400/200 yd time trial)', tested_at: '2026-09-16T12:00:00.000Z' },
    ride_ftp_estimated: { value: 999 },
  };
  const out = carryThroughFresh(merged, fresh) as any;
  assertEquals(out.strength_1rms.squat.value, 225);
  assertEquals(out.ride_ftp_accepted.value, 245);
  assertEquals(out.run_threshold_pace_sec_per_km.value, 273);
  assertEquals(out.run_vvo2_pace_sec_per_km.value, 240);
  assertEquals(out.swim_css_sec_per_100m.value, 109);
  assertEquals(out.ride_ftp_estimated.value, 250); // this run's own key stands
  // this run's newer test stands over an older one on the fresh row
  const ours = { run_threshold_pace_sec_per_km: { value: 270, source: 'Run time trial', tested_at: '2026-09-17T00:00:00.000Z' } };
  assertEquals((carryThroughFresh(ours, fresh) as any).run_threshold_pace_sec_per_km.value, 270);
});
