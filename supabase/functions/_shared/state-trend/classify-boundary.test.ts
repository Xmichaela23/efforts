/**
 * Boundary fixture for the run-trend eligibility gate (bug: Michael 2026-07-03).
 *
 * The State RUN row read "Not enough data yet — 3 runs in 6wk (need 3)" — the
 * count met the STATED requirement but the gate still said insufficient. Root
 * cause: minSessions scales with cadence (thresholds.ts) — a ~2.6 runs/wk athlete
 * has minSessions=4 — so 3 runs is genuinely too-few, but the receipt hardcoded
 * "(need 3)". The gate (`inWindow.length < minSessions`) was correct; the COPY
 * lied. Fix: classify now carries `minSessions` in its result so the receipt
 * cites the real floor.
 *
 * This pins: exactly-at-threshold → a real verdict renders (not needs_data), and
 * the too-few result carries the true minSessions for the receipt.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/classify-boundary.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyTrend } from './classify.ts';

const AS_OF = '2026-07-03';
// Run thresholds with the cadence-scaled floor = 4 (a ~2.6 runs/wk athlete). freshnessDays
// omitted → staleness gate off, isolating the min-session boundary.
const RUN_TH = { windowDays: 42, improvePct: 2.0, slidePct: -2.0, minSessions: 4, lowerIsBetter: true };

// Pace (sec/km, lower = better) improving over the window.
const P = [
  { date: '2026-06-02', value: 300 },
  { date: '2026-06-12', value: 295 },
  { date: '2026-06-22', value: 280 },
  { date: '2026-06-30', value: 270 },
];

Deno.test('exactly at threshold (4 runs, minSessions 4) → a real verdict RENDERS, not needs_data', () => {
  const r = classifyTrend(P, RUN_TH, AS_OF);
  assertEquals(r.sampleCount, 4);
  assertEquals(r.verdict !== 'needs_data', true);
  assertEquals(r.verdict, 'improving'); // pace dropping = improving (lowerIsBetter)
  assertEquals(r.minSessions, 4);       // carried for the receipt
});

Deno.test('one below threshold (3 runs, minSessions 4) → needs_data, result carries the REAL floor 4', () => {
  const r = classifyTrend(P.slice(1), RUN_TH, AS_OF); // 3 points
  assertEquals(r.sampleCount, 3);
  assertEquals(r.verdict, 'needs_data');
  assertEquals(r.stale, false);      // too-few, not stale
  assertEquals(r.minSessions, 4);    // → receipt says "(need 4)", not "(need 3)"
});

Deno.test('a lower-cadence athlete keeps floor 3: exactly 3 runs at minSessions 3 → verdict renders', () => {
  const th3 = { ...RUN_TH, minSessions: 3 };
  const r = classifyTrend(P.slice(1), th3, AS_OF); // 3 points, floor 3
  assertEquals(r.sampleCount, 3);
  assertEquals(r.verdict !== 'needs_data', true); // 3 >= 3 → renders
  assertEquals(r.minSessions, 3);
});
