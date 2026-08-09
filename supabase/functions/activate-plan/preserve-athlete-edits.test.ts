/**
 * ⛔ `activate-plan` DELETES EVERY PLANNED ROW BEFORE RE-INSERTING (`index.ts:375`, the idempotency
 * guard) — and everything the ATHLETE had done to those rows died with them. A skipped session came
 * back unskipped; a run they had swapped to a ride came back a run.
 *
 * ⚠️ THE SKIP HALF WAS ALWAYS BROKEN. The discipline swap only made it visible, so this is fixed
 * generally rather than for the swap alone — a swap-only fix would have left the skip bug under it.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check supabase/functions/activate-plan/preserve-athlete-edits.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { preserveAthleteEdits, SWAP_TAG, type PlannedRowLike } from './preserve-athlete-edits.ts';

const row = (o: Partial<PlannedRowLike>): PlannedRowLike => ({
  week_number: 2, day_number: 2, date: '2026-08-18', type: 'run', name: 'Easy Run',
  description: '~63 min easy', steps_preset: ['run_easy_63min'], tags: ['easy_run'],
  workout_status: 'planned', ...o,
});

Deno.test('⛔ a discipline swap survives the rebuild', () => {
  const existing = [row({ type: 'ride', name: 'Easy Ride', description: '~63 min easy', steps_preset: null, tags: ['easy', SWAP_TAG] })];
  const rebuilt = [row({})];   // the blob still says "run"
  const { rows, notes } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].type, 'ride', 'the swap was lost on rebuild — the original defect');
  assertEquals(rows[0].name, 'Easy Ride');
  assertEquals(rows[0].steps_preset, null, 'the run token came back onto a ride');
  assert(notes.some((n) => /kept the athlete's run → ride swap/.test(n)), `notes: ${notes.join(' | ')}`);
});

Deno.test('⛔ a skip survives the rebuild — broken since the guard was written', () => {
  const existing = [row({ workout_status: 'skipped', skip_reason: 'illness', skip_note: 'sore throat' })];
  const rebuilt = [row({})];
  const { rows } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].workout_status, 'skipped');
  assertEquals(rows[0].skip_reason, 'illness');
  assertEquals(rows[0].skip_note, 'sore throat');
});

Deno.test('⛔ NOTHING ELSE is preserved — the rebuild exists to refresh the plan', () => {
  // A stale duration/description under a new plan is the opposite of the bug being fixed.
  const existing = [row({ description: 'STALE — old prescription', steps_preset: ['run_easy_20min'] })];
  const rebuilt = [row({ description: 'fresh ~63 min easy', steps_preset: ['run_easy_63min'] })];
  const { rows } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].description, 'fresh ~63 min easy', 'a stale description was frozen under the new plan');
  assertEquals(rows[0].steps_preset, ['run_easy_63min']);
});

Deno.test('an untagged type difference is NOT treated as a swap', () => {
  // Only `discipline_swapped` marks an athlete swap. A plain type difference is the plan changing.
  const existing = [row({ type: 'ride', name: 'Easy Ride', tags: ['easy'] })];
  const rebuilt = [row({})];
  const { rows } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].type, 'run', 'a plan change was mistaken for an athlete swap');
});

Deno.test('⛔ a restored swap NEVER collides with the unique key', () => {
  // `(plan, week, day, date, type)` is unique. Restoring run→ride onto a day the new plan already
  // rides would fail the whole insert — one edit taking the activation down with it.
  const existing = [
    row({ day_number: 2, type: 'ride', name: 'Easy Ride', tags: ['easy', SWAP_TAG] }),
  ];
  const rebuilt = [
    row({ day_number: 2, type: 'run' }),
    row({ day_number: 2, type: 'ride', name: 'Easy Ride' }),   // the new plan already rides here
  ];
  const { rows, notes } = preserveAthleteEdits(rebuilt, existing);
  // slot holds 2 new vs 1 old → shape differs, nothing is applied, and it SAYS so.
  assertEquals(rows[0].type, 'run');
  assert(notes.some((n) => /different shape/.test(n)), `notes: ${notes.join(' | ')}`);
});

Deno.test('⛔ a slot whose shape changed preserves NOTHING, and says so', () => {
  const existing = [
    row({ type: 'run', workout_status: 'skipped' }),
    row({ type: 'strength', name: 'Strength — Deadlift' }),
  ];
  const rebuilt = [row({ type: 'run' })];   // the rebuilt day dropped the lift
  const { rows, notes } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].workout_status, 'planned', 'an edit was ported onto a differently-shaped week');
  assert(notes.some((n) => /different shape/.test(n)));
});

Deno.test('a different date does not match — edits are not ported onto another week', () => {
  const existing = [row({ date: '2026-08-18', type: 'ride', tags: ['easy', SWAP_TAG] })];
  const rebuilt = [row({ date: '2026-08-25' })];   // plan re-anchored to a new start
  const { rows } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].type, 'run', 'an edit jumped weeks');
});

Deno.test('a fresh activation with no prior rows is a no-op', () => {
  const rebuilt = [row({})];
  const { rows, notes } = preserveAthleteEdits(rebuilt, []);
  assertEquals(rows[0].type, 'run');
  assertEquals(notes, []);
});

Deno.test('multiple sessions on one day keep their own edits, in order', () => {
  const existing = [
    row({ day_number: 2, type: 'strength', name: 'Strength — Deadlift', workout_status: 'skipped', skip_reason: 'travel' }),
    row({ day_number: 2, type: 'ride', name: 'Easy Ride', steps_preset: null, tags: ['easy', SWAP_TAG] }),
  ];
  const rebuilt = [
    row({ day_number: 2, type: 'strength', name: 'Strength — Deadlift' }),
    row({ day_number: 2, type: 'run' }),
  ];
  const { rows } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].workout_status, 'skipped');
  assertEquals(rows[0].skip_reason, 'travel');
  assertEquals(rows[1].type, 'ride', 'the second session on the day lost its swap');
});

Deno.test('⛔ a COMPLETED session is not re-stamped — completion is not this module\'s to assert', () => {
  const existing = [row({ workout_status: 'completed' })];
  const rebuilt = [row({})];
  const { rows } = preserveAthleteEdits(rebuilt, existing);
  assertEquals(rows[0].workout_status, 'planned');
});
