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
  assertEquals(barIsTheLoad('Drag Curl', GYM), true, 'barbell only since 2026-09-24 (minimum-kit work order B5) — the bar is the only way to load it');
  assertEquals(barIsTheLoad('Preacher Curl', GYM), false, 'a preacher station — the implement on it is not known');
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
  // ⛔ EVERY DECLARED KIT IS AT LEAST THE MINIMUM (2026-09-24, `MINIMUM_KIT_KEYS`): a bar, a rack, a bench, dumbbells
  // and a pull-up bar. A "dumbbells only" or "bar only" chip list is below the minimum and reads as the minimum.
  assertEquals(barIsTheLoad('Drag Curl', ['barbell']), true);
  // A preacher curl needs a preacher bench — a fixed station only the commercial-gym chip grants — so the
  // minimum kit does not reach it, and no bar is asserted.
  assertEquals(barIsTheLoad('Preacher Curl', ['barbell', 'bench']), false);
  // The minimum kit has a bar, so the Romanian deadlift (bar first, priced off the deadlift) is on it.
  assertEquals(barIsTheLoad('Romanian Deadlift', ['dumbbells']), true);
  // Unknown kit: every route counts, and the rule reads the same as a full gym.
  assertEquals(barIsTheLoad('Romanian Deadlift', []), true);
  assertEquals(barIsTheLoad('Preacher Curl', null), false);
});

Deno.test('⛔ THE ARMS SUPERSET (2026-09-24): the skull crusher on dumbbells, the drag curl on the bar, on every declared kit', () => {
  // The minimum kit (any declared list) has dumbbells and a bar; the skull crusher leads with dumbbells (no bar
  // chip), the drag curl is barbell only (minimum-kit work order B5) and draws the bar.
  for (const kit of [['Home gym'], ['Barbell', 'Dumbbells', 'Bench (flat/adjustable)'], ['Dumbbells', 'Bench (flat/adjustable)'], GYM]) {
    assertEquals(barIsTheLoad('Skull Crusher', kit), false, `skull crusher on ${kit.join('+')}: dumbbells lead, no bar chip`);
    assertEquals(barIsTheLoad('Drag Curl', kit), true, `drag curl on ${kit.join('+')}: the bar is the only way to load it`);
    assertEquals(barIsTheLoad('Dumbbell Curl', kit), false, `dumbbell curl on ${kit.join('+')}: per hand, no bar`);
  }
});

Deno.test('the four tested lifts are on a bar', () => {
  for (const n of ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press']) assertEquals(barIsTheLoad(n, GYM), true, n);
});

Deno.test('a name the catalogue does not know answers null, so the caller keeps its own answer', () => {
  assertEquals(barIsTheLoad('Zercher Carry Thing', GYM), null);
  assertEquals(barIsTheLoad('', GYM), null);
});
