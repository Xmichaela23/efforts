/**
 * Step 5 — one gate for "does a band mean help here", pinned by the case that split.
 *
 *   deno test --allow-read src/lib/band-assistance.test.ts --no-check
 *
 * ⛔ THE 200-vs-700 CASE IS THE POINT OF THIS FILE. The logger and the pricer used to ask different
 * questions about the same set, and on one spelling of one movement they disagreed — turning 40 lb
 * of assistance into 40 lb of load. Everything else here exists to prove the fix did not move
 * anything that was already right.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isBandAssistedMovement } from './band-assistance.ts';
import { strengthSetVolume } from '../../supabase/functions/_shared/workload.ts';
import { bandMeansAssistance, canonicalize } from '../../supabase/functions/_shared/canonicalize.ts';
import { EXERCISE_CONFIG } from './exercise-config.ts';

Deno.test('⛔ REGRESSION — "Band Assisted Pull Up": 40 lb of HELP is not 40 lb of LOAD (200 → 700)', () => {
  // The exact set from the Step 1 trace: 5 reps, 40 lb of band assistance, a 180 lb athlete.
  const set = { weight: 0, reps: 5, resistance_level: 40 };
  const bodyweightLb = 180;

  // The correct price, and the one "Pull Up" has always got: (180 − 40) × 5.
  const correct = 700;

  for (const name of ['Pull Up', 'Chin Up', 'Dips', 'Band Assisted Pull Up']) {
    const priced = strengthSetVolume(set, {
      bodyweightLb,
      bandIsAssistance: isBandAssistedMovement(name),
    });
    assertEquals(priced, correct, `${name} should price at ${correct}, got ${priced}`);
  }

  // ⛔ AND THIS IS WHAT IT USED TO DO. The old server gate asked an exact canonical key, and
  // "Band Assisted Pull Up" canonicalizes to its own key, so it fell through to the ADD path:
  // 40 lb × 5 reps = 200. Keeping this assertion means the day someone "simplifies" the gate back
  // to the canonical lookup, this test names the exact number that breaks.
  const oldGate = bandMeansAssistance(canonicalize('Band Assisted Pull Up'));
  assertEquals(oldGate, false, 'precondition: the canonical set still does not contain this name');
  assertEquals(
    strengthSetVolume(set, { bodyweightLb, bandIsAssistance: oldGate }),
    200,
    'the old behaviour was 200 — this is the bug being pinned, not a target',
  );
});

Deno.test('⛔ THE SHARED GATE IS A STRICT SUPERSET — nothing that was assistance stopped being', async () => {
  // The fix may only turn ADD into ASSIST, never the reverse: ASSIST is the conservative side (it
  // prices off body weight rather than off a band number), so a superset cannot silently re-price
  // anything downward. Measured over the widest name pool available.
  const roleSrc = await Deno.readTextFile(new URL('./exercise-role.ts', import.meta.url));
  const roleKeys = [...roleSrc.matchAll(/^ {2}'([^']+)':\s*'(?:primary|secondary|accessory)'/gm)].map((m) => m[1]);
  const canonSrc = await Deno.readTextFile(new URL('../../supabase/functions/_shared/canonicalize.ts', import.meta.url));
  const aliasStrings = [...canonSrc.matchAll(/'([a-z0-9 _-]{3,40})'/g)].map((m) => m[1]);
  const pool = [...new Set([...Object.keys(EXERCISE_CONFIG), ...roleKeys, ...aliasStrings])];
  assert(pool.length > 200, `expected a wide pool, got ${pool.length}`);

  const lost: string[] = [];
  for (const n of pool) {
    if (bandMeansAssistance(canonicalize(n)) && !isBandAssistedMovement(n)) lost.push(n);
  }
  assertEquals(lost, [], `these were assistance and no longer are:\n  ${lost.join('\n  ')}`);
});

Deno.test('⛔ A BAND THAT IS THE LOAD STAYS THE LOAD — no false positives', () => {
  // The other half of the overload. If any of these flipped to assistance, band work would start
  // pricing off body weight, which is the mirror-image error.
  for (const n of [
    'Band Pull Apart', 'Band Row', 'Band Face Pull', 'Band Lateral Raise', 'Band Overhead Press',
    'Band Pull Down', 'Lateral Band Walk', 'Clamshell', 'Resistance Band Row',
    'Back Squat', 'Bench Press', 'Deadlift', 'Barbell Row', 'Hip Thrust', 'Box Jump', 'Plank',
  ]) {
    assertEquals(isBandAssistedMovement(n), false, `${n} must not be treated as band-ASSISTED`);
  }
});

Deno.test('both spellings of the same movement land on the same answer', () => {
  // The failure was two sides passing different forms of one name. Raw display name, canonical key,
  // plural, hyphenated — all one answer.
  for (const [a, b] of [
    ['Pull Up', 'pullup'], ['Pull Ups', 'pull_up'], ['Chin Up', 'chinup'],
    ['Dips', 'dip'], ['Band Assisted Pull Up', 'band_assisted_pull_up'],
  ]) {
    assertEquals(isBandAssistedMovement(a), isBandAssistedMovement(b), `${a} vs ${b} disagree`);
    assert(isBandAssistedMovement(a), `${a} should be assist-capable`);
  }
});

Deno.test('an assisted set with no recorded body weight still prices at zero, not a guess', () => {
  // Unchanged by this step, and worth pinning next to it: with nothing to subtract FROM, the app
  // does not invent an athlete (D-351). The gate changing must not have opened that door.
  assertEquals(
    strengthSetVolume({ weight: 0, reps: 5, resistance_level: 40 }, {
      bodyweightLb: null,
      bandIsAssistance: isBandAssistedMovement('Band Assisted Pull Up'),
    }),
    0,
  );
});

Deno.test('⛔ GHR IS ASSIST-CAPABLE (2026-08-13) — a band on a glute-ham raise is help, priced off body weight', () => {
  // Michael: "glute ham raises needs a band assisted slot — like chin ups, pull ups and dips."
  // Both spellings the pools carry, plus the assisted form the logger may write.
  for (const name of ['Glute-Ham Raise', 'glute ham raise', 'Band Assisted Glute Ham Raise']) {
    assert(isBandAssistedMovement(name), `${name} should be band-assist capable`);
  }
  // 3 reps with 50 lb of band help for a 180 lb athlete: (180 − 50) × 3, never 50 × 3.
  const priced = strengthSetVolume({ weight: 0, reps: 3, resistance_level: 50 }, {
    bodyweightLb: 180,
    bandIsAssistance: isBandAssistedMovement('Glute-Ham Raise'),
  });
  assertEquals(priced, 390);
  // The nearest names that must NOT gain an assist box: hip-dominant but not the GHR.
  for (const name of ['Glute Bridge', 'Barbell Hip Thrust', 'Single-Leg Hip Thrust', 'Back Extension']) {
    assertEquals(isBandAssistedMovement(name), false, `${name} must not be band-assist capable`);
  }
});
