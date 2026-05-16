/**
 * Tests for pickCyclingTrendSeries — mode-aware TREND series selection
 * (design Build Order #1, docs/CYCLING-ANALYSIS-DESIGN.md).
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/session-detail/cycling-trend.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickCyclingTrendSeries } from './build.ts';

const pts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-0${1 + (i % 9)}-01`, value: 200 + i, is_current: i === n - 1 }));

Deno.test('prefers pwr20_trend_v1 when it has ≥3 points (doc Mode 2 resolution)', () => {
  const r = pickCyclingTrendSeries({
    pwr20_trend_v1: { points: pts(4) },
    np_trend_v1: { points: pts(5) },
  })!;
  assertEquals(r.metricLabel, 'Best 20-min power');
  assertEquals(r.noun, '20-min power');
  assertEquals(r.points.length, 4);
});

Deno.test('falls back to np_trend_v1 when pwr20 absent or <3 (no regression)', () => {
  assertEquals(
    pickCyclingTrendSeries({ np_trend_v1: { points: pts(3) } }),
    { points: pts(3), metricLabel: 'Normalized power', noun: 'NP' },
  );
  // pwr20 present but only 2 points → still fall back to NP
  const r = pickCyclingTrendSeries({
    pwr20_trend_v1: { points: pts(2) },
    np_trend_v1: { points: pts(6) },
  })!;
  assertEquals(r.metricLabel, 'Normalized power');
  assertEquals(r.points.length, 6);
});

Deno.test('neither series usable → null', () => {
  assertEquals(pickCyclingTrendSeries(null), null);
  assertEquals(pickCyclingTrendSeries(undefined), null);
  assertEquals(pickCyclingTrendSeries({}), null);
  assertEquals(pickCyclingTrendSeries({ pwr20_trend_v1: { points: pts(2) } }), null);
  assertEquals(pickCyclingTrendSeries({ np_trend_v1: { points: [] } }), null);
});
