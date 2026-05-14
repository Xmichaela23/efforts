/**
 * Run: deno test supabase/functions/learn-fitness-profile/index.test.ts --allow-read
 *
 * Tier 1 of FTP estimation reads `computed.power_curve['20min']` (rewired from three
 * dead fallback paths). This test asserts Tier 1 actually fires now — prior to the
 * rewire it silently fell through to Tier 2 on every ride because none of the three
 * legacy paths were ever populated.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { analyzeRides } from './index.ts';

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
