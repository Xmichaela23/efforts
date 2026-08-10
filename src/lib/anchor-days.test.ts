/**
 * The day lock — fixtures.
 *
 * ⛔ THE PROPERTY THAT MATTERS IS THE EXCLUSION. Every one of these tests is really asking the same
 * question two ways: does a picker lock what OTHER anchors hold, and does it leave its OWN answer
 * alone? Getting the second half wrong makes a pick unclearable, which is the failure mode that
 * looks like a broken app rather than like a rule.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { anchorDaysTaken } from './anchor-days.ts';

const FULL = { longRunDay: 'sunday', longRideDay: 'saturday', qualityDays: { run: 'thursday' } };

Deno.test('each picker is shown the OTHER anchors, never its own', () => {
  // ⛔ ITS OWN DAY MUST BE ABSENT. Present, it would lock, and a locked control cannot be released —
  // which is exactly the "one tap to clear" the athlete now has.
  assertEquals(anchorDaysTaken(FULL, 'long run'), { saturday: 'long ride', thursday: 'hard day' });
  assertEquals(anchorDaysTaken(FULL, 'long ride'), { sunday: 'long run', thursday: 'hard day' });
  assertEquals(anchorDaysTaken(FULL, 'hard day'), { sunday: 'long run', saturday: 'long ride' });
});

Deno.test('it returns the anchor NAME, not a boolean', () => {
  // The copy is the feature. "Sat — long ride" is the app showing it remembered; a dead grey square
  // is a puzzle the athlete has to solve by trial.
  const taken = anchorDaysTaken(FULL, 'long run');
  assertEquals(taken.saturday, 'long ride');
  assertEquals(typeof taken.saturday, 'string');
});

Deno.test('unset anchors lock nothing — an empty week is fully selectable', () => {
  assertEquals(anchorDaysTaken({}, 'long run'), {});
  assertEquals(anchorDaysTaken(null, 'long run'), {});
  assertEquals(anchorDaysTaken(undefined, 'hard day'), {});
  // Partially answered: only what has been answered locks.
  assertEquals(anchorDaysTaken({ longRunDay: 'sunday' }, 'long ride'), { sunday: 'long run' });
});

Deno.test('a run club and a ride club are separate anchors and may hold separate days', () => {
  const both = { qualityDays: { run: 'tuesday', bike: 'friday' } };
  assertEquals(anchorDaysTaken(both, 'long run'), { tuesday: 'hard day', friday: 'hard day' });
});

Deno.test('⛔ THE COLLISION THE BUILDER USED TO RESOLVE BY DELETION IS NOW UNENTERABLE', () => {
  // The old `WeekDayRow` handler blanked `longRunDay` when the club took its day, and blanked the
  // club when the long run took its day — an answer the athlete had given, erased from another line
  // of the same card, silently. Sunday is the long run, so the hard-day question cannot be answered
  // onto it at all: the tap is disabled before any state is written.
  const takenForHardDay = anchorDaysTaken({ longRunDay: 'sunday' }, 'hard day');
  assertEquals(takenForHardDay.sunday, 'long run', 'the long-run day is selectable by the club question');
});

Deno.test('the release path: clearing an anchor frees its day for every other picker', () => {
  // One tap on your own day releases it; the next render must offer that day back everywhere.
  const before = anchorDaysTaken(FULL, 'hard day');
  assertEquals(before.saturday, 'long ride');
  const afterRelease = anchorDaysTaken({ ...FULL, longRideDay: '' }, 'hard day');
  assertEquals(afterRelease.saturday, undefined, 'a released day stayed locked');
  assertEquals(afterRelease.sunday, 'long run', 'releasing one anchor must not release the others');
});
