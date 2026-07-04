/**
 * Bike row rework (2026-07-04): Efficiency switches from HR-at-power proxy to the true EF
 * factor (NP/HR, higher=better); Decoupling (Pw:HR, lower=better) is added, GATED to steady
 * aerobic efforts (COMPARABLE_DECOUPLING_EFFORT) on top of the ≥20-min computation gate, and
 * both HR-derived reads EXCLUDE corrupt-HR rides (D-237). Glance `value` = recent level.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/bike-fitness-ef-decoupling.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeBikeFitness, type BikeEffortRide } from './bike-fitness.ts';

const AS_OF = '2026-07-04';
const SPW = 0.39; // low bike cadence → minSessions floor 3

// r1–r4: steady aerobic rides (endurance/tempo/sweet_spot), EF rising + decoupling falling (both improving).
// r5: a vo2 interval — has a decoupling value but is NOT steady → must be EXCLUDED from decoupling.
// r6: an endurance ride flagged hr_corrupt → must be EXCLUDED from BOTH EF and decoupling.
const RIDES: BikeEffortRide[] = [
  { date: '2026-05-15', classified_type: 'endurance', w20: null, efficiency_factor: 1.80, aerobic_decoupling_pct: 5.0 },
  { date: '2026-05-30', classified_type: 'tempo', w20: null, efficiency_factor: 1.83, aerobic_decoupling_pct: 4.6 },
  { date: '2026-06-15', classified_type: 'sweet_spot', w20: null, efficiency_factor: 1.86, aerobic_decoupling_pct: 4.2 },
  { date: '2026-06-28', classified_type: 'endurance', w20: null, efficiency_factor: 1.90, aerobic_decoupling_pct: 4.0 },
  { date: '2026-06-20', classified_type: 'vo2', w20: null, efficiency_factor: null, aerobic_decoupling_pct: 8.0 },
  { date: '2026-06-10', classified_type: 'endurance', w20: null, efficiency_factor: 1.20, aerobic_decoupling_pct: 9.0, hr_corrupt: true },
];

Deno.test('Efficiency = EF (higher-better) improving; value = current EF; corrupt ride excluded', () => {
  const { efficiency } = computeBikeFitness(RIDES, AS_OF, SPW);
  assertEquals(efficiency.sampleCount, 4);       // r1–r4 (r5 no EF, r6 corrupt)
  assertEquals(efficiency.verdict, 'improving'); // EF 1.80→1.90 rising = better
  assertEquals(efficiency.value, 1.88);          // recent-avg (1.86+1.90)/2
});

Deno.test('Decoupling (lower-better) improving; intent-gated + corrupt-excluded; value = current %', () => {
  const { decoupling } = computeBikeFitness(RIDES, AS_OF, SPW);
  assertEquals(decoupling.sampleCount, 4);        // r1–r4 only — vo2 (intent) + corrupt both dropped
  assertEquals(decoupling.verdict, 'improving');  // 5.0→4.0 falling = tightening = better
  assertEquals(decoupling.value, 4.1);            // recent-avg (4.2+4.0)/2
});

Deno.test('decoupling honest needs_data when too few STEADY rides (never a placeholder)', () => {
  // Only 2 steady rides with decoupling → below the floor → needs_data, value null.
  const thin: BikeEffortRide[] = [
    { date: '2026-06-01', classified_type: 'endurance', w20: null, efficiency_factor: 1.8, aerobic_decoupling_pct: 5.0 },
    { date: '2026-06-20', classified_type: 'endurance', w20: null, efficiency_factor: 1.8, aerobic_decoupling_pct: 4.5 },
    // plenty of vo2 intervals with decoupling values, but they don't qualify:
    { date: '2026-06-05', classified_type: 'vo2', w20: null, efficiency_factor: 1.8, aerobic_decoupling_pct: 7.0 },
    { date: '2026-06-12', classified_type: 'vo2', w20: null, efficiency_factor: 1.8, aerobic_decoupling_pct: 7.5 },
  ];
  const { decoupling } = computeBikeFitness(thin, AS_OF, SPW);
  assertEquals(decoupling.verdict, 'needs_data');
  assertEquals(decoupling.value, null);
});
