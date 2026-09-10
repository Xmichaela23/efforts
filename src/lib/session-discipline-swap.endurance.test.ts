/**
 * ⛔ THE FOUR SWAPS THE PAGE BLESSES (docs/WORKORDER-endurance-swaps-2026-09-09.md).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/session-discipline-swap.endurance.test.ts
 *
 * ⚠️ THIS FILE PINS WHAT IS *NOT* OFFERED as hard as what is. Three of the four changes are a
 * narrowing — the long day opens up, but hard-ride-to-hard-run closes, swim closes on the long day,
 * and five of p275's seven machines are cut. A later session reading only the happy path would
 * re-open every one of them.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  getDisciplineSwaps, sessionSwapExtras, intensityOf, venueOf, VENUE_PREFIX, isPlanTwin, sameSwapOn,
  revertOptions, originalNameOf, SWAPPED_NAME_PREFIX,
} from '../../supabase/functions/_shared/session-swap/swap.ts';
import { swapButtonLabel, swapLineFor, SWAP_BACK_TO_PLAN, VENUE_OUTDOORS } from '../../supabase/functions/_shared/session-swap/copy.ts';

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
  // ⛔ The old session's subtitle goes with its structure (audit H-T20).
  assertEquals(hike.patch.friendly_summary, null);
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
 * ⛔⛔ ONE MACHINE PER SPORT (Michael, 2026-09-09: *"the five other machines are cut, not pending"*).
 * p275 also blesses the rower, ski erg, air bike, elliptical and arc trainer; they are not in the
 * app and nothing is held back waiting for a label. ⚠️ PINNED HERE so a later reading of p275 does
 * not add them back as if they had only been missed.
 */
Deno.test('⛔ A RIDE OFFERS THE TRAINER, AND NO OTHER MACHINE', () => {
  const k = kinds(sessionSwapExtras(easyRide));
  assert(k.includes('venue:trainer'), k.join(','));
  for (const v of ['rower', 'ski_erg', 'air_bike']) {
    assert(!k.includes(`venue:${v}`), `${v} is cut, and shipped anyway`);
  }
});

/**
 * ⛔ THE TREADMILL IS NEVER GATED — it still puts feet on the ground, which is what p275 asks for,
 * and Michael's line for it says exactly that.
 *
 * ⚠️ THE GROUND-IMPACT GATE HAS NOTHING LEFT TO GATE now that the treadmill is the only run machine
 * in the app. The rule is p275's, not a consequence of that list, so it stays built; it becomes live
 * the moment a second run machine ships. Pinned by the cut pair below, so removing the gate would
 * still be a failure.
 */
Deno.test('⛔ THE TREADMILL IS OFFERED WHATEVER THE WEEK HOLDS; the cut run machines never are', () => {
  const otherRun = { ...base, type: 'run', name: 'Easy Run', tags: ['band:vt1_or_easier'] };

  for (const week of [[hardRun], [hardRun, otherRun]]) {
    const k = kinds(sessionSwapExtras(hardRun, null, week));
    assert(k.includes('venue:treadmill'), k.join(','));
    for (const v of ['elliptical', 'arc_trainer']) {
      assert(!k.includes(`venue:${v}`), `${v} is cut, and shipped anyway`);
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

/**
 * ═══ REST OF PLAN (work order §6) ════════════════════════════════════════════════════════════════
 *
 * ⛔ THE LATER ROW GETS ITS OWN PATCH, NOT A COPY OF THIS ONE. Every patch the library builds is
 * derived from the row it was built for, so the test that matters is that two rows with DIFFERENT
 * tags produce different tag lists — the bug this design exists to prevent is one row's tags landing
 * on another.
 */
Deno.test('⛔ THE SAME SESSION LATER IN THE PLAN IS ITS `family:`, NOT ITS NAME', () => {
  const renamed = { ...hardRun, name: 'Thursday Session' };
  assert(isPlanTwin(hardRun, renamed));
  assert(!isPlanTwin(hardRun, longRun));          // a different family is a different session
  assert(!isPlanTwin(hardRun, easyRide));         // and never across sports

  // No family at all — a marathon-generator row — falls back to the sport, never wider.
  const bare = { ...base, type: 'run', name: 'Easy Run', tags: [] as string[] };
  assert(isPlanTwin(bare, { ...base, type: 'run', name: 'Something', tags: [] as string[] }));
  assert(!isPlanTwin(bare, easyRide));
});

Deno.test('⛔ EACH ROW IS RE-ASKED, AND KEEPS ITS OWN TAGS', () => {
  const laterRide = { ...easyRide, tags: [...easyRide.tags, 'week:4'] };
  const chosen = sessionSwapExtras(easyRide).find((o) => o.venue === 'trainer')!;
  const same = sameSwapOn(laterRide, chosen, { available: ALL })!;
  assert(same, 'the later ride should still take the trainer');
  const tags = same.patch.tags as string[];
  assert(tags.includes('week:4'), tags.join(','));               // its own tags survived
  assert(tags.includes(`${VENUE_PREFIX}trainer`), tags.join(','));
  assert(!(chosen.patch.tags as string[]).includes('week:4'));   // and did not leak backwards
});

Deno.test('⛔ A ROW THAT CANNOT TAKE THE SWAP IS LEFT ALONE, NOT FORCED', () => {
  const chosen = sessionSwapExtras(easyRide).find((o) => o.venue === 'trainer')!;
  const logged = { ...easyRide, workout_status: 'completed' };
  assertEquals(sameSwapOn(logged, chosen, { available: ALL }), null);
  const alreadyIndoors = { ...easyRide, tags: [...easyRide.tags, `${VENUE_PREFIX}trainer`] };
  assertEquals(sameSwapOn(alreadyIndoors, chosen, { available: ALL }), null);
});

/* ═══ §8 — BACK TO THE PLAN ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ THESE PIN THE REFUSALS AS HARD AS THE OFFER. The revert writes over a session the athlete can
 * see; a version that offers it where it cannot deliver is worse than one that never offers it.
 */

const PLAN = 'plan-1';

Deno.test('⛔ §8 — the swap stamps the ORIGINAL name, and a second swap does not overwrite it', () => {
  const first = getDisciplineSwaps(hardRun, ALL, [], null, 250).find((o) => o.to === 'ride')!;
  const swapped = { ...hardRun, type: 'ride', name: 'Anaerobic Ride', tags: first.patch.tags as string[] };
  assertEquals(originalNameOf(swapped), 'Hard Run');

  // run → ride → swim must still name the RUN: it is what the plan authored.
  const second = getDisciplineSwaps({ ...swapped, tags: [...(swapped.tags), 'band:vt1_or_easier'] }, ALL, [], null, 250)
    .find((o) => o.to === 'swim');
  if (second) {
    const twice = { ...swapped, type: 'swim', tags: second.patch.tags as string[] };
    assertEquals(originalNameOf(twice), 'Hard Run');
  }
});

Deno.test('⛔ §8 — a swapped session offers its original FIRST, named for that session', () => {
  const first = getDisciplineSwaps(hardRun, ALL, [], null, 250).find((o) => o.to === 'ride')!;
  const swapped = { ...hardRun, type: 'ride', name: 'Anaerobic Ride', tags: first.patch.tags as string[] };

  const opts = revertOptions(swapped, PLAN);
  assertEquals(opts.length, 1);
  assertEquals(opts[0].kind, 'revert');
  assertEquals(opts[0].to, 'run');                       // the discipline the plan asked for
  assertEquals(swapButtonLabel(opts[0]), 'Hard Run');    // the SESSION the plan asked for
  assertEquals(swapLineFor(opts[0]), SWAP_BACK_TO_PLAN);
});

Deno.test('⛔ §8 — a machine offers Outdoors, and the same line', () => {
  const trainer = sessionSwapExtras(easyRide).find((o) => o.venue === 'trainer')!;
  const indoors = { ...easyRide, tags: trainer.patch.tags as string[] };
  assertEquals(venueOf(indoors), 'trainer');

  const opts = revertOptions(indoors, PLAN);
  assertEquals(opts.length, 1);
  assertEquals(swapButtonLabel(opts[0]), VENUE_OUTDOORS);
  assertEquals(swapLineFor(opts[0]), SWAP_BACK_TO_PLAN);
  // ⛔ IT DROPS THE VENUE AND NOTHING ELSE — the machine never changed the session.
  const tags = opts[0].patch.tags as string[];
  assert(!tags.some((t) => t.startsWith(VENUE_PREFIX)), tags.join(','));
  assert(tags.includes('family:ride_endurance'), tags.join(','));
});

Deno.test('⛔ §8 — the trainer\'s revert does not wear the trainer\'s own line', () => {
  const trainer = sessionSwapExtras(easyRide).find((o) => o.venue === 'trainer')!;
  const indoors = { ...easyRide, tags: trainer.patch.tags as string[] };
  const back = revertOptions(indoors, PLAN)[0];
  // Both carry `venue: 'trainer'`; only the kind tells them apart.
  assertEquals(swapLineFor(trainer), 'Same session, indoors.');
  assertEquals(swapLineFor(back), SWAP_BACK_TO_PLAN);
});

Deno.test('⛔ §8 — an UNSWAPPED session offers no way back', () => {
  assertEquals(revertOptions(hardRun, PLAN).length, 0);
  assertEquals(revertOptions(easyRide, PLAN).length, 0);
});

Deno.test('⛔ §8 — no plan, no name, or already logged: the sport revert is NOT offered', () => {
  const first = getDisciplineSwaps(hardRun, ALL, [], null, 250).find((o) => o.to === 'ride')!;
  const swapped = { ...hardRun, type: 'ride', name: 'Anaerobic Ride', tags: first.patch.tags as string[] };

  // No plan to read the authored session back out of.
  assertEquals(revertOptions(swapped, null).length, 0);

  // Swapped before §8 shipped: `swapped_from:` but no `swapped_name:`.
  const legacy = { ...swapped, tags: swapped.tags.filter((t) => !t.startsWith(SWAPPED_NAME_PREFIX)) };
  assertEquals(revertOptions(legacy, PLAN).length, 0);

  // Already done. Putting the plan back would rewrite history, not a plan.
  assertEquals(revertOptions({ ...swapped, workout_status: 'completed' }, PLAN).length, 0);
  assertEquals(revertOptions({ ...swapped, workout_status: 'skipped' }, PLAN).length, 0);
});

Deno.test('⛔ §8 — both at once: the sport\'s way back comes before the machine\'s', () => {
  const first = getDisciplineSwaps(hardRun, ALL, [], null, 250).find((o) => o.to === 'ride')!;
  const swappedThenIndoors = {
    ...hardRun,
    type: 'ride',
    name: 'Anaerobic Ride',
    tags: [...(first.patch.tags as string[]), `${VENUE_PREFIX}trainer`],
  };
  const opts = revertOptions(swappedThenIndoors, PLAN);
  assertEquals(opts.length, 2);
  assertEquals(swapButtonLabel(opts[0]), 'Hard Run');
  assertEquals(swapButtonLabel(opts[1]), VENUE_OUTDOORS);
});

Deno.test('⛔ §8 — rest of plan: a later swapped twin is re-asked and gets its OWN name', () => {
  const first = getDisciplineSwaps(hardRun, ALL, [], null, 250).find((o) => o.to === 'ride')!;
  const today = { ...hardRun, type: 'ride', name: 'Anaerobic Ride', tags: first.patch.tags as string[], training_plan_id: PLAN };

  const laterSource = { ...hardRun, name: 'Near-threshold Run' };
  const laterFirst = getDisciplineSwaps(laterSource, ALL, [], null, 250).find((o) => o.to === 'ride')!;
  const later = { ...laterSource, type: 'ride', name: 'Anaerobic Ride', tags: laterFirst.patch.tags as string[], training_plan_id: PLAN };

  const chosen = revertOptions(today, PLAN)[0];
  const same = sameSwapOn(later, chosen, { available: ALL })!;
  assert(same, 'the later twin should also go back');
  assertEquals(swapButtonLabel(same), 'Near-threshold Run');

  // A later row that was never swapped is left alone.
  assertEquals(sameSwapOn(laterSource, chosen, { available: ALL }), null);
});
