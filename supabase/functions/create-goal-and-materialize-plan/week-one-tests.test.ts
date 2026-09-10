/**
 * "Know your numbers?" test sessions: which, on what day, and in which plan week (2026-09-10, audit H-W03).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/create-goal-and-materialize-plan/week-one-tests.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mondayOfISO, weekOneTestRows } from './week-one-tests.ts';

const both = { run: 'maintain', bike: 'maintain', strength: 'develop', swim: 'out' };
const retestBoth = { baseline_numbers: { run: 'test', ftp: 'test' }, per_discipline_posture: both };

Deno.test('the Monday a plan dates week 1 from: Sunday belongs to the week before', () => {
  assertEquals(mondayOfISO('2026-09-20'), '2026-09-14');
  assertEquals(mondayOfISO('2026-09-14'), '2026-09-14');
  assertEquals(mondayOfISO('2026-09-17'), '2026-09-14');
});

Deno.test('Monday start: run test Wednesday, FTP test Friday, both week 1, tags intact', () => {
  const rows = weekOneTestRows(retestBoth, '2026-09-14');
  assertEquals(rows.map((r) => [r.type, r.date, r.week_number]), [['run', '2026-09-16', 1], ['ride', '2026-09-18', 1]]);
  assertEquals(rows[0].tags.includes('run_test'), true);
  assertEquals(rows[1].tags.includes('ftp_test'), true);
});

Deno.test('a late-week start: the same block days, each labelled with the plan week it falls in', () => {
  assertEquals(weekOneTestRows(retestBoth, '2026-09-17').map((r) => [r.date, r.week_number]), [['2026-09-19', 1], ['2026-09-21', 2]]);
  assertEquals(weekOneTestRows(retestBoth, '2026-09-20').map((r) => [r.date, r.week_number]), [['2026-09-22', 2], ['2026-09-24', 2]]);
});

Deno.test('"use current", or a sport not in the plan, adds nothing', () => {
  assertEquals(weekOneTestRows({ baseline_numbers: { run: 'use', ftp: 'test' }, per_discipline_posture: { ...both, bike: 'out' } }, '2026-09-14'), []);
  assertEquals(weekOneTestRows({ baseline_numbers: { run: 'test' }, per_discipline_posture: {} }, '2026-09-14'), []);
  assertEquals(weekOneTestRows({}, '2026-09-14'), []);
});
