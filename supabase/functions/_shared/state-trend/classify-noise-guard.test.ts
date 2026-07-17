// Signal-vs-noise gate on the trend classifier. Run: deno test --no-check classify-noise-guard.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';

const TH = { ...resolveThresholds('run', 1), improvePct: 5, slidePct: -5, lowerIsBetter: true };
const pts = (pairs: Array<[string, number]>) => pairs.map(([date, value]) => ({ date, value }));

// A directional read that DOESN'T clear the series' own scatter → holding (the run-decoupling case).
// Endpoints drop (early 41 → recent 33.5, a would-be "improving") but the middle swings wildly, so the
// shift is buried in the noise. This is exactly what Michael's 3–11% run-to-run decoupling does.
Deno.test('noisy shift (buried in scatter) → holding, not improving', () => {
  const series = pts([['2026-06-14', 42], ['2026-06-20', 40], ['2026-06-25', 20], ['2026-07-01', 55], ['2026-07-06', 15], ['2026-07-11', 34], ['2026-07-13', 33]]);
  assertEquals(classifyTrend(series, TH, '2026-07-16', {}).verdict, 'improving');                 // ungated: overclaims
  assertEquals(classifyTrend(series, TH, '2026-07-16', { noiseGuardStdev: 1.0 }).verdict, 'holding'); // gated: honest
});

// A CLEAN, low-scatter improvement still passes — the gate only kills noise, never a real trend.
Deno.test('clean shift that clears the scatter → keeps its direction', () => {
  const series = pts([['2026-06-14', 42], ['2026-06-20', 41], ['2026-06-28', 40], ['2026-07-05', 33], ['2026-07-10', 32], ['2026-07-13', 31]]);
  assertEquals(classifyTrend(series, TH, '2026-07-16', { noiseGuardStdev: 1.0 }).verdict, 'improving');
});

// The gate never INVENTS a direction — a genuine holding stays holding.
Deno.test('holding stays holding under the gate', () => {
  const series = pts([['2026-06-14', 38], ['2026-06-28', 37], ['2026-07-05', 38], ['2026-07-13', 37]]);
  assertEquals(classifyTrend(series, TH, '2026-07-16', { noiseGuardStdev: 1.0 }).verdict, 'holding');
});

// VOLUME / DATA-SUFFICIENCY gate (directionFloor): below N in-window samples, withhold the direction.
Deno.test('volume gate — at floor-1 → withheld; at floor → the direction is asserted', () => {
  // 8 clean improving points (offset positive so classify math is happy). floor = 8.
  const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-06-${String(10 + i).padStart(2, '0')}`, value: 40 - i }));
  const TH2 = { ...TH, lowerIsBetter: false }; // higher = better here so the falling series reads sliding; direction either way
  // 7 points (floor-1) → withheld
  assertEquals(classifyTrend(pts(7), TH2, '2026-07-16', { directionFloor: 8 }).verdict, 'withheld');
  // 8 points (at floor) → a real direction (not withheld)
  assertEquals(classifyTrend(pts(8), TH2, '2026-07-16', { directionFloor: 8 }).verdict !== 'withheld', true);
});
