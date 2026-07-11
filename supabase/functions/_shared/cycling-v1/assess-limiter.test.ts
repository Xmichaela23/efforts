import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assessCyclingLimiter } from './cross-workout-queries.ts';

// The bike-power TREND belongs to the spine (state_trends_v1.bike.power), not a "limiter". The old §2
// NP-trend fallback averaged recent-vs-90d NP (±5%, no terrain/staleness gate) and emitted "Power
// trending up/down — fitness responding / review recovery" — a baseline-blind duplicate that an easy
// block could drag into a false "trending down", contradicting State. These pin that it's gone for
// EVERY athlete (not tuned to one case) and that the real W/kg limiter still works.

Deno.test('NP-trend "trending down" fake is gone — non-tri athlete with easy-block NP', () => {
  const r = assessCyclingLimiter({
    weightKg: 80, ftpW: 250, isTriAthlete: false, raceDistance: null,
    recentNpSamples: [120, 118, 116],          // an easy block — would have dragged the mean → "trending down"
    ninetyDayNpSamples: [200, 190, 210, 205, 195],
  });
  assertEquals(r.flag, 'none');                // no fabricated directional limiter
  assert(!/trending (up|down)/i.test(r.detail ?? ''), 'must not claim a power direction');
});

Deno.test('NP-trend fake is gone for a TRI athlete too (missing weight → honest blank, not a fake)', () => {
  const r = assessCyclingLimiter({
    weightKg: null, ftpW: 250, isTriAthlete: true, raceDistance: '70.3',
    recentNpSamples: [120, 118, 116],
    ninetyDayNpSamples: [200, 190, 210, 205, 195],
  });
  assertEquals(r.flag, 'none');                // no W/kg (no weight) → honest 'none', not the NP fake
  assert(!/trending (up|down)/i.test(r.detail ?? ''));
});

Deno.test('the REAL W/kg limiter still fires for a tri athlete with baselines + a race', () => {
  const low = assessCyclingLimiter({
    weightKg: 80, ftpW: 180, isTriAthlete: true, raceDistance: '70.3', // 2.25 W/kg — below mid-pack
  });
  assertEquals(low.flag, 'bike');              // §1 untouched
  assert(/W\/kg/i.test(low.detail ?? ''));
});
