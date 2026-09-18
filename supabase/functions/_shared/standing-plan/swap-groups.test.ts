/**
 * The Swap sheet's list — the builder's own cells under the page's headings (2026-09-18).
 *
 *   ~/.deno/bin/deno test --no-check --no-lock --sloppy-imports supabase/functions/_shared/standing-plan/swap-groups.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { swapGroupsFor } from './swap-groups.ts';
import { cellOptions } from '../strength-grid/grid.ts';
import { canonicalize } from '../canonicalize.ts';

const GYM = ['Commercial gym'];
const HOME = ['Dumbbells', 'Adjustable bench'];
const heads = (g: ReturnType<typeof swapGroupsFor>) => g.map((x) => x.heading);
const names = (g: ReturnType<typeof swapGroupsFor>) => g.flatMap((x) => x.options.map((o) => o.name.toLowerCase()));

Deno.test('no second sorting: each heading holds exactly the builder\'s cell for that heading, less the row itself', () => {
  const g = swapGroupsFor('Back Squat', GYM);
  assertEquals(heads(g), ['Primary', 'Secondary', 'Braced', 'Focused']);
  // the same movements, once each (two spellings of one movement — "calf raises (bilateral)" — show once)
  const secondary = new Set(g.find((x) => x.heading === 'Secondary')!.options.map((o) => canonicalize(o.name)));
  assertEquals(secondary, new Set(cellOptions('secondary', 'press_lower', GYM).map((m) => canonicalize(m.name))));
  assert(!names(g).includes('back squat'));
  assertEquals(g[1].page, 'Viada p220');
});

Deno.test('a movement no page names is still offered where the definitions file it (p220: dumbbell variants)', () => {
  const g = swapGroupsFor('DB Bench Press', HOME);
  assertEquals(heads(g)[0], 'Secondary');
  assert(names(g).length > 0);
});

Deno.test('never up the key: an accessory is not offered a main lift', () => {
  assertEquals(heads(swapGroupsFor('Preacher Curl', GYM)), ['Focused']);
  assert(!heads(swapGroupsFor('Lat Pulldown', GYM)).includes('Primary'));
});

Deno.test('the builder\'s kit test: dumbbells and a bench reach no barbell or machine press', () => {
  for (const n of names(swapGroupsFor('Bench Press', HOME))) {
    assert(!['military press', 'push press', 'larsen press', 'smith machine press', 'machine chest press'].includes(n), n);
  }
});

Deno.test('a slot\'s own list is offered as written, grouped; after a swap the slot\'s movement comes back', () => {
  const slot = ['larsen press', 'incline bench press', 'Bench Press'];
  const g = swapGroupsFor('Bench Press', GYM, slot, 'Larsen Press');
  assertEquals(heads(g), ['Primary', 'Secondary']);
  assert(names(g).includes('bench press'));
  assert(!names(g).includes('larsen press'));
});

Deno.test('core and carry rows get their own heading; a drill gets nothing', () => {
  assertEquals(heads(swapGroupsFor('Hanging Leg Raise', GYM)), ['Core exercises']);
  assertEquals(heads(swapGroupsFor('Farmers Carry', GYM)), ['Carry/drag/pick options']);
  assertEquals(swapGroupsFor('Box Jump', GYM), []);
});
