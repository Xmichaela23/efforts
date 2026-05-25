/**
 * D-050 / Q-025 — Pin tests for the pace-at-HR percentile direction classifier.
 *
 * Spec: docs/PACE-AT-HR-TREND-SPEC.md §1.3.
 * Helper: pace-at-hr-direction.ts.
 *
 * Classifier semantics:
 *   - Reference distribution: per-pair slopes within the window (N-1 values).
 *   - Session signal: mean of the most recent K pair-slopes (K=3, smooths
 *     single-session noise).
 *   - Classification: recent-mean < p33 of pair distribution → improving;
 *     > p67 → declining; middle → stable.
 *   - Degenerate distribution (all pairs equal) → stable.
 *
 * Coverage:
 *   - 9-point window: improving / stable / declining trigger conditions
 *   - Tied / degenerate distributions → stable
 *   - <MIN_POINTS (6) → insufficient_data
 *   - GAP-basis preference at the 60% coverage boundary
 *   - Race-boundary shrink (sim): pool reduced to 4 → insufficient_data
 *   - Same-day duplicates handled deterministically (no divide-by-zero)
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/fact-packet/pace-at-hr-direction.test.ts --no-check --allow-read
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyPaceAtHrDirection, type PaceAtHrTrendPoint } from './pace-at-hr-direction.ts';

/** Synthesize a trend point at week N (anchored at 2026-01-05 Mon). */
function pt(weekIndex: number, pace_at_hr: number | null, basis: 'gap' | 'raw' = 'gap'): PaceAtHrTrendPoint {
  const ms = new Date('2026-01-05T00:00:00Z').getTime() + weekIndex * 7 * 24 * 3600 * 1000;
  const d = new Date(ms).toISOString().slice(0, 10);
  return { date: d, pace_at_hr, pace_basis: basis };
}

function fromDeltas(start: number, deltas: number[]): PaceAtHrTrendPoint[] {
  const vals = [start];
  for (const d of deltas) vals.push(vals[vals.length - 1] + d);
  return vals.map((v, i) => pt(i, v));
}

// ── 9-point window — improving / declining / stable triggers ─────────────

Deno.test('D-050: back-heavy negative (recent acceleration improvement) → improving', () => {
  // Per-pair distribution has wide range; recent 3 pair-slopes are deeply
  // negative (-10, -15, -20 in this fixture) — well below p33. Classifier
  // correctly tracks the recent-trend signal.
  const pts = fromDeltas(500, [+1, +0, -1, -2, -5, -10, -15, -20]);
  assertEquals(classifyPaceAtHrDirection(pts).direction, 'improving');
});

Deno.test('D-050: back-heavy positive (recent acceleration deterioration) → declining', () => {
  // Mirror — recent 3 pair-slopes are large positives → above p67.
  const pts = fromDeltas(500, [-1, +0, +1, +2, +5, +10, +15, +20]);
  assertEquals(classifyPaceAtHrDirection(pts).direction, 'declining');
});

Deno.test('D-050: steady decline (constant deltas) → stable (degenerate distribution)', () => {
  // All per-pair slopes equal → p33 === p67 → no session can be "unusually
  // fast/slow vs typical" → stable. This is the desired suppression: a
  // perfectly steady trend isn't a NEW direction signal.
  const pts = fromDeltas(500, [-5, -5, -5, -5, -5, -5, -5, -5]);
  assertEquals(classifyPaceAtHrDirection(pts).direction, 'stable');
});

Deno.test('D-050: wide-variance noise around zero → stable (recent mean inside p33-p67)', () => {
  // Alternating large + and -; recent K mean stays small → middle band.
  const pts = fromDeltas(500, [-15, +10, -12, +8, -10, +5, -8, +2]);
  assertEquals(classifyPaceAtHrDirection(pts).direction, 'stable');
});

Deno.test('D-050: single outlier delta does not flip direction (recent-K smooths noise)', () => {
  // One large -30 delta at end; recent 3 pair-slopes mean ≈ -10 — not extreme
  // enough vs the rest of the wide-variance distribution.
  const pts = fromDeltas(500, [+1, -1, +0, -1, +1, -2, -1, -30]);
  assertEquals(classifyPaceAtHrDirection(pts).direction, 'stable');
});

Deno.test('D-050: front-heavy improvement followed by plateau → declining (recent trend reversing)', () => {
  // Early aggressive negatives, recent plateau/reversal — the SIGNAL is the
  // recent direction, not the cumulative trend. Recent K mean is positive
  // (above p67) → declining. Correctly says "your recent trend is going the
  // wrong way" even though the cumulative window is net-negative.
  const pts = fromDeltas(500, [-15, -12, -10, -8, -5, -2, +1, +2]);
  assertEquals(classifyPaceAtHrDirection(pts).direction, 'declining');
});

// ── Minimum point count + insufficient_data ──────────────────────────────

Deno.test('D-050: single point → insufficient_data', () => {
  const out = classifyPaceAtHrDirection([pt(0, 500)]);
  assertEquals(out.direction, 'insufficient_data');
});

Deno.test('D-050: 5 points (below MIN_POINTS=6) → insufficient_data', () => {
  const pts = [pt(0, 500), pt(1, 498), pt(2, 495), pt(3, 492), pt(4, 489)];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.direction, 'insufficient_data');
});

Deno.test('D-050: 6 points (at MIN_POINTS floor) → classified, not insufficient', () => {
  const pts = [pt(0, 500), pt(1, 498), pt(2, 495), pt(3, 503), pt(4, 491), pt(5, 506)];
  const out = classifyPaceAtHrDirection(pts);
  assert(out.direction !== 'insufficient_data', `expected a classification, got ${out.direction}`);
});

Deno.test('D-050: all-null pace_at_hr → insufficient_data with basis: null', () => {
  const pts = Array.from({ length: 8 }, (_, i) => pt(i, null));
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.direction, 'insufficient_data');
  assertEquals(out.basis, null);
});

Deno.test('D-050: empty pool → insufficient_data with basis: null', () => {
  const out = classifyPaceAtHrDirection([]);
  assertEquals(out.direction, 'insufficient_data');
  assertEquals(out.basis, null);
});

// ── GAP-basis preference (60% coverage boundary) ─────────────────────────

Deno.test('D-050: GAP coverage ≥60% (7 gap / 3 raw) → basis=gap, uses GAP-only subset', () => {
  // 7 gap (steady improvement), 3 raw (large outliers that would skew slope).
  // Restricting to gap-only (70% coverage) keeps the slope clean.
  const pts: PaceAtHrTrendPoint[] = [
    pt(0, 500, 'gap'), pt(1, 498, 'gap'), pt(2, 495, 'gap'),
    pt(3, 492, 'gap'), pt(4, 489, 'gap'), pt(5, 487, 'gap'),
    pt(6, 484, 'gap'),
    pt(7, 530, 'raw'), pt(8, 540, 'raw'), pt(9, 550, 'raw'),
  ];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.basis, 'gap');
  assert(out.direction !== 'insufficient_data');
});

Deno.test('D-050: GAP coverage exactly 60% (6 gap / 4 raw) → basis=gap', () => {
  const pts: PaceAtHrTrendPoint[] = [
    pt(0, 500, 'gap'), pt(1, 498, 'gap'), pt(2, 495, 'gap'),
    pt(3, 492, 'gap'), pt(4, 489, 'gap'), pt(5, 486, 'gap'),
    pt(6, 540, 'raw'), pt(7, 545, 'raw'), pt(8, 550, 'raw'), pt(9, 555, 'raw'),
  ];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.basis, 'gap');
});

Deno.test('D-050: GAP coverage <60% (5 gap / 5 raw = 50%) → basis=raw, uses all points', () => {
  const pts: PaceAtHrTrendPoint[] = [
    pt(0, 500, 'gap'), pt(1, 498, 'gap'), pt(2, 495, 'gap'),
    pt(3, 492, 'gap'), pt(4, 489, 'gap'),
    pt(5, 540, 'raw'), pt(6, 545, 'raw'), pt(7, 550, 'raw'),
    pt(8, 555, 'raw'), pt(9, 560, 'raw'),
  ];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.basis, 'raw');
  assert(out.direction !== 'insufficient_data');
});

Deno.test('D-050: GAP coverage 71% but gap-only pool size 5 (< MIN_POINTS) → insufficient_data on gap basis', () => {
  // 5 gap (below MIN_POINTS=6) + 2 raw → 5/7 = 71% gap → restrict to gap-only
  // (5 points) → below floor → insufficient_data. basis still 'gap' (the
  // chosen path, even though it ran out of points).
  const pts: PaceAtHrTrendPoint[] = [
    pt(0, 500, 'gap'), pt(1, 498, 'gap'), pt(2, 495, 'gap'),
    pt(3, 492, 'gap'), pt(4, 489, 'gap'),
    pt(5, 540, 'raw'), pt(6, 545, 'raw'),
  ];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.direction, 'insufficient_data');
  assertEquals(out.basis, 'gap');
});

Deno.test('D-050: mixed-basis points without explicit basis flag default to raw (no gap count)', () => {
  // Points missing pace_basis → not counted as gap-basis → 0% coverage →
  // raw path.
  const pts: PaceAtHrTrendPoint[] = [
    { date: '2026-01-05', pace_at_hr: 500 },
    { date: '2026-01-12', pace_at_hr: 498 },
    { date: '2026-01-19', pace_at_hr: 495 },
    { date: '2026-01-26', pace_at_hr: 492 },
    { date: '2026-02-02', pace_at_hr: 489 },
    { date: '2026-02-09', pace_at_hr: 487 },
  ];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.basis, 'raw');
});

// ── Race-boundary shrink simulation ──────────────────────────────────────

Deno.test('D-050: race-boundary filter shrinks pool to 4 → insufficient_data, no silent fallback', () => {
  // Caller (queries.ts D-041 filter) trims pool to post-race-only points;
  // we receive 4 valid points → below MIN_POINTS → insufficient_data on
  // the filtered window. Classifier MUST NOT silently expand to use a
  // wider pool — the basis is correctly reported as 'gap' (the resolved
  // basis path for these points), but direction is insufficient_data.
  const pts: PaceAtHrTrendPoint[] = [
    pt(0, 500, 'gap'), pt(1, 495, 'gap'), pt(2, 492, 'gap'), pt(3, 490, 'gap'),
  ];
  const out = classifyPaceAtHrDirection(pts);
  assertEquals(out.direction, 'insufficient_data');
  assertEquals(out.basis, 'gap');
});

// ── Same-day duplicate handling (no divide-by-zero) ─────────────────────

Deno.test('D-050: same-day duplicates skipped in pair-slope (no infinite slope)', () => {
  // Two same-day points (day 0); classifier must not divide by zero on the
  // dx = 0 pair, and must produce a deterministic classification on the
  // remaining valid pairs.
  const pts: PaceAtHrTrendPoint[] = [
    pt(0, 500), pt(0, 502), // duplicate day
    pt(1, 498), pt(2, 495), pt(3, 492), pt(4, 489), pt(5, 487),
  ];
  const out = classifyPaceAtHrDirection(pts);
  assert(['improving', 'stable', 'declining'].includes(out.direction));
});
