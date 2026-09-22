// The line on a day with nothing on it (2026-09-22): "Down" for a day whose sessions were moved off it.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { DOWN_DAY_LINE, emptyDayLine, REST_DAY_LINE } from './empty-day-line.ts';

Deno.test('⛔ a day whose sessions were all moved off it reads "Down", even where the plan now shows no session', () => {
  assertEquals(emptyDayLine({ date: '2026-09-23', today: '2026-09-22', hasPlan: true, movedOff: true }), DOWN_DAY_LINE);
  assertEquals(DOWN_DAY_LINE, 'Down');
});

Deno.test('a day the plan leaves empty still reads "Rest"', () => {
  assertEquals(emptyDayLine({ date: '2026-09-27', today: '2026-09-22', hasPlan: true }), REST_DAY_LINE);
  assertEquals(emptyDayLine({ date: '2026-09-27', today: '2026-09-22', hasPlan: true, movedOff: false }), 'Rest');
});

Deno.test('the other lines are unchanged', () => {
  assertEquals(emptyDayLine({ date: '2026-09-20', today: '2026-09-22', hasPlan: false }), 'No effort logged');
  assertEquals(emptyDayLine({ date: '2026-09-25', today: '2026-09-22', hasPlan: false }), 'No effort scheduled');
});
