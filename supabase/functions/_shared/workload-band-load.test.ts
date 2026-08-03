/**
 * A BAND MOVEMENT WITH AN EMPTY BOX IS NOT A BODYWEIGHT MOVEMENT (2026-08-03).
 *
 *   ~/.deno/bin/deno test supabase/functions/_shared/workload-band-load.test.ts --no-check
 *
 * ⛔ THE BUG. `strengthSetVolume` ends in a bodyweight fall-through, and a band set with no logged
 * weight and a BLANK band box reached it: `banded` is false when `resistance_level` is empty, so it
 * fell past the band rule into `bodyweight × reps`. On a band face pull that is ~170 × 25 ≈ 4,250 lb
 * — more than the day's bench work, on a movement where the band is the entire load and the body is
 * not moving anywhere.
 *
 * ⚠️ A BLANK BOX IS LEGAL. The keypad hint says "Leave blank if you don't know it", and D-351 prices
 * a blank ADD-band at the flat token deliberately. The bug was never that the athlete left it empty;
 * it was that an empty band never reached that token.
 *
 * ⛔ THE PRICER WAS NEVER TOLD WHAT THE MOVEMENT WAS. It saw the set and two flags. `bandIsLoad` is
 * the third — the companion to `bandIsAssistance`, both asked of the EXERCISE, once.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { BAND_SET_VOLUME_TOKEN, strengthSetVolume } from './workload.ts';
import { typeForExercise } from '../../../src/lib/exercise-role.ts';
import { isBandAssistedMovement } from '../../../src/lib/band-assistance.ts';

const BW = 170;
/** Exactly what the four call sites do: ask the exercise, once, then price each set. */
const priceSet = (name: string, set: Record<string, unknown>) =>
  strengthSetVolume(set, {
    bodyweightLb: BW,
    bandIsAssistance: isBandAssistedMovement(name),
    bandIsLoad: typeForExercise(name) === 'band',
  });

Deno.test('⛔ THE MICHAEL CASE — a band face pull with a blank box prices at the token', () => {
  const before = strengthSetVolume({ weight: 0, reps: 25 }, { bodyweightLb: BW });
  assertEquals(before, BW * 25, 'the old behaviour, pinned: 4,250 lb for a set of face pulls');

  const after = priceSet('Band Face Pulls', { weight: 0, reps: 25 });
  assertEquals(after, BAND_SET_VOLUME_TOKEN);
  assert(after < before / 40, 'the whole point: it stops dominating the session');
});

Deno.test('⛔ A LOGGED BAND VALUE IS UNTOUCHED — only the blank case moves', () => {
  // Rule 4 already priced this correctly and must keep doing so. A recorded band is a real number;
  // routing it to the flat token would throw the athlete's own entry away.
  assertEquals(priceSet('Band Face Pulls', { weight: 0, reps: 25, resistance_level: '30' }), 30 * 25);
  assertEquals(priceSet('Band Pull Apart', { weight: 0, reps: 20, resistance_level: '15' }), 15 * 20);
  // A word-era value (pre-D-351) still resolves to the token, exactly as before.
  assertEquals(priceSet('Band Face Pulls', { weight: 0, reps: 25, resistance_level: 'Heavy' }), BAND_SET_VOLUME_TOKEN);
});

Deno.test('⛔ REAL BODYWEIGHT MOVEMENTS ARE UNCHANGED', () => {
  // The fall-through still governs everything that is genuinely the body moving. If this moves, the
  // change has overreached — D-348 exists to make exactly these count.
  assertEquals(priceSet('Push ups', { weight: 0, reps: 20 }), BW * 20);
  assertEquals(priceSet('Pull Up', { weight: 0, reps: 8 }), BW * 8);
  assertEquals(priceSet('Chin Up', { weight: 0, reps: 8 }), BW * 8);
  assertEquals(priceSet('Plank', { weight: 0, reps: 1 }), BW * 1);
  assertEquals(priceSet('Bird Dog', { weight: 0, reps: 12 }), BW * 12);
});

Deno.test('⛔ AND A BAND-ASSISTED SET IS STILL ASSISTANCE, NOT LOAD', () => {
  // The two flags are mutually exclusive by construction: `bandMeansAssistance` is exactly
  // {pullup, chinup, dip} and none of those is typed `band`. This pins that they cannot both fire.
  for (const n of ['Pull Up', 'Chin Up', 'Dips']) {
    assert(isBandAssistedMovement(n), `${n} should be assist-capable`);
    assert(typeForExercise(n) !== 'band', `${n} must not also be typed band`);
  }
  // 40 lb of help off a 170 lb athlete = 130 effective, D-351's rule — unchanged.
  assertEquals(priceSet('Chin Up', { weight: 0, reps: 5, resistance_level: '40' }), (BW - 40) * 5);
});

Deno.test('the barbell path cannot be touched by any of this', () => {
  // A loaded set exits at rule 2, above everything the change affects.
  assertEquals(priceSet('Bench Press', { weight: 185, reps: 5 }), 185 * 5);
  assertEquals(priceSet('Band Face Pulls', { weight: 40, reps: 12 }), 40 * 12, 'a loaded band row is still weight x reps');
});

Deno.test('the type axis catches the band movements whose NAME says nothing', () => {
  // This is why the flag reads the type table rather than testing for "band" in the string.
  for (const n of ['Clamshell', 'Lateral Band Walk']) {
    assertEquals(typeForExercise(n), 'band', `${n} is a band movement`);
    assertEquals(priceSet(n, { weight: 0, reps: 20 }), BAND_SET_VOLUME_TOKEN);
  }
});

Deno.test('zero reps is still zero, band or not', () => {
  assertEquals(priceSet('Band Face Pulls', { weight: 0, reps: 0 }), 0);
});
