/**
 * PERMANENT REGRESSION — the LA-timezone default. [Q-252 Stage 2, 2026-08-10]
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/athlete-timezone.test.ts --no-check
 *
 * The rule these pin: a null timezone lands on UTC, NEVER on America/Los_Angeles. Before this,
 * `compute-snapshot/index.ts:421` read `body.timezone ? ... : 'America/Los_Angeles'` and no server
 * caller ever passed `body.timezone` — so one developer's home zone was every athlete's day
 * boundary. Any change that reintroduces a regional fallback fails here.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ATHLETE_TZ_FALLBACK,
  isValidIanaTimezone,
  resolveAthleteTimezone,
} from './athlete-timezone.ts';

const LA = 'America/Los_Angeles';

// ── §1 the fallback is UTC, and it is never a region ──────────────────────

Deno.test('the declared fallback is UTC', () => {
  assertEquals(ATHLETE_TZ_FALLBACK, 'UTC');
});

Deno.test('nothing stored, nothing in the body → UTC, never LA', () => {
  const tz = resolveAthleteTimezone({});
  assertEquals(tz, 'UTC');
  assert(tz !== LA, 'the LA default is the bug — it must not come back');
});

Deno.test('explicitly null stored timezone → UTC, never LA', () => {
  const tz = resolveAthleteTimezone({ storedTimezone: null, bodyTimezone: null });
  assertEquals(tz, 'UTC');
  assert(tz !== LA);
});

Deno.test('undefined / empty / whitespace stored values all mean "not reported" → UTC', () => {
  for (const stored of [undefined, '', '   ', null]) {
    assertEquals(resolveAthleteTimezone({ storedTimezone: stored }), 'UTC', `stored=${JSON.stringify(stored)}`);
  }
});

Deno.test('a malformed stored zone is discarded, and falls to UTC rather than to a region', () => {
  for (const junk of ['Pacific Time', 'GMT-8', 'Mars/Olympus_Mons', 42, {}, true]) {
    const tz = resolveAthleteTimezone({ storedTimezone: junk as unknown });
    assertEquals(tz, 'UTC', `junk=${JSON.stringify(junk)}`);
    assert(tz !== LA);
  }
});

// ── §2 a stored zone is honoured ──────────────────────────────────────────

Deno.test('a stored non-Pacific zone is used verbatim', () => {
  assertEquals(resolveAthleteTimezone({ storedTimezone: 'Europe/London' }), 'Europe/London');
  assertEquals(resolveAthleteTimezone({ storedTimezone: 'Australia/Sydney' }), 'Australia/Sydney');
  assertEquals(resolveAthleteTimezone({ storedTimezone: 'Asia/Tokyo' }), 'Asia/Tokyo');
});

Deno.test('a stored zone is trimmed, not rejected, for stray whitespace', () => {
  assertEquals(resolveAthleteTimezone({ storedTimezone: '  Europe/London  ' }), 'Europe/London');
});

Deno.test('a Pacific athlete still gets Pacific — the fix removes the DEFAULT, not the zone', () => {
  assertEquals(resolveAthleteTimezone({ storedTimezone: LA }), LA);
});

// ── §3 precedence: a live body override beats the stored value ────────────

Deno.test('body.timezone wins over the stored zone (a client that knows where the athlete is now)', () => {
  assertEquals(
    resolveAthleteTimezone({ bodyTimezone: 'Asia/Tokyo', storedTimezone: 'Europe/London' }),
    'Asia/Tokyo',
  );
});

Deno.test('a malformed body.timezone falls THROUGH to the stored zone, not to UTC', () => {
  assertEquals(
    resolveAthleteTimezone({ bodyTimezone: 'Nowhere/Nothing', storedTimezone: 'Europe/London' }),
    'Europe/London',
  );
});

// ── §4 the validator ──────────────────────────────────────────────────────

Deno.test('isValidIanaTimezone accepts real zones and rejects everything else', () => {
  for (const good of ['UTC', 'Europe/London', 'America/New_York', LA]) {
    assert(isValidIanaTimezone(good), `${good} should validate`);
  }
  for (const bad of ['', '  ', 'Pacific Time', 'GMT-8', 'Nowhere/Nothing', null, undefined, 7, {}]) {
    assert(!isValidIanaTimezone(bad), `${JSON.stringify(bad)} should not validate`);
  }
});

Deno.test('the legacy abbreviation aliases Intl DOES accept are passed through, not scrubbed', () => {
  // V8 resolves 'PST' to America/Los_Angeles — it is a real IANA link, not junk, so the validator
  // accepts it. Documented here because it looks like a hole and is not one: this value only ever
  // reaches the resolver if a client genuinely reported it, and it is nobody's DEFAULT. The bug
  // Q-252 Stage 2 fixed was the fallback, not the set of zones an athlete may legitimately be in.
  assert(isValidIanaTimezone('PST'));
  assertEquals(resolveAthleteTimezone({ storedTimezone: 'PST' }), 'PST');
  // And it is still unreachable without a stored value:
  assertEquals(resolveAthleteTimezone({}), 'UTC');
});
