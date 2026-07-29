// Q-212 — assistance must not repeat the pattern the day's main lift just loaded.
//
// The finding, from Michael reading his own block: "25 dips on bench day and 25 more on press day
// the next morning is four pushing exposures in 24 hours." One pick per slot was applied to every
// session identically, so the push slot ran the same movement whether the day's main lift was a
// bench press, a squat or a deadlift.
//
// ⛔ THE FIX IS SUBSTITUTION, NOT DOSE. Reducing dips to 12 on a press day still puts the same
// muscles under load. The slot takes BALANCING work instead — and says so.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/assistance-collision.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveAssistance, assistanceSubstitutionNote } from '../../../../src/lib/assistance-menu.ts';
import { sharesMovementFamily } from '../../../../src/lib/exercise-config.ts';

const PICKS = { push: 'Dips', pull: 'Chin Up', single_leg_core: 'Single Leg Hip Thrust' };
const nameFor = (main: string, slot: string) =>
  resolveAssistance(PICKS, main).find((r) => r.slot === slot)!.name;

Deno.test('⛔ NOTHING IN A SESSION REPEATS THE MAIN LIFT’S PATTERN — the invariant, over every day', () => {
  for (const main of ['Bench Press', 'Overhead Press', 'Back Squat', 'Deadlift']) {
    for (const row of resolveAssistance(PICKS, main)) {
      assertEquals(
        sharesMovementFamily(main, row.name), false,
        `${row.name} collides with ${main} in the ${row.slot} slot`,
      );
    }
  }
});

Deno.test('the two live collisions in Michael’s own block are the ones that move', () => {
  // Bench and Overhead Press are both pushes — this is the four-exposures-in-24h case.
  assertEquals(nameFor('Bench Press', 'push'), 'Face Pull');
  assertEquals(nameFor('Overhead Press', 'push'), 'Face Pull');
  // Deadlift and Single Leg Hip Thrust are both hip-dominant — hinge on a hinge day. This is the
  // lower-body half a push-day special case would have left broken permanently.
  assertEquals(nameFor('Deadlift', 'single_leg_core'), 'Reverse Lunge');
});

Deno.test('⛔ THE RULE REPLACES A SLOT, NEVER THE CARD — everything that fits still stands', () => {
  // On a press day only the push slot moves; the athlete's pull and single-leg picks are untouched.
  assertEquals(nameFor('Bench Press', 'pull'), 'Chin Up');
  assertEquals(nameFor('Bench Press', 'single_leg_core'), 'Single Leg Hip Thrust');
  // And on a squat day nothing moves at all — knee-dominant clashes with neither a push, a pull,
  // nor a hip-dominant single-leg movement.
  for (const row of resolveAssistance(PICKS, 'Back Squat')) assertEquals(row.substitutedFor, undefined);
});

Deno.test('the slot’s OWN MENU is tried before the balance pool', () => {
  // Single-leg has two knee-dominant options of its own, so a deadlift day stays inside the list
  // the athlete chose from. The pool is the fallback for the case it was built for: on a press day
  // every push option is itself a push.
  assertEquals(nameFor('Deadlift', 'single_leg_core'), 'Reverse Lunge');   // from the menu
  assertEquals(nameFor('Bench Press', 'push'), 'Face Pull');               // from the pool
});

Deno.test('no main lift → every pick stands, exactly as before Q-212 (§0h)', () => {
  for (const row of resolveAssistance(PICKS)) assertEquals(row.substitutedFor, undefined);
  assertEquals(resolveAssistance(PICKS).map((r) => r.name), ['Dips', 'Chin Up', 'Single Leg Hip Thrust']);
  // An unrecognised movement is not evidence of a clash — it is left alone, not replaced on a guess.
  for (const row of resolveAssistance(PICKS, 'Nonexistent Widget Press')) {
    assertEquals(row.substitutedFor, undefined);
  }
});

// ── the copy ──────────────────────────────────────────────────────────────────

Deno.test('⛔ THE NOTE NAMES THE PICK — “something else is here” is worse than nothing (§5.2b)', () => {
  const note = assistanceSubstitutionNote(resolveAssistance(PICKS, 'Bench Press'), 'Bench Press')!;
  assertEquals(
    note,
    'You picked Dips — on Bench Press days it lands on the same muscles as the main lift, ' +
    'so this slot balances instead.',
  );
  // The athlete has to see their choice was READ, not overridden blind.
  assertEquals(note.includes('Dips'), true);
});

Deno.test('⛔ THE NOTE IS OMITTED ENTIRELY WHEN NOTHING FIRED — never printed as a no-op', () => {
  // Same rule the ceiling paragraph follows: absent, not a sentence saying nothing happened.
  assertEquals(assistanceSubstitutionNote(resolveAssistance(PICKS, 'Back Squat'), 'Back Squat'), null);
  assertEquals(assistanceSubstitutionNote(resolveAssistance(PICKS), 'Back Squat'), null);
});

Deno.test('the note carries the voice — no imperative, no encouragement, one clause of reason', () => {
  const note = assistanceSubstitutionNote(resolveAssistance(PICKS, 'Deadlift'), 'Deadlift')!;
  for (const banned of ['should', 'must', 'try to', 'make sure', 'remember to', 'crush', 'smash', '!']) {
    assertEquals(note.toLowerCase().includes(banned), false, `note contains "${banned}": ${note}`);
  }
  // It states what happened and why, and it names both the pick and the day's lift.
  assertEquals(note.includes('Single Leg Hip Thrust') && note.includes('Deadlift'), true);
});
