/**
 * The State strength card's per-lift list: FILTER TO MAIN LIFTS, THEN CAP.
 *
 *   deno test --allow-read src/lib/state-perlift-cap.test.ts --no-check
 *
 * ⛔ THE BUG THIS PINS. `StateTab.tsx` capped `per_lift` at 5 BEFORE asking which rows were main
 * lifts. `per_lift` arrives in `Object.entries(learned_fitness.strength_1rms)` order and the coach
 * builds it for SEVEN lifts, so an athlete whose Overhead Press sorted sixth lost the row entirely —
 * with six logged sessions and a typed baseline both on file. The cap cut it before the [D-374]
 * main-lift filter ever saw it.
 *
 * ⚠️ It was latent before D-374: the section rendered all five sliced rows including accessories, so
 * it looked full while the press was already gone. Order of operations is the whole fix.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { capabilitiesForExercise } from './exercise-role.ts';

type Row = { canonical_name: string; sufficient: boolean };

/** The card's list, exactly as `StateTab.tsx` derives it (filter → cap). */
function cardRows(perLift: Row[]): string[] {
  return perLift
    .filter((l) => l.sufficient)
    .filter((l) => capabilitiesForExercise(String(l?.canonical_name ?? '')).coached)
    .slice(0, 5)
    .map((l) => l.canonical_name);
}

/** The old order of operations, kept as the thing that must never come back. */
function cardRowsOldBuggy(perLift: Row[]): string[] {
  return perLift
    .filter((l) => l.sufficient)
    .slice(0, 5)
    .filter((l) => capabilitiesForExercise(String(l?.canonical_name ?? '')).coached)
    .map((l) => l.canonical_name);
}

/** The payload the coach actually builds — seven lifts, press sixth (`coach/index.ts:2369`). */
const SEVEN: Row[] = [
  { canonical_name: 'squat', sufficient: true },
  { canonical_name: 'bench_press', sufficient: true },
  { canonical_name: 'deadlift', sufficient: true },
  { canonical_name: 'hip_thrust', sufficient: true },
  { canonical_name: 'trap_bar_deadlift', sufficient: true },
  { canonical_name: 'overhead_press', sufficient: true },
  { canonical_name: 'barbell_row', sufficient: true },
];

Deno.test('⛔ THE REGRESSION — a 7-lift payload with overhead_press SIXTH still renders it', () => {
  const rows = cardRows(SEVEN);
  assert(rows.includes('overhead_press'), `press missing from: ${rows.join(', ')}`);
  // …and the other three main lifts are all still there.
  for (const l of ['squat', 'bench_press', 'deadlift']) {
    assert(rows.includes(l), `${l} missing from: ${rows.join(', ')}`);
  }
});

Deno.test('⛔ AND THE OLD ORDER IS PINNED AS BROKEN, so it cannot quietly return', () => {
  const wasBroken = cardRowsOldBuggy(SEVEN);
  assertEquals(
    wasBroken.includes('overhead_press'),
    false,
    'cap-before-filter is supposed to drop the press — if this passes, the payload shape changed',
  );
  assertEquals(wasBroken, ['squat', 'bench_press', 'deadlift', 'trap_bar_deadlift']);
});

Deno.test('accessories are still excluded — this fixes the cap, not the D-374 filter', () => {
  const rows = cardRows(SEVEN);
  for (const a of ['hip_thrust', 'barbell_row']) {
    assertEquals(rows.includes(a), false, `${a} is an accessory and must stay out (D-374, Q-253)`);
  }
});

Deno.test('insufficient lifts are still dropped — the sample gate is untouched', () => {
  const rows = cardRows(SEVEN.map((r) => r.canonical_name === 'overhead_press' ? { ...r, sufficient: false } : r));
  assertEquals(rows.includes('overhead_press'), false, 'a lift under MIN_SAMPLES_FOR_SIGNAL stays out');
});

Deno.test('the press renders wherever it sorts — position must not decide visibility', () => {
  // The failure was positional, so prove it across every position in the array.
  for (let i = 0; i < SEVEN.length; i++) {
    const reordered = [...SEVEN];
    const [press] = reordered.splice(reordered.findIndex((r) => r.canonical_name === 'overhead_press'), 1);
    reordered.splice(i, 0, press);
    const rows = cardRows(reordered);
    assert(rows.includes('overhead_press'), `press dropped when it sat at position ${i + 1}`);
  }
});

Deno.test('the cap still bounds a pathological list', () => {
  // Every main-class name at once — the cap is a display bound, not a correctness gate.
  const many: Row[] = ['squat', 'bench_press', 'deadlift', 'overhead_press', 'trap_bar_deadlift', 'front_squat', 'push_press']
    .map((canonical_name) => ({ canonical_name, sufficient: true }));
  assertEquals(cardRows(many).length, 5);
});
