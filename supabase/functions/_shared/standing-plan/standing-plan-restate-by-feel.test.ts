// ⛔ A REBUILD TURNS A ROW PRICED OFF ANOTHER LIFT BACK TO `By feel` (WORKORDER-de-row-by-feel §4).
//
// The 2026-09-09 gate was the old row's `load_basis: 'derived_ratio'` marker, and Michael's own row
// had none: his block opened with the DE Barbell Row on `By feel`, a later rebuild priced it through
// the weight branch (which writes `weight`, `percent_1rm`, `load_prescribed`, `set_plan` and never
// `load_basis`), and every rebuild since left 85 lb and a four-step ladder on a row the composer
// says is `By feel`. The gate is now the composer's own answer, so the marker is not required.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { restateFromTest } from './restate.ts';

const LADDER = [
  { weight: 45, reps: 5, warmup: true }, { weight: 65, reps: 3, warmup: true }, { weight: 75, reps: 5, warmup: true },
  { weight: 85, reps: 4 }, { weight: 85, reps: 4 }, { weight: 85, reps: 4 }, { weight: 85, reps: 4 },
];

/** The row as the old derived branch (or a later rebuild) left it on the calendar. */
const pricedRow = (extra: Record<string, unknown> = {}) => ({
  name: 'Barbell Row', sets: 4, reps: '2-4', weight: 85, percent_1rm: 70, load_prescribed: true,
  target_rir: 3.5, slot_intent: 'DE', set_plan: LADDER,
  notes: '70% of what this lift\'s own max works out to — about 80% of your bench press — derived, not tested.',
  ...extra,
});

/** The row the composer authors today for the same cell. */
const freshByFeel = (extra: Record<string, unknown> = {}) => ({
  name: 'Barbell Row', sets: 4, reps: '2-4', weight: 'By feel', load_prescribed: false,
  load_basis: 'no_tested_lift', target_rir: 3.5, slot_intent: 'DE', ...extra,
});

const composedWith = (exercises: unknown[]) => [{
  week: 3,
  sessions: [{ day: 'Thursday', name: 'DE: Upper', type: 'strength', tags: ['standing_plan'], strength_exercises: exercises }],
}];

const plannedWith = (exercises: unknown[], status = 'planned', completed: string | null = null) => [
  { id: 'r-thu', week_number: 3, date: '2026-09-24', workout_status: status, completed_workout_id: completed, strength_exercises: exercises },
];

const restate = (composed: unknown, planned: unknown) =>
  restateFromTest({ composed: composed as never, planned: planned as never, afterWeek: 1, testDayCutoff: '2026-09-09' });

Deno.test('⛔⛔ A PRICED ROW WITH NO MARKER GOES BACK TO By feel — no weight, no percent, no ladder, no note', () => {
  const out = restate(composedWith([freshByFeel()]), plannedWith([pricedRow()]));
  assertEquals(out.rows.length, 1, 'the row is rewritten');
  const row = out.rows[0].strength_exercises[0] as Record<string, unknown>;
  assertEquals(row.weight, 'By feel');
  assertEquals(row.load_prescribed, false);
  assertEquals(row.load_basis, 'no_tested_lift', 'the basis is the composer\'s, so the row reads as a fresh build would');
  assertEquals(row.percent_1rm, undefined);
  assertEquals(row.set_plan, undefined, 'the warm-up ladder goes with the weight');
  assertEquals(row.notes, undefined, 'the derived note goes with the weight');
  assertEquals(row.sets, 4);
  assertEquals(row.reps, '2-4');
  assertEquals(row.slot_intent, 'DE');
  assertEquals(row.target_rir, 3.5);
  // JSON is what reaches the calendar: none of the stripped fields survive serialisation.
  const json = JSON.parse(JSON.stringify(row));
  for (const k of ['percent_1rm', 'set_plan', 'notes']) assert(!(k in json), `${k} must not reach the calendar row`);
});

Deno.test('⛔ THE OLD MARKER STILL WORKS — a row the deleted branch stamped `derived_ratio` is restated the same way', () => {
  const out = restate(composedWith([freshByFeel()]), plannedWith([pricedRow({ load_basis: 'derived_ratio' })]));
  const row = out.rows[0]?.strength_exercises[0] as Record<string, unknown>;
  assertEquals(row?.weight, 'By feel');
  assertEquals(row?.load_basis, 'no_tested_lift');
  assertEquals(row?.set_plan, undefined);
});

Deno.test('⛔ A ROW WITH NO BASIS AT ALL (the same-pattern ratio case) is restated too', () => {
  const composed = composedWith([freshByFeel({ name: 'Close Grip Bench Press', load_basis: undefined })]);
  const planned = plannedWith([pricedRow({ name: 'Close Grip Bench Press' })]);
  const row = restate(composed, planned).rows[0]?.strength_exercises[0] as Record<string, unknown>;
  assertEquals(row?.weight, 'By feel');
  assertEquals(row?.load_prescribed, false);
  assertEquals(row?.load_basis, undefined);
});

Deno.test('⛔ A TESTED LIFT WAITING ON ITS TEST KEEPS ITS NUMBER — `awaiting_test` is the one basis that promises a weight', () => {
  const composed = composedWith([freshByFeel({ name: 'Bench Press', load_basis: 'awaiting_test' })]);
  const planned = plannedWith([pricedRow({ name: 'Bench Press', weight: 155, set_plan: undefined, notes: undefined })]);
  const out = restate(composed, planned);
  assertEquals(out.rows.length, 0, 'an empty test read must not strip a real weight');
});

Deno.test('⛔ A DONE SESSION IS NEVER TOUCHED, whatever it carries', () => {
  const out = restate(composedWith([freshByFeel()]), plannedWith([pricedRow()], 'completed', 'w-1'));
  assertEquals(out.rows.length, 0);
});

Deno.test('⛔ A ROW ALREADY ON By feel IS LEFT ALONE — nothing to restate, nothing rewritten', () => {
  const out = restate(composedWith([freshByFeel()]), plannedWith([freshByFeel()]));
  assertEquals(out.rows.length, 0);
});

Deno.test('⛔ THE WEIGHT BRANCH STILL PRICES A By feel ROW when the composer has a number — the fix cuts one way', () => {
  const composed = composedWith([{ name: 'Bench Press', sets: 4, reps: '2-4', weight: 155, percent_1rm: 70, load_prescribed: true, slot_intent: 'DE' }]);
  const planned = plannedWith([{ name: 'Bench Press', sets: 4, reps: '2-4', weight: 'By feel', load_prescribed: false, load_basis: 'awaiting_test', slot_intent: 'DE' }]);
  const row = restate(composed, planned).rows[0]?.strength_exercises[0] as Record<string, unknown>;
  assertEquals(row?.weight, 155);
  assertEquals(row?.load_prescribed, true);
});
