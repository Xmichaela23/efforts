/**
 * Fixture for the run-row floor fix (D-237, 2026-07-03): the GAP-pace run trend
 * counts only comparable-EASY runs, so its min-session floor must scale off the
 * athlete's EASY-run cadence — NOT total-run cadence.
 *
 * The bug: an athlete with 24 total runs/90d (cadence 1.87/wk → floor 4) but only
 * a handful of easy runs got a permanent "needs data" — 3 easy-GAP points < 4.
 * Fix: assemble derives the run cadence from the comparable-easy series length over
 * the 90d window; classifyTrend still windows the trend to 42d.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/run-cadence-population.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeRunState } from './run.ts';
import type { TrendPoint } from './types.ts';

const AS_OF = '2026-07-03';
const WEEKS_90D = 90 / 7;

// 6 comparable-easy GAP points over 90d: 3 within the last 42d (improving pace),
// 3 older (outside the 42d trend window — they lift cadence but not the trend series).
const SERIES_90D: TrendPoint[] = [
  { date: '2026-04-10', value: 340 },
  { date: '2026-04-25', value: 335 },
  { date: '2026-05-10', value: 330 },
  { date: '2026-05-25', value: 320 }, // ── last 42d below ──
  { date: '2026-06-10', value: 310 },
  { date: '2026-06-25', value: 300 },
];

Deno.test('easy-run cadence floor: 6 easy runs/90d (~0.47/wk) → floor 3, 3 recent points RENDER', () => {
  const comparableCadence = SERIES_90D.length / WEEKS_90D; // 6/12.857 ≈ 0.47
  const { trend } = computeRunState(SERIES_90D, AS_OF, comparableCadence);
  // classifyTrend windows to 42d → the 3 recent points; floor from 0.47/wk cadence = 3.
  assertEquals(trend.sampleCount, 3);
  assertEquals(trend.minSessions, 3);
  assertEquals(trend.verdict, 'improving'); // pace 320→300 over the window (lower = better)
});

Deno.test('the bug reproduced: the SAME 3 recent points, scored on TOTAL-run cadence, still fail', () => {
  const totalRunCadence = 1.87; // 24 runs/90d — what the old code passed
  const { trend } = computeRunState(SERIES_90D, AS_OF, totalRunCadence);
  assertEquals(trend.sampleCount, 3);
  assertEquals(trend.minSessions, 4); // avail 1.87*6=11.2 ≥ 8 → floor 4
  assertEquals(trend.verdict, 'needs_data'); // 3 < 4 → the permanent "needs data" bug
});
