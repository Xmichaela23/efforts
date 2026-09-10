/**
 * The two pure pieces of `compute.ts`: the narrow prior row, and the block start (audit H-T14).
 * The database reads are checked live on a throwaway, not here.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { blockStartFor, priorFromRow, sameBoom } from './compute.ts';
import { sessionBoomLine } from './line.ts';
import { sessionDriftPct } from '../session-detail/drift-pct.ts';

Deno.test('the block start is the plan\'s own, and only for a session on or after it', () => {
  assertEquals(blockStartFor({ user_selected_start_date: '2026-07-06', start_date: '2026-07-01' }, '2026-09-09'), '2026-07-06');
  assertEquals(blockStartFor({ start_date: '2026-07-01' }, '2026-09-09'), '2026-07-01');
  // ⛔ A session from before the block is not "since" it.
  assertEquals(blockStartFor({ start_date: '2026-09-14' }, '2026-09-09'), null);
  assertEquals(blockStartFor(null, '2026-09-09'), null);
  assertEquals(blockStartFor({ start_date: 'soon' }, '2026-09-09'), null);
});

Deno.test('a narrow prior row reads exactly as the full row would', () => {
  const p = priorFromRow({
    id: 'a', date: '2026-08-01', type: 'ride',
    power_curve: { '20min': 250 }, duration_s_moving: 3600,
    hr_at_band: 140, counts_toward_trend: false, decoupling_pct: 3.2, hr_drift_pct: 6,
  });
  assertEquals(p.computed, { power_curve: { '20min': 250 }, overall: { duration_s_moving: 3600 } });
  assertEquals(p.workout_analysis, {
    bike_fitness_v1: { hr_at_band: 140, counts_toward_trend: false },
    heart_rate_summary: { decouplingPct: 3.2 },
    hr_drift_v1: { pct: 6 },
  });
  // Nothing stored → nothing invented.
  assertEquals(priorFromRow({ id: 'b', date: '2026-08-02', type: 'run' }).workout_analysis, {});
  // And the rule reads the narrow row: 265 W beats its 250.
  assertEquals(sessionBoomLine({
    workout: { id: 'w', date: '2026-09-09', type: 'ride', workout_status: 'completed', computed: { power_curve: { '20min': 265 } } },
    prior: [p],
    blockStartISO: '2026-07-06',
  }), 'Best 20-minute power since July: 265 W.');
});

Deno.test('⛔ the stored line read back from jsonb, keys reordered, is the same line — no second write', () => {
  const boom = { v: 1, line: 'Longest run since July.', kind: 'longest', numbers: { moving_seconds: 10800 }, basis: { window_start: '2026-07-06', prior_count: 1 } };
  const fromDb = { kind: 'longest', v: 1, basis: { prior_count: 1, window_start: '2026-07-06' }, line: 'Longest run since July.', numbers: { moving_seconds: 10800 } };
  assertEquals(sameBoom(fromDb, boom), true);
  assertEquals(sameBoom(undefined, null), true);
  assertEquals(sameBoom({ ...fromDb, line: 'Longest ride since July.' }, boom), false);
  assertEquals(sameBoom(boom, null), false);
});

Deno.test('the drift the tile prints: decoupling first, heart-rate halves second, one decimal', () => {
  assertEquals(sessionDriftPct({ heart_rate_summary: { decouplingPct: 4.96 }, hr_drift_v1: { pct: 1 } }), 5);
  assertEquals(sessionDriftPct({ heart_rate_summary: { decouplingPct: null }, hr_drift_v1: { pct: 2.44 } }), 2.4);
  assertEquals(sessionDriftPct(JSON.stringify({ hr_drift_v1: { pct: 3 } })), 3);
  assertEquals(sessionDriftPct({ heart_rate_summary: {} }), null);
  assertEquals(sessionDriftPct(null), null);
});
