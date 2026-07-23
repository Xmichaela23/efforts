/**
 * Bike POWER chart series (bikePowerChartSeries) — the cyclist's e1RM/efficiency-analog sparkline.
 *
 * Charts the w20 points of the WINNING terrain bin over 12 weeks (84d), recent-flagged inside the bike
 * verdict window (56d). User-agnostic fixtures (synthetic rides, not any real athlete) proving: it charts
 * only the named bin's rides, orders + rounds them, flags recent correctly, fills as data grows, and never
 * mixes terrain bins (a climb's w20 is not comparable to a flat's).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/bike-power-chart.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bikePowerChartSeries, type BikeEffortRide } from './bike-fitness.ts';
import { assembleStateTrends } from './assemble.ts';

const ASOF = '2026-07-23';
const d = (daysAgo: number) => new Date(Date.parse(ASOF + 'T12:00:00Z') - daysAgo * 86_400_000).toISOString().slice(0, 10);

function assembleBike(bikeRows: any[]) {
  return assembleStateTrends({
    asOf: ASOF, exerciseRows: [], bikeRows, runJoined: [], swimRows: [],
    plannedBy: {}, doneBy: {}, cadenceCounts: { bike: 5 }, // low cadence → minSessions floor 3
  } as any);
}

Deno.test('charts only the winning bin, ordered ascending, watts rounded', () => {
  const rides: BikeEffortRide[] = [
    { date: d(10), classified_type: 'threshold', w20: 245.6 },
    { date: d(40), classified_type: 'sweet_spot', w20: 238.2 },
    { date: d(3),  classified_type: 'tempo', w20: 250.9 },
    { date: d(5),  classified_type: 'climbing', w20: 300 },   // different bin — excluded from flat_sustained
    { date: d(7),  classified_type: 'endurance', w20: 180 },  // not a power bin at all
  ];
  const s = bikePowerChartSeries(rides, ASOF, 'flat_sustained');
  assertEquals(s.map((p) => p.value), [238, 246, 251]); // d40, d10, d3 → ascending, rounded
  assert(s.every((p) => p.recent)); // all inside the 56d verdict window
});

Deno.test('recent flag = inside the 56d verdict window; older points dim', () => {
  const rides: BikeEffortRide[] = [
    { date: d(80), classified_type: 'threshold', w20: 220 }, // in 84d chart, outside 56d verdict → not recent
    { date: d(60), classified_type: 'threshold', w20: 225 }, // outside 56d → not recent
    { date: d(20), classified_type: 'threshold', w20: 240 }, // inside 56d → recent
    { date: d(2),  classified_type: 'threshold', w20: 248 }, // inside 56d → recent
  ];
  const s = bikePowerChartSeries(rides, ASOF, 'flat_sustained');
  assertEquals(s.map((p) => p.recent), [false, false, true, true]);
});

Deno.test('84d chart window excludes older rides; fills as data grows', () => {
  const rides: BikeEffortRide[] = [
    { date: d(100), classified_type: 'threshold', w20: 210 }, // outside 84d → dropped
    { date: d(70),  classified_type: 'threshold', w20: 220 },
    { date: d(30),  classified_type: 'threshold', w20: 235 },
  ];
  const s = bikePowerChartSeries(rides, ASOF, 'flat_sustained');
  assertEquals(s.length, 2); // only the two inside 84d
  assertEquals(s.map((p) => p.value), [220, 235]);
});

Deno.test('climbing bin is separate — never merged with flat efforts', () => {
  const rides: BikeEffortRide[] = [
    { date: d(20), classified_type: 'climbing', w20: 305 },
    { date: d(10), classified_type: 'climbing', w20: 312 },
    { date: d(5),  classified_type: 'threshold', w20: 250 },
  ];
  assertEquals(bikePowerChartSeries(rides, ASOF, 'climbing').map((p) => p.value), [305, 312]);
  assertEquals(bikePowerChartSeries(rides, ASOF, 'flat_sustained').map((p) => p.value), [250]);
});

Deno.test('no bin / unknown bin / no valid w20 → empty (no line, honest)', () => {
  const rides: BikeEffortRide[] = [{ date: d(5), classified_type: 'threshold', w20: 250 }];
  assertEquals(bikePowerChartSeries(rides, ASOF, null), []);
  assertEquals(bikePowerChartSeries(rides, ASOF, 'nonsense_bin'), []);
  assertEquals(bikePowerChartSeries([{ date: d(5), classified_type: 'threshold', w20: 0 }], ASOF, 'flat_sustained'), []);
});

// ── INTEGRATION: the full assembly, end to end — the "does the chart fill for a real rider" proof ──

Deno.test('structured rider: power LEADS and the chart fills, recent-flagged', () => {
  // A rider who does weekly flat_sustained (threshold/sweet_spot/tempo) efforts over ~12 weeks — rising w20.
  const rides = [
    { date: d(78), classified_type: 'threshold',   w20: 225, hr_at_band: 150, in_band_s: 300, band_hi: 169, band_source: 'coggan_ftp' },
    { date: d(64), classified_type: 'sweet_spot',  w20: 232, hr_at_band: 150, in_band_s: 300, band_hi: 169, band_source: 'coggan_ftp' },
    { date: d(50), classified_type: 'tempo',       w20: 238, hr_at_band: 150, in_band_s: 300, band_hi: 169, band_source: 'coggan_ftp' },
    { date: d(36), classified_type: 'threshold',   w20: 244, hr_at_band: 150, in_band_s: 300, band_hi: 169, band_source: 'coggan_ftp' },
    { date: d(22), classified_type: 'sweet_spot',  w20: 250, hr_at_band: 150, in_band_s: 300, band_hi: 169, band_source: 'coggan_ftp' },
    { date: d(6),  classified_type: 'threshold',   w20: 256, hr_at_band: 150, in_band_s: 300, band_hi: 169, band_source: 'coggan_ftp' },
  ];
  const bf = assembleBike(rides).bikeFitness;
  assert(bf.power.verdict !== 'needs_data', 'power should have a verdict');
  assertEquals(bf.power.basis, 'flat_sustained');
  const s = bf.power.series ?? [];
  assertEquals(s.length, 6);                                  // all 6 rides inside 84d
  assertEquals(s.map((p) => p.value), [225, 232, 238, 244, 250, 256]); // ascending, rounded watts
  assert(s.slice(-3).every((p) => p.recent), 'the recent efforts are flagged for color');
  assert(s[0].recent === false, 'the oldest (78d) is outside the 56d window → dim');
});

Deno.test('endurance-only rider (the Michael case): power is needs_data → NO power chart', () => {
  // Only aerobic endurance rides — no comparable 20-min power max → power has nothing to chart; the bike row
  // leads on efficiency instead. This is exactly why the chart correctly renders nothing for such a rider.
  const rides = [
    { date: d(40), classified_type: 'endurance',      w20: 150, hr_at_band: 138, in_band_s: 900,  band_hi: 132, band_source: 'coggan_ftp' },
    { date: d(26), classified_type: 'endurance_long', w20: 152, hr_at_band: 136, in_band_s: 1600, band_hi: 132, band_source: 'coggan_ftp' },
    { date: d(12), classified_type: 'endurance',      w20: 151, hr_at_band: 134, in_band_s: 1000, band_hi: 132, band_source: 'coggan_ftp' },
  ];
  const bf = assembleBike(rides).bikeFitness;
  assertEquals(bf.power.verdict, 'needs_data');
  assertEquals(bf.power.basis, null);
  assertEquals(bf.power.series ?? [], []); // nothing to chart — honest
});
