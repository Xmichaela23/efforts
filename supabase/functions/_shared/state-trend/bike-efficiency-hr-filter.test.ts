/**
 * Bike EFFICIENCY (HR-at-power) substrate gating.
 *
 * D-237: efficiency must exclude rides whose HR was rejected as corrupt (flaky strap / cadence-lock),
 * while the POWER trend (w20, HR-independent) keeps them.
 *
 * D-275-bike / Q-117 #2 (2026-07-11, verified on Michael's data): efficiency is a STEADY-AEROBIC read
 * (TrainingPeaks/Friel — EF & HR-at-power on aerobic efforts only). The reference band captures INCIDENTAL
 * in-band time on hard rides (a climb's warmup/descents), where HR is dragged up by the overall effort —
 * feeding climbing/threshold/sweet-spot/tempo into the "aerobic efficiency" trend fabricated a false
 * direction (Michael's mid-series HR spike was a May CLIMBING block, read as -5.5% "improving"). So the
 * efficiency substrate is now gated to {endurance, endurance_long, recovery} + ≥600s in-band dwell.
 * NOTE: power and efficiency now use DISJOINT ride-type sets by design (power = hard efforts where you
 * produce a max; efficiency = easy aerobic efforts) — so a single ride type no longer tests both trends.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/bike-efficiency-hr-filter.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';
import { bikeEfficiencyRideEligible, bikeRideIntensityAerobic } from './bike-fitness.ts';

// ── the SHARED intensity gate (both bike engines: spine HR-at-power + coach HR-drift use this ONE line) ──
Deno.test('bikeRideIntensityAerobic: best-20 below Z4 floor (90% FTP) = aerobic; threshold effort = not', () => {
  assert(bikeRideIntensityAerobic(131, 132));   // 131W vs FTP 176 → 74%, easy → aerobic
  assert(bikeRideIntensityAerobic(140, 132));   // 80% → still aerobic
  assert(!bikeRideIntensityAerobic(165, 132));  // 94% FTP = threshold effort → NOT (Michael's May-30 ride)
  assert(bikeRideIntensityAerobic(null, 132));  // can't assess → don't over-drop
  assert(bikeRideIntensityAerobic(165, null));  // no band → can't assess
});

const AS_OF = '2026-07-04';

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

// ── the eligibility gate, unit-level ── (bandHi 132 → FTP 176 → Z4 floor ~158W)
Deno.test('bikeEfficiencyRideEligible: aerobic type + ≥600s dwell + no threshold effort', () => {
  assert(bikeEfficiencyRideEligible('endurance', 900, 130, 132));      // aerobic, long, easy → ✓
  assert(bikeEfficiencyRideEligible('endurance_long', 1800, 140, 132));
  assert(bikeEfficiencyRideEligible('recovery', 700, 100, 132));
  assert(bikeEfficiencyRideEligible('endurance', 900, null, 132));     // w20 absent → can't assess intensity, keep
  assert(!bikeEfficiencyRideEligible('climbing', 900, 180, 132));      // hard type
  assert(!bikeEfficiencyRideEligible('threshold', 1200, 155, 132));    // hard type
  assert(!bikeEfficiencyRideEligible('sweet_spot', 1300, 160, 132));   // hard type
  assert(!bikeEfficiencyRideEligible('endurance', 200, 120, 132));     // aerobic but too little dwell
  assert(!bikeEfficiencyRideEligible('endurance', 900, 165, 132));     // labeled endurance but RIDDEN hard (165 ≥ 158) → contaminated
  assert(!bikeEfficiencyRideEligible(null, 900, 120, 132));
});

// ── D-237 preserved: corrupt-HR excluded from efficiency (now on AEROBIC rides, the real substrate) ──
function enduranceRides(corruptR3: boolean) {
  return [
    { date: '2026-05-20', classified_type: 'endurance',      w20: 130, hr_at_band: 138, in_band_s: 900,  band_hi: 132, band_source: 'coggan_ftp' },
    { date: '2026-06-01', classified_type: 'endurance_long', w20: 135, hr_at_band: 136, in_band_s: 1600, band_hi: 132, band_source: 'coggan_ftp' },
    { date: '2026-06-12', classified_type: 'endurance',      w20: 132, hr_at_band: 175, in_band_s: 900,  band_hi: 132, band_source: 'coggan_ftp', hr_corrupt: corruptR3 },
    { date: '2026-06-22', classified_type: 'endurance',      w20: 131, hr_at_band: 134, in_band_s: 1000, band_hi: 132, band_source: 'coggan_ftp' },
    { date: '2026-06-28', classified_type: 'endurance_long', w20: 133, hr_at_band: 133, in_band_s: 1500, band_hi: 132, band_source: 'coggan_ftp' },
  ];
}
Deno.test('corrupt HR ride is EXCLUDED from efficiency (aerobic substrate)', () => {
  const r = assemble(enduranceRides(true)).bikeFitness;
  assertEquals(r.efficiency.sampleCount, 4);  // r3's corrupt HR dropped
});
Deno.test('without the corrupt flag, efficiency keeps all 5 aerobic rides', () => {
  const r = assemble(enduranceRides(false)).bikeFitness;
  assertEquals(r.efficiency.sampleCount, 5);
});

// ══ THE FIX — the contamination regression: hard rides (climbing/threshold) + short-dwell rides no longer
//    pollute the aerobic efficiency trend. Before: all counted → a climbing block read as "improving". ══
Deno.test('efficiency substrate excludes climbing/threshold + short-dwell; only clean aerobic rides count', () => {
  const mixed = [
    { date: '2026-05-20', classified_type: 'endurance',      w20: 130, hr_at_band: 135, in_band_s: 900,  band_hi: 132, band_source: 'coggan_ftp' }, // ✓
    { date: '2026-05-28', classified_type: 'climbing',       w20: 185, hr_at_band: 153, in_band_s: 432,  band_hi: 132, band_source: 'coggan_ftp' }, // ✗ hard type
    { date: '2026-06-05', classified_type: 'threshold',      w20: 155, hr_at_band: 148, in_band_s: 1000, band_hi: 132, band_source: 'coggan_ftp' }, // ✗ hard type
    { date: '2026-06-12', classified_type: 'endurance',      w20: 128, hr_at_band: 137, in_band_s: 168,  band_hi: 132, band_source: 'coggan_ftp' }, // ✗ too short
    { date: '2026-06-20', classified_type: 'endurance_long', w20: 140, hr_at_band: 136, in_band_s: 1600, band_hi: 132, band_source: 'coggan_ftp' }, // ✓
    { date: '2026-06-28', classified_type: 'endurance',      w20: 133, hr_at_band: 134, in_band_s: 900,  band_hi: 132, band_source: 'coggan_ftp' }, // ✓
  ];
  const r = assemble(mixed).bikeFitness;
  assertEquals(r.efficiency.sampleCount, 3);   // only the 3 clean aerobic rides — climbing/threshold/short dropped
});

// ══ Michael's exact contaminant: a ride LABELED endurance but RIDDEN hard (165W ≈ 94% FTP) — its
//    cardiac-lag-inflated in-band HR faked a -4.7% "improving". The intensity gate must drop it. ══
Deno.test('a hard-ridden "endurance" ride (best-20 at threshold) is excluded from efficiency', () => {
  const rides = [
    { date: '2026-05-23', classified_type: 'endurance',      w20: 131, hr_at_band: 132, in_band_s: 1329, band_hi: 132, band_source: 'coggan_ftp' }, // ✓ easy
    { date: '2026-05-30', classified_type: 'endurance',      w20: 165, hr_at_band: 145, in_band_s: 1278, band_hi: 132, band_source: 'coggan_ftp' }, // ✗ 165 ≥ 158 (threshold effort)
    { date: '2026-06-09', classified_type: 'endurance_long', w20: 141, hr_at_band: 135, in_band_s: 1984, band_hi: 132, band_source: 'coggan_ftp' }, // ✓
    { date: '2026-07-01', classified_type: 'endurance',      w20: 118, hr_at_band: 137, in_band_s: 744,  band_hi: 132, band_source: 'coggan_ftp' }, // ✓
    { date: '2026-07-03', classified_type: 'endurance',      w20: 114, hr_at_band: 131, in_band_s: 991,  band_hi: 132, band_source: 'coggan_ftp' }, // ✓
  ];
  const r = assemble(rides).bikeFitness;
  assertEquals(r.efficiency.sampleCount, 4);   // the 165W "endurance" ride dropped → no fake improvement from its 145bpm
});
