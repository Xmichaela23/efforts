/**
 * The Instead sheet as `swap-session` assembles it (2026-09-10, audit H-T15): the order, the words,
 * the "Rest of plan" rule and the receipt — pinned to what Today's sheet did on the phone.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/session-swap/sheet.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { optionId, receiptFor, restOfPlanOffered, sameDayOthers, sheetOptions, hasSportSwap } from './sheet.ts';

const easyRide = {
  id: 'r1', date: '2026-09-24', type: 'ride', name: 'Ride', workout_status: 'planned', duration: 28,
  tags: ['family:ride_endurance', 'band:vt1_or_easier', 'sport:ride'], training_plan_id: 'p1', week_number: 2,
};
const easyRun = { id: 'n1', date: '2026-09-22', type: 'run', name: 'Run', workout_status: 'planned', duration: 30, tags: ['family:run_vt1', 'band:vt1_or_easier'] };
const lift = { id: 's1', date: '2026-09-24', type: 'strength', name: 'Back Squat day', workout_status: 'planned' };
const week = [easyRide, easyRun, lift];

Deno.test('the sheet lists the machine, then the sports; the id is kind and target', () => {
  const ids = sheetOptions({ session: easyRide, week, posture: { run: 'maintain', bike: 'maintain' }, ftp: 250 }).map(optionId);
  assertEquals(ids, ['venue:trainer', 'discipline:run']);
});

Deno.test('a swapped session offers the way back first', () => {
  const swapped = { ...easyRide, type: 'run', name: 'Easy Run', tags: ['discipline_swapped', 'swapped_from:ride', 'swapped_name:Ride', 'family:run_vt1', 'band:vt1_or_easier'] };
  const ids = sheetOptions({ session: swapped, week: [swapped, easyRun], posture: null, ftp: null }).map(optionId);
  assertEquals(ids[0], 'revert:ride');
});

Deno.test('a developed discipline offers nothing, and the glyph agrees', () => {
  const ctx = { session: easyRide, week, posture: { bike: 'develop', run: 'maintain' }, ftp: 250 };
  assertEquals(sheetOptions(ctx), []);
  assertEquals(hasSportSwap(ctx), false);
  assertEquals(hasSportSwap({ ...ctx, posture: null }), true);
});

Deno.test('the rest of that day, in the law\'s vocabulary', () => {
  assertEquals(sameDayOthers(easyRide, week), [{ kind: 'lower_body_strength', label: 'Back Squat day' }]);
});

Deno.test('"Rest of plan" is offered unless the session is easy', () => {
  assertEquals(restOfPlanOffered(easyRide), false);
  assertEquals(restOfPlanOffered({ ...easyRide, tags: ['family:ride_anaerobic', 'band:above'] }), true);
  assertEquals(restOfPlanOffered({ ...easyRun, tags: ['family:run_lsd'] }), true);
});

Deno.test('the receipt is Today\'s toast, word for word', () => {
  assertEquals(receiptFor({ kind: 'discipline', to: 'ride' }, 0), 'Swapped to a ride');
  assertEquals(receiptFor({ kind: 'discipline', to: 'run' }, 9), 'Swapped to a run — this and 9 later');
  assertEquals(receiptFor({ kind: 'venue', venue: 'trainer', to: 'ride' }, 21), 'Moved to the trainer — this and 21 later');
  assertEquals(receiptFor({ kind: 'hike', to: 'run' }, 0), 'Swapped to a hike');
  assertEquals(receiptFor({ kind: 'revert', to: 'run' }, 2), 'Back to the plan. — this and 2 later');
});
