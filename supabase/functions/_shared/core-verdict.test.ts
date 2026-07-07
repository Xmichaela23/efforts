/**
 * core-verdict.test.ts — fixtures for the segment verdict (DESIGN-segments §5; Law 5 citizen logic).
 *
 * Pins: leads with same-effort pace when HR clears the floor; raw-pace fallback otherwise; NEVER a
 * direction below the N floor (still_building); the 6-month window drops a stale anchor (fixes
 * magnitude leverage, not the sign). The real-data case reproduces the off-spine preview: 19 efforts
 * in-window → honest `still_learning`, no false claim.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/core-verdict.test.ts --no-check
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeCoreVerdict, type CoreEffortRow } from './core-verdict.ts';

function series(pStart: number, pEnd: number, hr: number, src: 'hr_aligned' | 'raw_pace_only', n = 10, asOf = '2026-08-15'): CoreEffortRow[] {
  const out: CoreEffortRow[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(asOf + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (n - 1 - i) * 14);
    const pace = Math.round(pStart + (pEnd - pStart) * (i / (n - 1)));
    out.push({ effort_date: d.toISOString().slice(0, 10), avg_pace_s_per_km: pace, avg_hr_bpm: src === 'hr_aligned' ? hr : null, metric_source: src });
  }
  return out;
}

Deno.test('clean faster-per-HR trend → improving, metric same_effort_pace', () => {
  const v = computeCoreVerdict(series(430, 370, 135, 'hr_aligned'), { asOf: '2026-08-15' });
  assertEquals(v.metric, 'same_effort_pace');
  assertEquals(v.direction, 'improving');
});

Deno.test('below the N floor → still_building, no direction, no metric', () => {
  const v = computeCoreVerdict(series(430, 370, 135, 'hr_aligned', 5), { asOf: '2026-08-15' });
  assertEquals(v.direction, 'still_building');
  assertEquals(v.metric, null);
  assertEquals(v.trend, null);
});

Deno.test('6-month window excludes a stale anchor (magnitude leverage fix)', () => {
  const withAnchor: CoreEffortRow[] = [
    { effort_date: '2024-01-01', avg_pace_s_per_km: 340, avg_hr_bpm: 135, metric_source: 'hr_aligned' },
    ...series(410, 405, 135, 'hr_aligned'),
  ];
  const v = computeCoreVerdict(withAnchor, { asOf: '2026-08-15', windowDays: 183 });
  assertEquals(v.n, 10);
});

Deno.test('no HR-aligned efforts → raw_pace fallback still yields a read', () => {
  const v = computeCoreVerdict(series(430, 370, 135, 'raw_pace_only'), { asOf: '2026-08-15' });
  assertEquals(v.metric, 'raw_pace');
  assert(v.direction !== 'still_building');
});

Deno.test('REAL DATA — his 20 efforts, 6mo window → 19 in-window, honest still_learning', () => {
  const e: [string, number, number][] = [
    ['2025-05-17', 354, 140], ['2026-02-02', 442, 135], ['2026-02-19', 408, 143], ['2026-02-27', 411, 131],
    ['2026-03-01', 400, 127], ['2026-03-05', 364, 132], ['2026-03-12', 411, 140], ['2026-03-18', 404, 128],
    ['2026-03-20', 398, 143], ['2026-03-29', 428, 125], ['2026-03-30', 394, 134], ['2026-04-01', 435, 129],
    ['2026-04-02', 363, 138], ['2026-04-05', 414, 127], ['2026-04-07', 379, 131], ['2026-04-08', 407, 127],
    ['2026-05-07', 427, 134], ['2026-05-17', 424, 133], ['2026-05-24', 431, 133], ['2026-06-14', 414, 131],
  ];
  const rows: CoreEffortRow[] = e.map(([d, p, h]) => ({ effort_date: d, avg_pace_s_per_km: p, avg_hr_bpm: h, metric_source: 'hr_aligned' }));
  const v = computeCoreVerdict(rows, { asOf: '2026-07-07', windowDays: 183, minEfforts: 8 });
  assertEquals(v.metric, 'same_effort_pace');
  assertEquals(v.n, 19);
  assertEquals(v.direction, 'still_learning');
});
