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
   * ⚠️ 66 → 59 ON 2026-08-31, AND THE CHIP IS STILL QUOTING A SESSION HE ACTUALLY GETS — which is the
   * property this test exists for. The near-threshold session shortened because its repeat count is
   * now the source's own for that level instead of one derived from the week's dose. **The chip
   * follows the session it measures; that is the whole point of it.**
   * ⚠️ THIS IS ATHLETE-FACING: the experienced chip now reads about seven minutes shorter. The newer
   * tier's number is unchanged, which is asserted directly below.
   */
  assertEquals(all.run!.experienced.longestMin, 59);
  /**
   * ⚠️ 45 → 41 ON 2026-08-31, same cause as the line above: the source's own per-level repeat count
   * replaced a dose-derived one. ⛔ AND THIS IS THE NUMBER THE ONE-HOUR KNIFE-EDGE TURNS ON — the
   * newer tier's hard run was 45 minutes against a 60-minute ask, a gap of exactly half an easy run.
   * See `volume-bounds.test.ts` for what four minutes does to that week.
   */
  assertEquals(all.run!.newer.longestMin, 41);
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
