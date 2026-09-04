/**
 * The run trend no longer scales a floor off cadence (2026-09-04, docs/SPEC-state-nothing-invented-2026-09-04.md).
 * Garmin's rule: the last 28 days against the 28 before, one session in each half is enough. The same
 * series must read the same whatever cadence the caller passes — the D-237 bug (a frequent runner with few
 * easy runs stuck on "needs data") cannot come back, because there is no floor to fall under.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/run-cadence-population.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeRunState } from './run.ts';
import type { TrendPoint } from './types.ts';

const AS_OF = '2026-07-03';
// window 05-08..07-03; recent half opens 06-05
const SERIES_90D: TrendPoint[] = [
  { date: '2026-04-10', value: 340 },
  { date: '2026-04-25', value: 335 },
  { date: '2026-05-10', value: 330 }, // ── prior half ──
  { date: '2026-05-25', value: 320 },
  { date: '2026-06-10', value: 310 }, // ── recent half ──
  { date: '2026-06-25', value: 300 },
];

Deno.test('the same series reads the same at any cadence — prior 325 → recent 305 s/km, faster = improving', () => {
  for (const cadence of [0.47, 1.87, 12]) {
    const { trend } = computeRunState(SERIES_90D, AS_OF, cadence);
    assertEquals(trend.sampleCount, 4);
    assertEquals([trend.earlyCount, trend.recentCount], [2, 2]);
    assertEquals(trend.earlyAvg, 325);
    assertEquals(trend.recentAvg, 305);
    assertEquals(trend.verdict, 'improving');
    assertEquals(trend.minSessions, 1);
  }
});

Deno.test('one easy run in each half is a read; a half with none is blank', () => {
  const { trend } = computeRunState([{ date: '2026-05-20', value: 320 }, { date: '2026-06-20', value: 300 }], AS_OF, 0.2);
  assertEquals(trend.verdict, 'improving');
  const { trend: blank } = computeRunState([{ date: '2026-06-10', value: 310 }, { date: '2026-06-25', value: 300 }], AS_OF, 0.2);
  assertEquals(blank.verdict, 'needs_data');
});
