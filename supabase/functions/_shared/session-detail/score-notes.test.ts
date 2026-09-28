/** The notes under Execution (2026-09-28). deno test supabase/functions/_shared/session-detail/score-notes.test.ts --no-check */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { executionScoreNotes } from './score-notes.ts';

const rep = (label: string, planned: number, did: number | null, band: 'in' | 'above' | 'below' | null, notDone = false): any => ({
  id: label, interval_type: 'work', planned_label: label, planned_duration_s: planned, not_done: notDone,
  executed: { duration_s: did, band },
});
const rec: any = { id: 'r', interval_type: 'recovery', planned_label: '1:00', planned_duration_s: 60, executed: { duration_s: 50, band: 'above' } };
const WORK = { execution_basis: 'work_time_in_range' };

Deno.test('the Sep 28 Surge and Float: 11 of 14 faster; the two not reached are left to the line above', () => {
  const rows = [
    ...Array.from({ length: 11 }, (_, i) => rep(i % 2 ? '0:45' : '0:15', i % 2 ? 45 : 15, i % 2 ? 45 : 15, 'above')),
    ...Array.from({ length: 3 }, () => rep('0:15', 15, 15, 'in')),
    rep('0:15', 15, null, null, true), rep('0:45', 45, null, null, true), rec,
  ];
  assertEquals(executionScoreNotes(WORK, rows, false), ['11 of 14 reps faster than planned.']);
});

Deno.test('both ways, and a ride', () => {
  const rows = [rep('0:45', 45, 45, 'above'), rep('0:45', 45, 45, 'below'), rep('0:45', 45, 45, 'below'), rep('0:45', 45, 45, 'in')];
  assertEquals(executionScoreNotes(WORK, rows, false), ['1 of 4 reps faster and 2 slower than planned.']);
  assertEquals(executionScoreNotes(WORK, rows, true), ['1 of 4 intervals above and 2 below the planned watts.']);
  assertEquals(executionScoreNotes(WORK, [rep('4:00', 240, 240, 'below'), rep('4:00', 240, 240, 'in')], true), ['1 of 2 intervals below the planned watts.']);
});

Deno.test('a timed rep cut short; a distance rep is never judged on its clock', () => {
  assertEquals(executionScoreNotes(WORK, [rep('0:15', 15, 4, 'in'), rep('0:45', 45, 45, 'in')], false), ['1 rep shorter than planned.']);
  assertEquals(executionScoreNotes(WORK, [rep('0.25 mi', 90, 80, 'in')], false), []);
});

Deno.test('every rep landed: no notes', () => {
  assertEquals(executionScoreNotes(WORK, [rep('0:45', 45, 45, 'in'), rep('0:45', 45, 45, 'in')], false), []);
});

Deno.test('an easy session: minutes over the ceiling, and short of the plan', () => {
  const perf = { execution_basis: 'easy_hr', easy_under_s: 22 * 60, easy_total_s: 35 * 60, execution_completion_pct: 93 };
  assertEquals(executionScoreNotes(perf, [], false), ['13 min above the easy heart-rate ceiling.', 'Shorter than planned.']);
  assertEquals(executionScoreNotes({ ...perf, easy_under_s: 35 * 60, execution_completion_pct: 100 }, [], false), []);
});

Deno.test('no score basis: nothing', () => {
  assertEquals(executionScoreNotes({}, [rep('0:45', 45, 45, 'above')], false), []);
});
