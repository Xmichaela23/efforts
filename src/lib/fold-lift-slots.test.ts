/**
 * THE TRAP-BAR FOLD (FIXLIST 2b, ruled by Michael 2026-09-01).
 *
 *   deno test --allow-read src/lib/fold-lift-slots.test.ts --no-check
 *
 * ⛔ WHAT THESE PIN. One slot, one card, no version line. `latestE1rm` keeps its meaning — the most
 * recent week's heaviest set — so a merged card CAN read lower than the unmerged deadlift did, and
 * the record beside it is what explains that. These fixtures pin the drop as CORRECT rather than
 * guarding against it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { foldVariantSlots } from './fold-lift-slots.ts';

const lift = (o: Partial<Parameters<typeof foldVariantSlots>[0][number]> & { canonical: string }) => ({
  displayName: o.canonical,
  latestE1rm: 100,
  allTimeBestE1rm: 100,
  allTimeCount: 1,
  sampleCount: 1,
  newestAgeDays: 1,
  isPr: false,
  ...o,
});

Deno.test('⛔ ONE CARD FOR THE SLOT — the trap bar does not get a fifth row', () => {
  const out = foldVariantSlots([
    lift({ canonical: 'squat' }),
    lift({ canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, sampleCount: 3, newestAgeDays: 4 }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150, sampleCount: 1, newestAgeDays: 9 }),
  ]);
  assertEquals(out.map((l) => l.canonical), ['squat', 'deadlift']);
});

Deno.test('⛔ THE MORE RECENT READING OWNS THE NUMBER — deadlift newer, so 180 stands', () => {
  const [dl] = foldVariantSlots([
    lift({ canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, sampleCount: 3, newestAgeDays: 4 }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150, sampleCount: 1, newestAgeDays: 9 }),
  ]);
  assertEquals(dl.latestE1rm, 180);
  assertEquals(dl.allTimeBestE1rm, 180);
  assertEquals(dl.sampleCount, 4);
});

Deno.test('⚠️ THE DROP IS CORRECT, NOT A BUG — a later trap-bar week owns the number, and BEST explains it', () => {
  const [dl] = foldVariantSlots([
    lift({ canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, sampleCount: 3, newestAgeDays: 30 }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150, sampleCount: 1, newestAgeDays: 2 }),
  ]);
  assertEquals(dl.latestE1rm, 135);
  // `showBest` renders "best" exactly when best > latest — so the card states 180 beside the 135.
  assertEquals(dl.allTimeBestE1rm, 180);
  assert(dl.allTimeBestE1rm! > dl.latestE1rm!);
});

Deno.test('⛔ A PR CLAIM THE MERGE INVALIDATED IS WITHDRAWN, NEVER INVENTED', () => {
  // The trap bar was a PR against its OWN 150 history; the slot's record is the deadlift's 180.
  const [dl] = foldVariantSlots([
    lift({ canonical: 'deadlift', latestE1rm: 180, allTimeBestE1rm: 180, newestAgeDays: 30, isPr: false }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 150, allTimeBestE1rm: 150, newestAgeDays: 2, isPr: true }),
  ]);
  assertEquals(dl.latestE1rm, 150);
  assertEquals(dl.isPr, false, 'a 150 is not a record in a slot that holds 180');
});

Deno.test('⛔ A REAL SLOT PR SURVIVES THE MERGE', () => {
  const [dl] = foldVariantSlots([
    lift({ canonical: 'deadlift', latestE1rm: 160, allTimeBestE1rm: 160, newestAgeDays: 30, isPr: false }),
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 200, allTimeBestE1rm: 200, newestAgeDays: 2, isPr: true }),
  ]);
  assertEquals(dl.latestE1rm, 200);
  assertEquals(dl.isPr, true);
});

Deno.test('⚠️ A TRAP-BAR-ONLY ATHLETE GETS ONE CARD CALLED DEADLIFT — no version line, no second row', () => {
  const out = foldVariantSlots([
    lift({ canonical: 'trap_bar_deadlift', latestE1rm: 135, allTimeBestE1rm: 150 }),
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].canonical, 'deadlift');
  assertEquals(out[0].displayName, 'Deadlift');
});

Deno.test('⚠️ EVERY OTHER LIFT IS UNTOUCHED AND ORDER IS PRESERVED', () => {
  const out = foldVariantSlots([
    lift({ canonical: 'squat', latestE1rm: 300 }),
    lift({ canonical: 'bench_press', latestE1rm: 200 }),
    lift({ canonical: 'overhead_press', latestE1rm: 120 }),
  ]);
  assertEquals(out.map((l) => l.canonical), ['squat', 'bench_press', 'overhead_press']);
  assertEquals(out.map((l) => l.latestE1rm), [300, 200, 120]);
});
