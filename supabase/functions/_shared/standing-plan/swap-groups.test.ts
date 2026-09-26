/**
 * The Swap sheet's list — the slot's own level and pattern, nothing else (Michael, 2026-09-18).
 *
 *   ~/.deno/bin/deno test --no-check --no-lock --sloppy-imports supabase/functions/_shared/standing-plan/swap-groups.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swapGroupsFor } from './swap-groups.ts';
import { cellOptions, filingOf, STAND_INS } from '../strength-grid/index.ts';
import { pickOptions } from './accessory-picks.ts';

const GYM = ['Commercial gym'];
// ⛔ EVERY DECLARED KIT IS AT LEAST THE MINIMUM (2026-09-24): barbell, rack, bench, dumbbells, pull-up bar. "Dumbbells +
// bench" reads as the minimum; the assertions below say what the minimum kit's bar adds.
const HOME = ['Dumbbells', 'Bench (flat/adjustable)'];
const names = (g: ReturnType<typeof swapGroupsFor>) => g.flatMap((x) => x.options.map((o) => o.name));

Deno.test('⛔ THE REQUIRED CHECK: Seated DB Press offers p220 secondary upper pushes and their dumbbell/kettlebell versions', () => {
  const gym = swapGroupsFor('Seated DB Press', GYM);
  assertEquals(gym.map((g) => g.heading), ['Secondary']);
  assertEquals(new Set(names(gym)), new Set(['larsen press', 'incline bench press', 'close grip bench press', 'jm press',
    'arnold press', 'db bench press', 'db incline press', 'db shoulder press', 'db floor press', 'db push press', 'kettlebell press',
    // p220 files the incline bench here, and the decline with it (Michael, 2026-09-18).
    'decline bench press']));
  assertEquals(new Set(names(swapGroupsFor('Seated DB Press', HOME))),
    new Set(['arnold press', 'db bench press', 'db shoulder press', 'db floor press', 'db push press',
      // The minimum kit's bar and rack reach p220's barbell secondaries too (2026-09-24); the incline still needs its chip.
      'larsen press', 'close grip bench press', 'jm press', 'decline bench press']));
  // The incline needs the incline bench chip (a flat/adjustable bench is not incline, 2026-08-29).
  assert(names(swapGroupsFor('Seated DB Press', [...HOME, 'Incline bench'])).includes('db incline press'));
});

Deno.test('one level, one pattern: every option is filed exactly where the slot is', () => {
  for (const slot of ['Seated DB Press', 'Kroc Row', 'Romanian Deadlift', 'Split Squat', 'Lat Pulldown', 'Leg Press',
    'Preacher Curl', 'Leg Curl', 'Tate Press', 'Bench Press', 'Pull Up', 'Back Squat', 'Hanging Leg Raise', 'Farmers Carry']) {
    const want = filingOf(slot)!;
    for (const kit of [GYM, HOME]) {
      for (const n of names(swapGroupsFor(slot, kit))) {
        const got = filingOf(n)!;
        assertEquals([got.category, got.pattern], [want.category, want.pattern], `${slot} offered ${n}`);
      }
    }
  }
});

Deno.test('the builder\'s own cell, less the row: no second sorting', () => {
  const g = swapGroupsFor('Kroc Row', GYM);
  assertEquals(names(g), cellOptions('secondary', 'pull_upper', GYM).map((m) => m.name).filter((n) => n !== 'kroc row'));
});

Deno.test('after a swap the slot\'s movement comes back; a stand-in is never offered; nothing unfiled gets a list', () => {
  const after = swapGroupsFor('Bench Press', GYM, 'Push Press');
  assert(names(after).map((n) => n.toLowerCase()).includes('bench press') && !names(after).includes('push press'));
  const stands = new Set(Object.values(STAND_INS).flat());
  for (const slot of ['Bench Press', 'Kroc Row', 'Back Squat', 'Romanian Deadlift']) {
    for (const kit of [GYM, HOME, ['Bands'], ['Pull-up bar']]) {
      for (const n of names(swapGroupsFor(slot, kit))) assert(!stands.has(n), `${slot} offered stand-in ${n}`);
    }
  }
  assertEquals(swapGroupsFor('Push Up', GYM), []);
  assertEquals(swapGroupsFor('Core Work (5 Min - Your Choice)', GYM), []);
});

Deno.test('⛔ THE KIT\'S OWN NAME: no machine name without the machine; the dumbbell stiff-legged deadlift by that name', () => {
  const home = swapGroupsFor('Preacher Curl', HOME).flatMap((g) => g.options.map((o) => o.display));
  assert(!home.includes('Pullover Machine') && !home.includes('Rear Delt Machine'), home.join(', '));
  // The pullover is p220's DB pullover at home, on the Secondary pull row, not here (Michael, 2026-09-18).
  assert(!home.includes('Flat-Bench DB Pullover') && !home.includes('Flat-Bench Dumbbell Pullover'), home.join(', '));
  const hinge = swapGroupsFor('Romanian Deadlift', HOME).flatMap((g) => g.options.map((o) => o.display));
  // The minimum kit has a bar (2026-09-24), so the stiff-legged deadlift is his barbell one; the DB Romanian deadlift is
  // its own option beside it (the book's "DB" habit, `strength/shown-name.ts`).
  assert(hinge.includes('Stiff-legged Deadlift') && hinge.includes('DB Romanian Deadlift') && !hinge.includes('Sandbag Throw'), hinge.join(', '));
  assert(swapGroupsFor('Romanian Deadlift', [...HOME, 'Sandbag']).flatMap((g) => g.options.map((o) => o.display)).includes('Sandbag Throw'));
});

Deno.test('⛔ ONE NAME PER MOVEMENT ON A KIT (Michael, 2026-09-18)', () => {
  const HOME_DB = ['Dumbbells', 'Bench (flat/adjustable)'];
  const hinge = swapGroupsFor('Single Leg RDL', HOME_DB).flatMap((g) => g.options.map((o) => o.display));
  // On the minimum kit (a bar and dumbbells, 2026-09-24) the two Romanian deadlifts are two executions, one name each.
  assertEquals(hinge.filter((d) => /romanian deadlift/i.test(d)), ['Romanian Deadlift', 'DB Romanian Deadlift']);
  const pull = swapGroupsFor('Drag Curl', HOME_DB).flatMap((g) => g.options.map((o) => o.display));
  assertEquals(pull.filter((d) => /rear delt/i.test(d)), ['Bent-Over DB Rear Delt Fly']);
  // A commercial gym has a sandbag, as it has a sled.
  assert(swapGroupsFor('KB Swing', GYM).flatMap((g) => g.options.map((o) => o.display)).includes('Sandbag Throw'));
});

Deno.test('⛔ "EACH" ON TWO-DUMBBELL ROWS ONLY (Michael, 2026-09-18)', async () => {
  const { usesTwoDumbbellsOnKit } = await import('../strength-grid/grid.ts');
  const HOME_DB = ['Dumbbells', 'Bench (flat/adjustable)'];
  // The dumbbell skull crusher logs per dumbbell — on every kit with dumbbells since 2026-09-24 (the arms superset is
  // built on dumbbells where the kit has them, `strength-gear.ts` route order); a bar-only kit keeps one total.
  assertEquals(usesTwoDumbbellsOnKit('Skull Crusher', HOME_DB), true);
  assertEquals(usesTwoDumbbellsOnKit('Skull Crusher', GYM), true);
  // A "bar + bench" list is a declared kit, so it is the minimum and has dumbbells (2026-09-24); only an undeclared kit
  // reads one total for a movement the routes could hold either way.
  assertEquals(usesTwoDumbbellsOnKit('Skull Crusher', ['Barbell', 'Bench (flat/adjustable)']), true);
  assertEquals(usesTwoDumbbellsOnKit('Skull Crusher', null), false);
  // Dumbbell-only movements read "each" on any kit.
  assertEquals(usesTwoDumbbellsOnKit('DB Bench Press', GYM), true);
  assertEquals(usesTwoDumbbellsOnKit('Seated DB Press', null), true);
  // One dumbbell keeps the plain unit.
  for (const n of ['DB Row', 'Kroc Row', 'DB Pullover', 'Goblet Squat', 'Behind The Neck DB Triceps Extension', 'Dumbbell Swing']) {
    assertEquals(usesTwoDumbbellsOnKit(n, HOME_DB), false, n);
  }
  // A gym does the rear delt machine on the machine; at home it is two dumbbells.
  assertEquals(usesTwoDumbbellsOnKit('Rear Delt Machine', GYM), false);
  assertEquals(usesTwoDumbbellsOnKit('Rear Delt Machine', HOME_DB), true);
  // The Romanian deadlift is the barbell one wherever there is a bar — every declared kit since 2026-09-24 (the minimum);
  // the DB Romanian deadlift is its own row and reads "each".
  assertEquals(usesTwoDumbbellsOnKit('Romanian Deadlift', GYM), false);
  assertEquals(usesTwoDumbbellsOnKit('Romanian Deadlift', HOME_DB), false);
  assertEquals(usesTwoDumbbellsOnKit('DB Romanian Deadlift', HOME_DB), true);
});

Deno.test('⛔ THE SHEET IS THE SLOT\'S CELL, NOT THE HELD MOVEMENT\'S FILING (owner, live, 2026-09-25)', () => {
  // The braced hinge row on the minimum kit holds the Weighted Reverse Hyper, filed secondary / hinge_lower (p220).
  const BENCH = [...HOME, 'Back extension bench'];
  const cell = { category: 'braced' as const, pattern: 'hinge_lower' as const };
  // With the bench: the slot's own cell first — p222's back extension under the braced heading — then the
  // substitutes the row offered before, under their own heading.
  const withBench = swapGroupsFor('Weighted Reverse Hyper', BENCH, null, cell);
  assertEquals(withBench.map((g) => g.heading), ['Braced', 'Secondary']);
  assertEquals(withBench[0].options.map((o) => o.display), ['Back Extension']);
  assertEquals(withBench[0].options[0].name, 'ghd back extension');
  assertEquals(withBench[0].page, 'Viada pp221-222');
  const before = names(swapGroupsFor('Weighted Reverse Hyper', BENCH));
  assertEquals(names([withBench[1]]), before.filter((n) => n !== 'ghd back extension'));
  assert(before.includes('romanian deadlift') && before.includes('good morning'), before.join(', '));
  // Without the chip the braced cell reaches nothing on the minimum kit: the sheet is as before.
  assertEquals(swapGroupsFor('Weighted Reverse Hyper', HOME, null, cell), swapGroupsFor('Weighted Reverse Hyper', HOME));
  // A row whose movement is filed in its own cell: one group, the same as with no cell.
  assertEquals(swapGroupsFor('Kroc Row', GYM, null, { category: 'secondary', pattern: 'pull_upper' }), swapGroupsFor('Kroc Row', GYM));
  // The frame's admitted movements for the slot (the row's own `swap_options`) join the slot's list, the ones the kit
  // reaches, after the cell's own — and never twice.
  const admitted = swapGroupsFor('Weighted Reverse Hyper', BENCH, null, cell, ['weighted reverse hyper', 'reverse hyperextension', 'ghd back extension']);
  assertEquals(admitted[0].options.map((o) => o.name), ['ghd back extension']);
  const onBack = swapGroupsFor('ghd back extension', BENCH, null, cell, ['ghd back extension', 'weighted reverse hyper', 'reverse hyperextension']);
  assertEquals(onBack.map((g) => g.heading), ['Braced']);
  assertEquals(onBack[0].options.map((o) => o.name), ['weighted reverse hyper']);
  // Without a cell the admitted list is ignored: the sheet is the movement's own filing, as before.
  assertEquals(swapGroupsFor('ghd back extension', BENCH, null, null, ['weighted reverse hyper']), swapGroupsFor('ghd back extension', BENCH));
  // After a swap off the stand-in, the slot's movement comes back at the head of the first list, once.
  const after = swapGroupsFor('Weighted Reverse Hyper', BENCH, 'Good Morning', cell);
  assertEquals(after[0].options.map((o) => o.name.toLowerCase()), ['weighted reverse hyper', 'ghd back extension']);
  assert(!names([after[1]]).includes('good morning') && !names([after[1]]).includes('weighted reverse hyper'));
});

Deno.test('the stamped cell is read as the taxonomy knows it, else ignored', async () => {
  const { slotCellOf } = await import('./swap-groups.ts');
  assertEquals(slotCellOf({ slot_category: 'braced', slot_pattern: 'hinge_lower' }), { category: 'braced', pattern: 'hinge_lower' });
  assertEquals(slotCellOf({ slot_category: 'core', slot_pattern: null }), { category: 'core', pattern: null });
  assertEquals(slotCellOf({ slot_category: 'focused', slot_pattern: 'press_lower', slot_key: 'quad_iso', slot_frame: 'all_rounder' }),
    { category: 'focused', pattern: 'press_lower', key: 'quad_iso', frame: 'all_rounder' });
  // A key or frame the tables do not know is dropped; the cell stands.
  assertEquals(slotCellOf({ slot_category: 'focused', slot_pattern: 'press_lower', slot_key: 'quads', slot_frame: 'all_rounder' }), { category: 'focused', pattern: 'press_lower' });
  assertEquals(slotCellOf({ slot_category: 'braced', slot_pattern: 'hinge' }), null);
  assertEquals(slotCellOf({ slot_category: 'Braced', slot_pattern: 'hinge_lower' }), null);
  assertEquals(slotCellOf({}), null);
  assertEquals(slotCellOf(null), null);
});

Deno.test('⛔ THE SHEET IS THE SLOT\'S OWN PICKER UNION (owner, live, 2026-09-25: the focused-quad row on a kit with bands)', () => {
  const BANDS = [...HOME, 'Resistance bands'];
  const quad = { category: 'focused' as const, pattern: 'press_lower' as const, key: 'quad_iso' as const, frame: 'all_rounder' as const };
  const sheet = swapGroupsFor('banded leg extension', BANDS, null, quad);
  assertEquals(sheet.map((g) => g.heading), ['Focused']);
  const got = sheet[0].options.map((o) => o.name);
  // The quad movements the plan could pick on this kit lead — the goblet squat first, the lunge family with it — and
  // the cell's printed calf and knee items follow; the row itself is left out.
  // The reverse lunge leads (the row's own default without bands, 2026-09-25 ruling), the goblet squat with it.
  assertEquals(got[0], 'reverse lunge');
  const quads = ['goblet squat', 'zercher squat', 'reverse lunge', 'lunge', 'split squat', 'bulgarian split squat', 'walking lunge'];
  for (const q of quads) assert(got.includes(q), `${q} missing from ${got.join(', ')}`);
  const lastQuad = Math.max(...quads.map((q) => got.indexOf(q)));
  const calves = got.filter((n) => /calf|knee raise|soleus/i.test(n));
  assert(calves.length > 0 && calves.every((n) => got.indexOf(n) > lastQuad), got.join(', '));
  assert(!got.includes('banded leg extension'));
  // Without the key the sheet is the cell's printed list, as before this date.
  const before = swapGroupsFor('banded leg extension', BANDS, null, { category: 'focused', pattern: 'press_lower' });
  assert(!before.flatMap((g) => g.options.map((o) => o.name)).includes('goblet squat'));
  // The braced hinge row with the bench chip on leads with the back extension, by the same rule.
  const BENCH = [...HOME, 'Back extension bench'];
  const hinge = swapGroupsFor('weighted reverse hyper', BENCH, null, { category: 'braced', pattern: 'hinge_lower', key: 'braced_hinge', frame: 'all_rounder' });
  assertEquals(hinge[0].heading, 'Braced');
  assertEquals(hinge[0].options[0].display, 'Back Extension');
  // A gym's quad row is p223's own: the leg extension leads its own sheet, the picker's default is unchanged.
  const gym = swapGroupsFor('leg extension', GYM, null, quad).flatMap((g) => g.options.map((o) => o.name));
  assert(gym.includes('hip adduction machine') && gym.includes('seated calf raise') && !gym.includes('leg extension'), gym.join(', '));
  // The composer's own default on the bands kit is still the banded leg extension (`widenAll` is the sheet's alone).
  assertEquals(pickOptions('quad_iso', BANDS, 'quadriceps', []).map((o) => o.name), ['banded leg extension']);
});
