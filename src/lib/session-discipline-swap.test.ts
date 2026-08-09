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
} from './session-discipline-swap.ts';

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
  assert(/45 min/.test(String(ride.patch.description)), 'the time the athlete was going to spend was lost');
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
  assert(/90 min/.test(String(toRun.patch.description)), 'the 90 minutes were not preserved');
  assertEquals(toRun.warnings, [], 'an easy run beside a press is legal and should warn about nothing');
});

Deno.test('⛔ MARATHON: an easy run becomes a ride, same day, same time', () => {
  const opts = getDisciplineSwaps(
    { id: 'x', type: 'run', name: 'Easy Run', duration: 50, tags: ['easy_run'] },
    ['run', 'ride'],
  );
  assertEquals(opts.length, 1);
  assertEquals(opts[0].patch.type, 'ride');
  assert(/50 min/.test(String(opts[0].patch.description)));
});
