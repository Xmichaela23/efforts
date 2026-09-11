// ⛔ THE PLATE PICKER FOLLOWS THE BAR (2026-09-10). The logger drew "plates" and "45 lb bar" under a
// Chest-Supported Row and a Tate Press because its gate was a name regex whose default is barbell.
// `barIsTheLoad` asks the config's format and the gear routes this kit reaches instead. These are
// the rows Michael named, on his commercial-gym kit, plus the edges the rule has to hold on.
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/bar-is-the-load.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { barIsTheLoad } from './strength-gear.ts';

const GYM = ['commercial gym'];

Deno.test('the six rows on the screen: only the Barbell Row is on a bar', () => {
  assertEquals(barIsTheLoad('Barbell Row', GYM), true);
  assertEquals(barIsTheLoad('Chest Supported Row', GYM), false, 'perHand format — dumbbells or the machine');
  assertEquals(barIsTheLoad('Tate Press', GYM), false, 'two dumbbells');
  assertEquals(barIsTheLoad('Drag Curl', GYM), false, 'bar or dumbbells, isolation — nothing asserted');
  assertEquals(barIsTheLoad('Preacher Curl', GYM), false, 'bar, dumbbells or machine, isolation — nothing asserted');
  assertEquals(barIsTheLoad('Pull Up', GYM), false, 'bodyweight');
});

Deno.test('a machine is not a bar, whatever the config format says', () => {
  assertEquals(barIsTheLoad('Leg Press', GYM), false);
  assertEquals(barIsTheLoad('Smith Machine Press', GYM), false);
  assertEquals(barIsTheLoad('Leg Extension', GYM), false);
});

Deno.test('a compound with a bar and a dumbbell route defaults to the bar; an isolation does not', () => {
  assertEquals(barIsTheLoad('Romanian Deadlift', GYM), true);
  assertEquals(barIsTheLoad('Barbell Curl', GYM), true, 'the bar is the only way to load it');
  assertEquals(barIsTheLoad('Spider Curl', GYM), false, 'dumbbells first');
});

Deno.test('the kit decides where the routes are ambiguous', () => {
  // A bar and a bench, no dumbbells: the preacher curl can only be loaded on the bar.
  assertEquals(barIsTheLoad('Preacher Curl', ['barbell', 'bench']), true);
  // Dumbbells only: no bar to speak of.
  assertEquals(barIsTheLoad('Romanian Deadlift', ['dumbbells']), false);
  // Unknown kit: every route counts, and the rule reads the same as a full gym.
  assertEquals(barIsTheLoad('Romanian Deadlift', []), true);
  assertEquals(barIsTheLoad('Preacher Curl', null), false);
});

Deno.test('the four tested lifts are on a bar', () => {
  for (const n of ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press']) assertEquals(barIsTheLoad(n, GYM), true, n);
});

Deno.test('a name the catalogue does not know answers null, so the caller keeps its own answer', () => {
  assertEquals(barIsTheLoad('Zercher Carry Thing', GYM), null);
  assertEquals(barIsTheLoad('', GYM), null);
});
