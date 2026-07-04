/**
 * D-237: the bike EFFICIENCY trend (HR-at-power) must exclude rides whose HR was
 * rejected as corrupt (flaky strap / cadence-lock), while the POWER trend (w20,
 * HR-independent) keeps them. Guards the fix that pointed the HR-plausibility flag
 * at the efficiency path + surfaces efficiency's own (possibly smaller) sample count.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/bike-efficiency-hr-filter.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

const AS_OF = '2026-07-04';

// 5 threshold rides (a POWER bin) over the 8wk window: w20 rising (power improving),
// hr_at_band falling (efficiency improving) — except r3, which has a garbage HR and is
// flagged hr_corrupt. Power should count all 5; efficiency should drop r3 → 4.
function rides(corruptR3: boolean) {
  return [
    { date: '2026-05-20', classified_type: 'threshold', w20: 200, hr_at_band: 155, band_source: 'coggan_ftp' },
    { date: '2026-06-01', classified_type: 'threshold', w20: 205, hr_at_band: 153, band_source: 'coggan_ftp' },
    { date: '2026-06-12', classified_type: 'threshold', w20: 210, hr_at_band: 175, band_source: 'coggan_ftp', hr_corrupt: corruptR3 },
    { date: '2026-06-22', classified_type: 'threshold', w20: 215, hr_at_band: 150, band_source: 'coggan_ftp' },
    { date: '2026-06-28', classified_type: 'threshold', w20: 220, hr_at_band: 148, band_source: 'coggan_ftp' },
  ];
}

function assemble(bikeRows: any[]) {
  return assembleStateTrends({
    asOf: AS_OF,
    exerciseRows: [],
    bikeRows,
    runJoined: [],
    swimRows: [],
    plannedBy: {},
    doneBy: {},
    cadenceCounts: { bike: 5 }, // low cadence → minSessions floor 3, so 4–5 rides render
  } as any);
}

Deno.test('corrupt HR ride is EXCLUDED from efficiency but KEPT in power', () => {
  const r = assemble(rides(true)).bikeFitness;
  assertEquals(r.power.sampleCount, 5);       // w20 is HR-independent — all 5 rides
  assertEquals(r.efficiency.sampleCount, 4);  // r3's corrupt HR dropped
  assertEquals(r.power.verdict, 'improving');
  assertEquals(r.efficiency.verdict, 'improving');
});

Deno.test('without the corrupt flag, efficiency keeps all 5 (baseline — the exclusion is what changed it)', () => {
  const r = assemble(rides(false)).bikeFitness;
  assertEquals(r.power.sampleCount, 5);
  assertEquals(r.efficiency.sampleCount, 5);
});
