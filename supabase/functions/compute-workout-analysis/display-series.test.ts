/**
 * The Details map's chart lines and scrub readouts (2026-09-10, audit H-D02 / H-D03).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/compute-workout-analysis/display-series.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildDisplaySeries,
  centredTimeMean,
  cumulativeClimb,
  gradeSeries,
  paceSeries,
  vamSeries,
} from './display-series.ts';

const secs = (n: number) => Array.from({ length: n }, (_, i) => i);

Deno.test('heart rate: the 15 s centred mean keeps a real peak and ignores a dropout', () => {
  const t = secs(31);
  const hr = t.map((i) => (i === 15 ? null : 150));
  const out = centredTimeMean(hr, t, 15);
  assertEquals(out[15], 150);
  assertEquals(out.every((v) => v === 150), true);
});

Deno.test('a window with no reading at all is null, not a filled number', () => {
  const t = secs(100);
  const cad = t.map((i) => (i < 40 ? 90 : null));
  const out = centredTimeMean(cad, t, 30);
  assertEquals(out[30], 90);
  assertEquals(out[80], null);
});

Deno.test('pace: 4 m/s steady is 250 s/km; standing still has no pace', () => {
  const t = secs(200);
  const d = t.map((i) => (i < 100 ? i * 4 : 400));
  const p = paceSeries(t, d);
  assertEquals(p[50], 250);
  assertEquals(p[180], null);
});

Deno.test('grade: 5 m of rise over 100 m is 5.0%; flat is 0', () => {
  const d = Array.from({ length: 400 }, (_, i) => i);
  const e = d.map((x) => (x < 200 ? 100 : 100 + (x - 200) * 0.05));
  const g = gradeSeries(d, e);
  assertEquals(g[300], 5);
  assertEquals(g[50], 0);
});

Deno.test('VAM: 0.25 m of climb a second is 900 m/h', () => {
  const t = secs(300);
  const e = t.map((i) => 200 + i * 0.25);
  assertEquals(vamSeries(t, e)[150], 900);
});

Deno.test('running climb ends on the recorded total when the row has one', () => {
  const d = Array.from({ length: 1000 }, (_, i) => i * 5);
  const e = d.map((x) => 100 + 20 * Math.sin(x / 400));
  const raw = cumulativeClimb(d, e);
  const lastRaw = raw.gain[raw.gain.length - 1] as number;
  const scaled = cumulativeClimb(d, e, { gain_m: 150, loss_m: 90 });
  assertEquals(lastRaw > 0, true);
  assertEquals(scaled.gain[scaled.gain.length - 1], 150);
  assertEquals(scaled.loss[scaled.loss.length - 1], 90);
  // It never goes down.
  assertEquals(scaled.gain.every((v, i) => i === 0 || (v as number) >= (scaled.gain[i - 1] as number)), true);
});

Deno.test('a bump under 1.5 m is not a climb', () => {
  const d = Array.from({ length: 100 }, (_, i) => i * 10);
  const e = d.map((_, i) => (i % 2 ? 101 : 100));
  const c = cumulativeClimb(d, e);
  assertEquals(c.gain[99], 0);
  assertEquals(c.loss[99], 0);
});

Deno.test('indoors: no grade and no VAM; a ride has no pace; a missing sensor stores nothing', () => {
  const t = secs(120);
  const d = t.map((i) => i * 8);
  const e = t.map((i) => 50 + i * 0.1);
  const out = buildDisplaySeries({
    time_s: t, distance_m: d, elevation_m: e, hr_bpm: t.map(() => 140), cadence: t.map(() => null),
    power_w: t.map(() => 200), isRide: true, indoor: true,
  });
  assertEquals(out.grade_display_pct, []);
  assertEquals(out.vam_m_per_h, []);
  assertEquals(out.pace_display_s_per_km, []);
  assertEquals(out.cadence_display, []);
  assertEquals(out.power_display_w.length, 120);
  assertEquals(out.hr_display_bpm[60], 140);
});
