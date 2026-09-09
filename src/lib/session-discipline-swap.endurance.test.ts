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
import { getDisciplineSwaps, sessionSwapExtras, venueOf, VENUE_PREFIX } from './session-discipline-swap.ts';

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

Deno.test('⛔ A RIDE ALWAYS OFFERS ITS MACHINES (p275)', () => {
  const k = kinds(sessionSwapExtras(easyRide));
  for (const v of ['trainer', 'rower', 'ski_erg', 'air_bike']) assert(k.includes(`venue:${v}`), `${v} missing from ${k.join(',')}`);
});

Deno.test('⛔ THE GROUND-IMPACT RULE GATES THE RUN MACHINES, and the treadmill is never gated', () => {
  const otherRun = { ...base, type: 'run', name: 'Easy Run', tags: ['band:vt1_or_easier'] };

  // One run in the week — only the treadmill, which still puts feet on the ground.
  const alone = kinds(sessionSwapExtras(hardRun, null, [hardRun]));
  assert(alone.includes('venue:treadmill'), alone.join(','));
  assert(!alone.includes('venue:elliptical'), alone.join(','));

  // Two runs still outdoors — the machines open up.
  const withCompany = kinds(sessionSwapExtras(hardRun, null, [hardRun, otherRun]));
  assert(withCompany.includes('venue:elliptical'), withCompany.join(','));
  assert(withCompany.includes('venue:arc_trainer'), withCompany.join(','));

  // The other run already indoors does not count as ground.
  const indoors = { ...otherRun, tags: [...otherRun.tags, `${VENUE_PREFIX}treadmill`] };
  const gated = kinds(sessionSwapExtras(hardRun, null, [hardRun, indoors]));
  assert(!gated.includes('venue:elliptical'), gated.join(','));
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
Deno.test('⛔ THE EXTRAS STAY OUT OF `getDisciplineSwaps` — `to` never repeats the source sport', () => {
  const easyRun = { ...base, type: 'run', name: 'Easy Run', tags: ['band:vt1_or_easier'] };
  assertEquals(getDisciplineSwaps(easyRun, ALL, [], null, 250).map((o) => o.to).sort(), ['ride', 'swim']);
});
