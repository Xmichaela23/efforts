// ⛔ A SLOT'S ROLE IS SPORT-AGNOSTIC AND HAS ONE OWNER (2026-08-30, for the All Rounder).
//
// The All Rounder prescribes cycling NATIVELY — p274 puts `Cyc AnA (level 1)` on day 2 and
// `Cyc endurance (level 1)` on day 4. Before this, three readers keyed on run families alone
// (`HARDNESS`, `isLongSlot`, `anchorRoleOf`) plus a fourth hand-maintained copy in
// `week-conflicts.ts`, so a natively-prescribed ride was neither hard nor long nor easy: no pin, no
// anchor placement, no interference check against the leg days, nothing for the chips to size.
// ⚠️ IT FAILED SILENTLY — the class that has cost the most. `HARD_FAMILIES` had already drifted this
// exact way, leaving the hardest session in a rider's week uncounted.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isHardSlot, isLongSlot } from './sport-slots.ts';

Deno.test('⛔ A NATIVELY-PRESCRIBED RIDE IS CLASSIFIED, not invisible', () => {
  assertEquals(isHardSlot({ family: 'ride_anaerobic' } as never), true, 'the All Rounder day-2 ride is not hard');
  assertEquals(isHardSlot({ family: 'ride_sweet_spot' } as never), true);
  assertEquals(isHardSlot({ family: 'ride_endurance' } as never), false, 'base riding became a quality session');
});

Deno.test('⛔ THE RUN ANSWERS ARE UNCHANGED — the 5K frame is frozen and still guarded', () => {
  assertEquals(isHardSlot({ family: 'run_mlss' } as never), true);
  assertEquals(isHardSlot({ family: 'run_near_threshold' } as never), true);
  assertEquals(isHardSlot({ family: 'run_vt1' } as never), false);
  assertEquals(isHardSlot({ family: 'run_lsd' } as never), false);
  assertEquals(isLongSlot({ family: 'run_lsd' } as never), true);
  assertEquals(isLongSlot({ family: 'run_vt1' } as never), false);
});

Deno.test('⛔ THE FRAME\'S OWN MARKER OUTRANKS THE FAMILY TABLE', () => {
  // A frame states what a slot is FOR; the reader stops inferring it from a family name.
  assertEquals(isLongSlot({ family: 'ride_endurance', role: 'long' } as never), true,
    'a frame could not name a ride as its long session');
  assertEquals(isHardSlot({ family: 'run_lsd', role: 'hard' } as never), true);
  assertEquals(isHardSlot({ family: 'run_mlss', role: 'easy' } as never), false);
  assertEquals(isLongSlot({ family: 'run_lsd', role: 'easy' } as never), false);
});

Deno.test('⚠️ A FAMILY NO FRAME BUILDS IS NOT HARD — silence, not a guess', () => {
  // `ride_sprints` and `ride_vo2` are deliberately unranked: no frame prescribes them, and the
  // honest answer for a session this plan never builds is "not a quality slot of mine".
  assertEquals(isHardSlot({ family: 'ride_sprints' } as never), false);
  assertEquals(isHardSlot({ family: 'ride_vo2' } as never), false);
});
