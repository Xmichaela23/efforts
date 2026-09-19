/**
 * ⛔ ONE SHOWN NAME PER MOVEMENT (2026-09-18). Every spelling of a movement prints one name on every screen.
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/strength/shown-name.test.ts --no-check --allow-read
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canonicalize } from '../canonicalize.ts';
import { shownName, shownNameOnKit } from './shown-name.ts';
import { swapGroupsFor } from '../standing-plan/swap-groups.ts';
import { EXERCISE_CONFIG, SAME_MOVEMENT } from '../../../../src/lib/exercise-config.ts';

Deno.test('every spelling of a lift prints one name (moved from canonicalDisplayName)', () => {
  for (const raw of ['Barbell Back Squat', 'back squat', 'Squat', 'BB Squat']) assertEquals(shownName(canonicalize(raw)), 'Back Squat');
  assertEquals(shownName(canonicalize('Conventional Deadlift')), 'Deadlift');
  assertEquals(shownName(canonicalize('Hip Thrusts')), 'Hip Thrust');
  assertEquals(shownName('front_squat'), 'Front Squat');
  assertEquals(shownName('hack_squat'), 'Hack Squat');
  assertEquals(shownName('db_row'), 'DB Row');
  assertEquals(shownName('single_leg_rdl'), 'Single Leg RDL');
  assertEquals(shownName('my_custom_lift'), 'My Custom Lift');
});

Deno.test('⛔ THE BOOK\'S "DB" HABIT: no shown name says "Dumbbell"', () => {
  for (const n of ['Dumbbell Bench Press', 'db bench press', 'dumbbell_bench_press', 'db_bench_press']) assertEquals(shownName(n), 'DB Bench Press');
  assertEquals(shownName('dumbbell curl'), 'DB Curl');
  assertEquals(shownName('dumbbell swing'), 'DB Swing');
  assertEquals(shownName('Dumbbell Row'), 'DB Row');
  for (const n of [...Object.keys(EXERCISE_CONFIG), ...Object.keys(SAME_MOVEMENT)]) {
    assert(!/dumbbell/i.test(shownName(n)), `${n} → ${shownName(n)}`);
    assert(!/dumbbell/i.test(shownNameOnKit(n, ['Dumbbells', 'Adjustable bench'])), `${n} on a DB kit → ${shownNameOnKit(n, ['Dumbbells'])}`);
  }
});

Deno.test('⛔ OVERHEAD PRESS, NOT MILITARY PRESS (Michael, 2026-09-18 — the baseline test\'s name, Strong/Hevy)', () => {
  for (const n of ['military press', 'Military Press', 'Overhead Press', 'overhead_press', 'Standing Barbell Overhead Press']) assertEquals(shownName(n), 'Overhead Press');
});

Deno.test('⛔ "Kb/db Swings" IS NEVER SHOWN: KB Swing, or DB Swing on a dumbbell kit with no kettlebell', () => {
  assertEquals(shownName('kb/db swings'), 'KB Swing');
  assertEquals(shownName('kb/db swings', ['Dumbbells']), 'DB Swing');
  assertEquals(shownName('kb/db swings', ['Dumbbells', 'Kettlebell']), 'KB Swing');
  for (const n of [...Object.keys(EXERCISE_CONFIG), ...Object.keys(SAME_MOVEMENT)]) assert(!/kb\/db/i.test(shownName(n)), n);
});

Deno.test('⛔ THE SWAP LIST PRINTS THE SAME NAME THE ROW PRINTS', () => {
  for (const kit of [null, ['commercial gym'], ['Dumbbells', 'Adjustable bench']]) {
    for (const slot of ['Dumbbell Bench Press', 'Seated DB Press', 'Barbell Row', 'Lateral Raise', 'Romanian Deadlift']) {
      for (const g of swapGroupsFor(slot, kit, 'Arnold Press')) {
        for (const o of g.options) {
          assertEquals(o.display, shownNameOnKit(o.name, kit), `${slot} / ${o.name}`);
          assertEquals(o.execution_name ?? o.name, o.display, `${slot} / ${o.name}: the row would read another name after the swap`);
        }
      }
    }
  }
});

Deno.test('⛔ A p227 DRILL KEEPS ITS PRINTED NAME', async () => {
  const { PLYO_FAMILIES, PLYO_FAMILY_IDS } = await import('../standing-plan/plyo.ts');
  for (const id of PLYO_FAMILY_IDS) for (const d of PLYO_FAMILIES[id].drills) {
    assertEquals(shownName(d), d);
    assertEquals(shownName(d.toLowerCase().replace(/-/g, ' ')), d);
  }
});
