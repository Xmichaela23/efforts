/**
 * ⛔ THE INTERVAL PACING ROW ONLY SAYS "FADED" WHEN THE REPS ACTUALLY TREND (2026-08-28).
 *
 * Run: deno test --no-check supabase/functions/_shared/session-detail/interval-pacing-row.test.ts
 *
 * The row was first-vs-last, so two reps of a six-rep session decided the verdict. On Michael's
 * 2026-08-28 run — 6:43, 7:01, 9:44, 9:31, 11:11, 9:33 — it printed "faded 170s/mi" on a session
 * whose real shape was two fast reps and then four settled ones, with a 268s/mi spread.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildAnalysisDetailRows } from './build.ts';

/** paces are seconds per mile, in rep order. */
function pacingRow(paceSecPerMi: number[]): string | null {
  const intervals = paceSecPerMi.map((p, i) => ({
    id: `w${i}`,
    interval_type: 'work' as const,
    interval_number: i + 1,
    executed: { actual_pace_sec_per_mi: p },
  }));
  const factPacket = { derived: { interval_execution: { total_steps: intervals.length * 2 } } };
  const rows = buildAnalysisDetailRows(factPacket, [], false, {}, false, intervals as any, 'run');
  const row = rows.find((r) => r.label === 'Pacing');
  return row ? row.value : null;
}

Deno.test('⛔ THE RUN THAT NAMED THIS: the range, and no claim over the top of it', () => {
  assertEquals(pacingRow([403, 421, 584, 571, 671, 573]), 'Work intervals: 6:43/mi–11:11/mi');
});

Deno.test('⛔ A REAL FADE GETS NO WORD EITHER — no app publishes a rule for one', () => {
  assertEquals(pacingRow([400, 420, 440, 460, 480, 500]), 'Work intervals: 6:40/mi–8:20/mi');
});

Deno.test('⛔ NOR DOES A NEGATIVE SPLIT', () => {
  assertEquals(pacingRow([500, 480, 460, 440, 420, 400]), 'Work intervals: 6:40/mi–8:20/mi');
});

Deno.test('⛔ AND TIGHT REPS ARE NOT CALLED "CONSISTENT" — that bar was ours too', () => {
  assertEquals(pacingRow([420, 423, 425, 428]), 'Work intervals: 7:00/mi–7:08/mi');
});
