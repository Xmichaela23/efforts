/**
 * The run ↔ ride ↔ swim swap — ONE shared layer, so every plan type inherits it.
 *
 * ⛔ WHY THE SWAP EXISTS: `week-solver` now prefers an easy RIDE the morning after a long run
 * (impact through damaged tissue is the thing to avoid; a ride is concentric and unloaded). That
 * default is right and it is not always right FOR THIS ATHLETE. Before this, there was no override —
 * the strength logger could swap an exercise, `validate-reschedule` could move a day, and nothing
 * anywhere could change a session's discipline.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/session-discipline-swap.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  availableDisciplines,
  disciplineOf,
  getDisciplineSwaps,
  intensityOf,
  matrixKindFor,
  swapWarnings,
  originOf,
  resolveMinutes,
  SWAPPED_FROM_PREFIX,
} from './session-discipline-swap.ts';
import { SWAPPED_FROM_PREFIX as SERVER_SWAPPED_FROM_PREFIX } from '../../supabase/functions/get-week/planned-exists-key.ts';
import { SWAP_TAG } from '../../supabase/functions/activate-plan/preserve-athlete-edits.ts';

const easyRun = { id: '1', type: 'run', name: 'Easy Run', duration: 45, tags: ['easy_run'], steps_preset: ['run_easy_45min'] };
const longRun = { id: '2', type: 'run', name: 'Long Run', duration: 90, tags: ['long_run'] };
const hardRun = { id: '3', type: 'run', name: 'Hill Repeats', duration: 35, tags: ['intervals'] };
const easyRide = { id: '4', type: 'ride', name: 'Easy Ride', duration: 60, tags: ['easy'] };

Deno.test('the athlete can flip an easy run to a ride or a swim', () => {
  const opts = getDisciplineSwaps(easyRun, ['run', 'ride', 'swim']);
  assertEquals(opts.map((o) => o.to).sort(), ['ride', 'swim']);
  assert(!opts.some((o) => o.to === 'run'), 'offered a swap to the sport it already is');
});

Deno.test('⛔ VOLUME IS PRESERVED — the duration is untouched and no distance travels', () => {
  const [ride] = getDisciplineSwaps(easyRun, ['run', 'ride']);
  // `duration` is deliberately absent from the patch: the row already holds it.
  assert(!('duration' in ride.patch), 'the swap rewrote a duration it should have left alone');
  // ⚠️ The COPY no longer restates the duration — every surface already prints it. What matters is
  // that the row's own time is untouched, which is what "volume preserved" actually means.
  assert(!/\d+\s*min/.test(String(ride.patch.description)), 'the copy restates a duration the UI already shows');
  assertEquals(resolveMinutes({ ...easyRun, ...ride.patch }), 45, 'the session lost its time');
  // ⛔ The run token must not ride along — it would be graded against a prescription that is gone.
  assertEquals(ride.patch.steps_preset, null, 'a run token survived onto a ride');
});

Deno.test('⛔ INTENSITY IS PRESERVED — easy stays easy, hard stays hard', () => {
  assertEquals(intensityOf(easyRun), 'easy');
  assertEquals(intensityOf(hardRun), 'hard');
  const [hardRide] = getDisciplineSwaps(hardRun, ['run', 'ride']);
  assertEquals(hardRide.patch.type, 'ride');
  assert(/hard work|effort is the same/i.test(String(hardRide.patch.description)),
    'a hard session came back as an easy one — the swap re-dosed the week');
});

Deno.test('⛔ the LONG session is not swappable — it is what the block is built around', () => {
  assertEquals(intensityOf(longRun), 'long');
  assertEquals(getDisciplineSwaps(longRun, ['run', 'ride', 'swim']), []);
});

Deno.test('nothing is offered for a sport the athlete does not have', () => {
  const opts = getDisciplineSwaps(easyRun, ['run', 'ride']);
  assertEquals(opts.map((o) => o.to), ['ride']);
});

Deno.test('strength and unknown types offer nothing rather than guess', () => {
  assertEquals(getDisciplineSwaps({ type: 'strength', duration: 60 }, ['run', 'ride']), []);
  assertEquals(getDisciplineSwaps({ type: null, duration: 60 }, ['run', 'ride']), []);
  assertEquals(disciplineOf('bike'), 'ride');
  assertEquals(disciplineOf('nonsense'), null);
});

Deno.test('a session with no duration offers nothing — there is no volume to preserve', () => {
  assertEquals(getDisciplineSwaps({ type: 'run', duration: 0, tags: [] }, ['run', 'ride']), []);
});

// ── the guardrail: WARN, never gate ──────────────────────────────────────────────────────────

Deno.test('⛔ a conflicting swap WARNS and is still offered', () => {
  // Swapping onto a heavy-leg day: the law permits it and asks for a gap. It must say so, and the
  // option must still be there — Michael: "surface a warning and let them do it anyway."
  const opts = getDisciplineSwaps(easyRide, ['run', 'ride'], [
    { kind: 'lower_body_strength', label: 'Back Squat' },
  ]);
  const toRun = opts.find((o) => o.to === 'run')!;
  assert(toRun, 'the conflicting option was withheld — that is a gate, not a warning');
  assert(toRun.warnings.length > 0, 'a run onto a heavy-leg day warned about nothing');
  assert(/same legs/i.test(toRun.warnings[0]), `unexpected warning: ${toRun.warnings[0]}`);
});

Deno.test('a clean swap warns about nothing', () => {
  const opts = getDisciplineSwaps(easyRun, ['run', 'ride'], [
    { kind: 'upper_body_strength', label: 'Bench Press' },
  ]);
  assertEquals(opts[0].warnings, [], 'an easy ride beside a bench press is not a conflict');
});

Deno.test('the same-day matrix is consulted, not re-implemented', () => {
  // easy_run × long_run is a 0 in the shared matrix — the warning must come from the law.
  const w = swapWarnings('run', 'easy', [{ kind: 'long_run', label: 'your long run' }]);
  assert(w.length > 0, 'the matrix said these cannot share a day and the swap said nothing');
});

Deno.test('matrix kinds map to the law\'s vocabulary', () => {
  assertEquals(matrixKindFor('run', 'easy'), 'easy_run');
  assertEquals(matrixKindFor('ride', 'easy'), 'easy_bike');
  assertEquals(matrixKindFor('swim', 'easy'), 'easy_swim');
  assertEquals(matrixKindFor('ride', 'hard'), 'quality_bike');
  assertEquals(matrixKindFor('run', 'long'), 'long_run');
});

// ── which sports to offer ────────────────────────────────────────────────────────────────────

Deno.test('available sports come from the athlete\'s own week, not a new field', () => {
  assertEquals(availableDisciplines([easyRun, easyRide]), ['run', 'ride']);
  assertEquals(availableDisciplines([easyRun]), ['run']);
  assertEquals(availableDisciplines([{ type: 'strength', duration: 60 }]), []);
});

// ── the two cases from the brief ─────────────────────────────────────────────────────────────

Deno.test('⛔ STRONG FOCUS: Monday\'s engine-chosen ride flips back to a run', () => {
  // The engine put a ride on the day after the long run. This is the override.
  const mondayRide = { id: 'm', type: 'ride', name: 'Easy Ride', duration: 90, tags: ['easy'] };
  const opts = getDisciplineSwaps(mondayRide, ['run', 'ride'], [
    { kind: 'upper_body_strength', label: 'Overhead Press' },
  ]);
  const toRun = opts.find((o) => o.to === 'run')!;
  assertEquals(toRun.patch.type, 'run');
  assertEquals(resolveMinutes({ ...mondayRide, ...toRun.patch }), 90, 'the 90 minutes were not preserved');
  assertEquals(toRun.warnings, [], 'an easy run beside a press is legal and should warn about nothing');
});

Deno.test('⛔ MARATHON: an easy run becomes a ride, same day, same time', () => {
  const opts = getDisciplineSwaps(
    { id: 'x', type: 'run', name: 'Easy Run', duration: 50, tags: ['easy_run'] },
    ['run', 'ride'],
  );
  assertEquals(opts.length, 1);
  assertEquals(opts[0].patch.type, 'ride');
  assertEquals(opts[0].patch.rendered_description, null, 'the stale run copy would still print');
});


// ── the surface that actually opens a planned session ────────────────────────────────────────

Deno.test('⛔ THE CALENDAR ROW — a planned run opened from the week offers the ride', () => {
  // The shape `UnifiedWorkoutView` hands in: a `planned_workouts` row with a status and a date.
  const row = {
    id: 'p1', type: 'run', name: 'Easy Run', duration: 45,
    workout_status: 'planned', date: '2026-08-10', tags: ['easy_run'],
  };
  const opts = getDisciplineSwaps(row, ['run', 'ride']);
  assertEquals(opts.map((o) => o.to), ['ride']);
  assertEquals(opts[0].patch.type, 'ride');
});

Deno.test('⛔ a completed or skipped session is NOT swappable — that would rewrite history', () => {
  const done = { id: 'p2', type: 'run', name: 'Easy Run', duration: 45, workout_status: 'completed', tags: ['easy_run'] };
  const skipped = { ...done, id: 'p3', workout_status: 'skipped' };
  assertEquals(getDisciplineSwaps(done, ['run', 'ride']), []);
  assertEquals(getDisciplineSwaps(skipped, ['run', 'ride']), []);
});

Deno.test('a row with no status is treated as planned — absence is not "completed"', () => {
  const opts = getDisciplineSwaps({ id: 'p4', type: 'run', duration: 40, tags: [] }, ['run', 'ride']);
  assertEquals(opts.length, 1);
});


// ── the contract with the server ─────────────────────────────────────────────────────────────

Deno.test('⛔ THE SWAP TAG MATCHES THE ONE activate-plan LOOKS FOR', () => {
  /**
   * The swap survives a plan rebuild because `activate-plan/preserve-athlete-edits.ts` recognises
   * the row by this tag. Two string literals in two files is exactly how that silently stops
   * working — the tag would still be written, the rebuild would stop seeing it, and the swap would
   * quietly start reverting again with nothing failing.
   *
   * ⚠️ Asserted rather than shared: the edge file must not pull the client lib into its bundle for
   * one string, and the client must not import an edge function's internals. The test is the seam.
   */
  const patch = getDisciplineSwaps(easyRun, ['run', 'ride'])[0].patch;
  const tags = patch.tags as string[];
  assert(tags.includes(SWAP_TAG), `the swap writes ${JSON.stringify(tags)}, activate-plan looks for "${SWAP_TAG}"`);
});


// ═══ THE GATE CLOSED ON REAL DATA — three empty inputs, found 2026-08-08 ════════════════════
//
// The swap never rendered on any surface. Not cache, not deploy: `getDisciplineSwaps` returned []
// on every real row, for two independent reasons, either of which alone was fatal.

Deno.test('⛔ REAL ROW SHAPE — the duration lives in total_duration_seconds, not `duration`', () => {
  /**
   * `resolvePlannedDuration.ts` is the app's own resolver and reads `total_duration_seconds`
   * (SECONDS, root). That is where the "63:00" on screen comes from. The unified item the view holds
   * carries no `duration` at all, so the old `Number(session.duration) > 0` gate closed on it.
   */
  const realRow = {
    id: 'r1', type: 'run', name: 'Easy Run', workout_status: 'planned',
    date: '2026-08-11', total_duration_seconds: 3780, tags: ['easy_run'],   // 63:00
  };
  assertEquals(resolveMinutes(realRow), 63);
  const opts = getDisciplineSwaps(realRow, ['run', 'ride']);
  assertEquals(opts.length, 1, 'the gate still closes on a row with no `duration` field');
  assertEquals(resolveMinutes({ ...realRow, ...opts[0].patch }), 63);
});

Deno.test('the authoritative seconds win over a stale minutes field', () => {
  assertEquals(resolveMinutes({ total_duration_seconds: 3780, duration: 20 }), 63);
  assertEquals(resolveMinutes({ computed: { total_duration_seconds: 1800 } }), 30);
  assertEquals(resolveMinutes({ duration: 45 }), 45);          // raw planned_workouts row
  assertEquals(resolveMinutes({}), 0);                          // nothing to go on → no offer
});

Deno.test('⛔ A ONE-DAY WINDOW CANNOT NAME THE ATHLETE\'S SPORTS', () => {
  // Both surfaces asked a single day "which sports does this athlete have?". A Tuesday holding a run
  // and a lift answers "run" — so there was no OTHER sport and the control never appeared.
  const tuesdayOnly = [
    { type: 'run', name: 'Easy Run', total_duration_seconds: 3780 },
    { type: 'strength', name: 'Strength — Deadlift', total_duration_seconds: 3600 },
  ];
  assertEquals(availableDisciplines(tuesdayOnly), ['run'], 'a single day cannot see the bike');

  // The WEEK can. This is the Strong Focus week from the screenshot.
  const wholeWeek = [
    ...tuesdayOnly,
    { type: 'ride', name: 'Easy Ride', total_duration_seconds: 4320 },      // Mon BK-EZ 72:00
    { type: 'ride', name: 'Long Ride', total_duration_seconds: 6480 },      // Sat BK-LR 108:00
    { type: 'run', name: 'Long Run', total_duration_seconds: 4560 },        // Sun RN-LR 76:00
  ];
  assertEquals(availableDisciplines(wholeWeek), ['run', 'ride']);
});

Deno.test('⛔ THE SCREENSHOT CASE END TO END — Tue Easy Run offers the ride', () => {
  // Strong Focus, week of Aug 17, athlete has bike days. This is the exact row that rendered nothing.
  const week = [
    { type: 'ride', name: 'Easy Ride', total_duration_seconds: 4320, date: '2026-08-17' },
    { type: 'strength', name: 'Strength — Deadlift', total_duration_seconds: 3600, date: '2026-08-18' },
    { type: 'run', name: 'Easy Run', total_duration_seconds: 3780, date: '2026-08-18' },
    { type: 'ride', name: 'Long Ride', total_duration_seconds: 6480, date: '2026-08-22' },
    { type: 'run', name: 'Long Run', total_duration_seconds: 4560, date: '2026-08-23' },
  ];
  const tuesdayRun = week[2];
  assertEquals(intensityOf(tuesdayRun), 'easy', 'the easy run was misread as long/hard');
  const opts = getDisciplineSwaps(
    { ...tuesdayRun, workout_status: 'planned' },
    availableDisciplines(week),
    [{ kind: 'lower_body_strength', label: 'Strength — Deadlift' }],
  );
  assertEquals(opts.map((o) => o.to), ['ride'], 'the swap still offers nothing on the real week');
  assertEquals(opts[0].patch.type, 'ride');
  assertEquals(resolveMinutes({ ...tuesdayRun, ...opts[0].patch }), 63, 'the 63 minutes were lost');
  // Tuesday also holds the deadlift — same legs, so it must warn and still offer.
  assert(opts[0].warnings.length > 0 && /same legs/i.test(opts[0].warnings[0]));
});

// ═══ BIKE DIRECTION — the swap is not accidentally run-only ═══════════════════════════════════

Deno.test('⛔ BK-EZ — an easy RIDE offers "Run instead" and "Swim instead"', () => {
  // `available.filter(d => d !== from)` is symmetric, but nothing asserted it from the bike side.
  const bkEz = {
    id: 'b1', type: 'ride', name: 'Easy Ride', workout_status: 'planned',
    date: '2026-08-17', total_duration_seconds: 4320, tags: ['easy'],   // BK-EZ 72:00
  };
  const opts = getDisciplineSwaps(bkEz, ['run', 'ride', 'swim']);
  assertEquals(opts.map((o) => o.to).sort(), ['run', 'swim']);
  assertEquals(opts.find((o) => o.to === 'run')!.patch.type, 'run');
  assertEquals(resolveMinutes({ ...bkEz, ...opts[0].patch }), 72, 'the ride lost its 72 minutes');
});

Deno.test('⛔ BK-LR — a long ride correctly offers NOTHING', () => {
  const bkLr = {
    id: 'b2', type: 'ride', name: 'Long Ride', workout_status: 'planned',
    date: '2026-08-22', total_duration_seconds: 6480, tags: ['long_ride'],
  };
  assertEquals(intensityOf(bkLr), 'long');
  assertEquals(getDisciplineSwaps(bkLr, ['run', 'ride', 'swim']), []);
});

// ═══ HARD SESSIONS — swappable run↔ride, never to swim ═══════════════════════════════════════
//
// ⛔ DECIDED FROM THE ENGINE'S OWN DOCTRINE, not taste. `strength-primary-plan.ts` quotes
// `DOCTRINE-aerobic-maintenance.md` §6: with both sports, the hard session belongs on the BIKE
// because hard riding costs the legs less. So hard run → hard ride is the swap the engine would
// have made itself, and forbidding it would contradict the plan that produced the session.

Deno.test('⛔ a hard RUN can become a hard RIDE — the doctrine prefers it', () => {
  const hill = { id: 'h1', type: 'run', name: 'Hill Repeats', workout_status: 'planned', total_duration_seconds: 1920, tags: ['intervals'] };
  const opts = getDisciplineSwaps(hill, ['run', 'ride', 'swim']);
  assertEquals(opts.map((o) => o.to), ['ride'], 'a hard session must not offer a swim');
  assertEquals(opts[0].patch.name, 'Bike Intervals');
  assertEquals(opts[0].warnings, [], 'the doctrine-preferred direction should not warn');
});

Deno.test('⛔ a hard RIDE → hard RUN is allowed and WARNS — it spends protected budget', () => {
  const bikeInt = { id: 'h2', type: 'ride', name: 'Bike Intervals', workout_status: 'planned', total_duration_seconds: 2700, tags: ['intervals'] };
  const opts = getDisciplineSwaps(bikeInt, ['run', 'ride', 'swim']);
  assertEquals(opts.map((o) => o.to), ['run'], 'a hard session must not offer a swim');
  assert(opts[0].warnings.some((w) => /costs the legs more/i.test(w)), `warnings: ${opts[0].warnings.join(' | ')}`);
  assertEquals(opts[0].patch.type, 'run', 'the warning became a gate');
});

Deno.test('an EASY session still offers the swim — only hard work excludes it', () => {
  const opts = getDisciplineSwaps(easyRun, ['run', 'ride', 'swim']);
  assert(opts.some((o) => o.to === 'swim'), 'the swim was excluded from an easy session');
});

Deno.test('⛔ the stale rendered copy is always cleared', () => {
  // `rendered_description` is the materialiser's prose for the ORIGINAL discipline and several
  // surfaces prefer it over `description`. Left in place, a swapped ride prints the run's sentence.
  for (const from of [easyRun, { ...easyRide, tags: ['easy'] }]) {
    for (const o of getDisciplineSwaps(from, ['run', 'ride', 'swim'])) {
      assertEquals(o.patch.rendered_description, null, `${o.to}: stale copy survived`);
    }
  }
});

// ═══ THE CONTRACT WITH get-week — the duplicate-session fix depends on it ════════════════════

Deno.test('⛔ THE swapped_from PREFIX MATCHES THE ONE get-week READS', () => {
  /**
   * The client writes `swapped_from:<discipline>`; `get-week/planned-exists-key.ts` reads it to
   * credit a swapped row with its ORIGINAL discipline, which is what stops the blob's session being
   * re-inserted beside it. Two literals in two codebases is exactly how that silently breaks — the
   * tag would still be written, get-week would stop recognising it, and the duplicate would come
   * back with nothing failing.
   */
  assertEquals(SWAPPED_FROM_PREFIX, SERVER_SWAPPED_FROM_PREFIX);
});

Deno.test('⛔ the swap records the ORIGINAL discipline, and keeps it across repeated swaps', () => {
  const run = { id: 's1', type: 'run', name: 'Easy Run', total_duration_seconds: 3780, tags: ['easy_run'], workout_status: 'planned' };
  const toRide = getDisciplineSwaps(run, ['run', 'ride', 'swim']).find((o) => o.to === 'ride')!;
  assert((toRide.patch.tags as string[]).includes('swapped_from:run'), `tags: ${JSON.stringify(toRide.patch.tags)}`);

  // Now swap that ride onward to a swim. The origin must STILL be run — that is what the blob holds.
  const asRide = { ...run, ...toRide.patch } as never;
  const toSwim = getDisciplineSwaps(asRide, ['run', 'ride', 'swim']).find((o) => o.to === 'swim')!;
  assert(
    (toSwim.patch.tags as string[]).includes('swapped_from:run'),
    `second swap lost the origin: ${JSON.stringify(toSwim.patch.tags)}`,
  );
  assert(!(toSwim.patch.tags as string[]).includes('swapped_from:ride'), 'the origin was overwritten with the last hop');
});

Deno.test('originOf reads the tag back; an unswapped session has none', () => {
  assertEquals(originOf({ type: 'run', tags: ['easy_run'] }), null);
  assertEquals(originOf({ type: 'ride', tags: ['discipline_swapped', 'swapped_from:run'] }), 'run');
});

// ═══ POSTURE — swap what is HELD, never what is being TRAINED ════════════════════════════════
//
// ⛔ TRAINING SPECIFICITY. A `develop` discipline is what the block exists to improve, and adaptation
// is specific to the mode of exercise — riding instead of the run the plan is developing deletes that
// week's progression while looking like a fair trade. A `maintain` discipline is held, not trained.
//
// ⚠️ Reads `per_discipline_posture`, which already exists on every plan type and is what distinguishes
// a strength-focus block from a run-focus one. No new field, no plan-type branching.

const easyRunPlanned = {
  id: 'pr', type: 'run', name: 'Easy Run', workout_status: 'planned',
  total_duration_seconds: 3000, tags: ['easy_run'],
};
const easyRidePlanned = {
  id: 'pb', type: 'ride', name: 'Easy Ride', workout_status: 'planned',
  total_duration_seconds: 4320, tags: ['easy'],
};

Deno.test('⛔ a MAINTAIN run offers the swap', () => {
  const opts = getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], { run: 'maintain', bike: 'maintain' });
  assertEquals(opts.map((o) => o.to), ['ride']);
});

Deno.test('⛔ a DEVELOP run offers NOTHING — that is what the plan is training', () => {
  const opts = getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], { run: 'develop', bike: 'maintain' });
  assertEquals(opts, []);
});

Deno.test('⛔ a MAINTAIN ride in a RUN-FOCUS plan offers the swap', () => {
  // The mirror case, and the one that proves this is not run-specific: run develops, bike is held,
  // so the ride is swappable and the run is not — same posture map, opposite answers.
  const posture = { run: 'develop' as const, bike: 'maintain' as const };
  assertEquals(getDisciplineSwaps(easyRidePlanned, ['run', 'ride'], [], posture).map((o) => o.to), ['run']);
  assertEquals(getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], posture), []);
});

Deno.test('⛔ a STRENGTH-FOCUS block: both endurance sports are held, both swappable', () => {
  // Get Stronger — strength develops, run and bike are maintenance. Neither endurance session is the
  // thing being trained, so both may be swapped.
  const posture = { strength: 'develop' as const, run: 'maintain' as const, bike: 'maintain' as const };
  assert(getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], posture).length > 0);
  assert(getDisciplineSwaps(easyRidePlanned, ['run', 'ride'], [], posture).length > 0);
});

Deno.test('⛔ AN UNDECLARED POSTURE DOES NOT BLOCK — a missing signal is not a verdict', () => {
  // Race plans and anything built before postures existed carry none. Failing closed would silently
  // remove the control from all of them (SPEC-week-solver §0h).
  assertEquals(getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], null).map((o) => o.to), ['ride']);
  assertEquals(getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], undefined).map((o) => o.to), ['ride']);
  // A posture map that simply says nothing about THIS discipline is equally not a verdict.
  assertEquals(getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], { bike: 'maintain' }).map((o) => o.to), ['ride']);
});

Deno.test('an OUT discipline is not swappable either — it is parked, not held', () => {
  assertEquals(getDisciplineSwaps(easyRunPlanned, ['run', 'ride'], [], { run: 'out' }), []);
});

Deno.test('posture uses the BIKE key for a ride, as the intake writes it', () => {
  // `per_discipline_posture` is keyed swim/bike/run/strength — the swap's discipline is `ride`.
  const opts = getDisciplineSwaps(easyRidePlanned, ['run', 'ride'], [], { bike: 'develop' });
  assertEquals(opts, [], 'a develop BIKE was offered a swap — the key mapping is wrong');
});
