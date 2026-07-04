/**
 * Fixture for the asOf timezone fix (D-236 follow-up): compute-snapshot and
 * coach must resolve the SAME athlete-local "as of" day at all hours, so the
 * persisted athlete_snapshot.acwr and coach's live value never window a day
 * apart. The dangerous window is the athlete's evening, when server-UTC has
 * already rolled to tomorrow.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/local-date.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { localDateInTz } from './local-date.ts';

const PT = 'America/Los_Angeles';

/** Coach's exact inline convention (coach/index.ts:1171) — the parity target. */
function coachAsOf(instant: Date, tz: string): string {
  return instant.toLocaleDateString('en-CA', { timeZone: tz });
}

Deno.test('after 5pm PT: snapshot and coach resolve the SAME local day (not the UTC tomorrow)', () => {
  // 5:01pm PT on 2026-07-03  ==  00:01 UTC on 2026-07-04.
  const evening = new Date('2026-07-04T00:01:00Z');
  const snapshot = localDateInTz(evening, PT);
  assertEquals(snapshot, '2026-07-03');            // athlete's real local day
  assertEquals(snapshot, coachAsOf(evening, PT));  // persisted == live
  // The retired UTC behaviour would have said 2026-07-04 — a full day off.
  assertEquals(evening.toISOString().slice(0, 10), '2026-07-04');
});

Deno.test('late evening PT (matches the acceptance-run instant) resolves to 2026-07-03', () => {
  // 6:30pm PT on 2026-07-03 — near when the acceptance run reported as_of 07-04.
  const lateEvening = new Date('2026-07-04T01:30:00Z');
  assertEquals(localDateInTz(lateEvening, PT), '2026-07-03');
  assertEquals(localDateInTz(lateEvening, PT), coachAsOf(lateEvening, PT));
});

Deno.test('daytime PT (no UTC rollover) is unaffected — both already agreed', () => {
  // 10:00am PT on 2026-07-03 == 17:00 UTC same day.
  const morning = new Date('2026-07-03T17:00:00Z');
  assertEquals(localDateInTz(morning, PT), '2026-07-03');
  assertEquals(localDateInTz(morning, PT), coachAsOf(morning, PT));
  assertEquals(morning.toISOString().slice(0, 10), '2026-07-03'); // UTC agreed here anyway
});

Deno.test('bad timezone → UTC-date fallback, never throws', () => {
  const t = new Date('2026-07-04T01:30:00Z');
  // Invalid tz throws inside toLocaleDateString → caught → UTC date (deterministic).
  assertEquals(localDateInTz(t, 'Not/AZone'), '2026-07-04');
  // null tz uses the system tz (environment-dependent) — assert it just returns a
  // valid ISO date and never throws, not a specific value.
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(localDateInTz(t, null)), true);
});
