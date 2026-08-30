// ⛔ THE DAY NUMBER ON EACH ENDURANCE ROW (Michael, 2026-08-30: *"lets number the days in this
// section"*). Pinned because the numbers are DERIVED from the frame — if a column's slots move, this
// fails rather than the screen quietly printing the old day.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { slotFrameDay } from './standing-plan-week-copy.ts';

Deno.test('⛔ the standard column: hard 1 → day 1, hard 2 → day 3, easy → day 4, long → day 6', () => {
  assertEquals(slotFrameDay('hard1'), 1);
  assertEquals(slotFrameDay('hard2'), 3);
  assertEquals(slotFrameDay('easy'), 4);
  assertEquals(slotFrameDay('long'), 6);
});

Deno.test('⛔ the taper column has THREE slots — day 4 loses its endurance, day 6 turns easy', () => {
  assertEquals(slotFrameDay('hard1', 'taper'), 1);
  assertEquals(slotFrameDay('hard2', 'taper'), 3);
  // ⚠️ The taper's day-6 slot is the VT1, so it is the EASY row and there is no long one.
  assertEquals(slotFrameDay('easy', 'taper'), 6);
  assertEquals(slotFrameDay('long', 'taper'), null, 'the taper has no long slot to number');
});
