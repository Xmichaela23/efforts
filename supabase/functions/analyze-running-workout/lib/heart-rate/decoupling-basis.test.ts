/**
 * Q-158 follow-on — calculateEfficiency returns decoupling.basis, so the Performance
 * "Aerobic decoupling %" row (which gates on basis === 'gap') is not dormant.
 *
 * basis is 'gap' iff the speed was grade-adjusted — the run had usable elevation (`_shared/gap.ts
 * hasUsableElevation`, the test the analyser has always used) — else 'raw'.
 *
 * 2026-09-27: the read is over the steady middle, about 50 minutes needed (`_shared/aerobic-decoupling.ts`), and over the
 * recording's rows (`_shared/run-pace.ts runDecouplingPct`).
 *
 * Run: deno test supabase/functions/analyze-running-workout/lib/heart-rate/decoupling-basis.test.ts --no-check --allow-read
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calculateEfficiency } from './efficiency.ts';
import type { RecordingRow } from './types.ts';

// 1 Hz rows of a steady 3 m/s run with a gentle heart-rate drift; `hilly` adds 20 m of rolling elevation.
function steadyRows(hilly: boolean, seconds = 3600): RecordingRow[] {
  return Array.from({ length: seconds }, (_, i) => ({
    t: i,
    d: i * 3,
    v_mps: 3,
    hr: 145 + Math.floor(i / 600),
    ...(hilly ? { elev: 100 + 10 * Math.sin(i / 300) } : {}),
  }));
}

Deno.test('decoupling.basis = "gap" when the run had usable elevation (the speed was grade-adjusted)', () => {
  const eff = calculateEfficiency(steadyRows(true));
  assertEquals(eff?.decoupling?.basis, 'gap');
  // assessment still computed (the row needs both)
  assertEquals(typeof eff?.decoupling?.assessment, 'string');
});

Deno.test('decoupling.basis = "raw" when the run had no usable elevation', () => {
  const eff = calculateEfficiency(steadyRows(false));
  assertEquals(eff?.decoupling?.basis, 'raw');
});

Deno.test('⛔ a 30- or 40-minute run has no decoupling: its steady middle is under 20 minutes (2026-09-27)', () => {
  assertEquals(calculateEfficiency(steadyRows(true, 1800)), undefined);
  assertEquals(calculateEfficiency(steadyRows(true, 2400)), undefined);
  assertEquals(typeof calculateEfficiency(steadyRows(true, 3001))?.decoupling.percent, 'number');
});
