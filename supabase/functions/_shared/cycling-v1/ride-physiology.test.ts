/**
 * Tests for ride-physiology — HR-at-power + aerobic decoupling (design Build
 * Order #4) and VAM (#5). Pure helpers; no DB / function invocation.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/cycling-v1/ride-physiology.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCtlAtl, computeRideEfficiency, computeRideTss, computeRideVam } from './ride-physiology.ts';

// ── computeCtlAtl (PMC; design Build Order #7) ──────────────────────────────

Deno.test('ctl/atl: sustained constant TSS → CTL≈ATL≈TSS, TSB≈0', () => {
  const r = computeCtlAtl(Array.from({ length: 400 }, () => 100))!;
  assertEquals(r.ctl, 100);
  assertEquals(r.atl, 100);
  assertEquals(r.tsb, 0);
});

Deno.test('ctl/atl: ramp → ATL outruns CTL → negative TSB (fatigued)', () => {
  // 0 baseline then a hard block: ATL (7d) rises faster than CTL (42d).
  const r = computeCtlAtl([...Array(60).fill(50), ...Array(14).fill(150)])!;
  assert(r.atl > r.ctl);
  assert(r.tsb < 0);
});

Deno.test('ctl/atl: taper (TSS→0) → ATL falls faster → positive TSB (fresh)', () => {
  const r = computeCtlAtl([...Array(60).fill(100), ...Array(10).fill(0)])!;
  assert(r.atl < r.ctl);
  assert(r.tsb > 0);
});

Deno.test('ctl/atl: rest days (0) counted; non-finite coerced to 0; empty → null', () => {
  assertEquals(computeCtlAtl([]), null);
  assertEquals(computeCtlAtl('x' as any), null);
  const r = computeCtlAtl([100, 0, 0, NaN as any, 100])!;
  assert(r.ctl >= 0 && r.atl >= 0); // no NaN propagation
});

// ── computeRideTss (NP-based Coggan; design Build Order #3) ──────────────────

Deno.test('tss: 1 h exactly at FTP → IF 1.0 → TSS 100', () => {
  assertEquals(computeRideTss(250, 250, 3600), 100);
});

Deno.test('tss: standard NP-based formula (duration/3600 · IF² · 100)', () => {
  // NP 240, FTP 250 → IF 0.96 ; 1 h → 0.96² · 100 = 92.16 → 92
  assertEquals(computeRideTss(240, 250, 3600), 92);
  // 2 h at IF 0.7 (NP 175 / FTP 250) → 2 · 0.49 · 100 = 98
  assertEquals(computeRideTss(175, 250, 7200), 98);
});

Deno.test('tss: invalid NP / FTP / duration → null (key omitted)', () => {
  assertEquals(computeRideTss(0, 250, 3600), null);
  assertEquals(computeRideTss(-10, 250, 3600), null);
  assertEquals(computeRideTss(240, 0, 3600), null);
  assertEquals(computeRideTss(240, 250, 0), null);
  assertEquals(computeRideTss(240, 250, -5), null);
  assertEquals(computeRideTss(null, 250, 3600), null);
  assertEquals(computeRideTss(240, null, 3600), null);
  assertEquals(computeRideTss(240, 250, null), null);
  assertEquals(computeRideTss(NaN, 250, 3600), null);
});

// ── computeRideEfficiency ───────────────────────────────────────────────────

Deno.test('efficiency: fewer than 60 paired pedaling samples → null', () => {
  const t = Array.from({ length: 40 }, (_, i) => i);
  const hr = t.map(() => 140);
  const p = t.map(() => 200);
  assertEquals(computeRideEfficiency(t, hr, p, null), null);
});

Deno.test('efficiency: steady ride, no NP → EF = avgPower/avgHR, no decoupling under 20 min', () => {
  const t = Array.from({ length: 100 }, (_, i) => i); // 99 s span < 1200
  const hr = t.map(() => 140);
  const p = t.map(() => 210);
  const r = computeRideEfficiency(t, hr, p, null)!;
  assert(r);
  assertEquals(r.efficiency_factor, 1.5); // 210/140
  assertEquals(r.avg_pedaling_power_w, 210);
  assertEquals(r.avg_pedaling_hr_bpm, 140);
  assertEquals(r.aerobic_decoupling_pct, undefined); // span < 1200 s
});

Deno.test('efficiency: NP provided → EF uses NP/HR (not avg power)', () => {
  const t = Array.from({ length: 100 }, (_, i) => i);
  const hr = t.map(() => 150);
  const p = t.map(() => 200);
  const r = computeRideEfficiency(t, hr, p, 240)!;
  assertEquals(r.efficiency_factor, 1.6); // 240/150, not 200/150
});

Deno.test('efficiency: coasting (power 0) samples excluded from the read', () => {
  // 80 pedaling @ 200W/140bpm + 80 coasting @ 0W/120bpm. Coasting must not
  // drag avg HR down or count toward the sample floor incorrectly.
  const t = Array.from({ length: 160 }, (_, i) => i);
  const p = t.map((_, i) => (i < 80 ? 200 : 0));
  const hr = t.map((_, i) => (i < 80 ? 140 : 120));
  const r = computeRideEfficiency(t, hr, p, null)!;
  assertEquals(r.avg_pedaling_hr_bpm, 140); // coasting 120s ignored
  assertEquals(r.avg_pedaling_power_w, 200);
});

Deno.test('efficiency: ≥20 min span → aerobic_decoupling_pct; positive when HR drifts up at held power', () => {
  // 1400 samples (~23 min). Power held 200W throughout; HR 140 first half,
  // 154 second half → second-half power:HR ratio lower → positive decoupling.
  const t = Array.from({ length: 1400 }, (_, i) => i);
  const p = t.map(() => 200);
  const hr = t.map((_, i) => (i < 700 ? 140 : 154));
  const r = computeRideEfficiency(t, hr, p, null)!;
  assert(typeof r.aerobic_decoupling_pct === 'number');
  // r1 = 200/140 = 1.4286 ; r2 = 200/154 = 1.2987 ; (r1-r2)/r1 ≈ 9.1%
  assert(r.aerobic_decoupling_pct! > 8 && r.aerobic_decoupling_pct! < 10);
});

Deno.test('efficiency: held HR + held power over 20 min → ~0% decoupling', () => {
  const t = Array.from({ length: 1400 }, (_, i) => i);
  const p = t.map(() => 200);
  const hr = t.map(() => 145);
  const r = computeRideEfficiency(t, hr, p, null)!;
  assertEquals(r.aerobic_decoupling_pct, 0);
});

// ── computeRideVam ──────────────────────────────────────────────────────────

Deno.test('vam: sustained climb → vertical metres/hour over the climbing portion', () => {
  // 600 s, +300 m at a steady 6% grade → VAM = 300 / 600 * 3600 = 1800 m/h
  const t = Array.from({ length: 601 }, (_, i) => i);
  const elev = t.map((_, i) => 100 + i * 0.5); // +0.5 m/s = +300 m over 600 s
  const grade = t.map(() => 6);
  const r = computeRideVam(t, elev, grade)!;
  assertEquals(r.vam_m_per_h, 1800);
  assertEquals(r.climb_ascent_m, 300);
  assertEquals(r.climb_time_s, 600);
});

Deno.test('vam: flats and descents excluded (grade < 3% or non-positive delta)', () => {
  // First 300 s flat (grade 0), then 400 s climbing +200 m at 7%.
  const t = Array.from({ length: 701 }, (_, i) => i);
  const elev = t.map((_, i) => (i <= 300 ? 100 : 100 + (i - 300) * 0.5));
  const grade = t.map((_, i) => (i <= 300 ? 0 : 7));
  const r = computeRideVam(t, elev, grade)!;
  assertEquals(r.climb_ascent_m, 200);
  assertEquals(r.climb_time_s, 400);
  assertEquals(r.vam_m_per_h, 1800); // 200/400*3600
});

Deno.test('vam: insufficient climb (<30 m gain or <120 s) → null', () => {
  const t = Array.from({ length: 200 }, (_, i) => i);
  const tinyElev = t.map((_, i) => 100 + i * 0.05); // ~10 m over 200 s
  assertEquals(computeRideVam(t, tinyElev, t.map(() => 5)), null); // gain < 30
  const shortT = Array.from({ length: 60 }, (_, i) => i);
  const steepElev = shortT.map((_, i) => 100 + i); // +59 m but only 59 s
  assertEquals(computeRideVam(shortT, steepElev, shortT.map(() => 8)), null); // time < 120
});

Deno.test('vam: no usable elevation/grade → null', () => {
  const t = Array.from({ length: 300 }, (_, i) => i);
  assertEquals(computeRideVam(t, t.map(() => null), t.map(() => null)), null);
});
