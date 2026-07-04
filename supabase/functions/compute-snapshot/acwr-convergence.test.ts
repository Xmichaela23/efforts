/**
 * Golden fixture for the compute-snapshot ACWR repoint (D-236).
 *
 * Pins the PERSISTED athlete_snapshot.acwr value after retiring Formula A's
 * calendar-DECOUPLED model (weekTotal / mean of the 4 prior weeks) in favour of
 * the shared coupled-rolling helper on workouts.workload_actual (persisted ==
 * live with coach). This is the guard that a future edit can't silently drift
 * the persisted number, and it documents the expected shift: on a ramp week the
 * coupled value reads LOWER than the retired decoupled one.
 *
 * Run from repo root:
 *   deno test supabase/functions/compute-snapshot/acwr-convergence.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeAcwr, type LoadRow } from '../_shared/acwr.ts';

// Representative ramp week. Target week Mon 2026-06-29 … Sun 2026-07-05 (as-of
// = the completed week's Sunday). Current week ramps to 600; each prior week 400.
const AS_OF = '2026-07-05';

const rows: LoadRow[] = [
  // current week (6/29–7/5): 4×150 = 600
  { date: '2026-06-29', workload: 150, type: 'run' },
  { date: '2026-07-01', workload: 150, type: 'ride' },
  { date: '2026-07-03', workload: 150, type: 'run' },
  { date: '2026-07-05', workload: 150, type: 'ride' },
  // prior wk1 (6/22–6/28): 400
  { date: '2026-06-22', workload: 100, type: 'run' },
  { date: '2026-06-24', workload: 100, type: 'ride' },
  { date: '2026-06-26', workload: 100, type: 'run' },
  { date: '2026-06-28', workload: 100, type: 'swim' },
  // prior wk2 (6/15–6/21): 400
  { date: '2026-06-15', workload: 100, type: 'run' },
  { date: '2026-06-17', workload: 100, type: 'ride' },
  { date: '2026-06-19', workload: 100, type: 'run' },
  { date: '2026-06-21', workload: 100, type: 'swim' },
  // prior wk3 (6/8–6/14): 400
  { date: '2026-06-08', workload: 100, type: 'run' },
  { date: '2026-06-10', workload: 100, type: 'ride' },
  { date: '2026-06-12', workload: 100, type: 'run' },
  { date: '2026-06-14', workload: 100, type: 'swim' },
  // prior wk4 (6/1–6/7): 400 — OUTSIDE the 28d chronic window, must be ignored
  { date: '2026-06-01', workload: 100, type: 'run' },
  { date: '2026-06-03', workload: 100, type: 'ride' },
  { date: '2026-06-05', workload: 100, type: 'run' },
  { date: '2026-06-07', workload: 100, type: 'swim' },
];

/** The retired Formula A: current week total / mean of the 4 prior week totals. */
function legacyDecoupledAcwr(currentWeekTotal: number, priorWeekTotals: number[]): number {
  const chronic = priorWeekTotals.reduce((a, b) => a + b, 0) / priorWeekTotals.length;
  return Math.round((currentWeekTotal / chronic) * 100) / 100;
}

Deno.test('persisted acwr = coupled helper value (1.33), not the retired decoupled 1.50', () => {
  const r = computeAcwr(rows, { asOfDate: AS_OF });

  // New coupled-rolling (what compute-snapshot now persists):
  //   acute 7d = 600 (/7 = 85.71) ; chronic 28d = 1800 (/28 = 64.29) → 1.33
  // Note chronic INCLUDES the current week (coupled) and EXCLUDES prior wk4
  // (6/1–6/7 is > 28d before 7/5).
  assertEquals(r.acuteLoad, 600);
  assertEquals(r.chronicLoad, 1800);
  assertEquals(r.ratio, 1.33);
  assertEquals(r.thinBase, false);

  // Retired decoupled Formula A on the same data: 600 / mean(400,400,400,400) = 1.50
  const legacy = legacyDecoupledAcwr(600, [400, 400, 400, 400]);
  assertEquals(legacy, 1.5);

  // The documented shift: coupled reads LOWER than decoupled on a ramp.
  assertEquals(r.ratio! < legacy, true);
});
