import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { weekTimeLine, hoursMinutes } from './week-time-line.ts';

const row = (type: string, secs: number, status = 'completed') => ({ type, workout_status: status, metrics: { moving_time_seconds: secs } });

Deno.test('time per sport, strength first, bike for rides, nothing-done sports left out', () => {
  assertEquals(weekTimeLine([
    row('ride', 7200), row('run', 5400), row('strength', 3600), row('cycling', 6000), row('running', 3600), row('strength', 4200),
  ]), 'strength 2h 10m · run 2h 30m · bike 3h 40m');
});
Deno.test('under an hour reads minutes; a whole hour reads hours; planned rows and walks do not count', () => {
  assertEquals(weekTimeLine([row('run', 2700), row('swim', 3600), row('walk', 3600), row('ride', 3600, 'planned')]), 'run 45m · swim 1h');
  assertEquals(hoursMinutes(59 * 60 + 40), '1h');
});
Deno.test('nothing done → no line', () => {
  assertEquals(weekTimeLine([]), null);
});
Deno.test('a lift logged in the app counts with the logger\'s session time (duration, minutes)', () => {
  assertEquals(weekTimeLine([{ type: 'strength', workout_status: 'completed', duration: 52 }, row('run', 2700)]), 'strength 52m · run 45m');
});
