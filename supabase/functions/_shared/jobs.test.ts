import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  backoffSeconds,
  decideAfterRun,
  describeFailure,
  nextRunAt,
  parseBackoffOverride,
  DEFAULT_MAX_ATTEMPTS,
} from './jobs.ts';

Deno.test('backoff: 1, 5, 25 minutes after the 1st, 2nd, 3rd failed attempt; the last repeats', () => {
  assertEquals(backoffSeconds(1), 60);
  assertEquals(backoffSeconds(2), 300);
  assertEquals(backoffSeconds(3), 1500);
  assertEquals(backoffSeconds(9), 1500);
  assertEquals(backoffSeconds(0), 60);
});

Deno.test('backoff: the env override replaces the schedule and repeats its last value', () => {
  const o = parseBackoffOverride('2, 3,4');
  assertEquals(o, [2, 3, 4]);
  assertEquals(backoffSeconds(1, o), 2);
  assertEquals(backoffSeconds(3, o), 4);
  assertEquals(backoffSeconds(7, o), 4);
  assertEquals(parseBackoffOverride(''), null);
  assertEquals(parseBackoffOverride('x,y'), null);
  assertEquals(parseBackoffOverride(undefined), null);
});

Deno.test('nextRunAt adds the backoff to now', () => {
  const now = new Date('2026-09-07T10:00:00Z');
  assertEquals(nextRunAt(now, 1).toISOString(), '2026-09-07T10:01:00.000Z');
  assertEquals(nextRunAt(now, 2).toISOString(), '2026-09-07T10:05:00.000Z');
  assertEquals(nextRunAt(now, 3).toISOString(), '2026-09-07T10:25:00.000Z');
});

Deno.test('decideAfterRun: done on ok; retry until max_attempts; failed on the last', () => {
  assertEquals(DEFAULT_MAX_ATTEMPTS, 3);
  assertEquals(decideAfterRun(true, 1, 3), 'done');
  assertEquals(decideAfterRun(false, 1, 3), 'retry');
  assertEquals(decideAfterRun(false, 2, 3), 'retry');
  assertEquals(decideAfterRun(false, 3, 3), 'failed');
  assertEquals(decideAfterRun(false, 1, 1), 'failed');
});

Deno.test('describeFailure keeps the target error text when it sent JSON, else status + body head', () => {
  assertEquals(describeFailure(500, JSON.stringify({ ok: false, error: 'summary: compute-workout-summary timed out' })), 'summary: compute-workout-summary timed out');
  assertEquals(describeFailure(404, JSON.stringify({ error: 'Workout not found' })), 'Workout not found');
  assertEquals(describeFailure(546, 'WORKER_LIMIT'), 'HTTP 546: WORKER_LIMIT');
  assertEquals(describeFailure(0, ''), 'request failed');
});
