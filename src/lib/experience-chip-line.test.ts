// ⛔ THE EXPERIENCE CHIP'S LINE (Michael, 2026-08-30). His acceptance test is visual: he counts the
// numbers on the screen. Before this there were three — the chip's longest single hard session, the
// sentence's SUM of the hard sessions, and the tier requirement — and nothing said they measured
// different things. Now one per chip.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { experienceChipLine, restIsEasyLine } from './standing-plan-week-copy.ts';
import { experienceChips } from './standing-plan-week-bounds.ts';

Deno.test('⛔ SINGULAR AND PLURAL ARE BOTH RIGHT — a plural on one session reads as a bug', () => {
  assertEquals(
    experienceChipLine('experienced', 66, 2, null),
    'More experienced · two hard sessions · 66 min max',
  );
  assertEquals(
    experienceChipLine('newer', 45, 1, null),
    'Less experienced · one hard session · 45 min max',
  );
});

Deno.test('⛔ THE REQUIREMENT SHOWS ONLY WHERE IT BLOCKS', () => {
  // reachable → no "needs Nh/wk"; it is noise once the athlete has met it.
  assert(!experienceChipLine('experienced', 66, 2, null).includes('needs'));
  // gated → the reason travels on the chip itself.
  assert(experienceChipLine('experienced', 66, 2, 4).includes('needs 4h/wk'));
});

Deno.test('⛔ NO DURATION, NO DANGLING SEPARATOR — a sport filling neither hard slot', () => {
  assertEquals(experienceChipLine('newer', null, 0, 3), 'Less experienced · needs 3h/wk');
  assertEquals(experienceChipLine('newer', null, 0, null), 'Less experienced');
});

Deno.test('⛔ THE COUNT IS DERIVED FROM THE SLOTS, never assumed to be two', () => {
  const all = experienceChips({ hard1: 'run', hard2: 'run', easy: 'run', long: 'run' } as never, { baselines: {} as never });
  assertEquals(all.run!.experienced.hardCount, 2, 'an all-run week has two hard runs');
  // ⚠️ THE MIXED WEEK IS THE CASE THAT MATTERS: the other hard slot is a ride, so there is one hard run.
  const mixed = experienceChips({ hard1: 'ride', hard2: 'run', easy: 'run', long: 'run' } as never, { baselines: {} as never });
  assertEquals(mixed.run!.experienced.hardCount, 1, 'the mixed week has one hard run');
  assertEquals(mixed.ride!.experienced.hardCount, 1, 'the mixed week has one hard ride');
});

Deno.test('⛔ THE NUMBER ITSELF IS UNCHANGED — the rotation logic was proved correct, not touched', () => {
  const all = experienceChips({ hard1: 'run', hard2: 'run', easy: 'run', long: 'run' } as never, { baselines: {} as never });
  /**
   * ⚠️ 66 → 59 ON 2026-08-31, then **59 → 69 ON 2026-09-08**, AND THE CHIP IS STILL QUOTING A SESSION
   * HE ACTUALLY GETS — which is the property this test exists for, and it caught both moves.
   *
   * The first change shortened the near-threshold session: its repeat count became the source's own
   * for that level instead of one derived from the week's dose. The second replaced the session
   * outright. p246's Wednesday was pinned to a shape p234 prints at LEVEL 2, and p247 asks that slot
   * for 5- to 8-minute work intervals; it now rotates the three level-3 lines that satisfy the ask,
   * the longest of which is *"8 rounds of: 5 min @ 90% / 1:30 @ VT1"* — sixty-nine minutes with its
   * warm-up and cool-down. **The chip follows the session it measures; that is the whole point.**
   * ⚠️ THIS IS ATHLETE-FACING: the experienced chip reads ten minutes longer than it did yesterday.
   * ⚠️ AND IT IS THE MAX ACROSS THE THREE, not one of them — the block rotates, so "up to" has to
   * cover the longest week it serves.
   */
  assertEquals(all.run!.experienced.longestMin, 69);
  /**
   * ⚠️ 45 → 41 ON 2026-08-31, then **41 → 46 ON 2026-09-08**. ⛔ AND THIS IS THE NUMBER THE ONE-HOUR
   * KNIFE-EDGE TURNS ON — see `volume-bounds.test.ts` for what a few minutes does to that week.
   *
   * ⛔ THE SECOND MOVE IS THE ROTATION REACHING THE CHIP, and it is a CORRECTION rather than a
   * change of session. p246's Wednesday used to be PINNED, so this tier measured the pinned shape at
   * its own lowered level and got 41. The slot rotates now, and p234's three qualifying sessions are
   * level-3 lines — so at the "newer" tier they do not apply at all, the composer falls back to the
   * family's own rotation at the lowered level, and the longest week that serves is 46 minutes.
   * ⚠️ 41 WAS THEREFORE ALREADY UNDER-CLAIMING for any week the engine rotated onto a longer shape.
   * `experience-chips.test.ts` is the check that matters here: it builds the weeks and asserts the
   * chip's number is one of them.
   */
  assertEquals(all.run!.newer.longestMin, 46);
});

Deno.test('⛔ THE REST OF THE HOURS ARE ACCOUNTED FOR, WITHOUT A SECOND NUMBER', () => {
  // ⚠️ This line was deleted by accident along with the contradictory sum, and restored the same day.
  // It is the only thing telling an athlete what fills the hours they typed.
  /**
   * ⛔ THE TWO SPORTS DIFFER BECAUSE THE PLAN DIFFERS — measured, not assumed. The long RIDE maps to
   * `ride_endurance / steady` (`below_pct 0.75`) and really is all conversation pace. The long RUN is
   * `run_lsd / long_with_inserts`, whose work is 95-115% of THRESHOLD for about 11% of the session,
   * so a flat "all conversation pace" would describe a session the plan does not build.
   */
  assertEquals(restIsEasyLine('ride'), 'The rest of the riding stays at conversation pace.');
  assertEquals(
    restIsEasyLine('run'),
    'The rest of the running stays at conversation pace, bar a few faster inserts in the long run.',
  );
  // ⛔ AND IT CARRIES NO FIGURE — his acceptance test is counting the numbers on the screen.
  for (const s of ['run', 'ride'] as const) assert(!/\d/.test(restIsEasyLine(s)), 'a number came back');
});
