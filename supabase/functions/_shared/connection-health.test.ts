import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { healthFromStatus, healthPatch, tableForProvider, healthyOnConnect } from './connection-health.ts';

Deno.test('health: 2xx ok, 401/403 needs_reauth, everything else error', () => {
  assertEquals(healthFromStatus(200), 'ok');
  assertEquals(healthFromStatus(204), 'ok');
  assertEquals(healthFromStatus(401), 'needs_reauth');
  assertEquals(healthFromStatus(403), 'needs_reauth');
  assertEquals(healthFromStatus(404), 'error');
  assertEquals(healthFromStatus(429), 'error');
  assertEquals(healthFromStatus(500), 'error');
  assertEquals(healthFromStatus(0), 'error');
});

Deno.test('health patch: ok stamps last_ok_at and clears last_error; failures keep the text', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  assertEquals(healthPatch(200, null, now), { health: 'ok', last_ok_at: '2026-09-07T12:00:00.000Z', last_error: null });
  assertEquals(healthPatch(401, 'Unauthorized', now), { health: 'needs_reauth', last_error: 'Unauthorized' });
  assertEquals(healthPatch(503, '', now), { health: 'error', last_error: 'HTTP 503' });
});

Deno.test('table: garmin rows live in user_connections, strava in device_connections', () => {
  assertEquals(tableForProvider('garmin'), 'user_connections');
  assertEquals(tableForProvider('strava'), 'device_connections');
});

Deno.test('a fresh connect is healthy', () => {
  const p = healthyOnConnect(new Date('2026-09-07T12:00:00Z'));
  assertEquals(p.health, 'ok');
  assertEquals(p.last_error, null);
  assertEquals(p.last_ok_at, '2026-09-07T12:00:00.000Z');
});
