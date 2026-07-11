import { assertEquals } from 'jsr:@std/assert@1';
import { localDayOf, localDayInRange, paddedEpochBounds } from './date-window.ts';

// Q-154 regression: an evening ride on local 7/7 has a UTC `start_date` of 7/8. The user must be
// able to find it by requesting 7/7 (its local day), and it must file under 7/7.
Deno.test('Q-154: 7/7 evening ride (UTC 7/8) is selected when requesting 7/7', () => {
  const eveningRide = {
    start_date_local: '2026-07-07T20:00:00Z', // Strava reports local wall-clock here
    start_date: '2026-07-08T01:00:00Z',       // ...and true UTC here (UTC-5 → next day)
  };
  // Filed under the local day.
  assertEquals(localDayOf(eveningRide), '2026-07-07');
  // Found by the local day the user actually requests.
  assertEquals(localDayInRange(localDayOf(eveningRide), '2026-07-07', '2026-07-07'), true);
  // The OLD bug: requesting 7/8 used to be the only way to catch it. It must NOT match 7/8 now.
  assertEquals(localDayInRange(localDayOf(eveningRide), '2026-07-08', '2026-07-08'), false);
});

Deno.test('paddedEpochBounds widens the UTC window a full day each side', () => {
  const { afterEpoch, beforeEpoch } = paddedEpochBounds('2026-07-07', '2026-07-07');
  // 7/7 00:00Z minus one day = 7/6 00:00Z.
  assertEquals(afterEpoch, Math.floor(new Date('2026-07-06T00:00:00Z').getTime() / 1000));
  // 7/7 23:59:59Z plus one day = 7/8 23:59:59Z. This padded window contains the 7/8 01:00Z UTC
  // start of the local-7/7 evening ride, so the API fetch returns it (then local filter keeps it).
  assertEquals(beforeEpoch, Math.floor(new Date('2026-07-08T23:59:59Z').getTime() / 1000));
  const evenUtc = Math.floor(new Date('2026-07-08T01:00:00Z').getTime() / 1000);
  assertEquals(evenUtc > (afterEpoch as number) && evenUtc < (beforeEpoch as number), true);
});

Deno.test('inclusive range bounds', () => {
  assertEquals(localDayInRange('2026-07-07', '2026-07-07', '2026-07-10'), true); // start edge
  assertEquals(localDayInRange('2026-07-10', '2026-07-07', '2026-07-10'), true); // end edge
  assertEquals(localDayInRange('2026-07-06', '2026-07-07', '2026-07-10'), false);
  assertEquals(localDayInRange('2026-07-11', '2026-07-07', '2026-07-10'), false);
});

Deno.test('no date filter → everything passes; undefined bounds', () => {
  assertEquals(localDayInRange('2026-01-01'), true);
  const { afterEpoch, beforeEpoch } = paddedEpochBounds(undefined, undefined);
  assertEquals(afterEpoch, undefined);
  assertEquals(beforeEpoch, undefined);
});

Deno.test('unclassifiable activity is kept, not silently dropped', () => {
  assertEquals(localDayOf({}), '');
  assertEquals(localDayInRange('', '2026-07-07', '2026-07-07'), true);
});
