import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { shouldEmail, subjectFor, bodyFor, ALARM_EMAIL_WINDOW_MS, withAlarm } from './alarm.ts';

const now = new Date('2026-09-07T12:00:00Z');

Deno.test('rate limit: first alarm of a kind emails', () => {
  assert(shouldEmail(null, now));
  assert(shouldEmail(undefined, now));
  assert(shouldEmail('not a date', now));
});

Deno.test('rate limit: a second of the same kind inside 15 minutes does not email', () => {
  assertEquals(ALARM_EMAIL_WINDOW_MS, 15 * 60 * 1000);
  assertEquals(shouldEmail('2026-09-07T11:46:00Z', now), false);
  assertEquals(shouldEmail('2026-09-07T11:59:59Z', now), false);
});

Deno.test('rate limit: exactly 15 minutes later emails again', () => {
  assert(shouldEmail('2026-09-07T11:45:00Z', now));
  assert(shouldEmail('2026-09-07T10:00:00Z', now));
});

Deno.test('subject and body carry kind, summary, who, workout, step, error, logs link', () => {
  assertEquals(subjectFor('job-failed', 'recompute-workout for 45d1'), 'efforts: job-failed — recompute-workout for 45d1');
  const body = bodyFor('job-failed', 'recompute-workout', { user_id: 'u1', workout_id: 'w1', step: 'summary', error: 'boom', function: 'recompute-workout', job_id: 7, attempts: 3 }, now);
  assertStringIncludes(body, 'who:      u1');
  assertStringIncludes(body, 'workout:  w1');
  assertStringIncludes(body, 'step:     summary');
  assertStringIncludes(body, 'error:    boom');
  assertStringIncludes(body, 'job:      #7 (attempt 3)');
  assertStringIncludes(body, '/functions/recompute-workout/logs');
});

Deno.test('withAlarm passes a 2xx through untouched and does not consume the request body', async () => {
  const handler = async (req: Request) => new Response(JSON.stringify({ got: await req.json() }), { status: 200 });
  const wrapped = withAlarm('unit-test', handler);
  const res = await wrapped(new Request('http://x/', { method: 'POST', body: JSON.stringify({ workout_id: 'w1' }), headers: { 'Content-Type': 'application/json' } }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { got: { workout_id: 'w1' } });
});
