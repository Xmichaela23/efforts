// Load floor (Q-255) — band boundaries pinned to their sources (Friel / intervals.icu, see module
// header) so a future "tidy" cannot silently move what "fresh" means.

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeLoadFloor, freshnessFromTsb } from './load-floor.ts';

Deno.test('freshness bands match the field sources at their boundaries', () => {
  assertEquals(freshnessFromTsb(26), 'very_fresh');   // > +25
  assertEquals(freshnessFromTsb(25), 'fresh');        // +5..+25 inclusive top
  assertEquals(freshnessFromTsb(5), 'fresh');         // band floor
  assertEquals(freshnessFromTsb(4), 'neutral');       // grey zone top
  assertEquals(freshnessFromTsb(-10), 'neutral');     // grey zone floor
  assertEquals(freshnessFromTsb(-11), 'working');     // productive training
  assertEquals(freshnessFromTsb(-30), 'working');     // band floor
  assertEquals(freshnessFromTsb(-31), 'heavily_fatigued'); // high risk
});

Deno.test('no current numbers → no floor (never a guess)', () => {
  assertEquals(computeLoadFloor({ ctl: null, tsb: 5 }), null);
  assertEquals(computeLoadFloor({ ctl: 40, tsb: null }), null);
  assertEquals(computeLoadFloor({ ctl: NaN, tsb: 2 }), null);
});

Deno.test('no prior CTL → floor renders with trend null (freshness still speaks)', () => {
  const f = computeLoadFloor({ ctl: 42, tsb: 8 })!;
  assertEquals(f.ctl, 42);
  assertEquals(f.freshness, 'fresh');
  assertEquals(f.fitness_trend, null);
  assertEquals(f.ctl_delta_per_week, null);
});

Deno.test('trend dead-band: ±1 CTL/week renders holding; beyond it building/fading', () => {
  // 28 days apart. delta 4 over 28d = +1.0/wk → building (inclusive).
  assertEquals(computeLoadFloor({ ctl: 44, tsb: 0, ctlPrior: 40, daysBetween: 28 })!.fitness_trend, 'building');
  // +0.9/wk → holding.
  assertEquals(computeLoadFloor({ ctl: 43.6, tsb: 0, ctlPrior: 40, daysBetween: 28 })!.fitness_trend, 'holding');
  // −1.0/wk → fading.
  assertEquals(computeLoadFloor({ ctl: 36, tsb: 0, ctlPrior: 40, daysBetween: 28 })!.fitness_trend, 'fading');
});

Deno.test('prior closer than a week is not a trend', () => {
  assertEquals(computeLoadFloor({ ctl: 45, tsb: 0, ctlPrior: 40, daysBetween: 5 })!.fitness_trend, null);
});

Deno.test('delta is scaled per-week and rounded to one decimal', () => {
  const f = computeLoadFloor({ ctl: 46, tsb: -12, ctlPrior: 40, daysBetween: 21 })!;
  assertEquals(f.ctl_delta_per_week, 2);
  assertEquals(f.freshness, 'working');
});

Deno.test('newest-ride age passes through; absent → null', () => {
  assertEquals(computeLoadFloor({ ctl: 12, tsb: -3, newestRideAgeDays: 1 })!.newest_ride_age_days, 1);
  assertEquals(computeLoadFloor({ ctl: 12, tsb: -3 })!.newest_ride_age_days, null);
});

Deno.test('series: sorted, recent flag within 56d of newest, <2 points → null', () => {
  const f = computeLoadFloor({ ctl: 12, tsb: -3, series: [
    { date: '2026-08-12', value: 12.4 },
    { date: '2026-05-26', value: 14.2 },
    { date: '2026-07-01', value: 13.0 },
  ] })!;
  assertEquals(f.series!.map(p => p.date), ['2026-05-26', '2026-07-01', '2026-08-12']);
  assertEquals(f.series!.map(p => p.value), [14, 13, 12]);
  assertEquals(f.series!.map(p => p.recent), [false, true, true]);
  assertEquals(computeLoadFloor({ ctl: 12, tsb: -3, series: [{ date: '2026-08-12', value: 12 }] })!.series, null);
  assertEquals(computeLoadFloor({ ctl: 12, tsb: -3 })!.series, null);
});
