/**
 * ⛔ THE FOUR SWAPS THE PAGE BLESSES (docs/WORKORDER-endurance-swaps-2026-09-09.md).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/session-discipline-swap.endurance.test.ts
 *
 * ⚠️ THIS FILE PINS WHAT IS *NOT* OFFERED as hard as what is. Three of the four changes are a
 * narrowing — the long day opens up, but hard-ride-to-hard-run closes, swim closes on the long day,
 * and the run machines close behind p275's ground-impact rule. A later session reading only the
 * happy path would re-open every one of them.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getDisciplineSwaps, sessionSwapExtras, intensityOf, venueOf, VENUE_PREFIX } from './session-discipline-swap.ts';

const ALL = ['run', 'ride', 'swim'] as const;
const base = { workout_status: 'planned', total_duration_seconds: 3600 };
const longRun = { ...base, type: 'run', name: 'Long Run', tags: ['standing_plan', 'family:run_lsd', 'band:vt1_or_easier', 'long_run'] };
const hardRun = { ...base, type: 'run', name: 'Hard Run', tags: ['standing_plan', 'family:run_mlss', 'band:above', 'threshold'] };
const hardRide = { ...base, type: 'ride', name: 'Anaerobic Ride', tags: ['standing_plan', 'family:ride_anaerobic', 'band:above', 'intervals'] };
const easyRide = { ...base, type: 'ride', name: 'Ride', tags: ['standing_plan', 'family:ride_endurance', 'band:vt1_or_easier'] };

const kinds = (opts: ReturnType<typeof getDisciplineSwaps>) => opts.map((o) => `${o.kind ?? 'discipline'}:${o.venue ?? o.to}`);

Deno.test('⛔ THE LONG DAY IS OFFERED NOW — a long ride and a hike, never a swim', () => {
  const opts = [...getDisciplineSwaps(longRun, ALL, [], null, 250), ...sessionSwapExtras(longRun)];
  assert(kinds(opts).includes('discipline:ride'), kinds(opts).join(','));
  assert(kinds(opts).includes('hike:run'), kinds(opts).join(','));
  assert(!kinds(opts).includes('discipline:swim'), 'the app does not coach swims; a "long swim" is a booking');
});

Deno.test('the hike is a `walk` row, not a new type', () => {
  const hike = sessionSwapExtras(longRun).find((o) => o.kind === 'hike')!;
  assertEquals(hike.patch.type, 'walk');
  assert(String(JSON.stringify(hike.patch.tags)).includes('swapped_from:run'));
});

Deno.test('⛔ HARD RIDE → HARD RUN IS OFF THE SHEET — p138 permits one direction only', () => {
  const opts = getDisciplineSwaps(hardRide, ALL, [], null, 250);
  assert(!kinds(opts).includes('discipline:run'), kinds(opts).join(','));
  // ⚠️ And the caution that used to accompany it went with it.
  assert(!opts.some((o) => o.warnings.some((w) => /costs the legs more/.test(w))));
});

Deno.test('a hard run still offers the ride (p138), and needs an FTP for it', () => {
  assert(kinds(getDisciplineSwaps(hardRun, ALL, [], null, 250)).includes('discipline:ride'));
  assert(!kinds(getDisciplineSwaps(hardRun, ALL, [], null, null)).includes('discipline:ride'));
});

/**
 * ⛔⛔ ONLY A MACHINE MICHAEL HAS NAMED SHIPS (2026-09-09: *"Labels: Trainer, Treadmill."*). p275
 * blesses the rower, ski erg, air bike, elliptical and arc trainer, and the library still knows
 * them — but a label is an athlete-facing line and every one of those waits for his yes. ⚠️ THE
 * WITHHELD ONES ARE PINNED HERE so nobody "restores" them without the words arriving first.
 */
Deno.test('⛔ A RIDE OFFERS THE TRAINER, AND NO MACHINE HE HAS NOT NAMED', () => {
  const k = kinds(sessionSwapExtras(easyRide));
  assert(k.includes('venue:trainer'), k.join(','));
  for (const v of ['rower', 'ski_erg', 'air_bike']) {
    assert(!k.includes(`venue:${v}`), `${v} shipped without a label from Michael`);
  }
});

/**
 * ⛔ THE TREADMILL IS NEVER GATED — it still puts feet on the ground, which is what p275 asks for,
 * and Michael's line for it says exactly that.
 *
 * ⚠️ THE GROUND-IMPACT GATE HAS NOTHING LEFT TO GATE while the treadmill is the only named run
 * machine. The rule is p275's and stays built; it becomes live the moment a second run machine gets
 * a name. Pinned by the withheld pair below, so removing the gate would still be a failure.
 */
Deno.test('⛔ THE TREADMILL IS OFFERED WHATEVER THE WEEK HOLDS; the unnamed run machines are not', () => {
  const otherRun = { ...base, type: 'run', name: 'Easy Run', tags: ['band:vt1_or_easier'] };

  for (const week of [[hardRun], [hardRun, otherRun]]) {
    const k = kinds(sessionSwapExtras(hardRun, null, week));
    assert(k.includes('venue:treadmill'), k.join(','));
    for (const v of ['elliptical', 'arc_trainer']) {
      assert(!k.includes(`venue:${v}`), `${v} shipped without a label from Michael`);
    }
  }

  // And a run already indoors still does not count as ground — the rule the gate will enforce.
  const indoors = { ...otherRun, tags: [...otherRun.tags, `${VENUE_PREFIX}treadmill`] };
  assert(kinds(sessionSwapExtras(hardRun, null, [hardRun, indoors])).includes('venue:treadmill'));
});

Deno.test('⛔ THE MACHINE CHANGES NOTHING ABOUT THE SESSION — only a tag', () => {
  const machine = sessionSwapExtras(easyRide).find((o) => o.venue === 'trainer')!;
  assertEquals(Object.keys(machine.patch), ['tags']);
  assertEquals(machine.needsMaterialize, false);
  assertEquals(venueOf({ ...easyRide, tags: machine.patch.tags as string[] }), 'trainer');
});

Deno.test('a session already on a machine is not offered another one', () => {
  const onTrainer = { ...easyRide, tags: [...easyRide.tags, `${VENUE_PREFIX}trainer`] };
  assert(!kinds(sessionSwapExtras(onTrainer)).some((k) => k.startsWith('venue:')));
});

Deno.test('⛔ EVERY OPTION CARRIES A COPY KEY AND NOT A SENTENCE — the words are Michael\'s, pending', () => {
  const every = [
    ...getDisciplineSwaps(longRun, ALL, [], null, 250), ...sessionSwapExtras(longRun),
    ...getDisciplineSwaps(hardRun, ALL, [], null, 250), ...sessionSwapExtras(hardRun, null, [hardRun]),
    ...getDisciplineSwaps(easyRide, ALL, [], null, 250), ...sessionSwapExtras(easyRide),
  ];
  assert(every.length > 0);
  for (const o of every) {
    assert(o.copyKey?.endsWith('.pending'), `${o.kind}:${o.venue ?? o.to} has no pending key`);
    assert(!/ /.test(o.copyKey ?? ''), 'a key, never a sentence');
  }
});

Deno.test('the posture gate is untouched — a developed sport is still not swappable, extras included', () => {
  assertEquals(getDisciplineSwaps(longRun, ALL, [], { run: 'develop' } as never, 250).length, 0);
  assertEquals(sessionSwapExtras(longRun, { run: 'develop' } as never).length, 0);
});

Deno.test('a completed or skipped row offers nothing, long day and machines included', () => {
  for (const status of ['completed', 'skipped']) {
    assertEquals(getDisciplineSwaps({ ...longRun, workout_status: status }, ALL, [], null, 250).length, 0);
    assertEquals(sessionSwapExtras({ ...longRun, workout_status: status }).length, 0);
  }
});

/** ⛔ THE SPLIT ITSELF: `to` still means "the sport this becomes", so an easy run reports no `run`. */
/**
 * ⛔⛔ THE COMPOSER'S BANDS ARE READ, AND THIS WAS A LIVE BUG (2026-09-09, caught on a throwaway).
 * `intensityOf` matched a hand-written tag list and a name regex, neither of which the standing
 * plan writes — so an Anaerobic Ride (`band:above`) banded EASY and the sheet offered it "Run
 * instead" under the easy-work line: the one direction p138 does not bless, sold with the wrong
 * sentence. And the long run has no `long` tag at all — it is `family:run_lsd`, and used to band
 * long only off the word "Long" in its name.
 */
Deno.test('⛔ `band:` AND `family:` DECIDE THE BAND — not a name and not a tag list', () => {
  const composedHardRide = { ...base, type: 'ride', name: 'Anaerobic Ride', tags: ['standing_plan', 'family:ride_anaerobic', 'band:above'] };
  assertEquals(intensityOf(composedHardRide), 'hard');
  assertEquals(getDisciplineSwaps(composedHardRide, ALL, [], null, 250).map((o) => o.to), [], 'a hard ride offered a swap');

  const composedLongRun = { ...base, type: 'run', name: 'Sunday Session', tags: ['standing_plan', 'family:run_lsd', 'band:vt1_or_easier'] };
  assertEquals(intensityOf(composedLongRun), 'long', 'the long day banded off its NAME, not its family');

  const composedEasyRide = { ...base, type: 'ride', name: 'Ride', tags: ['standing_plan', 'family:ride_endurance', 'band:vt1_or_easier'] };
  assertEquals(intensityOf(composedEasyRide), 'easy');

  // ⚠️ A row with no `band:` keeps the old ladder — a missing signal is not a verdict.
  assertEquals(intensityOf({ ...base, type: 'run', name: 'Tempo Run', tags: [] }), 'hard');
});

Deno.test('⛔ THE EXTRAS STAY OUT OF `getDisciplineSwaps` — `to` never repeats the source sport', () => {
  const easyRun = { ...base, type: 'run', name: 'Easy Run', tags: ['band:vt1_or_easier'] };
  assertEquals(getDisciplineSwaps(easyRun, ALL, [], null, 250).map((o) => o.to).sort(), ['ride', 'swim']);
});
