/**
 * "STILL MOVING vs FLATTENED" fixture (Michael 2026-07-22 — "all the words for every scenario has to be
 * precise"). classifyTrend now carries `recentlyFlat`: on a moving verdict, true when the SECOND HALF of
 * the window sits inside the holding band. It lets the display split the sliding verdict into two words:
 *   sliding + recentlyFlat  → "settled lower" (dropped, then levelled)
 *   sliding + !recentlyFlat → "easing off"    (still drifting down)
 *
 * The load-bearing regression is Michael's OWN run-efficiency series (higher = better): it fell ~11% net
 * but the recent three runs are flat, so it must read "settled lower", NOT the alarming still-declining
 * word. A single green run is not evidence — the cases below cover flat-tail, still-falling, and the
 * improving mirror so the flag can't silently invert.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/classify-recently-flat.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyTrend } from './classify.ts';

const AS_OF = '2026-07-22';
// Run-efficiency thresholds (run.ts:95): higher = better, ±3% bands, floor 3 so 6 runs qualify.
const EFF_TH = { windowDays: 42, improvePct: 3, slidePct: -3, minSessions: 3, lowerIsBetter: false };

// Michael's real efficiency_index series (speed per heartbeat), oldest→newest. Net drops 1.74→1.54
// (~-11%), but the last three (1.57, 1.53, 1.55) are flat within noise.
const MICHAEL_EFF = [
  { date: '2026-06-14', value: 1.76 },
  { date: '2026-06-24', value: 1.72 },
  { date: '2026-07-02', value: 1.57 },
  { date: '2026-07-08', value: 1.57 },
  { date: '2026-07-15', value: 1.53 },
  { date: '2026-07-20', value: 1.55 },
];

Deno.test('Michael efficiency: fell then flattened → sliding + recentlyFlat ("settled lower")', () => {
  const r = classifyTrend(MICHAEL_EFF, EFF_TH, AS_OF);
  assertEquals(r.verdict, 'sliding');
  assertEquals(r.recentlyFlat, true);
});

Deno.test('still falling every run → sliding + NOT recentlyFlat ("easing off")', () => {
  const falling = [
    { date: '2026-06-14', value: 1.76 },
    { date: '2026-06-24', value: 1.70 },
    { date: '2026-07-02', value: 1.62 },
    { date: '2026-07-08', value: 1.54 },
    { date: '2026-07-15', value: 1.46 },
    { date: '2026-07-20', value: 1.38 },
  ];
  const r = classifyTrend(falling, EFF_TH, AS_OF);
  assertEquals(r.verdict, 'sliding');
  assertEquals(r.recentlyFlat, false);
});

Deno.test('rose then flattened → improving + recentlyFlat (flag set, still reads "improving")', () => {
  const roseThenFlat = [
    { date: '2026-06-14', value: 1.40 },
    { date: '2026-06-24', value: 1.48 },
    { date: '2026-07-02', value: 1.56 },
    { date: '2026-07-08', value: 1.57 },
    { date: '2026-07-15', value: 1.56 },
    { date: '2026-07-20', value: 1.57 },
  ];
  const r = classifyTrend(roseThenFlat, EFF_TH, AS_OF);
  assertEquals(r.verdict, 'improving');
  assertEquals(r.recentlyFlat, true);
});

Deno.test('holding the whole window → recentlyFlat stays false (only computed on a moving verdict)', () => {
  const flat = [
    { date: '2026-06-14', value: 1.55 },
    { date: '2026-06-24', value: 1.56 },
    { date: '2026-07-02', value: 1.54 },
    { date: '2026-07-08', value: 1.55 },
    { date: '2026-07-15', value: 1.56 },
    { date: '2026-07-20', value: 1.55 },
  ];
  const r = classifyTrend(flat, EFF_TH, AS_OF);
  assertEquals(r.verdict, 'holding');
  assertEquals(r.recentlyFlat, false);
});
