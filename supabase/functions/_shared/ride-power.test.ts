import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  averagePowerW,
  judgedPowerW,
  normalizedPowerW,
  pedalingAveragePowerW,
  powerRangeBand,
  powerStreamW,
  readPowerW,
} from './ride-power.ts';

Deno.test('a 0 W second is a reading, not a gap', () => {
  assertEquals(readPowerW({ power: 0 }), 0);
  assertEquals(readPowerW({ powerInWatts: 0, power: 180 }), 0);
  assertEquals(readPowerW({ heart_rate: 140 }), undefined);
});

Deno.test('coasting counts as 0 W; a ride with no power stays empty', () => {
  assertEquals(powerStreamW([200, null, 0, undefined, 2500]), [200, 0, 0, 0, 0]);
  assertEquals(powerStreamW([null, undefined]), []);
  assertEquals(averagePowerW([200, 0]), 100);
});

Deno.test('normalized power of a steady stream is that power', () => {
  const np = normalizedPowerW(new Array(600).fill(150));
  assert(np != null && Math.abs(np - 150) < 1e-9);
  assertEquals(normalizedPowerW(new Array(29).fill(150)), null);
});

Deno.test('normalized power weighs surges above the plain average', () => {
  const s = Array.from({ length: 1200 }, (_, i) => (Math.floor(i / 60) % 2 === 0 ? 250 : 0));
  assert(normalizedPowerW(s)! > averagePowerW(s)!);
});

Deno.test('20 minutes or longer is judged on normalized power, shorter on average', () => {
  const s = Array.from({ length: 1200 }, (_, i) => (Math.floor(i / 60) % 2 === 0 ? 250 : 0));
  assertEquals(judgedPowerW(s, 1200).basis, 'normalized');
  assertEquals(judgedPowerW(s.slice(0, 600), 600).basis, 'average');
  assertEquals(judgedPowerW(s.slice(0, 600), 600).watts, 125);
  assertEquals(judgedPowerW([], 1200), { watts: null, basis: null });
});

Deno.test('pedalling average: seconds above 25 W, time-weighted, long gaps skipped', () => {
  const t = [0, 1, 2, 3, 4, 1000];
  const p = [0, 200, 20, 100, 0, 300];
  const r = pedalingAveragePowerW(t, p);
  assertEquals(r.avg_w, 150);
  assertEquals(r.pedaling_s, 2);
  assertEquals(r.clock_s, 4);
});

Deno.test('the range itself, no allowance', () => {
  assertEquals(powerRangeBand(126, 109, 126), 'in');
  assertEquals(powerRangeBand(128, 109, 126), 'above');
  assertEquals(powerRangeBand(108, 109, 126), 'below');
  assertEquals(powerRangeBand(128, 0, 126), null);
});
