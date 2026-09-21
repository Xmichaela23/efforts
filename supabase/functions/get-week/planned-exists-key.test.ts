/**
 * ⛔ THE DUPLICATE-SESSION BUG (device-confirmed 2026-08-08).
 *
 * Swap Tuesday's run to a ride and the calendar came back holding BOTH — `BK-EZ 63:00` beside
 * `RN 63:00`. The write was a verified in-place UPDATE, so it looked like a render or cache fault.
 * It was neither: `get-week` re-materialises planned rows from `plans.sessions_by_week` on every
 * read, and its "already there?" key was `plan|date|TYPE`. The swap changes `type`, so the blob's
 * run looked MISSING and get-week INSERTED it — on every calendar load, silently.
 *
 * ⚠️ THE SELF-HEAL IS NOT THE BUG AND MUST SURVIVE. A session the plan holds and the calendar
 * genuinely lacks still has to be created. Both halves are pinned below.
 *
 * Run:
 *   ~/.deno/bin/deno test --no-check supabase/functions/get-week/planned-exists-key.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildExistsCounts,
  buildExistsKeys,
  plannedKey,
  swappedOrigin,
  takeFreeDaySeq,
  usedDaySeqs,
  SWAPPED_FROM_PREFIX,
} from './planned-exists-key.ts';

const PLAN = 'plan-1';
const TUE = '2026-08-18';

/** The row as it exists AFTER the athlete swapped Tuesday's run to a ride. */
const swappedRide = {
  training_plan_id: PLAN, date: TUE, type: 'ride',
  tags: ['easy', 'discipline_swapped', `${SWAPPED_FROM_PREFIX}run`],
};

Deno.test('⛔ THE BUG — a swapped row satisfies the blob\'s ORIGINAL discipline', () => {
  const keys = buildExistsKeys([swappedRide]);
  // The blob still says "run" on Tuesday. Before the fix this was absent → get-week inserted a run.
  assert(keys.has(plannedKey(PLAN, TUE, 'run')), 'the blob\'s run would be re-inserted — the duplicate is back');
  // And the row's current identity is still claimed, so the ride is not re-inserted either.
  assert(keys.has(plannedKey(PLAN, TUE, 'ride')));
});

Deno.test('⛔ THE SELF-HEAL STILL WORKS — a genuinely missing session is not masked', () => {
  // Tuesday holds only a strength session; the blob's run is really absent and must be created.
  const keys = buildExistsKeys([{ training_plan_id: PLAN, date: TUE, type: 'strength', tags: [] }]);
  assertEquals(keys.has(plannedKey(PLAN, TUE, 'run')), false, 'the backfill was silenced');
  assert(keys.has(plannedKey(PLAN, TUE, 'strength')));
});

Deno.test('an unswapped row claims exactly one key — behaviour is unchanged for everyone else', () => {
  const keys = buildExistsKeys([{ training_plan_id: PLAN, date: TUE, type: 'run', tags: ['easy_run'] }]);
  assertEquals([...keys], [plannedKey(PLAN, TUE, 'run')]);
});

Deno.test('⛔ REPEATED SWAPS keep the EARLIEST origin — run → ride → swim still matches the blob\'s run', () => {
  // The client preserves the first `swapped_from`. If it recorded the previous hop instead, the
  // blob's run would go unmatched on the second swap and the duplicate would return.
  const twiceSwapped = {
    training_plan_id: PLAN, date: TUE, type: 'swim',
    tags: ['discipline_swapped', `${SWAPPED_FROM_PREFIX}run`],
  };
  const keys = buildExistsKeys([twiceSwapped]);
  assert(keys.has(plannedKey(PLAN, TUE, 'run')), 'the blob\'s run is unmatched after a second swap');
  assert(keys.has(plannedKey(PLAN, TUE, 'swim')));
});

Deno.test('the key is scoped per PLAN and per DATE — a swap cannot mask another plan\'s session', () => {
  const keys = buildExistsKeys([swappedRide]);
  assertEquals(keys.has(plannedKey('plan-2', TUE, 'run')), false, 'a swap leaked across plans');
  assertEquals(keys.has(plannedKey(PLAN, '2026-08-19', 'run')), false, 'a swap leaked across days');
});

Deno.test('type matching is case- and whitespace-insensitive, as the old key was', () => {
  const keys = buildExistsKeys([{ training_plan_id: PLAN, date: TUE, type: '  Ride  ', tags: [] }]);
  assert(keys.has(plannedKey(PLAN, TUE, 'ride')));
  assert(keys.has(plannedKey(PLAN, TUE, 'RIDE')), 'the lookup side must normalise too');
});

Deno.test('a malformed or empty swapped_from tag is ignored rather than trusted', () => {
  const junk = { training_plan_id: PLAN, date: TUE, type: 'ride', tags: [`${SWAPPED_FROM_PREFIX}`, 'discipline_swapped'] };
  assertEquals(swappedOrigin(junk), null);
  assertEquals([...buildExistsKeys([junk])], [plannedKey(PLAN, TUE, 'ride')]);
});

Deno.test('rows with no tags at all are safe', () => {
  const keys = buildExistsKeys([{ training_plan_id: PLAN, date: TUE, type: 'run' }]);
  assertEquals(keys.size, 1);
  assertEquals(swappedOrigin({ type: 'run' }), null);
});

Deno.test('⛔ two rides the plan holds on one day: one on the calendar leaves the second to re-create, at day_seq 1', () => {
  const rows = [{ training_plan_id: PLAN, date: TUE, type: 'ride', tags: [], day_seq: 0 }];
  const counts = buildExistsCounts(rows);
  assertEquals(counts.get(plannedKey(PLAN, TUE, 'ride')), 1, 'the second blob ride would be treated as present');
  const used = usedDaySeqs(rows);
  assertEquals(takeFreeDaySeq(used, plannedKey(PLAN, TUE, 'ride'), 1), 1, 'the re-created second ride lost its place');
});

Deno.test('a re-created ride keeps its place on a free key: place 0 taken by a swapped-in ride → 100', () => {
  const used = usedDaySeqs([{ training_plan_id: PLAN, date: TUE, type: 'ride', tags: [], day_seq: 0 }]);
  assertEquals(takeFreeDaySeq(used, plannedKey(PLAN, TUE, 'ride'), 0), 100);
  assertEquals(takeFreeDaySeq(used, plannedKey(PLAN, TUE, 'ride'), 1), 1);
});

Deno.test('a swapped row counts once for its sport and once for the one the plan wrote', () => {
  const counts = buildExistsCounts([{ training_plan_id: PLAN, date: TUE, type: 'ride', tags: [`${SWAPPED_FROM_PREFIX}run`] }]);
  assertEquals(counts.get(plannedKey(PLAN, TUE, 'ride')), 1);
  assertEquals(counts.get(plannedKey(PLAN, TUE, 'run')), 1);
});
