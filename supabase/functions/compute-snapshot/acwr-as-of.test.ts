/**
 * PERMANENT REGRESSION — the ACWR `asOf` day follows the ATHLETE's timezone. [Q-252 Stage 2, 2026-08-10]
 *
 * Run from repo root:
 *   deno test supabase/functions/compute-snapshot/acwr-as-of.test.ts --no-check
 *
 * Two claims are pinned, end to end through the real resolver (not a hand-passed zone string):
 *   (a) a stored NON-PACIFIC zone actually moves the `asOf` day;
 *   (b) a null/absent zone lands on UTC — NEVER on America/Los_Angeles.
 *
 * The old code was `body.timezone ? String(body.timezone) : 'America/Los_Angeles'` with no server
 * caller ever passing `body.timezone`, so (b) resolved to Pacific for every athlete on the planet.
 * The instants below are chosen so UTC and Pacific fall on DIFFERENT calendar days — if the LA
 * default ever comes back, §2 fails rather than passing quietly.
 *
 * Deterministic — the instant is injected, so this does not depend on when or where it runs.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveAthleteTimezone } from '../_shared/athlete-timezone.ts';
import { resolveAcwrAsOf } from './acwr-as-of.ts';

const LA = 'America/Los_Angeles';

// 06:30 UTC on Wed 2026-08-05 = 23:30 on Tue 2026-08-04 in Pacific (UTC-7, PDT).
// The two zones are on different calendar days here — that gap IS the test.
const UTC_MORNING = new Date('2026-08-05T06:30:00Z');
// 23:30 UTC on Wed 2026-08-05 = 00:30 on Thu 2026-08-06 in London (UTC+1, BST).
const UTC_LATE = new Date('2026-08-05T23:30:00Z');

// Sunday of the week containing 2026-08-05 (Monday 2026-08-03). In-progress week → asOf = today.
const CURRENT_WEEK_END = '2026-08-09';

// ── §1 (a) a stored non-Pacific zone moves the day ────────────────────────

Deno.test('asOf follows a stored Europe/London zone across its local midnight', () => {
  const tz = resolveAthleteTimezone({ storedTimezone: 'Europe/London' });
  assertEquals(tz, 'Europe/London');
  // 23:30Z is already tomorrow in London. A UTC-only server would window a day short.
  assertEquals(resolveAcwrAsOf({ now: UTC_LATE, timezone: tz, rangeEnd: CURRENT_WEEK_END }), '2026-08-06');
});

Deno.test('asOf follows a stored Asia/Tokyo zone', () => {
  const tz = resolveAthleteTimezone({ storedTimezone: 'Asia/Tokyo' });
  // 06:30Z = 15:30 same day in Tokyo; 23:30Z = 08:30 the NEXT day.
  assertEquals(resolveAcwrAsOf({ now: UTC_MORNING, timezone: tz, rangeEnd: CURRENT_WEEK_END }), '2026-08-05');
  assertEquals(resolveAcwrAsOf({ now: UTC_LATE, timezone: tz, rangeEnd: CURRENT_WEEK_END }), '2026-08-06');
});

Deno.test('a stored non-Pacific zone gives a DIFFERENT day than the old LA hardcode would have', () => {
  const london = resolveAcwrAsOf({
    now: UTC_LATE,
    timezone: resolveAthleteTimezone({ storedTimezone: 'Europe/London' }),
    rangeEnd: CURRENT_WEEK_END,
  });
  const laWouldHaveBeen = resolveAcwrAsOf({ now: UTC_LATE, timezone: LA, rangeEnd: CURRENT_WEEK_END });
  assertEquals(london, '2026-08-06');
  assertEquals(laWouldHaveBeen, '2026-08-05');
  assert(london !== laWouldHaveBeen, 'if these ever match, the athlete zone stopped being read');
});

// ── §2 (b) no stored zone → UTC, never LA ─────────────────────────────────

Deno.test('BUG PIN: a null stored zone resolves the day in UTC, not Pacific', () => {
  const tz = resolveAthleteTimezone({ storedTimezone: null });
  assertEquals(tz, 'UTC');
  const asOf = resolveAcwrAsOf({ now: UTC_MORNING, timezone: tz, rangeEnd: CURRENT_WEEK_END });
  // 06:30Z is 2026-08-05 in UTC and still 2026-08-04 in Pacific.
  assertEquals(asOf, '2026-08-05', 'the neutral fallback is UTC');
  const laWouldHaveBeen = resolveAcwrAsOf({ now: UTC_MORNING, timezone: LA, rangeEnd: CURRENT_WEEK_END });
  assertEquals(laWouldHaveBeen, '2026-08-04');
  assert(asOf !== laWouldHaveBeen, 'the LA default is back — this is the Q-252 Stage 2 bug');
});

Deno.test('an absent zone (headless path, nothing reported) behaves identically to null', () => {
  const asOf = resolveAcwrAsOf({
    now: UTC_MORNING,
    timezone: resolveAthleteTimezone({}),
    rangeEnd: CURRENT_WEEK_END,
  });
  assertEquals(asOf, '2026-08-05');
});

Deno.test('a junk stored zone falls to UTC, not to a region', () => {
  const asOf = resolveAcwrAsOf({
    now: UTC_MORNING,
    timezone: resolveAthleteTimezone({ storedTimezone: 'Pacific Time' }),
    rangeEnd: CURRENT_WEEK_END,
  });
  assertEquals(asOf, '2026-08-05');
});

// ── §3 the earlier-of rule is unchanged by any of this ────────────────────

Deno.test('a completed/backfilled week clamps to its own Sunday, in every zone', () => {
  for (const stored of [null, 'Europe/London', 'Asia/Tokyo', LA]) {
    const tz = resolveAthleteTimezone({ storedTimezone: stored });
    // rangeEnd is in the past relative to `now` → asOf is the week's Sunday, not today.
    assertEquals(
      resolveAcwrAsOf({ now: UTC_LATE, timezone: tz, rangeEnd: '2026-07-05' }),
      '2026-07-05',
      `zone=${tz}`,
    );
  }
});

Deno.test('the in-progress current week uses today, not the week end', () => {
  const asOf = resolveAcwrAsOf({
    now: UTC_MORNING,
    timezone: resolveAthleteTimezone({ storedTimezone: 'Europe/London' }),
    rangeEnd: CURRENT_WEEK_END,
  });
  assertEquals(asOf, '2026-08-05');
  assert(asOf < CURRENT_WEEK_END);
});
