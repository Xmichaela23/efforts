/**
 * D-237 (integration, via assembleStateTrends): a corrupt-HR ride is EXCLUDED from the bike
 * EFFICIENCY trend (EF = NP/HR, HR-derived) but KEPT in POWER (w20, HR-independent). Confirms the
 * hr_corrupt flag threads workout_metadata → bikeRows → computeBikeFitness.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/bike-efficiency-hr-filter.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

const AS_OF = '2026-07-04';

// 5 threshold rides (a POWER bin) over the window: w20 rising (power improving) + EF rising (efficiency
// improving). r3 is flagged hr_corrupt — its EF must drop from efficiency, its w20 must stay in power.
function rides(corruptR3: boolean) {
  return [
    { date: '2026-05-20', classified_type: 'threshold', w20: 200, hr_at_band: 155, band_source: 'coggan_ftp', efficiency_factor: 1.80, aerobic_decoupling_pct: null },
    { date: '2026-06-01', classified_type: 'threshold', w20: 205, hr_at_band: 153, band_source: 'coggan_ftp', efficiency_factor: 1.83, aerobic_decoupling_pct: null },
    { date: '2026-06-12', classified_type: 'threshold', w20: 210, hr_at_band: 175, band_source: 'coggan_ftp', efficiency_factor: 1.40, aerobic_decoupling_pct: null, hr_corrupt: corruptR3 },
    { date: '2026-06-22', classified_type: 'threshold', w20: 215, hr_at_band: 150, band_source: 'coggan_ftp', efficiency_factor: 1.86, aerobic_decoupling_pct: null },
    { date: '2026-06-28', classified_type: 'threshold', w20: 220, hr_at_band: 148, band_source: 'coggan_ftp', efficiency_factor: 1.88, aerobic_decoupling_pct: null },
  ];
}

function assemble(bikeRows: any[]) {
  return assembleStateTrends({
    asOf: AS_OF, exerciseRows: [], bikeRows, runJoined: [], swimRows: [],
    plannedBy: {}, doneBy: {}, cadenceCounts: { bike: 5 },
  } as any);
}

Deno.test('corrupt HR ride is EXCLUDED from EF efficiency but KEPT in power', () => {
  const r = assemble(rides(true)).bikeFitness;
  assertEquals(r.power.sampleCount, 5);       // w20 is HR-independent — all 5 rides
  assertEquals(r.efficiency.sampleCount, 4);  // r3's corrupt EF dropped
  assertEquals(r.power.verdict, 'improving');
  assertEquals(r.efficiency.verdict, 'improving');
});

Deno.test('without the corrupt flag, EF keeps all 5 (baseline — the exclusion is what changed it)', () => {
  const r = assemble(rides(false)).bikeFitness;
  assertEquals(r.power.sampleCount, 5);
  assertEquals(r.efficiency.sampleCount, 5);
});
